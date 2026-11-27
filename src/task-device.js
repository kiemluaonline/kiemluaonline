// Device information is taken from the HTTP User-Agent, NOT a hardware ID.
// It can be changed/spoofed and must only assist manual provider reconciliation.
export const UNKNOWN_DEVICE = 'Chưa ghi nhận';

// Model is optional browser-reported information, not the owner's device name.
function androidModel(ua, hint) {
  const clean = value => {
    const s = String(value || '').trim().replace(/^"|"$/g, '').trim();
    if (!s || s.length > 64 || /^(?:K|Unknown|Android|Mobile|wv|Linux|U)$/i.test(s)
      || !/^[\p{L}\p{N}][\p{L}\p{N} ._+()\-]{1,63}$/u.test(s)) return '';
    return s;
  };
  const supplied = clean(hint);
  if (supplied) return supplied;
  const match = ua.match(/Android(?:\s+[\d.]+)?;\s*([^;)]+)/i);
  return clean((match?.[1] || '').split(/\s+Build\//i)[0]);
}

export function taskDeviceLabel(userAgent, modelHint = '') {
  const ua = String(userAgent || '').slice(0, 400);
  if (!ua) return UNKNOWN_DEVICE;
  let device = /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
    : /iPod/i.test(ua) ? 'iPod'
    : /Android/i.test(ua) ? (/Mobile/i.test(ua) ? 'Điện thoại Android' : 'Máy tính bảng Android')
    : /Windows/i.test(ua) ? 'Máy tính Windows'
    : /Macintosh|Mac OS X/i.test(ua) ? 'Máy Mac'
    : /Linux/i.test(ua) ? 'Máy Linux' : 'Thiết bị không rõ';
  if (/Android/i.test(ua)) {
    const model = androidModel(ua, modelHint);
    if (model) device += ' (' + model + ')';
  }
  const browser = /EdgiOS\/|EdgA\/|Edg\//i.test(ua) ? 'Edge'
    : /SamsungBrowser\//i.test(ua) ? 'Samsung Internet'
    : /CriOS\/|Chrome\//i.test(ua) ? 'Chrome'
    : /FxiOS\/|Firefox\//i.test(ua) ? 'Firefox'
    : /OPiOS\/|OPR\//i.test(ua) ? 'Opera'
    : /Safari\//i.test(ua) ? 'Safari' : 'Trình duyệt không rõ';
  return device + ' · ' + browser;
}

export function taskDeviceEventDetail(attemptId, userAgent, modelHint = '') {
  if (!/^[a-f0-9-]{36}$/i.test(String(attemptId))) throw new Error('Invalid attempt ID');
  return attemptId + '|' + taskDeviceLabel(userAgent, modelHint);
}

// Used on Admin-only review records; legacy records are never guessed/backfilled.
export function attachTaskDeviceAudit(reviews, events) {
  const byAttempt = new Map();
  for (const item of events || []) {
    const detail = String(item.detail || '');
    const attemptId = detail.slice(0, 36);
    if (!/^[a-f0-9-]{36}$/i.test(attemptId) || detail.charAt(36) !== '|') continue;
    const field = item.event_type === 'task_device_start' ? 'started_device'
      : item.event_type === 'task_device_submit' ? 'submitted_device' : null;
    if (!field) continue;
    if (!byAttempt.has(attemptId)) byAttempt.set(attemptId, {});
    const entry = byAttempt.get(attemptId);
    // Events are ordered newest first. Keep only the most recent one per stage.
    if (!entry[field]) entry[field] = detail.slice(37, 150) || UNKNOWN_DEVICE;
  }
  return reviews.map(c => {
    const audit = byAttempt.get(String(c.attempt_id || '')) || {};
    return {
      ...c, started_device: audit.started_device || UNKNOWN_DEVICE,
      submitted_device: audit.submitted_device || UNKNOWN_DEVICE,
      submitted_at: c.created_at || null,
      submitted_ip: c.ip || '',
      started_at: c.started_at || null,
      started_ip: c.started_ip || ''
    };
  });
}
