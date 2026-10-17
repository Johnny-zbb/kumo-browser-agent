import { LlmPlanner } from '../dist/packages/agent-core/src/llm-planner.js';
import { OpenAICompatibleModel } from '../dist/packages/llm-client/src/openai-compatible.js';

const MAX_BODY_BYTES = 64 * 1024;
const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(data));
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const short = (value, max) => typeof value === 'string' && value.length <= max;
const localHost = hostname => ['localhost', '127.0.0.1'].includes(hostname);

function validTree(tree) {
  if (!Array.isArray(tree) || tree.length > 120) return false;
  let count = 0;
  const walk = (nodes, depth) => depth <= 12 && nodes.every(node => {
    if (++count > 300 || !record(node) || !short(node.role, 60) || (node.name !== undefined && !short(node.name, 120))) return false;
    if (node.ref !== undefined && (!Number.isInteger(node.ref) || node.ref < 1)) return false;
    return node.children === undefined || (Array.isArray(node.children) && node.children.length <= 120 && walk(node.children, depth + 1));
  });
  return walk(tree, 0);
}
function validElement(node) {
  return record(node) && Number.isInteger(node.ref) && node.ref > 0 && short(node.name, 120) && short(node.role, 60) &&
    typeof node.disabled === 'boolean' && (node.value === undefined || short(node.value, 512)) &&
    Array.isArray(node.actions) && node.actions.length <= 4 && node.actions.every(x => ['click', 'input', 'selectOption', 'scroll'].includes(x));
}
function validateRequest(body, origin) {
  if (!record(body) || !short(body.task, 600) || !body.task.trim() || !record(body.snapshot)) return null;
  const s = body.snapshot;
  if (!Number.isInteger(s.id) || !short(s.url, 500) || !short(s.title, 200) || !short(s.text, 2400)) return null;
  try { if (new URL(s.url).origin !== origin) return null; } catch { return null; }
  if (!Array.isArray(s.elements) || s.elements.length > 100 || !s.elements.every(validElement) || !validTree(s.tree) || !record(s.viewport)) return null;
  const vp = s.viewport;
  if (!['scrollTop', 'clientHeight', 'scrollHeight'].every(k => typeof vp[k] === 'number' && Number.isFinite(vp[k])) || typeof vp.atBottom !== 'boolean') return null;
  if (!Array.isArray(body.history) || body.history.length > 4 || !body.history.every(x => record(x) && Number.isInteger(x.turn) && record(x.decision) && ['act','done','fail'].includes(x.decision.kind) && ['ok','error','skipped'].includes(x.actionResult))) return null;
  return { task: body.task, snapshot: s, history: body.history };
}
async function readBody(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf-8')); }
  catch { throw new Error('invalid_json'); }
}

/** Local-only decision API. It never executes a browser action and never transmits a model credential to the client. */
export function createLocalAgentBridge(options) {
  const configured = Boolean(options.decisionModel || (options.endpoint && options.model && options.apiKey));
  const model = options.decisionModel ?? (configured ? new OpenAICompatibleModel({ endpoint: options.endpoint, model: options.model, apiKey: options.apiKey }) : null);
  const planner = model ? new LlmPlanner(model) : null;
  let inFlight = 0;
  return async (req, res) => {
    const pathname = new URL(req.url || '/', `http://localhost:${options.port}`).pathname;
    if (!pathname.startsWith('/api/agent/')) return false;
    const host = req.headers.host || '';
    let requestOrigin;
    try {
      const parsed = new URL(`http://${host}`);
      if (!localHost(parsed.hostname) || Number(parsed.port || '80') !== options.port) throw new Error('invalid_host');
      requestOrigin = parsed.origin;
    } catch { send(res, 403, { error: 'invalid_host' }); return true; }
    if (pathname === '/api/agent/config' && req.method === 'GET') {
      send(res, 200, { llmConfigured: configured }); return true;
    }
    if (pathname !== '/api/agent/decision' || req.method !== 'POST') {
      send(res, 404, { error: 'not_found' }); return true;
    }
    if (req.headers.origin !== requestOrigin || !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      send(res, 403, { error: 'cross_origin_or_content_type' }); return true;
    }
    if (!planner) { send(res, 503, { error: 'model_not_configured' }); return true; }
    if (inFlight >= 2) { send(res, 429, { error: 'model_busy' }); return true; }
    let payload;
    try { payload = await readBody(req); }
    catch { send(res, 400, { error: 'invalid_json_or_body_size' }); return true; }
    const input = validateRequest(payload, requestOrigin);
    if (!input) { send(res, 400, { error: 'invalid_model_request' }); return true; }
    const abort = new AbortController();
    const disconnect = () => { if (!res.writableEnded) abort.abort(); };
    res.once('close', disconnect);
    inFlight++;
    try {
      const decision = await planner.decide(input.task, input.snapshot, input.history, abort.signal);
      if (!res.destroyed) send(res, 200, { decision });
    } catch (error) {
      if (!res.destroyed) send(res, 502, { error: 'model_decision_failed', detail: error instanceof Error ? error.message.slice(0,120) : 'unknown' });
    } finally {
      inFlight--;
      res.off('close', disconnect);
    }
    return true;
  };
}
