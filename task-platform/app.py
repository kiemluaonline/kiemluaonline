import os, secrets, sqlite3, hmac, time, hashlib
from datetime import timedelta
from pathlib import Path
from functools import wraps
from flask import Flask, g, session, request, redirect, url_for, render_template, flash, abort
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg
from storage import PgConnection
from fraud import ensure_schema as ensure_fraud_schema, evidence_digest, payout_digest, record_signal, has_open_high_alert

app=Flask(__name__)
production=os.getenv("APP_ENV")=="production"
secret=os.getenv("SECRET_KEY")
if production and (not secret or len(secret)<32 or os.getenv("COOKIE_SECURE")!="1"):
 raise RuntimeError("Production requires SECRET_KEY >= 32 chars and COOKIE_SECURE=1 over HTTPS")
app.config.update(SECRET_KEY=secret or secrets.token_hex(32),SESSION_COOKIE_HTTPONLY=True,
 SESSION_COOKIE_SAMESITE="Lax",SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE")=="1",
 PERMANENT_SESSION_LIFETIME=timedelta(hours=12),MAX_CONTENT_LENGTH=32*1024)
@app.after_request
def security_headers(response):
 response.headers["X-Content-Type-Options"]="nosniff"
 response.headers["X-Frame-Options"]="DENY"
 response.headers["Referrer-Policy"]="strict-origin-when-cross-origin"
 response.headers["Content-Security-Policy"]="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'"
 response.headers["Cache-Control"]="no-store"
 if request.is_secure:response.headers["Strict-Transport-Security"]="max-age=31536000"
 return response
DATABASE_URL=os.getenv("DATABASE_URL","").strip()
if production and not DATABASE_URL:raise RuntimeError("Production requires Supabase DATABASE_URL")
DB=Path(os.getenv("DATABASE_PATH",str(Path(__file__).with_name("platform.db"))))
SCHEMA="""
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user');
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,reward INTEGER NOT NULL CHECK(reward>0),active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,task_id INTEGER NOT NULL,evidence TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',UNIQUE(user_id,task_id));
CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,reference_id INTEGER NOT NULL,UNIQUE(kind,reference_id));
CREATE TABLE IF NOT EXISTS withdrawals(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),bank TEXT NOT NULL,holder TEXT NOT NULL,account TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
"""
def db():
 if "db" not in g:
  if DATABASE_URL:
   g.db=PgConnection(DATABASE_URL)
  else:
   DB.parent.mkdir(parents=True,exist_ok=True)
   g.db=sqlite3.connect(DB,isolation_level=None,timeout=15)
   g.db.row_factory=sqlite3.Row
   g.db.execute("PRAGMA busy_timeout=15000")
 return g.db
@app.teardown_appcontext
def close(_):
 if "db" in g:g.db.close()
@app.cli.command("init-db")
def init_db():
 db().executescript(SCHEMA);ensure_audit_table();ensure_adjustments_table();ensure_login_attempts();ensure_fraud_schema(db(),bool(DATABASE_URL));print("Database initialized")
@app.cli.command("create-admin")
def create_admin():
 import getpass
 name=input("Admin username: ").strip();password=getpass.getpass("Admin password: ")
 if len(password)<12 or len(name)<3:raise ValueError("Admin password needs >=12 characters; name >=3")
 db().execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')",(name,generate_password_hash(password)))
 print("Admin created")
@app.cli.command("bootstrap-admin")
def bootstrap_admin():
 """Create the first Admin only, using temporary private environment variables."""
 import click
 name=os.getenv("BOOTSTRAP_ADMIN_USERNAME","").strip()
 password=os.getenv("BOOTSTRAP_ADMIN_PASSWORD","")
 if not name and not password:
  click.echo("No admin bootstrap requested")
  return
 if not (3<=len(name)<=40 and name.replace("_","").isalnum() and len(password)>=16):
  raise click.ClickException("Invalid bootstrap username or password (min 16 chars)")
 if db().execute("SELECT 1 FROM users WHERE role='admin' LIMIT 1").fetchone():
  click.echo("Admin already exists; bootstrap skipped")
  return
 try:
  db().execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')",(name,generate_password_hash(password)))
 except (sqlite3.IntegrityError,psycopg.IntegrityError):
  raise click.ClickException("Admin username already exists")
 click.echo("First admin created; REMOVE bootstrap credentials from hosting environment")

