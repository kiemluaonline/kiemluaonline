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
assert.ok(a.available_at<=Date.now());
// Existing attempts created before removal of the timer must also work.
sqlite.prepare('UPDATE task_attempts SET available_at=? WHERE id=?').run(Date.now()+60000,a.attempt_id);
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
// STK không đúng: hiển thị trạng thái riêng cho khách, nhưng vẫn hoàn Lúa
// và giữ DB tương thích với schema đang chạy trên Cloudflare D1.
const invalidWd=await call('/api/withdrawals','POST',{
 amount:20,bank_name:'Ngan hang A',bank_account:'1234567890',bank_owner:'NGUYEN VAN A'
},cookie,'203.0.113.10');
assert.equal(invalidWd.status,200,JSON.stringify(invalidWd));
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,85);
const invalidAction=await call('/api/admin/withdrawals/'+invalidWd.data.id,'POST',{status:'invalid_account'},admCookie);
assert.equal(invalidAction.status,200,JSON.stringify(invalidAction));
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,105);
const invalidHistory=await call('/api/history','GET',undefined,cookie,'203.0.113.10');
const invalidRecord=invalidHistory.data.withdrawals.find(w=>w.id===invalidWd.data.id);
assert.equal(invalidRecord.status,'invalid_account');
assert.match(invalidRecord.admin_note,/Số tài khoản không đúng/);
assert.ok(!invalidRecord.admin_note.includes('[TL_INVALID_BANK_ACCOUNT]'));
const adminWrongAccount=await call('/api/admin/withdrawals','GET',undefined,admCookie);
assert.equal(adminWrongAccount.data.withdrawals.find(w=>w.id===invalidWd.data.id).status,'invalid_account');
assert.equal((await call('/api/admin/withdrawals/'+invalidWd.data.id,'POST',{status:'invalid_account'},admCookie)).status,409);
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,105);
const taskManual=await call('/api/admin/tasks','POST',{title:'Gửi minh chứng thủ công',description:'Gửi ảnh/bằng chứng dạng liên kết',category:'other',url:'',reward:30,min_seconds:5,review_mode:'manual',repeat_policy:'once',is_active:true},admCookie);
assert.equal(taskManual.status,201,JSON.stringify(taskManual));
const mid=taskManual.data.id;
const ms=await call(`/api/tasks/${mid}/start`,'POST',{},cookie,'203.0.113.10');
assert.ok(ms.data.available_at<=Date.now());
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
// General quotas apply to non-link categories only.
sqlite.prepare("UPDATE tasks SET category='other' WHERE id=?").run(taskId);
// Các test quota cũ kiểm tra riêng quy tắc thiết bị và IP theo ngày.
assert.equal((await call('/api/admin/settings','PUT',{
 quota_link_ip_exclusive:'0',quota_link_tasks_ip_24h:'0',
  quota_link_device_exclusive:'0',quota_link_tasks_device_24h:'0'
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
 category:'other',url:'https://example.com',reward:10,min_seconds:5,
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

sqlite.prepare("UPDATE tasks SET category='link' WHERE id=?").run(taskId);
// === Mới: IP giữ cho tài khoản đầu tiên tham gia link trong đúng ngày Việt Nam ===
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
assert.equal(exceeded2.status,200,JSON.stringify(exceeded2)); // No global cap after two links.
// Đúng ngày Việt Nam: sau khi các lượt trên IP đều đã cũ, tài khoản thứ hai có thể thực hiện.
sqlite.prepare("UPDATE task_completions SET created_at=datetime('now','-25 hours') WHERE ip=?").run(linkIp);
assert.equal((await claimFor(user3.cookie,linkC.data.id,linkIp,user3Device)).status,200);
// Hai điện thoại cùng một dải IPv6 /64 (host khác nhau) vẫn bị giới hạn cùng IP mạng.
const v6Task1=await call('/api/admin/tasks','POST',{
 title:'Kiểm tra IPv6 A',description:'Một thiết bị A dùng IPv6',
 category:'link',url:'https://example.com/ipv6-a',reward:10,min_seconds:5,
 review_mode:'auto',repeat_policy:'once',is_active:true
},admCookie);
const v6Task2=await call('/api/admin/tasks','POST',{
 title:'Kiểm tra IPv6 B',description:'Một thiết bị B dùng IPv6',
 category:'link',url:'https://example.com/ipv6-b',reward:10,min_seconds:5,
 review_mode:'auto',repeat_policy:'once',is_active:true
},admCookie);
assert.equal(v6Task1.status,201);assert.equal(v6Task2.status,201);
const v6IPa='2401:d800:f641:5dcd:b19f:6845:c9c4:af71';
const v6IPb='2401:d800:f641:5dcd:abcd:1234:5678:9abc';
assert.equal((await claimFor(user2.cookie,v6Task1.data.id,v6IPa,user2Device)).status,200);
const sharedV6=await call('/api/tasks/'+v6Task2.data.id+'/start','POST',{},user3.cookie,v6IPb,user3Device);
assert.equal(sharedV6.status,429,JSON.stringify(sharedV6));
assert.equal(sharedV6.data.quota_scope,'link_owner');
// Dải IPv6 /64 khác có thể bắt đầu lại, vẫn chịu các quota toàn hệ thống.
const differentV6='2401:d800:f641:5dce:abcd:1234:5678:9abc';
assert.equal((await claimFor(user3.cookie,v6Task2.data.id,differentV6,user3Device)).status,200);
// Khi đang chờ duyệt, một tài khoản khác dùng cùng IP tạm thời cũng không được gửi.
const pendingTask=await call('/api/admin/tasks','POST',{
 title:'Link cần duyệt thủ công',description:'Chờ Admin xét bằng chứng',
 category:'link',url:'https://example.com/manual-ip',reward:10,min_seconds:5,
 review_mode:'manual',repeat_policy:'once',is_active:true
},admCookie);
const pendingTask2=await call('/api/admin/tasks','POST',{
 title:'Link cho người khác',description:'Kiểm tra giữ chỗ khi chờ duyệt',
 category:'link',url:'https://example.com/after-pending',reward:10,min_seconds:5,
 review_mode:'auto',repeat_policy:'once',is_active:true
},admCookie);
assert.equal(pendingTask.status,201);assert.equal(pendingTask2.status,201);
const pendingIP='198.51.100.240';
const pendingStart=await call('/api/tasks/'+pendingTask.data.id+'/start','POST',{},user2.cookie,pendingIP,user2Device);
assert.equal(pendingStart.status,200);
sqlite.prepare('UPDATE task_attempts SET available_at=0 WHERE id=?').run(pendingStart.data.attempt_id);
const pendingSubmit=await call('/api/tasks/'+pendingTask.data.id+'/submit','POST',{
 attempt_id:pendingStart.data.attempt_id,answer:pendingStart.data.a+pendingStart.data.b,
 evidence:'Bằng chứng kiểm thử bằng liên kết https://example.com/test-pending'
},user2.cookie,pendingIP,user2Device);
assert.equal(pendingSubmit.status,200,JSON.stringify(pendingSubmit));
assert.equal(pendingSubmit.data.status,'pending');
const pendingBlocked=await call('/api/tasks/'+pendingTask2.data.id+'/start','POST',{},user3.cookie,pendingIP,user3Device);
assert.equal(pendingBlocked.status,429);
assert.equal(pendingBlocked.data.quota_scope,'link_owner');
const pendingRecord=sqlite.prepare('SELECT id FROM task_completions WHERE user_id=(SELECT user_id FROM task_completions WHERE task_id=? LIMIT 1) AND task_id=? ORDER BY created_at DESC LIMIT 1').get(pendingTask.data.id,pendingTask.data.id);
const rejection=await call('/api/admin/reviews/'+pendingRecord.id,'POST',{status:'rejected'},admCookie);
assert.equal(rejection.status,200);
assert.equal((await claimFor(user3.cookie,pendingTask2.data.id,pendingIP,user3Device)).status,200);
// Kiểm thử Admin đặt một nhiệm vụ link cho cùng tài khoản làm 2 lần trong ngày Việt Nam.
assert.equal((await call('/api/admin/settings','PUT',{quota_link_tasks_ip_24h:'4'},admCookie)).status,200);
const twice=await call('/api/admin/tasks','POST',{
 title:'Link cho làm hai lượt',description:'Làm được 2 lượt trong ngày Việt Nam',
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

 // Nhiệm vụ App dùng schema cũ, bắt buộc ảnh và Admin duyệt.
 const appBad=await call('/api/admin/tasks','POST',{title:'App thử tự động',category:'app',url:'https://example.com/app',app_referral_code:'REF123',reward:30,min_seconds:5,review_mode:'auto',repeat_policy:'once',is_active:true},admCookie);
 assert.equal(appBad.status,400);
 const appTask=await call('/api/admin/tasks','POST',{title:'App nhập mã',category:'app',url:'https://example.com/app',app_referral_code:'REF123',reward:30,min_seconds:5,review_mode:'manual',repeat_policy:'once',is_active:true},admCookie);
 assert.equal(appTask.status,201,JSON.stringify(appTask));
 const appTaskID=appTask.data.id, appIP='198.51.100.251';
 assert.equal(sqlite.prepare('SELECT category FROM tasks WHERE id=?').get(appTaskID).category,'other');
 const appList=await call('/api/tasks','GET',undefined,user2.cookie,appIP,user2Device);
 assert.equal(appList.data.tasks.find(t=>t.id===appTaskID).category,'app');
 assert.equal(appList.data.tasks.find(t=>t.id===appTaskID).app_referral_code,'REF123');
 const appStart=await call('/api/tasks/'+appTaskID+'/start','POST',{},user2.cookie,appIP,user2Device);
 assert.equal(appStart.status,200,JSON.stringify(appStart));
 assert.equal(appStart.data.category,'app');
 assert.ok(appStart.data.available_at<=Date.now());
 sqlite.prepare('UPDATE task_attempts SET available_at=? WHERE id=?').run(Date.now()+60000,appStart.data.attempt_id);
 const missingPhoto=await call('/api/tasks/'+appTaskID+'/submit','POST',{attempt_id:appStart.data.attempt_id,answer:appStart.data.a+appStart.data.b},user2.cookie,appIP,user2Device);
 assert.equal(missingPhoto.status,400);
 const jpg=Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(1300)]).toString('base64');
 const submitted=await call('/api/tasks/'+appTaskID+'/submit','POST',{attempt_id:appStart.data.attempt_id,answer:appStart.data.a+appStart.data.b,evidence:'Đã nhập mã REF123',photo:'data:image/jpeg;base64,'+jpg},user2.cookie,appIP,user2Device);
 assert.equal(submitted.status,200,JSON.stringify(submitted));
 assert.equal(submitted.data.status,'pending');
 const proofId=sqlite.prepare('SELECT id FROM task_completions WHERE task_id=?').get(appTaskID).id;
 const reviewList=await call('/api/admin/reviews','GET',undefined,admCookie);
 const proof=reviewList.data.reviews.find(r=>r.id===proofId);
 assert.equal(proof.has_photo,1);
 assert.equal(proof.evidence,'Đã nhập mã REF123');
 assert.ok(!JSON.stringify(reviewList.data).includes(jpg));
 assert.equal((await call('/api/admin/reviews/'+proofId+'/photo','GET',undefined,admCookie)).status,200);
 assert.equal((await call('/api/admin/reviews/'+proofId+'/photo','GET',undefined,user2.cookie)).status,403);
 assert.ok(!JSON.stringify((await call('/api/history','GET',undefined,user2.cookie)).data).includes(jpg));
 assert.equal((await call('/api/admin/reviews/'+proofId,'POST',{status:'approved'},admCookie)).status,200);
 assert.equal((await call('/api/admin/reviews/'+proofId,'POST',{status:'approved'},admCookie)).status,409);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE reference_id=? AND reference_type='task'").get(proofId).n,1);
 assert.equal((await call('/api/tasks/'+appTaskID+'/start','POST',{},user2.cookie,appIP,user2Device)).status,409);


 // Chống email tạm thời, biến thể Gmail và đăng ký trùng.
 const badMail=await call('/api/auth/register','POST',{name:'Thành viên thử',email:'try@yopmail.com',password:'test-password-2026',accept_terms:'yes'},'','192.0.2.101');
 assert.equal(badMail.status,400,JSON.stringify(badMail));
 const gmail1=await call('/api/auth/register','POST',{name:'Google cũ',email:'first.last@gmail.com',password:'test-password-2026',accept_terms:'yes'},'','192.0.2.102','a1111111-2222-4333-8444-555555555555');
 assert.equal(gmail1.status,201,JSON.stringify(gmail1));
 const gmailAlias=await call('/api/auth/register','POST',{name:'Bản sao Gmail',email:'firstlast+tag@googlemail.com',password:'test-password-2026',accept_terms:'yes'},'','192.0.2.103','a2222222-2222-4333-8444-555555555555');
 assert.equal(gmailAlias.status,409,JSON.stringify(gmailAlias));
 const gmailCode=sqlite.prepare("SELECT value FROM settings WHERE key LIKE 'gmail_claim:%' LIMIT 1").get();
 assert.ok(gmailCode,'Email Gmail gốc có khóa chống trùng.');

 // Mô phỏng chữ ký Google RS256 bằng khóa thử ngẫu nhiên; KHÔNG gọi mạng trong kiểm thử.
 env.GOOGLE_CLIENT_ID='google-test-client.apps.googleusercontent.com';
 env.GOOGLE_CLIENT_SECRET='google-test-secret';
 env.GOOGLE_REDIRECT_URI=origin+'/api/auth/google/callback';
 const {publicKey,privateKey}=await crypto.subtle.generateKey({
  name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
 },true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',publicKey),kid:'test-google-key',alg:'RS256',use:'sig'};
 const encode64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
 async function mockJwt(nonce,email,sub,verified=true){
   const header=encode64({alg:'RS256',typ:'JWT',kid:'test-google-key'});
   const payload=encode64({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,
     exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),
     nonce,email,email_verified:verified,name:'Thành viên Google',sub});
   const signed=new TextEncoder().encode(header+'.'+payload);
   const signature=await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},privateKey,signed);
   return header+'.'+payload+'.'+Buffer.from(signature).toString('base64url');
 }
 let googleMock={nonce:'',email:'google.member@gmail.com',sub:'google-id-123456789'};
 const priorFetch=globalThis.fetch;
 globalThis.fetch=async function(url){
  const address=String(url);
  if(address==='https://oauth2.googleapis.com/token')
   return new Response(JSON.stringify({id_token:await mockJwt(googleMock.nonce,googleMock.email,googleMock.sub,googleMock.verified!==false)}),{status:200,headers:{'Content-Type':'application/json'}});
  if(address==='https://www.googleapis.com/oauth2/v3/certs')
   return new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'Content-Type':'application/json'}});
  throw new Error('Ngoài danh sách máy chủ Google thử nghiệm: '+address);
 };
 async function googleFlow(intent,email,sub,existingCookie='',ip='192.0.2.150'){
  const device='b1111111-2222-4333-8444-555555555555';
  const startGoogle=await call('/api/auth/google/start','POST',{intent,...(intent==='register'?{accept_terms:'yes'}:{})},existingCookie,ip,device);
  assert.equal(startGoogle.status,200,JSON.stringify(startGoogle));
  const googleUrl=new URL(startGoogle.data.url);
  assert.equal(googleUrl.hostname,'accounts.google.com');
  googleMock={nonce:googleUrl.searchParams.get('nonce'),email,sub,verified:true};
  const cookie=[startGoogle.cookie,existingCookie].filter(Boolean).join('; ');
  const callback=new Request(origin+'/api/auth/google/callback?state='+encodeURIComponent(googleUrl.searchParams.get('state'))+'&code=test-real-length-code',{
   headers:{Cookie:cookie,'CF-Connecting-IP':ip,'X-TL-Device':device}
  });
  const response=await worker.fetch(callback,env);
  return {response,redirect:response.headers.get('Location'),cookies:response.headers.getSetCookie()};
 }
 assert.equal((await call('/api/meta')).data.google_auth_enabled,true);
 const gmailPasswordDenied=await call('/api/auth/register','POST',{name:'Gmail mới',email:'brand.new@gmail.com',password:'test-password-2026',accept_terms:'yes'},'','192.0.2.105');
 assert.equal(gmailPasswordDenied.status,400);
 const createdGoogle=await googleFlow('register','google.member@gmail.com','google-id-123456789','','192.0.2.150');
 assert.equal(createdGoogle.response.status,303);
 assert.equal(createdGoogle.redirect,'/');
 const googleSession=createdGoogle.cookies.find(x=>x.startsWith('kl_session='));
 assert.ok(googleSession,'Google tạo cookie đăng nhập thật, không dựa vào giao diện.');
 const googleCookieValue=googleSession.split(';')[0];
 const googleMe=await call('/api/me','GET',undefined,googleCookieValue,'192.0.2.150');
 assert.equal(googleMe.status,200,JSON.stringify(googleMe));
 assert.equal(googleMe.data.user.email,'google.member@gmail.com');
 assert.equal(googleMe.data.google_linked,true);
 const reLogin=await googleFlow('login','google.member@gmail.com','google-id-123456789','','192.0.2.150');
 assert.equal(reLogin.response.status,303);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users WHERE email=?').get('google.member@gmail.com').n,1);
 const noAutoMerge=await googleFlow('register','firstlast@gmail.com','google-id-987654321','','192.0.2.151');
 assert.equal(noAutoMerge.redirect,'/?google_error=email_exists');
 const legacyLink=await googleFlow('link','firstlast@gmail.com','google-id-987654321',gmail1.cookie,'192.0.2.151');
 assert.equal(legacyLink.response.status,303);
 assert.equal(legacyLink.redirect,'/');
 const linked=await call('/api/me','GET',undefined,gmail1.cookie,'192.0.2.102');
 assert.equal(linked.data.google_linked,true);
 const linkedLogin=await googleFlow('login','firstlast@gmail.com','google-id-987654321','','192.0.2.151');
 assert.equal(linkedLogin.redirect,'/');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM users WHERE email IN ('first.last@gmail.com','firstlast@gmail.com')").get().n,1);
 const expiredFlow=await worker.fetch(new Request(origin+'/api/auth/google/callback?state=bad&code=anythinglong'),env);
 assert.equal(expiredFlow.headers.get('Location'),'/?google_error=expired');
 globalThis.fetch=priorFetch;

