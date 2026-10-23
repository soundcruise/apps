// Source-owned restrictions remain in legalGate/robots. This is the NEWS budget.
// Calendar-day accounting avoids yesterday's later repair starving today's run.
export const initialPrimarySource=source=>['ikebe','shimamura'].includes(source?.id);
export const recoveryDayStart=now=>Date.parse(new Date(now+9*3600000).toISOString().slice(0,10)+'T00:00:00+09:00');
export async function recoveryBudget(store,source,now){
 const calendar=initialPrimarySource(source),since=calendar?recoveryDayStart(now):now-86400000;
 const limit=source?.dailyPrimaryArticleLimit||1;
 const row=await store.db.prepare('SELECT COUNT(*) n,MAX(checked_at) at FROM news_facts_sources WHERE (source_id=? OR instr(source_id,?)=1) AND checked_at>=?').bind(calendar?'':source.id,source.id+':',since).first();
 return {since,limit,used:row.n,nextAt:calendar?since+86400000:(row.at||now)+86400000+1};
}
