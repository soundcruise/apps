import {remoteSql,sqlLiteral} from './remote-db.mjs';
const render=(sql,args)=>{let i=0;const result=sql.replace(/\?/g,()=>sqlLiteral(args[i++]));if(i!==args.length)throw Error('sql_bind_mismatch');return result;};
export function remoteDatabase(){
 const wrap=(sql,args=[])=>({bind:(...values)=>wrap(sql,values),first:async()=> (await remoteSql(render(sql,args)))[0].results[0]||null,all:async()=>({results:(await remoteSql(render(sql,args)))[0].results}),run:async()=>({meta:(await remoteSql(render(sql,args)))[0].meta}),sql,args});
 return {prepare:wrap,batch:async statements=>(await remoteSql(statements.map(s=>render(s.sql,s.args)).join(';\n')+';')).map(r=>({results:r.results,meta:r.meta}))};
}
