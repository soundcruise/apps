// Test support (not a test). Resolves the Color-theme tokens introduced with the Gray/Light themes
// back to their Dark literals, so production-style assertions keep checking the exact Dark values.
import { readFileSync } from 'node:fs';

export const THEME_SECTION_MARKER = '/* ═══ Color themes: Gray / Light';

export function readStyle() {
    return readFileSync(new URL('./style.css', import.meta.url), 'utf8');
}

export function darkRootTokens(css = readStyle()) {
    const root = css.slice(css.indexOf(':root {') + 7, css.indexOf('}\n'));
    return Object.fromEntries([...root.matchAll(/(--port-[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

// Only tokens added for theming are resolved; pre-existing tokens such as --port-gold stay as written.
const THEMING_TOKEN = /^--port-(?:[a-z-]+-rgb|surface-deep-alt|panel(?:-alt|-deep)?|control(?:-hover|-quiet|-active)?|field|menu(?:-alt|-deep)?|card-press-(?:top|bottom)|bg-(?:top|bottom))$/;

export function readDarkStyle() {
    const css = readStyle();
    const tokens = darkRootTokens(css);
    const body = css.slice(0, css.indexOf(THEME_SECTION_MARKER));
    return body
        .replace(/rgba\(var\((--port-[a-z0-9-]+-rgb)\), ([0-9.]+)\)/g, (match, name, alpha) =>
            THEMING_TOKEN.test(name) ? `rgba(${tokens[name]}, ${alpha})` : match)
        .replace(/var\((--port-[a-z0-9-]+)\)/g, (match, name) => (THEMING_TOKEN.test(name) ? tokens[name] : match));
}
