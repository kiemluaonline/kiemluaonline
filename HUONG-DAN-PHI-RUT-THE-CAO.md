# Phí rút tiền theo số tiền nhận và mã lệnh — Trạm Có Lúa

## Biểu phí rút tiền (tự động, Admin không phải nhập thủ công)
- **Rút dưới 5.000đ**: không được gửi yêu cầu.
- **Rút từ 5.000đ đến 24.999đ**: phụ thu **2.000đ** cho mỗi yêu cầu, tính thành Lúa theo tỷ giá Admin hiện đặt.
- **Rút từ 25.000đ trở lên**: **miễn phí rút tiền**.
- Giới hạn tối thiểu bổ sung theo Lúa do Admin từng đặt, nếu cao hơn mức quy đổi 5.000đ, vẫn có hiệu lực.
- Không trừ phí khỏi số tiền khách nhận; máy chủ giữ riêng phần Lúa tương đương phí **cộng thêm** vào số Lúa quy đổi.

### Ví dụ
Giả sử tỷ giá Admin đang để **1 Lúa = 1 VNĐ**:
- Rút **5.000đ**: giữ **7.000 Lúa** (5.000 rút + 2.000 phí), chuyển đúng **5.000đ** sau duyệt.
- Rút **24.999đ**: giữ **26.999 Lúa**, chuyển đúng **24.999đ** sau duyệt.
- Rút **25.000đ**: giữ **25.000 Lúa**, chuyển đủ **25.000đ** sau duyệt.
- Nếu tỷ giá là **10 Lúa = 1 VNĐ**, rút **10.000đ** giữ **120.000 Lúa**: 100.000 Lúa rút + 20.000 Lúa phí.

## Đổi thẻ cào
- **Không đổi biểu phí thẻ cào hiện có**: Admin vẫn có thể tự nhập **Phí mỗi lần đổi thẻ cào (Lúa)** ở Admin → Cài đặt.
- Phí thẻ cào vẫn được cộng thêm vào số Lúa tương đương mệnh giá thẻ, khách nhận đúng mệnh giá sau khi Admin duyệt và cấp mã.

## Mã lệnh để tra cứu
- Mỗi yêu cầu rút mới và cũ hiển thị **Mã lệnh: #...** trong Lịch sử yêu cầu rút của khách và trong bảng Yêu cầu rút tiền của Admin.
- Mã hiển thị là **12 ký tự đầu** của mã giao dịch UUID đã lưu (không thay đổi ID gốc, không tạo bảng hay cột mới).
- Không tự cấp mã theo thứ tự 1, 2, 3; tránh rủi ro trùng số hoặc thay đổi lịch sử. Nếu cần đối soát kỹ thuật, mã UUID gốc vẫn còn trong dữ liệu.
- Trạng thái và duyệt thủ công giữ nguyên: **Đang chờ → Đã duyệt → Đã thanh toán**; hoặc **Từ chối / Số tài khoản không đúng**.

## An toàn dữ liệu và hoàn phí
- Máy chủ tính biểu phí; trình duyệt không thể sửa số phí để né thu.
- Trước khi gửi, khách thấy số Lúa rút, phí tính theo mức tiền, tổng Lúa giữ và VNĐ nhận dự kiến.
- Yêu cầu bị từ chối hoặc đánh dấu số tài khoản không đúng được **hoàn toàn bộ Lúa đã giữ, bao gồm phí**. Chỉ hoàn một lần.
- Yêu cầu đã thanh toán thật không tự hoàn.
- **Không cập nhật ngược phí cũ**: phí của mỗi yêu cầu cũ được giữ qua dòng sổ ví `withdraw_hold`. Mọi tài khoản, ví, giao dịch, lịch sử nhiệm vụ và đổi thẻ cào được bảo toàn.
- Giá trị setting cũ `withdrawal_fee_lua` được giữ trong D1 để tương thích dữ liệu cũ nhưng **không còn được dùng tính phí rút mới**, và không còn ô chỉnh phí rút cố định ở giao diện Admin.
- **Không cần chạy migration SQL mới** cho biểu phí hoặc mã lệnh. Sau khi triển khai Worker + frontend mới, mở lại Safari để kiểm tra. GitHub Actions thành công **không đồng nghĩa** Cloudflare đã triển khai.

## Lưu ý về chính sách
- Mức phí là **2.000đ giá trị quy đổi**, không phải tự động 2.000 Lúa nếu tỷ giá không phải 1:1.
- Từ **25.000đ trở lên** đã miễn phí (bao gồm đúng 25.000đ).
- Admin cần công bố biểu phí trước khi khách gửi yêu cầu rút và kiểm tra thủ công trước khi chuyển khoản.
