// 匯出入、快捷鍵、啟動（boot）、切回瀏覽器時重新讀取資料夾
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- 匯出入檔案 ---------- */
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); }
function importFile() { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { try { const j = JSON.parse(await i.files[0].text()); if (j.colls) S.colls.push(...j.colls.map((c) => ({ ...c, id: uid() }))); if (j.envs) S.envs.push(...j.envs.map((c) => ({ ...c, id: uid() }))); persist(); renderEnv(); renderSide(); } catch (e) { alert('匯入失敗：' + e.message); } }; i.click(); }

/* ---------- 快捷鍵 + 啟動 ---------- */
$('#send').onclick = sendReq;
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); sendReq(); } if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); $('#save').click(); } });
function all() { renderTabs(); renderReq(); renderRes(); renderSide(); renderEnv(); persist(); }
function apply(st) {
  // 完全空白、沒改過的分頁（沒網址、沒名稱）不保留：不需要「至少一個分頁」，要新的請使用者自己按 ＋
  S.tabs = (st.tabs || []).filter((t) => t.url || t.name || t.dirty).map((t) => ({ ...blank(), ...t, res: null }));
  S.active = S.tabs.find((t) => t.id === st.active) ? st.active : (S.tabs[0] ? S.tabs[0].id : null);
  S.colls = st.colls || []; S.hist = st.hist || []; S.envs = st.envs || []; S.env = st.env || '';
}
async function boot() {
  let st = null;
  try {
    const r = await fetch('/store'); st = await r.json();
    if (!r.ok) throw new Error(st.error || 'HTTP ' + r.status);
  } catch (e) {
    // 讀取失敗時「不啟用儲存」，避免用空資料把磁碟上的檔案蓋掉。
    setSaved('err', '無法讀取本機資料：' + e.message + '（為避免覆蓋已停用儲存）'); all(); return;
  }
  dataDir = st.dir || '';
  const hasFiles = st.files && Object.keys(st.files).length;
  diskSnapshot = { ...(st.files || {}) };
  if (hasFiles) { const x = fromFiles(st.files); st.colls = x.colls; st.hist = x.hist; }
  if (!st.empty) apply(st);
  if (S.env) S.colls.forEach((c) => { if (!c.env) c.env = S.env; }); // 舊資料：集合沿用原本全域選的環境
  // 上次開著的分頁若對應到磁碟上的請求、且沒有未存的修改，就以磁碟上最新內容為準（你在資料夾裡手動改過 curl 也會反映）
  const byId = new Map(S.colls.flatMap((c) => c.items.map((i) => [i.id, i])));
  S.tabs = S.tabs.map((t) => { const it = byId.get(t.id); return it && !t.dirty ? { ...blank(), ...JSON.parse(JSON.stringify(it)), res: null } : t; });
  baseline = hasFiles ? buildFiles() : {}; // 以「載入當下的狀態」為基準，沒改動的檔案維持磁碟原樣
  ready = true; all();
  clearTimeout(saveTimer); dirty = false; // 剛載入不算「有變更」，不要立刻回寫
  const bad = Object.keys(unparsed).filter((p) => ((st.files || {})[p] || '').trim()); // 空檔案是預先建好的檔名，不提醒
  setSaved('ok');
  if (bad.length) alert(`有 ${bad.length} 個檔案無法解析，已原樣保留（不會被修改或刪除）：\n` + bad.slice(0, 8).join('\n'));
}
/* ---------- 切回瀏覽器時自動重新讀取資料夾（新增 / 修改 curl 立刻反映）---------- */
let syncing = false, syncTimer = null;
const sameFiles = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };
async function syncFromDisk() {
  if (!ready || syncing || dirty || $('#dlg').open) return; // 有未存變更、或正在編輯對話框時不動，下次切回再讀
  syncing = true;
  try {
    await flushChain;
    if (dirty) return;
    const r = await fetch('/store'); if (!r.ok) return;
    const files = (await r.json()).files || {};
    if (dirty || sameFiles(files, diskSnapshot)) return; // 磁碟沒有變化就什麼都不做（不會清掉你的回應結果）
    const x = fromFiles(files);
    S.colls = x.colls; S.hist = x.hist; diskSnapshot = { ...files };
    if (S.env) S.colls.forEach((c) => { if (!c.env) c.env = S.env; });
    // 開著的分頁：沒有未存修改、且磁碟上的內容和分頁不同，才換成磁碟上的最新內容
    const byId = new Map(S.colls.flatMap((c) => c.items.map((i) => [i.id, i])));
    S.tabs = S.tabs.map((t) => { const it = byId.get(t.id); return it && !t.dirty && toCurlFile(t) !== toCurlFile(it) ? { ...blank(), ...JSON.parse(JSON.stringify(it)), res: null } : t; });
    baseline = buildFiles();
    renderSide(); renderTabs(); renderReq(); renderRes();
    const n = S.colls.reduce((a, c) => a + c.items.length, 0);
    const el = $('#saved'); el.style.color = ''; el.textContent = `🔄 已重新讀取資料夾（${S.colls.length} 個集合、${n} 個請求）`;
    setTimeout(() => { if (!dirty) setSaved('ok'); }, 3500);
  } catch { /* 讀取失敗就保持現狀，下次切回再試 */ }
  finally { syncing = false; }
}
const scheduleSync = () => { clearTimeout(syncTimer); syncTimer = setTimeout(syncFromDisk, 250); };
window.addEventListener('focus', scheduleSync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(); });

boot();

