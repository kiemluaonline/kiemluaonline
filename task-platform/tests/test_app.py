import importlib
import os
import sys

import pytest
from werkzeug.security import generate_password_hash

@pytest.fixture
def site(tmp_path,monkeypatch):
 monkeypatch.setenv("DATABASE_PATH",str(tmp_path/"test.sqlite3"))
 monkeypatch.setenv("SECRET_KEY","local-tests-not-a-production-secret-12345")
 monkeypatch.setenv("APP_ENV","test")
 sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
 if "app" in sys.modules:del sys.modules["app"]
 mod=importlib.import_module("app")
 mod.app.config["TESTING"]=True
 with mod.app.app_context():
  mod.db().executescript(mod.SCHEMA)
  mod.ensure_audit_table()
  mod.ensure_adjustments_table()
  mod.ensure_login_attempts()
  mod.db().execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')",("boss",generate_password_hash("admin-password-123")))
  mod.db().execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,'user')",("member",generate_password_hash("member-password-123")))
 yield mod,mod.app.test_client()
 sys.path.remove(os.path.dirname(os.path.dirname(__file__)))

def login(client,name,password):
 client.get("/login")
 with client.session_transaction() as sess:csrf=sess["csrf"]
 return client.post("/login",data={"username":name,"password":password,"csrf":csrf})

def post(client,url,data=None):
 with client.session_transaction() as sess:csrf=sess["csrf"]
 return client.post(url,data={"csrf":csrf,**(data or {})})

def test_csrf_and_authorization(site):
 mod,c=site
 assert c.post("/register",data={"username":"bad","password":"a"*10}).status_code==400
 assert login(c,"member","member-password-123").status_code==302
 assert c.get("/admin").status_code==403
 assert post(c,"/admin/task",{"title":"Not authorized","description":"This should not work","reward":"5000"}).status_code==403

def test_task_approval_is_idempotent_and_audited(site):
 mod,c=site
 assert login(c,"boss","admin-password-123").status_code==302
 assert post(c,"/admin/task",{"title":"Test nhiệm vụ","description":"Hãy gửi bằng chứng hoàn thành","reward":"5000"}).status_code==302
 with mod.app.app_context():
  task=mod.db().execute("SELECT id FROM tasks").fetchone()["id"]
 assert post(c,"/logout").status_code==302
 assert login(c,"member","member-password-123").status_code==302
 assert post(c,f"/task/{task}/submit",{"evidence":"Bằng chứng hoàn thành công việc"}).status_code==302
 assert post(c,"/logout").status_code==302
 assert login(c,"boss","admin-password-123").status_code==302
 with mod.app.app_context():sid=mod.db().execute("SELECT id FROM submissions").fetchone()["id"]
 assert post(c,f"/admin/review/{sid}/approved").status_code==302
 assert post(c,f"/admin/review/{sid}/approved").status_code==302
 with mod.app.app_context():
  assert mod.balance(2)==5000
  assert mod.db().execute("SELECT COUNT(*) n FROM ledger WHERE kind='reward'").fetchone()["n"]==1
  assert mod.db().execute("SELECT COUNT(*) n FROM admin_audit WHERE action='submission_approved'").fetchone()["n"]==1

def test_withdraw_hold_rejection_and_adjustment(site):
 mod,c=site
 with mod.app.app_context():
  mod.db().execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(2,10000,'seed',1)")
 assert login(c,"member","member-password-123").status_code==302
 assert post(c,"/withdraw",{"amount":"7000","bank":"VCB","holder":"Nguyen Van A","account":"12345678"}).status_code==302
 with mod.app.app_context():
  assert mod.balance(2)==3000
  wid=mod.db().execute("SELECT id FROM withdrawals").fetchone()["id"]
 assert post(c,"/withdraw",{"amount":"4000","bank":"VCB","holder":"Nguyen Van A","account":"12345678"}).status_code==302
 with mod.app.app_context():assert mod.db().execute("SELECT COUNT(*) n FROM withdrawals").fetchone()["n"]==1
 assert post(c,"/logout").status_code==302
 assert login(c,"boss","admin-password-123").status_code==302
 assert post(c,"/admin/members/2/adjust",{"amount":"-4000","reason":"Điều chỉnh trừ vượt số dư"}).status_code==302
 with mod.app.app_context():assert mod.balance(2)==3000
 assert post(c,f"/admin/payout/{wid}/rejected").status_code==302
 assert post(c,f"/admin/payout/{wid}/rejected").status_code==302
 with mod.app.app_context():assert mod.balance(2)==10000
 assert post(c,"/admin/members/2/adjust",{"amount":"-2000","reason":"Hoàn lại tiền điều chỉnh sai"}).status_code==302
 with mod.app.app_context():
  assert mod.balance(2)==8000
  assert mod.db().execute("SELECT COUNT(*) n FROM admin_audit WHERE action='balance_adjust'").fetchone()["n"]==1
  assert mod.db().execute("SELECT COUNT(*) n FROM ledger WHERE kind='refund'").fetchone()["n"]==1

def test_admin_pages_and_headers(site):
 mod,c=site
 assert login(c,"boss","admin-password-123").status_code==302
 for url in ["/admin","/admin?sub_status=all&payout_status=all&tasks_page=99","/admin/members?q=mem&role=user&page=3","/admin/audit?action=task_create"]:
  response=c.get(url)
  assert response.status_code==200,(url,response.status_code,response.data[:400])
 assert c.get("/admin").headers["X-Frame-Options"]=="DENY"
 assert c.get("/admin").headers["Cache-Control"]=="no-store"

