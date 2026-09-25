// One AI support turn (AI1-B): fixed system prompt, bounded history, the user's message as a user
// message, at most two read-only diagnostic tool calls, and diagnostics returned only as tool
// results in the AI1-A trust envelope. Provider- and model-agnostic; nothing is stored.
import { toModelToolResult } from './ai-diagnostics.js';
import { EgressBlockedError, guardedProvider, isProviderInputSafe } from './ai-support-egress.js';
import { GUARD_FALLBACK_REPLY, repairInstruction, validateSupportReply } from './ai-support-guard.js';
import {
  AI_SUPPORT_LIMITS, AI_SUPPORT_SYSTEM_PROMPT, AI_SUPPORT_TOOLS, FALLBACK_REPLIES, SECRET_REFUSAL, containsMarkdown,
  sanitizeReply, validateToolCall
} from './ai-support-policy.js';
import { containsSensitive, createKnownIdMatcher } from './secret-detector.js';

const TOOL_NAMES = new Set(AI_SUPPORT_TOOLS.map((tool) => tool.function.name));

// history: earlier [{ role: 'user' | 'assistant', content }] (already validated and capped).
// Every provider call goes through guardedProvider: the egress guard on the whole request and a
// budget of maxModelCalls (maxModelRounds + one repair) per turn. A blocked request returns
// SECRET_REFUSAL with egressBlocked, and nothing is sent.
// knownIds: the authenticated Account's raw IDs (Worker-internal; never sent). Every request and
// every reply is compared against them.
export async function runSupportTurn({ provider: rawProvider, diagnostics, history = [], message, knownIds = [] }) {
  const provider = guardedProvider(rawProvider, { maxCalls: AI_SUPPORT_LIMITS.maxModelCalls, knownIds });
  const containsKnownId = createKnownIdMatcher(knownIds);
  try {
    return await runRounds({ provider, diagnostics, history, message, containsKnownId });
  } catch (error) {
    if (error instanceof EgressBlockedError) {
      return { reply: SECRET_REFUSAL, stats: { modelCalls: provider.calls, egressBlocked: true }, egressBlocked: true };
    }
    throw error;
  }
}

