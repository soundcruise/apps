import { datasetFixture } from '../dataset-fixture.mjs';
import { PORT_DATASET_KEYS } from '../../port-idb-authority-contract.mjs';
export function values(){const fixture=datasetFixture();return Object.fromEntries(PORT_DATASET_KEYS.map(k=>[k,fixture[k]??null]));}
export function control(generation='g1',partitionId='fixture-partition'){
    return {schemaVersion:1,generation,repositoryProtocol:1,writerProtocol:2,epoch:1,fenceEpoch:1,state:'active',suspended:false,
        fenceRevoked:false,identityInvalidated:false,recoveryRequired:false,fenceEvidence:null,
        identity:{appId:'port',datasetOwner:'port',partitionId,ownership:'unbound-local',accountId:null}};
}
export const patch=(snapshot,key,fields)=>({[key]:JSON.stringify({...JSON.parse(snapshot.values[key]),...fields})});
