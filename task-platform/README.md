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
