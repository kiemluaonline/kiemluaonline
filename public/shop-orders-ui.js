export function shopOrderMeta(status) {
 const names={pending:'Chờ xác minh',provisional:'Tạm duyệt – Chờ giải quyết',resolved:'Đã giải quyết',rejected:'Từ chối'};
 return {text:names[status]||'Không xác định',symbol:({pending:'⌛',provisional:'🔎',resolved:'🌾',rejected:'✕'})[status]||'•',color:status||'pending'};
}

export function shopOrderSteps(status) {
 const steps=[['pending','Chờ xác minh'],['provisional','Tạm duyệt – Chờ giải quyết'],['resolved','Đã giải quyết']];
 const current=status==='pending'?0:status==='provisional'?1:status==='resolved'?2:-1;
 return `<div class="sorder-steps" aria-label="Tiến trình đơn hàng">${steps.map(([s,label],i)=>`<div class="sorder-step ${current>=i?'is-done':''} ${current===i?'is-current':''}"><span>${current>i||status==='resolved'?'✓':i+1}</span><small>${label}</small></div>`).join('')}</div>`;
}

export async function shopOrdersPage(ctx){
 const {api,esc,heading,fmt,dt}=ctx;
 const [info,alerts]=await Promise.all([api('/api/shop/orders'),api('/api/shop/orders/alerts')]);
 if(alerts.unread)await api('/api/shop/orders/read','POST',{}).catch(()=>{});
 const orders=info.orders||[],history=info.events||[];
 const accrued=orders.filter(x=>x.status==='resolved').reduce((s,x)=>s+Number(x.reward_lua||0),0);
 const pending=orders.filter(x=>['pending','provisional'].includes(x.status)).length;
 return `<div class="sorder-page">${heading('Đơn hàng & Lúa','Theo dõi đơn hàng, Lúa dự kiến và số Lúa thực nhận khi đơn đã được giải quyết.')}
   <section class="sorder-summary">
    <div class="sorder-summary-card"><span>🛍️ Đơn đã báo</span><strong>${fmt(orders.length)}</strong><small>Đang lưu trong tài khoản</small></div>
    <div class="sorder-summary-card"><span>⌛ Đang xử lý</span><strong>${fmt(pending)}</strong><small>Chờ xác minh / giải quyết</small></div>
    <div class="sorder-summary-card sorder-summary-lua"><span>🌾 Lúa từ mua sắm</span><strong>${fmt(accrued)}</strong><small>Chỉ tính đơn đã giải quyết</small></div>
   </section>
   <section class="sorder-intro"><div><strong>Bạn đã mua sản phẩm trên TikTok Shop?</strong><p>Hãy quay về gian hàng, chọn đúng sản phẩm rồi bấm <b>“Báo đã đặt hàng”</b> và nhập mã đơn trong TikTok. Trạm Có Lúa sẽ ghi nhận <b>Chờ xác minh</b>. Admin cần đối chiếu đơn trước khi xác nhận thưởng.</p></div><button type="button" class="btn" data-go="shop">🛍️ Đến gian hàng</button></section>
   ${alerts.unread?`<div class="sorder-notice" role="status">🔔 Bạn có ${fmt(alerts.unread)} đơn hàng vừa được cập nhật trạng thái. Xem chi tiết bên dưới.</div>`:''}
   <div class="sorder-section-heading"><h2>Lịch sử đơn hàng</h2><span>${fmt(orders.length)} đơn</span></div>
   ${orders.length?`<div class="sorder-list">${orders.map(o=>{const meta=shopOrderMeta(o.status);const events=history.filter(e=>e.order_id===o.id).reverse();
     return `<article class="sorder-card"><div class="sorder-card-top"><div><span class="sorder-eyebrow">MÃ ĐƠN TIKTOK</span><strong>${esc(o.order_reference)}</strong></div><span class="sorder-status sorder-status-${meta.color}">${meta.symbol} ${meta.text}</span></div>
       <div class="sorder-product"><span>🛒</span><div><strong>${esc(o.product_title)}</strong><small>Báo đơn: ${esc(dt(o.created_at))}</small></div></div>
       ${o.status==='rejected'?`<div class="sorder-rejection">Đơn hàng không đủ điều kiện nhận Lúa.</div>`:shopOrderSteps(o.status)}
       ${o.status==='resolved'
         ?`<div class="sorder-award"><span>🌾 Lúa đã nhận</span><strong>+${fmt(o.reward_lua)} Lúa</strong></div>`
         :o.status==='provisional'&&Number(o.estimated_reward_lua)>0
           ?`<div class="sorder-estimate" aria-label="Lúa dự kiến chưa chính thức">
              <div class="sorder-estimate-head"><span>🌾 Lúa dự kiến nhận</span><span class="sorder-estimate-sparkle">✦</span></div>
              <div class="sorder-estimate-amount">~ ${fmt(o.estimated_reward_lua)} <small>Lúa</small></div>
              <div class="sorder-estimate-wallet">♧ Chưa cộng vào ví Lúa</div>
              <p><strong>Lưu ý:</strong> Số Lúa trên chỉ là dự kiến, có thể tăng hoặc giảm tùy theo kết quả giải quyết đơn hàng. Lúa chính thức chỉ được cập nhật khi đơn hàng đã giải quyết. Đơn không đủ điều kiện sẽ không được nhận thưởng.</p>
             </div>`
           :`<div class="sorder-wait">Chưa ghi Lúa vào ví. ${o.status==='provisional'?'Chưa có số Lúa dự kiến; đơn hàng đang chờ giải quyết.':o.status==='rejected'?'Đơn không đủ điều kiện nhận thưởng.':'Admin cần xác minh đơn hàng.'}</div>`}
       <details class="sorder-timeline"><summary>Xem lịch sử xử lý <span>⌄</span></summary><ol>${events.map(e=>`<li><strong>${shopOrderMeta(e.status).text}</strong><small>${esc(dt(e.created_at))}</small><p>${e.status==='pending'?'Đã tiếp nhận ID đơn hàng.':e.status==='provisional'?'Đã tạm duyệt và đang chờ giải quyết.':e.status==='resolved'?'Đơn đã giải quyết, Lúa chính thức đã ghi vào ví.':e.status==='rejected'?'Đơn không đủ điều kiện nhận thưởng.':'Trạng thái đã cập nhật.'}</p></li>`).join('')}</ol></details>
       </article>`;
   }).join('')}</div>`:`<div class="sorder-empty"><span>📦</span><h3>Chưa có đơn hàng nào</h3><p>Khi mua sản phẩm trong gian hàng, hãy bấm “Báo đã đặt hàng” để lưu đơn tại đây.</p><button type="button" class="btn" data-go="shop">Xem sản phẩm →</button></div>`}
   <div class="sorder-footnote">Lịch sử đơn hàng này được quản lý trên Trạm Có Lúa, không phải trạng thái TikTok cập nhật trực tiếp. Bạn không cần gửi ảnh lên website. Lúa chính thức chỉ được ghi nhận khi đơn hàng đã được xác minh và giải quyết hợp lệ.</div>
  </div>`;
}

