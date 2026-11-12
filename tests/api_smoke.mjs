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
async function call(path,method='GET',body, cookie='',ip='192.0.2.15',device='11111111-2222-4333-8444-555555555555'){
 const headers={'CF-Connecting-IP':ip,'User-Agent':'Test-Browser/1.0','X-TL-Device':device};
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
assert.equal(userMe.data.device_registered,true);
const changedIp=await call('/api/me','GET',undefined,cookie,'198.51.100.22');
assert.equal(changedIp.data.device_code,userMe.data.device_code,'Same browser ID must survive IP change');
const changedDevice=await call('/api/me','GET',undefined,cookie,'203.0.113.10','99999999-2222-4333-8444-555555555555');
assert.notEqual(changedDevice.data.device_code,userMe.data.device_code);
const beforePayment=await call('/api/task-dashboard','GET',undefined,cookie);
assert.equal(beforePayment.status,200);
assert.equal(beforePayment.data.latest_payment,null,'No invented payout');
assert.equal(typeof beforePayment.data.submitted_today,'number');
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
const dashboard=await call('/api/task-dashboard','GET',undefined,cookie,'203.0.113.10');
assert.equal(dashboard.status,200);
assert.equal(dashboard.data.latest_payment.vnd_amount,2);
assert.equal(dashboard.data.latest_payment.masked_account,'12******90');
assert.equal(dashboard.data.latest_payment.bank_account,undefined);
assert.ok(dashboard.data.link_lua>=100);
const riskSummary=await call('/api/admin/risk-events','GET',undefined,admCookie);
assert.equal(riskSummary.status,200);
assert.ok(Array.isArray(riskSummary.data.repeated_devices));

// Quota theo IP, trình duyệt, tài khoản: mỗi giới hạn do Admin tự thay đổi.
const defaultQuota=await call('/api/admin/settings','GET',undefined,admCookie);
assert.equal(defaultQuota.status,200);
assert.equal(defaultQuota.data.settings.quota_user_tasks_daily,'25');
assert.equal(defaultQuota.data.settings.quota_device_accounts_daily,'2');
assert.equal(defaultQuota.data.settings.quota_ip_accounts_daily,'6');
assert.equal((await call('/api/admin/settings','PUT',{quota_ip_accounts_daily:'200'},admCookie)).status,400);
// Các test quota cũ kiểm tra riêng quy tắc thiết bị và IP theo ngày.
assert.equal((await call('/api/admin/settings','PUT',{
 quota_link_ip_exclusive:'0',quota_link_tasks_ip_24h:'0'
},admCookie)).status,200);
const otherIP='203.0.113.10';
const browserID='11111111-2222-4333-8444-555555555555';
const user2=await call('/api/auth/register','POST',{name:'Người dùng hai',email:'quota2@example.com',password:'test-password-2026',accept_terms:'yes'},'',otherIP,browserID);
assert.equal(user2.status,201,JSON.stringify(user2));
async function claimFor(cookieFor, taskFor, ipFor=otherIP, deviceFor=browserID){
 const startFor=await call('/api/tasks/'+taskFor+'/start','POST',{},cookieFor,ipFor,deviceFor);
 if(startFor.status!==200)return startFor;
 sqlite.prepare('UPDATE task_attempts SET available_at=0 WHERE id=?').run(startFor.data.attempt_id);
 return call('/api/tasks/'+taskFor+'/submit','POST',{
  attempt_id:startFor.data.attempt_id,answer:startFor.data.a+startFor.data.b
 },cookieFor,ipFor,deviceFor);
}
const user2Claim=await claimFor(user2.cookie,taskId);
assert.equal(user2Claim.status,200,JSON.stringify(user2Claim));
const user3=await call('/api/auth/register','POST',{name:'Người dùng ba',email:'quota3@example.com',password:'test-password-2026',accept_terms:'yes'},'',otherIP,browserID);
assert.equal(user3.status,201,JSON.stringify(user3));
const blockedDevice=await call('/api/tasks/'+taskId+'/start','POST',{},user3.cookie,otherIP,browserID);
assert.equal(blockedDevice.status,429,JSON.stringify(blockedDevice));
assert.equal(blockedDevice.data.quota_scope,'device');
assert.equal((await call('/api/me','GET',undefined,user3.cookie,otherIP)).status,200,'Quota không khóa tài khoản');
// Tắt thiết bị để kiểm tra IP độc lập, kể cả khi mã trình duyệt khác.
assert.equal((await call('/api/admin/settings','PUT',{
 quota_device_accounts_daily:'0',quota_ip_accounts_daily:'2'
},admCookie)).status,200);
const differentBrowser='99999999-2222-4333-8444-555555555555';
const blockedIP=await call('/api/tasks/'+taskId+'/start','POST',{},user3.cookie,otherIP,differentBrowser);
assert.equal(blockedIP.status,429,JSON.stringify(blockedIP));
assert.equal(blockedIP.data.quota_scope,'ip');
// Tắt giới hạn IP và hạn chế mỗi tài khoản: tài khoản có 2 nhiệm vụ đã duyệt sẽ bị từ chối.
assert.equal((await call('/api/admin/settings','PUT',{
 quota_ip_accounts_daily:'0',quota_user_tasks_daily:'1'
},admCookie)).status,200);
const extraTask=await call('/api/admin/tasks','POST',{
 title:'Kiểm thử quota theo tài khoản',description:'Nhiệm vụ kiểm thử',
 category:'link',url:'https://example.com',reward:10,min_seconds:5,
 review_mode:'auto',repeat_policy:'once',is_active:true
},admCookie);
assert.equal(extraTask.status,201,JSON.stringify(extraTask));
const blockedAccount=await call('/api/tasks/'+extraTask.data.id+'/start','POST',{},cookie,otherIP,browserID);
assert.equal(blockedAccount.status,429,JSON.stringify(blockedAccount));
assert.equal(blockedAccount.data.quota_scope,'user');
// Quay về mặc định, không can thiệp dữ liệu ví.
assert.equal((await call('/api/admin/settings','PUT',{
 quota_user_tasks_daily:'25',quota_device_accounts_daily:'2',quota_ip_accounts_daily:'6',
 quota_link_ip_exclusive:'1',quota_link_tasks_ip_24h:'2'
},admCookie)).status,200);
const riskQuota=await call('/api/admin/risk-events','GET',undefined,admCookie);
assert.equal(riskQuota.status,200);
assert.ok(riskQuota.data.events.some(e=>e.event_type==='task_quota_denied'));

// === Mới: IP giữ cho tài khoản đầu tiên tham gia link trong đúng 24 giờ ===
const linkIp='198.51.100.210',user2Device='22222222-2222-4333-8444-555555555555',
 user3Device='33333333-2222-4333-8444-555555555555';
const linkA=await call('/api/admin/tasks','POST',{
 title:'Link A, quota IP',description:'Link thử A',category:'link',url:'https://example.com/link-a',
 reward:10,min_seconds:5,review_mode:'auto',repeat_policy:'once',is_active:true
},admCookie);
const linkB=await call('/api/admin/tasks','POST',{
 title:'Link B, quota IP',description:'Link thử B',category:'link',url:'https://example.com/link-b',
 reward:10,min_seconds:5,review_mode:'auto',repeat_policy:'once',is_active:true
},admCookie);
const linkC=await call('/api/admin/tasks','POST',{
 title:'Link C, quota IP',description:'Link thử C',category:'link',url:'https://example.com/link-c',
 reward:10,min_seconds:5,review_mode:'auto',repeat_policy:'once',is_active:true
},admCookie);
assert.equal(linkA.status,201);assert.equal(linkB.status,201);assert.equal(linkC.status,201);
assert.equal((await claimFor(user2.cookie,linkA.data.id,linkIp,user2Device)).status,200);
const wrongOwner=await call('/api/tasks/'+linkB.data.id+'/start','POST',{},user3.cookie,linkIp,user3Device);
assert.equal(wrongOwner.status,429,JSON.stringify(wrongOwner));
assert.equal(wrongOwner.data.quota_scope,'link_owner');
const listWrongOwner=await call('/api/tasks','GET',undefined,user3.cookie,linkIp,user3Device);
assert.equal(listWrongOwner.data.link_quota.blocked,'link_owner');
assert.equal(listWrongOwner.data.tasks.find(x=>x.id===linkB.data.id).link_blocked,'link_owner');
assert.equal((await call('/api/me','GET',undefined,user3.cookie,linkIp)).status,200,'Người dùng vẫn đăng nhập được');
assert.equal((await claimFor(user2.cookie,linkB.data.id,linkIp,user2Device)).status,200);
const exceeded2=await call('/api/tasks/'+linkC.data.id+'/start','POST',{},user2.cookie,linkIp,user2Device);
assert.equal(exceeded2.status,429,JSON.stringify(exceeded2));
assert.equal(exceeded2.data.quota_scope,'link_limit');
// Đúng 24 giờ: sau khi các lượt trên IP đều đã cũ, tài khoản thứ hai có thể thực hiện.
sqlite.prepare("UPDATE task_completions SET created_at=datetime('now','-25 hours') WHERE ip=?").run(linkIp);
assert.equal((await claimFor(user3.cookie,linkC.data.id,linkIp,user3Device)).status,200);
// Kiểm thử Admin đặt một nhiệm vụ link cho cùng tài khoản làm 2 lần trong 24 giờ.
assert.equal((await call('/api/admin/settings','PUT',{quota_link_tasks_ip_24h:'4'},admCookie)).status,200);
const twice=await call('/api/admin/tasks','POST',{
 title:'Link cho làm hai lượt',description:'Làm được 2 lượt trong 24 giờ',
 category:'link',url:'https://example.com/twice',reward:10,min_seconds:5,
 review_mode:'auto',repeat_policy:'once',is_active:true,link_24h_limit:2
},admCookie);
assert.equal(twice.status,201,JSON.stringify(twice));
const twiceIP='198.51.100.230';
assert.equal((await claimFor(user2.cookie,twice.data.id,twiceIP,user2Device)).status,200);
let oneOfTwo=await call('/api/tasks','GET',undefined,user2.cookie,twiceIP,user2Device);
assert.equal(oneOfTwo.data.tasks.find(x=>x.id===twice.data.id).link_24h_count,1);
assert.equal(oneOfTwo.data.tasks.find(x=>x.id===twice.data.id).my_status,null);
assert.equal((await claimFor(user2.cookie,twice.data.id,twiceIP,user2Device)).status,200);
const thirdOfTwo=await call('/api/tasks/'+twice.data.id+'/start','POST',{},user2.cookie,twiceIP,user2Device);
assert.equal(thirdOfTwo.status,429,JSON.stringify(thirdOfTwo));
assert.equal(thirdOfTwo.data.quota_scope,'link_task_limit');
// Giữ nguyên ví, chỉ đặt lại thời điểm thử nghiệm.
sqlite.prepare("UPDATE task_completions SET created_at=datetime('now','-25 hours') WHERE task_id=?").run(twice.data.id);
assert.equal((await claimFor(user2.cookie,twice.data.id,twiceIP,user2Device)).status,200);
assert.equal((await call('/api/admin/settings','PUT',{quota_link_tasks_ip_24h:'2'},admCookie)).status,200);
assert.equal((await call('/api/admin/settings','PUT',{quota_link_ip_exclusive:'8'},admCookie)).status,400);
// Nhiệm vụ khác loại không chịu giới hạn link IP.
const otherCategory=await call('/api/admin/tasks','POST',{
 title:'Nhiệm vụ khác loại',description:'Kiểm thử loại khác',category:'other',
 url:'',reward:1,min_seconds:5,review_mode:'auto',repeat_policy:'once',is_active:true
},admCookie);
assert.equal(otherCategory.status,201);
assert.equal((await claimFor(user2.cookie,otherCategory.data.id,linkIp,user2Device)).status,200);
const change=await call('/api/me/password','POST',{old_password:'user-password-2026',new_password:'My-new-2026-password'},cookie,'203.0.113.10');
assert.equal(change.status,200);
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).status,401);
const newLogin=await call('/api/auth/login','POST',{email:'user@example.com',password:'My-new-2026-password'},'','203.0.113.10');
assert.equal(newLogin.status,200);
assert.ok(newLogin.cookie);
await worker.scheduled({},env); // Xác nhận tác vụ dọn dẹp hoạt động trong mô phỏng.
console.log('PASS: link IP độc quyền 24h, giới hạn 2 lượt/IP, 2 lượt/nhiệm vụ, mở lại sau 24h, quota chống nhiều tài khoản/IP/trình duyệt, Admin cấu hình, tài khoản không bị khóa, admin setup một lần, thành viên, giới thiệu, CAPTCHA đổi câu hỏi, chờ thời gian, cộng Lúa một lần, điểm danh, giữ/hoàn Lúa, duyệt bằng chứng, chống duyệt trùng, phân quyền, lịch sử.');
