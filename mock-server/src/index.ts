import fs from "fs";
import path from "path";
import { ServerService } from "./services/server-service";
import { projects } from "./config/projects";
import { loadProjectConfig } from "./handlers";

// tsx watch 的 chokidar 寫死忽略 dotfile（**/.*），所以無法直接 watch .env。
// 改成：自己 watch .env，變更時 touch 一個非 dotfile 的 reload-trigger，
// tsx 透過 --include=./reload-trigger 偵測該檔變動而重啟 process。
const envPath = path.join(__dirname, "../.env");
const triggerPath = path.join(__dirname, "../reload-trigger");
if (fs.existsSync(envPath)) {
  let debounceTimeout: NodeJS.Timeout | null = null;
  fs.watch(envPath, () => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      try {
        fs.writeFileSync(triggerPath, String(Date.now()));
        console.log("[Hot Reload] .env changed, restarting...");
      } catch {
        // ignore
      }
    }, 100);
  });
}

// 補 latest.json 占位：handler 用靜態 import，缺檔會讓 module 載入失敗。
function ensureLatestPlaceholders(projectId: string): void {
  const projectDir = path.join(__dirname, "mocks", projectId);
  if (!fs.existsSync(projectDir)) return;
  for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(projectDir, entry.name);
    const hasHandler = fs.readdirSync(dir).some((f) => f.endsWith(".ts"));
    if (!hasHandler) continue;
    const latest = path.join(dir, "latest.json");
    if (!fs.existsSync(latest)) {
      fs.writeFileSync(latest, "{}\n");
      console.log(`[Bootstrap][${projectId}] 建立空 latest.json: ${entry.name}`);
    }
  }
}

const services: ServerService[] = [];
for (const cfg of projects) {
  ensureLatestPlaceholders(cfg.id);
  const projectConfig = loadProjectConfig(cfg.id);
  const service = new ServerService({
    projectId: cfg.id,
    port: cfg.port,
    websocketPort: cfg.wsPort,
    proxyPort: cfg.proxyPort,
    targetUrl: cfg.targetUrl,
    config: projectConfig,
  });
  service.start();
  services.push(service);
}

process.on("SIGTERM", () => {
  console.log("關閉伺服器...");
  for (const s of services) s.stop();
  process.exit(0);
});
