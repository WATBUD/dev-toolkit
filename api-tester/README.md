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
- **接著執行**：請求成功（且 Extract 都取到）後自動執行同集合的另一個請求，例如取 publicKey 的請求擷取 `data -> publicKey` 後接著執行 Login
- **集合共用 Auth**：集合 ⚙ 設定登入請求與 token header；請求 Auth 選「集合共用」，收到 401 自動重登一次再重送
- 匯入 curl（支援 Chrome「Copy as cURL」）、複製成 curl、集合/環境匯出入 JSON
- **資料存在本機 `test-data/` 資料夾**（已加入 `.gitignore`），不再依賴瀏覽器儲存，換 port / 換瀏覽器 / 清瀏覽器資料都不會遺失

## 資料存放（`test-data/`）

整個 `test-data/` 資料夾已被 `.gitignore` 排除，不會進版控；**每個使用者第一次啟動時會在自己的電腦自動建立**，裡面的請求、歷史、環境變數都只存在本機。**每個 API 請求是一個純 curl 檔（`.curl`）**，可以直接 `bash 檔名.curl` 執行：

```
test-data/
├── bo/                          ← 分組（= 介面裡的「集合」）
│   ├── _collection.json         分組設定（登入請求、token 的 header 名稱…），唯一的 JSON 檔
│   ├── GetPublicKey.curl        一個請求一個檔
│   └── Login.curl
├── _history/                    送出歷史（滾動保留最近 60 筆，也是 .curl）
├── environments.json            環境變數（含 🔒 機密）  ← 最敏感；每個集合在 _collection.json 指定用哪一個
├── session.json                 開著的分頁
└── .trash/<時間>/…              被刪除的請求檔會先搬到這裡，不直接刪除
```

請求檔就是一段 curl，例如從 Chrome「Copy as cURL」直接存下來：

```bash
curl -X GET 'http://host/api/AppService/GetPublicKey' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Language: id'
```

curl 表達不了的資訊（全部選填）寫在檔案**開頭的註解**，對 bash 來說只是普通註解：

```bash
# @name 登入
# @extract accessToken -> token     回應 JSON 欄位 → 環境變數
# @auth collection                  集合共用 token（或 bearer）
# @bodytype json                    json | text | form | none
# @next AdminInfo                   成功後接著執行同集合的請求
curl -X POST '{{baseUrl}}/api/AppService/Login' ...
```

- 沒有任何註解也可以；請求名稱省略時用檔名
- **環境是每個集合各自的**：集合標題旁的 🌐 選擇 / 新增這個集合用的環境，✎ 編輯變數（編輯視窗可「⧉ 複製成新環境」或「📋 複製到剪貼簿」，後者不含機密值）；送出請求時用它所屬集合的環境，Extract 也存進那個環境
- 點集合標題可**展開 / 收合**（狀態存在 `_collection.json`）
- 側欄可**拖曳**調整請求順序，或按集合上的排序鈕：**A⇅** → A→Z（**A↓**）→ Z→A（**A↑**）→ 還原排序前的順序；順序存在 `<分組>/_collection.json`，不會改動 curl 檔
- `{{變數}}` 會原樣保留；要實際執行請用介面上的「curl」按鈕複製已代入變數的版本
- 位置可用 `DATA_DIR=/path npm start` 指定；資料夾權限 700、檔案 600
- **只有「有未存變更」的檔案才會被寫入**：你手動編輯、介面沒動到的檔案不會被覆蓋
- **切回瀏覽器時會自動重新讀取資料夾**：新增 / 修改 / 刪除 curl 檔都會即時反映（有未存修改或對話框開著時會先跳過，下次切回再讀）；環境變數（`environments.json`）不在此列，改了要重新整理
- 在介面裡改過某個請求再存，該檔會被改寫成「註解 + 整理過的 curl」；沒動過的檔保持原樣
- **空檔案**（先建好檔名再貼內容）會被忽略且保持原樣；無法解析的檔案原樣保留，不會被修改或刪除
- 刪除請求一律先進 `.trash/`
- 同時開兩個分頁會互相覆蓋（後存者勝），建議單一分頁操作

## 集合共用 token
請求的 Auth 選「集合共用」，就會帶入環境變數 `{{token}}`；token 的 header 名稱、前綴、是否同時寫 Cookie 在集合 ⚙ 設定（預設是 `Authorization` + `Bearer `；後台若用 `Access-Token` 就改 header 名稱並把前綴清空，需要同時帶 Cookie 就填 Cookie 名稱如 `authKey`）。收到 401 會自動重跑集合設定的登入請求，再重送一次。

## 開發

```
server.js            本機 server：靜態檔、/proxy 轉發、test-data/ 讀寫
public/
├── index.html       只有版面
├── css/app.css
└── js/              依 index.html 的順序以一般 <script> 載入、共用同一個全域範圍（順序有意義）
    ├── state.js         小工具、狀態、存檔、變數代入
    ├── request-build.js URL ⇄ Params、組裝請求
    ├── send.js          送出、Extract、接著執行、自動重登、回應日誌
    ├── ui-request.js    分頁列、請求區、變數選單
    ├── ui-response.js   回應區、請求檢視
    ├── ui-sidebar.js    側欄、拖曳排序、集合設定、儲存
    ├── env.js           每個集合的環境
    ├── curl.js          curl 解析、匯入 / 複製 curl
    ├── files.js         .curl 檔 ⇄ 集合 / 歷史
    └── main.js          啟動、快捷鍵、切回瀏覽器時重新讀取
test/core.test.js    單元測試（curl 解析、.curl 來回、資料夾讀寫、變數、Extract）
```

```bash
npm test             # 零依賴，使用 Node 內建的 node --test
```

- 改了 `server.js` 要重啟 server 才會生效；只改 `public/` 底下的檔案重新整理頁面即可
- 新增 js 檔時記得加到 `index.html`，並放在它用到的檔案之後

## 安全
- 只綁 `127.0.0.1`
- `/proxy` 會檢查 Host / Origin 並要求 `application/json`，避免其他網站透過你的瀏覽器濫用
- `test-data/` 內是**明文檔案**（含機密變數、token，以及請求 curl 裡可能寫的 Cookie / Authorization）：已被 `.gitignore` 排除，但請勿手動 `git add -f`、也別把資料夾放到雲端同步目錄
- 機密變數用介面「匯出」時會清空值；但 Header / Body 裡的敏感值不會，分享前請先檢查

## 限制
- 不支援 multipart 檔案上傳（`-F`）
- 不處理自簽憑證（https 驗證失敗會回錯誤）
- 單次回應上限 50MB、逾時 30 秒
