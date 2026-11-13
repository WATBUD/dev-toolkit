import fs from "fs";
import path from "path";

// 載入 src/mocks/<projectId>/_config.ts 拿到該 project 的設定。
// 每個 project 的 config shape 由自己決定,這裡只負責動態載入。
export function loadProjectConfig(projectId: string): any {
  const configPath = path.join(__dirname, "mocks", projectId, "_config.ts");
  if (!fs.existsSync(configPath)) {
    throw new Error(`[Config] 找不到 project 設定檔: ${configPath}`);
  }
  const mod = require(configPath);
  if (!mod.apiExperimentConfig) {
    throw new Error(`[Config] ${configPath} 沒有 export apiExperimentConfig`);
  }
  return mod.apiExperimentConfig;
}

// 動態載入 src/mocks/<projectId>/<kebab>/<kebab>.ts，
// 把每個 module 裡所有 Array export 攤平成 handler 列表。
// 新增 endpoint 不用再回頭改這支檔案。
export function loadProjectHandlers(projectId: string): any[] {
  const projectDir = path.join(__dirname, "mocks", projectId);
  if (!fs.existsSync(projectDir)) {
    console.warn(`[Handlers] 找不到 project 目錄: ${projectDir}`);
    return [];
  }
  const handlers: any[] = [];
  for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const handlerFile = path.join(projectDir, entry.name, `${entry.name}.ts`);
    if (!fs.existsSync(handlerFile)) continue;
    try {
      const mod = require(handlerFile);
      for (const value of Object.values(mod)) {
        if (Array.isArray(value)) handlers.push(...value);
      }
    } catch (err) {
      console.error(`[Handlers] 載入失敗 ${handlerFile}:`, (err as Error).message);
    }
  }
  console.log(`[Handlers] project=${projectId} 載入 ${handlers.length} 個 handler`);
  return handlers;
}
