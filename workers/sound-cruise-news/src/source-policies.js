// Partial evidence is insufficient to collect. These are findings, not permissions.
// Review date records this lookup, not completed automation-policy approval.
const known = {
 shimamura: ['https://www.shimamura.co.jp/siteusage/', 'Commercial/non-commercial links generally unrestricted; source must be identifiable; frames disallowed and separate window required. Top page recommended, other URLs not prohibited. No explicit automated collection permission found (documented silence). Internal limited-pilot judgment only: official product-news listing, robots, at most daily, no articles/images/exact headlines, independent labels, human approval and kill/takedown.', true],
 roland: ['https://www.roland.com/jp/terms_of_use/', 'Links permitted subject to conditions; misleading framing prohibited. Automated metadata collection not yet approved.', true],
 'audio-technica': ['https://www.audio-technica.co.jp/corp/privacypolicy', 'Website terms include linking conditions: no misleading affiliation or framing; removal requests must be followed. Automated collection evidence incomplete.', true],
 kanda: ['https://www.kandashokai.co.jp/terms/', 'Reproduction/reuse restricted outside statutory permissions. Automated metadata scope not yet approved.'],
 hookup: ['https://hookup.co.jp/about/tac', 'JP1-A2 recorded reproduction restrictions; automatic metadata and link scope needs review.'],
 esp: ['https://espguitars.co.jp/support/terms/', 'Direct links to site content (deep links) prohibited by official link policy. CONTACT remains; no permission received.'],
 sonicwire: ['https://sonicwire.com/aboutus/terms', 'Sales-service terms are not permission to aggregate news.']
};
export function policyRecord(id) {
 const evidence=known[id];
 return {
  termsUrl:evidence?.[0]||null,linkPolicyUrl:id==='esp'?'https://espguitars.co.jp/support/link':evidence?.[2]?evidence[0]:null,
  policySummary:evidence?.[1]||'Applicable Terms/link/automation evidence incomplete; collection prohibited.',
  reviewedBy:evidence?'operator':null,reviewedAt:evidence?'2026-09-28':null,
  robotsReviewedAt:null,discoveryReviewedAt:null,permissionRef:null,policyDecision:'incomplete',
  policyResearchUrl:id==='sleepfreaks'?'https://sleepfreaks-dtm.com/privacy/':null
 };
}
