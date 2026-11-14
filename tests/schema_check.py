from pathlib import Path
import sqlite3

sql=Path(__file__).resolve().parent.parent.joinpath('migrations/0001_init.sql').read_text()
con=sqlite3.connect(':memory:')
con.executescript(sql)
con.executescript(Path(__file__).resolve().parent.parent.joinpath('migrations/0002_shop.sql').read_text())
con.executescript(Path(__file__).resolve().parent.parent.joinpath('migrations/0003_shop_orders.sql').read_text())
con.executescript(Path(__file__).resolve().parent.parent.joinpath('migrations/0004_shop_estimated_lua.sql').read_text())
con.executescript(Path(__file__).resolve().parent.parent.joinpath('migrations/0005_cards.sql').read_text())
assert 'estimated_reward_lua' in {row[1] for row in con.execute("PRAGMA table_info('shop_orders')")}

tables={row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
required={'users','sessions','tasks','task_attempts','task_completions','wallet_entries','checkins','withdrawals','settings','risk_events','login_attempts','shop_products','shop_requests','shop_orders','shop_order_events','card_redemptions'}
assert required.issubset(tables), required-tables
try:
    con.execute("INSERT INTO wallet_entries(id,user_id,amount,reason,reference_type,reference_id) VALUES('x','u',0,'test','a','b')")
    assert False,'0 Lúa must fail'
except sqlite3.IntegrityError:
    pass
try:
    con.execute("INSERT INTO shop_products(id,title,description,link,category,is_active) VALUES('x','T','', 'https://vt.tiktok.com/test','invalid',1)")
    assert False,'Invalid category must fail'
except sqlite3.IntegrityError:
    pass
print('PASS: old and shopping migrations SQLite, các bảng, điều kiện dữ liệu cơ bản.')
