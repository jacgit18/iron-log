// The Claude API, the only place that knows the vendor (moved out of scan.ts; the label, receipt and bottle scans and the ingredient resolver all call it).
// Raw fetch, no SDK package.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 30_000;
/** The scans may think and then write up to ~7,000 tokens, so they wait longer than the resolver; under the 120 s Cloud Run request limit (scripts/deploy-cloud-run.sh), so the server answers "not available" before the platform cuts the request. */
export const SCAN_TIMEOUT_MS = 90_000;

/** Models that take `output_config.effort` (claude-api skill, checked 2026-11-16: Claude 5 family, effort `low` to `max`). An older model (Haiku 4.5, Sonnet 4.5) rejects the field with a 400, so a `SCAN_*_MODEL` set to one gets no effort setting. */
export const takesEffort = (model: string): boolean => /^claude-(haiku|sonnet|opus|fable|mythos)-5(-\d+)?$/.test(model);
/** Effort of the scans: below the default of Sonnet 5.5 (`high`) and Haiku 5.5 (`medium`), so thinking is bounded, above the resolver's `low` because a scan reads dense print and is not yet measured lower. */
export const SCAN_EFFORT = 'medium';

const tokensOf = (body: { usage?: { input_tokens?: unknown; output_tokens?: unknown } }) => {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { inputTokens: n(body.usage?.input_tokens), outputTokens: n(body.usage?.output_tokens) };
};

/** The one vendor call (an image in, text out). Throws on any failure or a cut-off reply (`stop_reason` is not `end_turn`, e.g. `stopped: max_tokens`); an error for a reply that did come back has `spent` (its tokens, paid for even when cut off); the caller turns that into "not available". Thinking is bounded by `SCAN_EFFORT` where the model takes it. */
export async function askModel(ask: typeof fetch, key: string, model: string, image: string, p: { system: string; text: string; maxTokens: number }): Promise<string> {
  const r = await ask(API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VERSION },
    body: JSON.stringify({
      model,
      max_tokens: p.maxTokens,
      system: p.system,
      ...(takesEffort(model) ? { output_config: { effort: SCAN_EFFORT } } : {}),
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: p.text }] }],
    }),
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const body = (await r.json()) as { stop_reason?: unknown; content?: { type?: string; text?: unknown }[]; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
  const paidFor = (message: string) => Object.assign(new Error(message), { spent: tokensOf(body) });
  if (body.stop_reason !== 'end_turn') throw paidFor(`stopped: ${typeof body.stop_reason === 'string' ? body.stop_reason : 'unknown'}`);
  const first = body.content?.find(part => part?.type === 'text');
  if (typeof first?.text !== 'string') throw paidFor('no text in reply');
  return first.text;
}

export interface TextReply { text: string; inputTokens: number; outputTokens: number }

/** A text-only call whose reply is one JSON object that matches `schema` (structured output, effort low). Throws on any failure, a refusal or a cut-off reply (`stop_reason` is not `end_turn`); an error for a reply that did come back has `spent` (its tokens);
 *  the caller turns that into "not available". The user turn is data: the system prompt says so. */
export async function askModelJson(ask: typeof fetch, key: string, model: string, p: { system: string; user: string; schema: Record<string, unknown>; maxTokens: number }): Promise<TextReply> {
  const r = await ask(API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VERSION },
    body: JSON.stringify({
      model,
      max_tokens: p.maxTokens,
      system: p.system,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: p.schema } },
      messages: [{ role: 'user', content: p.user }],
    }),
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const body = (await r.json()) as { stop_reason?: unknown; content?: { type?: string; text?: unknown }[]; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
  const spent = tokensOf(body);
  // A reply that came back was paid for, usable or not (a cut-off one up to the whole limit): the error carries its tokens so a caller that counts spend does not lose them.
  const paidFor = (message: string) => Object.assign(new Error(message), { spent });
  if (body.stop_reason !== 'end_turn') throw paidFor(`stopped: ${typeof body.stop_reason === 'string' ? body.stop_reason : 'unknown'}`);
  const first = body.content?.find(part => part?.type === 'text');
  if (typeof first?.text !== 'string') throw paidFor('no text in reply');
  return { text: first.text, ...spent };
}
