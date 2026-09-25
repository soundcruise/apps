// One AI support turn (AI1-B): fixed system prompt, bounded history, the user's message as a user
// message, at most two read-only diagnostic tool calls, and diagnostics returned only as tool
// results in the AI1-A trust envelope. Provider- and model-agnostic; nothing is stored.
import { toModelToolResult } from './ai-diagnostics.js';
import { GUARD_FALLBACK_REPLY, repairInstruction, validateSupportReply } from './ai-support-guard.js';
import {
  AI_SUPPORT_LIMITS, AI_SUPPORT_SYSTEM_PROMPT, AI_SUPPORT_TOOLS, FALLBACK_REPLIES, containsMarkdown, sanitizeReply,
  validateToolCall
} from './ai-support-policy.js';

// history: earlier [{ role: 'user' | 'assistant', content }] (already validated and capped).
export async function runSupportTurn({ provider, diagnostics, history = [], message }) {
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
      return guardReply({ provider, messages, reply, stats, track });
    }
    if (!toolsAllowed) break;
    messages.push({
      role: 'assistant',
      content: result.text || '',
      tool_calls: result.toolCalls.map((call) => ({
        id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }
      }))
    });
    for (const call of result.toolCalls) {
      let content;
      const valid = validateToolCall(call.name, call.arguments);
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
async function guardReply({ provider, messages, reply, stats, track }) {
  const first = validateSupportReply(reply);
  if (first.ok) return { reply, stats };
  stats.guardViolations.push(...first.violations);
  stats.repairAttempted = true;
  let repaired = '';
  try {
    const result = await provider.complete({ messages: [
      ...messages,
      { role: 'assistant', content: reply },
      { role: 'user', content: repairInstruction(first.violations) }
    ], tools: [] });
    track(result);
    if (!result.toolCalls.length) repaired = sanitizeReply(result.text);
  } catch {
    repaired = '';
  }
  const second = validateSupportReply(repaired);
  if (repaired && second.ok) {
    stats.repaired = true;
    return { reply: repaired, stats };
  }
  if (repaired) stats.guardViolations.push(...second.violations);
  stats.fallback = true;
  return { reply: GUARD_FALLBACK_REPLY, stats };
}
