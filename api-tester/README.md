# API 測試工具

本機 Postman 類工具，零依賴（只需 Node >= 18）。

```bash
npm start            # http://127.0.0.1:5757
PORT=6000 npm start  # 換 port
```

- 請求由本機 server 的 `/proxy` 代發，瀏覽器只打同源，**不受 CORS 限制**
- 分頁式請求、Params / Headers / Body(JSON、Text、form) / Auth(Bearer、Basic)
- 集合、歷史、環境變數 `{{var}}`（可標 🔒 機密：輸入遮罩、匯出不帶值）
- **Extract**：請求送出後自動從回應 JSON 擷取欄位存成環境變數（如 `accessToken → token`）
- **`{{$rsa(變數名)}}`**：送出時自動 GET 公鑰（環境變數 `rsaKeyUrl`）並以 RSA PKCS#1 v1.5 加密該變數，每次重新加密
- **集合共用 Auth**：集合 ⚙ 設定登入請求與 token header；請求 Auth 選「集合共用」，收到 401 自動重登一次再重送
- **Runner**：集合旁 ▶ 依序執行（登入先跑，擷取值傳給後續），任一步失敗即中止
- 集合頁的「登入範本」一鍵建立 RSA 登入流程骨架（不含任何帳密）
- 匯入 curl（支援 Chrome「Copy as cURL」）、複製成 curl、集合/環境匯出入 JSON
- **資料存在本機 `data/` 資料夾**（已加入 `.gitignore`），不再依賴瀏覽器儲存，換 port / 換瀏覽器 / 清瀏覽器資料都不會遺失

## 資料存放
```
data/
├── collections.json   集合與請求
├── environments.json  環境變數（含 🔒 機密、token）  ← 最敏感
├── history.json       送出歷史
└── session.json       開著的分頁
```
- 位置可用 `DATA_DIR=/path npm start` 指定；資料夾權限 700、檔案 600（只有本機使用者可讀寫）
- **首次啟動**若 `data/` 是空的，會自動把瀏覽器 localStorage 裡的舊資料搬過來一次（不會刪除瀏覽器裡的原資料）
- 要分享集合只給 `collections.json`；`environments.json` 與 `history.json` 可能含 token / 密碼，請勿分享
- 存檔採「先寫暫存再 rename」；若讀到損毀的 JSON，頁面會顯示錯誤並**停用儲存**，避免用空資料覆蓋
- 只有「有未存變更」時才會寫入，所以你手動編輯 `data/*.json`（重新整理頁面即生效）不會被舊頁面蓋掉
- 同時開兩個分頁會互相覆蓋（後存者勝），建議單一分頁操作

## RSA 登入流程用法
1. 集合頁按「登入範本」→ 右上環境「編輯」填 `baseUrl`、`shortName`、`account`、`password`（🔒）
2. 送出「登入」：先 GET `rsaKeyUrl` 取公鑰 → 加密 `password` → 填入 `EncryptedPassword` → 擷取 `accessToken` 為 `{{token}}`
3. 其他請求 Auth 選「集合共用」；token 的 header 名稱、前綴、是否同時寫 Cookie 在集合 ⚙ 設定（範本預設 `Access-Token`、無前綴、Cookie `authKey`）

## 安全
- 只綁 `127.0.0.1`
- `/proxy` 會檢查 Host / Origin 並要求 `application/json`，避免其他網站透過你的瀏覽器濫用
- 加密的明文只在本機 loopback 傳給 `/crypto/rsa`，不記 log
- `data/` 內是**明文 JSON**（含機密變數與 token）：已被 `.gitignore` 排除，但請勿手動 `git add -f`、也別把資料夾放到雲端同步目錄
- 機密變數用介面「匯出」時會清空值；但 Header / Body 裡的敏感值不會，分享前請先檢查

## 限制
- 不支援 multipart 檔案上傳（`-F`）
- 不處理自簽憑證（https 驗證失敗會回錯誤）
- 單次回應上限 50MB、逾時 30 秒
