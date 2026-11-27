import assert from 'node:assert/strict';
import {normalizeSource,createSourceLink,checkSourceView,taskSourceConfig,secretName,valueAt} from '../src/link-sources.js';
const source=normalizeSource({id:'trafficvn',name:'TrafficVN',host:'trafficvn.com',short_host:'trafficvn.com',create_url:'https://trafficvn.com/apidevelop?api={token}&url={destination}',short_path:'shortenedUrl',view_url:'https://trafficvn.com/api/views/{alias}',view_path:'data.views'});
assert.equal(secretName(source.id),'LINK_PROVIDER_TOKEN_TRAFFICVN');
const response=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
assert.deepEqual(await createSourceLink(source,'https://nhiemvu.click/?link_return=test','fake-secret',async(url,options)=>{
 assert.equal(new URL(url).searchParams.get('url'),'https://nhiemvu.click/?link_return=test');assert.equal(new URL(url).searchParams.get('api'),'fake-secret');assert.equal(options.redirect,'error');
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
