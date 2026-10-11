// Narrow, read-only CSS source verifier for the audited Port declarations. Not a runtime dependency.
// It supports nested media/supports blocks and balanced rule blocks. Ambiguous sources fail closed.
export function parseRules(text) {
    const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    function visit(body) {
        let start = 0;
        while (start < body.length) {
            const open = body.indexOf('{', start);
            if (open < 0) break;
            const selector = body.slice(start, open).trim();
            let depth = 1, end = open + 1, quote = null;
            for (; end < body.length && depth; end++) {
                const ch = body[end];
                if (quote) { if (ch === '\\') end++; else if (ch === quote) quote = null; }
                else if (ch === '"' || ch === "'") quote = ch;
                else if (ch === '{') depth++;
                else if (ch === '}') depth--;
            }
            if (depth) throw new Error('unbalanced CSS source');
            const contents = body.slice(open + 1, end - 1);
            if (selector.startsWith('@')) visit(contents);
            else {
                const properties = {}, duplicates = [];
                for (const declaration of contents.split(';')) {
                    const colon = declaration.indexOf(':');
                    if (colon < 0) continue;
                    const property = declaration.slice(0, colon).trim();
                    if (Object.hasOwn(properties, property)) duplicates.push(property);
                    properties[property] = declaration.slice(colon + 1).trim();
                }
                rules.push({ selector: normalizeSelector(selector), properties, duplicates });
            }
            start = end;
        }
    }
    visit(css);
    return rules;
}
export function normalizeSelector(selector) { return selector.replace(/\s+/g, ' ').trim(); }
export function declaration(rules, selector, property) {
    const matches = rules.filter(rule => rule.selector === normalizeSelector(selector) && Object.hasOwn(rule.properties, property));
    if (matches.length !== 1) throw new Error(`expected one source: ${selector} ${property}; found ${matches.length}`);
    if (matches[0].duplicates.includes(property)) throw new Error('ambiguous property: ' + property);
    return matches[0].properties[property];
}
export function rootPalette(rules, theme) {
    const palette = {};
    for (const selector of [':root', `:root[data-theme="${theme}"]`]) {
        for (const rule of rules.filter(rule => rule.selector === selector)) {
            for (const [name, value] of Object.entries(rule.properties)) {
                if (name.startsWith('--') || name === 'color-scheme') palette[name] = value;
            }
        }
    }
    return palette;
}
export function resolveValue(value, palette, visited = []) {
    return value.replace(/var\((--[a-z0-9-]+)\)/g, (_, name) => {
        if (!Object.hasOwn(palette, name) || visited.includes(name)) throw new Error('unresolved/cyclic token: ' + name);
        return resolveValue(palette[name], palette, [...visited, name]);
    });
}
export function projectValue(source, rules, theme) {
    const literal = declaration(rules, source.selector, source.property);
    if (literal !== source.literal) throw new Error('source drift: ' + source.selector + ' ' + source.property);
    const palette = rootPalette(rules, theme);
    if (/^:root(?:\[data-theme="[a-z]+"\])?$/.test(source.selector) && palette[source.property] !== literal) {
        throw new Error('root override drift: ' + source.property);
    }
    let value = resolveValue(literal, palette);
    if (source.extract === 'rgb') value = `rgb(${value})`;
    if (source.extract === 'outline-color') {
        if (!value.startsWith('2px solid ')) throw new Error('unsupported focus outline');
        value = value.slice('2px solid '.length);
    }
    if (source.extract === 'border-color') {
        if (!value.startsWith('1px solid ')) throw new Error('unsupported border');
        value = value.slice('1px solid '.length);
    }
    if (source.extract === 'gradient-top' || source.extract === 'gradient-bottom') {
        const match = value.match(/^linear-gradient\(180deg, (#[a-f0-9]+), (#[a-f0-9]+)\)$/);
        if (!match) throw new Error('unsupported primary gradient');
        value = match[source.extract === 'gradient-top' ? 1 : 2];
    }
    return value;
}
export function verifyProjection(projection, sourceText) {
    const rules = parseRules(sourceText);
    for (const token of projection.tokens) {
        for (const theme of projection.themeIds) {
            const source = token.sources[theme];
            if (!source || source.file !== 'apps/cruise-port/style.css') throw new Error('missing/unapproved source');
            if (projectValue(source, rules, theme) !== token.values[theme]) throw new Error(`projection drift: ${token.semanticToken} ${theme}`);
        }
    }
}
export function renderProjectionCss(projection) {
    const lines = ['/* Theme Contract v1: verified Port projection. No legacy UI or paper properties. */'];
    for (const theme of projection.themeIds) {
        lines.push(theme === 'dark' ? ':root, :root[data-theme="dark"] {' : `:root[data-theme="${theme}"] {`);
        for (const token of projection.tokens) lines.push(`    ${token.semanticToken}: ${token.values[theme]};`);
        lines.push('}', '');
    }
    return lines.join('\n');
}
