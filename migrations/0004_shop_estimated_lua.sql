-- Bổ sung Lúa dự kiến cho đơn TikTok Shop đang Tạm duyệt – Chờ giải quyết.
-- Chỉ thêm cột, không sửa nhiệm vụ, ví Lúa hay lịch sử rút tiền.
-- YÊU CẦU: shop_orders đã tồn tại từ migration 0003.
ALTER TABLE shop_orders
ADD COLUMN estimated_reward_lua INTEGER NOT NULL DEFAULT 0
CHECK(estimated_reward_lua BETWEEN 0 AND 10000000);
