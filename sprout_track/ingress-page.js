/*
 * Serves the Home Assistant ingress port.
 *
 * The app is framed at its own origin rather than proxied through ingress.
 * Proxying would require rewriting the app's absolute URLs, but Next.js reads
 * location.pathname in its client router and that cannot be overridden from
 * outside, so back/forward navigation and the app's direct location writes
 * would break. Framing the app at its own origin leaves every absolute path
 * correct, because the frame's root is the app's root.
 *
 * The frame source is built in the browser from window.location, since the
 * add-on is reached through two proxies and the Host it sees is internal. The
 * app's origin is only reachable when the browser is on the same network, so
 * the page falls back to an explanatory link rather than an empty frame.
 */

const http = require('http');

const PORT = Number(process.env.INGRESS_PORT) || 8099;
const APP_PORT = Number(process.env.APP_PUBLIC_PORT) || 3000;

function page(appPort) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sprout Track</title>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,-apple-system,sans-serif;color:#334155}
  iframe{display:block;width:100%;height:100%;border:0}
  #fallback{display:none;height:100%;align-items:center;justify-content:center;text-align:center;
            background:#f8fafc;padding:1.5rem;box-sizing:border-box}
  .card{max-width:34rem}
  h1{font-size:1.15rem;margin:0 0 .75rem}
  p{margin:.5rem 0;line-height:1.55;font-size:.925rem;color:#475569}
  a.btn{display:inline-block;margin-top:1rem;padding:.6rem 1.2rem;background:#0284c7;color:#fff;
        border-radius:.5rem;text-decoration:none;font-weight:600}
  code{background:#e2e8f0;padding:.15rem .4rem;border-radius:.25rem}
</style>
</head>
<body>
<iframe id="app" title="Sprout Track" referrerpolicy="no-referrer"></iframe>
<div id="fallback">
  <div class="card">
    <h1>Sprout Track cannot be shown here</h1>
    <p>Sprout Track runs on its own port and your browser cannot reach it from
       where you are now. This usually means you are connected from outside your
       home network.</p>
    <p>On your home network it opens here automatically. From outside, reach it
       through a VPN or your own reverse proxy.</p>
    <p><a class="btn" id="direct" href="#" target="_top" rel="noopener">Try opening it directly</a></p>
    <p><code id="url"></code></p>
  </div>
</div>
<script>
(function () {
  var target = 'https://' + window.location.hostname + ':${appPort}/';
  var frame = document.getElementById('app');
  var fallback = document.getElementById('fallback');
  var loaded = false;

  document.getElementById('direct').href = target;
  document.getElementById('url').textContent = target;

  function giveUp() {
    if (loaded) return;
    frame.style.display = 'none';
    fallback.style.display = 'flex';
  }

  frame.addEventListener('load', function () {
    loaded = true;
  });

  // A cross-origin frame reports no error when it fails, so reachability is
  // probed separately and the frame is only trusted if it reports a load.
  var timer = setTimeout(giveUp, 8000);
  frame.addEventListener('load', function () { clearTimeout(timer); });

  frame.src = target;
})();
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  console.log(`[ingress] ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(page(APP_PORT));
});

server.on('error', (err) => console.error(`[ingress] cannot bind ${PORT}: ${err.message}`));
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ingress] page on ${PORT}, framing app port ${APP_PORT}`);
});
