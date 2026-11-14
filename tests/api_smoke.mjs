// Test không dùng internet: mô phỏng D1 bằng SQLite gốc của Node 22.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url),'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0006_payout_accounts.sql', import.meta.url),'utf8'));
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
let payoutFixtureSerial=0;
function adjustPayoutTestWallet(userId,delta){
 if(!Number.isSafeInteger(delta)||delta===0)throw new Error('Invalid test credit/debit');
 const key='tiered-payout-fixture-'+(++payoutFixtureSerial);
 sqlite.prepare('INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id) VALUES(?,?,?,?,?,?)')
   .run(key,userId,delta,'Test-only payout funding','test_fixture',key);
}
async function call(path,method='GET',body, cookie='',ip='192.0.2.15',device='11111111-2222-4333-8444-555555555555'){
 const headers={'CF-Connecting-IP':ip,'User-Agent':'Test-Browser/1.0','X-TL-Device':device};
 if(body!==undefined){headers['Content-Type']='application/json';headers['Origin']=origin;headers['X-Tram-Lua']='1';}
 if(cookie)headers['Cookie']=cookie;
 const r=await worker.fetch(new Request(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
 let data;try{data=await r.json();}catch{data={};}
 return {status:r.status, data, cookie:r.headers.get('Set-Cookie')?.split(';')[0]||''};
}
// Trang chủ mới là HTML công khai (Google đọc được ngay cả trước khi chạy JS).
const publicHomepage=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const frontendForWelcome=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
assert.match(publicHomepage,/<title>Trạm Có Lúa/);
assert.match(publicHomepage,/<meta name="description"/);
assert.match(publicHomepage,/rel="canonical" href="https:\/\/nhiemvu\.click\/"/);
assert.match(publicHomepage,/<main>/);
assert.match(publicHomepage,/data-action="open-auth" data-auth-mode="register"/);
assert.match(publicHomepage,/data-action="open-auth" data-auth-mode="login"/);
assert.match(publicHomepage,/href="\/terms\.html"/);
assert.match(publicHomepage,/href="\/privacy\.html"/);
assert.match(publicHomepage,/<section id="nhiem-vu"/);
assert.match(frontendForWelcome,/const publicHomeHTML = app\.innerHTML;/);
assert.match(frontendForWelcome,/function renderHome\(\)/);
assert.match(frontendForWelcome,/if\(act==='open-auth'\)/);
assert.match(frontendForWelcome,/if\(act==='back-home'\)/);
assert.match(frontendForWelcome,/data-action="back-home"/);
const brandMeta=await call('/api/meta');
assert.equal(brandMeta.status,200);
assert.equal(brandMeta.data.site_name,'Trạm Có Lúa');
sqlite.prepare("UPDATE settings SET value='Trạm Lúa' WHERE key='site_name'").run();
const migratedBrandMeta=await call('/api/meta');
assert.equal(migratedBrandMeta.data.site_name,'Trạm Có Lúa',
 'Existing D1 old brand must render the new name automatically');
sqlite.prepare("UPDATE settings SET value='Trạm Có Lúa' WHERE key='site_name'").run();
console.log('PASS: public crawlable landing page, auth navigation hooks, legal links, new brand and legacy D1 name compatibility.');

const oldRiceLogoHtml=/class="brand-mark"[^>]*>🌾|class="welcome-logo-icon"[^>]*>🌾|class="hero-icon"[^>]*>🌾/;
assert.ok(!oldRiceLogoHtml.test(publicHomepage),'Public homepage must not use the old emoji as logo.');
assert.ok(!oldRiceLogoHtml.test(frontendForWelcome),'Member dashboard and auth screens must not use old emoji as brand logo.');
assert.match(frontendForWelcome,/class="hero-icon brand-hero-logo"><img src="\/logo\.svg"/);
assert.match(publicHomepage,/class="welcome-art-label"><img src="\/logo\.svg"/);
for(const legalDoc of ['privacy.html','terms.html']){
 const html=readFileSync(new URL('../public/'+legalDoc,import.meta.url),'utf8');
 assert.match(html,/class="legal-brand"[^>]*><img src="\/logo\.svg"/);
 assert.match(html,/rel="icon" type="image\/svg\+xml" href="\/logo\.svg"/);
}
assert.match(frontendForWelcome,/id="topBalance">🌾/,'Reward balance should keep its grain symbol.');
console.log('PASS: new logo across public, member dashboard, auth, legal and site favicon; Lúa symbols retained for rewards.');
// Lus Hmoob / Tiếng Việt: chuyển trực tiếp trên cùng website, không chạm API.
const translator=readFileSync(new URL('../public/i18n.js',import.meta.url),'utf8');
assert.match(publicHomepage,/data-language="vi"/);
assert.match(publicHomepage,/data-language="hmn"/);
assert.match(publicHomepage,/\/i18n\.js/);
assert.match(frontendForWelcome,/function languageSwitcher\(\)|const languageSwitcher =/);
for(const legalDoc of ['privacy.html','terms.html']){
 const html=readFileSync(new URL('../public/'+legalDoc,import.meta.url),'utf8');
 assert.match(html,/data-language="hmn"/);
 assert.match(html,/\/i18n\.js/);
}
assert.match(translator,/tramco-lua\.language\.v1/);
assert.match(translator,/MutationObserver/);
const {runInNewContext:runLocaleScript}=await import('node:vm');
let selectedVi=null,selectedHm=null;
function langButton(language){
 const info={};
 const el={dataset:{language},nodeType:1,classList:{toggle(name,yes){info[name]=yes;}},
  setAttribute(name,value){info[name]=value;}};
 el.info=info;return el;
}
selectedVi=langButton('vi');selectedHm=langButton('hmn');
const textNode={nodeType:3,nodeValue:'Đăng nhập',parentElement:{closest(){return null;}}};
const mockBody={nodeType:1,hasAttribute(){return false;},querySelectorAll(sel){
 return sel==='[data-language]'?[selectedVi,selectedHm]:[];
}};
const mockDoc={readyState:'complete',body:mockBody,documentElement:{lang:'vi'},
 addEventListener(){},dispatchEvent(){},createTreeWalker(){let done=false;return{nextNode(){
  if(done)return null;done=true;return textNode;
 }};}};
const stored=new Map();
const browserContext={
 document:mockDoc,window:{},NodeFilter:{SHOW_TEXT:4},
 localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
 CustomEvent:class{constructor(name,init){this.name=name;this.detail=init.detail;}},
 MutationObserver:class{observe(){}}
};
runLocaleScript(translator,browserContext);
assert.equal(textNode.nodeValue,'Đăng nhập');
browserContext.window.TramI18n.setLanguage('hmn');
assert.equal(textNode.nodeValue,'Nkag mus');
assert.equal(mockDoc.documentElement.lang,'hmn');
assert.equal(stored.get('tramco-lua.language.v1'),'hmn');
assert.equal(selectedHm.info['aria-pressed'],'true');
browserContext.window.TramI18n.setLanguage('vi');
assert.equal(textNode.nodeValue,'Đăng nhập');
assert.equal(mockDoc.documentElement.lang,'vi');
assert.equal(selectedVi.info['aria-pressed'],'true');
console.log('PASS: Hmoob/Vietnamese toggle translates text both ways, remembers choice, keeps same URL and has legal-page controls.');



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

const chosenUsername='luaxanh2026';
const newSignup=await call('/api/auth/register','POST',{
 username:chosenUsername,email:'luaxanh2026@example.com',password:'A1234567',accept_terms:'yes'
},'','198.51.100.211','abcddddd-2222-4333-8444-555555555555');
assert.equal(newSignup.status,201,JSON.stringify(newSignup));
assert.equal(sqlite.prepare("SELECT name FROM users WHERE email=?").get('luaxanh2026@example.com').name,chosenUsername);
assert.equal(sqlite.prepare('SELECT value FROM settings WHERE key=?')
 .get('login_username:'+chosenUsername).value,
 sqlite.prepare("SELECT id FROM users WHERE email=?").get('luaxanh2026@example.com').id);
const unameLogin=await call('/api/auth/login','POST',{
 email:'LuaXanh2026',password:'A1234567'
},'','198.51.100.212');
assert.equal(unameLogin.status,200,JSON.stringify(unameLogin));
const emailForUnameLogin=await call('/api/auth/login','POST',{
 email:'luaxanh2026@example.com',password:'A1234567'
},'','198.51.100.213');
assert.equal(emailForUnameLogin.status,200,JSON.stringify(emailForUnameLogin));
const unameWrongPassword=await call('/api/auth/login','POST',{
 email:chosenUsername,password:'wrong-password'
},'','198.51.100.214');
assert.equal(unameWrongPassword.status,401);
const unameDuplicate=await call('/api/auth/register','POST',{
 username:chosenUsername,email:'another-username@example.com',password:'A1234567',accept_terms:'yes'
},'','198.51.100.215');
assert.equal(unameDuplicate.status,409,JSON.stringify(unameDuplicate));
const unameInvalid=await call('/api/auth/register','POST',{
 username:'ten_co_dau',email:'invalid-username@example.com',password:'A1234567',accept_terms:'yes'
},'','198.51.100.216');
assert.equal(unameInvalid.status,400);
const tooShortPassword=await call('/api/auth/register','POST',{
 username:'luamoi2026',email:'short-password@example.com',password:'1234567',accept_terms:'yes'
},'','198.51.100.217');
assert.equal(tooShortPassword.status,400);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE email='short-password@example.com'").get().n,0);
const newBrandClient=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const svgBrand=readFileSync(new URL('../public/logo.svg',import.meta.url),'utf8');
assert.match(newBrandClient,/authField\('username','Tên đăng nhập','4–20 ký tự, a-z, 0-9'/);
assert.match(newBrandClient,/authField\('email','Email','you@example\.com'/);
assert.match(newBrandClient,/authField\('password','Mật khẩu','Ít nhất 8 ký tự'/);
assert.match(newBrandClient,/Ví dụ: A1B2C3D4E5 \(10 ký tự\)/);
assert.match(newBrandClient,/if\(act==='toggle-password'\)/);
assert.match(newBrandClient,/data-action="google-register"/);
assert.match(publicHomepage,/href="\/logo\.svg"/);
assert.match(svgBrand,/<svg/);
assert.match(svgBrand,/Biểu tượng Trạm Có Lúa/);
console.log('PASS: distinct real usernames, email/username sign-in, 8+ password validation, dark auth placeholders and new vector logo.');

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
// Khi khách có IPv4 công khai qua dịch vụ bên ngoài, lưu là báo cáo riêng,
// không ghi đè IP thật do Cloudflare quan sát và không dùng làm điều kiện khóa.
const realIPv6='2401:d800:26c9:8e5d:39ba:4b48:aafa:1745';
const observed=await call('/api/me/ipv4-report','POST',{ip:'125.235.15.67'},cookie,realIPv6);
assert.equal(observed.status,200,JSON.stringify(observed));
assert.equal(observed.data.verified_by_cloudflare,false);
const observedAgain=await call('/api/me/ipv4-report','POST',{ip:'125.235.15.67'},cookie,realIPv6);
assert.equal(observedAgain.status,200);
assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM risk_events WHERE user_id=? AND event_type='browser_ipv4_report'").get(userMe.data.user.id).n,1);
assert.equal((await call('/api/me/ipv4-report','POST',{ip:'241.175.137.167'},cookie,realIPv6)).status,400);
assert.equal((await call('/api/me/ipv4-report','POST',{ip:'125.235.15.68'},cookie,'125.235.15.67')).status,409);
const realV4=await call('/api/me/ipv4-report','POST',{ip:'125.235.15.67'},cookie,'125.235.15.67');
assert.equal(realV4.status,200);
assert.equal(realV4.data.verified_by_cloudflare,true);
const observedUsers=await call('/api/admin/users','GET',undefined,admCookie);
assert.equal(observedUsers.data.users.find(x=>x.id===userMe.data.user.id).ipv4_observation.observed_ipv4,'125.235.15.67');
const observedRisks=await call('/api/admin/risk-events','GET',undefined,admCookie);
assert.ok(observedRisks.data.ipv4_observations.some(x=>x.observed_ipv4==='125.235.15.67'&&x.cloudflare_ip===realIPv6));

 // Kiểm tra frontend thu thập IPv4 tự động ngay cả khi KHÔNG mở trang Nhiệm vụ.
 // Giả lập trình duyệt, không yêu cầu kết nối tới dịch vụ IP thật.
 const frontendSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(frontendSource,/setTimeout\(\(\)=>captureMemberIPv4\(\)\.catch\(\(\)=>\{\}\),0\)/,
   'loadMe must trigger optional background IPv4 collection for members with IPv6.');
 const captureStart=frontendSource.indexOf('const IPV4_AUTO_STORAGE_KEY=');
 const captureEnd=frontendSource.indexOf('function updateIPv4Diagnostics(',captureStart);
 assert.ok(captureStart>0&&captureEnd>captureStart);
 const {runInNewContext}=await import('node:vm');
 const browserStore=new Map(),captureRequests=[];
 const memberState={me:{user:{id:'member-1',role:'member'},ip:realIPv6}};
 const fakeBrowser={
   state:memberState,
   sessionStorage:{
     getItem:key=>browserStore.get(key)||null,
     setItem:(key,value)=>browserStore.set(key,String(value))
   },
   resolvePublicIPv4:async()=> '125.235.15.67',
   api:async(...args)=>{captureRequests.push(args);return {ok:true};}
 };
 const captureAuto=runInNewContext(frontendSource.slice(captureStart,captureEnd)
   +'\n captureMemberIPv4',fakeBrowser);
 await captureAuto();
 assert.equal(captureRequests.length,1);
 assert.equal(captureRequests[0][0],'/api/me/ipv4-report');
 assert.equal(captureRequests[0][1],'POST');
 assert.equal(captureRequests[0][2].ip,'125.235.15.67');
 await captureAuto();
 assert.equal(captureRequests.length,1,'Do not query IPv4 services repeatedly for unchanged member IP.');
 memberState.me.ip='2401:d800:26c9:8e5d:39ba:4b48:aafa:1746';
 await captureAuto();
 assert.equal(captureRequests.length,2,'A changed IPv6 network should be checked again.');
 memberState.me.user.role='admin';
 await captureAuto();
 assert.equal(captureRequests.length,2,'Do not send automatic IPv4 reports for the Admin.');
 console.log('PASS: frontend captures genuine IPv4 on member sign-in over IPv6, caches checks, retries on different IP and skips Admin.');


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
// Fund only the isolated SQLite fixture, preserving earlier small-balance assertions.
adjustPayoutTestWallet(userMe.data.user.id,69960);
const w1=await call('/api/withdrawals','POST',{amount:50000,expected_fee_lua:20000,bank_name:'Ngan hang A',bank_account:'1234567890',bank_owner:'NGUYEN VAN A'},cookie,'203.0.113.10');
assert.equal(w1.status,200,JSON.stringify(w1));
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,65);
assert.equal((await call('/api/withdrawals','POST',{amount:80,bank_name:'Ngan hang A',bank_account:'1234567890',bank_owner:'NGUYEN VAN A'},cookie,'203.0.113.10')).status,400);
const reject=await call(`/api/admin/withdrawals/${w1.data.id}`,'POST',{status:'rejected',admin_note:'Tai khoan chua xac minh'},admCookie);
assert.equal(reject.status,200,JSON.stringify(reject));
adjustPayoutTestWallet(userMe.data.user.id,-69960);
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,105);
// STK không đúng: hiển thị trạng thái riêng cho khách, nhưng vẫn hoàn Lúa
// và giữ DB tương thích với schema đang chạy trên Cloudflare D1.
adjustPayoutTestWallet(userMe.data.user.id,69980);
const invalidWd=await call('/api/withdrawals','POST',{
 amount:50000,expected_fee_lua:20000,bank_name:'Ngan hang A',bank_account:'1234567890',bank_owner:'NGUYEN VAN A'
},cookie,'203.0.113.10');
assert.equal(invalidWd.status,200,JSON.stringify(invalidWd));
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,85);
const invalidAction=await call('/api/admin/withdrawals/'+invalidWd.data.id,'POST',{status:'invalid_account'},admCookie);
assert.equal(invalidAction.status,200,JSON.stringify(invalidAction));
adjustPayoutTestWallet(userMe.data.user.id,-69980);
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
// Chỉ duyệt trước khi thanh toán; thử bỏ qua bước duyệt phải bị từ chối.
adjustPayoutTestWallet(userMe.data.user.id,69980);
const w2=await call('/api/withdrawals','POST',{
 amount:50000,expected_fee_lua:20000,payment_method:'bank',bank_name:'Vietcombank',
 bank_account:'1234567890',bank_owner:'NGUYEN VAN A'
},cookie,'203.0.113.10');
assert.equal(w2.status,200);
assert.equal((await call('/api/admin/withdrawals/'+w2.data.id,'POST',{status:'paid',admin_note:'Giao dich da doi chieu'},admCookie)).status,409);
assert.equal((await call('/api/admin/withdrawals/'+w2.data.id,'POST',{status:'approved'},admCookie)).status,200);
assert.equal((await call('/api/admin/withdrawals/'+w2.data.id,'POST',{status:'approved'},admCookie)).status,409);
const approvedWithdrawal=(await call('/api/history','GET',undefined,cookie)).data.withdrawals.find(w=>w.id===w2.data.id);
assert.equal(approvedWithdrawal.status,'approved');
assert.equal(approvedWithdrawal.payment_method,'bank');
assert.ok(approvedWithdrawal.admin_note.includes('chờ thanh toán'));
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,115);
assert.equal((await call('/api/admin/withdrawals/'+w2.data.id,'POST',{status:'paid'},admCookie)).status,400);
assert.equal((await call('/api/admin/withdrawals/'+w2.data.id,'POST',{status:'paid',admin_note:'Giao dich da doi chieu'},admCookie)).status,200);
assert.equal((await call('/api/admin/withdrawals/'+w2.data.id,'POST',{status:'paid',admin_note:'Trung lap'},admCookie)).status,409);
const paidWithdrawal=(await call('/api/history','GET',undefined,cookie)).data.withdrawals.find(w=>w.id===w2.data.id);
assert.equal(paidWithdrawal.status,'paid');
assert.equal((await call('/api/me','GET',undefined,cookie,'203.0.113.10')).data.balance,115);
const dashboard=await call('/api/task-dashboard','GET',undefined,cookie,'203.0.113.10');
assert.equal(dashboard.status,200);
assert.equal(dashboard.data.latest_payment.vnd_amount,5000);
assert.equal(dashboard.data.latest_payment.masked_account,'12******90');
assert.equal(dashboard.data.latest_payment.bank_account,undefined);
assert.ok(dashboard.data.link_lua>=100);
// Chỉ rút qua ngân hàng (BVBank cũng hỗ trợ số tài khoản có chữ).
// Form cũ và API giả mạo phương thức ZaloPay phải bị từ chối, không trừ ví.
const invalidZaloPhone=await call('/api/withdrawals','POST',{
 amount:10,payment_method:'zalopay',zalopay_phone:'123',zalopay_owner:'NGUYEN VAN A'
},cookie);
assert.equal(invalidZaloPhone.status,400);
const blockedWallet=await call('/api/withdrawals','POST',{
 amount:50000,payment_method:'zalopay',zalopay_phone:'0912345678',zalopay_owner:'NGUYEN VAN A',expected_fee_lua:20000
},cookie);
assert.equal(blockedWallet.status,400);
assert.equal((await call('/api/payout-accounts','POST',{
 payment_method:'zalopay',account_number:'0912345678',account_owner:'NGUYEN VAN A'
},cookie)).status,400);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,115);