async function runRounds({ provider, diagnostics, history, message, containsKnownId }) {
  const messages = [
    { role: 'system', content: AI_SUPPORT_SYSTEM_PROMPT },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: 'user', content: message }
  ];
  const started = Date.now();
  // Counters only (no text) — safe to count in future telemetry.
  const stats = { modelCalls: 0, toolCalls: 0, rejectedToolCalls: 0, usage: { inputTokens: 0, outputTokens: 0 },
    guardViolations: [], repairAttempted: false, repaired: false, fallback: false, firstAnswerMs: null };
  const track = (result) => {
    stats.modelCalls += 1;
    stats.usage.inputTokens += result.usage?.inputTokens || 0;
    stats.usage.outputTokens += result.usage?.outputTokens || 0;
  };

  let callCount = 0;
  for (let round = 0; round < AI_SUPPORT_LIMITS.maxModelRounds; round += 1) {
    const toolsAllowed = stats.toolCalls < AI_SUPPORT_LIMITS.maxToolCalls &&
      round < AI_SUPPORT_LIMITS.maxModelRounds - 1;
    const result = await provider.complete({ messages, tools: toolsAllowed ? AI_SUPPORT_TOOLS : [] });
    track(result);
    if (!result.toolCalls.length) {
      // Recorded for evaluation: whether the model itself produced Markdown before it was removed.
      stats.rawMarkdown = containsMarkdown(result.text);
      stats.firstAnswerMs = Date.now() - started;
      const reply = sanitizeReply(result.text);
      if (!reply) return { reply: FALLBACK_REPLIES.noAnswer, stats };
      return guardReply({ provider, messages, reply, stats, track, containsKnownId });
    }
    if (!toolsAllowed) break;
    // Nothing the model wrote around a tool call is sent back as-is. A call naming anything but
    // one of the two fixed tools ends the turn (fail closed); otherwise the Worker writes the
    // follow-up itself: its own call ids, the fixed tool name, and validated arguments only.
    if (result.toolCalls.some((call) => typeof call?.name !== 'string' || !TOOL_NAMES.has(call.name))) {
      stats.rejectedToolCalls += result.toolCalls.length;
      return { reply: FALLBACK_REPLIES.noAnswer, stats, unsafeToolCall: true };
    }
    const calls = result.toolCalls.map((call) => {
      callCount += 1;
      return { id: `call_${callCount}`, name: call.name, valid: validateToolCall(call.name, call.arguments) };
    });
    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: calls.map((call) => ({ id: call.id, type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.valid.ok ? call.valid.args ?? {} : {}) } }))
    });
    for (const call of calls) {
      let content;
      const { valid } = call;
      if (!valid.ok) {
        stats.rejectedToolCalls += 1;
        content = JSON.stringify({ kind: 'sound_cruise_sync_diagnostic_tool_error', error: 'invalid_tool_call' });
      } else if (stats.toolCalls >= AI_SUPPORT_LIMITS.maxToolCalls) {
        stats.rejectedToolCalls += 1;
        content = JSON.stringify({ kind: 'sound_cruise_sync_diagnostic_tool_error', error: 'tool_call_limit' });
      } else {
        stats.toolCalls += 1;
        let data;
        try {
          data = valid.name === 'getSyncOverview'
            ? await diagnostics.getSyncOverview()
            : await diagnostics.getAppSyncTargets(valid.args.appId);
        } catch {
          // Never switch to guessing when the current state cannot be read.
          return { reply: FALLBACK_REPLIES.diagnosticsUnavailable, stats, diagnosticsFailed: true };
        }
        content = toModelToolResult(valid.name, data);
      }
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.name, content });
    }
  }
  return { reply: FALLBACK_REPLIES.noAnswer, stats };
}

// Every final reply passes the deterministic guard. A failing reply is never shown: the model gets
// one fixed repair request (no tools; the conversation, tool results and its own reply stay as
// messages, never inside the instruction), and a second failure returns the fixed fallback.
// A reply that looks like it holds a code or a full ID is left out of the repair request
// entirely; the fixed instruction names only the category. If a safe repair request cannot be
// built, the fixed fallback is returned without another model call.
// A reply holding a known internal ID in any form counts as a full_id violation.
function checkReply(reply, containsKnownId) {
  const { violations } = validateSupportReply(reply);
  if (containsKnownId(reply) && !violations.includes('full_id')) violations.push('full_id');
  return { ok: violations.length === 0, violations };
}

async function guardReply({ provider, messages, reply, stats, track, containsKnownId }) {
  const first = checkReply(reply, containsKnownId);
  if (first.ok) return { reply, stats };
  stats.guardViolations.push(...first.violations);
  stats.repairAttempted = true;
  let repaired = '';
  const badReply = containsSensitive(reply) || containsKnownId(reply) ? [] : [{ role: 'assistant', content: reply }];
  const request = { messages: [...messages, ...badReply, { role: 'user', content: repairInstruction(first.violations) }], tools: [] };
  if (!isProviderInputSafe(request, { containsKnownId })) {
    stats.fallback = true;
    return { reply: GUARD_FALLBACK_REPLY, stats };
  }
  try {
    const result = await provider.complete(request);
    track(result);
    if (!result.toolCalls.length) repaired = sanitizeReply(result.text);
  } catch {
    repaired = '';
  }
  const second = checkReply(repaired, containsKnownId);
  if (repaired && second.ok) {
    stats.repaired = true;
    return { reply: repaired, stats };
  }
  if (repaired) stats.guardViolations.push(...second.violations);
  stats.fallback = true;
  return { reply: GUARD_FALLBACK_REPLY, stats };
}
