import assert from 'node:assert/strict';
import { bbmktsChartUrl, createBbmktsSessionLink, bbmktsReviewState, bbmktsViewApiUrl, fetchBbmktsViewJson, bbmktsTaskConfig } from '../src/bbmkts.js';
const attemptId = '12345678-1234-4123-8123-123456789abc';
assert.equal(bbmktsChartUrl('krjkB'), 'https://bbmkts.com/site/link/chart/krjkB');
assert.throws(()=>bbmktsChartUrl('../test'));
const result=await createBbmktsSessionLink({attemptId,destination:'https://example.test/return',createLink:async () => ({alias:'demo1',shortUrl:'https://example.test/demo1'})});
assert.equal(result.alias,'demo1');
assert.equal(result.attemptId,attemptId);
await assert.rejects(createBbmktsSessionLink({attemptId,destination:'https://example.test/return'}),/Chưa cấu hình/);
assert.equal(bbmktsReviewState({views:1,captchaPassed:true}),'manual_review');
assert.equal(bbmktsReviewState({views:0,captchaPassed:true,paidMetricConfirmed:true}),'awaiting_views');
assert.equal(bbmktsReviewState({views:1,captchaPassed:true,paidMetricConfirmed:true}),'eligible_for_review');
assert.equal(bbmktsReviewState({views:2,captchaPassed:true,paidMetricConfirmed:true}),'manual_review');
assert.equal(bbmktsReviewState({views:1,paidMetricConfirmed:true}),'awaiting_return');
assert.equal(bbmktsReviewState({views:null}),'stats_unavailable');
console.log('PASS: BBMKTS foundation (mock provider only, no wallet credit).');

assert.equal(bbmktsViewApiUrl('krjkB'),'https://bbmkts.com/api/link/chart/krjkB');
assert.throws(()=>bbmktsViewApiUrl('../wrong'));
const mockJson = { sample: [{ views: 1 }] }; // deliberately not assumed to be provider schema
const diagnostic = await fetchBbmktsViewJson('krjkB', async (url, options)=>{
  assert.equal(url,'https://bbmkts.com/api/link/chart/krjkB');
  assert.equal(options.redirect,'error');
  assert.equal(options.method,'GET');
  return new Response(JSON.stringify(mockJson),{headers:{'Content-Type':'application/json'}});
});
assert.deepEqual(diagnostic.data,mockJson);
await assert.rejects(fetchBbmktsViewJson('krjkB',async()=>new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}})),/không trả JSON/);
await assert.rejects(fetchBbmktsViewJson('krjkB',async()=>new Response('{}',{status:429,headers:{'Content-Type':'application/json'}})),/429/);
await assert.rejects(fetchBbmktsViewJson('krjkB',async()=>new Response(JSON.stringify({big:'a'.repeat(66000)}),{headers:{'Content-Type':'application/json'}})),/vượt giới hạn/);
console.log('PASS: BBMKTS read-only JSON endpoint, validation, size limits and failure handling.');

assert.deepEqual(bbmktsTaskConfig({},'link'),{creation:'manual',verification:'manual'});
assert.deepEqual(bbmktsTaskConfig({bbmkts_creation:'developer',bbmkts_verification:'api_view',review_mode:'manual',is_active:false},'link'),{creation:'developer',verification:'api_view'});
assert.throws(()=>bbmktsTaskConfig({bbmkts_creation:'quicklink',review_mode:'manual',is_active:true},'link'),/Tắt \/ nháp/);
assert.throws(()=>bbmktsTaskConfig({bbmkts_verification:'api_view',review_mode:'manual'},'link'),/link riêng/);
assert.throws(()=>bbmktsTaskConfig({bbmkts_creation:'invalid'},'link'),/không hợp lệ/);
console.log('PASS: BBMKTS draft-only task configuration and fail-closed activation.');