export async function adminShopOrdersPage(ctx){
 const {api,esc,heading,fmt,dt}=ctx;
 const data=await api('/api/admin/shop/orders');
 const orders=data.orders||[];
 const pending=orders.filter(x=>x.status==='pending').length;
 const waiting=orders.filter(x=>x.status==='provisional').length;
 const rate=Number(data.lua_per_vnd||0);
 return `<div class="sorder-page sorder-admin">${heading('Duyệt đơn TikTok Shop','Đối chiếu đơn trong TikTok Affiliate trước khi thay đổi trạng thái. Chỉ cộng Lúa khi hoa hồng đã được quyết toán.')}
   <section class="sorder-summary"><div class="sorder-summary-card"><span>⌛ Chờ xác minh</span><strong>${fmt(pending)}</strong></div><div class="sorder-summary-card"><span>🔎 Chờ giải quyết</span><strong>${fmt(waiting)}</strong></div><div class="sorder-summary-card sorder-summary-lua"><span>🌾 Đã giải quyết</span><strong>${fmt(orders.filter(x=>x.status==='resolved').length)}</strong></div></section>
   <div class="sorder-admin-warning"><strong>⚠️ Kiểm tra thủ công trên TikTok Shop</strong><p>ID do khách nhập chỉ là thông tin khai báo. Để <b>tạm duyệt</b>, hãy kiểm tra đúng ID đơn hàng và sản phẩm trong TikTok Affiliate. <b>Không bắt buộc hàng đã giao hoặc đã thanh toán ở bước này.</b> Chỉ chọn <b>Đã giải quyết & cộng Lúa</b> sau khi hàng được giao, đã thanh toán và hoa hồng Affiliate đã quyết toán hợp lệ. Đơn bị hủy/hoàn hoặc không đủ điều kiện phải từ chối.</p></div>
   ${rate>0?`<p class="sorder-admin-rate">Tỷ giá nội bộ hiện tại: <b>${fmt(rate)} Lúa = 1 VNĐ</b>. Chỉ Admin nhìn thấy tỷ giá và hoa hồng.</p>`:`<p class="sorder-admin-rate sorder-rate-alert">⚠ Chưa cài tỷ giá Lúa/VNĐ. Trước khi giải quyết để cộng Lúa, hãy vào Cài đặt Admin nhập tỷ giá.</p>`}
   <div class="sorder-section-heading"><h2>Đơn hàng cần xử lý</h2><span>${fmt(orders.length)} đơn đã ghi nhận</span></div>
   ${orders.length?`<div class="sorder-admin-list">${orders.map(o=>{const meta=shopOrderMeta(o.status);return `<article class="sorder-admin-card"><div class="sorder-card-top"><div><span class="sorder-eyebrow">ĐƠN TIKTOK</span><strong>${esc(o.order_reference)}</strong></div><span class="sorder-status sorder-status-${meta.color}">${meta.symbol} ${meta.text}</span></div>
     <p><b>${esc(o.name)}</b> · ${esc(o.email)}</p><p>🛍️ <b>${esc(o.product_title)}</b></p><p>📅 ${esc(dt(o.created_at))}</p>${o.customer_note?`<p>Ghi chú khách: ${esc(o.customer_note)}</p>`:''}
     ${o.status==='pending'?`<form class="sorder-admin-form" data-form="shop-order-provisional"><input type="hidden" name="id" value="${esc(o.id)}">
       <label for="shop-verify-${esc(o.id)}">Kết quả kiểm tra ID đơn hàng (chỉ Admin xem)</label><textarea id="shop-verify-${esc(o.id)}" name="admin_note" minlength="10" maxlength="300" required placeholder="Đã tìm thấy đúng ID đơn và sản phẩm trong TikTok Affiliate. Đơn đang chờ hoàn tất..."></textarea>
       <label for="shop-estimate-${esc(o.id)}">🌾 Lúa dự kiến nhận (chỉ Admin nhập)</label>
       <input id="shop-estimate-${esc(o.id)}" name="estimated_reward_lua" type="number" inputmode="numeric" min="1" max="10000000" step="1" required placeholder="Ví dụ 2000">
       <p class="sorder-estimate-help">Khách sẽ thấy Lúa dự kiến kèm thông báo “có thể tăng hoặc giảm”. Chưa cộng ví và không công khai hoa hồng.</p>
       <button class="btn" type="submit">✓ Tạm duyệt – Chờ giải quyết</button></form>`:''}
     ${o.status==='provisional'?`<div class="sorder-admin-state">Đã kiểm tra ID: ${esc(o.verification_note||'Đơn hàng đang chờ hoàn tất và giải quyết hoa hồng.')}</div>
       <div class="sorder-admin-estimate">🌾 Lúa dự kiến đang hiển thị cho khách: <strong>${Number(o.estimated_reward_lua)>0?`~ ${fmt(o.estimated_reward_lua)} Lúa`:'Chưa thiết lập'}</strong><small>Chưa cộng ví. Số Lúa thực tế khi quyết toán có thể khác.</small></div>
       <form class="sorder-admin-form sorder-edit-estimate" data-form="shop-order-estimate">
         <input type="hidden" name="id" value="${esc(o.id)}">
         <label for="shop-estimate-update-${esc(o.id)}">Cập nhật Lúa dự kiến (không ảnh hưởng ví)</label>
         <input id="shop-estimate-update-${esc(o.id)}" name="estimated_reward_lua" type="number" inputmode="numeric" min="1" max="10000000" step="1" required value="${Number(o.estimated_reward_lua)||''}" placeholder="Ví dụ 2000">
         <button type="submit" class="btn alt">✎ Cập nhật Lúa dự kiến</button>
       </form>
       <form class="sorder-admin-form sorder-settle-form" data-form="shop-order-resolve">
         <input type="hidden" name="id" value="${esc(o.id)}">
         <label for="shop-settlement-${esc(o.id)}">Mã đơn / mã đối soát TikTok đã giải quyết</label><input id="shop-settlement-${esc(o.id)}" name="settled_reference" minlength="8" maxlength="90" required placeholder="Mã trong danh sách đơn Affiliate">
         <label for="shop-commission-${esc(o.id)}">Hoa hồng THỰC NHẬN (VNĐ) – chỉ Admin thấy</label><input id="shop-commission-${esc(o.id)}" name="commission_vnd" type="number" inputmode="numeric" min="1" max="1000000000" required placeholder="Ví dụ 10000">
         <label for="shop-reward-${esc(o.id)}">Lúa thưởng cho khách – chỉ Admin nhập</label><input id="shop-reward-${esc(o.id)}" name="reward_lua" type="number" inputmode="numeric" min="1" max="10000000" required placeholder="Ví dụ 3000">
         <label class="sorder-final-check"><input type="checkbox" name="delivery_paid_confirmed" value="1" required> Tôi đã đối chiếu: hàng đã giao, đã thanh toán, không bị hoàn/hủy và hoa hồng TikTok Affiliate đã quyết toán hợp lệ.</label><p class="note">Đây là bước cuối; chỉ ghi Lúa thực tế vào ví một lần duy nhất.</p>
         <button type="submit" class="btn shop-settle-btn" ${rate>0?'':'disabled'}>🌾 Đã giải quyết & cộng Lúa</button>
       </form>`:''}
     ${o.status==='pending'||o.status==='provisional'?`<form class="sorder-admin-form sorder-reject-form" data-form="shop-order-reject"><input type="hidden" name="id" value="${esc(o.id)}"><label for="shop-reject-${esc(o.id)}">Nếu từ chối, nhập lý do</label><textarea id="shop-reject-${esc(o.id)}" name="reason" minlength="6" maxlength="300" required placeholder="Đơn bị huỷ, hoàn tiền hoặc không thuộc link Affiliate..."></textarea><button type="submit" class="btn danger">Từ chối đơn</button></form>`:''}
     ${o.status==='resolved'?`<div class="sorder-award"><span>Đã ghi vào ví: <b>${esc(o.name)}</b></span><strong>+${fmt(o.reward_lua)} Lúa</strong></div><div class="sorder-admin-state">Hoa hồng thực nhận: ${fmt(o.commission_vnd)} VNĐ · Mã đối soát: ${esc(o.settled_reference)}</div>`:''}
     ${o.status==='rejected'?`<div class="sorder-rejection">Đã từ chối: ${esc(o.admin_note||'Không đủ điều kiện.')}</div>`:''}
     </article>`;}).join('')}</div>`:`<div class="sorder-empty"><span>📭</span><h3>Chưa có khách báo đơn hàng</h3><p>Khi khách báo mã đơn từ gian hàng, yêu cầu sẽ xuất hiện ở đây.</p></div>`}
   </div>`;
}

