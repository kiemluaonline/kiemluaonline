import assert from 'node:assert/strict';
import { taskDeviceLabel, taskDeviceEventDetail, attachTaskDeviceAudit, UNKNOWN_DEVICE } from '../src/task-device.js';

const id='12345678-1234-4123-8123-123456789abc';
assert.equal(taskDeviceLabel(''), UNKNOWN_DEVICE);
assert.equal(taskDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
assert.equal(taskDeviceLabel('Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/136 Mobile/15E148 Safari/604.1'), 'iPad · Chrome');
assert.equal(taskDeviceLabel('Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36'), 'Điện thoại Android (Pixel 8 Pro) · Chrome');
assert.equal(taskDeviceLabel('Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 SamsungBrowser/25 Safari/537.36'), 'Máy tính bảng Android (SM-X910) · Samsung Internet');
assert.equal(taskDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/134 Safari/537.36'), 'Máy tính Windows · Edge');
assert.equal(taskDeviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17 Safari/605.1.15'), 'Máy Mac · Safari');
assert.equal(taskDeviceEventDetail(id, 'Mozilla/5.0 (iPhone) Safari/604.1'), id+'|iPhone · Safari');
assert.throws(()=>taskDeviceEventDetail('bad','x'),/Invalid attempt ID/);
// Server-derived, fixed labels must not render arbitrary supplied HTML.
assert.doesNotMatch(taskDeviceLabel('<img src=x onerror=alert(1)>'),/</);

const input=[
  { id:'new', attempt_id:id, started_at:'2026-11-18 01:00:00',
    started_ip:'203.0.113.9', ip:'203.0.113.9', created_at:'2026-11-18 01:02:00' },
  { id:'legacy', attempt_id:null, started_at:null, started_ip:null,
    ip:'203.0.113.10', created_at:'2026-11-17 01:02:00' }
];
const events=[
  { event_type:'task_device_submit',detail:id+'|iPhone · Safari' },
  { event_type:'task_device_start',detail:id+'|iPhone · Chrome' },
  { event_type:'task_device_start',detail:'invalid data' }
];
const output=attachTaskDeviceAudit(input,events);
assert.equal(output[0].started_device,'iPhone · Chrome');
assert.equal(output[0].submitted_device,'iPhone · Safari');
assert.equal(output[0].started_ip,'203.0.113.9');
assert.equal(output[0].submitted_ip,'203.0.113.9');
assert.equal(output[0].submitted_at,'2026-11-18 01:02:00');
assert.equal(output[1].started_device,UNKNOWN_DEVICE);
assert.equal(output[1].submitted_device,UNKNOWN_DEVICE);
assert.equal(output[1].started_at,null);
assert.equal(output[1].submitted_ip,'203.0.113.10');
console.log('PASS: device User-Agent labels, start/submit audit mapping and unmodified legacy history.');

assert.equal(taskDeviceLabel('Mozilla/5.0 (Linux; Android 10; K) Chrome/130 Mobile Safari/537.36'), 'Điện thoại Android · Chrome');
assert.equal(taskDeviceLabel('Mozilla/5.0 (Linux; Android 10; K) Chrome/130 Mobile Safari/537.36', '"CPH2525"'), 'Điện thoại Android (CPH2525) · Chrome');
assert.equal(taskDeviceLabel('Mozilla/5.0 (iPhone) Safari/604.1', '"iPhone 14 Pro Max"'), 'iPhone · Safari');
assert.doesNotMatch(taskDeviceLabel('Mozilla/5.0 (Linux; Android 10; K) Chrome/130 Mobile', '<img src=x>'), /</);