@app.before_request
def auth():
 g.user=db().execute("SELECT * FROM users WHERE id=?",(session["user_id"],)).fetchone() if session.get("user_id") else None
 if request.method=="POST" and (not session.get("csrf") or not hmac.compare_digest(session["csrf"],request.form.get("csrf",""))):abort(400)
@app.context_processor
def extras():
 return {"csrf":lambda:session.setdefault("csrf",secrets.token_hex(32)),"vnd":lambda n:f"{n:,}".replace(",",".")+"đ"}
def member(fn):
 @wraps(fn)
 def inner(*a,**kw):
  if not g.user:return redirect(url_for("login"))
  return fn(*a,**kw)
 return inner
def admin(fn):
 @wraps(fn)
 @member
 def inner(*a,**kw):
  if g.user["role"]!="admin":abort(403)
  return fn(*a,**kw)
 return inner
def balance(uid):return db().execute("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE user_id=?",(uid,)).fetchone()["n"]
def lock_balance_owner(c,uid):
 # PostgreSQL READ COMMITTED requires a per-user row lock before checking
 # balances. SQLite already serializes writers via BEGIN IMMEDIATE.
 if DATABASE_URL:
  if not c.execute("SELECT id FROM users WHERE id=? FOR UPDATE",(uid,)).fetchone():abort(404)
def amount(s):
 try:
  n=int(s)
  if 0<n<=100000000:return n
 except (ValueError,TypeError):pass
 abort(400)
@app.get("/health")
def health():
 try:
  db().execute("SELECT 1").fetchone()
 except sqlite3.Error:
  return {"status":"unavailable"},503
 return {"status":"ok"}

@app.get("/")
def home():return redirect(url_for("admin_home" if g.user["role"]=="admin" else "dashboard")) if g.user else render_template("landing.html")
@app.route("/register",methods=["GET","POST"])
def register():
 if request.method=="POST":
  name=request.form.get("username","").strip();password=request.form.get("password","")
  if not 3<=len(name)<=40 or not name.replace("_","").isalnum() or len(password)<10:flash("Tài khoản hoặc mật khẩu không hợp lệ.")
  else:
   try:db().execute("INSERT INTO users(username,password_hash) VALUES(?,?)",(name,generate_password_hash(password)));return redirect(url_for("login"))
   except (sqlite3.IntegrityError,psycopg.IntegrityError):flash("Tên tài khoản đã tồn tại.")
 return render_template("auth.html",register=True)
@app.route("/login",methods=["GET","POST"])
def login():
 if request.method=="POST":
  ensure_login_attempts()
  # Keyed by username and source IP; only a hash is stored.
  login_key=hashlib.sha256((request.form.get("username","").casefold()+"|"+(request.remote_addr or "")).encode()).hexdigest()
  now=int(time.time())
  c=db()
  row=c.execute("SELECT attempts,window_start FROM login_attempts WHERE key=?",(login_key,)).fetchone()
  if row and now-row["window_start"]<900 and row["attempts"]>=5:
   flash("Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.")
   return render_template("auth.html",register=False),429
  u=db().execute("SELECT * FROM users WHERE lower(username)=lower(?)",(request.form.get("username",""),)).fetchone()
  if u and check_password_hash(u["password_hash"],request.form.get("password","")):
   c.execute("DELETE FROM login_attempts WHERE key=?",(login_key,))
   session.clear();session.permanent=True;session["user_id"]=u["id"];session["csrf"]=secrets.token_hex(32);return redirect(url_for("home"))
  if row and now-row["window_start"]<900:
   c.execute("UPDATE login_attempts SET attempts=attempts+1 WHERE key=?",(login_key,))
  else:
   c.execute("INSERT INTO login_attempts(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=1,window_start=excluded.window_start",(login_key,now))
  flash("Thông tin đăng nhập không đúng.")
 return render_template("auth.html",register=False)
