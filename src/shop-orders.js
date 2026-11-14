// Đơn TikTok Affiliate: khách tự báo mã đơn, Admin kiểm tra và quyết toán THỦ CÔNG.
// Không suy luận người mua từ lượt click/link và không phát Lúa trước khi đối chiếu.
export async function shopOrdersAPI(req,env,H){
  const {auth,readBody,fail,json,id,str}=H;
  const p=new URL(req.url).pathname,m=req.method,db=env.DB;
  if(!(p==='/api/shop/orders'||p.startsWith('/api/shop/orders/')
    ||p==='/api/admin/shop/orders'||p.startsWith('/api/admin/shop/orders/')))return null;
  const goodInteger=(value,min,max)=>Number.isSafeInteger(Number(value))
    && String(value??'').trim()!=='' && Number(value)>=min && Number(value)<=max;
  const normalizeRef=value=>str(value,80).replace(/[\s\-]/g,'').toUpperCase();
  if(p==='/api/shop/orders'&&m==='GET'){
    const me=await auth(req,env);
    // Tuyệt đối không trả commission_vnd, rate_snapshot, settled_reference cho thành viên.
    const orders=await db.prepare(`SELECT o.id,o.order_reference,o.status,o.customer_note,
      o.admin_note,o.reward_lua,o.created_at,o.updated_at,o.resolved_at,
      p.title AS product_title,CASE WHEN p.is_active=1 THEN p.link ELSE NULL END AS product_link
      FROM shop_orders o JOIN shop_products p ON p.id=o.product_id
      WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 150`).bind(me.id).all();
    const events=await db.prepare(`SELECT e.order_id,e.status,e.detail,e.created_at FROM shop_order_events e
      JOIN shop_orders o ON o.id=e.order_id
      WHERE o.user_id=? ORDER BY e.created_at DESC LIMIT 500`).bind(me.id).all();
    return json({orders:orders.results.map(o=>({...o,reward_lua:o.status==='resolved'?o.reward_lua:0})),
      events:events.results});
  }
  if(p==='/api/shop/orders/alerts'&&m==='GET'){
    const me=await auth(req,env);
    const result=await db.prepare("SELECT COUNT(*) n FROM shop_orders WHERE user_id=? AND status!='pending' AND seen_at IS NULL").bind(me.id).first();
    return json({unread:Number(result?.n||0)});
  }
  if(p==='/api/shop/orders/read'&&m==='POST'){
    const me=await auth(req,env);
    await db.prepare("UPDATE shop_orders SET seen_at=CURRENT_TIMESTAMP WHERE user_id=? AND status!='pending' AND seen_at IS NULL").bind(me.id).run();
    return json({ok:true});
  }
  if(p==='/api/shop/orders'&&m==='POST'){
    const me=await auth(req,env);
    const b=await readBody(req),productId=str(b.product_id,50);
    const orderRef=normalizeRef(b.order_reference),note=str(b.note,220);
    if(!/^[A-Z0-9_]{8,64}$/.test(orderRef))fail(400,'Nhập mã đơn hàng TikTok từ 8–64 ký tự (chữ hoặc số).');
    const product=await db.prepare("SELECT id FROM shop_products WHERE id=? AND is_active=1").bind(productId).first();
    if(!product)fail(404,'Sản phẩm không còn hiển thị. Hãy chọn sản phẩm khác.');
    const oid=id();
    // Trường UNIQUE(order_reference) chống một mã đơn được nhiều tài khoản nhận Lúa.
    const inserted=await db.batch([
      db.prepare(`INSERT INTO shop_orders(id,user_id,product_id,order_reference,status,customer_note,seen_at)
        VALUES(?,?,?,?,'pending',?,CURRENT_TIMESTAMP)`).bind(oid,me.id,productId,orderRef,note),
      db.prepare(`INSERT INTO shop_order_events(id,order_id,actor_id,status,detail)
        VALUES(?,?,?,'pending','Khách báo đã đặt hàng, đang chờ đối chiếu TikTok Shop')`).bind(id(),oid,me.id)
    ]);
    return json({ok:true,id:oid,status:'pending',
      message:'Đã ghi nhận báo đơn. Trạng thái: Chờ xác minh. Chưa có Lúa được cộng.'},201);
  }
  if(!p.startsWith('/api/admin/shop/orders'))return null;
  const admin=await auth(req,env,'admin');
  if(p==='/api/admin/shop/orders'&&m==='GET'){
    const rows=await db.prepare(`SELECT o.id,o.user_id,o.product_id,o.order_reference,o.status,
      o.customer_note,o.admin_note,o.commission_vnd,o.reward_lua,o.rate_snapshot,
      o.settled_reference,o.created_at,o.updated_at,o.reviewed_at,o.resolved_at,
      u.name,u.email,p.title AS product_title
      FROM shop_orders o JOIN users u ON u.id=o.user_id
      JOIN shop_products p ON p.id=o.product_id
      ORDER BY CASE o.status WHEN 'pending' THEN 0 WHEN 'provisional' THEN 1 ELSE 2 END,
      o.created_at DESC LIMIT 250`).all();
    const rate=await db.prepare("SELECT value FROM settings WHERE key='lua_per_vnd'").first();
    return json({orders:rows.results,lua_per_vnd:Number(rate?.value||0)});
  }
  const match=p.match(/^\/api\/admin\/shop\/orders\/([0-9a-f-]{36})$/i);
  if(match&&m==='POST'){
    const b=await readBody(req),status=str(b.status,20),oid=match[1];
    if(!['provisional','resolved','rejected'].includes(status))fail(400,'Trạng thái đơn hàng không hợp lệ.');
    const order=await db.prepare("SELECT id,user_id,status,order_reference FROM shop_orders WHERE id=?").bind(oid).first();
    if(!order)fail(404,'Không tìm thấy đơn hàng.');
    if(order.status==='resolved'||order.status==='rejected')
      fail(409,'Đơn hàng này đã xử lý xong, không thể cộng Lúa hoặc xử lý lại.');
    if(status==='provisional'){
      if(order.status!=='pending')fail(409,'Chỉ đơn Chờ xác minh mới được tạm duyệt.');
      const privateNote=str(b.admin_note,300);
      if(privateNote.length<10)fail(400,'Ghi chú đối chiếu đơn đã giao và đã thanh toán (ít nhất 10 ký tự).');
      const results=await db.batch([
        db.prepare(`UPDATE shop_orders SET status='provisional',admin_note=?,
          reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,seen_at=NULL
          WHERE id=? AND status='pending'`).bind('Đơn đã được đối chiếu, chờ giải quyết hoa hồng.',oid),
        db.prepare(`INSERT INTO shop_order_events(id,order_id,actor_id,status,detail)
          SELECT ?,id,?,'provisional','Đã xác minh nhận hàng/thanh toán; chờ TikTok giải quyết hoa hồng'
          FROM shop_orders WHERE id=? AND status='provisional'
          AND NOT EXISTS(SELECT 1 FROM shop_order_events WHERE order_id=? AND status='provisional')`)
          .bind(id(),admin.id,oid,oid)
      ]);
      if(!results[0].meta?.changes)fail(409,'Đơn hàng đã được người khác xử lý. Hãy tải lại.');
      return json({ok:true,message:'Tạm duyệt – Chờ giải quyết. Chưa cộng Lúa.'});
    }
    if(status==='rejected'){
      const reason=str(b.reason,300);
      if(reason.length<6)fail(400,'Cần ghi lý do từ chối ít nhất 6 ký tự.');
      const results=await db.batch([
        db.prepare(`UPDATE shop_orders SET status='rejected',admin_note=?,
          updated_at=CURRENT_TIMESTAMP,reviewed_at=CURRENT_TIMESTAMP,seen_at=NULL
          WHERE id=? AND status IN ('pending','provisional')`).bind(reason,oid),
        db.prepare(`INSERT INTO shop_order_events(id,order_id,actor_id,status,detail)
          SELECT ?,id,?,'rejected',? FROM shop_orders
          WHERE id=? AND status='rejected'
          AND NOT EXISTS(SELECT 1 FROM shop_order_events WHERE order_id=? AND status='rejected')`)
          .bind(id(),admin.id,reason,oid,oid)
      ]);
      if(!results[0].meta?.changes)fail(409,'Đơn hàng đã được xử lý, vui lòng tải lại.');
      return json({ok:true,message:'Đã từ chối đơn, không cộng Lúa.'});
    }
    if(order.status!=='provisional')fail(409,'Bạn cần xác minh và tạm duyệt đơn trước.');
    const settlementRef=str(b.settled_reference,90);
    if(settlementRef.length<8)fail(400,'Nhập mã đơn/mã đối soát hoa hồng TikTok đã giải quyết (ít nhất 8 ký tự).');
    if(!goodInteger(b.commission_vnd,1,1000000000))
      fail(400,'Hoa hồng thực nhận phải là số nguyên VNĐ dương.');
    if(!goodInteger(b.reward_lua,1,10000000))
      fail(400,'Số Lúa thưởng phải là số nguyên dương tối đa 10 triệu.');
    const commission=Number(b.commission_vnd),reward=Number(b.reward_lua);
    const rateRow=await db.prepare("SELECT value FROM settings WHERE key='lua_per_vnd'").first();
    const rate=Number(rateRow?.value||0);
    if(!Number.isSafeInteger(rate)||rate<=0||rate>10000000)
      fail(409,'Cần đặt tỷ giá Lúa/VNĐ hợp lệ trong Cài đặt Admin trước khi cộng Lúa.');
    if(BigInt(reward)>BigInt(commission)*BigInt(rate))
      fail(400,'Lúa thưởng quy đổi vượt hoa hồng thực nhận. Hãy kiểm tra số liệu.');
    // Không có API TikTok xác minh tự động. Chỉ Admin sau khi đối chiếu hoa hồng đã quyết toán mới được xác nhận.
    const results=await db.batch([
      db.prepare(`UPDATE shop_orders SET status='resolved',
        commission_vnd=?,reward_lua=?,rate_snapshot=?,settled_reference=?,
        updated_at=CURRENT_TIMESTAMP,resolved_at=CURRENT_TIMESTAMP,seen_at=NULL
        WHERE id=? AND status='provisional'`).bind(commission,reward,rate,settlementRef,oid),
      db.prepare(`INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id)
        SELECT ?,user_id,reward_lua,'Thưởng mua sắm TikTok Shop','shop_order',id
        FROM shop_orders WHERE id=? AND status='resolved'
        ON CONFLICT(user_id,reference_type,reference_id) DO NOTHING`).bind(id(),oid),
      db.prepare(`INSERT INTO shop_order_events(id,order_id,actor_id,status,detail)
        SELECT ?,id,?,'resolved','Hoa hồng đã đối chiếu quyết toán; thưởng Lúa đã ghi vào ví'
        FROM shop_orders WHERE id=? AND status='resolved'
        AND NOT EXISTS(SELECT 1 FROM shop_order_events WHERE order_id=? AND status='resolved')`)
        .bind(id(),admin.id,oid,oid)
    ]);
    if(!results[0].meta?.changes||!results[1].meta?.changes)
      fail(409,'Đơn hàng không thể ghi thưởng, vui lòng kiểm tra dữ liệu và tải lại.');
    return json({ok:true,reward_lua:reward,message:'Đã giải quyết và ghi Lúa vào ví của khách một lần.'});
  }
  return null;
}
