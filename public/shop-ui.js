// Native browser confirmation uses the currently selected language.
function askShopConfirm(message){
 const label=window.TramI18n?.translateLabel?.(message)??message;
 return window.confirm(label);
}

const shopPhotoCache=new WeakMap();
async function shopPhotoData(file){
 if(!file||!file.size)return '';
 let promise=shopPhotoCache.get(file);
 if(!promise){
  promise=(async()=>{
   if(file.size>20*1024*1024)throw new Error('Ảnh gốc lớn hơn 20 MB. Hãy chọn ảnh nhỏ hơn.');
   if(file.type&&!file.type.startsWith('image/'))throw new Error('Bạn cần chọn tệp hình ảnh.');
   const read=blob=>new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(new Error('Không đọc được ảnh trên điện thoại.'));
    reader.readAsDataURL(blob);
   });
   const source=await read(file);
   const img=await new Promise((resolve,reject)=>{
    const el=new Image();
    el.onload=()=>resolve(el);
    el.onerror=()=>reject(new Error('Không mở được ảnh này. Thử chọn ảnh JPG, PNG hoặc ảnh chụp màn hình.'));
    el.src=source;
   });
   if(!img.naturalWidth||!img.naturalHeight)throw new Error('Ảnh không hợp lệ.');
   for(const maxSide of [900,720,600,480,360]){
    const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Trình duyệt không thể nén ảnh này.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(img,0,0,canvas.width,canvas.height);
    for(const quality of [.82,.70,.58,.46]){
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
     if(blob&&blob.size>=1000&&blob.size<=155000)return read(blob);
    }
   }
   throw new Error('Ảnh quá phức tạp để nén dưới 160 KB. Hãy cắt bớt ảnh rồi thử lại.');
  })();
  shopPhotoCache.set(file,promise);
 }
 return promise;
}
// Xem trước bằng ảnh đã nén; không tải ảnh gốc lên máy chủ và không dùng blob: URL.
export async function previewShopPhoto(input){
 const target=input.closest('.shop-product-photo-field')?.querySelector('[data-shop-photo-preview]');
 if(!target)return;
 const file=input.files?.[0];
 if(!file){target.textContent='Chưa chọn ảnh mới.';return;}
 target.textContent='Đang chuẩn bị ảnh...';
 try{
  const data=await shopPhotoData(file);
  if(input.files?.[0]!==file)return;
  const img=document.createElement('img');
  img.src=data;img.alt='Ảnh sản phẩm vừa chọn';img.width=150;img.height=120;
  target.replaceChildren(img);
 }catch(err){target.textContent=err.message;throw err;}
}

export function shopCategories(){
  return [['all','Tất cả','✨'],['beauty','Làm đẹp','🧴'],['fashion','Thời trang','👟'],['home','Nhà cửa','🏡'],['technology','Công nghệ','🎧'],['other','Khác','🎁']];
}

