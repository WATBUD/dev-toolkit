// curl 解析、匯入 curl、複製成 curl
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- curl 匯入 / 匯出 ---------- */
function shellSplit(s) {
  s = s.replace(/\\\r?\n/g, ' '); const out = []; let cur = '', has = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'") { const j = s.indexOf("'", i + 1); cur += s.slice(i + 1, j < 0 ? s.length : j); has = true; i = j < 0 ? s.length : j + 1; }
    else if (c === '$' && s[i + 1] === "'") { i += 2; has = true; while (i < s.length && s[i] !== "'") { if (s[i] === '\\') { i++; cur += ({ n: '\n', t: '\t', r: '\r' }[s[i]] ?? s[i]); i++; } else cur += s[i++]; } i++; }
    else if (c === '"') { i++; has = true; while (i < s.length && s[i] !== '"') { if (s[i] === '\\' && i + 1 < s.length) i++; cur += s[i++]; } i++; }
    else if (c === '\\' && i + 1 < s.length) { cur += s[i + 1]; has = true; i += 2; } // 引號外的 \x 代表字面 x（如 '\'' 內的 \'）
    else if (/\s/.test(c)) { if (has) { out.push(cur); cur = ''; has = false; } i++; }
    else { cur += c; has = true; i++; }
  }
  if (has) out.push(cur); return out;
}
const parseForm = (body) => body.split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); const d = (x) => { try { return decodeURIComponent(x.replace(/\+/g, ' ')); } catch { return x; } }; return { on: true, k: d(i < 0 ? p : p.slice(0, i)), v: i < 0 ? '' : d(p.slice(i + 1)) }; });
// opts.raw：不重新排版 JSON body（curl 檔讀回時要與磁碟內容一致，避免每次載入都產生差異）
function parseCurl(text, opts = {}) {
  const t = shellSplit(text.trim()); if (t[0] !== 'curl') throw new Error('開頭必須是 curl');
  const r = { ...blank(), headers: [] }; let data = [], form = false; const pos = [];
  for (let i = 1; i < t.length; i++) {
    const a = t[i];
    if (a === '-H' || a === '--header') { const h = t[++i] || ''; const k = h.indexOf(':'); if (k > 0) r.headers.push({ on: true, k: h.slice(0, k).trim(), v: h.slice(k + 1).trim() }); }
    else if (a === '-X' || a === '--request') r.method = (t[++i] || 'GET').toUpperCase();
    else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--data-urlencode'].includes(a)) data.push(t[++i]);
    else if (a === '-u' || a === '--user') { const [u, ...p] = (t[++i] || '').split(':'); r.auth = { type: 'basic', token: '', user: u, pass: p.join(':') }; }
    else if (a === '-b' || a === '--cookie') r.headers.push({ on: true, k: 'Cookie', v: t[++i] || '' });
    else if (a === '-A' || a === '--user-agent') r.headers.push({ on: true, k: 'User-Agent', v: t[++i] || '' });
    else if (a === '-e' || a === '--referer') r.headers.push({ on: true, k: 'Referer', v: t[++i] || '' });
    else if (a === '-F' || a === '--form') throw new Error('目前不支援 multipart (-F)');
    else if (/^https?:\/\//i.test(a)) r.url = a;
    else if (a === '--url') r.url = t[++i];
    else if (!a.startsWith('-')) pos.push(a);
  }
  // 沒有 http(s):// 開頭的 URL 時（例如 {{baseUrl}}/api/x 這種變數模板），退而求其次用第一個含 {{ 或 / 的位置參數
  if (!r.url) r.url = pos.find((p) => /\{\{|^\//.test(p)) || '';
  if (!r.url) throw new Error('找不到 URL');
  if (data.length) {
    const body = data.join('&'); r.bodyType = 'text'; r.body = body;
    const ct = (r.headers.find((h) => h.k.toLowerCase() === 'content-type') || {}).v || '';
    if (/json/i.test(ct) || /^\s*[\[{]/.test(body)) { r.bodyType = 'json'; if (!opts.raw) { try { r.body = JSON.stringify(JSON.parse(body), null, 2); } catch {} } }
    else if (/x-www-form-urlencoded/i.test(ct)) { r.bodyType = 'form'; r.form = parseForm(body); }
    if (!t.some((x) => x === '-X' || x === '--request')) r.method = 'POST';
    r.headers = r.headers.filter((h) => h.k.toLowerCase() !== 'content-type' || r.bodyType === 'text');
  }
  syncParamsFromUrl(r); r.name = ''; return r;
}

$('#btn-import').onclick = () => dlg(`<h3 style="margin-top:0">匯入 curl</h3><textarea id="d-curl" rows="9" placeholder="貼上整段 curl（支援 Chrome「Copy as cURL」）" style="width:100%"></textarea><div class="row" style="margin-top:10px;justify-content:flex-end"><button value="cancel">取消</button><button class="pri" value="ok">匯入成新分頁</button></div>`, (v) => { if (v !== 'ok') return; try { const r = parseCurl($('#d-curl').value); S.tabs.push(r); S.active = r.id; persist(); all(); } catch (e) { alert(e.message); } });
const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
$('#copycurl').onclick = (e) => { if (!cur()) return; const r = build(cur()); let c = `curl -X ${r.method} ${q(r.url)}`; for (const [k, v] of Object.entries(r.headers)) c += ` \\\n  -H ${q(k + ': ' + v)}`; if (r.body) c += ` \\\n  --data-raw ${q(r.body)}`; navigator.clipboard.writeText(c).then(() => { e.target.textContent = '已複製 ✓'; setTimeout(() => (e.target.textContent = 'curl'), 1200); }); };
