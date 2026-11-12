# Hướng dẫn triển khai bản thử nghiệm trên Render (có lưu dữ liệu)

**Chỉ dành cho thử nghiệm, không nhận tiền thật.** Cần Render Web Service trả phí có Persistent Disk vì ứng dụng hiện dùng SQLite. Gói Free không giữ được dữ liệu SQLite qua lần khởi động/triển khai lại.

1. Mở https://dashboard.render.com, đăng nhập bằng GitHub và chọn **New > Web Service**.
2. Kết nối repository `kiemluaonline/kiemluaonline`. Thiết lập **Root Directory** là `task-platform`, runtime **Docker**, nhánh **main**.
3. Chọn compute plan trả phí hỗ trợ **Persistent Disk**. Ở phần **Advanced**, thêm disk mount path `/app/data` (đây là Docker WORKDIR). Chọn dung lượng phù hợp, sao lưu riêng.
4. Thiết lập các biến môi trường (Environment):
   - `APP_ENV=production`
   - `COOKIE_SECURE=1`
   - `DATABASE_PATH=/app/data/platform.db`
   - `SECRET_KEY` = giá trị bí mật ít nhất 32 ký tự, sinh ngẫu nhiên ở máy của bạn; **không đưa vào GitHub, tin nhắn hay ảnh chụp màn hình**.
5. Start command nằm trong Dockerfile, không cần nhập thủ công. Khi dịch vụ chạy, script `start.sh` sẽ tạo các bảng còn thiếu (giữ dữ liệu cũ) rồi khởi chạy Waitress trên `PORT`.
6. Truy cập URL `https://<service>.onrender.com` được Render hiển thị. Kiểm tra GET `/health` trả về `{"status":"ok"}`.
7. Tạo tài khoản Admin lần đầu qua **Shell** trên dịch vụ (nếu gói Render của bạn hỗ trợ shell): `python -m flask --app app create-admin`. Lưu mật khẩu an toàn. Nếu dịch vụ không có Shell, **không** dùng đường dẫn đăng ký công khai để tạo Admin và không nhét mật khẩu Admin vào GitHub; cần cách bootstrap bảo mật riêng.
8. Đăng ký tài khoản thành viên thử nghiệm. Tạo nhiệm vụ mẫu, nộp bằng chứng, duyệt và kiểm tra ví. Kiểm tra khởi động lại dịch vụ vẫn giữ dữ liệu.
9. Trước khi cho người dùng thật sử dụng: hoàn thành kiểm thử bảo mật, backup và restore, xác minh tài chính, giới hạn đăng nhập, kiểm tra phân quyền và tuân thủ pháp luật.

**Lưu ý:** Render disk gắn một instance và có thể gây gián đoạn khi deploy. Không phục vụ nhiều instance bằng SQLite này; dùng PostgreSQL khi mở rộng. Dùng HTTPS của Render. Dữ liệu ngân hàng thu thập trong bản thử nghiệm phải là dữ liệu giả.

Tài liệu chính thức: https://render.com/docs/web-services và https://render.com/docs/disks
