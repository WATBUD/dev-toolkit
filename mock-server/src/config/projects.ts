// 多專案設定。專案清單完全由環境變數決定（.env，不進版控），程式碼裡沒有任何專案代號。
//
// 每個 slot（A、B、C…）一組：
//   <SLOT>_PROJECT_ID   對應 src/mocks/<id>/ 資料夾名；有值才會啟用該 slot（必填）
//   <SLOT>_TARGET_URL   上游 API 網址；不填就純 mock，不做 shadow 錄製（選填）
//   <SLOT>_PORT / <SLOT>_WS_PORT / <SLOT>_PROXY_PORT   主伺服器 / SignalR / 純代理（選填）
// 預設 port：slot A 為 3200 / 8080 / 3201，之後每個 slot 往上 +10（B 為 3210 / 8090 / 3211）。
//
// 一個 slot 都沒設時，使用版控內的範例專案（預設 id 為 `_example`，可用 EXAMPLE_PROJECT_ID 覆寫；
// 對應的 src/mocks/<id>/ 資料夾必須存在）。
export interface ProjectConfig {
  id: string;
  port: number; // 主伺服器
  wsPort: number; // SignalR / WebSocket
  proxyPort: number; // 純代理伺服器（可選）
  targetUrl?: string; // 上游 API，不填就純 mock，不做 shadow 錄製
}

const SLOTS = ["A", "B", "C", "D", "E", "F"];

// id 會拿來組檔案路徑，只允許安全字元，避免 ../ 之類的路徑跳脫。
const assertSafeId = (id: string, name: string): string => {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`[Config] ${name}="${id}" 只能包含英數、底線、連字號`);
  }
  return id;
};

const toPort = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`[Config] ${name}="${raw}" 不是合法的 port`);
  }
  return n;
};

function fromEnv(): ProjectConfig[] {
  const list: ProjectConfig[] = [];
  SLOTS.forEach((slot, i) => {
    const id = process.env[`${slot}_PROJECT_ID`]?.trim();
    if (!id) return;
    list.push({
      id: assertSafeId(id, `${slot}_PROJECT_ID`),
      port: toPort(process.env[`${slot}_PORT`], 3200 + i * 10, `${slot}_PORT`),
      wsPort: toPort(process.env[`${slot}_WS_PORT`], 8080 + i * 10, `${slot}_WS_PORT`),
      proxyPort: toPort(process.env[`${slot}_PROXY_PORT`], 3201 + i * 10, `${slot}_PROXY_PORT`),
      targetUrl: process.env[`${slot}_TARGET_URL`]?.trim() || undefined,
    });
  });
  return list;
}

function validate(list: ProjectConfig[]): ProjectConfig[] {
  const ids = new Set<string>();
  const ports = new Map<number, string>();
  for (const p of list) {
    if (ids.has(p.id)) throw new Error(`[Config] 專案 id 重複: ${p.id}`);
    ids.add(p.id);
    for (const port of [p.port, p.wsPort, p.proxyPort]) {
      const owner = ports.get(port);
      if (owner) throw new Error(`[Config] port ${port} 被 ${owner} 與 ${p.id} 重複使用`);
      ports.set(port, p.id);
    }
  }
  return list;
}

const defaults: ProjectConfig[] = [
  {
    id: assertSafeId(process.env.EXAMPLE_PROJECT_ID?.trim() || "_example", "EXAMPLE_PROJECT_ID"),
    port: 3200,
    wsPort: 8080,
    proxyPort: 3201,
    targetUrl: process.env.EXAMPLE_TARGET_URL?.trim() || undefined,
  },
];

const fromEnvList = fromEnv();
export const projects: ProjectConfig[] = validate(fromEnvList.length ? fromEnvList : defaults);
