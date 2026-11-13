import path from 'path';
import fs from 'fs';
import { urlToFolderName, stripQuery } from '../utils/path-utils';

export class RecordingService {
  private mocksDir: string;

  constructor(baseDir: string, private config: any) {
    this.mocksDir = baseDir;
    this.ensureDir(this.mocksDir);
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private folderOf(urlPath: string): string {
    return urlToFolderName(urlPath) || 'root';
  }

  private dirFor(urlPath: string): string {
    return path.join(this.mocksDir, this.folderOf(urlPath));
  }

  private latestFileName(_urlPath: string): string {
    return 'latest.json';
  }

  // 黑名單比對:大小寫不分,三種寫法都吃 ——
  //   "/api/AppService/Content"、"/AppService/Content"（沒帶 /api）、"apiAppServiceContent"
  private isBlacklisted(urlPath: string): boolean {
    const list = this.config.recordingBlacklist;
    if (!list || list.length === 0) return false;
    const cleaned = stripQuery(urlPath).toLowerCase();
    const folder = this.folderOf(urlPath).toLowerCase();
    return list.some((entry: string) => {
      const e = entry.trim().toLowerCase();
      if (!e) return false;
      const eFolder = urlToFolderName(e).toLowerCase();
      if (!eFolder) return false;
      // endsWith 讓沒帶 /api 前綴的舊寫法繼續有效。
      return e === cleaned || folder === eFolder || folder.endsWith(eFolder);
    });
  }

  public save(method: string, urlPath: string, _status: number, body: any, _contentType?: string): string | null {
    if (this.isBlacklisted(urlPath)) {
      console.log(`[Recording] 黑名單命中,不覆蓋: ${method} ${urlPath}`);
      return null;
    }
    try {
      const dir = this.dirFor(urlPath);
      this.ensureDir(dir);
      const fileName = this.latestFileName(urlPath);
      fs.writeFileSync(path.join(dir, fileName), JSON.stringify(body, null, 2));
      return fileName;
    } catch (err) {
      console.error(`[Recording] 儲存失敗 ${method} ${urlPath}:`, err);
      return null;
    }
  }

  // Fallback when no MSW handler matched: serve <folder>/latest.json if it exists.
  public getActiveResponse(_method: string, urlPath: string): any | null {
    const dir = this.dirFor(urlPath);
    if (!fs.existsSync(dir)) return null;
    const filePath = path.join(dir, this.latestFileName(urlPath));
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.error(`[Recording] 讀取失敗 ${filePath}:`, err);
      return null;
    }
  }

  // List paths that currently have a -latest.json snapshot.
  public listPaths(): Array<{ urlPath: string; latestFile: string }> {
    if (!fs.existsSync(this.mocksDir)) return [];
    const items: Array<{ urlPath: string; latestFile: string }> = [];
    const entries = fs.readdirSync(this.mocksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const latest = 'latest.json';
      if (fs.existsSync(path.join(this.mocksDir, entry.name, latest))) {
        items.push({ urlPath: `/${entry.name}`, latestFile: latest });
      }
    }
    return items;
  }
}
