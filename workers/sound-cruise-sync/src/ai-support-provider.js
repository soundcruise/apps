// The single place that talks to a model provider (AI1-B). Chat logic and diagnostics never see a
// provider-specific shape: complete() takes OpenAI-style chat messages + function tools and returns
// { text, toolCalls: [{ id, name, arguments }], usage }. Every provider failure (timeout, 429, 5xx,
// malformed output) becomes AiProviderError('ai_provider_unavailable'); no provider text, body or
// status is ever passed on to the user or the model.

export const AI_SUPPORT_MODELS = Object.freeze({
  'gpt-oss-120b': Object.freeze({ id: '@cf/openai/gpt-oss-120b', reasoningEffort: 'low',
    price: { inputPerM: 0.35, outputPerM: 0.75 } }),
  'qwen3-30b': Object.freeze({ id: '@cf/qwen/qwen3-30b-a3b-fp8', reasoningEffort: null,
    price: { inputPerM: 0.0509, outputPerM: 0.335 } })
});
export const DEFAULT_AI_SUPPORT_MODEL = 'gpt-oss-120b';

export class AiProviderError extends Error {
  constructor() {
    super('ai_provider_unavailable');
    this.code = 'ai_provider_unavailable';
  }
}

function parseArguments(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

// Accepts the shapes Workers AI models return: chat completions (choices[0].message), the classic
// Workers AI shape ({ response, tool_calls }), and Responses-API output items.
export function normalizeCompletion(raw) {
  if (!raw || typeof raw !== 'object') throw new AiProviderError();
  const message = raw.choices?.[0]?.message;
  let text = null;
  let calls = [];
  if (message) {
    text = typeof message.content === 'string' ? message.content : null;
    calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  } else if (Array.isArray(raw.output)) {
    for (const item of raw.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        text = item.content.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('');
      } else if (item?.type === 'function_call') {
        calls.push({ id: item.call_id || item.id, name: item.name, arguments: item.arguments });
      }
    }
  } else {
    text = typeof raw.response === 'string' ? raw.response
      : raw.response != null && typeof raw.response === 'object' ? JSON.stringify(raw.response) : null;
    calls = Array.isArray(raw.tool_calls) ? raw.tool_calls : [];
  }
  const toolCalls = calls.map((call, index) => ({
    id: typeof (call.id ?? call.call_id) === 'string' ? (call.id ?? call.call_id) : `call_${index + 1}`,
    name: typeof (call.function?.name ?? call.name) === 'string' ? (call.function?.name ?? call.name) : '',
    arguments: parseArguments(call.function?.arguments ?? call.arguments)
  }));
  const usage = raw.usage && typeof raw.usage === 'object' ? {
    inputTokens: Number(raw.usage.prompt_tokens ?? raw.usage.input_tokens) || 0,
    outputTokens: Number(raw.usage.completion_tokens ?? raw.usage.output_tokens) || 0
  } : null;
  return { text, toolCalls, usage };
}

// ai: the Workers AI binding (env.AI) or a test double with run(model, inputs).
export function createWorkersAiProvider({ ai, modelKey = DEFAULT_AI_SUPPORT_MODEL, timeoutMs = 25_000,
  maxOutputTokens = 900 } = {}) {
  const model = AI_SUPPORT_MODELS[modelKey];
  if (!model) throw new Error('ai_support_model_unknown');
  if (!ai || typeof ai.run !== 'function') throw new Error('ai_support_binding_missing');
  return Object.freeze({
    modelKey,
    modelId: model.id,
    async complete({ messages, tools = [] }) {
      const inputs = { messages, max_tokens: maxOutputTokens, temperature: 0.2 };
      if (tools.length) inputs.tools = tools;
      if (model.reasoningEffort) inputs.reasoning = { effort: model.reasoningEffort };
      let timer;
      try {
        const raw = await Promise.race([
          ai.run(model.id, inputs),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new AiProviderError()), timeoutMs); })
        ]);
        return normalizeCompletion(raw);
      } catch {
        throw new AiProviderError();
      } finally {
        clearTimeout(timer);
      }
    }
  });
}
