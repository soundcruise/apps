const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_TIMEOUT_MS = 5_000;

export async function verifyTurnstileToken(token, env, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: false, unavailable: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token
      }),
      signal: controller.signal
    });

    if (!response.ok) return { ok: false, unavailable: response.status >= 500 };

    let result;
    try {
      result = await response.json();
    } catch {
      return { ok: false, unavailable: true };
    }

    if (result === null || typeof result !== 'object' || result.success !== true) {
      return { ok: false };
    }
    if (env.TURNSTILE_EXPECTED_HOSTNAME && result.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME) {
      return { ok: false };
    }
    if (env.TURNSTILE_EXPECTED_ACTION && result.action !== env.TURNSTILE_EXPECTED_ACTION) {
      return { ok: false };
    }

    return { ok: true };
  } catch {
    return { ok: false, unavailable: true };
  } finally {
    clearTimeout(timeout);
  }
}
