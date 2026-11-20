import {bindOutsideDismiss} from '../../cruise-studio/js/modules/score-ui.mjs';
import {mountStudioViewer} from '../../cruise-studio/js/viewer-host.mjs';
import {createPaperForms} from '../../cruise-studio/js/modules/sheet-cruise/paper-forms.mjs';
import {createScreenWakeLock} from '../core/wake-lock.mjs';
import {mountOfflineControls} from './offline.mjs';
const options=document.querySelector('.sv-device-options');bindOutsideDismiss(options,{close:()=>options.open=false});
const C=window.CruiseStudio;C.model.configureSchema2();C.audio=C.audioCoordinator.createCoordinator();C.localPaperForms=createPaperForms(window.ChordCruise.ui.fretboard,document);
document.getElementById('score-viewer-host').inert=true;
const lock=document.getElementById('viewer-wake-enabled'),lockStatus=document.getElementById('viewer-wake-status'),retry=document.getElementById('viewer-wake-retry');
const wake=createScreenWakeLock({secure:window.isSecureContext,request:navigator.wakeLock?.request.bind(navigator.wakeLock),visible:()=>document.visibilityState==='visible',changed(s){lock.disabled=!s.supported;retry.hidden=!['denied','released'].includes(s.phase);lockStatus.textContent=({held:'画面ロック防止中',requesting:'画面ロック防止を開始しています…',unsupported:'この環境では画面ロック防止は未対応です。',denied:'画面ロック防止を取得できませんでした。端末の状態を確認してください。',released:'端末によって画面ロック防止が解除されました。',idle:s.enabled?'再生・自動送りの開始時に有効になります。':'画面ロック防止はオフです。'})[s.phase];}});
let offline;
const view=mountStudioViewer(C,document.getElementById('score-viewer-host'),{onPlaybackState:s=>{const playing=!!s&&['playing','counting'].includes(s.phase);wake.setActive(playing);offline?.setPlaying(playing||s?.phase==='loading');}});
offline=mountOfflineControls({button:document.getElementById('viewer-offline-prepare'),status:document.getElementById('viewer-offline-status')});
const back=document.getElementById('viewer-return');
if (new URLSearchParams(location.search).get('from') === 'pro') {
    back.href = document.querySelector('meta[name="pro-entry"]').content;
}
back.onclick=e=>{if(view.requestLeave(()=>back.click())){e.preventDefault();return;}view.deactivate();void wake.dispose();};
lock.onchange=()=>{wake.setEnabled(lock.checked);void view.saveDeviceSettings({wakeEnabled:lock.checked}).catch(()=>{lockStatus.textContent+=' 設定は今回のみ有効です。';});};retry.onclick=()=>wake.retry();
document.addEventListener('visibilitychange',()=>wake.visibilityChanged());window.addEventListener('pagehide',()=>{view.deactivate();void wake.dispose();});
window.addEventListener('pageshow',e=>{if(e.persisted){location.reload();}});
const network=()=>{document.getElementById('viewer-network').textContent=navigator.onLine?'':'オフライン：この端末に保存した譜面を使えます。';};network();window.addEventListener('online',()=>{network();void offline.inspect();});window.addEventListener('offline',network);
try{try{lock.checked=(await view.readDeviceSettings()).wakeEnabled;}catch{}await view.activate();wake.setEnabled(lock.checked);document.getElementById('score-viewer-host').inert=false;document.getElementById('viewer-boot-status').hidden=true;window.CruiseViewer=Object.freeze({view,wake,offline});}catch{document.getElementById('viewer-boot-status').textContent='ビューワーを開始できませんでした。通信がある状態でオフライン準備をやり直してください。';}
