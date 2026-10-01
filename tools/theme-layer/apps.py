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

PITCH_COMMON = {
    'dark_bg': '#121212',
    'dark_surface': '#1e1e1e',
    'dark_text': '#ffffff',
    'palette': {
        'charcoal': dict(NEUTRAL_CHARCOAL),
        'gray': dict(NEUTRAL_GRAY),
        'light': {
            'bg': '#f5f6f6', 'surface': '#ffffff', 'raised': '#eef0f0',
            'text': '#1a1d1c', 'muted': '#4b5150', 'ink': '#1a1d1c', 'scrim': 'rgba(18, 20, 20, 0.40)',
        },
    },
    # Piano keys (white/black), the active key and answer feedback colors are objects / functional.
    'object_selectors': (
        r'\.(?:white-key|black-key|white-keys|black-keys|piano-|keyboard-row|key-label|note-toggle(?![\w-])|'
        r'feedback-correct|feedback-wrong|correct(?![\w-])|wrong(?![\w-])|tm-confetti|pro-gate|pro-badge)'
    ),
    'object_pins': ['.piano-layout', '.piano-keys-grid', '.keyboard-row'],
    'identity_vars': ['--white-key-color', '--black-key-color', '--key-active-color', '--primary-color',
                      '--secondary-color', '--error-color', '--tm-red', '--tm-red-glow', '--tm-red-dim'],
    'var_roles': {'--bg-color': 'bg', '--surface-color': 'bg', '--text-color': 'text'},
    'named_text_tokens': {'--tl-accent-text': '#00ff88', '--tl-accent2-text': '#00d2ff', '--tl-gold-text': '#ffd65e'},
}

APPS['pitch'] = dict(PITCH_COMMON, **{
    'name': 'Pitch Cruise (音感クルーズ) Standard / Pro',
    'output': 'apps/pitch-cruise/theme-colors.css',
    'sources': [
        {'path': 'apps/shared/style.css'},
        {'path': 'apps/shared/pro-theme.css'},
        {'path': 'apps/pitch-cruise/theme.css'},
        {'path': 'apps/shared/pro-gate.css', 'identity': True},
        {'path': 'apps/shared/sync-account/multi-app-sync.css'},
        {'path': 'apps/pitch-cruise/pro_x9v7q2m8/index.html', 'inline_style': True},
    ],
})

APPS['pitch-beta'] = dict(PITCH_COMMON, **{
    'name': 'Pitch Cruise (音感クルーズ) Beta',
    'output': 'apps/pitch-cruise/theme-colors-beta.css',
    'sources': [
        {'path': 'apps/shared/style.css'},
        {'path': 'apps/pitch-cruise/theme.css'},
    ],
})

APPS['rhythm'] = {
    'name': 'Rhythm Cruise (リズムクルーズ)',
    'output': 'apps/rhythm-cruise/theme-colors.css',
    'dark_bg': '#070b11',
    'dark_surface': '#10161d',
    'dark_text': '#efe8dc',  # clean-pro panel ink
    'palette': {
        'charcoal': dict(NEUTRAL_CHARCOAL),
        'gray': dict(NEUTRAL_GRAY),
        'light': {
            'bg': '#f6f4ef', 'surface': '#ffffff', 'raised': '#f0ede6',
            'text': '#1c1a17', 'muted': '#544f48', 'ink': '#1c1a17', 'scrim': 'rgba(22, 20, 17, 0.40)',
        },
    },
    'sources': [
        {'path': 'apps/rhythm-cruise/theme.css'},
        {'path': 'apps/shared/pro-gate.css', 'identity': True},
        {'path': 'apps/shared/sync-account/multi-app-sync.css'},
        {'path': 'apps/rhythm-cruise/standard/index.html', 'inline_style': True},
    ],
    # Functional panels whose canvases / VexFlow draw light ink for a dark ground stay Dark (minimum
    # parts only): judgement lanes, calibration / test lanes, result graphs, recording review, waveforms
    # and score layers. Judgement colors (early / just / late) never change.
    'object_selectors': (
        r'(?:\.(?:lane-wrap|test-lane-wrap|lane-judge|result-graph-scroll|review-wrap|review-playhead|pt-review-scroll|'
        r'custom-test-preview-score|android-latency-live|early|just|late|pro-gate|pro-badge)(?![\w-])|'
        r'\.pce-vex-[\w-]+|\.pce-(?:arrow|beat-cell|tap-cell)[\w-]*|\.(?:custom|review)-flow-score[\w-]*|'
        r'#(?:tap-pad|lane-canvas|lane-judge-overlay|tap-cal-lane-[\w-]+|test-lane-canvas|review-playhead-canvas|'
        r'hp-cal-lane-[\w-]+|bt-cal-lane-[\w-]+|pt-lane-[\w-]+|pt-review-(?:scroll|canvas)|review-canvas|'
        r'graph-canvas|results-mic-canvas|mic-preview-canvas|wizard-android-wave-[\w-]+)(?![\w-]))'
    ),
    # class selectors only: an id here would outrank the panels' own declared colors
    'pin_color': False,  # notation / canvas colors are explicit; panels only keep the Dark surface tokens
    'object_pins': ['.lane-wrap', '.test-lane-wrap', '.pt-review-scroll', '.review-wrap', '.result-graph-scroll',
                    '.custom-test-preview-score', '.custom-flow-score-layer', '.review-flow-score-layer', '.pce-vex-scroll'],
    # Lanes are drawn on translucent gradients over the Dark page; keep that page color under them.
    # Colors are the measured Dark composites behind each panel (page vs. card ground).
    'object_panel_bg': [
        {'color': '#090d13', 'selectors': ['.lane-wrap', '#tap-cal-lane-wrap', '#hp-cal-lane-wrap', '#bt-cal-lane-wrap',
                                           '#pt-lane-wrap', '.pt-review-scroll', '.review-wrap']},
        {'color': '#10141a', 'selectors': ['.result-graph-scroll', '.pce-vex-scroll']},
    ],
    'identity_vars': ['--primary-color', '--secondary-color', '--accent-cool', '--error-color',
                      '--early-color', '--just-color', '--late-color'],
    'var_roles': {'--bg-color': 'bg', '--surface-color': 'bg', '--surface-raised': 'bg', '--text-color': 'text',
                  '--muted-color': 'text'},
    'named_text_tokens': {'--tl-accent-text': '#ff9f1c', '--tl-gold-text': '#dec27a'},
}


