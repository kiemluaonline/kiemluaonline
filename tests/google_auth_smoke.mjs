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
// Xác nhận database có Admin thật trước khi thử Google OAuth.
const setup=await call('/api/setup','POST',{setup_key:env.SETUP_KEY,email:'admin@gmail.test',name:'Admin',password:'A-secure-password-2026'});
assert.equal(setup.status,201,JSON.stringify(setup));
 // Chống email tạm thời, biến thể Gmail và đăng ký trùng.
 const badMail=await call('/api/auth/register','POST',{name:'Thành viên thử',email:'try@yopmail.com',password:'test-password-2026',accept_terms:'yes'},'','192.0.2.101');
 assert.equal(badMail.status,400,JSON.stringify(badMail));
 const gmail1=await call('/api/auth/register','POST',{name:'Google cũ',email:'first.last@gmail.com',password:'test-password-2026',accept_terms:'yes'},'','192.0.2.102','a1111111-2222-4333-8444-555555555555');
 assert.equal(gmail1.status,201,JSON.stringify(gmail1));
 const gmailAlias=await call('/api/auth/register','POST',{name:'Bản sao Gmail',email:'firstlast+tag@googlemail.com',password:'test-password-2026',accept_terms:'yes'},'','192.0.2.103','a2222222-2222-4333-8444-555555555555');
 assert.equal(gmailAlias.status,409,JSON.stringify(gmailAlias));
 const legacyPassword=await call('/api/auth/register','POST',{
  name:'Thành viên Gmail cũ',email:'old.customer@gmail.com',password:'test-password-2026',accept_terms:'yes'
 },'','192.0.2.104','a3333333-2222-4333-8444-555555555555');
 assert.equal(legacyPassword.status,201,JSON.stringify(legacyPassword));
 const oldAccount=sqlite.prepare("SELECT id,referral_code FROM users WHERE email='old.customer@gmail.com'").get();
 assert.ok(oldAccount?.id);
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
 // Đã đăng ký bằng mật khẩu: chọn đúng Gmail Google thì tự đăng nhập, giữ ID và mã giới thiệu.
 const quickGoogle=await googleFlow('login','old.customer@gmail.com','google-old-customer-id','','192.0.2.104');
 assert.equal(quickGoogle.redirect,'/','Google Gmail phải đăng nhập được tài khoản mật khẩu đã có.');
 const quickCookie=quickGoogle.cookies.find(x=>x.startsWith('kl_session='));
 assert.ok(quickCookie);
 const quickMe=await call('/api/me','GET',undefined,quickCookie.split(';')[0],'192.0.2.104');
 assert.equal(quickMe.data.user.id,oldAccount.id);
 assert.equal(quickMe.data.user.referral_code,oldAccount.referral_code);
 assert.equal(quickMe.data.user.role,'member');
 assert.equal(quickMe.data.google_linked,true);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM users WHERE email='old.customer@gmail.com'").get().n,1);
 const retryQuick=await googleFlow('login','old.customer@gmail.com','google-old-customer-id','','192.0.2.104');
 assert.equal(retryQuick.redirect,'/');
 const differentGoogle=await googleFlow('login','old.customer@gmail.com','google-different-identity','','192.0.2.104');
 assert.equal(differentGoogle.redirect,'/?google_error=email_exists','Không được thay Google đã gắn bằng sub khác.');
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
 // Gmail hoàn toàn mới: một lần chọn Google -> đồng ý điều khoản -> tạo thành viên thật.
 const firstVisit=await googleFlow('login','new.visitor@gmail.com','google-new-visitor-2026','','192.0.2.160');
 assert.equal(firstVisit.response.status,303);
 assert.equal(firstVisit.redirect,'/?google_signup=1');
 const pendingCookie=firstVisit.cookies.find(c=>c.startsWith('tl_google_pending='));
 assert.ok(pendingCookie,'Phiên chờ đăng ký phải được lưu trong HttpOnly cookie.');
 const shown=await call('/api/auth/google/pending','GET',undefined,pendingCookie.split(';')[0],'192.0.2.160');
 assert.equal(shown.status,200);
 assert.equal(shown.data.pending,true);
 assert.equal(shown.data.email,'new.visitor@gmail.com');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users WHERE email=?').get('new.visitor@gmail.com').n,0,'Chưa chấp nhận điều khoản thì chưa tạo tài khoản.');
 const noTerms=await call('/api/auth/google/complete','POST',{accept_terms:'no'},pendingCookie.split(';')[0],'192.0.2.160');
 assert.equal(noTerms.status,400);
 const confirm=await worker.fetch(new Request(origin+'/api/auth/google/complete',{
  method:'POST',headers:{'Content-Type':'application/json','Origin':origin,'X-Tram-Lua':'1',
    'CF-Connecting-IP':'192.0.2.160','Cookie':pendingCookie.split(';')[0],
    'X-TL-Device':'b1111111-2222-4333-8444-555555555555'},
  body:JSON.stringify({accept_terms:'yes'})
 }),env);
 assert.equal(confirm.status,200);
 const newSession=confirm.headers.getSetCookie().find(x=>x.startsWith('kl_session='));
 assert.ok(newSession,'Tạo thành viên qua Google xong phải có cookie đăng nhập.');
 const newMe=await call('/api/me','GET',undefined,newSession.split(';')[0],'192.0.2.160');
 assert.equal(newMe.data.user.role,'member');
 assert.equal(newMe.data.user.email,'new.visitor@gmail.com');
 assert.equal(newMe.data.google_linked,true);
 const usedPending=await call('/api/auth/google/pending','GET',undefined,pendingCookie.split(';')[0],'192.0.2.160');
 assert.equal(usedPending.data.pending,false,'Phiên đăng ký chỉ được sử dụng một lần.');
 const reLoginNew=await googleFlow('login','new.visitor@gmail.com','google-new-visitor-2026','','192.0.2.160');
 assert.equal(reLoginNew.redirect,'/','Google đã đăng ký phải đăng nhập thẳng, không tạo thêm tài khoản.');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users WHERE email=?').get('new.visitor@gmail.com').n,1);
 const cancelled=await googleFlow('login','cancel.me@gmail.com','google-cancel-2026','','192.0.2.161');
 const cancelCookie=cancelled.cookies.find(c=>c.startsWith('tl_google_pending=')).split(';')[0];
 const cancelResult=await call('/api/auth/google/cancel','POST',{},cancelCookie,'192.0.2.161');
 assert.equal(cancelResult.status,200);
 const cancelledPending=await call('/api/auth/google/pending','GET',undefined,cancelCookie,'192.0.2.161');
 assert.equal(cancelledPending.data.pending,false);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM users WHERE email=?').get('cancel.me@gmail.com').n,0);

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

await worker.scheduled({},env);
console.log('PASS: Google OAuth signed JWT, signup/login, existing account linking, duplicate Gmail aliases, disposable email.');
