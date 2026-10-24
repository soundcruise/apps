import {setupProvider} from './account-provider-fixture.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {storageFixture} from './account-cutover-fixture.mjs';
import {cleanValues,assetFixture} from '../migration-fixture.mjs';
import {LEGACY_PORT_BINARY_STORES} from '../../port-authority-binary.mjs';
import {createIsolatedPortBinaryRecovery} from '../../port-binary-recovery.mjs';
export async function seedLegacyAssets(indexedDB,assets){
 for(const spec of LEGACY_PORT_BINARY_STORES){const db=await new Promise((r,j)=>{const q=indexedDB.open(spec.database,1);q.onupgradeneeded=()=>{const s=q.result.createObjectStore(spec.store,{keyPath:'id'});if(spec.kind==='attachments')s.createIndex('practiceId','practiceId');};q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
 try{await new Promise((r,j)=>{const tx=db.transaction(spec.store,'readwrite'),s=tx.objectStore(spec.store);for(const a of assets.filter(a=>a.kind===spec.kind))s.add({...a.metadata,blob:a.blob});tx.oncomplete=r;tx.onabort=()=>j(tx.error);});}finally{db.close();}}
}
export async function fixtureAssets(storage){
 const gear=JSON.parse(storage.getItem('cruisePort.gearList')),apps=JSON.parse(storage.getItem('cruisePort.myApps')),menus=JSON.parse(storage.getItem('cruisePort.practiceMenus'));
 const assets=[await assetFixture('gear','photo'),await assetFixture('myApps','icon'),await assetFixture('attachments','pdf',menus.items[0].id)];
 gear.items[0].photoId='photo';gear.items[0].photoSourceId='photo';gear.items[0].photoCrop={x:0,y:0,size:1};apps.items[0].iconId='icon';apps.items[0].iconPresetKey=null;const metadata=JSON.parse(storage.getItem('cruisePort.syncAssetMetadata'));
 // Attachment ownership is the existing IDB record's practiceId; no invented asset-sync metadata row.
 storage.setItem('cruisePort.gearList',JSON.stringify(gear));storage.setItem('cruisePort.myApps',JSON.stringify(apps));storage.setItem('cruisePort.syncAssetMetadata',JSON.stringify(metadata));return assets;
}
export async function setupRecovery({indexedDB,root,scopeName='sound-cruise-port-authority-v1-fixture-binary-recovery',seed=true,storage=storageFixture(cleanValues()),checkpoint}={}){
 const owner=await setupProvider({indexedDB,root,scopeName,seed});
 let assets=[];if(seed){assets=await fixtureAssets(storage);await seedLegacyAssets(indexedDB,assets);}
 const engine=await createIsolatedPortBinaryRecovery({scope:createTestAuthorityScope({indexedDB,name:scopeName,partitionId:'fixture-partition'}),indexedDB,storage,checkpoint});
 return {...owner,engine,storage,assets,scopeName,dispose(){engine.dispose();owner.dispose();}};
}
