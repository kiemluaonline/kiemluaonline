// Giao diện dùng dữ liệu thật từ /api. Không gán Lúa ở phía trình duyệt.
const app = document.getElementById('app');
// Trang chủ được viết sẵn trong HTML để cả khách và công cụ tìm kiếm đọc được.
const publicHomeHTML = app.innerHTML;
const state = { meta: {}, me: null, googlePending: null, accountHold: null, view: 'overview', authMode: 'login', adminTasks: [], taskEdit: null, attempt: null, taskFilter:'all',fraudFilter:'all',fraudSearch:'' };
const BANK_LIST = [
  ['','-- Chọn ngân hàng nhận tiền --'],
  ['Vietcombank','Vietcombank'],['BIDV','BIDV'],['VietinBank','VietinBank'],
  ['Agribank','Agribank'],['MB Bank','MB Bank'],['Techcombank','Techcombank'],
  ['ACB','ACB'],['VPBank','VPBank'],['TPBank','TPBank'],
  ['Sacombank','Sacombank'],['VIB','VIB'],['SHB','SHB'],
  ['HDBank','HDBank'],['MSB','MSB'],['OCB','OCB'],
  ['SeABank','SeABank'],['Eximbank','Eximbank'],['LPBank','LPBank'],
  ['Nam A Bank','Nam A Bank'],['PVcomBank','PVcomBank'],['Bac A Bank','Bac A Bank'],
  ['NCB','NCB'],['BaoViet Bank','BaoViet Bank'],['VietABank','VietABank'],
  ['other','Ngân hàng khác (nhập tên)']
];
const NAV = [
  ['overview','◈','Tổng quan'],['tasks','▤','Nhiệm vụ'],['referrals','♧','Tuyển Ref'],
  ['benefits','✦','Phúc lợi'],['withdrawals','⇢','Rút tiền'],['history','◷','Lịch sử'],['profile','☻','Hồ sơ']
];
const ADMIN_NAV = [
  ['admin-overview','◈','Tổng quan Admin'],['admin-tasks','▤','Quản lý nhiệm vụ'],
  ['admin-users','☻','Thành viên'],['admin-reviews','✓','Duyệt bằng chứng'],
  ['admin-withdrawals','⇢','Yêu cầu rút tiền'],['admin-security','♙','Chống gian lận'],
  ['admin-settings','⚙','Cài đặt'],['profile','☻','Hồ sơ của tôi']
];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = v => Number(v || 0).toLocaleString('vi-VN');
// Chỉ che trong giao diện thành viên; mã gốc và kiểm tra chống gian lận không đổi.
const maskDeviceCode = value => {
 const raw=String(value||'').trim();
 return raw ? raw.slice(0,10)+'•'.repeat(Math.max(0,raw.length-10)) : '—';
};
const dt = v => v ? new Date(String(v).replace(' ', 'T') + (String(v).includes('Z') ? '' : 'Z')).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}) : '—';
const safeUrl = v => /^https:\/\//i.test(String(v || '')) ? esc(v) : '';
const chip = v => `<span class="chip ${esc(v)}">${({approved:'Đã duyệt',pending:'Đang chờ',review:'Không nghiêm trọng',serious:'Nghiêm trọng',rejected:'Từ chối',invalid_account:'Số tài khoản không đúng',low:'Thấp',paid:'Đã thanh toán',active:'Hoạt động',suspended:'Tạm khóa'})[v] || esc(v)}</span>`;
const field = (key, label, value='', attrs='') => `<div class="field"><label for="${esc(key)}">${esc(label)}</label><input id="${esc(key)}" name="${esc(key)}" value="${esc(value)}" ${attrs}></div>`;
const AUTH_ICONS={
 username:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.7 20a7.3 7.3 0 0 1 14.6 0"/></svg>',
 email:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
 password:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>',
 gift:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="9" width="16" height="12" rx="1"/><path d="M2 9h20M12 9v12"/><path d="M12 9C4 9 5 2 8 3c2 .5 4 6 4 6Zm0 0c8 0 7-7 4-6-2 .5-4 6-4 6Z"/></svg>'
};
const authField=(key,label,placeholder,attrs='',icon='username',value='')=>`<div class="auth-input-field">
 <label for="${esc(key)}">${esc(label)}</label>
 <div class="auth-input-wrap">
  <span class="auth-input-icon">${AUTH_ICONS[icon]||AUTH_ICONS.username}</span>
  <input id="${esc(key)}" name="${esc(key)}" placeholder="${esc(placeholder)}" value="${esc(value)}" ${attrs}>
  ${icon==='password'?'<button class="auth-password-eye" data-action="toggle-password" type="button" aria-label="Hiện mật khẩu" aria-pressed="false">◉</button>':''}
 </div></div>`;
