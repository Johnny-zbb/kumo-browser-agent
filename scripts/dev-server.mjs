import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createLocalAgentBridge } from './local-agent-bridge.mjs';
import { servePlaygroundAsset } from './playground-static.mjs';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 4173);
const agentBridge = createLocalAgentBridge({
  port,
  endpoint: process.env.KUMO_LLM_ENDPOINT,
  model: process.env.KUMO_LLM_MODEL,
  apiKey: process.env.KUMO_LLM_API_KEY
});

createServer(async (req, res) => {
  try {
    if (await agentBridge(req, res)) return;
    await servePlaygroundAsset(req, res, { root, port });
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    res.end('Internal error');
  }
}).listen(port, '127.0.0.1', () => console.log(`Kumo playground: http://localhost:${port}`));
