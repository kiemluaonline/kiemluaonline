-- 0005: Đổi Lúa lấy thẻ cào điện thoại. Độc lập với withdrawals.
-- Bắt buộc bật thủ công trong Admin. Không lưu mã thẻ rõ ràng trong D1.
CREATE TABLE IF NOT EXISTS card_redemptions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 carrier TEXT NOT NULL CHECK(carrier IN ('Viettel','VinaPhone','MobiFone')),
 denomination_vnd INTEGER NOT NULL CHECK(denomination_vnd IN (10000,20000,50000,100000,200000)),
 amount_lua INTEGER NOT NULL CHECK(amount_lua>0 AND amount_lua<=1000000000),
 rate_snapshot INTEGER NOT NULL CHECK(rate_snapshot>0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','delivered','rejected')),
 card_payload_encrypted TEXT NOT NULL DEFAULT '',
 card_serial_fingerprint TEXT UNIQUE,
 admin_note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 delivered_at TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_card_redemptions_user ON card_redemptions(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_card_redemptions_status ON card_redemptions(status,created_at);
INSERT OR IGNORE INTO settings(key,value) VALUES('card_redemption_enabled','0');
