import {DatabaseSync} from 'node:sqlite';
import {realpathSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,basename,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {validateInput,assessEvidence} from '../engine.mjs';
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const canonical=x=>JSON.stringify(stable(x));
const digest=x=>createHash('sha256').update(x).digest('hex');
export function openStore(path){
 let symlink=false;try{symlink=lstatSync(path).isSymbolicLink()}catch(e){if(e.code!=='ENOENT')throw e;}
 const root=realpathSync(tmpdir()),dir=realpathSync(dirname(path));
 if(!dir.startsWith(root+sep)||!basename(dir).startsWith('dot2e-')||basename(path)!=='staging.sqlite'||symlink)throw Error('isolated_temp_only');
 const db=new DatabaseSync(path);db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY, input_json TEXT NOT NULL, validation_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts(key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, candidate_id TEXT NOT NULL REFERENCES candidates(id)); CREATE TABLE IF NOT EXISTS demo_reviews(id TEXT PRIMARY KEY REFERENCES candidates(id), verdict TEXT NOT NULL CHECK(verdict IN (\'review\',\'skip\')), updated_at TEXT NOT NULL);');
 return db;
}
export function ingest(db,input,now){const checked=validateInput(input);if(!checked.valid)return {status:'invalid',errors:checked.errors};const c=checked.data.candidate,payload=canonical(checked.data),hash=digest(payload),validation=assessEvidence(c,[],now);
 db.exec('BEGIN IMMEDIATE');try{const receipt=db.prepare('SELECT payload_hash,candidate_id FROM receipts WHERE key=?').get(c.idempotency_key);if(receipt){db.exec('COMMIT');return receipt.payload_hash===hash?{status:'replay',id:receipt.candidate_id}:{status:'conflict'};}
 if(db.prepare('SELECT id FROM candidates WHERE id=?').get(c.candidate_id)){db.exec('ROLLBACK');return {status:'candidate_conflict'};}
 db.prepare('INSERT INTO candidates(id,input_json,validation_json) VALUES(?,?,?)').run(c.candidate_id,payload,JSON.stringify(validation));db.prepare('INSERT INTO receipts(key,payload_hash,candidate_id) VALUES(?,?,?)').run(c.idempotency_key,hash,c.candidate_id);db.exec('COMMIT');return {status:'created',id:c.candidate_id};}catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}}
export function list(db){return db.prepare('SELECT c.input_json,c.validation_json,r.verdict FROM candidates c LEFT JOIN demo_reviews r ON r.id=c.id ORDER BY c.id').all().map(r=>({input:JSON.parse(r.input_json),validation:JSON.parse(r.validation_json),demo_verdict:r.verdict||null}));}
export function demoDecision(db,id,verdict){if(!['review','skip'].includes(verdict))throw Error('invalid_decision');const row=db.prepare('SELECT id FROM candidates WHERE id=?').get(id);if(!row)throw Error('not_found');db.prepare("INSERT INTO demo_reviews(id,verdict,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET verdict=excluded.verdict,updated_at=excluded.updated_at").run(id,verdict,new Date().toISOString());return {saved:true,demo_only:true};}
