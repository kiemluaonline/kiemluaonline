export function shopCategories(){
  return [['all','Tất cả','✨'],['beauty','Làm đẹp','🧴'],['fashion','Thời trang','👟'],['home','Nhà cửa','🏡'],['technology','Công nghệ','🎧'],['other','Khác','🎁']];
}

export function shopCard(product,esc){
  const category=shopCategories().find(x=>x[0]===product.category)||shopCategories().at(-1);
  const cardClass=['beauty','fashion','home','technology','other'].includes(product.category)?product.category:'other';
  return `<article class="shop-product-card">
   <div class="shop-product-art shop-art-${cardClass}" aria-hidden="true">
    <span class="shop-art-glow"></span><span class="shop-art-icon">${category[2]}</span><span class="shop-art-label">TRẠM CÓ LÚA · TIKTOK SHOP</span>
   </div>
   <div class="shop-product-content"><span class="shop-product-category">${esc(category[1])}</span>
   <h3>${esc(product.title)}</h3><p>${esc(product.description||'Khám phá sản phẩm trên TikTok Shop qua liên kết tiếp thị của Trạm Có Lúa.')}</p>
   <div class="shop-product-bottom"><span class="shop-product-caption">🌾 Thưởng xét sau đối soát</span>
    <a class="shop-cta-shop" href="${esc(product.link)}" target="_blank" rel="noopener noreferrer sponsored">Xem sản phẩm <span aria-hidden="true">↗</span></a>
   </div></div></article>`;
}

