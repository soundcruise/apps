import {operatorDecision,candidateSnapshot} from '../src/operator-review.js';
export const fixtureActor={type:'fixture',id:'fixture:operator-suite'};
export async function decisionInput(store,input){const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();return {reason:'operator_review',requestId:crypto.randomUUID(),snapshot:row?await candidateSnapshot(row):'0'.repeat(64),revision:row?.review_revision??0,...input};}
export async function fixtureDecision(store,input,now,registry,pepper){return operatorDecision(store,await decisionInput(store,input),now,registry,pepper,fixtureActor);}