const select = (key,label,options,value) => `<div class="field"><label for="${esc(key)}">${esc(label)}</label><select name="${esc(key)}" id="${esc(key)}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
const heading = (title,sub,action='') => `<div class="page-head"><div><div class="eyebrow">TRẠM CÓ LÚA • HỆ THỐNG THÀNH VIÊN</div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>${action}</div>`;
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
const PUBLIC_TITLE = 'Trạm Có Lúa – Làm nhiệm vụ, tích Lúa mỗi ngày';
function renderHome(){
 app.className='';
 app.innerHTML=publicHomeHTML;
 document.title=PUBLIC_TITLE;
}
async function boot(){
  try{ state.meta=await api('/api/meta');document.title=state.meta.site_name+' · Nhiệm vụ'; }
  catch(e){ app.innerHTML=`<div class="auth-page"><div class="auth-card"><h2>Chưa thể kết nối hệ thống</h2><p>${esc(e.message)}. Hãy kiểm tra D1 và migration.</p></div></div>`;return; }
  await loadMe();
  if(state.me){state.view=state.me.user.role==='admin'?'admin-overview':'overview';renderShell();await navigate(state.view);}
  else if(state.accountHold){renderLocked();}
  else {
    if(state.meta.setup_required) state.authMode='setup';
    if(state.meta.google_auth_enabled){
      const pending=await api('/api/auth/google/pending').catch(()=>null);
      state.googlePending=pending?.pending?pending:null;
    }
    // Giữ trang giới thiệu cho khách mới; chỉ mở biểu mẫu khi khách chọn.
    if(state.meta.setup_required||state.googlePending||
       new URLSearchParams(location.search).has('google_error'))renderAuth();
    else renderHome();
  }
const googleError=new URLSearchParams(location.search).get('google_error');
if(googleError==='suspended'){
 // Chỉ hiện thông tin riêng sau khi có phiên đăng nhập hợp lệ.
 state.accountHold={account_status:'suspended',suspension_type:'review',reason:'Tài khoản cần được xác minh thêm.',pending_withdrawals:null,withdrawals:[]};
 renderLocked();
 history.replaceState(null,'',location.pathname);
}else if(googleError){
 const messages={
  email_exists:'Email đã có tài khoản. Hãy đăng nhập bằng mật khẩu rồi vào Hồ sơ để liên kết Google.',
  not_registered:'Google này chưa đăng ký. Hãy chọn Đăng ký bằng Google.',
  email_mismatch:'Email Google phải trùng email tài khoản Trạm Có Lúa.',
  expired:'Phiên Google đã hết hạn. Hãy thử lại.',
  cancelled:'Bạn đã hủy đăng nhập Google.',
  signup_closed:'Hệ thống đã tắt đăng ký mới.',
  suspended:'Tài khoản đang tạm khóa.',
  bad_ref:'Mã giới thiệu không hợp lệ.',
  not_ready:'Chủ website chưa cấu hình Google.'
 };
 toast(messages[googleError]||'Đăng nhập Google chưa thành công. Hãy thử lại.',true);
 history.replaceState(null,'',location.pathname);
}
}
async function loadMe(){
 try{state.me=await api('/api/me');state.accountHold=null;
  if(state.me?.user?.role==='member'&&String(state.me.ip||'').includes(':'))
   setTimeout(()=>captureMemberIPv4().catch(()=>{}),0);
 }
 catch(err){
  state.me=null;state.accountHold=null;
  if(err.status===403){
   const hold=await api('/api/account-status').catch(()=>null);
   if(hold?.account_status==='suspended')state.accountHold=hold;
  }
 }
}
function renderLocked(){
 const info=state.accountHold||{};
 const severe=info.suspension_type==='confirmed';
 const pending=info.pending_withdrawals;
 const money=Array.isArray(info.withdrawals)?info.withdrawals:[];
 const headingText=severe?'🚫 TÀI KHOẢN ĐÃ BỊ KHÓA VĨNH VIỄN':'⚠️ TÀI KHOẢN TẠM THỜI BỊ KHÓA';
 const intro=severe
  ?'Hệ thống của chúng tôi đã phát hiện tài khoản của bạn có hành vi gian lận nghiêm trọng, vi phạm chính sách và quy định của Trạm Có Lúa.'
  :'Hệ thống của chúng tôi đã phát hiện hoạt động bất thường liên quan đến tài khoản của bạn, có dấu hiệu vi phạm quy định của Trạm Có Lúa.';
 const decisions=severe
  ?'<li><strong>Tài khoản:</strong> Khóa vĩnh viễn.</li><li><strong>Nhiệm vụ và nhận thưởng:</strong> Chấm dứt.</li><li><strong>Yêu cầu rút tiền:</strong> Từ chối thanh toán đối với các khoản thưởng gian lận theo quy định.</li>'
  :'<li><strong>Tài khoản:</strong> Tạm khóa để xác minh.</li><li><strong>Nhiệm vụ và nhận thưởng:</strong> Tạm đình chỉ.</li><li><strong>Yêu cầu rút tiền:</strong> Tạm dừng thanh toán trong thời gian xác minh.</li>';
 const pendingText=pending===null||pending===undefined
  ?'Các yêu cầu chưa thanh toán đang tạm dừng xử lý.'
  :pending>0?`Có ${fmt(pending)} yêu cầu rút tiền chưa thanh toán đang được giữ để đối chiếu.`
  :'Hiện không có yêu cầu rút tiền đang chờ xử lý.';
 app.className='';
 app.innerHTML=`<div class="auth-page"><div class="auth-brand">
  <div class="brand-mark brand-mark-image"><img src="/logo.svg" alt="Logo Trạm Có Lúa" width="52" height="52"></div><p class="eyebrow">TRẠM CÓ LÚA • THÔNG BÁO TÀI KHOẢN</p>
  <h1>Thông báo từ Trạm Có Lúa</h1><p>Trạng thái tài khoản và yêu cầu rút tiền.</p></div>
  <section class="auth-card account-locked ${severe?'account-locked-severe':'account-locked-review'}">
   <h2>${headingText}</h2>
   <p>${intro}</p>
   <h3>⛔ Quyết định xử lý</h3>
   <ul class="lock-decisions">${decisions}</ul>
   ${severe?'':`<p>Sau khi xác minh, hệ thống sẽ quyết định mở khóa hoặc áp dụng biện pháp xử lý phù hợp.</p>`}
   <div class="lock-payment-status"><strong>Tình trạng rút tiền hiện tại</strong>
    <p>${esc(pendingText)}</p>
    ${money.length?`<div class="table-wrap"><table><thead><tr><th>Giá trị</th><th>Trạng thái thực tế</th></tr></thead><tbody>${money.map(w=>`<tr><td>${fmt(w.vnd_amount)} ₫</td><td>${chip(w.status)}</td></tr>`).join('')}</tbody></table></div>`:''}
   </div>
   ${severe?'':info.reason&&info.reason!=='Tài khoản cần được xác minh thêm.'?`<p class="note">Thông tin thêm: ${esc(info.reason)}</p>`:''}
   <p class="lock-signature">🛡️ <strong>Trạm Có Lúa – Hệ thống chống gian lận</strong></p>
   <button class="btn alt" data-action="logout" type="button">Đăng xuất</button>
  </section></div>`;
}

function googleAuthPanel(active){
 if(active==='setup')return '';
 if(!state.meta.google_auth_enabled)return '<p class="note auth-google-disabled">Đăng nhập Google sẽ hiển thị sau khi chủ website cấu hình Google Cloud.</p>';
 if(active==='register')return '<div class="oauth-separator"><span>HOẶC</span></div>'+
  '<button class="google-auth-btn" type="button" data-action="google-register">'+
  '<span class="google-g" aria-hidden="true">G</span>Đăng ký với Google</button>'+
  '<p class="note">Đăng ký bằng Google sẽ dùng tên hiển thị từ tài khoản Google. Hãy tích đồng ý điều khoản trước khi tiếp tục.</p>';
 return '<div class="oauth-separator">hoặc</div>'+
  '<button class="google-auth-btn" type="button" data-action="google-login">'+
  '<span class="google-g" aria-hidden="true">G</span>'+
  'Tiếp tục với Google</button>'+
  '<p class="note">Gmail mới sẽ được hướng dẫn đồng ý điều khoản để tạo tài khoản thành viên; Gmail đã liên kết sẽ đăng nhập ngay.</p>';
}
function googleProfilePanel(){
 const connected=Boolean(state.me.google_linked);
 if(!state.meta.google_auth_enabled)return '<section class="card"><h3>Đăng nhập bằng Google</h3>'+
  '<p>'+(connected?'Tài khoản đã liên kết Google, nhưng máy chủ hiện chưa bật đăng nhập Google.':'Tính năng liên kết Google tạm thời chưa khả dụng.')+'</p>'+
  (state.me.user.role==='admin'?'<div class="callout">Quản trị viên: vào Cloudflare → Workers & Pages → tram-lua → Settings → Variables and Secrets. Kiểm tra GOOGLE_CLIENT_ID (Variable) và GOOGLE_CLIENT_SECRET (Secret) trong Production. Nếu thiếu GOOGLE_CLIENT_ID, hãy thêm lại Client ID lấy từ Google Cloud. Không chia sẻ Client Secret.</div>':'<p class="note">Vui lòng thử lại sau hoặc liên hệ quản trị viên.</p>')+'</section>';
 return '<section class="card"><h3>Đăng nhập bằng Google</h3><p>'+
  (connected?'Đã liên kết Google. Bạn có thể đăng nhập bằng Google.':'Liên kết Google cùng email để giữ nguyên Lúa và lịch sử.')+
  '</p>'+(connected?'<span class="chip approved">Đã liên kết</span>':'<button class="btn alt" data-action="google-link">Liên kết Google</button>')+'</section>';
}

function renderAuth(){
 if(state.googlePending){
  app.className='';
  app.innerHTML=`<div class="auth-page auth-page-login">
   <div class="auth-brand"><div class="auth-brand-new-logo"><img src="/logo.svg" width="83" height="83" alt="Logo Trạm Có Lúa"></div>
    <p class="eyebrow">TRẠM CÓ LÚA • NỀN TẢNG NHIỆM VỤ</p><h1>Chào mừng bạn đến Trạm Có Lúa.</h1>
    <p>Đăng ký bằng Google để khám phá nhiệm vụ và quản lý điểm Lúa.</p></div>
   <section class="auth-card">
    <div class="auth-logo-line"><img src="/logo.svg" alt="" width="56" height="56"><div><strong>TRẠM CÓ LÚA</strong><span>ĐĂNG KÝ BẰNG GOOGLE</span></div></div>
    <span class="auth-form-kicker"><i></i> THÀNH VIÊN MỚI</span>
    <h2>Hoàn tất đăng ký Google</h2>
    <p class="auth-intro">Email <strong>${esc(state.googlePending.email)}</strong> chưa có tài khoản. Bạn không cần tạo mật khẩu, chỉ cần đồng ý điều khoản để tiếp tục.</p>
    <form data-form="google-complete"><div class="auth-legal"><label><input type="checkbox" name="accept_terms" value="yes" required>
     Tôi đồng ý <a href="/terms.html" target="_blank" rel="noopener">Điều khoản</a> và
     <a href="/privacy.html" target="_blank" rel="noopener">Chính sách quyền riêng tư</a>.</label></div>
     <button class="auth-submit" type="submit">Đồng ý và tạo tài khoản</button>
    </form>
    <button class="google-auth-btn" type="button" data-action="google-cancel" style="margin-top:13px">Hủy và trở lại</button>
   </section></div>`;
  return;
 }
 const mode=state.authMode;
 const ref=new URLSearchParams(location.search).get('ref')||'';
 const tabs=state.meta.setup_required? [['setup','Thiết lập Admin'],['login','Đăng nhập'],['register','Đăng ký']] : [['login','Đăng nhập'],['register','Đăng ký email']];
 // Không ép quay lại Thiết lập Admin khi người dùng chọn tab Đăng nhập.
 const active=state.authMode;
 const form=active==='setup'? `<form data-form="setup">
  ${authField('setup_key','Khóa cài đặt bí mật','Nhập khóa quản trị','required type="password" autocomplete="off"','password')}
  ${authField('name','Tên quản trị viên','Tên quản trị viên','required minlength="2"','username')}
  ${authField('email','Email','you@example.com','required type="email" autocomplete="email"','email')}
  ${authField('password','Mật khẩu','Ít nhất 8 ký tự','required type="password" minlength="8" maxlength="128" autocomplete="new-password"','password')}
  <button class="auth-submit" type="submit">Tạo Admin đầu tiên</button>
  <p class="note">Khóa cài đặt được đặt trên máy chủ, không phải mật khẩu tài khoản.</p>
 </form>`:
 active==='register'?`<form data-form="register">
  ${authField('username','Tên đăng nhập','4–20 ký tự, a-z, 0-9','required minlength="4" maxlength="20" pattern="[a-z0-9]{4,20}" autocapitalize="none" spellcheck="false" autocomplete="username"','username')}
  ${authField('email','Email','you@example.com','required type="email" autocomplete="email"','email')}
  ${state.meta.gmail_google_required?'<p class="note">Gmail mới cần xác minh qua Đăng ký với Google bên dưới. Tài khoản Gmail đã đăng ký trước đó vẫn có thể dùng mật khẩu.</p>':''}
  ${authField('password','Mật khẩu','Ít nhất 8 ký tự','required type="password" minlength="8" maxlength="128" autocomplete="new-password"','password')}
  ${authField('referral_code','Mã giới thiệu (không bắt buộc)','Ví dụ: A1B2C3D4E5 (10 ký tự)','maxlength="10" autocapitalize="characters" autocomplete="off"','gift',ref)}
  <div class="auth-legal"><label><input type="checkbox" name="accept_terms" value="yes" required>
   Tôi đồng ý <a href="/terms.html" target="_blank" rel="noopener">Điều khoản</a> và <a href="/privacy.html" target="_blank" rel="noopener">Chính sách quyền riêng tư</a>.
  </label></div>
  <button class="auth-submit" type="submit">Đăng ký</button>
 </form>`:
 `<form data-form="login">
  ${authField('email','Email hoặc tên đăng nhập','Nhập email hoặc tên đăng nhập','required type="text" autocomplete="username" autocapitalize="none" spellcheck="false"','email')}
  ${authField('password','Mật khẩu','Nhập mật khẩu của bạn','required type="password" autocomplete="current-password"','password')}
  <button class="auth-submit" type="submit">Đăng nhập</button>
 </form>`;
 app.className='';
 app.innerHTML=`<div class="auth-page auth-page-login">
  <div class="auth-brand">
    <div class="auth-brand-new-logo"><img src="/logo.svg" width="83" height="83" alt="Logo Trạm Có Lúa"></div>
    <p class="eyebrow">TRẠM CÓ LÚA • NỀN TẢNG NHIỆM VỤ</p>
    <h1>Làm nhiệm vụ.<br>Tích Lúa.<br>Nhận thành quả.</h1>
    <p>Đăng ký miễn phí để bắt đầu làm nhiệm vụ và quản lý điểm Lúa. Mọi phần thưởng phụ thuộc kết quả được xác minh.</p>
  </div>
  <section class="auth-card">
   <button class="welcome-home-back" type="button" data-action="back-home">← Quay lại trang chủ</button>
   <div class="auth-logo-line"><img src="/logo.svg" alt="" width="56" height="56"><div><strong>TRẠM CÓ LÚA</strong><span>LÀM NHIỆM VỤ · TÍCH LÚA</span></div></div>
   <span class="auth-form-kicker"><i></i>${active==='setup'?'QUẢN TRỊ HỆ THỐNG':active==='register'?'THÀNH VIÊN MỚI':'CHÀO MỪNG TRỞ LẠI'}</span>
   <h2>${active==='setup'?'Khởi tạo hệ thống':active==='register'?'Tạo tài khoản':'Đăng nhập'}</h2>
   <p class="auth-intro">${active==='setup'?'Chỉ dành cho chủ website.':active==='register'?'Bắt đầu hoàn thành nhiệm vụ, tích Lúa và theo dõi phần thưởng của bạn.':'Tiếp tục hành trình làm nhiệm vụ và quản lý tài khoản của bạn.'}</p>
   ${form}
   ${googleAuthPanel(active)}
   ${active==='register'?'<p class="auth-switch">Đã có tài khoản? <button type="button" data-auth="login">Đăng nhập</button></p>':active==='login'?'<p class="auth-switch">Chưa có tài khoản? <button type="button" data-auth="register">Đăng ký</button></p>':''}
  </section>
 </div>`;
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
  <div class="side-header"><div class="side-brand"><span class="brand-mark brand-mark-image"><img src="/logo.svg" alt="" width="40" height="40"></span><span>${esc(state.meta.site_name)}</span></div><button type="button" class="sidebar-close" data-action="close-menu" aria-label="Đóng menu">×</button></div>
  <div class="side-kicker">${user.role==='admin'?'BẢNG QUẢN TRỊ':'KHÔNG GIAN THÀNH VIÊN'}</div>
  <nav class="nav">${nav.map(([key,symbol,name])=>`<button data-go="${key}" class="${state.view===key?'active':''}"><span class="symbol">${symbol}</span>${esc(name)}</button>`).join('')}</nav>
  <div class="sidebar-bottom"><strong>${esc(user.name)}</strong>${esc(user.email)}<button data-action="logout">Đăng xuất ↗</button></div>
 </aside><button type="button" class="menu-backdrop" tabindex="-1" data-action="close-menu" aria-label="Đóng menu"></button><section class="main-area"><header class="topbar"><div class="topbar-leading"><button type="button" class="menu-toggle" id="menu-toggle" data-action="toggle-menu" aria-controls="site-menu" aria-expanded="false" aria-label="Mở menu"><span aria-hidden="true">☰</span></button><div class="topbar-title"><h1 id="topTitle">Bảng điều khiển</h1><p>Quản lý minh bạch • Cập nhật theo dữ liệu thật</p></div></div>
 <div class="top-right"><span class="balance-pill" id="topBalance">🌾 ${fmt(state.me.balance)} Lúa</span><span class="avatar" title="${esc(user.name)}">${esc(user.name[0]?.toUpperCase()||'T')}</span></div></header>
 <main class="content" id="viewContent"></main></section></div><div id="modal-root"></div>`;
 setMenuOpen(false);
}
async function refreshMe(){await loadMe();if(!state.me){if(state.accountHold)renderLocked();else renderHome();return;}document.getElementById('topBalance').textContent='🌾 '+fmt(state.me.balance)+' Lúa';}
async function navigate(view){
 state.view=view;
 const nav=state.me?.user.role==='admin'?ADMIN_NAV:NAV;
 const found=nav.find(n=>n[0]===view);
 document.querySelectorAll('[data-go]').forEach(btn=>btn.classList.toggle('active',btn.dataset.go===view));
 const top=document.getElementById('topTitle');if(top)top.textContent=found?.[2]||'Tổng quan';
 const root=document.getElementById('viewContent');if(!root)return;
 root.innerHTML='<div class="app-loading" style="min-height:180px"><span class="spinner"></span></div>';
 try{root.innerHTML=await page(view);}catch(e){
  if(e.status===403){
   const hold=await api('/api/account-status').catch(()=>null);
   if(hold?.account_status==='suspended'){state.me=null;state.accountHold=hold;renderLocked();return;}
  }
  root.innerHTML=`<div class="callout">Không tải được dữ liệu: ${esc(e.message)}</div>`;
 }
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
 <section class="card hero"><div><div class="small">VÍ TÍCH LŨY</div><h2>${fmt(m.balance)} Lúa hiện có</h2><p>Tham gia nhiệm vụ và theo dõi số dư của bạn. Phần thưởng chỉ phát sinh từ nhiệm vụ hợp lệ.</p><button class="btn gold" data-go="tasks">Xem nhiệm vụ →</button></div><div class="hero-icon brand-hero-logo"><img src="/logo.svg" width="104" height="104" alt="Biểu tượng Trạm Có Lúa"></div></section>
 <section class="grid four section"><div class="card"><div class="metric-label">Số dư hiện tại</div><div class="metric">${fmt(m.balance)}</div><div class="metric-caption">Lúa có thể sử dụng</div></div>
 <div class="card"><div class="metric-label">Tổng Lúa đã ghi nhận</div><div class="metric">${fmt(m.earned)}</div><div class="metric-caption">Bao gồm thưởng đã duyệt</div></div>
 <div class="card"><div class="metric-label">Nhiệm vụ chưa làm</div><div class="metric">${available}</div><div class="metric-caption">Đang mở thực tế</div></div>
 <div class="card"><div class="metric-label">Người được giới thiệu</div><div class="metric">${fmt(m.referral_count)}</div><div class="metric-caption">Tài khoản đã đăng ký</div></div></section>
 <section class="grid two section"><article class="card"><h3>📢 Thông báo hệ thống</h3><p>${esc(state.meta.announcement||'Chào mừng đến với nền tảng. Theo dõi thông báo từ quản trị viên tại đây.')}</p></article>
 <article class="card"><h3>🛡️ Kiểm tra chống gian lận</h3><div class="field-hint">IP đang truy cập</div><div class="field-output">${esc(m.ip)}</div><div class="field-hint" style="margin-top:10px">📱 Đã định danh thiết bị</div><div class="field-output">${esc(maskDeviceCode(m.device_code))}</div><p class="note">Mã do website lưu trên trình duyệt nếu được cho phép. Đây không phải IMEI và có thể bị xóa hoặc thay đổi.</p></article></section>`;
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
// Chỉ lấy IPv4 khi người dùng tự dán; tuyệt đối không thay đổi IP tin cậy trên máy chủ.
function parsePastedIPv4(raw){
 const text=String(raw||'').trim();
 let value=text;
 if(text.startsWith('{')){
  try{value=String(JSON.parse(text)?.ip||'').trim();}catch{value='';}
 }
 return isIPv4(value)?value:'';
}
function showPastedIPv4(){
 const input=document.getElementById('taskIPv4ManualInput');
 const ipv4=parsePastedIPv4(input?.value);
 if(!ipv4){toast('IPv4 không hợp lệ. Vui lòng kiểm tra lại.',true);return;}
 const el=document.getElementById('taskDisplayIP');
 const label=document.getElementById('taskIPLabel');
 if(!el||!label)return;
 el.textContent=ipv4;
 label.textContent='IPv4 tự nhập • chưa được website xác minh';
 const note=document.getElementById('taskIPv4Help');
 if(note)note.textContent='';
 const existing=document.getElementById('taskCopyIPv4');
 const copy=existing||document.createElement('button');
 if(!existing){
  copy.id='taskCopyIPv4';copy.type='button';copy.className='task-ip-btn';
  copy.dataset.action='copy-ip';
  document.querySelector('.task-ip-tools')?.append(copy);
 }
 copy.dataset.value=ipv4;copy.textContent='Sao chép IPv4';
 toast('Đã hiển thị IPv4 bạn cung cấp. Chưa được hệ thống xác minh.');
}
// Chỉ hiển thị IP thật, không sinh IPv4 ảo từ IPv6.
// observed là kết quả do trình duyệt tự gửi về từ dịch vụ IPv4 bên ngoài;
// có thể bị sửa nên không được dùng riêng nó để kết luận gian lận.
const adminIP = (ip,observed=null) => {
 const value=String(ip||'').trim();
 const raw=`<div><code class="risk-ip-full">${esc(value||'—')}</code>${value?` <button type="button" class="risk-ip-copy" data-action="copy-ip" data-value="${esc(value)}">Sao chép</button>`:''}</div>`;
 if(!observed?.observed_ipv4||!isIPv4(observed.observed_ipv4))return raw;
 const label=observed.observed_ipv4===value?'IPv4 được Cloudflare xác nhận':'IPv4 do trình duyệt báo qua dịch vụ kiểm tra (chưa xác minh)';
 return `<div class="risk-ip-short">
  <div class="risk-ip-identity"><span class="risk-ip-label">${esc(label)}</span><code class="risk-ip-code">${esc(observed.observed_ipv4)}</code></div>
  <div class="risk-ip-network">IP Cloudflare ghi nhận: ${raw}</div>
 </div>`;
};

function taskDashboardCard(d,quotas={}){
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
  <section class="card task-device-card task-security-compact" aria-label="Bảo vệ chống gian lận">
   <h3 class="task-security-title">🛡️ Bảo vệ chống gian lận</h3>
   <div class="task-security-ip"><span>IP hiện tại:</span> <strong id="taskDisplayIP">${esc(compactIP(d.ip))}</strong></div>
   <div class="task-security-id"><span>📱 Đã định danh thiết bị:</span> <code>${esc(maskDeviceCode(d.device_code))}</code></div>
   <div class="task-security-quotas"><span>Hạn mức nhiệm vụ được đặt lại lúc 00:00 (giờ Việt Nam).</span></div>
   <details class="task-security-details"><summary>Thông tin IP</summary>
    <span class="task-ip-type" id="taskIPLabel">${isIPv4(d.ip)?'IPv4 công khai':String(d.ip||'').includes(':')?'IPv6 công khai':'Chưa xác định IP'}</span>
    <div class="task-ip-tools">
     ${String(d.ip||'').includes(':')?'<button class="task-ip-btn" type="button" data-action="check-ipv4">Kiểm tra IPv4</button>':''}
     <button class="task-ip-btn" type="button" data-action="copy-ip" data-value="${esc(d.ip)}">Sao chép IP kết nối</button>
    </div>
    <div class="task-security-full-ip">IP kết nối: <code>${esc(d.ip)}</code></div>
   </details>
  </section>
 </div>`;
}