// D1 có thể còn giao dịch Ví ZaloPay đã tạo ở phiên bản cũ.
// Chèn bản ghi *chỉ trong cơ sở dữ liệu test* để kiểm tra Admin và lịch sử cũ.
const legacyUser=userMe.data.user.id;
function addLegacyWalletWithdrawal(wid,holdId){
 sqlite.prepare(`INSERT INTO withdrawals
  (id,user_id,amount,vnd_amount,rate_lua_per_vnd,bank_name,bank_account,bank_owner)
  VALUES (?,?,?,?,?,?,?,?)`).run(wid,legacyUser,10,1,10,'ZaloPay','0912345678','NGUYEN VAN A');
 sqlite.prepare(`INSERT INTO wallet_entries
  (id,user_id,amount,reason,reference_type,reference_id)
  VALUES (?,?,?,?,?,?)`).run(holdId,legacyUser,-10,'Giữ Lúa rút cũ','withdraw_hold',wid);
}
const oldWalletID='00000000-0000-4000-8000-0000000000aa';
addLegacyWalletWithdrawal(oldWalletID,'00000000-0000-4000-8000-0000000000ba');
const oldWalletAdmin=(await call('/api/admin/withdrawals','GET',undefined,admCookie)).data.withdrawals.find(w=>w.id===oldWalletID);
assert.equal(oldWalletAdmin.payment_method,'zalopay');
assert.equal(oldWalletAdmin.bank_name,'ZaloPay');
assert.equal(oldWalletAdmin.bank_account,'0912345678');
assert.equal((await call('/api/admin/withdrawals/'+oldWalletID,'POST',{status:'approved'},admCookie)).status,200);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,105);
assert.equal((await call('/api/admin/withdrawals/'+oldWalletID,'POST',{status:'invalid_account'},admCookie)).status,200);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,115);
assert.equal((await call('/api/admin/withdrawals/'+oldWalletID,'POST',{status:'invalid_account'},admCookie)).status,409);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,115);

