// IP reputation is checked server-side, before new Link issuance.
// Only the edge-observed IP is sent to ipapi.is; no account identifiers.
const cache=new Map();
const pending=new Map();
const TTL=60000;
const MAX=512;
export function classifyProxy(data){
 // ipapi.is documents is_vpn as possibly truthy rather than a literal boolean.
 // Missing flags (anonymous tier) or API error must never pass as clean.
 if(!data||data.error||data.error_code||!['is_proxy','is_tor'].every(k=>typeof data[k]==='boolean')||
    !(typeof data.is_vpn==='boolean'||(typeof data.is_vpn==='number'&&data.is_vpn===1)||(typeof data.is_vpn==='string'&&['true','1'].includes(data.is_vpn))))return {status:'unavailable',reason:'invalid_response'};
 if(data.is_tor)return {status:'blocked',reason:'tor'};
 if(data.is_vpn)return {status:'blocked',reason:'vpn'};
 if(data.is_proxy)return {status:'blocked',reason:'proxy'};
 return {status:'clear',reason:'clear'};
}
export async function checkLinkProxy(key,ip,fetcher=fetch,clock=Date.now,{fresh=false}={}){
 if(!String(key||'').trim())return {status:'unavailable',reason:'missing_key'};
 if(!ip||!(/^[0-9a-f:.]+$/i.test(ip))||!/[.:]/.test(ip))return {status:'unavailable',reason:'missing_ip'};
 const address=ip.toLowerCase(),now=clock();
 const hit=cache.get(address);
 if(!fresh&&hit&&hit.until>now)return {...hit.result,cached:true};
 if(!fresh&&pending.has(address))return pending.get(address);
 if(!fresh&&pending.size>=MAX)return {status:'unavailable',reason:'busy'};
 const lookup=async()=>{
  let timer;
  try{
   const controller=new AbortController();
   timer=setTimeout(()=>controller.abort(),5000);
   const response=await fetcher('https://api.ipapi.is/',{method:'POST',body:JSON.stringify({q:address,key}),signal:controller.signal,redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json'}});
   if(!response.ok)return {status:'unavailable',reason:'service_error',http_status:response.status};
   const result=classifyProxy(await response.json());
   if(!fresh&&result.status!=='unavailable'){
    if(cache.size>=MAX)cache.delete(cache.keys().next().value);
    cache.set(address,{until:clock()+TTL,result});
   }
   return {...result,http_status:response.status};
  }catch{return {status:'unavailable',reason:'service_error'};}
  finally{clearTimeout(timer);}
 };
 // Diagnostic checks deliberately bypass cached and in-flight results.
 if(fresh)return lookup();
 const job=lookup();
 pending.set(address,job);
 try{return await job;}finally{pending.delete(address);}
}
