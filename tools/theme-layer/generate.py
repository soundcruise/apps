#!/usr/bin/env python3
"""Color-theme layer generator for the Cruise apps (Charcoal / Gray / Light).

Dark is the production CSS and is never edited. This tool reads every stylesheet an app
page loads (in load order) and writes ONE extra stylesheet that mirrors each color
declaration under `:root:is([data-theme="charcoal"], [data-theme="gray"], [data-theme="light"])`.

Why this keeps the cascade intact:
  * every mirrored selector is the original selector + (0,2,0) specificity, emitted in the
    original source order, so among mirrored rules the winner is the same rule as in Dark,
    and it always beats every original rule;
  * physical objects, functional colors and the Pro gate are mirrored with their Dark
    values unchanged (identity), so generic recolors never leak onto them;
  * shorthands are mirrored as color longhands only (border-color, background-color, ...),
    so no geometry ever changes.

Mapped values are emitted as `var(--tl-N)`; each theme defines its own --tl-N values.
Hand-tuned rules live below the OVERRIDES marker of the output file and are preserved.

Usage: python3 tools/theme-layer/generate.py <app>   (apps are configured in apps.py)
"""
import colorsys
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apps import APPS  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
THEMES = ('charcoal', 'gray', 'light')
# While the shared Pro gate is up (pro-gate.js sets body.pro-gate-active) the whole layer is off, so the
# gate and the page behind its translucent backdrop render exactly as Dark. Adds the same specificity to
# every mirrored rule, so their relative cascade is unchanged.
GATE_OFF = ':not(:has(> body.pro-gate-active))'
THEME_SCOPE = ':root:is([data-theme="charcoal"], [data-theme="gray"], [data-theme="light"])' + GATE_OFF
OVERRIDES_MARKER = '/* ═══ Hand-tuned overrides'

# ── CSS parsing ─────────────────────────────────────────────────────────────────────────


def strip_comments(css):
    out, i, n = [], 0, len(css)
    while i < n:
        if css.startswith('/*', i):
            j = css.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        ch = css[i]
        if ch in '"\'':
            j = i + 1
            while j < n and css[j] != ch:
                j += 2 if css[j] == '\\' else 1
            out.append(css[i:j + 1])
            i = j + 1
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def find_block_end(css, start):
    """css[start] == '{'; return index of the matching '}'."""
    depth, i, n = 0, start, len(css)
    while i < n:
        ch = css[i]
        if ch in '"\'':
            j = i + 1
            while j < n and css[j] != ch:
                j += 2 if css[j] == '\\' else 1
            i = j + 1
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError('unbalanced braces')


def parse(css):
    """Returns a list of nodes: ('rule', selector, decls) | ('at', prelude, children) | ('keyframes', name, body)."""
    nodes, i, n = [], 0, len(css)
    while i < n:
        while i < n and css[i] in ' \t\r\n;':
            i += 1
        if i >= n:
            break
        brace = css.find('{', i)
        semi = css.find(';', i)
        if css[i] == '@' and (brace < 0 or (0 <= semi < brace)):
            i = semi + 1  # @import / @charset
            continue
        if brace < 0:
            break
        prelude = css[i:brace].strip()
        end = find_block_end(css, brace)
        body = css[brace + 1:end]
        if prelude.startswith('@'):
            low = prelude.lower()
            if re.match(r'@(-webkit-)?keyframes', low):
                nodes.append(('keyframes', prelude.split(None, 1)[1].strip(), body))
            elif low.startswith(('@media', '@supports', '@layer', '@container')):
                nodes.append(('at', prelude, parse(body)))
            # @font-face, @page ... carry no themable colors
        else:
            nodes.append(('rule', prelude, parse_decls(body)))
        i = end + 1
    return nodes


