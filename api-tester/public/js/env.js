// 環境：每個集合的環境選單與編輯
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- 環境 ---------- */
function renderEnv() { if (S.side === 'vars' || S.side === 'coll') setTimeout(renderSide); refreshVarList(); }
// 集合旁的 🌐：選擇這個集合用哪個環境，或新增一個
function openEnvMenu(btn) {
  const cid = btn.dataset.envpick, co = S.colls.find((k) => k.id === cid); if (!co) return;
  const m = $('#vmenu');
  m.innerHTML = S.envs.map((e) => `<div class="vm" data-envset="${cid}|${e.id}"><b>${e.id === co.env ? '✓ ' : ''}${esc(e.name)}</b><span class="hint">${e.vars.filter((v) => v.k).length} 個變數${S.colls.filter((c) => c.env === e.id && c.id !== cid).length ? ' · 也用於 ' + S.colls.filter((c) => c.env === e.id && c.id !== cid).map((c) => esc(c.name)).join('、') : ''}</span></div>`).join('')
    + `<div class="vm" data-envnew="${cid}"><b>＋ 新增環境…</b></div>` + (co.env ? `<div class="vm" data-envset="${cid}|"><span class="hint">不使用環境</span></div>` : '');
  const r = btn.getBoundingClientRect(); m.style.top = Math.min(r.bottom + 4, innerHeight - 120) + 'px'; m.style.left = Math.max(8, Math.min(r.left, innerWidth - 330)) + 'px'; m.hidden = false;
}
function setCollEnv(cid, eid) { const co = S.colls.find((k) => k.id === cid); if (!co) return; co.env = eid || undefined; persist(); renderSide(); refreshVarList(); renderReq(); }
function openEnvEditor(envId) {
  const env = S.envs.find((e) => e.id === envId); if (!env) return alert('這個集合還沒有環境，請先按 🌐 選擇或新增');
  const rows = () => env.vars.map((p, i) => `<div class="kv" style="grid-template-columns:22px 1fr 1.6fr 40px 24px"><input type="checkbox" data-i="${i}" data-f="on" ${p.on !== false ? 'checked' : ''}><input data-i="${i}" data-f="k" value="${esc(p.k)}" placeholder="變數名"><input data-i="${i}" data-f="v" type="${isSecret(p) ? 'password' : 'text'}" autocomplete="off" value="${esc(p.v)}" placeholder="值"><label title="機密：輸入遮罩、匯出時不帶出值"><input type="checkbox" data-i="${i}" data-f="secret" ${p.secret ? 'checked' : ''} style="width:auto">🔒</label><button type="button" class="ghost" data-x="${i}">✕</button></div>`).join('');
  const users = S.colls.filter((c) => c.env === env.id).map((c) => esc(c.name)).join('、');
  dlg(`<h3 style="margin-top:0">環境：<input id="envname" value="${esc(env.name)}" style="width:200px;font-weight:600"></h3><p class="hint">${users ? `用於集合：${users}。` : ''}在 URL / Header / Body 用 <code>{{變數名}}</code> 引用。只存在本機 test-data/environments.json。勾 🔒 的是機密（密碼、token）。</p><div id="vrows">${rows()}</div><button type="button" id="vadd">＋ 新增變數</button><div class="row" style="margin-top:12px;justify-content:space-between"><button type="button" id="vdel" class="ghost">刪除此環境</button><span style="flex:1"></span><button type="button" id="vdup" title="完整複製一份成新環境（含機密值），複製後可改名">⧉ 複製成新環境</button><button type="button" id="vcopy" title="把變數複製成 JSON；機密值不會被複製">📋 複製到剪貼簿</button><button class="pri" value="ok">完成</button></div>`, () => { const n = $('#envname') && $('#envname').value.trim(); if (n) env.name = n; persist(); renderEnv(); });
  const box = $('#vrows');
  box.oninput = (e) => { const i = e.target.dataset.i; if (i == null) return; const f = e.target.dataset.f; env.vars[i][f] = (f === 'on' || f === 'secret') ? e.target.checked : e.target.value; };
  box.onchange = (e) => { if (e.target.dataset.f === 'secret') box.innerHTML = rows(); };
  box.onclick = (e) => { if (e.target.dataset.x != null) { env.vars.splice(+e.target.dataset.x, 1); box.innerHTML = rows(); } };
  $('#vadd').onclick = () => { env.vars.push({ on: true, k: '', v: '' }); box.innerHTML = rows(); };
  // ⧉ 複製成新環境：變數全部複製（含機密），Extract 的來源 / 時間不帶過去；名稱自動加「副本」避免重複
  $('#vdup').onclick = () => {
    const nameNow = ($('#envname').value || '').trim(); if (nameNow) env.name = nameNow;
    let name = env.name + ' 副本', i = 2; while (S.envs.some((e) => e.name === name)) name = `${env.name} 副本 ${i++}`;
    const copy = { id: uid(), name, vars: env.vars.map(({ src, at, ...v }) => ({ ...v })) };
    S.envs.push(copy); persist(); $('#dlg').close();
    setTimeout(() => openEnvEditor(copy.id), 0); // 打開新環境，直接可以改名
  };
  // 📋 複製到剪貼簿：JSON { 名稱, 變數 }；機密值留空
  $('#vcopy').onclick = (ev) => {
    const out = { name: ($('#envname').value || env.name).trim(), vars: Object.fromEntries(env.vars.filter((v) => v.k).map((v) => [v.k, isSecret(v) ? '' : String(v.v ?? '')])) };
    const hidden = env.vars.filter((v) => v.k && isSecret(v)).length;
    navigator.clipboard.writeText(JSON.stringify(out, null, 2)).then(() => { ev.target.textContent = hidden ? `已複製 ✓（${hidden} 個機密值未複製）` : '已複製 ✓'; setTimeout(() => (ev.target.textContent = '📋 複製到剪貼簿'), 2000); });
  };
  $('#vdel').onclick = () => {
    if (!confirm('刪除此環境？（裡面的變數會一起刪除）')) return;
    S.envs = S.envs.filter((e) => e.id !== env.id); if (S.env === env.id) S.env = '';
    S.colls.forEach((c) => { if (c.env === env.id) c.env = undefined; });
    $('#dlg').close(); persist(); renderEnv();
  };
}

