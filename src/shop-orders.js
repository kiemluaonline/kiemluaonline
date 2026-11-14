// Mẫu kết quả kiểm tra và lý do từ chối do Admin chọn, không nhận nội dung tùy ý.
export const ORDER_CHECK_NOTE = 'Đã kiểm tra ID đơn hàng, thông tin sản phẩm trùng khớp. Đơn đang chờ hoàn tất.';
export const ORDER_REJECTION_REASONS = Object.freeze({
  '0':'Không tìm thấy thông tin đơn hàng tương ứng với ID đã cung cấp.',
  '1':'Đơn hàng đã bị hủy nên không đủ điều kiện nhận Lúa.',
  '2':'Đơn hàng đã bị hủy nên không đủ điều kiện nhận Lúa.',
  '3':'Sau khi kiểm tra, đơn hàng chưa đáp ứng điều kiện nhận thưởng của chương trình.'
});

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
    // Cho thành viên chỉ dữ liệu hiển thị cần thiết; không đưa ghi chú của Admin,
    // hoa hồng, tỷ lệ quy đổi, mã đối soát hay thông tin nội bộ xuống trình duyệt.
    const orders=await db.prepare(`SELECT o.id,o.order_reference,o.status,o.customer_note,
      o.reward_lua,o.estimated_reward_lua,o.created_at,o.updated_at,o.resolved_at,
      p.title AS product_title,CASE WHEN p.is_active=1 THEN p.link ELSE NULL END AS product_link
      FROM shop_orders o JOIN shop_products p ON p.id=o.product_id
      WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 150`).bind(me.id).all();
    // Nhật ký có ghi chú đối chiếu riêng; chỉ gửi trạng thái + thời điểm cho khách.
    const events=await db.prepare(`SELECT e.order_id,e.status,e.created_at FROM shop_order_events e
      JOIN shop_orders o ON o.id=e.order_id
      WHERE o.user_id=? ORDER BY e.created_at DESC LIMIT 500`).bind(me.id).all();
    return json({orders:orders.results.map(o=>({...o,
      reward_lua:o.status==='resolved'?o.reward_lua:0,
      estimated_reward_lua:o.status==='provisional'?o.estimated_reward_lua:0})),
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
      o.customer_note,o.admin_note,o.verification_note,o.estimated_reward_lua,o.commission_vnd,o.reward_lua,o.rate_snapshot,
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
    if(!['provisional','estimate','resolved','rejected'].includes(status))fail(400,'Trạng thái đơn hàng không hợp lệ.');
    const order=await db.prepare("SELECT id,user_id,status,order_reference FROM shop_orders WHERE id=?").bind(oid).first();
    if(!order)fail(404,'Không tìm thấy đơn hàng.');
    if(order.status==='resolved'||order.status==='rejected')
      fail(409,'Đơn hàng này đã xử lý xong, không thể cộng Lúa hoặc xử lý lại.');
    if(status==='estimate'){
      if(order.status!=='provisional')fail(409,'Chỉ được cập nhật Lúa dự kiến khi đơn đang Tạm duyệt – Chờ giải quyết.');
      if(!goodInteger(b.estimated_reward_lua,1,10000000))
        fail(400,'Lúa dự kiến phải là số nguyên từ 1 đến 10 triệu.');
      const estimatedReward=Number(b.estimated_reward_lua);
      const results=await db.batch([
        db.prepare(`UPDATE shop_orders SET estimated_reward_lua=?,
          updated_at=CURRENT_TIMESTAMP,seen_at=NULL
          WHERE id=? AND status='provisional'`).bind(estimatedReward,oid),
        db.prepare(`INSERT INTO shop_order_events(id,order_id,actor_id,status,detail)
          SELECT ?,id,?,'provisional','Lúa dự kiến đã cập nhật: ' || estimated_reward_lua || ' Lúa; chưa cộng ví'
          FROM shop_orders WHERE id=? AND status='provisional'`).bind(id(),admin.id,oid)
      ]);
      if(!results[0].meta?.changes)fail(409,'Đơn hàng đã được xử lý hoặc thay đổi trạng thái.');
      return json({ok:true,estimated_reward_lua:estimatedReward,
        message:'Đã cập nhật Lúa dự kiến. Khách sẽ thấy số mới khi xem đơn; ví Lúa chưa thay đổi.'});
    }
    if(status==='provisional'){
      if(order.status!=='pending')fail(409,'Chỉ đơn Chờ xác minh mới được tạm duyệt.');
      // Chỉ dùng mẫu chuẩn đã được lưu trên máy chủ, kể cả khi trình duyệt bị sửa.
      const privateNote=ORDER_CHECK_NOTE;
      // Giá trị dự kiến do Admin tự xác nhận: KHÔNG cộng ví, không phải cam kết thưởng.
      if(!goodInteger(b.estimated_reward_lua,1,10000000))
        fail(400,'Hãy nhập Lúa dự kiến hợp lệ (số nguyên từ 1 đến 10 triệu Lúa).');
      const estimatedReward=Number(b.estimated_reward_lua);
      const results=await db.batch([
        db.prepare(`UPDATE shop_orders SET status='provisional',admin_note=?,verification_note=?,
          estimated_reward_lua=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,seen_at=NULL
          WHERE id=? AND status='pending'`).bind('Đã kiểm tra ID đơn hàng, thông tin sản phẩm trùng khớp. Đơn đang chờ hoàn tất.',privateNote,estimatedReward,oid),
        db.prepare(`INSERT INTO shop_order_events(id,order_id,actor_id,status,detail)
          SELECT ?,id,?,'provisional','Đơn hàng đã được tạm duyệt, đang chờ hoàn tất'
          FROM shop_orders WHERE id=? AND status='provisional'
          AND NOT EXISTS(SELECT 1 FROM shop_order_events WHERE order_id=? AND status='provisional')`)
          .bind(id(),admin.id,oid,oid)
      ]);
      if(!results[0].meta?.changes)fail(409,'Đơn hàng đã được người khác xử lý. Hãy tải lại.');
      return json({ok:true,estimated_reward_lua:estimatedReward,
        message:'Tạm duyệt – Chờ giải quyết. Đã hiển thị Lúa dự kiến cho khách, chưa cộng ví.'});
    }
    if(status==='rejected'){
      const code=String(b.reason_code??'');
      if(!Object.hasOwn(ORDER_REJECTION_REASONS,code))
        fail(400,'Vui lòng chọn một lý do từ chối có sẵn.');
      const reason=ORDER_REJECTION_REASONS[code];
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
    if(b.delivery_paid_confirmed!==true)
      fail(400,'Chỉ giải quyết sau khi xác nhận đơn đã giao, đã thanh toán và hoa hồng Affiliate đã được quyết toán.');
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