const oldPaidID='00000000-0000-4000-8000-0000000000ab';
addLegacyWalletWithdrawal(oldPaidID,'00000000-0000-4000-8000-0000000000bb');
assert.equal((await call('/api/admin/withdrawals/'+oldPaidID,'POST',{status:'approved'},admCookie)).status,200);
assert.equal((await call('/api/admin/withdrawals/'+oldPaidID,'POST',{status:'paid',admin_note:'GD ZaloPay cu da doi chieu'},admCookie)).status,200);
const legacyPaid=(await call('/api/history','GET',undefined,cookie)).data.withdrawals.find(w=>w.id===oldPaidID);
assert.equal(legacyPaid.status,'paid');
assert.equal(legacyPaid.payment_method,'zalopay');
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,105);
console.log('PASS: new ZaloPay withdrawals and wallet saving blocked; old ZaloPay D1 history/admin approve, pay and refund preserved.'); 
// Biểu phí rút mới tự động theo VND; không phụ thuộc phí rút cố định cũ.
assert.equal((await call('/api/admin/settings','PUT',{withdrawal_fee_lua:'3',card_fee_lua:'7'},admCookie)).status,200);
const feeMeta=await call('/api/meta');
assert.equal(feeMeta.data.withdrawal_fee_lua,0,'Legacy fixed withdrawal fee is not used');
assert.equal(feeMeta.data.withdrawal_fee_vnd,2000);
assert.equal(feeMeta.data.withdrawal_free_from_vnd,25000);
assert.equal(feeMeta.data.withdrawal_min_vnd,5000);
assert.equal((await call('/api/admin/settings','GET',undefined,admCookie)).data.settings.card_fee_lua,'7');
const feeBefore=(await call('/api/me','GET',undefined,cookie)).data.balance;

