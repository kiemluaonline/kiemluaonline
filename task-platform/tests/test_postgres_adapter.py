"""Unit tests for the PostgreSQL compatibility adapter (no live DB credentials)."""
import os
import sys
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
import storage

class FakeCursor:
 rowcount=1
 def __init__(self,stmt):self.statement=stmt
 def fetchone(self):return {"id":42}
 def fetchall(self):return []

class FakeConnection:
 def __init__(self):
  self.statements=[]
  self.info=type("Info",(),{"transaction_status":storage.TransactionStatus.IDLE})()
 def execute(self,statement,params=()):
  self.statements.append((statement,params))
  return FakeCursor(statement)
 def close(self):pass

def test_adapter_converts_queries_and_is_ssl_required(monkeypatch):
 conn=FakeConnection()
 def connect(url,**kwargs):
  assert url=="postgresql://db.invalid/example"
  assert kwargs["sslmode"]=="require"
  assert kwargs["autocommit"] is True
  return conn
 monkeypatch.setattr(storage.psycopg,"connect",connect)
 db=storage.PgConnection("postgresql://db.invalid/example")
 db.execute("BEGIN IMMEDIATE")
 assert conn.statements[-1][0]=="BEGIN"
 db.execute("SELECT * FROM users WHERE username LIKE ? COLLATE NOCASE",("Test",))
 assert "ILIKE %s" in conn.statements[-1][0]
 assert conn.statements[-1][1]==("Test",)
 inserted=db.execute("INSERT INTO withdrawals(user_id,amount,bank,holder,account) VALUES(?,?,?,?,?)",(2,50,"B","Name","12345"))
 assert inserted.lastrowid==42
 assert "RETURNING id" in conn.statements[-1][0]

def test_schema_enables_rls_and_keeps_money_as_integer():
 schema=storage.POSTGRES_SCHEMA
 for table in ("users","tasks","submissions","ledger","withdrawals","admin_adjustments","admin_audit","login_attempts"):
  assert "ALTER TABLE "+table+" ENABLE ROW LEVEL SECURITY" in schema
 assert "reward BIGINT" in schema
 assert "amount BIGINT" in schema
 assert "users_username_case_insensitive" in schema
