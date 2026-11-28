import assert from 'node:assert/strict';
import { checkLinkProxy, classifyProxy } from '../src/link-proxy.js';
const clean={is_proxy:false,is_vpn:false,is_tor:false};
for(const [value,reason] of [[clean,'clear'],[{...clean,is_proxy:true},'proxy'],[{...clean,is_vpn:true},'vpn'],[{...clean,is_vpn:1},'vpn'],[{...clean,is_tor:true},'tor'],[{error:'quota'},'invalid_response'],[{is_proxy:false},'invalid_response'],[{...clean,error_code:429},'invalid_response']])assert.equal(classifyProxy(value).reason,reason);
assert.equal(classifyProxy({...clean,is_abuser:true,is_datacenter:true}).status,'clear','Other signals alone do not establish VPN or proxy');
let calls=0,now=100000;
const mock=async(url,options)=>{calls++;assert.equal(url,'https://api.ipapi.is/');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{q:'2001:db8::1',key:'test-key'});assert.equal(options.redirect,'manual');return {ok:true,json:async()=>clean};};
assert.equal((await checkLinkProxy('test-key','2001:db8::1',mock,()=>now)).status,'clear');
assert.equal((await checkLinkProxy('test-key','2001:db8::1',mock,()=>now)).cached,true);
assert.equal(calls,1);now+=60001;
await checkLinkProxy('test-key','2001:db8::1',mock,()=>now);assert.equal(calls,2);
assert.equal((await checkLinkProxy('','2001:db8::1',mock)).reason,'missing_key');
assert.equal((await checkLinkProxy('test-key','unknown',mock)).reason,'missing_ip');
assert.equal((await checkLinkProxy('test-key','192.0.2.1',async()=>({ok:false}))).status,'unavailable');
assert.equal((await checkLinkProxy('test-key','192.0.2.2',async()=>{throw Error('test');})).status,'unavailable');
console.log('PASS: ipapi.is classification, POST authentication, cache and fail-closed errors (mock only).');

// Diagnostic must make a real fresh call even when the task cache is populated.
let diagnosticCalls=0;
const diagnosticMock=async()=>({ok:true,status:200,json:async()=>({...clean,is_vpn:++diagnosticCalls===2})});
assert.equal((await checkLinkProxy('test-key','192.0.2.100',diagnosticMock,()=>1000)).status,'clear');
const diagnostic=await checkLinkProxy('test-key','192.0.2.100',diagnosticMock,()=>1000,{fresh:true});
assert.equal(diagnostic.status,'blocked');assert.equal(diagnostic.http_status,200);
assert.equal((await checkLinkProxy('test-key','192.0.2.100',diagnosticMock,()=>1000)).status,'clear');
assert.equal(diagnosticCalls,2);
assert.equal((await checkLinkProxy('test-key','192.0.2.100',async()=>({ok:false,status:429}),()=>1000,{fresh:true})).http_status,429);

// Workers accepts manual redirects, not redirect:error. Never forward the secret to a redirect target.
for(const [status,reason] of [[302,'unexpected_redirect'],[401,'auth_error'],[403,'auth_error'],[429,'rate_limit'],[500,'service_error']]){
 let calls=0;
 const result=await checkLinkProxy('test-key','192.0.2.101',async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return {ok:false,status};},()=>1000,{fresh:true});
 assert.equal(result.status,'unavailable');assert.equal(result.reason,reason);assert.equal(result.http_status,status);assert.equal(calls,1);
}
assert.equal((await checkLinkProxy('test-key','192.0.2.102',async()=>{throw Error('fixture');},()=>1000,{fresh:true})).reason,'network_error');