export async function shopPage(ctx){
  const {api,esc,state}=ctx;
  const data=await api('/api/shop');
  const categories=shopCategories();
  const activeCategory=categories.some(x=>x[0]===state.shopCategory)?state.shopCategory:'all';
  const visible=data.products.filter(x=>activeCategory==='all'||x.category===activeCategory);
  const ready=data.requests.filter(x=>x.status==='ready'&&x.product_link);
  const fresh=ready.filter(x=>!x.seen_at);
  if(fresh.length)api('/api/shop/requests/read','POST',{}).catch(()=>{});
  const contact=(which)=>!!data.contacts[which];
  return `<div class="shop-page">
   <section class="shop-hero">
    <div class="shop-hero-copy"><div class="shop-kicker"><span class="shop-kicker-dot"></span> MUA SẮM THÔNG MINH • TÍCH LÚA</div>
    <h2>Mua món bạn thích.<br><em>Nhận thêm Lúa.</em></h2>
    <p>Khám phá sản phẩm TikTok Shop hoặc yêu cầu món hàng riêng. Phần thưởng chỉ được xác định sau khi đơn hàng được xác minh và giải quyết.</p>
    <div class="shop-hero-actions"><a href="#shop-catalog" class="shop-primary-link">Khám phá sản phẩm <span>↗</span></a><a href="#shop-request" class="shop-text-link">Tìm món theo yêu cầu ↓</a></div>
    </div>
    <div class="shop-hero-visual" aria-hidden="true"><div class="shop-deco-orbit shop-orbit-one"></div><div class="shop-deco-orbit shop-orbit-two"></div><div class="shop-main-bag">🛍️</div><div class="shop-floating shop-floating-one">🌾 Tích Lúa</div><div class="shop-floating shop-floating-two">✨ Món bạn thích</div></div>
   </section>
   <div class="shop-trust-strip"><span>✓ Tự chọn sản phẩm</span><span>✓ Không cần tải ảnh lên web</span><span>✓ Thưởng sau xác minh</span></div>
   ${fresh.length?`<div class="shop-notice shop-notice-ready" role="status"><span class="shop-notice-emoji">🎉</span><div><strong>Sản phẩm bạn yêu cầu đã có!</strong><p>Đã tìm thấy ${fresh.length} yêu cầu mới. Xem đường link mua trong mục Theo dõi yêu cầu bên dưới.</p></div><a href="#shop-my-requests">Xem ngay ↓</a></div>`:''}
   <section class="shop-section" id="shop-catalog">
    <div class="shop-section-top"><div><div class="shop-section-eyebrow">GỢI Ý CHO BẠN</div><h2>Gian hàng của Trạm</h2><p>Chọn sản phẩm bạn yêu thích, xem chi tiết và mua trực tiếp trên TikTok Shop.</p></div><span class="shop-count">${data.products.length} sản phẩm</span></div>
    <div class="shop-chips" role="group" aria-label="Danh mục sản phẩm">${categories.map(c=>`<button type="button" data-action="shop-filter" data-category="${c[0]}" class="${activeCategory===c[0]?'active':''}">${c[2]} ${c[1]}</button>`).join('')}</div>
    ${visible.length?`<div class="shop-products">${visible.map(p=>shopCard(p,esc)).join('')}</div>`:`<div class="shop-empty"><span>🛒</span><strong>${data.products.length?'Chưa có sản phẩm trong danh mục này':'Gian hàng đang được cập nhật'}</strong><p>Chưa thấy món bạn muốn? Gửi yêu cầu bên dưới để Admin hỗ trợ tìm sản phẩm.</p><a href="#shop-request">Yêu cầu sản phẩm ↘</a></div>`}
   </section>
   <section class="shop-request-section" id="shop-request">
    <div class="shop-request-art"><div class="shop-request-art-icon">💬</div><span>Ảnh & link gửi qua ứng dụng nhắn tin</span><div class="shop-request-spark">✧</div></div>
    <div class="shop-request-content"><div class="shop-section-eyebrow">DÀNH RIÊNG CHO BẠN</div><h2>Không thấy món bạn muốn?</h2>
      <p>Bạn có thể <strong>gửi link hoặc ảnh sản phẩm qua Zalo hay Telegram</strong>. Admin sẽ tìm sản phẩm phù hợp và cập nhật ngay trên website khi đã có.</p>
      <label for="shop-note">Mô tả ngắn (không bắt buộc)</label>
      <input id="shop-note" name="shop-note" maxlength="240" placeholder="Ví dụ: Giày thể thao màu trắng, size 40">
      <div class="shop-contact-actions">
       <button type="button" class="shop-contact shop-zalo" data-action="shop-start-request" data-channel="zalo" ${contact('zalo')?'':'disabled'}><span>💬</span><span>Gửi qua Zalo<small>${contact('zalo')?'Gửi ảnh hoặc link':'Chưa thiết lập'}</small></span><b>↗</b></button>
       <button type="button" class="shop-contact shop-telegram" data-action="shop-start-request" data-channel="telegram" ${contact('telegram')?'':'disabled'}><span>✈️</span><span>Gửi qua Telegram<small>${contact('telegram')?'Gửi ảnh hoặc link':'Chưa thiết lập'}</small></span><b>↗</b></button>
      </div>
      <div class="shop-request-privacy">🔒 Không tải ảnh lên Trạm Có Lúa. Hệ thống chỉ lưu mã yêu cầu và mô tả, giúp giữ website gọn nhẹ.</div>
    </div>
   </section>
   <section class="shop-section shop-history" id="shop-my-requests">
    <div class="shop-section-top"><div><div class="shop-section-eyebrow">CẬP NHẬT TỰ ĐỘNG</div><h2>Theo dõi yêu cầu của bạn</h2><p>Khi Admin đánh dấu “Đã có sản phẩm”, thông tin sẽ xuất hiện ở đây, không cần nhắn lại.</p></div><span class="shop-count">${data.requests.length} yêu cầu</span></div>
    ${data.requests.length?`<div class="shop-requests">${data.requests.map(r=>`<article class="shop-request-item"><div class="shop-request-icon">${r.status==='ready'?'🎉':r.status==='rejected'?'✕':'⌛'}</div>
    <div class="shop-request-info"><div class="shop-request-top"><strong>${esc(r.code)}</strong><span class="shop-state shop-state-${esc(r.status)}">${r.status==='ready'?'Đã có sản phẩm':r.status==='rejected'?'Không tìm thấy':'Đang tìm sản phẩm'}</span></div>
    <p>${esc(r.note)}</p><small>Gửi qua ${r.channel==='zalo'?'Zalo':'Telegram'}</small>
    ${r.status==='ready'&&r.product_link?`<div class="shop-request-ready"><strong>${esc(r.product_title||'Sản phẩm đã tìm thấy')}</strong><a href="${esc(r.product_link)}" target="_blank" rel="noopener noreferrer sponsored">Xem & mua ngay ↗</a></div>`:''}</div></article>`).join('')}</div>`:`<div class="shop-empty shop-empty-compact"><span>📦</span><strong>Bạn chưa gửi yêu cầu nào</strong><p>Gửi ảnh hoặc link qua Zalo, Telegram để bắt đầu nhé.</p></div>`}
   </section>
   <section class="shop-guide"><h3>Hành trình nhận Lúa</h3><div><span><b>01</b>Chọn và mua hàng</span><span><b>02</b>Chờ xác minh đơn</span><span><b>03</b>Tạm duyệt – Chờ giải quyết</span><span><b>04</b>Đủ điều kiện mới cộng Lúa</span></div><p>Không công bố trước số Lúa thưởng. Đơn mua cần được đối chiếu hợp lệ; nhấp liên kết hoặc đặt hàng chưa tự động phát sinh thưởng.</p></section>
   </div>`;
}

