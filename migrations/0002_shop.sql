-- Thêm khu vực mua sắm Affiliate. Không sửa bảng nhiệm vụ, ví Lúa hoặc yêu cầu rút tiền.
CREATE TABLE IF NOT EXISTS shop_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('beauty','fashion','home','technology','other')),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shop_products_active ON shop_products(is_active,created_at);
CREATE TABLE IF NOT EXISTS shop_requests (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL CHECK(channel IN ('zalo','telegram')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','rejected')),
  product_id TEXT REFERENCES shop_products(id),
  seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shop_requests_user ON shop_requests(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_shop_requests_status ON shop_requests(status,created_at);
