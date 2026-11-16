// 請求檔 .curl <-> 集合 / 歷史（test-data/ 的讀寫格式）
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- 請求檔：test-data/<分組>/<API 名稱>.curl ---------- */
// 一個請求 = 一個純 curl 檔，可以直接 `bash 檔名.curl` 執行。curl 表達不了的資訊放在檔案開頭的註解（全部選填）：
//   # @name 登入              請求名稱（省略時用檔名）
//   # @extract accessToken -> token     回應 JSON 欄位 → 環境變數
//   # @auth collection | bearer         集合共用 token / Bearer
//   # @bodytype json | text | form | none
// 從 Chrome「Copy as cURL」直接存下來的檔案也能讀。{{變數}} 保持原樣；
// 要實際執行請用介面上的「curl」按鈕複製已代入變數的版本。
const qsh = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const slug = (s) => String(s || '').normalize('NFKC').replace(/[{}]/g, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/^[._]+/, '').slice(0, 80).trim();
const meta1 = (k, v) => `# @${k} ${String(v).replace(/[\r\n]+/g, ' ')}`;
const encKv = (x) => encodeURIComponent(x).replace(/%7B%7B/gi, '{{').replace(/%7D%7D/gi, '}}');
const ord = (v) => (Number.isFinite(v) ? v : 1e9);
// 沒有 # @id 的檔案 / 沒有 _collection.json 的資料夾：用路徑算出固定 ID，開關多少次都不變（djb2 雜湊）
const hashId = (prefix, s) => { let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return prefix + h.toString(36); };

function toCurlFile(t, extra = {}) {
  const L = ['# api-tester request', meta1('id', t.id)];
  if (t.name) L.push(meta1('name', t.name));
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) L.push(meta1(k, v));
  L.push(meta1('bodytype', t.bodyType));
  if (t.auth.type === 'coll') L.push(meta1('auth', 'collection'));
  if (t.next) L.push(meta1('next', t.next));
  (t.extract || []).filter((x) => x.k || x.v).forEach((x) => L.push(meta1(x.on === false ? 'extract-off' : 'extract', `${x.k} -> ${x.v}`)));
  t.headers.filter((h) => h.on === false && h.k).forEach((h) => L.push(meta1('header-off', `${h.k}: ${h.v}`)));
  t.params.filter((p) => p.on === false && p.k).forEach((p) => L.push(meta1('param-off', `${p.k}=${p.v}`)));
  const hs = t.headers.filter((h) => h.on !== false && h.k).map((h) => [h.k, h.v]);
  const has = (n) => hs.some(([k]) => k.toLowerCase() === n);
  if (t.auth.type === 'bearer' && t.auth.token && !has('authorization')) { hs.push(['Authorization', 'Bearer ' + t.auth.token]); L.splice(L.findIndex((x) => x.startsWith('# @bodytype')) + 1, 0, meta1('auth', 'bearer')); }
  let body = '';
  if (t.bodyType === 'json' || t.bodyType === 'text') { body = t.body; if (!has('content-type')) hs.push(['Content-Type', t.bodyType === 'json' ? 'application/json' : 'text/plain']); }
  else if (t.bodyType === 'form') { body = t.form.filter((f) => f.on !== false && f.k).map((f) => encKv(f.k) + '=' + encKv(f.v)).join('&'); if (!has('content-type')) hs.push(['Content-Type', 'application/x-www-form-urlencoded']); }
  const cmd = [`curl -X ${t.method} ${qsh(t.url.trim())}`];
  hs.forEach(([k, v]) => cmd.push(`-H ${qsh(k + ': ' + v)}`));
  if (t.auth.type === 'basic' && !has('authorization')) cmd.push(`-u ${qsh(t.auth.user + ':' + t.auth.pass)}`);
  if (body) cmd.push(`--data-raw ${qsh(body)}`);
  return L.join('\n') + '\n' + cmd.join(' \\\n  ') + '\n';
}

