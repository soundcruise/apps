// The actual Chord owner UI is injected by the isolated localhost entry.
// Public creation=false entries contain no owner UI bundle or local adapter.
import {createOwnerChordPicker} from './owner-chord-panel.mjs';
export function createChordPicker(C,owner){
    if(C.localChordOwner)return createOwnerChordPicker(C,owner);
    return {mount(root){root.textContent='コード入力パネルはローカル開発入口で利用できます。';}};
}