export async function handleShopOrderAction(action,el,ctx){
 const {esc}=ctx;
 if(action!=='shop-report-order')return false;
 const id=el.dataset.id||'',name=el.dataset.title||'Sản phẩm TikTok Shop';
 const root=document.getElementById('modal-root');
 root.innerHTML=`<div class="modal-cover"><section class="modal sorder-report-modal" role="dialog" aria-modal="true" aria-label="Báo đã đặt hàng">
   <button class="close" type="button" data-action="close-modal" aria-label="Đóng">×</button>
   <div class="sorder-report-icon">🛍️</div><h3>Báo đã đặt hàng</h3><p><b>${esc(name)}</b></p>
   <p>Đã mua trên TikTok? Hãy mở <b>TikTok → Đơn hàng → Chi tiết đơn</b>, sao chép mã đơn và điền dưới đây. Việc báo đơn chưa có nghĩa là đã được xác minh.</p>
   <form data-form="shop-order-report" class="sorder-admin-form">
     <input type="hidden" name="product_id" value="${esc(id)}">
     <label for="sorder-report-id">Mã đơn hàng TikTok <span aria-hidden="true">*</span></label><input id="sorder-report-id" name="order_reference" required minlength="8" maxlength="64" placeholder="Mã đơn trong TikTok Shop">
     <label for="sorder-report-note">Ghi chú thêm (không bắt buộc)</label><textarea id="sorder-report-note" name="note" maxlength="220" placeholder="Ngày đặt hoặc thông tin giúp Admin kiểm tra..."></textarea>
     <button type="submit" class="btn">Gửi xác minh đơn hàng</button>
   </form>
   <p class="note">Không tải ảnh lên website. Đơn đang báo sẽ xuất hiện trong mục Đơn hàng & Lúa.</p>
   </section></div>`;
 root.querySelector('#sorder-report-id')?.focus();
 return true;
}

