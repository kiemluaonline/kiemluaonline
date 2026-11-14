-- Theo dõi đơn hàng TikTok Shop riêng biệt; không sửa nhiệm vụ, giới hạn Link/App,
-- lịch sử rút tiền hay bảng ví hiện tại.
CREATE TABLE IF NOT EXISTS shop_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES shop_products(id),
  order_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','provisional','resolved','rejected')),
  customer_note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  commission_vnd INTEGER NOT NULL DEFAULT 0 CHECK(commission_vnd>=0),
  reward_lua INTEGER NOT NULL DEFAULT 0 CHECK(reward_lua>=0),
  rate_snapshot INTEGER NOT NULL DEFAULT 0 CHECK(rate_snapshot>=0),
  settled_reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders(status,created_at);
CREATE TABLE IF NOT EXISTS shop_order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES shop_orders(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('pending','provisional','resolved','rejected')),
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shop_order_events_order ON shop_order_events(order_id,created_at);
