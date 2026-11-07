// Read-only diagnosis -> one AI description/plan -> application-rendered operations.
// No correction inference, no arbitrary model-written navigation, no persistence.
import { toModelToolResult } from './ai-diagnostics.js';
import { EgressBlockedError, guardedProvider, isProviderInputSafe } from './ai-support-egress.js';
import { validateSupportReply, GUARD_FALLBACK_REPLY } from './ai-support-guard.js';
import { AI_SUPPORT_LIMITS, AI_SUPPORT_SYSTEM_PROMPT, FALLBACK_REPLIES, SECRET_REFUSAL, sanitizeReply } from './ai-support-policy.js';
import { containsSensitive, createKnownIdMatcher } from './secret-detector.js';
import { SUPPORT_PLAN_FORMAT, SUPPORT_QUESTIONS, chooseSupportApp, decodeSupportPlan, defaultSupportActions,
  renderSupportAction, supportCaption, supportDescription, supportFaq, supportModelData } from './ai-support-actions.js';

export async function runSupportTurn({ provider: rawProvider, diagnostics, history = [], message, knownIds = [],
  maxModelCalls = AI_SUPPORT_LIMITS.maxModelCalls, observeModelResult }) {
  const containsKnownId = createKnownIdMatcher(knownIds);
  const maxCalls = Math.min(Number.isSafeInteger(maxModelCalls) && maxModelCalls > 0 ? maxModelCalls : 0, 1);
  const provider = guardedProvider(rawProvider, { maxCalls, knownIds });
  const started = Date.now();
  const stats = { modelCalls: 0, toolCalls: 0, rejectedToolCalls: 0, usage: { inputTokens: 0, outputTokens: 0 },
    guardViolations: [], repairAttempted: false, repaired: false, fallback: false, firstAnswerMs: null,
    directAnswer: false, explanationSentencesOmitted: 0, diagnosticSummaryUsed: false, rejectedActions: 0 };
  const messages = [{ role: 'system', content: AI_SUPPORT_SYSTEM_PROMPT },
    ...history.map(({ role, content }) => ({ role, content })), { role: 'user', content: message }];
  // Direct answers do not bypass the same input/known-ID checks or read any diagnostic data.
  if (!isProviderInputSafe({ messages, tools: [] }, { containsKnownId })) {
    return { reply: SECRET_REFUSAL, stats, egressBlocked: true };
  }
  const faq = supportFaq(message);
  if (faq) { stats.directAnswer = true; return { reply: faq, stats }; }

  const context = { overview: null, appId: null, details: new Map() };
  const load = async (name, args, read) => {
    const data = await read(); stats.toolCalls++;
    const id = `call_${stats.toolCalls}`;
    messages.push({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
    messages.push({ role: 'tool', tool_call_id: id, name, content: toModelToolResult(name, supportModelData(data)) });
    return data;
  };
  try {
    context.overview = await load('getSyncOverview', {}, () => diagnostics.getSyncOverview());
    context.appId = chooseSupportApp(message, context.overview, history);
    if (context.appId) {
      const detail = await load('getAppSyncTargets', { appId: context.appId }, () => diagnostics.getAppSyncTargets(context.appId));
      if (detail.app?.appId !== context.appId) throw new Error('diagnostic_app_mismatch');
      context.details.set(context.appId, detail);
      // Each original diagnostic performs its own SELECTs. A later detail may observe a state
      // transition; both the caption and action prerequisites must use that newer snapshot.
      context.overview = { ...context.overview, apps: context.overview.apps.map((app) => app.appId === context.appId ? detail.app : app) };
    }
  } catch {
    return { reply: FALLBACK_REPLIES.diagnosticsUnavailable, stats, diagnosticsFailed: true };
  }
  const caption = supportCaption(context);
  const compose = (plan) => {
    const safeSentence = (s) => validateSupportReply(s).ok && !containsKnownId(s);
    const description = supportDescription(sanitizeReply(plan.explanation), safeSentence);
    stats.explanationSentencesOmitted = description.omitted;
    stats.diagnosticSummaryUsed = !description.text;
    const suggestions = plan.actions.length ? plan.actions : defaultSupportActions(context);
    const operations = [];
    for (const action of suggestions) {
      const rendered = renderSupportAction(action, context);
      if (rendered && !operations.includes(rendered)) operations.push(rendered);
      else stats.rejectedActions++;
    }
    if (!operations.length) for (const action of defaultSupportActions(context)) operations.push(renderSupportAction(action, context));
    const redundantAppQuestion = plan.questionId === 'which_app' && (context.appId ||
      new Set(context.overview.apps?.map((app) => app.displayStatus)).size === 1);
    const question = redundantAppQuestion ? '' : SUPPORT_QUESTIONS[plan.questionId] || '';
    // Output stays plain text and uses the existing API shape. No stored-schema or UI change.
    return sanitizeReply([caption, description.text, ...operations, question].filter(Boolean).join('\n\n'));
  };
  if (!maxCalls) { stats.fallback = true; return { reply: compose({ explanation: '', actions: [], questionId: 'none' }), stats }; }
  try {
    const result = await provider.complete({ messages, tools: [], responseFormat: SUPPORT_PLAN_FORMAT });
    stats.modelCalls = provider.calls;
    stats.usage.inputTokens += result.usage?.inputTokens || 0;
    stats.usage.outputTokens += result.usage?.outputTokens || 0;
    stats.firstAnswerMs = Date.now() - started;
    // Only the synthetic evaluator supplies this callback. The HTTP route never accepts it,
    // so production prompts/replies are neither logged nor persisted by this observer.
    observeModelResult?.({ text: result.text, toolCalls: result.toolCalls, usage: result.usage });
    if (containsSensitive(result.text) || containsKnownId(result.text)) {
      stats.guardViolations.push('sensitive_output'); stats.fallback = true;
      return { reply: GUARD_FALLBACK_REPLY, stats };
    }
    const plan = decodeSupportPlan(result.text);
    if (result.toolCalls?.length) { stats.rejectedToolCalls += result.toolCalls.length; plan.malformed = true; plan.explanation = ''; plan.actions = []; }
    if (containsSensitive(plan.explanation) || containsKnownId(plan.explanation)) {
      stats.guardViolations.push('sensitive_output'); stats.fallback = true;
      return { reply: GUARD_FALLBACK_REPLY, stats };
    }
    stats.fallback = Boolean(plan.malformed);
    return { reply: compose(plan), stats };
  } catch (error) {
    stats.modelCalls = provider.calls;
    if (error instanceof EgressBlockedError) return { reply: SECRET_REFUSAL, stats, egressBlocked: true };
    throw error;
  }
}
