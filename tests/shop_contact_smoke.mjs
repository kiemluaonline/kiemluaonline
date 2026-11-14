import assert from 'node:assert/strict';
import { normalizeZaloContact } from '../src/shop.js';

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