// Dưới 5.000đ không cho rút, kể cả khi đủ Lúa.
const tooSmall=await call('/api/withdrawals','POST',{
 amount:49990,expected_fee_lua:20000,payment_method:'bank',bank_name:'Vietcombank',
 bank_account:'1234567890',bank_owner:'NGUYEN VAN A'
},cookie);
assert.equal(tooSmall.status,400);
const blockedOldBrowser=await call('/api/withdrawals','POST',{
 amount:50000,payment_method:'bank',bank_name:'Vietcombank',
 bank_account:'1234567890',bank_owner:'NGUYEN VAN A'
},cookie);
assert.equal(blockedOldBrowser.status,409,'Old Safari form cannot bypass a newly required 2,000đ fee');
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,feeBefore);
adjustPayoutTestWallet(userMe.data.user.id,70000);
const withFee=await call('/api/withdrawals','POST',{
 amount:50000,expected_fee_lua:20000,payment_method:'bank',bank_name:'Vietcombank',
 bank_account:'1234567890',bank_owner:'NGUYEN VAN A'
},cookie);
assert.equal(withFee.status,200,JSON.stringify(withFee));
assert.equal(withFee.data.amount_lua,50000);
assert.equal(withFee.data.fee_lua,20000);
assert.equal(withFee.data.total_lua,70000);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,feeBefore);
const feeHistory=(await call('/api/history','GET',undefined,cookie)).data.withdrawals.find(x=>x.id===withFee.data.id);
assert.equal(feeHistory.fee_lua,20000);
assert.equal(feeHistory.vnd_amount,5000,'Fee does not reduce actual transfer amount');
assert.equal((await call('/api/admin/withdrawals','GET',undefined,admCookie)).data.withdrawals.find(x=>x.id===withFee.data.id).fee_lua,20000);

// Admin setting for old fixed fee no longer affects any new request or old held fee.
assert.equal((await call('/api/admin/settings','PUT',{withdrawal_fee_lua:'99999'},admCookie)).status,200);
assert.equal((await call('/api/history','GET',undefined,cookie)).data.withdrawals.find(x=>x.id===withFee.data.id).fee_lua,20000);
assert.equal((await call('/api/admin/withdrawals/'+withFee.data.id,'POST',{status:'rejected',admin_note:'Kiểm thử hoàn số Lúa đầy đủ'},admCookie)).status,200);
adjustPayoutTestWallet(userMe.data.user.id,-70000);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,feeBefore);
assert.equal((await call('/api/admin/withdrawals/'+withFee.data.id,'POST',{status:'rejected',admin_note:'Trùng lặp'},admCookie)).status,409);

// 24.999đ vẫn thu đúng 2.000đ, 25.000đ miễn hoàn toàn.
adjustPayoutTestWallet(userMe.data.user.id,269990);
const almostFree=await call('/api/withdrawals','POST',{
 amount:249990,expected_fee_lua:20000,payment_method:'bank',bank_name:'BVBank',
 bank_account:'99ZP123456',bank_owner:'NGUYEN VAN A'
},cookie);
assert.equal(almostFree.status,200,JSON.stringify(almostFree));
assert.equal(almostFree.data.fee_lua,20000);
assert.equal(almostFree.data.total_lua,269990);
assert.equal((await call('/api/admin/withdrawals/'+almostFree.data.id,'POST',{status:'rejected',admin_note:'Kiểm thử biên 24.999đ'},admCookie)).status,200);
adjustPayoutTestWallet(userMe.data.user.id,-269990);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,feeBefore);
adjustPayoutTestWallet(userMe.data.user.id,250000);
const freeWd=await call('/api/withdrawals','POST',{
 amount:250000,expected_fee_lua:0,payment_method:'bank',bank_name:'BIDV',
 bank_account:'1234567890',bank_owner:'NGUYEN VAN A'
},cookie);
assert.equal(freeWd.status,200,JSON.stringify(freeWd));
assert.equal(freeWd.data.fee_lua,0);
assert.equal(freeWd.data.total_lua,250000);
assert.equal((await call('/api/admin/withdrawals/'+freeWd.data.id,'POST',{status:'rejected',admin_note:'Kiểm thử miễn phí 25.000đ'},admCookie)).status,200);
adjustPayoutTestWallet(userMe.data.user.id,-250000);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,feeBefore);

