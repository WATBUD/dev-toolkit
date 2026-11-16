// 分頁列、請求區、選擇已儲存的變數
// 由 index.html 拆出；所有 js/*.js 依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍。
/* ---------- 渲染：分頁列 ---------- */
function renderTabs() {
  const none = !cur(); $('#work').hidden = none; $('#empty').hidden = !none;
  $('#rtabs').innerHTML = S.tabs.map((t) => `<div class="rt ${t.id === S.active ? 'on' : ''}" data-id="${t.id}"><span class="mt ${t.method}">${t.method}</span><span class="n">${esc(t.name || t.url || '未命名')}</span>${t.dirty ? '<span class="dot">●</span>' : ''}<button class="ghost" data-close="${t.id}">✕</button></div>`).join('') + '<div class="rt" id="newtab">＋</div>';
}
$('#rtabs').onclick = (e) => {
  const c = e.target.closest('[data-close]'); if (c) { closeTab(c.dataset.close); return; }
  if (e.target.closest('#newtab')) return newTab();
  const r = e.target.closest('.rt[data-id]'); if (r) { S.active = r.dataset.id; S.resStep = 0; S.logView = null; all(); }
};
function newTab() { const t = blank(); S.tabs.push(t); S.active = t.id; all(); }
$('#empty-new').onclick = newTab;
function closeTab(id) { S.tabs = S.tabs.filter((t) => t.id !== id); if (!S.tabs.find((t) => t.id === S.active)) S.active = S.tabs.length ? S.tabs[S.tabs.length - 1].id : null; all(); }

