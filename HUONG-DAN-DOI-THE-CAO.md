# Hướng dẫn đổi Lúa lấy thẻ cào (Viettel, VinaPhone, MobiFone)

## Cách sử dụng

**Thành viên → 🎁 Đổi thẻ cào**:
- Chọn nhà mạng và mệnh giá 10.000đ, 20.000đ, 50.000đ, 100.000đ hoặc 200.000đ.
- Website hiển thị giá theo **tỷ giá Lúa/VNĐ đang có trong Cài đặt**. Ví dụ: nếu tỷ giá là 2 Lúa = 1 VNĐ thì thẻ 10.000đ cần 20.000 Lúa. Đây chỉ là ví dụ; **không tự ý thay đổi tỷ giá thực tế**.
- Nhấn gửi yêu cầu: hệ thống **giữ số Lúa tương ứng** để tránh đổi hai lần. Trang lịch sử hiển thị Chờ duyệt.
- Admin kiểm tra và duyệt. Khi Admin phát **mã thẻ thật, chưa dùng** thì trạng thái chuyển thành **Đã nhận thẻ**.
- Thành viên vào **Lịch sử đổi thẻ cào**, mở **Xem seri và mã thẻ đã nhận** để xem và sao chép. Mã chỉ xuất hiện sau khi phát và chỉ trong tài khoản của người nhận.
- Nếu bị từ chối trước khi phát, website hoàn **đủ Lúa, một lần** vào ví.

**Admin → 🎁 Quản lý thẻ cào**:
- Bật/tắt tiếp nhận yêu cầu độc lập với rút tiền ngân hàng và ZaloPay.
- Xem yêu cầu, duyệt, nhập seri + mã nạp thẻ thật, xác nhận phát hoặc từ chối và hoàn Lúa.
- Mã thẻ được **mã hóa AES-GCM trên máy chủ trước khi lưu D1**. Danh sách Admin không hiển thị lại mã đã phát. Khóa bí mật không nằm trong cơ sở dữ liệu hoặc mã nguồn.
- Trang thành viên không tự mua thẻ hoặc nạp tiền điện thoại. **Admin phải chuẩn bị thẻ thật** và kiểm tra trước khi phát. Không nhập mã thẻ đã sử dụng.
- Website chống phát trùng cùng seri thẻ theo nhà mạng (fingerprint HMAC).

## Bật tính năng mới trên Cloudflare — thực hiện trên iPhone

**Bước 1: Sao lưu D1**, rồi vào Cloudflare Dashboard → D1 → chọn đúng cơ sở dữ liệu `tram-lua-db` → Console.

**Bước 2: Tạo bảng mới.** Mở toàn bộ nội dung của [migrations/0005_cards.sql](https://github.com/kiemluaonline/kiemluaonline/blob/main/migrations/0005_cards.sql), sao chép vào D1 Console và nhấn Execute **một lần**. Lệnh dùng `CREATE TABLE IF NOT EXISTS`; không xóa bảng ví, rút tiền, nhiệm vụ hay mua sắm cũ. Trong D1 kiểm tra bảng `card_redemptions`.

**Bước 3: Tạo khóa bí mật**:
1. Sau khi bản Worker mới nhất được deploy, vào Admin → **Quản lý thẻ cào**.
2. Nhấn **🔑 Tạo và sao chép khóa bí mật**. Trình duyệt tự tạo **32 byte ngẫu nhiên (64 ký tự hex)** và sao chép vào clipboard trên iPhone.
3. Mở Cloudflare → Workers & Pages → Worker của `nhiemvu.click` → **Settings → Variables and Secrets** (hoặc đường dẫn tương ứng theo giao diện Cloudflare).
4. Tạo **Secret** có tên chính xác `CARD_VOUCHER_SECRET` và dán giá trị vừa sao chép. **Không dùng Variable công khai**, không gửi khóa qua tin nhắn, không lưu trong GitHub.
5. Triển khai lại bản Worker nếu Cloudflare yêu cầu.
6. **Lưu lại khóa an toàn** trong trình quản lý mật khẩu. **Đừng thay đổi hoặc xóa khóa sau khi có thẻ đã phát**, nếu không thành viên sẽ không đọc được mã cũ đã mã hóa.

**Bước 4: Kiểm tra tỷ giá.** Vào Admin → Cài đặt, đặt `lua_per_vnd` đúng với chính sách quy đổi của bạn (ví dụ thẻ 10.000đ = 10.000 Lúa nếu tỷ giá 1 Lúa/VNĐ). **Không bắt buộc là 1:1**, tránh hứa với khách mức chưa có ngân sách. Việc đổi thẻ sử dụng tỷ giá này để chốt mức Lúa tại thời điểm tạo yêu cầu, không sửa tỷ giá của khoản rút đã tạo.

**Bước 5: Bật thủ công** Admin → Quản lý thẻ cào → Trạng thái nhận yêu cầu → Bật nhận yêu cầu → Lưu cấu hình. Đảm bảo đã chuẩn bị đủ thẻ cho các mệnh giá công bố.

**Bước 6: Kiểm tra thử** bằng tài khoản thành viên có Lúa thật; không thử phát thẻ thật nếu chưa chuẩn bị mã chưa sử dụng. Có thể để tính năng **Tạm tắt** trong khi kiểm tra; các yêu cầu đã nhận vẫn xử lý được.

## Giới hạn và lưu ý bảo mật

- Đây là **thẻ cào điện thoại trả trước** Viettel, VinaPhone, MobiFone. Không có kết nối API tự động với nhà mạng.
- Mã thẻ thật không nên được chia sẻ với người khác; bất kỳ ai biết mã nạp có thể dùng nó.
- Không sử dụng thẻ đã dùng hoặc nhập sai mã; nếu chưa có mã thật, hãy **giữ ở Đã duyệt hoặc Từ chối và hoàn Lúa**, không đánh dấu phát.
- Không bật nếu chưa có nguồn thẻ, tỷ giá và chính sách đổi thưởng. **Mặc định tắt**.
- Tài khoản tạm khóa không thể được duyệt/phát thẻ.
- D1 chứa ciphertext; tuy nhiên khi một thành viên truy cập tài khoản của chính họ, mã thẻ đã phát có thể được mở để đọc.
- Bảng `wallet_entries` ghi riêng `card_redemption_hold` và `card_redemption_refund`, giữ lịch sử và chống trả Lúa trùng.
- Ghi nhận đổi thẻ không phải thanh toán tự động và không xác nhận Admin có sẵn thẻ trong kho.
- Cần kiểm tra quy định nhà mạng và pháp luật áp dụng trước khi mở dịch vụ đại chúng.

**Mã nguồn GitHub không đồng nghĩa website Cloudflare đã chạy bản mới.** Trước khi bật phải kiểm tra Worker đã deploy và migration đã chạy.
