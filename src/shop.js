export async function shopAPI(req, env, H) {
  const {auth, readBody, fail, json, id, str} = H;
  const path = new URL(req.url).pathname;
  const method = req.method;
  if (!(path === '/api/shop' || path.startsWith('/api/shop/') || path === '/api/admin/shop' || path.startsWith('/api/admin/shop/'))) return null;
  const db = env.DB;
  const goodLink = (input) => {
    let parsed;
    try { parsed = new URL(String(input || '')); } catch { return false; }
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && (host === 'tiktok.com' || host.endsWith('.tiktok.com') || host === 'tiktokshop.com' || host.endsWith('.tiktokshop.com')) && !parsed.username && !parsed.password;
  };
  const categories = ['beauty','fashion','home','technology','other'];
  const validateProduct = (body) => {
    const title = str(body.title, 110), description = str(body.description, 330);
    const link = str(body.link, 900), category = str(body.category, 30);
    if (title.length < 3) fail(400, 'Tên sản phẩm phải có ít nhất 3 ký tự.');
    if (!categories.includes(category)) fail(400, 'Nhóm sản phẩm không hợp lệ.');
    if (!goodLink(link)) fail(400, 'Cần link TikTok Shop Affiliate HTTPS hợp lệ.');
    return {title, description, link, category, active:body.is_active === true || String(body.is_active) === '1' ? 1 : 0};
  };
  const shopContacts = async () => {
    const rows = await db.prepare("SELECT key,value FROM settings WHERE key IN ('shop_contact_zalo','shop_contact_telegram')").all();
    const values = Object.fromEntries(rows.results.map(r => [r.key, r.value]));
    return {zalo:values.shop_contact_zalo || '', telegram:values.shop_contact_telegram || ''};
  };
  if (path === '/api/shop' && method === 'GET') {
    const user = await auth(req,env);
    const [products, requests, contacts] = await Promise.all([
      db.prepare("SELECT id,title,description,link,category,created_at FROM shop_products WHERE is_active=1 ORDER BY created_at DESC LIMIT 100").all(),
      db.prepare("SELECT r.id,r.code,r.note,r.channel,r.status,r.created_at,r.updated_at,r.seen_at,p.title AS product_title,CASE WHEN p.is_active=1 THEN p.link ELSE NULL END AS product_link FROM shop_requests r LEFT JOIN shop_products p ON p.id=r.product_id WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 60").bind(user.id).all(),
      shopContacts()
    ]);
    return json({products:products.results,requests:requests.results,contacts});
  }
  if (path === '/api/shop/alerts' && method === 'GET') {
    const user = await auth(req,env);
    const count = await db.prepare("SELECT COUNT(*) AS n FROM shop_requests WHERE user_id=? AND status='ready' AND seen_at IS NULL").bind(user.id).first();
    return json({unread:Number(count?.n||0)});
  }
  if (path === '/api/shop/requests/read' && method === 'POST') {
    const user = await auth(req,env);
    await db.prepare("UPDATE shop_requests SET seen_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='ready' AND seen_at IS NULL").bind(user.id).run();
    return json({ok:true});
  }
  if (path === '/api/shop/requests' && method === 'POST') {
    const user = await auth(req,env), body = await readBody(req);
    const channel = str(body.channel,16);
    if (!['zalo','telegram'].includes(channel)) fail(400,'Chọn Zalo hoặc Telegram.');
    const contacts = await shopContacts();
    if (!contacts[channel]) fail(409,'Kênh liên hệ này chưa được Admin thiết lập.');
    const note = str(body.note,240) || 'Khách gửi ảnh hoặc liên kết sản phẩm qua tin nhắn.';
    const used = await db.prepare("SELECT COUNT(*) AS day_total,COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0) AS pending_total FROM shop_requests WHERE user_id=? AND date(created_at,'+7 hours')=date('now','+7 hours')").bind(user.id).first();
    if (Number(used?.day_total||0)>=5) fail(429,'Bạn đã gửi đủ 5 yêu cầu hôm nay. Vui lòng quay lại ngày mai.');
    const pending = await db.prepare("SELECT COUNT(*) AS n FROM shop_requests WHERE user_id=? AND status='pending'").bind(user.id).first();
    if (Number(pending?.n||0)>=15) fail(429,'Bạn đang có nhiều yêu cầu chờ xử lý. Vui lòng chờ Admin.');
    const requestId = id(), code = 'SP-'+requestId.replaceAll('-','').slice(0,10).toUpperCase();
    await db.prepare("INSERT INTO shop_requests(id,code,user_id,channel,note,status) VALUES(?,?,?,?,?,'pending')").bind(requestId,code,user.id,channel,note).run();
    return json({ok:true,code,contact_url:contacts[channel],message:'Đã tạo mã yêu cầu. Hãy gửi mã cùng ảnh hoặc link sản phẩm cho Admin.'},201);
  }
  if (!path.startsWith('/api/admin/shop')) return null;
  const admin = await auth(req,env,'admin');
  if (path === '/api/admin/shop' && method === 'GET') {
    const [products, requests, contacts] = await Promise.all([
      db.prepare("SELECT id,title,description,link,category,is_active,created_at FROM shop_products ORDER BY created_at DESC LIMIT 200").all(),
      db.prepare("SELECT r.id,r.code,r.channel,r.note,r.status,r.product_id,r.created_at,r.updated_at,u.name,u.email,p.title AS product_title FROM shop_requests r JOIN users u ON u.id=r.user_id LEFT JOIN shop_products p ON p.id=r.product_id ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 200").all(),
      shopContacts()
    ]);
    return json({products:products.results,requests:requests.results,contacts});
  }
  if (path === '/api/admin/shop/contact' && method === 'PUT') {
    const body = await readBody(req);
    const zaloRaw = str(body.zalo,180), telegramRaw = str(body.telegram,180);
    let zalo = '', telegram = '';
    if (zaloRaw) {
      if (/^0[0-9]{9}$/.test(zaloRaw)) zalo='https://zalo.me/'+zaloRaw;
      else {
        try {
          const u=new URL(zaloRaw);
          if(u.protocol!=='https:' || !['zalo.me','www.zalo.me'].includes(u.hostname) || !u.pathname || u.pathname==='/' || u.username || u.password) fail(400,'Link Zalo chưa hợp lệ.');
          zalo=u.href;
        } catch(e) { if(e.status) throw e; fail(400,'Nhập số Zalo 10 chữ số hoặc link https://zalo.me/...'); }
      }
    }
    if (telegramRaw) {
      let name=telegramRaw.replace(/^@/,'');
      if (telegramRaw.startsWith('https://')) {
        try {
          const u=new URL(telegramRaw);
          if (u.protocol!=='https:' || !['t.me','www.t.me','telegram.me'].includes(u.hostname) || u.search || u.hash || u.username || u.password) fail(400,'Link Telegram chưa hợp lệ.');
          name=u.pathname.replace(/^\/|\/$/g,'');
        } catch(e) { if(e.status) throw e; fail(400,'Link Telegram chưa hợp lệ.'); }
      }
      if (!/^[A-Za-z0-9_]{5,32}$/.test(name)) fail(400,'Telegram cần tên người dùng từ 5–32 ký tự.');
      telegram='https://t.me/'+name;
    }
    await db.batch([
      db.prepare("INSERT INTO settings(key,value) VALUES('shop_contact_zalo',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(zalo),
      db.prepare("INSERT INTO settings(key,value) VALUES('shop_contact_telegram',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(telegram)
    ]);
    return json({ok:true,contacts:{zalo,telegram}});
  }
  if (path === '/api/admin/shop/products' && method === 'POST') {
    const data = validateProduct(await readBody(req)), productId=id();
    await db.prepare("INSERT INTO shop_products(id,title,description,link,category,is_active) VALUES(?,?,?,?,?,?)").bind(productId,data.title,data.description,data.link,data.category,data.active).run();
    return json({ok:true,id:productId},201);
  }
  const productMatch = path.match(/^\/api\/admin\/shop\/products\/([0-9a-f-]{36})$/i);
  if (productMatch && method === 'PATCH') {
    const data=validateProduct(await readBody(req));
    const changed=await db.prepare("UPDATE shop_products SET title=?,description=?,link=?,category=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(data.title,data.description,data.link,data.category,data.active,productMatch[1]).run();
    if (!changed.meta?.changes) fail(404,'Không tìm thấy sản phẩm.');
    return json({ok:true});
  }
  const requestMatch = path.match(/^\/api\/admin\/shop\/requests\/([0-9a-f-]{36})$/i);
  if (requestMatch && method === 'POST') {
    const body=await readBody(req), status=str(body.status,16);
    if (!['ready','rejected'].includes(status)) fail(400,'Trạng thái yêu cầu không hợp lệ.');
    const productId=status==='ready'?str(body.product_id,50):null;
    if (status==='ready') {
      if (!productId) fail(400,'Hãy chọn sản phẩm đã thêm vào danh sách trước.');
      const product=await db.prepare("SELECT id FROM shop_products WHERE id=? AND is_active=1").bind(productId).first();
      if (!product) fail(400,'Sản phẩm chưa được bật công khai.');
    }
    const changed=await db.prepare("UPDATE shop_requests SET status=?,product_id=?,updated_at=CURRENT_TIMESTAMP,seen_at=NULL WHERE id=? AND status='pending'").bind(status,productId,requestMatch[1]).run();
    if (!changed.meta?.changes) fail(409,'Yêu cầu đã được xử lý hoặc không tồn tại.');
    return json({ok:true,message:status==='ready'?'Đã có sản phẩm. Website sẽ thông báo cho khách.':'Đã từ chối yêu cầu.'});
  }
  return null;
}
