import assert from 'node:assert/strict';
import {normalizeSource,createSourceLink,checkSourceView,taskSourceConfig,secretName,valueAt,SourceDiagnosticError,sourceToken,autoRewardEnabled,autoRewardEligible} from '../src/link-sources.js';
const source=normalizeSource({id:'trafficvn',name:'TrafficVN',host:'trafficvn.com',short_host:'trafficvn.com',create_url:'https://trafficvn.com/apidevelop?api={token}&url={destination}',short_path:'shortenedUrl',view_url:'https://trafficvn.com/api/views/{alias}',view_path:'data.views'});
assert.equal(secretName(source.id),'LINK_PROVIDER_TOKEN_TRAFFICVN');
const response=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
assert.deepEqual(await createSourceLink(source,'https://nhiemvu.click/?link_return=test','fake-secret',async(url,options)=>{
 assert.equal(new URL(url).searchParams.get('url'),'https://nhiemvu.click/?link_return=test');assert.equal(new URL(url).searchParams.get('api'),'fake-secret');assert.equal(options.redirect,'manual');
 return response({shortenedUrl:'https://trafficvn.com/links/test123'});
}),{alias:'test123',shortUrl:'https://trafficvn.com/links/test123'});
assert.equal(await checkSourceView(source,'test123','',async()=>response({data:{views:'1'}})),1);
await assert.rejects(checkSourceView(source,'test123','',async()=>response({data:{views:null}})));
await assert.rejects(createSourceLink(source,'https://nhiemvu.click/','fake-secret',async()=>response({shortenedUrl:'https://evil.com/test123'})));
assert.throws(()=>normalizeSource({...source,create_url:'https://127.0.0.1/?url={destination}'}));
assert.throws(()=>normalizeSource({...source,create_url:'https://trafficvn.com/?api=secret&url={destination}'}));
assert.throws(()=>taskSourceConfig({link_source_verification:'api_view'},'link'));
assert.equal(valueAt({},'constructor'),undefined);
console.log('PASS: configurable source GET JSON adapter, token handling, URL validation and mapped view metric.');

await assert.rejects(createSourceLink(source,'https://nhiemvu.click/','fake-secret',async()=>new Response('',{status:403})),e=>e instanceof SourceDiagnosticError&&e.message.includes('HTTP 403'));
await assert.rejects(createSourceLink(source,'https://nhiemvu.click/','fake-secret',async()=>response({status:'error',message:'fake-secret'})),e=>e instanceof SourceDiagnosticError&&!e.message.includes('fake-secret'));
await assert.rejects(createSourceLink(source,'https://nhiemvu.click/','fake-secret',async()=>response({unexpected:'fake-secret'})),e=>e instanceof SourceDiagnosticError&&e.message.includes('trường JSON')&&!e.message.includes('fake-secret'));
await assert.rejects(createSourceLink(source,'https://nhiemvu.click/','fake-secret',async()=>{throw Error('fake-secret');}),e=>e instanceof SourceDiagnosticError&&!e.message.includes('fake-secret'));
console.log('PASS: safe admin diagnostics never echo provider payload or credentials.');

// Cloudflare Workers only supports manual/follow. Never forward credentials on redirects.
assert.equal(sourceToken({LINK_PROVIDER_TOKEN_TRAFFICVN:'  fake-secret  '},source),'fake-secret');
let requests=0;
await assert.rejects(createSourceLink(source,'https://nhiemvu.click/','fake-secret',async(url,options)=>{requests++;assert.equal(options.redirect,'manual');assert.equal(new URL(url).searchParams.get('api'),'fake-secret');assert.equal(new URL(url).searchParams.get('url'),'https://nhiemvu.click/');assert.ok(!url.includes('{token}'));return new Response(null,{status:302,headers:{Location:'https://elsewhere.example/'}});}),/chuyển hướng HTTP 302/);
assert.equal(requests,1);
console.log('PASS: Workers-compatible fetch, substituted placeholders and blocked redirects.');

// Generic view arrays: synthetic fixtures, no provider-specific configuration.
const listSource=normalizeSource({...source,view_path:'data.chart.*.views'});
const chart=rows=>response({status:'success',data:{chart:rows}});
assert.equal(await checkSourceView(listSource,'demo1','',async()=>chart([{date:'2026-01-01',views:0},{date:'2026-01-02',views:2},{date:'2026-01-03',views:'3'}])),5);
assert.equal(await checkSourceView(listSource,'demo1','',async()=>chart([{views:0},{views:0}])),0);
for(const rows of [[],[{views:1},{}],[{views:-1}],[{views:1.5}],[{views:Number.MAX_SAFE_INTEGER},{views:1}]])await assert.rejects(checkSourceView(listSource,'demo1','',async()=>chart(rows)));
assert.throws(()=>normalizeSource({...source,view_path:'data.chart.*.__proto__'}));
assert.throws(()=>normalizeSource({...source,view_path:'data.*.chart.*.views'}));
assert.throws(()=>normalizeSource({...source,short_path:'data.chart.*.views'}));
console.log('PASS: generic view array aggregation, zero, missing values and overflow fail closed.');

assert.equal(autoRewardEnabled({},source),false);
assert.equal(autoRewardEnabled({LINK_PROVIDER_PAID_VIEW_CONFIRMED_TRAFFICVN:'confirmed'},source),true);
const valid={views:1,baseline:0,fastReturn:false,confirmed:true,unchanged:true};
assert.equal(autoRewardEligible(valid),true);
for(const x of [{views:0},{views:2},{views:null},{baseline:null},{baseline:1},{fastReturn:true},{confirmed:false},{unchanged:false}])assert.equal(autoRewardEligible({...valid,...x}),false);