function fromCurlFile(text, stem = '', fallbackId = '') {
  const meta = {}, rest = []; let head = true;
  for (const l of text.replace(/\r\n/g, '\n').split('\n')) {
    if (head && (/^\s*#/.test(l) || !l.trim())) { const m = l.match(/^\s*#\s*@([\w-]+)[ \t]?(.*)$/); if (m) (meta[m[1]] ||= []).push(m[2]); continue; }
    head = false; rest.push(l);
  }
  const r = parseCurl(rest.join('\n'), { raw: true });
  const m1 = (k) => (meta[k] || [])[0];
  r.id = m1('id') || fallbackId || uid(); r.name = m1('name') || stem; r.next = m1('next') || '';
  const bt = m1('bodytype');
  if (bt === 'none') { r.bodyType = 'none'; r.body = ''; }
  else if (bt === 'json' || bt === 'text') {
    r.bodyType = bt; if (r.body === undefined) r.body = '';
    if (bt === 'text') r.headers = r.headers.filter((h) => !(h.k.toLowerCase() === 'content-type' && h.v === 'text/plain'));
  } else if (bt === 'form' && r.bodyType !== 'form') { r.bodyType = 'form'; r.form = parseForm(r.body || ''); }
  if (r.bodyType === 'form') r.body = ''; // form 的內容在 r.form，body 欄位不使用
  if (m1('auth') === 'collection') r.auth = { type: 'coll', token: '', user: '', pass: '' };
  if (m1('auth') === 'bearer') { // 還原成 Bearer 認證，而不是一個普通的 Authorization header
    const i = r.headers.findIndex((h) => h.k.toLowerCase() === 'authorization' && /^Bearer /.test(h.v));
    if (i >= 0) { r.auth = { type: 'bearer', token: r.headers[i].v.slice(7), user: '', pass: '' }; r.headers.splice(i, 1); }
  }
  for (const [key, on] of [['extract', true], ['extract-off', false]]) for (const s of meta[key] || []) { const i = s.indexOf(' -> '); if (i > 0) r.extract.push({ on, k: s.slice(0, i).trim(), v: s.slice(i + 4).trim() }); }
  for (const s of meta['header-off'] || []) { const i = s.indexOf(':'); if (i > 0) r.headers.push({ on: false, k: s.slice(0, i).trim(), v: s.slice(i + 1).trim() }); }
  for (const s of meta['param-off'] || []) { const i = s.indexOf('='); r.params.push({ on: false, k: i < 0 ? s : s.slice(0, i), v: i < 0 ? '' : s.slice(i + 1) }); }
  return { req: r, order: Number(m1('order')), at: Number(m1('at')), status: m1('status') ? Number(m1('status')) : undefined, hid: m1('hid') };
}

function uniqName(base, used, ext = '') {
  let n = base, i = 2;
  while (used.has((n + ext).toLowerCase())) n = `${base} (${i++})`;
  used.add((n + ext).toLowerCase()); return n + ext;
}
// 檔名：有名稱就用名稱；沒有名稱就取 URL 路徑最後一段（/api/AppService/GetRSAPublicKey → GetRSAPublicKey）
const reqFileBase = (t) => {
  if (slug(t.name)) return slug(t.name);
  const seg = slug(String(t.url).replace(/^[a-z]+:\/\/[^/]*/i, '').split('?')[0].split('/').filter(Boolean).pop() || '');
  return seg || slug(`${t.method} ${String(t.url).replace(/^https?:\/\//, '')}`).slice(0, 60) || 'request';
};

// 由目前狀態產生所有「應該存在」的檔案（路徑 -> 內容）。沿用磁碟上原本的檔名，只有改名/新增才取新檔名。
function buildFiles() {
  const files = {}, usedDirs = new Set();
  S.colls.forEach((c) => { const d = DIR_OF.get(c.id); if (d && d.forName === c.name) usedDirs.add(d.dir.toLowerCase()); });
  S.colls.forEach((c, ci) => {
    let d = DIR_OF.get(c.id);
    if (!d || d.forName !== c.name) { d = { dir: uniqName(slug(c.name) || '未分組', usedDirs), forName: c.name }; DIR_OF.set(c.id, d); }
    const base = d.dir;
    const used = new Set(['_collection.json']);
    Object.keys(unparsed).filter((p) => p.startsWith(base + '/')).forEach((p) => used.add(p.slice(base.length + 1).toLowerCase()));
    c.items.forEach((it) => { const f = FILE_OF.get(it.id); if (f && f.forName === it.name) used.add(f.file.toLowerCase()); });
    const order = []; // 側欄的順序（拖曳 / 依名稱排序）存在 _collection.json，不寫進 curl 檔
    c.items.forEach((it) => {
      let f = FILE_OF.get(it.id);
      if (!f || f.forName !== it.name) { f = { file: uniqName(reqFileBase(it), used, '.curl'), forName: it.name }; FILE_OF.set(it.id, f); }
      files[`${base}/${f.file}`] = toCurlFile(it);
      order.push(f.file);
    });
    if (!(`${base}/_collection.json` in unparsed)) files[`${base}/_collection.json`] = JSON.stringify({ id: c.id, name: c.name, order: ci, items: order, sort: c.sort || undefined, manual: c.sort ? c.manual : undefined, collapsed: c.collapsed || undefined, env: c.env || undefined, cfg: c.cfg || undefined }, null, 2) + '\n';
  });
  for (const h of S.hist) {
    const ts = new Date(h.at || 0).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    const pth = slug(String(h.req.url).replace(/^[a-z]+:\/\/[^/]*/i, '').split('?')[0]).slice(0, 50);
    files[`_history/${ts}_${h.req.method}_${pth}_${h.id}.curl`] = toCurlFile(h.req, { hid: h.id, at: h.at, status: h.status });
  }
  return files;
}

// 把磁碟上讀到的檔案還原成集合 / 歷史。
// 空檔案（0 位元組，例如先建好檔名再貼內容）與解析不了的檔案都放進 unparsed：原樣保留，不覆蓋、不刪除。
function fromFiles(files) {
  unparsed = {}; FILE_OF.clear(); DIR_OF.clear();
  const seen = new Set(), dirs = {}, hist = [];
  const uniqueId = (id) => { if (!id || seen.has(id)) id = uid(); seen.add(id); return id; };
  for (const [p, text] of Object.entries(files)) {
    let m;
    if ((m = p.match(/^_history\/([^/]+)$/))) {
      if (!text.trim()) { unparsed[p] = text; continue; }
      try { const x = fromCurlFile(text); hist.push({ id: x.hid || uid(), at: x.at || 0, status: x.status, req: strip(x.req) }); }
      catch { unparsed[p] = text; }
    } else if ((m = p.match(/^([^/]+)\/([^/]+)$/))) {
      const c = (dirs[m[1]] ||= { dir: m[1], meta: {}, items: [] });
      if (!text.trim()) { unparsed[p] = text; continue; }
      try {
        if (m[2] === '_collection.json') c.meta = JSON.parse(text) || {};
        else { const x = fromCurlFile(text, m[2].replace(/\.curl$/i, ''), hashId('r', p)); x.req.id = uniqueId(x.req.id); c.items.push({ ...x, f: m[2] }); }
      } catch { unparsed[p] = text; }
    }
  }
  const colls = Object.values(dirs).map((c) => {
    const id = uniqueId(c.meta.id || hashId('c', c.dir)), name = c.meta.name || c.dir;
    DIR_OF.set(id, { dir: c.dir, forName: name });
    const pos = (f) => { const i = Array.isArray(c.meta.items) ? c.meta.items.indexOf(f) : -1; return i < 0 ? 1e9 : i; };
    const items = c.items.sort((a, b) => pos(a.f) - pos(b.f) || ord(a.order) - ord(b.order) || a.f.localeCompare(b.f)).map((x) => {
      x.req.collId = id; FILE_OF.set(x.req.id, { file: x.f, forName: x.req.name }); return strip(x.req);
    });
    return { id, name, cfg: c.meta.cfg, order: c.meta.order, sort: c.meta.sort === 'asc' || c.meta.sort === 'desc' ? c.meta.sort : undefined, manual: Array.isArray(c.meta.manual) ? c.meta.manual : undefined, collapsed: c.meta.collapsed === true || undefined, env: c.meta.env || undefined, items };
  }).sort((a, b) => ord(a.order) - ord(b.order) || a.name.localeCompare(b.name));
  return { colls, hist: hist.sort((a, b) => b.at - a.at) };
}


