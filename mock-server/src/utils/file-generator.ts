import path from 'path';
import fs from 'fs';
import { urlToFolderName, toIdentifier, stripQuery } from './path-utils';

export interface GenerateHandlerInput {
  method: string;
  // 帶 /api 的原始 URL，決定資料夾名（apiAppServiceXxx）。
  folderUrl: string;
  // 去掉 /api 後的路徑，msw 用它比對請求。
  routePath: string;
  body?: any;
}

export interface GenerateResult {
  created: boolean;
  dir: string;
  handlerFile: string;
  reason?: string;
}

export class FileGenerator {
  // mocksDir 直接指向某個 project 的 mocks root（例如 src/mocks/_example）。
  // 動態 loader 會掃這個目錄，所以新增的 endpoint 不需要再去寫 handlers.ts。
  constructor(private mocksDir: string) {}

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private template(name: string, method: string, routePath: string): string {
    return `import { http, HttpResponse } from 'msw'
import ${name}Response from './normal.json'
import latestResponse from './latest.json';
import { apiExperimentConfig } from '../_config';

// 由 mock server 自動生成（第一次錄到 ${routePath} 時）。
// normal.json 是當下錄到的快照，可以自由修改；要回放最新錄製請看 latest.json。
export const ${name}Handler = [
  http.${method}('${routePath}', () => {
    if (apiExperimentConfig.useLatestResponse) {
      return HttpResponse.json(latestResponse);
    }
    return HttpResponse.json(${name}Response);
  })
]
`;
  }

  // 錄到新 endpoint 時生一份 handler：<folder>/<folder>.ts + normal.json 快照。
  // 已存在的 .ts 一律不覆蓋（手寫邏輯優先）。
  public generateHandler(input: GenerateHandlerInput): GenerateResult {
    const folder = urlToFolderName(input.folderUrl) || 'root';
    const name = toIdentifier(folder) || 'root';
    const routePath = stripQuery(input.routePath);
    const dir = path.join(this.mocksDir, folder);
    const handlerFile = `${folder}.ts`;
    const handlerPath = path.join(dir, handlerFile);

    if (fs.existsSync(handlerPath)) {
      return { created: false, dir, handlerFile, reason: 'handler 已存在，不覆蓋' };
    }

    this.ensureDir(dir);

    // handler 用靜態 import，這兩支缺檔會讓整個 module 載入失敗。
    const body = input.body ?? {};
    for (const f of ['normal.json', 'latest.json']) {
      const fp = path.join(dir, f);
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify(body, null, 2));
    }

    fs.writeFileSync(handlerPath, this.template(name, input.method.toLowerCase(), routePath));
    return { created: true, dir, handlerFile };
  }

  // 純 mock 專案（沒設 targetUrl）的 404 路徑：沒有錄製資料，只生空殼。
  public generateMockFiles(req: any): string {
    const result = this.generateHandler({
      method: req.method,
      folderUrl: req.originalUrl || req.url || '/',
      routePath: req.path,
    });
    if (!result.created) {
      return `${result.handlerFile} ${result.reason}\n`;
    }
    console.log(`✅ 已創建 ${result.handlerFile} + normal.json`);
    return `檔案 ${result.handlerFile} 與 normal.json 已創建\n`;
  }
}
