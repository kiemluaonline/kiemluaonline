// IP reputation is checked server-side, before new Link issuance.
// Only the edge-observed IP is sent to IPQS; no account identifiers.
const cache=new Map();
const pending=new Map();
const TTL=60000;
const MAX=512;
export function classifyProxy(data){
 if(data?.success!==true||!['proxy','vpn','tor'].every(k=>typeof data[k]==='boolean'))return {status:'unavailable',reason:'invalid_response'};
 if(data.tor||data.active_tor===true)return {status:'blocked',reason:'tor'};
 if(data.vpn||data.active_vpn===true)return {status:'blocked',reason:'vpn'};
 if(data.proxy)return {status:'blocked',reason:'proxy'};
 return {status:'clear',reason:'clear'};
}
export async function checkLinkProxy(key,ip,fetcher=fetch,clock=Date.now){
 if(!String(key||'').trim())return {status:'unavailable',reason:'missing_key'};
 if(!ip||!(/^[0-9a-f:.]+$/i.test(ip))||!/[.:]/.test(ip))return {status:'unavailable',reason:'missing_ip'};
 const address=ip.toLowerCase(),now=clock();
 const hit=cache.get(address);
 if(hit&&hit.until>now)return {...hit.result,cached:true};
 if(pending.has(address))return pending.get(address);
 if(pending.size>=MAX)return {status:'unavailable',reason:'busy'};
 const job=(async()=>{
  let timer;
  try{
   const controller=new AbortController();
   timer=setTimeout(()=>controller.abort(),5000);
   const url='https://www.ipqualityscore.com/api/json/ip/'+encodeURIComponent(key)+'/'+encodeURIComponent(address)+'?strictness=0&allow_public_access_points=true';
   const response=await fetcher(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json'}});
   if(!response.ok)return {status:'unavailable',reason:'service_error'};
   const result=classifyProxy(await response.json());
   if(result.status!=='unavailable'){
    if(cache.size>=MAX)cache.delete(cache.keys().next().value);
    cache.set(address,{until:clock()+TTL,result});
   }
   return result;
  }catch{return {status:'unavailable',reason:'service_error'};}
  finally{clearTimeout(timer);}
 })();
 pending.set(address,job);
 try{return await job;}finally{pending.delete(address);}
}
