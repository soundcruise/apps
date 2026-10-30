import {fail} from './contracts.mjs';
// Metadata identity retains the original jurisdiction; only endpoint routing normalizes default.
export function r2Endpoint(account,jurisdiction=''){
 if(!/^[a-f0-9]{32}$/.test(account)||!['','default','eu','us','fedramp'].includes(jurisdiction))fail('r2-endpoint-scope');
 return `https://${account}${jurisdiction&&jurisdiction!=='default'?'.'+jurisdiction:''}.r2.cloudflarestorage.com`;
}
