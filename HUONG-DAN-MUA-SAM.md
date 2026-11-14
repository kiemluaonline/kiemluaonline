# Trạm Có Lúa — Mua sắm nhận Lúa (TikTok Shop Affiliate)

## Đã có trong mã nguồn
- Thành viên: mục **Mua sắm nhận Lúa**, gian hàng theo danh mục, link TikTok Shop Affiliate, yêu cầu sản phẩm bằng Zalo/Telegram và danh sách trạng thái yêu cầu.
- Admin: **Quản lý mua sắm**, thêm/sửa/ẩn sản phẩm, cấu hình Zalo/Telegram, chọn yêu cầu rồi nhấn **Đã có sản phẩm**.
- Khi Admin nhấn **Đã có sản phẩm**, thành viên nhìn thấy thông báo trong trang Tổng quan, menu và danh sách yêu cầu của mình. Không cần Admin nhắn lại.
- Ảnh do khách gửi chỉ gửi qua Zalo hoặc Telegram, không tải lên website.
- Không có giá bán, tỷ lệ chia, hoa hồng hoặc doanh thu trong giao diện thành viên.
- **Không tự động duyệt đơn hàng và không cộng Lúa**. Chưa có kết nối TikTok Shop xác minh đơn hàng; phần này phải được triển khai, kiểm tra điều khoản Affiliate và đối chiếu trước khi bật thưởng.

## Cần thực hiện trên Cloudflare trước khi dùng thật
Các thay đổi đã được lưu trong GitHub, **không đồng nghĩa Cloudflare đang chạy bản mới**.

