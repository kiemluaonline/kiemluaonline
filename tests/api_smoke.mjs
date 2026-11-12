// Test không dùng internet: mô phỏng D1 bằng SQLite gốc của Node 22.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url),'utf8'));
class Statement {
  constructor(q){ this.q=q;this.values=[]; }
  bind(...args){ this.values=args;return this; }
  async first(){ return sqlite.prepare(this.q).get(...this.values) || null; }
  async all(){ return {results:sqlite.prepare(this.q).all(...this.values)}; }
  async run(){ const result=sqlite.prepare(this.q).run(...this.values);return {meta:{changes:result.changes}}; }
}
const env={
  SETUP_KEY:'test_setup_key_123456789123456789', DEVICE_SALT:'test_salt_12345678912345678901234',
  DB:{ prepare:q=>new Statement(q), async batch(statements){
    sqlite.exec('BEGIN');
    try {const result=[]; for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}
    catch(e){sqlite.exec('ROLLBACK');throw e;}
  }}
};
const origin='http://localhost:8787';
async function call(path,method='GET',body, cookie='',ip='192.0.2.15'){
 const headers={'CF-Connecting-IP':ip,'User-Agent':'Test-Browser/1.0'};
 if(body!==undefined){headers['Content-Type']='application/json';headers['Origin']=origin;headers['X-Tram-Lua']='1';}
 if(cookie)headers['Cookie']=cookie;
 const r=await worker.fetch(new Request(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
 let data;try{data=await r.json();}catch{data={};}
 return {status:r.status, data, cookie:r.headers.get('Set-Cookie')?.split(';')[0]||''};
}
// POST từ nguồn ngoài hoặc thiếu header không được truy cập.
const csrf=await call('/api/auth/register','POST',{name:'A',email:'a@example.com',password:'passpasspass'});
assert.equal(csrf.status,400); // Có header CSRF, nhưng chưa chấp nhận điều khoản.
const adm=await call('/api/setup','POST',{setup_key:env.SETUP_KEY,email:'admin@example.com',name:'Chủ trang',password:'A-secure-password-2026'});
assert.equal(adm.status,201,JSON.stringify(adm));assert.ok(adm.cookie.includes('kl_session='));
const admCookie=adm.cookie;
const setupAgain=await call('/api/setup','POST',{setup_key:env.SETUP_KEY,email:'admin2@example.com',name:'Chủ trang',password:'A-secure-password-2026'});
assert.equal(setupAgain.status,409);
let rsp=await call('/api/admin/tasks','POST',{title:'Nhiệm vụ kiểm tra liên kết',description:'Truy cập liên kết được cấp',category:'link',url:'https://example.com',reward:100,min_seconds:5,review_mode:'auto',repeat_policy:'once',is_active:true},admCookie);
assert.equal(rsp.status,201,JSON.stringify(rsp));const taskId=rsp.data.id;
const referralUser=await call('/api/auth/register','POST',{name:'Người giới thiệu',email:'ref@example.com',password:'test-password-2026',accept_terms:'yes'});
assert.equal(referralUser.status,201,JSON.stringify(referralUser));const refCookie=referralUser.cookie;
const refMe=await call('/api/me','GET',undefined,refCookie);
assert.equal(refMe.status,200);
const code=refMe.data.user.referral_code;
const user=await call('/api/auth/register','POST',{name:'Thành viên A',email:'user@example.com',password:'user-password-2026',referral_code:code,accept_terms:'yes'},'','203.0.113.10');
assert.equal(user.status,201,JSON.stringify(user));const cookie=user.cookie;
assert.equal((await call('/api/admin/users','GET',undefined,cookie)).status,403);
await call('/api/admin/settings','PUT',{referral_reward:'25',checkin_reward:'5',lua_per_vnd:'10',min_withdraw_lua:'10',withdrawals_enabled:'1'},admCookie);
const start=await call(`/api/tasks/${taskId}/start`,'POST',{},cookie,'203.0.113.10');
assert.equal(start.status,200,JSON.stringify(start));
const a=start.data;
let tooEarly=await call(`/api/tasks/${taskId}/submit`,'POST',{attempt_id:a.attempt_id,answer:a.a+a.b},cookie,'203.0.113.10');
assert.equal(tooEarly.status,425,JSON.stringify(tooEarly));
sqlite.prepare('UPDATE task_attempts SET available_at=0 WHERE id=?').run(a.attempt_id);
const wrong=await call(`/api/tasks/${taskId}/submit`,'POST',{attempt_id:a.attempt_id,answer:999},cookie,'203.0.113.10');
assert.equal(wrong.status,422,JSON.stringify(wrong));
const claim=await call(`/api/tasks/${taskId}/submit`,'POST',{attempt_id:a.attempt_id,answer:wrong.data.a+wrong.data.b},cookie,'203.0.113.10');
assert.equal(claim.status,200,JSON.stringify(claim));
assert.equal(claim.data.status,'approved');
const dup=await call(`/api/tasks/${taskId}/submit`,'POST',{attempt_id:a.attempt_id,answer:wrong.data.a+wrong.data.b},cookie,'203.0.113.10');
assert.equal(dup.status,410);
const userMe=await call('/api/me','GET',undefined,cookie,'203.0.113.10');
assert.equal(userMe.data.balance,100);assert.equal(userMe.data.device_code.length,16);
const referralMe=await call('/api/me','GET',undefined,refCookie);
assert.equal(referralMe.data.balance,25);
const checkin=await call('/api/checkin','POST',{},cookie,'203.0.113.10');assert.equal(checkin.status,200);
assert.equal((await call('/api/checkin','POST',{},cookie,'203.0.113.10')).status,409);
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,105);
const w1=await call('/api/withdrawals','POST',{amount:40,bank_name:'Ngan hang A',bank_account:'1234567890',bank_owner:'NGUYEN VAN A'},cookie,'203.0.113.10');
assert.equal(w1.status,200,JSON.stringify(w1));
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,65);
assert.equal((await call('/api/withdrawals','POST',{amount:80,bank_name:'Ngan hang A',bank_account:'1234567890',bank_owner:'NGUYEN VAN A'},cookie,'203.0.113.10')).status,400);
const reject=await call(`/api/admin/withdrawals/${w1.data.id}`,'POST',{status:'rejected',admin_note:'Tai khoan chua xac minh'},admCookie);
assert.equal(reject.status,200,JSON.stringify(reject));
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,105);
const taskManual=await call('/api/admin/tasks','POST',{title:'Gửi minh chứng thủ công',description:'Gửi ảnh/bằng chứng dạng liên kết',category:'other',url:'',reward:30,min_seconds:5,review_mode:'manual',repeat_policy:'once',is_active:true},admCookie);
assert.equal(taskManual.status,201,JSON.stringify(taskManual));
const mid=taskManual.data.id;
const ms=await call(`/api/tasks/${mid}/start`,'POST',{},cookie,'203.0.113.10');
sqlite.prepare('UPDATE task_attempts SET available_at=0 WHERE id=?').run(ms.data.attempt_id);
const evidence=await call(`/api/tasks/${mid}/submit`,'POST',{attempt_id:ms.data.attempt_id,answer:ms.data.a+ms.data.b,evidence:'Bằng chứng là đường dẫn https://example.com/task'},cookie,'203.0.113.10');
assert.equal(evidence.status,200,JSON.stringify(evidence));assert.equal(evidence.data.status,'pending');
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,105);
const reviews=await call('/api/admin/reviews','GET',undefined,admCookie);
const pending=reviews.data.reviews.find(r=>r.task_id===mid);
assert.ok(pending);
const approval=await call(`/api/admin/reviews/${pending.id}`,'POST',{status:'approved'},admCookie);
assert.equal(approval.status,200,JSON.stringify(approval));
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,135);
assert.equal((await call(`/api/admin/reviews/${pending.id}`,'POST',{status:'approved'},admCookie)).status,409);
assert.equal((await call('/api/me','GET',undefined,refCookie)).data.balance,25);
const history=await call('/api/history','GET',undefined,cookie,'203.0.113.10');
assert.ok(history.data.wallet_entries.length>=4);
// Một yêu cầu rút đã chuyển không tự hoàn Lúa.
const w2=await call('/api/withdrawals','POST',{amount:20,bank_name:'Ngan hang A',bank_account:'1234567890',bank_owner:'NGUYEN VAN A'},cookie,'203.0.113.10');
assert.equal(w2.status,200);
assert.equal((await call('/api/admin/withdrawals/'+w2.data.id,'POST',{status:'paid',admin_note:'Giao dich da doi chieu'},admCookie)).status,200);
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,115);
const change=await call('/api/me/password','POST',{old_password:'user-password-2026',new_password:'My-new-2026-password'},cookie,'203.0.113.10');
assert.equal(change.status,200);
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).status,401);
const newLogin=await call('/api/auth/login','POST',{email:'user@example.com',password:'My-new-2026-password'},'','203.0.113.10');
assert.equal(newLogin.status,200);
assert.ok(newLogin.cookie);
await worker.scheduled({},env); // Xác nhận tác vụ dọn dẹp hoạt động trong mô phỏng.
console.log('PASS: admin setup một lần, thành viên, giới thiệu, CAPTCHA đổi câu hỏi, chờ thời gian, cộng Lúa một lần, điểm danh, giữ/hoàn Lúa, duyệt bằng chứng, chống duyệt trùng, phân quyền, lịch sử.');