export async function adminShopPage(ctx){
  const {api,esc,field,select,heading,state}=ctx;
  const d=await api('/api/admin/shop');
  const edit=d.products.find(p=>p.id===state.shopEdit)||{};
  const categories=shopCategories().filter(x=>x[0]!=='all');
  const pending=d.requests.filter(r=>r.status==='pending');
  const opts=d.products.filter(p=>p.is_active).map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  return `${heading('Quản lý mua sắm','Đăng sản phẩm TikTok Affiliate, nhận yêu cầu và gửi thông báo ngay trên Trạm Có Lúa.')}
   <div class="shop-admin-head"><span>🛍️ TikTok Shop Affiliate</span><strong>${d.products.filter(p=>p.is_active).length} sản phẩm đang hiển thị</strong><strong>${pending.length} yêu cầu đang chờ</strong></div>
   <div class="shop-admin-layout">
    <form class="card" data-form="shop-product" id="shop-product-form"><h3>${edit.id?'✏️ Chỉnh sửa sản phẩm':'✨ Thêm sản phẩm mới'}</h3><p class="note">Chỉ dán link Affiliate chính thức mà bạn có quyền sử dụng. Không nhập giá bán hoặc hoa hồng.</p>
     <input type="hidden" name="id" value="${esc(edit.id||'')}">
     ${field('shop-title','Tên sản phẩm',edit.title||'','required minlength="3" maxlength="110" placeholder="Tên sản phẩm TikTok Shop"')}
     <div class="field"><label for="shop-description">Giới thiệu sản phẩm (không bắt buộc)</label><textarea id="shop-description" name="description" maxlength="330" placeholder="Mô tả ngắn, rõ ràng...">${esc(edit.description||'')}</textarea></div>
     ${select('category','Danh mục',categories.map(x=>[x[0],x[1]]),edit.category||'beauty')}
     ${field('shop-affiliate-link','Link TikTok Shop Affiliate',edit.link||'','required type="url" placeholder="https://vt.tiktok.com/..."')}
     ${select('is_active','Hiển thị sản phẩm',[['1','Hiển thị công khai'],['0','Lưu nháp / Tạm ẩn']],String(edit.is_active??1))}
     <div class="shop-admin-buttons"><button class="btn" type="submit">💾 ${edit.id?'Lưu thay đổi':'Thêm sản phẩm'}</button>${edit.id?'<button type="button" class="btn alt" data-action="shop-reset-product">Thêm mới</button>':''}</div>
    </form>
    <form class="card" data-form="shop-contact"><h3>💬 Kênh liên hệ Admin</h3><p class="note">Khách gửi ảnh/link trực tiếp qua Zalo hoặc Telegram, không tải ảnh lên máy chủ.</p>
      ${field('shop-zalo','Số Zalo hoặc link zalo.me',d.contacts.zalo||'','placeholder="https://zalo.me/..."')}
      ${field('shop-telegram','Username hoặc link Telegram',d.contacts.telegram||'','placeholder="@username hoặc https://t.me/..."')}
      <button class="btn" type="submit">Lưu kênh liên hệ</button>
      <div class="shop-admin-tip">Thông tin này được dùng cho nút liên hệ ở trang mua sắm, không xuất hiện trên trang Admin khác.</div>
    </form>
   </div>
   <section class="shop-admin-section"><div class="shop-section-top"><div><h2>Danh sách sản phẩm</h2><p>Bật/tắt hoặc sửa sản phẩm mà không ảnh hưởng nhiệm vụ cũ.</p></div></div>
   ${d.products.length?`<div class="shop-admin-list">${d.products.map(p=>`<div class="shop-admin-product"><div class="shop-admin-product-icon">${(categories.find(x=>x[0]===p.category)||categories.at(-1))[2]}</div><div><strong>${esc(p.title)}</strong><p>${p.is_active?'Đang hiển thị':'Đang ẩn'} · ${esc(p.category)}</p></div><button type="button" class="btn alt sm" data-action="shop-edit-product" data-id="${esc(p.id)}">Sửa</button></div>`).join('')}</div>`:'<p class="shop-admin-empty">Chưa có sản phẩm. Thêm sản phẩm đầu tiên ở biểu mẫu phía trên.</p>'}
   </section>
   <section class="shop-admin-section"><div class="shop-section-top"><div><h2>Yêu cầu sản phẩm từ khách</h2><p>Khách đã gửi ảnh hoặc link qua kênh nhắn tin, kèm mã SP. Chọn đúng sản phẩm rồi nhấn “Đã có sản phẩm”.</p></div><span class="shop-count">${pending.length} đang chờ</span></div>
   ${d.requests.length?`<div class="shop-admin-requests">${d.requests.map(r=>`<article class="shop-admin-request"><div class="shop-request-top"><strong>${esc(r.code)}</strong><span class="shop-state shop-state-${esc(r.status)}">${r.status==='pending'?'Chờ xử lý':r.status==='ready'?'Đã có sản phẩm':'Từ chối'}</span></div>
    <p><strong>${esc(r.name)}</strong> · ${esc(r.email)}</p><p>${esc(r.note)} · ${r.channel==='zalo'?'Zalo':'Telegram'}</p>
    ${r.status==='pending'?`<div class="shop-admin-resolution"><label for="shop-resolve-${esc(r.id)}">Chọn sản phẩm đã thêm</label><select id="shop-resolve-${esc(r.id)}" data-shop-product-for="${esc(r.id)}"><option value="">-- Chọn sản phẩm --</option>${opts}</select>
     <div class="shop-admin-buttons"><button type="button" class="btn sm" data-action="shop-request-ready" data-id="${esc(r.id)}" ${opts?'':'disabled'}>✓ Đã có sản phẩm</button><button type="button" class="btn danger sm" data-action="shop-request-reject" data-id="${esc(r.id)}">Không tìm thấy</button></div></div>`:`<p class="note">${r.status==='ready'?`Đã liên kết: ${esc(r.product_title||'Sản phẩm')}`:'Đã đánh dấu không tìm thấy'}</p>`}
    </article>`).join('')}</div>`:'<p class="shop-admin-empty">Chưa có yêu cầu sản phẩm nào.</p>'}
   </section><p class="note section">Lưu ý: Chức năng này mới quản lý sản phẩm và yêu cầu. Chưa xác minh đơn hàng TikTok hoặc tự động cộng Lúa.</p>`;
}

