const https = require('https');
const http = require('http');
const fs = require('fs');

const LOCAL_HTTP_TARGET = 3002; // 本地服務 port
const HTTPS_PORT = 443; // 本地 https port
const EXTERNAL_HOST = '3.169.36.74'; // 客戶伺服器
const EXTERNAL_PORT = 80; // 客戶伺服器 port

const options = {
  key: fs.readFileSync('C:/mkcert/rd-oam.optoma.com-key.pem'),
  cert: fs.readFileSync('C:/mkcert/rd-oam.optoma.com.pem'),
};

https.createServer(options, (req, res) => {
  const isExternal = req.url.includes('exchangeToken');

  const targetHost = isExternal ? EXTERNAL_HOST : 'localhost';
  const targetPort = isExternal ? EXTERNAL_PORT : LOCAL_HTTP_TARGET;

  const targetHeaders = { ...req.headers };
  // 如果要打客戶端，Host 必須是 rd-oam.optoma.com
  if (isExternal) targetHeaders['host'] = 'rd-oam.optoma.com';

  console.log(`[${new Date().toLocaleTimeString()}] ${isExternal ? 'External' : 'Local'} proxy: ${req.url} → http://${targetHost}:${targetPort}`);

  const proxyReq = http.request({
    hostname: targetHost,
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: targetHeaders,
  }, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', err => {
    console.error('Proxy error:', err);
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxyReq, { end: true });

}).listen(HTTPS_PORT, () => {
  console.log(`Conditional HTTPS proxy running on https://rd-oam.optoma.com`);
  console.log(`- All requests → local (${LOCAL_HTTP_TARGET})`);
  console.log(`- Only exchangeToken requests → external (${EXTERNAL_HOST})`);
});
