// 开发/测试用静态服务器：node scripts/serve.mjs
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const SRC = path.join(PROJECT, 'src');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function startServer({ port = 5180, host = '127.0.0.1', root = SRC } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://${host}`);
        let rel = decodeURIComponent(url.pathname);
        if (rel === '/' || rel === '') rel = '/index.html';
        const file = path.normalize(path.join(root, rel));
        if (!file.startsWith(root + path.sep) && file !== root) {
          res.writeHead(403).end('forbidden');
          return;
        }
        const data = await fs.readFile(file);
        res.writeHead(200, {
          'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(data);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({
        server,
        port,
        url: `http://${host}:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 5180;
  const s = await startServer({ port });
  console.log(`[serve] ${s.url}/index.html`);
}
