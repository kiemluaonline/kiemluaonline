# Lưu tài khoản ngân hàng ngay trong Rút tiền — Trạm Có Lúa

## Dùng trên iPhone
1. Mở **Rút tiền**, không phải mở menu riêng. Tính năng mới chỉ dùng **Chuyển khoản ngân hàng**; đã bỏ lựa chọn **Ví ZaloPay**.
2. Chọn ngân hàng và nhập số tài khoản, tên chủ tài khoản. Nếu người nhận có số tài khoản BVBank do ZaloPay cung cấp (ví dụ đầu **99ZP** gồm cả chữ/số), chọn **BVBank**; không thay số tài khoản bằng số điện thoại ví.
3. Tích **Lưu thông tin nhận tiền này làm mặc định cho lần rút sau** nếu muốn lưu. Khi gửi yêu cầu rút thành công, hệ thống mới ghi tài khoản để lần sau chọn lại.
4. Nếu đã lưu, chọn ở **Tài khoản ngân hàng đã lưu** trên trang Rút tiền. Có thể chọn **＋ Nhập tài khoản mới** để dùng tài khoản khác.
5. Phần **⚙ Quản lý tài khoản nhận tiền đã lưu (nếu cần)** nằm ngay dưới biểu mẫu rút, cho phép thêm, sửa, xóa hoặc đổi mặc định. Mỗi thành viên tối đa 10 tài khoản đã lưu (bao gồm bản ghi cũ).

## Bảo vệ dữ liệu và quy trình Admin
- **Không xóa** tài khoản thành viên, ví Lúa, lịch sử nhiệm vụ, yêu cầu rút, đổi thẻ cào, phí hay cấu hình Admin.
- **Không chấp nhận tạo yêu cầu rút Ví ZaloPay mới**, kể cả gửi trực tiếp đến API.
- **Giao dịch ZaloPay cũ vẫn hiển thị, vẫn có thể được Admin duyệt hoặc xử lý** đúng quy trình trước đây.
- Tài khoản loại Ví ZaloPay đã lưu trước đó vẫn có trong danh sách, được gắn **Ví cũ • không dùng để rút mới** và người dùng có thể tự xóa nếu muốn; website không tự xóa.
- Thay đổi tài khoản đã lưu không sửa số tài khoản chụp lại trên yêu cầu rút trước đây.
- Chỉ người đăng nhập đúng tài khoản mới được quản lý tài khoản đã lưu của mình.
- Nếu gửi rút thành công nhưng lưu tài khoản sau đó thất bại, chỉ báo lỗi lưu và **không tạo thêm yêu cầu rút**.

## Cloudflare và SQL 0006
- Bảng `payout_accounts` được thêm bởi `migrations/0006_payout_accounts.sql`. Việc bỏ Ví ZaloPay **không cần SQL mới**.
- Nếu chưa từng chạy SQL 0006 thì sao lưu D1 `tram-lua-db` trước khi chạy. Kiểm tra bảng đã tồn tại hay chưa, không chạy lại các migration cũ.
- Cần deploy cả mã Worker và giao diện mới lên Cloudflare. GitHub Actions kiểm tra mã nguồn nhưng không xác nhận bản mới đã phát hành trên Cloudflare.
