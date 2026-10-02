// D1 prepare accepts one statement. Keep trigger bodies intact instead of splitting
// their internal semicolons. Migrations use a standalone END; to close a trigger.
export function migrationStatements(sql){
 const result=[];let current='',quote='',lineComment=false,blockComment=false;
 for(let i=0;i<sql.length;i++){
  const c=sql[i],next=sql[i+1];current+=c;
  if(lineComment){if(c==='\n')lineComment=false;continue;}
  if(blockComment){if(c==='*'&&next==='/'){current+=next;i++;blockComment=false;}continue;}
  if(quote){if(c===quote){if(next===quote){current+=next;i++;}else quote='';}continue;}
  if(c==='-'&&next==='-'){current+=next;i++;lineComment=true;continue;}
  if(c==='/'&&next==='*'){current+=next;i++;blockComment=true;continue;}
  if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
  if(c===';'&&(!/\bCREATE\s+TRIGGER\b/i.test(current)||/\n\s*END;\s*$/i.test(current))){result.push(current.trim());current='';}
 }
 if(current.trim()&&!/^\s*(?:--[^\n]*(?:\n|$)\s*)+$/.test(current))throw Error('unterminated_migration_statement');
 return result;
}
