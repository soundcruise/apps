"""Per-app configuration for generate.py.

sources: every stylesheet a page loads, in load order (paths relative to the repo root).
  identity=True mirrors the file with its Dark values unchanged (e.g. the Pro gate).
  inline_style=True reads the <style> blocks of an HTML file.
object_selectors: regex; selectors that match keep their Dark values (physical objects,
  functional / musical colors). They are still mirrored so the cascade stays intact.
var_roles: :root custom properties that are surface/text/border colors and get themed.
"""

NEUTRAL_CHARCOAL = {
    'bg': '#424346', 'surface': '#4c4e52', 'raised': '#58595e',
    'text': '#f2f1ed', 'muted': '#c4c5c7', 'ink': '#000000', 'scrim': 'rgba(15, 15, 16, 0.55)',
}
NEUTRAL_GRAY = {
    'bg': '#c8cbd0', 'surface': '#d8dbdf', 'raised': '#e3e5e8',
    'text': '#1d1f23', 'muted': '#43464c', 'ink': '#1d1f23', 'scrim': 'rgba(40, 42, 46, 0.45)',
}

APPS = {
    'fretboard': {
        'name': 'Fretboard Cruise (指板クルーズ)',
        'output': 'apps/fretboard_cruise/theme-colors.css',
        'dark_bg': '#0d1117',
        'dark_surface': '#161b22',
        'dark_text': '#f0f6fc',
        'palette': {
            'charcoal': dict(NEUTRAL_CHARCOAL),
            'gray': dict(NEUTRAL_GRAY),
            'light': {
                'bg': '#f4f6f9', 'surface': '#ffffff', 'raised': '#eef1f5',
                'text': '#1b1f24', 'muted': '#4f5661', 'ink': '#1b1f24', 'scrim': 'rgba(20, 22, 26, 0.40)',
            },
        },
        'sources': [
            {'path': 'apps/shared/style.css'},
            {'path': 'apps/shared/pro-theme.css'},
            {'path': 'apps/fretboard_cruise/theme.css'},
            {'path': 'apps/shared/pro-gate.css', 'identity': True},
            {'path': 'apps/shared/sync-account/multi-app-sync.css'},
            {'path': 'apps/fretboard_cruise/standard/index.html', 'inline_style': True},
        ],
        'object_selectors': (
            r'\.(?:neck-|nut(?![\w-])|fret-column|fret-dot|fret-wire|string-line|string-row|strings-container|'
            r'note-marker|projected-(?!fret-number)|memorize-countdown-overlay|degree-[0-9]|degree-label|role-(?:root|third|fifth|seventh)|correct-note|wrong-note|'
            r'target-note|next-note|grayed-note|grey-note|hidden-note|highlighted-string|route-edit-note|'
            r'quiz-edit-note|route-editor-scale-guide(?![\w-])|rule-root|rule-interval-note|rule-step-note|rule-complete-note|rule-special-gap-note|'
            r'rule-step5-exclude-note|rule-marker-cluster|rule-phase-overlay-note|white-key|black-key|piano-|'
            r'hit-debug|settings-trackball|pro-gate|pro-badge)'
        ),
        'object_pins': ['.neck-face', '.projected-fretboard-svg'],
        'identity_vars': ['--fretboard-wood', '--fret-wire', '--dot-color', '--root-color', '--third-color',
                          '--fifth-color', '--seventh-color', '--non-target-color', '--white-key-color',
                          '--black-key-color', '--key-active-color', '--primary-color', '--secondary-color',
                          '--error-color'],
        'var_roles': {'--bg-color': 'bg', '--surface-color': 'bg', '--text-color': 'text'},
        'named_text_tokens': {'--tl-accent-text': '#4f9cf9'},
    },
}
