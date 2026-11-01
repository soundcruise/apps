// Operational states do not grant publication and are not human verdicts.
export function preparationState(row,validation,lifecycle={}){
 if(row.review_status==='rejected'&&['system_policy','source_policy'].includes(row.reviewed_by))return 'EXCLUDED';
 if(!['pending','reopened'].includes(row.review_status))return null;
 if(validation.valid)return validation.relevance?.status==='REVIEW'?'HUMAN_REVIEW':'READY';
 if(validation.errors.some(e=>['duplicate','expired_candidate','candidate_takedown','publication_policy_rejected'].includes(e)))return 'EXCLUDED';
 if(validation.errors.some(e=>['relevance_uncertain','source_url_invalid','operator_source_gate'].includes(e))||lifecycle?.recheck_status==='HUMAN_REVIEW_REQUIRED')return 'HUMAN_REVIEW';
 return lifecycle?.next_recheck_at||['TEMPORARY_FETCH_FAILURE','PARSER_RETRY','WAITING'].includes(lifecycle?.recheck_status)?'RETRY':'HUMAN_REVIEW';
}