// STK sai sau khi Admin duyệt vẫn hoàn một lần cả tiền rút lẫn phí.
adjustPayoutTestWallet(userMe.data.user.id,70000);
const feeInvalid=await call('/api/withdrawals','POST',{
 amount:50000,expected_fee_lua:20000,payment_method:'bank',bank_name:'BVBank',
 bank_account:'99ZP123456',bank_owner:'NGUYEN VAN A'
},cookie);
assert.equal(feeInvalid.status,200,JSON.stringify(feeInvalid));
assert.equal(feeInvalid.data.total_lua,70000);
assert.equal((await call('/api/admin/withdrawals/'+feeInvalid.data.id,'POST',{status:'approved'},admCookie)).status,200);
assert.equal((await call('/api/admin/withdrawals/'+feeInvalid.data.id,'POST',{status:'invalid_account'},admCookie)).status,200);
adjustPayoutTestWallet(userMe.data.user.id,-70000);
assert.equal((await call('/api/me','GET',undefined,cookie)).data.balance,feeBefore);
assert.equal((await call('/api/admin/settings','PUT',{card_fee_lua:'0'},admCookie)).status,200);
console.log('PASS: 5,000–24,999 VND costs 2,000 VND; 25,000+ is free; legacy fees ignored, refused/invalid requests refund exact held Lua.');
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
 // Chỉ Admin được xóa ảnh và bằng chứng đã xử lý; không được xóa khi chưa duyệt.
 const memberDeletion=await call('/api/admin/reviews/'+proofId+'/erase-evidence','POST',{confirm:'DELETE_EVIDENCE'},user2.cookie);
 assert.equal(memberDeletion.status,403);
 const missingDeleteConfirm=await call('/api/admin/reviews/'+proofId+'/erase-evidence','POST',{},admCookie);
 assert.equal(missingDeleteConfirm.status,400);
 const deleteProof=await call('/api/admin/reviews/'+proofId+'/erase-evidence','POST',{confirm:'DELETE_EVIDENCE'},admCookie);
 assert.equal(deleteProof.status,200,JSON.stringify(deleteProof));
 const proofRowAfter=sqlite.prepare('SELECT status,reward,evidence FROM task_completions WHERE id=?').get(proofId);
 assert.equal(proofRowAfter.status,'approved');
 assert.equal(proofRowAfter.reward,30);
 assert.equal(proofRowAfter.evidence,'EVIDENCE_REMOVED_V1');
 assert.equal((await call('/api/admin/reviews/'+proofId+'/photo','GET',undefined,admCookie)).status,404);
 const reviewsAfterDelete=await call('/api/admin/reviews','GET',undefined,admCookie);
 const sanitizedRecord=reviewsAfterDelete.data.reviews.find(c=>c.id===proofId);
 assert.equal(sanitizedRecord.has_photo,0);
 assert.equal(sanitizedRecord.has_evidence,0);
 assert.equal(sanitizedRecord.evidence_removed,1);
 assert.equal(sanitizedRecord.evidence,'');
 assert.equal((await call('/api/admin/reviews/'+proofId+'/erase-evidence','POST',{confirm:'DELETE_EVIDENCE'},admCookie)).status,409);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE reference_id=? AND reference_type='task'").get(proofId).n,1);
 const waitingProof=sqlite.prepare("SELECT id FROM task_completions WHERE status='pending' AND evidence <> '' LIMIT 1").get();
 if(waitingProof){
  assert.equal((await call('/api/admin/reviews/'+waitingProof.id+'/erase-evidence','POST',{confirm:'DELETE_EVIDENCE'},admCookie)).status,409);
  assert.notEqual(sqlite.prepare('SELECT evidence FROM task_completions WHERE id=?').get(waitingProof.id).evidence,'EVIDENCE_REMOVED_V1');
 }
 const pendingBeforeCleanup=sqlite.prepare("SELECT COUNT(*) n FROM task_completions WHERE status='pending'").get().n;
 const approvedBalanceBeforeCleanup=(await call('/api/me','GET',undefined,user2.cookie,appIP,user2Device)).data.balance;
 const trackedTables=['users','tasks','task_completions','wallet_entries','withdrawals'];
 const rowCountsBefore=Object.fromEntries(trackedTables.map(t=>[t,sqlite.prepare('SELECT COUNT(*) AS n FROM '+t).get().n]));
 const beforeCleanup=sqlite.prepare("SELECT COUNT(*) n FROM task_completions WHERE status IN ('approved','rejected') AND evidence NOT IN ('','EVIDENCE_REMOVED_V1')").get().n;
 assert.ok(beforeCleanup>=1);
 const serverPreview=await call('/api/admin/reviews','GET',undefined,admCookie);
 assert.equal(serverPreview.data.processed_evidence_count,beforeCleanup);
 assert.equal((await call('/api/admin/reviews/erase-processed','POST',{confirm:'wrong',expected_count:beforeCleanup},admCookie)).status,400);
 assert.equal((await call('/api/admin/reviews/erase-processed','POST',{confirm:'DELETE_REVIEWED_EVIDENCE'},user2.cookie)).status,403);
 assert.equal((await call('/api/admin/reviews/erase-processed','POST',{confirm:'DELETE_REVIEWED_EVIDENCE'},admCookie)).status,400,'The server must reject missing count confirmation.');
 assert.equal((await call('/api/admin/reviews/erase-processed','POST',{confirm:'DELETE_REVIEWED_EVIDENCE',expected_count:beforeCleanup+1},admCookie)).status,409,'Wrong/stale count must never delete proofs.');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM task_completions WHERE status IN ('approved','rejected') AND evidence NOT IN ('','EVIDENCE_REMOVED_V1')").get().n,beforeCleanup,'Failed confirmations must not delete evidence.');
 const bulkDeletion=await call('/api/admin/reviews/erase-processed','POST',{confirm:'DELETE_REVIEWED_EVIDENCE',expected_count:beforeCleanup},admCookie);
 assert.equal(bulkDeletion.status,200,JSON.stringify(bulkDeletion));
 assert.equal(bulkDeletion.data.deleted,beforeCleanup);
 assert.deepEqual(Object.fromEntries(trackedTables.map(t=>[t,sqlite.prepare('SELECT COUNT(*) AS n FROM '+t).get().n])),rowCountsBefore,'Proof cleanup must not remove accounts, tasks, completion history, balances or withdrawal records.');
 assert.equal((await call('/api/admin/reviews','GET',undefined,admCookie)).data.processed_evidence_count,0);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM task_completions WHERE status='pending'").get().n,pendingBeforeCleanup);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM task_completions WHERE status IN ('approved','rejected') AND evidence NOT IN ('','EVIDENCE_REMOVED_V1')").get().n,0);
 assert.equal((await call('/api/me','GET',undefined,user2.cookie,appIP,user2Device)).data.balance,approvedBalanceBeforeCleanup);
 assert.equal((await call('/api/tasks/'+appTaskID+'/start','POST',{},user2.cookie,appIP,user2Device)).status,409);
 console.log('PASS: admin-only individual/bulk proof deletion, pending protection, unchanged Lúa ledger and lost-proof 404.');


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

// ==== Cảnh báo IP thật và trạng thái tài khoản tạm khóa/chi trả ====
const networkMembers=[];
for(let i=0;i<5;i++){
 const member=await call('/api/auth/register','POST',{
   name:'Network Member '+i,email:'network-member-'+i+'@example.com',
   password:'network-test-password-2026',accept_terms:'yes'
 },'','198.51.100.'+(31+i),'c0000000-2222-4333-8444-00000000000'+i);
 assert.equal(member.status,201,JSON.stringify(member));
 const device='c0000000-2222-4333-8444-00000000000'+i;
 assert.equal((await call('/api/me','GET',undefined,member.cookie,'203.0.113.199',device)).status,200);
 assert.equal((await call('/api/me','GET',undefined,member.cookie,
   '2401:d800:26c9:8e5d:1234:5678:abcd:000'+(i+1),device)).status,200);
 assert.equal((await call('/api/me/ipv4-report','POST',{ip:'125.235.15.67'},member.cookie,
   '2401:d800:26c9:8e5d:1234:5678:abcd:000'+(i+1),device)).status,200);
 networkMembers.push({...member,device,id:sqlite.prepare('SELECT id FROM users WHERE email=?').get('network-member-'+i+'@example.com').id});
}
const groupedWarnings=await call('/api/admin/risk-events','GET',undefined,admCookie);
assert.equal(groupedWarnings.status,200);
const groups=groupedWarnings.data.network_alerts;
assert.ok(groups.some(g=>g.ip_type==='IPv4'&&g.source==='cloudflare'&&g.address==='203.0.113.199'
 &&g.account_count>=5&&g.severity==='serious'),JSON.stringify(groups));
assert.ok(groups.some(g=>g.ip_type==='IPv6 /64'&&g.source==='cloudflare'
 &&g.address==='2401:d800:26c9:8e5d::/64'&&g.account_count>=5&&g.severity==='serious'),JSON.stringify(groups));
assert.ok(groups.some(g=>g.ip_type==='IPv4'&&g.source==='browser'
 &&g.address==='125.235.15.67'&&g.severity==='review'),'Browser-supplied IPv4 cannot be treated as a serious verified finding by itself.');

const ipv6Alerts=groups.find(g=>g.ip_type==='IPv6 /64'&&g.source==='cloudflare'&&g.address==='2401:d800:26c9:8e5d::/64');
assert.ok(ipv6Alerts,'IPv6 /64 warning must exist');
assert.ok(ipv6Alerts.related_ipv4.some(x=>x.ip==='125.235.15.67'&&x.account_count>=5&&x.source==='browser'),
 'IPv6 alert should display actual correlated browser-reported IPv4, never synthetic IPv4');
assert.ok(groupedWarnings.data.ipv4_inventory.some(x=>x.ip==='125.235.15.67'&&x.source==='browser'&&x.account_count>=5),
 'IPv4 inventory includes browser observed real IPv4 even if Cloudflare connects by IPv6');
const soloRealIPv4='8.8.4.4';
assert.equal((await call('/api/me','GET',undefined,networkMembers[2].cookie,soloRealIPv4,networkMembers[2].device)).status,200);
const soloList=await call('/api/admin/risk-events','GET',undefined,admCookie);
assert.ok(soloList.data.ipv4_inventory.some(x=>x.ip===soloRealIPv4&&x.source==='cloudflare'&&x.account_count===1),
 'IPv4 list must include even an address used by only one member');
assert.ok(!soloList.data.network_alerts.some(x=>x.address===soloRealIPv4),
 'One account IP should not be misreported as duplicate-network warning');
console.log('PASS: matched true browser IPv4 visible inside IPv6 group, individual real IPv4 shown separately, no invented IPv4.');