1. Sao lưu cơ sở dữ liệu D1 đang hoạt động.
2. Vào Cloudflare Dashboard → Storage & databases → D1 → chọn `tram-lua-db` → Console.
3. Mở file [migrations/0002_shop.sql](https://github.com/kiemluaonline/kiemluaonline/blob/main/migrations/0002_shop.sql) trên GitHub, sao chép toàn bộ nội dung SQL, dán vào D1 Console và chạy **một lần**.
   - Nếu bạn dùng Wrangler, có thể dùng `npx wrangler d1 migrations apply tram-lua-db --remote` từ môi trường triển khai đã đăng nhập đúng tài khoản.
4. Triển khai bản mã nguồn GitHub main mới lên Cloudflare Worker `tram-lua` bằng quy trình deploy đang dùng. Nếu dự án có cấu hình Git integration auto deploy, kiểm tra trạng thái build/deploy; không mặc định đã tự deploy.
5. Đăng nhập Admin → **Quản lý mua sắm** → nhập link Zalo và Telegram; lưu.
6. Thêm sản phẩm có link TikTok Shop Affiliate hợp lệ → Bật hiển thị.
7. Dùng tài khoản thành viên khác để thử: **Yêu cầu sản phẩm** → chọn Zalo/Telegram → sao chép mã SP gửi cùng ảnh/link → Admin ghép mã, chọn sản phẩm, nhấn **Đã có sản phẩm** → kiểm tra thông báo trên tài khoản thành viên.

## Bổ sung: Báo đơn TikTok, lịch sử và thưởng Lúa (migration 0003)

**Chưa tự động lấy đơn từ TikTok.** Khách phải nhấn **Báo đã đặt hàng** trên thẻ sản phẩm để nhập mã đơn TikTok Shop. Chỉ báo mã đơn không phải xác thực. Admin phải tìm và đối chiếu đơn trong **Đơn hàng tiếp thị liên kết** trên TikTok.

Trạng thái hiển thị đúng:
1. **Chờ xác minh**: khách mới gửi mã đơn. Không cộng Lúa.
2. **Tạm duyệt – Chờ giải quyết**: Admin tìm thấy đúng ID đơn hàng và sản phẩm; hàng có thể chưa giao hoặc chưa thanh toán. Lúa dự kiến chưa cộng ví.
3. **Đã giải quyết**: Admin đã kiểm tra đơn đã giao, thanh toán, không hoàn/hủy và hoa hồng đã được TikTok quyết toán; Admin chỉ nhập **Lúa chính thức** và ghi ví một lần. Không yêu cầu nhập tiền hoa hồng TikTok.
4. **Từ chối**: đơn hủy, hoàn trả hoặc không đủ điều kiện; không cộng Lúa.

### Lúa dự kiến khi Tạm duyệt – Chờ giải quyết (migration 0004)
- Sau khi Admin kiểm tra ID đơn và sản phẩm trùng khớp, nhập số Lúa **dự kiến nhận** (ví dụ: 2.000) rồi tạm duyệt; ghi chú kiểm tra là câu mặc định có sẵn, Admin không cần gõ. Có thể chỉnh Lúa dự kiến ở đơn đang tạm duyệt, không ảnh hưởng ví.
- Thành viên chỉ nhìn thấy `🌾 Lúa dự kiến nhận ~ 2.000` ở trạng thái **Tạm duyệt – Chờ giải quyết**, kèm câu: **Số Lúa trên chỉ là dự kiến, có thể tăng hoặc giảm tùy theo kết quả giải quyết đơn hàng. Lúa chính thức chỉ được cập nhật sau khi đối soát hoàn tất. Đơn không đủ điều kiện sẽ không được nhận thưởng.**
- Lúa dự kiến **không cộng vào ví**, không hiển thị hoa hồng thực tế, tỷ lệ chia hoặc số tiền Admin nhận.
- Sau khi TikTok quyết toán và Admin đối chiếu, chỉ số Lúa **thực tế** mới được ghi vào ví đúng một lần. Nếu đơn bị từ chối, không phát Lúa.
- Trước khi dùng bản cập nhật này, **sao lưu D1**, chạy [migrations/0004_shop_estimated_lua.sql](https://github.com/kiemluaonline/kiemluaonline/blob/main/migrations/0004_shop_estimated_lua.sql) trong Console của **đúng** CSDL `tram-lua-db`, sau migration 0003. File 0004 chỉ dùng `ALTER TABLE shop_orders ADD COLUMN`; không chạy nhiều lần.
- Việc commit vào GitHub không có nghĩa bản mới đã triển khai trên Cloudflare. Kiểm tra deployment trước khi kiểm thử tài khoản thật.

Thành viên có menu **Đơn hàng & Lúa**, theo dõi tiến độ, thông báo đổi trạng thái và tổng Lúa nhận từ mua sắm.
Admin có menu **Duyệt đơn TikTok**. Admin nhập mã đơn đã đối chiếu, số Lúa chính thức và xác nhận điều kiện trước khi cộng Lúa. Không nhập/lưu mới số tiền hoa hồng hoặc tính phần trăm chia khách. Các cột dữ liệu cũ về hoa hồng vẫn được giữ nguyên trong D1 để tránh làm mất lịch sử.

### Bật chức năng mới trên Cloudflare D1

Trước khi truy cập hai menu đơn hàng mới, **sao lưu D1** đang hoạt động.
Vào Dashboard Cloudflare → D1 → chọn đúng `tram-lua-db` → Console.
Sao chép toàn bộ SQL của [migrations/0003_shop_orders.sql](https://github.com/kiemluaonline/kiemluaonline/blob/main/migrations/0003_shop_orders.sql), dán vào D1 Console rồi Execute một lần.
Migration dùng `CREATE TABLE IF NOT EXISTS`, chỉ bổ sung các bảng `shop_orders`, `shop_order_events` và index; không xóa các bảng hay lịch sử cũ.
Sau đó kiểm tra bản Worker GitHub mới nhất đã deploy lên Cloudflare. Không mặc định một lần commit đồng nghĩa đã triển khai.
Lưu ý: Các bảng thuộc migration 0002 vẫn cần tồn tại (đã kích hoạt ở bước mua sắm trước).

**Mua sắm nhận Lúa:** Admin chọn số Lúa thưởng trực tiếp, không bắt buộc nhập số hoa hồng, không có công thức chia phần trăm và không dùng `lua_per_vnd` để giới hạn thưởng đơn hàng. Tỷ giá `lua_per_vnd` vẫn tồn tại trong **Cài đặt** và được dùng cho phần rút tiền theo quy tắc cũ; không được xóa hoặc sửa. Admin phải tự bảo đảm số Lúa thưởng phù hợp với ngân sách; hệ thống vẫn giới hạn tối đa 10 triệu Lúa cho một đơn và chống cộng trùng.

**Không dùng mã đơn do khách tự điền làm bằng chứng duy nhất.** Nếu chưa thể đối chiếu chính xác mã đơn với dữ liệu Affiliate trong TikTok, tiếp tục để Chờ xác minh hoặc Tạm duyệt; không ghi thưởng. Khách không tải ảnh lên website.
Cần kiểm tra chính sách TikTok Shop và điều kiện chương trình trước khi phát thưởng thực tế.

## Vận hành an toàn
- Khách gửi mã SP cùng ảnh hoặc liên kết trong ứng dụng nhắn tin. Trên web chỉ lưu mã, mô tả, kênh và trạng thái.
- Yêu cầu **tìm sản phẩm** không giới hạn số lượt/ngày và số yêu cầu đang chờ; Admin vẫn đối chiếu mã SP với cuộc trò chuyện trước khi đánh dấu có sản phẩm. Quy tắc và giới hạn nhiệm vụ Link/App/Video không thay đổi.
- Mỗi yêu cầu chuyển từ Chờ xử lý sang Đã có sản phẩm hoặc Không tìm thấy một lần.
- Admin không nên đánh dấu khi chưa tìm được đúng sản phẩm, chưa có liên kết Affiliate hoặc sản phẩm chưa được bật.
- Nút mua hàng dẫn khách tới TikTok Shop bên ngoài. Hệ thống **chưa** chứng minh được khách đó đã mua, nhận hàng, thanh toán hay bạn đã được giải quyết hoa hồng.
- Các giới hạn và chức năng nhiệm vụ/rút tiền hiện có không thay đổi.

## Kiểm tra tự động
GitHub Actions chạy `npm run check:google`, `npm run check` (có kiểm tra cú pháp hai module mua sắm), và `python3 tests/schema_check.py` (áp dụng SQL trong SQLite để kiểm tra bảng mới). Bài kiểm tra tự động không thay thế kiểm thử trên Cloudflare D1 thật.
