import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

const PUBLIC_FILES = new Set([
  'apps/playground/index.html',
  'apps/playground/styles.css'
]);
const PUBLIC_MODULE = /^dist\/(?:apps\/playground|packages\/(?:agent-core|dom-engine))\/src\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};

export function isLocalPlaygroundHost(host, port) {
  try {
    const url = new URL(`http://${host}`);
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && Number(url.port || '80') === port && !url.username && !url.password;
  } catch { return false; }
}

function isPublicPath(path) {
  return PUBLIC_FILES.has(path) || PUBLIC_MODULE.test(path);
}
function fail(res, code) {
  res.writeHead(code, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' });
  res.end(code === 403 ? 'Forbidden' : code === 405 ? 'Method not allowed' : 'Not found');
}

/** Serve only the controlled demo and its compiled browser modules (never source, .env or Node credentials). */
export async function servePlaygroundAsset(req, res, { root, port }) {
  if (!isLocalPlaygroundHost(req.headers.host, port)) { fail(res, 403); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { fail(res, 405); return; }
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) { fail(res, 403); return; }
  let pathname;
  try { pathname = new URL(req.url || '/', `http://localhost:${port}`).pathname; }
  catch { fail(res, 404); return; }
  const path = pathname === '/' ? 'apps/playground/index.html' : pathname.replace(/^\//, '');
  if (!isPublicPath(path)) { fail(res, 404); return; }

  try {
    const rootReal = await realpath(root);
    const file = resolve(rootReal, path);
    const actual = await realpath(file);
    // A symlink can otherwise make an approved module path expose an unrelated local file.
    const actualRelative = relative(rootReal, actual).split(sep).join('/');
    if (actualRelative !== path || !isPublicPath(actualRelative)) { fail(res, 403); return; }
    if (!(await stat(actual)).isFile()) { fail(res, 404); return; }
    const buffer = await readFile(actual);
    res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': MIME[extname(actual)] });
    res.end(req.method === 'HEAD' ? undefined : buffer);
  } catch { fail(res, 404); }
}
