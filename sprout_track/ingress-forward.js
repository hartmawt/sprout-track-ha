/*
 * Passes the Home Assistant ingress port through to the app.
 *
 * The app is built with basePath set to the add-on's ingress path, so routing,
 * links and assets already carry the prefix and the Supervisor strips it back
 * off before the request arrives here. Requests therefore need no rewriting.
 *
 * basePath does not cover data fetches written as absolute paths, though: a
 * literal fetch('/api/...') resolves against the dashboard origin and reaches
 * Home Assistant instead of the app, which answers 404. A small script is
 * injected into HTML responses to prefix those calls at runtime. It only wraps
 * fetch and XMLHttpRequest, leaving navigation to basePath, which Next.js
 * understands natively.
 */

const http = require('http');

const PORT = Number(process.env.INGRESS_PORT) || 8099;
const APP_PORT = Number(process.env.APP_INTERNAL_PORT) || 3001;
const BASE_PATH = (process.env.INGRESS_BASE_PATH || '').replace(/\/$/, '');

const SHIM = `<script>(function(){
var b=${JSON.stringify(BASE_PATH)};
if(!b)return;
function fix(u){
  if(typeof u!=='string')return u;
  if(u.charAt(0)!=='/')return u;
  if(u.charAt(1)==='/')return u;
  if(u.indexOf(b+'/')===0)return u;
  return b+u;
}
var of=window.fetch;
if(of){window.fetch=function(i,o){
  try{
    if(typeof i==='string')return of.call(this,fix(i),o);
    if(i&&typeof i.url==='string'&&typeof Request!=='undefined'){
      var f=fix(i.url);
      if(f!==i.url)return of.call(this,new Request(f,i),o);
    }
  }catch(e){}
  return of.call(this,i,o);
};}
var ox=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(){
  var a=[].slice.call(arguments);
  if(a.length>1)a[1]=fix(a[1]);
  return ox.apply(this,a);
};
// Scripts, stylesheets and images are fetched by the browser from element
// properties rather than through fetch, so the URL is corrected as it is set.
[[HTMLScriptElement,'src'],[HTMLLinkElement,'href'],[HTMLImageElement,'src']].forEach(function(p){
  var proto=p[0]&&p[0].prototype, name=p[1];
  if(!proto)return;
  var d=Object.getOwnPropertyDescriptor(proto,name);
  if(!d||!d.set)return;
  Object.defineProperty(proto,name,{
    configurable:true,enumerable:d.enumerable,
    get:function(){return d.get.call(this)},
    set:function(v){return d.set.call(this,fix(v))}
  });
});
var sa=Element.prototype.setAttribute;
Element.prototype.setAttribute=function(n,v){
  if((n==='src'||n==='href')&&typeof v==='string')v=fix(v);
  return sa.call(this,n,v);
};
})();</script>`;

// location.href navigates on assignment and its setter is non-configurable,
// so the runtime shim cannot see it. Matches only slash-prefixed string
// literals, so variables and external URLs stay untouched.
const NAVIGATION = /(\.location\s*\.\s*(?:href|assign|replace)\s*[=(]\s*)(["'`])\/(?!\/)/g;

// The app derives the family slug from the first path segment, which under
// ingress is "api" rather than the family. Both forms are redirected to a
// helper that skips the prefix, so the slug and every path built from it match
// what the app sees without ingress.
// The app reads location.pathname in several places to derive its family slug,
// and the minifier hoists it into a variable before splitting, so the reads
// cannot be matched as a pattern. Redefining the property is what reaches them
// all: it reports the path with the ingress prefix removed, which is what the
// app would see served at the root.
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

function rewriteNavigation(body) {
  return body.replace(NAVIGATION, (_, prefix, quote) => `${prefix}${quote}${BASE_PATH}/`);
}

// The Supervisor strips the ingress prefix, but the app is built and started
// with it as its basePath, so it only routes prefixed paths. Restoring the
// prefix here keeps the path the app receives identical to the one the browser
// shows, which is what lets usePathname and the route params agree.
function upstreamPath(url) {
  if (!BASE_PATH) return url;
  return url.startsWith(BASE_PATH) ? url : BASE_PATH + url;
}

function proxy(req, res) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: APP_PORT,
      method: req.method,
      path: upstreamPath(req.url || '/'),
      headers: { ...req.headers, 'accept-encoding': 'identity' },
    },
    (up) => {
      const headers = { ...up.headers };
      const type = String(headers['content-type'] || '');
      const isHtml = type.includes('text/html');
      const isScript = type.includes('javascript');

      if (!BASE_PATH || (!isHtml && !isScript)) {
        res.writeHead(up.statusCode || 502, headers);
        up.pipe(res);
        return;
      }

      const chunks = [];
      up.on('data', (c) => chunks.push(c));
      up.on('end', () => {
        let body = rewriteNavigation(Buffer.concat(chunks).toString('utf8'));
        if (isHtml) body = body.replace(/<head([^>]*)>/i, (m) => m + PATHNAME_HELPER + SHIM);
        delete headers['content-length'];

        // Next.js marks its chunks immutable for a year, so a browser holding a
        // copy from before these rewrites would never ask for them again.
        delete headers.etag;
        headers['cache-control'] = 'no-store';

        res.writeHead(up.statusCode || 200, headers);
        res.end(body);
      });
    }
  );

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(`Sprout Track is still starting. Reload in a moment.\n(${err.code || err.message})`);
  });

  req.pipe(upstream);
}

const server = http.createServer(proxy);

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
server.listen(PORT, '0.0.0.0', () =>
  console.log(`[ingress] ${PORT} -> 127.0.0.1:${APP_PORT}, prefixing fetch with ${BASE_PATH || '(none)'}`)
);
