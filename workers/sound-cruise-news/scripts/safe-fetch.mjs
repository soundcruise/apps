import { lookup } from 'node:dns';
import { Agent, fetch } from 'undici';
export function publicAddress(address){
 if(address.includes(':'))return false; // DNS uses IPv4 only; fail closed on all IPv6 for this local phase.
 const parts=address.split('.').map(Number);if(parts.length!==4||parts.some(v=>!Number.isInteger(v)||v<0||v>255))return false;
 const [a,b]=parts;
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export const dispatcher=new Agent({connect:{lookup(host,options,callback){
 lookup(host,{family:4,all:true},(error,addresses)=>{
  if(error)return callback(error);
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))return callback(new Error('dns_not_public'));
  callback(null,options.all?addresses:addresses[0].address,4);
 });
}}});
export const safeFetch=(url,options)=>fetch(url,{...options,dispatcher});
