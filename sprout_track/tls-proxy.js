/*
 * Serves the app over HTTPS on the published port.
 *
 * The sidebar frames the app on an HTTPS dashboard, and a browser will not load
 * an HTTP source there. Home Assistant's certificate is reused so the framed
 * origin matches the name the dashboard is reached by. Next.js itself listens on
 * an internal port; this terminates TLS in front of it.
 *
 * Certificates are reloaded when they change, since Let's Encrypt renews them
 * while the add-on keeps running.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');

const LISTEN_PORT = Number(process.env.TLS_LISTEN_PORT) || 3000;
const APP_PORT = Number(process.env.APP_INTERNAL_PORT) || 3001;
const CERT = process.env.SSL_CERTFILE || '/ssl/fullchain.pem';
const KEY = process.env.SSL_KEYFILE || '/ssl/privkey.pem';

function readCert() {
  try {
    return { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) };
  } catch {
    return null;
  }
}

function forward(req, res) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: APP_PORT,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, 'x-forwarded-proto': 'https' },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on('error', (err) => {
    if (res.headersSent) return res.end();
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Sprout Track is still starting. Reload in a moment.\n(${err.code || err.message})`);
  });
  req.pipe(upstream);
}

function upgrade(req, socket) {
  const up = http.request({
    host: '127.0.0.1',
    port: APP_PORT,
    method: req.method,
    path: req.url,
    headers: req.headers,
  });
  up.on('upgrade', (upRes, upSocket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n'
    );
    upSocket.pipe(socket).pipe(upSocket);
  });
  up.on('error', () => socket.destroy());
  up.end();
}

const creds = readCert();
let server;

if (creds) {
  server = https.createServer(creds, forward);
  for (const file of [CERT, KEY]) {
    try {
      fs.watchFile(file, { interval: 60000 }, () => {
        const next = readCert();
        if (next) {
          server.setSecureContext(next);
          console.log('[tls] certificate reloaded');
        }
      });
    } catch {
      /* watching is best effort */
    }
  }
  console.log(`[tls] HTTPS on ${LISTEN_PORT} -> 127.0.0.1:${APP_PORT}`);
} else {
  server = http.createServer(forward);
  console.log(`[tls] no certificate at ${CERT}; serving HTTP on ${LISTEN_PORT}`);
}

server.on('upgrade', upgrade);
server.on('error', (err) => console.error(`[tls] cannot bind ${LISTEN_PORT}: ${err.message}`));
server.listen(LISTEN_PORT, '0.0.0.0');
