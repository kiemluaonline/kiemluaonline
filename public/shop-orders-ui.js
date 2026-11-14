export function shopOrderMeta(status) {
 const entries={
  pending:{text:'Chờ xác minh',symbol:'⌛',color:'pending',summary:'Đã tiếp nhận ID đơn hàng của bạn. Hệ thống đang chờ Admin kiểm tra và xác nhận thông tin.',rewardLabel:'Lúa chưa xác định'},
  provisional:{text:'Tạm duyệt – Chờ giải quyết',symbol:'◷',color:'provisional',summary:'ID đơn hàng đã được xác minh hợp lệ. Đơn đang được theo dõi và chờ hoàn tất.',rewardLabel:'Lúa dự kiến nhận'},
  resolved:{text:'Đã giải quyết',symbol:'✓',color:'resolved',summary:'Chúc mừng! Đơn hàng đã hoàn tất hợp lệ và phần thưởng đã được ghi vào ví Lúa.',rewardLabel:'Lúa đã nhận'},
  rejected:{text:'Từ chối',symbol:'✕',color:'rejected',summary:'Rất tiếc, đơn hàng không đáp ứng điều kiện nhận thưởng hoặc đã bị hủy, hoàn trả.',rewardLabel:'Không được cộng Lúa'}
 };
 return entries[status]||entries.pending;
}

export function shopOrderSteps(status) {
 const steps=[['pending','Chờ xác minh'],['provisional','Tạm duyệt – Chờ giải quyết'],['resolved','Đã giải quyết']];
 const index={pending:0,provisional:1,resolved:2}[status]??0;
 return `<div class="sorder-progress"><div class="sorder-progress-heading"><strong>Tiến trình đơn hàng</strong><span>Bước ${index+1}/3</span></div>
 <div class="sorder-steps" role="list" aria-label="Tiến trình 3 bước">
 ${steps.map(([step,label],i)=>`<div class="sorder-step ${i<=index?'is-done':''} ${i===index?'is-current':''}" role="listitem" ${i===index?'aria-current="step"':''}>
 <span class="sorder-step-node">${i<index||index===2?'✓':i+1}</span><small>${label}</small></div>`).join('')}</div>
 </div>`;
}

export function shopMaskOrderReference(reference) {
 const ref=String(reference??'');
 return ref.length>=14?`${ref.slice(0,6)}••••${ref.slice(-4)}`:ref;
}