@app.post("/logout")
@member
def logout():session.clear();return redirect(url_for("home"))
@app.get("/dashboard")
@member
def dashboard():
 if g.user["role"]=="admin":return redirect(url_for("admin_home"))
 tasks=db().execute("SELECT t.*,s.status AS submitted FROM tasks t LEFT JOIN submissions s ON s.task_id=t.id AND s.user_id=? WHERE t.active=1 ORDER BY t.id DESC",(g.user["id"],)).fetchall()
 entries=db().execute("SELECT * FROM ledger WHERE user_id=? ORDER BY id DESC",(g.user["id"],)).fetchall()
 return render_template("dashboard.html",tasks=tasks,entries=entries,balance=balance(g.user["id"]))
@app.post("/task/<int:task_id>/submit")
@member
def submit(task_id):
 if g.user["role"]!="user":abort(403)
 evidence=request.form.get("evidence","").strip()
 if not 10<=len(evidence)<=2000:abort(400)
 c=db()
 ensure_fraud_schema(c,bool(DATABASE_URL))
 try:
  c.execute("BEGIN IMMEDIATE")
  if not c.execute("SELECT 1 FROM tasks WHERE id=? AND active=1",(task_id,)).fetchone():abort(404)
  sid=c.execute("INSERT INTO submissions(user_id,task_id,evidence) VALUES(?,?,?)",(g.user["id"],task_id,evidence)).lastrowid
  record_signal(c,g.user["id"],"submission",sid,evidence_digest(app.secret_key,evidence),
                "duplicate_evidence","Bằng chứng giống một tài khoản khác; cần đối chiếu thủ công.",80)
  c.execute("COMMIT")
  flash("Đã gửi bằng chứng.")
 except (sqlite3.IntegrityError,psycopg.IntegrityError):
  if c.in_transaction:c.execute("ROLLBACK")
  flash("Bạn đã gửi nhiệm vụ này.")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 return redirect(url_for("dashboard"))
@app.route("/withdraw",methods=["GET","POST"])
@member
def withdraw():
 if g.user["role"]!="user":abort(403)
 if request.method=="POST":
  n=amount(request.form.get("amount"));bank=request.form.get("bank","").strip();holder=request.form.get("holder","").strip();account=request.form.get("account","").strip()
  if not (2<=len(bank)<=80 and 2<=len(holder)<=100 and 5<=len(account)<=40 and account.isalnum()):abort(400)
  c=db()
  ensure_fraud_schema(c,bool(DATABASE_URL))
  try:
   c.execute("BEGIN IMMEDIATE")
   lock_balance_owner(c,g.user["id"])
   if balance(g.user["id"])<n:c.execute("ROLLBACK");flash("Số dư không đủ.");return redirect(url_for("withdraw"))
   w=c.execute("INSERT INTO withdrawals(user_id,amount,bank,holder,account) VALUES(?,?,?,?,?)",(g.user["id"],n,bank,holder,account)).lastrowid
   c.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(?,?,'hold',?)",(g.user["id"],-n,w))
   record_signal(c,g.user["id"],"withdrawal",w,payout_digest(app.secret_key,bank,account),
                 "shared_payout_account","Thông tin tài khoản nhận tiền trùng với một thành viên khác.",85)
   c.execute("COMMIT")
  except Exception:
   if c.in_transaction:c.execute("ROLLBACK")
   raise
  flash("Đã gửi yêu cầu rút.");return redirect(url_for("withdraw"))
 rows=db().execute("SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC",(g.user["id"],)).fetchall()
 return render_template("withdraw.html",balance=balance(g.user["id"]),rows=rows)
