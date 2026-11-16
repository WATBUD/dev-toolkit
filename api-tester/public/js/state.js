// 小工具、狀態（S）、存檔（persist / flush）、變數代入
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const blank = () => ({ id: uid(), name: '', method: 'GET', url: '', params: [], headers: [], bodyType: 'none', body: '', form: [], auth: { type: 'none', token: '', user: '', pass: '' }, extract: [], next: '', collId: '', dirty: false, res: null });
const S = {
  tabs: [], active: null, colls: [], hist: [], envs: [], env: '',
  side: 'coll', reqTab: 'params', resTab: 'body', pretty: true, showSec: true, // showSec：「請求」分頁預設顯示機密原值，可取消勾選改成遮罩
};
const cur = () => S.tabs.find((t) => t.id === S.active);
// ---- 持久化：存到 server 的 test-data/ 資料夾（每個使用者本機自己產生，不進版控）----
let ready = false, dirty = false, saveTimer = null, dataDir = '';
// 集合與歷史存成 test-data/<分組>/<名稱>.curl、test-data/_history/*.curl（每個請求一個純 curl 檔）；分組設定、session、環境變數是 JSON。
// baseline = 目前磁碟上（本頁面載入或寫入過）的 路徑 -> 內容；只送出與 baseline 不同的檔案，
// 所以你手動編輯、本頁面沒動到的檔案不會被蓋掉。unparsed = 讀得到但解析不了的檔案：原樣保留，絕不寫入/刪除。
let baseline = {}, unparsed = {}, diskSnapshot = {}; // diskSnapshot：磁碟上目前的原始檔案內容（路徑 -> 文字）
const FILE_OF = new Map(); // 請求 id -> { file, forName }：沿用磁碟上的檔名，改名才換檔
const DIR_OF = new Map();  // 集合 id -> { dir, forName }
const snapshot = () => ({ tabs: S.tabs.map(({ res, ...t }) => t), active: S.active, envs: S.envs, env: S.env });
function setSaved(state, msg) {
  const el = $('#saved'); if (!el) return;
  el.textContent = state === 'ok' ? '💾 已儲存' : state === 'busy' ? '💾 儲存中…' : '⚠️ ' + msg;
  el.style.color = state === 'err' ? 'var(--bad)' : ''; el.title = dataDir ? '資料位置：' + dataDir : '';
}
function persist() { if (!ready) return; dirty = true; clearTimeout(saveTimer); setSaved('busy'); saveTimer = setTimeout(() => flush(), 300); }
let flushChain = Promise.resolve();
function flush(keepalive, force) { return (flushChain = flushChain.then(() => doFlush(keepalive, force))); } // 序列化，避免兩次存檔交錯
async function doFlush(keepalive, force) {
  if (!ready || (!dirty && !force)) return; clearTimeout(saveTimer); // 沒有未存變更就不寫，避免蓋掉外部（手動 / 其他分頁）對檔案的修改
  const files = buildFiles();
  const put = {}, del = [];
  for (const [p, t] of Object.entries(files)) if (baseline[p] !== t) put[p] = t;
  for (const p of Object.keys(baseline)) if (!(p in files) && !(p in unparsed)) del.push(p);
  const body = JSON.stringify({ ...snapshot(), put, del });
  try {
    const r = await fetch('/store', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: !!keepalive && body.length < 60000 });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    baseline = files; dirty = false; setSaved('ok');
    for (const p of Object.keys(put)) diskSnapshot[p] = put[p]; for (const p of del) delete diskSnapshot[p]; // 我們自己寫的不算外部修改
  } catch (e) { setSaved('err', '儲存失敗：' + e.message); }
}
window.addEventListener('pagehide', () => flush(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });

/* ---------- 變數 ---------- */
// 每個集合有自己的環境（_collection.json 的 env → environments.json 裡的某個環境）。
// 送出時用「該請求所屬集合」的環境；不在集合裡的分頁才用全域 S.env。
let ctxT = null; // 正在送出的請求：送出期間的變數代入與 Extract 都以它的集合為準
const collOf = (t) => (t && t.collId ? S.colls.find((c) => c.id === t.collId) : null);
// 串接 / 自動取公鑰 / 自動重登要執行集合裡的某個請求時：若它有開著的分頁，就用分頁裡「你現在看到的版本」（含未儲存的修改）
const liveReq = (item) => { const tab = S.tabs.find((x) => x.id === item.id); const r = JSON.parse(JSON.stringify(tab ? { ...strip(tab), collId: item.collId || tab.collId } : item)); if (tab && tab.dirty) r.__unsaved = true; return r; };
const envIdFor = (t) => { const co = collOf(t); return co ? co.env : S.env; };
const curEnv = () => S.envs.find((e) => e.id === envIdFor(ctxT || cur()));
const vars = () => Object.fromEntries(((curEnv() || {}).vars || []).filter((v) => v.on !== false && v.k).map((v) => [v.k, v.v]));
const sub = (s) => { const v = vars(); let out = String(s ?? ''); for (let i = 0; i < 3; i++) { const n = out.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (k in v ? v[k] : m)); if (n === out) break; out = n; } return out; };