// Dữ liệu IPv4 dùng để HIỂN THỊ, không dùng để xét thưởng hoặc chống gian lận.
// Trình duyệt có thể chặn request từ website dù URL mở trực tiếp vẫn hoạt động.
const PUBLIC_IPV4_PROVIDERS=[
 {label:'ipify',json:'https://api.ipify.org?format=json',jsonp:'https://api.ipify.org?format=jsonp&callback=tramLuaIPv4'},
 {label:'SeeIP',json:'https://ipv4.seeip.org/jsonip',jsonp:'https://ipv4.seeip.org/jsonip?callback=tramLuaIPv4'}
];
async function ipv4FromFetch(provider){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6500);
 try{
  const response=await fetch(provider.json,{
   mode:'cors',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
   signal:controller.signal
  });
  if(!response.ok)throw new Error('HTTP '+response.status);
  const obj=await response.json(),ip=String(obj?.ip||'');
  if(!isIPv4(ip))throw new Error('Phản hồi không phải IPv4');
  return ip;
 }catch(error){
  throw new Error(provider.label+' (fetch): '+(error?.name||'Error')+': '+String(error?.message||'Không rõ lỗi').slice(0,130));
 }finally{clearTimeout(timeout);}
}
// JSONP chạy trong iframe sandbox với opaque origin, không truy cập phiên đăng nhập.
function ipv4FromJSONP(provider){
 return new Promise((resolve,reject)=>{
  const token=crypto.randomUUID(),frame=document.createElement('iframe');
  frame.setAttribute('sandbox','allow-scripts');
  frame.setAttribute('title','Kiểm tra IPv4');
  frame.style.cssText='position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none';
  let settled=false;
  const complete=(ip,reason)=>{
   if(settled)return;
   settled=true;window.removeEventListener('message',receive);
   clearTimeout(timer);frame.remove();
   if(isIPv4(ip))resolve(ip);
   else reject(new Error(provider.label+' (JSONP): '+(reason||'Không nhận được IPv4')));
  };
  const receive=e=>{
   if(e.source!==frame.contentWindow||e.data?.kind!=='tram-lua-v4'||e.data?.token!==token)return;
   complete(String(e.data.ip||''),String(e.data.reason||'').slice(0,130));
  };
  const timer=setTimeout(()=>complete('','Hết thời gian nhận callback (7,5 giây)'),7500);
  window.addEventListener('message',receive);
  // Tạo script bằng DOM bên trong iframe: tránh lỗi escape dấu nháy trong HTML onerror.
  const scriptSource='function tramLuaIPv4(d){parent.postMessage({kind:"tram-lua-v4",token:'+JSON.stringify(token)+',ip:d&&d.ip},"*");}'
   +'var ext=document.createElement("script");'
   +'ext.src='+JSON.stringify(provider.jsonp)+';'
   +'ext.onerror=function(){parent.postMessage({kind:"tram-lua-v4",token:'+JSON.stringify(token)+',reason:"Không tải được script JSONP"},"*");};'
   +'document.head.appendChild(ext);';
  frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><script>'+scriptSource+'</scr'+'ipt></head><body></body></html>';
  document.body.appendChild(frame);
 });
}
async function resolvePublicIPv4(){
 const reasons=[];
 try{return await Promise.any(PUBLIC_IPV4_PROVIDERS.map(p=>ipv4FromFetch(p)));}
 catch(error){reasons.push(...(error?.errors||[error]).map(e=>String(e?.message||e).slice(0,200)));}
 try{return await Promise.any(PUBLIC_IPV4_PROVIDERS.map(p=>ipv4FromJSONP(p)));}
 catch(error){reasons.push(...(error?.errors||[error]).map(e=>String(e?.message||e).slice(0,200)));}
 const failure=new Error('Không tìm được IPv4 trong trình duyệt.');
 failure.details=reasons;
 throw failure;
}

// Ghi nhận IPv4 tự động cho thành viên có kết nối IPv6, không yêu cầu
// khách phải mở riêng trang Nhiệm vụ. Không áp dụng cho Admin.
// Dữ liệu do trình duyệt báo chỉ dùng để tham khảo, không làm căn cứ khóa.
const IPV4_AUTO_STORAGE_KEY='tram-lua-ipv4-autocheck-v1';
let ipv4ProbePromise=null, ipv4AutoPromise=null;
function sharedPublicIPv4Probe(){
 if(!ipv4ProbePromise){
  ipv4ProbePromise=resolvePublicIPv4().finally(()=>{ipv4ProbePromise=null;});
 }
 return ipv4ProbePromise;
}
async function captureMemberIPv4(){
 const me=state.me;
 if(me?.user?.role!=='member'||!String(me.ip||'').includes(':'))return;
 if(ipv4AutoPromise)return ipv4AutoPromise;
 const key=String(me.user.id)+'|'+String(me.ip);
 let cached=null;
 try{cached=JSON.parse(sessionStorage.getItem(IPV4_AUTO_STORAGE_KEY)||'null');}catch{}
 if(cached?.key===key&&Number.isFinite(cached.at)){
  const age=Date.now()-cached.at;
  if(age>=0&&age<(cached.ok?6*60*60*1000:5*60*1000))return;
 }
 ipv4AutoPromise=(async()=>{
  let success=false;
  try{
   const ipv4=await sharedPublicIPv4Probe();
   await api('/api/me/ipv4-report','POST',{ip:ipv4});
   success=true;
  }catch{
   // IPv4 không khả dụng trên mọi mạng. Cloudflare vẫn ghi IP kết nối thật.
  }finally{
   try{sessionStorage.setItem(IPV4_AUTO_STORAGE_KEY,JSON.stringify({
    key,at:Date.now(),ok:success
   }));}catch{}
  }
 })().finally(()=>{ipv4AutoPromise=null;});
 return ipv4AutoPromise;
}

