import {SOURCES,phaseOneSourceReady} from './registry.js';
// The immutable registry/evidence remains the authority. An env allowlist cannot bypass it.
export function runtimeSources(env,registry=SOURCES,now=Date.now()){
 let ids=[];try{ids=JSON.parse(env.NEWS_SOURCE_IDS||'[]');}catch{}
 if(!Array.isArray(ids)||(ids.length<1||ids.length>12||new Set(ids).size!==ids.length)||ids.some(id=>typeof id!=='string'||!registry.some(s=>s.id===id)))ids=[];
 return registry.map(s=>({...s,enabled:ids.includes(s.id)&&phaseOneSourceReady(s,now),productionEnabled:ids.includes(s.id)&&phaseOneSourceReady(s,now)}));
}
export function selectedSourceIds(env){
 try{const ids=JSON.parse(env.NEWS_SOURCE_IDS||'[]');return Array.isArray(ids)&&ids.length>=1&&ids.length<=12&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string')?ids:[];}catch{return [];}
}
