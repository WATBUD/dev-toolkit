// 單元測試：curl 解析、.curl 檔來回轉換、資料夾讀寫、變數代入、Extract 路徑。
// 零依賴：node --test（Node 18+）。前端程式是一般 <script>，這裡用 vm 依 index.html 的順序載入到同一個環境。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PUBLIC = path.join(__dirname, "..", "public");

// 最小的 DOM 替身：任何屬性都能讀、能寫、能呼叫，讓 UI 綁定在載入時不會出錯（這些測試不碰畫面）
const stub = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : stub()),
  set: () => true,
  apply: () => stub(),
});

function load(files) {
  const document = { querySelector: () => stub(), querySelectorAll: () => [], addEventListener() {}, visibilityState: "visible" };
  const ctx = { document, navigator: {}, console, setTimeout, clearTimeout, URLSearchParams, encodeURIComponent, decodeURIComponent };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(PUBLIC, "js", f), "utf8"), ctx, { filename: f });
  return (code) => vm.runInContext(code, ctx);
}

// 依 index.html 的載入順序，只載入不需要畫面的部分
const order = [...fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8").matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
const run = load(order.filter((f) => ["state.js", "request-build.js", "send.js", "curl.js", "files.js"].includes(f)));
const js = (expr) => JSON.parse(run(`JSON.stringify(${expr})`));

test("shellSplit：單引號、'\\'' 跳脫、雙引號、$'…'", () => {
  assert.deepEqual(js(`shellSplit("curl 'it'\\\\''s' \\"a \\\\\\"b\\\\\\"\\" $'x\\\\ny'")`), ["curl", "it's", 'a "b"', "x\ny"]);
});

test("parseCurl：Chrome「Copy as cURL」的 JSON body", () => {
  const r = js(`parseCurl(\`curl 'https://h.test/api/Login?a=1' -H 'Content-Type: application/json' -H 'Language: id' --data-raw '{"x":1}'\`)`);
  assert.equal(r.method, "POST");
  assert.equal(r.url, "https://h.test/api/Login?a=1");
  assert.equal(r.bodyType, "json");
  assert.deepEqual(r.params.map((p) => [p.k, p.v]), [["a", "1"]]);
  assert.deepEqual(r.headers.map((h) => h.k), ["Language"]); // JSON 的 Content-Type 由 bodyType 自動帶，不重複
});

test("parseCurl：{{baseUrl}} 這種變數網址也能當 URL", () => {
  assert.equal(js(`parseCurl("curl -X GET '{{baseUrl}}/api/Me'")`).url, "{{baseUrl}}/api/Me");
});

test("parseCurl：x-www-form-urlencoded 解成表單欄位", () => {
  const r = js(`parseCurl("curl 'http://h/f' -H 'Content-Type: application/x-www-form-urlencoded' --data-raw 'a%20b=c%26d&k=%C3%BC'")`);
  assert.equal(r.bodyType, "form");
  assert.deepEqual(r.form.map((f) => [f.k, f.v]), [["a b", "c&d"], ["k", "ü"]]);
});

// 一個請求 → .curl 文字 → 讀回來，所有欄位都要一樣
const roundTrip = (req) => {
  run(`__req = ${JSON.stringify(req)}`);
  return js(`(() => { const back = fromCurlFile(toCurlFile({ ...blank(), ...__req }), 'stem').req; return back; })()`);
};
const same = (req, keys) => { const back = roundTrip(req); for (const k of keys) assert.deepEqual(back[k], req[k], k); };

test(".curl 來回：JSON body 含單引號、中文、跳脫雙引號、{{變數}}，停用的 header / param", () => {
  same({
    id: "a", name: "登入 Login", method: "POST", url: "http://h/login?a=1", bodyType: "json",
    body: '{"msg":"it\'s 你好 \\"q\\"","n":{{num}}}',
    headers: [{ on: true, k: "X-Test", v: "va'lue" }, { on: false, k: "X-Off", v: "hidden" }],
    params: [{ on: true, k: "a", v: "1" }, { on: false, k: "off", v: "z" }],
    extract: [{ on: true, k: "accessToken", v: "token" }, { on: false, k: "data.x", v: "y" }],
    next: "AdminInfo",
  }, ["name", "method", "url", "bodyType", "body", "headers", "extract", "next"]);
});

test(".curl 來回：form、Basic、Bearer、集合共用 auth", () => {
  same({ id: "f", name: "form", method: "POST", url: "http://h/f", bodyType: "form", form: [{ on: true, k: "a b", v: "c&d=e" }, { on: true, k: "{{k}}", v: "ü" }] }, ["bodyType", "form"]);
  same({ id: "b", name: "basic", method: "PUT", url: "http://h/b", auth: { type: "basic", token: "", user: "u", pass: "p:w'd" }, bodyType: "text", body: "plain\nline2" }, ["auth", "bodyType", "body"]);
  // Bearer 讀回來仍是 Bearer 認證，不能變成一個普通的 Authorization header
  same({ id: "e", name: "bearer", method: "DELETE", url: "http://h/e", headers: [], auth: { type: "bearer", token: "tok123", user: "", pass: "" } }, ["auth", "headers"]);
  same({ id: "c", name: "coll", method: "GET", url: "{{baseUrl}}/me", auth: { type: "coll", token: "", user: "", pass: "" } }, ["auth", "url"]);
});

test(".curl 讀檔：沒有任何註解的純 curl，名稱用檔名、ID 用傳入的固定值", () => {
  const x = js(`fromCurlFile("curl 'http://h/api/GetPublicKey' -H 'Language: id'\\n", 'GetPublicKey', 'rFIXED')`);
  assert.equal(x.req.name, "GetPublicKey");
  assert.equal(x.req.id, "rFIXED");
  assert.equal(x.req.method, "GET");
});

test("getPath：路徑、陣列索引、不分大小寫、單一欄位名往下找", () => {
  run(`__o = { data: { AccessToken: "T", list: [{ id: 7 }] } }`);
  assert.equal(js(`getPath(__o, "data.AccessToken")`), "T");
  assert.equal(js(`getPath(__o, "data.accesstoken")`), "T");
  assert.equal(js(`getPath(__o, "accessToken")`), "T");
  assert.equal(js(`getPath(__o, "data.list[0].id")`), 7);
  assert.equal(js(`getPath(__o, "nope") === undefined`), true);
});

test("sub()：用請求所屬集合的環境代入變數，支援變數裡再引用變數", () => {
  run(`S.envs = [{ id: "e1", name: "stg", vars: [{ on: true, k: "host", v: "http://h" }, { on: true, k: "base", v: "{{host}}/api" }, { on: false, k: "off", v: "x" }] }];
       S.colls = [{ id: "c1", name: "bo", env: "e1", items: [] }]; ctxT = { collId: "c1" };`);
  assert.equal(js(`sub("{{base}}/Login?x={{off}}")`), "http://h/api/Login?x={{off}}"); // 停用的變數不代入
  run(`ctxT = null; S.colls = []; S.envs = [];`);
});

test("buildFiles ⇄ fromFiles：集合、順序、排序狀態、收合、環境，無法解析的檔案原樣保留", () => {
  run(`unparsed = {}; FILE_OF.clear(); DIR_OF.clear(); S.hist = [];
       S.colls = [{ id: "c1", name: "bo", env: "e1", sort: "asc", manual: ["r2", "r1"], collapsed: true,
         items: [{ ...blank(), id: "r1", name: "A", url: "http://h/a" }, { ...blank(), id: "r2", name: "B", url: "http://h/b" }] }];`);
  const files = js(`buildFiles()`);
  assert.deepEqual(Object.keys(files).sort(), ["bo/A.curl", "bo/B.curl", "bo/_collection.json"]);
  files["bo/壞掉.curl"] = "this is not curl";
  run(`__files = ${JSON.stringify(files)}`);
  const back = js(`fromFiles(__files)`);
  const c = back.colls[0];
  assert.equal(c.name, "bo");
  assert.equal(c.env, "e1");
  assert.equal(c.sort, "asc");
  assert.deepEqual(c.manual, ["r2", "r1"]);
  assert.equal(c.collapsed, true);
  assert.deepEqual(c.items.map((i) => i.name), ["A", "B"]);
  assert.deepEqual(js(`Object.keys(unparsed)`), ["bo/壞掉.curl"]);
  run(`S.colls = []; unparsed = {};`);
});
