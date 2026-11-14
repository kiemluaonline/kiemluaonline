import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { shopOrdersAPI } from '../src/shop-orders.js';
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
assert.equal(orders[0].estimated_reward_lua,0,'Chưa xác minh thì không hiển thị Lúa dự kiến');
assert.ok(!('commission_vnd' in orders[0]),'Do not expose Admin commission');
assert.ok(!('settled_reference' in orders[0]),'Do not expose secret TikTok reconciliation ID');
assert.equal(orders[0].reward_lua,0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0);
assert.equal((await call('/api/shop/orders/alerts')).data.unread,0);
assert.equal((await call('/api/shop/orders','GET',undefined,'user2')).data.orders.length,0);
const adminView=(await call('/api/admin/shop/orders','GET',undefined,'admin1')).data;
assert.equal(adminView.orders.length,1);
assert.equal(adminView.orders[0].order_reference,ref);
const premature=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',commission_vnd:10000,reward_lua:3000,settled_reference:ref},'admin1');
assert.equal(premature.status,409);
const invalidEstimate=await call('/api/admin/shop/orders/'+oid,'POST',{status:'provisional',admin_note:'Khách đã nhận và thanh toán, đối chiếu đơn hợp lệ',estimated_reward_lua:0},'admin1');
assert.equal(invalidEstimate.status,400,'Bắt buộc nhập ước tính hợp lệ trước khi tạm duyệt');
const provisional=await call('/api/admin/shop/orders/'+oid,'POST',{status:'provisional',admin_note:'Khách đã nhận và thanh toán, đối chiếu đơn hợp lệ',estimated_reward_lua:2000},'admin1');
assert.equal(provisional.status,200);
assert.equal(db.prepare('SELECT verification_note FROM shop_orders WHERE id=?').get(oid).verification_note.includes('đối chiếu'),true);
assert.equal(db.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0,'Pending commission must NOT pay');
assert.equal((await call('/api/shop/orders/alerts')).data.unread,1);
orders=(await call('/api/shop/orders')).data.orders;
assert.equal(orders[0].status,'provisional');
assert.equal(orders[0].estimated_reward_lua,2000,'Member sees Admin estimate only on provisional orders');
assert.equal(orders[0].reward_lua,0,'Estimate must never add to wallet');
assert.ok(!('commission_vnd' in orders[0]),'Commission must remain private while provisional');
assert.ok(!('verification_note' in orders[0]),'Admin verification note must stay hidden');
const estimatePage=await shopOrdersPage({
 api:async p=>p==='/api/shop/orders'?{orders,events:[]}:{unread:0},
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(estimatePage,/Lúa dự kiến nhận/);
assert.match(estimatePage,/~ 2000/);
assert.match(estimatePage,/có thể tăng hoặc giảm/);
assert.match(estimatePage,/Chưa cộng vào ví Lúa/);
const pendingAdminForm=await adminShopOrdersPage({
 api:async()=>({orders:[adminView.orders[0]],lua_per_vnd:1}),
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(pendingAdminForm,/name="estimated_reward_lua"/);
assert.match(pendingAdminForm,/placeholder="Ví dụ 2000"/);
const duplicateCheck=await call('/api/admin/shop/orders/'+oid,'POST',{status:'provisional',admin_note:'Lặp lại'},'admin1');
assert.equal(duplicateCheck.status,409);
const overpay=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',commission_vnd:500,reward_lua:2000,settled_reference:ref},'admin1');
assert.equal(overpay.status,400);
assert.equal(db.prepare("SELECT status FROM shop_orders WHERE id=?").get(oid).status,'provisional');
const settled=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',commission_vnd:10000,reward_lua:3000,settled_reference:ref},'admin1');
assert.equal(settled.status,200);
assert.equal(settled.data.reward_lua,3000);
assert.equal(db.prepare("SELECT SUM(amount) n FROM wallet_entries WHERE user_id='user1' AND reference_type='shop_order'").get().n,3000);
const repeated=await call('/api/admin/shop/orders/'+oid,'POST',{status:'resolved',commission_vnd:10000,reward_lua:3000,settled_reference:ref},'admin1');
assert.equal(repeated.status,409);
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
assert.doesNotMatch(page,/Lúa dự kiến nhận/,'Đơn đã giải quyết chỉ hiển thị Lúa thực tế');
const adminPage=await adminShopOrdersPage({
 api:async()=>({orders:[adminView.orders[0]],lua_per_vnd:1}),
 esc:x=>String(x),heading:()=>'',fmt:x=>String(x),dt:x=>x});
assert.match(adminPage,/Tạm duyệt/);
const read=await call('/api/shop/orders/read','POST',{},'user1');
assert.equal(read.status,200);
assert.equal((await call('/api/shop/orders/alerts')).data.unread,0);
const second=await call('/api/shop/orders','POST',{product_id:prodId,order_reference:'TIKTOKORDER11223344'},'user2');
assert.equal(second.status,201);
const reject=await call('/api/admin/shop/orders/'+second.data.id,'POST',{status:'rejected',reason:'Đơn không đủ điều kiện hoa hồng'},'admin1');
assert.equal(reject.status,200);
assert.equal(db.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE user_id='user2'").get().n,0);
assert.equal((await call('/api/shop/orders','GET',undefined,'user2')).data.orders[0].status,'rejected');
assert.equal((await call('/api/shop/orders/alerts','GET',undefined,'user2')).data.unread,1);
const noAdmin=await call('/api/admin/shop/orders','GET',undefined,'user1');
assert.equal(noAdmin.status,403);
console.log('PASS: TikTok order reporting, manual verification, settled commission, one-time credit, statuses, alerts and private earnings.');
