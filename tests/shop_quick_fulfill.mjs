// Kiểm thử thao tác Admin thêm sản phẩm và thông báo đúng tài khoản trong một giao dịch.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { shopAPI } from '../src/shop.js';
import { adminShopPage, shopCard, shopPage } from '../public/shop-ui.js';

const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
sql.exec(readFileSync(new URL('../migrations/0002_shop.sql',import.meta.url),'utf8'));
sql.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,referral_code,role) VALUES(?,?,?,?,?,?,?)")
  .run('u1','u1@example.com','Khách A','pw','salt','REFU1','member');
sql.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,referral_code,role) VALUES(?,?,?,?,?,?,?)")
  .run('u2','u2@example.com','Khách B','pw','salt','REFU2','member');
const req1=randomUUID(),req2=randomUUID(),req3=randomUUID();
const addReq=sql.prepare("INSERT INTO shop_requests(id,code,user_id,channel,note,status) VALUES(?,?,?,?,?,'pending')");
addReq.run(req1,'SP-TEST1','u1','zalo','Mua áo xanh');
addReq.run(req2,'SP-TEST2','u2','telegram','Mua sạc');
addReq.run(req3,'SP-TEST3','u1','zalo','Mua đồ chơi');
class Statement{
 constructor(q){this.q=q;this.values=[];}
 bind(...values){this.values=values;return this;}
 async first(){return sql.prepare(this.q).get(...this.values)||null;}
 async all(){return {results:sql.prepare(this.q).all(...this.values)};}
 async run(){const r=sql.prepare(this.q).run(...this.values);return {meta:{changes:r.changes}};}
}
const DB={
 prepare:q=>new Statement(q),
 async batch(commands){
   sql.exec('BEGIN');
   try{
     const result=[];
     for(const cmd of commands)result.push(await cmd.run());
     sql.exec('COMMIT');return result;
   }catch(e){sql.exec('ROLLBACK');throw e;}
 }
};
const env={DB};
const H={
 auth:async(req,env,role)=>{
   const user=req.headers.get('X-User')||'u1';
   if(role==='admin'&&user!=='admin')throw Object.assign(new Error('Forbidden'),{status:403});
   return {id:user,role:user==='admin'?'admin':'member'};
 },
 readBody:req=>req.json(),
 fail:(status,message)=>{throw Object.assign(new Error(message),{status});},
 json:(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}),
 id:randomUUID,
 str:(v,max=300)=>String(v??'').trim().slice(0,max)
};
async function call(path,method='GET',body,user='u1'){
 const req=new Request('https://example.org'+path,{
   method,headers:{'X-User':user,...(body?{'Content-Type':'application/json'}:{})},
   body:body?JSON.stringify(body):undefined
 });
 try{
   const res=await shopAPI(req,env,H);
   assert.ok(res);return {status:res.status,data:await res.json()};
 }catch(e){
   if(e.status)return {status:e.status,data:{error:e.message}};
   throw e;
 }
}
const payload={status:'ready_new',title:'Áo xanh',link:'https://vt.tiktok.com/ZS123456/',category:'fashion'};
const form=await adminShopPage({
 api:async()=>({products:[],requests:[{id:req1,code:'SP-TEST1',name:'Khách A',email:'u1@example.com',note:'Mua áo xanh',channel:'zalo',status:'pending'}],contacts:{zalo:'',telegram:''}}),
 esc:x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
 field:()=>'',select:()=>'',heading:()=>'',state:{shopEdit:null}
});
assert.match(form,/data-form="shop-fulfill"/);
assert.match(form,/Thêm sản phẩm & thông báo khách/);
assert.match(form,/name="request_id"/);
const created=await call('/api/admin/shop/requests/'+req1,'POST',payload,'admin');
assert.equal(created.status,200);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM shop_products').get().n,1);
const done=sql.prepare('SELECT status,product_id,seen_at FROM shop_requests WHERE id=?').get(req1);
assert.equal(done.status,'ready');
assert.ok(done.product_id);
assert.equal(done.seen_at,null);
assert.equal(sql.prepare('SELECT is_active FROM shop_products WHERE id=?').get(done.product_id).is_active,1);
assert.equal((await call('/api/shop/alerts')).data.unread,1);
assert.equal((await call('/api/shop/alerts','GET',undefined,'u2')).data.unread,0);
const myShop=(await call('/api/shop')).data;
assert.equal(myShop.requests.find(r=>r.code==='SP-TEST1').status,'ready');
assert.equal(myShop.requests.find(r=>r.code==='SP-TEST1').product_title,'Áo xanh');
assert.equal((await call('/api/shop','GET',undefined,'u2')).data.requests.length,1);
const same=await call('/api/admin/shop/requests/'+req1,'POST',payload,'admin');
assert.equal(same.status,409,'Repeated submission must fail');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM shop_products').get().n,1,'Do not leave duplicate products');
const invalid=await call('/api/admin/shop/requests/'+req3,'POST',{...payload,link:'https://bad.example/phishing'},'admin');
assert.equal(invalid.status,400);
assert.equal(sql.prepare('SELECT status FROM shop_requests WHERE id=?').get(req3).status,'pending');
const missing=await call('/api/admin/shop/requests/'+randomUUID(),'POST',payload,'admin');
assert.equal(missing.status,409);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM shop_products').get().n,1,'Do not leave orphan products');
assert.equal((await call('/api/shop/requests/read','POST',{},'u1')).status,200);
assert.equal((await call('/api/shop/alerts')).data.unread,0);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0,'Product announcements must not credit Lúa');
// Không áp giới hạn lượt/ngày hay số yêu cầu đang chờ đối với mua sắm.
sql.prepare("INSERT INTO settings(key,value) VALUES('shop_contact_zalo','https://zalo.me/0988734511')").run();
for(let i=0;i<21;i++){
 const result=await call('/api/shop/requests','POST',{channel:'zalo',note:'Yêu cầu sản phẩm thứ '+(i+1)});
 assert.equal(result.status,201,'Yêu cầu thứ '+(i+1)+' phải thành công, không hạn mức ngày/chờ');
 assert.match(result.data.code,/^SP-/);
}
assert.equal(sql.prepare("SELECT COUNT(*) n FROM shop_requests WHERE user_id='u1' AND status='pending'").get().n,22);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_entries').get().n,0);
console.log('PASS: shop requests have no daily or pending-count quota; wallet remains untouched.');
// Public shopping cards must not reveal affiliate-program wording even by default.
const product={id:'p123',title:'Dầu gội',description:'',link:'https://vt.tiktok.com/ZS123456/',category:'beauty'};
const memberCard=shopCard(product,x=>String(x));
assert.match(memberCard,/Xem & mua ngay/,'Approved primary button label is present');
assert.match(memberCard,/Lúa xét khi đơn hàng hoàn tất/,'No immediate Lua payout promise');
assert.doesNotMatch(memberCard,/Nhận Lúa ngay|nhận Lúa ngay/i,'Do not promise instant rewards');
assert.doesNotMatch(memberCard,/Affiliate|tiếp thị liên kết|hoa hồng|lợi nhuận|đối soát/i);
const memberShop=await shopPage({
 api:async path=>({products:[product],requests:[],contacts:{zalo:'',telegram:''}}),
 esc:x=>String(x),state:{shopCategory:'all'}
});
assert.doesNotMatch(memberShop,/Affiliate|tiếp thị liên kết|hoa hồng|lợi nhuận|đối soát/i);
const adminShop=await adminShopPage({
 api:async()=>({products:[],requests:[],contacts:{zalo:'',telegram:''}}),
 esc:x=>String(x),field:()=>'',select:()=>'',heading:(title,sub)=>title+sub,
 state:{shopEdit:null}
});
assert.doesNotMatch(adminShop,/TikTok Shop Affiliate|Link TikTok Shop Affiliate/);
console.log('PASS: buyer-facing product cards and shopping page do not disclose affiliate arrangements.');
console.log('PASS: direct product creation, one-time fulfillment, per-member notification, protected links and unchanged wallet.');
