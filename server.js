const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const UPSTREAM = 'https://html-classic.itch.zone/html/18400005';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  
  const localPath = path.join(__dirname, reqPath);

  // If file exists locally, serve it
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    const ext = path.extname(localPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(localPath).pipe(res);
  }

  // Otherwise, proxy from itch.zone and cache locally!
  const upstreamUrl = `${UPSTREAM}${reqPath}`;
  try {
    const upstreamRes = await fetch(upstreamUrl);
    if (!upstreamRes.ok) {
      console.warn(`[404] ${reqPath} (Upstream status: ${upstreamRes.status})`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const buffer = Buffer.from(await upstreamRes.arrayBuffer());
    
    // Cache locally
    try {
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(localPath, buffer);
      console.log(`[CACHED] ${reqPath} (${buffer.length} bytes)`);
    } catch (saveErr) {
      console.warn(`Failed to cache ${reqPath}:`, saveErr.message);
    }

    const ext = path.extname(localPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || upstreamRes.headers.get('content-type') || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(buffer);
  } catch (err) {
    console.error(`[PROXY-ERR] ${reqPath}:`, err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy Error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`Yumurta Fabrikası Server running at http://localhost:${PORT}`);
});
