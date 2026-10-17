import type { DecisionModelPort } from '../../agent-core/src/llm-planner.js';

/** Server-side transport only. Never bundle this class with an API key into a web page. */
export class OpenAICompatibleModel implements DecisionModelPort {
  private readonly endpoint: string;
  constructor(private readonly options: {
    endpoint: string;
    model: string;
    apiKey: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }) {
    const url = new URL(options.endpoint);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) {
      throw new Error('llm_endpoint_requires_https_or_loopback');
    }
    if (!options.model || !options.apiKey) throw new Error('llm_missing_credentials_or_model');
    this.endpoint = url.toString();
  }

  async complete(input: { system: string; user: string; signal?: AbortSignal }): Promise<string> {
    const timeoutMs = this.options.timeoutMs ?? 30_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) throw new Error('invalid_model_timeout');
    const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const response = await (this.options.fetchImpl ?? fetch)(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({ model: this.options.model, messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }], temperature: 0 }),
      signal
    });
    if (!response.ok) throw new Error(`llm_http_${response.status}`);
    const raw = await response.text();
    if (raw.length > 100_000) throw new Error('llm_response_too_large');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('llm_invalid_response'); }
    if (!parsed || typeof parsed !== 'object' || !('choices' in parsed) || !Array.isArray(parsed.choices)) throw new Error('llm_invalid_response');
    const content = parsed.choices[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('llm_missing_content');
    return content;
  }
}
