// Trang đổi thẻ cào: mã thẻ chỉ hiển thị cho thành viên đã được phát thẻ.
const cardStatus={pending:'Chờ duyệt',approved:'Đã duyệt – Chờ phát thẻ',delivered:'Đã nhận thẻ',rejected:'Từ chối – Hoàn Lúa'};
const money=v=>Number(v||0).toLocaleString('vi-VN');
const ask=msg=>window.confirm(window.TramI18n?.translateLabel?.(msg)??msg);
export async function cardRedemptionsPage(ctx){
 const {api,esc,heading,dt}=ctx;
 let data;
 try{data=await api('/api/card-redemptions');}
 catch(err){
   return `<div class="cards-page">${heading('🎁 Đổi Lúa lấy thẻ cào','Tính năng này đang được chuẩn bị.')}
    <div class="cards-warning" role="status">⚠️ Chưa tải được chức năng đổi thẻ cào. Tính năng có thể đang chờ thiết lập hoặc kết nối máy chủ gặp sự cố. Vui lòng thử lại sau; ví Lúa của bạn không bị thay đổi bởi việc mở trang.</div></div>`;
 }
 const rate=Number(data.rate||0),items=data.redemptions||[];
 const options=(data.denominations||[]).map(v=>{
   const lua=v*rate;
   return `<option value="${v}">${money(v)}đ — ${rate?money(lua)+' Lúa':'Chưa có tỷ giá'}</option>`;
 }).join('');
 return `<div class="cards-page">
  ${heading('🎁 Đổi Lúa lấy thẻ cào','Đổi Lúa thành thẻ cào điện thoại. Mã thẻ chỉ hiện cho tài khoản đã được phát thẻ.')}
  <div class="cards-hero"><div><span class="cards-hero-kicker">TRẠM CÓ LÚA • THẺ ĐIỆN THOẠI</span><h2>Đổi Lúa, nhận thẻ cào 🌾</h2>
    <p>Chọn nhà mạng và mệnh giá. Admin kiểm tra và phát mã thẻ thật; website không tự tạo mã thẻ.</p></div>
    <div class="cards-hero-icon" aria-hidden="true">🎁</div></div>
  ${!data.enabled?`<div class="cards-warning" role="status">⚠️ Chức năng đổi thẻ cào chưa được Admin mở. Bạn vẫn có thể xem lịch sử thẻ đã đổi ở phía dưới.</div>`:''}
  <div class="cards-columns">
   <form class="card cards-exchange-form" data-form="card-redeem">
     <h3>Chọn thẻ cào muốn đổi</h3>
     <label for="card-carrier">Nhà mạng</label><select id="card-carrier" name="carrier" required ${data.enabled?'':'disabled'}>
       ${(data.carriers||[]).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
     </select>
     <label for="card-value">Mệnh giá thẻ cào</label><select id="card-value" name="denomination_vnd" required ${data.enabled?'':'disabled'}>${options}</select>
     <div class="cards-balance"><span>🌾 Số dư Lúa hiện có</span><strong>${money(data.balance)} Lúa</strong></div>
     <p class="cards-note">Tỷ giá đổi hiện tại: ${rate?money(rate)+' Lúa = 1 VNĐ':'Chưa thiết lập'}. Số Lúa cần đổi được tính theo mệnh giá và tỷ giá hiện hành. Khi gửi yêu cầu, Lúa được giữ tạm để tránh đổi trùng.</p>
     <button class="btn cards-primary" type="submit" ${data.enabled?'':'disabled'}>🎁 Gửi yêu cầu đổi thẻ</button>
     <p class="cards-note">Chỉ nhập yêu cầu khi bạn muốn đổi thật. Nếu Admin từ chối, hệ thống hoàn đủ Lúa về ví. Mã thẻ chỉ được hiển thị sau khi phát thành công.</p>
   </form>
   <section class="card cards-howto"><h3>Quy trình nhận thẻ</h3>
     <ol><li><b>Gửi yêu cầu</b><span>Chọn nhà mạng và mệnh giá phù hợp với số Lúa.</span></li>
      <li><b>Admin duyệt</b><span>Yêu cầu được kiểm tra; Lúa đã được giữ tạm.</span></li>
      <li><b>Nhận mã thẻ</b><span>Khi Admin phát thẻ thật, bạn xem seri và mã nạp ở lịch sử bên dưới.</span></li></ol>
     <p class="cards-note">Không chia sẻ mã thẻ hoặc seri với người khác. Website không tự nạp tiền vào điện thoại.</p>
   </section>
  </div>
  <div class="cards-section-head"><h3>Lịch sử đổi thẻ cào</h3><span>${items.length} yêu cầu</span></div>
  ${items.length?`<div class="cards-history">${items.map(i=>`<article class="cards-item"><div class="cards-item-top"><strong>🎁 ${esc(i.carrier)} • ${money(i.denomination_vnd)}đ</strong><span class="cards-status cards-status-${esc(i.status)}">${cardStatus[i.status]||'Đang xử lý'}</span></div>
    <div class="cards-meta"><span>🌾 ${money(i.amount_lua)} Lúa</span><span>${esc(dt(i.created_at))}</span></div>
    ${i.status==='delivered'&&i.card_details?`<details class="cards-secret"><summary>🔐 Xem seri và mã thẻ đã nhận</summary><div class="cards-secret-panel">
      <div><small>Seri thẻ</small><code>${esc(i.card_details.serial)}</code><button type="button" class="btn alt sm" data-action="copy" data-value="${esc(i.card_details.serial)}">Sao chép seri</button></div>
      <div><small>Mã nạp thẻ</small><code>${esc(i.card_details.pin)}</code><button type="button" class="btn alt sm" data-action="copy" data-value="${esc(i.card_details.pin)}">Sao chép mã thẻ</button></div>
      <p class="cards-note">Mã chỉ dành cho tài khoản của bạn. Hãy giữ bí mật mã thẻ.</p></div></details>`:''}
    ${i.delivery_error?`<div class="cards-warning">${esc(i.delivery_error)}</div>`:''}
    ${i.status==='rejected'?`<p class="cards-refunded">Đơn bị từ chối; Lúa đã được hoàn vào ví.</p>`:''}
  </article>`).join('')}</div>`:`<div class="card cards-empty">Chưa có yêu cầu đổi thẻ cào nào.</div>`}
 </div>`;
}
export async function adminCardRedemptionsPage(ctx){
 const {api,esc,heading,dt}=ctx;
 let data;
 try{data=await api('/api/admin/card-redemptions');}
 catch(err){
   return `<div class="cards-page">${heading('🎁 Quản lý đổi thẻ cào','Cài đặt và xét duyệt yêu cầu đổi thẻ.')}
    <div class="cards-warning" role="status">⚠️ Không tải được quản lý thẻ cào. Hãy kiểm tra kết nối máy chủ và bảo đảm đã sao lưu D1, chạy migrations/0005_cards.sql trong Cloudflare D1 Console trước khi bật dịch vụ.</div></div>`;
 }
 const items=data.redemptions||[];
 const ready=data.secret_ready&&data.rate>0;
 return `<div class="cards-page cards-admin">
  ${heading('🎁 Quản lý đổi thẻ cào','Admin bật/tắt nhận yêu cầu, xét duyệt và phát mã thẻ thật cho đúng thành viên.')}
  <div class="card cards-admin-settings">
    <h3>Cấu hình dịch vụ đổi thẻ</h3>
    <div class="cards-meta"><span>Khóa bảo mật mã thẻ: <b>${data.secret_ready?'Đã thiết lập':'Chưa thiết lập'}</b></span><span>Tỷ giá: <b>${data.rate?money(data.rate)+' Lúa = 1 VNĐ':'Chưa có tỷ giá'}</b></span></div>
    ${!ready?`<div class="cards-warning">⚠️ Cần đặt CARD_VOUCHER_SECRET an toàn trong Cloudflare và tỷ giá Lúa/VNĐ trong Cài đặt trước khi bật. Không phát thẻ nếu chưa có mã thật.</div>`:''}
    <form data-form="card-settings" class="cards-settings-row">
      <label for="card-enabled">Trạng thái nhận yêu cầu đổi thẻ</label>
      <select id="card-enabled" name="enabled">
       <option value="0" ${data.enabled?'':'selected'}>Tạm tắt (an toàn)</option>
       <option value="1" ${data.enabled?'selected':''} ${ready?'':'disabled'}>Bật nhận yêu cầu</option>
      </select>
      <button type="submit" class="btn">Lưu cấu hình đổi thẻ</button>
    </form>
    <p class="cards-note">Các nhà mạng: Viettel, VinaPhone, MobiFone. Mệnh giá: 10.000đ, 20.000đ, 50.000đ, 100.000đ, 200.000đ. Bạn cần chuẩn bị sẵn thẻ thật. Lúa được hoàn khi từ chối.</p>
    <div class="cards-key-setup"><strong>🔐 Thiết lập khóa mã thẻ trên iPhone</strong>
     <p>Nhấn tạo khóa để sao chép một giá trị bí mật ngẫu nhiên. Dán vào Cloudflare Workers → Settings → Variables and Secrets với tên <code>CARD_VOUCHER_SECRET</code>. Không gửi khóa cho ai, không đăng công khai và không đổi khóa sau khi đã phát thẻ.</p>
     <button class="btn alt" type="button" data-action="card-generate-key">🔑 Tạo và sao chép khóa bí mật</button>
    </div>
  </div>
  <div class="cards-warning" role="note">⚠️ Kiểm tra Chống gian lận và đối chiếu tài khoản trước khi phát thẻ, vì mã thẻ sau khi phát không thể thu hồi.</div>
  <div class="cards-section-head"><h3>Yêu cầu đổi thẻ từ thành viên</h3><span>${items.length} yêu cầu</span></div>
  ${items.length?`<div class="cards-history">${items.map(i=>`<article class="card cards-admin-item">
   <div class="cards-item-top"><strong>${esc(i.carrier)} • ${money(i.denomination_vnd)}đ</strong><span class="cards-status cards-status-${esc(i.status)}">${cardStatus[i.status]||'Đang xử lý'}</span></div>
   <p><strong>${esc(i.name)}</strong> <span class="cards-light">(${esc(i.email)})</span></p>
   <div class="cards-meta"><span>Giữ: ${money(i.amount_lua)} Lúa</span><span>${esc(dt(i.created_at))}</span></div>
   ${i.account_status!=='active'&&['pending','approved'].includes(i.status)?'<p class="cards-warning">Tài khoản tạm khóa, không thể duyệt hoặc phát thẻ.</p>':''}
   ${i.status==='pending'?`<div class="cards-admin-actions"><button type="button" class="btn" data-action="card-admin-approve" data-id="${esc(i.id)}" ${i.account_status==='active'?'':'disabled'}>✓ Duyệt yêu cầu</button><button type="button" class="btn danger" data-action="card-admin-reject" data-id="${esc(i.id)}">Từ chối, hoàn Lúa</button></div>`:''}
   ${i.status==='approved'?`<form data-form="card-deliver" class="cards-deliver-form">
    <input type="hidden" name="id" value="${esc(i.id)}">
    <label for="serial-${esc(i.id)}">Seri thẻ ${esc(i.carrier)}</label>
    <input id="serial-${esc(i.id)}" name="serial" maxlength="40" minlength="6" autocomplete="off" required placeholder="Nhập seri trên thẻ thật">
    <label for="pin-${esc(i.id)}">Mã nạp thẻ (PIN)</label>
    <input id="pin-${esc(i.id)}" name="pin" maxlength="40" minlength="8" autocomplete="off" required placeholder="Nhập mã nạp của thẻ thật">
    <button type="submit" class="btn" ${i.account_status==='active'&&data.secret_ready?'':'disabled'}>🎁 Đã có thẻ thật – Phát mã cho khách</button>
    <p class="cards-note">Website mã hóa mã thẻ trước khi lưu. Chỉ thành viên này mới xem được sau khi bạn phát.</p>
   </form><div class="cards-admin-actions"><button type="button" class="btn danger" data-action="card-admin-reject" data-id="${esc(i.id)}">Từ chối, hoàn Lúa</button></div>`:''}
   ${i.status==='delivered'?'<p class="cards-success">✓ Đã phát mã thẻ cho thành viên. Mã không hiển thị lại tại trang Admin.</p>':''}
   ${i.status==='rejected'?'<p class="cards-refunded">Đã hoàn Lúa cho thành viên.</p>':''}
  </article>`).join('')}</div>`:`<div class="card cards-empty">Chưa có yêu cầu đổi thẻ nào.</div>`}
 </div>`;
}
export async function handleCardAction(action,el,ctx){
 if(action==='card-generate-key'){
   if(!window.crypto?.getRandomValues)throw Error('Trình duyệt không hỗ trợ tạo khóa an toàn.');
   const random=window.crypto.getRandomValues(new Uint8Array(32));
   const key=[...random].map(v=>v.toString(16).padStart(2,'0')).join('');
   await navigator.clipboard.writeText(key);
   ctx.toast('Đã sao chép khóa bí mật 64 ký tự. Dán vào CARD_VOUCHER_SECRET trong Cloudflare và giữ bí mật.');
   return true;
 }
 if(!['card-admin-approve','card-admin-reject'].includes(action))return false;
 const {api,toast,navigate}=ctx;
 const rid=el.dataset.id||'';
 if(!rid)return true;
 let body;
 if(action==='card-admin-approve'){
   if(!ask('Đã kiểm tra yêu cầu, số dư Lúa và tài khoản hợp lệ? Đây chỉ là duyệt, chưa phát mã thẻ.'))return true;
   body={action:'approved'};
 }else{
   const note=window.prompt(window.TramI18n?.translateLabel?.('Nhập lý do từ chối đổi thẻ:')??'Nhập lý do từ chối đổi thẻ:','')||'';
   if(note.trim().length<6)return true;
   if(!ask('Từ chối yêu cầu và hoàn đủ Lúa về ví khách?'))return true;
   body={action:'rejected',note:note.trim()};
 }
 const response=await api('/api/admin/card-redemptions/'+encodeURIComponent(rid),'POST',body);
 toast(response.message);await navigate('admin-cards');return true;
}
export async function handleCardSubmit(kind,b,ctx){
 if(!['card-redeem','card-settings','card-deliver'].includes(kind))return false;
 const {api,toast,navigate}=ctx;
 let response;
 if(kind==='card-redeem'){
   if(!ask('Xác nhận đổi Lúa lấy thẻ cào? Lúa sẽ được giữ tạm và chờ Admin phát mã thẻ.'))return true;
   response=await api('/api/card-redemptions','POST',{carrier:b.carrier,denomination_vnd:Number(b.denomination_vnd)});
   toast(response.message);await navigate('cards');
 }else if(kind==='card-settings'){
   response=await api('/api/admin/card-redemptions/settings','POST',{enabled:b.enabled});
   toast(response.message);await navigate('admin-cards');
 }else{
   if(!ask('Bạn đã kiểm tra đây là seri và mã nạp THẺ THẬT chưa dùng? Phát mã sẽ không thể thu hồi.'))return true;
   response=await api('/api/admin/card-redemptions/'+encodeURIComponent(b.id),'POST',{
     action:'delivered',serial:String(b.serial||'').trim(),pin:String(b.pin||'').trim()
   });
   toast(response.message);await navigate('admin-cards');
 }
 return true;
}
