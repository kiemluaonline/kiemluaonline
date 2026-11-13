// Trạm Lúa - Cloudflare Worker API. Chỉ server mới được cộng/trừ Lúa.
const DAY = 86400000;
const SESSION_MS = 14 * DAY;
// Cloudflare Workers WebCrypto supports at most 100000 PBKDF2 iterations.
const PBKDF2_ROUNDS = 100000;
const encoder = new TextEncoder();
// Phân biệt lý do STK sai mà không phải đổi CHECK constraint của D1 đang hoạt động.
const INVALID_BANK_ACCOUNT_PREFIX = '[TL_INVALID_BANK_ACCOUNT] ';
const WITHDRAWAL_APPROVED_PREFIX = '[TL_WITHDRAWAL_APPROVED] ';
const invalidBankAccountNote = 'Số tài khoản không đúng hoặc thông tin nhận tiền không hợp lệ. Vui lòng kiểm tra và tạo yêu cầu rút mới với thông tin chính xác.';
function presentWithdrawal(w) {
  if (!w) return w;
  const method = w.bank_name === 'ZaloPay' ? 'zalopay' : 'bank';
  if (w.status === 'pending' && String(w.admin_note || '').startsWith(WITHDRAWAL_APPROVED_PREFIX))
    return { ...w, payment_method: method, status: 'approved', admin_note: w.admin_note.slice(WITHDRAWAL_APPROVED_PREFIX.length) };
  if (w.status === 'rejected' && String(w.admin_note || '').startsWith(INVALID_BANK_ACCOUNT_PREFIX))
    return { ...w, payment_method: method, status: 'invalid_account', admin_note: w.admin_note.slice(INVALID_BANK_ACCOUNT_PREFIX.length) };
  return { ...w, payment_method: method };
}
const DEFAULTS = {
  site_name: 'Trạm Lúa', signup_enabled: '1', checkin_reward: '0',
  referral_reward: '0', min_withdraw_lua: '1000', lua_per_vnd: '0',
  withdrawals_enabled: '0', announcement: '',
  quota_user_tasks_daily: '25', quota_device_accounts_daily: '2', quota_ip_accounts_daily: '6',
  quota_link_tasks_ip_24h: '0', quota_link_ip_exclusive: '1',
  quota_link_tasks_device_24h: '0', quota_link_device_exclusive: '1'
};
const HEADERS = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...HEADERS, ...extra }
});
class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const fail = (status, message, extra = {}) => { throw new HttpError(status, message, extra); };
const id = () => crypto.randomUUID();
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] % 10 + 1;
const now = () => Date.now();
const vnDay = (ms = now()) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
const normEmail = v => String(v || '').trim().toLowerCase();
const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const int = (v, defaultNum = 0) => /^-?\d+$/.test(String(v)) ? Number(v) : defaultNum;
const positive = (v, max = 10000000) => Number.isSafeInteger(Number(v)) && Number(v) > 0 && Number(v) <= max;
const isLocal = req => ['localhost', '127.0.0.1'].includes(new URL(req.url).hostname);
// IP công khai do Cloudflare cung cấp ở edge; không lấy từ biểu mẫu người dùng.
// Chỉ lấy CF-Connecting-IPv6 khi CF-Connecting-IP nằm trong lớp E (IPv4 giả của Cloudflare).
// Không tin CF-Connecting-IPv6 nếu kết nối thông thường có IPv4/IPv6 thật.
const clientIP = req => {
 const observed=str(req.headers.get('CF-Connecting-IP') || (isLocal(req)?'local':'unknown'),60);
 const originalIPv6=str(req.headers.get('CF-Connecting-IPv6'),60);
 if (/^2(?:4[0-9]|5[0-5])\./.test(observed)
     && originalIPv6.includes(':') && /^[a-f0-9:]+$/i.test(originalIPv6))
   return originalIPv6;
 return observed;
};
// Địa chỉ IPv4 công khai từ bên ngoài: validate để không lưu dữ liệu rác.
// IPv4 do trình duyệt gửi lên KHÔNG được dùng làm chứng cứ duy nhất để xử lý gian lận.
function isPublicIPv4(value){
 const parts=String(value||'').split('.');
 if(parts.length!==4||parts.some(p=>!/^(0|[1-9][0-9]{0,2})$/.test(p)||Number(p)>255))return false;
 const [a,b]=parts.map(Number);
 return a>=1&&a<=223&&a!==10&&a!==127&&a!==0
  && !(a===100&&b>=64&&b<=127) && !(a===169&&b===254)
  && !(a===172&&b>=16&&b<=31) && !(a===192&&b===168)
  && !(a===192&&b===0) && !(a===192&&b===88) && !(a===198&&[18,19].includes(b))
  && !(a===198&&b===51) && !(a===203&&b===0)
  && !(a===192&&b===0);
}
// Nhóm IPv6 /64 dùng cảnh báo mạng chung, không dùng để kết luận danh tính.
function ipv6Network(ip) {
 const value=String(ip||'').toLowerCase();
 if(!value.includes(':')||value.includes('.')||!/^[0-9a-f:]+$/.test(value))return null;
 const halves=value.split('::');if(halves.length>2)return null;
 const left=halves[0]?halves[0].split(':'):[];
 const right=halves.length===2&&halves[1]?halves[1].split(':'):[];
 if(halves.length===2&&left.length+right.length>7)return null;
 const parts=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
 if(parts.length!==8||parts.some(p=>!/^[0-9a-f]{1,4}$/.test(p)))return null;
 return parts.slice(0,4).map(p=>parseInt(p,16).toString(16)).join(':')+'::/64';
}
// Giữ riêng IPv4 thật và dải IPv6. IPv4 được trình duyệt gửi lên chỉ để đối chiếu.
function networkAlerts(realIpRecords, reportedRecords) {
 const grouped=new Map();
 const add=(key,type,source,account,device,realIp)=>{
  if(!key||!account)return;
  const mapKey=source+'|'+type+'|'+key;
  if(!grouped.has(mapKey))grouped.set(mapKey,{
   address:key,ip_type:type,source,accounts:new Set(),devices:new Set(),samples:new Set(),
   relatedIpv4:new Map()
  });
  const g=grouped.get(mapKey);
  g.accounts.add(account);
  if(device)g.devices.add(device);
  if(realIp)g.samples.add(realIp);
 };
 for(const r of realIpRecords){
   const type=String(r.ip).includes(':')?'IPv6 /64':'IPv4';
   const addr=type==='IPv4'?r.ip:ipv6Network(r.ip);
   add(addr,type,'cloudflare',r.user_id,r.device_code,r.ip);
 }
 for(const r of reportedRecords){
   if(!isPublicIPv4(r.detail))continue;
   // Báo cáo do trình duyệt cung cấp; không tự biến IPv6 thành IPv4.
   add(r.detail,'IPv4','browser',r.user_id,r.device_code,r.ip);
   // Liên kết theo cùng phiên ghi nhận IPv6 /64, không gán IP của
   // người khác trong nhóm hoặc xem đây là bằng chứng gian lận.
   const ipv6Group=ipv6Network(r.ip);
   const g=ipv6Group&&grouped.get('cloudflare|IPv6 /64|'+ipv6Group);
   if(g&&g.accounts.has(r.user_id)){
     if(!g.relatedIpv4.has(r.detail))g.relatedIpv4.set(r.detail,new Set());
     g.relatedIpv4.get(r.detail).add(r.user_id);
   }
 }
 return [...grouped.values()].filter(g=>g.accounts.size>=2).map(g=>({
   address:g.address,ip_type:g.ip_type,source:g.source,
   account_count:g.accounts.size,device_count:g.devices.size,
   severity:g.source==='cloudflare'&&g.accounts.size>=5&&g.devices.size>=2?'serious':'review',
   related_ipv4:[...g.relatedIpv4].map(([ip,accounts])=>({
    ip,account_count:accounts.size,source:'browser'
   })).sort((a,b)=>b.account_count-a.account_count||a.ip.localeCompare(b.ip)).slice(0,8),
   sample_ip:[...g.samples].slice(0,3)
 })).sort((a,b)=>(b.severity==='serious')-(a.severity==='serious')||b.account_count-a.account_count).slice(0,70);
}
// Hiển thị cả IPv4 chỉ có 1 tài khoản, thay vì chỉ hiện nhóm IP bị trùng.
function ipv4Inventory(realIpRecords,reportedRecords){
 const data=new Map();
 const add=(address,source,userId,createdAt)=>{
  if(!isPublicIPv4(address)||!userId)return;
  const key=source+'|'+address;
  if(!data.has(key))data.set(key,{ip:address,source,accounts:new Set(),last_seen:''});
  const group=data.get(key);
  group.accounts.add(userId);
  if(createdAt&&(!group.last_seen||createdAt>group.last_seen))group.last_seen=createdAt;
 };
 for(const r of realIpRecords){
   if(!String(r.ip||'').includes(':'))add(r.ip,'cloudflare',r.user_id,r.created_at);
 }
 for(const r of reportedRecords)add(r.detail,'browser',r.user_id,r.created_at);
 return [...data.values()].map(x=>({
  ip:x.ip,source:x.source,account_count:x.accounts.size,last_seen:x.last_seen
 })).sort((a,b)=>b.account_count-a.account_count||String(b.last_seen).localeCompare(String(a.last_seen))).slice(0,100);
}


// Anti-Fraud 2.0: chấm điểm từ dữ liệu D1 đã có, không dùng dịch vụ trả phí.
// Điểm chỉ là mức ưu tiên kiểm tra, không xác minh danh tính hay kết luận gian lận.
// Chỉ tín hiệu IP KHÔNG BAO GIỜ đủ để đạt mức nghiêm trọng.
function computeFraudProfiles(users,events,withdrawals,completions){
 const deviceGroups=new Map(),networkGroups=new Map(),paymentGroups=new Map();
 const accountEvents=new Map(),accountNetworks=new Map(),hourlyClaims=new Map();
 const addGroup=(map,key,userId)=>{
  if(!key||!userId)return;
  if(!map.has(key))map.set(key,new Set());
  map.get(key).add(userId);
 };
 const current=Date.now();
 for(const e of events){
  if(!e.user_id)continue;
  const stats=accountEvents.get(e.user_id)||{captcha:0,link:0,devices:new Set()};
  if(e.event_type==='captcha_wrong')stats.captcha++;
  if(e.event_type==='link_ip_quota_denied'||e.event_type==='link_browser_quota_denied')stats.link++;
  accountEvents.set(e.user_id,stats);
  if(e.event_type!=='device_seen')continue;
  if(e.detail==='browser_id'&&e.device_code){
    addGroup(deviceGroups,e.device_code,e.user_id);
    stats.devices.add(e.device_code);
  }
  const ip=String(e.ip||'');
  const net=ip.includes(':')?ipv6Network(ip):(isPublicIPv4(ip)||/^((192\.0\.2)|(198\.51\.100)|(203\.0\.113))\./.test(ip)?ip:null);
  // Các IP ví dụ của test được phép nhóm để mô phỏng, không chấp nhận IPv4
  // do trình duyệt tự gửi cho điểm rủi ro.
  if(net){
    addGroup(networkGroups,net,e.user_id);
    if(!accountNetworks.has(e.user_id))accountNetworks.set(e.user_id,new Set());
    accountNetworks.get(e.user_id).add(net);
  }
 }
 for(const w of withdrawals){
  if(!w.user_id||!w.bank_account||!w.bank_name)continue;
  const dest=String(w.bank_name).trim().toLowerCase()+'|'+String(w.bank_account).replace(/\s/g,'');
  addGroup(paymentGroups,dest,w.user_id);
 }
 for(const c of completions){
  if(!c.user_id||!c.created_at)continue;
  const timestamp=Date.parse(String(c.created_at).replace(' ','T')+'Z');
  if(Number.isFinite(timestamp)&&timestamp<=current&&current-timestamp<=3600000)
    hourlyClaims.set(c.user_id,(hourlyClaims.get(c.user_id)||0)+1);
 }
 const groupMax=map=>{
  const totals=new Map();
  for(const members of map.values()){
    if(members.size<2)continue;
    for(const userId of members)totals.set(userId,Math.max(totals.get(userId)||0,members.size));
  }
  return totals;
 };
 const deviceMax=groupMax(deviceGroups),networkMax=groupMax(networkGroups),paymentMax=groupMax(paymentGroups);
 return users.filter(u=>u.role==='member').map(u=>{
  const activity=accountEvents.get(u.id)||{captcha:0,link:0,devices:new Set()};
  const reasons=[];
  let points=0,strongSignals=0;
  const add=(score,reason,strong=false)=>{
   points+=score;reasons.push(reason);
   if(strong)strongSignals++;
  };
  const receivers=paymentMax.get(u.id)||0;
  const devices=deviceMax.get(u.id)||0;
  const networks=networkMax.get(u.id)||0;
  const claims=hourlyClaims.get(u.id)||0;
  if(receivers>=2)add(45,`${receivers} tài khoản dùng chung kênh nhận tiền (cần xác minh chủ sở hữu)`,true);
  if(devices>=2)add(35,`${devices} tài khoản có cùng mã trình duyệt (mã có thể bị thay đổi)`,true);
  if(activity.link>=3)add(20,`${activity.link} cảnh báo hạn mức link trong 14 ngày`);
  if(claims>=12)add(15,`${claims} lần gửi nhiệm vụ trong một giờ`);
  if(activity.captcha>=5)add(10,`${activity.captcha} lần trả lời CAPTCHA sai trong 14 ngày`);
  if(networks>=3)add(10,`${networks} tài khoản cùng IP/dải IPv6 (không chứng minh gian lận)`);
  const ipCount=accountNetworks.get(u.id)?.size||0;
  if(ipCount>=5)add(5,`${ipCount} mạng IP khác nhau trong 14 ngày (có thể do đổi mạng)`);
  const score=Math.min(100,points);
  const level=score>=65&&strongSignals>0&&reasons.length>=2?'serious':score>=25?'review':'low';
  return {user_id:u.id,name:u.name,email:u.email,status:u.status,
   score,level,reasons,signals:reasons.length,
   payout_shared_accounts:receivers,device_shared_accounts:devices,
   network_shared_accounts:networks,claims_last_hour:claims};
 }).sort((a,b)=>b.score-a.score||a.email.localeCompare(b.email));
}
async function loadFraudProfiles(env,targetId=null){
 // Các giới hạn bảo vệ D1 Free: không quét toàn bộ lịch sử của site.
 // Khi chấm điểm cho một yêu cầu rút, luôn nạp đúng tài khoản đích dù cũ.
 const [users,events,withdrawals,completions,selected]=await Promise.all([
  env.DB.prepare("SELECT id,name,email,role,status FROM users WHERE role='member' ORDER BY created_at DESC LIMIT 250").all(),
  env.DB.prepare("SELECT user_id,event_type,detail,ip,device_code FROM risk_events WHERE user_id IS NOT NULL AND created_at>=datetime('now','-14 days') ORDER BY created_at DESC LIMIT 5000").all(),
  env.DB.prepare("SELECT user_id,bank_name,bank_account FROM withdrawals WHERE created_at>=datetime('now','-90 days') ORDER BY created_at DESC LIMIT 3000").all(),
  env.DB.prepare("SELECT user_id,created_at FROM task_completions WHERE created_at>=datetime('now','-1 hour') ORDER BY created_at DESC LIMIT 2000").all(),
  targetId?env.DB.prepare("SELECT id,name,email,role,status FROM users WHERE id=?").bind(targetId).first():Promise.resolve(null)
 ]);
 const members=users.results;
 if(selected&&!members.some(u=>u.id===selected.id))members.push(selected);
 return computeFraudProfiles(members,events.results,withdrawals.results,completions.results);
}