// Tài khoản bị khóa không tự mất Lúa và yêu cầu rút không tự bị từ chối.
const heldMember=networkMembers[0];
sqlite.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
 VALUES(?,?,30,'Test reward','smoke','hold-member')`).run('hold-reward-2026',heldMember.id);
await call('/api/admin/settings','PUT',{withdrawals_enabled:'1',lua_per_vnd:'10',min_withdraw_lua:'10'},admCookie);
const heldWithdrawal=await call('/api/withdrawals','POST',{
 amount:20,payment_method:'bank',bank_name:'BIDV',
 bank_account:'1234567890',bank_owner:'NETWORK MEMBER'
},heldMember.cookie);
assert.equal(heldWithdrawal.status,200,JSON.stringify(heldWithdrawal));
assert.equal((await call('/api/me','GET',undefined,heldMember.cookie)).data.balance,10);
const hold=await call('/api/admin/users/'+heldMember.id,'PATCH',{
 status:'suspended',suspension_reason:'Tài khoản đang được kiểm tra thông tin và đối chiếu giao dịch.'
},admCookie);
assert.equal(hold.status,200,JSON.stringify(hold));
const lockedStatus=await call('/api/account-status','GET',undefined,heldMember.cookie);
assert.equal(lockedStatus.status,200,JSON.stringify(lockedStatus));
assert.equal(lockedStatus.data.account_status,'suspended');
assert.equal(lockedStatus.data.pending_withdrawals,1);
assert.match(lockedStatus.data.reason,/đối chiếu giao dịch/);
assert.equal(lockedStatus.data.withdrawals[0].status,'pending');
assert.equal((await call('/api/me','GET',undefined,heldMember.cookie)).status,403);
const verifiedLockedLogin=await call('/api/auth/login','POST',{
 email:'network-member-0@example.com',password:'network-test-password-2026'
});
assert.equal(verifiedLockedLogin.status,403);
assert.equal(verifiedLockedLogin.data.account_status,'suspended');
assert.equal(verifiedLockedLogin.data.pending_withdrawals,1);
assert.equal((await call('/api/withdrawals','POST',{
 amount:10,payment_method:'bank',bank_name:'BIDV',
 bank_account:'1234567890',bank_owner:'NETWORK MEMBER'
},heldMember.cookie)).status,403);
assert.equal((await call('/api/admin/withdrawals/'+heldWithdrawal.data.id,'POST',
 {status:'approved'},admCookie)).status,409);
assert.equal((await call('/api/admin/withdrawals/'+heldWithdrawal.data.id,'POST',
 {status:'paid',admin_note:'No proof of payment'},admCookie)).status,409);
const adminHeld=await call('/api/admin/withdrawals','GET',undefined,admCookie);
assert.equal(adminHeld.data.withdrawals.find(w=>w.id===heldWithdrawal.data.id).account_status,'suspended');
assert.equal(sqlite.prepare('SELECT status FROM withdrawals WHERE id=?').get(heldWithdrawal.data.id).status,'pending');
assert.equal(sqlite.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM wallet_entries WHERE user_id=?").get(heldMember.id).n,10);
assert.equal((await call('/api/admin/users/'+heldMember.id,'PATCH',{status:'active'},admCookie)).status,200);
assert.equal((await call('/api/account-status','GET',undefined,heldMember.cookie)).data.account_status,'active');
assert.equal((await call('/api/admin/withdrawals/'+heldWithdrawal.data.id,'POST',{status:'approved'},admCookie)).status,200);
assert.equal((await call('/api/admin/withdrawals/'+heldWithdrawal.data.id,'POST',{
 status:'paid',admin_note:'Paid and verified by administrator'
},admCookie)).status,200);
assert.equal((await call('/api/me','GET',undefined,heldMember.cookie)).data.balance,10);
console.log('PASS: IPv4 and IPv6 /64 severity alerts, unverified IPv4 limited, suspended status, unpaid withdrawals held, reactivation restores payout flow.');

// Hai quyết định Admin được lưu riêng: xác minh / vi phạm nghiêm trọng.
const stageMember=networkMembers[1];
const stageReview=await call('/api/admin/users/'+stageMember.id,'PATCH',{
 status:'suspended',suspension_type:'review',
 suspension_reason:'Hoạt động bất thường cần kiểm tra trước khi kết luận.'
},admCookie);
assert.equal(stageReview.status,200,JSON.stringify(stageReview));
assert.equal(stageReview.data.suspension_type,'review');
const reviewCustomer=await call('/api/account-status','GET',undefined,stageMember.cookie);
assert.equal(reviewCustomer.data.suspension_type,'review');
assert.equal(reviewCustomer.data.account_status,'suspended');
const invalidSerious=await call('/api/admin/users/'+stageMember.id,'PATCH',{
 status:'suspended',suspension_type:'confirmed',
 suspension_reason:'Vi phạm nghiêm trọng quy định chống gian lận.'
},admCookie);
assert.equal(invalidSerious.status,400,'Cannot permanently ban without specific confirmed evidence.');
const invalidEvidence=await call('/api/admin/users/'+stageMember.id,'PATCH',{
 status:'suspended',suspension_type:'confirmed',
 suspension_reason:'Vi phạm nghiêm trọng quy định chống gian lận.',
 suspension_evidence:'trùng IP'
},admCookie);
assert.equal(invalidEvidence.status,400,'Shared IP by itself is not verified evidence.');
const serious=await call('/api/admin/users/'+stageMember.id,'PATCH',{
 status:'suspended',suspension_type:'confirmed',
 suspension_reason:'Tài khoản vi phạm nghiêm trọng điều khoản chương trình.',
 suspension_evidence:'Đã đối chiếu bằng chứng nhiệm vụ trùng nhau và kết quả kiểm tra giao dịch.'
},admCookie);
assert.equal(serious.status,200,JSON.stringify(serious));
assert.equal(serious.data.suspension_type,'confirmed');
const seriousCustomer=await call('/api/account-status','GET',undefined,stageMember.cookie);
assert.equal(seriousCustomer.data.suspension_type,'confirmed');
assert.equal(seriousCustomer.data.account_status,'suspended');
assert.equal(seriousCustomer.data.suspension_evidence,undefined,'Private Admin evidence never disclosed to members.');
const seriousLogin=await call('/api/auth/login','POST',{
 email:'network-member-1@example.com',password:'network-test-password-2026'
});
assert.equal(seriousLogin.status,403);
assert.equal(seriousLogin.data.suspension_type,'confirmed');
const holdsAdmin=await call('/api/admin/users','GET',undefined,admCookie);
const rowSerious=holdsAdmin.data.users.find(x=>x.id===stageMember.id);
assert.equal(rowSerious.suspension_type,'confirmed');
assert.match(rowSerious.suspension_evidence,/bằng chứng nhiệm vụ/);
assert.equal((await call('/api/admin/users/'+stageMember.id,'PATCH',{status:'active'},admCookie)).status,200);
const reviewCleared=await call('/api/admin/users','GET',undefined,admCookie);
assert.equal(reviewCleared.data.users.find(x=>x.id===stageMember.id).suspension_type,null);
assert.equal(reviewCleared.data.users.find(x=>x.id===stageMember.id).suspension_evidence,'');
assert.equal((await call('/api/account-status','GET',undefined,stageMember.cookie)).data.account_status,'active');
console.log('PASS: Admin chooses review or confirmed fraud lock, evidence is required and private, member sees selected type, unlock removes decision.');

// Anti-Fraud 2.0: nhiều tín hiệu độc lập, không tự khóa hay tự tịch thu Lúa.
const antiA=networkMembers[3],antiB=networkMembers[4];
const antiBrowser='e7777777-2222-4333-8444-555555555555';
for(const member of [antiA,antiB]){
 const seen=await call('/api/me','GET',undefined,member.cookie,'203.0.113.200',antiBrowser);
 assert.equal(seen.status,200,JSON.stringify(seen));
}
for(const [n,member] of [antiA,antiB].entries()){
 sqlite.prepare(`INSERT INTO withdrawals
   (id,user_id,amount,vnd_amount,rate_lua_per_vnd,bank_name,bank_account,bank_owner,status)
   VALUES(?,?,20,2,10,'BIDV','908070605040','TEST HOLDER','paid')`)
  .run('antifraud-historical-'+n,member.id);
}
const riskView=await call('/api/admin/fraud-scores','GET',undefined,admCookie);
assert.equal(riskView.status,200,JSON.stringify(riskView));
assert.equal(riskView.data.audit_only,true);
const antiProfile=riskView.data.profiles.find(x=>x.user_id===antiA.id);
assert.ok(antiProfile,JSON.stringify(riskView.data));
assert.ok(antiProfile.score>=80&&antiProfile.score<=100,JSON.stringify(antiProfile));
assert.equal(antiProfile.level,'serious');
assert.ok(antiProfile.reasons.some(x=>x.includes('nhận tiền')));
assert.ok(antiProfile.reasons.some(x=>x.includes('mã trình duyệt')));
assert.equal((await call('/api/admin/fraud-scores','GET',undefined,antiA.cookie)).status,403);
const activeAnti=await call('/api/me','GET',undefined,antiA.cookie,'203.0.113.200',antiBrowser);
assert.equal(activeAnti.status,200,'Scoring does not auto-suspend a customer');
sqlite.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
 VALUES(?,?,100,'Mock task reward','smoke','antifraud-funds')`).run('antifraud-funds-entry',antiA.id);
