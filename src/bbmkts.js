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
