import { getCapabilities } from './cruise-port-capabilities.js?v=0.27.0';
import { METRONOME_DEFAULTS } from './metronome-store.js?v=0.24.0';
import { createProPrompt } from './pro-prompt.js?v=0.27.0';

const prompts = new WeakMap();
export function requestToolPro(feature, documentObject = document) {
    if (!prompts.has(documentObject)) prompts.set(documentObject, createProPrompt(documentObject));
    return prompts.get(documentObject).open({
        tunerCapo: 'カポ機能はPro版で利用できます。',
        practiceCreate: `通常版では練習メニューを${getCapabilities().practiceMenuCreateLimit}件まで登録できます。Pro版では登録枠を拡張できます。`,
        practiceFile: 'ファイルの追加はPro版で利用できます。',
        myAppsCreate: `通常版ではMy Appsを${getCapabilities().myAppsCreateLimit}件まで登録できます。Pro版では登録枠を拡張できます。`,
        customIcon: 'カスタムアイコンの追加・編集はPro版で利用できます。',
        gearPhoto: '機材写真の追加・編集はPro版で利用できます。',
        metronomeAdvanced: 'Pro版では、拍子・リズム・アクセント・音色などを詳しく設定できます。',
        metronomePresetWrite: 'メトロノームの設定保存はPro版で利用できます。'
    }[feature]);
}
export function effectiveCapo(storedCapo, capabilities = getCapabilities()) {
    return capabilities.tunerCapo ? storedCapo : 0;
}
export function effectiveMetronome(stored, capabilities = getCapabilities()) {
    const settings = capabilities.metronomeAdvanced ? stored : { ...METRONOME_DEFAULTS, bpm: stored.bpm };
    return { ...settings, accents: [...settings.accents] };
}
export function mergeMetronomeSettings(stored, effective, capabilities = getCapabilities()) {
    return capabilities.metronomeAdvanced ? { ...effective, accents: [...effective.accents] } : { ...stored, bpm: effective.bpm, accents: [...stored.accents] };
}
