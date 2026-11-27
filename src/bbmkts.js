// BBMKTS integration foundation. No undocumented endpoints, secrets or payouts.
export function bbmktsChartUrl(alias) {
  if (typeof alias !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(alias))
    throw new Error('Alias BBMKTS không hợp lệ');
  return 'https://bbmkts.com/site/link/chart/' + encodeURIComponent(alias);
}

// The provider adapter must be implemented from the official API contract.
// Never call this with a client-supplied adapter or an arbitrary provider URL.
export async function createBbmktsSessionLink({ attemptId, destination, createLink }) {
  if (!/^[a-f0-9-]{36}$/i.test(String(attemptId))) throw new Error('Phiên không hợp lệ');
  const target = new URL(destination);
  if (target.protocol !== 'https:' || target.username || target.password)
    throw new Error('Trang đích phải dùng HTTPS');
  if (typeof createLink !== 'function') throw new Error('Chưa cấu hình API BBMKTS');
  const result = await createLink({ attemptId, destination: target.href });
  const chartUrl = bbmktsChartUrl(result?.alias);
  const short = new URL(result?.shortUrl);
  if (short.protocol !== 'https:' || short.username || short.password)
    throw new Error('Link rút gọn không hợp lệ');
  return { attemptId, alias: result.alias, shortUrl: short.href, chartUrl };
}

// Fail closed. A view alone must never approve or credit a wallet.
export function bbmktsReviewState({ views, paidMetricConfirmed = false, captchaPassed = false } = {}) {
  if (!Number.isSafeInteger(views) || views < 0) return 'stats_unavailable';
  if (!captchaPassed) return 'awaiting_return';
  if (!paidMetricConfirmed) return 'manual_review';
  if (views === 0) return 'awaiting_views';
  if (views !== 1) return 'manual_review';
  return 'eligible_for_review';
}

// Public read-only API documented by BBMKTS on 2026-11-27.
export function bbmktsViewApiUrl(alias) {
  bbmktsChartUrl(alias);
  return 'https://bbmkts.com/api/link/chart/' + encodeURIComponent(alias);
}

// Until the actual JSON schema and paid-view semantics are confirmed,
// return the provider's JSON as diagnostic data, never as a reward decision.
export async function fetchBbmktsViewJson(alias, fetcher = fetch) {
  const endpoint = bbmktsViewApiUrl(alias);
  const response = await fetcher(endpoint, {
    method: 'GET', redirect: 'error', cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('BBMKTS HTTP ' + response.status);
  if (!/\bapplication\/(?:[a-z0-9.+-]+\+)?json\b/i.test(response.headers.get('content-type') || ''))
    throw new Error('BBMKTS không trả JSON');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('BBMKTS không trả dữ liệu');
  const decoder = new TextDecoder();
  let bytes = 0, raw = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) throw new Error('Dữ liệu BBMKTS vượt giới hạn');
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const data = JSON.parse(raw);
  if (data === null || typeof data !== 'object') throw new Error('JSON BBMKTS không hợp lệ');
  return { alias, endpoint, data };
}

// Per-task draft configuration. It deliberately cannot enable a live provider
// until the creation and paid-view contracts are implemented and tested.
export function bbmktsTaskConfig(body, category) {
  if (category !== 'link') return { creation: 'manual', verification: 'manual' };
  const creation = body.bbmkts_creation ?? 'manual';
  const verification = body.bbmkts_verification ?? 'manual';
  if (!['manual','quicklink','developer'].includes(creation) ||
      !['manual','api_view'].includes(verification))
    throw new Error('Cấu hình BBMKTS không hợp lệ.');
  if (verification === 'api_view' && creation === 'manual')
    throw new Error('Xác minh qua API yêu cầu link riêng cho từng phiên.');
  if ((creation !== 'manual' || verification !== 'manual') &&
      (body.is_active || body.review_mode !== 'manual'))
    throw new Error('BBMKTS chưa kết nối hoàn chỉnh: chỉ được lưu Tắt / nháp và duyệt thủ công thực tế.');
  return { creation, verification };
}
