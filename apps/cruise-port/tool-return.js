// Where the tuner / metronome back button leads. Opening a tool from the practice menu adds an
// explicit context to the hash (#tuner?from=practice-menu&practice=<id>), so the back button says
// 「← 練習メニューに戻る」 and returns there — also after a reload. Opened from the home screen, the
// hash is the plain #tuner / #metronome and the button stays 「← クルーズポート」. Nothing depends on
// document.referrer or on what happens to be in the browser history.

export const TOOL_HASHES = Object.freeze({ '#tuner': 'tuner', '#metronome': 'metronome' });
export const PRACTICE_MENU_SOURCE = 'practice-menu';
export const TOOL_BACK_LABELS = Object.freeze({ home: '← クルーズポート', practice: '← 練習メニューに戻る' });

const TOOL_ROUTE = /^(#tuner|#metronome)(?:\?([^#]*))?$/u;
const PRACTICE_LIST_HASH = '#practice-menu';

// Returns { tool, hash, fromPracticeMenu, practiceId } for a tool route, or null for anything else.
export function parseToolRoute(hash) {
  const match = typeof hash === 'string' ? hash.match(TOOL_ROUTE) : null;
  if (!match) return null;
  let params;
  try { params = new URLSearchParams(match[2] || ''); } catch (_) { params = new URLSearchParams(); }
  const fromPracticeMenu = params.get('from') === PRACTICE_MENU_SOURCE;
  const practiceId = fromPracticeMenu ? params.get('practice') : null;
  return Object.freeze({
    tool: TOOL_HASHES[match[1]],
    hash: match[1],
    fromPracticeMenu,
    practiceId: practiceId && practiceId.length <= 200 ? practiceId : null
  });
}

export function isToolRoute(hash, tool = null) {
  const route = parseToolRoute(hash);
  return Boolean(route) && (!tool || route.tool === tool);
}

// The href a practice-menu launch uses. Only the two built-in tools get the context; every other
// href (Cruise apps, My Apps, external URLs) is returned unchanged.
export function withPracticeMenuReturn(href, practiceId = null) {
  if (typeof href !== 'string' || !Object.hasOwn(TOOL_HASHES, href)) return href;
  const params = new URLSearchParams({ from: PRACTICE_MENU_SOURCE });
  if (typeof practiceId === 'string' && practiceId && practiceId.length <= 200) params.set('practice', practiceId);
  return `${href}?${params.toString()}`;
}

// { label, hash } for the back button of the tool route; hash null means "Cruise Port home".
export function toolBackTarget(hash, { practiceExists = () => false } = {}) {
  const route = parseToolRoute(hash);
  if (!route?.fromPracticeMenu) return Object.freeze({ label: TOOL_BACK_LABELS.home, hash: null });
  const detail = route.practiceId && practiceExists(route.practiceId)
    ? `${PRACTICE_LIST_HASH}/${encodeURIComponent(route.practiceId)}` : PRACTICE_LIST_HASH;
  return Object.freeze({ label: TOOL_BACK_LABELS.practice, hash: detail });
}
