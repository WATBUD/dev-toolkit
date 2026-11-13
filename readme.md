# Dev Toolkit 🛠️

多專案（multi-project）開發工具集。**各專案獨立**：有各自的 `package.json`、依賴與 `.gitignore`，不使用 npm workspaces（避免 lockfile 互相牽動）。

| 資料夾 | 內容 | 啟動 |
|---|---|---|
| [`toolkit-cli/`](toolkit-cli/readme.md) | 互動式 CLI：域名檢查、HTTPS 代理、投資分析腳本 | `npm run cli` |
| [`mock-server/`](mock-server) | 多專案 MSW mock server，支援上游錄製與回放；專案由 `.env` 的 `<SLOT>_PROJECT_ID` 決定 | `npm run mock` |
| [`api-tester/`](api-tester/README.md) | 本機 Postman 類 API 測試工具（零依賴、無 CORS、資料存本機 `data/`） | `npm run tester` |

## 快速開始

```bash
npm run install:all   # 安裝 toolkit-cli 與 mock-server 的依賴（api-tester 零依賴）
npm run cli           # 或 mock / tester
```

也可以直接進各資料夾操作，例如 `cd mock-server && npm run dev`。

## 注意事項

- `mock-server/.env`（上游網址）、`api-tester/data/`（token、密碼）都已被各自的 `.gitignore` 排除，請勿 `git add -f`
- `mock-server` 只有共用程式與 `_example` 範例進版控；真實 API handler、錄製資料、`projects` 設定都不進版控（見 `mock-server/.env.example`）
- 舊的獨立 `mock-server` repo 歷史（含錄製資料）刻意**沒有**併入，請勿把它 merge 進來
- VSCode 任務與快捷鍵（`Cmd+1`、`Cmd+6`）見 `.vscode/tasks.json`，路徑已指向 `toolkit-cli/`