export function shopCard(product,esc){
  const category=shopCategories().find(x=>x[0]===product.category)||shopCategories().at(-1);
  const cardClass=['beauty','fashion','home','technology','other'].includes(product.category)?product.category:'other';
  return `<article class="shop-product-card">
   <div class="shop-product-art shop-art-${cardClass}${product.image_url?' shop-has-photo':''}">
    ${product.image_url?`<img class="shop-product-photo" src="${esc(product.image_url)}" alt="Ảnh sản phẩm ${esc(product.title)}" loading="lazy" decoding="async">`:`<span class="shop-art-glow" aria-hidden="true"></span><span class="shop-art-icon" aria-hidden="true">${category[2]}</span><span class="shop-art-label">TRẠM CÓ LÚA · TIKTOK SHOP</span>`}
   </div>
   <div class="shop-product-content"><span class="shop-product-category">${esc(category[1])}</span>
   <h3>${esc(product.title)}</h3><p>${esc(product.description||'Khám phá sản phẩm phù hợp trên TikTok Shop.')}</p>
   <div class="shop-product-bottom"><span class="shop-product-caption">🌾 Đơn hợp lệ, đã giải quyết mới nhận Lúa</span>
    <a class="shop-cta-shop" href="${esc(product.link)}" target="_blank" rel="noopener noreferrer sponsored"><span class="shop-cta-label">🛍️ Xem & mua ngay – Tích Lúa 🌾</span><span class="shop-cta-arrow" aria-hidden="true">↗</span></a>
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
  if(fresh.length)await api('/api/shop/requests/read','POST',{}).catch(()=>{});
  const contact=(which)=>!!data.contacts[which];
  const showcaseURL=data.showcase_url||data.contacts?.showcase_url||'';
  const guideImage=(type,title)=>{
    if(!data.guide_images?.[type])return '';
    const src='/api/shop/guide-images/'+type;
    return `<details class="shop-guide-image-details"><summary>📷 Xem ảnh hướng dẫn: ${title}</summary>
      <a href="${src}" target="_blank" rel="noopener noreferrer" title="Mở ảnh lớn để phóng to">
        <img src="${src}" alt="${title}, ảnh hướng dẫn từng bước" loading="lazy" decoding="async">
      </a><p class="shop-guide-image-tip">Chạm vào ảnh để xem lớn và phóng to trên điện thoại.</p></details>`;
  };
  // Báo đơn chỉ render một lần: nằm trong thẻ trang trưng bày nếu đã có link,
  // và vẫn hiện riêng nếu Admin chưa thiết lập link.
  const reportSection=`<section class="shop-order-entry shop-report-section" id="shop-report-order" aria-label="Báo đơn hàng sau khi mua">
    <div class="shop-report-heading"><div><strong>📦 Đã mua hàng? Báo đơn tại đây</strong>
      <span>Mua xong, vào TikTok Shop → Đơn hàng → Chi tiết đơn hàng, sao chép ID. Quay lại đây bấm “Đã mua? Báo đơn”, dán ID rồi nhấn “Gửi xác minh đơn hàng”. Admin sẽ đối chiếu nguồn mua trước khi xét Lúa.</span></div>
      <button type="button" class="btn alt sm shop-report-history" data-go="shop-orders">Lịch sử đơn hàng</button>
    </div>
    <button type="button" class="btn shop-report-open" data-action="shop-report-order">📦 Đã mua? Báo đơn</button>
   </section>`;
  return `<div class="shop-page">
   <section class="shop-hero">
    <div class="shop-hero-copy"><div class="shop-kicker"><span class="shop-kicker-dot"></span> MUA SẮM THÔNG MINH • TÍCH LÚA</div>
    <h2>Mua món bạn thích.<br><em>Nhận thêm Lúa.</em></h2>
    <p>Khám phá sản phẩm TikTok Shop hoặc yêu cầu món hàng riêng. Phần thưởng chỉ được xác định sau khi đơn hàng được xác minh và giải quyết.</p>
    <div class="shop-hero-actions"><a href="#shop-catalog" class="shop-primary-link">Khám phá sản phẩm <span>↗</span></a><a href="#shop-request" class="shop-text-link">Tìm món theo yêu cầu ↓</a><button type="button" class="shop-text-button" data-go="shop-orders">📦 Xem đơn hàng & Lúa</button></div>
    </div>
    <div class="shop-hero-visual" aria-hidden="true"><div class="shop-deco-orbit shop-orbit-one"></div><div class="shop-deco-orbit shop-orbit-two"></div><div class="shop-main-bag">🛍️</div><div class="shop-floating shop-floating-one">🌾 Tích Lúa</div><div class="shop-floating shop-floating-two">✨ Món bạn thích</div></div>
   </section>
   <section class="shop-buy-guide" aria-labelledby="shop-buy-guide-title">
    <div class="shop-buy-guide-head">
      <span class="shop-buy-guide-label">HƯỚNG DẪN CHO KHÁCH HÀNG</span>
      <h2 id="shop-buy-guide-title">Có 2 cách mua hàng để được xét Lúa</h2>
      <p>Chọn một trong hai cách bên dưới và mua qua đúng đường dẫn do Trạm Có Lúa cung cấp.</p>
    </div>
    <div class="shop-buy-guide-grid">
      <article class="shop-buy-way">
        <span class="shop-buy-way-number" aria-hidden="true">01</span>
        <div class="shop-buy-way-symbol" aria-hidden="true">🛍️</div>
        <h3>Cách 1: Mua tại trang trưng bày TikTok Shop</h3>
        <p>Bấm “Vào trang trưng bày” của Admin ngay trên website, chọn sản phẩm bạn thích và đặt mua trực tiếp trên TikTok Shop.</p>
        ${guideImage('showcase','Cách 1: Mua qua trang trưng bày TikTok Shop của Admin')}
        ${showcaseURL?'<a href="#shop-showcase" class="shop-buy-way-link">Đến trang trưng bày ↓</a>':'<span class="shop-buy-way-unavailable">Trang trưng bày đang được cập nhật</span>'}
      </article>
      <article class="shop-buy-way">
        <span class="shop-buy-way-number" aria-hidden="true">02</span>
        <div class="shop-buy-way-symbol" aria-hidden="true">🌾</div>
        <h3>Cách 2: Mua từ gian hàng trên website</h3>
        <p>Vào “Gian hàng của Trạm” bên dưới, chọn món muốn mua rồi bấm “Xem &amp; mua ngay – Tích Lúa” để mở đúng link TikTok Shop và đặt hàng.</p>
        ${guideImage('catalog','Cách 2: Mua sản phẩm đã có trên gian hàng website')}
        <a href="#shop-catalog" class="shop-buy-way-link">Xem sản phẩm trên website ↓</a>
      </article>
    </div>
    <div class="shop-buy-guide-finish">
      <span class="shop-buy-guide-finish-icon" aria-hidden="true">📦</span>
      <div><strong>Đặt hàng xong? Làm đủ 4 bước để báo đơn nhận Lúa!</strong>
        <ol class="shop-buy-after-steps">
          <li><b>Mở TikTok Shop</b> → vào <b>Đơn hàng</b> → chọn <b>đơn vừa đặt</b> và mở <b>Chi tiết đơn hàng</b>.</li>
          <li>Tìm <b>Số đơn hàng / ID đơn hàng</b>, bấm <b>Sao chép</b>. Đây là mã đơn hàng, không phải mã sản phẩm.</li>
          <li><b>Quay lại Trạm Có Lúa</b> → vào <b>Mua sắm nhận Lúa</b> → bấm <b>“📦 Đã mua? Báo đơn”</b>.</li>
          <li><b>Dán ID đơn hàng</b> vào ô <b>“Mã đơn hàng TikTok”</b>, rồi bấm <b>“Gửi xác minh đơn hàng”</b>.</li>
        </ol>
        <p class="shop-buy-after-note">Sau khi gửi, xem trạng thái tại “Lịch sử đơn hàng”. Admin sẽ kiểm tra nguồn mua và chỉ xét Lúa cho đơn hợp lệ, đã giải quyết. Đặt hàng xong mà chưa gửi ID thì website chưa ghi nhận báo đơn.</p>
      </div>
      <a href="#shop-report-order" class="shop-buy-guide-report">Đến chỗ báo đơn ↓</a>
    </div>
   </section>
   ${showcaseURL?`<section class="shop-showcase-entry" id="shop-showcase" aria-label="Trang trưng bày TikTok Shop của Admin">
    <div class="shop-showcase-icon" aria-hidden="true">🌾</div>
    <div class="shop-showcase-copy"><span class="shop-showcase-kicker">GIAN HÀNG CHÍNH THỨC CỦA ADMIN</span>
      <h3>Khám phá trang trưng bày TikTok Shop</h3>
      <p>Nhấn để xem các sản phẩm Admin đã trưng bày. Chọn mua qua đúng liên kết, sau đó gửi mã đơn để được kiểm tra điều kiện nhận Lúa.</p>
    </div>
    <a class="shop-showcase-link" href="${esc(showcaseURL)}" target="_blank" rel="noopener noreferrer sponsored">🛍️ Vào trang trưng bày <span aria-hidden="true">↗</span></a>
    ${reportSection}
   </section>`:''}
   <div class="shop-trust-strip"><span>✓ Tự chọn sản phẩm</span><span>✓ Không cần tải ảnh lên web</span><span>✓ Thưởng sau xác minh</span></div>
   <aside class="shop-origin-policy" aria-label="Quy định mua đúng trang trưng bày" role="note">
     <span class="shop-origin-policy-icon" aria-hidden="true">⚠️</span>
     <div><strong>Quy định quan trọng để nhận Lúa</strong>
       <p>Chỉ đơn hàng mua qua trang trưng bày TikTok Shop của Admin hoặc liên kết sản phẩm do Trạm Có Lúa giới thiệu mới được xét thưởng Lúa.</p>
       <p>Nếu tự tìm mua ở bên ngoài, dù là cùng sản phẩm và có gửi ID đơn hàng, bạn vẫn không được tính Lúa. Admin sẽ kiểm tra nguồn đơn trước khi duyệt.</p>
     </div>
   </aside>
   ${fresh.length?`<div class="shop-notice shop-notice-ready" role="status"><span class="shop-notice-emoji">🎉</span><div><strong>Sản phẩm bạn yêu cầu đã có!</strong><p>Đã tìm thấy ${fresh.length} yêu cầu mới. Xem đường link mua trong mục Theo dõi yêu cầu bên dưới.</p></div><a href="#shop-my-requests">Xem ngay ↓</a></div>`:''}
   <section class="shop-section" id="shop-catalog">
    <div class="shop-section-top"><div><div class="shop-section-eyebrow">GỢI Ý CHO BẠN</div><h2>Gian hàng của Trạm</h2><p>Chọn sản phẩm bạn yêu thích, xem chi tiết và mua trực tiếp trên TikTok Shop.</p></div><span class="shop-count">${data.products.length} sản phẩm</span></div>
    <div class="shop-chips" role="group" aria-label="Danh mục sản phẩm">${categories.map(c=>`<button type="button" data-action="shop-filter" data-category="${c[0]}" class="${activeCategory===c[0]?'active':''}">${c[2]} ${c[1]}</button>`).join('')}</div>
    ${visible.length?`<div class="shop-products">${visible.map(p=>shopCard(p,esc)).join('')}</div>`:`<div class="shop-empty"><span>🛒</span><strong>${data.products.length?'Chưa có sản phẩm trong danh mục này':'Gian hàng đang được cập nhật'}</strong><p>Chưa thấy món bạn muốn? Gửi yêu cầu bên dưới để Admin hỗ trợ tìm sản phẩm.</p><a href="#shop-request">Yêu cầu sản phẩm ↘</a></div>`}
   </section>
   ${showcaseURL?'':reportSection}
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
      ${guideImage('request','Gửi yêu cầu: Gửi link hoặc ảnh sản phẩm qua Zalo/Telegram')}
      <div class="shop-request-privacy">🔒 Không tải ảnh sản phẩm khách gửi qua Zalo/Telegram lên website. Hệ thống chỉ lưu mã yêu cầu và mô tả.</div>
    </div>
   </section>
   <section class="shop-section shop-history" id="shop-my-requests">
    <div class="shop-section-top"><div><div class="shop-section-eyebrow">CẬP NHẬT TỰ ĐỘNG</div><h2>Theo dõi yêu cầu của bạn</h2><p>Khi Admin đánh dấu “Đã có sản phẩm”, thông tin sẽ xuất hiện ở đây, không cần nhắn lại.</p></div><span class="shop-count">${data.requests.length} yêu cầu</span></div>
    ${data.requests.length?`<div class="shop-requests">${data.requests.map(r=>`<article class="shop-request-item"><div class="shop-request-icon">${r.status==='ready'?'🎉':r.status==='rejected'?'✕':'⌛'}</div>
    <div class="shop-request-info"><div class="shop-request-top"><strong>${esc(r.code)}</strong><span class="shop-state shop-state-${esc(r.status)}">${r.status==='ready'?'Đã có sản phẩm':r.status==='rejected'?'Không tìm thấy':'Đang tìm sản phẩm'}</span></div>
    <p>${esc(r.note)}</p><small>Gửi qua ${r.channel==='zalo'?'Zalo':'Telegram'}</small>
    ${r.status==='ready'&&r.product_link?`<div class="shop-request-ready"><strong>${esc(r.product_title||'Sản phẩm đã tìm thấy')}</strong><a href="${esc(r.product_link)}" target="_blank" rel="noopener noreferrer sponsored">Xem & mua ngay ↗</a><a class="shop-report-text-link" href="#shop-report-order">Đã mua? Báo đơn →</a></div>`:''}</div></article>`).join('')}</div>`:`<div class="shop-empty shop-empty-compact"><span>📦</span><strong>Bạn chưa gửi yêu cầu nào</strong><p>Gửi ảnh hoặc link qua Zalo, Telegram để bắt đầu nhé.</p></div>`}
   </section>
   <section class="shop-guide"><h3>Hành trình nhận Lúa</h3><div><span><b>01</b>Chọn và mua hàng</span><span><b>02</b>Chờ xác minh đơn</span><span><b>03</b>Tạm duyệt – Chờ giải quyết</span><span><b>04</b>Đủ điều kiện mới cộng Lúa</span></div><p>Chỉ mua qua trang trưng bày hoặc liên kết sản phẩm do Admin giới thiệu mới đủ điều kiện xét Lúa. Mua ngoài rồi gửi ID không được tính. Đơn mua cần được Admin xác minh; nhấp liên kết hoặc đặt hàng chưa tự động phát sinh thưởng.</p></section>
   </div>`;
}

export async function adminShopPage(ctx){
  const {api,esc,field,select,heading,state}=ctx;
  const d=await api('/api/admin/shop');
  const edit=d.products.find(p=>p.id===state.shopEdit)||{};
  const categories=shopCategories().filter(x=>x[0]!=='all');
  const pending=d.requests.filter(r=>r.status==='pending');
  const opts=d.products.filter(p=>p.is_active).map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  return `${heading('Quản lý mua sắm','Đăng sản phẩm TikTok Shop, nhận yêu cầu và gửi thông báo ngay trên Trạm Có Lúa.')}
   <div class="shop-admin-head"><span>🛍️ TikTok Shop</span><strong>${d.products.filter(p=>p.is_active).length} sản phẩm đang hiển thị</strong><strong>${pending.length} yêu cầu đang chờ</strong></div>
   <div class="shop-admin-layout">
    <form class="card" data-form="shop-product" id="shop-product-form"><h3>${edit.id?'✏️ Chỉnh sửa sản phẩm':'✨ Thêm sản phẩm mới'}</h3><p class="note">Chỉ dán link sản phẩm hợp lệ. Không nhập thông tin nội bộ vào mô tả cho khách.</p>
     <input type="hidden" name="id" value="${esc(edit.id||'')}">
     ${field('shop-title','Tên sản phẩm',edit.title||'','required minlength="3" maxlength="110" placeholder="Tên sản phẩm TikTok Shop"')}
     <div class="field"><label for="shop-description">Giới thiệu sản phẩm (không bắt buộc)</label><textarea id="shop-description" name="description" maxlength="330" placeholder="Mô tả ngắn, rõ ràng...">${esc(edit.description||'')}</textarea></div>
     ${select('category','Danh mục',categories.map(x=>[x[0],x[1]]),edit.category||'beauty')}
     ${field('shop-product-link','Link sản phẩm TikTok Shop',edit.link||'','required type="url" placeholder="https://vt.tiktok.com/..."')}
     <div class="field shop-product-photo-field">
      <label for="shop-product-photo">📷 Ảnh sản phẩm (không bắt buộc)</label>
      <input type="file" id="shop-product-photo" name="shop-product-photo" accept="image/*" data-shop-image-input>
      <p class="note">Chọn ảnh từ Thư viện iPhone. Website tự nén ảnh nhỏ để tiết kiệm dung lượng; ảnh mới sẽ thay ảnh cũ khi bạn lưu sản phẩm.</p>
      <div class="shop-photo-preview" data-shop-photo-preview>
       ${edit.image_url?`<img src="${esc(edit.image_url)}" alt="Ảnh hiện tại của sản phẩm" loading="lazy">`:'<span>Chưa có ảnh sản phẩm.</span>'}
      </div>
      ${edit.id&&edit.image_url?`<button type="button" class="btn alt sm" data-action="shop-remove-image" data-id="${esc(edit.id)}">Xóa ảnh sản phẩm hiện tại</button>`:''}
     </div>
     ${select('is_active','Hiển thị sản phẩm',[['1','Hiển thị công khai'],['0','Lưu nháp / Tạm ẩn']],String(edit.is_active??1))}
     <div class="shop-admin-buttons"><button class="btn" type="submit">💾 ${edit.id?'Lưu thay đổi':'Thêm sản phẩm'}</button>${edit.id?'<button type="button" class="btn alt" data-action="shop-reset-product">Thêm mới</button>':''}</div>
    </form>
    <form class="card" data-form="shop-contact"><h3>💬 Kênh liên hệ Admin</h3><p class="note">Khách gửi ảnh/link trực tiếp qua Zalo hoặc Telegram, không tải ảnh lên máy chủ.</p>
      ${field('shop-zalo','Số Zalo hoặc link QR zaloapp.com',d.contacts.zalo||'','placeholder="https://zaloapp.com/qr/p/... hoặc zalo.me/..."')}
      ${field('shop-telegram','Username hoặc link Telegram',d.contacts.telegram||'','placeholder="@username hoặc https://t.me/..."')}
      <button class="btn" type="submit">Lưu kênh liên hệ</button>
      <div class="shop-admin-tip">Thông tin này được dùng cho nút liên hệ ở trang mua sắm, không xuất hiện trên trang Admin khác.</div>
    </form>
   </div>
   <form class="card shop-showcase-admin" data-form="shop-showcase">
     <h3>🛍️ Trang trưng bày TikTok Shop của Admin</h3>
     <p class="note">Dán link trang trưng bày mà bạn đã sao chép từ TikTok Shop. Khách sẽ thấy nút vào gian hàng ngay đầu mục “Mua sắm nhận Lúa”.</p>
     ${field('shop-showcase-url','Link trang trưng bày TikTok Shop',d.showcase_url||'','type="url" maxlength="900" placeholder="https://www.tiktok.com/... hoặc https://vt.tiktok.com/..."')}
     <div class="shop-showcase-admin-actions">
       <button class="btn" type="submit">💾 Lưu link trang trưng bày</button>
       ${d.showcase_url?`<a class="btn alt" href="${esc(d.showcase_url)}" target="_blank" rel="noopener noreferrer">Kiểm tra link ↗</a>`:''}
     </div>
     <p class="note">Để trống rồi lưu nếu muốn ẩn nút bên phía khách. Chỉ lưu link TikTok HTTPS; không thay đổi danh sách sản phẩm hoặc lịch sử đơn hàng.</p>
   </form>
   <section class="card shop-guide-admin" aria-label="Quản lý 3 ảnh hướng dẫn">
     <h3>📷 Ảnh hướng dẫn khách mua hàng</h3>
     <p class="note">Chọn 3 ảnh bạn đã duyệt từ Thư viện iPhone. Khách sẽ thấy ảnh Cách 1 và Cách 2 trong hướng dẫn mua hàng; ảnh Zalo/Telegram sẽ nằm ngay phần “Không thấy món bạn muốn?”.</p>
     <p class="note">Lưu ý quyền riêng tư: hãy dùng ID đơn hàng minh họa, không đăng ảnh chứa mã đơn hàng thật của khách.</p>
     <div class="shop-guide-admin-grid">${[
       ['showcase','Cách 1 · Mua qua trang trưng bày'],
       ['catalog','Cách 2 · Mua qua gian hàng website'],
       ['request','Gửi link hoặc ảnh qua Zalo/Telegram']
     ].map(([type,title])=>`<form data-form="shop-guide-image" class="shop-guide-upload">
       <input type="hidden" name="guide_type" value="${type}">
       <h4>${title}</h4>
       <div class="shop-product-photo-field">
         <label for="shop-guide-input-${type}">Chọn ảnh hướng dẫn</label>
         <input id="shop-guide-input-${type}" type="file" accept="image/*" name="shop-guide-photo" data-shop-image-input>
         <div class="shop-photo-preview" data-shop-photo-preview>${d.guide_images?.[type]?`<img src="/api/shop/guide-images/${type}" alt="Ảnh hướng dẫn đã lưu" loading="lazy">`:'<span>Chưa đăng ảnh hướng dẫn.</span>'}</div>
       </div>
       <div class="shop-admin-buttons"><button class="btn" type="submit">💾 Lưu ảnh hướng dẫn</button>
        ${d.guide_images?.[type]?`<button class="btn alt" type="button" data-action="shop-guide-image-remove" data-guide-type="${type}">Xóa ảnh</button>`:''}
       </div>
     </form>`).join('')}</div>
     <p class="note">Ảnh được tự nén dưới 160 KB trước khi lưu vào D1, không làm ảnh hưởng sản phẩm, Lúa hoặc đơn hàng.</p>
   </section>
   <section class="shop-admin-section"><div class="shop-section-top"><div><h2>Danh sách sản phẩm</h2><p>Bật/tắt hoặc sửa sản phẩm mà không ảnh hưởng nhiệm vụ cũ.</p></div></div>
   ${d.products.length?`<div class="shop-admin-list">${d.products.map(p=>`<div class="shop-admin-product"><div class="shop-admin-product-icon">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy">`:(categories.find(x=>x[0]===p.category)||categories.at(-1))[2]}</div><div><strong>${esc(p.title)}</strong><p>${p.is_active?'Đang hiển thị':'Đang ẩn'} · ${esc((categories.find(c=>c[0]===p.category)||[])[1]||p.category)}</p></div><button type="button" class="btn alt sm" data-action="shop-edit-product" data-id="${esc(p.id)}">Sửa</button></div>`).join('')}</div>`:'<p class="shop-admin-empty">Chưa có sản phẩm. Thêm sản phẩm đầu tiên ở biểu mẫu phía trên.</p>'}
   </section>
   <section class="shop-admin-section"><div class="shop-section-top"><div><h2>Yêu cầu sản phẩm từ khách</h2><p>Đối chiếu mã SP ở đầu thẻ với mã khách gửi trên Zalo/Telegram. Bạn có thể chọn sản phẩm có sẵn hoặc nhập link sản phẩm mới ngay tại yêu cầu để tự báo khách.</p></div><span class="shop-count">${pending.length} đang chờ</span></div>
   ${d.requests.length?`<div class="shop-admin-requests">${d.requests.map(r=>`<article class="shop-admin-request"><div class="shop-request-top"><strong>${esc(r.code)}</strong><span class="shop-state shop-state-${esc(r.status)}">${r.status==='pending'?'Chờ xử lý':r.status==='ready'?'Đã có sản phẩm':'Từ chối'}</span></div>
    <p><strong>${esc(r.name)}</strong> · ${esc(r.email)}</p><p>${esc(r.note)} · ${r.channel==='zalo'?'Zalo':'Telegram'}</p>
    ${r.status==='pending'?`<div class="shop-admin-resolution"><label for="shop-resolve-${esc(r.id)}">Chọn sản phẩm đã thêm</label><select id="shop-resolve-${esc(r.id)}" data-shop-product-for="${esc(r.id)}"><option value="">-- Chọn sản phẩm --</option>${opts}</select>
     <div class="shop-admin-buttons"><button type="button" class="btn sm" data-action="shop-request-ready" data-id="${esc(r.id)}" ${opts?'':'disabled'}>✓ Đã có sản phẩm</button><button type="button" class="btn danger sm" data-action="shop-request-reject" data-id="${esc(r.id)}">Không tìm thấy</button></div>
${!opts?'<p class="shop-quick-hint">Bạn chưa thêm sản phẩm nào. Có thể thêm trực tiếp bên dưới để báo khách ngay.</p>':''}
<div class="shop-quick-divider"><span>HOẶC THÊM SẢN PHẨM MỚI</span></div>
<form class="shop-quick-form" data-form="shop-fulfill">
 <input type="hidden" name="request_id" value="${esc(r.id)}">
 <label for="shopquick-title-${esc(r.id)}">Tên sản phẩm <span aria-hidden="true">*</span></label>
 <input id="shopquick-title-${esc(r.id)}" name="title" type="text" maxlength="110" minlength="3" required placeholder="Tên sản phẩm tìm được trên TikTok Shop">
 <label for="shopquick-link-${esc(r.id)}">Link sản phẩm TikTok Shop <span aria-hidden="true">*</span></label>
 <input id="shopquick-link-${esc(r.id)}" name="link" type="url" maxlength="900" required placeholder="https://vt.tiktok.com/...">
 <div class="shop-product-photo-field">
  <label for="shopquick-photo-${esc(r.id)}">Ảnh sản phẩm (không bắt buộc)</label>
  <input id="shopquick-photo-${esc(r.id)}" type="file" name="shop-quick-photo" accept="image/*" data-shop-image-input>
  <div class="shop-photo-preview" data-shop-photo-preview><span>Chưa chọn ảnh.</span></div>
 </div>
 <label for="shopquick-category-${esc(r.id)}">Danh mục</label>
 <select id="shopquick-category-${esc(r.id)}" name="category">
  <option value="other">Theo yêu cầu / Khác</option><option value="beauty">Làm đẹp</option><option value="fashion">Thời trang</option><option value="home">Nhà cửa</option><option value="technology">Công nghệ</option>
 </select>
 <button type="submit" class="btn shop-quick-submit">＋ Thêm sản phẩm & thông báo khách</button>
 <p class="note">Website tự cập nhật trạng thái cho đúng khách. Không cần nhắn Zalo/Telegram; khách sẽ thấy khi đăng nhập hoặc tải lại trang.</p>
</form></div>`:`<p class="note">${r.status==='ready'?`Đã liên kết: ${esc(r.product_title||'Sản phẩm')}`:'Đã đánh dấu không tìm thấy'}</p>`}
    </article>`).join('')}</div>`:'<p class="shop-admin-empty">Chưa có yêu cầu sản phẩm nào.</p>'}
   </section><p class="note section">Lưu ý: Yêu cầu tìm sản phẩm và duyệt đơn hàng được quản lý riêng. Phần thưởng Lúa chỉ được ghi nhận sau khi đơn hợp lệ và đã giải quyết.</p>`;
}

export async function handleShopAction(action,el,ctx){
  const {api,toast,navigate,state,esc}=ctx;
  if(action==='shop-filter'){state.shopCategory=el.dataset.category||'all';await navigate('shop');return true;}
  if(action==='shop-edit-product'){state.shopEdit=el.dataset.id;await navigate('admin-shop');document.getElementById('shop-product-form')?.scrollIntoView({behavior:'smooth'});return true;}
  if(action==='shop-reset-product'){state.shopEdit=null;await navigate('admin-shop');return true;}
  if(action==='shop-guide-image-remove'){
   const type=el.dataset.guideType;
   if(!['showcase','catalog','request'].includes(type)||!askShopConfirm('Xóa ảnh hướng dẫn này? Nội dung hướng dẫn chữ vẫn giữ nguyên.'))return true;
   await api('/api/admin/shop/guide-images/'+type,'PUT',{image_data:''});
   toast('Đã xóa ảnh hướng dẫn.');await navigate('admin-shop');return true;
  }
  if(action==='shop-remove-image'){
   const pid=el.dataset.id;
   if(!pid||!askShopConfirm('Xóa ảnh sản phẩm hiện tại? Sản phẩm và đơn hàng vẫn được giữ nguyên.'))return true;
   await api('/api/admin/shop/products/'+encodeURIComponent(pid)+'/image','PUT',{image_data:''});
   toast('Đã xóa ảnh sản phẩm.');await navigate('admin-shop');return true;
  }
  if(action==='shop-start-request'){
    el.disabled=true;
    try{
      const channel=el.dataset.channel;
      const note=document.getElementById('shop-note')?.value||'';
      const r=await api('/api/shop/requests','POST',{channel,note});
      const tr=text=>window.TramI18n?.translateLabel?.(text)??text;
       const msg=tr('Mã yêu cầu của tôi:')+' '+r.code+'\n'+tr('Tôi muốn tìm sản phẩm theo ảnh hoặc link gửi kèm.');
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
    if(!askShopConfirm('Xác nhận đã có đúng sản phẩm khách yêu cầu? Hệ thống sẽ thông báo trên website của khách.'))return true;
    await api('/api/admin/shop/requests/'+encodeURIComponent(id),'POST',{status:'ready',product_id:sel.value});
    toast('Đã có sản phẩm! Website sẽ thông báo cho khách.');await navigate('admin-shop');return true;
  }
  if(action==='shop-request-reject'){
    if(!askShopConfirm('Đánh dấu không tìm thấy sản phẩm này?'))return true;
    await api('/api/admin/shop/requests/'+encodeURIComponent(el.dataset.id),'POST',{status:'rejected'});
    toast('Đã cập nhật yêu cầu.');await navigate('admin-shop');return true;
  }
  return false;
}

export async function handleShopSubmit(kind,b,ctx){
  const {api,toast,navigate,state}=ctx;
  if(kind==='shop-guide-image'){
    const type=b.guide_type;
    if(!['showcase','catalog','request'].includes(type))throw new Error('Loại ảnh hướng dẫn không hợp lệ.');
    const file=b['shop-guide-photo'];
    if(!file?.size)throw new Error('Bạn cần chọn một ảnh hướng dẫn trước khi lưu.');
    const imageData=await shopPhotoData(file);
    await api('/api/admin/shop/guide-images/'+type,'PUT',{image_data:imageData});
    toast('Đã lưu ảnh hướng dẫn cho khách.');await navigate('admin-shop');return true;
  }
  if(kind==='shop-product'){
    const raw=document.getElementById('shop-product-form');
    const title=raw?.querySelector('[name="shop-title"]')?.value||'';
    const link=raw?.querySelector('[name="shop-product-link"]')?.value||'';
    const payload={title,link,description:b.description||'',category:b.category,is_active:b.is_active==='1'};
    const photo=raw?.querySelector('[name="shop-product-photo"]')?.files?.[0];
    const imageData=photo?.size?await shopPhotoData(photo):'';
    let productId=b.id;
    if(productId)await api('/api/admin/shop/products/'+encodeURIComponent(productId),'PATCH',payload);
    else{const created=await api('/api/admin/shop/products','POST',payload);productId=created.id;}
    if(imageData){
     try{await api('/api/admin/shop/products/'+encodeURIComponent(productId)+'/image','PUT',{image_data:imageData});}
     catch(err){
      state.shopEdit=productId;await navigate('admin-shop');
      toast('Đã lưu sản phẩm nhưng chưa lưu được ảnh: '+err.message,true);return true;
     }
    }
    state.shopEdit=null;toast('Đã lưu sản phẩm TikTok Shop'+(imageData?' và ảnh.':'.'));await navigate('admin-shop');return true;
  }
  if(kind==='shop-fulfill'){
    if(!b.request_id)throw new Error('Chưa xác định được mã yêu cầu cần xử lý.');
    const imageData=b['shop-quick-photo']?.size?await shopPhotoData(b['shop-quick-photo']):'';
    if(!askShopConfirm('Đã kiểm tra đúng sản phẩm, đúng link sản phẩm và mã yêu cầu của khách? Website sẽ thông báo tự động.'))return true;
    const result=await api('/api/admin/shop/requests/'+encodeURIComponent(b.request_id),'POST',{
      status:'ready_new',title:b.title,link:b.link,category:b.category||'other',description:''
    });
    if(imageData){
     try{await api('/api/admin/shop/products/'+encodeURIComponent(result.product_id)+'/image','PUT',{image_data:imageData});}
     catch(err){await navigate('admin-shop');toast('Đã thêm sản phẩm, nhưng ảnh chưa lưu được: '+err.message,true);return true;}
    }
    toast(result.message);await navigate('admin-shop');return true;
  }
  if(kind==='shop-showcase'){
    await api('/api/admin/shop/showcase','PUT',{url:b['shop-showcase-url']||''});
    toast('Đã lưu link trang trưng bày TikTok Shop.');await navigate('admin-shop');return true;
  }
  if(kind==='shop-contact'){
    await api('/api/admin/shop/contact','PUT',{zalo:b['shop-zalo']||'',telegram:b['shop-telegram']||''});
    toast('Đã lưu Zalo và Telegram.');await navigate('admin-shop');return true;
  }
  return false;
}