await worker.scheduled({},env); // Xác nhận tác vụ dọn dẹp hoạt động trong mô phỏng.
console.log('PASS: link IP theo ngày Việt Nam, bỏ tổng 2 lượt/IP, giữ lượt riêng từng nhiệm vụ, quota chống nhiều tài khoản/IP/trình duyệt, Admin cấu hình, tài khoản không bị khóa, admin setup một lần, thành viên, giới thiệu, CAPTCHA đổi câu hỏi, chờ thời gian, cộng Lúa một lần, điểm danh, giữ/hoàn Lúa, duyệt bằng chứng, chống duyệt trùng, phân quyền, lịch sử.');

// Video continues to enforce its configured wait on the server.
const videoTask=await call('/api/admin/tasks','POST',{title:'Video giữ thời gian',category:'video',url:'https://example.com/video',reward:1,min_seconds:60,review_mode:'auto',repeat_policy:'once',is_active:true},admCookie);
assert.equal(videoTask.status,201,JSON.stringify(videoTask));
const videoStart=await call(`/api/tasks/${videoTask.data.id}/start`,'POST',{},admCookie,'198.51.100.252','a1111111-2222-4333-8444-555555555555');
assert.equal(videoStart.status,200,JSON.stringify(videoStart));
const va=videoStart.data;
assert.ok(va.available_at>Date.now());
const videoEarly=await call(`/api/tasks/${videoTask.data.id}/submit`,'POST',{attempt_id:va.attempt_id,answer:va.a+va.b},admCookie,'198.51.100.252','a1111111-2222-4333-8444-555555555555');
assert.equal(videoEarly.status,425,JSON.stringify(videoEarly));
sqlite.prepare('UPDATE task_attempts SET available_at=0 WHERE id=?').run(va.attempt_id);
const videoDone=await call(`/api/tasks/${videoTask.data.id}/submit`,'POST',{attempt_id:va.attempt_id,answer:va.a+va.b},admCookie,'198.51.100.252','a1111111-2222-4333-8444-555555555555');
assert.equal(videoDone.status,200,JSON.stringify(videoDone));
console.log('PASS: App/Link/Other submit without wait, legacy attempts accepted, Video wait enforced.');

