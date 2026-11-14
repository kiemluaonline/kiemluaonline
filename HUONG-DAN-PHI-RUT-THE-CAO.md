# Phí xử lý rút tiền và đổi thẻ cào — Trạm Có Lúa

## Cấu hình của Admin
Trên iPhone, vào **Admin → Cài đặt → 💸 Phí xử lý rút tiền và đổi thẻ cào**:

- **Phí mỗi lần rút tiền (Lúa) – ngân hàng (bao gồm BVBank)**: một khoản phí cố định cộng thêm cho mỗi yêu cầu rút, áp dụng chung hai kênh.
- **Phí mỗi lần đổi thẻ cào (Lúa)**: một khoản phí cố định khác, cộng thêm khi đổi thẻ Viettel, VinaPhone, MobiFone.
- Mặc định **0 Lúa** cho cả hai. Admin chọn mức phí, rồi nhấn **Lưu cài đặt**. **Không tự đặt phí thay Admin**.
- Mức phí nằm trong khoảng **0–10.000.000 Lúa/yêu cầu**. Không thu % và không tự trừ phí vào số tiền/thẻ thực nhận.
- Thay đổi mức phí chỉ ảnh hưởng **yêu cầu tạo sau đó**. Các yêu cầu cũ vẫn giữ phí tại thời điểm gửi.
- Đã thêm tiếng Hmoob cho các trường cấu hình và thông báo.

## Cách trừ Lúa
Ví dụ phí mỗi lần rút = **1.000 Lúa**, tỷ giá 1 Lúa = 1 VNĐ:

- Khách nhập muốn rút **20.000 Lúa**; tiền sẽ nhận nếu Admin chuyển thành công là **20.000 VNĐ**.
- Website hiển thị trước khi khách xác nhận: **20.000 Lúa rút + 1.000 Lúa phí = 21.000 Lúa tổng giữ**.
- Khách chỉ gửi được yêu cầu nếu ví có **ít nhất 21.000 Lúa**. Máy chủ kiểm tra và giữ **21.000 Lúa một lần**.
- Admin duyệt rồi chuyển tiền thật ngoài website. Sau khi đánh dấu đã thanh toán, không trừ thêm Lúa nữa.

Ví dụ phí đổi thẻ = **1.000 Lúa**, tỷ giá 1 Lúa = 1 VNĐ:

- Khách đổi thẻ Viettel **10.000đ**.
- Website hiển thị **10.000 Lúa giá thẻ + 1.000 Lúa phí = 11.000 Lúa tổng giữ**.
- Sau khi Admin duyệt và nhập mã thẻ thật, khách nhận mã thẻ **10.000đ**; không có khoản trừ bổ sung.

## Từ chối và hoàn Lúa
- Nếu yêu cầu **rút tiền bị từ chối hoặc thông tin tài khoản sai**, ví được hoàn **toàn bộ Lúa đã giữ, bao gồm phí**.
- Nếu yêu cầu **đổi thẻ cào bị từ chối** (kể cả sau khi Admin duyệt nhưng chưa phát mã), ví được hoàn **toàn bộ Lúa đã giữ, bao gồm phí**.
- Mỗi yêu cầu chỉ có thể được xử lý/hoàn **một lần**; thao tác lặp bị chặn.
- Khi đã thanh toán tiền thật hoặc phát mã thẻ thành công, phí trở thành khoản chi phí xử lý đã thu; không tự hoàn.
- Phí gốc theo từng yêu cầu được tính từ dòng sổ ví giữ Lúa `withdraw_hold` hoặc `card_redemption_hold`; **không cần cột mới** trên bảng D1. Với giao dịch cũ, phí hiện là **0 Lúa**.

## Minh bạch và an toàn
- Thành viên xem **phí xử lý và tổng Lúa cần giữ trước khi gửi** và xem lại trong lịch sử.
- Mức phí do **máy chủ** quyết định; tự sửa dữ liệu trên trình duyệt không giúp né phí.
- Nếu Admin đổi phí trong khi khách đang mở biểu mẫu, website yêu cầu **tải lại để xác nhận mức phí mới**, không trừ phí bất ngờ.
- Admin xem được phí từng giao dịch ở **Yêu cầu rút tiền** và **Quản lý thẻ cào**.
- Khách không có đủ Lúa **bao gồm phí** sẽ bị từ chối yêu cầu, không trừ ví.
- Không thay đổi quy trình duyệt tiền, xác minh thẻ hay tỷ giá hiện tại.

## Kích hoạt bản mới
- Không cần chạy SQL mới vì cài đặt phí dùng bảng `settings` và lịch sử phí dùng bảng `wallet_entries` đã có.
- Cần cập nhật bản **Cloudflare Worker** và file website từ GitHub. Kiểm thử GitHub Actions không đồng nghĩa bản Worker đã tự được triển khai.
- Sau khi deploy, mở lại Safari, vào Admin → Cài đặt để nhập phí; trước khi Admin tự nhập, cả hai phí là 0.

**Quan trọng:** Admin phải đặt phí hợp lý và công bố rõ cho thành viên trước khi họ gửi yêu cầu, không nên tự thay đổi khoản phí của các yêu cầu đang chờ.
