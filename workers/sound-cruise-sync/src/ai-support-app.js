// POST /v2/ai-support/chat (AI1-B, not enabled in production).
//
// Order: origin/CORS → AI gate → body limits → secret filter → Pro (read-only) → QA (read-only)
// → Account (read-only, AI1-A) → rate limit → one support turn. Every D1 access on this path is a
// SELECT; nothing is stored. The gate is AI-specific (AI_SUPPORT_MODE, default off) and never
// shares a sync gate. Beta scope = gate 'beta' + a valid Pro credential + an Account credential.
import { openSyncDiagnostics } from './ai-diagnostics.js';
import { authenticateQaRequest } from './account-qa-auth.js';
import { ACCOUNT_ADMISSION_PROVENANCE } from './account-admission.js';
import { inspectProCredentialReadOnly } from './pro-auth-app.js';
import { AI_SUPPORT_LIMITS, SECRET_REFUSAL, containsSecret } from './ai-support-policy.js';
import { AI_SUPPORT_MODELS, AiProviderError, DEFAULT_AI_SUPPORT_MODEL, createWorkersAiProvider } from './ai-support-provider.js';
import { runSupportTurn } from './ai-support-chat.js';
import { isJsonContentType, readBodyWithLimit } from './validation.js';

export const AI_SUPPORT_ROUTE = '/v2/ai-support/chat';
const ROUTE = Object.freeze({ method: 'POST',
  headers: ['content-type', 'authorization', 'x-sound-cruise-pro-authorization', 'x-sound-cruise-qa-authorization'] });
const MAX_BODY_BYTES = 64 * 1024;

function origins(env) {
  return new Set(String(env.ACCOUNT_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
}
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': ROUTE.headers
      .map((header) => header.replace(/(^|-)([a-z])/g, (_m, prefix, letter) => prefix + letter.toUpperCase())).join(', '),
    'Access-Control-Max-Age': '600',
    Vary: 'Origin'
  };
}
function respond(status, body, origin, extra = {}) {
  const headers = new Headers(origin ? cors(origin) : { Vary: 'Origin' });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(JSON.stringify(body), { status, headers });
}
const fail = (status, code, origin, extra) => respond(status, { ok: false, code }, origin, extra);

// Body: { message: string, history?: [{ role: 'user'|'assistant', content: string }] }. Nothing else.
export function validateChatBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false };
  const keys = Object.keys(body);
  if (!keys.includes('message') || keys.some((key) => !['message', 'history'].includes(key))) return { ok: false };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || [...message].length > AI_SUPPORT_LIMITS.maxUserChars) return { ok: false, code: 'message_too_long' };
  const history = body.history === undefined ? [] : body.history;
  if (!Array.isArray(history)) return { ok: false };
  const cleaned = [];
  for (const entry of history) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { ok: false };
    const entryKeys = Object.keys(entry);
    if (entryKeys.length !== 2 || !entryKeys.includes('role') || !entryKeys.includes('content')) return { ok: false };
    if (!['user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string') return { ok: false };
    const limit = entry.role === 'user' ? AI_SUPPORT_LIMITS.maxUserChars : AI_SUPPORT_LIMITS.maxAssistantChars;
    if ([...entry.content].length > limit) return { ok: false, code: 'message_too_long' };
    cleaned.push({ role: entry.role, content: entry.content });
  }
  // Keep only the most recent turns so the whole conversation stays within maxTurns user turns.
  // History always restarts at a user message, never mid-turn.
  const keepUserTurns = AI_SUPPORT_LIMITS.maxTurns - 1;
  const userIndexes = cleaned.flatMap((entry, index) => (entry.role === 'user' ? [index] : []));
  const start = userIndexes.length > keepUserTurns ? userIndexes[userIndexes.length - keepUserTurns]
    : userIndexes.length ? userIndexes[0] : cleaned.length;
  return { ok: true, value: { message, history: cleaned.slice(start) } };
}