def split_top(s, sep):
    parts, depth, cur, quote = [], 0, [], None
    for ch in s:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in '"\'':
            quote = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == sep and depth == 0:
            parts.append(''.join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append(''.join(cur))
    return parts


def parse_decls(body):
    decls = []
    for part in split_top(body, ';'):
        if ':' not in part:
            continue
        prop, value = part.split(':', 1)
        prop, value = prop.strip().lower() if not prop.strip().startswith('--') else prop.strip(), value.strip()
        if not prop or not value:
            continue
        important = False
        if re.search(r'!\s*important\s*$', value, re.I):
            important = True
            value = re.sub(r'\s*!\s*important\s*$', '', value, flags=re.I)
        decls.append((prop, value, important))
    return decls


def outer_vars(text):
    """Top-level var(...) expressions with balanced parentheses."""
    found, i = [], 0
    while True:
        j = text.find('var(', i)
        if j < 0:
            return found
        if j > 0 and (text[j - 1].isalnum() or text[j - 1] in '-_'):
            i = j + 4
            continue
        depth, k = 0, j + 3
        while k < len(text):
            if text[k] == '(':
                depth += 1
            elif text[k] == ')':
                depth -= 1
                if depth == 0:
                    break
            k += 1
        found.append(text[j:k + 1])
        i = k + 1


# ── Colors ──────────────────────────────────────────────────────────────────────────────

NAMED = {
    'white': (255, 255, 255), 'black': (0, 0, 0), 'red': (255, 0, 0), 'gold': (255, 215, 0),
    'orange': (255, 165, 0), 'yellow': (255, 255, 0), 'green': (0, 128, 0), 'lime': (0, 255, 0),
    'blue': (0, 0, 255), 'gray': (128, 128, 128), 'grey': (128, 128, 128), 'silver': (192, 192, 192),
    'cyan': (0, 255, 255), 'aqua': (0, 255, 255), 'magenta': (255, 0, 255), 'pink': (255, 192, 203),
    'purple': (128, 0, 128), 'navy': (0, 0, 128), 'teal': (0, 128, 128), 'crimson': (220, 20, 60),
    'tomato': (255, 99, 71), 'whitesmoke': (245, 245, 245), 'gainsboro': (220, 220, 220),
    'lightgray': (211, 211, 211), 'lightgrey': (211, 211, 211), 'darkgray': (169, 169, 169),
    'dimgray': (105, 105, 105), 'goldenrod': (218, 165, 32), 'orangered': (255, 69, 0),
    'limegreen': (50, 205, 50), 'dodgerblue': (30, 144, 255), 'deepskyblue': (0, 191, 255),
    'hotpink': (255, 105, 180), 'salmon': (250, 128, 114), 'coral': (255, 127, 80),
    'ivory': (255, 255, 240), 'beige': (245, 245, 220), 'khaki': (240, 230, 140),
    'darkred': (139, 0, 0), 'darkblue': (0, 0, 139), 'darkgreen': (0, 100, 0), 'violet': (238, 130, 238),
    'skyblue': (135, 206, 235), 'lightblue': (173, 216, 230), 'royalblue': (65, 105, 225),
}
COLOR_RE = re.compile(
    r'(?<![\w-])#[0-9a-fA-F]{3,8}(?![\w-])|(?<![\w-])(?:rgba?|hsla?)\([^()]*\)|(?<![\w#-])(?:' + '|'.join(sorted(NAMED, key=len, reverse=True)) + r')(?![\w-])',
    re.I)


def parse_color(tok):
    t = tok.strip().lower()
    if t.startswith('#'):
        h = t[1:]
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h)
        if len(h) not in (6, 8):
            return None
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (r, g, b, a)
    m = re.match(r'(rgba?|hsla?)\((.*)\)$', t)
    if m:
        if 'var(' in m.group(2):
            return None
        args = [x for x in re.split(r'[\s,/]+', m.group(2).strip()) if x]
        if len(args) < 3:
            return None

        def num(x, scale):
            return float(x[:-1]) * scale / 100 if x.endswith('%') else float(x.replace('deg', ''))
        try:
            if m.group(1).startswith('rgb'):
                r, g, b = (num(x, 255) for x in args[:3])
            else:
                hue, sat, lig = num(args[0], 360), num(args[1], 1), num(args[2], 1)
                if not args[1].endswith('%'):
                    sat /= 100
                if not args[2].endswith('%'):
                    lig /= 100
                rr, gg, bb = colorsys.hls_to_rgb((hue % 360) / 360, lig, sat)
                r, g, b = rr * 255, gg * 255, bb * 255
            a = num(args[3], 1) if len(args) > 3 else 1.0
        except ValueError:
            return None
        return (r, g, b, max(0.0, min(1.0, a)))
    if t in NAMED:
        return NAMED[t] + (1.0,)
    return None


def fmt(c):
    r, g, b, a = c
    r, g, b = (int(round(max(0, min(255, v)))) for v in (r, g, b))
    a = round(max(0.0, min(1.0, a)), 3)
    if a >= 1:
        return '#%02x%02x%02x' % (r, g, b)
    return 'rgba(%d, %d, %d, %s)' % (r, g, b, ('%.3f' % a).rstrip('0').rstrip('.'))


