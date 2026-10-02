import assert from 'node:assert/strict';
import {store,pepper} from './helpers.js';
import {decisionInput} from './operator-fixtures.js';
import {getSource} from '../src/registry.js';
import {administer} from '../src/admin.js';
import {fingerprint} from '../src/fingerprint.js';
import {factualLabel} from '../src/metadata.js';
export const now=Date.parse('2026-10-02T07:00:00Z');export const source={...getSource('shimamura'),enabled:true,productionEnabled:true};
export async function setup(){const s=await store();await administer(s,{action:'publish-on',reason:'review_complete'},now,[source]);await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});return s;}
export async function put(s,id='test-one',extra={}){const facts={brand:'SHURE',product:'MV6',version:null,category:'recording_audio',identifierBasis:'explicit_model_code'},url='https://www.shimamura.co.jp/update/dtm-recording/2026/10/'+id+'/';const item={id,sourceId:source.id,sourceName:source.name,sourceUrl:url,normalizedUrl:url,publishedAt:'2026-10-01T00:00:00.000Z',category:facts.category,label:'MV6の製品情報（要確認）',topicKey:'qa-'+id,collectedAt:'2026-10-02T00:00:00.000Z',titleFingerprint:JSON.stringify(await fingerprint('Synthetic SHURE MV6 release fixture '+id,pepper)),productFacts:facts,eventType:'new_product',publicationDecision:'PUBLISH_REVIEW',decisionReason:'label_required',reviewReason:'label_required',...extra};assert(await s.put(item));return item;}
export async function approveInput(s,item,extra={}){return decisionInput(s,{id:item.id,action:'approve',reason:'useful_product',label:factualLabel(item.productFacts,item.eventType),category:item.category,publishedAt:item.publishedAt,checks:{factsChecked:true,relevanceChecked:true,duplicateChecked:true,independentLabelChecked:true},...extra});}
