import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { shopOrdersAPI, ORDER_CHECK_NOTE, ORDER_REJECTION_REASONS } from '../src/shop-orders.js';
import { shopOrdersPage,adminShopOrdersPage } from '../public/shop-orders-ui.js';

const db=new DatabaseSync(':memory:');
for(const n of ['0001_init.sql','0002_shop.sql','0003_shop_orders.sql','0004_shop_estimated_lua.sql'])
 db.exec(readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8'));
const insertUser=db.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,referral_code,role) VALUES(?,?,?,?,?,?,?)");
insertUser.run('user1','member1@example.com','Khách 1','pw','salt','RTEST1','member');
insertUser.run('user2','member2@example.com','Khách 2','pw','salt','RTEST2','member');
insertUser.run('admin1','admin@example.com','Admin','pw','salt','RADMIN','admin');
db.prepare("UPDATE settings SET value='1' WHERE key='lua_per_vnd'").run();
const prodId=randomUUID();
db.prepare("INSERT INTO shop_products(id,title,description,link,category,is_active) VALUES(?,?,?,?,?,1)")
 .run(prodId,'Áo xanh','Test','https://vt.tiktok.com/ABCDEFG/','fashion');
class Statement{
 constructor(query){this.query=query;this.params=[];}
 bind(...x){this.params=x;return this;}
 async first(){return db.prepare(this.query).get(...this.params)||null;}
 async all(){return {results:db.prepare(this.query).all(...this.params)};}
 async run(){const r=db.prepare(this.query).run(...this.params);return {meta:{changes:r.changes}};}
}
const env={DB:{prepare:s=>new Statement(s),async batch(statements){
 db.exec('BEGIN');
 try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}
 catch(e){db.exec('ROLLBACK');throw e;}
}}};
const H={
 auth:async(req,env,role)=>{
  const who=req.headers.get('X-User')||'user1';
  if(role==='admin'&&who!=='admin1')throw Object.assign(new Error('Forbidden'),{status:403});
  return {id:who,role:who==='admin1'?'admin':'member'};
 },
 readBody:req=>req.json(),
 fail:(status,message)=>{throw Object.assign(new Error(message),{status});},
 json:(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}),
 id:randomUUID,str:(x,max=300)=>String(x??'').trim().slice(0,max)
};
async function call(path,method='GET',body,who='user1'){
 const req=new Request('https://example.org'+path,{
 method,headers:{'X-User':who,...(body?{'Content-Type':'application/json'}:{})},
 body:body?JSON.stringify(body):undefined});
 try{
 const r=await shopOrdersAPI(req,env,H);
 assert.ok(r,'Route not handled');return {status:r.status,data:await r.json()};
 }catch(e){if(e.status)return {status:e.status,data:{error:e.message}};throw e;}
}
const ref='TIKTOKORDER99887766';
const report=await call('/api/shop/orders','POST',{product_id:prodId,order_reference:ref,note:'Đã đặt'});
assert.equal(report.status,201);
const oid=report.data.id;
let orders=(await call('/api/shop/orders')).data.orders;
assert.equal(orders.length,1);
assert.equal(orders[0].status,'pending');
assert.ok(!('admin_note' in orders[0]),'Admin notes must never be returned to buyers');
assert.ok(!('verification_note' in orders[0]),'Verification notes must never be returned to buyers');
assert.ok(!(await call('/api/shop/orders')).data.events.some(e=>'detail' in e),'Internal audit details must not be sent to buyer');
assert.equal(orders[0].estimated_reward_lua,0,'Chưa xác minh thì không hiển thị Lúa dự kiến');
assert.ok(!('commission_vnd' in orders[0]),'Do not expose Admin commission');
assert.ok(!('settled_reference' in orders[0]),'Do not expose secret TikTok reconciliation ID');
assert.equal(orders[0].reward_lua,0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0);
const pendingPage=await shopOrdersPage({
 api:async p=>p==='/api/shop/orders'?{orders,events:(await call('/api/shop/orders')).data.events}:{unread:0},
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x
});
assert.match(pendingPage,/Đã tiếp nhận ID đơn hàng/);
assert.match(pendingPage,/Bước 1\/3/);
assert.match(pendingPage,/Lúa: Chưa xác định/);
assert.match(pendingPage,/Cập nhật:/);
assert.match(pendingPage,/Xem ID đơn hàng đầy đủ/);
assert.doesNotMatch(pendingPage,/Hoa hồng|Affiliate|HOA_HONG_BI_MAT_123/i);
assert.equal((await call('/api/shop/orders/alerts')).data.unread,0);
assert.equal((await call('/api/shop/orders','GET',undefined,'user2')).data.orders.length,0);
const adminView=(await call('/api/admin/shop/orders','GET',undefined,'admin1')).data;
assert.equal(adminView.orders.length,1);
assert.equal(adminView.orders[0].order_reference,ref);
assert.ok(!('commission_vnd' in adminView.orders[0]),'Admin no longer needs to enter or view commission inside order management');
assert.ok(!('rate_snapshot' in adminView.orders[0]),'No internal commission rate snapshot returned');
assert.ok(!('lua_per_vnd' in adminView),'Order management no longer depends on a Lua/VND conversion setting');
assert.equal(adminView.verification_note,ORDER_CHECK_NOTE);
assert.deepEqual(adminView.rejection_reasons,ORDER_REJECTION_REASONS);
assert.equal(ORDER_REJECTION_REASONS['0'],'Không tìm thấy thông tin đơn hàng tương ứng với ID đã cung cấp.');
assert.equal(ORDER_REJECTION_REASONS['1'],'Đơn hàng đã bị hủy nên không đủ điều kiện nhận Lúa.');
assert.equal(ORDER_REJECTION_REASONS['2'],'Đơn hàng đã được hoàn trả hoặc hoàn tiền nên không đủ điều kiện nhận Lúa.');
assert.equal(ORDER_REJECTION_REASONS['3'],'Sau khi kiểm tra, đơn hàng chưa đáp ứng điều kiện nhận thưởng của chương trình.');
const premature=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',reward_lua:3000,settled_reference:ref,delivery_paid_confirmed:true},'admin1');
assert.equal(premature.status,409);
const invalidEstimate=await call('/api/admin/shop/orders/'+oid,'POST',{status:'provisional',estimated_reward_lua:0},'admin1');
assert.equal(invalidEstimate.status,400,'Bắt buộc nhập ước tính hợp lệ trước khi tạm duyệt');
const provisional=await call('/api/admin/shop/orders/'+oid,'POST',{status:'provisional',admin_note:'Ghi chú do client tự sửa, phải bị bỏ qua',estimated_reward_lua:2000},'admin1');
assert.equal(provisional.status,200);
assert.equal(db.prepare('SELECT verification_note FROM shop_orders WHERE id=?').get(oid).verification_note,ORDER_CHECK_NOTE,'Only exact preset verification text is stored');
assert.equal(db.prepare('SELECT admin_note FROM shop_orders WHERE id=?').get(oid).admin_note,ORDER_CHECK_NOTE,'Any client-provided verification note is ignored');
assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0,'Pending commission must NOT pay');
assert.equal((await call('/api/shop/orders/alerts')).data.unread,1);
orders=(await call('/api/shop/orders')).data.orders;
assert.equal(orders[0].status,'provisional');
assert.equal(orders[0].estimated_reward_lua,2000,'Member sees Admin estimate only on provisional orders');
assert.equal(orders[0].reward_lua,0,'Estimate must never add to wallet');
assert.ok(!('commission_vnd' in orders[0]),'Commission must remain private while provisional');
assert.ok(!('verification_note' in orders[0]),'Admin verification note must stay hidden');
assert.ok(!('admin_note' in orders[0]),'Admin-only review notes must stay hidden');
assert.ok(!(await call('/api/shop/orders')).data.events.some(e=>'detail' in e),'Buyer never receives audit details');
const estimatePage=await shopOrdersPage({
 api:async p=>p==='/api/shop/orders'?{orders,events:[]}:{unread:0},
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(estimatePage,/Lúa dự kiến nhận/);
assert.match(estimatePage,/~ 2000/);
assert.match(estimatePage,/có thể tăng hoặc giảm/);
assert.match(estimatePage,/Chưa cộng vào ví Lúa/);
assert.match(estimatePage,/Bước 2\/3/);
assert.match(estimatePage,/ID đơn hàng đã được xác minh hợp lệ/);
assert.match(estimatePage,/sorder-card-provisional/);
assert.doesNotMatch(estimatePage,/HOA_HONG_BI_MAT_123|hoa hồng|Affiliate/i,'Buyer UI must not disclose affiliate commission or internal records');
const pendingAdminForm=await adminShopOrdersPage({
 api:async()=>({orders:[adminView.orders[0]],lua_per_vnd:1}),
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(pendingAdminForm,/name="estimated_reward_lua"/);
assert.match(pendingAdminForm,/placeholder="Ví dụ 2000"/);
assert.match(pendingAdminForm,/sorder-preset-note/,'Admin sees fixed verification sentence');
assert.match(pendingAdminForm,/Đã kiểm tra ID đơn hàng, thông tin sản phẩm trùng khớp/);
assert.doesNotMatch(pendingAdminForm,/name="admin_note"|shop-verify-[^"]+" name="admin_note"/,'Admin cannot type verification note');
const invalidUpdate=await call('/api/admin/shop/orders/'+oid,'POST',{status:'estimate',estimated_reward_lua:-5},'admin1');
assert.equal(invalidUpdate.status,400);
const updatedEstimate=await call('/api/admin/shop/orders/'+oid,'POST',{status:'estimate',estimated_reward_lua:2500},'admin1');
assert.equal(updatedEstimate.status,200,'Admin can adjust Lua estimate while provisional');
assert.equal(db.prepare('SELECT estimated_reward_lua FROM shop_orders WHERE id=?').get(oid).estimated_reward_lua,2500);
assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0,'Adjusting estimated Lua must not credit wallet');
orders=(await call('/api/shop/orders')).data.orders;
assert.equal(orders[0].estimated_reward_lua,2500);
const revisedEstimatePage=await shopOrdersPage({
 api:async p=>p==='/api/shop/orders'?{orders,events:[]}:{unread:0},
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(revisedEstimatePage,/~ 2500/);
const provisionalAdminView=(await call('/api/admin/shop/orders','GET',undefined,'admin1')).data;
const editEstimateAdminPage=await adminShopOrdersPage({
 api:async()=>({orders:provisionalAdminView.orders,lua_per_vnd:1}),
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(editEstimateAdminPage,/data-form="shop-order-estimate"/);
assert.match(editEstimateAdminPage,/Lúa dự kiến đang hiển thị cho khách/);
assert.match(editEstimateAdminPage,/name="reward_lua"/);
assert.doesNotMatch(editEstimateAdminPage,/name="commission_vnd"|Hoa hồng THỰC NHẬN|Tỷ giá nội bộ hiện tại/,'Settlement form contains only Lua reward, not personal commission or conversion rate');
assert.doesNotMatch(editEstimateAdminPage,/shop-settle-btn" disabled/,'Paying member Lua does not depend on Lua-VND setting');
const duplicateCheck=await call('/api/admin/shop/orders/'+oid,'POST',{status:'provisional',admin_note:'Lặp lại'},'admin1');
assert.equal(duplicateCheck.status,409);
const invalidReward=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',reward_lua:10000001,settled_reference:ref,delivery_paid_confirmed:true},'admin1');
assert.equal(invalidReward.status,400,'Reward cap still protects against accidentally excessive Lua');
assert.equal(db.prepare("SELECT status FROM shop_orders WHERE id=?").get(oid).status,'provisional');
const missingFinalConfirmation=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',reward_lua:3000,settled_reference:ref},'admin1');
assert.equal(missingFinalConfirmation.status,400,'Final delivery/payment/settlement acknowledgement required');
assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0,'Missing final proof acknowledgement must never pay');
// No percent split: Admin chooses 3,000 Lua directly, even with no commission amount given.
db.prepare("UPDATE settings SET value='0' WHERE key='lua_per_vnd'").run();
const settled=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',reward_lua:3000,settled_reference:ref,delivery_paid_confirmed:true},'admin1');
assert.equal(settled.status,200);
assert.equal(settled.data.reward_lua,3000);
assert.equal(db.prepare('SELECT commission_vnd FROM shop_orders WHERE id=?').get(oid).commission_vnd,0,'No new TikTok commission data is stored');
assert.equal(db.prepare('SELECT rate_snapshot FROM shop_orders WHERE id=?').get(oid).rate_snapshot,0,'No new commission conversion snapshot is stored');
assert.equal(db.prepare("SELECT SUM(amount) n FROM wallet_entries WHERE user_id='user1' AND reference_type='shop_order'").get().n,3000);
const repeated=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',reward_lua:3000,settled_reference:ref,delivery_paid_confirmed:true},'admin1');
assert.equal(repeated.status,409);
const forbiddenUpdateAfterResolved=await call('/api/admin/shop/orders/'+oid,'POST',{status:'estimate',estimated_reward_lua:4000},'admin1');
assert.equal(forbiddenUpdateAfterResolved.status,409,'Cannot revise estimate after real Lua was settled');
assert.equal(db.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE reference_id=?").get(oid).n,1);
assert.equal(db.prepare("SELECT COUNT(*) n FROM shop_order_events WHERE order_id=? AND status='resolved'").get(oid).n,1);
orders=(await call('/api/shop/orders')).data.orders;
assert.equal(orders[0].status,'resolved');
assert.equal(orders[0].reward_lua,3000);
assert.equal(orders[0].estimated_reward_lua,0,'Lúa dự kiến không còn hiện sau khi giải quyết');
assert.equal((await call('/api/shop/orders/alerts')).data.unread,1);
const page=await shopOrdersPage({
 api:async p=>p==='/api/shop/orders'?{orders,events:[]}:{unread:0},
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(page,/Đã giải quyết/);
assert.match(page,/\+3000 Lúa/);
assert.match(page,/Bước 3\/3/);
assert.match(page,/Đã cộng vào ví Lúa/);
assert.match(page,/Chúc mừng!/);
assert.doesNotMatch(page,/hoa hồng|Affiliate|HOA_HONG_BI_MAT_123/i,'Buyer order history must not reveal Admin compensation');
assert.doesNotMatch(page,/Lúa dự kiến nhận/,'Đơn đã giải quyết chỉ hiển thị Lúa thực tế');
const adminPage=await adminShopOrdersPage({
 api:async()=>({orders:[adminView.orders[0]],lua_per_vnd:1}),
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(adminPage,/Tạm duyệt/);
assert.doesNotMatch(adminPage,/name="commission_vnd"|Hoa hồng THỰC NHẬN/,'No commission entry appears in Admin order review');
const read=await call('/api/shop/orders/read','POST',{},'user1');
assert.equal(read.status,200);
assert.equal((await call('/api/shop/orders/alerts')).data.unread,0);
const second=await call('/api/shop/orders','POST',{product_id:prodId,order_reference:'TIKTOKORDER11223344'},'user2');
assert.equal(second.status,201);
const invalidRejection=await call('/api/admin/shop/orders/'+second.data.id,'POST',{status:'rejected',reason:'Nội dung tự nhập'},'admin1');
assert.equal(invalidRejection.status,400,'Only preset reason codes can reject orders');
const invalidCode=await call('/api/admin/shop/orders/'+second.data.id,'POST',{status:'rejected',reason_code:'9'},'admin1');
assert.equal(invalidCode.status,400);
assert.equal(db.prepare('SELECT status FROM shop_orders WHERE id=?').get(second.data.id).status,'pending');
const reject=await call('/api/admin/shop/orders/'+second.data.id,'POST',{status:'rejected',reason_code:'2'},'admin1');
assert.equal(reject.status,200);
assert.equal(db.prepare('SELECT admin_note FROM shop_orders WHERE id=?').get(second.data.id).admin_note,ORDER_REJECTION_REASONS['2']);
assert.equal(db.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE user_id='user2'").get().n,0);
assert.equal((await call('/api/shop/orders','GET',undefined,'user2')).data.orders[0].status,'rejected');
const rejectedBuyerData=(await call('/api/shop/orders','GET',undefined,'user2')).data;
assert.ok(!('admin_note' in rejectedBuyerData.orders[0]),'Rejected Admin reason must be private');
assert.ok(rejectedBuyerData.events.every(e=>!('detail' in e)),'Rejected audit reason must be private');
const rejectedBuyerPage=await shopOrdersPage({
 api:async p=>p==='/api/shop/orders'?rejectedBuyerData:{unread:0},
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x
});
assert.match(rejectedBuyerPage,/Đơn hàng không đủ điều kiện nhận Lúa/);
assert.doesNotMatch(rejectedBuyerPage,/hoàn trả hoặc hoàn tiền|hoa hồng|Affiliate/i,'Detailed Admin rejection note stays private');
assert.match(rejectedBuyerPage,/Không được cộng Lúa/);
assert.match(rejectedBuyerPage,/sorder-card-rejected/);
assert.doesNotMatch(rejectedBuyerPage,/Tiến trình đơn hàng|Bước 1\/3|Bước 2\/3|Bước 3\/3/,'Rejected is a separate outcome, not a fourth timeline step');
assert.doesNotMatch(rejectedBuyerPage,/HOA_HONG_BI_MAT_123|hoa hồng|Affiliate/i);
assert.equal((await call('/api/shop/orders/alerts','GET',undefined,'user2')).data.unread,1);
const noAdmin=await call('/api/admin/shop/orders','GET',undefined,'user1');
assert.equal(noAdmin.status,403);
const adminRejectPage=await adminShopOrdersPage({
 api:async()=>({orders:[adminView.orders[0]],lua_per_vnd:1,verification_note:ORDER_CHECK_NOTE,rejection_reasons:ORDER_REJECTION_REASONS}),
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x
});
assert.match(adminRejectPage,/name="reason_code"/);
assert.match(adminRejectPage,/value="0"/);
assert.match(adminRejectPage,/value="1"/);
assert.match(adminRejectPage,/value="2"/);
assert.match(adminRejectPage,/value="3"/);
assert.match(adminRejectPage,/Đơn hàng đã được hoàn trả hoặc hoàn tiền/);
assert.doesNotMatch(adminRejectPage,/name="reason"|name="admin_note"/,'No free-form order notes in Admin UI');
for(const code of ['0','1','3']){
 const created=await call('/api/shop/orders','POST',{product_id:prodId,order_reference:'ORDEREXTRATEST'+code+'555555'},'user2');
 assert.equal(created.status,201);
 const result=await call('/api/admin/shop/orders/'+created.data.id,'POST',{status:'rejected',reason_code:code},'admin1');
 assert.equal(result.status,200);
 assert.equal(db.prepare('SELECT admin_note FROM shop_orders WHERE id=?').get(created.data.id).admin_note,ORDER_REJECTION_REASONS[code]);
}
assert.equal(db.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE user_id='user2'").get().n,0,'Rejected orders cannot add Lua');
console.log('PASS: TikTok order reporting, manual verification, settled commission, one-time credit, statuses, alerts and private earnings.');
