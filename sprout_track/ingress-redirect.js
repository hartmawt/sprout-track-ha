/*
 * Serves the Home Assistant ingress port.
 *
 * Sprout Track cannot run under ingress: Next.js resolves basePath at build
 * time, but ingress assigns a random prefix per session. Home Assistant only
 * offers the "Show in sidebar" toggle to add-ons with ingress enabled, so this
 * endpoint exists to provide that entry and hand the browser off to the app.
 *
 * The destination is computed in the browser from window.location rather than
 * from request headers: the add-on is reached through two proxy hops, so the
 * Host it sees is an internal address, not what the user typed. The ingress
 * iframe is same-origin with the dashboard, so its location is the real one.
 *
 * The handoff navigates the top-level window because a browser will not load an
 * http:// page inside an iframe on an https:// dashboard. If that navigation is
 * blocked the link stays on screen, so this degrades to a visible page instead
 * of a blank frame.
 */

const http = require('http');

const PORT = Number(process.env.INGRESS_PORT) || 8099;
const APP_PORT = Number(process.env.PORT) || 3000;

function page(appPort) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sprout Track</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;min-height:100vh;display:flex;
       align-items:center;justify-content:center;background:#f8fafc;color:#334155}
  .card{text-align:center;padding:2rem;max-width:32rem}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{margin:.5rem 0;line-height:1.5}
  a.btn{display:inline-block;margin-top:1rem;padding:.6rem 1.2rem;background:#0284c7;color:#fff;
        border-radius:.5rem;text-decoration:none;font-weight:600}
  code{background:#e2e8f0;padding:.15rem .4rem;border-radius:.25rem;font-size:.9em}
  .muted{color:#64748b;font-size:.875rem}
</style>
</head>
<body>
<div class="card">
  <h1>Opening Sprout Track&hellip;</h1>
  <p class="muted">Sprout Track runs on its own port and cannot be shown inside Home Assistant.</p>
  <p><a class="btn" id="go" href="#" target="_top" rel="noopener">Open Sprout Track</a></p>
  <p class="muted">If it does not open, go to <code id="url"></code> directly.</p>
</div>
<script>
(function () {
  var target = 'http://' + window.location.hostname + ':${appPort}/';
  document.getElementById('go').href = target;
  document.getElementById('url').textContent = target;
  try {
    window.top.location.replace(target);
  } catch (e) {
    window.location.replace(target);
  }
})();
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  console.log(`[ingress] ${req.method} ${req.url}`);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(page(APP_PORT));
});

server.on('error', (err) => {
  console.error(`[ingress] FAILED to bind port ${PORT}: ${err.message}`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ingress] listening on ${PORT}, handing off to app port ${APP_PORT}`);
});
