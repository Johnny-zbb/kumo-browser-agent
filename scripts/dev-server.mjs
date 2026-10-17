import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { createLocalAgentBridge } from './local-agent-bridge.mjs';
const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4173);
const agentBridge = createLocalAgentBridge({ port, endpoint: process.env.KUMO_LLM_ENDPOINT, model: process.env.KUMO_LLM_MODEL, apiKey: process.env.KUMO_LLM_API_KEY });
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml' };
createServer(async (req, res) => {
  try {
    if (await agentBridge(req, res)) return;
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const mapped = url.pathname === '/' ? '/apps/playground/index.html' : url.pathname;
    const file = resolve(root, '.' + mapped);
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!(await stat(file)).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'x-content-type-options':'nosniff' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Kumo playground: http://localhost:${port}`));
