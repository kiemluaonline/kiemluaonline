CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 referral_code TEXT NOT NULL UNIQUE, referred_by TEXT REFERENCES users(id),
 joined_ip TEXT NOT NULL DEFAULT '', terms_accepted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_referred ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_joined_ip ON users(joined_ip, created_at);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT 'link' CHECK(category IN ('link','video','other')),
 url TEXT NOT NULL DEFAULT '', reward INTEGER NOT NULL CHECK(reward > 0 AND reward <= 10000000),
 min_seconds INTEGER NOT NULL DEFAULT 10 CHECK(min_seconds BETWEEN 5 AND 3600),
 review_mode TEXT NOT NULL DEFAULT 'manual' CHECK(review_mode IN ('manual','auto')),
 repeat_policy TEXT NOT NULL DEFAULT 'once' CHECK(repeat_policy IN ('once','daily')),
 is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(is_active,created_at);
CREATE TABLE IF NOT EXISTS task_attempts (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), task_id TEXT NOT NULL REFERENCES tasks(id),
 captcha_a INTEGER NOT NULL, captcha_b INTEGER NOT NULL,
 available_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_by TEXT,
 ip TEXT NOT NULL DEFAULT '', device_code TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_attempts_recent ON task_attempts(user_id,created_at);
CREATE TABLE IF NOT EXISTS task_completions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), task_id TEXT NOT NULL REFERENCES tasks(id),
 period_key TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
 reward INTEGER NOT NULL CHECK(reward > 0), evidence TEXT NOT NULL DEFAULT '',
 ip TEXT NOT NULL DEFAULT '', device_code TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT,
 UNIQUE(user_id,task_id,period_key)
);
CREATE INDEX IF NOT EXISTS idx_completions_status ON task_completions(status,created_at);
CREATE INDEX IF NOT EXISTS idx_completions_user ON task_completions(user_id,created_at);
CREATE TABLE IF NOT EXISTS wallet_entries (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL CHECK(amount != 0), reason TEXT NOT NULL,
 reference_type TEXT NOT NULL, reference_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,reference_type,reference_id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON wallet_entries(user_id,created_at);
CREATE TABLE IF NOT EXISTS checkins (
 user_id TEXT NOT NULL REFERENCES users(id), day TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,day)
);
CREATE TABLE IF NOT EXISTS withdrawals (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL CHECK(amount > 0), vnd_amount INTEGER NOT NULL CHECK(vnd_amount > 0),
 rate_lua_per_vnd INTEGER NOT NULL CHECK(rate_lua_per_vnd > 0),
 bank_name TEXT NOT NULL, bank_account TEXT NOT NULL, bank_owner TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','rejected')),
 admin_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status,created_at);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id,created_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO settings(key,value) VALUES
 ('site_name','Trạm Có Lúa'),('signup_enabled','1'),('checkin_reward','0'),
 ('referral_reward','0'),('min_withdraw_lua','1000'),('lua_per_vnd','0'),
 ('withdrawals_enabled','0'),('announcement','');
CREATE TABLE IF NOT EXISTS risk_events (
 id TEXT PRIMARY KEY, user_id TEXT, event_type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
 ip TEXT NOT NULL DEFAULT '', device_code TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_risk_events_created ON risk_events(created_at);
CREATE TABLE IF NOT EXISTS login_attempts (
 id TEXT PRIMARY KEY, ip TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', success INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip,created_at);