@app.get("/admin")
@admin
def admin_home():
 c=db()
 ensure_audit_table()
 task_status=request.args.get("task_status","all")
 if task_status not in ("all","active","hidden"):task_status="all"
 sub_status=request.args.get("sub_status","pending")
 if sub_status not in ("all","pending","approved","rejected"):sub_status="pending"
 payout_status=request.args.get("payout_status","pending")
 if payout_status not in ("all","pending","paid","rejected"):payout_status="pending"
 task_where={"all":"","active":" WHERE active=1","hidden":" WHERE active=0"}[task_status]
 sub_where="" if sub_status=="all" else " WHERE s.status=?"
 payout_where="" if payout_status=="all" else " WHERE w.status=?"
 tasks_data=paged("SELECT * FROM tasks"+task_where+" ORDER BY id DESC",name="tasks_page")
 subs_data=paged("""SELECT s.*,u.username,t.title,t.reward FROM submissions s
 JOIN users u ON u.id=s.user_id JOIN tasks t ON t.id=s.task_id"""+sub_where+" ORDER BY s.id DESC",(sub_status,) if sub_where else (),name="subs_page")
 payout_data=paged("""SELECT w.*,u.username FROM withdrawals w JOIN users u ON w.user_id=u.id"""+payout_where+" ORDER BY w.id DESC",(payout_status,) if payout_where else (),name="payouts_page")
 stats={
 "members":c.execute("SELECT COUNT(*) n FROM users WHERE role='user'").fetchone()["n"],
 "tasks":c.execute("SELECT COUNT(*) n FROM tasks").fetchone()["n"],
 "pending_subs":c.execute("SELECT COUNT(*) n FROM submissions WHERE status='pending'").fetchone()["n"],
 "pending_payouts":c.execute("SELECT COUNT(*) n FROM withdrawals WHERE status='pending'").fetchone()["n"],
 "available":c.execute("SELECT COALESCE(SUM(amount),0) n FROM ledger").fetchone()["n"],
 "reward_total":c.execute("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE kind='reward'").fetchone()["n"],
 "paid_total":c.execute("SELECT COALESCE(SUM(amount),0) n FROM withdrawals WHERE status='paid'").fetchone()["n"],
 "pending_amount":c.execute("SELECT COALESCE(SUM(amount),0) n FROM withdrawals WHERE status='pending'").fetchone()["n"]}
 return render_template("admin.html",stats=stats,tasks_data=tasks_data,subs_data=subs_data,payout_data=payout_data,task_status=task_status,sub_status=sub_status,payout_status=payout_status,
 tasks=tasks_data["rows"],submissions=subs_data["rows"],withdrawals=payout_data["rows"],member_count=stats["members"])

@app.post("/admin/task")
@admin
def create_task():
 title=request.form.get("title","").strip();description=request.form.get("description","").strip();reward=amount(request.form.get("reward"))
 if not 5<=len(title)<=120 or not 10<=len(description)<=3000:abort(400)
 c=db()
 ensure_audit_table()
 c.execute("BEGIN IMMEDIATE")
 try:
  tid=c.execute("INSERT INTO tasks(title,description,reward) VALUES(?,?,?)",(title,description,reward)).lastrowid
  audit(c,"task_create","task",tid,"Tạo nhiệm vụ; thưởng "+str(reward))
  c.execute("COMMIT")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 return redirect(url_for("admin_home"))
@app.post("/admin/task/<int:task_id>/toggle")
@admin
def toggle(task_id):
 c=db()
 ensure_audit_table()
 c.execute("BEGIN IMMEDIATE")
 try:
  changed=c.execute("UPDATE tasks SET active=1-active WHERE id=?",(task_id,)).rowcount
  if not changed:abort(404)
  audit(c,"task_toggle","task",task_id,"Thay đổi trạng thái hiển thị")
  c.execute("COMMIT")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 return redirect(url_for("admin_home"))