export async function shopOrdersPage(ctx){
 const {api,esc,heading,fmt,dt}=ctx;
 const [info,alerts]=await Promise.all([api('/api/shop/orders'),api('/api/shop/orders/alerts')]);
 if(alerts.unread)await api('/api/shop/orders/read','POST',{}).catch(()=>{});
 const orders=info.orders||[],history=info.events||[];
 const accrued=orders.filter(x=>x.status==='resolved').reduce((s,x)=>s+Number(x.reward_lua||0),0);
 const pending=orders.filter(x=>['pending','provisional'].includes(x.status)).length;
 return `<div class="sorder-page sorder-customer">${heading('Đơn hàng & Lúa','Theo dõi tình trạng đơn hàng, Lúa dự kiến và phần thưởng đã nhận sau khi giải quyết.')}
   <section class="sorder-summary" aria-label="Tổng quan đơn hàng">
    <div class="sorder-summary-card"><span>🛍️ Đơn đã báo</span><strong>${fmt(orders.length)}</strong><small>Đơn đang lưu trong tài khoản</small></div>
    <div class="sorder-summary-card"><span>⌛ Đang xử lý</span><strong>${fmt(pending)}</strong><small>Chờ xác minh / giải quyết</small></div>
    <div class="sorder-summary-card sorder-summary-lua"><span>🌾 Lúa đã nhận</span><strong>${fmt(accrued)}</strong><small>Không tính Lúa dự kiến</small></div>
   </section>
   <section class="sorder-intro"><div><strong>Bạn đã đặt hàng trên TikTok Shop?</strong><p>Vào sản phẩm trong gian hàng, chọn “Đã mua? Báo đơn”, sau đó gửi ID đơn hàng. Bạn có thể theo dõi trạng thái và nhận Lúa khi đơn được giải quyết.</p></div><button type="button" class="btn" data-go="shop">🛍️ Đến gian hàng</button></section>
   ${alerts.unread?`<div class="sorder-notice" role="status" aria-live="polite">🔔 Có <strong>${fmt(alerts.unread)} đơn hàng vừa được cập nhật</strong>. Xem trạng thái mới và phần thưởng bên dưới.</div>`:''}
   <div class="sorder-section-heading"><h2>Lịch sử đơn hàng</h2><span>${fmt(orders.length)} đơn</span></div>
   ${orders.length?`<div class="sorder-list">${orders.map(o=>{
    const meta=shopOrderMeta(o.status);
    const events=history.filter(e=>e.order_id===o.id).reverse();
    return `<article class="sorder-card sorder-card-${meta.color}">
       <div class="sorder-card-top"><div><span class="sorder-eyebrow">ĐƠN HÀNG TIKTOK</span><strong>${esc(o.product_title)}</strong></div><span class="sorder-status sorder-status-${meta.color}">${meta.symbol} ${meta.text}</span></div>
       <div class="sorder-order-meta">
        <div><span>ID đơn:</span><strong>${esc(shopMaskOrderReference(o.order_reference))}</strong></div>
        <div><span>Báo đơn:</span><span>${esc(dt(o.created_at))}</span></div>
        <div><span>Cập nhật:</span><span>${esc(dt(o.updated_at||o.created_at))}</span></div>
       </div>
       <details class="sorder-reference"><summary>Xem ID đơn hàng đầy đủ</summary><code>${esc(o.order_reference)}</code></details>
       <div class="sorder-status-explain sorder-status-explain-${meta.color}"><span class="sorder-status-explain-icon" aria-hidden="true">${meta.symbol}</span><div><strong>${meta.text}</strong><p>${meta.summary}</p></div></div>
       ${o.status==='rejected'
          ?`<div class="sorder-rejection sorder-rejection-final"><strong>✕ Không được cộng Lúa</strong><span>Đơn hàng không đủ điều kiện nhận Lúa.</span></div>`
          :shopOrderSteps(o.status)}
       ${o.status==='resolved'
         ?`<div class="sorder-award sorder-award-final"><span>🌾 Lúa đã nhận</span><strong>+${fmt(o.reward_lua)} Lúa</strong><small>Đã cộng vào ví Lúa</small></div>`
         :o.status==='provisional'&&Number(o.estimated_reward_lua)>0
           ?`<div class="sorder-estimate" aria-label="Lúa dự kiến chưa chính thức">
              <div class="sorder-estimate-head"><span>🌾 Lúa dự kiến nhận</span><span class="sorder-estimate-sparkle">✦</span></div>
              <div class="sorder-estimate-amount">~ ${fmt(o.estimated_reward_lua)} <small>Lúa</small></div>
              <div class="sorder-estimate-wallet">◷ Chưa cộng vào ví Lúa</div>
              <p><strong>Lưu ý:</strong> Số Lúa trên chỉ là dự kiến, có thể tăng hoặc giảm tùy theo kết quả giải quyết đơn hàng. Lúa chính thức chỉ được cập nhật khi đơn hàng đã giải quyết. Đơn không đủ điều kiện sẽ không được nhận thưởng.</p>
             </div>`
           :o.status==='pending'
             ?`<div class="sorder-wait sorder-wait-pending">🌾 <strong>Lúa: Chưa xác định</strong><span>Chờ Admin xác minh ID đơn hàng.</span></div>`
             :o.status==='provisional'?`<div class="sorder-wait">🌾 Chưa có Lúa dự kiến. Lúa chưa được cộng vào ví.</div>`:''}
       <details class="sorder-timeline"><summary>Xem lịch sử xử lý <span aria-hidden="true">⌄</span></summary>
       <ol>${events.map(e=>`<li><strong>${shopOrderMeta(e.status).text}</strong><small>${esc(dt(e.created_at))}</small><p>${e.status==='pending'?'Đã tiếp nhận ID đơn hàng.':e.status==='provisional'?'ID đơn đã được xác minh, đang chờ hoàn tất.':e.status==='resolved'?'Đơn đã giải quyết và phần thưởng đã vào ví.':e.status==='rejected'?'Đơn hàng không đủ điều kiện nhận thưởng.':'Trạng thái đã cập nhật.'}</p></li>`).join('')}</ol>
       </details>
     </article>`;
   }).join('')}</div>`:`<div class="sorder-empty"><span>📦</span><h3>Chưa có đơn hàng nào</h3><p>Khi mua sản phẩm trong gian hàng, hãy bấm “Đã mua? Báo đơn” để lưu ID và theo dõi thưởng Lúa tại đây.</p><button type="button" class="btn" data-go="shop">Xem sản phẩm →</button></div>`}
   <div class="sorder-footnote">Đây là trạng thái cập nhật trên Trạm Có Lúa, không phải dữ liệu đơn hàng đồng bộ trực tiếp từ TikTok. Lúa dự kiến không phải phần thưởng đã nhận. Lúa chính thức chỉ được cộng khi đơn hợp lệ và được giải quyết.</div>
 </div>`;
}

