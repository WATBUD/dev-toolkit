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
- 匯入 curl（支援 Chrome「Copy as cURL」）、複製成 curl、集合/環境匯出入 JSON
- **資料存在本機 `test-data/` 資料夾**（已加入 `.gitignore`），不再依賴瀏覽器儲存，換 port / 換瀏覽器 / 清瀏覽器資料都不會遺失

## 資料存放（`test-data/`）

整個 `test-data/` 資料夾已被 `.gitignore` 排除，不會進版控；**每個使用者第一次啟動時會在自己的電腦自動建立**，裡面的請求、歷史、環境變數都只存在本機。**每個 API 請求是一個純 curl 檔（`.curl`）**，可以直接 `bash 檔名.curl` 執行：

```
test-data/
├── bo/                          ← 分組（= 介面裡的「集合」）
│   ├── _collection.json         分組設定（登入請求、token 的 header 名稱…），唯一的 JSON 檔
│   ├── GetRSAPublicKey.curl     一個請求一個檔
│   └── Login.curl
├── _history/                    送出歷史（滾動保留最近 60 筆，也是 .curl）
├── environments.json            環境變數（含 🔒 機密）  ← 最敏感
├── session.json                 開著的分頁
└── .trash/<時間>/…              被刪除的請求檔會先搬到這裡，不直接刪除
```

請求檔就是一段 curl，例如從 Chrome「Copy as cURL」直接存下來：

```bash
curl -X GET 'http://host/api/AppService/GetRSAPublicKey' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Language: id'
```

curl 表達不了的資訊（全部選填）寫在檔案**開頭的註解**，對 bash 來說只是普通註解：

```bash
# @name 取得公鑰
# @extract accessToken -> token     回應 JSON 欄位 → 環境變數
# @auth collection                  集合共用 token（或 bearer）
# @bodytype json                    json | text | form | none
curl -X POST '{{baseUrl}}/api/AppService/Login' ...
```

- 沒有任何註解也可以；請求名稱省略時用檔名
- `{{變數}}` 會原樣保留；要實際執行請用介面上的「curl」按鈕複製已代入變數的版本
- 位置可用 `DATA_DIR=/path npm start` 指定；資料夾權限 700、檔案 600
- **只有「有未存變更」的檔案才會被寫入**：你手動編輯、介面沒動到的檔案不會被覆蓋
- **切回瀏覽器時會自動重新讀取資料夾**：新增 / 修改 / 刪除 curl 檔都會即時反映（有未存修改或對話框開著時會先跳過，下次切回再讀）；環境變數（`environments.json`）不在此列，改了要重新整理
- 在介面裡改過某個請求再存，該檔會被改寫成「註解 + 整理過的 curl」；沒動過的檔保持原樣
- **空檔案**（先建好檔名再貼內容）會被忽略且保持原樣；無法解析的檔案原樣保留，不會被修改或刪除
- 刪除請求一律先進 `.trash/`
- 同時開兩個分頁會互相覆蓋（後存者勝），建議單一分頁操作

## RSA 登入流程用法
1. 在 `test-data/<分組>/` 放登入的 curl 檔（body 的密碼欄位寫 `{{$rsa(password)}}`，網址與帳號用 `{{baseUrl}}`、`{{account}}`…），再到右上環境「編輯」填入這些變數（`password` 勾 🔒）
2. 送出「登入」：先 GET `rsaKeyUrl` 取公鑰 → 加密 `password` → 填入 `EncryptedPassword` → 擷取 `accessToken` 為 `{{token}}`
3. 其他請求 Auth 選「集合共用」；token 的 header 名稱、前綴、是否同時寫 Cookie 在集合 ⚙ 設定（預設是 `Authorization` + `Bearer `；後台若用 `Access-Token` 就改 header 名稱並把前綴清空，需要同時帶 Cookie 就填 Cookie 名稱如 `authKey`）

## 安全
- 只綁 `127.0.0.1`
- `/proxy` 會檢查 Host / Origin 並要求 `application/json`，避免其他網站透過你的瀏覽器濫用
- 加密的明文只在本機 loopback 傳給 `/crypto/rsa`，不記 log
- `test-data/` 內是**明文檔案**（含機密變數、token，以及請求 curl 裡可能寫的 Cookie / Authorization）：已被 `.gitignore` 排除，但請勿手動 `git add -f`、也別把資料夾放到雲端同步目錄
- 機密變數用介面「匯出」時會清空值；但 Header / Body 裡的敏感值不會，分享前請先檢查

## 限制
- 不支援 multipart 檔案上傳（`-F`）
- 不處理自簽憑證（https 驗證失敗會回錯誤）
- 單次回應上限 50MB、逾時 30 秒
