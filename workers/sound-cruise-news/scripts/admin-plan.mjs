// Generates a reviewable SQL plan only. NEVER executes remote commands.
import { writeFile } from 'node:fs/promises';
import { adminStatements } from '../src/admin.js';
const [action,target,reason,output]=process.argv.slice(2);
if(!output||!output.endsWith('.sql'))throw new Error('Usage: action target reason-code output.sql');
const literal=value=>typeof value==='number'?String(value):"'"+value.replaceAll("'","''")+"'";
const statements=adminStatements({action,target,reason});
// Fail closed even if a remote file execution is interrupted between statements.
const prefix='UPDATE news_controls SET collection_enabled=0,api_enabled=0,revision=revision+1 WHERE id=1;\n';
const sql=prefix+statements.map(({sql,args})=>{let index=0;return sql.replace(/\?/g,()=>literal(args[index++]));}).join(';\n')+';\n';
await writeFile(output,sql,{flag:'wx',mode:0o600});
console.log('Plan written. Review target DB and SQL before an explicitly authorized remote operation. No remote operation performed.');
