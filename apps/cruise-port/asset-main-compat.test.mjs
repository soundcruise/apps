import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createGearItem,isValidGearItem,loadGearList} from './gear-list-store.js';
import {validatePortLocalCollections} from './port-sync-local-validation.js';
function memory(initial={}){const m=new Map(Object.entries(initial));return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function remote(){
 const item=createGearItem({name:'Synthetic guitar',manufacturer:'Synthetic',category:'guitar',priceText:'',priority:'medium',memo:'',status:'owned'},[],new Date('2026-01-01T00:00:00.000Z'));
 assert(isValidGearItem(item));
 const final={assetId:'final',kind:'gear_photo_final',hash:'a'.repeat(64),mime:'image/webp',byteSize:12,width:512,height:512,objectVersion:1,availability:'available'};
 const asset={version:1,availability:'available',final,source:{...final,assetId:'source',kind:'gear_photo_source',width:900,height:900},crop:{x:0.1,y:0.2,size:0.5}};
 const {photoId,photoSourceId,photoCrop,...wire}=item;
 return {item,asset,wire};
}
function adapter(storage){const context={crypto:webcrypto,TextEncoder,structuredClone,URL,localStorage:storage,SoundCruisePortSync:{validateLocalStorage:validatePortLocalCollections}};context.globalThis=context;vm.runInNewContext(readFileSync(new URL('./port-sync-adapter.js',import.meta.url),'utf8'),context);return context.SoundCruisePortSync;}
test('real main validator accepts remote photo metadata before local binary hydration without losing the crop',async()=>{
 const {item,wire,asset}=remote(),s=memory(),api=adapter(s);
 const snapshot=api.fullSnapshot([{recordType:'gear_item',recordId:item.id,schemaVersion:1,payload:{id:item.id,value:{item:wire,asset}},revision:1,deletedAt:null}]);
 await api.applyRemoteSnapshot(s,snapshot);
 const loaded=loadGearList(s);assert(loaded.ok);const local=loaded.items[0];assert.equal(local.photoId,null);assert.equal(local.photoSourceId,null);assert.equal(local.photoCrop,null);
 const metadata=JSON.parse(s.getItem('cruisePort.syncAssetMetadata')).gear[item.id];assert.deepEqual(metadata.published.crop,asset.crop);assert.equal(metadata.published.final.assetId,asset.final.assetId);assert.equal(metadata.published.source.assetId,asset.source.assetId);
});
test('pending local pair retains its own crop while incoming metadata is held separately',async()=>{
 const {item,wire,asset}=remote(),local={...item,photoId:'local-final',photoSourceId:'local-source',photoCrop:{x:0.2,y:0.3,size:0.6}},s=memory({'cruisePort.gearList':JSON.stringify({version:5,items:[local]}),'cruisePort.syncAssetMetadata':JSON.stringify({version:4,gear:{[item.id]:{pending:{operationId:'pending'}}},myApps:{},attachments:{},releaseQueue:[],discardQueue:[]})}),api=adapter(s);
 await api.applyRemoteSnapshot(s,api.fullSnapshot([{recordType:'gear_item',recordId:item.id,schemaVersion:1,payload:{id:item.id,value:{item:wire,asset}},revision:1,deletedAt:null}]));
 const result=loadGearList(s);assert(result.ok);assert.equal(result.items[0].photoId,local.photoId);assert.deepEqual(result.items[0].photoCrop,local.photoCrop);
});