function updateIPv4Diagnostics(details){
 const container=document.getElementById('taskIPv4Diagnostics');
 const output=document.getElementById('taskIPv4DebugInfo');
 if(!container||!output)return;
 const lines=Array.isArray(details)?details:[];
 container.hidden=lines.length===0;
 output.textContent=lines.join('\n');
}

async function detectPublicIPv4(button,silent=false){
 if(!button?.isConnected||button.disabled)return;
 if(!document.getElementById('taskDisplayIP'))return;
 button.disabled=true;
 button.textContent='Đang tìm IPv4…';
 try{
  const ip=await sharedPublicIPv4Probe();
  const currentIP=document.getElementById('taskDisplayIP');
  const label=document.getElementById('taskIPLabel');
  if(!button.isConnected||!currentIP||!label||state.view!=='tasks')return;
  currentIP.textContent=ip;
  label.textContent='IPv4 công khai';
  updateIPv4Diagnostics([]);
  const note=document.getElementById('taskIPv4Help');
  if(note)note.textContent='';
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
  // Ghi lại kết quả dịch vụ IPv4 trong khu vực Admin, nhưng không coi
  // đây là IP đã được Cloudflare xác minh khi kết nối chính dùng IPv6.
  api('/api/me/ipv4-report','POST',{ip}).catch(()=>{});
  if(!silent)toast('Đã nhận diện IPv4 công khai.');
 }catch(error){
  if(button.isConnected&&state.view==='tasks'){
   updateIPv4Diagnostics(error?.details||[String(error?.message||'Không rõ lỗi')]);
   const label=document.getElementById('taskIPLabel');
   if(label)label.textContent='IPv6 • chưa đọc được IPv4 trong trang web';
   const note=document.getElementById('taskIPv4Help');
   if(note)note.textContent='';
   if(!silent)toast('Không tìm được IPv4. IP kết nối vẫn được ghi nhận.',true);
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
 const shownTasks=data.tasks.filter(t=>state.taskFilter==='all'||t.category===state.taskFilter);
 setTimeout(startTaskResetTimer,0);
 if(String(stats.ip||'').includes(':'))setTimeout(()=>{const button=document.querySelector('.task-ip-btn[data-action="check-ipv4"]');if(button&&state.view==='tasks')detectPublicIPv4(button,true);},0);
 return `${heading('Nhiệm vụ','Thông tin thanh toán, Lúa và an toàn lấy trực tiếp từ hệ thống.')}
 ${taskDashboardCard(stats,data)}
 <h3 class="task-list-heading">Danh sách nhiệm vụ</h3>
 <div class="task-filter-row">${[['all','Tất cả'],['app','📱 Nhiệm vụ App'],['link','🔗 Link'],['video','🎬 Video'],['other','Khác']].map(([value,label])=>`<button type="button" class="btn ${state.taskFilter===value?'':'alt'} sm" data-action="filter-tasks" data-filter="${value}">${label}</button>`).join('')}</div>
 ${shownTasks.length?`<div class="grid">${shownTasks.map(t=>`<article class="card task-card">
 <div class="task-top"><span class="task-icon">${t.category==='video'?'🎬':t.category==='link'?'🔗':t.category==='app'?'📱':'📋'}</span><strong class="green">+${fmt(t.reward)} Lúa</strong></div>
 <h3>${esc(t.title)}</h3><p>${esc(t.description||'Làm theo hướng dẫn của quản trị viên.')}</p>
 ${t.category==='app'?`<div class="app-ref-code">Mã giới thiệu: <strong>${esc(t.app_referral_code||'—')}</strong> <button class="btn alt sm" data-action="copy" data-value="${esc(t.app_referral_code||'')}">Sao chép mã</button></div><p class="note">Đăng ký tài khoản mới trong app, nhập đúng mã rồi chụp ảnh gửi Admin. Chỉ nhận Lúa sau khi được duyệt.</p>`:''}
 <div class="task-meta">${t.category==='video'?`<span>${t.min_seconds} giây tối thiểu</span><span>•</span>`:''}<span>${t.review_mode==='manual'?'Admin duyệt bằng chứng':'Kiểm tra tự động'}</span></div>
 <div class="task-meta"><span>${t.category==='link'&&t.link_24h_limit>1?`${t.link_24h_count||0}/${t.link_24h_limit} lượt nhiệm vụ này / ngày`:t.repeat_policy==='daily'?'Mỗi ngày 1 lượt':'Mỗi tài khoản 1 lượt'}</span></div>
 ${t.link_blocked
   ?`<p class="task-link-blocked">⛔ ${t.link_blocked==='link_browser_owner'?'Bạn đã làm hết nhiệm vụ hôm nay. Mã trình duyệt đã được tài khoản khác sử dụng. Lượt mới được mở lúc 00:00 ngày mai (giờ Việt Nam).':t.link_blocked==='link_browser_limit'?'Trình duyệt này đã hết lượt nhiệm vụ link trong ngày hôm nay. Đổi mạng không làm mới lượt.':t.link_blocked==='link_browser_missing'?'Chưa xác minh được mã nhận diện trình duyệt. Hãy tải lại trang.':t.link_blocked==='link_owner'?'Bạn đã làm hết nhiệm vụ hôm nay. IP đã được tài khoản khác sử dụng. Lượt mới được mở lúc 00:00 ngày mai (giờ Việt Nam).':t.link_blocked==='link_limit'?'IP này đã đủ lượt nhiệm vụ link trong ngày hôm nay.':'Bạn đã hết lượt nhiệm vụ này hôm nay. Lượt mới được mở lúc 00:00 ngày mai (giờ Việt Nam).'}</p>`
   :t.my_status?chip(t.my_status):`<button class="btn" data-action="start-task" data-id="${esc(t.id)}">Bắt đầu nhiệm vụ →</button>`}
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
 const t=`${heading('Yêu cầu rút tiền','Theo dõi: Đang chờ → Đã duyệt → Đã thanh toán. Admin kiểm tra và chi trả bằng ngân hàng hoặc ZaloPay.')}`;
 const info=!meta.withdrawals_enabled?`<div class="callout">⚠ Admin chưa mở chi trả hoặc chưa thiết lập tỷ giá Lúa/VNĐ. Bạn chưa thể tạo yêu cầu rút tiền.</div>`:'';
 const form=`<form class="card" data-form="withdraw"><h3>Tạo yêu cầu rút</h3>
 ${field('amount','Số Lúa muốn rút','',`type="number" min="${meta.min_withdraw_lua}" step="1" required ${!meta.withdrawals_enabled?'disabled':''}`)}
 <div class="note">Tối thiểu ${fmt(meta.min_withdraw_lua)} Lúa • ${meta.lua_per_vnd?fmt(meta.lua_per_vnd)+' Lúa = 1 VNĐ':'Chưa có tỷ giá'} • Số dư: ${fmt(state.me.balance)} Lúa</div>
 <div id="withdraw-payment-method">${select('payment_method','Phương thức nhận tiền',[['bank','Chuyển khoản ngân hàng'],['zalopay','Ví ZaloPay']],'bank')}</div>
 <div id="withdraw-bank-fields">
 <div class="field"><label for="bank_name">Ngân hàng nhận</label><select id="bank_name" name="bank_name" required ${!meta.withdrawals_enabled?'disabled':''}>${BANK_LIST.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>
 <div id="withdraw-bank-other" hidden>${field('bank_other','Nhập tên ngân hàng khác','',`disabled`)}</div>
 ${field('bank_account','Số tài khoản ngân hàng (chỉ chữ số)','',`required inputmode="numeric" pattern="[0-9]{5,30}" ${!meta.withdrawals_enabled?'disabled':''}`)}
 ${field('bank_owner','Tên chủ tài khoản ngân hàng','',`required ${!meta.withdrawals_enabled?'disabled':''}`)}
 </div>
 <div id="withdraw-zalopay-fields" hidden>
 ${field('zalopay_phone','Số điện thoại đăng ký ZaloPay','',`type="tel" inputmode="tel" pattern="0[0-9]{9}" maxlength="10" placeholder="0xxxxxxxxx" disabled`)}
 ${field('zalopay_owner','Tên chủ ví ZaloPay','',`disabled`)}
 <p class="note">Ví ZaloPay phải thuộc số điện thoại người nhận. Admin sẽ chuyển tiền và đối chiếu thủ công.</p>
 </div>
 <button class="btn" type="submit" ${!meta.withdrawals_enabled?'disabled':''}>Gửi yêu cầu</button>
 <p class="note">Lúa sẽ được giữ ngay khi gửi để không bị rút trùng. Nếu Admin từ chối hoặc đánh dấu số tài khoản không đúng, hệ thống tự hoàn Lúa.</p></form>`;
 const rows=data.withdrawals.map(w=>`<tr><td>${dt(w.created_at)}</td><td class="num">${fmt(w.amount)} Lúa</td><td>${fmt(w.vnd_amount)} ₫</td><td>${esc(w.payment_method==='zalopay'?'ZaloPay':w.bank_name)}<div class="small muted">${esc(w.bank_account)}</div></td><td>${chip(w.status)}</td><td>${esc(w.admin_note||'—')}</td></tr>`);
 return t+info+`<section class="grid two section">${form}<div class="card"><h3>Thông tin minh bạch</h3><p>Hệ thống không tự chuyển tiền. Quản trị viên duyệt yêu cầu trước, sau đó thực hiện chuyển khoản ngân hàng hoặc ZaloPay ngoài website và đối chiếu giao dịch thực tế mới xác nhận <strong>Đã thanh toán</strong>.</p><p>Được duyệt không có nghĩa đã nhận tiền. Khách có thể theo dõi từng trạng thái trong lịch sử.</p></div></section><section class="section"><h3>Lịch sử yêu cầu rút</h3>${table(['Thời gian','Số Lúa','Giá trị VNĐ','Nhận qua','Trạng thái','Ghi chú'],rows)}</section>`;
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
 <div class="grid two"><section class="card"><h3>Thông tin tài khoản</h3><p><strong>Tên:</strong> ${esc(u.name)}</p><p><strong>Email:</strong> ${esc(u.email)}</p><p><strong>Vai trò:</strong> ${esc(u.role)}</p><p><strong>Tham gia:</strong> ${dt(u.created_at)}</p><p><strong>IP truy cập:</strong> <code>${esc(state.me.ip)}</code></p><p><strong>📱 Đã định danh thiết bị:</strong> <code>${esc(maskDeviceCode(state.me.device_code))}</code></p><div class="callout">Không chia sẻ mật khẩu hoặc mã cài đặt quản trị với bất kỳ ai.</div></section>
 <form class="card" data-form="password"><h3>Đổi mật khẩu</h3>
 ${field('old_password','Mật khẩu hiện tại','', 'required type="password" autocomplete="current-password"')}
 ${field('new_password','Mật khẩu mới (≥10 ký tự)','', 'required type="password" minlength="8" autocomplete="new-password"')}
 <button class="btn" type="submit">Lưu mật khẩu mới</button><p class="note">Đổi xong, tất cả phiên đăng nhập sẽ bị đăng xuất.</p></form>${googleProfilePanel()}</div>`;
}
async function adminOverview(){
 const d=await api('/api/admin/overview');
 return `${heading('Trung tâm điều hành','Số liệu đọc trực tiếp từ cơ sở dữ liệu, không dùng số liệu minh họa.')}
 <section class="grid four">${[['Thành viên',d.members],['Nhiệm vụ đang mở',d.tasks],['Bằng chứng chờ duyệt',d.pending_evidence],['Rút tiền chờ xử lý',d.pending_withdrawals]].map(([label,val])=>`<article class="card"><div class="metric-label">${esc(label)}</div><div class="metric">${fmt(val)}</div></article>`).join('')}</section>
 <section class="grid two section"><article class="card"><h3>🌾 Tổng Lúa phát hành</h3><div class="metric">${fmt(d.total_issued_lua)}</div><p>Giá trị cộng Lúa từ mọi loại thưởng đã ghi nhận. Đây không phải số tiền thật đã thanh toán.</p></article>
 <article class="card"><h3>🛡️ Hoạt động chống gian lận</h3><div class="metric">${fmt(d.risk_events_today)}</div><p>Sự kiện được ghi nhận hôm nay, giờ Việt Nam.</p><button data-go="admin-security" class="btn alt">Kiểm tra sự kiện →</button></article></section>
 <div class="callout section">Để có dữ liệu thật, hãy tạo nhiệm vụ, cấu hình chính sách thưởng và quy đổi. Trạng thái chi trả chỉ được cập nhật sau khi đã chuyển khoản thật.</div>`;
}
function taskForm(task={}){
 return `<form class="card" data-form="admin-task" id="task-form"><h3>${task.id?'Sửa nhiệm vụ':'Tạo nhiệm vụ thật'}</h3>
 <input type="hidden" name="id" value="${esc(task.id||'')}">
 ${field('title','Tên nhiệm vụ',task.title||'', 'required minlength="3"')}
 <div class="field"><label for="description">Hướng dẫn / mô tả</label><textarea id="description" name="description">${esc(task.description||'')}</textarea></div>
 <div class="form-row">${select('category','Loại nhiệm vụ',[['video','Video'],['link','Link rút gọn'],['app','App (tải & nhập mã)'],['other','Khác']],task.category||'video')}
 ${select('review_mode','Cách xét thưởng',[['manual','Admin kiểm tra bằng chứng'],['auto','Tự động sau khi xác nhận CAPTCHA']],task.review_mode||'manual')}</div>
 ${field('url','URL HTTPS (link tải app hoặc nhiệm vụ)',task.url||'', 'type="url" placeholder="https://..."')}
 ${field('app_referral_code','Mã giới thiệu của bạn (chỉ dùng cho App)',task.app_referral_code||'', 'maxlength="80" placeholder="Nhập mã giới thiệu trong ứng dụng"')}
 <p class="note">Nhiệm vụ App bắt buộc chọn Admin kiểm tra bằng chứng và Mỗi người một lần. Chỉ đăng nhiệm vụ mà chương trình giới thiệu của ứng dụng cho phép.</p>
 ${field('link_24h_limit','Lượt link rút gọn này / tài khoản / ngày',task.link_24h_limit||1,'type="number" min="1" max="20" required')}
 <p class="note">Chỉ áp dụng loại Link rút gọn. Nhập 1 giữ chính sách lặp đang chọn; từ 2 trở lên là số lượt mỗi ngày, đặt lại lúc 00:00 giờ Việt Nam. Không giới hạn tổng lượt trên toàn bộ danh sách link.</p>
 <div class="form-row">${field('reward','Thưởng (Lúa)',task.reward||100,'type="number" min="1" max="10000000" required')}
 <div id="task-time-field" ${(task.category||'video')==='video'?'':'hidden'}>${field('min_seconds','Thời gian tối thiểu cho Video (giây)',task.min_seconds||15,`type="number" min="5" max="3600" ${(task.category||'video')==='video'?'required':'disabled'}`)}</div></div>
 <div class="form-row">${select('repeat_policy','Lặp lại',[['once','Mỗi người một lần'],['daily','Mỗi ngày một lần']],task.repeat_policy||'once')}
 ${select('is_active','Trạng thái',[['1','Bật công khai'],['0','Tắt / nháp']],Number(task.is_active||0).toString())}</div>
 <div class="btn-row"><button class="btn" type="submit">${task.id?'Lưu chỉnh sửa':'Tạo nhiệm vụ'}</button>${task.id?'<button class="btn alt" type="button" data-action="reset-task">Tạo mới</button>':''}</div>
 <p class="note">Nhiệm vụ App, Link và Khác không yêu cầu thời gian chờ. Chỉ nhiệm vụ Video áp dụng thời gian tối thiểu. Không có khả năng xác minh người xem thực sự đã xem video tại nền tảng bên ngoài.</p></form>`;
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
 <td>${esc(u.name)}<div class="small muted">${dt(u.created_at)}</div></td><td>${esc(u.email)}</td><td class="num">${fmt(u.balance)}</td><td>${adminIP(u.joined_ip,u.ipv4_observation)}</td><td>${chip(u.status)}</td>
 <td>${u.role==='admin'?'Admin':`<div class="btn-row">
  ${u.status==='active'?`
   <button class="btn alt sm" data-action="view-fraud-account" data-id="${esc(u.id)}">🔎 Xem rủi ro</button>
   <button class="btn alt sm" data-action="change-user" data-id="${esc(u.id)}" data-status="suspended" data-lock-type="review">⚠ Tạm khóa</button>
   <button class="btn danger sm" data-action="change-user" data-id="${esc(u.id)}" data-status="suspended" data-lock-type="confirmed">⛔ Khóa vĩnh viễn</button>`:`
   ${u.suspension_type!=='confirmed'?`<button class="btn danger sm" data-action="change-user" data-id="${esc(u.id)}" data-status="suspended" data-lock-type="confirmed">⛔ Khóa vĩnh viễn</button>`:''}
   <button class="btn alt sm" data-action="view-fraud-account" data-id="${esc(u.id)}">🔎 Xem rủi ro</button>
   <button class="btn alt sm" data-action="change-user" data-id="${esc(u.id)}" data-status="active" data-lock-type="${esc(u.suspension_type||'review')}">Mở khóa</button>`}
  </div>`}
  ${u.status==='suspended'?`<div class="small muted">${u.suspension_type==='confirmed'?'<strong class="red">🚫 Khóa vĩnh viễn – Đã xác minh vi phạm</strong>':'⚠ Tạm khóa – Đang xác minh'}<div>Lý do: ${esc(u.suspension_reason||'Đang xác minh')}</div>${u.suspension_type==='confirmed'&&u.suspension_evidence?`<div>Bằng chứng Admin lưu: ${esc(u.suspension_evidence)}</div>`:''}</div>`:''}</td></tr>`))}</section>`;
}
async function adminReviews(){
 const d=await api('/api/admin/reviews');
 return `${heading('Duyệt bằng chứng','Chỉ khi duyệt thành công, Lúa mới được ghi vào ví thành viên.')}
 <section class="card">${table(['Thành viên / Nhiệm vụ','Bằng chứng','Thưởng','Kiểm tra','Duyệt'],d.reviews.map(c=>`<tr><td><strong>${esc(c.name)}</strong><div class="small">${esc(c.email)}</div><div class="muted small">${esc(c.title)} • ${dt(c.created_at)}</div></td>
 <td style="max-width:270px;white-space:pre-wrap">${c.has_photo?`<div class="app-proof-cell"><strong>📷 Đã gửi ảnh</strong><p class="small muted">${esc(c.evidence||'Không ghi chú')}</p><button class="btn alt sm" data-action="view-photo" data-id="${esc(c.id)}" data-note="${esc(c.evidence||'')}">Xem ảnh bằng chứng</button></div>`:esc(c.evidence||'(không có)')}</td><td>${fmt(c.reward)} Lúa</td><td><code>${esc(c.ip)}</code><div class="small muted">${esc(c.device_code)}</div></td>
 <td>${chip(c.status)}${c.status==='pending'?`<div class="btn-row section"><button class="btn sm" data-action="review" data-id="${esc(c.id)}" data-status="approved">Duyệt</button><button class="btn danger sm" data-action="review" data-id="${esc(c.id)}" data-status="rejected">Từ chối</button></div>`:''}</td></tr>`))}</section>`;
}
async function adminWithdrawals(){
 const [d,riskData]=await Promise.all([api('/api/admin/withdrawals'),api('/api/admin/fraud-scores')]);
 const risks=new Map((riskData.profiles||[]).map(x=>[x.user_id,x]));
 return `${heading('Yêu cầu rút tiền','Bước 1: Duyệt yêu cầu. Bước 2: Chuyển tiền thật. Bước 3: Đánh dấu đã thanh toán.')}
 <div class="callout">Website chỉ ghi nhận yêu cầu và tình trạng. Bạn phải tự chuyển tiền qua ngân hàng hoặc ZaloPay ngoài hệ thống và đối chiếu trước khi bấm “Đã thanh toán”.</div>
 <section class="card section">${table(['Thành viên','Số tiền','Kênh nhận','Trạng thái','Thao tác'],d.withdrawals.map(w=>`<tr>
 <td>${esc(w.name)}<div class="small muted">${esc(w.email)}</div><div class="small muted">${dt(w.created_at)}</div>${risks.get(w.user_id)?.level==='serious'?`<div class="small red">⚠ Cần đối chiếu trước khi thanh toán • ${fmt(risks.get(w.user_id).score)}/100</div>`:''}</td>
 <td class="num">${fmt(w.amount)} Lúa<div class="green">${fmt(w.vnd_amount)} ₫</div></td>
 <td><strong>${esc(w.payment_method==='zalopay'?'Ví ZaloPay':w.bank_name)}</strong><br><code>${esc(w.bank_account)}</code><div class="small">${esc(w.bank_owner)}</div></td>
 <td>${chip(w.status)}<div class="small muted">${esc(w.admin_note||'')}</div>${w.account_status==='suspended'&&['pending','approved'].includes(w.status)?'<div class="small red">🔒 Tạm dừng chi trả để xác minh tài khoản</div>':''}</td>
 <td>${['pending','approved'].includes(w.status)?`<div class="btn-row">${w.status==='pending'?`<button class="btn sm" data-action="withdraw-admin" data-id="${esc(w.id)}" data-status="approved" data-risk-level="${esc(risks.get(w.user_id)?.level||'low')}" ${w.account_status==='suspended'?'disabled title="Tài khoản tạm khóa"':''}>Đã duyệt</button>`:`<button class="btn sm" data-action="withdraw-admin" data-id="${esc(w.id)}" data-status="paid" data-risk-level="${esc(risks.get(w.user_id)?.level||'low')}" ${w.account_status==='suspended'?'disabled title="Tài khoản tạm khóa"':''}>Đã thanh toán</button>`}<button class="btn danger sm" data-action="withdraw-admin" data-id="${esc(w.id)}" data-status="invalid_account">Thông tin sai</button><button class="btn danger sm" data-action="withdraw-admin" data-id="${esc(w.id)}" data-status="rejected">Từ chối</button></div>`:'—'}</td></tr>`))}</section>`;
}
// Chỉ Admin mới gọi được API chi tiết; các tài khoản thành viên khác
// không thể đọc quan hệ mạng hay tài khoản của nhau.
async function showFraudAccount(userId){
 const {profile:p,window_days:days}=await api('/api/admin/fraud-account/'+encodeURIComponent(userId));
 const root=document.getElementById('modal-root');
 if(!root)return;
 const related=(list)=>(list||[]).length?
  list.map(a=>`<div class="small muted">• ${esc(a.email||a.name||a.user_id)}</div>`).join(''):
  '<div class="small muted">Không có tài khoản liên quan được ghi nhận.</div>';
 root.innerHTML=`<div class="modal-cover"><section class="modal fraud-account-modal" role="dialog"
  aria-modal="true" aria-label="Chi tiết chống gian lận theo tài khoản">
  <button class="close" type="button" data-action="close-modal" aria-label="Đóng">×</button>
  <h3>🔎 Báo cáo chống gian lận</h3>
  <p><strong>${esc(p.name)}</strong><div class="small muted">${esc(p.email)}</div></p>
  <div class="fraud-detail-score"><strong>${fmt(p.score)} / 100</strong> ${chip(p.level)} ${chip(p.status)}</div>
  <p class="note">Điểm rủi ro là cảnh báo để xác minh, không phải kết luận gian lận. Thống kê kết nối trong ${fmt(days||30)} ngày qua.</p>
  <div class="fraud-detail-stats">
   <div><strong>${fmt(p.ip_count||0)}</strong><span>IP / dải mạng</span></div>
   <div><strong>${fmt(p.device_count||0)}</strong><span>Mã trình duyệt</span></div>
   <div><strong>${fmt(p.shared_device_accounts||0)}</strong><span>TK chung mã</span></div>
   <div><strong>${fmt(p.shared_ip_accounts||0)}</strong><span>TK chung mạng</span></div>
  </div>
  <h4>⚠️ Dấu hiệu rủi ro</h4>
  ${(p.reasons||[]).length?(p.reasons||[]).map(x=>`<p class="fraud-reason">• ${esc(x)}</p>`).join(''):
   '<p class="small muted">Chưa có tín hiệu vượt ngưỡng cảnh báo từ dữ liệu hiện có.</p>'}
  <h4>📱 Mã trình duyệt đã ghi nhận</h4>
  ${(p.browsers||[]).length?p.browsers.map(g=>`<div class="fraud-connection">
   <code>${esc(g.device_code)}</code>
   <p class="small">${fmt(g.account_count)} tài khoản dùng chung mã • ${fmt(g.network_count)} IP/dải mạng</p>
   ${related(g.other_accounts)}</div>`).join(''):
   '<p class="small muted">Chưa ghi nhận mã trình duyệt ổn định.</p>'}
  <h4>🌐 IPv4 / IPv6 và thiết bị cùng mạng</h4>
  ${(p.networks||[]).length?p.networks.map(g=>`<div class="fraud-connection">
   <strong>${esc(g.ip_type)}</strong> <code>${esc(g.address)}</code>
   <p class="small">${fmt(g.account_count)} tài khoản • ${fmt(g.device_count)} mã trình duyệt khác nhau</p>
   ${related(g.other_accounts)}</div>`).join(''):
   '<p class="small muted">Chưa ghi nhận địa chỉ IP công khai trong các phiên gần đây.</p>'}
  <h4>👥 Tài khoản có dấu hiệu liên quan</h4>
  ${(p.related_accounts||[]).length?p.related_accounts.map(a=>`<div class="fraud-connection">
   <strong>${esc(a.email||a.name||a.user_id)}</strong>
   <p class="small muted">${esc((a.reasons||[]).join(' + '))}</p>
   </div>`).join(''):
   '<p class="small muted">Chưa có tài khoản liên quan trong dữ liệu ghi nhận.</p>'}
  <p class="note">Một IP có thể được nhiều người dùng chung. Một mã trình duyệt có thể bị sao chép, đổi hoặc xóa. Không tự động khóa hoặc từ chối thanh toán dựa trên những liên kết này.</p>
  <button type="button" class="btn alt" data-action="close-modal">Đóng báo cáo</button>
 </section></div>`;
}

async function adminSecurity(){
 const [d,anti]=await Promise.all([api('/api/admin/risk-events'),api('/api/admin/fraud-scores')]);
 const members=(anti.profiles||[]);
 const matching=members.filter(p=>
  (state.fraudFilter==='all'||state.fraudFilter===p.level)&&
  (p.name+' '+p.email).toLowerCase().includes(state.fraudSearch.trim().toLowerCase())
 );
 return `${heading('Chống gian lận','Ghi nhận sự kiện CAPTCHA sai, đăng nhập thất bại, hạn mức và IP nhiều tài khoản.')}
 <div class="callout">Chỉ hiện địa chỉ IP thật. Nếu trình duyệt khách kiểm tra được IPv4 công khai qua dịch vụ bên ngoài, hệ thống ghi nhận riêng làm thông tin tham khảo. IPv4 do trình duyệt báo có thể bị giả mạo, không được dùng một mình để khóa người dùng hoặc từ chối thưởng. Khi không có IPv4, hiển thị IPv6 do Cloudflare ghi nhận, tuyệt đối không tự chuyển thành IPv4 ảo.</div>
 <section class="card section"><h3>🛡️ Anti-Fraud 2.0 — Rủi ro từng tài khoản</h3>
 <p><strong>${fmt(anti.summary?.checked_accounts||0)}</strong> tài khoản được thống kê · <strong>${fmt(anti.summary?.serious||0)}</strong> nghiêm trọng · <strong>${fmt(anti.summary?.review||0)}</strong> cần kiểm tra · <strong>${fmt(anti.summary?.low||0)}</strong> mức thấp</p>
 <p class="note">Chọn từng tài khoản để xem IP/dải IPv6, mã trình duyệt và tài khoản có liên quan trong 30 ngày. Điểm rủi ro được tính từ các tín hiệu 14 ngày và lịch sử rút tiền 90 ngày. Không tự động kết luận gian lận. Mức nghiêm trọng chỉ giữ bước duyệt tiền cho đến khi Admin ghi kết quả đối chiếu.</p>
 <div class="fraud-filter-row">
  ${[['all','Tất cả'],['serious','Nghiêm trọng'],['review','Cần kiểm tra'],['low','Mức thấp']].map(([v,label])=>`<button type="button" class="btn sm ${state.fraudFilter===v?'':'alt'}" data-action="fraud-filter" data-level="${v}">${label}</button>`).join('')}
 </div>
 <form class="fraud-search-form" data-form="fraud-search">
  <input type="search" name="keyword" value="${esc(state.fraudSearch)}" placeholder="Tìm tên hoặc email thành viên" aria-label="Tìm tài khoản" maxlength="120">
  <button class="btn sm" type="submit">Tìm</button>
 </form>
 <p class="small muted">Tìm thấy ${fmt(matching.length)} tài khoản; hiển thị ${fmt(Math.min(100,matching.length))} tài khoản đầu tiên. Bạn có thể tìm bằng email để xem tài khoản khác.</p>
 ${table(['Tài khoản / Trạng thái','Điểm / Mức độ','IP và mã trình duyệt','Liên quan / Chi tiết'],matching.slice(0,100).map(p=>`<tr>
  <td><strong>${esc(p.name)}</strong><div class="small muted">${esc(p.email)}</div><div>${chip(p.status)}</div></td>
  <td><strong>${fmt(p.score)}/100</strong><div>${chip(p.level)}</div></td>
  <td><strong>${fmt(p.ip_count||0)}</strong> IP/dải mạng<div class="small muted">${fmt(p.device_count||0)} mã trình duyệt</div><div class="small muted">Nhiều nhất ${fmt(p.max_devices_same_ip||0)} mã trên một IP/dải</div></td>
  <td><div class="small"><strong>${fmt(p.shared_device_accounts||0)}</strong> tài khoản chung mã trình duyệt</div><div class="small"><strong>${fmt(p.shared_ip_accounts||0)}</strong> tài khoản chung IP/dải</div>
   <button class="btn alt sm" type="button" data-action="view-fraud-account" data-id="${esc(p.user_id)}">🔎 Xem chi tiết</button></td>
 </tr>`))}</section>
 <section class="card section"><h3>📱 Nhiều tài khoản dùng chung một mã trình duyệt</h3>
 <p class="note">Đây là mã trình duyệt được ghi nhận, không phải IMEI. Có thể bị đổi hoặc giả mạo; cần kết hợp nhiều chứng cứ khi đối chiếu.</p>
 ${table(['Mã trình duyệt','Số tài khoản / Mạng','Tài khoản liên quan'],(anti.shared_browsers||[]).slice(0,35).map(g=>`<tr>
  <td><code>${esc(g.device_code)}</code></td>
  <td><strong>${fmt(g.account_count)}</strong> tài khoản<div class="small muted">${fmt(g.network_count)} IP/dải mạng</div></td>
  <td>${(g.accounts||[]).slice(0,10).map(a=>`<div class="small"><button class="button-plain" type="button" data-action="view-fraud-account" data-id="${esc(a.user_id)}">${esc(a.email||a.name||'Thành viên')}</button></div>`).join('')}</td>
 </tr>`))}</section>
 <section class="card section"><h3>🌐 Nhiều mã trình duyệt trên cùng IP / dải IPv6</h3>
 <p class="note">Một IP có thể phục vụ nhiều thiết bị độc lập (Wi-Fi gia đình, quán cà phê hoặc nhà mạng). IPv6 được nhóm theo /64 và không đồng nghĩa cùng điện thoại.</p>
 ${table(['IP / Dải mạng','Mã trình duyệt / Tài khoản','Thành viên đã ghi nhận'],(anti.shared_networks||[]).filter(g=>g.device_count>=2||g.account_count>=2).slice(0,35).map(g=>`<tr>
  <td><strong>${esc(g.ip_type)}</strong><div>${adminIP(g.address)}</div></td>
  <td><strong>${fmt(g.device_count)}</strong> mã trình duyệt<div class="small muted">${fmt(g.account_count)} tài khoản</div></td>
  <td>${(g.accounts||[]).slice(0,10).map(a=>`<div class="small"><button class="button-plain" type="button" data-action="view-fraud-account" data-id="${esc(a.user_id)}">${esc(a.email||a.name||'Thành viên')}</button></div>`).join('')}</td>
 </tr>`))}</section>
 <section class="card section"><h3>📍 IPv4 thực tế đã ghi nhận</h3>
 <p><strong>${fmt((d.ipv4_inventory||[]).length)}</strong> địa chỉ IPv4 trong 30 ngày qua.</p>
 <p class="note">Hiển thị cả IPv4 của một tài khoản, không chỉ IP bị trùng. IPv4 máy chủ ghi nhận và IPv4 do trình duyệt báo được tách nguồn rõ ràng; không tự chuyển IPv6 thành IPv4.</p>
 ${table(['Địa chỉ IPv4','Nguồn ghi nhận','Tài khoản','Gần nhất'],(d.ipv4_inventory||[]).map(r=>`<tr>
  <td><code>${esc(r.ip)}</code></td>
  <td>${r.source==='cloudflare'?'Kết nối máy chủ (xác thực)':'Trình duyệt báo (chưa xác minh)'}</td>
  <td>${fmt(r.account_count)}</td>
  <td>${dt(r.last_seen)}</td>
 </tr>`))}</section>
 <section class="card section"><h3>🚨 Cảnh báo IP trùng lặp: IPv4 và IPv6</h3>
 <p class="note">Mức nghiêm trọng là ưu tiên kiểm tra, không phải kết luận gian lận. Cảnh báo nghiêm trọng khi ít nhất 5 tài khoản xuất hiện trên cùng IPv4 hoặc dải IPv6 /64 cùng với từ 2 mã trình duyệt trở lên. IPv4 do trình duyệt tự báo luôn là thông tin tham khảo.</p>
 <div class="risk-network-layout">${table(['Địa chỉ / Nguồn','Tài khoản / Thiết bị','Mức độ'],(d.network_alerts||[]).map(r=>`<tr>
 <td><strong>${esc(r.ip_type)}</strong><div>${adminIP(r.address)}</div><div class="small muted">${r.source==='cloudflare'?'IP kết nối do Cloudflare ghi nhận':'IPv4 trình duyệt báo (chưa xác minh)'}</div>
 ${r.ip_type==='IPv6 /64'?'<div class="risk-related-v4"><strong>IPv4 liên quan:</strong> '+((r.related_ipv4||[]).length
  ?r.related_ipv4.map(x=>'<div><code>'+esc(x.ip)+'</code> • '+fmt(x.account_count)+' tài khoản (trình duyệt báo, chưa xác minh)</div>').join('')
  :'Chưa có báo cáo IPv4 từ nhóm này. Sẽ bổ sung khi thành viên truy cập lại và mạng hỗ trợ IPv4.')+'</div>':''}</td>
 <td><strong>${fmt(r.account_count)} tài khoản</strong><div class="small muted">${fmt(r.device_count)} mã trình duyệt khác nhau</div></td>
 <td>${chip(r.severity)}<div class="small muted">${r.severity==='serious'?'Ưu tiên đối chiếu bằng chứng':'Chưa đủ bằng chứng để kết luận'}</div></td></tr>`))}</div></section>
 <section class="card section"><h3>IPv4 công khai do trình duyệt báo trong 7 ngày</h3>
 <p class="note">Các địa chỉ này là phản hồi dịch vụ kiểm tra trên mạng của khách. IP kết nối do Cloudflare ghi nhận được hiển thị bên cạnh để đối chiếu.</p>
 ${table(['Thời gian / Thành viên','IPv4 trình duyệt báo','IP Cloudflare ghi nhận'],(d.ipv4_observations||[]).map(r=>`<tr><td>${dt(r.created_at)}<div class="small">${esc(r.name||r.email||'—')}</div></td><td><code>${esc(r.observed_ipv4)}</code></td><td>${adminIP(r.cloudflare_ip)}</td></tr>`))}</section>
 <section class="card section"><h3>⚠ Cảnh báo link rút gọn hôm nay</h3>
 <p><strong>${fmt(d.link_alert_count||0)}</strong> lượt bị chặn · <strong>${fmt(d.link_alert_accounts||0)}</strong> tài khoản · Đặt lại 00:00 giờ Việt Nam</p>
 <p class="note">Phát hiện tài khoản khác dùng chung IP hoặc mã trình duyệt. Đây là cảnh báo để Admin kiểm tra, chưa phải kết luận gian lận.</p>
 ${table(['Thời gian / Nhiệm vụ','Tài khoản bị chặn','Nguyên nhân / Tài khoản giữ lượt','IP / Mã'],(d.link_alerts||[]).map(r=>`<tr><td>${dt(r.created_at)}<div>${esc(r.task_title||(r.detail?.endsWith(':list')?'Xem danh sách nhiệm vụ':'—'))}</div></td><td>${esc(r.name||'—')}<div>${esc(r.email||r.user_id||'—')}</div></td><td>${esc(r.detail?.startsWith('link_owner:')?'Trùng IP với tài khoản khác':r.detail?.startsWith('link_browser_owner:')?'Trùng mã trình duyệt với tài khoản khác':'Đã đủ lượt nhiệm vụ')}<div>${esc(r.owner_email||'—')}</div></td><td>${adminIP(r.ip)}<div class="small">${esc(r.device_code)}</div></td></tr>`))}</section>
 <section class="grid two section"><article class="card"><h3>IP dùng bởi nhiều tài khoản trong 30 ngày</h3>
 ${table(['IP','Tài khoản'],d.repeated_ips.map(r=>`<tr><td>${adminIP(r.ip)}</td><td>${r.n}</td></tr>`))}</article>
 <article class="card"><h3>Mã trình duyệt dùng bởi nhiều tài khoản (30 ngày)</h3>
  ${table(['Mã nhận diện','Tài khoản'],(d.repeated_devices||[]).map(r=>`<tr><td><code>${esc(r.device_code)}</code></td><td>${r.n}</td></tr>`))}
  <p class="note">Mã nhận diện có thể bị thay đổi; chỉ dùng để đánh giá rủi ro, không tự khóa tài khoản.</p></article>
  <article class="card"><h3>Nhật ký sự kiện gần đây</h3>${table(['Thời gian','Sự kiện','IP / Mã'],d.events.map(r=>`<tr><td>${dt(r.created_at)}</td><td>${esc(r.event_type)}<div>${esc(r.email||r.user_id||'—')}</div><div class="small muted">${esc(r.detail)}</div></td><td>${adminIP(r.ip)}<div class="small muted">${esc(r.device_code)}</div></td></tr>`))}</article></section>`;
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
 <h3>🛡️ Quota chống lạm dụng</h3>
 <p class="note">Chặn lượt gửi nhiệm vụ khi vượt giới hạn theo ngày Việt Nam; đặt lại lúc 00:00. Tính cả nhiệm vụ đang chờ và đã duyệt. Nhập 0 để tắt từng giới hạn.</p>
 <div class="form-row">${field('quota_user_tasks_daily','Lượt nhiệm vụ/tài khoản/ngày',s.quota_user_tasks_daily,'type="number" min="0" max="100" required')}
 ${field('quota_device_accounts_daily','Tài khoản/mã trình duyệt/ngày',s.quota_device_accounts_daily,'type="number" min="0" max="100" required')}</div>
 <div class="form-row">${field('quota_ip_accounts_daily','Tài khoản/IP/ngày',s.quota_ip_accounts_daily,'type="number" min="0" max="100" required')}</div>
 <h3>🔗 Bảo vệ link rút gọn theo ngày</h3>
 <p class="note">IP được dành cho tài khoản gửi nhiệm vụ đầu tiên trong ngày. Tài khoản khác cùng IP bị chặn toàn bộ link rút gọn. Nhiệm vụ chờ duyệt cũng giữ chỗ; bị từ chối sẽ không giữ chỗ. Lượt mới được mở lúc 00:00 ngày mai (giờ Việt Nam).</p>
 ${select('quota_link_ip_exclusive','Chặn tài khoản khác trên cùng IP',[['1','Bật'],['0','Tắt']],s.quota_link_ip_exclusive)}
 ${select('quota_link_device_exclusive','Chặn đổi tài khoản trên cùng mã trình duyệt',[['1','Bật'],['0','Tắt']],s.quota_link_device_exclusive)}
 <p class="note">Đã bỏ giới hạn tổng 2 lượt. Tài khoản giữ IP được làm các link khác theo số lượt riêng tại Quản lý nhiệm vụ. Các giới hạn chung phía trên áp dụng cho App, Video và Khác.</p>
 <p class="note">Mã trình duyệt không phải IMEI, có thể bị thay đổi. Dùng chung IP là dấu hiệu cần xem xét, không tự khóa tài khoản hoặc xóa Lúa. Xem cảnh báo tại Chống gian lận.</p>
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
 const remain=a.category==='video'?Math.max(0,Math.ceil((a.available_at-Date.now())/1000)):0;
 const root=document.getElementById('modal-root');
 root.innerHTML=`<div class="modal-cover"><section class="modal"><button class="close" type="button" data-action="close-modal" aria-label="Đóng">×</button>
 <span class="eyebrow">KIỂM TRA THỰC HIỆN</span><h3>Hoàn thành nhiệm vụ</h3>
 ${a.task_url?`<p><a class="btn alt" href="${safeUrl(a.task_url)}" target="_blank" rel="noopener noreferrer">Mở liên kết nhiệm vụ ↗</a></p>`:''}
 <p class="note">Hãy thực hiện đúng yêu cầu trước khi xác nhận. Hệ thống kiểm tra ${a.category==='video'?'thời gian và ':''}CAPTCHA; ${a.review_mode==='manual'?'Admin sẽ duyệt bằng chứng bạn gửi.':'với chế độ tự động, hệ thống không thể xác minh hoạt động bên ngoài trang web.'}</p>
 ${a.category==='app'?'<div class="callout">📱 Hãy cài app, đăng ký tài khoản mới, nhập mã giới thiệu được hiển thị ở danh sách nhiệm vụ và chụp màn hình xác nhận thành công.</div>':''}
 <form data-form="task-claim"><div class="captcha">${a.a} + ${a.b} = ?</div>
 ${field('answer','Kết quả phép cộng','', 'required type="number" min="0" max="30" inputmode="numeric"')}
 ${a.category==='app'?`<div class="field"><label for="photo">Ảnh chụp màn hình bằng chứng (bắt buộc)</label><input id="photo" name="photo" type="file" accept="image/*" required><p class="note">Ảnh sẽ được tự nén trước khi gửi. Hãy che mật khẩu, OTP, số điện thoại và thông tin nhạy cảm.</p></div><div class="field"><label for="evidence">Ghi chú cho Admin (không bắt buộc)</label><textarea id="evidence" name="evidence" maxlength="200" placeholder="Ví dụ: Đã đăng ký và nhập mã thành công"></textarea></div>`:a.review_mode==='manual'?`<div class="field"><label for="evidence">Bằng chứng / URL xác nhận / mô tả (≥12 ký tự)</label><textarea id="evidence" name="evidence" minlength="12" required placeholder="Dán URL bằng chứng hoặc trình bày chi tiết kết quả..."></textarea></div>`:''}
 <button class="btn" type="submit">${remain>0?'Gửi khi đủ thời gian':'Xác nhận hoàn thành'} →</button>
 ${a.category==='video'?`<p class="note" id="wait-hint">${remain>0?`Bạn còn cần chờ ít nhất ${remain} giây để xác nhận.`:'Đã đủ thời gian tối thiểu.'}</p>`:''}</form></section></div>`;
}

async function shrinkAppProof(file) {
 if (!file || !file.size) throw new Error('Bạn cần chọn ảnh chụp màn hình trước khi gửi.');
 if (file.size > 20*1024*1024) throw new Error('Ảnh gốc vượt 20 MB. Hãy chọn ảnh chụp màn hình nhỏ hơn.');
 // Read the selected file as data: because the site's CSP permits data: images,
 // but intentionally does not permit blob: image sources.
 const imageData=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>resolve(String(reader.result));
   reader.onerror=()=>reject(new Error('Không đọc được tệp ảnh. Hãy chọn lại ảnh rồi thử gửi.'));
   reader.onabort=()=>reject(new Error('Đọc ảnh đã bị hủy. Hãy chọn lại ảnh.'));
   reader.readAsDataURL(file);
 });
 const img=await new Promise((resolve,reject)=>{
   const element=new Image();
   element.onload=()=>resolve(element);
   element.onerror=()=>reject(new Error('Không thể mở ảnh này. Hãy thử chụp màn hình mới hoặc chọn ảnh JPG/PNG khác.'));
   element.src=imageData;
 });
 if (!img.naturalWidth || !img.naturalHeight) throw new Error('Ảnh không hợp lệ.');
 const dimensions=[1400,1100,900,720,600];
 for (const maxSide of dimensions) {
   const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const context=canvas.getContext('2d');
   if(!context)throw new Error('Không thể xử lý ảnh trên trình duyệt này.');
   context.fillStyle='#fff';
   context.fillRect(0,0,canvas.width,canvas.height);
   context.drawImage(img,0,0,canvas.width,canvas.height);
   for (const quality of [0.79,0.65,0.5]) {
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
     if (blob && blob.size>=1000 && blob.size<=175000) {
       return await new Promise((resolve,reject)=>{
         const reader=new FileReader();
         reader.onload=()=>resolve(String(reader.result));
         reader.onerror=()=>reject(new Error('Không đọc được ảnh đã nén.'));
         reader.readAsDataURL(blob);
       });
     }
   }
 }
 throw new Error('Ảnh quá phức tạp để nén dưới 180 KB. Hãy cắt ảnh rồi thử lại.');
}

async function afterAction(view=state.view){await refreshMe();if(state.me)await navigate(view);}

function updateWithdrawalFields(form) {
  if(!form)return;
  const isBank=form.querySelector('[name="payment_method"]')?.value!=='zalopay';
  const isOther=isBank && form.querySelector('[name="bank_name"]')?.value==='other';
  const enabled=!form.querySelector('button[type="submit"]')?.disabled;
  const bank=document.getElementById('withdraw-bank-fields'),zalo=document.getElementById('withdraw-zalopay-fields'),other=document.getElementById('withdraw-bank-other');
  if(!bank||!zalo||!other)return;
  bank.hidden=!isBank;zalo.hidden=isBank;other.hidden=!isOther;
  for(const input of bank.querySelectorAll('input,select')){
    const active=isBank && (input.name!=='bank_other'||isOther) && enabled;
    input.disabled=!active;input.required=active;
  }
  for(const input of zalo.querySelectorAll('input,select')){input.disabled=isBank||!enabled;input.required=!isBank&&enabled;}
}
app.addEventListener('change',e=>{
 if(e.target.matches('form[data-form="withdraw"] [name="payment_method"],form[data-form="withdraw"] [name="bank_name"]')){
  updateWithdrawalFields(e.target.closest('form'));
 }
 if(e.target.matches('#task-form [name="category"]')){
  const video=e.target.value==='video', input=document.querySelector('#task-form [name="min_seconds"]');
  document.getElementById('task-time-field').hidden=!video;
  input.disabled=!video;input.required=video;
 }
});

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
  if(act==='open-auth'){
   state.authMode=el.dataset.authMode==='register'?'register':'login';
   renderAuth();window.scrollTo(0,0);return;
  }
  if(act==='toggle-password'){
   const input=el.closest('.auth-input-wrap')?.querySelector('input');
   if(input){const visible=input.type==='text';input.type=visible?'password':'text';
    el.setAttribute('aria-pressed',String(!visible));
    el.setAttribute('aria-label',visible?'Hiện mật khẩu':'Ẩn mật khẩu');}
   return;
  }
  if(act==='back-home'){
   if(state.meta.setup_required){state.authMode='setup';renderAuth();return;}
   renderHome();window.scrollTo(0,0);return;
  }
  if(act==='google-cancel'){
   await api('/api/auth/google/cancel','POST',{});
   state.googlePending=null;renderAuth();return;
 }
 if(act.startsWith('google-')){
 const intent=act.slice(7);
 if(!['login','register','link'].includes(intent))throw new Error('Thao tác Google không hợp lệ.');
 const body={intent};
 if(intent==='register'){
  const f=app.querySelector('form[data-form="register"]');
  if(!f?.querySelector('[name="accept_terms"]')?.checked)
   throw new Error('Bạn cần tích đồng ý điều khoản trước khi đăng ký Google.');
  body.accept_terms='yes';
  body.referral_code=f.querySelector('[name="referral_code"]')?.value||'';
 }
 const response=await api('/api/auth/google/start','POST',body);
 location.assign(response.url);return;
}
if(act==='toggle-menu'){setMenuOpen(!app.querySelector('.layout.menu-open'));return;}
  if(act==='close-menu'){setMenuOpen(false,true);return;}
  if(act==='logout'){setMenuOpen(false);await api('/api/auth/logout','POST',{});state.me=null;state.accountHold=null;state.authMode='login';renderHome();return;}
  if(act==='filter-tasks'){state.taskFilter=el.dataset.filter||'all';await navigate('tasks');return;}
  if(act==='start-task'){await startTask(el.dataset.id);return;}
  if(act==='view-photo'){
   const root=document.getElementById('modal-root');
   root.innerHTML=`<div class="modal-cover"><section class="modal"><button class="close" type="button" data-action="close-modal" aria-label="Đóng">×</button><h3>Ảnh bằng chứng nhiệm vụ App</h3><p class="note">Ghi chú: ${esc(el.dataset.note||'Không có')}</p><img class="app-proof-image" src="/api/admin/reviews/${encodeURIComponent(el.dataset.id)}/photo" alt="Ảnh chụp màn hình thành viên gửi" loading="lazy"><p class="note">Chỉ Admin đã đăng nhập mới xem được ảnh. Hãy đối chiếu kết quả trong hệ thống giới thiệu của ứng dụng trước khi duyệt.</p></section></div>`;
   return;
  }
  if(act==='close-modal'){state.attempt=null;document.getElementById('modal-root').innerHTML='';return;}
  if(act==='copy'){await navigator.clipboard.writeText(el.dataset.value);toast('Đã sao chép liên kết.');return;}
  if(act==='copy-ip'){await navigator.clipboard.writeText(el.dataset.value||'');toast('Đã sao chép địa chỉ IP.');return;}
  if(act==='check-ipv4'){await detectPublicIPv4(el,false);return;}
  if(act==='use-manual-ipv4'){showPastedIPv4();return;}
  if(act==='fraud-filter'){
   state.fraudFilter=['all','serious','review','low'].includes(el.dataset.level)?el.dataset.level:'all';
   await navigate('admin-security');return;
  }
  if(act==='view-fraud-account'){await showFraudAccount(el.dataset.id);return;}

  if(act==='checkin'){await api('/api/checkin','POST',{});toast('Điểm danh thành công.');await afterAction('benefits');return;}
  if(act==='edit-task'){state.taskEdit=el.dataset.id;await navigate('admin-tasks');document.querySelector('#task-form')?.scrollIntoView({behavior:'smooth'});return;}
  if(act==='reset-task'){state.taskEdit=null;await navigate('admin-tasks');return;}
  if(act==='change-user'){
   let reason='',evidence='';
   const type=el.dataset.lockType==='confirmed'?'confirmed':'review';
   if(el.dataset.status==='suspended'){
    if(type==='confirmed'){
     reason=prompt('Ghi lý do xác định vi phạm nghiêm trọng (chỉ Admin xem; tối thiểu 10 ký tự):','Vi phạm nghiêm trọng quy định chống gian lận của Trạm Có Lúa.')||'';
     if(reason.trim().length<10)return;
     evidence=prompt('Nhập bằng chứng cụ thể đã đối chiếu (bắt buộc ít nhất 20 ký tự; không chỉ dựa vào IP trùng):','')||'';
     if(evidence.trim().length<20){toast('Cần mô tả bằng chứng cụ thể trước khi khóa vĩnh viễn.',true);return;}
     if(!confirm('XÁC NHẬN KHÓA VĨNH VIỄN? Khách sẽ thấy mẫu thông báo vi phạm nghiêm trọng. Chưa tự xóa Lúa hay tự từ chối mọi giao dịch.'))return;
    }else{
     reason=prompt('Nhập lý do tạm khóa để xác minh (tối thiểu 10 ký tự):','Hoạt động tài khoản cần được xác minh thêm.')||'';
     if(reason.trim().length<10)return;
     if(!confirm('Tạm khóa để xác minh và dừng duyệt/thanh toán khoản rút chưa hoàn tất?'))return;
    }
   }else if(!confirm(type==='confirmed'?'Đây là tài khoản đã bị khóa vĩnh viễn. Bạn chắc chắn muốn khôi phục tài khoản?':'Mở lại tài khoản và tiếp tục xử lý yêu cầu rút tiền?'))return;
   await api('/api/admin/users/'+encodeURIComponent(el.dataset.id),'PATCH',{
    status:el.dataset.status,suspension_type:type,suspension_reason:reason,suspension_evidence:evidence
   });
   toast('Đã cập nhật loại khóa tài khoản.');await navigate('admin-users');return;
  }
  if(act==='review'){
   if(!confirm(el.dataset.status==='approved'?'Duyệt và cộng Lúa cho nhiệm vụ?':'Từ chối bằng chứng này?'))return;
   await api('/api/admin/reviews/'+encodeURIComponent(el.dataset.id),'POST',{status:el.dataset.status});toast('Đã xử lý bằng chứng.');await afterAction('admin-reviews');return;
  }
  if(act==='withdraw-admin'){
   let note='',riskOverride='';
   if(['approved','paid'].includes(el.dataset.status)&&el.dataset.riskLevel==='serious'){
    riskOverride=prompt('⚠️ Tài khoản có nhiều tín hiệu rủi ro. Sau khi đối chiếu bằng chứng, nhập lý do cho phép duyệt/chi trả (ít nhất 20 ký tự):','')||'';
    if(riskOverride.trim().length<20)return;
   }
   if(el.dataset.status==='approved'){
     if(!confirm('Duyệt yêu cầu rút tiền này? Yêu cầu sẽ chuyển sang Đã duyệt, chưa phải đã thanh toán.'))return;
   }else if(el.dataset.status==='paid'){
     if(!confirm('Bạn đã CHUYỂN TIỀN THẬT qua ngân hàng hoặc ZaloPay và kiểm tra giao dịch thành công?'))return;
     note=prompt('Nhập mã giao dịch hoặc ghi chú đối chiếu thanh toán (bắt buộc):','')||'';
     if(!note.trim())return;
   }else if(el.dataset.status==='invalid_account'){
     if(!confirm('Xác nhận số tài khoản không đúng? Khách sẽ được thông báo và hoàn Lúa để gửi yêu cầu mới.'))return;
   }else{note=prompt('Nhập lý do từ chối (bắt buộc):','')||'';if(!note.trim())return;}
   await api('/api/admin/withdrawals/'+encodeURIComponent(el.dataset.id),'POST',{status:el.dataset.status,admin_note:note,risk_override_note:riskOverride});toast('Đã xử lý yêu cầu rút tiền.');await afterAction('admin-withdrawals');return;
  }
 }catch(err){toast(err.message,true);}
});
app.addEventListener('submit',async e=>{
 const form=e.target.closest('form[data-form]');if(!form)return;
 e.preventDefault();const kind=form.dataset.form;const b=formData(form),button=form.querySelector('button[type="submit"]');
 if(button)button.disabled=true;
 try{
  if(kind==='fraud-search'){
   state.fraudSearch=String(b.keyword||'').trim().slice(0,120);
   await navigate('admin-security');return;
  }
  if(kind==='google-complete'){
     await api('/api/auth/google/complete','POST',b);
     state.googlePending=null;await loadMe();renderShell();await navigate('overview');
     toast('Đăng ký Google thành công. Chào mừng thành viên mới!');
   }
   if(kind==='setup'){await api('/api/setup','POST',b);state.meta=await api('/api/meta');await loadMe();renderShell();await navigate('admin-overview');toast('Admin đã được tạo. Hãy xóa khóa thiết lập SETUP_KEY sau khi hoàn tất.');}
  if(kind==='login'||kind==='register'){
    const authResult=await api('/api/auth/'+kind,'POST',b);
    await loadMe();
    if(state.accountHold){renderLocked();return;}
    renderShell();await navigate(state.me.user.role==='admin'?'admin-overview':'overview');toast(kind==='login'?'Đăng nhập thành công.':'Đăng ký thành công.');
  }
  if(kind==='password'){const r=await api('/api/me/password','POST',b);state.me=null;renderAuth();toast(r.message);}
  if(kind==='withdraw'){
    if(b.payment_method==='bank'&&b.bank_name==='other'&&!b.bank_other?.trim())throw new Error('Nhập tên ngân hàng nhận tiền.');
    const r=await api('/api/withdrawals','POST',{...b,amount:Number(b.amount)});
    toast(r.message);await afterAction('withdrawals');
  }
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
    const photo=a.category==='app'?await shrinkAppProof(b.photo):'';
    const r=await api('/api/tasks/'+encodeURIComponent(a.taskId)+'/submit','POST',{
      attempt_id:a.attempt_id,answer:b.answer,evidence:b.evidence||'',...(a.category==='app'?{photo}:{}) });
    state.attempt=null;document.getElementById('modal-root').innerHTML='';toast(r.message);await afterAction('tasks');
  }
 }catch(err){
   if(err.account_status==='suspended'){
     state.accountHold=err;state.me=null;renderLocked();return;
   }
   if(kind==='task-claim'&&err.status===422&&state.attempt){
     state.attempt.a=err.a;state.attempt.b=err.b;
     if(state.attempt.category==='app'){
       const quiz=document.querySelector('#modal-root .captcha');if(quiz)quiz.textContent=err.a+' + '+err.b+' = ?';
       const ans=document.querySelector('#modal-root #answer');if(ans)ans.value='';
     }else{
       const evidence=b.evidence;renderAttemptModal();
       if(evidence){const area=document.querySelector('#evidence');if(area)area.value=evidence;}
     }
   }
   toast(err.message,true);
 }finally{if(button&&button.isConnected)button.disabled=false;}
});
boot();
