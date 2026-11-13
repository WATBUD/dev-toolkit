# Dev Toolkit 🛠️

這是一個專門為開發流程設計的工具集合 (Monorepo)，包含域名檢查、HTTPS 代理伺服器等實用功能。

---

## 🚀 快速啟動 (互動式選單)

我們提供了一個熱鍵與跨平台選單，讓你不需要記下各種繁瑣的指令：

1. **安裝依賴** (第一次使用時):
   ```bash
   npm install
   ```
2. **啟動互動式 CLI**:
   ```bash
   npm start
   ```

或是直接使用 **VSCode 快捷鍵**: `Cmd+1` (需按照下方設定)

---

## 📦 工具列表

### 1. 🔍 Check Domains (域名檢查)

- **路徑**: `node/check-domain/`
- **功能**: 讀取 `domains.json` 並透過 WHOIS 檢查域名剩餘天數。
- **輸出**: 生成 `domain-result.json` 並在終端機顯示表格。

### 2. 🔄 HTTPS Proxy (HTTPS 代理)

- **路徑**: `node/proxy-server/`
- **功能**: 使用 mkcert 證書將本地 HTTPS 請求轉發至指定 HTTP 端口。
- **範例**: `https://app.example.com` -> `http://localhost:3002`

---

## ⌨️ VSCode 整合

本專案已深度整合 VSCode Tasks，建議設定快捷鍵以獲得最佳體驗。

### 快捷鍵設定建議

1. 按 `Cmd+Shift+P` 開啟命令面板。
2. 輸入 `Preferences: Open Keyboard Shortcuts (JSON)`。
3. 貼上以下設定 (參考 `.vscode/keybindings.json`):

```json
[
  {
    "key": "cmd+1",
    "command": "workbench.action.tasks.runTask",
    "args": "Dev Toolkit CLI"
  }
]
```

### 可用任務 (Tasks)

- `Dev Toolkit CLI`: 啟動互動式選單 (推薦)
- `check-domains`: 直接執行域名檢查

---

## 🛠️ 開發與擴充

如果你想新增工具：

1. 在 `node/` 目錄下建立新資料夾。
2. 在 `cli.js` 的 `tools` 陣列中新增選項。
3. 確保你的腳本可以使用 `node path/to/script.js` 獨立執行。

---

## 📄 License

Internal Use Only