export async function handleShopOrderSubmit(kind,b,ctx){
 const {api,toast,navigate}=ctx;
 if(!kind.startsWith('shop-order-'))return false;
 if(kind==='shop-order-report'){
  const result=await api('/api/shop/orders','POST',{product_id:b.product_id,order_reference:b.order_reference,note:b.note||''});
  document.getElementById('modal-root').innerHTML='';
  toast(result.message);await navigate('shop-orders');return true;
 }
 if(!['shop-order-provisional','shop-order-estimate','shop-order-resolve','shop-order-reject'].includes(kind))return false;
 const id=encodeURIComponent(b.id||'');
 if(!b.id)throw new Error('Không xác định được đơn hàng.');
 let payload;
 if(kind==='shop-order-provisional'){
  if(!confirm('Đã đối chiếu đúng ID đơn hàng và sản phẩm trong TikTok Affiliate? Tạm duyệt KHÔNG yêu cầu đã giao hoặc thanh toán và KHÔNG cộng Lúa.'))return true;
  payload={status:'provisional',admin_note:b.admin_note,estimated_reward_lua:Number(b.estimated_reward_lua)};
 }else if(kind==='shop-order-estimate'){
  if(!confirm('Cập nhật số Lúa dự kiến cho khách? Đây chỉ là số ước tính, chưa cộng vào ví.'))return true;
  payload={status:'estimate',estimated_reward_lua:Number(b.estimated_reward_lua)};
 }else if(kind==='shop-order-resolve'){
  if(!confirm('XÁC NHẬN CUỐI: Hàng đã giao, đã thanh toán, không bị hoàn/hủy và hoa hồng TikTok đã quyết toán hợp lệ? Số Lúa thực tế sẽ được cộng vào ví đúng một lần.'))return true;
  payload={status:'resolved',commission_vnd:Number(b.commission_vnd),reward_lua:Number(b.reward_lua),settled_reference:b.settled_reference,delivery_paid_confirmed:b.delivery_paid_confirmed==='1'};
 }else{
  if(!confirm('Xác nhận từ chối đơn này và không thưởng Lúa?'))return true;
  payload={status:'rejected',reason:b.reason};
 }
 const result=await api('/api/admin/shop/orders/'+id,'POST',payload);
 toast(result.message);await navigate('admin-shop-orders');return true;
}
