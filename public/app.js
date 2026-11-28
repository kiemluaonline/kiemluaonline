import { shopPage, adminShopPage, handleShopAction, handleShopSubmit, previewShopPhoto } from './shop-ui.js?v=20261115-three-visual-guide-uploads-v1';
import { shopOrdersPage, adminShopOrdersPage, handleShopOrderAction, handleShopOrderSubmit } from './shop-orders-ui.js?v=20261128-admin-status-v2';
import { cardRedemptionsPage, adminCardRedemptionsPage, handleCardAction, handleCardSubmit } from './card-redemptions-ui.js?v=20261128-admin-status-v7';
import { payoutAccountsPage, handlePayoutAccountAction, handlePayoutAccountSubmit } from './payout-accounts-ui.js?v=20261114-withdraw-max-v1';
// Dịch thông báo trình duyệt mà không thay đổi dữ liệu Admin nhập.
const localizedConfirm=message=>window.confirm((typeof window.TramI18n?.translateLabel==='function'?window.TramI18n.translateLabel(message):message));
const localizedPrompt=(message,defaultValue='')=>window.prompt((typeof window.TramI18n?.translateLabel==='function'?window.TramI18n.translateLabel(message):message),defaultValue);
// Giao diện dùng dữ liệu thật từ /api. Không gán Lúa ở phía trình duyệt.
const app = document.getElementById('app');
// Trang chủ được viết sẵn trong HTML để cả khách và công cụ tìm kiếm đọc được.
const publicHomeHTML = app.innerHTML;
const state = { meta: {}, me: null, googlePending: null, accountHold: null, view: 'overview', authMode: 'login', adminTasks: [], taskEdit: null, attempt: null, returnChallenge: null, pendingTaskRules: null, memberTasks: [], taskFilter:'link',adminTaskFilter:'link',adminReviewFilter:'link',adminReviewStatus:'pending',adminReviewPage:1,adminReviewRetryOnly:false,fraudFilter:'all',fraudSearch:'',shopCategory:'all',shopEdit:null,savedPayoutAccounts:[],savedManagerOpen:false,payoutMethod:'bank' };
let paidRotationTimer=null,paidRefreshTimer=null;
function stopPaidRotation(){
 if(paidRotationTimer!==null){clearInterval(paidRotationTimer);paidRotationTimer=null;}
 if(paidRefreshTimer!==null){clearInterval(paidRefreshTimer);paidRefreshTimer=null;}
}
function paymentSlides(payments){
 return payments.map((p,i)=>`<div class="paid-slide" data-payment-index="${i}" ${i?'hidden':''}>
  <div class="paid-status-line"><span class="paid-status-dot" aria-hidden="true"></span><strong>ADMIN XÁC NHẬN ĐÃ CHUYỂN</strong></div>
  <p class="paid-highlight">${fmt(p.vnd_amount)} <span>₫</span></p>
  <div class="paid-bank-line">Đã chuyển đến TK <b>${esc(p.masked_account)}</b></div>
  <small class="paid-disclaimer">Ghi nhận ${dt(p.at)}. Thông tin do Admin xác nhận, không phải thông báo từ ngân hàng.</small>
  <span class="paid-slide-progress" aria-hidden="true"></span>
 </div>`).join('');
}
function displayPaidRotation(index){
 const box=document.getElementById('paid-rotation');if(!box)return;
 const slides=[...box.querySelectorAll('.paid-slide')];
 if(!slides.length)return;
 const next=((index%slides.length)+slides.length)%slides.length;
 slides.forEach((slide,i)=>{slide.hidden=i!==next;});
 box.dataset.active=String(next);
}
function paidAnnouncementSignature(records){
 return records.map(p=>[p.id||'',p.vnd_amount||'',p.at||''].join(':')).join('|');
}
let paidRefreshInFlight=false;
async function refreshPaidRotation(){
 const box=document.getElementById('paid-rotation');
 if(!box||!box.isConnected||state.me?.user?.role!=='member'||document.hidden||paidRefreshInFlight)return;
 paidRefreshInFlight=true;
 try{
  // Endpoint nhỏ chỉ đọc giao dịch thật đã được Admin chuyển khoản, không tải lại
  // toàn bộ thống kê nhiệm vụ sau mỗi lần kiểm tra.
  const r=await api('/api/public-paid-announcements');
  if(!box.isConnected||document.getElementById('paid-rotation')!==box||
     state.me?.user?.role!=='member')return;
  const records=r.recent_payments||[];
  const signature=paidAnnouncementSignature(records);
  if(signature===box.dataset.signature)return;
  const slidesHost=box.querySelector('.paid-rotation-slides');
  if(!slidesHost)return;
  slidesHost.innerHTML=records.length?paymentSlides(records):
   '<strong>↗ THÔNG BÁO THANH TOÁN</strong><p>Chưa có khoản rút từ 5.000đ nào được Admin xác nhận đã chuyển.</p>';
  box.dataset.signature=signature;
  box.classList.toggle('has-paid-rotation',records.length>1);
  // Giao dịch mới của Admin xuất hiện tự động: chạy lại theo thứ tự cũ -> mới.
  displayPaidRotation(0);
  startPaidRotation();
 }catch{
  // Lỗi mạng không được tạo giao dịch giả hoặc xóa dữ liệu đang hiển thị.
 }finally{paidRefreshInFlight=false;}
}
function startPaidRotation(){
 stopPaidRotation();
 const box=document.getElementById('paid-rotation');if(!box)return;
 const slides=box.querySelectorAll('.paid-slide');
 // Tự chuyển giữa các giao dịch cũ -> mới, kể cả khi bật Giảm chuyển động trên iPhone.
 // Nếu chọn Giảm chuyển động, CSS sẽ tắt hiệu ứng nhưng vẫn cập nhật nội dung.
 // Nếu chỉ có 1 giao dịch thật từ 5.000đ, giữ nguyên; không nhân bản giao dịch.
 if(slides.length>1){
  paidRotationTimer=setInterval(()=>{
   if(!box.isConnected||state.me?.user?.role!=='member'){stopPaidRotation();return;}
   if(!document.hidden)displayPaidRotation(Number(box.dataset.active||0)+1);
  },6000);
 }
 // Luôn theo dõi giao dịch mới kể cả lúc chỉ có 0/1 khoản thanh toán.
 // Khi Admin xác nhận Đã thanh toán, mọi thẻ đang mở sẽ cập nhật trong ~15 giây.
 paidRefreshTimer=setInterval(refreshPaidRotation,15000);
}
// iPhone tạm dừng timer khi chuyển tab: tự kiểm tra ngay lúc mở website trở lại.
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)refreshPaidRotation();
});
const BANK_LIST = [
  ['','-- Chọn ngân hàng nhận tiền --'],
  ['BVBank','BVBank (hỗ trợ số tài khoản liên kết ZaloPay 99ZP)'],['Vietcombank','Vietcombank'],['BIDV','BIDV'],['VietinBank','VietinBank'],
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
  ['overview','◈','Tổng quan'],['tasks','▤','Nhiệm vụ'],['shop','🛍️','Mua sắm nhận Lúa'],['shop-orders','📦','Đơn hàng & Lúa'],['referrals','♧','Tuyển Ref'],
  ['benefits','✦','Phúc lợi'],['withdrawals','⇢','Rút tiền'],['history','◷','Lịch sử'],['profile','☻','Hồ sơ']
];
const ADMIN_NAV = [
  ['admin-overview','◈','Tổng quan Admin'],['admin-tasks','▤','Quản lý nhiệm vụ'],['admin-shop','🛍️','Quản lý mua sắm'],['admin-shop-orders','📦','Duyệt đơn TikTok'],
  ['admin-users','☻','Thành viên'],['admin-reviews','✓','Duyệt bằng chứng'],
  ['admin-withdrawals','⇢','Yêu cầu rút tiền'],['admin-cards','🎁','Quản lý thẻ cào'],['admin-security','♙','Chống gian lận'],
  ['admin-settings','⚙','Cài đặt'],['profile','☻','Hồ sơ của tôi']
];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = v => Number(v || 0).toLocaleString('vi-VN');
// Mã tham chiếu ổn định dựa trên UUID hiện có; không phải thêm cột hay đánh lại lịch sử D1.
const withdrawalCode = id => '#'+String(id||'').replace(/-/g,'').slice(0,12).toUpperCase();
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
const languageSwitcher = () => '<div class="language-toggle" role="group" aria-label="Chọn ngôn ngữ">'+
 '<button type="button" data-language="vi" aria-pressed="true">Tiếng Việt</button>'+
 '<button type="button" data-language="hmn" aria-pressed="false">Hmoob</button></div>';
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
  // A generated ID is not considered persistent until storage really returns it.
  return localStorage.getItem(DEVICE_STORAGE_KEY)===value?value:'';
 }catch{return '';}
}
function toast(msg,bad=false){ const t=document.getElementById('toast');t.textContent=msg;t.className='visible'+(bad?' bad':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.className='',4500); }

