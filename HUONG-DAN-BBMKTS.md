# BBMKTS — nền tảng đối soát từng phiên
Bản chuẩn bị, chưa kích hoạt cho thành viên. Không có API giả định.
- Mỗi task_attempts.id liên kết tối đa một alias, alias không dùng lại.
- API /start hiện đã trả task_url và giao diện tự mở trong cùng tab. Sau khi có hợp đồng API chính thức, gắn adapter vào luồng này; khóa tạo phiên đồng thời, tái sử dụng alias còn hiệu lực.
- Trang thống kê theo alias: https://bbmkts.com/site/link/chart/{alias} (theo hướng dẫn Admin).
- Cần xác nhận API tạo link, định dạng phản hồi, cách lấy view được cho phép, ý nghĩa view tính tiền, độ trễ và giới hạn tần suất. Token chỉ lưu trong Worker secret, không đưa vào GitHub hoặc frontend.
- Khi trả về và giải CAPTCHA, vẫn giữ pending. Không coi view thường là lượt tính tiền. View 0 hoặc lỗi API không phải bằng chứng gian lận.
- Cần kiểm tra link riêng thật, link bỏ dở, lặp phiên, nhiều thiết bị, lỗi API, chậm thống kê, chia sẻ link và chống nhận thưởng trùng trước khi mở tự động.
- Migration 0007 là bảng mới độc lập; chưa áp dụng trên D1 thật. Module chưa nối vào route production.
- Thiết bị: nhãn User-Agent và model Android nếu trình duyệt cung cấp; có thể sai/giả mạo; không phải tên do chủ máy đặt hay model iPhone chính xác. Dữ liệu cũ không suy đoán lại.

## API Check View mới (27/11/2026)
Theo ảnh hướng dẫn BBMKTS: GET https://bbmkts.com/api/link/chart/{aliases}, public, trả JSON. Admin có mục thử kiểm tra alias từ Quản lý nhiệm vụ; Worker lấy dữ liệu chỉ đọc và hiển thị JSON nguyên dạng. Chưa xác nhận được schema thực tế hay ý nghĩa view tính tiền. Chưa cấp link thật, chưa tự động đối soát từng phiên, không tự cộng Lúa. Không dùng cookie đăng nhập hay token cho endpoint này.
