// IP reputation is checked server-side, before new Link issuance.
// Only the edge-observed IP is sent to ipapi.is; no account identifiers.
const cache=new Map();
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
// Anti-Fraud 3.0 diagnostic: hosting is a network signal, not proof of an emulator.
// Missing data must remain unknown; do not alter existing VPN/proxy/Tor decisions.
export function classifyHosting(data){
 if(!data||data.error||data.error_code||typeof data.is_datacenter!=='boolean')return 'unknown';
 return data.is_datacenter?'hosting':'not_detected';
}
export async function checkLinkProxy(key,ip,fetcher=(...args)=>globalThis.fetch(...args),clock=Date.now,{fresh=false}={}){
 if(!String(key||'').trim())return {status:'unavailable',reason:'missing_key'};
 if(!ip||!(/^[0-9a-f:.]+$/i.test(ip))||!/[.:]/.test(ip))return {status:'unavailable',reason:'missing_ip'};
 const address=ip.toLowerCase(),now=clock();
 const hit=cache.get(address);
 if(!fresh&&hit&&hit.until>now)return {...hit.result,cached:true};
 const lookup=async()=>{
  let timer;
  const controller=new AbortController();
  try{
   timer=setTimeout(()=>controller.abort(),5000);
   const response=await fetcher('https://api.ipapi.is/',{method:'POST',body:JSON.stringify({q:address,key}),signal:controller.signal,redirect:'manual',headers:{Accept:'application/json','Content-Type':'application/json'}});
   if(!response.ok){
    const status=response.status;
    const reason=status>=300&&status<400?'unexpected_redirect':status===401||status===403?'auth_error':status===429?'rate_limit':'service_error';
    return {status:'unavailable',reason,http_status:status};
   }
   let data;
   try{data=await response.json();}catch{return {status:'unavailable',reason:'invalid_response',http_status:response.status};}
   const result={...classifyProxy(data),hosting:classifyHosting(data)};
   if(!fresh&&result.status!=='unavailable'){
    if(cache.size>=MAX)cache.delete(cache.keys().next().value);
    cache.set(address,{until:clock()+TTL,result});
   }
   return {...result,http_status:response.status};
  }catch{return {status:'unavailable',reason:controller.signal.aborted?'timeout':'network_error'};}
  finally{clearTimeout(timer);}
 };
 // Workers must not share in-flight I/O across independent requests.
 // Diagnostic checks bypass the completed-result cache.
 return lookup();
}
