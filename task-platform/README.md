# Nhiệm Vụ Online — nền tảng nhiệm vụ

Dự án MVP Flask + SQLite: đăng ký/đăng nhập người dùng, Admin tự tạo nhiệm vụ, người dùng nộp bằng chứng, Admin duyệt và cộng thưởng, yêu cầu rút tiền được giữ số dư và xử lý thủ công.

## Chạy local

Yêu cầu Python 3.10+. Trong thư mục `task-platform`:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Thiết lập SECRET_KEY trong biến môi trường
flask --app app init-db
flask --app app create-admin
flask --app app run
```

**Chú ý:** Chưa có chuyển tiền tự động; `paid` chỉ ghi nhận Admin đã chuyển khoản bên ngoài. Cần bổ sung bảo mật, xác minh tài khoản, giới hạn đăng nhập, sao lưu, giám sát và rà soát pháp lý trước khi vận hành tiền thật. Không lưu mật khẩu, secret hay cơ sở dữ liệu trong GitHub.

## Quản trị V3

Đăng nhập tài khoản Admin và mở `/admin`. Chọn **Quản lý thành viên** để tìm tài khoản theo tên, xem số dư, lịch sử giao dịch, nhiệm vụ và yêu cầu rút.

Admin có thể cộng/trừ thưởng qua biểu mẫu ở trang chi tiết thành viên, bắt buộc nhập lý do (10–300 ký tự). Thay đổi tạo một dòng trong `admin_adjustments` và một dòng trong `ledger` trong cùng transaction SQLite; không cho trừ vượt số dư khả dụng hoặc chỉnh số dư tài khoản Admin. Bảng `admin_adjustments` được tự tạo khi dùng tính năng; chạy lại `flask --app app init-db` cũng an toàn trên database hiện có.

Chọn **Sửa** trên nhiệm vụ để đổi tiêu đề và hướng dẫn. Nếu đã có ít nhất một lượt nộp, mức thưởng được khóa để tránh thay đổi thưởng của nhiệm vụ đã tham gia. Nút **Ẩn/Mở** không xóa nhiệm vụ.

**Hạn chế trước khi triển khai thật:** Điều chỉnh thủ công chỉ nên thực hiện khi có chứng từ; tính năng chưa có cơ chế phê duyệt hai người, kiểm tra chống lạm dụng, phân quyền đa cấp, rate limit, cảnh báo gian lận hay tích hợp thanh toán. Không vận hành tiền thật khi chưa hoàn tất các bước này và kiểm tra pháp lý. SQLite chỉ nên dùng trong môi trường phát triển/sản lượng thấp, sao lưu database cẩn thận. Phải đặt `SECRET_KEY` cố định, mạnh và `COOKIE_SECURE=1` khi dùng HTTPS.


## Admin V4 — bộ lọc, phân trang, thống kê, nhật ký

- `/admin`: 4 chỉ số thành viên, nhiệm vụ, chờ duyệt và rút đang chờ; 4 tổng số tiền gồm thưởng nhiệm vụ, số dư khả dụng theo ledger, khoản rút đang chờ và khoản đã đánh dấu chuyển thành công.
- Bộ lọc nhiệm vụ (tất cả/mở/ẩn), bằng chứng (tất cả/chờ/duyệt/từ chối) và rút tiền (tất cả/chờ/đã chuyển/từ chối). Mỗi danh sách có phân trang 15 mục, lọc và trang được lưu trên URL.
- `/admin/members`: tìm tên, lọc vai trò, phân trang 15 tài khoản.
- `/admin/audit`: nhật ký hành động Admin và lọc theo loại, gồm tạo/sửa/ẩn nhiệm vụ, duyệt/từ chối nộp, đánh dấu rút/chặn rút và điều chỉnh số dư. Ghi cùng SQLite transaction của thay đổi dữ liệu; chỉ ghi sự kiện thành công, không ghi thao tác từ các phiên bản trước.
- `flask --app app init-db` có thể chạy trên database cũ để tạo bảng mới mà không xóa dữ liệu.

**Ý nghĩa số liệu:** số dư khả dụng = tổng ledger (đã trừ số dư giữ cho yêu cầu rút). Chỉ số `Đã chuyển` là trạng thái do Admin ghi nhận, không chứng thực bằng tích hợp ngân hàng. Tiền chờ rút là số tiền đang bị giữ và không có trong số dư khả dụng. Đọc các chỉ số riêng biệt, không cộng tất cả để suy ra tổng tài sản. 

**An toàn:** audit log chỉ nằm trong cùng SQLite database và chưa được bảo vệ chống sửa trực tiếp bởi người có quyền truy cập DB. Trước khi dùng tiền thật cần kiểm thử kỹ và bổ sung xác minh chuyển khoản, sao lưu, quyền riêng của nhật ký, báo cáo đối soát và rate limit.


## V5: kiểm thử tự động và bảo mật cơ bản

Chạy trong thư mục `task-platform`:

```bash
python -m pip install -r requirements.txt pytest
python -m pytest -q tests
```

GitHub Actions ở `.github/workflows/task-platform-tests.yml` cũng kiểm tra cú pháp và chạy bộ test sau khi cập nhật mã nguồn. Vào tab **Actions** trên repository để xem kết quả; việc đã có workflow không có nghĩa là bộ test đã chạy thành công.

Biện pháp bổ sung: giới hạn 5 lần đăng nhập sai trong cửa sổ 15 phút cho từng cặp tên đăng nhập/IP; giới hạn POST body 32 KiB; session hết hạn sau 12 giờ; CSP, X-Frame-Options, nosniff, Referrer-Policy, no-store. Ở môi trường `APP_ENV=production`, bắt buộc `SECRET_KEY` mạnh (>=32 ký tự) và `COOKIE_SECURE=1`; truy cập bằng HTTPS. Cơ chế hạn chế đăng nhập hiện tại chưa đủ thay thế hệ thống rate limit theo IP và giám sát chống brute-force quy mô lớn.

`Dockerfile` chạy Waitress ở cổng 8000, nhưng **không được triển khai với database SQLite đặt trên ổ đĩa tạm hoặc trong container không có persistent volume**. Phải gắn volume bền vững ngoài container cho `DATABASE_PATH`, sao lưu tự động và kiểm thử phục hồi. Trong môi trường dùng nhiều worker/máy chủ, nên chuyển sang PostgreSQL và thiết kế migration chuẩn. Không sử dụng dữ liệu tiền thật ở môi trường staging.


## V7: Render Free + Supabase Free PostgreSQL

**Hướng dẫn từng bước bằng tiếng Việt:** [DEPLOY_FREE_SUPABASE.md](DEPLOY_FREE_SUPABASE.md).

- Khi `DATABASE_URL` được cung cấp, Flask dùng PostgreSQL với psycopg3 và TLS bắt buộc (`sslmode=require`). Ứng dụng vẫn dùng SQLite **chỉ khi phát triển hoặc chạy tests** mà không có `DATABASE_URL`.
- Khi `APP_ENV=production`, `DATABASE_URL` là **bắt buộc**, cùng `SECRET_KEY` và `COOKIE_SECURE=1`.
- Dùng Session pooler Supabase (cổng 5432, IPv4), không công khai connection URI. Script `start.sh` tạo bảng PostgreSQL khi khởi động và khởi chạy Waitress.
- Các bảng chứa dữ liệu cá nhân và tiền thưởng có RLS và không cấp quyền cho vai trò `anon` hoặc `authenticated` trực tiếp. API truy cập chỉ thông qua Flask server.
- Tạo Admin đầu tiên qua cặp biến Render `BOOTSTRAP_ADMIN_USERNAME`/`BOOTSTRAP_ADMIN_PASSWORD` (chỉ lần đầu, mật khẩu ít nhất 16 ký tự). **Xóa hai biến sau lần chạy đầu thành công**.
- Mỗi yêu cầu trừ số dư dùng transaction PostgreSQL và `SELECT ... FOR UPDATE` trên bản ghi user để tuần tự hóa các thay đổi đồng thời.
- Bộ tests mới có `tests/test_postgres_adapter.py` để kiểm tra chuẩn bị câu SQL, TLS và RLS ở mức mã. Không có tích hợp Supabase production trong CI và chưa xác nhận chạy thông suốt trên dịch vụ thực tế.
- Mã nguồn **không tự copy dữ liệu SQLite cũ sang PostgreSQL**. Nếu cần giữ dữ liệu cũ, phải backup, migration riêng và đối soát các giao dịch trước khi sử dụng.

**Giới hạn quan trọng:** Render Free ngủ khi ít truy cập; Supabase Free giới hạn tài nguyên và có thể tạm dừng project không hoạt động. Bản này chỉ để thử nghiệm với dữ liệu mẫu, không xử lý tiền thật hay đưa vào môi trường production thương mại.
