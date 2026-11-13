// API 測試工具：靜態頁面 + /proxy 轉發。零依賴，Node >= 18。
// 瀏覽器只打同源的 /proxy，由這支 server 代為發出真正請求，因此不受 CORS 限制。
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const PORT = Number(process.env.PORT || 5757);
// 使用者資料（集合、環境變數含機密、歷史、分頁）存在這個資料夾，已加入 .gitignore。
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
// 依敏感度分檔：environments.json 含密碼 / token，要分享集合時可以只給 collections.json。
const STORE = {
  "collections.json": ["colls"],
  "environments.json": ["envs", "env"],
  "history.json": ["hist"],
  "session.json": ["tabs", "active"],
};
const HOST = "127.0.0.1"; // 只綁本機，不對外
const MAX_REQ_BODY = 50 * 1024 * 1024;
const MAX_RES_BODY = 50 * 1024 * 1024;
const DROP = new Set(["host", "content-length", "connection", "transfer-encoding"]);
const TEXT_RE = /(json|text|xml|javascript|html|css|csv|x-www-form-urlencoded|graphql|yaml)/i;

const sameOrigin = (h) => h === `127.0.0.1:${PORT}` || h === `localhost:${PORT}`;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > MAX_REQ_BODY) { reject(new Error("request too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

function guard(req, res) {
  // 防 DNS rebinding / 其他網站偷用：Host 必須是本機、Origin（若有）必須同源、且一定要 JSON
  // （JSON content-type 會讓跨站請求先走 preflight，而我們不回 CORS header，所以會被瀏覽器擋掉）。
  if (!sameOrigin(req.headers.host || "")) { send(res, 403, { error: "bad host" }); return false; }
  if (req.headers.origin && !sameOrigin(req.headers.origin.replace(/^https?:\/\//, ""))) { send(res, 403, { error: "bad origin" }); return false; }
  if (!/^application\/json/i.test(req.headers["content-type"] || "")) { send(res, 415, { error: "content-type must be application/json" }); return false; }
  return true;
}

// RSA 公鑰加密（PKCS#1 v1.5，與前端 jsencrypt 一致）。WebCrypto 不支援此 padding，所以放在這裡做。
// 明文只在本機 loopback 傳遞，不寫檔、不記 log。
async function handleRsa(req, res) {
  if (!guard(req, res)) return;
  let p;
  try { p = JSON.parse((await readBody(req)).toString("utf8")); } catch (e) { return send(res, 400, { error: "invalid JSON" }); }
  try {
    let key = String(p.publicKey || "").trim();
    if (!key) throw new Error("缺少 publicKey");
    if (!key.includes("BEGIN")) key = "-----BEGIN PUBLIC KEY-----\n" + key.replace(/\s+/g, "").replace(/(.{64})/g, "$1\n") + "\n-----END PUBLIC KEY-----";
    const cipher = crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(p.plain ?? ""), "utf8"));
    send(res, 200, { cipher: cipher.toString("base64") });
  } catch (e) { send(res, 400, { error: "RSA 加密失敗：" + e.message }); }
}

// 讀取只擋 Host / Origin（防 DNS rebinding 與其他網站讀取）；寫入走 guard（再加 JSON content-type）。
function guardRead(req, res) {
  if (!sameOrigin(req.headers.host || "")) { send(res, 403, { error: "bad host" }); return false; }
  if (req.headers.origin && !sameOrigin(req.headers.origin.replace(/^https?:\/\//, ""))) { send(res, 403, { error: "bad origin" }); return false; }
  return true;
}
function handleStoreGet(req, res) {
  if (!guardRead(req, res)) return;
  const state = {}; let found = false;
  for (const [file, keys] of Object.entries(STORE)) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
      found = true;
      for (const k of keys) if (k in j) state[k] = j[k];
    } catch (e) {
      if (e.code !== "ENOENT") return send(res, 500, { error: `讀取 ${file} 失敗：${e.message}` }); // 檔案壞掉就明確報錯，不要靜默當成空資料
    }
  }
  send(res, 200, { ...state, empty: !found, dir: DATA_DIR });
}
async function handleStorePut(req, res) {
  if (!guard(req, res)) return;
  let st;
  try { st = JSON.parse((await readBody(req)).toString("utf8")); } catch (e) { return send(res, 400, { error: "invalid JSON" }); }
  if (!st || typeof st !== "object" || Array.isArray(st)) return send(res, 400, { error: "state must be an object" });
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    for (const [file, keys] of Object.entries(STORE)) {
      const part = {}; for (const k of keys) if (k in st) part[k] = st[k];
      const target = path.join(DATA_DIR, file), tmp = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(part, null, 2), { mode: 0o600 }); // 先寫暫存再 rename，避免寫到一半被中斷而損毀
      fs.renameSync(tmp, target);
      fs.chmodSync(target, 0o600);
    }
    send(res, 200, { ok: true });
  } catch (e) { send(res, 500, { error: "寫入失敗：" + e.message }); }
}

async function handleProxy(req, res) {
  if (!guard(req, res)) return;
  let p;
  try { p = JSON.parse((await readBody(req)).toString("utf8")); } catch (e) { return send(res, 400, { error: "invalid JSON: " + e.message }); }

  let url;
  try { url = new URL(p.url); } catch { return send(res, 400, { error: "URL 不合法（要包含 http:// 或 https://）" }); }
  if (!/^https?:$/.test(url.protocol)) return send(res, 400, { error: "只支援 http / https" });

  const headers = {};
  for (const [k, v] of Object.entries(p.headers || {})) if (!DROP.has(k.toLowerCase()) && typeof v === "string") headers[k] = v;
  if (!Object.keys(headers).some((k) => k.toLowerCase() === "user-agent")) headers["User-Agent"] = "api-tester/1.0";

  const method = String(p.method || "GET").toUpperCase();
  const init = { method, headers, redirect: p.followRedirects === false ? "manual" : "follow" };
  if (!["GET", "HEAD"].includes(method) && p.body != null && p.body !== "") {
    init.body = p.bodyEncoding === "base64" ? Buffer.from(p.body, "base64") : String(p.body);
  }

  const timeoutMs = Math.min(Math.max(Number(p.timeoutMs) || 30000, 1000), 300000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  init.signal = ac.signal;

  const t0 = Date.now();
  try {
    const r = await fetch(url, init);
    const ttfb = Date.now() - t0;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_RES_BODY) return send(res, 502, { error: "回應超過 50MB 上限" });
    const ct = r.headers.get("content-type") || "";
    const isText = !ct || TEXT_RE.test(ct);
    const hdrs = [];
    r.headers.forEach((v, k) => { if (k !== "set-cookie") hdrs.push([k, v]); });
    const cookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
    send(res, 200, {
      status: r.status, statusText: r.statusText, url: r.url, headers: hdrs, cookies,
      size: buf.length, timeMs: Date.now() - t0, ttfbMs: ttfb, isText,
      body: isText ? buf.toString("utf8") : buf.toString("base64"), contentType: ct,
    });
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    const cause = e && e.cause && (e.cause.code || e.cause.message);
    send(res, 502, { error: aborted ? `逾時（${timeoutMs} ms）` : `${e.message}${cause ? " — " + cause : ""}`, timeMs: Date.now() - t0 });
  } finally { clearTimeout(timer); }
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const PUBLIC = path.join(__dirname, "public");

http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://x").pathname;
    if (req.method === "GET" && pathname === "/store") return handleStoreGet(req, res);
    if (req.method === "PUT" && pathname === "/store") return await handleStorePut(req, res);
    if (req.method === "POST" && pathname === "/proxy") return await handleProxy(req, res);
    if (req.method === "POST" && pathname === "/crypto/rsa") return await handleRsa(req, res);
    if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
    const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: "forbidden" });
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  } catch (e) { send(res, 500, { error: e.message }); }
}).listen(PORT, HOST, () => console.log(`api-tester  http://${HOST}:${PORT}\n資料資料夾  ${DATA_DIR}`));
