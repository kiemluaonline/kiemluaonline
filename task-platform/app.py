import os, secrets, sqlite3, hmac
from pathlib import Path
from functools import wraps
from flask import Flask, g, session, request, redirect, url_for, render_template, flash, abort
from werkzeug.security import generate_password_hash, check_password_hash

app=Flask(__name__)
app.config.update(SECRET_KEY=os.getenv("SECRET_KEY",secrets.token_hex(32)),SESSION_COOKIE_HTTPONLY=True,SESSION_COOKIE_SAMESITE="Lax",SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE")=="1")
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
 db().executescript(SCHEMA);print("Database initialized")
@app.cli.command("create-admin")
def create_admin():
 import getpass
 name=input("Admin username: ").strip();password=getpass.getpass("Admin password: ")
 if len(password)<12 or len(name)<3:raise ValueError("Admin password needs >=12 characters; name >=3")
 db().execute("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')",(name,generate_password_hash(password)))
 print("Admin created")
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
def amount(s):
 try:
  n=int(s)
  if 0<n<=100000000:return n
 except (ValueError,TypeError):pass
 abort(400)
@app.get("/")
def home():return redirect(url_for("admin_home" if g.user["role"]=="admin" else "dashboard")) if g.user else render_template("landing.html")
@app.route("/register",methods=["GET","POST"])
def register():
 if request.method=="POST":
  name=request.form.get("username","").strip();password=request.form.get("password","")
  if not 3<=len(name)<=40 or not name.replace("_","").isalnum() or len(password)<10:flash("Tài khoản hoặc mật khẩu không hợp lệ.")
  else:
   try:db().execute("INSERT INTO users(username,password_hash) VALUES(?,?)",(name,generate_password_hash(password)));return redirect(url_for("login"))
   except sqlite3.IntegrityError:flash("Tên tài khoản đã tồn tại.")
 return render_template("auth.html",register=True)
@app.route("/login",methods=["GET","POST"])
def login():
 if request.method=="POST":
  u=db().execute("SELECT * FROM users WHERE username=?",(request.form.get("username",""),)).fetchone()
  if u and check_password_hash(u["password_hash"],request.form.get("password","")):
   session.clear();session["user_id"]=u["id"];session["csrf"]=secrets.token_hex(32);return redirect(url_for("home"))
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
 if not db().execute("SELECT 1 FROM tasks WHERE id=? AND active=1",(task_id,)).fetchone():abort(404)
 try:db().execute("INSERT INTO submissions(user_id,task_id,evidence) VALUES(?,?,?)",(g.user["id"],task_id,evidence));flash("Đã gửi bằng chứng.")
 except sqlite3.IntegrityError:flash("Bạn đã gửi nhiệm vụ này.")
 return redirect(url_for("dashboard"))
@app.route("/withdraw",methods=["GET","POST"])
@member
def withdraw():
 if g.user["role"]!="user":abort(403)
 if request.method=="POST":
  n=amount(request.form.get("amount"));bank=request.form.get("bank","").strip();holder=request.form.get("holder","").strip();account=request.form.get("account","").strip()
  if not (2<=len(bank)<=80 and 2<=len(holder)<=100 and 5<=len(account)<=40 and account.isalnum()):abort(400)
  c=db()
  try:
   c.execute("BEGIN IMMEDIATE")
   if balance(g.user["id"])<n:c.execute("ROLLBACK");flash("Số dư không đủ.");return redirect(url_for("withdraw"))
   w=c.execute("INSERT INTO withdrawals(user_id,amount,bank,holder,account) VALUES(?,?,?,?,?)",(g.user["id"],n,bank,holder,account)).lastrowid
   c.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(?,?,'hold',?)",(g.user["id"],-n,w))
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
 member_count=c.execute("SELECT COUNT(*) n FROM users WHERE role='user'").fetchone()["n"]
 return render_template("admin.html",member_count=member_count,tasks=c.execute("SELECT * FROM tasks ORDER BY id DESC").fetchall(),submissions=c.execute("SELECT s.*,u.username,t.title,t.reward FROM submissions s JOIN users u ON u.id=s.user_id JOIN tasks t ON t.id=s.task_id ORDER BY s.id DESC").fetchall(),withdrawals=c.execute("SELECT w.*,u.username FROM withdrawals w JOIN users u ON w.user_id=u.id ORDER BY w.id DESC").fetchall())
@app.post("/admin/task")
@admin
def create_task():
 title=request.form.get("title","").strip();description=request.form.get("description","").strip();reward=amount(request.form.get("reward"))
 if not 5<=len(title)<=120 or not 10<=len(description)<=3000:abort(400)
 db().execute("INSERT INTO tasks(title,description,reward) VALUES(?,?,?)",(title,description,reward))
 return redirect(url_for("admin_home"))
@app.post("/admin/task/<int:task_id>/toggle")
@admin
def toggle(task_id):
 db().execute("UPDATE tasks SET active=1-active WHERE id=?",(task_id,))
 return redirect(url_for("admin_home"))
@app.post("/admin/review/<int:sid>/<decision>")
@admin
def review(sid,decision):
 if decision not in ("approved","rejected"):abort(404)
 c=db()
 try:
  c.execute("BEGIN IMMEDIATE")
  s=c.execute("SELECT s.*,t.reward FROM submissions s JOIN tasks t ON s.task_id=t.id WHERE s.id=?",(sid,)).fetchone()
  if not s:abort(404)
  if s["status"]=="pending":
   c.execute("UPDATE submissions SET status=? WHERE id=?",(decision,sid))
   if decision=="approved":c.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(?,?,'reward',?)",(s["user_id"],s["reward"],sid))
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
 try:
  c.execute("BEGIN IMMEDIATE")
  w=c.execute("SELECT * FROM withdrawals WHERE id=?",(wid,)).fetchone()
  if not w:abort(404)
  if w["status"]=="pending":
   c.execute("UPDATE withdrawals SET status=? WHERE id=?",(decision,wid))
   if decision=="rejected":c.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(?,?,'refund',?)",(w["user_id"],w["amount"],wid))
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
 rows=db().execute("""SELECT u.id,u.username,u.role,
 COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id=u.id),0) current_balance,
 (SELECT COUNT(*) FROM submissions WHERE user_id=u.id) submission_count
 FROM users u WHERE u.username LIKE ? COLLATE NOCASE ORDER BY u.id DESC LIMIT 100""",("%"+search+"%",)).fetchall()
 total=db().execute("SELECT COUNT(*) n FROM users WHERE role='user'").fetchone()["n"]
 return render_template("admin_members.html",users=rows,search=search,total=total)

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
  if delta<0 and balance(uid)<-delta:
   c.execute("ROLLBACK")
   flash("Không thể trừ vượt số dư khả dụng.")
   return redirect(url_for("admin_member",uid=uid))
  adjustment_id=c.execute("INSERT INTO admin_adjustments(user_id,admin_id,amount,reason) VALUES(?,?,?,?)",(uid,g.user["id"],delta,reason)).lastrowid
  c.execute("INSERT INTO ledger(user_id,amount,kind,reference_id) VALUES(?,?,'manual',?)",(uid,delta,adjustment_id))
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
  c.execute("COMMIT")
 except Exception:
  if c.in_transaction:c.execute("ROLLBACK")
  raise
 flash("Đã cập nhật nhiệm vụ.")
 return redirect(url_for("admin_home")+"#tasks")

if __name__=="__main__":app.run(debug=os.getenv("FLASK_DEBUG")=="1")
