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
// A single wildcard in the view path sums an array of numeric values.
function viewPath(v){
  if(!v.includes('*'))return jsonPath(v);
  const parts=v.split('.*.');
  if(parts.length!==2||!parts[0]||!parts[1])throw Error('Đường dẫn tổng view cần dạng danh_sach.*.views');
  jsonPath(parts[0]);jsonPath(parts[1]);return v;
}
export function normalizeSource(b){
  const id=readText(b.id,32).toLowerCase();
  if(!slugPattern.test(id))throw Error('Mã nguồn: 2–32 chữ thường, số hoặc gạch dưới');
  const name=readText(b.name,80);
  if(name.length<2)throw Error('Nhập tên nhà cung cấp');
  const host=domain(readText(b.host,253)),short_host=domain(readText(b.short_host,253)||host);
  const create_url=template(readText(b.create_url,1500),host,'destination');
  const view_url=template(readText(b.view_url,1500),host,'alias');
  const short_path=jsonPath(readText(b.short_path,180)),alias_path=jsonPath(readText(b.alias_path,180)),view_path=viewPath(readText(b.view_path,180));
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
// Only fixed, locally authored messages may be displayed to admins.
export class SourceDiagnosticError extends Error {}
const diagnostic=(message)=>new SourceDiagnosticError(message);
function requestUrl(source,kind,values,token){
  const tpl=kind==='create'?source.create_url:source.view_url;
  if(!tpl)throw diagnostic(kind==='create'?'Chưa cấu hình API tạo link.':'Chưa cấu hình API kiểm tra view.');
  if(tpl.includes('{token}')&&!token)throw diagnostic('Chưa cài Secret cho nguồn này.');
  return tpl.replace(/\{(destination|alias|token)\}/g,(_,k)=>encodeURIComponent(k==='token'?token:values[k]||''));
}
async function getJson(source,kind,values,token,fetcher){
  const url=requestUrl(source,kind,values,token);
  let response;
  try{response=await fetcher(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});}
  catch(error){throw diagnostic(error?.name==='TimeoutError'||error?.name==='AbortError'?'API không phản hồi trong 8 giây.':'Không kết nối được API; kiểm tra đường dẫn và hỏi nhà cung cấp.');}
  if(response.status>=300&&response.status<400)throw diagnostic('API trả chuyển hướng HTTP '+Number(response.status)+'. Cần URL API trực tiếp; không chuyển tiếp Token.');
  if(!response.ok)throw diagnostic('API trả HTTP '+Number(response.status)+'. '+([401,403].includes(response.status)?'Kiểm tra Token hoặc quyền truy cập API.':'Kiểm tra đường dẫn và trạng thái nhà cung cấp.'));
  if(!/\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type')||''))throw diagnostic('API không khai báo Content-Type JSON. Kiểm tra có chọn Developer API JSON hay không.');
  const reader=response.body?.getReader();
  if(!reader)throw diagnostic('API không trả dữ liệu.');
  let size=0,raw='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw diagnostic('JSON vượt giới hạn 64 KB.');raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  let data;try{data=JSON.parse(raw);}catch{throw diagnostic('API trả nội dung không phải JSON hợp lệ.');}
  if(data?.status==='error'||data?.success===false)throw diagnostic('Nhà cung cấp báo lỗi trong JSON. Kiểm tra Token, URL đích và quyền tạo link.');
  return data;
}
export async function createSourceLink(source,destination,token,fetcher=fetch){
  const data=await getJson(source,'create',{destination},token,fetcher);
  const link=valueAt(data,source.short_path);
  if(typeof link!=='string')throw diagnostic('Không tìm thấy link trong trường JSON đã cấu hình. Kiểm tra tên trường chứa link, phân biệt chữ hoa và chữ thường.');
  if(link.length>700||(token&&link.includes(token)))throw diagnostic('Link trả về không hợp lệ.');
  let u;try{u=new URL(link);}catch{throw diagnostic('Trường JSON chứa link không phải URL hợp lệ.');}
  if(u.protocol!=='https:')throw diagnostic(u.protocol==='http:'?'API trả link HTTP, yêu cầu HTTPS.':'API trả link không dùng giao thức HTTPS.');
  if(u.username||u.password||u.port||u.hash)throw diagnostic('API trả URL có thông tin đăng nhập, cổng riêng hoặc fragment; không được phép.');
  if(u.hostname!==source.short_host){
    if(u.hostname==='www.'+source.short_host)throw diagnostic('API trả tên miền có www. ở đầu; kiểm tra tên miền link rút gọn thực tế.');
    if(source.short_host==='www.'+u.hostname)throw diagnostic('API trả tên miền không có www.; kiểm tra tên miền link rút gọn thực tế.');
    throw diagnostic('API trả tên miền khác tên miền link rút gọn đã cấu hình.');
  }
  const alias=source.alias_path?valueAt(data,source.alias_path):u.pathname.split('/').filter(Boolean).pop();
  if(typeof alias!=='string'||!aliasPattern.test(alias)||(token&&alias.includes(token)))throw diagnostic('Alias trả về không hợp lệ.');
  return {alias,shortUrl:u.href};
}
export async function checkSourceView(source,alias,token,fetcher=fetch){
  if(typeof alias!=='string'||!aliasPattern.test(alias))throw diagnostic('Alias không hợp lệ.');
  if(!source.view_path)throw diagnostic('Chưa cấu hình trường JSON chứa view.');
  const data=await getJson(source,'view',{alias},token,fetcher);
  return readViewCount(data,source.view_path);
}
// Sums only the rows returned by the API, not a lifetime total.
export function readViewCount(data,path){
  const count=n=>{
    const v=typeof n==='string'&&/^\d+$/.test(n)?Number(n):n;
    if(!Number.isSafeInteger(v)||v<0)throw diagnostic('API không trả số lượt hợp lệ theo trường đã chọn.');
    return v;
  };
  if(!path.includes('*'))return count(valueAt(data,path));
  viewPath(path);
  const [listPath,itemPath]=path.split('.*.');
  const rows=valueAt(data,listPath);
  if(!Array.isArray(rows)||!rows.length)throw diagnostic('API không trả danh sách view có dữ liệu.');
  let total=0;
  for(const row of rows){total+=count(valueAt(row,itemPath));if(!Number.isSafeInteger(total))throw diagnostic('Tổng view vượt giới hạn.');}
  return total;
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
export function sourceToken(env,source){return typeof env[secretName(source.id)]==='string'?env[secretName(source.id)].trim():'';}
export function sourceReady(env,source){
  return Boolean(source?.create_url&&source.short_path&&(!source.create_url.includes('{token}')||sourceToken(env,source)));
}
// Separate deployment gate. Never enabled merely by saving a provider or task.
export function autoRewardEnabled(env,source){
  return Boolean(source&&env['LINK_PROVIDER_PAID_VIEW_CONFIRMED_'+source.id.toUpperCase()]==='confirmed');
}
export function autoRewardEligible({views,baseline,fastReturn,confirmed,unchanged}){
  return confirmed===true&&unchanged===true&&fastReturn===false&&baseline===0&&views===1;
}
export function presentSource(env,source){return {...source,secret_name:secretName(source.id),token_configured:Boolean(sourceToken(env,source)),create_ready:sourceReady(env,source),auto_reward_ready:autoRewardEnabled(env,source)};}
export function taskSourceConfig(body,category){
  if(category!=='link')return {id:'',creation:'manual',verification:'manual'};
  const id=readText(body.link_source_id,32),creation=body.link_source_creation||'manual',verification=body.link_source_verification||'manual';
  if(id&&!slugPattern.test(id)||!['manual','api'].includes(creation)||!['manual','api_view','api_auto'].includes(verification)||(!id&&creation==='api')||(verification!=='manual'&&creation!=='api'))throw Error('Cấu hình nguồn rút gọn không hợp lệ');
  return {id,creation,verification};
}
export async function validateTaskSource(env,body,category){
  const config=taskSourceConfig(body,category);
  if(!config.id)return config;
  const source=await getSource(env,config.id);
  if(!source)throw Error('Không tìm thấy nguồn rút gọn');
  if(config.creation==='api'&&body.is_active){
    if(body.review_mode!=='manual'||!sourceReady(env,source))throw Error('Chưa kết nối API tạo link; chọn Tắt / nháp');
    if(config.verification!=='manual'&&(!source.view_url||!source.view_path))throw Error('Chưa cấu hình API kiểm tra view');
    if(config.verification==='api_auto'&&!autoRewardEnabled(env,source))throw Error('Nguồn chưa được xác nhận điều kiện tính tiền. Chỉ lưu tự động ở trạng thái nháp hoặc chọn Admin duyệt.');
  }
  return config;
}
export async function getTaskSource(env,taskId){return await settingValue(env,TASK_SOURCE_PREFIX+taskId)||{id:'',creation:'manual',verification:'manual'};}
export async function getAttemptSource(env,attemptId){return settingValue(env,ATTEMPT_SOURCE_PREFIX+attemptId);}