def srgb_to_lin(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def lin_to_srgb(v):
    v = max(0.0, min(1.0, v))
    return 255 * (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055)


def lum(c):
    r, g, b = (srgb_to_lin(v) for v in c[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def blend(top, bottom):
    a = top[3]
    return (top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1.0)


def to_lab(c):
    r, g, b = (srgb_to_lin(v) for v in c[:3])
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116
    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def from_lab(L, A, B, alpha=1.0):
    fy = (L + 16) / 116
    fx, fz = fy + A / 500, fy - B / 200

    def finv(t):
        return t ** 3 if t ** 3 > 216 / 24389 else (116 * t - 16) / (24389 / 27)
    x, y, z = finv(fx) * 0.95047, finv(fy), finv(fz) * 1.08883
    r = 3.2406 * x - 1.5372 * y - 0.4986 * z
    g = -0.9689 * x + 1.8758 * y + 0.0415 * z
    b = 0.0557 * x - 0.2040 * y + 1.0570 * z
    return (lin_to_srgb(r), lin_to_srgb(g), lin_to_srgb(b), alpha)


def chroma(c):
    _, a, b = to_lab(c)
    return math.hypot(a, b)


def interp(points, x):
    if x <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return points[-1][1]


# ── Theme mapping ───────────────────────────────────────────────────────────────────────


class Mapper:
    def __init__(self, app):
        self.app = app
        self.dark_surface = parse_color(app['dark_surface'])
        self.dark_bg = parse_color(app['dark_bg'])
        L0 = to_lab(self.dark_bg)[0]
        L1 = to_lab(self.dark_surface)[0]
        self.pal = {}
        for theme in THEMES:
            p = dict(app['palette'][theme])
            for key in ('bg', 'surface', 'raised', 'text', 'muted', 'ink', 'scrim'):
                p[key + '_c'] = parse_color(p[key])
            lb, ls, lr = (to_lab(p[k + '_c'])[0] for k in ('bg', 'surface', 'raised'))
            if theme == 'light':
                p['elev'] = [(0, lb - 3), (L0, lb), (L1, ls), (L1 + 6, lr), (L1 + 16, lr - 3), (70, lr - 6)]
            else:
                step = 5 if theme == 'charcoal' else 3
                p['elev'] = [(0, lb - step), (L0, lb), (L1, ls), (L1 + 6, lr), (L1 + 16, lr + step), (70, lr + 2 * step)]
            p['max_text'] = contrast(p['text_c'], p['surface_c'])
            self.pal[theme] = p

    # neutral = low chroma
    def kind(self, c):
        L, A, B = to_lab(c)
        ch = math.hypot(A, B)
        if ch >= 18 and L >= 22:
            return 'accent'
        if L >= 62 and ch < 18:
            return 'light'
        return 'dark'

    def elevate(self, theme, c, extra=0.0):
        p = self.pal[theme]
        L, A, B = to_lab(c)
        Lt = interp(p['elev'], L) + extra
        ch = math.hypot(A, B)
        keep = 0.35 if ch >= 18 else 0.3
        cap = 14 if ch >= 18 else 6
        if ch > 0:
            scale = min(ch * keep, cap) / ch
        else:
            scale = 0
        tint = to_lab(p['surface_c'])
        return from_lab(Lt, A * scale + tint[1] * 0.6, B * scale + tint[2] * 0.6, c[3])

    def ink(self, theme, alpha):
        ink = self.pal[theme]['ink_c']
        return (ink[0], ink[1], ink[2], max(0.0, min(1.0, alpha)))

    def text_for_ratio(self, theme, ratio):
        """Solid neutral text reaching the requested contrast on every theme surface (bounded)."""
        p = self.pal[theme]
        surface, text = p['surface_c'], p['text_c']
        refs = [p['bg_c'], p['surface_c'], p['raised_c']]
        ratio = min(ratio, min(contrast(text, r) for r in refs))
        lo, hi = 0.0, 1.0
        for _ in range(30):
            mid = (lo + hi) / 2
            c = (surface[0] + (text[0] - surface[0]) * mid, surface[1] + (text[1] - surface[1]) * mid,
                 surface[2] + (text[2] - surface[2]) * mid, 1.0)
            if min(contrast(c, r) for r in refs) < ratio:
                lo = mid
            else:
                hi = mid
        m = hi
        return (surface[0] + (text[0] - surface[0]) * m, surface[1] + (text[1] - surface[1]) * m,
                surface[2] + (text[2] - surface[2]) * m, 1.0)

    def accent_for_ratio(self, theme, c, ratio, refs):
        """Same hue; move lightness until contrast against every ref reaches `ratio`."""
        L, A, B = to_lab(c)
        light_ref = lum(refs[0]) > 0.18
        best = c
        for step in range(0, 101):
            Lt = (L - step) if light_ref else (L + step)
            if Lt < 2 or Lt > 99:
                break
            shrink = 1.0
            cand = from_lab(Lt, A * shrink, B * shrink, 1.0)
            # gamut: reduce chroma until the channel values stay in range
            for _ in range(20):
                raw_ok = all(0 <= v <= 255 for v in cand[:3])
                if raw_ok:
                    break
                shrink *= 0.9
                cand = from_lab(Lt, A * shrink, B * shrink, 1.0)
            best = cand
            if min(contrast(cand, r) for r in refs) >= ratio:
                break
        return (best[0], best[1], best[2], 1.0)

    def map(self, theme, role, c, ctx):
        if ctx.get('identity'):
            return c
        if ctx.get('clip_text') and role == 'bg':
            return self.map(theme, 'text', c, {})
        p = self.pal[theme]
        k = self.kind(c)
        a = c[3]
        if a == 0:
            return c
        refs = [p['surface_c'], p['bg_c'], p['raised_c']]
        if role == 'text':
            if ctx.get('on_fill'):
                return c
            if k == 'dark' and to_lab(c)[0] < 40:
                return c  # dark ink on a light chip / accent fill
            eff = blend(c, self.dark_surface)
            r0 = contrast(eff, self.dark_surface)
            if k == 'accent':
                target = 5.5 if r0 >= 4.5 else max(3.0, min(r0 * 1.25, 5.0))
                if theme == 'charcoal' and min(contrast(c, r) for r in refs) >= target:
                    return (c[0], c[1], c[2], 1.0) if a < 1 else c
                return self.accent_for_ratio(theme, (c[0], c[1], c[2], 1.0), target, refs)
            # neutral text keeps its Dark contrast (bounded) plus a margin for wells / dimmed panels
            target = max(5.4, min(r0 * 1.2, p['max_text'])) if r0 >= 4.5 else min(r0 * 1.25, 5.0)
            return self.text_for_ratio(theme, target)
        if role in ('bg', 'border'):
            if k == 'accent':
                if role == 'border' and theme != 'charcoal' and to_lab(c)[0] > 75:
                    L, A, B = to_lab(c)
                    return from_lab(55, A, B, a)
                return c
            if k == 'light':
                if ctx.get('clip_text'):
                    return self.map(theme, 'text', c, {})
                if role == 'border':
                    if theme == 'charcoal':
                        return c
                    return self.ink(theme, min(0.55, max(0.1, a * 1.4)) if a < 0.9 else 0.32)
                if a >= 0.35:
                    return c  # solid light chip/button stays
                if theme == 'charcoal':
                    return (c[0], c[1], c[2], a * 0.6)
                if theme == 'gray':
                    return (255, 255, 255, min(0.9, a * 2.6))
                return self.ink(theme, a * 0.5)
            # dark (neutral or deep tinted)
            if ctx.get('clip_text'):
                return c
            L = to_lab(c)[0]
            if L < 3 and 0.9 <= a < 1 and role == 'bg':  # near-opaque black = a page surface, not a scrim
                return self.elevate(theme, c)
            if L < 3 and a < 1:  # black overlays: scrims / wells
                if role == 'border':
                    return c if theme == 'charcoal' else self.ink(theme, a * 0.6)
                if a >= 0.45:
                    sc = p['scrim_c']
                    return (sc[0], sc[1], sc[2], min(1.0, sc[3] * a / 0.6))
                if theme == 'charcoal':
                    return c
                return self.ink(theme, a * 0.3)
            if role == 'border':
                if theme == 'charcoal':
                    return self.elevate(theme, c, 8)
                return self.ink(theme, 0.22 if a >= 0.9 else min(0.4, a * 0.4))
            return self.elevate(theme, c)
        if role == 'shadow':
            if k == 'light':
                return c
            f = {'charcoal': 0.9, 'gray': 0.45, 'light': 0.35}[theme]
            if k == 'accent':
                f = {'charcoal': 1.0, 'gray': 0.6, 'light': 0.5}[theme]
            return (c[0], c[1], c[2], a * f)
        return c


# ── Declaration handling ────────────────────────────────────────────────────────────────

TEXT_PROPS = {'color', '-webkit-text-fill-color', 'caret-color', 'text-decoration-color', 'fill', 'stroke',
              '-webkit-text-stroke-color', 'text-emphasis-color'}
BG_PROPS = {'background-color', 'background-image', 'background'}
BORDER_COLOR_PROPS = {'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color',
                      'border-left-color', 'border-block-color', 'border-inline-color', 'border-block-start-color',
                      'border-block-end-color', 'border-inline-start-color', 'border-inline-end-color',
                      'outline-color', 'column-rule-color'}
BORDER_SHORTHANDS = {'border': 'border-color', 'border-top': 'border-top-color', 'border-right': 'border-right-color',
                     'border-bottom': 'border-bottom-color', 'border-left': 'border-left-color',
                     'border-block': 'border-block-color', 'border-inline': 'border-inline-color',
                     'border-block-start': 'border-block-start-color', 'border-block-end': 'border-block-end-color',
                     'border-inline-start': 'border-inline-start-color', 'border-inline-end': 'border-inline-end-color',
                     'outline': 'outline-color', 'column-rule': 'column-rule-color'}
SHADOW_PROPS = {'box-shadow', 'text-shadow'}
OTHER_COLOR_PROPS = {'accent-color', 'filter', '-webkit-tap-highlight-color', 'scrollbar-color', 'color-scheme'}
ANIMATION_PROPS = {'animation', 'animation-name'}


class Generator:
    def __init__(self, app_key):
        self.key = app_key
        self.app = APPS[app_key]
        self.mapper = Mapper(self.app)
        self.tokens = {}  # (theme-independent key) -> index
        self.token_values = []  # list of {theme: value}
        self.root_vars = {}  # themable :root color vars (text resolution)
        self.all_root_vars = {}  # every :root var (gradient detection)
        self.colored_keyframes = {}
        self.object_re = re.compile(self.app['object_selectors']) if self.app.get('object_selectors') else None
        self.identity_files = set(self.app.get('identity_files', []))

    def token(self, role, c, ctx):
        ident = ctx.get('identity', False)
        key = (role, fmt(c), bool(ctx.get('on_fill')), bool(ctx.get('clip_text')), ident)
        if key not in self.tokens:
            self.tokens[key] = len(self.token_values)
            self.token_values.append({t: fmt(self.mapper.map(t, role, c, ctx)) for t in THEMES})
        return 'var(--tl-%d)' % self.tokens[key]

    def resolve_text_vars(self, value, ctx):
        """Replace var(--root-color[, fallback]) in text colors by a mapped token (balanced parens)."""
        out, i = [], 0
        while True:
            j = value.find('var(', i)
            if j < 0:
                out.append(value[i:])
                break
            depth, k = 0, j + 3
            while k < len(value):
                if value[k] == '(':
                    depth += 1
                elif value[k] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                k += 1
            inner = value[j + 4:k]
            name = inner.split(',', 1)[0].strip()
            out.append(value[i:j])
            if (name in self.all_root_vars and name not in self.app.get('identity_text_vars', [])
                    and parse_color(self.all_root_vars[name]) is not None):
                out.append(self.token('text', parse_color(self.all_root_vars[name]), ctx))
            else:
                out.append(value[j:k + 1])
            i = k + 1
        return ''.join(out)

    URL_RE = re.compile(r'url\((?:"[^"]*"|\'[^\']*\'|[^()]*)\)')
    URL_COLOR_RE = re.compile(r"(?<![\w-])(?:%23[0-9a-fA-F]{6}|%23[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|white|black)(?![\w-])")

    def url_token(self, url, ctx):
        """Inline SVG icons: recolor their strokes/fills per theme as one token per url."""
        if not self.URL_COLOR_RE.search(url):
            return url
        key = ('url', url, bool(ctx.get('on_fill')))
        if key not in self.tokens:
            self.tokens[key] = len(self.token_values)
            vals = {}
            for theme in THEMES:
                def repl(m):
                    raw = m.group(0)
                    col = parse_color(raw.replace('%23', '#'))
                    if col is None:
                        return raw
                    mapped = fmt(self.mapper.map(theme, 'text', col, ctx))
                    if mapped.startswith('rgba'):
                        return raw
                    return mapped.replace('#', '%23') if raw.startswith('%23') or '%3c' in url.lower() else mapped
                vals[theme] = self.URL_COLOR_RE.sub(repl, url)
            self.token_values.append(vals)
        return 'var(--tl-%d)' % self.tokens[key]

    def map_value(self, role, value, ctx):
        if ctx.get('identity'):
            return value
        # protect url(...) (data: SVG icons) from the plain color pass
        urls = []

        def stash(m):
            urls.append(self.url_token(m.group(0), ctx) if role in ('bg', 'text') else m.group(0))
            return '\u0000%d\u0000' % (len(urls) - 1)
        value = self.URL_RE.sub(stash, value)
        if role == 'text' and 'var(' in value:
            value = self.resolve_text_vars(value, ctx)

        def repl(m):
            c = parse_color(m.group(0))
            if c is None:
                return m.group(0)
            if role == 'shadow' or role == 'bg' or role == 'border' or role == 'text':
                return self.token(role, c, ctx)
            return m.group(0)
        out = COLOR_RE.sub(repl, value)
        return re.sub('\u0000(\\d+)\u0000', lambda m: urls[int(m.group(1))], out)

    def resolve_var(self, name, role, ctx):
        """Text colors given as var(--root-token) are resolved so accent text can be darkened."""
        if name in self.all_root_vars and not ctx.get('identity') and name not in self.app.get('identity_text_vars', []):
            c = parse_color(self.all_root_vars[name])
            if c is not None:
                return self.token(role, c, ctx)
        return 'var(%s)' % name

    @staticmethod
    def has_color(value):
        return bool(COLOR_RE.search(value)) or 'var(' in value

    def rule_context(self, selector, decls, identity):
        ctx = {'identity': identity}
        values = {p: v for p, v, _ in decls}
        clip = values.get('-webkit-background-clip', values.get('background-clip', ''))
        if 'text' in clip:
            ctx['clip_text'] = True
        bg = values.get('background') or values.get('background-color') or values.get('background-image') or ''
        bg = re.sub(r'var\(\s*(--[\w-]+)[^()]*\)', lambda m: self.all_root_vars.get(m.group(1), m.group(0)), bg)
        fills = [parse_color(m.group(0)) for m in COLOR_RE.finditer(bg)]
        fills = [c for c in fills if c is not None]
        if fills and not ctx.get('clip_text'):
            strong = [c for c in fills if c[3] >= 0.6 and (self.mapper.kind(c) in ('accent', 'light'))]
            if strong and len(strong) * 2 >= len(fills):
                ctx['on_fill'] = True
        return ctx

    def mirror_decls(self, decls, ctx):
        out = []
        for prop, value, important in decls:
            imp = ' !important' if important else ''
            low = value.lower()
            if prop.startswith('--'):
                if prop in self.app.get('identity_vars', []) or ctx.get('identity'):
                    continue
                role = self.app.get('var_roles', {}).get(prop)
                if role is None or not COLOR_RE.search(value):
                    continue
                out.append('%s: %s%s' % (prop, self.map_value(role, value, ctx), imp))
                continue
            if prop in TEXT_PROPS:
                out.append('%s: %s%s' % (prop, self.map_value('text', value, ctx), imp))
            elif prop in BORDER_COLOR_PROPS:
                out.append('%s: %s%s' % (prop, self.map_value('border', value, ctx), imp))
            elif prop in BORDER_SHORTHANDS:
                ov = outer_vars(value)
                outside = value
                for v in ov:
                    outside = outside.replace(v, ' ')
                colors = [m.group(0) for m in COLOR_RE.finditer(outside)]
                if colors:
                    col = self.map_value('border', colors[-1], ctx)
                elif ov:
                    col = self.map_value('border', ov[-1], ctx)
                elif re.search(r'\b(transparent|currentcolor|inherit|initial|unset)\b', low):
                    col = re.search(r'\b(transparent|currentcolor|inherit|initial|unset)\b', low).group(1)
                else:
                    col = 'currentcolor'
                out.append('%s: %s%s' % (BORDER_SHORTHANDS[prop], col, imp))
            elif prop in ('background', 'background-color', 'background-image'):
                if prop == 'background':
                    if low.strip() in ('inherit', 'initial', 'unset', 'none'):
                        kw = 'none' if low.strip() == 'none' else low.strip()
                        out.append('background-image: %s%s' % (kw, imp))
                        out.append('background-color: %s%s' % ('transparent' if kw == 'none' else kw, imp))
                        continue
                    layers = split_top(value, ',')
                    images, color = [], 'transparent'
                    for idx, layer in enumerate(layers):
                        img = re.search(r'(?:repeating-)?(?:linear|radial|conic)-gradient\(.*\)|url\([^)]*\)', layer)
                        rest = layer
                        if img:
                            images.append(img.group(0))
                            rest = layer.replace(img.group(0), ' ')
                        ovs = outer_vars(rest)
                        if ovs and not img:
                            name = re.match(r'var\(\s*(--[\w-]+)', ovs[0]).group(1)
                            resolved = self.all_root_vars.get(name, '')
                            if re.search(r'gradient\(|url\(', resolved) or idx < len(layers) - 1:
                                images.append(ovs[0])
                                rest = rest.replace(ovs[0], ' ')
                                ovs = ovs[1:]
                        if idx == len(layers) - 1:
                            outside = rest
                            for v in ovs:
                                outside = outside.replace(v, ' ')
                            cm = COLOR_RE.search(outside)
                            kw = re.search(r'(?<![\w-])(transparent|currentcolor)(?![\w-])', outside.lower())
                            if cm:
                                color = self.map_value('bg', cm.group(0), ctx)
                            elif ovs:
                                color = self.map_value('bg', ovs[-1], ctx)
                            elif kw:
                                color = kw.group(1)
                        elif re.search(r'(?<![\w-])none(?![\w-])', layer) and not img:
                            images.append('none')
                    image = ', '.join(self.map_value('bg', im, ctx) for im in images) if images else 'none'
                    out.append('background-image: %s%s' % (image, imp))
                    out.append('background-color: %s%s' % (color, imp))
                else:
                    out.append('%s: %s%s' % (prop, self.map_value('bg', value, ctx), imp))
            elif prop in SHADOW_PROPS:
                out.append('%s: %s%s' % (prop, self.map_value('shadow', value, ctx), imp))
            elif prop == 'filter':
                if 'drop-shadow' in low and COLOR_RE.search(value):
                    out.append('%s: %s%s' % (prop, self.map_value('shadow', value, ctx), imp))
            elif prop == 'color-scheme':
                continue
            elif prop in ANIMATION_PROPS:
                names = self.colored_keyframes
                if not names:
                    continue
                found = [nm for nm in names if re.search(r'(?<![\w-])%s(?![\w-])' % re.escape(nm), value)]
                if prop == 'animation-name' or found or low.strip() == 'none':
                    if prop == 'animation':
                        parts = split_top(value, ',')
                        mapped = []
                        for part in parts:
                            nm = next((n for n in names if re.search(r'(?<![\w-])%s(?![\w-])' % re.escape(n), part)), None)
                            if nm:
                                mapped.append(nm + ('' if ctx.get('identity') else '__tl'))
                            else:
                                words = [w for w in part.split() if re.match(r'^[a-zA-Z_-][\w-]*$', w) and w.lower() not in ANIM_KEYWORDS]
                                mapped.append(words[0] if words else 'none')
                        out.append('animation-name: %s%s' % (', '.join(mapped), imp))
                    else:
                        mapped = []
                        for part in split_top(value, ','):
                            nm = part.strip()
                            mapped.append(nm + ('__tl' if nm in names and not ctx.get('identity') else ''))
                        out.append('animation-name: %s%s' % (', '.join(mapped), imp))
        return out

    def scoped_selector(self, sel):
        sel = sel.strip()
        m = re.match(r'^(:root|html)(?![\w-])', sel)
        if m:
            rest = sel[m.end():]
            return THEME_SCOPE + rest
        return THEME_SCOPE + ' ' + sel

    def walk(self, nodes, file_identity, out, depth=0):
        for node in nodes:
            if node[0] == 'at':
                inner = []
                self.walk(node[2], file_identity, inner, depth + 1)
                if inner:
                    out.append('%s {\n%s\n}' % (node[1], '\n'.join(inner)))
                continue
            if node[0] != 'rule':
                continue
            _, selector, decls = node
            if selector.startswith('@') or re.match(r'^(from|to|\d+(\.\d+)?%)(\s*,|$)', selector):
                continue
            parts = [s.strip() for s in split_top(selector, ',') if s.strip()]
            plain, objects = [], []
            for s in parts:
                is_obj = file_identity or (self.object_re is not None and self.object_re.search(s))
                (objects if is_obj else plain).append(s)
            for group, identity in ((plain, False), (objects, True)):
                if not group:
                    continue
                ctx = self.rule_context(selector, decls, identity)
                body = self.mirror_decls(decls, ctx)
                if not body:
                    continue
                sels = ',\n'.join(self.scoped_selector(s) for s in group)
                out.append('%s {\n    %s;\n}' % (sels, ';\n    '.join(body)))

    def collect(self, nodes):
        for node in nodes:
            if node[0] == 'rule' and re.match(r'^(:root|html)$', node[1].strip()):
                for prop, value, _ in node[2]:
                    if prop.startswith('--'):
                        self.all_root_vars[prop] = value
                        if prop not in self.app.get('identity_vars', []):
                            self.root_vars[prop] = value
            elif node[0] == 'keyframes':
                if COLOR_RE.search(node[2]) and node[1] not in self.app.get('identity_keyframes', []):
                    self.colored_keyframes[node[1]] = node[2]
            elif node[0] == 'at':
                self.collect(node[2])

    def keyframes(self, out):
        for name, body in self.colored_keyframes.items():
            frames = []
            for sel, decls in ((s, d) for kind, s, d in parse(body) if kind == 'rule'):
                ctx = {'identity': False}
                mapped = self.mirror_decls(decls, ctx)
                rest = [(p, v, i) for p, v, i in decls if not (p in TEXT_PROPS or p in BG_PROPS or p in SHADOW_PROPS or p in BORDER_COLOR_PROPS or p in BORDER_SHORTHANDS or p == 'filter')]
                body_parts = ['%s: %s%s' % (p, v, ' !important' if i else '') for p, v, i in rest] + mapped
                frames.append('    %s { %s; }' % (sel, '; '.join(body_parts)))
            out.append('@keyframes %s__tl {\n%s\n}' % (name, '\n'.join(frames)))

    def run(self):
        sources = []
        for rel in self.app['sources']:
            path = os.path.join(ROOT, rel['path'])
            text = open(path, encoding='utf-8').read()
            if rel.get('inline_style'):
                blocks = re.findall(r'<style[^>]*>(.*?)</style>', text, re.S)
                text = '\n'.join(blocks)
            sources.append((rel, parse(strip_comments(text))))
        for _, nodes in sources:
            self.collect(nodes)
        body = []
        for rel, nodes in sources:
            chunk = []
            self.walk(nodes, rel.get('identity', False), chunk)
            if chunk:
                body.append('/* ── mirrored from %s ── */' % rel['path'])
                body.extend(chunk)
        pins = self.app.get('object_pins', [])
        if pins:
            body.append('/* ── object roots keep the Dark ink and surface tokens they inherit ── */')
            decl = (['color: %s' % self.app['dark_text']] if self.app.get('pin_color', True) else []) + \
                ['color-scheme: %s' % self.app.get('dark_color_scheme', 'normal')]
            for var in self.app.get('var_roles', {}):
                if var in self.all_root_vars:
                    decl.append('%s: %s' % (var, self.all_root_vars[var]))
            body.append('%s {\n    %s;\n}' % (',\n'.join(self.scoped_selector(x) for x in pins), ';\n    '.join(decl)))
        panels = self.app.get('object_panel_bg')
        if panels:
            body.append('/* ── functional panels keep an opaque Dark ground under their own gradients ── */')
            for panel in (panels if isinstance(panels, list) else [panels]):
                body.append('%s {\n    background-color: %s !important;\n}' % (',\n'.join(self.scoped_selector(x) for x in panel['selectors']), panel['color']))
        frames = []
        self.keyframes(frames)
        token_blocks = []
        for theme in THEMES:
            p = self.app['palette'][theme]
            lines = ['    color-scheme: %s;' % ('dark' if theme == 'charcoal' else 'light')]
            lines += ['    --tl-%s: %s;' % (k, p[k]) for k in ('bg', 'surface', 'raised', 'text', 'muted', 'ink', 'scrim')]
            for name, col in self.app.get('named_text_tokens', {}).items():
                lines.append('    %s: %s;' % (name, fmt(self.mapper.map(theme, 'text', parse_color(col), {}))))
            lines += ['    --tl-%d: %s;' % (i, vals[theme]) for i, vals in enumerate(self.token_values)]
            token_blocks.append(':root[data-theme="%s"] {\n%s\n}' % (theme, '\n'.join(lines[1:])))
            token_blocks.append(':root[data-theme="%s"]%s {\n%s\n}' % (theme, GATE_OFF, lines[0]))
        out_path = os.path.join(ROOT, self.app['output'])
        overrides = ''
        if os.path.exists(out_path):
            existing = open(out_path, encoding='utf-8').read()
            idx = existing.find(OVERRIDES_MARKER)
            if idx >= 0:
                overrides = existing[idx:]
        if not overrides:
            overrides = OVERRIDES_MARKER + ' (kept by the generator) ═══ */\n'
        # hand-tuned rules follow the same gate rule as the generated ones
        overrides = re.sub(r'(:root(?:\[data-theme="[a-z]+"\]|:is\((?:\[data-theme="[a-z]+"\](?:, )?)+\)))(?!:not\(:has)',
                           lambda m: m.group(1) + GATE_OFF, overrides)
        header = ('/* Color themes: Charcoal / Gray / Light for %s.\n'
                  '   GENERATED by tools/theme-layer/generate.py %s from the production (Dark) stylesheets.\n'
                  '   Dark never matches these selectors. Edit the hand-tuned overrides at the end only. */\n'
                  % (self.app['name'], self.key))
        text = header + '\n'.join(token_blocks) + '\n\n' + '\n'.join(frames) + '\n\n' + '\n'.join(body) + '\n\n' + overrides
        open(out_path, 'w', encoding='utf-8').write(text)
        print('wrote %s: %d tokens, %d bytes, colored keyframes %d' % (self.app['output'], len(self.token_values), len(text), len(self.colored_keyframes)))


ANIM_KEYWORDS = {'infinite', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'alternate', 'alternate-reverse',
                 'reverse', 'normal', 'forwards', 'backwards', 'both', 'running', 'paused', 'step-start', 'step-end',
                 'none', 'initial', 'inherit', 'unset'}


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in APPS:
        print('usage: generate.py <%s>' % '|'.join(APPS))
        sys.exit(2)
    Generator(sys.argv[1]).run()