def test_login_throttle(site):
 mod,c=site
 for _ in range(5):
  assert login(c,"member","wrong-password").status_code==200
 assert login(c,"member","wrong-password").status_code==429


def test_duplicate_evidence_alert_requires_manual_review(site):
 mod,c=site
 with mod.app.app_context():
  conn=mod.db()
  conn.execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,'user')",("membertwo",generate_password_hash("membertwo-password-123")))
  conn.execute("INSERT INTO tasks(title,description,reward) VALUES(?,?,?)",("Duplicate check","Nhiệm vụ kiểm tra bằng chứng trùng",5000))
  task=conn.execute("SELECT id FROM tasks").fetchone()["id"]
 assert login(c,"member","member-password-123").status_code==302
 evidence="Cùng một bằng chứng để kiểm tra trùng lặp"
 assert post(c,f"/task/{task}/submit",{"evidence":evidence}).status_code==302
 assert post(c,"/logout").status_code==302
 assert login(c,"membertwo","membertwo-password-123").status_code==302
 assert post(c,f"/task/{task}/submit",{"evidence":evidence}).status_code==302
 with mod.app.app_context():
  alerts=mod.db().execute("SELECT * FROM fraud_alerts WHERE kind='duplicate_evidence'").fetchall()
  assert len(alerts)==1
  assert alerts[0]["user_id"]==3
  assert alerts[0]["severity"]>=60
 assert c.get("/admin/fraud").status_code==403
 assert post(c,"/logout").status_code==302
 assert login(c,"boss","admin-password-123").status_code==302
 assert c.get("/admin/fraud").status_code==200
 alert_id=alerts[0]["id"]
 assert post(c,f"/admin/fraud/{alert_id}/review",{"decision":"cleared","reason":"Hai người độc lập đã được đối chiếu."}).status_code==302
 assert post(c,f"/admin/fraud/{alert_id}/review",{"decision":"confirmed","reason":"Không được ghi lại quyết định."}).status_code==302
 with mod.app.app_context():
  assert mod.db().execute("SELECT status FROM fraud_alerts WHERE id=?",(alert_id,)).fetchone()["status"]=="cleared"
  assert mod.db().execute("SELECT COUNT(*) n FROM admin_audit WHERE action='fraud_cleared'").fetchone()["n"]==1


def test_high_risk_withdrawal_cannot_be_paid_before_clearance(site):
 mod,c=site
 with mod.app.app_context():
  conn=mod.db()
  conn.execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,'user')",("membertwo",generate_password_hash("membertwo-password-123")))
  conn.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(2,10000,'seed',11)")
  conn.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(3,10000,'seed',12)")
 def withdraw_same_account():
  return post(c,"/withdraw",{"amount":"5000","bank":"VCB","holder":"Nguoi Nhan","account":"123456789"})
 assert login(c,"member","member-password-123").status_code==302
 assert withdraw_same_account().status_code==302
 assert post(c,"/logout").status_code==302
 assert login(c,"membertwo","membertwo-password-123").status_code==302
 assert withdraw_same_account().status_code==302
 with mod.app.app_context():
  conn=mod.db()
  alert=conn.execute("SELECT * FROM fraud_alerts WHERE kind='shared_payout_account'").fetchone()
  second_withdraw=conn.execute("SELECT id FROM withdrawals WHERE user_id=3").fetchone()["id"]
  assert alert and alert["user_id"]==3
 assert post(c,"/logout").status_code==302
 assert login(c,"boss","admin-password-123").status_code==302
 assert post(c,f"/admin/payout/{second_withdraw}/paid").status_code==302
 with mod.app.app_context():
  assert mod.db().execute("SELECT status FROM withdrawals WHERE id=?",(second_withdraw,)).fetchone()["status"]=="pending"
 assert post(c,f"/admin/fraud/{alert['id']}/review",{"decision":"confirmed","reason":"Thông tin giống nhau, vẫn cần đối chiếu."}).status_code==302
 assert post(c,f"/admin/payout/{second_withdraw}/paid").status_code==302
 with mod.app.app_context():
  assert mod.db().execute("SELECT status FROM withdrawals WHERE id=?",(second_withdraw,)).fetchone()["status"]=="pending"
 # Reconsideration is possible; a confirmed case is not an irreversible ban.
 assert post(c,f"/admin/fraud/{alert['id']}/review",{"decision":"cleared","reason":"Đã có bằng chứng giải thích việc dùng chung tài khoản."}).status_code==302
 with mod.app.app_context():
  assert mod.db().execute("SELECT status FROM fraud_alerts WHERE id=?",(alert["id"],)).fetchone()["status"]=="cleared"
 # After clearance, the final recorded payout action is permitted.
 # This only marks an external bank transfer; no bank API is called here.
 assert post(c,f"/admin/payout/{second_withdraw}/paid").status_code==302
 with mod.app.app_context():
  assert mod.db().execute("SELECT status FROM withdrawals WHERE id=?",(second_withdraw,)).fetchone()["status"]=="paid"
  assert mod.balance(3)==5000
