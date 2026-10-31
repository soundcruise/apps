import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers.js';
import {scopeSql} from '../src/dot-candidate-fence.js';

// Regression for the rejected count/version prototype: a new, previously reviewed subject must not
// leave an old PASS unchanged merely because the evidence count is identical.
test('a retained subject swap invalidates the old approval fence',()=>{
 const db=database(),r=db.raw;
 try{
  const keys={id:'candidate',snapshot:'snap',digest:'digest',revision:'1:1',receipt:'receipt',now:1000,urls:['https://example.invalid/target'],hashes:[],models:['fg700'],topicKey:'target',dotId:'dot'};
  const insert=r.prepare('INSERT INTO news_dot_history_exclusions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const id of ['a','b'])insert.run('request-'+id,'candidate','snap','digest','1:1','receipt','takedown:'+id,JSON.stringify([id,2000]),'human',900,3000,'https://example.invalid/'+id,'other','OTHER','event','fixture evidence','hash');
  r.prepare('INSERT INTO news_takedowns VALUES(?,?)').run('a',2000);
  const before=r.prepare(`SELECT (${scopeSql}) AS value`).get(JSON.stringify(keys)).value;
  r.prepare('DELETE FROM news_takedowns WHERE item_id=?').run('a');
  r.prepare('INSERT INTO news_takedowns VALUES(?,?)').run('b',2000);
  const after=r.prepare(`SELECT (${scopeSql}) AS value`).get(JSON.stringify(keys)).value;
  assert.notEqual(after,before,'the final SQL must detect a new retained subject');
 }finally{r.close();}
});
