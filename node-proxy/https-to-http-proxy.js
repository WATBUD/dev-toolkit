// https-to-http-proxy.js
// 目標：把 https://rd-oam.optoma.com 自動跳轉到 http://localhost:3002

const https = require('https');
const fs = require('fs');

const HTTPS_PORT = 443;           // 本機 HTTPS 端口
const LOCAL_HTTP_TARGET = 3002;   // 目標本地服務端口

// mkcert 生成的憑證路徑
const CERT_PATH = 'C:/mkcert/rd-oam.optoma.com.pem';
const KEY_PATH = 'C:/mkcert/rd-oam.optoma.com-key.pem';

// 讀取憑證
const options = {
  key: fs.readFileSync(KEY_PATH),
  cert: fs.readFileSync(CERT_PATH),
};

// 建立 HTTPS server
https.createServer(options, (req, res) => {
  const targetUrl = `http://localhost:${LOCAL_HTTP_TARGET}${req.url}`;
  console.log(`[${new Date().toLocaleTimeString()}] Redirect: ${req.url} → ${targetUrl}`);
  
  // 302 跳轉到本地 HTTP
  res.writeHead(302, { Location: targetUrl });
  res.end();
}).listen(HTTPS_PORT, () => {
  console.log(`HTTPS redirect proxy running on https://rd-oam.optoma.com`);
  console.log(`Redirecting all requests to http://localhost:${LOCAL_HTTP_TARGET}`);
});
