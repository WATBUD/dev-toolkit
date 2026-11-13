### **使用方法**

1. 確認 **hosts** 有設定：

```
127.0.0.1 url
```

2. 確認 mkcert 生成的憑證路徑正確：

```
C:/mkcert/url.pem
C:/mkcert/url-key.pem
```

3. 確保本地服務 `3002` 正在運行

4. 運行 Node.js 檔案：

```bash
node https-to-http-proxy.js
```

5. 打開 Chrome：

```
https://url/dashboard
```

✅ 自動跳轉到：

```
http://localhost:3002/dashboard
```

