-- 0008: Extend catalog; apply through D1 migrations (transactional), after backup.
-- Preserve all existing rows, IDs, encrypted payloads, fees in wallet_entries and timestamps.
CREATE TABLE card_redemptions_catalog_v2 (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 carrier TEXT NOT NULL CHECK(carrier IN ('Viettel','VinaPhone','MobiFone','Vietnamobile','Garena')),
 denomination_vnd INTEGER NOT NULL CHECK(denomination_vnd IN (10000,20000,50000,100000,200000,500000)),
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

INSERT INTO card_redemptions_catalog_v2 (id,user_id,carrier,denomination_vnd,amount_lua,rate_snapshot,status,card_payload_encrypted,card_serial_fingerprint,admin_note,created_at,reviewed_at,delivered_at,updated_at)
 SELECT id,user_id,carrier,denomination_vnd,amount_lua,rate_snapshot,status,card_payload_encrypted,card_serial_fingerprint,admin_note,created_at,reviewed_at,delivered_at,updated_at FROM card_redemptions;
DROP TABLE card_redemptions;
ALTER TABLE card_redemptions_catalog_v2 RENAME TO card_redemptions;
CREATE INDEX idx_card_redemptions_user ON card_redemptions(user_id,created_at);
CREATE INDEX idx_card_redemptions_status ON card_redemptions(status,created_at);