const antiWD=await call('/api/withdrawals','POST',{
 amount:20,payment_method:'bank',bank_name:'BIDV',
 bank_account:'908070605040',bank_owner:'TEST HOLDER'
},antiA.cookie,'203.0.113.200',antiBrowser);
assert.equal(antiWD.status,200,JSON.stringify(antiWD));
const antiBlocked=await call('/api/admin/withdrawals/'+antiWD.data.id,'POST',{status:'approved'},admCookie);
assert.equal(antiBlocked.status,409,JSON.stringify(antiBlocked));
assert.equal(antiBlocked.data.requires_risk_override,true);
assert.ok(antiBlocked.data.risk_score>=80);
const antiShortOverride=await call('/api/admin/withdrawals/'+antiWD.data.id,'POST',{
 status:'approved',risk_override_note:'đã kiểm tra'
},admCookie);
assert.equal(antiShortOverride.status,409);
assert.equal(sqlite.prepare('SELECT status FROM withdrawals WHERE id=?').get(antiWD.data.id).status,'pending');
const antiApproved=await call('/api/admin/withdrawals/'+antiWD.data.id,'POST',{
 status:'approved',risk_override_note:'Admin đã đối chiếu bằng chứng và xác minh đây là giao dịch hợp lệ.'
},admCookie);
assert.equal(antiApproved.status,200,JSON.stringify(antiApproved));
const antiPaidBlocked=await call('/api/admin/withdrawals/'+antiWD.data.id,'POST',{
 status:'paid',admin_note:'Test successful bank transfer'
},admCookie);
assert.equal(antiPaidBlocked.status,409);
const antiPaid=await call('/api/admin/withdrawals/'+antiWD.data.id,'POST',{
 status:'paid',admin_note:'Test successful bank transfer',
 risk_override_note:'Admin đã kiểm tra độc lập nguồn thưởng và tài khoản nhận tiền.'
},admCookie);
assert.equal(antiPaid.status,200,JSON.stringify(antiPaid));
const overrideEvents=await call('/api/admin/risk-events','GET',undefined,admCookie);
assert.ok(overrideEvents.data.events.some(e=>e.event_type==='fraud_payout_override'&&e.detail.includes(antiWD.data.id)));
assert.equal(sqlite.prepare('SELECT status FROM withdrawals WHERE id=?').get(antiWD.data.id).status,'paid');
console.log('PASS: free anti-fraud score independent signals, safe member access, guarded withdrawals, verified Admin override and auditable payments.');

// Cảnh báo theo từng tài khoản: chung IP có nhiều mã trình duyệt và
// chung mã trình duyệt có nhiều tài khoản. Không đồng nhất mã với IMEI.
const publicIPForTest='125.235.15.67';
const otherBrowser='f8888888-2222-4333-8444-555555555555';
const browserA=await call('/api/me','GET',undefined,antiA.cookie,publicIPForTest,antiBrowser);
const browserB=await call('/api/me','GET',undefined,antiB.cookie,publicIPForTest,antiBrowser);
const browserC=await call('/api/me','GET',undefined,networkMembers[2].cookie,publicIPForTest,otherBrowser);
assert.equal(browserA.status,200);assert.equal(browserB.status,200);assert.equal(browserC.status,200);
assert.equal(browserA.data.device_code,browserB.data.device_code,'Same browser ID yields same server identifier');
assert.notEqual(browserA.data.device_code,browserC.data.device_code,'Different browser IDs yield different identifiers');
const accountRiskList=await call('/api/admin/fraud-scores','GET',undefined,admCookie);
assert.equal(accountRiskList.status,200,JSON.stringify(accountRiskList));
assert.equal(accountRiskList.data.rules_version,'d1-multi-signal-v2');
const pA=accountRiskList.data.profiles.find(x=>x.user_id===antiA.id);
assert.ok(pA,'Each registered member must be shown, not only accounts score >= 25');
assert.ok(pA.ip_count>=1&&pA.device_count>=1,JSON.stringify(pA));
assert.ok(pA.shared_device_accounts>=1,'Several member accounts share one browser identifier');
assert.ok(pA.shared_ip_accounts>=2,'Different members share public IPv4 in observed sessions');
assert.ok(pA.max_devices_same_ip>=2,'An IP can be used by distinct browser identifiers');
assert.ok(pA.related_accounts.some(x=>x.user_id===antiB.id&&x.reasons.includes('Chung mã trình duyệt')));
assert.ok(pA.related_accounts.some(x=>x.user_id===networkMembers[2].id&&x.reasons.includes('Chung IP/dải mạng')));
const deviceShared=accountRiskList.data.shared_browsers.find(x=>x.device_code===browserA.data.device_code);
assert.ok(deviceShared&&deviceShared.account_count>=2,JSON.stringify(accountRiskList.data.shared_browsers));
const ipDevices=accountRiskList.data.shared_networks.find(x=>x.ip_type==='IPv4'&&x.address===publicIPForTest);
assert.ok(ipDevices&&ipDevices.device_count>=2&&ipDevices.account_count>=3,JSON.stringify(accountRiskList.data.shared_networks));
assert.ok(accountRiskList.data.shared_networks.some(x=>x.ip_type==='IPv6 /64'&&x.device_count>=2),
 'IPv6 /64 groups should list distinct browser identifiers without inventing IPv4');
const perMember=await call('/api/admin/fraud-account/'+antiA.id,'GET',undefined,admCookie);
assert.equal(perMember.status,200,JSON.stringify(perMember));
assert.equal(perMember.data.profile.user_id,antiA.id);
assert.equal(perMember.data.profile.shared_device_accounts,pA.shared_device_accounts);
assert.ok(perMember.data.profile.networks.some(x=>x.address===publicIPForTest));
assert.ok(perMember.data.profile.browsers.some(x=>x.device_code===browserA.data.device_code));
assert.equal((await call('/api/admin/fraud-account/'+antiA.id,'GET',undefined,antiA.cookie)).status,403,
 'Individual fraud details must only be available to Admin');
assert.equal((await call('/api/admin/fraud-account/nonexistent-id','GET',undefined,admCookie)).status,404);
const stillActive=await call('/api/me','GET',undefined,networkMembers[2].cookie,publicIPForTest,otherBrowser);
assert.equal(stillActive.status,200,'Shared Wi-Fi never automatically suspends a member');
console.log('PASS: per-member fraud statistics, shared IPv4 or IPv6 devices, multiple accounts per browser and Admin-only detailed drilldown.');





 // Lưu ngân hàng mới; ví ZaloPay đã lưu từ bản cũ chỉ được giữ làm lịch sử, không mở yêu cầu mới.
