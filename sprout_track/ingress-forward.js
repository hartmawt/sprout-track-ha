/*
 * Passes the Home Assistant ingress port through to the app.
 *
 * The app is built with basePath set to the add-on's ingress path, so it emits
 * prefixed URLs, and the Supervisor strips that prefix before forwarding. The
 * request therefore arrives ready to serve and only needs handing to the app's
 * internal port.
 */

const http = require('http');

const PORT = Number(process.env.INGRESS_PORT) || 8099;
const APP_PORT = Number(process.env.APP_INTERNAL_PORT) || 3001;

const server = http.createServer((req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: APP_PORT, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(`Sprout Track is still starting. Reload in a moment.\n(${err.code || err.message})`);
  });
  req.pipe(upstream);
});

server.on('upgrade', (req, socket) => {
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
});

server.on('error', (err) => console.error(`[ingress] cannot bind ${PORT}: ${err.message}`));
server.listen(PORT, '0.0.0.0', () => console.log(`[ingress] ${PORT} -> 127.0.0.1:${APP_PORT}`));
