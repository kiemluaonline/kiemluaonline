// Tài khoản nhận tiền do thành viên tự lưu. Không tự đăng ký từ lịch sử rút tiền.
const MAX_SAVED=10;
const isUUID=s=>/^[0-9a-f-]{36}$/i.test(String(s));
export const validPayoutAccount=(body,str,fail)=>{
 const method=str(body.payment_method,20);
 if(method!=='bank')fail(400,'Hiện chỉ hỗ trợ lưu tài khoản ngân hàng.');
 const bank=str(body.bank_name,90);
 const number=str(body.account_number,40).replace(/\s/g,'');
 const owner=str(body.account_owner,100);
 const nickname=str(body.nickname,40);
 if(!bank||bank.length<2||bank.toLowerCase()==='zalopay')
   fail(400,'Tên ngân hàng nhận tiền không hợp lệ.');
 // BVBank có số tài khoản định danh do ZaloPay cung cấp (ví dụ 99ZP...), không chỉ số.
 if(!(bank.toLowerCase()==='bvbank'?/^[a-z0-9]{5,30}$/i.test(number):/^[0-9]{5,30}$/.test(number)))
   fail(400,bank.toLowerCase()==='bvbank'?'Số tài khoản BVBank cần 5–30 ký tự chữ hoặc số.':'Số tài khoản ngân hàng phải có 5–30 chữ số.');
 if(owner.length<3||owner.length>100||/[<>\r\n]/.test(owner))
   fail(400,'Tên chủ tài khoản phải từ 3–100 ký tự, không chứa ký tự đặc biệt không hợp lệ.');
 return {payment_method:method,bank_name:bank,account_number:number,account_owner:owner,nickname};
};
export async function payoutAccountsAPI(req,env,H){
 const {auth,readBody,fail,json,id,str}=H;
 const p=new URL(req.url).pathname,m=req.method;
 if(!(p==='/api/payout-accounts'||p.startsWith('/api/payout-accounts/')))return null;
 const me=await auth(req,env),db=env.DB;
 if(p==='/api/payout-accounts'&&m==='GET'){
  const rows=await db.prepare(`SELECT id,payment_method,bank_name,account_number,account_owner,nickname,is_default,created_at,updated_at
   FROM payout_accounts WHERE user_id=? ORDER BY payment_method,is_default DESC,created_at DESC LIMIT ?`)
   .bind(me.id,MAX_SAVED).all();
  return json({accounts:rows.results,max_accounts:MAX_SAVED});
 }
 if(p==='/api/payout-accounts'&&m==='POST'){
  const b=await readBody(req);
  const a=validPayoutAccount(b,str,fail);
  const count=await db.prepare('SELECT COUNT(*) AS n FROM payout_accounts WHERE user_id=?').bind(me.id).first();
  if(Number(count?.n||0)>=MAX_SAVED)fail(409,'Bạn đã lưu tối đa 10 tài khoản nhận tiền.');
  const match=await db.prepare(`SELECT id FROM payout_accounts
    WHERE user_id=? AND payment_method=? AND bank_name=? AND account_number=?`)
    .bind(me.id,a.payment_method,a.bank_name,a.account_number).first();
  if(match)fail(409,'Tài khoản nhận tiền này đã được lưu.');
  const existingDefault=await db.prepare(`SELECT id FROM payout_accounts
    WHERE user_id=? AND payment_method=? AND is_default=1`)
    .bind(me.id,a.payment_method).first();
  const isDefault=b.is_default===true||b.is_default===1||b.is_default==='1'||!existingDefault;
  const newId=id();
  const q=[];
  if(isDefault)q.push(db.prepare('UPDATE payout_accounts SET is_default=0 WHERE user_id=? AND payment_method=?')
    .bind(me.id,a.payment_method));
  q.push(db.prepare(`INSERT INTO payout_accounts
   (id,user_id,payment_method,bank_name,account_number,account_owner,nickname,is_default)
   VALUES(?,?,?,?,?,?,?,?)`).bind(newId,me.id,a.payment_method,a.bank_name,a.account_number,a.account_owner,a.nickname,isDefault?1:0));
  await db.batch(q);
  return json({ok:true,id:newId,message:'Đã lưu tài khoản nhận tiền. Lần sau bạn chỉ cần chọn tài khoản đã lưu.'},201);
 }
 const match=p.match(/^\/api\/payout-accounts\/([0-9a-f-]{36})(?:\/(default))?$/i);
 if(!match||!isUUID(match[1]))fail(404,'Không tìm thấy tài khoản nhận tiền.');
 const rid=match[1],row=await db.prepare('SELECT * FROM payout_accounts WHERE id=? AND user_id=?').bind(rid,me.id).first();
 if(!row)fail(404,'Không tìm thấy tài khoản nhận tiền của bạn.');
 if(m==='POST'&&match[2]==='default'){
  if(row.payment_method!=='bank')fail(400,'Tài khoản ví cũ không còn hỗ trợ đặt mặc định cho lần rút mới.');
  await db.batch([
   db.prepare('UPDATE payout_accounts SET is_default=0 WHERE user_id=? AND payment_method=?').bind(me.id,row.payment_method),
   db.prepare('UPDATE payout_accounts SET is_default=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?').bind(rid,me.id)
  ]);
  return json({ok:true,message:'Đã đặt làm tài khoản nhận tiền mặc định.'});
 }
 if(m==='PATCH'&&!match[2]){
  const b=await readBody(req),a=validPayoutAccount({...b,payment_method:row.payment_method},str,fail);
  const dup=await db.prepare(`SELECT id FROM payout_accounts WHERE user_id=? AND payment_method=?
    AND bank_name=? AND account_number=? AND id<>?`)
    .bind(me.id,row.payment_method,a.bank_name,a.account_number,rid).first();
  if(dup)fail(409,'Số tài khoản nhận tiền này đã được lưu ở mục khác.');
  const makeDefault=b.is_default===true||b.is_default===1||b.is_default==='1';
  const q=[];
  if(makeDefault)q.push(db.prepare('UPDATE payout_accounts SET is_default=0 WHERE user_id=? AND payment_method=?').bind(me.id,row.payment_method));
  q.push(db.prepare(`UPDATE payout_accounts SET bank_name=?,account_number=?,account_owner=?,nickname=?,
    is_default=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`)
    .bind(a.bank_name,a.account_number,a.account_owner,a.nickname,makeDefault||row.is_default?1:0,rid,me.id));
  await db.batch(q);
  return json({ok:true,message:'Đã cập nhật tài khoản nhận tiền.'});
 }
 if(m==='DELETE'&&!match[2]){
  const q=[db.prepare('DELETE FROM payout_accounts WHERE id=? AND user_id=?').bind(rid,me.id)];
  if(row.is_default)q.push(db.prepare(`UPDATE payout_accounts SET is_default=1,updated_at=CURRENT_TIMESTAMP
    WHERE id=(SELECT id FROM payout_accounts WHERE user_id=? AND payment_method=? AND id<>?
      ORDER BY created_at DESC,id DESC LIMIT 1)`).bind(me.id,row.payment_method,rid));
  // Xóa dòng đầu rồi mới chỉ định mặc định mới; yêu cầu rút cũ không thay đổi.
  const results=await db.batch(q);
  if(!results[0].meta?.changes)fail(409,'Không thể xóa. Vui lòng tải lại.');
  return json({ok:true,message:'Đã xóa tài khoản đã lưu. Các yêu cầu rút trước đó không thay đổi.'});
 }
 fail(405,'Phương thức không hỗ trợ.');
}
