// Trạm Lúa - Cloudflare Worker API. Chỉ server mới được cộng/trừ Lúa.
const DAY = 86400000;
const SESSION_MS = 14 * DAY;
// Cloudflare Workers WebCrypto supports at most 100000 PBKDF2 iterations.
const PBKDF2_ROUNDS = 100000;
const encoder = new TextEncoder();
const DEFAULTS = {
  site_name: 'Trạm Lúa', signup_enabled: '1', checkin_reward: '0',
  referral_reward: '0', min_withdraw_lua: '1000', lua_per_vnd: '0',
  withdrawals_enabled: '0', announcement: '',
  quota_user_tasks_daily: '25', quota_device_accounts_daily: '2', quota_ip_accounts_daily: '6',
  quota_link_tasks_ip_24h: '2', quota_link_ip_exclusive: '1'
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
const clientIP = req => str(req.headers.get('CF-Connecting-IP') || (isLocal(req) ? 'local' : 'unknown'), 60);
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
async function readBody(req) {
  const size = Number(req.headers.get('content-length') || 0);
  if (size > 12000) fail(413, 'Dữ liệu quá lớn.');
  const raw = await req.text();
  if (raw.length > 12000) fail(413, 'Dữ liệu quá lớn.');
  try { return JSON.parse(raw || '{}'); }
  catch { fail(400, 'Dữ liệu JSON không hợp lệ.'); }
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
async function createSession(req, env, userId) {
  const token = newToken();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(await hash(token), userId, now() + SESSION_MS).run();
  return sessionCookie(req, token);
}
async function getSettings(env) {
  const rows = await env.DB.prepare('SELECT key,value FROM settings').all();
  return { ...DEFAULTS, ...Object.fromEntries(rows.results.map(r => [r.key, r.value])) };
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
function ensurePassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) fail(400, 'Mật khẩu phải có 10–128 ký tự.');
}
async function registerUser(env, params) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const userId = id();
  await env.DB.prepare(`INSERT INTO users(id,email,name,password_hash,password_salt,role,referral_code,referred_by,joined_ip,terms_accepted_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(userId, params.email, params.name,
    await passwordDigest(params.password, salt), salt, params.role || 'member', referralCode(), params.referredBy || null, params.ip, params.role === 'admin' ? null : new Date().toISOString()).run();
  return userId;
}

// Quota được đếm theo ngày Việt Nam trên D1, không dựa vào số liệu trình duyệt.
// Mã trình duyệt do phía người dùng tự tạo: chỉ hỗ trợ hạn chế lạm dụng phổ thông.
const quotaNumber=(s,k)=>Math.max(0,Math.min(100,int(s[k],int(DEFAULTS[k]))));
async function taskQuota(env,req,userId,settings){
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
 WHERE id=? AND user_id=? AND consumed_by IS NULL AND expires_at>? AND available_at<=?
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
      AND c.created_at>=datetime('now','-24 hours'))<?)
 AND (?=0 OR NOT EXISTS
   (SELECT 1 FROM task_completions c JOIN tasks t ON t.id=c.task_id
    WHERE c.ip LIKE ? AND c.user_id<>? AND t.category='link'
     AND c.status IN ('pending','approved')
     AND c.created_at>=datetime('now','-24 hours')))
 AND (?=0 OR
  (SELECT COUNT(*) FROM task_completions WHERE user_id=? AND task_id=?
    AND status IN ('pending','approved') AND created_at>=datetime('now','-24 hours'))<?)`;

/* IP Cloudflare, không dùng IPv4 người dùng tự dán. Cửa sổ đúng 24 giờ gần nhất.
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
  "AND c.created_at>=datetime('now','-24 hours')"
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
 const own=await env.DB.prepare("SELECT COUNT(*) AS n FROM task_completions WHERE user_id=? AND task_id=? AND status IN ('pending','approved') AND created_at>=datetime('now','-24 hours')")
   .bind(userId,task.id).first();
 const denied=exclusive&&used.other>0?'link_owner':limit>0&&used.total>=limit?'link_limit':perTaskLimit>1&&Number(own.n)>=perTaskLimit?'link_task_limit':null;
 if(denied){
  await event(env,req,'link_ip_quota_denied',userId,denied+':'+task.id);
  fail(429,denied==='link_owner'
   ?'IP này đã thực hiện nhiệm vụ link bằng tài khoản khác trong 24 giờ qua. Vui lòng chờ đủ 24 giờ hoặc liên hệ Admin.'
   :denied==='link_limit'?'IP này đã đủ lượt nhiệm vụ link trong 24 giờ qua. Vui lòng chờ các lượt cũ hết hạn.'
   :'Tài khoản đã đủ lượt của nhiệm vụ link này trong 24 giờ qua.',
   {quota_scope:denied});
 }
 return {enabled:limit>0?1:0,owner:exclusive?1:0,limit,ip:linkNetworkPattern(ip),perTask:perTaskLimit>1?perTaskLimit:0};
}
function period(task) { return task.repeat_policy === 'daily' ? vnDay() : '*'; }
function validateTaskBody(b) {
  const title = str(b.title, 120), description = str(b.description, 1200), category = str(b.category, 20);
  const url = str(b.url, 700), reward = Number(b.reward), minSeconds = Number(b.min_seconds);
  const review = str(b.review_mode, 20), repeat = str(b.repeat_policy, 20);
  if (title.length < 3) fail(400, 'Tiêu đề nhiệm vụ phải có ít nhất 3 ký tự.');
  if (!['video', 'link', 'other'].includes(category)) fail(400, 'Loại nhiệm vụ không hợp lệ.');
  if (url && (!/^https:\/\//i.test(url) || !URL.canParse(url))) fail(400, 'Liên kết phải là HTTPS hợp lệ.');
  if (!positive(reward)) fail(400, 'Thưởng nhiệm vụ phải là số nguyên dương.');
  if (!Number.isInteger(minSeconds) || minSeconds < 5 || minSeconds > 3600) fail(400, 'Thời gian thực hiện từ 5–3600 giây.');
  if (!['manual', 'auto'].includes(review) || !['once', 'daily'].includes(repeat)) fail(400, 'Cấu hình nhiệm vụ không hợp lệ.');
  const linkLimit=int(b.link_24h_limit,1);
  if(!Number.isInteger(linkLimit)||linkLimit<1||linkLimit>20)fail(400,'Số lượt link/tài khoản/24 giờ phải từ 1 đến 20.');
  return {title,description,category,url,reward,minSeconds,review,repeat,active:b.is_active?1:0,linkLimit};
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
    if (name.length < 2) fail(400, 'Họ tên cần ít nhất 2 ký tự.');
    const ip = clientIP(req);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE joined_ip=? AND created_at >= datetime('now','-1 day')").bind(ip).first();
    if (recent.n >= 3) { await event(env, req, 'signup_rate_limited', null, email); fail(429, 'IP này đã tạo quá nhiều tài khoản trong 24 giờ.'); }
    const taken = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
    if (taken) fail(409, 'Email đã được đăng ký.');
    const ref = str(b.referral_code, 30).toUpperCase();
    const refUser = ref ? await env.DB.prepare('SELECT id FROM users WHERE referral_code=? AND status=\'active\'').bind(ref).first() : null;
    if (ref && !refUser) fail(400, 'Mã giới thiệu không tồn tại.');
    const userId = await registerUser(env, { email, password, name, role: 'member', ip, referredBy: refUser?.id });
    return json({ ok: true, message: 'Đăng ký thành công.' }, 201, { 'Set-Cookie': await createSession(req, env, userId) });
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
    if (user.status !== 'active') fail(403, 'Tài khoản đã bị tạm khóa.');
    return json({ ok: true }, 200, { 'Set-Cookie': await createSession(req, env, user.id) });
  }
  if (m === 'POST' && p === '/api/auth/logout') {
    const token = cookies(req)['__Host-kl_session'] || cookies(req).kl_session;
    if (token && /^[a-f0-9]{64}$/.test(token)) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(req, '', 0) });
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
      ip, device_code: code, device_registered: Boolean(browserDeviceId(req)) });
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
    const denied=settings.quota_link_ip_exclusive!=='0'&&used.other>0?'link_owner':
      limit>0&&used.total>=limit?'link_limit':null;
    const [overrides,counts]=await Promise.all([
      env.DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'link_task_limit:%'").all(),
      env.DB.prepare("SELECT task_id,COUNT(*) AS n,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending FROM task_completions WHERE user_id=? AND status IN ('pending','approved') AND created_at>=datetime('now','-24 hours') GROUP BY task_id").bind(me.id).all()
    ]);
    const limits=new Map(overrides.results.map(r=>[r.key,int(r.value,1)]));
    const done=new Map(counts.results.map(r=>[r.task_id,{n:Number(r.n),pending:Number(r.pending||0)}]));
    const tasks=results.results.map(t=>{
      const max=t.category==='link'?limits.get('link_task_limit:'+t.id)||1:1;
      const entry=done.get(t.id)||{n:0,pending:0},used=entry.n;
      const blocked=t.category==='link'?(denied||(max>1&&used>=max?'link_task_limit':null)):null;
      return {...t,link_24h_limit:max,link_24h_count:used,link_blocked:blocked,
        my_status:t.category==='link'&&max>1?(used>=max?(entry.pending>0?'pending':'approved'):null):t.my_status};
    });
    return json({tasks,link_quota:{limit,used:used.total,blocked:denied,
      exclusive:settings.quota_link_ip_exclusive!=='0',rolling_hours:24}});
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
    if(await linkTaskPerAccountLimit(env,task)<=1){
      const existing=await env.DB.prepare('SELECT id FROM task_completions WHERE user_id=? AND task_id=? AND period_key=?')
        .bind(me.id,task.id,period(task)).first();
      if(existing)fail(409,'Bạn đã nhận hoặc gửi yêu cầu cho nhiệm vụ này trong kỳ.');
    }
    const settings=await getSettings(env);
    await taskQuota(env,req,me.id,settings);
    await linkIPQuota(env,req,me.id,task,settings);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM task_attempts WHERE user_id=? AND created_at>=datetime('now','-15 minutes')").bind(me.id).first();
    if (count.n >= 30) { await event(env, req, 'too_many_task_starts', me.id); fail(429, 'Bạn mở nhiệm vụ quá nhiều lần. Vui lòng thử lại sau.'); }
    const a = rand(), b = rand(), attempt = id(), available = now() + task.min_seconds * 1000;
    await env.DB.prepare(`INSERT INTO task_attempts(id,user_id,task_id,captcha_a,captcha_b,available_at,expires_at,ip,device_code)
       VALUES(?,?,?,?,?,?,?,?,?)`).bind(attempt, me.id, task.id, a, b, available, now() + 20 * 60000,
      clientIP(req), await deviceCode(req, env)).run();
    return json({ attempt_id: attempt, a, b, available_at: available, expires_in_seconds: 1200,
      review_mode: task.review_mode, task_url: task.url });
  }
  const submitMatch = p.match(/^\/api\/tasks\/([^/]+)\/submit$/);
  if (m === 'POST' && submitMatch) {
    const me = await auth(req, env), body = await readBody(req), task = await env.DB.prepare('SELECT * FROM tasks WHERE id=? AND is_active=1').bind(submitMatch[1]).first();
    if (!task) fail(404, 'Nhiệm vụ đã ngừng hoạt động.');
    const attempt = await env.DB.prepare('SELECT * FROM task_attempts WHERE id=? AND user_id=? AND task_id=?')
      .bind(str(body.attempt_id, 60), me.id, task.id).first();
    if (!attempt || attempt.consumed_by || attempt.expires_at <= now()) fail(410, 'Phiên nhiệm vụ hết hạn. Vui lòng mở lại nhiệm vụ.');
    if (now() < attempt.available_at) fail(425, 'Chưa đủ thời gian thực hiện nhiệm vụ.', { remaining_seconds: Math.ceil((attempt.available_at - now()) / 1000) });
    if (Number(body.answer) !== attempt.captcha_a + attempt.captcha_b || !/^\d+$/.test(String(body.answer))) {
      const a = rand(), b = rand();
      await env.DB.prepare('UPDATE task_attempts SET captcha_a=?,captcha_b=? WHERE id=? AND consumed_by IS NULL').bind(a, b, attempt.id).run();
      await event(env, req, 'captcha_wrong', me.id, `task:${task.id}`);
      fail(422, 'Phép tính chưa đúng. Hãy giải phép tính mới.', { a, b });
    }
    const evidence = str(body.evidence, 2000);
    if (task.review_mode === 'manual' && evidence.length < 12) fail(400, 'Nhiệm vụ này cần bằng chứng ít nhất 12 ký tự.');
    if(task.category==='link'&&attempt.ip!==clientIP(req))
      fail(409,'IP mạng thay đổi trong lúc thực hiện link. Hãy mở nhiệm vụ lại trên mạng hiện tại.');
    const settings=await getSettings(env);
    const quota=await taskQuota(env,req,me.id,settings);
    const link=await linkIPQuota(env,req,me.id,task,settings);
    const completionId = id();
    const status = task.review_mode === 'manual' ? 'pending' : 'approved';
    const completionPeriod=link.perTask>1?'link24:'+completionId:period(task);
    const batch = await env.DB.batch([
      env.DB.prepare(TASK_CLAIM_UPDATE)
        .bind(completionId, attempt.id, me.id, now(), now(),
          quota.maxUser,me.id,quota.day,quota.maxUser,
          quota.maxIP,quota.ip,me.id,quota.day,quota.maxIP,
          quota.maxDevice,quota.device,me.id,quota.day,quota.maxDevice,
          link.enabled,link.ip,link.limit,
          link.owner,link.ip,me.id,
          link.perTask,me.id,task.id,link.perTask),
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
      if(task.category==='link')await linkIPQuota(env,req,me.id,task,settings);
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
      env.DB.prepare(`SELECT c.*,t.title FROM task_completions c JOIN tasks t ON t.id=c.task_id
          WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT 80`).bind(me.id).all(),
      env.DB.prepare('SELECT * FROM withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT 80').bind(me.id).all()
    ]);
    return json({ wallet_entries: walletEntries.results, completions: completionRows.results,
      withdrawals: withdrawals.results });
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
    const bank = str(b.bank_name, 90), account = str(b.bank_account, 40), owner = str(b.bank_owner, 100);
    if (bank.length < 2 || !/^[0-9]{5,30}$/.test(account) || owner.length < 3) fail(400, 'Thông tin ngân hàng chưa hợp lệ.');
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
        "SELECT COUNT(*) n FROM withdrawals WHERE status='pending'",
        "SELECT COALESCE(SUM(amount),0) n FROM wallet_entries WHERE amount>0",
        "SELECT COUNT(*) n FROM risk_events WHERE created_at>=datetime('now','-1 day')"
      ];
      const r = await Promise.all(queries.map(q => env.DB.prepare(q).first()));
      return json({ members: r[0].n, tasks: r[1].n, pending_evidence: r[2].n,
        pending_withdrawals: r[3].n, total_issued_lua: r[4].n, risk_events_today: r[5].n });
    }
    if (m === 'GET' && p === '/api/admin/tasks') {
      const [rows,settings]=await Promise.all([
        env.DB.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 200').all(),
        env.DB.prepare("SELECT key,value FROM settings WHERE key LIKE 'link_task_limit:%'").all()
      ]);
      const limits=new Map(settings.results.map(r=>[r.key,int(r.value,1)]));
      return json({tasks:rows.results.map(t=>({...t,link_24h_limit:limits.get('link_task_limit:'+t.id)||1}))});
    }
    if (m === 'POST' && p === '/api/admin/tasks') {
      const t = validateTaskBody(await readBody(req)), taskId = id();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO tasks(id,title,description,category,url,reward,min_seconds,review_mode,repeat_policy,is_active)
          VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(taskId,t.title,t.description,t.category,t.url,t.reward,t.minSeconds,t.review,t.repeat,t.active),
        env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('link_task_limit:'+taskId,String(t.linkLimit))
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
          .bind(t.title,t.description,t.category,t.url,t.reward,t.minSeconds,t.review,t.repeat,t.active,taskEdit[1]),
        env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .bind('link_task_limit:'+taskEdit[1],String(t.linkLimit))
      ]);
      return json({ ok: true });
    }
    if (m === 'GET' && p === '/api/admin/users') {
      const rows = await env.DB.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,u.referral_code,u.joined_ip,u.created_at,
        COALESCE((SELECT SUM(amount) FROM wallet_entries w WHERE w.user_id=u.id),0) balance
        FROM users u ORDER BY u.created_at DESC LIMIT 150`).all();
      return json({ users: rows.results });
    }
    const userEdit = p.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (m === 'PATCH' && userEdit) {
      const b = await readBody(req);
      if (!['active', 'suspended'].includes(b.status)) fail(400, 'Trạng thái không hợp lệ.');
      if (userEdit[1] === admin.id) fail(403, 'Bạn không thể tự khóa tài khoản Admin của mình.');
      const result = await env.DB.prepare("UPDATE users SET status=? WHERE id=? AND role='member'").bind(b.status, userEdit[1]).run();
      if (!result.meta?.changes) fail(404, 'Không tìm thấy thành viên.');
      await event(env, req, 'admin_user_status', admin.id, `${userEdit[1]}:${b.status}`);
      return json({ ok: true });
    }
    if (m === 'GET' && p === '/api/admin/reviews') {
      const rows = await env.DB.prepare(`SELECT c.*,t.title,u.name,u.email FROM task_completions c
        JOIN tasks t ON t.id=c.task_id JOIN users u ON u.id=c.user_id
        ORDER BY CASE WHEN c.status='pending' THEN 0 ELSE 1 END, c.created_at DESC LIMIT 150`).all();
      return json({ reviews: rows.results });
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
      const rows = await env.DB.prepare(`SELECT w.*,u.email,u.name FROM withdrawals w JOIN users u ON u.id=w.user_id
        ORDER BY CASE WHEN w.status='pending' THEN 0 ELSE 1 END,w.created_at DESC LIMIT 150`).all();
      return json({ withdrawals: rows.results });
    }
    const wd = p.match(/^\/api\/admin\/withdrawals\/([^/]+)$/);
    if (m === 'POST' && wd) {
      const b = await readBody(req), status = str(b.status, 20), note = str(b.admin_note, 500);
      if (!['paid', 'rejected'].includes(status)) fail(400, 'Chỉ chọn đã chuyển tiền hoặc từ chối.');
      if (status === 'rejected' && !note) fail(400, 'Cần lý do khi từ chối.');
      const w = await env.DB.prepare('SELECT * FROM withdrawals WHERE id=?').bind(wd[1]).first();
      if (!w || w.status !== 'pending') fail(409, 'Yêu cầu không còn chờ xử lý.');
      const results = await env.DB.batch([
        env.DB.prepare("UPDATE withdrawals SET status=?,admin_note=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'")
          .bind(status, note, w.id),
        env.DB.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
          SELECT ?,?,?,'Hoàn Lúa do từ chối rút','withdraw_refund',? WHERE ?='rejected' AND EXISTS
          (SELECT 1 FROM withdrawals WHERE id=? AND status='rejected')
          ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`)
          .bind(id(), w.user_id, w.amount, w.id, status, w.id)
      ]);
      if (!results[0].meta?.changes) fail(409, 'Yêu cầu đã được xử lý.');
      await event(env, req, 'admin_withdrawal_action', admin.id, `${w.id}:${status}`);
      return json({ ok: true, message: status === 'paid' ? 'Đã đánh dấu chuyển tiền. Hãy đối chiếu giao dịch ngân hàng.' : 'Đã từ chối và hoàn Lúa.' });
    }
    if (m === 'GET' && p === '/api/admin/risk-events') {
      const risks = await env.DB.prepare('SELECT * FROM risk_events ORDER BY created_at DESC LIMIT 150').all();
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
      return json({ events: risks.results, repeated_ips: recentIP.results, repeated_devices:sharedDevice.results });
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
        if (['quota_user_tasks_daily','quota_device_accounts_daily','quota_ip_accounts_daily','quota_link_tasks_ip_24h'].includes(key)
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
      env.DB.prepare("DELETE FROM risk_events WHERE created_at<datetime('now','-90 days')")
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
