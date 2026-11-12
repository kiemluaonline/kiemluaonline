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