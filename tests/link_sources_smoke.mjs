import assert from 'node:assert/strict';
import {normalizeSource,createSourceLink,checkSourceView,taskSourceConfig,secretName,valueAt,SourceDiagnosticError,sourceToken} from '../src/link-sources.js';
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
