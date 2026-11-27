// Configurable GET/JSON link providers. Credentials stay in Cloudflare secrets.
const slugPattern=/^[a-z][a-z0-9_]{1,31}$/;
const aliasPattern=/^[A-Za-z0-9_-]{1,128}$/;
const pathPattern=/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const forbidden=new Set(['__proto__','prototype','constructor']);
const readText=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
export const SOURCE_PREFIX='link_source_config:';
export const TASK_SOURCE_PREFIX='link_source_task:';
export const ATTEMPT_SOURCE_PREFIX='link_source_attempt:';
export function secretName(id){if(!slugPattern.test(id))throw Error('Mã nguồn không hợp lệ');return 'LINK_PROVIDER_TOKEN_'+id.toUpperCase();}
function domain(v){
  if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i.test(v)||/\.(?:local|internal|localhost|test|invalid|example|onion|home|lan)$/i.test(v))
    throw Error('Tên miền API phải là tên miền HTTPS công khai');
  return v.toLowerCase();
}
function template(value,host,required){
  if(!value)return '';
  if(!value.includes('{'+required+'}'))throw Error('API cần biến {'+required+'}');
  const sample=value.replace(/\{(?:destination|alias|token)\}/g,'placeholder');
  if(/[{}]/.test(sample))throw Error('Biến API không được hỗ trợ');
  const u=new URL(sample);
  const authority=/^https:\/\/([^/?#]+)/i.exec(value)?.[1]||'';
  if(/[{}]/.test(authority)||u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password||u.hash)
    throw Error('API phải dùng HTTPS đúng tên miền đã cấu hình');
  for(const [key,val] of u.searchParams)if(/^(api|token|api_key|apikey|key|access_token|secret)$/i.test(key)&&val!=='placeholder')
    throw Error('Không dán token thật vào URL; dùng {token}');
  return value;
}
function jsonPath(v){
  if(v&&(!pathPattern.test(v)||v.split('.').some(k=>forbidden.has(k))))throw Error('Đường dẫn JSON không hợp lệ');
  return v;
}
export function normalizeSource(b){
  const id=readText(b.id,32).toLowerCase();
  if(!slugPattern.test(id))throw Error('Mã nguồn: 2–32 chữ thường, số hoặc gạch dưới');
  const name=readText(b.name,80);
  if(name.length<2)throw Error('Nhập tên nhà cung cấp');
  const host=domain(readText(b.host,253)),short_host=domain(readText(b.short_host,253)||host);
  const create_url=template(readText(b.create_url,1500),host,'destination');
  const view_url=template(readText(b.view_url,1500),host,'alias');
  const short_path=jsonPath(readText(b.short_path,180)),alias_path=jsonPath(readText(b.alias_path,180)),view_path=jsonPath(readText(b.view_path,180));
  if(create_url&&!short_path)throw Error('Nhập trường JSON chứa link rút gọn');
  if(view_url.includes('{destination}')||create_url.includes('{alias}'))throw Error('Biến API không đúng loại');
  // The diagnostic never approves rewards. Paid semantics still need independent reconciliation.
  return {id,name,host,short_host,create_url,short_path,alias_path,view_url,view_path,paid_confirmed:false};
}
export function valueAt(data,path){
  if(!path)return undefined;
  for(const k of path.split('.')){
    if(forbidden.has(k)||data===null||typeof data!=='object'||!Object.hasOwn(data,k))return undefined;
    data=data[k];
  }
  return data;
}
function requestUrl(source,kind,values,token){
  const tpl=kind==='create'?source.create_url:source.view_url;
  if(!tpl)throw Error('Chưa cấu hình API '+kind);
  if(tpl.includes('{token}')&&!token)throw Error('Chưa cài Secret '+secretName(source.id));
  return tpl.replace(/\{(destination|alias|token)\}/g,(_,k)=>encodeURIComponent(k==='token'?token:values[k]||''));
}
async function getJson(source,kind,values,token,fetcher){
  const response=await fetcher(requestUrl(source,kind,values,token),{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
  if(!response.ok||!/\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type')||''))throw Error('API không trả JSON thành công');
  const reader=response.body?.getReader();
  if(!reader)throw Error('API không trả dữ liệu');
  let size=0,raw='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('JSON quá lớn');raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return JSON.parse(raw);
}
export async function createSourceLink(source,destination,token,fetcher=fetch){
  const data=await getJson(source,'create',{destination},token,fetcher);
  const link=valueAt(data,source.short_path);
  if(typeof link!=='string'||link.length>700||(token&&link.includes(token)))throw Error('Link trả về không hợp lệ');
  const u=new URL(link);
  if(u.protocol!=='https:'||u.hostname!==source.short_host||u.port||u.username||u.password||u.hash)throw Error('Link trả về khác tên miền cấu hình');
  const alias=source.alias_path?valueAt(data,source.alias_path):u.pathname.split('/').filter(Boolean).pop();
  if(typeof alias!=='string'||!aliasPattern.test(alias)||(token&&alias.includes(token)))throw Error('Alias trả về không hợp lệ');
  return {alias,shortUrl:u.href};
}
export async function checkSourceView(source,alias,token,fetcher=fetch){
  if(typeof alias!=='string'||!aliasPattern.test(alias))throw Error('Alias không hợp lệ');
  if(!source.view_path)throw Error('Chưa cấu hình trường JSON chứa view');
  const data=await getJson(source,'view',{alias},token,fetcher);
  const n=valueAt(data,source.view_path);
  const v=typeof n==='string'&&/^\d+$/.test(n)?Number(n):n;
  if(!Number.isSafeInteger(v)||v<0)throw Error('API không trả số lượt hợp lệ theo trường đã chọn');
  return v;
}
export async function settingValue(env,key){
  const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
  return row?JSON.parse(row.value):null;
}
export async function getSource(env,id){
  if(!slugPattern.test(id))return null;
  const stored=await settingValue(env,SOURCE_PREFIX+id);
  return stored?normalizeSource(stored):null;
}
export function sourceToken(env,source){return typeof env[secretName(source.id)]==='string'?env[secretName(source.id)]:'';}
export function sourceReady(env,source){
  return Boolean(source?.create_url&&source.short_path&&(!source.create_url.includes('{token}')||sourceToken(env,source)));
}
export function presentSource(env,source){return {...source,secret_name:secretName(source.id),token_configured:Boolean(sourceToken(env,source)),create_ready:sourceReady(env,source)};}
export function taskSourceConfig(body,category){
  if(category!=='link')return {id:'',creation:'manual',verification:'manual'};
  const id=readText(body.link_source_id,32),creation=body.link_source_creation||'manual',verification=body.link_source_verification||'manual';
  if(id&&!slugPattern.test(id)||!['manual','api'].includes(creation)||!['manual','api_view'].includes(verification)||(!id&&creation==='api')||(verification==='api_view'&&creation!=='api'))throw Error('Cấu hình nguồn rút gọn không hợp lệ');
  return {id,creation,verification};
}
export async function validateTaskSource(env,body,category){
  const config=taskSourceConfig(body,category);
  if(!config.id)return config;
  const source=await getSource(env,config.id);
  if(!source)throw Error('Không tìm thấy nguồn rút gọn');
  if(config.creation==='api'&&body.is_active){
    if(body.review_mode!=='manual'||!sourceReady(env,source))throw Error('Chưa kết nối API tạo link; chọn Tắt / nháp');
    if(config.verification==='api_view'&&(!source.view_url||!source.view_path))throw Error('Chưa cấu hình API kiểm tra view');
  }
  return config;
}
export async function getTaskSource(env,taskId){return await settingValue(env,TASK_SOURCE_PREFIX+taskId)||{id:'',creation:'manual',verification:'manual'};}
export async function getAttemptSource(env,attemptId){return settingValue(env,ATTEMPT_SOURCE_PREFIX+attemptId);}
