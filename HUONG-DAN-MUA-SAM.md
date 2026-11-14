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

## Vận hành an toàn
- Khách gửi mã SP cùng ảnh hoặc liên kết trong ứng dụng nhắn tin. Trên web chỉ lưu mã, mô tả, kênh và trạng thái.
- Một tài khoản gửi tối đa 5 yêu cầu/ngày; yêu cầu phải do Admin đối chiếu mã với cuộc trò chuyện trước khi đánh dấu có sản phẩm.
- Mỗi yêu cầu chuyển từ Chờ xử lý sang Đã có sản phẩm hoặc Không tìm thấy một lần.
- Admin không nên đánh dấu khi chưa tìm được đúng sản phẩm, chưa có liên kết Affiliate hoặc sản phẩm chưa được bật.
- Nút mua hàng dẫn khách tới TikTok Shop bên ngoài. Hệ thống **chưa** chứng minh được khách đó đã mua, nhận hàng, thanh toán hay bạn đã được giải quyết hoa hồng.
- Các giới hạn và chức năng nhiệm vụ/rút tiền hiện có không thay đổi.

## Kiểm tra tự động
GitHub Actions chạy `npm run check:google`, `npm run check` (có kiểm tra cú pháp hai module mua sắm), và `python3 tests/schema_check.py` (áp dụng SQL trong SQLite để kiểm tra bảng mới). Bài kiểm tra tự động không thay thế kiểm thử trên Cloudflare D1 thật.
