// Servidor local que imita a Vercel: arquivos de public/ + funções de api/.
// Uso: PAINEL_SENHA=teste npm run dev  (os dados ficam em .data/dev-store.json)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
process.env.PAINEL_SENHA ||= 'teste';
process.env.PAINEL_DEV_STORE ||= join(root, '.data', 'dev-store.json');
const port = Number(process.env.PORT) || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
      const mod = await import(pathToFileURL(join(root, 'api', `${name}.js`)).href);
      const handler = mod[req.method];
      if (!handler) {
        res.writeHead(405).end();
        return;
      }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const file = normalize(join(root, 'public', url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(join(root, 'public'))) throw Object.assign(new Error('fora'), { code: 'ENOENT' });
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ERR_MODULE_NOT_FOUND') res.writeHead(404).end('Não encontrado');
    else {
      console.error(err);
      res.writeHead(500).end(String(err.message));
    }
  }
}).listen(port, () => console.log(`Painel em http://localhost:${port} (senha: ${process.env.PAINEL_SENHA})`));
