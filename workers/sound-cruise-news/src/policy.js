import robotsParser from 'robots-parser';
export const BOT='SoundCruiseNewsBot';
export const UA=BOT+'/0.1 (+mailto:soundcruise.inc@gmail.com)';
export const DAY=86400000;
export function sourceUrl(raw,source) {
 try {
  const u=new URL(raw);const base=new URL(source.baseUrl);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname!==base.hostname||u.hostname==='localhost'||!/[a-z]/i.test(u.hostname)||u.hostname.includes(':')||/\.(local|internal|localhost)$/.test(u.hostname))return null;
  u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);
  return u.href;
 }catch{return null;}
}
export function optOut(value='') { return /\b(noindex|noarchive|nosnippet|nofollow|none)\b/i.test(value); }
export function robotsPolicy(text,source,status=200) {
 if(status===404 && source.robots404Reviewed)return robotsParser(source.robotsUrl,'User-agent: *\nAllow: /');
 if(status!==200||typeof text!=='string'||/<\s*(html|!doctype)/i.test(text))throw new Error('robots_unavailable');
 if(text.length>512000)throw new Error('response_too_large');
 const normalized=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(!normalized.trim())return robotsParser(source.robotsUrl,'User-agent: *\nAllow: /');
 let groups=0;
 for(const line of normalized.split('\n')) {
  const keywords=[...line.matchAll(/\b(?:user-agent|disallow|allow|crawl-delay|sitemap)\s*:/gi)];
  // Flattened comment/directive streams must not turn into implicit allow-all.
  if(keywords.length>1||(line.includes('#')&&keywords.some(k=>k.index>line.indexOf('#'))))throw new Error('robots_unparseable');
  const active=line.split('#')[0].trim();if(!active)continue;
  const directive=/^([a-z-]+)\s*:\s*(.*)$/i.exec(active);
  if(!directive)throw new Error('robots_unparseable');
  const [,key,value]=directive;
  if(key.toLowerCase()==='user-agent') {if(!/^[\w*./-]+$/.test(value))throw new Error('robots_unparseable');groups++;}
  else if(/^(allow|disallow|crawl-delay)$/i.test(key)&&!groups)throw new Error('robots_unparseable');
  if(/^(allow|disallow)$/i.test(key)&&value&&!value.startsWith('/'))throw new Error('robots_unparseable');
  if(/^crawl-delay$/i.test(key)&&(!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value))))throw new Error('robots_unparseable');
 }
 if(!groups)throw new Error('robots_unparseable');
 return robotsParser(source.robotsUrl,normalized);
}
export function retryAt(status,header,attempt,now) {
 if(status===429){const seconds=Number(header);const value=header && Number.isFinite(seconds)?now+seconds*1000:Date.parse(header);return Math.max(now+DAY,Number.isFinite(value)?value:0);}
 return now+Math.min(7*DAY,6*3600000*2**Math.min(attempt,6));
}
export async function hash(value) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
// All redirects are rejected (limit zero): no discovery URL can escape the registry.
export async function boundedFetch(url,{fetcher=fetch,headers={},maxBytes=1000000}={}) {
 const response=await fetcher(url,{method:'GET',redirect:'manual',credentials:'omit',headers:{'User-Agent':UA,...headers},signal:AbortSignal.timeout(15000)});
 if(response.status>=300 && response.status<400 && response.status!==304){await response.body?.cancel();throw new Error('redirect_blocked');}
 if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw new Error('response_too_large');}
 if(response.status!==200){await response.body?.cancel();return {status:response.status,headers:response.headers,text:''};}
 const reader=response.body?.getReader();let total=0;const chunks=[];
 if(reader)while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw new Error('response_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(total);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return {status:response.status,headers:response.headers,text:new TextDecoder().decode(bytes)};
}
