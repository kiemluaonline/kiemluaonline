# Triển khai Nhiệm Vụ Online miễn phí: Render + Supabase

**Mục đích:** website demo dùng dữ liệu giả, KHÔNG đưa tiền thật, tài khoản ngân hàng thật hoặc mật khẩu thật của người dùng vào thử nghiệm. Không công khai trang web trước khi kiểm thử an toàn. Render Free có thể ngủ sau 15 phút và Supabase Free có hạn mức/tạm dừng do ít hoạt động.

## A. Tạo PostgreSQL miễn phí trên Supabase

1. Truy cập https://supabase.com/dashboard → **New project**. Đăng ký/đăng nhập tài khoản của bạn và chọn **Free**.
2. Đặt tên dự án, ví dụ `nhiem-vu-online-demo`. Tạo **mật khẩu database mạnh** và lưu trong ứng dụng quản lý mật khẩu, không gửi cho ChatGPT, không đẩy lên GitHub, không chụp hình lộ mật khẩu.
3. Chờ Supabase hoàn thành tạo dự án. Trong trang dự án, chọn **Connect**.
4. Chọn **Session pooler** (cổng **5432**, host thuộc dạng `*.pooler.supabase.com`). Đây là lựa chọn IPv4 thích hợp cho ứng dụng Flask chạy lâu dài trên Render. **Không** lấy URL trực tiếp `db.<project>.supabase.co` nếu mạng hosting chỉ có IPv4 và bạn không có IPv4 add-on.
5. Copy nguyên văn connection string từ màn hình Connect, điền mật khẩu database của chính bạn để tạo một URI hoàn chỉnh. Nếu mật khẩu chứa ký tự đặc biệt, dùng URL-encoding trong URI (hoặc hướng dẫn chính thức Supabase).
6. **Giữ URI này bí mật:** URI là mật khẩu truy cập toàn bộ cơ sở dữ liệu. Không dán vào ChatGPT, issues, commit, file `.env` trên GitHub hoặc ảnh chụp màn hình.

Tài liệu Supabase: https://supabase.com/docs/guides/database/connecting-to-postgres

## B. Tạo Render Web Service Free

1. Truy cập https://dashboard.render.com/ và đăng nhập bằng GitHub `kiemluaonline`.
2. Chọn **New → Web Service → Git Provider**. Cấp quyền Render cho repository `kiemluaonline/kiemluaonline` nếu được hỏi.
3. Điền các trường sau:

| Cấu hình | Giá trị |
|---|---|
| Name | `nhiem-vu-online-demo` (nếu còn trống) |
| Repository | `kiemluaonline/kiemluaonline` |
| Branch | `main` |
| Root Directory | `task-platform` |
| Language / Runtime | `Docker` |
| Instance Type | `Free` |
| Health Check Path (nếu có) | `/health` |

4. Trong **Environment**, thêm các biến:

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | Chuỗi Session pooler Supabase (bí mật) |
| `SECRET_KEY` | Mã ngẫu nhiên mạnh dài >= 32 ký tự (bí mật, khác mật khẩu DB) |
| `APP_ENV` | `production` |
| `COOKIE_SECURE` | `1` |
| `BOOTSTRAP_ADMIN_USERNAME` | Tên Admin tạm do bạn chọn, 3–40 ký tự |
| `BOOTSTRAP_ADMIN_PASSWORD` | Mật khẩu Admin **tạm** >=16 ký tự, chỉ dùng lần đầu |

`SECRET_KEY` có thể tạo trên laptop Python bằng `python -c "import secrets; print(secrets.token_hex(32))"`, hoặc từ trình tạo mật khẩu an toàn. Đừng dùng giá trị ví dụ trong repository.

5. Nhấn **Deploy Web Service**. Render sẽ cài đặt thư viện, chạy `flask --app app init-db` (tạo bảng, RLS) và `flask --app app bootstrap-admin` (chỉ tạo Admin đầu tiên khi chưa có Admin). Sau đó chạy Waitress.
6. Khi deploy thành công, mở URL `https://<tên-dịch-vụ>.onrender.com` Render cung cấp. Thử `/health` để xác nhận backend và kết nối database. Không chia sẻ URL kèm mã bí mật nào.
7. **Ngay sau lần triển khai đầu tiên:** quay lại Render → Environment và **xóa** `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`, rồi lưu và redeploy. Mật khẩu Admin đã được lưu ở dạng hash trong database. Không tái sử dụng mật khẩu đó ở các dịch vụ khác.
8. Đăng nhập Admin, thử tạo nhiệm vụ; đăng ký tài khoản demo; gửi bằng chứng; duyệt và kiểm tra phần thưởng; tạo yêu cầu rút dùng dữ liệu giả. Kiểm tra lại sau lần redeploy để chắc chắn dữ liệu vẫn có.

### Lưu ý kỹ thuật

- **Không cần Persistent Disk trên Render**: dữ liệu thật của demo nằm trong Supabase PostgreSQL; Render chỉ chạy Flask.
- Kết nối DB chỉ được dùng ở server; **không đặt `DATABASE_URL` hoặc mật khẩu Supabase trong HTML/JS**. Không dùng Supabase `service_role` key ở trình duyệt.
- Tại lần đầu tạo database, ứng dụng kích hoạt **RLS cho mọi bảng và từ chối các vai trò anon/authenticated**. Không thêm chính sách RLS cho phép đọc ví/số dư công khai. Ứng dụng sử dụng kết nối database phía máy chủ, không dùng Supabase Auth.
- Để tạo Admin, dùng các biến bootstrap **tạm thời** thay vì gửi mật khẩu trong chat. Nếu database đã có Admin, chức năng bootstrap bỏ qua.
- Nếu Render báo lỗi `connection refused`, hãy kiểm tra đã copy **Session pooler** chứ không phải direct IPv6 hoặc transaction mode 6543. Nếu `password authentication failed`, kiểm tra tên người dùng pooler có dạng `postgres.<project-ref>` và mật khẩu URL-encoded đúng.
- Đây là hệ thống prototype; cần backup, rate limiting mạnh hơn, xác minh thanh toán/đối soát, chính sách pháp lý và kiểm thử độc lập trước khi sử dụng với tiền thật.

Tài liệu Render: https://render.com/docs/your-first-deploy và https://render.com/docs/configure-environment-variables

## C. Kiểm thử trên GitHub

Mở tab **Actions** tại https://github.com/kiemluaonline/kiemluaonline/actions để kiểm tra workflow test. Nếu thấy dấu đỏ, cần sửa lỗi trước khi công khai website. Workflow chỉ kiểm thử với SQLite cục bộ và adapter mô phỏng; **không tự thử truy cập dự án Supabase thật**.
