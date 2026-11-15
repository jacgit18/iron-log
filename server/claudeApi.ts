// The Claude API, the only place that knows the vendor (moved out of scan.ts; the label, receipt and bottle scans and the ingredient resolver all call it).
// Raw fetch, no SDK package.

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 30_000;

/** The one vendor call. Throws on any failure; the caller turns that into "not available". */
export async function askModel(ask: typeof fetch, key: string, model: string, image: string, p: { system: string; text: string; maxTokens: number }): Promise<string> {
  const r = await ask(API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VERSION },
    body: JSON.stringify({
      model,
      max_tokens: p.maxTokens,
      system: p.system,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: p.text }] }],
    }),
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const body = (await r.json()) as { content?: { type?: string; text?: unknown }[] };
  const first = body.content?.find(part => part?.type === 'text');
  if (typeof first?.text !== 'string') throw new Error('no text in reply');
  return first.text;
}
