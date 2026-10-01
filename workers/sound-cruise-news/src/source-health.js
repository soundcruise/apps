// Structured operator signals only. Never include response bodies, titles or free text.
export const HEALTH_STATUSES=Object.freeze(['healthy','warning','paused','policy_review','robots_changed','structure_changed','http_blocked','rate_limited','error']);
export const HEALTH_REASONS=Object.freeze([
 'approved_mass_visibility_loss','ok','not_modified','source_disabled','source_auto_disabled','global_collection_off','configuration_invalid','headline_pepper_required',
 'policy_expired','policy_changed','evidence_missing','robots_changed_review','robots_disallow','robots_unparseable','robots_unavailable',
 'http_401','http_403','http_451','rate_limited','listing_structure_changed',
 'listing_too_large','non_metadata_response','metadata_format','collector_repeated_failure','retention_purge_failed',
 'request_timeout','upstream_error','network_or_internal_error','listing_optout','header_optout'
]);
export function healthForOutcome(outcome,failures=0){
 if(outcome==='collected')return {status:'healthy',reasonCode:'ok'};
 if(outcome==='not_modified')return {status:'healthy',reasonCode:'ok'};
 if(['policy_expired','policy_changed','evidence_missing'].includes(outcome))return {status:'policy_review',reasonCode:outcome};
 if(['robots_changed_review','robots_unparseable','robots_unavailable'].includes(outcome))return {status:'robots_changed',reasonCode:outcome};
 if(['listing_structure_changed','listing_too_large','non_metadata_response','metadata_format'].includes(outcome))return {status:'structure_changed',reasonCode:outcome};
 if(['http_401','http_403','http_451'].includes(outcome))return {status:'http_blocked',reasonCode:outcome};
 if(outcome==='rate_limited')return {status:failures>=2?'rate_limited':'warning',reasonCode:outcome};
 if(['source_disabled','global_collection_off','robots_disallow','listing_optout','header_optout'].includes(outcome))return {status:'paused',reasonCode:outcome};
 if(failures>=3)return {status:'error',reasonCode:'collector_repeated_failure'};
 return {status:'warning',reasonCode:HEALTH_REASONS.includes(outcome)?outcome:'network_or_internal_error'};
}
