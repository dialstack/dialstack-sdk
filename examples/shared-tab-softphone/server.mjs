// Serves the example and mints user session tokens, so the secret key stays on
// the server. Node built-ins only: run it with `node server.mjs`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiBaseUrl = process.env.DIALSTACK_API_BASE_URL ?? 'https://api.dialstack.ai';
const secretKey = process.env.DIALSTACK_SECRET_KEY;
const account = process.env.DIALSTACK_ACCOUNT;
const user = process.env.DIALSTACK_USER;
const port = Number(process.env.PORT ?? 3000);

if (!secretKey || !user) {
  console.error('Set DIALSTACK_SECRET_KEY and DIALSTACK_USER (and DIALSTACK_ACCOUNT for a platform key).');
  process.exit(1);
}

const here = fileURLToPath(new URL('.', import.meta.url));
// The page imports the SDK from /sdk/, served from the package's build output.
const sdkDist = fileURLToPath(new URL('../../webrtc/dist/', import.meta.url));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.map': 'application/json' };

async function mintToken() {
  const resp = await fetch(`${apiBaseUrl}/v1/user_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
      ...(account ? { 'DialStack-Account': account } : {}),
    },
    body: JSON.stringify({ user }),
  });
  if (!resp.ok) throw new Error(`user_sessions: ${resp.status} ${await resp.text()}`);
  return (await resp.json()).client_secret;
}

// Resolve a request path inside root, refusing anything that escapes it.
function inside(root, path) {
  const file = normalize(join(root, path));
  return file.startsWith(root.endsWith(sep) ? root : root + sep) ? file : null;
}

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  try {
    if (req.method === 'POST' && path === '/token') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(await mintToken());
    }
    if (path === '/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ apiBaseUrl }));
    }
    const page = { '/': 'index.html', '/shared-phone.mjs': 'shared-phone.mjs' }[path];
    const file = path.startsWith('/sdk/')
      ? inside(sdkDist, path.slice('/sdk/'.length))
      : page && join(here, page);
    if (!file || !(extname(file) in types)) {
      res.writeHead(404);
      return res.end();
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] });
    res.end(body);
  } catch (error) {
    const missing = error.code === 'ENOENT';
    res.writeHead(missing ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(missing ? 'Not found' : String(error.message));
  }
}).listen(port, () => {
  console.log(`Open http://localhost:${port} in a few tabs.`);
});