assert.equal((await call('/api/payout-accounts')).status,401);
const emptyPayout=await call('/api/payout-accounts','GET',undefined,newLogin.cookie);
assert.equal(emptyPayout.status,200);
assert.deepEqual(emptyPayout.data.accounts,[]);
const ownBank=await call('/api/payout-accounts','POST',{
 payment_method:'bank',bank_name:'BVBank',account_number:'99ZP987654321',
 account_owner:'ZALOPAY TEST USER',nickname:'Tài khoản BVBank',is_default:true
},newLogin.cookie);
assert.equal(ownBank.status,201,JSON.stringify(ownBank));
const bankId=ownBank.data.id;
const duplicate=await call('/api/payout-accounts','POST',{
 payment_method:'bank',bank_name:'BVBank',account_number:'99ZP987654321',account_owner:'ZALOPAY TEST USER'
},newLogin.cookie);
assert.equal(duplicate.status,409);
const ownBank2=await call('/api/payout-accounts','POST',{
 payment_method:'bank',bank_name:'Vietcombank',account_number:'1234567890',
 account_owner:'TEST ACCOUNT OWNER',nickname:'Ngân hàng dự phòng'
},newLogin.cookie);
assert.equal(ownBank2.status,201);
const bank2id=ownBank2.data.id;
const blockedZaloSave=await call('/api/payout-accounts','POST',{
 payment_method:'zalopay',account_number:'0912345678',
 account_owner:'TEST WALLET OWNER',nickname:'Ví ZaloPay'
},newLogin.cookie);
assert.equal(blockedZaloSave.status,400,'Cannot save a new direct wallet account');
// Simulate an existing ZaloPay saved recipient from an older D1 schema record.
const oldSavedId='00000000-0000-4000-8000-0000000000cc';
const ownerOfOld=(await call('/api/me','GET',undefined,newLogin.cookie)).data.user.id;
sqlite.prepare(`INSERT INTO payout_accounts
 (id,user_id,payment_method,bank_name,account_number,account_owner,nickname,is_default)
 VALUES (?,?,?,?,?,?,?,0)`).run(oldSavedId,ownerOfOld,'zalopay','ZaloPay','0912345678','TEST WALLET OWNER','Ví cũ');
const savedAccounts=(await call('/api/payout-accounts','GET',undefined,newLogin.cookie)).data.accounts;
assert.equal(savedAccounts.length,3);
assert.equal(savedAccounts.filter(x=>x.is_default).length,1,'Only bank is available as default for new withdrawals');
assert.equal((await call('/api/payout-accounts/'+oldSavedId+'/default','POST',{},newLogin.cookie)).status,400);
assert.equal(savedAccounts.find(x=>x.id===bankId).is_default,1);
assert.equal((await call('/api/payout-accounts','GET',undefined,refCookie)).data.accounts.length,0,'Other user cannot list saved recipients');
assert.equal((await call('/api/payout-accounts/'+bankId,'PATCH',{
 bank_name:'BVBank',account_number:'99ZP12345',account_owner:'FOREIGN',nickname:'X'
},refCookie)).status,404,'Other user cannot edit');
assert.equal((await call('/api/payout-accounts/'+bankId,'DELETE',{},refCookie)).status,404,'Other user cannot delete');
assert.equal((await call('/api/payout-accounts/'+bankId+'/default','POST',{},refCookie)).status,404,'Other user cannot change defaults');
assert.equal((await call('/api/admin/settings','PUT',{
 withdrawals_enabled:'1',lua_per_vnd:'10',min_withdraw_lua:'10',withdrawal_fee_lua:'0'
},admCookie)).status,200);
const savedBalance=(await call('/api/me','GET',undefined,newLogin.cookie)).data.balance;
assert.equal((await call('/api/withdrawals','POST',{
 amount:10,saved_account_id:oldSavedId,payment_method:'bank',
 bank_name:'INVALID',bank_account:'not-valid',bank_owner:'OTHER'
},refCookie)).status,404,'Cannot withdraw using another member saved account');
assert.equal((await call('/api/withdrawals','POST',{
 amount:10,saved_account_id:oldSavedId,payment_method:'bank'
},newLogin.cookie)).status,400,'Old saved wallet cannot be used for new requests');
const savedRequest=await call('/api/withdrawals','POST',{
 amount:10,saved_account_id:bankId,payment_method:'zalopay',
 bank_name:'ATTACKER BANK',bank_account:'00000',bank_owner:'ATTACKER'
},newLogin.cookie);
assert.equal(savedRequest.status,200,JSON.stringify(savedRequest));
const savedHistory=(await call('/api/history','GET',undefined,newLogin.cookie)).data.withdrawals.find(x=>x.id===savedRequest.data.id);
assert.equal(savedHistory.bank_name,'BVBank');
assert.equal(savedHistory.bank_account,'99ZP987654321');
assert.equal(savedHistory.bank_owner,'ZALOPAY TEST USER');
assert.equal(savedHistory.payment_method,'bank');
assert.equal((await call('/api/me','GET',undefined,newLogin.cookie)).data.balance,savedBalance-10);
const edited=await call('/api/payout-accounts/'+bankId,'PATCH',{
 bank_name:'BVBank',account_number:'99ZP123456',account_owner:'UPDATED OWNER',
 nickname:'Đã sửa',is_default:true
},newLogin.cookie);
assert.equal(edited.status,200,JSON.stringify(edited));
const afterEdit=(await call('/api/history','GET',undefined,newLogin.cookie)).data.withdrawals.find(x=>x.id===savedRequest.data.id);
assert.equal(afterEdit.bank_account,'99ZP987654321','Editing saved account never modifies pending withdrawal snapshot');
assert.equal((await call('/api/payout-accounts/'+bank2id+'/default','POST',{},newLogin.cookie)).status,200);
const newDefaults=(await call('/api/payout-accounts','GET',undefined,newLogin.cookie)).data.accounts;
assert.equal(newDefaults.find(x=>x.id===bank2id).is_default,1);
assert.equal(newDefaults.find(x=>x.id===bankId).is_default,0);
assert.equal((await call('/api/payout-accounts/'+bank2id,'DELETE',{},newLogin.cookie)).status,200);
const defaultAfterDelete=(await call('/api/payout-accounts','GET',undefined,newLogin.cookie)).data.accounts;
assert.equal(defaultAfterDelete.find(x=>x.id===bankId).is_default,1,'Deleting a default account promotes remaining bank');
assert.equal((await call('/api/admin/withdrawals/'+savedRequest.data.id,'POST',{
 status:'rejected',admin_note:'Kiểm thử hoàn số Lúa đầy đủ'
},admCookie)).status,200);
assert.equal((await call('/api/me','GET',undefined,newLogin.cookie)).data.balance,savedBalance);
assert.equal((await call('/api/payout-accounts/'+bankId,'DELETE',{},newLogin.cookie)).status,200);
assert.equal((await call('/api/history','GET',undefined,newLogin.cookie)).data.withdrawals.find(x=>x.id===savedRequest.data.id).bank_account,
 '99ZP987654321','Deleting saved account keeps withdrawal history intact');
assert.equal((await call('/api/payout-accounts','GET',undefined,newLogin.cookie)).data.accounts.length,1,'Old wallet record remains until member deletes it');
assert.equal((await call('/api/payout-accounts/'+oldSavedId,'DELETE',{},newLogin.cookie)).status,200,'Member may delete obsolete wallet recipient');
assert.match(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),/saved_account_id/);
assert.match(readFileSync(new URL('../public/payout-accounts-ui.js',import.meta.url),'utf8'),/Đặt mặc định/);
console.log('PASS: bank-only saved recipients and BVBank IDs, blocked new ZaloPay, legacy wallet retention, owner isolation, snapshots and safe deletions.');