const browserDeviceId = req => {
 const value=str(req.headers.get('X-TL-Device'),80);
 return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value.toLowerCase():'';
};
const maskedAccount = value => {
 const digits=str(value,40).replace(/\D/g,'');
 return digits.length>=6?digits.slice(0,2)+'******'+digits.slice(-2):'••••';
};
const bytesToHex = a => [...new Uint8Array(a)].map(v => v.toString(16).padStart(2, '0')).join('');
const hexToBytes = hex => new Uint8Array(hex.match(/../g).map(v => parseInt(v, 16)));
const hash = async data => bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(data)));
const newToken = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  return bytesToHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(salt), iterations: PBKDF2_ROUNDS, hash: 'SHA-256' }, key, 256));
}
async function checkPassword(password, user) {
  const actual = await passwordDigest(password, user.password_salt);
  // Không dừng ở ký tự khác nhau đầu tiên.
  const a = hexToBytes(actual), b = hexToBytes(user.password_hash);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function deviceCode(req, env) {
 // Mã giả danh theo trình duyệt (không phải IMEI), có thể bị người dùng đổi hoặc xóa.
 const stable=browserDeviceId(req);
 const seed=stable?'browser:'+stable:'temporary:'+clientIP(req)+'|'+str(req.headers.get('user-agent'),300);
 return (await hash((env.DEVICE_SALT || 'local-only')+'|'+seed)).slice(0,16).toUpperCase();
}
async function readBody(req, limit = 12000) {
  const size = Number(req.headers.get('content-length') || 0);
  if (size > limit) fail(413, 'Dữ liệu quá lớn.');
  const raw = await req.text();
  if (raw.length > limit) fail(413, 'Dữ liệu quá lớn.');
  try { return JSON.parse(raw || '{}'); }
  catch { fail(400, 'Dữ liệu JSON không hợp lệ.'); }
}

const APP_PHOTO_PREFIX = 'APP_PHOTO_V1|';
const APP_PHOTO_MAX_BYTES = 180000;
// Ảnh do trình duyệt thu nhỏ, lưu trong D1 với mức dung lượng nhỏ;
// không cần R2, chỉ Admin mới có đường dẫn đọc ảnh.
function appPhotoEvidence(noteInput, dataUri) {
  const note = str(noteInput, 200);
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUri || ''));
  if (!match || match[1].length > 240010)
    fail(400, 'Cần chọn ảnh bằng chứng JPG hợp lệ, dung lượng dưới 180 KB sau khi nén.');
  let bytes;
  try { bytes = atob(match[1]); }
  catch { fail(400, 'Dữ liệu ảnh không hợp lệ.'); }
  if (bytes.length < 1000 || bytes.length > APP_PHOTO_MAX_BYTES ||
      bytes.charCodeAt(0) !== 255 || bytes.charCodeAt(1) !== 216 || bytes.charCodeAt(2) !== 255)
    fail(400, 'Ảnh bằng chứng JPG không hợp lệ hoặc vượt 180 KB.');
  return APP_PHOTO_PREFIX + encodeURIComponent(note) + '|' + match[1];
}
function readAppPhoto(evidence) {
  if (typeof evidence !== 'string' || !evidence.startsWith(APP_PHOTO_PREFIX)) return null;
  const separator = evidence.indexOf('|', APP_PHOTO_PREFIX.length);
  if (separator < 0) return null;
  return { note: decodeURIComponent(evidence.slice(APP_PHOTO_PREFIX.length, separator)),
    base64: evidence.slice(separator + 1) };
}

function requireSameOrigin(req) {
  const origin = req.headers.get('Origin');
  if (origin !== new URL(req.url).origin) fail(403, 'Yêu cầu sai nguồn gốc.');
  if (req.headers.get('X-Tram-Lua') !== '1') fail(403, 'Thiếu xác thực yêu cầu.');
  if (req.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'application/json') fail(415, 'Yêu cầu JSON.');
}
function cookies(req) {
  const out = {};
  for (const pair of (req.headers.get('Cookie') || '').split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}
function sessionCookie(req, token, maxAge = SESSION_MS / 1000) {
  const name = isLocal(req) ? 'kl_session' : '__Host-kl_session';
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; ${isLocal(req) ? '' : 'Secure; '}Max-Age=${maxAge}`;
}
async function userSession(req, env) {
  const token = cookies(req)['__Host-kl_session'] || cookies(req).kl_session;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.status,u.referral_code,u.referred_by,u.created_at
   FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await hash(token), now()).first();
}
async function auth(req, env, role = null) {
  const user = await userSession(req, env);
  if (!user) fail(401, 'Bạn cần đăng nhập.');
  if (user.status !== 'active') fail(403, 'Tài khoản đã bị tạm khóa.');
  if (role && user.role !== role) fail(403, 'Chỉ quản trị viên được dùng chức năng này.');
  return user;
}
// Thông tin tài khoản bị khóa chỉ dành cho phiên của chính thành viên hoặc
// người đã nhập đúng mật khẩu. Việc khóa không tự hủy các khoản Lúa đã ghi.
async function suspendedInfo(env, userId) {
 const [reason,holdType,rows,count]=await Promise.all([
   env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('account_hold:'+userId).first(),
   env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('account_hold_type:'+userId).first(),
   env.DB.prepare('SELECT id,amount,vnd_amount,status,admin_note,created_at FROM withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT 5').bind(userId).all(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM withdrawals WHERE user_id=? AND status='pending'").bind(userId).first()
 ]);
 const withdrawals=rows.results.map(row=>{
   const w=presentWithdrawal(row);
   return {id:w.id,amount:w.amount,vnd_amount:w.vnd_amount,status:w.status,
    admin_note:w.admin_note,created_at:w.created_at};
 });
 return {account_status:'suspended',
   suspension_type:holdType?.value==='confirmed'?'confirmed':'review',
   reason:reason?.value||'Tài khoản cần được xác minh thêm.',
   pending_withdrawals:count?.n||0,
   withdrawals};
}
async function createSession(req, env, userId) {
  const token = newToken();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(await hash(token), userId, now() + SESSION_MS).run();
  return sessionCookie(req, token);
}
async function getSettings(env) {
  const keys=Object.keys(DEFAULTS);
  const rows=await env.DB.prepare('SELECT key,value FROM settings WHERE key IN ('+keys.map(()=>'?').join(',')+')').bind(...keys).all();
  // Legacy total caps are retired, including values saved before this update.
  return {...DEFAULTS,...Object.fromEntries(rows.results.map(r=>[r.key,r.value])),quota_link_tasks_ip_24h:'0',quota_link_tasks_device_24h:'0'};
}
async function wallet(env, userId) {
  const v = await env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS balance FROM wallet_entries WHERE user_id=?').bind(userId).first();
  return v?.balance || 0;
}
async function event(env, req, type, userId = null, detail = '') {
  await env.DB.prepare('INSERT INTO risk_events(id,user_id,event_type,detail,ip,device_code) VALUES(?,?,?,?,?,?)')
    .bind(id(), userId, type, str(detail, 500), clientIP(req), await deviceCode(req, env)).run();
}
async function giveReferral(env, userId, settings) {
  const amount = int(settings.referral_reward);
  if (amount <= 0) return;
  // Chỉ thưởng khi người được giới thiệu đã thực sự có ít nhất một khoản Lúa nhiệm vụ duyệt.
  await env.DB.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
    SELECT ?,u.referred_by,?,'Thưởng giới thiệu','referral',u.id FROM users u
    WHERE u.id=? AND u.referred_by IS NOT NULL AND EXISTS
    (SELECT 1 FROM wallet_entries w WHERE w.user_id=u.id AND w.reference_type='task')
    ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`)
    .bind(id(), amount, userId).run();
}
function referralCode() { return newToken().slice(0, 10).toUpperCase(); }
function ensureEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail(400, 'Email không hợp lệ.');
}

const TEMP_MAIL_DOMAINS=new Set([
 '10minutemail.com','10minutemail.net','mailinator.com','guerrillamail.com',
 'guerrillamail.info','sharklasers.com','grr.la','yopmail.com','yopmail.fr',
 'maildrop.cc','temp-mail.org','tempmail.com','tempmail.net','tempmail.dev',
 'trashmail.com','trashmail.net','getnada.com','dispostable.com',
 'throwawaymail.com','emailondeck.com','mailnesia.com','mohmal.com',
 'mintemail.com','tempmailo.com','fakeinbox.com','inboxkitten.com',
 'minuteinbox.com','dropmail.me','mail.tm','tempmail.plus',
 '1secmail.com','1secmail.net','1secmail.org','1secmail.cc'
]);
const gmailDomain=d=>d==='gmail.com'||d==='googlemail.com';
function canonicalEmail(input){
 const email=normEmail(input),at=email.lastIndexOf('@');
 if(at<0)return email;
 const domain=email.slice(at+1);
 if(!gmailDomain(domain))return email;
 return email.slice(0,at).split('+')[0].replace(/\./g,'')+'@gmail.com';
}
function preventDisposable(email){
 const domain=normEmail(email).split('@').pop();
 if(TEMP_MAIL_DOMAINS.has(domain))fail(400,'Không chấp nhận email tạm thời. Hãy dùng email cá nhân.');
}
async function registeredEmail(env,email){
 const exact=await env.DB.prepare('SELECT id,email FROM users WHERE email=?').bind(normEmail(email)).first();
 if(exact)return exact;
 if(!canonicalEmail(email).endsWith('@gmail.com'))return null;
 const canonical=canonicalEmail(email);
 const rows=await env.DB.prepare("SELECT id,email FROM users WHERE lower(email) LIKE '%@gmail.com' OR lower(email) LIKE '%@googlemail.com'").all();
 return rows.results.find(user=>canonicalEmail(user.email)===canonical)||null;
}
async function signupRateLimit(env,req,email=''){
 const ip=clientIP(req);
 const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE joined_ip=? AND created_at>=datetime('now','-1 day')").bind(ip).first();
 if(recent.n>=3){await event(env,req,'signup_rate_limited',null,'IP: 3 tài khoản/24h');fail(429,'Mạng này đã tạo quá nhiều tài khoản trong 24 giờ.');}
 if(browserDeviceId(req)&&gmailDomain(normEmail(email).split('@')[1])){
  const code=await deviceCode(req,env);
  const result=await env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM risk_events WHERE event_type='signup_completed' AND device_code=? AND created_at>=datetime('now','-1 day')").bind(code).first();
  if(result.n>=2){await event(env,req,'signup_device_limit',null,'mã trình duyệt');fail(429,'Trình duyệt này đã tạo quá nhiều tài khoản trong 24 giờ.');}
 }
}

function ensurePassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) fail(400, 'Mật khẩu phải có 10–128 ký tự.');
}
async function registerUser(env, params) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const userId = id();
  const entry=env.DB.prepare(`INSERT INTO users(id,email,name,password_hash,password_salt,role,referral_code,referred_by,joined_ip,terms_accepted_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(userId,params.email,params.name,
    await passwordDigest(params.password,salt),salt,params.role||'member',referralCode(),params.referredBy||null,params.ip,params.role==='admin'?null:new Date().toISOString());
  if(params.role!=='admin'&&gmailDomain(normEmail(params.email).split('@')[1])){
    await env.DB.batch([entry,env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)')
      .bind('gmail_claim:'+await hash(canonicalEmail(params.email)),userId)]);
  }else await entry.run();
  return userId;
}


const OAUTH_WINDOW_MS=10*60*1000;
const googleReady=env=>Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);
const googleCallbackUri=env=>String(env.GOOGLE_REDIRECT_URI||'https://nhiemvu.click/api/auth/google/callback');
function googleCookie(req,value,maxAge=600){
 const name=isLocal(req)?'tl_google_state':'__Host-tl_google_state';
 return name+'='+value+'; Path=/; HttpOnly; SameSite=Lax; '+(isLocal(req)?'':'Secure; ')+'Max-Age='+maxAge;
}
function googlePendingCookie(req,value,maxAge=600){
 const name=isLocal(req)?'tl_google_pending':'__Host-tl_google_pending';
 return name+'='+value+'; Path=/; HttpOnly; SameSite=Lax; '+(isLocal(req)?'':'Secure; ')+'Max-Age='+maxAge;
}
function pendingGoogleToken(req){
 const token=cookies(req)['__Host-tl_google_pending']||cookies(req).tl_google_pending||'';
 return /^[a-f0-9]{64}$/.test(token)?token:'';
}
async function pendingGoogleSignup(req,env){
 const token=pendingGoogleToken(req);
 if(!token)return null;
 const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('google_signup_pending:'+token).first();
 if(!row)return null;
 try{
  const pending=JSON.parse(row.value);
  return pending?.expires>now()&&pending.identity?.sub&&pending.identity?.email?{token,...pending}:null;
 }catch{return null;}
}
function googleReturn(req,error='',session='',pending=''){
 const destination=error?'/?google_error='+encodeURIComponent(error):(pending?'/?google_signup=1':'/');
 const headers=new Headers({...HEADERS,Location:destination});
 headers.append('Set-Cookie',googleCookie(req,'',0));
 headers.append('Set-Cookie',googlePendingCookie(req,pending,pending?600:0));
 if(session)headers.append('Set-Cookie',session);
 return new Response(null,{status:303,headers});
}
function base64urlBytes(input){
 if(!/^[A-Za-z0-9_-]+$/.test(input)||input.length>18000)fail(401,'Token Google không hợp lệ.');
 const s=input.replace(/-/g,'+').replace(/_/g,'/');
 const bytes=atob(s+'='.repeat((4-s.length%4)%4));
 return Uint8Array.from(bytes,c=>c.charCodeAt(0));
}
async function verifyGoogleIdToken(idToken,env,nonce){
 const parts=String(idToken||'').split('.');
 if(parts.length!==3)fail(401,'Token Google không hợp lệ.');
 let header,claims;
 try{
  header=JSON.parse(new TextDecoder().decode(base64urlBytes(parts[0])));
  claims=JSON.parse(new TextDecoder().decode(base64urlBytes(parts[1])));
 }catch{fail(401,'Token Google không hợp lệ.');}
 if(header.alg!=='RS256'||!header.kid)fail(401,'Thuật toán token Google không hợp lệ.');
 const response=await fetch('https://www.googleapis.com/oauth2/v3/certs');
 if(!response.ok)fail(502,'Không thể lấy khóa xác minh chữ ký Google.');
 const jwks=await response.json();
 const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&(!k.alg||k.alg==='RS256'));
 if(!jwk)fail(401,'Không tìm thấy khóa chữ ký Google.');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,base64urlBytes(parts[2]),encoder.encode(parts[0]+'.'+parts[1]));
 if(!valid)fail(401,'Chữ ký token Google không hợp lệ.');
 const seconds=Math.floor(now()/1000);
 if(!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)
  ||claims.aud!==env.GOOGLE_CLIENT_ID||!Number.isFinite(claims.exp)||claims.exp<=seconds
  ||!Number.isFinite(claims.iat)||claims.iat>seconds+300||claims.nonce!==nonce
  ||claims.email_verified!==true||typeof claims.email!=='string'
  ||!(/^[A-Za-z0-9_-]{5,255}$/.test(String(claims.sub||''))))
   fail(401,'Tài khoản Google chưa được xác minh hợp lệ.');
 return {sub:claims.sub,email:normEmail(claims.email),name:str(claims.name||claims.email.split('@')[0],70)};
}
const googleIdentity=(env,sub)=>env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('google_sub:'+sub).first();
const googleForUser=(env,userId)=>env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('google_user:'+userId).first();
async function connectGoogleIdentity(env,sub,userId){
 const current=await googleIdentity(env,sub), linked=await googleForUser(env,userId);
 if(current&&current.value!==userId)fail(409,'Google này đã liên kết tài khoản Trạm Lúa khác.');
 if(linked&&linked.value!==sub)fail(409,'Tài khoản Trạm Lúa đã liên kết Google khác.');
 const changes=[];
 if(!current)changes.push(env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('google_sub:'+sub,userId));
 if(!linked)changes.push(env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('google_user:'+userId,sub));
 if(changes.length)await env.DB.batch(changes);
}
async function registerGoogleMember(env,req,identity,referredBy){
 const salt=bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
 const password=newToken()+newToken(),uid=id();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,role,referral_code,referred_by,joined_ip,terms_accepted_at) VALUES(?,?,?,?,?,'member',?,?,?,?)")
   .bind(uid,identity.email,identity.name.length>=2?identity.name:'Thành viên Google',
    await passwordDigest(password,salt),salt,referralCode(),referredBy||null,clientIP(req),new Date().toISOString()),
  env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('google_sub:'+identity.sub,uid),
  env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('google_user:'+uid,identity.sub),
  ...(gmailDomain(identity.email.split('@')[1])?[env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)')
   .bind('gmail_claim:'+await hash(canonicalEmail(identity.email)),uid)]:[])
 ]);
 await event(env,req,'signup_completed',uid,'google');
 return uid;
}

// Quota được đếm theo ngày Việt Nam trên D1, không dựa vào số liệu trình duyệt.
// Mã trình duyệt do phía người dùng tự tạo: chỉ hỗ trợ hạn chế lạm dụng phổ thông.
const quotaNumber=(s,k)=>Math.max(0,Math.min(100,int(s[k],int(DEFAULTS[k]))));
async function taskQuota(env,req,userId,settings,category=''){
 if(category==='link')return {day:vnDay(),ip:clientIP(req),device:await deviceCode(req,env),maxUser:0,maxDevice:0,maxIP:0};
 const day=vnDay(),ip=clientIP(req),device=browserDeviceId(req)?await deviceCode(req,env):'';
 const maxUser=quotaNumber(settings,'quota_user_tasks_daily');
 const maxDevice=device?quotaNumber(settings,'quota_device_accounts_daily'):0;
 const maxIP=(ip!=='unknown'&&ip!=='local')?quotaNumber(settings,'quota_ip_accounts_daily'):0;
 const [mine,devices,ips]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE user_id=? AND status IN ('pending','approved') AND date(created_at,'+7 hours')=?").bind(userId,day).first(),
  maxDevice?env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM task_completions WHERE device_code=? AND user_id<>? AND status IN ('pending','approved') AND date(created_at,'+7 hours')=?").bind(device,userId,day).first():Promise.resolve({n:0}),
  maxIP?env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM task_completions WHERE ip=? AND user_id<>? AND status IN ('pending','approved') AND date(created_at,'+7 hours')=?").bind(ip,userId,day).first():Promise.resolve({n:0})
 ]);
 const denied=maxUser&&mine.n>=maxUser?'user':maxDevice&&devices.n>=maxDevice?'device':maxIP&&ips.n>=maxIP?'ip':null;
 if(denied){
  await event(env,req,'task_quota_denied',userId,denied+':'+day);
  const msg=denied==='user'?'Tài khoản đã đạt giới hạn nhiệm vụ hôm nay.':
   denied==='device'?'Trình duyệt đã đạt giới hạn tài khoản nhận nhiệm vụ hôm nay.':
   'Địa chỉ IP đã đạt giới hạn tài khoản nhận nhiệm vụ hôm nay.';
  fail(429,msg+' Nếu dùng mạng hoặc thiết bị chung, hãy liên hệ Admin để được xem xét.',{quota_scope:denied});
 }
 return {day,ip,device,maxUser,maxDevice,maxIP};
}
// Điều kiện được kiểm tra lại trong cùng transaction ghi nhận nhiệm vụ, tránh vượt
// quota khi nhiều yêu cầu đồng thời. Không ghi nhiệm vụ thì không cộng Lúa.
const TASK_CLAIM_UPDATE=`UPDATE task_attempts SET consumed_by=?
 WHERE id=? AND user_id=? AND consumed_by IS NULL AND expires_at>? AND (available_at<=? OR ?<>'video')
 AND (?=0 OR
  (SELECT COUNT(*) FROM task_completions WHERE user_id=? AND status IN ('pending','approved') AND date(created_at,'+7 hours')=?)<?)
 AND (?=0 OR
  (SELECT COUNT(DISTINCT user_id) FROM task_completions WHERE ip=? AND user_id<>?
   AND status IN ('pending','approved') AND date(created_at,'+7 hours')=?)<?)
 AND (?=0 OR
  (SELECT COUNT(DISTINCT user_id) FROM task_completions WHERE device_code=? AND user_id<>?
   AND status IN ('pending','approved') AND date(created_at,'+7 hours')=?)<?)
 AND (?=0 OR
   (SELECT COUNT(*) FROM task_completions c JOIN tasks t ON t.id=c.task_id
    WHERE c.ip LIKE ? AND t.category='link' AND c.status IN ('pending','approved')
      AND date(c.created_at,'+7 hours')=date('now','+7 hours'))<?)
 AND (?=0 OR NOT EXISTS
   (SELECT 1 FROM task_completions c JOIN tasks t ON t.id=c.task_id
    WHERE c.ip LIKE ? AND c.user_id<>? AND t.category='link'
     AND c.status IN ('pending','approved')
     AND date(c.created_at,'+7 hours')=date('now','+7 hours')))
 AND (?=0 OR
  (SELECT COUNT(*) FROM task_completions WHERE user_id=? AND task_id=?
    AND status IN ('pending','approved') AND date(created_at,'+7 hours')=date('now','+7 hours'))<?)
 AND (?=0 OR
  (SELECT COUNT(*) FROM task_completions c JOIN tasks t ON t.id=c.task_id
   WHERE t.category='link' AND c.device_code=? AND c.status IN ('pending','approved')
   AND date(c.created_at,'+7 hours')=date('now','+7 hours'))<?)
 AND (?=0 OR NOT EXISTS
  (SELECT 1 FROM task_completions c JOIN tasks t ON t.id=c.task_id
   WHERE t.category='link' AND c.device_code=? AND c.user_id<>?
   AND c.status IN ('pending','approved')
   AND date(c.created_at,'+7 hours')=date('now','+7 hours')))`;

/* IP Cloudflare, không dùng IPv4 người dùng tự dán. Đặt lại lúc 00:00 giờ Việt Nam mỗi ngày.
 Pending giữ chỗ cho tới khi được duyệt/từ chối, rejected không giữ quota. */

// IPv4: so chính xác. IPv6: nhóm theo /64 trong trường hợp bốn nhóm prefix được
// viết đầy đủ; giúp nhận ra nhiều điện thoại cùng mạng dù IPv6 phần host khác nhau.
// Một vài dạng IPv6 rút gọn khác nhau sẽ không khớp; KHÔNG dùng để khóa tài khoản.
function linkNetworkPattern(ip){
 const value=String(ip||'').toLowerCase();
 if(!value.includes(':'))return value;
 const parts=value.split(':');
 if(parts.length>=5&&parts.slice(0,4).every(p=>/^[0-9a-f]{1,4}$/.test(p)))
  return parts.slice(0,4).join(':')+':%';
 return value;
}
async function linkIPUsage(env,ip,userId){
 if(!ip||ip==='unknown'||ip==='local')return {total:0,other:0};
 const row=await env.DB.prepare(
  "SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN c.user_id<>? THEN 1 ELSE 0 END),0) other "+
  "FROM task_completions c JOIN tasks t ON t.id=c.task_id "+
  "WHERE t.category='link' AND c.ip LIKE ? AND c.status IN ('pending','approved') "+
  "AND date(c.created_at,'+7 hours')=date('now','+7 hours')"
 ).bind(userId,linkNetworkPattern(ip)).first();
 return {total:Number(row?.total||0),other:Number(row?.other||0)};
}

async function linkTaskPerAccountLimit(env,task){
 if(task.category!=='link')return 1;
 const limit=await env.DB.prepare('SELECT value FROM settings WHERE key=?')
  .bind('link_task_limit:'+task.id).first();
 return Math.max(1,Math.min(20,int(limit?.value,1)));
}
async function linkIPQuota(env,req,userId,task,settings){
 if(task.category!=='link')return {enabled:0,owner:0,limit:0,ip:'',perTask:0};
 const ip=clientIP(req);
 if(ip==='unknown'||ip==='local')fail(429,'Không xác minh được IP mạng cho nhiệm vụ link. Vui lòng thử lại.',{quota_scope:'link_missing_ip'});
 const limit=quotaNumber(settings,'quota_link_tasks_ip_24h');
 const exclusive=settings.quota_link_ip_exclusive!=='0';
 const used=await linkIPUsage(env,ip,userId);
 const perTaskLimit=await linkTaskPerAccountLimit(env,task);
 const own=await env.DB.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE user_id=? AND task_id=? AND status IN ('pending','approved') AND date(created_at,'+7 hours')=date('now','+7 hours')")
   .bind(userId,task.id).first();
 const denied=exclusive&&used.other>0?'link_owner':limit>0&&used.total>=limit?'link_limit':perTaskLimit>1&&Number(own.n)>=perTaskLimit?'link_task_limit':null;
 if(denied){
  await event(env,req,'link_ip_quota_denied',userId,denied+':'+task.id);
  fail(429,denied==='link_owner'
   ?'Bạn đã làm hết nhiệm vụ hôm nay. IP này đã được tài khoản khác sử dụng để làm link rút gọn. Lượt mới được mở lúc 00:00 ngày mai (giờ Việt Nam).'
   :denied==='link_limit'?'IP này đã đủ lượt nhiệm vụ link trong ngày hôm nay. Lượt mới được mở lúc 00:00 ngày mai (giờ Việt Nam).'
   :'Bạn đã hết lượt nhiệm vụ này hôm nay. Lượt mới được mở lúc 00:00 ngày mai (giờ Việt Nam).',
   {quota_scope:denied});
 }
 return {enabled:limit>0?1:0,owner:exclusive?1:0,limit,ip:linkNetworkPattern(ip),perTask:perTaskLimit>1?perTaskLimit:0};
}

/* Lượt link theo mã trình duyệt giả danh; không đổi quota khi chỉ thay IP/VPN/4G.
 Mã này KHÔNG PHẢI ID phần cứng: xóa dữ liệu, trình duyệt mới hoặc giả mạo mã có thể qua mặt. */
async function linkBrowserUsage(env,code,userId){
 if(!code)return {total:0,other:0};
 const row=await env.DB.prepare(
  "SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN c.user_id<>? THEN 1 ELSE 0 END),0) AS other "+
  "FROM task_completions c JOIN tasks t ON t.id=c.task_id "+
  "WHERE t.category='link' AND c.device_code=? AND c.status IN ('pending','approved') "+
  "AND date(c.created_at,'+7 hours')=date('now','+7 hours')"
 ).bind(userId,code).first();
 return {total:Number(row?.total||0),other:Number(row?.other||0)};
}
async function linkBrowserQuota(env,req,userId,task,settings){
 if(task.category!=='link')return {enabled:0,owner:0,limit:0,code:''};
 if(!browserDeviceId(req)){
  await event(env,req,'link_browser_missing',userId,'Missing browser ID for link task');
  fail(429,'Chưa nhận diện được trình duyệt để làm nhiệm vụ link. Hãy tải lại trang bằng trình duyệt thông thường.',{quota_scope:'link_browser_missing'});
 }
 const code=await deviceCode(req,env);
 const used=await linkBrowserUsage(env,code,userId);
 const limit=quotaNumber(settings,'quota_link_tasks_device_24h');
 const exclusive=settings.quota_link_device_exclusive!=='0';
 const denied=exclusive&&used.other>0?'link_browser_owner':limit>0&&used.total>=limit?'link_browser_limit':null;
 if(denied){
  await event(env,req,'link_browser_quota_denied',userId,denied+':'+task.id);
  fail(429,denied==='link_browser_owner'
   ?'Bạn đã làm hết nhiệm vụ hôm nay. Mã trình duyệt này đã được tài khoản khác sử dụng. Lượt mới được mở lúc 00:00 ngày mai (giờ Việt Nam).'
   :'Trình duyệt này đã hết lượt nhiệm vụ link trong ngày hôm nay. Đổi Wi-Fi, VPN hay 4G không đặt lại lượt.',
   {quota_scope:denied});
 }
 return {enabled:limit>0?1:0,owner:exclusive?1:0,limit,code};
}
// D1 hiện hỗ trợ 3 loại ban đầu. Nhiệm vụ App lưu dạng 'other' kèm
// settings app_referral_code:<taskId> để không phải thay schema cũ.
const storedTaskCategory = category => category === 'app' ? 'other' : category;
async function resolveTaskCategory(env,task) {
 if(task.category!=='other')return task.category;
 const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('app_referral_code:'+task.id).first();
 return row?.value?'app':'other';
}
function period(task) { return task.repeat_policy === 'daily' ? vnDay() : '*'; }
function validateTaskBody(b) {
  const title = str(b.title, 120), description = str(b.description, 1200), category = str(b.category, 20);
  const url = str(b.url, 700), reward = Number(b.reward), minSeconds = category === 'video' ? Number(b.min_seconds) : 5;
  const review = str(b.review_mode, 20), repeat = str(b.repeat_policy, 20);
  if (title.length < 3) fail(400, 'Tiêu đề nhiệm vụ phải có ít nhất 3 ký tự.');
  if (!['video', 'link', 'other', 'app'].includes(category)) fail(400, 'Loại nhiệm vụ không hợp lệ.');
  if (url && (!/^https:\/\//i.test(url) || !URL.canParse(url))) fail(400, 'Liên kết phải là HTTPS hợp lệ.');
  if (!positive(reward)) fail(400, 'Thưởng nhiệm vụ phải là số nguyên dương.');
  if (!Number.isInteger(minSeconds) || minSeconds < 5 || minSeconds > 3600) fail(400, 'Thời gian thực hiện từ 5–3600 giây.');
  if (!['manual', 'auto'].includes(review) || !['once', 'daily'].includes(repeat)) fail(400, 'Cấu hình nhiệm vụ không hợp lệ.');
  const appCode = str(b.app_referral_code, 80);
  if (category === 'app' && (review !== 'manual' || repeat !== 'once'))
    fail(400, 'Nhiệm vụ App bắt buộc Admin duyệt và mỗi tài khoản chỉ làm một lần.');
  if (category === 'app' && (!url || appCode.length < 2))
    fail(400, 'Nhiệm vụ App cần URL tải ứng dụng và mã giới thiệu (ít nhất 2 ký tự).');
  const linkLimit=int(b.link_24h_limit,1);
  if(!Number.isInteger(linkLimit)||linkLimit<1||linkLimit>20)fail(400,'Số lượt link/tài khoản/ngày phải từ 1 đến 20.');
  return {title,description,category,url,reward,minSeconds,review,repeat,active:b.is_active?1:0,linkLimit,appCode:category==='app'?appCode:''};
}
const isPath = (p, prefix) => p.startsWith(prefix);
async function handler(req, env) {
  const u = new URL(req.url), p = u.pathname, m = req.method;
  if (!env.DB) fail(500, 'Chưa kết nối cơ sở dữ liệu D1.');
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(m)) requireSameOrigin(req);
  if (m === 'GET' && p === '/api/meta') {
    const settings = await getSettings(env);
    const admin = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
    return json({ site_name: settings.site_name, announcement: settings.announcement,
      signup_enabled: settings.signup_enabled === '1', setup_required: admin.n === 0,
      google_auth_enabled: googleReady(env), gmail_google_required: googleReady(env),
      checkin_reward: int(settings.checkin_reward), referral_reward: int(settings.referral_reward),
      withdrawals_enabled: settings.withdrawals_enabled === '1' && int(settings.lua_per_vnd) > 0,
      min_withdraw_lua: int(settings.min_withdraw_lua), lua_per_vnd: int(settings.lua_per_vnd) });
  }
  if (m === 'POST' && p === '/api/setup') {
    const b = await readBody(req), email = normEmail(b.email), password = b.password;
    if (!env.SETUP_KEY || env.SETUP_KEY.length < 24) fail(503, 'Chưa đặt SETUP_KEY an toàn ở máy chủ.');
    if (b.setup_key !== env.SETUP_KEY) fail(403, 'Mã thiết lập Admin không đúng.');
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
    if (count.n) fail(409, 'Admin đã được khởi tạo.');
    ensureEmail(email); ensurePassword(password);
    const name = str(b.name, 70);
    if (name.length < 2) fail(400, 'Nhập tên ít nhất 2 ký tự.');
    const newId = await registerUser(env, { email, password, name, role: 'admin', ip: clientIP(req) });
    return json({ ok: true, message: 'Đã tạo tài khoản Admin.', id: newId }, 201,
      { 'Set-Cookie': await createSession(req, env, newId) });
  }
  if (m === 'POST' && p === '/api/auth/register') {
    const b = await readBody(req), settings = await getSettings(env);
    if (settings.signup_enabled !== '1') fail(403, 'Hệ thống tạm khóa đăng ký.');
    const email = normEmail(b.email), password = b.password, name = str(b.name, 70);
    if (b.accept_terms !== 'yes') fail(400, 'Bạn cần đồng ý với điều khoản và chính sách dữ liệu.');
    ensureEmail(email); ensurePassword(password);
    preventDisposable(email);
    if(googleReady(env)&&gmailDomain(email.split('@')[1]))
      fail(400,'Gmail mới phải đăng ký bằng Google để xác minh địa chỉ. Tài khoản cũ vẫn đăng nhập bằng mật khẩu.');
    if(name.length<2)fail(400,'Họ tên cần ít nhất 2 ký tự.');
    const ip=clientIP(req);
    await signupRateLimit(env,req,email);
    if(await registeredEmail(env,email))fail(409,'Email đã được đăng ký hoặc trùng biến thể Gmail.');
    const ref = str(b.referral_code, 30).toUpperCase();
    const refUser = ref ? await env.DB.prepare('SELECT id FROM users WHERE referral_code=? AND status=\'active\'').bind(ref).first() : null;
    if (ref && !refUser) fail(400, 'Mã giới thiệu không tồn tại.');
    const userId = await registerUser(env, { email, password, name, role: 'member', ip, referredBy: refUser?.id });
    await event(env,req,'signup_completed',userId,'email_password');
    return json({ ok: true, message: 'Đăng ký thành công.' }, 201, { 'Set-Cookie': await createSession(req, env, userId) });
  }

  if(m==='GET' && p==='/api/auth/google/pending'){
    const pending=await pendingGoogleSignup(req,env);
    return json(pending?{pending:true,email:pending.identity.email,name:pending.identity.name}:{pending:false});
  }
  if(m==='POST' && p==='/api/auth/google/cancel'){
    const token=pendingGoogleToken(req);
    if(token)await env.DB.prepare('DELETE FROM settings WHERE key=?').bind('google_signup_pending:'+token).run();
    return json({ok:true},200,{'Set-Cookie':googlePendingCookie(req,'',0)});
  }
  if(m==='POST' && p==='/api/auth/google/complete'){
    if(!googleReady(env))fail(503,'Google chưa được cấu hình.');
    const b=await readBody(req);
    if(b.accept_terms!=='yes')fail(400,'Bạn cần đồng ý điều khoản và chính sách quyền riêng tư.');
    const pending=await pendingGoogleSignup(req,env);
    if(!pending)fail(401,'Phiên đăng ký Google đã hết hạn. Vui lòng thử lại.');
    const settings=await getSettings(env);
    if(settings.signup_enabled!=='1')fail(403,'Hệ thống đang tắt đăng ký mới.');
    const identity=pending.identity;
    ensureEmail(identity.email);
    preventDisposable(identity.email);
    if(await googleIdentity(env,identity.sub)||await registeredEmail(env,identity.email))
      fail(409,'Email đã có tài khoản. Hãy đăng nhập tài khoản cũ để liên kết Google.');
    await signupRateLimit(env,req,identity.email);
    const removed=await env.DB.prepare('DELETE FROM settings WHERE key=?').bind('google_signup_pending:'+pending.token).run();
    if(!removed.meta?.changes)fail(409,'Phiên đăng ký Google đã được sử dụng.');
    const userId=await registerGoogleMember(env,req,identity,null);
    const response=json({ok:true,message:'Đăng ký Google thành công.'});
    response.headers.append('Set-Cookie',googlePendingCookie(req,'',0));
    response.headers.append('Set-Cookie',await createSession(req,env,userId));
    return response;
  }
  if(m==='POST' && p==='/api/auth/google/start'){
    if(!googleReady(env))fail(503,'Đăng nhập Google chưa được cấu hình.');
    const redirectUri=googleCallbackUri(env);
    if(!URL.canParse(redirectUri)||(!isLocal(req)&&!redirectUri.startsWith('https://')))
      fail(503,'GOOGLE_REDIRECT_URI phải là URL HTTPS.');
    if(new URL(req.url).origin!==new URL(redirectUri).origin)
      fail(400,'Vui lòng mở https://nhiemvu.click để sử dụng Google.');
    const body=await readBody(req),intent=str(body.intent,20);
    if(!['login','register','link'].includes(intent))fail(400,'Thao tác Google không hợp lệ.');
    const settings=await getSettings(env);
    let linkingId='';
    if(intent==='link')linkingId=(await auth(req,env)).id;
    if(intent==='register'){
      if(settings.signup_enabled!=='1')fail(403,'Hệ thống đang tắt đăng ký mới.');
      if(body.accept_terms!=='yes')fail(400,'Bạn cần đồng ý điều khoản trước khi đăng ký Google.');
    }
    const ref=intent==='register'?str(body.referral_code,30).toUpperCase():'';
    if(ref){
      const inviter=await env.DB.prepare("SELECT id FROM users WHERE referral_code=? AND status='active'").bind(ref).first();
      if(!inviter)fail(400,'Mã giới thiệu không tồn tại.');
    }
    const state=newToken(),nonce=newToken();
    await env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)')
     .bind('google_oauth_flow:'+state,JSON.stringify({nonce,intent,ref,linkingId,expires:now()+OAUTH_WINDOW_MS})).run();
    const endpoint=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for(const [k,v] of Object.entries({
      client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirectUri,
      response_type:'code',scope:'openid email profile',state,nonce,prompt:'select_account'
    }))endpoint.searchParams.set(k,v);
    return json({url:endpoint.toString()},200,{'Set-Cookie':googleCookie(req,state)});
  }
  if(m==='GET' && p==='/api/auth/google/callback'){
    const cookie=cookies(req)['__Host-tl_google_state']||cookies(req).tl_google_state;
    const state=str(u.searchParams.get('state'),100);
    try{
      if(!googleReady(env))fail(503,'Google chưa được bật.',{auth_code:'not_ready'});
      if(!/^[a-f0-9]{64}$/.test(state)||state!==cookie)
        fail(401,'Phiên Google không hợp lệ.',{auth_code:'expired'});
      const flowRow=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('google_oauth_flow:'+state).first();
      if(!flowRow)fail(401,'Phiên Google không còn hiệu lực.',{auth_code:'expired'});
      const removed=await env.DB.prepare('DELETE FROM settings WHERE key=?').bind('google_oauth_flow:'+state).run();
      if(!removed.meta?.changes)fail(401,'Phiên Google đã được sử dụng.',{auth_code:'expired'});
      let flow;
      try{flow=JSON.parse(flowRow.value);}catch{fail(401,'Phiên Google sai định dạng.',{auth_code:'expired'});}
      if(!flow||flow.expires<now()||!flow.nonce||!['login','register','link'].includes(flow.intent))
        fail(401,'Phiên Google đã hết hạn.',{auth_code:'expired'});
      const code=u.searchParams.get('code')||'';
      if(u.searchParams.get('error')||code.length<8||code.length>4096)
        fail(400,'Đã hủy đăng nhập Google.',{auth_code:'cancelled'});
      const tokenRes=await fetch('https://oauth2.googleapis.com/token',{
       method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
       body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,
        client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:googleCallbackUri(env),
        grant_type:'authorization_code'}).toString()
      });
      if(!tokenRes.ok)fail(401,'Google không xác nhận được mã.',{auth_code:'failed'});
      const identity=await verifyGoogleIdToken((await tokenRes.json()).id_token,env,flow.nonce);
      ensureEmail(identity.email);preventDisposable(identity.email);
      const mapped=await googleIdentity(env,identity.sub);
      let userId='';
      if(flow.intent==='link'){
        const me=await auth(req,env);
        if(flow.linkingId!==me.id)fail(403,'Tài khoản đăng nhập đã thay đổi.',{auth_code:'expired'});
        if(canonicalEmail(me.email)!==canonicalEmail(identity.email))
          fail(409,'Email Google phải trùng email tài khoản Trạm Lúa.',{auth_code:'email_mismatch'});
        await connectGoogleIdentity(env,identity.sub,me.id);
        userId=me.id;
      }else if(mapped){
        const found=await env.DB.prepare('SELECT id,status FROM users WHERE id=?').bind(mapped.value).first();
        if(!found)fail(403,'Tài khoản không tồn tại.',{auth_code:'failed'});
        if(found.status!=='active')
          return googleReturn(req,'',await createSession(req,env,found.id));
        userId=found.id;
      }else{
        // Gmail đã dùng đăng ký mật khẩu: Google chứng minh quyền sở hữu hộp thư.
        // Chỉ tự liên kết tài khoản thành viên, không tự giành quyền Admin,
        // và không ghép tài khoản Google của tên miền email bên thứ ba.
        if(flow.intent==='login'&&gmailDomain(identity.email.split('@')[1])){
          const matched=await registeredEmail(env,identity.email);
          if(matched){
            const existing=await env.DB.prepare('SELECT id,role,status FROM users WHERE id=?').bind(matched.id).first();
            if(!existing)fail(403,'Tài khoản không tồn tại.',{auth_code:'failed'});
            if(existing.status!=='active')
              return googleReturn(req,'',await createSession(req,env,existing.id));
            if(existing.role!=='member')
              fail(409,'Tài khoản quản trị cần liên kết Google trong Hồ sơ.',{auth_code:'email_exists'});
            const attached=await googleForUser(env,existing.id);
            if(attached&&attached.value!==identity.sub)
              fail(409,'Tài khoản đã liên kết Google khác.',{auth_code:'email_exists'});
            await connectGoogleIdentity(env,identity.sub,existing.id);
            userId=existing.id;
          }
        }
        if(!userId&&flow.intent==='login'){
          if(await registeredEmail(env,identity.email))
            fail(409,'Email đã có tài khoản. Hãy đăng nhập bằng mật khẩu rồi liên kết Google.',{auth_code:'email_exists'});
          const currentSettings=await getSettings(env);
          if(currentSettings.signup_enabled!=='1')
            fail(403,'Hệ thống đã tắt đăng ký mới.',{auth_code:'signup_closed'});
          const signupToken=newToken();
          await env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)')
            .bind('google_signup_pending:'+signupToken,JSON.stringify({
              identity:{sub:identity.sub,email:identity.email,name:identity.name},
              expires:now()+OAUTH_WINDOW_MS
            })).run();
          return googleReturn(req,'','',signupToken);
        }
        if(!userId){
          const settings=await getSettings(env);
          if(settings.signup_enabled!=='1')fail(403,'Hệ thống đã tắt đăng ký.',{auth_code:'signup_closed'});
          if(await registeredEmail(env,identity.email))
            fail(409,'Email đã có tài khoản. Hãy đăng nhập mật khẩu và liên kết Google.',{auth_code:'email_exists'});
          await signupRateLimit(env,req,identity.email);
          let referredBy=null;
          if(flow.ref){
            const inviter=await env.DB.prepare("SELECT id FROM users WHERE referral_code=? AND status='active'").bind(flow.ref).first();
            if(!inviter)fail(400,'Mã giới thiệu không hợp lệ.',{auth_code:'bad_ref'});
            referredBy=inviter.id;
          }
          userId=await registerGoogleMember(env,req,identity,referredBy);
        }
      }
      return googleReturn(req,'',await createSession(req,env,userId));
    }catch(err){
      return googleReturn(req,err instanceof HttpError?err.extra?.auth_code||'failed':'failed');
    }
  }

  if (m === 'POST' && p === '/api/auth/login') {
    const b = await readBody(req), email = normEmail(b.email), password = String(b.password || '');
    const ip = clientIP(req);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip=? AND success=0 AND created_at>=datetime('now','-15 minutes')").bind(ip).first();
    if (n.n >= 12) fail(429, 'Đăng nhập sai quá nhiều. Vui lòng thử sau 15 phút.');
    const user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    const correct = user && password && await checkPassword(password, user);
    await env.DB.prepare('INSERT INTO login_attempts(id,ip,email,success) VALUES(?,?,?,?)').bind(id(), ip, email, correct ? 1 : 0).run();
    if (!correct) { await event(env, req, 'login_failed', user?.id || null, email); fail(401, 'Email hoặc mật khẩu không đúng.'); }
    if (user.status !== 'active')
      return json({error:'Tài khoản đang tạm khóa để kiểm tra.',...(await suspendedInfo(env,user.id))},403);
    return json({ ok: true }, 200, { 'Set-Cookie': await createSession(req, env, user.id) });
  }
  if (m === 'POST' && p === '/api/auth/logout') {
    const token = cookies(req)['__Host-kl_session'] || cookies(req).kl_session;
    if (token && /^[a-f0-9]{64}$/.test(token)) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  // Phiên bị tạm khóa vẫn xem được tình trạng xét duyệt và rút tiền của chính mình.
  if (m === 'GET' && p === '/api/account-status') {
    const current=await userSession(req,env);
    if(!current)fail(401,'Bạn cần đăng nhập.');
    return json(current.status==='suspended'
      ?await suspendedInfo(env,current.id):{account_status:'active'});
  }
  if (m === 'GET' && p === '/api/me') {
    const me = await auth(req, env);
    const result = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by=?').bind(me.id).first();
    const earned = await env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM wallet_entries WHERE user_id=? AND amount>0').bind(me.id).first();
    const code=await deviceCode(req,env),ip=clientIP(req);
    // Bổ sung nhật ký IP hiện tại một lần/ngày theo tài khoản, IP và mã.
    const seen=await env.DB.prepare("SELECT id FROM risk_events WHERE user_id=? AND device_code=? AND ip=? AND event_type='device_seen' AND created_at>=datetime('now','-1 day') LIMIT 1").bind(me.id,code,ip).first();
    if(!seen)await event(env,req,'device_seen',me.id,browserDeviceId(req)?'browser_id':'temporary');
    return json({ user: me, balance: await wallet(env, me.id), earned: earned.n, referral_count: result.n,
      ip, device_code: code, device_registered: Boolean(browserDeviceId(req)),
      google_linked:Boolean(await googleForUser(env,me.id)) });
  }
  if (m === 'POST' && p === '/api/me/ipv4-report') {
    const me = await auth(req, env), body = await readBody(req);
    const reported = str(body.ip, 48), actual = clientIP(req);
    if (!isPublicIPv4(reported)) fail(400, 'IPv4 công khai được gửi không hợp lệ.');
    // Nếu kết nối đến Cloudflare bằng IPv4, phải khớp chính địa chỉ Cloudflare quan sát.
    // Nếu kết nối bằng IPv6 thì đây chỉ là báo cáo từ trình duyệt, không xác minh độc lập.
    if (isPublicIPv4(actual) && reported !== actual)
      fail(409, 'IPv4 trình duyệt báo không khớp với kết nối đến máy chủ.');
    const seen = await env.DB.prepare(`SELECT id FROM risk_events
      WHERE event_type='browser_ipv4_report' AND user_id=? AND ip=? AND detail=?
       AND created_at>=datetime('now','-1 day') LIMIT 1`)
      .bind(me.id, actual, reported).first();
    if (!seen) await event(env, req, 'browser_ipv4_report', me.id, reported);
    return json({ ok:true, recorded:true, verified_by_cloudflare:reported===actual });
  }
  if (m === 'POST' && p === '/api/me/password') {
    const me = await auth(req, env), b = await readBody(req);
    ensurePassword(b.new_password);
    const oldUser = await env.DB.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(me.id).first();
    if (!await checkPassword(String(b.old_password || ''), oldUser)) fail(400, 'Mật khẩu cũ không đúng.');
    const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').bind(await passwordDigest(b.new_password, salt), salt, me.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(me.id)
    ]);
    return json({ ok: true, message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' }, 200,
      { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  if (m === 'GET' && p === '/api/tasks') {
    const me = await auth(req, env);
    const results = await env.DB.prepare(`SELECT t.*, c.status AS my_status FROM tasks t
      LEFT JOIN task_completions c ON c.task_id=t.id AND c.user_id=?
      AND c.period_key=CASE WHEN t.repeat_policy='daily' THEN ? ELSE '*' END
      WHERE t.is_active=1 ORDER BY t.created_at DESC LIMIT 100`).bind(me.id, vnDay()).all();
    const settings=await getSettings(env),ip=clientIP(req);
    const used=await linkIPUsage(env,ip,me.id),limit=quotaNumber(settings,'quota_link_tasks_ip_24h');
    const browserCode=browserDeviceId(req)?await deviceCode(req,env):'';
    const browserUsed=await linkBrowserUsage(env,browserCode,me.id);
    const browserLimit=quotaNumber(settings,'quota_link_tasks_device_24h');
    const browserDenied=!browserCode?'link_browser_missing':
      settings.quota_link_device_exclusive!=='0'&&browserUsed.other>0?'link_browser_owner':
      browserLimit>0&&browserUsed.total>=browserLimit?'link_browser_limit':null;
    const denied=settings.quota_link_ip_exclusive!=='0'&&used.other>0?'link_owner':
      limit>0&&used.total>=limit?'link_limit':null;
    // Record a shared-network warning even when the disabled task button prevents a POST.
    const conflict=denied==='link_owner'?'link_ip_quota_denied':browserDenied==='link_browser_owner'?'link_browser_quota_denied':null;
    if(conflict){
      const seen=await env.DB.prepare(`SELECT id FROM risk_events WHERE user_id=? AND ip=? AND device_code=?
        AND event_type=? AND (detail LIKE 'link_owner:%' OR detail LIKE 'link_browser_owner:%')
        AND date(created_at,'+7 hours')=date('now','+7 hours') LIMIT 1`)
        .bind(me.id,ip,browserCode,conflict).first();
      if(!seen)await event(env,req,conflict,me.id,(denied==='link_owner'?'link_owner':'link_browser_owner')+':list');
    }
    const [overrides,counts]=await Promise.all([
      env.DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'link_task_limit:%' OR key LIKE 'app_referral_code:%'").all(),
      env.DB.prepare("SELECT task_id,COUNT(*) AS n,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending FROM task_completions WHERE user_id=? AND status IN ('pending','approved') AND date(created_at,'+7 hours')=date('now','+7 hours') GROUP BY task_id").bind(me.id).all()
    ]);
    const limits=new Map(overrides.results.map(r=>[r.key,int(r.value,1)]));
    const done=new Map(counts.results.map(r=>[r.task_id,{n:Number(r.n),pending:Number(r.pending||0)}]));
    const tasks=results.results.map(t=>{
      const appCode=str(overrides.results.find(r=>r.key==='app_referral_code:'+t.id)?.value,80);
      const displayCategory=t.category==='other'&&appCode?'app':t.category;
      const max=t.category==='link'?limits.get('link_task_limit:'+t.id)||1:1;
      const entry=done.get(t.id)||{n:0,pending:0},used=entry.n;
      const blocked=t.category==='link'?(max>1&&used>=max?'link_task_limit':(browserDenied||denied)):null;
      return {...t,category:displayCategory,app_referral_code:displayCategory==='app'?appCode:'',link_24h_limit:max,link_24h_count:used,link_blocked:blocked,
        my_status:t.category==='link'&&max>1?(used>=max?(entry.pending>0?'pending':'approved'):null):t.my_status};
    });
    return json({tasks,link_quota:{limit,used:used.total,blocked:denied,
      exclusive:settings.quota_link_ip_exclusive!=='0',reset_timezone:'Asia/Ho_Chi_Minh',reset_at_hour:0},
      browser_quota:{limit:browserLimit,used:browserUsed.total,blocked:browserDenied,
        exclusive:settings.quota_link_device_exclusive!=='0',reset_timezone:'Asia/Ho_Chi_Minh',reset_at_hour:0}});
  }
  if (m === 'GET' && p === '/api/task-dashboard') {
    const me=await auth(req,env),today=vnDay();
    const [todayLua,linkLua,submittedToday,latest] = await Promise.all([
      env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM wallet_entries WHERE user_id=? AND amount>0 AND date(created_at,'+7 hours')=?").bind(me.id,today).first(),
      env.DB.prepare("SELECT COALESCE(SUM(c.reward),0) AS n FROM task_completions c JOIN tasks t ON t.id=c.task_id WHERE c.user_id=? AND c.status='approved' AND t.category='link'").bind(me.id).first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE user_id=? AND status IN ('pending','approved') AND date(created_at,'+7 hours')=?").bind(me.id,today).first(),
      env.DB.prepare("SELECT bank_account,vnd_amount,reviewed_at FROM withdrawals WHERE status='paid' ORDER BY reviewed_at DESC LIMIT 1").first()
    ]);
    return json({
      today_lua:todayLua.n,link_lua:linkLua.n,submitted_today:submittedToday.n,
      next_reset_at:Date.parse(today+'T00:00:00+07:00')+DAY,
      ip:clientIP(req),device_code:await deviceCode(req,env),device_registered:Boolean(browserDeviceId(req)),
      latest_payment:latest?{masked_account:maskedAccount(latest.bank_account),vnd_amount:latest.vnd_amount,at:latest.reviewed_at}:null
    });
  }
  const startMatch = p.match(/^\/api\/tasks\/([^/]+)\/start$/);
  if (m === 'POST' && startMatch) {
    const me = await auth(req, env), task = await env.DB.prepare('SELECT * FROM tasks WHERE id=? AND is_active=1').bind(startMatch[1]).first();
    if (!task) fail(404, 'Nhiệm vụ không còn hoạt động.');
    task.category=await resolveTaskCategory(env,task);
    if(await linkTaskPerAccountLimit(env,task)<=1){
      const existing=await env.DB.prepare('SELECT id FROM task_completions WHERE user_id=? AND task_id=? AND period_key=?')
        .bind(me.id,task.id,period(task)).first();
      if(existing)fail(409,'Bạn đã nhận hoặc gửi yêu cầu cho nhiệm vụ này trong kỳ.');
    }
    const settings=await getSettings(env);
    await taskQuota(env,req,me.id,settings,task.category);
    await linkIPQuota(env,req,me.id,task,settings);
    await linkBrowserQuota(env,req,me.id,task,settings);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM task_attempts WHERE user_id=? AND created_at>=datetime('now','-15 minutes')").bind(me.id).first();
    if (count.n >= 30) { await event(env, req, 'too_many_task_starts', me.id); fail(429, 'Bạn mở nhiệm vụ quá nhiều lần. Vui lòng thử lại sau.'); }
    const a = rand(), b = rand(), attempt = id(), available = now() + (task.category === 'video' ? task.min_seconds * 1000 : 0);
    await env.DB.prepare(`INSERT INTO task_attempts(id,user_id,task_id,captcha_a,captcha_b,available_at,expires_at,ip,device_code)
       VALUES(?,?,?,?,?,?,?,?,?)`).bind(attempt, me.id, task.id, a, b, available, now() + 20 * 60000,
      clientIP(req), await deviceCode(req, env)).run();
    return json({ attempt_id: attempt, a, b, available_at: available, expires_in_seconds: 1200,
      review_mode: task.review_mode, category: task.category, task_url: task.url });
  }
  const submitMatch = p.match(/^\/api\/tasks\/([^/]+)\/submit$/);
  if (m === 'POST' && submitMatch) {
    const me = await auth(req, env), body = await readBody(req, 260000), task = await env.DB.prepare('SELECT * FROM tasks WHERE id=? AND is_active=1').bind(submitMatch[1]).first();
    if (!task) fail(404, 'Nhiệm vụ đã ngừng hoạt động.');
    task.category=await resolveTaskCategory(env,task);
    const attempt = await env.DB.prepare('SELECT * FROM task_attempts WHERE id=? AND user_id=? AND task_id=?')
      .bind(str(body.attempt_id, 60), me.id, task.id).first();
    if (!attempt || attempt.consumed_by || attempt.expires_at <= now()) fail(410, 'Phiên nhiệm vụ hết hạn. Vui lòng mở lại nhiệm vụ.');
    if (task.category === 'video' && now() < attempt.available_at) fail(425, 'Chưa đủ thời gian thực hiện nhiệm vụ.', { remaining_seconds: Math.ceil((attempt.available_at - now()) / 1000) });
    if (Number(body.answer) !== attempt.captcha_a + attempt.captcha_b || !/^\d+$/.test(String(body.answer))) {
      const a = rand(), b = rand();
      await env.DB.prepare('UPDATE task_attempts SET captcha_a=?,captcha_b=? WHERE id=? AND consumed_by IS NULL').bind(a, b, attempt.id).run();
      await event(env, req, 'captcha_wrong', me.id, `task:${task.id}`);
      fail(422, 'Phép tính chưa đúng. Hãy giải phép tính mới.', { a, b });
    }
    const evidence = task.category === 'app' ? appPhotoEvidence(body.evidence, body.photo) : str(body.evidence, 2000);
    if (task.category !== 'app' && task.review_mode === 'manual' && evidence.length < 12) fail(400, 'Nhiệm vụ này cần bằng chứng ít nhất 12 ký tự.');
    if(task.category==='link'&&attempt.ip!==clientIP(req))
      fail(409,'IP mạng thay đổi trong lúc thực hiện link. Hãy mở nhiệm vụ lại trên mạng hiện tại.');
    const settings=await getSettings(env);
    const quota=await taskQuota(env,req,me.id,settings,task.category);
    if(task.category==='link'&&attempt.device_code!==await deviceCode(req,env))
      fail(409,'Mã trình duyệt thay đổi trong lúc làm nhiệm vụ link. Vui lòng mở lại trên cùng trình duyệt.');
    const link=await linkIPQuota(env,req,me.id,task,settings);
    const browserLink=await linkBrowserQuota(env,req,me.id,task,settings);
    const completionId = id();
    const status = task.review_mode === 'manual' ? 'pending' : 'approved';
    const completionPeriod=link.perTask>1?'link24:'+completionId:period(task);
    const batch = await env.DB.batch([
      env.DB.prepare(TASK_CLAIM_UPDATE)
        .bind(completionId, attempt.id, me.id, now(), now(), task.category,
          quota.maxUser,me.id,quota.day,quota.maxUser,
          quota.maxIP,quota.ip,me.id,quota.day,quota.maxIP,
          quota.maxDevice,quota.device,me.id,quota.day,quota.maxDevice,
          link.enabled,link.ip,link.limit,
          link.owner,link.ip,me.id,
          link.perTask,me.id,task.id,link.perTask,
          browserLink.enabled,browserLink.code,browserLink.limit,
          browserLink.owner,browserLink.code,me.id),
      env.DB.prepare(`INSERT OR IGNORE INTO task_completions
        (id,user_id,task_id,period_key,status,reward,evidence,ip,device_code)
        SELECT ?,?,?,?,?,?,?,?,? FROM task_attempts
        WHERE id=? AND user_id=? AND consumed_by=?`)
        .bind(completionId, me.id, task.id, completionPeriod, status, task.reward, evidence,
          clientIP(req), await deviceCode(req, env), attempt.id, me.id, completionId),
      env.DB.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
        SELECT ?,?,?,?,'task',? WHERE EXISTS
        (SELECT 1 FROM task_completions WHERE id=? AND status='approved')
        ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`)
        .bind(id(), me.id, task.reward, `Nhiệm vụ: ${task.title}`, completionId, completionId)
    ]);
    if ((batch[0].meta?.changes || 0) < 1 || (batch[1].meta?.changes || 0) < 1) {
      if(task.category==='link'){
        await linkIPQuota(env,req,me.id,task,settings);
        await linkBrowserQuota(env,req,me.id,task,settings);
      }
      fail(409,'Nhiệm vụ đã được gửi hoặc nhận thưởng trước đó.');
    }
    if (status === 'approved') await giveReferral(env, me.id, await getSettings(env));
    return json({ ok: true, status, reward: task.reward,
      message: status === 'approved' ? 'Đã ghi nhận Lúa vào ví.' : 'Đã gửi bằng chứng, đang chờ Admin duyệt.' });
  }
  if (m === 'GET' && p === '/api/history') {
    const me = await auth(req, env);
    const [walletEntries, completionRows, withdrawals] = await Promise.all([
      env.DB.prepare('SELECT * FROM wallet_entries WHERE user_id=? ORDER BY created_at DESC LIMIT 80').bind(me.id).all(),
      env.DB.prepare(`SELECT c.id,c.user_id,c.task_id,c.period_key,c.status,c.reward,
            CASE WHEN substr(c.evidence,1,13)='APP_PHOTO_V1|' THEN '[Ảnh bằng chứng đã gửi]' ELSE c.evidence END AS evidence,
            c.ip,c.device_code,c.created_at,c.reviewed_at,t.title FROM task_completions c JOIN tasks t ON t.id=c.task_id
          WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT 80`).bind(me.id).all(),
      env.DB.prepare('SELECT * FROM withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT 80').bind(me.id).all()
    ]);
    return json({ wallet_entries: walletEntries.results, completions: completionRows.results,
      withdrawals: withdrawals.results.map(presentWithdrawal) });
  }
  if (m === 'GET' && p === '/api/referrals') {
    const me = await auth(req, env);
    const result = await env.DB.prepare('SELECT name,created_at FROM users WHERE referred_by=? ORDER BY created_at DESC LIMIT 100').bind(me.id).all();
    return json({ referrals: result.results, referral_code: me.referral_code });
  }
  if (m === 'POST' && p === '/api/checkin') {
    const me = await auth(req, env), settings = await getSettings(env), reward = int(settings.checkin_reward), day = vnDay();
    const results = await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO checkins(user_id,day) VALUES(?,?)').bind(me.id, day),
      // Nếu thưởng bằng 0, vẫn điểm danh nhưng không tạo dòng ví 0.
      env.DB.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
        SELECT ?,?,?, 'Điểm danh hằng ngày','checkin',? WHERE ?>0 AND EXISTS
        (SELECT 1 FROM checkins WHERE user_id=? AND day=?)
        ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`)
        .bind(id(), me.id, Math.max(1, reward), day, reward, me.id, day)
    ]);
    if (!results[0].meta?.changes) fail(409, 'Bạn đã điểm danh hôm nay.');
    return json({ ok: true, reward, message: 'Điểm danh thành công.' });
  }
  if (m === 'GET' && p === '/api/checkin') {
    const me = await auth(req, env);
    const check = await env.DB.prepare('SELECT day FROM checkins WHERE user_id=? AND day=?').bind(me.id, vnDay()).first();
    return json({ checked_today: !!check, today: vnDay() });
  }
  if (m === 'POST' && p === '/api/withdrawals') {
    const me = await auth(req, env), b = await readBody(req), settings = await getSettings(env);
    const rate = int(settings.lua_per_vnd), amount = Number(b.amount);
    if (settings.withdrawals_enabled !== '1' || rate <= 0) fail(403, 'Admin chưa bật chức năng rút tiền hoặc chưa đặt tỷ giá.');
    if (!positive(amount, 1000000000) || amount < int(settings.min_withdraw_lua)) fail(400, `Yêu cầu tối thiểu ${settings.min_withdraw_lua} Lúa.`);
    if (amount % rate !== 0) fail(400, `Số Lúa cần chia hết cho ${rate} để quy đổi ra VNĐ.`);
    // Dùng các cột ngân hàng sẵn có để lưu 2 kênh nhận tiền, không cần migration D1.
    // Dữ liệu cũ không có payment_method vẫn được hiểu là chuyển khoản ngân hàng.
    const method = str(b.payment_method || 'bank', 20);
    if (!['bank','zalopay'].includes(method)) fail(400, 'Phương thức nhận tiền không hợp lệ.');
    const bank = method === 'zalopay' ? 'ZaloPay' :
      str(b.bank_name === 'other' ? b.bank_other : b.bank_name, 90);
    const account = method === 'zalopay' ? str(b.zalopay_phone, 40) : str(b.bank_account, 40);
    const owner = method === 'zalopay' ? str(b.zalopay_owner, 100) : str(b.bank_owner, 100);
    if (method === 'bank' && (bank.length < 2 || bank.toLowerCase() === 'zalopay' || !/^[0-9]{5,30}$/.test(account) || owner.length < 3))
      fail(400, 'Thông tin tài khoản ngân hàng chưa hợp lệ.');
    if (method === 'zalopay' && (!/^0[0-9]{9}$/.test(account) || owner.length < 3))
      fail(400, 'Vui lòng nhập số điện thoại ZaloPay Việt Nam gồm 10 số và tên người nhận.');
    const wid = id();
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO withdrawals(id,user_id,amount,vnd_amount,rate_lua_per_vnd,bank_name,bank_account,bank_owner)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(amount),0) FROM wallet_entries WHERE user_id=?) >= ?`)
        .bind(wid, me.id, amount, amount / rate, rate, bank, account, owner, me.id, amount),
      env.DB.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
        SELECT ?,?,-?,'Giữ Lúa cho yêu cầu rút','withdraw_hold',? WHERE EXISTS
        (SELECT 1 FROM withdrawals WHERE id=? AND user_id=? AND status='pending')`)
        .bind(id(), me.id, amount, wid, wid, me.id)
    ]);
    if (!results[0].meta?.changes) fail(400, 'Số dư Lúa không đủ để rút.');
    return json({ ok: true, message: 'Yêu cầu rút tiền đã được lưu, chờ Admin xử lý.', id: wid });
  }
  // -------------------- KHU VỰC ADMIN --------------------
  if (isPath(p, '/api/admin/')) {
    const admin = await auth(req, env, 'admin');
    if (m === 'GET' && p === '/api/admin/overview') {
      const queries = [
        "SELECT COUNT(*) n FROM users WHERE role='member'",
        'SELECT COUNT(*) n FROM tasks WHERE is_active=1',
        "SELECT COUNT(*) n FROM task_completions WHERE status='pending'",
        "SELECT COUNT(*) n FROM withdrawals WHERE status='pending' AND admin_note NOT LIKE '[TL_WITHDRAWAL_APPROVED] %'",
        "SELECT COALESCE(SUM(amount),0) n FROM wallet_entries WHERE amount>0",
        "SELECT COUNT(*) n FROM risk_events WHERE date(created_at,'+7 hours')=date('now','+7 hours')"
      ];
      const r = await Promise.all(queries.map(q => env.DB.prepare(q).first()));
      return json({ members: r[0].n, tasks: r[1].n, pending_evidence: r[2].n,
        pending_withdrawals: r[3].n, total_issued_lua: r[4].n, risk_events_today: r[5].n });
    }
    if (m === 'GET' && p === '/api/admin/tasks') {
      const [rows,settings]=await Promise.all([
        env.DB.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 200').all(),
        env.DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'link_task_limit:%' OR key LIKE 'app_referral_code:%'").all()
      ]);
      const limits=new Map(settings.results.map(r=>[r.key,int(r.value,1)]));
      return json({tasks:rows.results.map(t=>{const appCode=str(settings.results.find(r=>r.key==='app_referral_code:'+t.id)?.value,80);return {...t,category:t.category==='other'&&appCode?'app':t.category,link_24h_limit:limits.get('link_task_limit:'+t.id)||1,app_referral_code:appCode};})});
    }
    if (m === 'POST' && p === '/api/admin/tasks') {
      const t = validateTaskBody(await readBody(req)), taskId = id();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO tasks(id,title,description,category,url,reward,min_seconds,review_mode,repeat_policy,is_active)
          VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(taskId,t.title,t.description,storedTaskCategory(t.category),t.url,t.reward,t.minSeconds,t.review,t.repeat,t.active),
        env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('link_task_limit:'+taskId,String(t.linkLimit)),
        env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('app_referral_code:'+taskId,t.appCode)
      ]);
      return json({ ok: true, id: taskId }, 201);
    }
    const taskEdit = p.match(/^\/api\/admin\/tasks\/([^/]+)$/);
    if (m === 'PATCH' && taskEdit) {
      const t = validateTaskBody(await readBody(req));
      const exists=await env.DB.prepare('SELECT id FROM tasks WHERE id=?').bind(taskEdit[1]).first();
      if(!exists)fail(404,'Không tìm thấy nhiệm vụ.');
      await env.DB.batch([
        env.DB.prepare(`UPDATE tasks SET title=?,description=?,category=?,url=?,reward=?,min_seconds=?,
          review_mode=?,repeat_policy=?,is_active=? WHERE id=?`)
          .bind(t.title,t.description,storedTaskCategory(t.category),t.url,t.reward,t.minSeconds,t.review,t.repeat,t.active,taskEdit[1]),
        env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .bind('link_task_limit:'+taskEdit[1],String(t.linkLimit)),
        env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .bind('app_referral_code:'+taskEdit[1],t.appCode)
      ]);
      return json({ ok: true });
    }
    if (m === 'GET' && p === '/api/admin/users') {
      const rows = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,u.referral_code,u.joined_ip,u.created_at,
        COALESCE((SELECT SUM(amount) FROM wallet_entries w WHERE w.user_id=u.id),0) balance
        FROM users u ORDER BY u.created_at DESC LIMIT 150`).all();
      const observations=await env.DB.prepare(`SELECT user_id,detail AS observed_ipv4,ip AS cloudflare_ip,created_at
        FROM risk_events WHERE event_type='browser_ipv4_report'
          AND created_at>=datetime('now','-7 days') ORDER BY created_at DESC LIMIT 500`).all();
      const latest=new Map();
      for (const row of observations.results) if (!latest.has(row.user_id)) latest.set(row.user_id,row);
      const holdRows=await env.DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'account_hold:%' OR key LIKE 'account_hold_type:%' OR key LIKE 'account_hold_evidence:%'").all();
      const holds=new Map(),types=new Map(),evidence=new Map();
      for(const row of holdRows.results){
       if(row.key.startsWith('account_hold_type:'))types.set(row.key.slice(18),row.value);
       else if(row.key.startsWith('account_hold_evidence:'))evidence.set(row.key.slice(22),row.value);
       else if(row.key.startsWith('account_hold:'))holds.set(row.key.slice(13),row.value);
      }
      return json({users:rows.results.map(u=>({...u,ipv4_observation:latest.get(u.id)||null,
       suspension_type:u.status==='suspended'?(types.get(u.id)==='confirmed'?'confirmed':'review'):null,
       suspension_reason:holds.get(u.id)||'',suspension_evidence:evidence.get(u.id)||''}))});
    }
    const userEdit = p.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (m === 'PATCH' && userEdit) {
      const b = await readBody(req);
      if (!['active', 'suspended'].includes(b.status)) fail(400, 'Trạng thái không hợp lệ.');
      if (userEdit[1] === admin.id) fail(403, 'Bạn không thể tự khóa tài khoản Admin của mình.');
      const reason=str(b.suspension_reason,240);
      const suspensionType=str(b.suspension_type||'review',16);
      const evidence=str(b.suspension_evidence,500);
      if(b.status==='suspended' && reason.length<10)
        fail(400,'Cần ghi lý do tạm khóa rõ ràng (ít nhất 10 ký tự).');
      if(b.status==='suspended'&&!['review','confirmed'].includes(suspensionType))
        fail(400,'Loại khóa không hợp lệ.');
      if(b.status==='suspended'&&suspensionType==='confirmed'&&evidence.length<20)
        fail(400,'Khóa vĩnh viễn phải có mô tả bằng chứng vi phạm ít nhất 20 ký tự.');
      const target=await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='member'").bind(userEdit[1]).first();
      if(!target)fail(404,'Không tìm thấy thành viên.');
      const holdKey='account_hold:'+target.id, typeKey='account_hold_type:'+target.id;
      const evidenceKey='account_hold_evidence:'+target.id;
      const upsertKey=(key,value)=>env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value);
      const deleteKey=key=>env.DB.prepare('DELETE FROM settings WHERE key=?').bind(key);
      const statements=[
       env.DB.prepare("UPDATE users SET status=? WHERE id=? AND role='member'").bind(b.status,target.id),
       b.status==='suspended'?upsertKey(holdKey,reason):deleteKey(holdKey),
       b.status==='suspended'?upsertKey(typeKey,suspensionType):deleteKey(typeKey),
       b.status==='suspended'&&suspensionType==='confirmed'?upsertKey(evidenceKey,evidence):deleteKey(evidenceKey)
      ];
      await env.DB.batch(statements);
      await event(env, req, 'admin_user_status', admin.id, `${target.id}:${b.status}:${b.status==='suspended'?suspensionType:'unlocked'}`);
      return json({ok:true,suspension_type:b.status==='suspended'?suspensionType:null});
    }
    if (m === 'GET' && p === '/api/admin/reviews') {
      const rows = await env.DB.prepare(`SELECT c.id,c.user_id,c.task_id,c.period_key,c.status,c.reward,
        CASE WHEN substr(c.evidence,1,13)='APP_PHOTO_V1|' THEN 1 ELSE 0 END AS has_photo,
        CASE WHEN substr(c.evidence,1,13)='APP_PHOTO_V1|'
          THEN substr(c.evidence,14,instr(substr(c.evidence,14),'|')-1)
          ELSE c.evidence END AS evidence,
        c.ip,c.device_code,c.created_at,c.reviewed_at,t.title,u.name,u.email
        FROM task_completions c JOIN tasks t ON t.id=c.task_id JOIN users u ON u.id=c.user_id
        ORDER BY CASE WHEN c.status='pending' THEN 0 ELSE 1 END, c.created_at DESC LIMIT 150`).all();
      return json({ reviews: rows.results.map(c=>({...c,evidence:c.has_photo?decodeURIComponent(c.evidence):c.evidence})) });
    }
    const proofRead = p.match(/^\/api\/admin\/reviews\/([^/]+)\/photo$/);
    if (m === 'GET' && proofRead) {
      const c = await env.DB.prepare('SELECT evidence FROM task_completions WHERE id=?').bind(proofRead[1]).first();
      const proof = c ? readAppPhoto(c.evidence) : null;
      if (!proof) fail(404, 'Không tìm thấy ảnh bằng chứng.');
      const binary = atob(proof.base64);
      const bytes = Uint8Array.from(binary, char=>char.charCodeAt(0));
      return new Response(bytes, { headers: { ...HEADERS, 'Content-Type':'image/jpeg',
        'Content-Disposition':'inline; filename="tram-lua-app-proof.jpg"' } });
    }
    const review = p.match(/^\/api\/admin\/reviews\/([^/]+)$/);
    if (m === 'POST' && review) {
      const b = await readBody(req);
      if (!['approved', 'rejected'].includes(b.status)) fail(400, 'Trạng thái không hợp lệ.');
      const c = await env.DB.prepare('SELECT * FROM task_completions WHERE id=?').bind(review[1]).first();
      if (!c || c.status !== 'pending') fail(409, 'Không tìm thấy bằng chứng đang chờ duyệt.');
      const actionId = id();
      const r = await env.DB.batch([
        env.DB.prepare("UPDATE task_completions SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'")
          .bind(b.status, c.id),
        env.DB.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
          SELECT ?,?,?,'Admin duyệt nhiệm vụ','task',? WHERE ?='approved' AND EXISTS
          (SELECT 1 FROM task_completions WHERE id=? AND status='approved')
          ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`)
          .bind(actionId, c.user_id, c.reward, c.id, b.status, c.id)
      ]);
      if (!r[0].meta?.changes) fail(409, 'Bằng chứng đã được xử lý.');
      if (b.status === 'approved') await giveReferral(env, c.user_id, await getSettings(env));
      return json({ ok: true });
    }
    if (m === 'GET' && p === '/api/admin/withdrawals') {
      const rows = await env.DB.prepare(`SELECT w.*,u.email,u.name,u.status AS account_status FROM withdrawals w JOIN users u ON u.id=w.user_id
        ORDER BY CASE WHEN w.status='pending' THEN 0 ELSE 1 END,w.created_at DESC LIMIT 150`).all();
      return json({ withdrawals: rows.results.map(presentWithdrawal) });
    }
    const wd = p.match(/^\/api\/admin\/withdrawals\/([^/]+)$/);
    if (m === 'POST' && wd) {
      const b = await readBody(req), status = str(b.status, 20), note = str(b.admin_note, 500);
      if (!['approved','paid','rejected','invalid_account'].includes(status)) fail(400, 'Trạng thái rút tiền không hợp lệ.');
      if (status === 'rejected' && !note) fail(400, 'Cần lý do khi từ chối.');
      if (status === 'paid' && !note) fail(400, 'Nhập mã giao dịch hoặc ghi chú thanh toán thật trước khi xác nhận.');
      const w = await env.DB.prepare('SELECT * FROM withdrawals WHERE id=?').bind(wd[1]).first();
      if (!w || w.status !== 'pending') fail(409, 'Yêu cầu không còn chờ xử lý.');
      if(['approved','paid'].includes(status)){
       const owner=await env.DB.prepare('SELECT status FROM users WHERE id=?').bind(w.user_id).first();
       if(owner?.status==='suspended')fail(409,'Tài khoản đang tạm khóa để đối chiếu. Không được duyệt hoặc ghi thanh toán khi chưa giải quyết.');
      }
      let payoutRiskOverride='',payoutRiskScore=0;
      if(['approved','paid'].includes(status)){
       const profiles=await loadFraudProfiles(env,w.user_id);
       const risk=profiles.find(x=>x.user_id===w.user_id);
       if(risk?.level==='serious'){
        payoutRiskScore=risk.score;
        payoutRiskOverride=str(b.risk_override_note,500);
        if(payoutRiskOverride.length<20)
         fail(409,'Phát hiện nhiều dấu hiệu rủi ro. Cần đối chiếu và ghi lý do cho phép chi trả trước khi tiếp tục.',{
           requires_risk_override:true,risk_score:risk.score,risk_reasons:risk.reasons
         });
       }
      }
      const wasApproved = String(w.admin_note || '').startsWith(WITHDRAWAL_APPROVED_PREFIX);
      if (status === 'approved' && wasApproved) fail(409, 'Yêu cầu đã được duyệt trước đó.');
      if (status === 'paid' && !wasApproved) fail(409, 'Bạn phải duyệt yêu cầu trước khi xác nhận đã thanh toán.');
      if (status === 'approved') {
        // Chưa thanh toán, chưa ghi thêm sổ ví. Prefix để giữ tương thích CHECK
        // status đang có trên các D1 đã triển khai (pending/paid/rejected).
        const approvedNote = WITHDRAWAL_APPROVED_PREFIX + 'Đã duyệt, đang chờ thanh toán.';
        const result = await env.DB.prepare(`UPDATE withdrawals SET admin_note=?
          WHERE id=? AND status='pending' AND admin_note NOT LIKE '[TL_WITHDRAWAL_APPROVED] %'`)
          .bind(approvedNote, w.id).run();
        if (!result.meta?.changes) fail(409, 'Yêu cầu đã thay đổi, vui lòng tải lại.');
        if(payoutRiskOverride)
          await event(env,req,'fraud_payout_override',admin.id,
           `${w.id}:approved:score=${payoutRiskScore}; ${payoutRiskOverride}`);
        await event(env, req, 'admin_withdrawal_action', admin.id, `${w.id}:approved`);
        return json({ ok: true, message: 'Đã duyệt yêu cầu, đang chờ chuyển tiền.' });
      }
      const dbStatus = status === 'invalid_account' ? 'rejected' : status;
      const dbNote = status === 'invalid_account' ? INVALID_BANK_ACCOUNT_PREFIX + invalidBankAccountNote : note;
      const condition = status === 'paid'
        ? " AND admin_note LIKE '[TL_WITHDRAWAL_APPROVED] %'" : '';
      const results = await env.DB.batch([
        env.DB.prepare(`UPDATE withdrawals SET status=?,admin_note=?,reviewed_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='pending'${condition}`)
          .bind(dbStatus, dbNote, w.id),
        env.DB.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
          SELECT ?,?,?,'Hoàn Lúa do từ chối rút','withdraw_refund',? WHERE ?='rejected' AND EXISTS
          (SELECT 1 FROM withdrawals WHERE id=? AND status='rejected')
          ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`)
          .bind(id(), w.user_id, w.amount, w.id, dbStatus, w.id)
      ]);
      if (!results[0].meta?.changes) fail(409, 'Yêu cầu đã được xử lý hoặc thay đổi.');
      if(payoutRiskOverride)
        await event(env,req,'fraud_payout_override',admin.id,
          `${w.id}:${status}:score=${payoutRiskScore}; ${payoutRiskOverride}`);
      await event(env, req, 'admin_withdrawal_action', admin.id, `${w.id}:${status}`);
      return json({ ok: true, message: status === 'paid' ? 'Đã đánh dấu thanh toán. Giao dịch đã được đối chiếu.' : status === 'invalid_account' ? 'Đã báo thông tin nhận tiền không đúng và hoàn Lúa để khách gửi lại.' : 'Đã từ chối và hoàn Lúa.' });
    }
    if (m === 'GET' && p === '/api/admin/fraud-scores') {
      const profiles=await loadFraudProfiles(env);
      return json({profiles,summary:{
        serious:profiles.filter(x=>x.level==='serious').length,
        review:profiles.filter(x=>x.level==='review').length,
        low:profiles.filter(x=>x.level==='low').length,
        checked_accounts:profiles.length
      },rules_version:'d1-multi-signal-v1',audit_only:true});
    }
    if (m === 'GET' && p === '/api/admin/risk-events') {
      const risks = await env.DB.prepare('SELECT r.*,u.email,u.name FROM risk_events r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 150').all();
      const [recentIP,sharedDevice]=await Promise.all([
        env.DB.prepare(`SELECT ip,COUNT(DISTINCT user_id) AS n FROM risk_events
          WHERE event_type='device_seen' AND user_id IS NOT NULL AND ip NOT IN ('unknown','local','')
          AND created_at>=datetime('now','-30 days')
          GROUP BY ip HAVING COUNT(DISTINCT user_id)>=2 ORDER BY n DESC LIMIT 40`).all(),
        env.DB.prepare(`SELECT device_code,COUNT(DISTINCT user_id) AS n FROM risk_events
          WHERE event_type='device_seen' AND detail='browser_id' AND user_id IS NOT NULL
          AND created_at>=datetime('now','-30 days')
          GROUP BY device_code HAVING COUNT(DISTINCT user_id)>=2 ORDER BY n DESC LIMIT 40`).all()
      ]);
      const linkAlerts=await env.DB.prepare(`SELECT r.*,u.email,u.name,t.title AS task_title,
        (SELECT u2.email FROM task_completions c JOIN tasks lt ON lt.id=c.task_id JOIN users u2 ON u2.id=c.user_id
         WHERE lt.category='link' AND c.user_id<>r.user_id AND c.status IN ('pending','approved')
          AND date(c.created_at,'+7 hours')=date(r.created_at,'+7 hours')
          AND ((r.event_type='link_ip_quota_denied' AND c.ip=r.ip)
            OR (r.event_type='link_browser_quota_denied' AND c.device_code=r.device_code))
         ORDER BY c.created_at LIMIT 1) AS owner_email
        FROM risk_events r LEFT JOIN users u ON u.id=r.user_id
        LEFT JOIN tasks t ON t.id=substr(r.detail,instr(r.detail,':')+1)
        WHERE r.event_type IN ('link_ip_quota_denied','link_browser_quota_denied')
         AND date(r.created_at,'+7 hours')=date('now','+7 hours')
        ORDER BY r.created_at DESC LIMIT 100`).all();
      const alertCount=await env.DB.prepare(`SELECT COUNT(*) AS n,COUNT(DISTINCT user_id) AS accounts
        FROM risk_events WHERE event_type IN ('link_ip_quota_denied','link_browser_quota_denied')
        AND date(created_at,'+7 hours')=date('now','+7 hours')`).first();
      const ipv4Observations=await env.DB.prepare(`SELECT r.user_id,u.email,u.name,
         r.ip AS cloudflare_ip,r.detail AS observed_ipv4,r.created_at
        FROM risk_events r LEFT JOIN users u ON u.id=r.user_id
        WHERE r.event_type='browser_ipv4_report'
         AND r.created_at>=datetime('now','-7 days')
        ORDER BY r.created_at DESC LIMIT 150`).all();
      const [networkSeen,unverifiedIPv4]=await Promise.all([
        env.DB.prepare(`SELECT user_id,ip,device_code,created_at FROM risk_events
          WHERE event_type='device_seen' AND user_id IS NOT NULL
          AND ip NOT IN ('unknown','local','') AND created_at>=datetime('now','-30 days')
          ORDER BY created_at DESC LIMIT 5000`).all(),
        env.DB.prepare(`SELECT user_id,detail,ip,device_code,created_at FROM risk_events
          WHERE event_type='browser_ipv4_report' AND user_id IS NOT NULL
          AND created_at>=datetime('now','-30 days')
          ORDER BY created_at DESC LIMIT 2000`).all()
      ]);
      return json({ events: risks.results, repeated_ips: recentIP.results, repeated_devices:sharedDevice.results,
        ipv4_observations:ipv4Observations.results,
        network_alerts:networkAlerts(networkSeen.results,unverifiedIPv4.results),
        ipv4_inventory:ipv4Inventory(networkSeen.results,unverifiedIPv4.results),
        link_alerts:linkAlerts.results,link_alert_count:alertCount.n,link_alert_accounts:alertCount.accounts });
    }
    if (m === 'GET' && p === '/api/admin/settings') return json({ settings: await getSettings(env) });
    if (m === 'PUT' && p === '/api/admin/settings') {
      const body = await readBody(req), entries = [];
      for (const key of Object.keys(DEFAULTS)) {
        if (!(key in body)) continue;
        const value = str(body[key], key === 'announcement' ? 1000 : 100);
        if (['signup_enabled', 'withdrawals_enabled'].includes(key) && !['0', '1'].includes(value)) fail(400, `${key}: chỉ 0 hoặc 1.`);
        if (['checkin_reward', 'referral_reward', 'min_withdraw_lua', 'lua_per_vnd'].includes(key)
            && (!/^\d+$/.test(value) || Number(value) > 10000000)) fail(400, `${key}: chỉ số từ 0 đến 10 triệu.`);
        if(key==='quota_link_ip_exclusive'&&!['0','1'].includes(value))fail(400,'Chọn Bật hoặc Tắt giới hạn IP.');
        if(key==='quota_link_device_exclusive'&&!['0','1'].includes(value))fail(400,'Chọn Bật hoặc Tắt giới hạn trình duyệt.');
        if (['quota_user_tasks_daily','quota_device_accounts_daily','quota_ip_accounts_daily','quota_link_tasks_ip_24h','quota_link_tasks_device_24h'].includes(key)
            && (!/^\d+$/.test(value) || Number(value)>100)) fail(400, `${key}: chỉ số nguyên từ 0 đến 100; 0 để tắt.`);
        if (key === 'site_name' && value.length < 2) fail(400, 'Tên website quá ngắn.');
        entries.push(env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value));
      }
      if (!entries.length) fail(400, 'Chưa có cài đặt nào.');
      await env.DB.batch(entries);
      await event(env, req, 'admin_settings', admin.id, entries.length + ' giá trị');
      return json({ ok: true });
    }
  }
  fail(404, 'Không tìm thấy đường dẫn API.');
}
export default {
  async scheduled(event, env) {
    // Chỉ dọn dữ liệu tạm, không xóa lịch sử Lúa hay giao dịch ngân hàng.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
      env.DB.prepare("DELETE FROM login_attempts WHERE created_at<datetime('now','-30 days')"),
      env.DB.prepare("DELETE FROM task_attempts WHERE created_at<datetime('now','-7 days')"),
      env.DB.prepare("DELETE FROM risk_events WHERE created_at<datetime('now','-90 days')"),
      env.DB.prepare("DELETE FROM settings WHERE key LIKE 'google_oauth_flow:%' AND json_extract(value,'$.expires')<?").bind(now()),
      env.DB.prepare("DELETE FROM settings WHERE key LIKE 'google_signup_pending:%' AND json_extract(value,'$.expires')<?").bind(now())
    ]);
  },
  async fetch(req, env) {
    if (!new URL(req.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!['GET', 'POST', 'PATCH', 'PUT'].includes(req.method)) return json({ error: 'Phương thức không được hỗ trợ.' }, 405);
    try { return await handler(req, env); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
      console.error('API error:', e?.message || e);
      if (String(e?.message || '').includes('UNIQUE constraint')) return json({ error: 'Thông tin đã tồn tại hoặc thao tác đã được thực hiện.' }, 409);
      return json({ error: 'Máy chủ gặp lỗi. Vui lòng kiểm tra cài đặt hoặc thử lại.' }, 500);
    }
  }
};
