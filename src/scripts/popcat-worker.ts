/**
 * Pop Cat's model, in a background thread so the page stays responsive while it thinks.
 * This file (and the WebLLM library it imports, a few MB) is only downloaded when a
 * visitor sends their first question.
 *
 * Messages in:  { type: 'load', model, host } | { type: 'chat', id, messages, noThink } | { type: 'stop' }
 * Messages out: { type: 'progress', progress, text } | { type: 'ready' }
 *               | { type: 'token', id, delta } | { type: 'done', id, tps } | { type: 'error', id?, message }
 */
import { MLCEngine, prebuiltAppConfig, type ChatCompletionMessageParam } from '@mlc-ai/web-llm';

type Incoming =
  | { type: 'load'; model: string; host: string }
  | { type: 'chat'; id: number; messages: ChatCompletionMessageParam[]; noThink: boolean }
  | { type: 'stop' };

// (typed by hand: pulling in the full worker type library would clash with the page's own types)
const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
};
let engine: MLCEngine | null = null;

/**
 * WebLLM knows where each model lives on Hugging Face and GitHub. With a `host`, point
 * the same model at our own copy instead: weights at <host>/<id>/, the compiled library
 * at <host>/libs/<version>/<file>.wasm.
 */
function appConfigFor(model: string, host: string) {
  const record = prebuiltAppConfig.model_list.find((m) => m.model_id === model);
  if (!host || !record) return prebuiltAppConfig;
  const [, version, file] = record.model_lib.match(/web-llm-models\/([^/]+)\/.*\/([^/]+\.wasm)$/) ?? [];
  if (!version || !file) return prebuiltAppConfig;
  return {
    ...prebuiltAppConfig,
    model_list: [{ ...record, model: `${host}/${model}`, model_lib: `${host}/libs/${version}/${file}` }],
  };
}

scope.onmessage = async (event: MessageEvent<Incoming>) => {
  const msg = event.data;
  try {
    if (msg.type === 'load') {
      engine ??= new MLCEngine({
        appConfig: appConfigFor(msg.model, msg.host),
        initProgressCallback: (r) => scope.postMessage({ type: 'progress', progress: r.progress, text: r.text }),
      });
      await engine.reload(msg.model);
      scope.postMessage({ type: 'ready' });
    } else if (msg.type === 'chat') {
      if (!engine) throw new Error('The model is not loaded yet.');
      const stream = await engine.chat.completions.create({
        messages: msg.messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.4,
        top_p: 0.9,
        // small models loop easily; these make repeating a phrase progressively less likely
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
        max_tokens: 260,
        ...(msg.noThink ? { extra_body: { enable_thinking: false } } : {}),
      });
      let tps: number | undefined;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) scope.postMessage({ type: 'token', id: msg.id, delta });
        if (chunk.usage) tps = chunk.usage.extra?.decode_tokens_per_s;
      }
      scope.postMessage({ type: 'done', id: msg.id, tps });
    } else if (msg.type === 'stop') {
      engine?.interruptGenerate();
    }
  } catch (err) {
    scope.postMessage({
      type: 'error',
      id: 'id' in msg ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
