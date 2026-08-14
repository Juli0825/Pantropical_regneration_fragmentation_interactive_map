"""Static file server with HTTP Range support, needed for efficient
Cloud-Optimized GeoTIFF loading in the browser (georaster/geotiff.js
issue ranged requests to fetch only the overview/tile they need).

Also proxies /proxy/<url> to remote tile servers (e.g. Global Forest Watch)
so the browser can canvas-filter those tiles without hitting CORS -
GFW's tile server doesn't send Access-Control-Allow-Origin for arbitrary
origins like localhost."""
import http.server
import os
import re
import socketserver
import urllib.request
import urllib.parse

PORT = 8765
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")
PROXY_ALLOWED_HOSTS = {"tiles.globalforestwatch.org"}


class RangeRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path.startswith("/proxy/"):
            return self.proxy_request()
        return super().do_GET()

    def proxy_request(self):
        target = urllib.parse.unquote(self.path[len("/proxy/"):])
        host = urllib.parse.urlparse(target).hostname
        if host not in PROXY_ALLOWED_HOSTS:
            self.send_error(403, "Host not allowed")
            return
        try:
            req = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
                self.send_response(200)
                self.send_header("Content-type", resp.headers.get("Content-type", "image/png"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_error(502, f"Proxy fetch failed: {e}")

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return None

        range_header = self.headers.get("Range")
        file_size = os.path.getsize(path)

        if range_header is None:
            self.send_response(200)
            self.send_header("Content-type", self.guess_type(path))
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            f = open(path, "rb")
            return f

        m = RANGE_RE.match(range_header)
        if not m:
            self.send_error(416, "Invalid range")
            return None
        start_s, end_s = m.groups()
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1

        self.send_response(206)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

        f = open(path, "rb")
        f.seek(start)
        return _LimitedReader(f, length)

    def copyfile(self, source, outputfile):
        if isinstance(source, _LimitedReader):
            source.copy_to(outputfile)
        else:
            super().copyfile(source, outputfile)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class _LimitedReader:
    def __init__(self, f, length):
        self.f = f
        self.remaining = length

    def copy_to(self, outputfile):
        chunk_size = 64 * 1024
        while self.remaining > 0:
            chunk = self.f.read(min(chunk_size, self.remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            self.remaining -= len(chunk)
        self.f.close()


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), RangeRequestHandler)
    print(f"Serving {ROOT} at http://127.0.0.1:{PORT}")
    server.serve_forever()
