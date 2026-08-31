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

const LISTEN_PORT = Number(process.env.HTTP_LISTEN_PORT) || 3000;
const TLS_PORT = Number(process.env.HTTPS_LISTEN_PORT) || 3443;
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

// The app is built and started under the ingress path as its basePath, so it
// only routes prefixed paths even on this port. Direct visitors ask for bare
// ones, so the prefix is added here and stripped again in the browser by the
// pathname override the ingress page injects.
const BASE_PATH = (process.env.INGRESS_BASE_PATH || '').replace(/\/$/, '');

function upstreamPath(url) {
  if (!BASE_PATH || url.startsWith(BASE_PATH)) return url;
  return BASE_PATH + url;
}

const PATHNAME_HELPER = `<script>(function(){
var b=${JSON.stringify(BASE_PATH)};
if(!b)return;
var d=Object.getOwnPropertyDescriptor(Location.prototype,'pathname');
if(!d||!d.get)return;
try{
  Object.defineProperty(Location.prototype,'pathname',{
    configurable:true,enumerable:d.enumerable,
    get:function(){
      var p=d.get.call(this);
      return this===window.location&&p.indexOf(b)===0?(p.slice(b.length)||'/'):p;
    },
    set:d.set?function(v){return d.set.call(this,v)}:undefined
  });
}catch(e){}
})();</script>`;

function forward(req, res) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: APP_PORT,
      method: req.method,
      path: upstreamPath(req.url || '/'),
      headers: { ...req.headers, 'x-forwarded-proto': 'https' },
    },
    (up) => {
      const headers = { ...up.headers };
      if (!BASE_PATH || !String(headers['content-type'] || '').includes('text/html')) {
        res.writeHead(up.statusCode || 502, headers);
        up.pipe(res);
        return;
      }

      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        const body = Buffer.concat(chunks)
          .toString('utf8')
          .replace(/<head([^>]*)>/i, (m) => m + PATHNAME_HELPER);
        delete headers['content-length'];
        delete headers.etag;
        headers['cache-control'] = 'no-store';
        res.writeHead(up.statusCode || 200, headers);
        res.end(body);
      });
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

function listen(server, port, label) {
  server.on('upgrade', upgrade);
  server.on('error', (err) => console.error(`[tls] cannot bind ${port}: ${err.message}`));
  server.listen(port, '0.0.0.0', () => console.log(`[tls] ${label} on ${port} -> 127.0.0.1:${APP_PORT}`));
}

// Plain HTTP stays on the published port so the app keeps working over an IP
// address, where a certificate issued for a hostname would not match. HTTPS is
// served alongside it, on its own port, for embedding in an HTTPS dashboard.
listen(http.createServer(forward), LISTEN_PORT, 'HTTP');

const creds = readCert();
if (creds) {
  const secure = https.createServer(creds, forward);
  for (const file of [CERT, KEY]) {
    try {
      fs.watchFile(file, { interval: 60000 }, () => {
        const next = readCert();
        if (next) {
          secure.setSecureContext(next);
          console.log('[tls] certificate reloaded');
        }
      });
    } catch {
      /* watching is best effort */
    }
  }
  listen(secure, TLS_PORT, 'HTTPS');
} else {
  console.log(`[tls] no certificate at ${CERT}; HTTPS disabled, sidebar will link out`);
}
