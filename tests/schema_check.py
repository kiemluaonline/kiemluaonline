from pathlib import Path
import sqlite3

sql=Path(__file__).resolve().parent.parent.joinpath('migrations/0001_init.sql').read_text()
con=sqlite3.connect(':memory:')
con.executescript(sql)
tables={row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
required={'users','sessions','tasks','task_attempts','task_completions','wallet_entries','checkins','withdrawals','settings','risk_events','login_attempts'}
assert required.issubset(tables), required-tables
try:
    con.execute("INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id) VALUES('x','u',0,'test','a','b')")
    assert False,'0 Lúa must fail'
except sqlite3.IntegrityError:
    pass
print('PASS: migration SQLite, các bảng, điều kiện dữ liệu cơ bản.')