@app.post("/admin/review/<int:sid>/<decision>")
@admin
def review(sid,decision):
 if decision not in ("approved","rejected"):abort(404)
 c=db()
 ensure_audit_table()
 try:
  c.execute("BEGIN IMMEDIATE")
  s=c.execute("SELECT s.*,t.reward FROM submissions s JOIN tasks t ON s.task_id=t.id WHERE s.id=?",(sid,)).fetchone()
  if not s:abort(404)
  if s["status"]=="pending":
   c.execute("UPDATE submissions SET status=? WHERE id=?",(decision,sid))
   if decision=="approved":c.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(?,?,'reward',?)",(s["user_id"],s["reward"],sid))
   audit(c,"submission_"+decision,"submission",sid,"Thành viên "+str(s["user_id"])+"; thưởng "+str(s["reward"]))
  c.execute("COMMIT")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 return redirect(url_for("admin_home"))
@app.post("/admin/payout/<int:wid>/<decision>")
@admin
def payout(wid,decision):
 if decision not in ("paid","rejected"):abort(404)
 c=db()
 ensure_audit_table()
 ensure_fraud_schema(c,bool(DATABASE_URL))
 try:
  c.execute("BEGIN IMMEDIATE")
  w=c.execute("SELECT * FROM withdrawals WHERE id=?"+(" FOR UPDATE" if DATABASE_URL else ""),(wid,)).fetchone()
  if not w:abort(404)
  if w["status"]=="pending":
   if decision=="paid" and has_open_high_alert(c,w["user_id"],wid):
    c.execute("ROLLBACK")
    flash("Không thể xác nhận đã chuyển: tài khoản có cảnh báo rủi ro cao đang chờ Admin xem xét.")
    return redirect(url_for("admin_fraud")+"?user_id="+str(w["user_id"]))
   c.execute("UPDATE withdrawals SET status=? WHERE id=?",(decision,wid))
   if decision=="rejected":c.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(?,?,'refund',?)",(w["user_id"],w["amount"],wid))
   audit(c,"withdrawal_"+decision,"withdrawal",wid,"Thành viên "+str(w["user_id"])+"; số tiền "+str(w["amount"]))
  c.execute("COMMIT")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 return redirect(url_for("admin_home"))

