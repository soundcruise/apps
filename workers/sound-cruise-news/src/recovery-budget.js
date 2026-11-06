// Source-owned restrictions remain in legalGate/robots. This is the NEWS budget.
// Calendar-day accounting avoids yesterday's later repair starving today's run.
export const initialPrimarySource=source=>['ikebe','shimamura'].includes(source?.id);
export const recoveryDayStart=now=>Date.parse(new Date(now+9*3600000).toISOString().slice(0,10)+'T00:00:00+09:00');
export async function recoveryBudget(store,source,now){
 const calendar=initialPrimarySource(source),since=calendar?recoveryDayStart(now):now-86400000;
 const limit=source?.dailyPrimaryArticleLimit||1;
 const row=await store.db.prepare('SELECT SUM(CASE WHEN instr(source_id,?)=1 THEN 0 ELSE 1 END) n,SUM(CASE WHEN instr(source_id,?)=1 THEN 1 ELSE 0 END) recovery_used,MAX(checked_at) at FROM news_facts_sources WHERE (source_id=? OR instr(source_id,?)=1) AND checked_at>=? AND instr(source_id,?)<>1').bind(source.id+':recovery:',source.id+':recovery:',calendar?'':source.id,source.id+':',since,source.id+':maintenance-probe:').first();
 return {since,limit,used:row.n||0,recoveryUsed:row.recovery_used||0,nextAt:calendar?since+86400000:(row.at||now)+86400000+1};
}

// Trusted operational option, never a field accepted by the public recheck input.
// It authorizes one bounded acquisition, not facts, identity changes or a verdict.
export async function validateRecoveryApproval(approval,input,row,source,surface,actor,now,snapshot){
 if(approval===undefined)return null;
 const fields=['id','candidateId','sourceId','sourceUrl','snapshot','revision','parserVersion','pipelineVersion','issuedAt','expiresAt','maxArticleRequests','reason'];
 if(!approval||Object.keys(approval).some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(approval,k))||
    !['system_repair','human_operator'].includes(actor.type)||!initialPrimarySource(source)||!Number.isSafeInteger(row.expires_at)||row.expires_at<=now||
    typeof approval.id!=='string'||!/^[a-zA-Z0-9_-]{16,64}$/.test(approval.id)||approval.candidateId!==row.id||approval.sourceId!==source.id||approval.sourceUrl!==row.source_url||
    approval.snapshot!==input.snapshot||approval.snapshot!==snapshot||approval.revision!==row.review_revision||
    approval.parserVersion!==surface?.parser||approval.pipelineVersion!==surface?.pipeline||approval.maxArticleRequests!==1||
    !Number.isSafeInteger(approval.issuedAt)||!Number.isSafeInteger(approval.expiresAt)||approval.issuedAt>now||approval.expiresAt<=now||approval.expiresAt<=approval.issuedAt||approval.expiresAt-approval.issuedAt>3600000||
    typeof approval.reason!=='string'||approval.reason.trim().length<10||approval.reason.length>300)throw Error('facts_recovery_approval_invalid');
 return {...approval,actorType:actor.type,actorId:actor.id};
}
