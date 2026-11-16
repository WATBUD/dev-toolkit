// 側欄（集合 / 歷史 / 變數 / 日誌）、拖曳排序、集合設定、儲存
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- 側欄 ---------- */
const revealed = new Set(); // 這次瀏覽中被點開看的機密變數（不存檔，重新整理就恢復遮罩）
const ago = (ts) => { if (!ts) return ''; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? `${s} 秒前` : s < 3600 ? `${Math.round(s / 60)} 分鐘前` : s < 86400 ? `${Math.round(s / 3600)} 小時前` : new Date(ts).toLocaleString(); };
function renderLog() {
  if (!RLOG.length) return '<span class="hint">還沒有紀錄。每次送出（含自動取公鑰、接著執行、自動重登）都會記在這裡，點一列就能看完整回應。<br>只存在這個頁面，重新整理就清空。</span>';
  const kind = { main: '', next: '↳ ', key: '🔑 ', relogin: '🔄 ', retry: '↻ ' };
  const runs = []; const byRun = new Map(); // 新的一輪在上；同一輪內照執行順序
  for (const e of RLOG) { if (!byRun.has(e.run)) { byRun.set(e.run, []); runs.push(e.run); } byRun.get(e.run).push(e); }
  const row = (e) => { const ok = !e.res.error && e.res.status < 400 && !(e.res.missing || []).length;
    return `<tr data-log="${e.id}" class="${S.logView === e.id ? 'on' : ''}"><td class="hint">${hhmmss(e.at)}</td><td class="mt ${e.method}">${e.method}</td>`
      + `<td class="ln">${kind[e.kind] || ''}${esc(e.name || String(e.url).replace(/^https?:\/\/[^/]+/, ''))}${(e.res.missing || []).length ? ` <span class="bad" title="找不到：${esc(e.res.missing.join('、'))}">⚠</span>` : ''}</td>`
      + `<td class="${ok ? 'ok' : 'bad'}"><b>${e.res.error ? '✕' : e.res.status}</b></td><td class="hint">${e.res.timeMs ?? ''}ms</td></tr>`; };
  return `<div class="row" style="margin-bottom:6px"><button id="clrlog">清空日誌</button><span class="hint">${RLOG.length} 筆 · 只在記憶體</span></div>`
    + `<table class="log">${runs.map((r) => byRun.get(r).slice().reverse().map(row).join('')).join('<tr class="sep"><td colspan="5"></td></tr>')}</table>`
    + `<p class="hint">↳ 接著執行　🔑 自動取公鑰　🔄 自動重登　↻ 重登後重送</p>`;
}
function renderVars() {
  const env = curEnv(), co = collOf(cur());
  if (!env) return `<span class="hint">${co ? `集合「${esc(co.name)}」還沒有環境。按集合旁的 🌐 選擇或新增，或送出有 Extract 的請求會自動建立。` : '目前分頁不在任何集合裡。打開集合裡的請求，就會顯示那個集合的環境。'}</span>`;
  const vs = env.vars.filter((v) => v.k);
  const ext = vs.filter((v) => v.src).sort((a, b) => (b.at || 0) - (a.at || 0)), other = vs.filter((v) => !v.src);
  const row = (v) => {
    const i = env.vars.indexOf(v), show = !isSecret(v) || revealed.has(v.k), val = String(v.v ?? '');
    return `<div class="var"><div class="row" style="gap:4px;flex-wrap:nowrap"><b style="flex:1;word-break:break-all">${esc(v.k)}${isSecret(v) ? ' 🔒' : ''}${v.on === false ? ' <span class="hint">（停用）</span>' : ''}</b>`
      + (isSecret(v) ? `<button class="ghost" data-vshow="${i}" title="顯示 / 隱藏">${show ? '🙈' : '👁'}</button>` : '')
      + `<button class="ghost" data-vcopy="${i}" title="複製值">📋</button><button class="ghost" data-vdel="${i}" title="刪除這個變數">✕</button></div>`
      + `<div class="vval">${val ? (show ? esc(val.length > 160 ? val.slice(0, 160) + '…' : val) : '•'.repeat(Math.min(val.length, 24))) : '<span class="hint">（空）</span>'}</div>`
      + (v.src ? `<div class="hint">← ${esc(v.src)} 擷取 · ${ago(v.at)}${val ? ` · ${val.length} 字元` : ''}</div>` : '') + '</div>';
  };
  return `<div class="hint" style="margin-bottom:6px">目前環境：<b>${esc(env.name)}</b>${co ? `（集合 ${esc(co.name)}）` : ''} <button id="vars-edit">編輯</button></div>`
    + `<div class="vsec">Extract 擷取的值</div>` + (ext.length ? ext.map(row).join('') : '<span class="hint">還沒有。在請求的 Extract 分頁設定規則，送出成功後會出現在這裡。</span>')
    + `<div class="vsec">其他變數</div>` + (other.length ? other.map(row).join('') : '<span class="hint">（無）</span>');
}
function renderSide() {
  document.querySelectorAll('.stabs button').forEach((b) => b.classList.toggle('on', b.dataset.s === S.side));
  const sb = $('#sbody');
  if (S.side === 'vars') { sb.innerHTML = renderVars(); return; }
  if (S.side === 'log') { sb.innerHTML = renderLog(); return; }
  if (S.side === 'hist') {
    sb.innerHTML = (S.hist.length ? `<div class="row" style="margin-bottom:6px"><button id="clrhist">清空歷史</button></div>` : '<span class="hint">還沒有紀錄</span>') +
      S.hist.map((h) => `<div class="item" data-h="${h.id}" title="${esc(h.req.url)}"><span class="mt ${h.req.method}">${h.req.method}</span><span class="n">${esc(h.req.url.replace(/^https?:\/\//, ''))}</span><span class="hint">${h.status}</span></div>`).join('');
  } else {
    sb.innerHTML = `<div class="row" style="margin-bottom:6px"><button id="newcoll">＋ 新集合</button><button id="expall">匯出</button><button id="impall">匯入</button></div>` +
      (S.colls.length ? '' : '<span class="hint">按「儲存」把請求放進集合</span>') +
      S.colls.map((c) => `<div class="coll"><div class="ch" data-toggle="${c.id}" title="點擊展開 / 收合"><span class="tw">${c.collapsed ? '▸' : '▾'}</span><span class="cn">${c.collapsed ? '📁' : '📂'} ${esc(c.name)} <span class="hint">${c.items.length}</span></span><button class="ghost sortbtn ${c.sort === 'asc' || c.sort === 'desc' ? 'on' : ''}" data-sort="${c.id}" title="${({ asc: '目前 A→Z，再按改成 Z→A', desc: '目前 Z→A，再按還原原本順序' })[c.sort] || '依名稱排序（A→Z）'}">${({ asc: 'A↓', desc: 'A↑' })[c.sort] || 'A⇅'}</button><button class="ghost envbtn" data-envpick="${c.id}" title="這個集合用的環境（點擊切換 / 新增）">🌐 ${esc((S.envs.find((e) => e.id === c.env) || {}).name || '無環境')}</button><button class="ghost" data-envedit="${c.id}" title="編輯這個集合的環境">✎</button><button class="ghost" data-rc="${c.id}" title="集合設定">⚙</button><button class="ghost" data-dc="${c.id}" title="刪除集合">✕</button></div>` +
        (c.collapsed ? '' : c.items.map((it) => `<div class="item" draggable="true" data-dnd="${c.id}|${it.id}" data-i="${c.id}|${it.id}" title="拖曳可調整順序"><span class="grip">⋮⋮</span><span class="mt ${it.method}">${it.method}</span><span class="n">${esc(it.name || it.url)}</span><button class="ghost" data-di="${c.id}|${it.id}">✕</button></div>`).join('')) + '</div>').join('');
  }
}
document.querySelector('.stabs').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { S.side = b.dataset.s; renderSide(); } };
// 拖曳排序：只在同一個集合內移動；放在目標的上半部 = 插到它前面，下半部 = 插到它後面
let dragInfo = null;
(() => {
  const sb = $('#sbody');
  const clear = () => sb.querySelectorAll('.drop-before,.drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  sb.addEventListener('dragstart', (e) => {
    const it = e.target.closest('.item[data-dnd]'); if (!it) return;
    const [c, i] = it.dataset.dnd.split('|'); dragInfo = { c, i }; it.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', i); } catch {}
  });
  sb.addEventListener('dragend', () => { dragInfo = null; clear(); sb.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging')); });
  sb.addEventListener('dragover', (e) => {
    const it = e.target.closest('.item[data-dnd]'); if (!it || !dragInfo || it.dataset.dnd.split('|')[0] !== dragInfo.c) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const r = it.getBoundingClientRect(); clear(); it.classList.add(e.clientY > r.top + r.height / 2 ? 'drop-after' : 'drop-before');
  });
  sb.addEventListener('drop', (e) => {
    const it = e.target.closest('.item[data-dnd]'); if (!it || !dragInfo) return;
    e.preventDefault(); clear();
    const [c, tid] = it.dataset.dnd.split('|'); if (c !== dragInfo.c || tid === dragInfo.i) return;
    const co = S.colls.find((k) => k.id === c); if (!co) return;
    const from = co.items.findIndex((k) => k.id === dragInfo.i); if (from < 0) return;
    const [moved] = co.items.splice(from, 1);
    let to = co.items.findIndex((k) => k.id === tid); const r = it.getBoundingClientRect(); if (e.clientY > r.top + r.height / 2) to++;
    co.items.splice(to, 0, moved); co.sort = undefined; co.manual = undefined; persist(); renderSide();
  });
})();
const open = (req) => { const ex = S.tabs.find((t) => t.id === req.id); if (ex) { S.active = ex.id; } else { S.tabs.push({ ...JSON.parse(JSON.stringify(req)), dirty: false, res: null }); S.active = req.id; } all(); };
$('#sbody').onclick = (e) => {
  const g = (k) => e.target.closest(`[${k}]`);
  if (e.target.id === 'vars-edit') return openEnvEditor(envIdFor(cur()));
  if (e.target.id === 'clrlog') { RLOG.length = 0; S.logView = null; renderRes(); return renderSide(); }
  const lr = e.target.closest('[data-log]'); if (lr) { S.logView = lr.dataset.log; renderRes(); return renderSide(); }
  const vb = e.target.closest('[data-vshow],[data-vcopy],[data-vdel]');
  if (vb) {
    const env = curEnv(); const v = env && env.vars[+(vb.dataset.vshow ?? vb.dataset.vcopy ?? vb.dataset.vdel)];
    if (!v) return;
    if (vb.dataset.vshow != null) { revealed.has(v.k) ? revealed.delete(v.k) : revealed.add(v.k); return renderSide(); }
    if (vb.dataset.vcopy != null) { navigator.clipboard.writeText(String(v.v ?? '')).then(() => { vb.textContent = '✓'; setTimeout(renderSide, 900); }); return; }
    if (confirm(`刪除變數 ${v.k}？`)) { env.vars.splice(env.vars.indexOf(v), 1); persist(); renderEnv(); renderSide(); }
    return;
  }
  if (e.target.id === 'clrhist') { S.hist = []; persist(); return renderSide(); }
  if (e.target.id === 'newcoll') { const n = prompt('集合名稱'); if (n) { S.colls.push({ id: uid(), name: n, items: [] }); persist(); renderSide(); } return; }
  if (e.target.id === 'expall') return download('api-tester-collections.json', JSON.stringify({ colls: S.colls, envs: S.envs.map((en) => ({ ...en, vars: en.vars.map((v) => (isSecret(v) ? { ...v, v: '' } : v)) })) }, null, 2));
  if (e.target.id === 'impall') return importFile();
  let x;
  if ((x = g('data-sort'))) {
    const co = S.colls.find((k) => k.id === x.dataset.sort); if (!co) return;
    const key = (i) => String(i.name || i.url || ''); const cmp = (a, b) => key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' });
    if (co.sort === 'asc') { co.sort = 'desc'; co.items.sort((a, b) => -cmp(a, b)); }
    else if (co.sort === 'desc') { // 第三下：還原成排序前的順序（新加進來、不在記錄裡的排最後，維持目前相對順序）
      const idx = new Map((co.manual || []).map((id, i) => [id, i])); const at = (i) => (idx.has(i.id) ? idx.get(i.id) : 1e9);
      co.items.sort((a, b) => at(a) - at(b)); co.sort = undefined; co.manual = undefined;
    } else { co.manual = co.items.map((i) => i.id); co.sort = 'asc'; co.items.sort(cmp); } // 第一下：先記住原本順序
    persist(); return renderSide();
  }
  if ((x = g('data-envpick'))) return openEnvMenu(x);
  if ((x = g('data-envedit'))) { const co = S.colls.find((k) => k.id === x.dataset.envedit); if (!co) return; if (!co.env) return openEnvMenu(x.previousElementSibling); return openEnvEditor(co.env); }
  if ((x = g('data-toggle')) && !e.target.closest('button')) {
    const co = S.colls.find((k) => k.id === x.dataset.toggle); if (co) { co.collapsed = !co.collapsed || undefined; persist(); renderSide(); } return;
  }
  if ((x = g('data-di'))) { const [c, i] = x.dataset.di.split('|'); const co = S.colls.find((k) => k.id === c); co.items = co.items.filter((k) => k.id !== i); persist(); return renderSide(); }
  if ((x = g('data-dc'))) { if (confirm('刪除整個集合？')) { S.colls = S.colls.filter((k) => k.id !== x.dataset.dc); persist(); renderSide(); } return; }
  if ((x = g('data-rc'))) return openCollCfg(x.dataset.rc);
  if ((x = g('data-i'))) { const [c, i] = x.dataset.i.split('|'); return open(S.colls.find((k) => k.id === c).items.find((k) => k.id === i)); }
  if ((x = g('data-h'))) { const h = S.hist.find((k) => k.id === x.dataset.h); return open({ ...h.req, id: uid() }); }
};

/* ---------- 集合設定 ---------- */
function openCollCfg(id) {
  const co = S.colls.find((k) => k.id === id);
  co.cfg = co.cfg || { loginId: '', header: 'Authorization', prefix: 'Bearer ' };
  dlg(`<h3 style="margin-top:0">集合設定</h3>
    <label class="hint">名稱</label><input id="c-name" value="${esc(co.name)}">
    <label class="hint" style="margin-top:8px">登入請求（取得 token 的那支，需設定 Extract 存成 token）</label>
    <select id="c-login"><option value="">（不使用）</option>${co.items.map((i) => `<option value="${i.id}" ${i.id === co.cfg.loginId ? 'selected' : ''}>${esc(i.name || i.url)}</option>`).join('')}</select>
    <div class="row" style="margin-top:8px"><div style="flex:1"><label class="hint">帶 token 的 Header 名稱</label><input id="c-header" value="${esc(co.cfg.header)}"></div><div style="flex:1"><label class="hint">值的前綴（可留空）</label><input id="c-prefix" value="${esc(co.cfg.prefix)}"></div></div>
    <label class="hint" style="margin-top:8px">同時寫入 Cookie（名稱，可留空）</label><input id="c-cookie" value="${esc(co.cfg.cookie || '')}" placeholder="例如 authKey">
    <p class="hint">例：Authorization + 「Bearer 」；或 Access-Token + 空前綴。請求的 Auth 選「集合共用」即套用；收到 401 會自動重登一次。</p>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button value="cancel">取消</button><button class="pri" value="ok">儲存</button></div>`, (v) => {
    if (v !== 'ok') return;
    co.name = $('#c-name').value.trim() || co.name;
    co.cfg = { loginId: $('#c-login').value, header: $('#c-header').value.trim() || 'Authorization', prefix: $('#c-prefix').value, cookie: $('#c-cookie').value.trim() };
    persist(); renderSide();
  });
}
/* ---------- 儲存 ---------- */
$('#save').onclick = () => {
  const t = cur(); if (!t) return;
  if (!S.colls.length) S.colls.push({ id: uid(), name: '我的集合', items: [] });
  dlg(`<h3 style="margin-top:0">儲存請求</h3><label class="hint">名稱</label><input id="d-name" value="${esc(t.name || t.url.replace(/^https?:\/\//, '').slice(0, 40))}"><label class="hint" style="margin-top:8px">集合</label><select id="d-coll">${S.colls.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><div class="row" style="margin-top:12px;justify-content:flex-end"><button value="cancel">取消</button><button class="pri" value="ok">儲存</button></div>`, (v) => {
    if (v !== 'ok') return; t.name = $('#d-name').value.trim(); const co = S.colls.find((c) => c.id === $('#d-coll').value);
    t.collId = co.id; const copy = strip(t); const idx = co.items.findIndex((i) => i.id === t.id); idx >= 0 ? (co.items[idx] = copy) : co.items.push(copy);
    t.dirty = false; S.side = 'coll'; persist(); all();
  });
};
function dlg(html, cb) { const d = $('#dlg'); $('#dform').innerHTML = html; d.onclose = () => cb(d.returnValue); d.showModal(); }

