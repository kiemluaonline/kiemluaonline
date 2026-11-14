// Đổi Lúa lấy thẻ cào: chỉ Admin phát thẻ thực tế. Mã thẻ được mã hóa AES-GCM trong D1.
export const CARD_CARRIERS=Object.freeze(['Viettel','VinaPhone','MobiFone']);
export const CARD_DENOMINATIONS=Object.freeze([10000,20000,50000,100000,200000]);
const validSecret=value=>/^[0-9a-f]{64}$/i.test(String(value||''));
const intValue=v=>String(v??'').trim()!==''&&/^\d+$/.test(String(v))?Number(v):NaN;
const bytesToHex=v=>[...v].map(n=>n.toString(16).padStart(2,'0')).join('');
const hexToBytes=s=>new Uint8Array(String(s).match(/.{2}/g).map(x=>parseInt(x,16)));
async function codeKey(secret){
 if(!validSecret(secret))throw Error('Chưa có khóa bảo mật mã thẻ.');
 return crypto.subtle.importKey('raw',hexToBytes(secret),'AES-GCM',false,['encrypt','decrypt']);
}
async function serialFingerprint(secret,carrier,serial){
 const key=await crypto.subtle.importKey('raw',hexToBytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const value=new TextEncoder().encode(carrier+':'+serial.toUpperCase());
 return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,value)));
}
async function encryptCard(secret,carrier,serial,pin){
 const key=await codeKey(secret),iv=crypto.getRandomValues(new Uint8Array(12));
 const payload=JSON.stringify({carrier,serial,pin});
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(payload));
 return bytesToHex(iv)+':'+bytesToHex(new Uint8Array(encrypted));
}
async function decryptCard(secret,encrypted){
 const [a,b]=String(encrypted).split(':');
 if(!a||!b||!/^[0-9a-f]{24}$/i.test(a)||!/^[0-9a-f]+$/i.test(b))throw Error('Dữ liệu mã thẻ không hợp lệ.');
 const key=await codeKey(secret);
 const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:hexToBytes(a)},key,hexToBytes(b));
 return JSON.parse(new TextDecoder().decode(decoded));
}
async function setting(db,key){
 const row=await db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
 return String(row?.value||'0');
}
export async function cardRedemptionsAPI(req,env,H){
 const {auth,readBody,fail,json,id,str}=H;
 const p=new URL(req.url).pathname,m=req.method,db=env.DB;
 if(!(p==='/api/card-redemptions'||p==='/api/admin/card-redemptions'
   ||p==='/api/admin/card-redemptions/settings'
   ||/^\/api\/admin\/card-redemptions\/[0-9a-f-]{36}$/i.test(p)))return null;
 const isAdmin=p.startsWith('/api/admin/');
 const me=await auth(req,env,isAdmin?'admin':undefined);
 const [switchValue,rateValue,feeValue]=await Promise.all([
   setting(db,'card_redemption_enabled'),setting(db,'lua_per_vnd'),setting(db,'card_fee_lua')
 ]);
 const rate=intValue(rateValue),fee=intValue(feeValue),secretReady=validSecret(env.CARD_VOUCHER_SECRET);
 const safeFee=Number.isSafeInteger(fee)&&fee>=0&&fee<=10000000;
 const enabled=switchValue==='1'&&secretReady&&Number.isSafeInteger(rate)&&rate>0;
 if(!isAdmin&&m==='GET'){
   const [rows,balance]=await Promise.all([
     db.prepare(`SELECT r.id,r.carrier,r.denomination_vnd,r.amount_lua,r.rate_snapshot,r.status,
       r.card_payload_encrypted,r.created_at,r.reviewed_at,r.delivered_at,
       COALESCE((SELECT -e.amount-r.amount_lua FROM wallet_entries e
         WHERE e.user_id=r.user_id AND e.reference_type='card_redemption_hold'
         AND e.reference_id=r.id LIMIT 1),0) AS fee_lua
       FROM card_redemptions r WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 100`).bind(me.id).all(),
     db.prepare('SELECT COALESCE(SUM(amount),0) AS balance FROM wallet_entries WHERE user_id=?').bind(me.id).first()
   ]);
   const items=[];
   for(const row of rows.results){
     const {card_payload_encrypted,rate_snapshot,...safe}=row;
     if(row.status==='delivered'&&card_payload_encrypted){
       try{
         const details=await decryptCard(env.CARD_VOUCHER_SECRET,card_payload_encrypted);
         // Chỉ thành viên sở hữu đơn mới được nhận mã thẻ rõ ràng.
         safe.card_details={serial:details.serial,pin:details.pin};
       }catch{safe.delivery_error='Không mở được mã thẻ. Vui lòng liên hệ Admin.';}
     }
     items.push(safe);
   }
   return json({enabled,rate:Number.isSafeInteger(rate)&&rate>0?rate:0,fee_lua:safeFee?fee:0,
     denominations:CARD_DENOMINATIONS,carriers:CARD_CARRIERS,
     balance:Number(balance?.balance||0),redemptions:items});
 }
 if(!isAdmin&&m==='POST'){
   if(!enabled)fail(403,'Admin chưa mở tính năng đổi thẻ cào hoặc chưa hoàn tất cấu hình.');
   const b=await readBody(req);
   const carrier=str(b.carrier,30),denomination=intValue(b.denomination_vnd);
   if(!CARD_CARRIERS.includes(carrier)||!CARD_DENOMINATIONS.includes(denomination))
     fail(400,'Nhà mạng hoặc mệnh giá thẻ cào không hợp lệ.');
   // Khách phải nhìn thấy đúng số phí trước khi máy chủ giữ Lúa.
   if((fee>0 || b.expected_fee_lua!==undefined) && Number(b.expected_fee_lua)!==fee)
     fail(409,'Phí đổi thẻ đã thay đổi. Vui lòng tải lại để xem phí mới trước khi xác nhận.');
   const cost=denomination*rate;
   if(!safeFee||!Number.isSafeInteger(cost)||cost<=0||!Number.isSafeInteger(cost+fee)||cost+fee>1000000000)
     fail(409,'Tỷ giá chưa phù hợp để đổi mệnh giá thẻ này.');
   const total=cost+fee;
   const rid=id();
   const results=await db.batch([
     db.prepare(`INSERT INTO card_redemptions(id,user_id,carrier,denomination_vnd,amount_lua,rate_snapshot)
       SELECT ?,?,?,?,?,? WHERE
       (SELECT COALESCE(SUM(amount),0) FROM wallet_entries WHERE user_id=?)>=?`)
       .bind(rid,me.id,carrier,denomination,cost,rate,me.id,total),
     db.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
       SELECT ?,?,-?,'Giữ Lúa đổi thẻ (bao gồm phí)','card_redemption_hold',?
       WHERE EXISTS(SELECT 1 FROM card_redemptions WHERE id=? AND user_id=?)
       ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`)
       .bind(id(),me.id,total,rid,rid,me.id)
   ]);
   if(!results[0].meta?.changes||!results[1].meta?.changes)
     fail(400,'Số dư Lúa không đủ cho thẻ cào và phí xử lý hoặc yêu cầu chưa được lưu.');
   return json({ok:true,id:rid,amount_lua:cost,fee_lua:fee,total_lua:total,
     message:'Đã gửi yêu cầu đổi thẻ. Tổng Lúa gồm giá thẻ và phí đã được giữ tạm, chờ Admin duyệt.'},201);
 }
 if(!isAdmin)fail(405,'Phương thức không hỗ trợ.');
 if(p==='/api/admin/card-redemptions'&&m==='GET'){
   const rows=await db.prepare(`SELECT r.id,r.user_id,r.carrier,r.denomination_vnd,
      r.amount_lua,r.status,r.admin_note,r.created_at,r.reviewed_at,r.delivered_at,
      COALESCE((SELECT -e.amount-r.amount_lua FROM wallet_entries e
        WHERE e.user_id=r.user_id AND e.reference_type='card_redemption_hold'
        AND e.reference_id=r.id LIMIT 1),0) AS fee_lua,
      u.name,u.email,u.status AS account_status,
      CASE WHEN length(r.card_payload_encrypted)>0 THEN 1 ELSE 0 END AS has_code
      FROM card_redemptions r JOIN users u ON u.id=r.user_id
      ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      r.created_at DESC LIMIT 200`).all();
   return json({enabled:switchValue==='1',secret_ready:secretReady,
     rate:Number.isSafeInteger(rate)&&rate>0?rate:0,fee_lua:safeFee?fee:0,redemptions:rows.results,
     denominations:CARD_DENOMINATIONS,carriers:CARD_CARRIERS});
 }
 if(p==='/api/admin/card-redemptions/settings'&&m==='POST'){
   const b=await readBody(req),target=str(b.enabled,5);
   if(!['0','1'].includes(target))fail(400,'Chọn bật hoặc tắt tính năng đổi thẻ.');
   if(target==='1'&&(!secretReady||!Number.isSafeInteger(rate)||rate<=0))
     fail(409,'Cần đặt CARD_VOUCHER_SECRET (64 ký tự hex) và tỷ giá Lúa/VNĐ hợp lệ trước khi bật.');
   await db.prepare(`INSERT INTO settings(key,value) VALUES('card_redemption_enabled',?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(target).run();
   return json({ok:true,message:target==='1'?'Đã bật chức năng đổi thẻ cào.':'Đã tạm tắt nhận yêu cầu đổi thẻ mới.'});
 }
 const match=p.match(/^\/api\/admin\/card-redemptions\/([0-9a-f-]{36})$/i);
 if(match&&m==='POST'){
   const b=await readBody(req),action=str(b.action,20),rid=match[1];
   if(!['approved','delivered','rejected'].includes(action))fail(400,'Trạng thái đổi thẻ không hợp lệ.');
   const row=await db.prepare(`SELECT r.*,u.status AS account_status FROM card_redemptions r
       JOIN users u ON u.id=r.user_id WHERE r.id=?`).bind(rid).first();
   if(!row)fail(404,'Không tìm thấy yêu cầu đổi thẻ.');
   if(!['pending','approved'].includes(row.status))fail(409,'Yêu cầu đã xử lý xong.');
   if(action==='approved'){
     if(row.status!=='pending')fail(409,'Yêu cầu đã được duyệt.');
     if(row.account_status!=='active')fail(409,'Tài khoản đang tạm khóa, chưa thể duyệt.');
     const changed=await db.prepare(`UPDATE card_redemptions SET status='approved',
       reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND status='pending'`).bind(rid).run();
     if(!changed.meta?.changes)fail(409,'Yêu cầu đã thay đổi. Hãy tải lại.');
     return json({ok:true,message:'Đã duyệt yêu cầu. Chỉ đánh dấu đã phát khi có mã thẻ thật.'});
   }
   if(action==='rejected'){
     const note=str(b.note,240);
     if(note.length<6)fail(400,'Cần nhập lý do từ chối (ít nhất 6 ký tự).');
     const results=await db.batch([
       db.prepare(`UPDATE card_redemptions SET status='rejected',admin_note=?,
         reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND status IN ('pending','approved')`).bind(note,rid),
       db.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
         SELECT ?,?,(SELECT -held.amount FROM wallet_entries held WHERE held.user_id=? AND held.reference_type='card_redemption_hold' AND held.reference_id=? LIMIT 1),'Hoàn toàn bộ Lúa đổi thẻ và phí','card_redemption_refund',?
         WHERE EXISTS(SELECT 1 FROM card_redemptions WHERE id=? AND status='rejected')
         ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`)
         .bind(id(),row.user_id,row.user_id,rid,rid,rid)
     ]);
     if(!results[0].meta?.changes||!results[1].meta?.changes)fail(409,'Yêu cầu đã thay đổi, vui lòng tải lại.');
     return json({ok:true,message:'Đã từ chối đổi thẻ và hoàn Lúa đúng một lần.'});
   }
   if(row.status!=='approved')fail(409,'Cần duyệt trước khi phát thẻ.');
   if(row.account_status!=='active')fail(409,'Tài khoản tạm khóa, chưa thể phát thẻ.');
   if(!secretReady)fail(503,'Thiếu CARD_VOUCHER_SECRET, không thể phát mã thẻ an toàn.');
   const serial=str(b.serial,45).replace(/\s/g,''),pin=str(b.pin,45).replace(/\s/g,'');
   if(!/^[A-Za-z0-9]{6,40}$/.test(serial)||!/^[A-Za-z0-9]{8,40}$/.test(pin))
     fail(400,'Nhập đúng số seri (6–40 ký tự) và mã thẻ (8–40 ký tự), chỉ chữ hoặc số.');
   const fingerprint=await serialFingerprint(env.CARD_VOUCHER_SECRET,row.carrier,serial);
   const duplicate=await db.prepare('SELECT id FROM card_redemptions WHERE card_serial_fingerprint=?').bind(fingerprint).first();
   if(duplicate)fail(409,'Seri thẻ này đã được phát cho một yêu cầu khác. Không phát trùng thẻ.');
   const encrypted=await encryptCard(env.CARD_VOUCHER_SECRET,row.carrier,serial,pin);
   const result=await db.prepare(`UPDATE card_redemptions SET status='delivered',
     card_payload_encrypted=?,card_serial_fingerprint=?,delivered_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND status='approved' AND card_payload_encrypted=''`).bind(encrypted,fingerprint,rid).run();
   if(!result.meta?.changes)fail(409,'Yêu cầu đã thay đổi; mã thẻ chưa được ghi. Hãy tải lại.');
   return json({ok:true,message:'Đã phát thẻ! Chỉ thành viên nhận thẻ mới xem được seri và mã thẻ.'});
 }
 fail(405,'Phương thức không hỗ trợ.');
}