// Popup kết quả nhiệm vụ: chỉ tin trạng thái server, tuyệt đối không tự cộng Lúa ở giao diện.
function closeTaskResultModal(){
 const root=document.getElementById('modal-root');
 if(root?.querySelector('.task-result-cover'))root.innerHTML='';
 document.body.classList.remove('task-result-open');
 showOverviewNotice();
}
function renderTaskResultModal(result,{linkReturn=false}={}){
 const root=document.getElementById('modal-root');
 if(!root)return;
 const approved=result?.status==='approved';
 const reward=Number(result?.reward);
 const hasReward=Number.isSafeInteger(reward)&&reward>0;
 const icon=approved?
  '<svg viewBox="0 0 96 96" fill="none" aria-hidden="true"><circle cx="48" cy="48" r="40" stroke="currentColor" stroke-width="4"/><path d="M26 49 41 64 71 33" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>':
  '<svg viewBox="0 0 96 96" fill="none" aria-hidden="true"><circle cx="48" cy="48" r="40" stroke="currentColor" stroke-width="4"/><path d="M48 25v25l16 11" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="48" r="3" fill="currentColor"/></svg>';
 const heading=approved?'Hoàn thành nhiệm vụ!':'Đã gửi nhiệm vụ thành công!';
 const description=approved?'Lúa đã được cộng vào ví của bạn.':
  linkReturn?'Đã nhận yêu cầu xác minh. Nhiệm vụ đang chờ Admin đối soát.':
  'Nhiệm vụ của bạn đang chờ Admin duyệt.';
 const statusLabel=approved?'Đã cộng Lúa':'Chờ Admin duyệt';
 const rewardLabel=approved?'Bạn vừa nhận được':'Phần thưởng dự kiến';
 root.innerHTML=`<div class="modal-cover task-result-cover ${approved?'task-result-success':'task-result-pending'}">
  <section class="modal task-result-modal" role="dialog" aria-modal="true" aria-labelledby="task-result-title" aria-describedby="task-result-description">
   <button type="button" class="task-result-close" data-action="close-task-result" aria-label="Đóng thông báo">×</button>
   <div class="task-result-icon-wrap"><div class="task-result-glow"></div><div class="task-result-icon">${icon}</div></div>
   <div class="task-result-eyebrow">🌾 TRẠM CÓ LÚA</div>
   <h3 id="task-result-title">${heading}</h3>
   <p class="task-result-description" id="task-result-description">${description}</p>
   <div class="task-result-reward-block">
    <span class="task-result-reward-label">${rewardLabel}</span>
    ${hasReward?`<strong class="task-result-reward-amount">+${fmt(reward)} Lúa</strong>`:'<strong class="task-result-reward-amount">🌾 Trạm Có Lúa</strong>'}
    <span class="task-result-status"><span class="task-result-status-dot"></span>${statusLabel}</span>
   </div>
   ${approved?'<p class="task-result-note">Bạn có thể kiểm tra số Lúa trong ví hoặc lịch sử nhận thưởng.</p>':
    '<p class="task-result-note">Lúa chỉ được cộng sau khi Admin xác nhận nhiệm vụ hợp lệ.</p>'}
   <button type="button" class="btn task-result-primary" data-action="close-task-result">${approved?'Tuyệt vời!':'Đã hiểu'}</button>
   <div class="task-result-accent" aria-hidden="true"></div>
  </section>
 </div>`;
 document.body.classList.add('task-result-open');
 root.querySelector('.task-result-primary')?.focus({preventScroll:true});
}
async function api(path, method='GET', body=null, linkSignals=''){
  const device=browserDeviceId();
  // All state-changing requests require same-origin JSON, including bodyless DELETE.
  if(body===null&&['POST','PUT','PATCH','DELETE'].includes(method.toUpperCase()))body={};
  const headers={...(body===null?{}:{'Content-Type':'application/json','X-Tram-Lua':'1'}),...(device?{'X-TL-Device':device}:{})};
  if(method==='POST'&&/^\/api\/tasks\/[^/]+\/start$/.test(path)&&/^[01?]{3}$/.test(linkSignals))headers['X-TL-Link-Signals']=linkSignals;
  const r=await fetch(path,{method,headers,body:body===null?undefined:JSON.stringify(body),credentials:'same-origin',...(method.toUpperCase()==='GET'?{cache:'no-store'}:{})});
  const data=await r.json().catch(()=>({error:'Không nhận được phản hồi máy chủ.'}));
  if(!r.ok){ const error=new Error(data.error||'Thao tác thất bại.');Object.assign(error,data);error.status=r.status;
    // Member-facing task errors keep recovery information but avoid exposing quota diagnostics.
    if(r.status===429&&/^\/api\/tasks\/[^/]+\/(?:start|return|submit)$/.test(path)&&data.quota_scope){
      error.message=String(data.quota_scope).startsWith('source_')?'Nguồn nhiệm vụ đã hết hạn mức hôm nay. Lượt mới mở lúc 00:00 (giờ Việt Nam).':data.quota_scope==='link_task_limit'?'Đã hết lượt hôm nay. Lượt mới mở lúc 00:00 (giờ Việt Nam).':'Nhiệm vụ hiện không khả dụng. Nếu cần hỗ trợ, hãy liên hệ Admin.';
    }
    throw error; }
  return data;
}
const PUBLIC_TITLE = 'Trạm Có Lúa – Làm nhiệm vụ, tích Lúa mỗi ngày';
function renderHome(){
 app.className='';
 app.innerHTML=publicHomeHTML;
 document.title=PUBLIC_TITLE;
}
// Link4M quay về thì mở CAPTCHA, chưa ghi nhiệm vụ hay cộng Lúa.
function clearLinkReturnQuery(){
 const params=new URLSearchParams(location.search);
 if(!params.has('link_return'))return;
 document.documentElement.classList.remove('link-return-entry');
 params.delete('link_return');
 params.delete('link_session');
 params.delete('return_attempt');
 const remain=params.toString();
 const destination=location.pathname==='/verify-link'?'/':location.pathname;
 window.history.replaceState(null,'',destination+(remain?'?'+remain:'')+location.hash);
}
function returnStorageKey(){
 return state.me?.user?.id?'tram-lua.return.'+state.me.user.id:'';
}
function rememberReturn(expiresAt){
 try{const key=returnStorageKey();if(key)localStorage.setItem(key,JSON.stringify({url:location.pathname+location.search,expiresAt:Number(expiresAt)}));}catch{}
}
function resumeStoredReturn(){
 try{
  const key=returnStorageKey(),value=key&&localStorage.getItem(key);
  if(!value)return false;
  const saved=JSON.parse(value);
  // Do not discard a saved confirmation merely because an old client-side deadline elapsed.
  const target=new URL(saved.url,location.origin);
  if(target.origin!==location.origin||!['/','/verify-link'].includes(target.pathname)||!target.searchParams.has('link_return'))return false;
  location.replace(target.pathname+target.search);return true;
 }catch{return false;}
}
async function finishLinkReturn(result){
 // Keep the recovery URL until the member page and real server receipt are displayed.
 const key=returnStorageKey();
 try{
  renderShell();
  await afterAction('history');
  if(!state.me)throw new Error('Không tải được tài khoản. Hãy thử lại để xem kết quả đã lưu.');
  if(result.status==='rejected')toast('Nhiệm vụ đã được xử lý: Từ chối.',true);
  else renderTaskResultModal(result,{linkReturn:true});
  state.returnChallenge=null;
  try{if(key)localStorage.removeItem(key);}catch{}
  clearLinkReturnQuery();
 }catch(error){
  showReturnGate(`<p role="alert">${esc(error.message)}</p><button type="button" class="btn" data-action="retry-link-return">Thử lại</button>`);
 }
}
function showReturnGate(content){
 app.className='';
 app.innerHTML=`<main class="return-gate"><section class="return-gate-card" aria-labelledby="linkReturnTitle">
 <header class="return-gate-head"><span class="return-gate-icon" aria-hidden="true"><svg viewBox="0 0 48 48" width="48" height="48" fill="none"><path d="M24 5 40 11v12c0 10-6 16-16 21C14 39 8 33 8 23V11L24 5Z" fill="#176c50" stroke="#0e513c" stroke-width="1.6"/><path d="m16 24 6 6 11-13" stroke="#f6d56a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 3v8M36 7h8" stroke="#d4a12d" stroke-width="2.5" stroke-linecap="round"/></svg></span>
 <div><h1 id="linkReturnTitle">Xác minh nhiệm vụ</h1><p class="return-gate-brand">Trạm Có Lúa</p></div></header>${content}</section></main>`;
}
function renderLinkReturnModal(){
 const c=state.returnChallenge;
 if(!c)return;
 showReturnGate(`<p class="return-gate-intro">Hoàn thành phép tính để xác minh lượt thực hiện nhiệm vụ.</p>
 <form data-form="link-return-captcha">
 <label for="return-answer"><span>Phép tính</span><strong>${Number(c.a)} + ${Number(c.b)} = ?</strong></label>
 <input id="return-answer" name="answer" aria-label="Kết quả phép tính" type="number"
 inputmode="numeric" min="0" max="30" required autocomplete="off" placeholder="Nhập kết quả">
 <button class="btn" type="submit">Xác minh</button></form>
 <button type="button" class="btn alt return-gate-back" data-action="leave-link-return">Quay lại nhiệm vụ</button>
 <p class="return-gate-foot">⚠️ Vui lòng hoàn thành phép tính trước khi rời trang. Nếu tự ý thoát khi chưa xác minh, lượt nhiệm vụ vẫn được ghi nhận nhưng bạn sẽ không nhận được Lúa.</p>`);
}
async function leaveLinkReturn(){
 const c=state.returnChallenge;
 if(!c||state.me?.user?.role!=='member')return;
 // Do not navigate away while a reward receipt may be arriving.
 if(app.querySelector('form[data-form="link-return-captcha"] button[type="submit"]')?.disabled)return;
 if(!localizedConfirm('Nếu thoát bây giờ, bạn sẽ không nhận được Lúa và lượt nhiệm vụ đã sử dụng không được hoàn lại. Bạn có chắc muốn thoát?'))return;
 const button=app.querySelector('[data-action="leave-link-return"]');
 const submit=app.querySelector('form[data-form="link-return-captcha"] button[type="submit"]');
 if(button?.disabled)return;
 if(button)button.disabled=true;if(submit)submit.disabled=true;
 try{
  const result=await api('/api/tasks/'+encodeURIComponent(c.taskId)+'/return','POST',{attempt_id:c.attemptId,...(c.linkSession?{link_session:c.linkSession}:{}),abandon:true});
  if(result.ok&&['approved','pending','rejected'].includes(result.status)){await finishLinkReturn(result);return;}
  if(!result.ok||result.status!=='abandoned')throw new Error('Chưa xác nhận bỏ lượt. Vui lòng thử lại.');
  try{const key=returnStorageKey();if(key)localStorage.removeItem(key);}catch{}
  state.returnChallenge=null;
  clearLinkReturnQuery();
  renderShell();
  await navigate('tasks');
  toast('Đã bỏ xác minh. Lượt nhiệm vụ không được hoàn lại.');
 }finally{if(button)button.disabled=false;if(submit)submit.disabled=false;}
}
async function processLinkReturn(){
 const params=new URLSearchParams(location.search);
 if(!params.has('link_return'))return false;
 const taskId=params.get('link_return'),linkSession=params.get('link_session')||'',attemptId=params.get('return_attempt')||'';
 showReturnGate('<p role="status">Đang kiểm tra phiên…</p>');
 try{
  if(!/^[0-9a-f-]{36}$/i.test(taskId))throw new Error('Đường dẫn quay về không hợp lệ.');
  if(state.me?.user?.role!=='member')throw new Error('Hãy đăng nhập đúng tài khoản thành viên đã mở nhiệm vụ.');
  const result=await api('/api/tasks/'+encodeURIComponent(taskId)+'/return','POST',{...(linkSession?{link_session:linkSession}:{}),...(attemptId?{attempt_id:attemptId}:{})});
  if(result.ok&&['approved','pending','rejected'].includes(result.status)){await finishLinkReturn(result);return true;}
  if(!result.challenge||!result.attempt_id)throw new Error('Máy chủ chưa trả về phép tính xác minh.');
  params.set('return_attempt',result.attempt_id);
  window.history.replaceState(null,'',location.pathname+'?'+params.toString());
  rememberReturn(result.expires_at);
  state.returnChallenge={taskId,linkSession,attemptId:result.attempt_id,a:result.a,b:result.b,expiresAt:result.expires_at};
  renderLinkReturnModal();
 }catch(error){
  if(error.confirmation_abandoned){
   try{const key=returnStorageKey();if(key)localStorage.removeItem(key);}catch{}
   state.returnChallenge=null;
   showReturnGate(`<p role="alert">${esc(error.message)}</p><a class="btn" href="/">Về trang chủ</a>`);
  }else if(error.confirmation_expired){
   showReturnGate(`<p role="alert">${esc(error.message)}</p><p class="note">Giữ đường dẫn xác minh để Admin đối soát nếu cần.</p><button type="button" class="btn" data-action="retry-link-return">Thử lại</button>`);
  }else showReturnGate(`<p role="alert">${esc(error.message)}</p><button type="button" class="btn" data-action="retry-link-return">Thử lại</button>`);
 }
 return true;
}
// This hint only controls the startup illustration; it never grants authentication.
const STARTUP_ROLE_HINT='tram-lua.startup-role.v1';
function rememberStartupRole(role){
 try{if(role==='member'||role==='admin')localStorage.setItem(STARTUP_ROLE_HINT,role);else localStorage.removeItem(STARTUP_ROLE_HINT);}catch{}
}
function memberStartupHint(){
 try{
  const hint=localStorage.getItem(STARTUP_ROLE_HINT);
  if(hint)return hint==='member';
  // Upgrade path for a previously opened member tab.
  return Array.from({length:sessionStorage.length},(_,i)=>sessionStorage.key(i)).some(k=>k?.startsWith('tram-lua.menu.v1.member.'));
 }catch{return false;}
}
function showStartupCheck(failed=false,member=true){
 app.className='';
 app.innerHTML=`<main class="startup-check-page"><section class="startup-check-card" role="${failed?'alert':'status'}" aria-live="polite" aria-busy="${!failed}">
  <div class="startup-check-symbol"><svg viewBox="0 0 48 48" width="46" height="46" fill="none" aria-hidden="true"><path d="M24 5 40 11v12c0 10-6 16-16 21C14 39 8 33 8 23V11L24 5Z" fill="#176c50" stroke="#176c50" stroke-width="2"/><path d="M16 24l6 6 11-13" stroke="#ffe29a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <p class="startup-check-brand">TRẠM CÓ LÚA</p>
  <h2>${failed?'Chưa thể kết nối hệ thống':member?'Đang kiểm tra thiết bị…':'Đang kết nối hệ thống…'}</h2>
  <p>${failed?'Vui lòng kiểm tra kết nối mạng và thử lại.':'Vui lòng chờ trong giây lát.'}</p>
  ${failed?'<button type="button" class="btn" data-action="retry-startup">Thử lại</button>':'<div class="startup-check-track" aria-hidden="true"><span></span></div>'}
 </section></main>`;
}
async function boot(){
  const returning=new URLSearchParams(location.search).has('link_return');
  const member=memberStartupHint();
  if(member&&!returning)showStartupCheck();
  try{
   state.meta=await api('/api/meta');document.title=state.meta.site_name+' · Nhiệm vụ';
   // Wait for real server session, network and browser audit. No artificial delay.
   await loadMe({strict:true});
  }catch(e){showStartupCheck(true,member);return;}
  if(new URLSearchParams(location.search).has('link_return')){
   if(state.accountHold)renderLocked();
   else if(!state.me){state.authMode='login';renderAuth();toast('Đăng nhập đúng tài khoản đã mở nhiệm vụ.');}
   else await processLinkReturn();
   return;
  }
  if(state.me?.user?.role==='member'&&resumeStoredReturn())return;
  if(state.me){state.view=restoreMenu();renderShell();await navigate(state.view,{checkedMe:true});
   if(state.me?.user?.role==='member'&&state.me.device_registered===false)toast('Chưa thể xác minh đầy đủ thiết bị. Một số nhiệm vụ có thể không khả dụng.',true);
  }
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
 window.history.replaceState(null,'',location.pathname);
}
}
async function loadMe({strict=false}={}){
 try{state.me=await api('/api/me');state.accountHold=null;
  rememberStartupRole(state.me?.user?.role);
  if(state.me?.user?.role==='member'&&String(state.me.ip||'').includes(':'))
   setTimeout(()=>captureMemberIPv4().catch(()=>{}),0);
 }
 catch(err){
  state.me=null;state.accountHold=null;
  if(err.status===403){
   const hold=await api('/api/account-status').catch(()=>null);
   if(hold?.account_status==='suspended'){state.accountHold=hold;return;}
  }
  if(err.status===401){rememberStartupRole(null);return;}
  if(strict)throw err;
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
   <div class="auth-language-row">${languageSwitcher()}</div>
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
  '<p class="note">Đăng ký với Google không cần tích ô điều khoản. Tài khoản mới sẽ được tạo sau khi Google xác minh thành công.</p>';
 return '<div class="oauth-separator">hoặc</div>'+
  '<button class="google-auth-btn" type="button" data-action="google-login">'+
  '<span class="google-g" aria-hidden="true">G</span>'+
  'Tiếp tục với Google</button>'+
  '<p class="note">Gmail mới sẽ tự tạo tài khoản sau khi Google xác minh; Gmail đã liên kết đăng nhập ngay. Không cần tích điều khoản.</p>';
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
    <div class="auth-language-row">${languageSwitcher()}</div>
    <div class="auth-logo-line"><img src="/logo.svg" alt="" width="56" height="56"><div><strong>TRẠM CÓ LÚA</strong><span>ĐĂNG KÝ BẰNG GOOGLE</span></div></div>
    <span class="auth-form-kicker"><i></i> THÀNH VIÊN MỚI</span>
    <h2>Hoàn tất đăng ký Google</h2>
    <p class="auth-intro">Email <strong>${esc(state.googlePending.email)}</strong> đã được Google xác minh. Đây là phiên đăng nhập Google cũ, bạn chỉ cần tiếp tục để hoàn tất tạo tài khoản, không cần mật khẩu hoặc tích ô điều khoản.</p>
    <p class="note">Bạn có thể đọc <a href="/terms.html" target="_blank" rel="noopener">Điều khoản</a> và <a href="/privacy.html" target="_blank" rel="noopener">Chính sách quyền riêng tư</a>.</p>
    <form data-form="google-complete"><button class="auth-submit" type="submit">Tiếp tục với Google</button></form>
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
   <div class="auth-language-row">${languageSwitcher()}</div>
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

function closeHeaderNotifications(){
 const panel=document.getElementById('header-notification-panel');
 const button=document.getElementById('header-notice-button');
 if(panel)panel.hidden=true;
 if(button)button.setAttribute('aria-expanded','false');
}
function noticeStoreKey(){
 return 'tramco-lua.seen-notices.v1.'+String(state.me?.user?.id||'guest');
}
function getSeenNotices(){
 try{return new Set(JSON.parse(localStorage.getItem(noticeStoreKey())||'[]'));}catch{return new Set();}
}
function saveSeenNotices(keys){
 try{localStorage.setItem(noticeStoreKey(),JSON.stringify([...keys].slice(-120)));}catch{}
}
function noticeDate(s){
 const v=String(s||'');
 const d=Date.parse(v.includes('T')?v:v.replace(' ','T')+'Z');
 return Number.isFinite(d)?d:0;
}
async function collectHeaderNotices(){
 const items=[],isAdmin=state.me?.user?.role==='admin';
 if(isAdmin){
  const [withdrawals,reviews]=await Promise.all([
   api('/api/admin/withdrawals'),api('/api/admin/reviews').catch(()=>({reviews:[]}))
  ]);
  for(const w of (withdrawals.withdrawals||[]).filter(w=>['pending','approved'].includes(w.status)).slice(0,15)){
   items.push({id:'admin-withdraw-'+w.id+':'+w.status,
    title:w.status==='approved'?'Có khoản rút đang chờ chuyển tiền':'Có yêu cầu rút đang chờ duyệt',
    body:fmt(w.vnd_amount)+'đ • Mã '+withdrawalCode(w.id),at:w.created_at,go:'admin-withdrawals'});
  }
  for(const r of (reviews.reviews||[]).filter(r=>r.status==='pending').slice(0,10)){
   items.push({id:'admin-review-'+r.id,title:'Có bằng chứng nhiệm vụ chờ duyệt',
    body:'Mở danh sách bằng chứng để kiểm tra.',at:r.created_at,go:'admin-reviews'});
  }
 }else{
  const [history,shop,orders]=await Promise.all([
   api('/api/history'),api('/api/shop/alerts').catch(()=>({unread:0})),
   api('/api/shop/orders/alerts').catch(()=>({unread:0}))
  ]);
  for(const w of (history.withdrawals||[]).filter(w=>['paid','approved','rejected','invalid_account'].includes(w.status)).slice(0,30)){
   const title=({paid:'Yêu cầu rút đã thanh toán',approved:'Yêu cầu rút đã được duyệt',
    rejected:'Yêu cầu rút bị từ chối',invalid_account:'Số tài khoản nhận tiền không đúng'})[w.status];
   items.push({id:'withdraw-'+w.id+':'+w.status,title,
    body:fmt(w.vnd_amount)+'đ • Mã '+withdrawalCode(w.id),at:w.reviewed_at||w.created_at,go:'withdrawals'});
  }
  for(const c of (history.completions||[]).filter(c=>['approved','rejected'].includes(c.status)).slice(0,25)){
   items.push({id:'task-'+c.id+':'+c.status,
    title:c.status==='approved'?'Nhiệm vụ đã được duyệt':'Nhiệm vụ bị từ chối',
    body:String(c.title||'Kiểm tra lịch sử nhiệm vụ'),at:c.reviewed_at||c.created_at,go:'history'});
  }
  if(Number(shop.unread)>0)items.push({id:'shop-requests',title:'Có sản phẩm theo yêu cầu đã được tìm thấy',
   body:fmt(shop.unread)+' cập nhật chưa xem • Mở Mua sắm',go:'shop',at:null,serverUnread:true});
  if(Number(orders.unread)>0)items.push({id:'shop-orders',title:'Đơn hàng mua sắm có cập nhật',
   body:fmt(orders.unread)+' cập nhật chưa xem • Mở Đơn hàng & Lúa',go:'shop-orders',at:null,serverUnread:true});
 }
 if(state.meta?.announcement?.trim()&&!isAdmin){
  items.push({id:'announcement:'+state.meta.announcement,title:'Thông báo từ Admin',
   body:state.meta.announcement,go:'overview',at:null});
 }
 // Các mục chưa xem của chính tài khoản; không thông báo dữ liệu của người khác.
 items.sort((a,b)=>noticeDate(b.at)-noticeDate(a.at));
 return items.slice(0,30);
}
// Chỉ hiển thị kết quả Admin đã duyệt từ lịch sử máy chủ, không tự ghi thưởng.
const TASK_APPROVAL_SEEN_PREFIX='tramco-lua.approval-popups.v1.';
let approvalPopupChecking=false;
function approvalPopupStoreKey(){return TASK_APPROVAL_SEEN_PREFIX+String(state.me?.user?.id||'guest');}
function approvalPopupSeen(){
 try{return new Set(JSON.parse(localStorage.getItem(approvalPopupStoreKey())||'[]'));}catch{return new Set();}
}
function markApprovalPopupSeen(id){
 const seen=approvalPopupSeen();seen.add(String(id));
 try{localStorage.setItem(approvalPopupStoreKey(),JSON.stringify([...seen].slice(-250)));}catch{}
}
async function checkApprovedTaskPopups(){
 if(new URLSearchParams(location.search).has('link_return'))return;
 if(approvalPopupChecking||state.me?.user?.role!=='member'||document.visibilityState==='hidden')return;
 if(document.getElementById('modal-root')?.children.length)return;
 approvalPopupChecking=true;
 const userId=state.me.user.id;
 try{
  const history=await api('/api/history');
  if(state.me?.user?.id!==userId||document.getElementById('modal-root')?.children.length)return;
  const seen=approvalPopupSeen();
  const approved=(history.completions||[]).filter(c=>c.status==='approved'&&c.reviewed_at)
   .sort((a,b)=>noticeDate(a.reviewed_at)-noticeDate(b.reviewed_at));
  const next=approved.find(c=>!seen.has(String(c.id)));
  if(next){
   // Đánh dấu khi popup thực sự được hiển thị, không đánh dấu trước khi tải dữ liệu.
   renderTaskResultModal({status:'approved',reward:next.reward});
   if(document.getElementById('modal-root')?.querySelector('.task-result-cover'))markApprovalPopupSeen(next.id);
   refreshMe().catch(()=>{});
  }
 }catch{/* Mất mạng không làm gián đoạn trang; thử lại lần sau. */}
 finally{approvalPopupChecking=false;}
}
async function refreshHeaderNotifications(openPanel=false){
 const panel=document.getElementById('header-notification-panel'),
       button=document.getElementById('header-notice-button'),
       container=document.getElementById('header-notification-content'),
       badge=document.getElementById('header-notice-badge');
 if(!panel||!button||!state.me)return;
 if(openPanel&&!panel.hidden){closeHeaderNotifications();return;}
 if(openPanel){
  panel.hidden=false;button.setAttribute('aria-expanded','true');
  if(container)container.textContent='Đang tải thông báo...';
 }
 const userId=state.me.user.id;
 try{
  const notices=await collectHeaderNotices();
  if(!panel.isConnected||state.me?.user?.id!==userId)return;
  const seen=getSeenNotices();
  if(container){
   container.innerHTML=notices.length
    ?notices.map(n=>`<button type="button" class="header-notification-item" data-go="${esc(n.go)}">
     <strong>${esc(n.title)}</strong><span>${esc(n.body)}</span>
     ${n.at?`<small>${dt(n.at)}</small>`:''}</button>`).join('')
    :'<p class="header-notification-empty">Hiện chưa có thông báo mới.</p>';
  }
  if(openPanel){
   for(const n of notices){if(!n.serverUnread)seen.add(n.id);}
   saveSeenNotices(seen);
  }
  const count=notices.filter(n=>n.serverUnread||!seen.has(n.id)).length;
  if(badge){badge.hidden=count===0;badge.textContent=count>9?'9+':String(count);}
 }catch{
  if(openPanel&&container)container.textContent='Chưa tải được thông báo. Bạn có thể mở lại chuông để thử lần nữa.';
 }
}
document.addEventListener('click',e=>{
 const panel=document.getElementById('header-notification-panel');
 if(panel&&!panel.hidden&&!e.target.closest('#header-notification-panel, #header-notice-button'))closeHeaderNotifications();
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')closeHeaderNotifications();
});
async function initGlobalPaidCard(userId){
 const holder=document.getElementById('global-payment-wrap');
 if(!holder)return;
 try{
  const stats=await api('/api/task-dashboard');
  if(!holder.isConnected||state.me?.user?.id!==userId||state.me?.user?.role!=='member')return;
  holder.innerHTML=taskPaymentCard(stats);
  holder.hidden=false;
  startPaidRotation();
 }catch{
  // Không làm hỏng trang khác nếu API thông báo thanh toán lỗi.
  if(holder.isConnected&&state.me?.user?.id===userId){
   holder.innerHTML='<div class="callout">Chưa tải được các giao dịch đã thanh toán. Bạn có thể tải lại trang để thử.</div>';
   holder.hidden=false;
  }
 }
}
function renderSidebarNav(nav,user){
 if(user.role==='admin'){
  const groups=[['Tổng quan',['admin-overview']],['Xử lý yêu cầu',['admin-reviews','admin-withdrawals','admin-shop-orders','admin-cards']],['Quản lý',['admin-tasks','admin-users','admin-shop']],['Hệ thống',['admin-security','admin-settings','profile']]];
  return groups.map(([title,keys])=>`<div class="admin-nav-group"><div class="admin-nav-label">${esc(title)}</div>${keys.map(key=>{const item=nav.find(n=>n[0]===key);return item?`<button type="button" data-go="${key}" class="${state.view===key?'active':''}"><span class="symbol">${item[1]}</span><span>${esc(item[2])}</span></button>`:'';}).join('')}</div>`).join('');
 }
 return nav.map(([key,symbol,name])=>{
  if(user.role!=='member'||key!=='tasks')return `<button type="button" data-go="${key}" class="${state.view===key?'active':''}"><span class="symbol">${symbol}</span>${esc(name)}</button>`;
  const open=state.view==='tasks';
  return `<div class="task-nav-group"><button type="button" id="task-nav-toggle" class="task-nav-parent ${open?'active':''}" data-action="toggle-task-nav" aria-expanded="${open}" aria-controls="task-nav-children"><span class="symbol">${symbol}</span><span>${esc(name)}</span><svg class="task-nav-chevron" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>
   <div id="task-nav-children" class="task-nav-children" ${open?'':'hidden'}>${[['link','🔗 Link'],['app','📱 Nhiệm vụ App']].map(([filter,label])=>`<button type="button" data-go="tasks" data-filter="${filter}" class="${open&&state.taskFilter===filter?'active':''}" ${open&&state.taskFilter===filter?'aria-current="page"':''}><span aria-hidden="true" class="task-nav-branch">–</span><span>${esc(label)}</span></button>`).join('')}</div></div>`;
 }).join('');
}
function setTaskNavOpen(open){
 const parent=document.getElementById('task-nav-toggle'),children=document.getElementById('task-nav-children');
 if(!parent||!children)return;
 parent.setAttribute('aria-expanded',String(Boolean(open)));
 children.hidden=!open;
}
function syncSidebarSelection(view){
 document.querySelectorAll('[data-go]').forEach(btn=>{
  const sub=btn.closest('.task-nav-children');
  const active=btn.dataset.go===view&&(!sub||btn.dataset.filter===state.taskFilter);
  btn.classList.toggle('active',active);
  if(sub){if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');}
 });
 const parent=document.getElementById('task-nav-toggle');
 if(parent){parent.classList.toggle('active',view==='tasks');setTaskNavOpen(view==='tasks');}
}
function renderShell(){
 document.body.classList.remove('task-result-open');
 stopPaidRotation(); // tránh giữ timer của người đăng nhập trước
 const nav=state.me.user.role==='admin'?ADMIN_NAV:NAV;
 const user=state.me.user;
 app.className='';app.innerHTML=`<div class="layout${user.role==='admin'?' admin-workspace':''}"><aside class="sidebar" id="site-menu" aria-label="Menu điều hướng">
  <div class="side-header"><div class="side-brand"><span class="brand-mark brand-mark-image"><img src="/logo.svg" alt="" width="40" height="40"></span><span>${esc(state.meta.site_name)}</span></div><button type="button" class="sidebar-close" data-action="close-menu" aria-label="Đóng menu">×</button></div>
  <div class="side-kicker">${user.role==='admin'?'BẢNG QUẢN TRỊ':'KHÔNG GIAN THÀNH VIÊN'}</div>
  <div class="sidebar-language">${languageSwitcher()}</div>
  <nav class="nav">${renderSidebarNav(nav,user)}</nav>
  <div class="sidebar-bottom"><strong>${esc(user.name)}</strong>${esc(user.email)}<button data-action="logout">Đăng xuất ↗</button></div>
 </aside><button type="button" class="menu-backdrop" tabindex="-1" data-action="close-menu" aria-label="Đóng menu"></button><section class="main-area"><header class="topbar"><div class="topbar-leading"><button type="button" class="menu-toggle" id="menu-toggle" data-action="toggle-menu" aria-controls="site-menu" aria-expanded="false" aria-label="Mở menu"><span aria-hidden="true">☰</span></button><div class="topbar-title"><h1 id="topTitle">Bảng điều khiển</h1><p>Quản lý minh bạch • Cập nhật theo dữ liệu thật</p></div></div>
 <div class="top-right">${languageSwitcher()}<span class="balance-pill" id="topBalance">🌾 ${fmt(state.me.balance)} Lúa</span>
 <button type="button" class="header-icon-button" id="header-notice-button" data-action="toggle-notifications" aria-label="Mở thông báo" aria-expanded="false" aria-controls="header-notification-panel" title="Thông báo">
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg><span class="header-notice-badge" id="header-notice-badge" hidden></span>
 </button>
 <button type="button" class="avatar header-avatar" data-go="profile" title="Hồ sơ: ${esc(user.name)}" aria-label="Mở hồ sơ của tôi">${esc(user.name[0]?.toUpperCase()||'T')}</button></div>
 <section id="header-notification-panel" class="header-notification-panel" aria-label="Thông báo tài khoản" hidden>
   <div class="header-notification-title"><strong>🔔 Thông báo</strong><button type="button" data-action="close-notifications" aria-label="Đóng thông báo">×</button></div>
   <div class="header-notification-content" id="header-notification-content">Nhấn chuông để tải thông báo.</div>
 </section></header>
 <main class="content"><div id="global-payment-wrap" class="global-payment-wrap" hidden></div><div id="viewContent"></div></main></section></div><div id="modal-root"></div>`;
 setMenuOpen(false);
 if(user.role==='member')initGlobalPaidCard(user.id).catch(()=>{});
 refreshHeaderNotifications(false).catch(()=>{});
 if(user.role==='member')checkApprovedTaskPopups().catch(()=>{});
}
async function refreshMe(){await loadMe();if(!state.me){if(state.accountHold)renderLocked();else renderHome();return;}document.getElementById('topBalance').textContent='🌾 '+fmt(state.me.balance)+' Lúa';}
// Keep the selected menu within this browser tab, isolated by signed-in account and role.
function menuKey(user){return 'tram-lua.menu.v1.'+user.role+'.'+user.id;}
function validMenu(user,view){
 if(user.role==='member'&&view==='cards')view='withdrawals';
 const nav=user.role==='admin'?ADMIN_NAV:NAV;
 return nav.some(n=>n[0]===view)?view:(user.role==='admin'?'admin-overview':'overview');
}
function restoreMenu(){
 const user=state.me.user;
 state.payoutMethod='bank';
 try{
  const saved=JSON.parse(sessionStorage.getItem(menuKey(user))||'null');
  if(user.role==='member'&&(saved?.view==='cards'||saved?.payoutMethod==='card'))state.payoutMethod='card';
  if(saved?.filter==='app'||saved?.filter==='link')state.taskFilter=saved.filter;
  return validMenu(user,saved?.view);
 }catch{return validMenu(user,null);}
}
function rememberMenu(view){
 const user=state.me?.user;if(!user)return;
 try{sessionStorage.setItem(menuKey(user),JSON.stringify({view:validMenu(user,view),filter:state.taskFilter,payoutMethod:state.payoutMethod}));}catch{}
}
function overviewNoticeKey(user){return 'tram-lua.overview-notice.v1.'+user.id;}
let overviewNoticePending=false;
function showOverviewNotice(){
 const user=state.me?.user;
 if(!overviewNoticePending||user?.role!=='member'||state.view!=='overview'||new URLSearchParams(location.search).has('link_return'))return;
 const root=document.getElementById('modal-root');if(!root||root.children.length)return;
 try{if(Number(localStorage.getItem(overviewNoticeKey(user)))>Date.now()){overviewNoticePending=false;return;}}catch{}
 overviewNoticePending=false;
 root.innerHTML=`<div class="modal-cover overview-notice-cover"><section class="modal overview-notice" role="dialog" aria-modal="true" aria-labelledby="overview-notice-title">
  <header class="overview-notice-head"><span class="overview-notice-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M24 5 40 11v12c0 10-6 16-16 21C14 39 8 33 8 23V11L24 5Z" stroke="currentColor" stroke-width="2.5"/><path d="m16 24 6 6 11-13" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><h3 id="overview-notice-title">Chào mừng đến với Trạm Có Lúa</h3><p>Vài lưu ý quan trọng trước khi bắt đầu</p></div></header>
  <div class="overview-notice-rules">
   <div><span aria-hidden="true">①</span><p>Chỉ sử dụng một tài khoản cho tất cả nhiệm vụ.</p></div>
   <div><span aria-hidden="true">✓</span><p>Thực hiện nhiệm vụ đúng hướng dẫn và trung thực.</p></div>
   <div><span aria-hidden="true">!</span><p>Gian lận có thể bị khóa tài khoản và từ chối thanh toán theo quy định.</p></div>
  </div>
  <label class="overview-notice-option"><input type="checkbox" id="overview-notice-snooze"><span>Không hiển thị lại trong 12 giờ</span></label>
  <button type="button" class="btn overview-notice-action" data-action="ack-overview-notice">Đã hiểu, bắt đầu kiếm Lúa →</button>
 </section></div>`;
 root.querySelector('[data-action="ack-overview-notice"]')?.focus({preventScroll:true});
}
function closeOverviewNotice(){
 const root=document.getElementById('modal-root'),user=state.me?.user;
 if(!root?.querySelector('.overview-notice-cover')||user?.role!=='member')return;
 if(root.querySelector('#overview-notice-snooze')?.checked){
  try{localStorage.setItem(overviewNoticeKey(user),String(Date.now()+12*60*60*1000));}catch{}
 }
 root.innerHTML='';
}
let navigationSequence=0;
async function navigate(view,{checkedMe=false}={}){
 const user=state.me?.user;if(!user)return;
 // Existing card actions and old menu links keep opening the correct method.
 if(user.role==='member'&&view==='cards')state.payoutMethod='card';
 view=validMenu(user,view);
 const sequence=++navigationSequence;
 closeHeaderNotifications();
 const modal=document.getElementById('modal-root');
 if(modal?.querySelector('.overview-notice-cover'))modal.innerHTML='';
 overviewNoticePending=false;
 state.view=view;
 rememberMenu(view);
 const nav=state.me?.user.role==='admin'?ADMIN_NAV:NAV;
 const found=nav.find(n=>n[0]===view);
 syncSidebarSelection(view);
 const top=document.getElementById('topTitle');if(top)top.textContent=found?.[2]||'Tổng quan';
 const root=document.getElementById('viewContent');if(!root)return;
 root.innerHTML='<div class="app-loading" style="min-height:180px"><span class="spinner"></span></div>';
 const current=()=>sequence===navigationSequence&&root.isConnected&&state.me?.user?.id===user.id;
 try{
  const fresh=checkedMe?state.me:await api('/api/me');
  if(!current())return;
  state.me=fresh;
  const balance=document.getElementById('topBalance');if(balance)balance.textContent='🌾 '+fmt(fresh.balance)+' Lúa';
  const html=await page(view);if(!current())return;
  root.innerHTML=html;
  if(user.role==='admin')prepareAdminPage(root,view);
  if(view==='overview'&&user.role==='member'){overviewNoticePending=true;showOverviewNotice();}
 }catch(e){
  if(!current())return;
  if(e.status===403){
   const hold=await api('/api/account-status').catch(()=>null);
   if(!current())return;
   if(hold?.account_status==='suspended'){state.me=null;state.accountHold=hold;renderLocked();return;}
  }
  root.innerHTML=`<div class="callout">Không tải được dữ liệu: ${esc(e.message)}</div>`;
 }
 if(view==='withdrawals'){const withdrawForm=root.querySelector('form[data-form="withdraw"]');updateWithdrawalFields(withdrawForm);updateWithdrawalPreview(withdrawForm);}
 if(view==='withdrawals')updatePayoutAccountFields(root.querySelector('form[data-form="payout-account"]'));
 if(state.me?.user.role==='member'){
  api('/api/shop/orders/alerts').then(r=>{
   document.querySelectorAll('[data-go="shop-orders"]').forEach(btn=>{
    btn.querySelector('.shop-nav-badge')?.remove();
    if(r.unread){const span=document.createElement('span');span.className='shop-nav-badge';span.textContent=String(r.unread);btn.appendChild(span);}
   });
  }).catch(()=>{});
  api('/api/shop/alerts').then(r=>{
   document.querySelectorAll('[data-go="shop"]').forEach(btn=>{
    btn.querySelector('.shop-nav-badge')?.remove();
    if(r.unread){const span=document.createElement('span');span.className='shop-nav-badge';span.textContent=String(r.unread);btn.appendChild(span);}
   });
  }).catch(()=>{});
 }
}
async function page(view){
 switch(view){
 case 'overview':return overview();case 'tasks':return tasks();case 'shop':return shopPage({api,esc,dt,heading,state});case 'shop-orders':return shopOrdersPage({api,esc,heading,fmt,dt});case 'referrals':return referrals();
 case 'benefits':return benefits();case 'withdrawals':return memberPayoutPage();case 'history':return history();case 'profile':return profile();
 case 'admin-overview':return adminOverview();case 'admin-tasks':return adminTasks();case 'admin-shop':return adminShopPage({api,esc,dt,field,select,heading,state});case 'admin-shop-orders':return adminShopOrdersPage({api,esc,heading,fmt,dt});case 'admin-users':return adminUsers();
 case 'admin-reviews':return adminReviews();case 'admin-withdrawals':return adminWithdrawals();case 'admin-cards':return adminCardRedemptionsPage({api,esc,heading,dt});
 case 'admin-security':return adminSecurity();case 'admin-settings':return adminSettings();
 default:return empty('Trang chưa được cấu hình');
 }
}
function memberOverviewMarkup(m,stats,meta){
 const balance=Math.max(0,Number(m.balance)||0),min=Number(meta.min_withdraw_lua)||0;
 const missing=Math.max(0,min-balance),progress=min>0?Math.min(100,Math.floor(balance/min*100)):0;
 const days=stats.days||[],total=days.reduce((n,d)=>n+Number(d.lua||0),0),peak=Math.max(1,...days.map(d=>Number(d.lua)||0));
 const first=Number(days[0]?.lua||0),last=Number(days[days.length-1]?.lua||0);
 const change=first>0?((last-first)/first*100):last===0?0:null;
 const growth=change===null?'—':(change>0?'+':'')+change.toFixed(1)+'%';
 const statusLabels={approved:'Đã hoàn thành',pending:'Đang chờ duyệt',rejected:'Bị từ chối',in_progress:'Đang thực hiện'};
 const stat=(label,value,caption,symbol,tone='')=>`<article class="member-overview-stat ${tone}"><div><span>${esc(label)}</span><strong>${fmt(value)}</strong><small>${esc(caption)}</small></div><i aria-hidden="true">${symbol}</i></article>`;
 return `<section class="member-overview">
 <article class="member-overview-wallet"><span>▣ Số dư khả dụng</span><h2>${fmt(balance)} Lúa</h2><p>Sẵn sàng cho nhiệm vụ tiếp theo</p><div class="member-overview-buttons"><button type="button" class="btn" data-go="withdrawals">Rút tiền ↗</button><button type="button" class="btn alt" data-go="tasks">Xem nhiệm vụ →</button></div></article>
 <article class="member-overview-panel member-overview-goal"><span>◎ Còn thiếu để rút</span><h2>${min?fmt(missing)+' Lúa':'—'}</h2>${min?`<div class="member-overview-progress" role="progressbar" aria-label="Tiến độ rút tiền" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i style="width:${progress}%"></i></div><small>${fmt(balance)} Lúa / ${fmt(min)} Lúa (${progress}%)</small>`:'<small>Chưa thiết lập tỷ giá</small>'}</article>
 <div class="member-overview-stats">
 ${stat('Tổng đã thực hiện',stats.total,'Tổng số lượt đã gửi và đang thực hiện','◎')}
 ${stat('Đã hoàn thành',stats.approved,'Nhiệm vụ đã được duyệt','✓','success')}
 ${stat('Đang chờ duyệt',stats.pending,'Chờ Admin xác minh','◷','pending')}
 ${stat('Đang thực hiện',stats.in_progress,'Phiên chưa hoàn tất còn hiệu lực','◷','active')}
 </div>
 <article class="member-overview-panel member-overview-income"><header><i aria-hidden="true">▣</i><div><h3>Thu nhập 7 ngày gần nhất</h3><p>Theo dõi số Lúa kiếm được mỗi ngày</p></div></header><span class="member-overview-period">7 ngày</span>
 <div class="member-overview-income-stats"><div><span>Tổng thu nhập</span><strong>${fmt(total)} Lúa</strong><small>Trong 7 ngày</small></div><div><span>Trung bình / ngày</span><strong class="active">${fmt(Math.round(total/7))} Lúa</strong><small>Mức trung bình</small></div><div><span>Tăng trưởng</span><strong class="${change===null?'':change<0?'negative':'success'}">${growth}</strong><small>${change===null?'Không có thu nhập ngày đầu kỳ':'So với đầu kỳ'}</small></div></div>
 <div class="member-overview-chart" aria-label="Thu nhập theo ngày, giờ Việt Nam">${days.map(d=>{const day=new Date(d.day+'T00:00:00Z');const labels=['CN','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];return `<div class="member-overview-day"><strong>${fmt(d.lua)} Lúa</strong><div class="member-overview-bar-track"><i style="height:${Math.max(0,Math.min(100,Number(d.lua||0)/peak*100))}%"></i></div><b>${labels[day.getUTCDay()]}</b><small>${esc(d.day.slice(8,10)+'-'+d.day.slice(5,7))}</small></div>`;}).join('')}</div></article>
 <article class="member-overview-panel member-overview-recent"><h3>Nhiệm vụ gần đây</h3><p>5 nhiệm vụ gần nhất của bạn</p><button class="member-overview-link" type="button" data-go="history">Xem lịch sử ↗</button>
 ${(stats.recent||[]).length?(stats.recent||[]).map(r=>`<div class="member-overview-recent-row"><i aria-hidden="true">${r.category==='link'?'🔗':'▤'}</i><div><strong>${esc(r.title)}</strong><small>${esc(statusLabels[r.status]||r.status)} · ${esc(dt(r.created_at))}</small><span class="member-overview-status ${esc(r.status)}">◷ ${esc(statusLabels[r.status]||r.status)}</span></div></div>`).join(''):'<p>Chưa có nhiệm vụ gần đây.</p>'}</article>
 </section>`;
}
async function overview(){
 const m=state.me;
 const [stats,shoppingAlerts,orderAlerts]=await Promise.all([api('/api/member-overview'),api('/api/shop/alerts').catch(()=>({unread:0})),api('/api/shop/orders/alerts').catch(()=>({unread:0}))]);
 return `
 ${orderAlerts.unread?`<div class="shop-notice shop-notice-ready" role="status"><span class="shop-notice-emoji">📦</span><div><strong>${orderAlerts.unread} đơn mua sắm vừa cập nhật!</strong><p>Kiểm tra trạng thái và lịch sử nhận Lúa trong Đơn hàng & Lúa.</p></div><button type="button" class="btn sm" data-go="shop-orders">Xem đơn →</button></div>`:''}
 ${shoppingAlerts.unread?`<div class="shop-notice shop-notice-ready" role="status"><span class="shop-notice-emoji">🎉</span><div><strong>Bạn có ${shoppingAlerts.unread} sản phẩm theo yêu cầu đã được tìm thấy!</strong><p>Nhấn để xem liên kết mua hàng trong gian hàng Trạm Có Lúa.</p></div><button type="button" class="btn sm" data-go="shop">Xem sản phẩm →</button></div>`:''}

 ${memberOverviewMarkup(m,stats,state.meta)}`;
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

function taskPaymentCard(d){
 const payments=d.recent_payments|| (d.latest_payment?[d.latest_payment]:[]);
 const signature=paidAnnouncementSignature(payments);
 const payment=payments.length?paymentSlides(payments)
  :'<strong>↗ THÔNG BÁO THANH TOÁN</strong><p>Chưa có khoản rút nào được Admin xác nhận đã chuyển.</p><small>Không sử dụng giao dịch minh họa.</small>';
 return `<section class="card task-payment ${payments.length>1?'has-paid-rotation':''}" id="paid-rotation" data-active="0" data-signature="${esc(signature)}" aria-label="Các giao dịch đã thanh toán">
    <div class="paid-rotation-slides">${payment}</div>
  </section>`;
}
function taskDashboardCard(d,quotas={}){
 return `<div class="task-dashboard">
  <div class="task-stats">
    <div class="card task-stat"><span>🌾 LÚA HÔM NAY</span><strong>+${fmt(d.today_lua)} Lúa</strong></div>
    <div class="card task-stat"><span>☑ TỔNG LÚA LINK ĐÃ DUYỆT</span><strong>${fmt(d.link_lua)} Lúa</strong></div>
    <div class="card task-stat"><span>✓ NHIỆM VỤ ĐÃ GỬI HÔM NAY</span><strong>${fmt(d.submitted_today)}</strong></div>
    <div class="card task-stat"><span>↻ ĐỔI NGÀY SAU</span><strong id="taskResetCountdown" data-reset-at="${Number(d.next_reset_at)}">--:--:--</strong></div>
  </div>
  <section class="card task-device-card task-security-compact" aria-label="Bảo vệ chống gian lận">
   <h3 class="task-security-title">🛡️ Bảo vệ chống gian lận</h3>
   <div class="task-security-ip"><span>IP hiện tại:</span> <strong id="taskDisplayIP">${esc(compactIP(d.ip))}</strong></div>
   <p class="task-security-policy" role="note">🛡️ Quota chặn theo mã thiết bị và địa chỉ IP - đổi IP/VPN/4G không giúp vượt giới hạn.</p>
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
function renderMemberTaskCard(t){
 const isLink=t.category==='link';
 const maxUses=isLink?Math.max(1,Math.min(20,Math.floor(Number(t.link_24h_limit)||1))):1;
 const count=isLink?Math.max(0,Math.floor(Number(t.link_24h_count)||0)):(t.my_status?1:0);
 const used=Math.min(maxUses,count);
 const left=Math.max(0,maxUses-used);
 const daily=(isLink&&maxUses>1)||t.repeat_policy==='daily';
 const name=t.category==='link'?'Link rút gọn':t.category==='video'?'Xem video':t.category==='app'?'Nhiệm vụ App':'Nhiệm vụ';
 const symbol=t.category==='link'?'🔗':t.category==='video'?'🎬':t.category==='app'?'📱':'✨';
 const timing=t.category==='video'?Math.max(5,Number(t.min_seconds)||5)+' giây tối thiểu':
   t.category==='link'?'Thực hiện qua liên kết':'Theo hướng dẫn';
 const usedLabel=isLink&&maxUses>1?`${used}/${maxUses}`:null;
 const badge=usedLabel||`${used}/${maxUses}`;
 const countText=t.link_needs_confirmation?'Đang chờ xác minh phép tính':t.link_blocked==='link_task_limit'?`Đã sử dụng ${used}/${maxUses} lượt hôm nay`:
   t.link_blocked?'Nhiệm vụ hiện không khả dụng':
   t.my_status==='pending'?'Đã gửi, đang chờ Admin đối soát':
   t.my_status==='approved'?'Nhiệm vụ đã được duyệt':
   t.my_status==='rejected'?'Nhiệm vụ đã bị từ chối':
   daily?`Còn ${left}/${maxUses} lượt hôm nay`:
   `Còn ${left}/${maxUses} lượt cho nhiệm vụ này`;
 const progress=Number((used/maxUses*100).toFixed(2));
 const progressLocked=Boolean(t.link_blocked&&!t.link_needs_confirmation);
 const progressWidth=progressLocked?100:progress;
 const gradientScale=progressWidth>0?Number((10000/progressWidth).toFixed(4)):100;
 const blockNote=t.link_needs_confirmation?'Hoàn tất xác minh lượt cũ trước khi làm lượt mới.':
  t.link_blocked==='link_task_limit'?'Đã hết lượt hôm nay. Lượt mới mở lúc 00:00 (giờ Việt Nam).':'';
 const button=t.link_needs_confirmation?
  `<button class="btn task-card-modern-action" type="button" data-action="resume-link-confirmation" data-id="${esc(t.id)}">Tiếp tục xác minh</button>`:
  t.link_blocked?
  `<button class="btn task-card-modern-action is-disabled" type="button" disabled><span aria-hidden="true">🔒</span> Không khả dụng</button>`:
  t.my_status?
   `<div class="task-card-modern-completed">${chip(t.my_status)}<span>Trạng thái được cập nhật từ hệ thống.</span></div>`:
   `<button class="btn task-card-modern-action" type="button" data-action="start-task" data-id="${esc(t.id)}"><span aria-hidden="true" class="task-card-modern-play">▶</span> ${t.category==='app'?'Bắt đầu / Tiếp tục xác nhận':'Làm nhiệm vụ'} <span aria-hidden="true">›</span></button>`;
 return `<article class="card task-card task-card-modern">
  <div class="task-card-modern-head">
   <span class="task-card-modern-icon" aria-hidden="true">${t.category==='app'&&/^data:image\/(?:webp|jpeg|png);base64,/.test(t.app_logo||'')?`<img src="${esc(t.app_logo)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:14px">`:symbol}</span>
   <div class="task-card-modern-identity">
    <span class="task-card-modern-type">${name}</span>
    <h3>${esc(t.title)}</h3>
    <div class="task-card-modern-chips">
     <span class="task-card-modern-timing">◷ ${esc(timing)}</span>
     <span class="task-card-modern-reward">🌾 +${fmt(t.reward)} Lúa</span>
    </div>
   </div>
   <div class="task-card-modern-count" aria-label="Đã làm ${used} trong ${maxUses} lượt"><strong>${badge}</strong><small>lượt</small></div>
  </div>
  <p class="task-card-modern-description">${esc(t.description||'Làm theo hướng dẫn của quản trị viên.')}</p>
  ${t.category==='app'?`<div class="app-ref-code">Mã giới thiệu: <strong>${esc(t.app_referral_code||'—')}</strong> <button class="btn alt sm" data-action="copy" data-value="${esc(t.app_referral_code||'')}">Sao chép mã</button></div><p class="note">Đăng ký và nhập mã theo hướng dẫn, sau đó gửi xác nhận. Chỉ nhận Lúa khi Admin duyệt.</p>`:''}
  <div class="task-card-modern-bottom">
   <div class="task-card-modern-quota"><span class="task-card-modern-quota-icon" aria-hidden="true">◉</span><span>${esc(countText)}</span></div>
   <div class="task-card-modern-track${progressLocked?' is-unavailable':''}" role="progressbar" aria-label="Lượt đã thực hiện" aria-valuemin="0" aria-valuemax="${maxUses}" aria-valuenow="${used}"${progressLocked?` aria-valuetext="${used}/${maxUses} · Không khả dụng"`:''}><span style="width:${progressWidth}%;background-size:${gradientScale}% 100%"></span></div>
   ${blockNote?`<p class="task-link-blocked">⛔ ${esc(blockNote)}</p>`:''}
   ${button}
  </div>
 </article>`;
}
async function tasks(){
 const [data,stats]=await Promise.all([api('/api/tasks'),api('/api/task-dashboard')]);
 state.memberTasks=data.tasks;
 const shownTasks=data.tasks.filter(t=>['app','link'].includes(t.category)&&t.category===state.taskFilter)
  .sort((a,b)=>(Number(b.reward)||0)-(Number(a.reward)||0));
 setTimeout(startTaskResetTimer,0);
 if(String(stats.ip||'').includes(':'))setTimeout(()=>{const button=document.querySelector('.task-ip-btn[data-action="check-ipv4"]');if(button&&state.view==='tasks')detectPublicIPv4(button,true);},0);
 return `${heading('Nhiệm vụ','Thông tin thanh toán, Lúa và an toàn lấy trực tiếp từ hệ thống.')}
 ${state.taskFilter==='link'?taskDashboardCard(stats,data):''}
 <div class="task-card-modern-section-head"><h3>Khám phá nhiệm vụ</h3><span>🌾 Tích Lúa mỗi ngày</span></div>
 ${shownTasks.length?`<div class="grid task-card-modern-grid">${shownTasks.map(renderMemberTaskCard).join('')}</div>`:empty('Hiện chưa có nhiệm vụ','Admin cần tạo và bật nhiệm vụ thật. Website không tự thêm nhiệm vụ hoặc số Lúa giả.')}`;
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
async function memberPayoutPage(){
 const method=state.payoutMethod==='card'?'card':'bank';
 const options=[['bank','🏦 Chuyển khoản ngân hàng'],['card','🎁 Đổi thẻ cào']];
 const tabs=`<div role="group" aria-label="Rút tiền" class="section" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:0">${options.map(([key,label])=>`<button type="button" class="btn ${method===key?'':'alt'}" style="min-height:48px;white-space:normal;line-height:1.3;padding:10px 6px" data-action="payout-method" data-method="${key}" aria-pressed="${method===key}">${esc(label)}</button>`).join('')}</div>`;
 const content=method==='card'?await cardRedemptionsPage({api,esc,heading,dt}):await withdrawals();
 return tabs+content;
}
async function withdrawals(){
 const [data,accountsData,meta]=await Promise.all([api('/api/history'),api('/api/payout-accounts').catch(()=>({accounts:[],unavailable:true})),api('/api/meta')]);
 state.savedPayoutAccounts=accountsData.accounts||[];
 const savedAccounts=state.savedPayoutAccounts.filter(x=>x.payment_method==='bank');
 const defaultBank=savedAccounts.find(x=>x.is_default);
 const preferred=defaultBank||savedAccounts[0];
 const savedSelection=preferred?.id||'';
 const policy=meta.withdrawal_rules||'✅ Yêu cầu hợp lệ và không vi phạm quy định sẽ được thanh toán.\n⚠️ Nếu xác minh có gian lận hoặc vi phạm quy định, yêu cầu sẽ bị từ chối thanh toán.';
 const paymentTime=meta.withdrawal_payment_time||'1–3 ngày làm việc';
 const t=`${heading('Yêu cầu rút tiền','Đang chờ → Đã duyệt → Đã thanh toán. Admin kiểm tra trước khi chuyển khoản ngân hàng.')}`;
 const info=!meta.withdrawals_enabled?`<div class="callout">⚠ Admin chưa mở chi trả hoặc chưa thiết lập tỷ giá Lúa/VNĐ. Bạn chưa thể tạo yêu cầu rút tiền.</div>`:'';
 const form=`<form class="card" data-form="withdraw" data-balance="${Number(state.me.balance)||0}" data-fee-vnd="${Number(meta.withdrawal_fee_vnd??2000)}" data-free-from-vnd="${Number(meta.withdrawal_free_from_vnd)||25000}" data-min-vnd="${Number(meta.withdrawal_min_vnd)||5000}" data-rate="${Number(meta.lua_per_vnd)||0}"><h3>Tạo yêu cầu rút</h3><input type="hidden" name="expected_fee_lua" value="0">
 <div class="withdraw-amount-wrap">
   ${field('amount','Số Lúa muốn rút','',`type="number" min="${meta.min_withdraw_lua}" step="1" required ${!meta.withdrawals_enabled?'disabled':''}`)}
   <button type="button" class="btn alt withdraw-max-btn" data-action="withdraw-max" ${!meta.withdrawals_enabled?'disabled':''}>Tối đa số dư</button>
 </div>
 <div class="note">Rút tối thiểu 5.000đ • ${meta.lua_per_vnd?fmt(meta.lua_per_vnd)+' Lúa = 1 VNĐ':'Chưa có tỷ giá'} • Số dư: ${fmt(state.me.balance)} Lúa</div>
 <div class="withdraw-fee-preview" role="status">
   <strong>Phí rút tiền theo mệnh giá</strong>
   <p class="note">Dưới ${fmt(meta.withdrawal_free_from_vnd??25000)}đ: phí ${fmt(meta.withdrawal_fee_vnd??2000)}đ • Từ ${fmt(meta.withdrawal_free_from_vnd??25000)}đ: miễn phí.</p>
   <div><span>Lúa dùng để rút:</span><b id="withdraw-base">—</b></div>
   <div><span>Phí rút:</span><b id="withdraw-fee">—</b></div>
   <div class="withdraw-fee-total"><span>Tổng Lúa sẽ giữ:</span><b id="withdraw-total">—</b></div>
   <div><span>Tiền nhận dự kiến:</span><b id="withdraw-payout">—</b></div>
   <p class="note" id="withdraw-fee-help">Khách nhận đủ tiền rút; phí được giữ thêm bằng Lúa. Nếu Admin từ chối hoặc thông tin nhận tiền sai, toàn bộ Lúa và phí được hoàn.</p>
 </div>
 ${savedAccounts.length?`<div class="withdraw-saved-picker">
  <label for="withdraw-saved-account">🏦 Tài khoản ngân hàng đã lưu</label>
  <select id="withdraw-saved-account" name="saved_account_id" ${!meta.withdrawals_enabled?'disabled':''}>
   <option value="">＋ Nhập tài khoản mới</option>
   ${savedAccounts.map(a=>`<option value="${esc(a.id)}" ${a.id===savedSelection?'selected':''}>${esc(a.nickname||a.bank_name)} – ${esc(a.account_number)}${a.is_default?' ✓':''}</option>`).join('')}
  </select>
  <div id="saved-payout-preview" class="withdraw-saved-description">${preferred?'Đã chọn: '+esc(preferred.bank_name)+' · '+esc(preferred.account_number)+' · '+esc(preferred.account_owner):'Chưa có tài khoản đã lưu. Bạn có thể thêm một lần để những lần sau chỉ cần chọn.'}</div>
 </div>`:''}
 <input type="hidden" name="payment_method" value="bank">
 <div id="withdraw-bank-fields">
 <div class="field"><label for="bank_name">Ngân hàng nhận</label><select id="bank_name" name="bank_name" required ${!meta.withdrawals_enabled?'disabled':''}>${BANK_LIST.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>
 <div id="withdraw-bank-other" hidden>${field('bank_other','Nhập tên ngân hàng khác','',`disabled`)}</div>
 ${field('bank_account','Số tài khoản ngân hàng (BVBank có thể có chữ)','',`required inputmode="numeric" pattern="[0-9]{5,30}" ${!meta.withdrawals_enabled?'disabled':''}`)}
 ${field('bank_owner','Tên chủ tài khoản ngân hàng','',`required ${!meta.withdrawals_enabled?'disabled':''}`)}
 </div>
 <label id="withdraw-save-account-line" class="saved-payout-check"><input type="checkbox" name="save_account_default" value="1" ${!meta.withdrawals_enabled?'disabled':''}> ✓ Lưu thông tin nhận tiền này làm mặc định cho lần rút sau</label>
 <button class="btn" type="submit" ${!meta.withdrawals_enabled?'disabled':''}>Gửi yêu cầu</button>
 <p class="note">Lúa sẽ được giữ ngay khi gửi để không bị rút trùng. Nếu Admin từ chối hoặc đánh dấu số tài khoản không đúng, hệ thống tự hoàn Lúa.</p></form>`;
 const withdrawalCards=data.withdrawals.map(w=>`<article class="withdraw-history-item">
  <div class="withdraw-history-head"><strong>Mã lệnh: ${esc(withdrawalCode(w.id))}</strong>${chip(w.status)}</div>
  <div class="withdraw-history-value">${fmt(w.amount)} Lúa <span>→ ${fmt(w.vnd_amount)}đ</span></div>
  <div class="withdraw-history-meta">${esc(w.payment_method==='zalopay'?'Ví ZaloPay (giao dịch cũ)':w.bank_name)} · ${dt(w.created_at)}</div>
  <div class="withdraw-history-meta">Phí: ${fmt(w.fee_lua)} Lúa · Tổng giữ: ${fmt(Number(w.amount)+Number(w.fee_lua||0))} Lúa</div>
  <p>${esc(w.admin_note|| (w.status==='paid'?'Tiền đã được Admin xác nhận chuyển.':w.status==='approved'?'Yêu cầu đã duyệt, đang chờ chuyển tiền.':w.status==='pending'?'Yêu cầu đang chờ Admin duyệt.':'—'))}</p>
 </article>`).join('');
 const manager=await payoutAccountsPage({api,esc,heading,bankList:BANK_LIST,embedded:true,initialData:accountsData});
 return t+info+`<section class="card section"><h3>📋 Quy định rút tiền</h3>${String(policy).split(/\r?\n/).filter(line=>line.trim()).map(line=>`<p style="overflow-wrap:anywhere">${esc(line)}</p>`).join('')}<p>🕒 Thời gian thanh toán: <strong style="overflow-wrap:anywhere">${esc(paymentTime)}</strong> kể từ khi gửi yêu cầu hợp lệ.</p></section><section class="grid two section">${form}<div class="card"><h3>Thông tin minh bạch</h3><p>Hệ thống không tự chuyển tiền. Admin duyệt yêu cầu trước, sau đó chuyển khoản ngân hàng ngoài website và đối chiếu giao dịch thực tế mới xác nhận <strong>Đã thanh toán</strong>.</p><p>Được duyệt không có nghĩa đã nhận tiền. Khách có thể theo dõi từng trạng thái trong lịch sử.</p></div></section><details class="card section withdraw-account-manager" ${state.savedManagerOpen?'open':''}><summary>⚙ Quản lý tài khoản nhận tiền đã lưu (nếu cần)</summary>${manager}</details><section class="section"><h3>🕘 Lịch sử yêu cầu rút</h3>${withdrawalCards?'<div class="withdraw-history-list">'+withdrawalCards+'</div>':empty('Chưa có yêu cầu rút','Yêu cầu rút mới sẽ hiển thị tại đây kèm mã lệnh.')}</section>`;
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
function prepareAdminPage(root,view){
 root.dataset.adminView=view;
 // Move existing nodes, never rebuild or clone forms. Editing still opens the original form.
 const fold=(node,title,open=false)=>{
  if(!node)return;
  const details=document.createElement('details');details.className='card admin-fold admin-panel-fold';details.open=open;
  const summary=document.createElement('summary');summary.textContent=title;
  node.before(details);details.append(summary,node);
 };
 if(view==='admin-shop'){
  fold(root.querySelector('#shop-product-form'),state.shopEdit?'✎ Chỉnh sửa sản phẩm':'+ Thêm sản phẩm mới',!!state.shopEdit);
  fold(root.querySelector('form[data-form="shop-contact"]'),'Kênh liên hệ Admin');
  fold(root.querySelector('form[data-form="shop-showcase"]'),'Trang trưng bày TikTok Shop');
  fold(root.querySelector('.shop-guide-admin'),'Ảnh hướng dẫn mua hàng');
 }
 if(view==='admin-cards')fold(root.querySelector('.cards-admin-settings'),'Cấu hình dịch vụ đổi thẻ');
 // Decorate only existing Admin tables. Preserve every form, button and data attribute.
 root.querySelectorAll('.table-wrap table').forEach(table=>{
  const heads=Array.from(table.tHead?.rows[0]?.cells||[],cell=>cell.textContent.trim());
  if(!heads.length||table.querySelector('td[colspan],td[rowspan]'))return;
  table.classList.add('admin-responsive-table');
  for(const row of Array.from(table.tBodies).flatMap(body=>Array.from(body.rows))){
   Array.from(row.cells).forEach((cell,i)=>cell.dataset.adminLabel=heads[i]||'');
  }
 });
 // Add filters without recreating rows or losing typed form values.
 const configs={
  'admin-users':{selector:'.admin-users-panel tbody tr',labels:[['all','Tất cả'],['active','Hoạt động'],['suspended','Đã khóa']]},
  'admin-withdrawals':{selector:'.admin-withdrawals-panel tbody tr',labels:[['work','Cần xử lý'],['pending','Chờ duyệt'],['approved','Đã duyệt'],['paid','Đã thanh toán'],['rejected','Từ chối'],['invalid_account','Sai tài khoản'],['all','Tất cả']]},
  'admin-shop-orders':{selector:'.sorder-admin-card',labels:[['work','Cần xử lý'],['pending','Chờ xác minh'],['provisional','Chờ giải quyết'],['resolved','Đã giải quyết'],['rejected','Từ chối'],['all','Tất cả']]},
  'admin-cards':{selector:'.cards-admin-item',labels:[['work','Cần xử lý'],['pending','Chờ duyệt'],['approved','Chờ phát thẻ'],['delivered','Đã phát'],['rejected','Từ chối'],['all','Tất cả']]},
  'admin-tasks':{selector:'.admin-tasks-panel tbody tr',labels:[['all','Tất cả'],['active','Đang mở'],['suspended','Tạm ẩn']]}
 };
 const config=configs[view];if(!config)return;
 const rows=Array.from(root.querySelectorAll(config.selector));
 const container=rows[0]?.closest('.table-wrap,.sorder-admin-list,.cards-history')||null;
 if(!container)return;
 const statusOf=row=>row.dataset.adminStatus||'';
 const work=['pending','approved','provisional'];
 const matches=(row,value)=>value==='all'||(value==='work'?work.includes(statusOf(row)):statusOf(row)===value);
 const filters=document.createElement('section');
 filters.className='admin-local-filter';
 const selected=state.adminLocalFilters?.[view]||config.labels[0][0];
 filters.innerHTML=`<div class="admin-filter-tabs" role="group" aria-label="Lọc trạng thái">${config.labels.map(([value,label])=>`<button type="button" class="btn alt" data-admin-local-status="${value}" aria-pressed="${value===selected}">${esc(label)} <span>${rows.filter(row=>matches(row,value)).length}</span></button>`).join('')}</div><label class="admin-search-label">Tìm trong danh sách đã tải<input type="search" class="admin-local-search" placeholder="Nhập tên, email, mã hoặc nội dung..." autocomplete="off"></label><p class="small muted admin-local-count" role="status"></p>`;
 container.before(filters);
 let active=selected;
 function apply(){
  const needle=filters.querySelector('input').value.trim().toLocaleLowerCase('vi');
  let count=0;for(const row of rows){row.hidden=!(matches(row,active)&&row.textContent.toLocaleLowerCase('vi').includes(needle));if(!row.hidden)count++;}
  filters.querySelector('.admin-local-count').textContent=count+'/'+rows.length+' hồ sơ trong danh sách đã tải';
  filters.querySelectorAll('[data-admin-local-status]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.adminLocalStatus===active)));
 }
 filters.addEventListener('click',event=>{const button=event.target.closest('[data-admin-local-status]');if(!button)return;active=button.dataset.adminLocalStatus;state.adminLocalFilters??={};state.adminLocalFilters[view]=active;apply();});
 filters.addEventListener('input',event=>{if(event.target.matches('input'))apply();});
 apply();
}
async function adminOverview(){
 const d=await api('/api/admin/overview');
 const queues=[['admin-reviews','✓','Duyệt nhiệm vụ',d.pending_evidence,'amber'],['admin-withdrawals','⇢','Rút tiền',d.withdrawals_to_process??d.pending_withdrawals,'green'],['admin-shop-orders','▣','Đơn TikTok',d.shop_orders_to_process,'blue'],['admin-cards','◇','Đổi thẻ cào',d.cards_to_process,'purple']];
 const showCount=n=>n===null||n===undefined?'—':fmt(n);
 return `<section class="admin-hero"><div class="admin-hero-top"><span>TRẠM CÓ LÚA · ADMIN</span><button type="button" class="admin-hero-refresh" data-go="admin-overview" aria-label="Tải lại tổng quan">↻</button></div><div class="admin-hero-label">Tổng Lúa đã phát hành</div><strong class="admin-hero-value">${fmt(d.total_issued_lua)} <small>Lúa</small></strong><p>Ghi nhận Lúa phát hành, không phải tiền đã chuyển.</p><div class="admin-hero-stats"><button type="button" data-go="admin-users"><span>Thành viên</span><b>${fmt(d.members)}</b></button><button type="button" data-go="admin-tasks"><span>Nhiệm vụ đang mở</span><b>${fmt(d.tasks)}</b></button></div></section>
 <section class="admin-home-section"><h2>Trung tâm xử lý</h2><div class="admin-queue-grid">${queues.map(([go,icon,label,n,tone])=>`<button type="button" class="admin-queue-card tone-${tone}" data-action="admin-queue" data-view="${go}"><div class="admin-queue-top"><span class="admin-queue-icon" aria-hidden="true">${icon}</span><b>${showCount(n)}</b></div><strong>${label}</strong><small>${n===null||n===undefined?'Chưa tải được số lượng':'Cần xử lý'}</small></button>`).join('')}</div></section>
 <button class="admin-security-shortcut" type="button" data-go="admin-security"><span class="admin-shortcut-icon" aria-hidden="true">♙</span><span><strong>Bảo vệ hệ thống</strong><small>${fmt(d.risk_events_today)} sự kiện hôm nay · IP / VPN / thiết bị</small></span><b aria-hidden="true">›</b></button>
 <section class="admin-home-section"><h2>Quản lý nhanh</h2><div class="admin-shortcut-list">${[['admin-users','☻','Thành viên'],['admin-tasks','▤','Quản lý nhiệm vụ'],['admin-tasks','↗','Nguồn rút gọn','sources'],['admin-shop','▣','Quản lý mua sắm'],['admin-settings','⚙','Cài đặt hệ thống']].map(([go,icon,label,anchor])=>`<button type="button" ${anchor?'data-action="admin-open-sources"':`data-go="${go}"`}><span class="admin-shortcut-icon" aria-hidden="true">${icon}</span><strong>${label}</strong><b aria-hidden="true">›</b></button>`).join('')}</div></section>`;
}
async function shrinkAppLogo(file){
 if(!file || !file.type.startsWith('image/'))throw new Error('Vui lòng chọn ảnh logo.');
 if(file.size>12*1024*1024)throw new Error('Ảnh logo gốc tối đa 12 MB.');
 const image=await createImageBitmap(file);
 try{
  for(const size of [128,112,96,80,64]){
   const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Không thể xử lý ảnh.');
   const scale=Math.min(size/image.width,size/image.height);
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);
   ctx.drawImage(image,(size-image.width*scale)/2,(size-image.height*scale)/2,image.width*scale,image.height*scale);
   for(const quality of [0.72,0.55,0.38,0.24]){
    const logo=canvas.toDataURL('image/jpeg',quality);
    if(logo.length<=24000)return logo;
   }
  }
  throw new Error('Không thể nén ảnh logo. Hãy thử ảnh khác.');
 }finally{image.close();}
}
function sourceVerificationChoices(source,creation,current='manual'){
 const choices=[['manual','Admin đối soát']];
 if(creation==='api'&&source?.view_url&&source?.view_path){
  choices.push(['api_view','Tự động tra cứu view — Admin duyệt thưởng']);
  if(source.auto_reward_ready)choices.push(['api_auto','Tự động Check View và cộng Lúa (nguồn đã xác nhận)']);
 }
 // Preserve previously saved selections until Admin deliberately changes them.
 if(current!=='manual'&&!choices.some(([v])=>v===current)&&['api_view','api_auto'].includes(current))
  choices.push([current,'Cấu hình cũ — chưa đủ điều kiện, cần chọn lại hoặc lưu nháp']);
 return choices;
}
function sourceVerificationHint(source,creation){
 if(!source||creation!=='api')return 'Link thủ công: Admin đối soát và duyệt thưởng.';
 if(!source.create_ready)return 'Chưa đủ cấu hình tạo link hoặc Secret. Mở Quản lý nguồn rút gọn để kiểm tra trước khi bật công khai.';
 if(!source.view_url||!source.view_path)return 'Nguồn chưa có API View: chọn Admin đối soát. Link riêng và mã Alias vẫn được lưu.';
 if(!source.auto_reward_ready)return 'Có API View: có thể tự tra cứu, Admin duyệt. Tự động cộng Lúa chỉ bật sau khi xác nhận điều kiện tính tiền.';
 return 'Có API View và đã xác nhận nguồn. Chỉ tự cộng Lúa khi đủ điều kiện, đúng 1 View; các trường hợp khác chờ Admin.';
}
function taskForm(task={},sources=[]){
 const category=state.adminTaskFilter==='app'?'app':'link';
 const link=category==='link';
 const sourceId=sources.some(s=>s.id===task.link_source_id)?task.link_source_id:'';
 const source=sources.find(s=>s.id===sourceId),creation=sourceId&&task.link_source_creation==='api'?'api':'manual';
 const verification=sourceId&&['api_view','api_auto'].includes(task.link_source_verification)?task.link_source_verification:'manual';
 const capabilities=sources.map(({id,create_ready,view_url,view_path,auto_reward_ready})=>({id,create_ready,view_url:Boolean(view_url),view_path:Boolean(view_path),auto_reward_ready}));
 return `<form class="card" data-form="admin-task" id="task-form" data-source-capabilities="${esc(JSON.stringify(capabilities))}"><h3>${task.id?'Sửa':'Tạo'} nhiệm vụ ${link?'Link rút gọn':'App'}</h3>
 <input type="hidden" name="id" value="${esc(task.id||'')}">
 <input type="hidden" name="category" value="${category}">
 <input type="hidden" name="review_mode" value="manual"><input type="hidden" name="min_seconds" value="5">
 ${field('title',link?'Tên nhiệm vụ':'Tên ứng dụng',task.title||'', 'required minlength="3"')}
 <div class="field"><label for="description">Hướng dẫn</label><textarea id="description" name="description">${esc(task.description||'')}</textarea></div>
 ${link?`<div class="admin-link-task-hint" id="admin-link-task-hint">
 <h4>Nguồn rút gọn</h4>
 ${select('link_source_id','Nhà cung cấp',[['','Link thủ công (không cần nguồn)'],...sources.map(s=>[s.id,s.name])],sourceId)}
 <button type="button" class="btn alt sm" data-action="add-link-source">＋ Thêm nguồn rút gọn</button>
 <div id="task-source-api-options" ${sourceId?'':'hidden'}>
 ${select('link_source_creation','Cách tạo link',[['manual','Nhập link thủ công'],['api','Tự động cấp link riêng qua API']],sourceId&&task.link_source_creation==='api'?'api':'manual')}
 ${select('link_source_verification','Cách xác minh',sourceVerificationChoices(source,creation,verification),verification)}
 <p class="note" data-source-verification-hint>${esc(sourceVerificationHint(source,creation))}</p></div>
 <input type="hidden" name="bbmkts_creation" value="manual"><input type="hidden" name="bbmkts_verification" value="manual">

 ${field('url','URL link rút gọn (nếu nhập thủ công)',task.url||'', 'type="url" placeholder="https://..."')}
 ${field('link_24h_limit','Số lượt / tài khoản / ngày',task.link_24h_limit||1,'type="number" min="1" max="20" required')}
 ${select('repeat_policy','Lặp lại',[['once','Mỗi người một lần'],['daily','Mỗi ngày một lần']],task.repeat_policy||'daily')}
 <details><summary>Hướng dẫn link thủ công</summary><p>Tạo nhiệm vụ nháp, sao chép trang đích ở danh sách, rút gọn rồi dán URL và bật nhiệm vụ. Admin kiểm tra bằng chứng và đối soát nguồn thu trước khi duyệt.</p></details>
 </div>`:`
 ${field('url','Link tải ứng dụng',task.url||'', 'type="url" required placeholder="https://..."')}
 ${field('app_referral_code','Mã giới thiệu của bạn (chỉ dùng cho App)',task.app_referral_code||'', 'maxlength="80" placeholder="Nhập mã giới thiệu trong ứng dụng"')}
 <div class="field"><label for="app-logo-file">🖼️ Logo nhiệm vụ App (chọn từ iPhone)</label><input id="app-logo-file" type="file" accept="image/*"><p class="note">Logo được thu nhỏ trước khi lưu. Chọn ảnh mới để thay logo.</p><label><input type="checkbox" id="app-logo-remove"> Xóa logo hiện tại</label>${task.app_logo?`<img src="${esc(task.app_logo)}" alt="Logo hiện tại" style="display:block;width:64px;height:64px;object-fit:contain;border-radius:12px">`:''}</div>
 ${select('app_confirmation_mode','Cách thành viên gửi',[['simple','Chỉ bấm xác nhận'],['photo','Gửi ảnh bằng chứng']],task.app_confirmation_mode||(task.id?'photo':'simple'))}
 <input type="hidden" name="repeat_policy" value="once"><input type="hidden" name="link_24h_limit" value="1">
 <p class="note">Mỗi thành viên làm một lần, Admin duyệt thưởng. Không cần CAPTCHA.</p>`}
 ${field('reward','Thưởng (Lúa)',task.reward||100,'type="number" min="1" max="10000000" required')}
 ${select('is_active','Trạng thái',[['1','Bật công khai'],['0','Tắt / nháp']],Number(task.is_active||0).toString())}
 <div class="btn-row"><button class="btn" type="submit">${task.id?'Lưu chỉnh sửa':'Tạo nhiệm vụ'}</button>${task.id?`<button class="btn alt" type="button" data-action="reset-task">Tạo mới</button><button class="btn danger" type="button" data-action="delete-task" data-id="${esc(task.id)}" data-title="${esc(task.title)}">🗑 Xóa nhiệm vụ</button>`:''}</div></form>`;
}
function sourceSettingsForm(source={}){
 return `<details class="section" ${source.id?'':'id="new-link-source"'}><summary><strong>${esc(source.name||'+ Thêm nguồn mới')}</strong> ${source.id?(source.create_ready?' · Đã có cấu hình tạo link':' · Chưa đủ cấu hình') : ''}${source.id&&source.auto_reward_ready?' · Đã xác nhận tự động thưởng':''}</summary>
 <form data-form="link-source-save" class="section">
 <p class="note">1. Nhập tên miền và mẫu API GET/JSON theo tài liệu đối tác. 2. Lưu nguồn và thêm Secret trong Cloudflare nếu cần. 3. Tạo một link kiểm thử, rồi mới bật nhiệm vụ. Không có API View thì để trống cả hai ô View và chọn Admin đối soát.</p>
 ${field('id','Mã nguồn (ví dụ trafficvn)',source.id||'','required maxlength="32" '+(source.id?'readonly':''))}
 ${field('name','Tên nhà cung cấp',source.name||'','required maxlength="80"')}
 ${field('host','Tên miền API',source.host||'','required placeholder="example.com"')}
 ${field('short_host','Tên miền link rút gọn',source.short_host||'','placeholder="example.com"')}
 ${field('create_url','API tạo link GET JSON',source.create_url||'','placeholder="https://.../?api={token}&url={destination}"')}
 ${field('short_path','Trường JSON chứa link',source.short_path||'','placeholder="shortenedUrl hoặc data.short_url"')}
 ${field('alias_path','Trường JSON chứa alias (bỏ trống nếu lấy cuối URL)',source.alias_path||'','placeholder="data.alias"')}
 ${field('view_url','API kiểm tra lượt GET JSON',source.view_url||'','placeholder="https://.../api/view/{alias}"')}
 ${field('view_path','Trường JSON chứa tổng view',source.view_path||'','placeholder="views, data.views hoặc data.chart.*.views"')}
 <p class="note">Nếu API trả danh sách view theo ngày, dùng dạng data.chart.*.views để cộng các dòng trong kỳ API trả về. Dùng {destination}, {alias}, {token} theo tài liệu đối tác. Không dán token thật vào đây. Nếu cần token, tạo Secret ${esc(source.secret_name||'LINK_PROVIDER_TOKEN_MÃ_NGUỒN_VIẾT_HOA')} trong Cloudflare Worker. ${source.id?(source.token_configured?'Đã có Secret.':'Chưa có Secret (không cần nếu API công khai).'):''}</p>
 <button class="btn" type="submit">Lưu nguồn</button></form>
 ${source.id?`<form class="section card" data-form="link-source-quota"><input type="hidden" name="id" value="${esc(source.id)}">
 <h4>🛡️ Hạn mức riêng của nguồn</h4>
 <p class="note">Giới hạn số lần cấp phiên Link mới trong ngày Việt Nam (00:00 đặt lại), tính chung các nhiệm vụ gắn nguồn này. Tính cả phiên chưa hoàn thành hoặc cấp Link lỗi để bảo vệ nguồn. Phiên cũ đang làm vẫn theo quy tắc cũ. IP dùng chung có thể hết lượt chung. Phiên cũ chưa có mã nguồn lưu riêng được đối chiếu theo cấu hình nhiệm vụ hiện tại. 0 = không giới hạn riêng; các quy tắc chung vẫn áp dụng.</p>
 ${field('account','Lượt cấp / tài khoản / ngày',source.quota?.account??0,'type="number" min="0" max="1000" step="1" required')}
 ${field('ip','Lượt cấp / IP hoặc nhóm IPv6 / ngày',source.quota?.ip??0,'type="number" min="0" max="1000" step="1" required')}
 ${field('browser','Lượt cấp / mã trình duyệt / ngày',source.quota?.browser??0,'type="number" min="0" max="1000" step="1" required')}
 <button class="btn" type="submit">Lưu hạn mức nguồn</button></form>`:''}
 ${source.id?`<form class="section" data-form="link-source-test"><input type="hidden" name="id" value="${esc(source.id)}">
 ${select('kind','Kiểm tra API',[...(source.view_url&&source.view_path?[['view','Kiểm tra view']]:[]),['create','Tạo link kiểm thử (không thưởng)']],source.view_url&&source.view_path?'view':'create')}
 <p class="note">Tạo link kiểm thử sẽ tạo một link thật bên đối tác, kể cả khi phản hồi không hợp lệ. Chỉ bấm một lần; nếu lỗi, đọc thông báo trước khi thử lại. Không phát thưởng.</p>
 ${field('alias','Alias để kiểm tra view','','placeholder="Alias thật đã có"')}
 <button class="btn alt" type="submit">Kiểm tra kết nối</button><pre data-source-result role="status" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></form><button type="button" class="btn danger sm" data-action="delete-link-source" data-id="${esc(source.id)}" data-name="${esc(source.name)}">Xóa nguồn</button>`:''}
 </details>`;
}
async function adminTasks(){
 const [d,s]=await Promise.all([api('/api/admin/tasks'),api('/api/admin/link-sources')]);state.adminTasks=d.tasks;
 const sources=s.sources||[];
 const category=state.adminTaskFilter;
 const selected=d.tasks.filter(t=>t.category===category);
 const retired=d.tasks.filter(t=>!['app','link'].includes(t.category));
 const edit=state.taskEdit?selected.find(x=>x.id===state.taskEdit):null;
 const rows=selected.map(t=>{
  const max=Math.max(1,Math.min(20,Number(t.link_24h_limit)||1));
  const quota=t.category==='link'?(max>1||t.repeat_policy==='daily'?max+' lượt/ngày':'1 lượt/tài khoản'):(t.repeat_policy==='daily'?'1 lượt/ngày':'1 lượt/tài khoản');
  return `<tr data-admin-status="${t.is_active?'active':'suspended'}">
   <td><strong>${esc(t.title)}</strong><div class="small muted">${esc(t.category)} • ${esc(t.repeat_policy)}</div><div class="btn-row"><button class="btn alt sm" data-action="edit-task" data-id="${esc(t.id)}">Sửa</button><button class="btn danger sm" data-action="delete-task" data-id="${esc(t.id)}" data-title="${esc(t.title)}">Xóa</button></div>
    ${t.category==='link'?`<div class="small muted">Trang đích cuối (dán vào bên rút gọn link):</div><button type="button" class="btn alt sm" data-action="copy" data-value="${esc(location.origin+'/verify-link?link_return='+encodeURIComponent(t.id))}">📋 Sao chép trang đích</button>`:''}
   </td>
   <td class="num">${fmt(t.reward)} Lúa</td>
   <td><strong>${esc(quota)}</strong><div class="small muted">Hôm nay: ${fmt(t.submitted_today)} đã gửi • ${fmt(t.pending_today)} chờ duyệt</div></td>
   <td>${t.review_mode==='manual'?'Admin xét duyệt':'Tự động'}
    ${t.category==='link'&&t.link_source_id?`<p class="small">${esc(sources.find(s=>s.id===t.link_source_id)?.name||t.link_source_id)} · ${t.link_source_creation==='api'?'Link riêng qua API':'Link thủ công'}</p>`:''}
    ${t.category==='link'&&t.review_mode!=='manual'?'<p class="small red">⚠ Link tự quay về cần duyệt tay để không cộng Lúa chỉ bằng CAPTCHA.</p>':''}</td>
   <td>${t.is_active?chip('active'):chip('suspended')}</td>
   <td><span class="small muted">Sửa / Xóa ở tên nhiệm vụ</span></td>
  </tr>`;
 });
 return `${heading('Quản lý nhiệm vụ','Cấu hình phần thưởng, số lượt và trạng thái hiển thị đúng trên thẻ nhiệm vụ thành viên.')}
 <div class="task-filter-row">${[['link','🔗 Link rút gọn'],['app','📱 App']].map(([value,label])=>`<button type="button" class="btn ${category===value?'':'alt'}" data-action="admin-task-filter" data-filter="${value}">${label}</button>`).join('')}</div>
 <div class="btn-row section"><button type="button" class="btn alt" data-action="admin-open-reviews">Duyệt nhiệm vụ ${category==='link'?'Link':'App'}</button></div>
 <details class="card admin-fold" ${edit?'open':''}><summary>${edit?'✎ Chỉnh sửa nhiệm vụ':'+ Tạo nhiệm vụ mới'}</summary>${taskForm(edit||{},sources)}</details>
 ${category==='link'?` <details class="card section admin-fold" id="link-source-manager"><summary>🔗 Quản lý nguồn rút gọn (${sources.length})</summary><p class="note">Thêm hoặc sửa nguồn GET/JSON theo tài liệu nhà cung cấp. Không cần sửa mã nguồn cho API tương thích. Nguồn khác định dạng hoặc không cung cấp API có thể dùng link thủ công.</p>
 ${sources.length?sources.map(sourceSettingsForm).join(''):'<p class="note">Chưa thêm nguồn nào. Link thủ công vẫn hoạt động bình thường.</p>'}${sourceSettingsForm()}

 </details>`:''}
 <section class="section admin-tasks-panel"><h3>Nhiệm vụ đã tạo (${selected.length})</h3><p class="note">Admin kiểm tra bằng chứng theo từng loại nhiệm vụ. Số lượt hôm nay tính theo giờ Việt Nam.</p>${table(['Tên / trang đích','Lúa','Hạn mức / hôm nay','Duyệt','Trạng thái','Thao tác'],rows)}</section>
 ${retired.length?`<details class="card section"><summary>Lưu trữ nhiệm vụ cũ (${retired.length})</summary><p class="note">Không hiển thị cho thành viên. Giữ lịch sử và dữ liệu cũ.</p>${retired.map(t=>`<p>${esc(t.title)} · ${esc(t.category)}</p>`).join('')}</details>`:''}`;
}
async function adminUsers(){
 const d=await api('/api/admin/users');
 return `${heading('Quản lý thành viên','Tra cứu tài khoản, số Lúa và tình trạng sử dụng.')}<section class="card admin-users-panel">${table(['Thành viên','Tài khoản','Số dư','IP đăng ký','Trạng thái','Thao tác'],d.users.map(u=>`<tr data-admin-status="${esc(u.status)}">
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
function renderReviewCheckView(c){
 // Read only the server-recorded provider audit, never infer alias from member input.
 const evidence=String(c.evidence||'');
 if(c.category!=='link'||!evidence.startsWith('[LINK_RETURN_V1]'))return '';
 const match=evidence.match(/; Nguồn: ([a-z0-9_]{1,32}); Alias: ([A-Za-z0-9_-]{1,128}); View API: ([0-9]+|Chưa xác nhận) \(chờ đối soát doanh thu\)/);
 if(!match)return '<p class="small muted">Mã Check View: Chưa ghi nhận</p>';
 const [,source,alias,views]=match;
 return `<div class="callout section" style="overflow-wrap:anywhere"><strong>Mã Check View</strong><div class="small">Nguồn: ${esc(source.toUpperCase())}</div><code>${esc(alias)}</code><div class="btn-row"><button type="button" class="btn alt sm" data-action="copy-check-view" data-value="${esc(alias)}">📋 Sao chép mã</button></div><div class="small">View API lúc xác minh: ${esc(views)}</div></div>`;
}
async function adminReviews(){
 const category=state.adminReviewFilter;
 const status=state.adminReviewStatus;
 const retryOnly=category==='app'&&status==='rejected'&&state.adminReviewRetryOnly;
 const d=await api('/api/admin/reviews?category='+encodeURIComponent(category)+'&status='+encodeURIComponent(status)+'&page='+state.adminReviewPage+(retryOnly?'&retry_only=1':''));
 const scopeLabel=({link:'Link',app:'App',archive:'Lưu trữ'})[category];
 const filtered=d.reviews.filter(c=>c.status===status&&(category==='archive'?!['link','app'].includes(c.category):c.category===category));
 const page=Number(d.page)||1,pageSize=Number(d.page_size)||150,total=Number(d.total)||0,pages=Math.max(1,Math.ceil(total/pageSize));
 const statusLabels={pending:'Chờ duyệt',approved:'Đã duyệt',rejected:'Từ chối'};
 const pendingReturns=d.reviews.filter(c=>c.status==='pending'&&String(c.evidence||'').startsWith('[LINK_RETURN_V1]')).length;
 const fastReturns=d.reviews.filter(c=>c.status==='pending'&&String(c.evidence||'').includes('[LINK_RETURN_FAST_V1]')).length;
 return `${heading('Duyệt bằng chứng','Chọn loại nhiệm vụ cần xử lý.')}
 <div class="task-filter-row">${[['link','🔗 Link'],['app','📱 App'],['archive','Lưu trữ']].map(([value,label])=>`<button class="btn ${category===value?'':'alt'}" data-action="admin-review-filter" data-filter="${value}">${label}</button>`).join('')}</div>
 <div class="task-filter-row section" role="group" aria-label="Trạng thái duyệt nhiệm vụ">${Object.entries(statusLabels).map(([value,label])=>`<button type="button" class="btn ${status===value?'':'alt'}" aria-pressed="${status===value}" data-action="admin-review-status" data-status="${value}">${label} (${fmt(d.status_counts?.[value]||0)})</button>`).join('')}</div>
 ${category==='link'&&status==='pending'?`
 <div class="callout section">🔗 <strong>${fmt(pendingReturns)} lượt quay về đang chờ đối soát</strong> trong danh sách đang tải. <strong>${fmt(fastReturns)} lượt bị đánh dấu quay về quá nhanh.</strong> Đây là tín hiệu cần kiểm tra, không phải bằng chứng gian lận. Khách chưa được cộng Lúa; chỉ duyệt khi có đối soát nguồn thu hợp lệ.</div>
 <div class="callout section"><strong>Đối chiếu với Lentopone / nhà cung cấp khác:</strong> so cùng nhiệm vụ, IP và mốc giờ Việt Nam; tham khảo loại máy và trình duyệt. Có thể sao chép từng IP. Loại thiết bị lấy từ User-Agent (có thể giả), còn IP chung mạng không chứng minh cùng một người. <strong>Không tự duyệt</strong> chỉ dựa trên các dấu hiệu này hoặc việc quay về trang đích.</div>
 <div class="callout section"><strong>Link tự quay về:</strong> “Đã truy cập trang đích” chỉ là tín hiệu kỹ thuật. Không đọc được mã đã nhập trên dịch vụ rút gọn và không có xác nhận doanh thu. Phải kiểm tra nguồn tiền hợp lệ trước khi duyệt Lúa.</div>`:''}${status==='pending'?'<div class="callout section">🔒 Hồ sơ chờ duyệt được bảo vệ, không thể xóa.</div>':retryOnly?'<div class="callout section">Chỉ hiển thị bản ghi tối thiểu để cho phép làm lại App. Ảnh và nội dung bằng chứng đã bị xóa vĩnh viễn.</div>':`<div class="callout section"><strong>Dọn hồ sơ ${statusLabels[status]} · ${scopeLabel}</strong><p class="small">Xóa vĩnh viễn ảnh và nội dung bằng chứng, bỏ hồ sơ khỏi danh sách này. Giữ dữ liệu tối thiểu phục vụ số Lúa, lịch sử và chống trùng lượt. Không xóa mục khác.</p>
 ${total>0?`<button type="button" class="btn danger sm proof-delete-all" data-action="erase-all-processed-evidence" data-status="${status}" data-category="${category}" data-count="${total}">🗑 Xóa tất cả ${statusLabels[status]} (${fmt(total)})</button>`:'<p class="note">Không có hồ sơ cần dọn trong mục này.</p>'}</div>`}
 ${category==='app'&&status==='rejected'?`<div class="section"><button class="btn alt sm" data-action="admin-review-retry-only">${retryOnly?'‹ Trở lại danh sách Từ chối':'Quản lý lượt App đã khóa sau khi dọn'}</button></div>`:''}
 <section class="card section admin-reviews-panel"><div class="admin-review-search-wrap"><label for="admin-review-search">🔎 Tìm nhanh trong danh sách đã tải</label><input id="admin-review-search" type="search" placeholder="Tên, email, nhiệm vụ, IP, loại thiết bị…" autocomplete="off"><p class="small muted">${statusLabels[status]}: ${fmt(total)} hồ sơ • Trang ${fmt(page)}/${fmt(pages)} • Tìm trong trang hiện tại.</p></div>
 ${filtered.length?table(['Thành viên / Nhiệm vụ','Bằng chứng','Thưởng','Đối chiếu IP / thiết bị','Duyệt'],filtered.map(c=>`<tr><td><strong>${esc(c.name)}</strong><div class="small">${esc(c.email)}</div><div class="muted small">${esc(c.title)} • ${dt(c.created_at)}</div></td>
 <td style="max-width:270px;white-space:pre-wrap">${c.evidence_removed?'<span class="muted">🗑 Bằng chứng đã được xóa</span>':c.has_photo?`<div class="app-proof-cell"><strong>📷 Đã gửi ảnh</strong><p class="small muted">${esc(c.evidence||'Không ghi chú')}</p><button class="btn alt sm" data-action="view-photo" data-id="${esc(c.id)}" data-note="${esc(c.evidence||'')}">Xem ảnh bằng chứng</button></div>`:String(c.evidence||'').startsWith('[LINK_RETURN_V1]')?`<strong class="green">🔗 Đã quay về và giải phép tính</strong>${String(c.evidence).includes('[LINK_RETURN_FAST_V1]')?'<p class="admin-link-risk-warning">⚠️ Cảnh báo: quay về quá nhanh (dưới 20 giây). Có thể do mở thẳng link đích. Cần đối soát độc lập trước khi duyệt.</p>':''}<div class="small muted">Chưa có xác nhận doanh thu từ đối tác.</div>${renderReviewCheckView(c)}<details><summary class="small">Xem ghi nhận phiên</summary><div class="small">${esc(c.evidence)}</div></details>`:esc(c.evidence||'(không có)')}</td><td><strong>${fmt(c.reward)} Lúa</strong></td><td>${category==='link'?`<div class="admin-task-audit">
  <div><strong>📱 Mở:</strong> ${esc(c.started_device)}</div>
  <div><strong>📱 Gửi:</strong> ${esc(c.submitted_device)}</div>
  <div><strong>🕒 Bắt đầu:</strong> ${dt(c.started_at)}</div>
  <div><strong>🕒 Gửi xác minh:</strong> ${dt(c.submitted_at)}</div>
  <div class="admin-task-ip"><strong>IP bắt đầu:</strong> <code>${esc(c.started_ip||'Chưa ghi nhận')}</code> ${c.started_ip?`<button type="button" class="btn alt sm" data-action="copy-ip" data-value="${esc(c.started_ip)}" aria-label="Sao chép IP lúc bắt đầu">📋</button>`:''}</div>
  <div class="admin-task-ip"><strong>IP gửi:</strong> <code>${esc(c.submitted_ip||'Chưa ghi nhận')}</code> ${c.submitted_ip?`<button type="button" class="btn alt sm" data-action="copy-ip" data-value="${esc(c.submitted_ip)}" aria-label="Sao chép IP lúc gửi">📋</button>`:''}</div>
  <details class="admin-task-audit-detail"><summary>Chi tiết phiên / mã trình duyệt</summary>
    <div class="small"><strong>Mã phiên:</strong> <code>${esc(c.attempt_id||'Chưa ghi nhận')}</code></div>
    <div class="small"><strong>Mã lúc mở:</strong> <code>${esc(c.started_device_code||'Chưa ghi nhận')}</code></div>
    <div class="small"><strong>Mã lúc gửi:</strong> <code>${esc(c.device_code||'Chưa ghi nhận')}</code></div>
    <p class="small muted">Mã trình duyệt không phải IMEI hay bằng chứng thiết bị vật lý.</p>
  </details>
 </div>`:dt(c.created_at)}</td>
 <td>${chip(c.status)}${c.status==='pending'?`<div class="btn-row section"><button class="btn sm" data-action="review" data-colorsort="${c.evidence==='COLOR_SORT_NO_PHOTO_V1'?'1':'0'}" data-id="${esc(c.id)}" data-status="approved" data-return-signal="${String(c.evidence||'').startsWith('[LINK_RETURN_V1]')?'1':'0'}" data-fast-return="${String(c.evidence||'').includes('[LINK_RETURN_FAST_V1]')?'1':'0'}">${String(c.evidence||'').startsWith('[LINK_RETURN_V1]')?'Duyệt sau đối soát':'Duyệt'}</button><button class="btn danger sm" data-action="review" data-id="${esc(c.id)}" data-status="rejected" data-return-signal="${String(c.evidence||'').startsWith('[LINK_RETURN_V1]')?'1':'0'}" data-app="${c.category==='app'?'1':'0'}">${c.category==='app'?'Từ chối · Khóa lượt':'Từ chối'}</button>${c.category==='app'?`<button class="btn alt sm" data-action="review" data-id="${esc(c.id)}" data-status="rejected" data-app="1" data-retry="1">Từ chối · Cho làm lại</button>`:''}</div>`:`<div class="btn-row section">${c.status==='rejected'&&c.category==='app'&&!String(c.period_key||'').startsWith('app_retry_rejected:')?`<button class="btn alt sm" data-action="allow-app-retry" data-id="${esc(c.id)}">↻ Cho làm lại</button>`:''}${!retryOnly?`<button class="btn danger sm" data-action="erase-review-record" data-id="${esc(c.id)}" data-status="${status}" data-category="${category}">🗑 Xóa hồ sơ</button>`:''}</div>`}</td></tr>`)):empty('Không có nhiệm vụ '+statusLabels[status].toLowerCase(),'Chọn trạng thái khác hoặc tải lại danh sách.')}
 <div class="btn-row section"><button type="button" class="btn alt" data-action="admin-review-page" data-page="${page-1}" ${page<=1?'disabled':''}>‹ Trang trước</button><button type="button" class="btn alt" data-action="admin-review-page" data-page="${page+1}" ${page>=pages?'disabled':''}>Trang sau ›</button><button type="button" class="btn alt" data-action="admin-review-page" data-page="${page}">↻ Tải lại</button></div></section>`;
}
async function adminWithdrawals(){
 const [d,riskData]=await Promise.all([api('/api/admin/withdrawals'),api('/api/admin/fraud-scores')]);
 const risks=new Map((riskData.profiles||[]).map(x=>[x.user_id,x]));
 return `${heading('Yêu cầu rút tiền','Bước 1: Duyệt yêu cầu. Bước 2: Chuyển tiền thật. Bước 3: Đánh dấu đã thanh toán.')}
 <div class="callout">Website chỉ ghi nhận yêu cầu và trạng thái. Bạn chuyển tiền theo thông tin nhận của từng yêu cầu, đối chiếu giao dịch thực tế rồi mới bấm “Đã thanh toán”.</div>
 <section class="card section admin-withdrawals-panel">${table(['Thành viên','Số tiền','Kênh nhận','Trạng thái','Thao tác'],d.withdrawals.map(w=>`<tr data-admin-status="${esc(w.status)}">
 <td>${esc(w.name)}<div class="small muted">${esc(w.email)}</div><div class="small muted">${dt(w.created_at)}</div>${risks.get(w.user_id)?.level==='serious'?`<div class="small red">⚠ Cần đối chiếu trước khi thanh toán • ${fmt(risks.get(w.user_id).score)}/100</div>`:''}</td>
 <td class="num">${fmt(w.amount)} Lúa<div class="small muted">Phí: ${fmt(w.fee_lua)} Lúa</div><div class="small muted">Tổng giữ: ${fmt(Number(w.amount)+Number(w.fee_lua||0))} Lúa</div><div class="green">${fmt(w.vnd_amount)} ₫</div></td>
 <td><strong>${esc(w.payment_method==='zalopay'?'Ví ZaloPay':w.bank_name)}</strong><br><code>${esc(w.bank_account)}</code><div class="small">${esc(w.bank_owner)}</div><div class="small green">Mã lệnh: <strong>${esc(withdrawalCode(w.id))}</strong></div></td>
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

// Anti-Fraud 3.0: coarse signals. Only Link preflight sends three flags, never raw renderer or a fingerprint.
function classifyBrowserSignals(signals={}){
 const automation=signals.automation===true?true:signals.automation===false?false:null;
 const emulator=signals.emulator===true?true:signals.emulator===false?false:null;
 const virtualGraphics=signals.virtualGraphics===true?true:signals.virtualGraphics===false?false:null;
 const reasons=[];
 if(automation===true)reasons.push('Trình duyệt báo đang được điều khiển tự động');
 if(emulator===true)reasons.push('Chuỗi nhận diện trình duyệt có dấu hiệu môi trường giả lập');
 if(virtualGraphics===true)reasons.push('Đồ họa ảo hoặc kết xuất phần mềm — có thể xuất hiện trên máy thật');
 const status=automation===true||emulator===true?'review':virtualGraphics===true?'weak':([automation,emulator,virtualGraphics].some(v=>v===null)?'unknown':'no_signal');
 return {status,reasons,automation,emulator,virtualGraphics};
}
function inspectBrowserSignals(){
 const signals={automation:null,emulator:null,virtualGraphics:null};
 try{if(typeof navigator.webdriver==='boolean')signals.automation=navigator.webdriver;}catch{}
 try{
  const ua=navigator.userAgent;
  if(typeof ua==='string'&&ua.trim())signals.emulator=/\b(?:bluestacks|noxplayer|ldplayer|mumuplayer|genymotion|android sdk built for x86|sdk_gphone|goldfish|ranchu)\b/i.test(ua);
 }catch{}
 // Read only a coarse flag. Never save or transmit raw GPU/UA; no fingerprint.
 let gl;
 try{
  const canvas=document.createElement('canvas');
  gl=canvas.getContext('webgl');
  const ext=gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null;
  if(typeof renderer==='string'&&renderer.trim())signals.virtualGraphics=/swiftshader|llvmpipe|softpipe|virtualbox|vmware|virgl|gfxstream/i.test(renderer);
 }catch{}finally{try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}}
 return classifyBrowserSignals(signals);
}
function browserDiagnosticMarkup(result){
 const label={review:'Có dấu hiệu cần đối chiếu',weak:'Tín hiệu yếu — không kết luận giả lập',unknown:'Chưa đủ dữ liệu',no_signal:'Chưa phát hiện dấu hiệu'}[result.status];
 const flag=v=>v===true?'Có dấu hiệu':v===false?'Chưa phát hiện':'Không có dữ liệu';
 return '<div class="fraud-alert-card"><strong>'+esc(label)+'</strong><p>Điều khiển tự động: '+esc(flag(result.automation))+'</p><p>Chuỗi nhận diện giả lập: '+esc(flag(result.emulator))+'</p><p>Đồ họa ảo/phần mềm: '+esc(flag(result.virtualGraphics))+'</p>'+result.reasons.map(r=>'<p class="small">'+esc(r)+'</p>').join('')+'<p class="note">Không xác minh được phần cứng thật; không tự chặn, chấm điểm hay khóa tài khoản.</p></div>';
}
function browserDiagnosticFixtures(){
 return [
  ['Mẫu không có tín hiệu', {automation:false,emulator:false,virtualGraphics:false},'no_signal'],
  ['Mẫu điều khiển tự động', {automation:true,emulator:false,virtualGraphics:false},'review'],
  ['Mẫu chuỗi nhận diện giả lập', {automation:false,emulator:true,virtualGraphics:null},'review'],
  ['Mẫu máy thật dùng đồ họa phần mềm', {automation:false,emulator:false,virtualGraphics:true},'weak'],
  ['Mẫu trình duyệt hạn chế dữ liệu', {automation:false,emulator:false,virtualGraphics:null},'unknown'],
  ['Mẫu thiếu toàn bộ dữ liệu', {},'unknown'],
  ['Mẫu dữ liệu không hợp lệ', {automation:'true',emulator:1,virtualGraphics:'false'},'unknown']
 ];
}
async function adminSecurity(){
 const [d,anti]=await Promise.all([api('/api/admin/risk-events'),api('/api/admin/fraud-scores')]);
 const proxy=d.proxy_guard||{},proxyCounts=proxy.counts||[],proxyEvents=proxy.events||[];
 const live=d.link_observations||null,liveEvents=live?.events||[];
 const observationLabels={automation_reported:'Trình duyệt tự báo điều khiển tự động',emulator_reported:'Trình duyệt tự báo dấu hiệu giả lập',graphics_reported:'Đồ họa ảo/phần mềm (tín hiệu yếu)',emulator_ua:'User-Agent có dấu hiệu giả lập (có thể bị sửa)',hosting:'IP thuộc Hosting/VPS (không chứng minh giả lập)'};
 const describeObservation=detail=>String(detail||'').split(':')[0].split(',').map(k=>observationLabels[k]||'Tín hiệu chưa xác định').join(' · ');
 const proxyN=(reason)=>proxyCounts.filter(x=>x.event_type==='link_proxy_blocked'&&x.reason===reason).reduce((sum,x)=>sum+Number(x.n||0),0);
 const unavailableN=proxyCounts.filter(x=>x.event_type==='link_proxy_unavailable').reduce((sum,x)=>sum+Number(x.n||0),0);
 const proxyReason={vpn:'VPN',proxy:'Proxy',tor:'Tor',missing_key:'Thiếu API key',missing_ip:'Không xác định IP',service_error:'Dịch vụ trả lỗi',network_error:'Lỗi kết nối máy chủ',timeout:'API quá thời hạn',auth_error:'API từ chối xác thực',rate_limit:'Vượt hạn mức API',unexpected_redirect:'API chuyển hướng bất thường',invalid_response:'Phản hồi API không hợp lệ',busy:'Dịch vụ đang bận'};
 const members=(anti.profiles||[]);
 const matching=members.filter(p=>
  (state.fraudFilter==='all'||state.fraudFilter===p.level)&&
  (p.name+' '+p.email).toLowerCase().includes(state.fraudSearch.trim().toLowerCase())
 );
 const groups=(title,summary,content)=>`<details class="card section fraud-group"><summary><span><strong>${title}</strong><small>${summary}</small></span><span aria-hidden="true" class="fraud-chevron">⌄</span></summary><div class="fraud-group-body">${content}</div></details>`;
 const eventLabels={captcha_wrong:'Sai phép tính',login_failed:'Đăng nhập thất bại',device_seen:'Ghi nhận trình duyệt',browser_ipv4_report:'Báo cáo IPv4',task_quota_denied:'Chặn giới hạn nhiệm vụ App',link_ip_quota_denied:'Chặn Link theo IP',link_browser_quota_denied:'Chặn Link theo trình duyệt',link_browser_missing:'Chưa nhận diện trình duyệt',link_return_too_fast:'Quay về Link quá nhanh',link_return_network_changed:'Thay đổi mạng khi quay về Link',link_source_create_failed:'Lỗi cấp link từ nguồn',link_preflight_observation:'Dấu hiệu tham khảo trước cấp Link',link_source_quota_denied:'Chặn theo hạn mức riêng nguồn Link',link_proxy_blocked:'Chặn VPN / Proxy / Tor trước cấp Link',link_proxy_unavailable:'Tạm dừng cấp Link do chưa kiểm tra được IP',signup_completed:'Đăng ký thành công',signup_device_limit:'Chặn đăng ký theo trình duyệt',signup_rate_limited:'Giới hạn tốc độ đăng ký',too_many_task_starts:'Bắt đầu nhiệm vụ quá nhiều',fraud_payout_override:'Admin xác minh rủi ro thanh toán',link_fast_return_approved:'Admin đối chiếu lượt quay về nhanh',task_device_start:'Bắt đầu nhiệm vụ',task_device_submit:'Gửi nhiệm vụ',admin_settings:'Admin lưu cài đặt',admin_user_status:'Admin đổi trạng thái tài khoản',admin_withdrawal_action:'Admin xử lý rút tiền'};
 return `${heading('Chống gian lận','Theo dõi rủi ro, kiểm tra bằng chứng và bảo vệ thành viên.')}
 <div class="fraud-kpis">${[['all','Tài khoản',anti.summary?.checked_accounts],['serious','Nghiêm trọng',anti.summary?.serious],['review','Cần kiểm tra',anti.summary?.review],['low','Mức thấp',anti.summary?.low]].map(([v,label,n])=>`<button type="button" class="fraud-kpi fraud-kpi-${v}" aria-pressed="${state.fraudFilter===v}" data-action="fraud-filter" data-level="${v}"><strong>${fmt(n||0)}</strong><span>${label}</span></button>`).join('')}</div>
 <div class="fraud-today"><strong>⚠ Link hôm nay: ${fmt(d.link_alert_count||0)} cảnh báo</strong><span>${fmt(d.link_alert_accounts||0)} tài khoản • Đặt lại 00:00</span><button type="button" class="btn alt sm" data-action="fraud-open-link-alerts">Xem cảnh báo Link</button></div>
 <section class="card section"><h3>🛡️ Chống VPN / Proxy / Tor</h3>
 <p><strong>${proxy.enabled?(proxy.key_configured?'Đã bật — kiểm tra trước khi cấp Link':'Đã bật nhưng thiếu API key — tạm dừng cấp Link mới'):(proxy.key_configured?'Chưa bật — đã có API key':'Chưa cấu hình API key — chưa bảo vệ bằng ipapi.is')}</strong></p>
 <div class="btn-row"><button class="btn alt" type="button" data-action="fraud-proxy-test">🔎 Kiểm tra kết nối API</button></div>
 <p class="small muted">Kiểm tra IP kết nối Admin bằng API thật, không sử dụng kết quả lưu tạm. Mỗi lần có thể tốn một lượt API; không tạo nhiệm vụ hay thay đổi Lúa.</p>
 <div id="proxy-test-result" role="status" aria-live="polite"></div>
 <div class="callout"><strong>Anti-Fraud 3.0 · Kiểm tra IP VPS / Hosting</strong><p class="note">Khi kiểm tra VPN/Proxy/Tor đang bật, hệ thống đồng thời ghi nhận dấu hiệu Hosting trước cấp Link. Chưa tự động chặn hoặc chấm điểm theo VPS; IP hosting không chứng minh thiết bị giả lập.</p><button class="btn alt" type="button" data-action="fraud-hosting-demo">Thử bằng dữ liệu mô phỏng</button><div id="hosting-demo-result" role="status" aria-live="polite"></div></div>
 <div class="fraud-member-stats"><div><strong>${fmt(proxyN('vpn'))}</strong><span>VPN bị chặn</span></div><div><strong>${fmt(proxyN('proxy'))}</strong><span>Proxy bị chặn</span></div><div><strong>${fmt(proxyN('tor'))}</strong><span>Tor bị chặn</span></div><div><strong>${fmt(unavailableN)}</strong><span>Không kiểm tra được</span></div></div>
 <p class="note">Số yêu cầu hôm nay, không phải số người gian lận. Khi bật, không đạt kiểm tra hoặc API lỗi đều không cấp Link mới. Không tự khóa tài khoản.</p>
 ${proxyEvents.length?`<details class="fraud-alert-technical"><summary>Xem nhật ký kiểm tra hôm nay (tối đa 100)</summary><div class="fraud-alert-list">${proxyEvents.map(r=>`<article class="fraud-alert-card"><div class="fraud-alert-head"><strong>${esc(r.name||r.email||'Thành viên')}</strong><small>${dt(r.created_at)}</small></div><div class="small muted">${esc(r.email||'')}</div><div class="fraud-alert-stage action">${r.event_type==='link_proxy_blocked'?'Bị chặn trước khi cấp Link':'Tạm dừng vì không kiểm tra được'}</div><p class="fraud-alert-reason">${esc(proxyReason[String(r.detail||'').split(':')[0]]||'Chưa rõ')} · ${esc(r.task_title||'Link')}</p><details class="fraud-alert-technical"><summary>IP kết nối</summary><div class="fraud-alert-ip">${adminIP(r.ip)}</div></details><button class="btn alt sm" type="button" data-action="view-fraud-account" data-id="${esc(r.user_id)}">Xem tài khoản</button></article>`).join('')}</div></details>`:''}
 </section>
 <section class="card section"><h3>🛡️ Anti-Fraud 3.0 · Nghi vấn giả lập / tự động hóa</h3>
 <p class="note">Giám sát thực tế trước cấp Link: trình duyệt thành viên gửi tối đa ba cờ tín hiệu; máy chủ đối chiếu User-Agent và kết quả Hosting nếu có. Không gửi chuỗi đồ họa thô, không tự khóa tài khoản hoặc thay đổi quyết định cấp Link. Hai nút kiểm thử dưới đây chỉ chạy trên máy Admin.</p>
 <div class="btn-row"><button class="btn alt" type="button" data-action="fraud-browser-test">Kiểm tra trình duyệt hiện tại</button><button class="btn alt" type="button" data-action="fraud-browser-demo">Chạy kiểm thử mô phỏng</button></div>
 <div id="browser-diagnostic-result" role="status" aria-live="polite"></div>
 <div class="separator"></div><h4>Nhật ký giám sát thực tế hôm nay</h4>
 ${live? `<div class="fraud-member-stats"><div><strong>${fmt(live.count||0)}</strong><span>Ghi nhận cần đối chiếu</span></div><div><strong>${fmt(live.accounts||0)}</strong><span>Tài khoản có ghi nhận</span></div></div>
 <p class="note">Chỉ đếm dấu hiệu đã lưu, gộp các bản ghi trùng trong ngày Việt Nam. Không có ghi nhận không chứng minh an toàn; dữ liệu trình duyệt có thể bị sửa hoặc thiếu.</p>
 ${liveEvents.length?'<div class="fraud-alert-list">'+liveEvents.map(r=>`<article class="fraud-alert-card"><div class="fraud-alert-head"><strong>${esc(r.name||r.email||'Thành viên')}</strong><small>${dt(r.created_at)}</small></div><div class="small muted">${esc(r.email||'')}</div><p><strong>${esc(r.task_title||'Nhiệm vụ Link')}</strong></p><p>${esc(describeObservation(r.detail))}</p><details class="fraud-alert-technical"><summary>IP và mã trình duyệt</summary><div class="fraud-alert-ip">${adminIP(r.ip)}</div><div class="small">${esc(r.device_code||'—')}</div></details><button class="btn alt sm" type="button" data-action="view-fraud-account" data-id="${esc(r.user_id)}">Xem tài khoản</button></article>`).join('')+'</div>':'<p class="small muted">Chưa ghi nhận dấu hiệu cần đối chiếu hôm nay.</p>'}`:'<p class="note">Máy chủ chưa trả dữ liệu giám sát; không thể xác nhận trạng thái.</p>'}
 </section>
 <section class="card section"><h3>📱 Anti-Fraud 3.0 · Nhận diện trình duyệt nâng cao</h3>
 <p class="note">Đối chiếu các phiên Link đã ghi nhận trong 24 giờ gần nhất. Không phải mã phần cứng; đổi trình duyệt hoặc thiết bị thật cũng có thể tạo mã mới. Chỉ cảnh báo để Admin kiểm tra, không tự chặn hay chấm điểm.</p>
 ${d.browser_history?`<div class="fraud-member-stats"><div><strong>${fmt(d.browser_history.sampled_attempts)}</strong><span>Phiên Link đã đọc</span></div><div><strong>${fmt(d.browser_history.observed_accounts)}</strong><span>Tài khoản có mã</span></div><div><strong>${fmt(d.browser_history.changed_accounts)}</strong><span>Tài khoản có ≥3 mã</span></div><div><strong>${fmt(d.browser_history.shared_codes)}</strong><span>Mã dùng chung</span></div></div>
 <p class="small muted">${d.browser_history.truncated?'Đã đạt giới hạn 5.000 phiên gần nhất; thống kê chỉ phản ánh mẫu này.':'Thống kê từ các phiên Link còn lưu, không phải số lượt vượt thành công.'} Mỗi nhóm hiển thị tối đa 50 kết quả.</p>
 <details class="fraud-alert-technical"><summary>🔎 Một tài khoản có nhiều mã (${fmt(d.browser_history.changed_accounts)})</summary>
 ${(d.browser_history.changes||[]).length?d.browser_history.changes.map(r=>`<article class="fraud-alert-card"><strong>${esc(r.name||r.email||'Thành viên')}</strong><div class="small muted">${esc(r.email||'')}</div><p>${fmt(r.code_count)} mã trình duyệt trong 24 giờ</p><div class="small">Gần nhất: ${dt(r.last_seen)}</div><details class="fraud-alert-technical"><summary>Xem mã (tối đa 10)</summary><div class="small">${(r.codes||[]).map(c=>'<div><code>'+esc(c)+'</code></div>').join('')}</div></details><button class="btn alt sm" type="button" data-action="view-fraud-account" data-id="${esc(r.user_id)}">Xem tài khoản</button></article>`).join(''):'<p class="note">Chưa có tài khoản đạt ngưỡng cảnh báo trong dữ liệu đã đọc.</p>'}</details>
 <details class="fraud-alert-technical"><summary>🔎 Nhiều tài khoản chung mã (${fmt(d.browser_history.shared_codes)})</summary>
 ${(d.browser_history.shared||[]).length?d.browser_history.shared.map(r=>`<article class="fraud-alert-card"><strong>${fmt(r.account_count)} tài khoản chung mã</strong><div class="small"><code>${esc(r.device_code)}</code></div><div class="small">Gần nhất: ${dt(r.last_seen)}</div>${(r.accounts||[]).map(a=>`<div class="btn-row"><button class="btn alt sm" type="button" data-action="view-fraud-account" data-id="${esc(a.user_id)}">${esc(a.name||a.email||'Thành viên')}</button><span class="small muted">${esc(a.email||'')}</span></div>`).join('')}</article>`).join(''):'<p class="note">Chưa có mã dùng chung trong dữ liệu đã đọc.</p>'}</details>`:'<p class="note">Chưa lấy được dữ liệu nhận diện từ máy chủ; tải lại để thử lại.</p>'}
 </section>
 <section class="card section fraud-account-list"><h3>🛡️ Rủi ro từng tài khoản</h3>
 <p class="note">Ưu tiên điểm cao. Mức nghiêm trọng cần Admin đối chiếu trước khi duyệt tiền; không tự kết luận gian lận.</p>
 <form class="fraud-search-form" data-form="fraud-search">
  <input type="search" name="keyword" value="${esc(state.fraudSearch)}" placeholder="Tìm tên hoặc email thành viên" aria-label="Tìm tài khoản" maxlength="120">
  <button class="btn sm" type="submit">Tìm</button>
 </form>
 <p class="small muted">Tìm thấy ${fmt(matching.length)} tài khoản; hiển thị ${fmt(Math.min(100,matching.length))} tài khoản đầu tiên. Bạn có thể tìm bằng email để xem tài khoản khác.</p>
 <div class="fraud-member-grid">${matching.length?matching.slice(0,100).map(p=>`<article class="fraud-member fraud-member-${esc(p.level)}">
 <div class="fraud-member-head"><div><strong>${esc(p.name)}</strong><div class="small muted">${esc(p.email)}</div></div><div class="fraud-member-score"><strong>${fmt(p.score)}<small>/100</small></strong>${chip(p.level)}</div></div>
 <div class="fraud-member-stats"><div><strong>${fmt(p.ip_count||0)}</strong><span>IP/dải mạng</span></div><div><strong>${fmt(p.device_count||0)}</strong><span>Mã trình duyệt</span></div><div><strong>${fmt(p.shared_device_accounts||0)}</strong><span>TK chung mã</span></div><div><strong>${fmt(p.shared_ip_accounts||0)}</strong><span>TK chung mạng</span></div></div>
 ${(p.reasons||[]).length?`<p class="fraud-member-reason">${esc(p.reasons[0])}${p.reasons.length>1?' · +'+fmt(p.reasons.length-1)+' dấu hiệu':''}</p>`:'<p class="small muted">Chưa có dấu hiệu vượt ngưỡng.</p>'}
 <div class="fraud-member-footer">${chip(p.status)}<button type="button" class="btn alt sm" data-action="view-fraud-account" data-id="${esc(p.user_id)}">Xem chi tiết</button></div></article>`).join(''):empty('Không có tài khoản phù hợp','Thử đổi bộ lọc hoặc từ khóa.')}</div></section>
 <h3 class="fraud-more-title">Đối chiếu và nhật ký</h3>
 ${groups('📱 Trùng mã trình duyệt',`${fmt((anti.shared_browsers||[]).length)} nhóm tài khoản`,`
 <p class="note">Đây là mã trình duyệt được ghi nhận, không phải IMEI. Có thể bị đổi hoặc giả mạo; cần kết hợp nhiều chứng cứ khi đối chiếu.</p>
 ${table(['Mã trình duyệt','Số tài khoản / Mạng','Tài khoản liên quan'],(anti.shared_browsers||[]).slice(0,35).map(g=>`<tr>
  <td><code>${esc(g.device_code)}</code></td>
  <td><strong>${fmt(g.account_count)}</strong> tài khoản<div class="small muted">${fmt(g.network_count)} IP/dải mạng</div></td>
  <td>${(g.accounts||[]).slice(0,10).map(a=>`<div class="small"><button class="button-plain" type="button" data-action="view-fraud-account" data-id="${esc(a.user_id)}">${esc(a.email||a.name||'Thành viên')}</button></div>`).join('')}</td>
 </tr>`))}`)}
 ${groups('🌐 Chung IP / dải IPv6',`${fmt((anti.shared_networks||[]).filter(g=>g.device_count>=2||g.account_count>=2).length)} nhóm mạng`,`
 <p class="note">Một IP có thể phục vụ nhiều thiết bị độc lập (Wi-Fi gia đình, quán cà phê hoặc nhà mạng). IPv6 được nhóm theo /64 và không đồng nghĩa cùng điện thoại.</p>
 ${table(['IP / Dải mạng','Mã trình duyệt / Tài khoản','Thành viên đã ghi nhận'],(anti.shared_networks||[]).filter(g=>g.device_count>=2||g.account_count>=2).slice(0,35).map(g=>`<tr>
  <td><strong>${esc(g.ip_type)}</strong><div>${adminIP(g.address)}</div></td>
  <td><strong>${fmt(g.device_count)}</strong> mã trình duyệt<div class="small muted">${fmt(g.account_count)} tài khoản</div></td>
  <td>${(g.accounts||[]).slice(0,10).map(a=>`<div class="small"><button class="button-plain" type="button" data-action="view-fraud-account" data-id="${esc(a.user_id)}">${esc(a.email||a.name||'Thành viên')}</button></div>`).join('')}</td>
 </tr>`))}`)}
 ${groups('📍 Danh sách IPv4',`${fmt((d.ipv4_inventory||[]).length)} IP ghi nhận trong 30 ngày`,`
 <p><strong>${fmt((d.ipv4_inventory||[]).length)}</strong> địa chỉ IPv4 trong 30 ngày qua.</p>
 <p class="note">Hiển thị cả IPv4 của một tài khoản, không chỉ IP bị trùng. IPv4 máy chủ ghi nhận và IPv4 do trình duyệt báo được tách nguồn rõ ràng; không tự chuyển IPv6 thành IPv4.</p>
 ${table(['Địa chỉ IPv4','Nguồn ghi nhận','Tài khoản','Gần nhất'],(d.ipv4_inventory||[]).map(r=>`<tr>
  <td><code>${esc(r.ip)}</code></td>
  <td>${r.source==='cloudflare'?'Kết nối máy chủ (xác thực)':'Trình duyệt báo (chưa xác minh)'}</td>
  <td>${fmt(r.account_count)}</td>
  <td>${dt(r.last_seen)}</td>
 </tr>`))}`)}
 ${groups('🚨 Cảnh báo mạng',`${fmt((d.network_alerts||[]).length)} cảnh báo IPv4/IPv6`,`
 <p class="note">Mức nghiêm trọng là ưu tiên kiểm tra, không phải kết luận gian lận. Cảnh báo nghiêm trọng khi ít nhất 5 tài khoản xuất hiện trên cùng IPv4 hoặc dải IPv6 /64 cùng với từ 2 mã trình duyệt trở lên. IPv4 do trình duyệt tự báo luôn là thông tin tham khảo.</p>
 <div class="risk-network-layout">${table(['Địa chỉ / Nguồn','Tài khoản / Thiết bị','Mức độ'],(d.network_alerts||[]).map(r=>`<tr>
 <td><strong>${esc(r.ip_type)}</strong><div>${adminIP(r.address)}</div><div class="small muted">${r.source==='cloudflare'?'IP kết nối do Cloudflare ghi nhận':'IPv4 trình duyệt báo (chưa xác minh)'}</div>
 ${r.ip_type==='IPv6 /64'?'<div class="risk-related-v4"><strong>IPv4 liên quan:</strong> '+((r.related_ipv4||[]).length
  ?r.related_ipv4.map(x=>'<div><code>'+esc(x.ip)+'</code> • '+fmt(x.account_count)+' tài khoản (trình duyệt báo, chưa xác minh)</div>').join('')
  :'Chưa có báo cáo IPv4 từ nhóm này. Sẽ bổ sung khi thành viên truy cập lại và mạng hỗ trợ IPv4.')+'</div>':''}</td>
 <td><strong>${fmt(r.account_count)} tài khoản</strong><div class="small muted">${fmt(r.device_count)} mã trình duyệt khác nhau</div></td>
 <td>${chip(r.severity)}<div class="small muted">${r.severity==='serious'?'Ưu tiên đối chiếu bằng chứng':'Chưa đủ bằng chứng để kết luận'}</div></td></tr>`))}</div>`)}
 ${groups('IPv4 trình duyệt báo',`${fmt((d.ipv4_observations||[]).length)} báo cáo trong 7 ngày`,`
 <p class="note">Các địa chỉ này là phản hồi dịch vụ kiểm tra trên mạng của khách. IP kết nối do Cloudflare ghi nhận được hiển thị bên cạnh để đối chiếu.</p>
 ${table(['Thời gian / Thành viên','IPv4 trình duyệt báo','IP Cloudflare ghi nhận'],(d.ipv4_observations||[]).map(r=>`<tr><td>${dt(r.created_at)}<div class="small">${esc(r.name||r.email||'—')}</div></td><td><code>${esc(r.observed_ipv4)}</code></td><td>${adminIP(r.cloudflare_ip)}</td></tr>`))}`)}
 <div id="fraud-link-alerts">${groups('⚠ Cảnh báo Link hôm nay',`${fmt(d.link_alert_count||0)} cảnh báo`,`
 <p class="note">Cảnh báo không đồng nghĩa đã hoàn thành nhiệm vụ. Kiểm tra bước phát sinh và bằng chứng gửi nhiệm vụ của tài khoản liên quan bên dưới.</p>
 <div class="fraud-link-summary"><strong>${fmt(d.link_alert_count||0)} cảnh báo</strong> · ${fmt(d.link_alert_accounts||0)} tài khoản · Đặt lại 00:00</div>
 <div class="fraud-alert-list">${(d.link_alerts||[]).length?(d.link_alerts||[]).map(r=>{
 const stage=r.stage||(r.detail==='link_browser_owner:list'?'list':'unknown');
 const stageText={list:'Chỉ phát hiện khi xem danh sách',start:'Bị chặn trước khi cấp Link',return:'Bị chặn khi quay về',submit:'Bị chặn khi gửi xác minh',unknown:'Bản ghi cũ – chưa rõ bước'}[stage]||'Chưa rõ bước';
 const reason=r.reason||String(r.detail||'').split(':')[0];
 const reasonText={link_owner:'Trùng IP / dải IPv6 với tài khoản khác',link_browser_owner:'Trùng mã trình duyệt với tài khoản khác',link_reserved_ip:'Tài khoản khác đang giữ phiên Link này trên cùng mạng',link_reserved_browser:'Tài khoản khác đang giữ phiên Link trên cùng mã trình duyệt',link_task_limit:'Đã hết lượt nhiệm vụ riêng',link_limit:'Đã hết hạn mức IP',link_browser_limit:'Đã hết hạn mức trình duyệt'}[reason]||'Cảnh báo hạn mức';
 return `<article class="fraud-alert-card"><div class="fraud-alert-head"><strong>${esc(r.name||r.email||'Thành viên')}</strong><small>${dt(r.created_at)}</small></div>
 <div class="small muted">${esc(r.email||r.user_id||'—')}</div>
 <div class="fraud-alert-stage ${stage==='list'||stage==='unknown'?'passive':'action'}">${esc(stageText)}</div>
 <p class="fraud-alert-reason"><strong>${esc(reasonText)}</strong><br>Nhiệm vụ: ${esc(r.task_title||(stage==='list'?'Danh sách Link (không xác định nhiệm vụ)':'Chưa xác định'))}</p>
 <div class="fraud-alert-proof">${r.related_attempt_id?`<strong>Phiên giữ chỗ liên quan</strong><div>${esc(r.reserved_name||r.reserved_email||'Thành viên')}</div><div class="small muted">${esc(r.reserved_email||'')}</div><div class="small">${esc(r.reserved_task_title||'Link')} · ${dt(r.reserved_at)}</div><p class="small muted">Có bản ghi giữ chỗ, chưa chứng minh đã truy cập đối tác hay gửi nhiệm vụ.</p><button type="button" class="btn alt sm" data-action="view-fraud-account" data-id="${esc(r.reserved_user_id)}">Xem tài khoản giữ chỗ</button>`:''}<strong>Bằng chứng tài khoản liên quan đã gửi nhiệm vụ</strong>
 ${r.related_completion_id?`<div>${esc(r.owner_name||r.owner_email||'Thành viên')}</div><div class="small muted">${esc(r.owner_email||'')}</div><div class="small">${esc(r.owner_task_title||'Link')} · ${dt(r.owner_submitted_at)} · ${chip(r.owner_completion_status)}</div><p class="small muted">Trạng thái hiện tại của lượt gửi, không phải xác nhận doanh thu.</p>`:'<p class="small muted">Chưa tìm thấy lượt gửi liên quan phù hợp trong dữ liệu hiện có.</p>'}</div>
 <details class="fraud-alert-technical"><summary>IP và mã trình duyệt</summary><div class="fraud-alert-ip">${adminIP(r.ip)}</div><div class="small">Mã: <code>${esc(r.device_code||'—')}</code></div></details>
 <div class="fraud-alert-actions">${r.user_id?`<button type="button" class="btn alt sm" data-action="view-fraud-account" data-id="${esc(r.user_id)}">Xem tài khoản bị chặn</button>`:''}${r.owner_user_id?`<button type="button" class="btn alt sm" data-action="view-fraud-account" data-id="${esc(r.owner_user_id)}">Xem tài khoản liên quan</button>`:''}</div>
 </article>`;
 }).join(''):empty('Chưa có cảnh báo Link hôm nay','Các sự kiện sẽ xuất hiện khi hệ thống phát hiện hạn mức.')}</div>`)}</div>
 ${groups('📋 Nhật ký và dữ liệu đối chiếu','Sự kiện gần đây • dữ liệu IP và trình duyệt 30 ngày',`<h4>IP dùng bởi nhiều tài khoản trong 30 ngày</h4>
 ${table(['IP','Tài khoản'],d.repeated_ips.map(r=>`<tr><td>${adminIP(r.ip)}</td><td>${r.n}</td></tr>`))}
 <h4>Mã trình duyệt dùng bởi nhiều tài khoản (30 ngày)</h4>
  ${table(['Mã nhận diện','Tài khoản'],(d.repeated_devices||[]).map(r=>`<tr><td><code>${esc(r.device_code)}</code></td><td>${r.n}</td></tr>`))}
  <p class="note">Mã nhận diện có thể bị thay đổi; chỉ dùng để đánh giá rủi ro, không tự khóa tài khoản.</p>
  <h4>Nhật ký sự kiện gần đây</h4>${table(['Thời gian','Sự kiện','IP / Mã'],d.events.map(r=>`<tr><td>${dt(r.created_at)}</td><td>${esc(eventLabels[r.event_type]||r.event_type)}<div>${esc(r.email||r.user_id||'—')}</div><div class="small muted">${esc(r.detail)}</div></td><td>${adminIP(r.ip)}<div class="small muted">${esc(r.device_code)}</div></td></tr>`))}`)}
 ${groups('ℹ️ Cách đọc cảnh báo','Nguồn IP, điểm rủi ro và giới hạn dữ liệu',`<p class="note">Điểm dựa trên tín hiệu 14 ngày, lịch sử rút tiền 90 ngày. Quan hệ mạng/trình duyệt trong 30 ngày. Tối đa ${fmt(anti.limits?.member_rows||1000)} tài khoản và ${fmt(anti.limits?.event_rows||5000)} sự kiện theo phạm vi truy vấn hiện có.</p><p class="note">IP kết nối do Cloudflare ghi nhận. IPv4 do trình duyệt tự báo chỉ để tham khảo, có thể bị giả mạo. Không chuyển IPv6 thành IPv4 ảo. Mã trình duyệt không phải IMEI; chung IP không chứng minh gian lận. Không tự khóa hoặc tịch thu Lúa.</p>`)} `;
}
async function adminSettings(){
 const d=await api('/api/admin/settings'),s=d.settings;
 const group=(title,subtitle,fields)=>`<details class="card admin-setting-group"><summary><span><strong>${title}</strong><small>${subtitle}</small></span><span class="admin-setting-chevron" aria-hidden="true">⌄</span></summary><form data-form="settings" class="admin-setting-fields">${fields}<button class="btn" type="submit">Lưu cài đặt</button></form></details>`;
 return `${heading('Cài đặt hệ thống','Chọn mục muốn chỉnh sửa. Mỗi mục được lưu riêng.')}
 <div class="admin-setting-groups">
 ${group('⚙️ Thiết lập chung','Tên website, đăng ký, thông báo',`
 ${field('site_name','Tên website',s.site_name,'required')}
 <div class="field"><label for="announcement">Thông báo thành viên</label><textarea name="announcement" id="announcement">${esc(s.announcement)}</textarea></div>
 ${select('signup_enabled','Cho phép đăng ký',[['1','Bật'],['0','Tắt']],s.signup_enabled)}`)}
 ${group('🎁 Phần thưởng và tỷ giá','Điểm danh, giới thiệu, quy đổi Lúa',`
 ${field('checkin_reward','Lúa thưởng điểm danh',s.checkin_reward,'type="number" min="0" max="10000000" required')}
 ${field('referral_reward','Lúa thưởng giới thiệu',s.referral_reward,'type="number" min="0" max="10000000" required')}
 ${field('lua_per_vnd','Bao nhiêu Lúa = 1 VNĐ',s.lua_per_vnd,'type="number" min="0" max="10000000" required')}`)}
 ${group('💸 Rút tiền và đổi thẻ cào','Phí xử lý, ngưỡng miễn phí',`
 ${select('withdrawals_enabled','Cho phép yêu cầu rút',[['0','Tắt'],['1','Bật']],s.withdrawals_enabled)}
 <p class="note">Rút tối thiểu 5.000đ. Cả hai phương thức dùng chung ngưỡng miễn phí; đổi thẻ tính theo từng thẻ. Nhập phí 0 để miễn phí phương thức đó.</p>
 ${field('payout_free_from_vnd','Miễn phí từ (VNĐ) – áp dụng cả hai',s.payout_free_from_vnd,'type="number" min="5000" max="10000000" step="1" required')}
 ${field('withdrawal_fee_vnd','Phí rút tiền dưới ngưỡng (VNĐ)',s.withdrawal_fee_vnd,'type="number" min="0" max="10000000" step="1" required')}
 ${field('card_fee_lua','Phí mỗi thẻ dưới ngưỡng (Lúa)',s.card_fee_lua,'type="number" min="0" max="10000000" step="1" required')}
 <p class="note">Yêu cầu cũ giữ nguyên phí. Từ chối sẽ hoàn đủ Lúa và phí đã giữ. Cần đặt tỷ giá và chuẩn bị nguồn chi trả trước khi bật rút.</p>`)}
 ${group('📋 Quy định rút tiền','Nội dung và thời gian thanh toán hiển thị cho thành viên',`
 <div class="field"><label for="withdrawal_rules">Nội dung quy định rút tiền</label><textarea id="withdrawal_rules" name="withdrawal_rules" rows="6" maxlength="2000" required>${esc(s.withdrawal_rules||'')}</textarea></div>
 ${field('withdrawal_payment_time','Thời gian thanh toán',s.withdrawal_payment_time||'1–3 ngày làm việc','required maxlength="120" placeholder="Ví dụ: 1–3 ngày làm việc"')}
 <p class="note">Nội dung hiển thị ngay trên trang rút tiền ngân hàng. Cài đặt này chỉ thay đổi thông báo, không tự duyệt hay chuyển tiền.</p>`)}
 ${group('🛡️ Chống gian lận nhiệm vụ App','Kiểm soát tài khoản theo IP và trình duyệt',`
 <p class="note">Mỗi App chỉ làm một lần/tài khoản. Không giới hạn tổng số App được làm. Hai mục dưới chỉ kiểm soát số tài khoản, không phải số lượt nhiệm vụ.</p>
 ${select('quota_device_accounts_daily','Một tài khoản trên mỗi mã trình duyệt/ngày',[['1','Bật – chỉ 1 tài khoản'],['0','Tắt']],s.quota_device_accounts_daily)}
 ${field('quota_ip_accounts_daily','Số tài khoản được làm App trên cùng IP/ngày',s.quota_ip_accounts_daily,'type="number" min="0" max="100" required')}
 <p class="note">Nhập 0 để tắt giới hạn số tài khoản theo IP. Đặt lại lúc 00:00 giờ Việt Nam. Quy tắc này cũng áp dụng cho nhiệm vụ Video và Khác cũ.</p>`)}
 ${group('🔗 Chống gian lận nhiệm vụ Link','Chặn trùng IP và đổi tài khoản',`
 <p class="note"><strong>Không chỉnh số lượt Link tại đây.</strong> Số lượt của từng Link được chỉnh riêng trong Quản lý nhiệm vụ → Link rút gọn → Sửa.</p>
 ${select('quota_link_ip_exclusive','Chặn tài khoản khác làm cùng một Link trên cùng IP',[['1','Bật'],['0','Tắt']],s.quota_link_ip_exclusive)}
 <p class="note">Ví dụ: A đã gửi Link X trên IP này, B không làm được Link X trên cùng IP, nhưng có thể làm Link Y nếu đủ điều kiện.</p>
 <h4>Chặn Fake IP trước khi cấp Link</h4>
 <p class="note">${d.proxy_key_configured?'Đã có Secret IPAPI_API_KEY.':'Chưa có Secret IPAPI_API_KEY trên Cloudflare; chưa thể bật.'} Khi bật, phát hiện VPN, Proxy hoặc Tor sẽ chặn cấp Link mới. Lỗi API cũng tạm dừng cấp Link mới; không khóa tài khoản.</p>
 ${select('link_proxy_enabled','Kiểm tra VPN / Proxy / Tor',[['0','Tắt'],['1','Bật bảo vệ']],s.link_proxy_enabled)}
 ${select('quota_link_device_exclusive','Một tài khoản làm Link trên mỗi mã trình duyệt/ngày',[['1','Bật'],['0','Tắt']],s.quota_link_device_exclusive)}
 <p class="note">Khi bật, tài khoản khác không thể tiếp tục làm Link trên mã trình duyệt đã được sử dụng. Tài khoản ban đầu vẫn làm các Link theo hạn mức riêng. Đặt lại lúc 00:00 giờ Việt Nam.</p>
 <p class="note">Mã trình duyệt không phải IMEI. Dùng chung IP không tự khóa tài khoản hay xóa Lúa. Xem cảnh báo tại Chống gian lận.</p>`)}
 </div>`;
}
// Màn hình đọc quy tắc trước khi tạo phiên nhiệm vụ / chuyển sang link.
// Hủy chỉ đóng thông báo, không tiêu hao lượt và không gọi API start.
function showTaskRules(taskId){
 const task=state.memberTasks.find(t=>t.id===taskId);
 if(!task)throw new Error('Nhiệm vụ không còn trong danh sách. Hãy tải lại trang Nhiệm vụ.');
 const root=document.getElementById('modal-root');
 if(!root)throw new Error('Không tìm thấy cửa sổ thông báo.');
 state.pendingTaskRules=taskId;
 root.innerHTML=`<div class="modal-cover task-rules-cover"><section class="modal task-rules-modal" role="dialog" aria-modal="true" aria-labelledby="task-rules-title" aria-describedby="task-rules-subtitle">
  <div class="task-rules-scroll" tabindex="0" aria-label="Quy tắc bắt buộc">
  <div class="task-rules-header">
   <span class="task-rules-icon" aria-hidden="true">🛡️</span>
   <div><h3 id="task-rules-title">Xác nhận nhiệm vụ</h3>
    <p id="task-rules-subtitle">Đọc kỹ trước khi bắt đầu</p></div>
  </div>
  <dl class="task-rules-meta">
   <div><dt>Nhiệm vụ</dt><dd>${esc(task.title)}</dd></div>
   <div><dt>Thưởng dự kiến</dt><dd class="task-rules-reward">+${fmt(task.reward)} Lúa</dd></div>
  </dl>
  <h4 class="task-rules-heading">QUY TẮC BẮT BUỘC</h4>
  <ul class="task-rules-list">
   <li><span class="task-rules-rule-icon" aria-hidden="true">⊘</span><span>Không dùng tool, script, auto hay bất kỳ hành vi gian lận nào.</span></li>
   <li><span class="task-rules-rule-icon" aria-hidden="true">◎</span><span>Không dùng VPN, proxy hay trình duyệt ẩn danh khi làm nhiệm vụ.</span></li>
   <li><span class="task-rules-rule-icon" aria-hidden="true">♧</span><span>Không tạo nhiều tài khoản trên cùng một thiết bị để nhận thưởng.</span></li>
   <li><span class="task-rules-rule-icon" aria-hidden="true">≋</span><span>Không hoàn thành cùng một nhiệm vụ trên website kiếm thưởng khác rồi quay lại Trạm Có Lúa để làm lại hoặc nhận Lúa. Muốn nhận Lúa, phải bắt đầu nhiệm vụ tại Trạm Có Lúa.</span></li>
  </ul>
  <p class="task-rules-note">${task.review_mode==='manual'?'Lượt quay về và phép tính không xác nhận doanh thu. Chỉ cộng Lúa sau khi Admin kiểm tra và duyệt nhiệm vụ hợp lệ theo điều kiện đối tác.':'Thưởng chỉ được ghi nhận khi nhiệm vụ vượt qua các bước xác minh của hệ thống và đáp ứng điều kiện áp dụng.'}</p>
  </div>
  <div class="task-rules-actions">
   <button type="button" class="btn task-rules-cancel" data-action="cancel-task-rules">Hủy</button>
   <button type="button" class="btn task-rules-accept" data-action="confirm-task-rules">▷ Bắt đầu</button>
  </div>
 </section></div>`;
}

// Tiến trình bắt đầu nhiệm vụ: hiển thị trạng thái thật của API, không giả xác minh.
function renderTaskStartProgress(taskId){
 const root=document.getElementById('modal-root');
 if(!root)return;
 const task=state.memberTasks.find(t=>t.id===taskId);
 root.innerHTML=`<div class="modal-cover task-start-cover">
  <section class="modal task-start-modal is-checking" role="dialog" aria-modal="true" aria-labelledby="task-start-title" aria-describedby="task-start-subtitle" aria-busy="true" tabindex="-1">
   <span class="task-start-kicker">🌾 TRẠM CÓ LÚA</span>
   <div class="task-start-heading">
    <span class="task-start-heading-icon"><span class="task-start-spinner" aria-hidden="true"></span></span>
    <div class="task-start-heading-text">
     <h3 id="task-start-title">${esc(task?.title||'Nhiệm vụ')}</h3>
     <p id="task-start-subtitle">Đang kiểm tra phiên nhiệm vụ...</p>
    </div>
   </div>
   <div class="task-start-status" role="status" aria-live="polite">
    <span class="task-start-status-icon">◌</span>
    <span>Hệ thống đang kiểm tra tài khoản và giới hạn của nhiệm vụ.</span>
   </div>
   <div class="task-start-accent" aria-hidden="true"></div>
  </section>
 </div>`;
 root.querySelector('.task-start-modal')?.focus({preventScroll:true});
}

async function startTask(taskId){
 // Ignore duplicate taps while the same start request is being processed.
 if(state.taskStartInFlight)return;
 state.taskStartInFlight=true;
 // Không báo đã khởi tạo trước khi server xác nhận phiên nhiệm vụ thành công.
 renderTaskStartProgress(taskId);
 try{
  // A diagnostic failure must never stop a real member from continuing a task.
  let linkSignals='';
  if(state.memberTasks.find(t=>t.id===taskId)?.category==='link'){
   try{
    const signals=inspectBrowserSignals();
    linkSignals=[signals.automation,signals.emulator,signals.virtualGraphics].map(v=>v===true?'1':v===false?'0':'?').join('');
   }catch{}
  }
  const data=await api(`/api/tasks/${encodeURIComponent(taskId)}/start`,'POST',{},linkSignals);
  if(!data?.attempt_id)throw new Error('Máy chủ chưa xác nhận tạo phiên nhiệm vụ. Hãy thử lại.');
  const autoOpenLink=data.category==='link'&&data.review_mode==='manual';
  const url=autoOpenLink?String(data.task_url||''):'';
  if(autoOpenLink&&(!/^https:\/\//i.test(url)||!URL.canParse(url)))
   throw new Error('Admin chưa cài liên kết HTTPS hợp lệ cho nhiệm vụ này.');
  if(autoOpenLink){
   // Link rút gọn mở trong CÙNG tab, không tạo trang mới hoặc nộp bằng chứng sớm.
   state.attempt=null;
   location.assign(url);
   return;
  }
  state.attempt={...data,taskId};renderAttemptModal();if(data.resumed)toast('Đã khôi phục phiên App đang làm. Bạn có thể gửi xác nhận.');
 }catch(error){
  // Khi lỗi, trở lại bảng quy tắc để thử lại, không để người dùng mắc kẹt trong spinner.
  const root=document.getElementById('modal-root');
  if(root?.querySelector('.task-start-cover'))root.innerHTML='';
  if(state.pendingTaskRules===taskId)showTaskRules(taskId);
  throw error;
 }finally{
  state.taskStartInFlight=false;
 }
}
function renderAttemptModal(){
 const a=state.attempt;if(!a)return;
 const remain=a.category==='video'?Math.max(0,Math.ceil((a.available_at-Date.now())/1000)):0;
 const root=document.getElementById('modal-root');
 root.innerHTML=`<div class="modal-cover"><section class="modal"><button class="close" type="button" data-action="close-modal" aria-label="Đóng">×</button>
 <span class="eyebrow">KIỂM TRA THỰC HIỆN</span><h3>Hoàn thành nhiệm vụ</h3>
 ${a.task_url?`<p><a class="btn alt" href="${safeUrl(a.task_url)}" target="_blank" rel="noopener noreferrer">Mở liên kết nhiệm vụ ↗</a></p>`:''}
 ${a.category==='link'?'<p class="note">Nếu link được cấu hình quay về Trạm Có Lúa, hệ thống tự ghi nhận Chờ đối soát khi đến trang đích. Không cần nhập lại mã trên website. Chỉ Admin xác minh nguồn thu hợp lệ mới duyệt thưởng.</p>':''}
 ${a.category==='app'?'<p class="note">Bạn có thể rời website để cài ứng dụng rồi quay lại. Bấm Bắt đầu / Tiếp tục xác nhận để mở lại nhiệm vụ. Báo hoàn thành chỉ gửi yêu cầu chờ Admin xác minh, chưa cộng Lúa.</p>':`<p class="note">Hãy thực hiện đúng yêu cầu trước khi xác nhận. Hệ thống kiểm tra ${a.category==='video'?'thời gian và ':''}CAPTCHA; ${a.review_mode==='manual'?'Admin sẽ duyệt bằng chứng bạn gửi.':'với chế độ tự động, hệ thống không thể xác minh hoạt động bên ngoài trang web.'}</p>`}
 ${a.app_simple_confirmation&&!a.app_no_photo?'<div class="callout">Đã thực hiện theo hướng dẫn? Bấm xác nhận để gửi Admin duyệt.</div>':a.app_no_photo?'<div class="callout">🎮 Nhập mã giới thiệu Color Sort thành công, sau đó xác nhận. Không cần gửi ảnh. Admin sẽ đối chiếu với ứng dụng và quyết định thưởng 30 hoặc 40 Lúa.</div>':a.category==='app'?'<div class="callout">📱 Hãy cài app, đăng ký tài khoản mới, nhập mã giới thiệu được hiển thị ở danh sách nhiệm vụ và chụp màn hình xác nhận thành công.</div>':''}
 <form data-form="task-claim">${a.category==='app'?'':`<div class="captcha">${a.a} + ${a.b} = ?</div>
 ${field('answer','Kết quả phép cộng','', 'required type="number" min="0" max="30" inputmode="numeric"')}`}
 ${a.app_no_photo||a.app_simple_confirmation?'':a.category==='app'?`<div class="field"><label for="photo">Ảnh chụp màn hình bằng chứng (bắt buộc)</label><input id="photo" name="photo" type="file" accept="image/*" required><p class="note">Ảnh sẽ được tự nén trước khi gửi. Hãy che mật khẩu, OTP, số điện thoại và thông tin nhạy cảm.</p></div><div class="field"><label for="evidence">Ghi chú cho Admin (không bắt buộc)</label><textarea id="evidence" name="evidence" maxlength="200" placeholder="Ví dụ: Đã đăng ký và nhập mã thành công"></textarea></div>`:a.review_mode==='manual'?`<div class="field"><label for="evidence">Bằng chứng / URL xác nhận / mô tả (≥12 ký tự)</label><textarea id="evidence" name="evidence" minlength="12" required placeholder="Dán URL bằng chứng hoặc trình bày chi tiết kết quả..."></textarea></div>`:''}
 <button class="btn" type="submit">${a.category==='app'?'Đã hoàn thành – Báo Admin':remain>0?'Gửi khi đủ thời gian':'Xác nhận hoàn thành'} →</button>
 ${a.category==='video'?`<p class="note" id="wait-hint">${remain>0?`Bạn còn cần chờ ít nhất ${remain} giây để xác nhận.`:'Đã đủ thời gian tối thiểu.'}</p>`:''}</form></section></div>`;
}

// Chrome Android / Safari iPhone: vuốt quay lại từ website nhiệm vụ có thể
// khôi phục trang cũ từ back-forward cache (BFCache), giữ cả popup "Đang chuyển".
// Chỉ tải lại khi tài liệu THỰC SỰ đã rời khỏi trang Nhiệm vụ rồi quay về.
// Không gửi /start hay /return, không tiêu tốn thêm lượt và không tự cộng Lúa.
let taskPageWasLeft=false;
let taskPageReturnReloading=false;
function reloadTaskPageOnHistoryReturn(){
 if(!taskPageWasLeft||taskPageReturnReloading||document.hidden)return;
 taskPageWasLeft=false;
 taskPageReturnReloading=true;
 window.location.reload();
}
window.addEventListener('pagehide',()=>{
 const modalRoot=document.getElementById('modal-root');
 const taskDialog=modalRoot?.querySelector('.task-start-cover, form[data-form="task-claim"]');
 if(state.me?.user?.role==='member'&&(state.view==='tasks'||taskDialog))
  taskPageWasLeft=true;
});
window.addEventListener('pageshow',event=>{
 if(event.persisted)reloadTaskPageOnHistoryReturn();
});
document.addEventListener('visibilitychange',()=>{
 // Trình duyệt trên điện thoại có thể kích hoạt visibilitychange trước pageshow.
 if(!document.hidden)reloadTaskPageOnHistoryReturn();
});
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

function updateWithdrawalFields(form){
 if(!form)return;
 const savedId=form.querySelector('[name="saved_account_id"]')?.value||'';
 const saved=state.savedPayoutAccounts.find(a=>a.id===savedId);
 const isOther=form.querySelector('[name="bank_name"]')?.value==='other';
 const enabled=!form.querySelector('button[type="submit"]')?.disabled;
 const bank=form.querySelector('#withdraw-bank-fields');
 const other=form.querySelector('#withdraw-bank-other'),preview=form.querySelector('#saved-payout-preview');
 const saveLine=form.querySelector('#withdraw-save-account-line');
 if(saveLine){saveLine.hidden=!!saved;saveLine.querySelector('input').disabled=!!saved||!enabled;}
 if(!bank||!other)return;
 bank.hidden=!!saved;other.hidden=!!saved||!isOther;
 for(const input of bank.querySelectorAll('input,select')){
   const active=!saved&&(input.name!=='bank_other'||isOther)&&enabled;
   input.disabled=!active;input.required=active;
 }
 const account=form.querySelector('[name="bank_account"]');
 if(account){
   const bvbank=form.querySelector('[name="bank_name"]')?.value==='BVBank';
   account.setAttribute('inputmode',bvbank?'text':'numeric');
   account.setAttribute('pattern',bvbank?'[A-Za-z0-9]{5,30}':'[0-9]{5,30}');
   account.placeholder=bvbank?'Ví dụ: 99ZP... hoặc số tài khoản':'Nhập số tài khoản ngân hàng';
 }
 if(preview){
   preview.textContent=saved?
     'Đã chọn: '+saved.bank_name+' · '+saved.account_number+' · '+saved.account_owner:
     'Muốn dùng lại lần sau, tích ô lưu mặc định.';
 }
}
function updatePayoutAccountFields(form){
 if(!form)return;
 const bankFields=form.querySelector('#saved-bank-fields'),bank=form.querySelector('[name="bank_name"]');
 const other=form.querySelector('#saved-bank-other'),otherInput=form.querySelector('[name="bank_other"]');
 const number=form.querySelector('[name="account_number"]');
 const isOther=bank?.value==='other';
 if(bankFields)bankFields.hidden=false;
 if(bank){bank.disabled=false;bank.required=true;}
 if(other)other.hidden=!isOther;
 if(otherInput){otherInput.disabled=!isOther;otherInput.required=isOther;}
 if(number){
   const bvbank=bank?.value==='BVBank';
   number.setAttribute('inputmode',bvbank?'text':'numeric');
   number.setAttribute('pattern',bvbank?'[A-Za-z0-9]{5,30}':'[0-9]{5,30}');
   number.placeholder=bvbank?'Ví dụ: 99ZP...':'Nhập số tài khoản';
 }
}
// Chỉ chọn mức rút lớn nhất mà ví đủ cả số tiền lẫn phí.
function maximumWithdrawLua(balance,rate,minVnd=5000,freeFromVnd=25000,feeVnd=2000){
 if(!Number.isSafeInteger(balance)||balance<=0||!Number.isSafeInteger(rate)||rate<=0)return 0;
 const freeMax=Math.floor(Math.min(balance,1000000000)/rate);
 if(freeMax>=freeFromVnd)return freeMax*rate;
 const paidMax=Math.min(freeFromVnd-1,Math.floor(balance/rate)-feeVnd,Math.floor(1000000000/rate)-feeVnd);
 return paidMax>=minVnd?paidMax*rate:0;
}
function updateWithdrawalPreview(form){
 if(!form)return;
 const rate=Number(form.dataset.rate||0),fixedFeeVnd=Number(form.dataset.feeVnd||2000);
 const freeFromVnd=Number(form.dataset.freeFromVnd||25000),minVnd=Number(form.dataset.minVnd||5000);
 const input=form.querySelector('[name="amount"]');
 const raw=String(input?.value||'').trim(),amount=Number(raw);
 const valid=raw!==''&&Number.isSafeInteger(amount)&&amount>0&&rate>0&&amount%rate===0;
 const vnd=valid?amount/rate:0,eligible=valid&&vnd>=minVnd;
 const fee=eligible&&vnd<freeFromVnd?fixedFeeVnd*rate:0;
 const values=[
  ['withdraw-base',valid?fmt(amount)+' Lúa':'—'],
  ['withdraw-fee',eligible?(fee?fmt(fee)+' Lúa ('+fmt(fixedFeeVnd)+'đ)':'Miễn phí'):'—'],
  ['withdraw-total',eligible?fmt(amount+fee)+' Lúa':'—'],
  ['withdraw-payout',valid?fmt(vnd)+' ₫':'—']
 ];
 for(const [id,value] of values){const el=form.querySelector('#'+id);if(el)el.textContent=value;}
 const expected=form.querySelector('[name="expected_fee_lua"]');if(expected)expected.value=String(fee);
 const help=form.querySelector('#withdraw-fee-help');if(help)help.textContent=valid&&!eligible
  ?'Mức rút tối thiểu là '+fmt(minVnd)+'đ. Vui lòng nhập số tiền lớn hơn.'
  :'Khách nhận đủ tiền rút; phí được giữ thêm bằng Lúa. Nếu Admin từ chối hoặc thông tin nhận tiền sai, toàn bộ Lúa và phí được hoàn.';
}
function updateCardPreview(form){
 if(!form)return;
 const value=Number(form.querySelector('[name="denomination_vnd"]:checked')?.value||0);
 const quantity=Math.max(1,Math.min(5,Number(form.querySelector('[name="quantity"]')?.value)||1));
 const rate=Number(form.dataset.rate||0),fee=value>=Number(form.dataset.freeFrom||Infinity)?0:Number(form.dataset.fee||0);
 const expected=form.querySelector('[name="expected_fee_lua"]');if(expected)expected.value=String(fee);
 const base=value*rate*quantity,total=base+fee*quantity;
 for(const [id,text] of [
  ['card-face',fmt(value*quantity)+'đ'],
  ['card-base',fmt(base)+' Lúa'],
  ['card-fee',fee?fmt(fee*quantity)+' Lúa':'Miễn phí'],
  ['card-total',fmt(total)+' Lúa']
 ]){
  const el=form.querySelector('#'+id);
  if(el)el.textContent=text;
 }
}
app.addEventListener('input',e=>{
 if(e.target.matches('form[data-form="withdraw"] [name="amount"]'))updateWithdrawalPreview(e.target.closest('form'));
 if(e.target.matches('#admin-review-search')){
  const needle=e.target.value.trim().toLocaleLowerCase('vi');
  app.querySelectorAll('.admin-reviews-panel tbody tr').forEach(row=>{
   row.hidden=!row.textContent.toLocaleLowerCase('vi').includes(needle);
  });
 }
});
app.addEventListener('change',e=>{
 if(e.target.matches('#task-form [name="link_source_id"]')){
  const form=e.target.closest('form'),options=form.querySelector('#task-source-api-options');
  if(options)options.hidden=!e.target.value;
  form.elements.link_source_creation.value='manual';form.elements.link_source_verification.value='manual';
 }
 if(e.target.matches('#task-form [name="link_source_id"],#task-form [name="link_source_creation"]')){
  const form=e.target.closest('form'),source=JSON.parse(form.dataset.sourceCapabilities||'[]').find(s=>s.id===form.elements.link_source_id.value);
  const creation=form.elements.link_source_creation.value,verification=form.elements.link_source_verification;
  const choices=sourceVerificationChoices(source,creation),previous=verification.value;
  verification.replaceChildren(...choices.map(([value,label])=>new Option(label,value)));
  verification.value=choices.some(([v])=>v===previous)?previous:'manual';
  form.querySelector('[data-source-verification-hint]').textContent=sourceVerificationHint(source,creation);
 }
 if(e.target.matches('input[data-shop-image-input]')){
  previewShopPhoto(e.target).catch(err=>toast(err.message,true));
 }
 if(e.target.matches('form[data-form="card-redeem"] [name="denomination_vnd"]'))updateCardPreview(e.target.closest('form'));
 if(e.target.matches('form[data-form="withdraw"] [name="amount"]'))updateWithdrawalPreview(e.target.closest('form'));
 if(e.target.matches('form[data-form="payout-account"] [name="payment_method"],form[data-form="payout-account"] [name="bank_name"]')){
  updatePayoutAccountFields(e.target.closest('form'));
 }
 if(e.target.matches('form[data-form="withdraw"] [name="bank_name"],form[data-form="withdraw"] [name="saved_account_id"]')){
  updateWithdrawalFields(e.target.closest('form'));
 }

});

window.addEventListener('resize',()=>{
 if(app.querySelector('.layout'))setMenuOpen(false);
});
app.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&document.querySelector('#modal-root .task-result-cover')){
  e.preventDefault();closeTaskResultModal();return;
 }
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
 if(e.target.classList?.contains('task-result-cover')){closeTaskResultModal();return;}
 const el=e.target.closest('button[data-go],button[data-auth],button[data-action]');if(!el)return;
 if(el.dataset.auth){state.authMode=el.dataset.auth;renderAuth();return;}
 if(el.dataset.go){if(!state.me)return;if(state.me.user.role==='member'&&el.dataset.go==='tasks'&&['app','link'].includes(el.dataset.filter))state.taskFilter=el.dataset.filter;const wasOpen=!!app.querySelector('.layout.menu-open');setMenuOpen(false);await navigate(el.dataset.go);if(wasOpen){const title=document.getElementById('topTitle');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}return;}
 const act=el.dataset.action;
 try{
  if(act==='payout-method'){
   if(state.me?.user?.role!=='member'||state.view!=='withdrawals'||!['bank','card'].includes(el.dataset.method))return;
   if(state.payoutMethod===el.dataset.method)return;
   state.payoutMethod=el.dataset.method;await navigate('withdrawals');return;
  }
  if(act.startsWith('payout-account-')){
   if(await handlePayoutAccountAction(act,el,{api,toast,navigate:async()=>{state.savedManagerOpen=true;await navigate('withdrawals');}}))return;
  }
  if(act==='card-quantity'){
   const form=el.closest('form[data-form="card-redeem"]'),input=form?.elements.quantity;
   if(!input||input.disabled||el.disabled)return;
   const delta=Number(el.dataset.delta);if(![-1,1].includes(delta))return;
   const quantity=Math.max(1,Math.min(5,Number(input.value)+delta));
   input.value=String(quantity);
   form.querySelector('[data-delta="-1"]').disabled=quantity<=1;
   form.querySelector('[data-delta="1"]').disabled=quantity>=5;
   updateCardPreview(form);return;
  }
  if(act.startsWith('card-')){
   if(await handleCardAction(act,el,{api,toast,navigate}))return;
  }
  if(act.startsWith('shop-')){
   if(await handleShopAction(act,el,{api,toast,navigate,state,esc}))return;
   if(await handleShopOrderAction(act,el,{api,toast,navigate,state,esc}))return;
  }
  if(act==='withdraw-max'){
   const form=el.closest('form[data-form="withdraw"]');
   if(!form)return;
   const max=maximumWithdrawLua(Number(form.dataset.balance),Number(form.dataset.rate),
     Number(form.dataset.minVnd||5000),Number(form.dataset.freeFromVnd||25000),
     Number(form.dataset.feeVnd||2000));
   if(!max){toast('Số dư chưa đủ rút tối thiểu 5.000đ và phí tương ứng.',true);return;}
   const amountInput=form.querySelector('[name="amount"]');
   if(amountInput){amountInput.value=String(max);updateWithdrawalPreview(form);}
   return;
  }
  if(act==='toggle-notifications'){
   await refreshHeaderNotifications(true);return;
  }
  if(act==='close-notifications'){closeHeaderNotifications();return;}
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
  // Google là một cách đăng ký độc lập: không dùng checkbox của biểu mẫu email.
  const f=app.querySelector('form[data-form="register"]');
  body.referral_code=f?.querySelector('[name="referral_code"]')?.value||'';
 }
 const response=await api('/api/auth/google/start','POST',body);
 location.assign(response.url);return;
}
if(act==='toggle-menu'){setMenuOpen(!app.querySelector('.layout.menu-open'));return;}
  if(act==='close-menu'){setMenuOpen(false,true);return;}
  if(act==='retry-startup'){el.disabled=true;await boot();return;}
  if(act==='logout'){setMenuOpen(false);await api('/api/auth/logout','POST',{});rememberStartupRole(null);state.me=null;state.accountHold=null;state.authMode='login';renderHome();return;}
  if(act==='toggle-task-nav'){if(state.me?.user?.role==='member')setTaskNavOpen(el.getAttribute('aria-expanded')!=='true');return;}
  if(act==='resume-link-confirmation'){await startTask(el.dataset.id);return;}
  if(act==='start-task'){const t=state.memberTasks.find(x=>x.id===el.dataset.id);if(t?.category==='app'){await startTask(el.dataset.id);return;}showTaskRules(el.dataset.id);return;}
  if(act==='cancel-task-rules'){
   state.pendingTaskRules=null;document.getElementById('modal-root').innerHTML='';return;
  }
  if(act==='confirm-task-rules'){
   const taskId=state.pendingTaskRules;
   if(!taskId)throw new Error('Phiên xác nhận đã đóng. Hãy chọn lại nhiệm vụ.');
   el.disabled=true;
   try{
    await startTask(taskId);
    state.pendingTaskRules=null;
   }finally{if(el.isConnected)el.disabled=false;}
   return;
  }
  if(act==='view-photo'){
   const root=document.getElementById('modal-root');
   root.innerHTML=`<div class="modal-cover"><section class="modal"><button class="close" type="button" data-action="close-modal" aria-label="Đóng">×</button><h3>Ảnh bằng chứng nhiệm vụ App</h3><p class="note">Ghi chú: ${esc(el.dataset.note||'Không có')}</p><img class="app-proof-image" src="/api/admin/reviews/${encodeURIComponent(el.dataset.id)}/photo" alt="Ảnh chụp màn hình thành viên gửi" loading="lazy"><p class="note">Chỉ Admin đã đăng nhập mới xem được ảnh. Hãy đối chiếu kết quả trong hệ thống giới thiệu của ứng dụng trước khi duyệt.</p></section></div>`;
   return;
  }
  if(act==='retry-link-return'){await processLinkReturn();return;}
  if(act==='leave-link-return'){await leaveLinkReturn();return;}
  if(act==='ack-overview-notice'){closeOverviewNotice();checkApprovedTaskPopups().catch(()=>{});return;}
  if(act==='close-task-result'){closeTaskResultModal();setTimeout(()=>checkApprovedTaskPopups().catch(()=>{}),0);return;}
  if(act==='close-modal'){state.attempt=null;document.getElementById('modal-root').innerHTML='';return;}
  if(act==='copy'){await navigator.clipboard.writeText(el.dataset.value);toast('Đã sao chép liên kết.');return;}
  if(act==='copy-check-view'){await navigator.clipboard.writeText(el.dataset.value||'');toast('Đã sao chép mã Check View.');return;}
  if(act==='copy-ip'){await navigator.clipboard.writeText(el.dataset.value||'');toast('Đã sao chép địa chỉ IP.');return;}
  if(act==='check-ipv4'){await detectPublicIPv4(el,false);return;}
  if(act==='use-manual-ipv4'){showPastedIPv4();return;}
  if(act==='fraud-browser-test'||act==='fraud-browser-demo'){
   if(state.me?.user?.role!=='admin')return;
   const target=document.getElementById('browser-diagnostic-result');
   if(!target)return;
   if(act==='fraud-browser-test'){
    target.innerHTML='<p class="small muted">Kết quả trên trình duyệt Admin hiện tại (chỉ tại máy này).</p>'+browserDiagnosticMarkup(inspectBrowserSignals());
   }else{
    const results=browserDiagnosticFixtures().map(([name,signals,expected])=>({name,expected,actual:classifyBrowserSignals(signals).status}));
    target.innerHTML='<div class="fraud-alert-card"><strong>Kiểm thử mô phỏng: '+results.filter(r=>r.actual===r.expected).length+'/'+results.length+' đạt</strong>'+results.map(r=>'<p>'+esc(r.name)+' — '+(r.actual===r.expected?'Đạt':'Không đạt')+'</p>').join('')+'<p class="note">Không gọi API, không ghi dữ liệu hoặc nhật ký thành viên.</p></div>';
   }
   return;
  }
  if(act==='fraud-hosting-demo'){
   const target=document.getElementById('hosting-demo-result');
   if(target)target.innerHTML='<div class="fraud-alert-card"><strong>Dữ liệu minh họa — không gọi API, không ghi nhật ký thành viên</strong><p>203.0.113.10 · Mẫu IP thường: chưa phát hiện hosting.</p><p>203.0.113.20 · Mẫu IP hosting: cần kiểm tra, không tự chặn.</p><p>203.0.113.30 · Thiếu dữ liệu: chưa xác minh.</p></div>';
   return;
  }
  if(act==='fraud-proxy-test'){
   if(el.disabled)return;
   const result=document.getElementById('proxy-test-result');
   if(!result)return;
   const original=el.textContent;
   el.disabled=true;el.textContent='Đang gọi ipapi.is…';
   result.textContent='Máy chủ đang kiểm tra kết nối hiện tại.';
   try{
    const d=await api('/api/admin/proxy-test','POST',{});
    const good=d.status==='clear'||d.status==='blocked';
    const reason={vpn:'VPN',proxy:'Proxy',tor:'Tor',missing_key:'Chưa có Secret IPAPI_API_KEY',missing_ip:'Chưa xác định được IP kết nối',service_error:'Máy chủ ipapi.is trả lỗi',network_error:'Không kết nối được từ Cloudflare tới ipapi.is',timeout:'API phản hồi quá thời hạn',auth_error:'API từ chối xác thực hoặc quyền truy cập',rate_limit:'API báo vượt giới hạn yêu cầu',unexpected_redirect:'API trả chuyển hướng ngoài dự kiến',invalid_response:'API không trả đủ dữ liệu bảo vệ',busy:'Dịch vụ đang bận'}[d.reason]||'Không xác định';
    const advice=d.status==='clear'?'Không phát hiện VPN/Proxy/Tor trên IP này.':d.status==='blocked'?'Phát hiện '+reason+' — kết nối này sẽ bị chặn khi bắt đầu Link nếu bảo vệ đang bật.':reason+'. Chưa xác minh được API hoạt động.';
    result.innerHTML=`<div class="fraud-alert-card"><strong class="${good?'':'red'}">${good?'✓ API phản hồi hợp lệ':'⚠ Kiểm tra API chưa thành công'}</strong><p>${esc(advice)}</p><div class="small">Bảo vệ nhiệm vụ: <strong>${d.enabled?'Đang bật':'Chưa bật'}</strong></div><div class="small">IP kết nối: ${adminIP(d.ip)}</div><div class="small">VPS / Hosting: <strong>${d.hosting==='hosting'?'Phát hiện IP hosting — cần đối chiếu':d.hosting==='not_detected'?'Chưa phát hiện IP hosting':'Chưa có dữ liệu xác minh'}</strong></div><div class="small">Thời gian: ${dt(d.checked_at)} · ${fmt(d.duration_ms)} ms${d.http_status?' · HTTP '+esc(d.http_status):''}</div><p class="small muted">Chỉ là phép thử của Admin, không tính là lượt nhiệm vụ hoặc cảnh báo gian lận.</p></div>`;
   }catch(err){result.textContent=err.message||'Không kiểm tra được API.';}
   finally{el.disabled=false;el.textContent=original;}
   return;
  }
  if(act==='fraud-open-link-alerts'){const group=document.querySelector('#fraud-link-alerts details');if(group){group.open=true;group.scrollIntoView({block:'start',behavior:'smooth'});}return;}
  if(act==='fraud-filter'){
   state.fraudFilter=['all','serious','review','low'].includes(el.dataset.level)?el.dataset.level:'all';
   await navigate('admin-security');return;
  }
  if(act==='view-fraud-account'){await showFraudAccount(el.dataset.id);return;}

  if(act==='checkin'){await api('/api/checkin','POST',{});toast('Điểm danh thành công.');await afterAction('benefits');return;}
  if(act==='delete-link-source'){if(!localizedConfirm('Xóa nguồn '+el.dataset.name+'? Chỉ xóa được nguồn chưa gắn với nhiệm vụ hoặc phiên đã tạo.'))return;await api('/api/admin/link-sources/remove','POST',{id:el.dataset.id});toast('Đã xóa nguồn.');await navigate('admin-tasks');return;}
  if(act==='add-link-source'){const panel=document.getElementById('new-link-source');if(panel){panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'});}return;}
  if(act==='admin-task-filter'){state.adminTaskFilter=el.dataset.filter==='app'?'app':'link';state.taskEdit=null;await navigate('admin-tasks');return;}
  if(act==='admin-queue'&&state.me?.user?.role==='admin'){
   const view=el.dataset.view;if(!['admin-reviews','admin-withdrawals','admin-shop-orders','admin-cards'].includes(view))return;
   state.adminLocalFilters??={};state.adminLocalFilters[view]='work';
   if(view==='admin-reviews'){state.adminReviewStatus='pending';state.adminReviewPage=1;state.adminReviewRetryOnly=false;}
   await navigate(view);return;
  }
  if(act==='admin-open-sources'&&state.me?.user?.role==='admin'){
   state.adminTaskFilter='link';state.taskEdit=null;await navigate('admin-tasks');const panel=document.getElementById('link-source-manager');if(panel){panel.open=true;panel.scrollIntoView({block:'start'});}return;
  }
  if(act==='admin-open-reviews'){state.adminReviewFilter=state.adminTaskFilter;state.adminReviewStatus='pending';state.adminReviewPage=1;state.adminReviewRetryOnly=false;await navigate('admin-reviews');return;}
  if(act==='admin-review-filter'){state.adminReviewFilter=['app','link','archive'].includes(el.dataset.filter)?el.dataset.filter:'link';state.adminReviewPage=1;state.adminReviewRetryOnly=false;await navigate('admin-reviews');return;}
  if(act==='admin-review-status'){state.adminReviewStatus=['pending','approved','rejected'].includes(el.dataset.status)?el.dataset.status:'pending';state.adminReviewPage=1;state.adminReviewRetryOnly=false;await navigate('admin-reviews');return;}
  if(act==='admin-review-retry-only'){state.adminReviewRetryOnly=!state.adminReviewRetryOnly;state.adminReviewPage=1;await navigate('admin-reviews');return;}
  if(act==='admin-review-page'){if(el.disabled)return;state.adminReviewPage=Math.max(1,Math.min(1000000,Number(el.dataset.page)||1));await navigate('admin-reviews');return;}
  if(act==='edit-task'){state.taskEdit=el.dataset.id;await navigate('admin-tasks');document.querySelector('#task-form')?.scrollIntoView({behavior:'smooth'});return;}
  if(act==='reset-task'){state.taskEdit=null;await navigate('admin-tasks');return;}
  if(act==='delete-task'){
   if(!localizedConfirm('Xóa nhiệm vụ "'+el.dataset.title+'"? Nhiệm vụ sẽ biến mất khỏi danh sách Admin và thành viên. Lịch sử và số Lúa đã phát sinh vẫn được giữ; yêu cầu đã gửi vẫn có thể duyệt. Không thể bật lại nhiệm vụ đã xóa.'))return;
   await api('/api/admin/tasks/'+encodeURIComponent(el.dataset.id),'DELETE',{});
   if(state.taskEdit===el.dataset.id)state.taskEdit=null;
   toast('Đã xóa nhiệm vụ khỏi danh sách.');await navigate('admin-tasks');return;
  }
  if(act==='change-user'){
   let reason='',evidence='';
   const type=el.dataset.lockType==='confirmed'?'confirmed':'review';
   if(el.dataset.status==='suspended'){
    if(type==='confirmed'){
     reason=localizedPrompt('Ghi lý do xác định vi phạm nghiêm trọng (chỉ Admin xem; tối thiểu 10 ký tự):','Vi phạm nghiêm trọng quy định chống gian lận của Trạm Có Lúa.')||'';
     if(reason.trim().length<10)return;
     evidence=localizedPrompt('Nhập bằng chứng cụ thể đã đối chiếu (bắt buộc ít nhất 20 ký tự; không chỉ dựa vào IP trùng):','')||'';
     if(evidence.trim().length<20){toast('Cần mô tả bằng chứng cụ thể trước khi khóa vĩnh viễn.',true);return;}
     if(!localizedConfirm('XÁC NHẬN KHÓA VĨNH VIỄN? Khách sẽ thấy mẫu thông báo vi phạm nghiêm trọng. Chưa tự xóa Lúa hay tự từ chối mọi giao dịch.'))return;
    }else{
     reason=localizedPrompt('Nhập lý do tạm khóa để xác minh (tối thiểu 10 ký tự):','Hoạt động tài khoản cần được xác minh thêm.')||'';
     if(reason.trim().length<10)return;
     if(!localizedConfirm('Tạm khóa để xác minh và dừng duyệt/thanh toán khoản rút chưa hoàn tất?'))return;
    }
   }else if(!localizedConfirm(type==='confirmed'?'Đây là tài khoản đã bị khóa vĩnh viễn. Bạn chắc chắn muốn khôi phục tài khoản?':'Mở lại tài khoản và tiếp tục xử lý yêu cầu rút tiền?'))return;
   await api('/api/admin/users/'+encodeURIComponent(el.dataset.id),'PATCH',{
    status:el.dataset.status,suspension_type:type,suspension_reason:reason,suspension_evidence:evidence
   });
   toast('Đã cập nhật loại khóa tài khoản.');await navigate('admin-users');return;
  }
  if(act==='review'){
   const isReturnApproval=el.dataset.status==='approved'&&el.dataset.returnSignal==='1';
   let riskReason='';
   if(isReturnApproval&&el.dataset.fastReturn==='1'){
    riskReason=String(localizedPrompt('⚠️ Lượt quay về dưới 20 giây. Chỉ duyệt sau khi tự đối soát độc lập. Hãy nhập bằng chứng/lý do đối soát cụ thể (ít nhất 20 ký tự):','')||'').trim();
    if(riskReason.length<20){toast('Cần ít nhất 20 ký tự ghi rõ căn cứ đối soát; chưa cộng Lúa.',true);return;}
   }
   let selectedReward;
   if(el.dataset.status==='approved'&&el.dataset.colorsort==='1'){
     const rewardChoice=await new Promise(resolve=>{
       const modal=document.getElementById('modal-root');
       modal.innerHTML=`<div class="modal-cover"><section class="modal" role="dialog" aria-modal="true" aria-label="Chọn thưởng Color Sort">
         <h3>🎮 Duyệt Color Sort</h3><p class="note">Đối chiếu kết quả trong Color Sort trước khi chọn mức thưởng.</p>
         <div class="btn-row"><button type="button" class="btn" data-color-sort-reward="30">30 Lúa · Nhập mã</button>
         <button type="button" class="btn alt" data-color-sort-reward="40">40 Lúa · Nhập mã + Facebook</button></div>
         <button type="button" class="btn alt section" data-color-sort-cancel>Hủy</button></section></div>`;
       const onClick=event=>{
         const button=event.target.closest('[data-color-sort-reward],[data-color-sort-cancel]');
         if(!button||!modal.contains(button))return;
         modal.removeEventListener('click',onClick);
         modal.innerHTML='';
         resolve(button.hasAttribute('data-color-sort-cancel')?null:Number(button.dataset.colorSortReward));
       };
       modal.addEventListener('click',onClick);
     });
     if(rewardChoice===null)return;
     selectedReward=rewardChoice;
   }
   const retryAllowed=el.dataset.status==='rejected'&&el.dataset.app==='1'&&el.dataset.retry==='1';
   if(!localizedConfirm(isReturnApproval?
    'Bạn ĐÃ đối soát nguồn thu hợp lệ? Chỉ quay về trang đích KHÔNG chứng minh bên rút gọn đã tính tiền.':
    el.dataset.status==='approved'?'Duyệt và cộng Lúa cho nhiệm vụ?':retryAllowed?'Từ chối yêu cầu này và CHO PHÉP thành viên làm lại?':el.dataset.returnSignal==='1'?'Bạn đã đối soát kỹ và chắc chắn nhiệm vụ không hợp lệ? Không từ chối chỉ vì kết quả đối tác chưa cập nhật.':'Từ chối yêu cầu này và KHÓA lượt làm lại?'))return;
   await api('/api/admin/reviews/'+encodeURIComponent(el.dataset.id),'POST',{
    status:el.dataset.status,...(el.dataset.app==='1'&&el.dataset.status==='rejected'?{retry_allowed:retryAllowed}:{}),...(selectedReward?{reward:selectedReward}:{}),...(isReturnApproval?{revenue_confirmed:true}:{}),
    ...(riskReason?{risk_override_reason:riskReason}:{})
   });toast('Đã xử lý bằng chứng.');await afterAction('admin-reviews');return;
  }
  if(act==='allow-app-retry'){
    if(!localizedConfirm('Cho phép thành viên gửi lại nhiệm vụ App đã từ chối? Lịch sử từ chối được giữ nguyên, chưa cộng Lúa.'))return;
    await api('/api/admin/reviews/'+encodeURIComponent(el.dataset.id)+'/allow-retry','POST',{});
    toast('Đã cho phép làm lại nhiệm vụ App.');await afterAction('admin-reviews');return;
  }
  if(act==='erase-review-record'||act==='erase-all-processed-evidence'){
    const status=el.dataset.status,category=el.dataset.category,single=act==='erase-review-record';
    const count=single?1:Number(el.dataset.count);
    if(!['approved','rejected'].includes(status)||!['link','app','archive'].includes(category)||!Number.isSafeInteger(count)||count<1){toast('Mục xóa không hợp lệ. Hãy tải lại danh sách.',true);return;}
    const label=(status==='approved'?'Đã duyệt':'Từ chối')+' · '+({link:'Link',app:'App',archive:'Lưu trữ'})[category];
    if(!localizedConfirm('XÓA VĨNH VIỄN ảnh/nội dung bằng chứng và dọn '+count+' hồ sơ trong mục '+label+'? Không thể khôi phục bằng chứng. Không ảnh hưởng mục khác, số Lúa hoặc giới hạn lượt.'))return;
    if(!single){
      const required='XOA '+count;
      const answer=localizedPrompt('Để xác nhận xóa đúng '+count+' hồ sơ trong mục '+label+', nhập '+required+':','');
      if(answer!==required){toast('Đã hủy thao tác xóa.',true);return;}
    }
    const result=await api('/api/admin/reviews/erase-scoped','POST',{confirm:'DELETE_REVIEWED_EVIDENCE',expected_count:count,status,category,...(single?{id:el.dataset.id}:{})});
    toast(result.message);await afterAction('admin-reviews');return;
  }
  if(act==='withdraw-admin'){
   let note='',riskOverride='';
   if(['approved','paid'].includes(el.dataset.status)&&el.dataset.riskLevel==='serious'){
    riskOverride=localizedPrompt('⚠️ Tài khoản có nhiều tín hiệu rủi ro. Sau khi đối chiếu bằng chứng, nhập lý do cho phép duyệt/chi trả (ít nhất 20 ký tự):','')||'';
    if(riskOverride.trim().length<20)return;
   }
   if(el.dataset.status==='approved'){
     if(!localizedConfirm('Duyệt yêu cầu rút tiền này? Yêu cầu sẽ chuyển sang Đã duyệt, chưa phải đã thanh toán.'))return;
   }else if(el.dataset.status==='paid'){
     if(!localizedConfirm('Bạn đã CHUYỂN TIỀN THẬT đúng theo thông tin nhận và kiểm tra giao dịch thành công?'))return;
     note=localizedPrompt('Nhập mã giao dịch hoặc ghi chú đối chiếu thanh toán (bắt buộc):','')||'';
     if(!note.trim())return;
   }else if(el.dataset.status==='invalid_account'){
     if(!localizedConfirm('Xác nhận số tài khoản không đúng? Khách sẽ được thông báo và hoàn Lúa để gửi yêu cầu mới.'))return;
   }else{note=localizedPrompt('Nhập lý do từ chối (bắt buộc):','')||'';if(!note.trim())return;}
   await api('/api/admin/withdrawals/'+encodeURIComponent(el.dataset.id),'POST',{status:el.dataset.status,admin_note:note,risk_override_note:riskOverride});toast('Đã xử lý yêu cầu rút tiền.');await afterAction('admin-withdrawals');return;
  }
 }catch(err){toast(err.message,true);}
});
app.addEventListener('submit',async e=>{
 const form=e.target.closest('form[data-form]');if(!form)return;
 e.preventDefault();const kind=form.dataset.form;const b=formData(form),button=form.querySelector('button[type="submit"]');
 if(kind==='link-source-test'&&button?.disabled)return;
 if(button)button.disabled=true;
 try{
  if(kind==='link-return-captcha'){
   const c=state.returnChallenge;
   if(!c)throw new Error('Phiên xác minh không còn. Hãy mở lại nhiệm vụ.');
   try{
    const result=await api('/api/tasks/'+encodeURIComponent(c.taskId)+'/return','POST',{answer:b.answer,attempt_id:c.attemptId,...(c.linkSession?{link_session:c.linkSession}:{})});
    if(!result.ok||!['approved','pending','rejected'].includes(result.status))throw new Error('Máy chủ chưa xác nhận kết quả.');
    await finishLinkReturn({...result,reward:result.reward??state.memberTasks.find(t=>t.id===c.taskId)?.reward});
   }catch(err){
    if(err.confirmation_expired){
     await processLinkReturn();return;
    }
    if(err.status===422 && Number.isInteger(err.a) && Number.isInteger(err.b)){
     c.a=err.a;c.b=err.b;renderLinkReturnModal();
    }
    throw err;
   }
   return;
  }
  if(kind==='payout-account'){
   if(await handlePayoutAccountSubmit(kind,b,{api,toast,navigate:async()=>{state.savedManagerOpen=true;await navigate('withdrawals');}}))return;
  }
  if(kind.startsWith('card-')){
   if(await handleCardSubmit(kind,b,{api,toast,navigate}))return;
  }
  if(kind.startsWith('shop-')){
   if(await handleShopSubmit(kind,b,{api,toast,navigate,state}))return;
   if(await handleShopOrderSubmit(kind,b,{api,toast,navigate,state}))return;
  }
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
    if(await processLinkReturn())return;
    if(state.me?.user?.role==='member'&&resumeStoredReturn())return;
    renderShell();await navigate(state.me.user.role==='admin'?'admin-overview':'overview');toast(kind==='login'?'Đăng nhập thành công.':'Đăng ký thành công.');

  }
  if(kind==='password'){const r=await api('/api/me/password','POST',b);state.me=null;renderAuth();toast(r.message);}
  if(kind==='withdraw'){
    if(!b.saved_account_id&&b.bank_name==='other'&&!b.bank_other?.trim())throw new Error('Nhập tên ngân hàng nhận tiền.');
    const r=await api('/api/withdrawals','POST',{...b,amount:Number(b.amount)});
    let savedOk=false,saveError='';
    if(b.save_account_default==='1'&&!b.saved_account_id){
      const bank=b.bank_name==='other'?String(b.bank_other||'').trim():b.bank_name;
      const number=String(b.bank_account||'').trim();
      const owner=String(b.bank_owner||'').trim();
      try{
        const existing=state.savedPayoutAccounts.find(a=>a.payment_method===b.payment_method&&a.bank_name===bank&&a.account_number===number);
        if(existing)await api('/api/payout-accounts/'+encodeURIComponent(existing.id)+'/default','POST',{});
        else await api('/api/payout-accounts','POST',{payment_method:'bank',bank_name:bank,account_number:number,account_owner:owner,nickname:'',is_default:true});
        savedOk=true;
      }catch(e){saveError=e.message||'Không thể lưu tài khoản.';}
    }
    await afterAction('withdrawals');
    toast(saveError?'Yêu cầu rút đã gửi, nhưng chưa lưu được tài khoản: '+saveError:savedOk?'Đã gửi yêu cầu rút và lưu tài khoản nhận tiền mặc định.':r.message,!!saveError);
  }
  if(kind==='settings'){await api('/api/admin/settings','PUT',b);state.meta=await api('/api/meta');toast('Đã lưu cài đặt.');await navigate('admin-settings');}
  if(kind==='link-source-save'){
    await api('/api/admin/link-sources','POST',b);toast('Đã lưu nguồn rút gọn.');await navigate('admin-tasks');return;
  }
  if(kind==='link-source-quota'){
    await api('/api/admin/link-sources/quota','POST',b);toast('Đã lưu hạn mức riêng nguồn.');await navigate('admin-tasks');return;
  }
  if(kind==='link-source-test'){
    const output=form.querySelector('[data-source-result]');
    if(b.kind==='create'&&!localizedConfirm('Thao tác này tạo một link thật bên đối tác, không thưởng. Bạn muốn tạo một link kiểm thử mới?'))return;
    if(output)output.textContent='Đang kiểm tra...';
    try{const r=await api('/api/admin/link-sources/check','POST',b);if(output)output.textContent=JSON.stringify(r,null,2);}
    catch(error){if(output)output.textContent=error.message||'Kiểm tra thất bại';throw error;}return;
  }
  if(kind==='admin-task'){
    if(b.category==='link'&&!b.link_source_id){b.link_source_creation='manual';b.link_source_verification='manual';}

    if(b.category==='link'&&b.review_mode!=='manual')
      throw new Error('Link tự quay về phải chọn Admin kiểm tra bằng chứng; không tự cộng Lúa chỉ bằng phép tính.');
    const data={...b,reward:Number(b.reward),min_seconds:Number(b.min_seconds),is_active:b.is_active==='1'};
    const logoFile=document.getElementById('app-logo-file')?.files?.[0];
    const removeLogo=document.getElementById('app-logo-remove')?.checked;
    if(data.id)await api('/api/admin/tasks/'+encodeURIComponent(data.id),'PATCH',data);
    else {const created=await api('/api/admin/tasks','POST',data);data.id=created.id;}
    if(data.category==='app'&&(logoFile||removeLogo)){
      const logo=logoFile?await shrinkAppLogo(logoFile):'';
      await api('/api/admin/tasks/'+encodeURIComponent(data.id)+'/logo','PUT',{logo});
    }
    state.taskEdit=null;toast('Đã lưu nhiệm vụ vào cơ sở dữ liệu.');await navigate('admin-tasks');
  }
  if(kind==='task-claim'){
    const a=state.attempt;
    if(!a)throw new Error('Phiên nhiệm vụ không còn.');
    const photo=a.category==='app'&&!a.app_no_photo&&!a.app_simple_confirmation?await shrinkAppProof(b.photo):'';
    const r=await api('/api/tasks/'+encodeURIComponent(a.taskId)+'/submit','POST',{
      attempt_id:a.attempt_id,answer:b.answer,evidence:b.evidence||'',...(a.category==='app'?{photo}:{}) });
    state.attempt=null;document.getElementById('modal-root').innerHTML='';
    await afterAction('tasks');renderTaskResultModal(r);
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
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkApprovedTaskPopups().catch(()=>{});});
window.addEventListener('pageshow',()=>checkApprovedTaskPopups().catch(()=>{}));
window.addEventListener('focus',()=>checkApprovedTaskPopups().catch(()=>{}));
boot();
