// Thử nghiệm: đọc Open Graph của link TikTok Shop Affiliate do Admin cung cấp.
// Không đăng sản phẩm, không ghi D1, không đổi URL Affiliate gốc.
const allowedTikTokHost=host=>['tiktok.com','tiktokshop.com'].some(base=>host===base||host.endsWith('.'+base));
const isSafeUrl=raw=>{
 try{
  const u=new URL(String(raw||''));
  return u.protocol==='https:' && allowedTikTokHost(u.hostname.toLowerCase()) &&
    !u.username && !u.password && (!u.port||u.port==='443') && u.href.length<=1100 ?u:null;
 }catch{return null;}
};
function decodeHtml(value){
 return String(value||'').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt|nbsp);/gi,(whole,entity)=>{
  const lower=entity.toLowerCase(),base=lower.startsWith('#x')?16:10;
  if(lower.startsWith('#')){
   const v=Number.parseInt(lower.slice(base===16?2:1),base);
   return Number.isInteger(v)&&v>31&&v<=0x10ffff?String.fromCodePoint(v):'';
  }
  return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[lower]||whole;
 });
}
function attr(tag,key){
 const re=new RegExp('(?:^|\\s)'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i');
 const m=re.exec(tag);return m?decodeHtml(m[1]??m[2]??m[3]).trim():'';
}
export function parseTikTokProductPreview(html){
 const tags=String(html||'').match(/<meta\b[^>]*>/gi)||[];
 const value=(names)=>{for(const n of names)for(const tag of tags){
   if([attr(tag,'property'),attr(tag,'name')].some(k=>k.toLowerCase()===n.toLowerCase())){
    const v=attr(tag,'content');if(v)return v;
   }
  }return '';
 };
 const rawTitle=value(['og:title','twitter:title']) ||
  decodeHtml((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1]);
 const title=rawTitle.replace(/\s*[|–-]\s*TikTok(?: Shop)?\s*$/i,'').trim().slice(0,110);
 const generic=/^(TikTok|TikTok Shop|TikTok - Make Your Day|Shop|Login|Log in|Đăng nhập|For You|Discover)$/i.test(title);
 let image=value(['og:image','twitter:image','twitter:image:src']);
 try{
  const u=new URL(image);
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||
   !['tiktokcdn.com','tiktokcdn-us.com','tiktokcdn-eu.com','byteimg.com','tiktokcdn.com.cn']
    .some(d=>host===d||host.endsWith('.'+d)))image='';
 }catch{image='';}
 return {title:!generic&&title.length>=5?title:'',image_url:image||null};
}
async function readHead(response,max=240000){
 const stream=response.body;
 if(!stream)return (await response.text()).slice(0,max);
 const reader=stream.getReader(),decoder=new TextDecoder();let html='',bytes=0;
 try{
  while(bytes<max){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   html+=decoder.decode(value,{stream:true});
   if(html.includes('</head>'))break;
  }
 }finally{reader.cancel().catch(()=>{});}
 return html.slice(0,max);
}
export async function previewTikTokProduct(rawLink,fetcher=fetch){
 let target=isSafeUrl(rawLink);
 if(!target)return {ok:false,message:'Chỉ hỗ trợ liên kết TikTok Shop HTTPS hợp lệ.'};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  for(let hop=0;hop<5;hop++){
   const response=await fetcher(target.href,{
    method:'GET',redirect:'manual',signal:controller.signal,
    headers:{Accept:'text/html,application/xhtml+xml'}
   });
   if([301,302,303,307,308].includes(response.status)){
    const next=response.headers.get('location');
    if(!next)return {ok:false,message:'TikTok không cung cấp trang sản phẩm.'};
    target=isSafeUrl(new URL(next,target.href).href);
    if(!target)return {ok:false,message:'TikTok chuyển hướng tới nơi không hỗ trợ nhận diện an toàn.'};
    continue;
   }
   if(!response.ok||!String(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))
    return {ok:false,message:'TikTok không cho đọc thông tin sản phẩm từ liên kết này.'};
   const data=parseTikTokProductPreview(await readHead(response));
   if(!data.title)return {ok:false,message:'TikTok không trả về tên sản phẩm công khai. Hãy thêm thủ công.'};
   return {ok:true,title:data.title,image_url:data.image_url,
    message:data.image_url?'Đã nhận được tên và ảnh. Hãy kiểm tra trước khi đăng.':'Đã nhận tên, nhưng chưa lấy được ảnh từ TikTok.'};
  }
  return {ok:false,message:'TikTok chuyển hướng quá nhiều lần, không nhận diện được.'};
 }catch{
  return {ok:false,message:'Không lấy được thông tin từ TikTok (có thể bị chặn hoặc hết thời gian). Bạn vẫn có thể thêm thủ công.'};
 }finally{clearTimeout(timer);}
}
