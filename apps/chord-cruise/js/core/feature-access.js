(function () {
    'use strict';

    /*
     * Standard / Pro の機能境界を一箇所で判定するための基盤。
     *
     * Pro HTMLの <html data-app-edition="Pro"> からeditionを判定する。
     * 認証gateと機能制御は別責務であり、
     * このモジュールはshared/pro-gate.jsを参照しない。
     */

    var FEATURE_NAMES = [
        'customChordCreate',
        'customChordFretboardView',
        'customChordSave',
        'unlimitedLibrary',
        'advancedQuality',
        'advancedCaged',
        'advancedExport'
    ];

    function currentEdition() {
        var documentElement = window.document && window.document.documentElement;
        if (!documentElement) return 'Standard';

        if (documentElement.dataset && documentElement.dataset.appEdition) {
            return documentElement.dataset.appEdition;
        }
        if (typeof documentElement.getAttribute === 'function') {
            return documentElement.getAttribute('data-app-edition') || 'Standard';
        }
        return 'Standard';
    }

    /** Pro用HTMLの data-app-edition を読む。認証状態の判定は含めない。 */
    function isProEdition() {
        return currentEdition() === 'Pro';
    }

    /**
     * 現在の機能権限を返す。保存系と高度分析・高度CAGEDだけを
     * edition別にし、作成・構成音確認・通常指板表示はStandardでも許可する。
     */
    function getFeatureAccess() {
        var access = {};
        FEATURE_NAMES.forEach(function (featureName) {
            access[featureName] = true;
        });
        access.customChordSave = isProEdition();
        access.unlimitedLibrary = isProEdition();
        access.advancedQuality = isProEdition();
        access.advancedCaged = isProEdition();
        return access;
    }

    /** 未登録featureはfalseとして扱い、呼び出し側の誤った解放を防ぐ。 */
    function hasFeature(featureName) {
        var access = getFeatureAccess();
        return Object.prototype.hasOwnProperty.call(access, featureName) && access[featureName] === true;
    }

    /**
     * qualityのcomplexityとFeature Accessを接続する将来用の判定。
     * UI制限はここでは行わず、basic / intermediate / 未知qualityは常に許可する。
     */
    function canAccessQuality(qualityKey) {
        var theory = window.ChordCruise && window.ChordCruise.theory;
        if (!theory || typeof theory.isAdvancedQuality !== 'function') return true;
        return !theory.isAdvancedQuality(qualityKey) || hasFeature('advancedQuality');
    }

    /** CAGED対応済みadvanced qualityのフォーム表示だけをeditionで制御する。 */
    function canAccessCaged(qualityKey) {
        var theory = window.ChordCruise && window.ChordCruise.theory;
        var quality = theory && theory.QUALITIES && theory.QUALITIES[qualityKey];
        if (!quality || !quality.caged || quality.caged.supported !== true) return true;
        if (typeof theory.getQualityComplexity !== 'function') return true;
        return theory.getQualityComplexity(qualityKey) !== 'advanced' || hasFeature('advancedCaged');
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.featureAccess = {
        isProEdition: isProEdition,
        getFeatureAccess: getFeatureAccess,
        hasFeature: hasFeature,
        canAccessQuality: canAccessQuality,
        canAccessCaged: canAccessCaged
    };
}());
