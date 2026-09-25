// Final provider egress guard (AI1-C security fix). The last check before anything leaves the
// Worker for a model: createWorkersAiProvider runs it on the exact input it is about to pass to
// AI.run, and guardedProvider runs it again on every request of a turn (first call, each tool
// follow-up, repair). No call site is trusted to have checked already.
//
// Everything in the input is inspected recursively — every string value and every object key, in
// every message field (content, name, tool_call_id, tool_calls[].id / type / function.name /
// function.arguments, and anything else), with tool-result JSON also parsed — except two exact
// trusted constants: a system message whose content is AI_SUPPORT_SYSTEM_PROMPT, and a tool list
// identical to AI_SUPPORT_TOOLS. Numbers and booleans (max_tokens, temperature) carry no text.
// A secret-like code, a full ID, or any known internal ID of the authenticated Account (Account,
// Account device and App device IDs, compared with case and every separator ignored) anywhere
// means the input is not sent. Only a yes/no leaves this module: never the matched text, where it
// was, or a count.
import { containsSensitive, createKnownIdMatcher } from './secret-detector.js';
import { AI_SUPPORT_SYSTEM_PROMPT, AI_SUPPORT_TOOLS } from './ai-support-policy.js';

const TRUSTED_TOOLS = JSON.stringify(AI_SUPPORT_TOOLS);
const MAX_DEPTH = 32;

const NO_KNOWN_IDS = () => false;
const unsafeText = (text, containsKnownId) => containsSensitive(text) || containsKnownId(text);

function safeValue(value, containsKnownId, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  if (typeof value === 'string') {
    if (unsafeText(value, containsKnownId)) return false;
    // Tool results and tool-call arguments are JSON text; check them as the model will read them.
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let parsed;
      try { parsed = JSON.parse(trimmed); } catch { return true; }
      return safeValue(parsed, containsKnownId, depth + 1);
    }
    return true;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || value === undefined) return true;
  if (Array.isArray(value)) return value.every((item) => safeValue(item, containsKnownId, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value).every(([key, inner]) => !unsafeText(key, containsKnownId) && safeValue(inner, containsKnownId, depth + 1));
  }
  return false; // functions, symbols, bigints: never part of a provider input
}

function trustedSystemMessage(message) {
  return message && message.role === 'system' && message.content === AI_SUPPORT_SYSTEM_PROMPT &&
    Object.keys(message).length === 2;
}

// true → safe to send. false → the input carries secret-like text, a full ID or a known ID and
// must not be sent. containsKnownId comes from createKnownIdMatcher(knownIds).
export function isProviderInputSafe(input, { containsKnownId = NO_KNOWN_IDS } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  if (!Array.isArray(input.messages)) return false;
  for (const [key, value] of Object.entries(input)) {
    // Top-level keys are fixed by the provider today; they are still checked like any other key.
    if (unsafeText(key, containsKnownId)) return false;
    if (key === 'messages') {
      if (!value.every((message) => trustedSystemMessage(message) || safeValue(message, containsKnownId))) return false;
    } else if (key === 'tools') {
      // Only the fixed schema (or no tools) may be sent; anything else is not trusted config.
      if (!Array.isArray(value) || (value.length && JSON.stringify(value) !== TRUSTED_TOOLS)) return false;
    } else if (!safeValue(value, containsKnownId)) {
      return false;
    }
  }
  return true;
}

export class EgressBlockedError extends Error {
  constructor() {
    super('ai_support_egress_blocked');
    this.name = 'EgressBlockedError';
  }
}

export class ModelCallBudgetError extends Error {
  constructor() {
    super('ai_support_model_call_budget');
    this.name = 'ModelCallBudgetError';
  }
}

// Wraps a provider so a turn can make at most maxCalls calls, each one checked by
// isProviderInputSafe. A blocked or over-budget call never reaches the provider.
export function guardedProvider(provider, { maxCalls, knownIds = [] }) {
  const containsKnownId = createKnownIdMatcher(knownIds);
  let calls = 0;
  return Object.freeze({
    get calls() { return calls; },
    async complete(request) {
      if (calls >= maxCalls) throw new ModelCallBudgetError();
      if (!isProviderInputSafe(request, { containsKnownId })) throw new EgressBlockedError();
      calls += 1;
      return provider.complete(request);
    }
  });
}
