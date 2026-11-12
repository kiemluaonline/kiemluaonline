# Triển khai Render + Supabase (bản cập nhật)

Website hiện dùng **Supabase PostgreSQL** ở môi trường production và **Render Free** để chạy Flask. Vì vậy không cần Render Persistent Disk.

Vui lòng làm theo hướng dẫn mới, đầy đủ bằng tiếng Việt:

**[DEPLOY_FREE_SUPABASE.md](DEPLOY_FREE_SUPABASE.md)**

Tệp hướng dẫn cũ dành cho SQLite/Persistent Disk đã được thay thế để tránh chọn nhầm gói hosting trả phí.

Lưu ý: Mã nguồn không tự chuyển các bản ghi từ file SQLite cũ sang Supabase. Nếu bạn đã có dữ liệu quan trọng trong SQLite, hãy sao lưu và thực hiện migration riêng, đối soát tổng số dư, lịch sử thưởng và rút trước khi thay đổi môi trường. Không đưa database hoặc thông tin mật khẩu vào GitHub.
