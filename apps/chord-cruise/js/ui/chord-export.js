(function () {
    'use strict';

    /* 保存コード指板のPNG書き出し。画面DOMは撮影せず、共通描画モデルから
       生成した自己完結SVGを2倍Canvasへ描画する。 */

    function safePart(value) {
        var text = String(value == null ? '' : value)
            .replace(/♯|#/g, 'sharp')
            .replace(/♭/g, 'flat')
            .replace(/\s+/g, '_')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/[^A-Za-z0-9._\-\u3040-\u30ff\u3400-\u9fff]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^[_\.]+|[_\.]+$/g, '');
        return text || 'chord';
    }

    function rangeToken(fretRange) {
        var range = fretRange || {};
        var includesOpen = range.includesOpen === true;
        var min = typeof range.min === 'number' ? range.min : 0;
        var max = typeof range.max === 'number' ? range.max : min;
        var token;
        if (includesOpen && max === 0) token = 'open';
        else if (min === max) token = min + 'F';
        else token = min + '-' + max + 'F';
        if (includesOpen && max > 0) token += '-open';
        return token;
    }

    function filenameFor(payload) {
        return [
            safePart(payload.chordName),
            safePart(payload.formName),
            safePart(rangeToken(payload.fretRange))
        ].join('_') + '.png';
    }

    function downloadBlob(blob, filename) {
        return new Promise(function (resolve, reject) {
            var url = window.URL.createObjectURL(blob);
            var anchor = document.createElement('a');
            var supportsDownload = typeof anchor.download !== 'undefined';
            if (supportsDownload) {
                anchor.href = url;
                anchor.download = filename;
                anchor.rel = 'noopener';
                anchor.style.display = 'none';
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                window.setTimeout(function () {
                    window.URL.revokeObjectURL(url);
                    resolve({ method: 'download', filename: filename });
                }, 1000);
                return;
            }

            // 古いSafari等でdownload属性が無い場合は画像を新規タブに表示する。
            var opened = window.open(url, '_blank', 'noopener');
            window.setTimeout(function () { window.URL.revokeObjectURL(url); }, 60000);
            if (opened) resolve({ method: 'new-tab', filename: filename });
            else reject(new Error('画像を開けませんでした。ポップアップ設定を確認してください。'));
        });
    }

    function canvasToBlob(canvas) {
        return new Promise(function (resolve, reject) {
            if (typeof canvas.toBlob === 'function') {
                canvas.toBlob(function (blob) {
                    if (blob) resolve(blob);
                    else reject(new Error('PNG画像を生成できませんでした。'));
                }, 'image/png');
                return;
            }
            try {
                var dataUrl = canvas.toDataURL('image/png');
                var binary = window.atob(dataUrl.split(',')[1]);
                var bytes = new Uint8Array(binary.length);
                var i;
                for (i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                resolve(new Blob([bytes], { type: 'image/png' }));
            } catch (err) {
                reject(err);
            }
        });
    }

    function svgToPng(exportSvg) {
        return new Promise(function (resolve, reject) {
            var svgBlob = new Blob([exportSvg.svg], { type: 'image/svg+xml;charset=utf-8' });
            var svgUrl = window.URL.createObjectURL(svgBlob);
            var image = new Image();
            image.onload = function () {
                window.URL.revokeObjectURL(svgUrl);
                try {
                    var scale = exportSvg.scale || 2;
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.round(exportSvg.width * scale);
                    canvas.height = Math.round(exportSvg.height * scale);
                    var context = canvas.getContext('2d');
                    context.setTransform(scale, 0, 0, scale, 0, 0);
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, exportSvg.width, exportSvg.height);
                    context.drawImage(image, 0, 0, exportSvg.width, exportSvg.height);
                    canvasToBlob(canvas).then(function (blob) {
                        resolve({ blob: blob, width: canvas.width, height: canvas.height });
                    }, reject);
                } catch (err) {
                    reject(err);
                }
            };
            image.onerror = function () {
                window.URL.revokeObjectURL(svgUrl);
                reject(new Error('指板図を画像へ変換できませんでした。'));
            };
            image.src = svgUrl;
        });
    }

    function exportPng(payload) {
        var fretboard = window.ChordCruise.ui.fretboard;
        var title = payload.chordName;
        var diagramOptions = Object.assign({}, payload.diagramOptions || {});
        if (typeof diagramOptions.markerLabelScale !== 'number') {
            var settings = window.ChordCruise.state && window.ChordCruise.state.settings;
            diagramOptions.markerLabelScale = fretboard.markerLabelScaleForSize(settings && settings.fretboardMarkerLabelSize);
        }
        var exportSvg = fretboard.buildExportSvg(title, diagramOptions);
        var filename = filenameFor(payload);
        return svgToPng(exportSvg).then(function (result) {
            return downloadBlob(result.blob, filename).then(function (delivery) {
                return {
                    filename: filename,
                    width: result.width,
                    height: result.height,
                    method: delivery.method
                };
            });
        });
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.chordExport = {
        exportPng: exportPng,
        filenameFor: filenameFor,
        safePart: safePart,
        rangeToken: rangeToken
    };
})();
