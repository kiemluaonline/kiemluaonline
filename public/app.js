// Giao diện dùng dữ liệu thật từ /api. Không gán Lúa ở phía trình duyệt.
const app = document.getElementById('app');
const state = { meta: {}, me: null, view: 'overview', authMode: 'login', adminTasks: [], taskEdit: null, attempt: null };
const NAV = [
  ['overview','◈','Tổng quan'],['tasks','▤','Nhiệm vụ'],['referrals','♧','Tuyển Ref'],
  ['benefits','✦','Phúc lợi'],['withdrawals','⇢','Rút tiền'],['history','◷','Lịch sử'],['profile','☻','Hồ sơ']
];
const ADMIN_NAV = [
  ['admin-overview','◈','Tổng quan Admin'],['admin-tasks','▤','Quản lý nhiệm vụ'],
  ['admin-users','☻','Thành viên'],['admin-reviews','✓','Duyệt bằng chứng'],
  ['admin-withdrawals','⇢','Yêu cầu rút tiền'],['admin-security','♙','Chống gian lận'],
  ['admin-settings','⚙','Cài đặt']
];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = v => Number(v || 0).toLocaleString('vi-VN');
const dt = v => v ? new Date(String(v).replace(' ', 'T') + (String(v).includes('Z') ? '' : 'Z')).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}) : '—';
const safeUrl = v => /^https:\/\//i.test(String(v || '')) ? esc(v) : '';
const chip = v => `<span class="chip ${esc(v)}">${({approved:'Đã duyệt',pending:'Đang chờ',rejected:'Từ chối',paid:'Đã chuyển',active:'Hoạt động',suspended:'Tạm khóa'})[v] || esc(v)}</span>`;
const field = (key, label, value='', attrs='') => `<div class="field"><label for="${esc(key)}">${esc(label)}</label><input id="${esc(key)}" name="${esc(key)}" value="${esc(value)}" ${attrs}></div>`;
const select = (key,label,options,value) => `<div class="field"><label for="${esc(key)}">${esc(label)}</label><select name="${esc(key)}" id="${esc(key)}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
const heading = (title,sub,action='') => `<div class="page-head"><div><div class="eyebrow">TRẠM LÚA • HỆ THỐNG THÀNH VIÊN</div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>${action}</div>`;
const empty = (title,body='') => `<div class="empty"><div class="big">☘</div><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
const table = (heads, rows) => rows.length ? `<div class="table-wrap"><table><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : empty('Chưa có dữ liệu thực tế', 'Các bản ghi sẽ xuất hiện sau khi người dùng thực hiện thao tác.');
const formData = form => Object.fromEntries(new FormData(form).entries());
let toastTimer;
const DEVICE_STORAGE_KEY='tram-lua.browser-device.v1';
function browserDeviceId(){
 try {
  let value=localStorage.getItem(DEVICE_STORAGE_KEY)||'';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)){
   value=crypto.randomUUID();localStorage.setItem(DEVICE_STORAGE_KEY,value);
  }
  return value;
 }catch{return '';}
}
function toast(msg,bad=false){ const t=document.getElementById('toast');t.textContent=msg;t.className='visible'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.className='',4500); }
async function api(path, method='GET', body=null){
  const device=browserDeviceId();
  const headers={...(body===null?{}:{'Content-Type':'application/json','X-Tram-Lua':'1'}),...(device?{'X-TL-Device':device}:{})};
  const r=await fetch(path,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:'same-origin'});
  const data=await r.json().catch(()=>({error:'Không nhận được phản hồi máy chủ.'}));
  if(!r.ok){ const error=new Error(data.error||'Thao tác thất bại.');Object.assign(error,data);error.status=r.status;throw error; }
  return data;
}
async function boot(){
  try{ state.meta=await api('/api/meta');document.title=state.meta.site_name+' · Nhiệm vụ'; }
  catch(e){ app.innerHTML=`<div class="auth-page"><div class="auth-card"><h2>Chưa thể kết nối hệ thống</h2><p>${esc(e.message)}. Hãy kiểm tra D1 và migration.</p></div></div>`;return; }
  await loadMe();
  if(state.me){state.view=state.me.user.role==='admin'?'admin-overview':'overview';renderShell();await navigate(state.view);}
  else { if(state.meta.setup_required) state.authMode='setup'; renderAuth(); }
}
async function loadMe(){ try{state.me=await api('/api/me');}catch{state.me=null;} }
function renderAuth(){
 const mode=state.authMode;
 const ref=new URLSearchParams(location.search).get('ref')||'';
 const tabs=state.meta.setup_required? [['setup','Thiết lập Admin'],['login','Đăng nhập'],['register','Đăng ký']] : [['login','Đăng nhập'],['register','Đăng ký']];
 // Không ép quay lại Thiết lập Admin khi người dùng chọn tab Đăng nhập.
 const active=state.authMode;
 const form= active==='setup' ? `<form data-form="setup">
   ${field('setup_key','Khóa cài đặt bí mật','', 'required type="password" autocomplete="off"')}
   ${field('name','Tên quản trị viên','', 'required minlength="2"')}
   ${field('email','Email quản trị','', 'required type="email" autocomplete="email"')}
   ${field('password','Mật khẩu (ít nhất 10 ký tự)','', 'required type="password" minlength="10" autocomplete="new-password"')}
   <button class="btn" type="submit" style="width:100%">Tạo Admin đầu tiên</button>
   <p class="note">Khóa cài đặt được đặt trên máy chủ, không phải mật khẩu tài khoản.</p></form>`:
 active==='register'? `<form data-form="register">
   ${field('name','Tên hiển thị','', 'required minlength="2"')}
   ${field('email','Email','', 'required type="email" autocomplete="email"')}
   ${field('password','Mật khẩu (ít nhất 10 ký tự)','', 'required type="password" minlength="10" autocomplete="new-password"')}
   ${field('referral_code','Mã giới thiệu (không bắt buộc)',ref)}
   <div class="field"><label><input type="checkbox" name="accept_terms" value="yes" required style="width:auto;margin-right:7px"> Tôi đã đọc <a href="/terms.html" target="_blank">Điều khoản</a> và <a href="/privacy.html" target="_blank">Chính sách quyền riêng tư</a>.</label></div>
   <button class="btn" type="submit" style="width:100%">Tạo tài khoản</button></form>` :
 `<form data-form="login">${field('email','Email','', 'required type="email" autocomplete="email"')}
 ${field('password','Mật khẩu','', 'required type="password" autocomplete="current-password"')}
 <button class="btn" type="submit" style="width:100%">Đăng nhập</button></form>`;
 app.className='';app.innerHTML=`<div class="auth-page"><div class="auth-brand">
 <div class="brand-mark">🌾</div><p class="eyebrow">NHIỆM VỤ · TÍCH LÚA · MINH BẠCH</p>
 <h1>Chăm chỉ làm nhiệm vụ.<br>Rõ ràng từng điểm Lúa.</h1>
 <p>Hệ thống tích Lúa có tài khoản thật, lịch sử giao dịch, kiểm tra CAPTCHA và trang quản trị riêng. Không công bố số thưởng giả.</p>
 </div><section class="auth-card"><div class="auth-tabs">${tabs.map(([k,t])=>`<button type="button" data-auth="${k}" class="${active===k?'chosen':''}">${t}</button>`).join('')}</div>
 <h2>${active==='setup'?'Khởi tạo hệ thống':active==='register'?'Tạo tài khoản':'Chào mừng quay lại'}</h2>
 <p>${active==='setup'?'Chỉ dành cho chủ website.':active==='register'?'Nhập thông tin để bắt đầu tích Lúa.':'Đăng nhập để tiếp tục nhiệm vụ.'}</p>
 ${form}</section></div>`;
}

function setMenuOpen(open,restoreFocus=false){
 const shell=app.querySelector('.layout');
 const menu=document.getElementById('site-menu'),trigger=document.getElementById('menu-toggle');
 if(!shell||!menu||!trigger)return;
 const mobile=window.matchMedia('(max-width:730px)').matches;
 const visible=mobile&&Boolean(open);
 shell.classList.toggle('menu-open',visible);
 document.body.classList.toggle('menu-active',visible);
 trigger.setAttribute('aria-expanded',String(visible));
 trigger.setAttribute('aria-label',visible?'Đóng menu':'Mở menu');
 menu.inert=mobile&&!visible;
 if(mobile)menu.setAttribute('aria-hidden',String(!visible));
 else menu.removeAttribute('aria-hidden');
 if(visible)menu.querySelector('.sidebar-close')?.focus();
 else if(restoreFocus&&mobile)trigger.focus();
}
function renderShell(){
 const nav=state.me.user.role==='admin'?ADMIN_NAV:NAV;
 const user=state.me.user;
 app.className='';app.innerHTML=`<div class="layout"><aside class="sidebar" id="site-menu" aria-label="Menu điều hướng">
  <div class="side-header"><div class="side-brand"><span class="brand-mark">🌾</span><span>${esc(state.meta.site_name)}</span></div><button type="button" class="sidebar-close" data-action="close-menu" aria-label="Đóng menu">×</button></div>
  <div class="side-kicker">${user.role==='admin'?'BẢNG QUẢN TRỊ':'KHÔNG GIAN THÀNH VIÊN'}</div>
  <nav class="nav">${nav.map(([key,symbol,name])=>`<button data-go="${key}" class="${state.view===key?'active':''}"><span class="symbol">${symbol}</span>${esc(name)}</button>`).join('')}</nav>
  <div class="sidebar-bottom"><strong>${esc(user.name)}</strong>${esc(user.email)}<button data-action="logout">Đăng xuất ↗</button></div>
 </aside><button type="button" class="menu-backdrop" tabindex="-1" data-action="close-menu" aria-label="Đóng menu"></button><section class="main-area"><header class="topbar"><div class="topbar-leading"><button type="button" class="menu-toggle" id="menu-toggle" data-action="toggle-menu" aria-controls="site-menu" aria-expanded="false" aria-label="Mở menu"><span aria-hidden="true">☰</span></button><div class="topbar-title"><h1 id="topTitle">Bảng điều khiển</h1><p>Quản lý minh bạch • Cập nhật theo dữ liệu thật</p></div></div>
 <div class="top-right"><span class="balance-pill" id="topBalance">🌾 ${fmt(state.me.balance)} Lúa</span><span class="avatar" title="${esc(user.name)}">${esc(user.name[0]?.toUpperCase()||'T')}</span></div></header>
 <main class="content" id="viewContent"></main></section></div><div id="modal-root"></div>`;
 setMenuOpen(false);
}
async function refreshMe(){await loadMe();if(!state.me){renderAuth();return;}document.getElementById('topBalance').textContent='🌾 '+fmt(state.me.balance)+' Lúa';}
async function navigate(view){
 state.view=view;
 const nav=state.me?.user.role==='admin'?ADMIN_NAV:NAV;
 const found=nav.find(n=>n[0]===view);
 document.querySelectorAll('[data-go]').forEach(btn=>btn.classList.toggle('active',btn.dataset.go===view));
 const top=document.getElementById('topTitle');if(top)top.textContent=found?.[2]||'Tổng quan';
 const root=document.getElementById('viewContent');if(!root)return;
 root.innerHTML='<div class="app-loading" style="min-height:180px"><span class="spinner"></span></div>';
 try{root.innerHTML=await page(view);}catch(e){root.innerHTML=`<div class="callout">Không tải được dữ liệu: ${esc(e.message)}</div>`;}
}
async function page(view){
 switch(view){
 case 'overview':return overview();case 'tasks':return tasks();case 'referrals':return referrals();
 case 'benefits':return benefits();case 'withdrawals':return withdrawals();case 'history':return history();case 'profile':return profile();
 case 'admin-overview':return adminOverview();case 'admin-tasks':return adminTasks();case 'admin-users':return adminUsers();
 case 'admin-reviews':return adminReviews();case 'admin-withdrawals':return adminWithdrawals();
 case 'admin-security':return adminSecurity();case 'admin-settings':return adminSettings();
 default:return empty('Trang chưa được cấu hình');
 }
}
async function overview(){
 const m=state.me, tasks=await api('/api/tasks');
 const available=tasks.tasks.filter(t=>!t.my_status).length;
 return `${heading('Xin chào, '+m.user.name+' 👋','Mỗi Lúa đều có nguồn gốc rõ ràng, được lưu vào lịch sử.')}
 <section class="card hero"><div><div class="small">VÍ TÍCH LŨY</div><h2>${fmt(m.balance)} Lúa hiện có</h2><p>Tham gia nhiệm vụ và theo dõi số dư của bạn. Phần thưởng chỉ phát sinh từ nhiệm vụ hợp lệ.</p><button class="btn gold" data-go="tasks">Xem nhiệm vụ →</button></div><div class="hero-icon">🌾</div></section>
 <section class="grid four section"><div class="card"><div class="metric-label">Số dư hiện tại</div><div class="metric">${fmt(m.balance)}</div><div class="metric-caption">Lúa có thể sử dụng</div></div>
 <div class="card"><div class="metric-label">Tổng Lúa đã ghi nhận</div><div class="metric">${fmt(m.earned)}</div><div class="metric-caption">Bao gồm thưởng đã duyệt</div></div>
 <div class="card"><div class="metric-label">Nhiệm vụ chưa làm</div><div class="metric">${available}</div><div class="metric-caption">Đang mở thực tế</div></div>
 <div class="card"><div class="metric-label">Người được giới thiệu</div><div class="metric">${fmt(m.referral_count)}</div><div class="metric-caption">Tài khoản đã đăng ký</div></div></section>
 <section class="grid two section"><article class="card"><h3>📢 Thông báo hệ thống</h3><p>${esc(state.meta.announcement||'Chào mừng đến với nền tảng. Theo dõi thông báo từ quản trị viên tại đây.')}</p></article>
 <article class="card"><h3>🛡️ Kiểm tra chống gian lận</h3><div class="field-hint">IP đang truy cập</div><div class="field-output">${esc(m.ip)}</div><div class="field-hint" style="margin-top:10px">Mã nhận diện trình duyệt</div><div class="field-output">${esc(m.device_code)}</div><p class="note">Mã do website lưu trên trình duyệt nếu được cho phép. Đây không phải IMEI và có thể bị xóa hoặc thay đổi.</p></article></section>`;
}


const isIPv4 = ip => {
 const parts=String(ip||'').split('.');
 return parts.length===4&&parts.every(p=>/^\d{1,3}$/.test(p)&&Number(p)<=255);
};
const compactIP = ip => {
 const value=String(ip||'');
 if(!value)return 'Chưa xác định';
 if(!value.includes(':')||value.length<26)return value;
 const parts=value.split(':').filter(Boolean);
 return parts.slice(0,3).join(':')+'…'+(parts.at(-1)||'');
};
const adminIP = ip => {
 const value=String(ip||'');
 return value.includes(':')?`<details class="risk-ip-details"><summary><code title="${esc(value)}">${esc(compactIP(value))}</code></summary><code>${esc(value)}</code><button type="button" data-action="copy-ip" data-value="${esc(value)}">Sao chép</button></details>`:`<code>${esc(value)}</code>`;
};

function taskDashboardCard(d){
 const p=d.latest_payment;
 const payment=p
 ?`<strong>✓ ADMIN XÁC NHẬN ĐÃ CHUYỂN</strong><p>TK ${esc(p.masked_account)} • ${fmt(p.vnd_amount)} ₫</p><small>Ghi nhận ${dt(p.at)}. Trạng thái do Admin cập nhật, không phải xác nhận tự động từ ngân hàng.</small>`
 :`<strong>↗ THÔNG BÁO THANH TOÁN</strong><p>Chưa có khoản rút nào được Admin xác nhận đã chuyển.</p><small>Không sử dụng giao dịch minh họa.</small>`;
 return `<div class="task-dashboard">
  <section class="card task-payment">${payment}</section>
  <div class="task-stats">
    <div class="card task-stat"><span>🌾 LÚA HÔM NAY</span><strong>+${fmt(d.today_lua)} Lúa</strong></div>
    <div class="card task-stat"><span>☑ TỔNG LÚA LINK ĐÃ DUYỆT</span><strong>${fmt(d.link_lua)} Lúa</strong></div>
    <div class="card task-stat"><span>✓ NHIỆM VỤ ĐÃ GỬI HÔM NAY</span><strong>${fmt(d.submitted_today)}</strong></div>
    <div class="card task-stat"><span>↻ ĐỔI NGÀY SAU</span><strong id="taskResetCountdown" data-reset-at="${Number(d.next_reset_at)}">--:--:--</strong></div>
  </div>
  <section class="card task-device-card" aria-label="IP mạng và nhận diện trình duyệt">
   <div class="task-ip-heading">
    <svg class="task-ip-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4.2-5 13.8 0 18M12 3c5 4.2 5 13.8 0 18"/></svg><h3>IP hiện tại</h3>
   </div>
   <div class="task-ip-value" id="taskDisplayIP">${esc(compactIP(d.ip))}</div>
   <span class="task-ip-type" id="taskIPLabel">${isIPv4(d.ip)?'IPv4 công khai':String(d.ip||'').includes(':')?'IPv6 • hiển thị rút gọn':'Chưa xác định IP'}</span>
   ${String(d.ip||'').includes(':')?`<div class="task-ip-tools">
  <button class="task-ip-btn" type="button" data-action="check-ipv4">Kiểm tra IPv4</button>
  <button class="task-ip-btn" type="button" data-action="copy-ip" data-value="${esc(d.ip)}">Sao chép IPv6</button>
 </div>
 <details class="task-ip-full"><summary>Xem IPv6 đầy đủ</summary><code>${esc(d.ip)}</code></details>
 <p class="task-ip-helper" id="taskIPv4Help">Website tự kiểm tra IPv4 qua dịch vụ ipify; nếu có sẽ ưu tiên hiển thị IPv4. IPv6 Cloudflare vẫn được giữ để kiểm tra bảo mật.</p>`:''}
   <div class="task-device-tag">
    <svg class="task-phone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10.5 18.5h3"/></svg>
    <div><strong>${d.device_registered?'Đã nhận diện trình duyệt':'Nhận diện tạm thời'}</strong><span>${esc(d.device_code||'—')}</span></div>
   </div>
   <p class="task-device-note">IP thật do Cloudflare ghi nhận vẫn được giữ trong hệ thống. Mã trình duyệt không phải IMEI và có thể đổi; không tự kết luận gian lận chỉ dựa vào một IP.</p>
  </section>
 </div>`;
}


// Một số trình duyệt trong ứng dụng mở được ipify trực tiếp nhưng hạn chế fetch chéo miền.
// Phương án dự phòng chạy JSONP trong iframe sandbox, KHÔNG cho script bên ngoài
// truy cập cookie, localStorage, DOM hoặc phiên đăng nhập của website.
function ipv4FromSandboxedJSONP(){
 return new Promise((resolve,reject)=>{
  const token=crypto.randomUUID();
  const frame=document.createElement('iframe');
  frame.setAttribute('sandbox','allow-scripts');
  frame.setAttribute('title','Kiểm tra IPv4 công khai');
  frame.style.cssText='position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none';
  let done=false;
  const finish=(ip,error)=>{
   if(done)return;
   done=true;
   window.removeEventListener('message',receive);
   clearTimeout(timeout);
   frame.remove();
   if(isIPv4(ip))resolve(ip);
   else reject(new Error(error||'IPv4 lookup did not return an address'));
  };
  const receive=e=>{
   if(e.source!==frame.contentWindow||e.data?.kind!=='tram-lua-v4'||e.data?.token!==token)return;
   finish(String(e.data.ip||''),'Invalid IPv4 JSONP response');
  };
  const timeout=setTimeout(()=>finish('', 'IPv4 JSONP timed out'),11000);
  window.addEventListener('message',receive);
  // The callback runs only in the opaque-origin sandbox; only a validated IPv4 is used.
  frame.srcdoc='<!doctype html><meta charset="utf-8"><script>function tramLuaIPv4(d){parent.postMessage({kind:"tram-lua-v4",token:'+JSON.stringify(token)+',ip:d&&d.ip},"*");}</scr'+'ipt><script src="https://api.ipify.org?format=jsonp&callback=tramLuaIPv4"></scr'+'ipt>';
  document.body.appendChild(frame);
 });
}
async function resolvePublicIPv4(){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8500);
 try{
  const response=await fetch('https://api.ipify.org?format=json',{
   mode:'cors',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
   signal:controller.signal
  });
  if(!response.ok)throw new Error('IPv4 fetch failed');
  const payload=await response.json();
  const ip=String(payload?.ip||'');
  if(!isIPv4(ip))throw new Error('Invalid IPv4 response');
  return ip;
 }catch{
  return await ipv4FromSandboxedJSONP();
 }finally{
  clearTimeout(timer);
 }
}
async function detectPublicIPv4(button,silent=false){
 if(!button?.isConnected||button.disabled)return;
 if(!document.getElementById('taskDisplayIP'))return;
 button.disabled=true;
 button.textContent='Đang tìm IPv4…';
 try{
  const ip=await resolvePublicIPv4();
  const currentIP=document.getElementById('taskDisplayIP');
  const label=document.getElementById('taskIPLabel');
  if(!button.isConnected||!currentIP||!label||state.view!=='tasks')return;
  currentIP.textContent=ip;
  label.textContent='IPv4 công khai • kiểm tra trực tiếp';
  const note=document.getElementById('taskIPv4Help');
  if(note)note.textContent='IPv4 được kiểm tra từ trình duyệt qua ipify. Cloudflare có thể thấy IPv6 khác. Chỉ dùng IPv4 này để hiển thị, không dùng để tự động khóa tài khoản.';
  button.textContent='Kiểm tra lại IPv4';
  let copy=document.getElementById('taskCopyIPv4');
  if(!copy){
   copy=document.createElement('button');
   copy.id='taskCopyIPv4';copy.type='button';copy.className='task-ip-btn';
   copy.dataset.action='copy-ip';
   button.parentNode?.insertBefore(copy,button.nextSibling);
  }
  copy.dataset.value=ip;
  copy.textContent='Sao chép IPv4';
  if(!silent)toast('Đã nhận diện IPv4 công khai.');
 }catch{
  if(button.isConnected&&state.view==='tasks'){
   const label=document.getElementById('taskIPLabel');
   if(label)label.textContent='IPv6 • chưa đọc được IPv4 trong trang web';
   const note=document.getElementById('taskIPv4Help');
   if(note)note.textContent='Safari có thể mở ipify trực tiếp nhưng giới hạn yêu cầu từ trang web. Đã thử hai cách đọc IPv4; IPv6 thật vẫn được giữ và có thể sao chép.';
   if(!silent)toast('Trình duyệt chưa trả IPv4 cho website. IP mạng vẫn được ghi nhận bằng IPv6.',true);
  }
 }finally{
  if(button.isConnected){
   button.disabled=false;
   if(button.textContent==='Đang tìm IPv4…')button.textContent='Thử lại IPv4';
  }
 }
}

function startTaskResetTimer(){
 const el=document.getElementById('taskResetCountdown');
 if(!el)return;
 const update=()=>{
  const seconds=Math.max(0,Math.ceil((Number(el.dataset.resetAt)-Date.now())/1000));
  const h=String(Math.floor(seconds/3600)).padStart(2,'0'),m=String(Math.floor(seconds%3600/60)).padStart(2,'0'),s=String(seconds%60).padStart(2,'0');
  el.textContent=h+':'+m+':'+s;
 };
 update();
 const timer=setInterval(()=>{if(el.isConnected)update();else clearInterval(timer);},1000);
}
async function tasks(){
 const [data,stats]=await Promise.all([api('/api/tasks'),api('/api/task-dashboard')]);
 setTimeout(startTaskResetTimer,0);
 if(String(stats.ip||'').includes(':'))setTimeout(()=>{const button=document.querySelector('.task-ip-btn[data-action="check-ipv4"]');if(button&&state.view==='tasks')detectPublicIPv4(button,true);},0);
 return `${heading('Nhiệm vụ','Thông tin thanh toán, Lúa và an toàn lấy trực tiếp từ hệ thống.')}
 ${taskDashboardCard(stats)}<h3 class="task-list-heading">Danh sách nhiệm vụ</h3>
 ${data.tasks.length?`<div class="grid">${data.tasks.map(t=>`<article class="card task-card">
 <div class="task-top"><span class="task-icon">${t.category==='video'?'🎬':t.category==='link'?'🔗':'📋'}</span><strong class="green">+${fmt(t.reward)} Lúa</strong></div>
 <h3>${esc(t.title)}</h3><p>${esc(t.description||'Làm theo hướng dẫn của quản trị viên.')}</p>
 <div class="task-meta"><span>${t.min_seconds} giây tối thiểu</span><span>•</span><span>${t.review_mode==='manual'?'Admin duyệt bằng chứng':'Kiểm tra tự động'}</span></div>
 <div class="task-meta"><span>${t.repeat_policy==='daily'?'Mỗi ngày 1 lượt':'Mỗi tài khoản 1 lượt'}</span></div>
 ${t.my_status?chip(t.my_status):`<button class="btn" data-action="start-task" data-id="${esc(t.id)}">Bắt đầu nhiệm vụ →</button>`}
 </article>`).join('')}</div>`:empty('Hiện chưa có nhiệm vụ','Admin cần tạo và bật nhiệm vụ thật. Website không tự thêm nhiệm vụ hoặc số Lúa giả.')}`;
}
async function referrals(){
 const r=await api('/api/referrals'),link=location.origin+'/?ref='+encodeURIComponent(r.referral_code);
 return `${heading('Tuyển Ref','Mời người khác đăng ký. Thưởng giới thiệu được tính sau khi họ hoàn thành nhiệm vụ hợp lệ.')}
 <div class="grid two"><section class="card"><h3>Mã giới thiệu riêng</h3><div class="metric">${esc(r.referral_code)}</div><p>Dùng liên kết này để giới thiệu thành viên mới:</p><div class="field-output">${esc(link)}</div><div class="section"><button class="btn" data-action="copy" data-value="${esc(link)}">Sao chép liên kết</button></div>
 <p class="note">Mức thưởng Ref hiện tại: ${fmt(state.meta.referral_reward)} Lúa/người đủ điều kiện. Một người chỉ tạo một khoản thưởng Ref.</p></section>
 <section class="card"><h3>Thành viên đã giới thiệu</h3><div class="metric">${r.referrals.length}</div><div class="separator"></div>${r.referrals.length?r.referrals.slice(0,12).map(x=>`<p>☘ ${esc(x.name)} <span class="muted small">• ${dt(x.created_at)}</span></p>`).join(''):'<p>Chưa có ai đăng ký qua liên kết của bạn.</p>'}</section></div>`;
}
async function benefits(){
 const c=await api('/api/checkin');
 return `${heading('Phúc lợi thành viên','Quà điểm danh hằng ngày theo cấu hình thực tế của Admin.')}
 <div class="grid two"><section class="card"><span class="eyebrow">QUÀ MỖI NGÀY</span><h3>☀ Điểm danh hôm nay</h3><div class="metric">+${fmt(state.meta.checkin_reward)} Lúa</div><p>Ngày Việt Nam: ${esc(c.today)}. Mỗi tài khoản chỉ được điểm danh một lần trong ngày.</p>
 ${c.checked_today?chip('approved'):`<button class="btn" data-action="checkin">Điểm danh ngay</button>`}</section>
 <section class="card"><h3>Điều kiện nhận thưởng</h3><p>Hệ thống tự kiểm tra lượt đã nhận để ngăn ghi Lúa trùng lặp. Admin có thể điều chỉnh mức quà.</p><div class="callout">Nếu mức thưởng đang bằng 0, thao tác điểm danh vẫn được lưu nhưng không phát sinh Lúa.</div></section></div>`;
}
async function withdrawals(){
 const data=await api('/api/history'), meta=state.meta;
 const t=`${heading('Yêu cầu rút tiền','Tiền chỉ được chuyển thực tế sau khi Admin kiểm tra và thực hiện giao dịch ngân hàng.')}`;
 const info=!meta.withdrawals_enabled?`<div class="callout">⚠ Admin chưa mở chi trả hoặc chưa thiết lập tỷ giá Lúa/VNĐ. Bạn chưa thể tạo yêu cầu rút tiền.</div>`:'';
 const form=`<form class="card" data-form="withdraw"><h3>Tạo yêu cầu rút</h3>
 ${field('amount','Số Lúa muốn rút','',`type="number" min="${meta.min_withdraw_lua}" step="1" required ${!meta.withdrawals_enabled?'disabled':''}`)}
 <div class="note">Tối thiểu ${fmt(meta.min_withdraw_lua)} Lúa • ${meta.lua_per_vnd?fmt(meta.lua_per_vnd)+' Lúa = 1 VNĐ':'Chưa có tỷ giá'} • Số dư: ${fmt(state.me.balance)} Lúa</div>
 ${field('bank_name','Tên ngân hàng','',`required ${!meta.withdrawals_enabled?'disabled':''}`)}
 ${field('bank_account','Số tài khoản (chỉ chữ số)','',`required inputmode="numeric" pattern="[0-9]{5,30}" ${!meta.withdrawals_enabled?'disabled':''}`)}
 ${field('bank_owner','Tên chủ tài khoản','',`required ${!meta.withdrawals_enabled?'disabled':''}`)}
 <button class="btn" type="submit" ${!meta.withdrawals_enabled?'disabled':''}>Gửi yêu cầu</button>
 <p class="note">Lúa sẽ được giữ ngay khi gửi để không bị rút trùng. Nếu Admin từ chối, hệ thống tự hoàn Lúa.</p></form>`;
 const rows=data.withdrawals.map(w=>`<tr><td>${dt(w.created_at)}</td><td class="num">${fmt(w.amount)} Lúa</td><td>${fmt(w.vnd_amount)} ₫</td><td>${chip(w.status)}</td><td>${esc(w.admin_note||'—')}</td></tr>`);
 return t+info+`<section class="grid two section">${form}<div class="card"><h3>Thông tin minh bạch</h3><p>Hệ thống này không tự chuyển khoản. Quản trị viên chỉ đánh dấu <strong>Đã chuyển</strong> sau khi thanh toán ngoài website và đối chiếu giao dịch ngân hàng.</p><p>Yêu cầu đang chờ sẽ được lưu trong trang quản trị để xử lý.</p></div></section><section class="section"><h3>Lịch sử yêu cầu rút</h3>${table(['Thời gian','Số Lúa','Giá trị VNĐ','Trạng thái','Ghi chú'],rows)}</section>`;
}
async function history(){
 const d=await api('/api/history');
 const rows=d.wallet_entries.map(x=>`<tr><td>${dt(x.created_at)}</td><td>${esc(x.reason)}</td><td class="num ${x.amount>0?'green':'red'}">${x.amount>0?'+':''}${fmt(x.amount)}</td></tr>`);
 const claims=d.completions.map(c=>`<tr><td>${dt(c.created_at)}</td><td>${esc(c.title)}</td><td>${fmt(c.reward)} Lúa</td><td>${chip(c.status)}</td></tr>`);
 return `${heading('Lịch sử Lúa','Tất cả thay đổi số dư đều được lưu vào sổ giao dịch.')}<section class="card"><h3>📗 Sổ Lúa</h3>${table(['Thời gian','Nội dung','Thay đổi Lúa'],rows)}</section>
 <section class="section card"><h3>📋 Lịch sử nhiệm vụ</h3>${table(['Thời gian','Nhiệm vụ','Thưởng','Trạng thái'],claims)}</section>`;
}
async function profile(){
 const u=state.me.user;
 return `${heading('Hồ sơ cá nhân','Thông tin đăng nhập và bảo mật tài khoản.')}
 <div class="grid two"><section class="card"><h3>Thông tin tài khoản</h3><p><strong>Tên:</strong> ${esc(u.name)}</p><p><strong>Email:</strong> ${esc(u.email)}</p><p><strong>Vai trò:</strong> ${esc(u.role)}</p><p><strong>Tham gia:</strong> ${dt(u.created_at)}</p><p><strong>IP truy cập:</strong> <code>${esc(state.me.ip)}</code></p><p><strong>Mã trình duyệt:</strong> <code>${esc(state.me.device_code)}</code></p><div class="callout">Không chia sẻ mật khẩu hoặc mã cài đặt quản trị với bất kỳ ai.</div></section>
 <form class="card" data-form="password"><h3>Đổi mật khẩu</h3>
 ${field('old_password','Mật khẩu hiện tại','', 'required type="password" autocomplete="current-password"')}
 ${field('new_password','Mật khẩu mới (≥10 ký tự)','', 'required type="password" minlength="10" autocomplete="new-password"')}
 <button class="btn" type="submit">Lưu mật khẩu mới</button><p class="note">Đổi xong, tất cả phiên đăng nhập sẽ bị đăng xuất.</p></form></div>`;
}
async function adminOverview(){
 const d=await api('/api/admin/overview');
 return `${heading('Trung tâm điều hành','Số liệu đọc trực tiếp từ cơ sở dữ liệu, không dùng số liệu minh họa.')}
 <section class="grid four">${[['Thành viên',d.members],['Nhiệm vụ đang mở',d.tasks],['Bằng chứng chờ duyệt',d.pending_evidence],['Rút tiền chờ xử lý',d.pending_withdrawals]].map(([label,val])=>`<article class="card"><div class="metric-label">${esc(label)}</div><div class="metric">${fmt(val)}</div></article>`).join('')}</section>
 <section class="grid two section"><article class="card"><h3>🌾 Tổng Lúa phát hành</h3><div class="metric">${fmt(d.total_issued_lua)}</div><p>Giá trị cộng Lúa từ mọi loại thưởng đã ghi nhận. Đây không phải số tiền thật đã thanh toán.</p></article>
 <article class="card"><h3>🛡️ Hoạt động chống gian lận</h3><div class="metric">${fmt(d.risk_events_today)}</div><p>Sự kiện được ghi nhận trong 24 giờ qua.</p><button data-go="admin-security" class="btn alt">Kiểm tra sự kiện →</button></article></section>
 <div class="callout section">Để có dữ liệu thật, hãy tạo nhiệm vụ, cấu hình chính sách thưởng và quy đổi. Trạng thái chi trả chỉ được cập nhật sau khi đã chuyển khoản thật.</div>`;
}
function taskForm(task={}){
 return `<form class="card" data-form="admin-task" id="task-form"><h3>${task.id?'Sửa nhiệm vụ':'Tạo nhiệm vụ thật'}</h3>
 <input type="hidden" name="id" value="${esc(task.id||'')}">
 ${field('title','Tên nhiệm vụ',task.title||'', 'required minlength="3"')}
 <div class="field"><label for="description">Hướng dẫn / mô tả</label><textarea id="description" name="description">${esc(task.description||'')}</textarea></div>
 <div class="form-row">${select('category','Loại nhiệm vụ',[['video','Video'],['link','Liên kết'],['other','Khác']],task.category||'video')}
 ${select('review_mode','Cách xét thưởng',[['manual','Admin kiểm tra bằng chứng'],['auto','Tự động theo thời gian và CAPTCHA']],task.review_mode||'manual')}</div>
 ${field('url','URL HTTPS (nếu có)',task.url||'', 'type="url" placeholder="https://..."')}
 <div class="form-row">${field('reward','Thưởng (Lúa)',task.reward||100,'type="number" min="1" max="10000000" required')}
 ${field('min_seconds','Thời gian tối thiểu (giây)',task.min_seconds||15,'type="number" min="5" max="3600" required')}</div>
 <div class="form-row">${select('repeat_policy','Lặp lại',[['once','Mỗi người một lần'],['daily','Mỗi ngày một lần']],task.repeat_policy||'once')}
 ${select('is_active','Trạng thái',[['1','Bật công khai'],['0','Tắt / nháp']],Number(task.is_active||0).toString())}</div>
 <div class="btn-row"><button class="btn" type="submit">${task.id?'Lưu chỉnh sửa':'Tạo nhiệm vụ'}</button>${task.id?'<button class="btn alt" type="button" data-action="reset-task">Tạo mới</button>':''}</div>
 <p class="note">Chỉ dùng chế độ tự động cho nhiệm vụ có thể kiểm tra bằng thời gian + CAPTCHA. Không có khả năng xác minh người xem thực sự đã xem video tại nền tảng bên ngoài.</p></form>`;
}
async function adminTasks(){
 const d=await api('/api/admin/tasks');state.adminTasks=d.tasks;
 const edit=state.taskEdit?d.tasks.find(x=>x.id===state.taskEdit):null;
 const rows=d.tasks.map(t=>`<tr><td><strong>${esc(t.title)}</strong><div class="small muted">${esc(t.category)} • ${esc(t.repeat_policy)}</div></td><td>${fmt(t.reward)}</td><td>${t.review_mode==='manual'?'Duyệt tay':'Tự động'}</td><td>${t.is_active?chip('active'):chip('suspended')}</td><td><button class="btn alt sm" data-action="edit-task" data-id="${esc(t.id)}">Sửa</button></td></tr>`);
 return `${heading('Quản lý nhiệm vụ','Thêm, sửa và bật/tắt nhiệm vụ bất kỳ lúc nào.')}
 <section class="info-split">${taskForm(edit||{})}<article class="card"><h3>Hướng dẫn quản trị</h3><p>1. Nhập nhiệm vụ thật, phần thưởng và đường dẫn.</p><p>2. Chọn chế độ duyệt bằng chứng để kiểm tra thủ công, hoặc tự động cho tác vụ có thể kiểm tra.</p><p>3. Bật công khai khi đã kiểm thử.</p><div class="callout">Không được dùng nhiệm vụ giả để quảng cáo mức thu nhập không có thật.</div></article></section>
 <section class="section"><h3>Nhiệm vụ đã tạo (${d.tasks.length})</h3>${table(['Tên nhiệm vụ','Lúa','Duyệt','Trạng thái','Thao tác'],rows)}</section>`;
}
async function adminUsers(){
 const d=await api('/api/admin/users');
 return `${heading('Quản lý thành viên','Tra cứu tài khoản, số Lúa và tình trạng sử dụng.')}<section class="card">${table(['Thành viên','Tài khoản','Số dư','IP đăng ký','Trạng thái','Thao tác'],d.users.map(u=>`<tr>
 <td>${esc(u.name)}<div class="small muted">${dt(u.created_at)}</div></td><td>${esc(u.email)}</td><td class="num">${fmt(u.balance)}</td><td><code>${esc(u.joined_ip)}</code></td><td>${chip(u.status)}</td>
 <td>${u.role==='admin'?'Admin':`<button class="btn sm ${u.status==='active'?'danger':'alt'}" data-action="change-user" data-id="${esc(u.id)}" data-status="${u.status==='active'?'suspended':'active'}">${u.status==='active'?'Khóa':'Mở khóa'}</button>`}</td></tr>`))}</section>`;
}
async function adminReviews(){
 const d=await api('/api/admin/reviews');
 return `${heading('Duyệt bằng chứng','Chỉ khi duyệt thành công, Lúa mới được ghi vào ví thành viên.')}
 <section class="card">${table(['Thành viên / Nhiệm vụ','Bằng chứng','Thưởng','Kiểm tra','Duyệt'],d.reviews.map(c=>`<tr><td><strong>${esc(c.name)}</strong><div class="small">${esc(c.email)}</div><div class="muted small">${esc(c.title)} • ${dt(c.created_at)}</div></td>
 <td style="max-width:270px;white-space:pre-wrap">${esc(c.evidence||'(không có)')}</td><td>${fmt(c.reward)} Lúa</td><td><code>${esc(c.ip)}</code><div class="small muted">${esc(c.device_code)}</div></td>
 <td>${chip(c.status)}${c.status==='pending'?`<div class="btn-row section"><button class="btn sm" data-action="review" data-id="${esc(c.id)}" data-status="approved">Duyệt</button><button class="btn danger sm" data-action="review" data-id="${esc(c.id)}" data-status="rejected">Từ chối</button></div>`:''}</td></tr>`))}</section>`;
}
async function adminWithdrawals(){
 const d=await api('/api/admin/withdrawals');
 return `${heading('Yêu cầu rút tiền','Đối chiếu ngân hàng trước khi đánh dấu đã chuyển; từ chối sẽ hoàn Lúa tự động.')}
 <div class="callout">Website chỉ ghi nhận yêu cầu và tình trạng. Bạn phải tự thực hiện giao dịch ngân hàng thực tế ngoài hệ thống trước khi bấm “Đã chuyển”.</div>
 <section class="card section">${table(['Thành viên','Số tiền','Ngân hàng','Trạng thái','Thao tác'],d.withdrawals.map(w=>`<tr>
 <td>${esc(w.name)}<div class="small muted">${esc(w.email)}</div><div class="small muted">${dt(w.created_at)}</div></td>
 <td class="num">${fmt(w.amount)} Lúa<div class="green">${fmt(w.vnd_amount)} ₫</div></td>
 <td>${esc(w.bank_name)}<br><code>${esc(w.bank_account)}</code><div class="small">${esc(w.bank_owner)}</div></td>
 <td>${chip(w.status)}<div class="small muted">${esc(w.admin_note||'')}</div></td>
 <td>${w.status==='pending'?`<div class="btn-row"><button class="btn sm" data-action="withdraw-admin" data-id="${esc(w.id)}" data-status="paid">Đã chuyển</button><button class="btn danger sm" data-action="withdraw-admin" data-id="${esc(w.id)}" data-status="rejected">Từ chối</button></div>`:'—'}</td></tr>`))}</section>`;
}
async function adminSecurity(){
 const d=await api('/api/admin/risk-events');
 return `${heading('Chống gian lận','Ghi nhận sự kiện CAPTCHA sai, đăng nhập thất bại, hạn mức và IP nhiều tài khoản.')}
 <div class="callout">Dữ liệu IP/mã trình duyệt chỉ hỗ trợ đánh giá rủi ro; người dùng chung mạng hoặc thay đổi IP có thể trùng/đổi mã. Không nên tự động quy kết gian lận chỉ dựa trên IP.</div>
 <section class="grid two section"><article class="card"><h3>IP dùng bởi nhiều tài khoản trong 30 ngày</h3>
 ${table(['IP','Tài khoản'],d.repeated_ips.map(r=>`<tr><td>${adminIP(r.ip)}</td><td>${r.n}</td></tr>`))}</article>
 <article class="card"><h3>Mã trình duyệt dùng bởi nhiều tài khoản (30 ngày)</h3>
  ${table(['Mã nhận diện','Tài khoản'],(d.repeated_devices||[]).map(r=>`<tr><td><code>${esc(r.device_code)}</code></td><td>${r.n}</td></tr>`))}
  <p class="note">Mã nhận diện có thể bị thay đổi; chỉ dùng để đánh giá rủi ro, không tự khóa tài khoản.</p></article>
  <article class="card"><h3>Nhật ký sự kiện gần đây</h3>${table(['Thời gian','Sự kiện','IP / Mã'],d.events.map(r=>`<tr><td>${dt(r.created_at)}</td><td>${esc(r.event_type)}<div class="small muted">${esc(r.detail)}</div></td><td>${adminIP(r.ip)}<div class="small muted">${esc(r.device_code)}</div></td></tr>`))}</article></section>`;
}
async function adminSettings(){
 const d=await api('/api/admin/settings'),s=d.settings;
 return `${heading('Cài đặt hệ thống','Thưởng, đăng ký, quy đổi và thông báo có thể được sửa mà không cần thay mã nguồn.')}
 <div class="info-split"><form class="card" data-form="settings"><h3>Thiết lập chung</h3>
 ${field('site_name','Tên website',s.site_name,'required')}
 <div class="field"><label for="announcement">Thông báo thành viên</label><textarea name="announcement" id="announcement">${esc(s.announcement)}</textarea></div>
 <div class="form-row">${select('signup_enabled','Cho phép đăng ký',[['1','Bật'],['0','Tắt']],s.signup_enabled)}
 ${select('withdrawals_enabled','Cho phép yêu cầu rút',[['0','Tắt'],['1','Bật']],s.withdrawals_enabled)}</div>
 <div class="form-row">${field('checkin_reward','Lúa thưởng điểm danh',s.checkin_reward,'type="number" min="0" max="10000000" required')}
 ${field('referral_reward','Lúa thưởng giới thiệu',s.referral_reward,'type="number" min="0" max="10000000" required')}</div>
 <div class="form-row">${field('min_withdraw_lua','Tối thiểu rút (Lúa)',s.min_withdraw_lua,'type="number" min="0" max="10000000" required')}
 ${field('lua_per_vnd','Bao nhiêu Lúa = 1 VNĐ',s.lua_per_vnd,'type="number" min="0" max="10000000" required')}</div>
 <button class="btn" type="submit">Lưu cài đặt</button></form>
 <section class="card"><h3>⚠ Cần thiết lập trước khi mở rút</h3><p>Đặt tỷ giá Lúa/VNĐ và chuẩn bị nguồn chi trả thực tế. Mặc định chức năng rút bị tắt để tránh cam kết thanh toán sai.</p>
 <p>Admin duyệt nhiệm vụ có thể cộng Lúa; Admin từ chối yêu cầu rút sẽ tự hoàn Lúa vào ví.</p>
 <p class="note">Mọi thay đổi chính sách thưởng cần được công khai rõ ràng với người dùng.</p></section></div>`;
}
async function startTask(taskId){
 const data=await api(`/api/tasks/${encodeURIComponent(taskId)}/start`,'POST',{});
 state.attempt={...data,taskId};renderAttemptModal();
}
function renderAttemptModal(){
 const a=state.attempt;if(!a)return;
 const remain=Math.max(0,Math.ceil((a.available_at-Date.now())/1000));
 const root=document.getElementById('modal-root');
 root.innerHTML=`<div class="modal-cover"><section class="modal"><button class="close" type="button" data-action="close-modal" aria-label="Đóng">×</button>
 <span class="eyebrow">KIỂM TRA THỰC HIỆN</span><h3>Hoàn thành nhiệm vụ</h3>
 ${a.task_url?`<p><a class="btn alt" href="${safeUrl(a.task_url)}" target="_blank" rel="noopener noreferrer">Mở liên kết nhiệm vụ ↗</a></p>`:''}
 <p class="note">Hãy thực hiện đúng yêu cầu trước khi xác nhận. Hệ thống kiểm tra thời gian và CAPTCHA; ${a.review_mode==='manual'?'Admin sẽ duyệt bằng chứng bạn gửi.':'với chế độ tự động, hệ thống không thể xác minh hoạt động bên ngoài trang web.'}</p>
 <form data-form="task-claim"><div class="captcha">${a.a} + ${a.b} = ?</div>
 ${field('answer','Kết quả phép cộng','', 'required type="number" min="0" max="30" inputmode="numeric"')}
 ${a.review_mode==='manual'?`<div class="field"><label for="evidence">Bằng chứng / URL xác nhận / mô tả (≥12 ký tự)</label><textarea id="evidence" name="evidence" minlength="12" required placeholder="Dán URL bằng chứng hoặc trình bày chi tiết kết quả..."></textarea></div>`:''}
 <button class="btn" type="submit">${remain>0?'Gửi khi đủ thời gian':'Xác nhận hoàn thành'} →</button>
 <p class="note" id="wait-hint">${remain>0?`Bạn còn cần chờ ít nhất ${remain} giây để xác nhận.`:'Đã đủ thời gian tối thiểu.'}</p></form></section></div>`;
}
async function afterAction(view=state.view){await refreshMe();if(state.me)await navigate(view);}

window.addEventListener('resize',()=>{
 if(app.querySelector('.layout'))setMenuOpen(false);
});
app.addEventListener('keydown',e=>{
 if(!app.querySelector('.layout.menu-open'))return;
 if(e.key==='Escape'){e.preventDefault();setMenuOpen(false,true);return;}
 if(e.key!=='Tab')return;
 const buttons=[...app.querySelectorAll('#site-menu button:not([disabled])')];
 if(!buttons.length)return;
 const first=buttons[0],last=buttons[buttons.length-1];
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
app.addEventListener('click',async e=>{
 const el=e.target.closest('button[data-go],button[data-auth],button[data-action]');if(!el)return;
 if(el.dataset.auth){state.authMode=el.dataset.auth;renderAuth();return;}
 if(el.dataset.go){if(!state.me)return;const wasOpen=!!app.querySelector('.layout.menu-open');setMenuOpen(false);await navigate(el.dataset.go);if(wasOpen){const title=document.getElementById('topTitle');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}return;}
 const act=el.dataset.action;
 try{
  if(act==='toggle-menu'){setMenuOpen(!app.querySelector('.layout.menu-open'));return;}
  if(act==='close-menu'){setMenuOpen(false,true);return;}
  if(act==='logout'){setMenuOpen(false);await api('/api/auth/logout','POST',{});state.me=null;state.authMode='login';renderAuth();return;}
  if(act==='start-task'){await startTask(el.dataset.id);return;}
  if(act==='close-modal'){state.attempt=null;document.getElementById('modal-root').innerHTML='';return;}
  if(act==='copy'){await navigator.clipboard.writeText(el.dataset.value);toast('Đã sao chép liên kết.');return;}
  if(act==='copy-ip'){await navigator.clipboard.writeText(el.dataset.value||'');toast('Đã sao chép địa chỉ IP.');return;}
  if(act==='check-ipv4'){await detectPublicIPv4(el,false);return;}

  if(act==='checkin'){await api('/api/checkin','POST',{});toast('Điểm danh thành công.');await afterAction('benefits');return;}
  if(act==='edit-task'){state.taskEdit=el.dataset.id;await navigate('admin-tasks');document.querySelector('#task-form')?.scrollIntoView({behavior:'smooth'});return;}
  if(act==='reset-task'){state.taskEdit=null;await navigate('admin-tasks');return;}
  if(act==='change-user'){
   if(!confirm(el.dataset.status==='suspended'?'Tạm khóa thành viên này?':'Mở lại tài khoản này?'))return;
   await api('/api/admin/users/'+encodeURIComponent(el.dataset.id),'PATCH',{status:el.dataset.status});toast('Đã cập nhật trạng thái thành viên.');await navigate('admin-users');return;
  }
  if(act==='review'){
   if(!confirm(el.dataset.status==='approved'?'Duyệt và cộng Lúa cho nhiệm vụ?':'Từ chối bằng chứng này?'))return;
   await api('/api/admin/reviews/'+encodeURIComponent(el.dataset.id),'POST',{status:el.dataset.status});toast('Đã xử lý bằng chứng.');await afterAction('admin-reviews');return;
  }
  if(act==='withdraw-admin'){
   let note='';
   if(el.dataset.status==='paid'){
     if(!confirm('Chỉ xác nhận nếu bạn đã CHUYỂN KHOẢN THẬT và đối chiếu giao dịch. Đã chuyển?'))return;
     note=prompt('Mã giao dịch hoặc ghi chú đối chiếu ngân hàng (nên nhập):','')||'';
   }else{note=prompt('Nhập lý do từ chối (bắt buộc):','')||'';if(!note.trim())return;}
   await api('/api/admin/withdrawals/'+encodeURIComponent(el.dataset.id),'POST',{status:el.dataset.status,admin_note:note});toast('Đã xử lý yêu cầu rút tiền.');await afterAction('admin-withdrawals');return;
  }
 }catch(err){toast(err.message,true);}
});
app.addEventListener('submit',async e=>{
 const form=e.target.closest('form[data-form]');if(!form)return;
 e.preventDefault();const kind=form.dataset.form;const b=formData(form),button=form.querySelector('button[type="submit"]');
 if(button)button.disabled=true;
 try{
  if(kind==='setup'){await api('/api/setup','POST',b);state.meta=await api('/api/meta');await loadMe();renderShell();await navigate('admin-overview');toast('Admin đã được tạo. Hãy xóa khóa thiết lập SETUP_KEY sau khi hoàn tất.');}
  if(kind==='login'||kind==='register'){
    await api('/api/auth/'+kind,'POST',b);await loadMe();renderShell();await navigate(state.me.user.role==='admin'?'admin-overview':'overview');toast(kind==='login'?'Đăng nhập thành công.':'Đăng ký thành công.');
  }
  if(kind==='password'){const r=await api('/api/me/password','POST',b);state.me=null;renderAuth();toast(r.message);}
  if(kind==='withdraw'){const r=await api('/api/withdrawals','POST',{...b,amount:Number(b.amount)});toast(r.message);await afterAction('withdrawals');}
  if(kind==='settings'){await api('/api/admin/settings','PUT',b);state.meta=await api('/api/meta');toast('Đã lưu cài đặt.');await navigate('admin-settings');}
  if(kind==='admin-task'){
    const data={...b,reward:Number(b.reward),min_seconds:Number(b.min_seconds),is_active:b.is_active==='1'};
    if(data.id)await api('/api/admin/tasks/'+encodeURIComponent(data.id),'PATCH',data);
    else await api('/api/admin/tasks','POST',data);
    state.taskEdit=null;toast('Đã lưu nhiệm vụ vào cơ sở dữ liệu.');await navigate('admin-tasks');
  }
  if(kind==='task-claim'){
    const a=state.attempt;
    if(!a)throw new Error('Phiên nhiệm vụ không còn.');
    const r=await api('/api/tasks/'+encodeURIComponent(a.taskId)+'/submit','POST',{
      attempt_id:a.attempt_id,answer:b.answer,evidence:b.evidence||'' });
    state.attempt=null;document.getElementById('modal-root').innerHTML='';toast(r.message);await afterAction('tasks');
  }
 }catch(err){
   if(kind==='task-claim'&&err.status===422&&state.attempt){
     state.attempt.a=err.a;state.attempt.b=err.b;
     const evidence=b.evidence;renderAttemptModal();
     if(evidence){const area=document.querySelector('#evidence');if(area)area.value=evidence;}
   }
   toast(err.message,true);
 }finally{if(button&&button.isConnected)button.disabled=false;}
});
boot();
