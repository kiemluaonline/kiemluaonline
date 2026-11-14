-- Lưu tài khoản nhận tiền của từng thành viên. Không sửa yêu cầu rút đã gửi.
CREATE TABLE IF NOT EXISTS payout_accounts (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 payment_method TEXT NOT NULL CHECK(payment_method IN ('bank','zalopay')),
 bank_name TEXT NOT NULL,
 account_number TEXT NOT NULL,
 account_owner TEXT NOT NULL,
 nickname TEXT NOT NULL DEFAULT '',
 is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payout_accounts_user ON payout_accounts(user_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_accounts_unique
 ON payout_accounts(user_id,payment_method,bank_name,account_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_accounts_default
 ON payout_accounts(user_id,payment_method) WHERE is_default=1;