export async function adminShopOrdersPage(ctx){
 const {api,esc,heading,fmt,dt}=ctx;
 const data=await api('/api/admin/shop/orders');
 const orders=data.orders||[];
 const pending=orders.filter(x=>x.status==='pending').length;
 const waiting=orders.filter(x=>x.status==='provisional').length;
 // Chỉ ở trang Admin: mẫu kiểm tra và các lý do từ chối cố định.
 const verifiedNote=data.verification_note||'Đã kiểm tra ID đơn hàng, thông tin sản phẩm trùng khớp. Đơn đang chờ hoàn tất.';
 const rejectReasons=data.rejection_reasons||{
  '0':'Không tìm thấy thông tin đơn hàng tương ứng với ID đã cung cấp.',
  '1':'Đơn hàng đã bị hủy nên không đủ điều kiện nhận Lúa.',
  '2':'Đơn hàng đã được hoàn trả hoặc hoàn tiền nên không đủ điều kiện nhận Lúa.',
  '3':'Sau khi kiểm tra, đơn hàng chưa đáp ứng điều kiện nhận thưởng của chương trình.'
 };
 return `<div class="sorder-page sorder-admin">${heading('Duyệt đơn TikTok Shop','Kiểm tra đơn hàng trước khi thay đổi trạng thái. Chỉ cộng Lúa khi hoa hồng đã được quyết toán.')}
   <section class="sorder-summary"><div class="sorder-summary-card"><span>⌛ Chờ xác minh</span><strong>${fmt(pending)}</strong></div><div class="sorder-summary-card"><span>🔎 Chờ giải quyết</span><strong>${fmt(waiting)}</strong></div><div class="sorder-summary-card sorder-summary-lua"><span>🌾 Đã giải quyết</span><strong>${fmt(orders.filter(x=>x.status==='resolved').length)}</strong></div></section>
   <div class="sorder-admin-warning"><strong>⚠️ Kiểm tra thủ công trên TikTok Shop</strong><p>ID do khách nhập chỉ là thông tin khai báo. Để <b>tạm duyệt</b>, hãy kiểm tra đúng ID đơn hàng và sản phẩm trong TikTok Shop. <b>Không bắt buộc hàng đã giao hoặc đã thanh toán ở bước này.</b> Chỉ chọn <b>Đã giải quyết & cộng Lúa</b> sau khi hàng được giao, đã thanh toán và hoa hồng Affiliate đã quyết toán hợp lệ. Đơn bị hủy/hoàn hoặc không đủ điều kiện phải từ chối.</p></div>
   <div class="sorder-section-heading"><h2>Đơn hàng cần xử lý</h2><span>${fmt(orders.length)} đơn đã ghi nhận</span></div>
   ${orders.length?`<div class="sorder-admin-list">${orders.map(o=>{const meta=shopOrderMeta(o.status);return `<article class="sorder-admin-card"><div class="sorder-card-top"><div><span class="sorder-eyebrow">ĐƠN TIKTOK</span><strong>${esc(o.order_reference)}</strong></div><span class="sorder-status sorder-status-${meta.color}">${meta.symbol} ${meta.text}</span></div>
     <p><b>${esc(o.name)}</b> · ${esc(o.email)}</p><p>🛍️ <b>${esc(o.product_title)}</b></p><p>📅 ${esc(dt(o.created_at))}</p>${o.customer_note?`<p>Ghi chú khách: ${esc(o.customer_note)}</p>`:''}
     ${o.status==='pending'?`<form class="sorder-admin-form" data-form="shop-order-provisional"><input type="hidden" name="id" value="${esc(o.id)}">
       <div class="sorder-preset-label">Kết quả kiểm tra ID đơn hàng (chỉ Admin xem)</div>
       <div class="sorder-preset-note"><span aria-hidden="true">✓</span><p>${esc(verifiedNote)}</p></div>
       <p class="sorder-preset-hint">Nội dung có sẵn. Chỉ tạm duyệt sau khi đã kiểm tra đúng ID đơn hàng và sản phẩm.</p>
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
         <label for="shop-settlement-${esc(o.id)}">Mã đơn / mã đối soát TikTok đã giải quyết</label><input id="shop-settlement-${esc(o.id)}" name="settled_reference" minlength="8" maxlength="90" required placeholder="Nhập mã đối chiếu đơn đã hoàn tất">
         <label for="shop-reward-${esc(o.id)}">🌾 Lúa chính thức thưởng cho khách</label><input id="shop-reward-${esc(o.id)}" name="reward_lua" type="number" inputmode="numeric" min="1" max="10000000" step="1" required placeholder="Ví dụ 3000"><p class="sorder-estimate-help">Bạn tự quyết định số Lúa thưởng. Website không yêu cầu số tiền TikTok trả cho Admin, không tự chia phần trăm. Chỉ cộng Lúa sau khi đã xác nhận đơn đủ điều kiện.</p>
         <label class="sorder-final-check"><input type="checkbox" name="delivery_paid_confirmed" value="1" required> Tôi đã đối chiếu: hàng đã giao, đã thanh toán, không bị hoàn/hủy và số tiền đối chiếu đã được xác nhận hợp lệ.</label><p class="note">Đây là bước cuối; chỉ ghi Lúa thực tế vào ví một lần duy nhất.</p>
         <button type="submit" class="btn shop-settle-btn">🌾 Đã giải quyết & cộng Lúa</button>
       </form>`:''}
     ${o.status==='pending'||o.status==='provisional'?`<form class="sorder-admin-form sorder-reject-form" data-form="shop-order-reject"><input type="hidden" name="id" value="${esc(o.id)}"><label for="shop-reject-${esc(o.id)}">Nếu từ chối, chọn lý do có sẵn</label><select id="shop-reject-${esc(o.id)}" name="reason_code" required><option value="" selected disabled>-- Chọn lý do từ chối --</option>${['0','1','2','3'].map(code=>`<option value="${code}">${code} – ${esc(rejectReasons[code])}</option>`).join('')}</select><p class="sorder-preset-hint">Chọn lý do đúng với kết quả kiểm tra. Không cần gõ thủ công.</p><button type="submit" class="btn danger">Từ chối đơn</button></form>`:''}
     ${o.status==='resolved'?`<div class="sorder-award"><span>Đã ghi vào ví: <b>${esc(o.name)}</b></span><strong>+${fmt(o.reward_lua)} Lúa</strong></div><div class="sorder-admin-state">Mã đơn đã đối chiếu: ${esc(o.settled_reference)}</div>`:''}
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
  if(!confirm('Đã kiểm tra đúng ID đơn hàng và sản phẩm trong TikTok Shop? Tạm duyệt KHÔNG yêu cầu đã giao hoặc thanh toán và KHÔNG cộng Lúa.'))return true;
  payload={status:'provisional',estimated_reward_lua:Number(b.estimated_reward_lua)};
 }else if(kind==='shop-order-estimate'){
  if(!confirm('Cập nhật số Lúa dự kiến cho khách? Đây chỉ là số ước tính, chưa cộng vào ví.'))return true;
  payload={status:'estimate',estimated_reward_lua:Number(b.estimated_reward_lua)};
 }else if(kind==='shop-order-resolve'){
  if(!confirm('XÁC NHẬN CUỐI: Hàng đã giao, đã thanh toán, không bị hoàn/hủy và hoa hồng TikTok đã quyết toán hợp lệ? Số Lúa thực tế sẽ được cộng vào ví đúng một lần.'))return true;
  payload={status:'resolved',reward_lua:Number(b.reward_lua),settled_reference:b.settled_reference,delivery_paid_confirmed:b.delivery_paid_confirmed==='1'};
 }else{
  if(!confirm('Xác nhận từ chối đơn này và không thưởng Lúa?'))return true;
  payload={status:'rejected',reason_code:b.reason_code};
 }
 const result=await api('/api/admin/shop/orders/'+id,'POST',payload);
 toast(result.message);await navigate('admin-shop-orders');return true;
}