export async function handleAiSupportRequest(request, env = {}, _ctx, dependencies = {}) {
  const url = new URL(request.url);
  if (url.pathname !== AI_SUPPORT_ROUTE) return fail(404, 'not_found', null);
  const origin = request.headers.get('Origin');
  const originAllowed = Boolean(origin && origins(env).has(origin));
  if (request.method === 'OPTIONS') {
    if (!originAllowed || request.headers.get('Access-Control-Request-Method') !== 'POST') {
      return fail(403, 'invalid_origin', null);
    }
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (request.method !== 'POST') return fail(405, 'method_not_allowed', originAllowed ? origin : null, { Allow: 'POST, OPTIONS' });
  if (!originAllowed) return fail(403, 'invalid_origin', null);
  if (!isJsonContentType(request.headers.get('Content-Type'))) return fail(415, 'invalid_content_type', origin);
  // AI-only gate. Anything but an explicit 'beta' is off, and the AI can be stopped alone.
  if (env.AI_SUPPORT_MODE !== 'beta') return fail(404, 'ai_support_disabled', origin);
  const modelKey = env.AI_SUPPORT_MODEL || DEFAULT_AI_SUPPORT_MODEL;
  if (!AI_SUPPORT_MODELS[modelKey] || !env.AI || !env.AI_SUPPORT_RATE_LIMITER?.limit) {
    return fail(503, 'ai_support_unavailable', origin);
  }

  const read = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!read.ok) return fail(read.tooLarge ? 413 : 400, read.tooLarge ? 'payload_too_large' : 'invalid_json', origin);
  let body;
  try { body = JSON.parse(read.text); } catch { return fail(400, 'invalid_json', origin); }
  const validated = validateChatBody(body);
  if (!validated.ok) return fail(400, validated.code || 'invalid_request', origin);
  const { message, history } = validated.value;
  if ([message, ...history.map((entry) => entry.content)].some(containsSecret)) {
    // Refused as-is: the text is never edited, forwarded or logged.
    return respond(400, { ok: false, code: 'ai_support_secret_detected', message: SECRET_REFUSAL }, origin);
  }

  let pro;
  try {
    pro = await (dependencies.inspectProCredential || inspectProCredentialReadOnly)(
      request.headers.get('X-Sound-Cruise-Pro-Authorization'), env, dependencies);
  } catch {
    return fail(503, 'ai_support_unavailable', origin);
  }
  if (!pro?.ok) return fail(403, pro?.code || 'pro_required', origin);

  const accountDependencies = { ...dependencies };
  const qaHeader = request.headers.get('X-Sound-Cruise-QA-Authorization');
  if (qaHeader !== null) {
    let qaIdentity;
    try {
      const session = env.SYNC_DB?.withSession ? env.SYNC_DB.withSession('first-primary') : env.SYNC_DB;
      qaIdentity = await (dependencies.authenticateQaRequest || authenticateQaRequest)(session, qaHeader, env, {}, dependencies);
    } catch {
      return fail(503, 'ai_support_unavailable', origin);
    }
    if (!qaIdentity) return fail(403, 'qa_admission_required', origin);
    accountDependencies.qaIdentity = qaIdentity;
    accountDependencies.admissionProvenance = ACCOUNT_ADMISSION_PROVENANCE.QA;
  } else {
    accountDependencies.admissionProvenance = ACCOUNT_ADMISSION_PROVENANCE.PRODUCTION;
  }

  let opened;
  try { opened = await openSyncDiagnostics(request, env, accountDependencies); } catch {
    return fail(503, 'ai_support_unavailable', origin);
  }
  if (opened.error) return fail(opened.status, opened.error, origin);

  let limited;
  try { limited = await env.AI_SUPPORT_RATE_LIMITER.limit({ key: `ai-support:${opened.scopeKey}` }); } catch {
    return fail(503, 'ai_support_unavailable', origin);
  }
  if (limited?.success !== true) return fail(429, 'rate_limited', origin, { 'Retry-After': '60' });

  const provider = (dependencies.createProvider || createWorkersAiProvider)({ ai: env.AI, modelKey,
    maxOutputTokens: AI_SUPPORT_LIMITS.maxOutputTokens });
  try {
    const turn = await runSupportTurn({ provider, diagnostics: opened.diagnostics, history, message });
    return respond(200, { ok: true, reply: turn.reply }, origin);
  } catch (error) {
    if (error instanceof AiProviderError) return fail(503, 'ai_provider_unavailable', origin);
    return fail(503, 'ai_support_unavailable', origin);
  }
}
