import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {cardRedemptionsAPI} from '../src/card-redemptions.js';
import {cardRedemptionsPage,adminCardRedemptionsPage} from '../public/card-redemptions-ui.js';

const sqlite=new DatabaseSync(':memory:');
for(const m of ['0001_init.sql','0002_shop.sql','0003_shop_orders.sql','0004_shop_estimated_lua.sql','0005_cards.sql']){
 sqlite.exec(readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));
}
sqlite.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,referral_code,role) VALUES(?,?,?,?,?,?,?)")
 .run('user1','u1@test.invalid','Thành viên 1','hash','salt','REF001','member');
sqlite.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,referral_code,role) VALUES(?,?,?,?,?,?,?)")
 .run('user2','u2@test.invalid','Thành viên 2','hash','salt','REF002','member');
sqlite.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,referral_code,role) VALUES(?,?,?,?,?,?,?)")
 .run('admin1','admin@test.invalid','Admin','hash','salt','REF003','admin');
sqlite.prepare("INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id) VALUES(?,?,?,?,?,?)")
 .run(randomUUID(),'user1',50000,'Thưởng thử','test','credit');
class Stmt{
 constructor(sql){this.sql=sql;this.args=[];}
 bind(...args){this.args=args;return this;}
 async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}
 async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}
 async run(){const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:r.changes}};}
}
const env={DB:{
 prepare:q=>new Stmt(q),
 async batch(stmts){
  sqlite.exec('BEGIN');
  try{const results=[];for(const s of stmts)results.push(await s.run());sqlite.exec('COMMIT');return results;}
  catch(e){sqlite.exec('ROLLBACK');throw e;}
 }
}};
const users={member:'user1',other:'user2',admin:'admin1'};
const H={
 auth:async(req,e,role)=>{
  const key=req.headers.get('X-Test-User')||'member';
  if(role==='admin'&&key!=='admin')throw Object.assign(new Error('Forbidden'),{status:403});
  return {id:users[key]};
 },
 readBody:async req=>req.json(),
 fail:(status,message)=>{throw Object.assign(new Error(message),{status});},
 json:(body,status=200)=>new Response(JSON.stringify(body),{status}),
 id:()=>randomUUID(),
 str:(value,max=300)=>String(value??'').trim().slice(0,max)
};
const origin='https://example.invalid';
async function call(path,method='GET',body,user='member'){
 try{
  const headers={'X-Test-User':user};if(body!==undefined)headers['Content-Type']='application/json';
  const req=new Request(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const res=await cardRedemptionsAPI(req,env,H);
  if(!res)throw Error('No route for '+path);
  return {status:res.status,data:await res.json()};
 }catch(err){return {status:err.status||500,data:{error:err.message}};}
}
const balance=()=>sqlite.prepare("SELECT COALESCE(SUM(amount),0) n FROM wallet_entries WHERE user_id='user1'").get().n;
const disabled=await call('/api/card-redemptions');
assert.equal(disabled.status,200);
assert.equal(disabled.data.enabled,false,'Disabled by default');
assert.equal((await call('/api/card-redemptions','POST',{carrier:'Viettel',denomination_vnd:10000})).status,403);
assert.equal(balance(),50000);
assert.equal((await call('/api/admin/card-redemptions','GET',undefined,'member')).status,403);
assert.equal((await call('/api/admin/card-redemptions/settings','POST',{enabled:'1'},'admin')).status,409,'Requires real rate and secret');
env.CARD_VOUCHER_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
assert.equal((await call('/api/admin/card-redemptions/settings','POST',{enabled:'1'},'admin')).status,409,'Requires valid Lua/VND rate');
sqlite.prepare("UPDATE settings SET value='1' WHERE key='lua_per_vnd'").run();
assert.equal((await call('/api/admin/card-redemptions/settings','POST',{enabled:'1'},'admin')).status,200);
assert.equal((await call('/api/card-redemptions')).data.enabled,true);
assert.equal((await call('/api/card-redemptions','POST',{carrier:'Unlisted',denomination_vnd:10000})).status,400);
assert.equal((await call('/api/card-redemptions','POST',{carrier:'Viettel',denomination_vnd:25000})).status,400);
assert.equal((await call('/api/card-redemptions','POST',{carrier:'Viettel',denomination_vnd:100000})).status,400,'No overspend');
assert.equal(balance(),50000);
const first=await call('/api/card-redemptions','POST',{carrier:'Viettel',denomination_vnd:10000});
assert.equal(first.status,201,JSON.stringify(first));
const id=first.data.id;
assert.equal(balance(),40000,'Lua held once');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE reference_type='card_redemption_hold'").get().n,1);
assert.equal((await call('/api/card-redemptions','GET',undefined,'other')).data.redemptions.length,0,'Other members never see voucher requests');
assert.equal((await call('/api/admin/card-redemptions','GET',undefined,'member')).status,403);
const adm=await call('/api/admin/card-redemptions','GET',undefined,'admin');
assert.equal(adm.status,200);
assert.equal(adm.data.redemptions[0].user_id,'user1');
assert.ok(!('card_payload_encrypted' in adm.data.redemptions[0]),'Admin list must not expose PIN');
assert.equal((await call('/api/admin/card-redemptions/'+id,'POST',{action:'delivered',serial:'ABC123456789',pin:'123456789012'},'admin')).status,409,'Approval first');
assert.equal((await call('/api/admin/card-redemptions/'+id,'POST',{action:'approved'},'admin')).status,200);
assert.equal((await call('/api/admin/card-redemptions/'+id,'POST',{action:'approved'},'admin')).status,409,'No duplicate approval');
assert.equal((await call('/api/card-redemptions')).data.redemptions[0].status,'approved');
assert.equal((await call('/api/admin/card-redemptions/'+id,'POST',{action:'delivered',serial:'short',pin:'123456789012'},'admin')).status,400);
const delivered=await call('/api/admin/card-redemptions/'+id,'POST',{action:'delivered',serial:'SERIAL123456',pin:'PIN1234567890'},'admin');
assert.equal(delivered.status,200,JSON.stringify(delivered));
const stored=sqlite.prepare('SELECT card_payload_encrypted FROM card_redemptions WHERE id=?').get(id).card_payload_encrypted;
assert.ok(stored.includes(':'),'Encrypted IV + payload stored');
assert.ok(!stored.includes('PIN1234567890')&&!stored.includes('SERIAL123456'),'PIN and serial are not stored in plaintext');
assert.equal((await call('/api/admin/card-redemptions/'+id,'POST',{action:'delivered',serial:'SERIAL123456',pin:'PIN1234567890'},'admin')).status,409,'Never issue twice');
const issued=await call('/api/card-redemptions');
assert.equal(issued.data.redemptions[0].card_details.pin,'PIN1234567890');
assert.equal(issued.data.redemptions[0].card_details.serial,'SERIAL123456');
assert.equal(issued.data.redemptions[0].status,'delivered');
const member2=await call('/api/card-redemptions','GET',undefined,'other');
assert.equal(member2.data.redemptions.length,0);
assert.ok(!JSON.stringify((await call('/api/admin/card-redemptions','GET',undefined,'admin')).data).includes('PIN1234567890'),'Admin listing does not return secrets');
assert.equal(balance(),40000,'Delivery does not double debit Lua');
const safeText=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const viewCtx={esc:safeText,heading:(title,sub)=>'<h1>'+title+'</h1><p>'+sub+'</p>',dt:x=>x};
const memberHTML=await cardRedemptionsPage({...viewCtx,api:async()=>issued.data});
assert.match(memberHTML,/Đổi Lúa, nhận thẻ cào/);
assert.match(memberHTML,/Sao chép mã thẻ/);
assert.match(memberHTML,/PIN1234567890/,'Recipient can view their own delivered PIN');
const adminLatest=await call('/api/admin/card-redemptions','GET',undefined,'admin');
const adminHTML=await adminCardRedemptionsPage({...viewCtx,api:async()=>adminLatest.data});
assert.match(adminHTML,/Quản lý đổi thẻ cào/);
assert.match(adminHTML,/CARD_VOUCHER_SECRET/);
assert.doesNotMatch(adminHTML,/PIN1234567890|SERIAL123456/,'Admin UI must never receive previously issued card codes');
assert.match(adminHTML,/card-generate-key/,'iPhone Admin can generate voucher encryption key locally');
const second=await call('/api/card-redemptions','POST',{carrier:'MobiFone',denomination_vnd:20000});
assert.equal(second.status,201);
assert.equal(balance(),20000);
assert.equal((await call('/api/admin/card-redemptions/'+second.data.id,'POST',{action:'approved'},'admin')).status,200);
const denied=await call('/api/admin/card-redemptions/'+second.data.id,'POST',{action:'rejected',note:'Thẻ cào hiện đã hết, xin hoàn Lúa.'},'admin');
assert.equal(denied.status,200);
assert.equal(balance(),40000,'Rejected request refunds exactly once');
assert.equal((await call('/api/admin/card-redemptions/'+second.data.id,'POST',{action:'rejected',note:'Again'},'admin')).status,409,'No repeated refund');
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE reference_type='card_redemption_refund'").get().n,1);
await call('/api/admin/card-redemptions/settings','POST',{enabled:'0'},'admin');
assert.equal((await call('/api/card-redemptions')).data.enabled,false);
assert.equal((await call('/api/card-redemptions','POST',{carrier:'Viettel',denomination_vnd:10000})).status,403,'Disabled redemption rejects new requests');
const oldCode=(await call('/api/card-redemptions')).data.redemptions.find(x=>x.id===id);
assert.equal(oldCode.card_details.pin,'PIN1234567890','Disabling new requests must not hide already-issued cards');
delete env.CARD_VOUCHER_SECRET;
const noSecret=(await call('/api/card-redemptions')).data.redemptions.find(x=>x.id===id);
assert.ok(noSecret.delivery_error,'Missing key does not leak voucher or allow incorrect display');
assert.ok(!noSecret.card_details);
// Không cho phát trùng cùng seri dù tạo nhiều yêu cầu thẻ khác nhau.
env.CARD_VOUCHER_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
await call('/api/admin/card-redemptions/settings','POST',{enabled:'1'},'admin');
const repeatCard=await call('/api/card-redemptions','POST',{carrier:'Viettel',denomination_vnd:10000});
assert.equal(repeatCard.status,201);
assert.equal((await call('/api/admin/card-redemptions/'+repeatCard.data.id,'POST',{action:'approved'},'admin')).status,200);
const blockedSerial=await call('/api/admin/card-redemptions/'+repeatCard.data.id,'POST',
 {action:'delivered',serial:'SERIAL123456',pin:'DIFFERENT123456'},'admin');
assert.equal(blockedSerial.status,409,'A physical prepaid card cannot be issued twice');
assert.equal(sqlite.prepare("SELECT status FROM card_redemptions WHERE id=?").get(repeatCard.data.id).status,'approved');
assert.equal((await call('/api/admin/card-redemptions/'+repeatCard.data.id,'POST',
 {action:'rejected',note:'Không có mã thẻ khác để phát.'},'admin')).status,200);
assert.equal(balance(),40000,'No Lua lost when Admin cannot issue duplicate card');
console.log('PASS: card redemption defaults off, secure code encryption, member privacy, one-time debit, approval, refusal/refund and disabled gates.');
