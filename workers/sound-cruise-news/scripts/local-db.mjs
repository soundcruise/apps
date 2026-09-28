import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import {expireReport} from './report.mjs';
import { NewsStore } from '../src/store.js';
export async function localDatabase(persistencePath='.local/d1'){
 await mkdir('.local',{recursive:true});
 await expireReport();
 const mf=new Miniflare(convertV4MiniflareOptions({name:'news-local-db',modules:true,script:'export default {fetch(){return new Response("local news DB");}}',compatibilityDate:'2026-09-18',d1Databases:{NEWS_DB:'00000000-0000-0000-0000-000000000001'},resourcePersistencePath:persistencePath}));
 const db=await mf.getD1Database('NEWS_DB');
 try {
  await db.prepare('CREATE TABLE IF NOT EXISTS local_news_migrations (name TEXT PRIMARY KEY)').run();
  const directory=new URL('../migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort()) {
   if(await db.prepare('SELECT name FROM local_news_migrations WHERE name=?').bind(name).first())continue;
   const sql=await readFile(new URL(name,directory),'utf8');
   await db.batch([...sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)),db.prepare('INSERT INTO local_news_migrations VALUES(?)').bind(name)]);
  }
  return {mf,db,store:new NewsStore(db)};
 }catch(error){await mf.dispose();throw error;}
}