export async function handleShopAction(action,el,ctx){
  const {api,toast,navigate,state,esc}=ctx;
  if(action==='shop-filter'){state.shopCategory=el.dataset.category||'all';await navigate('shop');return true;}
  if(action==='shop-edit-product'){state.shopEdit=el.dataset.id;await navigate('admin-shop');document.getElementById('shop-product-form')?.scrollIntoView({behavior:'smooth'});return true;}
  if(action==='shop-reset-product'){state.shopEdit=null;await navigate('admin-shop');return true;}
  if(action==='shop-start-request'){
    el.disabled=true;
    try{
      const channel=el.dataset.channel;
      const note=document.getElementById('shop-note')?.value||'';
      const r=await api('/api/shop/requests','POST',{channel,note});
      const msg='Mã yêu cầu của tôi: '+r.code+'\nTôi muốn tìm sản phẩm theo ảnh hoặc link gửi kèm.';
      const root=document.getElementById('modal-root');
      root.innerHTML=`<div class="modal-cover"><section class="modal shop-contact-modal" role="dialog" aria-modal="true" aria-label="Gửi yêu cầu sản phẩm">
       <button class="close" type="button" data-action="close-modal" aria-label="Đóng">×</button>
       <div class="shop-modal-icon">✅</div><h3>Đã tạo yêu cầu ${esc(r.code)}</h3>
       <p>Hãy <strong>sao chép mã yêu cầu</strong>, sau đó gửi mã cùng ảnh hoặc link sản phẩm cho Admin qua ${channel==='zalo'?'Zalo':'Telegram'}.</p>
       <div class="shop-modal-code">${esc(r.code)}</div>
       <div class="shop-modal-actions"><button type="button" class="btn alt" data-action="shop-copy-request" data-code="${esc(msg)}">📋 Sao chép mã & lời nhắn</button>
       <a class="btn" href="${esc(r.contact_url)}" target="_blank" rel="noopener noreferrer">Mở ${channel==='zalo'?'Zalo':'Telegram'} ↗</a></div>
       <p class="note">Không gửi ảnh lên website. Bạn sẽ nhận thông báo tại mục Theo dõi yêu cầu khi sản phẩm có sẵn.</p></section></div>`;
      toast('Đã tạo yêu cầu '+r.code);
    }finally{if(el.isConnected)el.disabled=false;}
    return true;
  }
  if(action==='shop-copy-request'){
    await navigator.clipboard.writeText(el.dataset.code||'');
    toast('Đã sao chép. Hãy dán vào tin nhắn cùng ảnh hoặc link sản phẩm.');
    return true;
  }
  if(action==='shop-request-ready'){
    const id=el.dataset.id, sel=document.querySelector('[data-shop-product-for="'+id+'"]');
    if(!sel?.value)throw new Error('Hãy chọn sản phẩm đã bật công khai.');
    if(!confirm('Xác nhận đã có đúng sản phẩm khách yêu cầu? Hệ thống sẽ thông báo trên website của khách.'))return true;
    await api('/api/admin/shop/requests/'+encodeURIComponent(id),'POST',{status:'ready',product_id:sel.value});
    toast('Đã có sản phẩm! Website sẽ thông báo cho khách.');await navigate('admin-shop');return true;
  }
  if(action==='shop-request-reject'){
    if(!confirm('Đánh dấu không tìm thấy sản phẩm này?'))return true;
    await api('/api/admin/shop/requests/'+encodeURIComponent(el.dataset.id),'POST',{status:'rejected'});
    toast('Đã cập nhật yêu cầu.');await navigate('admin-shop');return true;
  }
  return false;
}

export async function handleShopSubmit(kind,b,ctx){
  const {api,toast,navigate,state}=ctx;
  if(kind==='shop-product'){
    const raw=document.getElementById('shop-product-form');
    const title=raw?.querySelector('[name="shop-title"]')?.value||'';
    const link=raw?.querySelector('[name="shop-affiliate-link"]')?.value||'';
    const payload={title,link,description:b.description||'',category:b.category,is_active:b.is_active==='1'};
    if(b.id)await api('/api/admin/shop/products/'+encodeURIComponent(b.id),'PATCH',payload);
    else await api('/api/admin/shop/products','POST',payload);
    state.shopEdit=null;toast('Đã lưu sản phẩm TikTok Shop Affiliate.');await navigate('admin-shop');return true;
  }
  if(kind==='shop-contact'){
    await api('/api/admin/shop/contact','PUT',{zalo:b['shop-zalo']||'',telegram:b['shop-telegram']||''});
    toast('Đã lưu Zalo và Telegram.');await navigate('admin-shop');return true;
  }
  return false;
}
