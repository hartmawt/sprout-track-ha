/*
 * Serves the Home Assistant ingress port.
 *
 * Sprout Track itself cannot run under ingress: Next.js resolves basePath at
 * build time, but ingress assigns a random prefix per session. Home Assistant
 * only offers the "Show in sidebar" toggle to add-ons with ingress enabled, so
 * this endpoint exists purely to provide that entry and hand the browser off to
 * the app on its own port.
 *
 * The handoff is a top-level navigation rather than a redirect or an embed:
 * ingress renders add-ons in an iframe, and an iframe may not load http:// from
 * an https:// page (mixed content), whereas a top-level navigation to http:// is
 * permitted. The target host comes from the request so no address is hardcoded.
 */

const http = require('http');

const PORT = Number(process.env.INGRESS_PORT) || 8099;
const APP_PORT = Number(process.env.PORT) || 3000;

function targetUrl(req) {
  const forwarded = req.headers['x-forwarded-host'];
  const host = String(forwarded || req.headers.host || '').split(',')[0].trim();
  const hostname = host.replace(/:\d+$/, '');
  if (!hostname) return null;
  return `http://${hostname}:${APP_PORT}/`;
}

http
  .createServer((req, res) => {
    const target = targetUrl(req);

    if (!target) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Could not determine the Home Assistant host. Open Sprout Track on port ${APP_PORT}.`);
      return;
    }

    const href = JSON.stringify(target);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
        `<title>Sprout Track</title>` +
        `<style>body{font-family:system-ui,sans-serif;margin:0;display:flex;align-items:center;` +
        `justify-content:center;height:100vh;text-align:center;color:#374151}a{color:#0284c7}</style>` +
        `</head><body><div><p>Opening Sprout Track&hellip;</p>` +
        `<p><a href=${href} target="_top" rel="noopener">Continue to Sprout Track</a></p></div>` +
        `<script>try{window.top.location.replace(${href})}catch(e){window.location.replace(${href})}</script>` +
        `</body></html>`
    );
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`Sprout Track: ingress redirect listening on ${PORT} -> app port ${APP_PORT}`);
  });
