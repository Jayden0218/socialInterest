import { createServer, type Server, request as httpRequest } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Serves the browser build AND proxies /v1 to the API, on one origin.
 *
 * Same-origin on purpose: a separate static host would need CORS enabled on the
 * API, and loosening a product's CORS policy to make a test pass is how a test
 * starts shaping the thing it is meant to check. The proxy keeps the product
 * untouched.
 */
const WEB = resolve(__dirname, '../../mobile/web');

export interface WebServer {
  url: string;
  stop(): Promise<void>;
}

export async function startWebServer(apiBaseUrl: string): Promise<WebServer> {
  const api = new URL(apiBaseUrl);

  const server: Server = createServer((req, res) => {
    const url = req.url ?? '/';

    if (url.startsWith('/v1')) {
      const proxied = httpRequest(
        { hostname: api.hostname, port: api.port, path: url, method: req.method, headers: { ...req.headers, host: api.host } },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxied.on('error', () => {
        res.writeHead(502).end('api unreachable');
      });
      req.pipe(proxied);
      return;
    }

    const file = url === '/' ? 'index.html' : url.replace(/^\//, '');
    const candidates = [resolve(WEB, file), resolve(WEB, 'dist', file)];
    const found = candidates.find((c) => existsSync(c) && c.startsWith(WEB));
    if (!found) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': found.endsWith('.html') ? 'text/html' : 'application/javascript',
    });
    res.end(readFileSync(found));
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((done) => server.close(() => done())),
  };
}
