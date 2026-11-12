"""Fraud signals are advisory. Only an administrator can resolve them.

No IP/device tracking. Evidence and payout-account matches use keyed digests;
the raw values are not stored in the anti-fraud tables.
"""
import hashlib
import hmac
import re

def ensure_schema(c, postgres=False):
 auto_id = "BIGSERIAL PRIMARY KEY" if postgres else "INTEGER PRIMARY KEY"
 statements=[
  f"""CREATE TABLE IF NOT EXISTS fraud_alerts (
    id {auto_id}, user_id BIGINT NOT NULL, kind TEXT NOT NULL,
    target_type TEXT NOT NULL, target_id BIGINT NOT NULL,
    severity INTEGER NOT NULL CHECK(severity BETWEEN 0 AND 100),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','cleared','confirmed')),
    details TEXT NOT NULL, reviewed_by BIGINT, review_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    UNIQUE(kind,target_type,target_id))""",
  """CREATE TABLE IF NOT EXISTS fraud_fingerprints (
    kind TEXT NOT NULL, target_id BIGINT NOT NULL, user_id BIGINT NOT NULL,
    digest TEXT NOT NULL, PRIMARY KEY(kind,target_id))""",
  "CREATE INDEX IF NOT EXISTS fraud_fingerprint_lookup ON fraud_fingerprints(kind,digest,user_id)",
  "CREATE INDEX IF NOT EXISTS fraud_alerts_lookup ON fraud_alerts(user_id,status,severity)"
 ]
 for statement in statements:c.execute(statement)
 if postgres:
  for table in ("fraud_alerts","fraud_fingerprints"):
   c.execute("ALTER TABLE "+table+" ENABLE ROW LEVEL SECURITY")
   c.execute("REVOKE ALL ON TABLE "+table+" FROM anon,authenticated")

def digest_value(secret, kind, raw):
 return hmac.new(secret.encode("utf-8"),(kind+":"+raw).encode("utf-8"),hashlib.sha256).hexdigest()

def evidence_digest(secret, evidence):
 normalized=" ".join(evidence.casefold().split())
 return digest_value(secret,"evidence",normalized)

def payout_digest(secret, bank, account):
 normalized_bank=" ".join(bank.casefold().split())
 normalized_account=re.sub(r"\s+","",account).upper()
 return digest_value(secret,"payout",normalized_bank+":"+normalized_account)

def record_signal(c,user_id,kind,target_id,digest,alert_kind,details,severity):
 # Called WITHIN the transaction that creates the submission or withdrawal.
 existing=c.execute("""SELECT user_id FROM fraud_fingerprints
 WHERE kind=? AND digest=? AND user_id<>? LIMIT 1""",(kind,digest,user_id)).fetchone()
 c.execute("INSERT INTO fraud_fingerprints(kind,target_id,user_id,digest) VALUES(?,?,?,?)",
           (kind,target_id,user_id,digest))
 if existing:
  c.execute("""INSERT INTO fraud_alerts(user_id,kind,target_type,target_id,severity,details)
               VALUES(?,?,?,?,?,?)""",(user_id,alert_kind,kind,target_id,severity,details))
 return existing is not None

def has_open_high_alert(c,user_id,withdrawal_id):
 # A user-level high alert must also be checked, not only the withdrawal.
 row=c.execute("""SELECT id FROM fraud_alerts
 WHERE user_id=? AND status='open' AND severity>=60
 AND ((target_type='withdrawal' AND target_id=?) OR target_type='submission')
 LIMIT 1""",(user_id,withdrawal_id)).fetchone()
 return bool(row)
