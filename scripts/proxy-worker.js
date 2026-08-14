// Cloudflare Worker: proxies tile requests to Global Forest Watch so the
// deployed site can canvas-filter them without hitting CORS (GFW doesn't
// send Access-Control-Allow-Origin for arbitrary origins).
//
// Setup (free, ~5 minutes):
//   1. workers.cloudflare.com -> sign in / sign up -> "Create Worker"
//   2. Paste this whole file into the editor, replacing the default code
//   3. Deploy -> copy the worker's URL (looks like
//      https://<name>.<your-subdomain>.workers.dev)
//   4. In app.js, set PROXY_BASE to that URL + "/proxy/"
//      e.g. const PROXY_BASE = "https://ffi-map-proxy.yourname.workers.dev/proxy/";

const ALLOWED_HOSTS = new Set(["tiles.globalforestwatch.org"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/proxy/")) {
      return new Response("Not found", { status: 404 });
    }

    const target = decodeURIComponent(url.pathname.slice("/proxy/".length)) + url.search;
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (e) {
      return new Response("Bad target URL", { status: 400 });
    }

    if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return new Response("Host not allowed", { status: 403 });
    }

    const resp = await fetch(targetUrl.toString(), {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const headers = new Headers(resp.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=3600");

    return new Response(resp.body, { status: resp.status, headers });
  }
};