// Daily link ownership: two accounts, different devices, shared network; no total cap.
const sharedIP='203.0.113.240';
const phone1='f1111111-2222-4333-8444-555555555555',phone2='f2222222-2222-4333-8444-555555555555';
const firstPhone=await call('/api/auth/register','POST',{name:'Phone One',email:'phoneone@example.com',password:'test-password-2026',accept_terms:'yes'},'',sharedIP,phone1);
const secondPhone=await call('/api/auth/register','POST',{name:'Phone Two',email:'phonetwo@example.com',password:'test-password-2026',accept_terms:'yes'},'',sharedIP,phone2);
assert.equal(firstPhone.status,201);assert.equal(secondPhone.status,201);
await call('/api/admin/settings','PUT',{quota_user_tasks_daily:'1',quota_device_accounts_daily:'1',quota_ip_accounts_daily:'1',quota_link_ip_exclusive:'1',quota_link_device_exclusive:'1',quota_link_tasks_ip_24h:'2',quota_link_tasks_device_24h:'2'},admCookie);
const effectiveSettings=await call('/api/admin/settings','GET',undefined,admCookie);
assert.equal(effectiveSettings.data.settings.quota_link_tasks_ip_24h,'0','Ignore retired saved total caps');
assert.equal(effectiveSettings.data.settings.quota_link_tasks_device_24h,'0');
const ten=[];
for(let i=0;i<10;i++){
 const t=await call('/api/admin/tasks','POST',{title:'Shared network task '+i,category:'link',url:'https://example.com/'+i,reward:1,review_mode:'auto',repeat_policy:'daily',link_24h_limit:i===0?2:1,is_active:true},admCookie);
 assert.equal(t.status,201);ten.push(t.data.id);
}
// Both can open before anyone submits; the claim must recheck ownership.
const preopened=await call('/api/tasks/'+ten[0]+'/start','POST',{},secondPhone.cookie,sharedIP,phone2);
assert.equal(preopened.status,200);
assert.equal((await claimFor(firstPhone.cookie,ten[0],sharedIP,phone1)).status,200);
const staleClaim=await call('/api/tasks/'+ten[0]+'/submit','POST',{attempt_id:preopened.data.attempt_id,answer:preopened.data.a+preopened.data.b},secondPhone.cookie,sharedIP,phone2);
assert.equal(staleClaim.status,429);
assert.equal(staleClaim.data.quota_scope,'link_owner');
assert.equal((await call('/api/me','GET',undefined,secondPhone.cookie,sharedIP,phone2)).data.balance,0);
for(const task of ten){
 const blocked=await call('/api/tasks/'+task+'/start','POST',{},secondPhone.cookie,sharedIP,phone2);
 assert.equal(blocked.status,429);assert.equal(blocked.data.quota_scope,'link_owner');
 assert.ok(blocked.data.error.startsWith('Bạn đã làm hết nhiệm vụ hôm nay.'));
}
// First owner can use remaining per-task allowance and all nine other links.
assert.equal((await claimFor(firstPhone.cookie,ten[0],sharedIP,phone1)).status,200);
assert.equal((await claimFor(firstPhone.cookie,ten[0],sharedIP,phone1)).data.quota_scope,'link_task_limit');
for(const task of ten.slice(1))assert.equal((await claimFor(firstPhone.cookie,task,sharedIP,phone1)).status,200);
assert.equal((await call('/api/me','GET',undefined,firstPhone.cookie,sharedIP,phone1)).data.balance,11);
const sameDeviceNewIP=await call('/api/tasks/'+ten[1]+'/start','POST',{},secondPhone.cookie,'203.0.113.241',phone1);
assert.equal(sameDeviceNewIP.status,429);assert.equal(sameDeviceNewIP.data.quota_scope,'link_browser_owner');
const warnings=await call('/api/admin/risk-events','GET',undefined,admCookie);
assert.ok(warnings.data.link_alert_count>=12);
assert.ok(warnings.data.link_alerts.some(r=>r.email==='phonetwo@example.com'&&r.owner_email==='phoneone@example.com'&&r.task_title==='Shared network task 0'));
assert.equal((await call('/api/admin/risk-events','GET',undefined,secondPhone.cookie,sharedIP,phone2)).status,403);
const blockedList=await call('/api/tasks','GET',undefined,secondPhone.cookie,sharedIP,phone2);
assert.equal(blockedList.data.link_quota.reset_at_hour,0);
assert.ok(ten.every(id=>blockedList.data.tasks.find(t=>t.id===id).link_blocked==='link_owner'));
// Previous VN day, even if less than 24 hours ago: ownership and daily counts reset.
const firstUserId=sqlite.prepare('SELECT id FROM users WHERE email=?').get('phoneone@example.com').id;
sqlite.prepare("UPDATE task_completions SET created_at=datetime('now','+7 hours','start of day','-7 hours','-1 second') WHERE user_id=?").run(firstUserId);
assert.equal((await claimFor(secondPhone.cookie,ten[0],sharedIP,phone2)).status,200);
const nextDayList=await call('/api/tasks','GET',undefined,secondPhone.cookie,sharedIP,phone2);
assert.equal(nextDayList.data.tasks.find(t=>t.id===ten[0]).link_24h_count,1);
console.log('PASS: 10 links allowed for first owner; second account blocked on shared IP; remaining per-task slots protected; changed IP/same device blocked; midnight reset; named Admin alerts; Admin-only access.');

const passive=await call('/api/tasks','GET',undefined,firstPhone.cookie,sharedIP,phone1);
assert.equal(passive.data.link_quota.blocked,'link_owner');
const countPassive=()=>sqlite.prepare("SELECT COUNT(*) n FROM risk_events WHERE user_id=? AND detail='link_owner:list'").get(firstUserId).n;
assert.equal(countPassive(),1);
await call('/api/tasks','GET',undefined,firstPhone.cookie,sharedIP,phone1);
assert.equal(countPassive(),1,'Refresh does not duplicate daily shared-IP warning');
console.log('PASS: passive shared-IP warning appears when listing tasks, deduplicated per day.');
