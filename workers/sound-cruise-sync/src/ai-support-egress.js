// Final provider egress guard (AI1-C security fix). Every request to a model passes checkEgress
// right before it leaves the Worker: the first call, each tool follow-up and the repair call.
//
// It inspects everything in the request that is not fixed text from this Worker: user and assistant
// messages (this turn and the earlier history), assistant tool-call arguments, and every string in
// each tool result (sync target names are user-written). The system prompt and the tool schema are
// fixed text and are not inspected. A hit means the request is not sent. Only a yes/no leaves this
// module: never the matched text, where it was, or a count.
import { containsSecret } from './secret-detector.js';

function strings(value, out) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

function inspected(message) {
  if (!message || typeof message !== 'object' || message.role === 'system') return [];
  const out = [];
  if (message.role === 'tool') {
    // Tool results are JSON; parse so escaped text is checked as the model will read it.
    let parsed;
    try { parsed = JSON.parse(message.content); } catch { parsed = message.content; }
    return strings(parsed, out);
  }
  strings(message.content, out);
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    strings(call?.function?.arguments, out);
    try { strings(JSON.parse(call?.function?.arguments), out); } catch { /* checked as text above */ }
  }
  return out;
}

// true → safe to send. false → the request carries secret-like text and must not be sent.
export function checkEgress(request) {
  const messages = Array.isArray(request?.messages) ? request.messages : [];
  return !messages.some((message) => inspected(message).some(containsSecret));
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

// Wraps a provider so a turn can make at most maxCalls calls, each one checked by checkEgress.
// A blocked or over-budget call never reaches the provider.
export function guardedProvider(provider, { maxCalls }) {
  let calls = 0;
  return Object.freeze({
    get calls() { return calls; },
    async complete(request) {
      if (calls >= maxCalls) throw new ModelCallBudgetError();
      if (!checkEgress(request)) throw new EgressBlockedError();
      calls += 1;
      return provider.complete(request);
    }
  });
}