# ── Information pages (normal, non-gate pages) ────────────────────────────────────────────
# One layer per page-style group, built only from the stylesheets that page loads (in order) plus its own
# <style>, and pruned to selectors whose classes / ids occur in the page. Same palette and object rules as
# the app, so the page reads like the app in every theme. Pro acquisition / gate pages are not listed here.
def _info(base, name, output, css, pages):
    cfg = dict(APPS[base])
    cfg.update({
        'name': name,
        'output': output,
        'sources': [{'path': p} for p in css] + [{'path': pages[0], 'inline_style': True}],
        'prune_to_html': pages,
        'object_pins': [],
        'object_panel_bg': None,
    })
    return cfg


_PITCH_CSS = ['apps/shared/style.css', 'apps/shared/pro-theme.css', 'apps/pitch-cruise/theme.css']
APPS['pitch-info'] = _info('pitch', 'Pitch Cruise info page', 'apps/pitch-cruise/theme-colors-info.css',
                           _PITCH_CSS + ['apps/shared/legal-links.css'], ['apps/pitch-cruise/info.html'])
APPS['pitch-legal'] = _info('pitch', 'Pitch Cruise terms / privacy pages', 'apps/pitch-cruise/theme-colors-legal.css',
                            _PITCH_CSS, ['apps/pitch-cruise/terms.html', 'apps/pitch-cruise/privacy.html'])
APPS['pitch-videos'] = _info('pitch', 'Pitch Cruise recommended videos page', 'apps/pitch-cruise/theme-colors-videos.css',
                             _PITCH_CSS, ['apps/pitch-cruise/recommended-videos.html'])

_FB_CSS = ['apps/shared/style.css', 'apps/shared/pro-theme.css', 'apps/fretboard_cruise/theme.css']
APPS['fretboard-info'] = _info('fretboard', 'Fretboard Cruise info page', 'apps/fretboard_cruise/theme-colors-info.css',
                               _FB_CSS + ['apps/shared/legal-links.css'], ['apps/fretboard_cruise/info.html'])
APPS['fretboard-legal'] = _info('fretboard', 'Fretboard Cruise terms / privacy pages', 'apps/fretboard_cruise/theme-colors-legal.css',
                                _FB_CSS, ['apps/fretboard_cruise/terms.html', 'apps/fretboard_cruise/privacy.html'])
APPS['fretboard-apps'] = _info('fretboard', 'Fretboard Cruise app series page', 'apps/fretboard_cruise/theme-colors-apps.css',
                               _FB_CSS, ['apps/fretboard_cruise/apps.html'])

_RC_CSS = ['apps/rhythm-cruise/theme.css']
APPS['rhythm-info'] = _info('rhythm', 'Rhythm Cruise info page', 'apps/rhythm-cruise/theme-colors-info.css',
                            _RC_CSS + ['apps/shared/legal-links.css'], ['apps/rhythm-cruise/info.html'])
APPS['rhythm-legal'] = _info('rhythm', 'Rhythm Cruise terms / privacy pages', 'apps/rhythm-cruise/theme-colors-legal.css',
                             _RC_CSS, ['apps/rhythm-cruise/terms.html', 'apps/rhythm-cruise/privacy.html'])
APPS['rhythm-help'] = _info('rhythm', 'Rhythm Cruise usage / help pages', 'apps/rhythm-cruise/theme-colors-help.css',
                            _RC_CSS, ['apps/rhythm-cruise/usage.html', 'apps/rhythm-cruise/mic-correction-help.html'])
APPS['rhythm-click-help'] = _info('rhythm', 'Rhythm Cruise click input help page', 'apps/rhythm-cruise/theme-colors-click-help.css',
                                  _RC_CSS, ['apps/rhythm-cruise/click-input-help.html'])
# The microphone diagrams are drawn in white / orange SVG strokes for a dark ground: keep them Dark
# (identity colors on the measured opaque Dark composite behind the figure).
APPS['rhythm-click-help'].update({
    'object_selectors': APPS['rhythm']['object_selectors'][:-1] + r'|\.click-help-figure(?![\w-]))',
    'object_pins': ['.click-help-figure'],
    'object_panel_bg': [{'color': '#1d1b1a', 'selectors': ['.click-help-figure']}],
})
APPS['rhythm-mic-help'] = _info('rhythm', 'Rhythm Cruise mic restart help page', 'apps/rhythm-cruise/theme-colors-mic-help.css',
                                _RC_CSS, ['apps/rhythm-cruise/mic-restart-help.html'])
