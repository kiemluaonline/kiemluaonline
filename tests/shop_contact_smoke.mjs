import assert from 'node:assert/strict';
import { normalizeZaloContact, normalizeShopShowcaseURL } from '../src/shop.js';

const qr='https://zaloapp.com/qr/p/1u0tai574hblm?src=qr';
assert.equal(normalizeZaloContact(qr),qr);
assert.equal(normalizeZaloContact('https://zaloapp.com/qr/p/1u0tai574hblm'), 'https://zaloapp.com/qr/p/1u0tai574hblm');
assert.equal(normalizeZaloContact('0912345678'),'https://zalo.me/0912345678');
assert.equal(normalizeZaloContact('https://zalo.me/0912345678'),'https://zalo.me/0912345678');
assert.equal(normalizeZaloContact(''),'');
for(const link of [
 'https://fakezaloapp.com/qr/p/abc',
 'https://zaloapp.com.evil.example/qr/p/abc',
 'http://zaloapp.com/qr/p/abc',
 'https://zaloapp.com/anything',
 'https://zaloapp.com/qr/p/abc?redirect=https://evil.example',
 'https://evil.example',
 'javascript:alert(1)',
 'https://zaloapp.com/qr/p/abc#junk',
 'https://user:pass@zaloapp.com/qr/p/abc'
]) assert.equal(normalizeZaloContact(link),null,link);
console.log('PASS: Zalo QR / phone / URL validation');

const showcaseLinks=[
 'https://www.tiktok.com/@admin.shop',
 'https://www.tiktok.com/@admin.shop/shop?tab=products',
 'https://vt.tiktok.com/ZSK123456/',
 'https://shop.tiktok.com/example',
 'https://www.tiktokshop.com/seller/123'
];
for(const url of showcaseLinks)assert.equal(normalizeShopShowcaseURL(url),url);
assert.equal(normalizeShopShowcaseURL(''),'');
for(const url of [
 'https://not-tiktok.com/@user','https://tiktok.com.evil.example/shop',
 'http://www.tiktok.com/@user','javascript:alert(1)',
 'https://attacker@www.tiktok.com/@user','https://www.tiktok.com/',
 'https://www.tiktok.com:8080/@user'
])assert.equal(normalizeShopShowcaseURL(url),null,url);
console.log('PASS: Only HTTPS TikTok showcase links are allowed; other domains blocked.');
