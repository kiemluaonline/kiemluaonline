"""PostgreSQL adapter for Supabase, retaining SQLite for local tests.

Set DATABASE_URL to use PostgreSQL. All money-related writes still use explicit
BEGIN/COMMIT/ROLLBACK transactions. Only the server reads DATABASE_URL.
"""
import re
import psycopg
from psycopg.rows import dict_row
from psycopg.pq import TransactionStatus

POSTGRES_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user'))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_case_insensitive ON users (lower(username));
CREATE TABLE IF NOT EXISTS tasks (
 id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
 reward BIGINT NOT NULL CHECK(reward>0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS submissions (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id),
 task_id BIGINT NOT NULL REFERENCES tasks(id), evidence TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 UNIQUE(user_id,task_id)
);
CREATE TABLE IF NOT EXISTS ledger (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id),
 amount BIGINT NOT NULL, kind TEXT NOT NULL, reference_id BIGINT NOT NULL,
 UNIQUE(kind,reference_id)
);
CREATE TABLE IF NOT EXISTS withdrawals (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id),
 amount BIGINT NOT NULL CHECK(amount>0), bank TEXT NOT NULL,
 holder TEXT NOT NULL, account TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','rejected'))
);
CREATE TABLE IF NOT EXISTS admin_adjustments (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id),
 admin_id BIGINT NOT NULL REFERENCES users(id), amount BIGINT NOT NULL CHECK(amount<>0),
 reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS admin_audit (
 id BIGSERIAL PRIMARY KEY, admin_id BIGINT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, target_type TEXT NOT NULL,
 target_id BIGINT NOT NULL, details TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS login_attempts (
 key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_status_id ON submissions(status,id DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_id ON withdrawals(status,id DESC);
CREATE INDEX IF NOT EXISTS ledger_user_id ON ledger(user_id,id DESC);
CREATE INDEX IF NOT EXISTS audit_action_id ON admin_audit(action,id DESC);
"""

class QueryResult:
 def __init__(self, cursor, inserted_id=None):
  self._cursor=cursor
  self.lastrowid=inserted_id
  self.rowcount=cursor.rowcount
 def fetchone(self):
  return self._cursor.fetchone()
 def fetchall(self):
  return self._cursor.fetchall()

class PgConnection:
 def __init__(self, url):
  # SSL is mandatory for remote Supabase PostgreSQL connections.
  self._connection=psycopg.connect(url,autocommit=True,row_factory=dict_row,
                                    sslmode="require",connect_timeout=10)
 @property
 def in_transaction(self):
  return self._connection.info.transaction_status==TransactionStatus.INTRANS
 def execute(self,sql,params=()):
  statement=sql.strip()
  if statement.upper()=="BEGIN IMMEDIATE":
   statement="BEGIN"
  else:
   statement=statement.replace("LIKE ? COLLATE NOCASE","ILIKE ?")
   statement=statement.replace("COLLATE NOCASE","")
   # SQLite's integer primary key automatically generates IDs; use identity
   # columns on Postgres for tables created by the legacy ensure_* helpers.
   statement=re.sub(r"\bid INTEGER PRIMARY KEY\b","id BIGSERIAL PRIMARY KEY",statement,flags=re.I)
   statement=statement.replace("?","%s")
  wants_id=bool(re.match(r"INSERT\s+INTO\s+(tasks|withdrawals|admin_adjustments)\b",statement,re.I))
  if wants_id and "RETURNING" not in statement.upper():
   statement+=" RETURNING id"
  cur=self._connection.execute(statement,params)
  inserted=cur.fetchone()["id"] if wants_id else None
  return QueryResult(cur,inserted)
 def executescript(self,sqlite_script):
  # Schema intentionally differs: PostgreSQL uses BIGSERIAL and casefold index.
  for statement in POSTGRES_SCHEMA.split(";"):
   if statement.strip():self.execute(statement)
 def close(self):
  self._connection.close()
