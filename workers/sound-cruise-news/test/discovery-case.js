import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {runtimeSources} from '../src/runtime.js';
import {hash} from '../src/policy.js';
import {store,pepper} from './helpers.js';
export const cases=JSON.parse(readFileSync(new URL('./fixtures/oct27-primary-facts.json',import.meta.url))).cases;
export const at=Date.parse('2026-10-27T06:00:00+09:00'),robot='User-agent: *\nAllow: /';
const cfg=JSON.parse(readFileSync(new URL('../wrangler.production.jsonc',import.meta.url)));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export const title=c=>c.facts.brand+'「'+c.facts.product+'」'+(c.eventType==='release'?'発売':'が新登場');
// Structural projections of retained facts, not original publisher sentences.
export function html(c){const f=c.facts,day=new Date(Date.parse(c.publishedAt)+9*3600000).toISOString().slice(0,10);
 const lead=f.productType==='guitar'?`国内向けに、${f.brand}「${f.product} MPL」が新登場しました。`:`${f.brand}から新たなエフェクター「${f.product}」が登場しました。`;
 const definition=f.productType==='guitar'?'<p class="wp-block-paragraph">ボディ、ネック、指板、フレット、ピックアップ、ブリッジの仕様です。</p>':'<p class="wp-block-paragraph">ゲルマニウム・ファズペダルです。</p><h3>発売日</h3><p>2026年10月21日</p>';
 const name=f.productType==='guitar'?f.product+', Maple Fingerboard, Test':f.brand+' '+f.product;
 return `<link rel="canonical" href="${c.sourceUrl}"><div class="mb-80"><h1>${esc(title(c))}</h1></div><p>公開：<time datetime="${day}">${day}</time></p><div class="p-content"><p class="wp-block-paragraph">${esc(lead)}</p>${definition}<table><tr><th>${esc(name)}</th><td>JANコード</td><td>1234567890123</td></tr></table></div>`;
}
export const listing=(list,titleFor=title)=>'<h1>製品ニュース 記事一覧</h1>'+list.map(c=>`<a href="${c.sourceUrl}"><h3>${esc(titleFor(c))}</h3><date>${new Date(Date.parse(c.publishedAt)+9*3600000).toISOString().slice(0,10).replaceAll('-','/')}</date><span class="btn-cat-${c.initialCategory==='amps_effects'?'amp-effector':'guitar-bass'}">${c.initialCategory==='amps_effects'?'アンプ':'ギター'}</span></a>`).join('');
export async function setup({list=cases,render=html,robots=robot,listingTitle=title,dailyLimit=6,db}={}){
 const s=await store(db),env={...cfg.vars,NEWS_DB:s.db,NEWS_SOURCE_IDS:'["shimamura"]',NEWS_HEADLINE_PEPPER:pepper};
 const registry=runtimeSources(env,undefined,at).map(a=>({...a,enabled:false,productionEnabled:false,robotsHash:a.id==='shimamura'?null:a.robotsHash})),source=registry.find(a=>a.id==='shimamura');source.robotsHash=await hash(robots);source.dailyPrimaryArticleLimit=dailyLimit;
 await s.db.prepare('INSERT OR REPLACE INTO source_state(source_id,robots_hash) VALUES(?,?)').bind(source.id,source.robotsHash).run();
 await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:at,successfulAt:at});
 await s.db.prepare('UPDATE news_controls SET publication_enabled=1').run();
 const calls=[],x={s,env,registry:runtimeSources(env,registry,at),source,calls,list,render};
 const fetcher=async(u,o)=>{calls.push(u);assert.equal(o.redirect,'manual');if(u===source.robotsUrl)return new Response(robots,{headers:{'content-type':'text/plain'}});if(u===source.discoveryUrl)return new Response(listing(x.list,listingTitle),{headers:{'content-type':'text/html'}});const c=list.find(c=>c.sourceUrl===u);assert(c,'unregistered HTTP denied');return new Response(x.render(c),{headers:{'content-type':'text/html'}});};
 x.run=(now=at,cron='0 21 * * *',extra={})=>worker.scheduled({cron,scheduledTime:now},env,{},now,{registry,fetcher,sleep:async()=>{},clock:()=>now,...extra});return x;
}
