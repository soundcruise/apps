// Pure text verifier. Never loads/evaluates classic scripts, files, or URLs.
// Mask comments/quoted text while preserving offsets and line breaks, so a
// declaration quoted in documentation or a template cannot become a source.
function codeMask(source) {
    let result = '', mode = 'code';
    for (let i = 0; i < source.length; i++) {
        const ch = source[i], next = source[i + 1];
        if (mode === 'code') {
            if (ch === '/' && (next === '/' || next === '*')) {
                mode = next === '/' ? 'line' : 'block';
                result += '  '; i++;
            } else if (ch === "'" || ch === '"' || ch === '`') {
                mode = ch; result += ' ';
            } else result += ch;
        } else if (mode === 'line' && (ch === '\n' || ch === '\r')) {
            mode = 'code'; result += ch;
        } else if (mode === 'block' && ch === '*' && next === '/') {
            mode = 'code'; result += '  '; i++;
        } else if ((mode === "'" || mode === '"' || mode === '`') && ch === '\\') {
            result += ' ';
            if (next !== undefined) { result += next === '\n' || next === '\r' ? next : ' '; i++; }
        } else if (ch === mode) {
            mode = 'code'; result += ' ';
        } else result += ch === '\n' || ch === '\r' ? ch : ' ';
    }
    return result;
}

export function extractAppVersion(sourceText, versionSource) {
    if (typeof sourceText !== 'string' || versionSource?.extraction !== 'string-constant'
        || !/^[A-Za-z_$][\w$]*$/.test(versionSource.symbol ?? '')) {
        throw new TypeError('Unsupported version extraction rule');
    }
    const symbol = versionSource.symbol.replace(/[$]/g, '\\$');
    // Only a complete, single-line literal declaration is supported; no ASI.
    const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?(?:const|let|var)[ \\t]+${symbol}[ \\t]*=[ \\t]*(['"])(\\d+\\.\\d+\\.\\d+)\\1[ \\t]*;[ \\t]*(?://[^\\r\\n]*)?\\r?$`, 'gm');
    const mask = codeMask(sourceText);
    const declarations = [...sourceText.matchAll(pattern)].filter(match =>
        /\b(?:const|let|var)\b/.test(mask.slice(match.index, match.index + match[0].indexOf('=')))
    );
    if (declarations.length !== 1) {
        throw new Error(`Expected one literal declaration for ${versionSource.symbol}; found ${declarations.length}`);
    }
    return declarations[0][2];
}

export function verifyComponentVersion(component, sourceText) {
    const source = component.versionSource;
    if (source.type !== 'esm-import' && source.type !== 'source-mirror') {
        throw new TypeError('Unsupported version source type');
    }
    if (source.type === 'source-mirror' && source.expectedValue !== component.appVersion) {
        throw new Error(`Invalid mirror projection: ${component.componentId}`);
    }
    const actual = extractAppVersion(sourceText, source);
    if (actual !== component.appVersion) {
        throw new Error(`Version mismatch: ${component.componentId}: source=${actual}, catalog=${component.appVersion}`);
    }
    return actual;
}