/* ---------- 渲染：請求區 ---------- */
const REQTABS = [['params', 'Params'], ['headers', 'Headers'], ['body', 'Body'], ['auth', 'Auth'], ['extract', 'Extract']];
function kvEditor(arr, key, ph) {
  return arr.map((p, i) => `<div class="kv"><input type="checkbox" data-kv="${key}.${i}.on" ${p.on !== false ? 'checked' : ''}><input data-kv="${key}.${i}.k" value="${esc(p.k)}" placeholder="${ph[0]}" spellcheck="false"><input data-kv="${key}.${i}.v" value="${esc(p.v)}" placeholder="${ph[1]}" spellcheck="false"${key === 'extract' ? '' : ' list="vars-dl"'}>${key === 'extract' ? '<span></span>' : `<button class="ghost vpick" data-pick="${key}.${i}" title="選擇已儲存的變數">{x}</button>`}<button class="ghost" data-del="${key}.${i}">✕</button></div>`).join('') + `<button data-add="${key}">＋ 新增</button>`;
}
/* ---------- 選擇已儲存的變數（Header / Params / Form 的值、Bearer token）---------- */
// 機密判斷：勾了 🔒，或名稱看起來就是機密（password、token、cookie…），一律遮罩顯示
const isSecret = (v) => !!v.secret || /pass|pwd|token|secret|cookie|auth|session/i.test(v.k || '');
const envVarsList = () => { const env = curEnv(); return env ? env.vars.filter((v) => v.k && v.on !== false) : []; };
function refreshVarList() { const dl = $('#vars-dl'); if (dl) dl.innerHTML = envVarsList().map((v) => `<option value="{{${esc(v.k)}}}">${esc(v.k)}${isSecret(v) ? ' 🔒' : ''}</option>`).join(''); }
let pickTarget = null;
function openVarMenu(btn) {
  const input = btn.parentElement.querySelector('input[data-kv$=".v"]'); if (!input) return;
  pickTarget = { input, kv: input.dataset.kv };
  const vs = envVarsList(), m = $('#vmenu');
  m.innerHTML = vs.length ? vs.map((v) => {
    const val = String(v.v ?? ''), pv = isSecret(v) ? '•'.repeat(Math.min(val.length, 12)) : val.slice(0, 40) + (val.length > 40 ? '…' : '');
    return `<div class="vm" data-var="${esc(v.k)}"><b>{{${esc(v.k)}}}${isSecret(v) ? ' 🔒' : ''}</b><span class="hint">${pv ? esc(pv) : '（空）'}${v.src ? ' · ← ' + esc(v.src) + ' ' + ago(v.at) : ''}</span></div>`;
  }).join('') : '<div class="hint" style="padding:8px 10px">目前環境沒有變數。送出有 Extract 的請求，或按集合旁的 ✎ 編輯環境。</div>';
  const r = btn.getBoundingClientRect();
  m.style.top = Math.min(r.bottom + 4, innerHeight - 120) + 'px'; m.style.left = Math.max(8, Math.min(r.right - 320, innerWidth - 330)) + 'px'; m.hidden = false;
}
function applyVar(name) {
  const { input, kv } = pickTarget || {}; $('#vmenu').hidden = true; if (!input) return;
  const [k, i] = kv.split('.'); const t = cur(); if (!t || !t[k] || !t[k][+i]) return;
  const tok = `{{${name}}}`, val = input.value, a = input.selectionStart ?? val.length, b = input.selectionEnd ?? val.length;
  let nv;
  if (a !== b) nv = val.slice(0, a) + tok + val.slice(b);              // 有選取一段：只換掉那段
  else if (!val || (/\s$/.test(val) && a === val.length)) nv = val + tok; // 空的、或像「Bearer 」結尾：接在後面
  else nv = tok;                                                        // 其他（例如貼上的整串 token）：整個換成變數
  t[k][+i].v = nv; if (k === 'params') syncUrlFromParams(t);
  t.dirty = true; persist(); renderReq(); renderTabs();
}
document.addEventListener('click', (e) => {
  const pb = e.target.closest('[data-pick]'); if (pb) return openVarMenu(pb);
  const it = e.target.closest('#vmenu [data-var]'); if (it) return applyVar(it.dataset.var);
  const es = e.target.closest('#vmenu [data-envset]'); if (es) { $('#vmenu').hidden = true; const [cid, eid] = es.dataset.envset.split('|'); return setCollEnv(cid, eid); }
  const en = e.target.closest('#vmenu [data-envnew]'); if (en) {
    $('#vmenu').hidden = true; const cid = en.dataset.envnew, co = S.colls.find((k) => k.id === cid);
    const n = prompt('環境名稱（如 dev / stg）', co ? co.name : ''); if (!n) return;
    const env = { id: uid(), name: n.trim(), vars: [{ on: true, k: 'baseUrl', v: '' }] }; S.envs.push(env); setCollEnv(cid, env.id); return openEnvEditor(env.id);
  }
  if (!e.target.closest('#vmenu') && !e.target.closest('[data-envpick],[data-envedit]')) $('#vmenu').hidden = true;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#vmenu').hidden = true; });

function renderReq() {
  refreshVarList();
  const t = cur(); if (!t) return;
  $('#method').value = t.method; if ($('#url') !== document.activeElement) $('#url').value = t.url;
  $('#reqtabs').innerHTML = REQTABS.map(([k, n]) => {
    t.extract = t.extract || [];
    const c = k === 'params' ? t.params.filter((p) => p.k).length : k === 'headers' ? t.headers.filter((p) => p.k).length : k === 'extract' ? t.extract.filter((p) => p.k).length : 0;
    return `<button data-rt="${k}" class="${S.reqTab === k ? 'on' : ''}">${n}${c ? ` <span class="hint">(${c})</span>` : ''}</button>`;
  }).join('');
  let h = '';
  if (S.reqTab === 'params') h = kvEditor(t.params, 'params', ['key', 'value']);
  else if (S.reqTab === 'headers') h = kvEditor(t.headers, 'headers', ['Header', 'Value']) + `<p class="hint">Content-Type、Authorization 由 Body / Auth 自動帶入（除非你在這裡手動設定）。</p>`;
  else if (S.reqTab === 'body') {
    h = `<div class="row" style="margin-bottom:6px">${[['none', '無'], ['json', 'JSON'], ['text', 'Text'], ['form', 'x-www-form-urlencoded']].map(([k, n]) => `<label><input type="radio" name="bt" value="${k}" ${t.bodyType === k ? 'checked' : ''} style="width:auto"> ${n}</label>`).join('')}${t.bodyType === 'json' ? '<button id="fmtjson">格式化</button>' : ''}</div>`;
    if (t.bodyType === 'json' || t.bodyType === 'text') h += `<textarea data-f="body" rows="9" spellcheck="false">${esc(t.body)}</textarea>`;
    else if (t.bodyType === 'form') h += kvEditor(t.form, 'form', ['key', 'value']);
    else h += '<p class="hint">這個請求沒有 Body。</p>';
  } else if (S.reqTab === 'extract') {
    h = kvEditor(t.extract, 'extract', ['JSON 路徑（如 accessToken、data.token）', '存成變數（如 token）']) + `<p class="hint">送出成功後自動從回應 JSON 取值存進目前環境，後續用 <code>{{變數名}}</code> 引用。單一欄位名（如 accessToken）會自動在整份回應裡往下找。</p>`;
    const co = S.colls.find((c) => c.id === t.collId);
    const names = co ? co.items.filter((i) => i.id !== t.id && i.name).map((i) => i.name) : [];
    h += `<div class="row" style="margin-top:10px"><label class="hint" style="white-space:nowrap">成功後接著執行</label>`
      + `<select data-f="next" style="width:240px"><option value="">（不接）</option>${names.map((n) => `<option value="${esc(n)}" ${n === t.next ? 'selected' : ''}>${esc(n)}</option>`).join('')}`
      + `${t.next && !names.includes(t.next) ? `<option value="${esc(t.next)}" selected>${esc(t.next)}（找不到）</option>` : ''}</select></div>`
      + `<p class="hint">例：取公鑰的請求擷取 <code>data → publicKey</code>，接著執行「Login」；Login 的密碼欄位寫 <code>{{$rsa(password)}}</code> 就會用剛拿到的公鑰加密。${co ? '' : '<br>⚠️ 這個請求還沒存進集合，存進去才能選。'}</p>`;
  } else {
    h = `<div class="row" style="margin-bottom:6px"><select data-f="auth.type" style="width:180px">${[['none', '無'], ['bearer', 'Bearer Token'], ['basic', 'Basic Auth'], ['coll', '集合共用（自動帶 token）']].map(([k, n]) => `<option value="${k}" ${t.auth.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    if (t.auth.type === 'bearer') h += `<input data-f="auth.token" value="${esc(t.auth.token)}" placeholder="token（可用 {{token}}）" spellcheck="false" list="vars-dl">`;
    if (t.auth.type === 'coll') h += `<p class="hint">帶入環境變數 <code>{{token}}</code>，header 名稱與前綴看這個請求所屬「集合」的設定（⚙）。收到 401 會自動重跑集合的登入請求並重送一次。${t.collId ? '' : '<br>⚠️ 這個請求還沒存進集合，請先按「儲存」。'}</p>`;
    if (t.auth.type === 'basic') h += `<div class="row"><input data-f="auth.user" value="${esc(t.auth.user)}" placeholder="username" style="flex:1"><input data-f="auth.pass" type="password" value="${esc(t.auth.pass)}" placeholder="password" style="flex:1"></div>`;
  }
  $('#reqpane').innerHTML = h;
}
const setPath = (o, path, val) => { const p = path.split('.'); const last = p.pop(); const tgt = p.reduce((a, k) => a[k], o); tgt[last] = val; };
$('#reqtabs').onclick = (e) => { const b = e.target.closest('[data-rt]'); if (b) { S.reqTab = b.dataset.rt; renderReq(); } };
$('#reqpane').addEventListener('input', (e) => {
  const t = cur(); if (!t) return; const el = e.target;
  if (el.dataset.kv) { const [k, i, f] = el.dataset.kv.split('.'); t[k][i][f] = f === 'on' ? el.checked : el.value; if (k === 'params') { syncUrlFromParams(t); $('#url').value = t.url; } }
  else if (el.dataset.f) setPath(t, el.dataset.f, el.value);
  else if (el.name === 'bt') { t.bodyType = el.value; renderReq(); }
  t.dirty = true; persist(); renderTabs();
});
$('#reqpane').addEventListener('change', (e) => { if (e.target.dataset.f === 'auth.type') renderReq(); });
$('#reqpane').addEventListener('click', (e) => {
  const t = cur(); if (!t) return; const a = e.target.closest('[data-add]'), d = e.target.closest('[data-del]');
  if (a) { t[a.dataset.add].push({ on: true, k: '', v: '' }); renderReq(); }
  if (d) { const [k, i] = d.dataset.del.split('.'); t[k].splice(+i, 1); if (k === 'params') { syncUrlFromParams(t); $('#url').value = t.url; } t.dirty = true; persist(); renderReq(); renderTabs(); }
  if (e.target.id === 'fmtjson') { try { t.body = JSON.stringify(JSON.parse(sub(t.body)), null, 2); renderReq(); } catch (er) { alert('不是合法 JSON：' + er.message); } }
});
$('#method').innerHTML = METHODS.map((m) => `<option>${m}</option>`).join('');
$('#method').onchange = (e) => { const t = cur(); if (!t) return; t.method = e.target.value; t.dirty = true; persist(); renderTabs(); };
$('#url').oninput = (e) => { const t = cur(); if (!t) return; t.url = e.target.value; syncParamsFromUrl(t); t.dirty = true; persist(); renderTabs(); if (S.reqTab === 'params') renderReq(); };