# V3 administration: immutable manual adjustments and member detail.
def ensure_adjustments_table():
 db().execute("""CREATE TABLE IF NOT EXISTS admin_adjustments(
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, admin_id INTEGER NOT NULL,
 amount INTEGER NOT NULL CHECK(amount != 0), reason TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")

@app.get("/admin/members")
@admin
def admin_members():
 search=request.args.get("q","").strip()[:80]
 role=request.args.get("role","user")
 if role not in ("all","user","admin"):role="user"
 where=" WHERE u.username LIKE ?"
 args=["%"+search+"%"]
 if role!="all":where+=" AND u.role=?";args.append(role)
 query="""SELECT u.id,u.username,u.role,
 COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id=u.id),0) current_balance,
 (SELECT COUNT(*) FROM submissions WHERE user_id=u.id) submission_count
 FROM users u"""+where+" ORDER BY u.id DESC"
 data=paged(query,tuple(args))
 total=db().execute("SELECT COUNT(*) n FROM users WHERE role='user'").fetchone()["n"]
 return render_template("admin_members.html",users=data["rows"],data=data,search=search,role=role,total=total)

@app.get("/admin/members/<int:uid>")
@admin
def admin_member(uid):
 ensure_adjustments_table()
 user=db().execute("SELECT id,username,role FROM users WHERE id=?",(uid,)).fetchone()
 if not user:abort(404)
 entries=db().execute("""SELECT l.*,a.reason,a.created_at FROM ledger l
 LEFT JOIN admin_adjustments a ON l.kind='manual' AND a.id=l.reference_id
 WHERE l.user_id=? ORDER BY l.id DESC LIMIT 100""",(uid,)).fetchall()
 submissions=db().execute("""SELECT s.status,t.title,t.reward FROM submissions s JOIN tasks t
 ON t.id=s.task_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 50""",(uid,)).fetchall()
 withdrawals=db().execute("SELECT amount,status FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 50",(uid,)).fetchall()
 return render_template("admin_member.html",member=user,balance=balance(uid),entries=entries,submissions=submissions,withdrawals=withdrawals)

@app.post("/admin/members/<int:uid>/adjust")
@admin
def admin_adjust(uid):
 ensure_adjustments_table()
 ensure_audit_table()
 reason=request.form.get("reason","").strip()
 if not 10<=len(reason)<=300:abort(400)
 try: delta=int(request.form.get("amount",""))
 except (ValueError,TypeError):abort(400)
 if not delta or abs(delta)>100000000:abort(400)
 c=db()
 try:
  c.execute("BEGIN IMMEDIATE")
  user=c.execute("SELECT role FROM users WHERE id=?",(uid,)).fetchone()
  if not user:abort(404)
  if user["role"]!="user":abort(403)
  lock_balance_owner(c,uid)
  if delta<0 and balance(uid)<-delta:
   c.execute("ROLLBACK")
   flash("Không thể trừ vượt số dư khả dụng.")
   return redirect(url_for("admin_member",uid=uid))
  adjustment_id=c.execute("INSERT INTO admin_adjustments(user_id,admin_id,amount,reason) VALUES(?,?,?,?)",(uid,g.user["id"],delta,reason)).lastrowid
  c.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(?,?,'manual',?)",(uid,delta,adjustment_id))
  audit(c,"balance_adjust","user",uid,"Điều chỉnh "+str(delta)+"; lý do: "+reason)
  c.execute("COMMIT")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 flash("Đã ghi giao dịch điều chỉnh vào lịch sử.")
 return redirect(url_for("admin_member",uid=uid))

@app.get("/admin/tasks/<int:task_id>/edit")
@admin
def admin_edit_task(task_id):
 task=db().execute("SELECT * FROM tasks WHERE id=?",(task_id,)).fetchone()
 if not task:abort(404)
 count=db().execute("SELECT COUNT(*) n FROM submissions WHERE task_id=?",(task_id,)).fetchone()["n"]
 return render_template("admin_task_edit.html",task=task,submissions=count)

@app.post("/admin/tasks/<int:task_id>/edit")
@admin
def admin_save_task(task_id):
 title=request.form.get("title","").strip()
 description=request.form.get("description","").strip()
 reward=amount(request.form.get("reward"))
 if not 5<=len(title)<=120 or not 10<=len(description)<=3000:abort(400)
 c=db()
 ensure_audit_table()
 try:
  c.execute("BEGIN IMMEDIATE")
  task=c.execute("SELECT * FROM tasks WHERE id=?",(task_id,)).fetchone()
  if not task:abort(404)
  count=c.execute("SELECT COUNT(*) n FROM submissions WHERE task_id=?",(task_id,)).fetchone()["n"]
  if count and task["reward"]!=reward:
   c.execute("ROLLBACK")
   flash("Mức thưởng không thể thay đổi sau khi có người nộp nhiệm vụ.")
   return redirect(url_for("admin_edit_task",task_id=task_id))
  c.execute("UPDATE tasks SET title=?,description=?,reward=? WHERE id=?",(title,description,reward,task_id))
  audit(c,"task_edit","task",task_id,"Sửa nhiệm vụ; thưởng "+str(reward))
  c.execute("COMMIT")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 flash("Đã cập nhật nhiệm vụ.")
 return redirect(url_for("admin_home")+"#tasks")


def ensure_login_attempts():
 db().execute("""CREATE TABLE IF NOT EXISTS login_attempts(
 key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,window_start INTEGER NOT NULL)""")

# V4: paginated management and append-only administration log.
def ensure_audit_table():
 db().execute("""CREATE TABLE IF NOT EXISTS admin_audit(
 id INTEGER PRIMARY KEY, admin_id INTEGER NOT NULL, action TEXT NOT NULL,
 target_type TEXT NOT NULL, target_id INTEGER NOT NULL,
 details TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
def audit(c,action,target_type,target_id,details):
 c.execute("INSERT INTO admin_audit(admin_id,action,target_type,target_id,details) VALUES(?,?,?,?,?)",(g.user["id"],action,target_type,target_id,details[:500]))
def page_num(name="page"):
 try:return min(100000,max(1,int(request.args.get(name,"1"))))
 except (ValueError,TypeError):return 1
def paged(sql,params=(),name="page",size=15):
 p=page_num(name)
 count=db().execute("SELECT COUNT(*) n FROM ("+sql+")",params).fetchone()["n"]
 pages=max(1,(count+size-1)//size)
 p=min(p,pages)
 rows=db().execute(sql+" LIMIT ? OFFSET ?",tuple(params)+(size,(p-1)*size)).fetchall()
 return {"rows":rows,"page":p,"pages":pages,"count":count}

@app.get("/admin/audit")
@admin
def admin_audit():
 ensure_audit_table()
 action=request.args.get("action","").strip()
 allowed=("task_create","task_toggle","task_edit","submission_approved","submission_rejected","withdrawal_paid","withdrawal_rejected","balance_adjust","fraud_cleared","fraud_confirmed")
 if action not in allowed:action=""
 where="WHERE a.action=?" if action else ""
 data=paged("""SELECT a.*,u.username FROM admin_audit a JOIN users u ON u.id=a.admin_id """+where+" ORDER BY a.id DESC",(action,) if action else ())
 return render_template("admin_audit.html",data=data,action=action,actions=allowed)


@app.get("/admin/fraud")
@admin
def admin_fraud():
 ensure_fraud_schema(db(),bool(DATABASE_URL))
 status=request.args.get("status","open")
 if status not in ("open","cleared","confirmed","all"):status="open"
 where="" if status=="all" else " WHERE f.status=?"
 data=paged("""SELECT f.*,u.username FROM fraud_alerts f
 JOIN users u ON u.id=f.user_id"""+where+" ORDER BY f.severity DESC,f.id DESC",
 (status,) if where else (),name="page")
 # Optional member filter is applied on a dedicated detail page, not interpolated into SQL.
 user_id=request.args.get("user_id","").strip()
 return render_template("admin_fraud.html",data=data,status=status,user_id=user_id)

@app.post("/admin/fraud/<int:alert_id>/review")
@admin
def admin_review_fraud(alert_id):
 decision=request.form.get("decision","")
 reason=request.form.get("reason","").strip()
 if decision not in ("cleared","confirmed") or not 10<=len(reason)<=500:abort(400)
 c=db()
 ensure_fraud_schema(c,bool(DATABASE_URL))
 ensure_audit_table()
 try:
  c.execute("BEGIN IMMEDIATE")
  alert=c.execute("SELECT * FROM fraud_alerts WHERE id=?"+(" FOR UPDATE" if DATABASE_URL else ""),(alert_id,)).fetchone()
  if not alert:abort(404)
  if alert["status"]=="cleared" or (alert["status"]=="confirmed" and decision!="cleared"):
   c.execute("ROLLBACK")
   flash("Cảnh báo đã xử lý. Chỉ có thể loại trừ lại hồ sơ đã xác nhận sau khi có bằng chứng bổ sung.")
   return redirect(url_for("admin_fraud"))
  c.execute("""UPDATE fraud_alerts
  SET status=?,reviewed_by=?,review_reason=?,reviewed_at=CURRENT_TIMESTAMP
  WHERE id=?""",(decision,g.user["id"],reason,alert_id))
  audit(c,"fraud_"+decision,"fraud_alert",alert_id,"Thành viên "+str(alert["user_id"])+"; lý do: "+reason)
  c.execute("COMMIT")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 flash("Đã lưu quyết định vào nhật ký Admin.")
 return redirect(url_for("admin_fraud"))

if __name__=="__main__":app.run(debug=not production and os.getenv("FLASK_DEBUG")=="1")
