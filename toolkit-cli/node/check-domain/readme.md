# Domain Expiry Checker

A simple Node.js automation script to check domain expiration dates using WHOIS.

---

## 📦 Features

- Read domains from a JSON file
- Batch check domain expiration via WHOIS
- Detect expired domains
- Calculate remaining days
- Export results to JSON
- Console table output

---

## 🛠 Requirements

- Node.js 18+
- npm

---

## 📥 Installation

```bash
npm init -y
npm install whois-json
```

````

If using ES modules, add this to your `package.json`:

```json
{
  "type": "module"
}
```

---

## 📁 Project Structure

```
.
├── check-domains.js
├── domains.example.json   (範例，進版控)
├── domains.json           (你的網域清單，本機產生，不進版控)
├── domain-result.json     (檢查結果，本機產生，不進版控)
└── README.md
```

---

## 📝 domains.json Format

第一次執行時若沒有 `domains.json`，會自動從 `domains.example.json` 複製一份，填入你要檢查的網域後再執行一次。
`domains.json` 與 `domain-result.json` 都已被 `.gitignore` 排除，只存在你的電腦。

Format:

```json
{
  "domains": ["google.com", "example.com", "yourdomain.com"]
}
```

⚠️ JSON must contain:

```
{
  "domains": []
}
```

---

## ▶️ Usage

Run the script:

```bash
node check-domains.js
```

---

## 📊 Output Example

Console:

```
Checking google.com...
Checking example.com...

=== RESULT ===
┌─────────┬────────────────┬──────────────────────────┬─────────┬──────────┐
│ (index) │ domain         │ expiryDate               │ expired │ daysLeft │
├─────────┼────────────────┼──────────────────────────┼─────────┼──────────┤
│ 0       │ 'google.com'   │ '2028-09-14T04:00:00Z'   │ false   │ 950      │
└─────────┴────────────────┴──────────────────────────┴─────────┴──────────┘
```

Generated file:

```
domain-result.json
```

---

## 📌 Result Object Structure

```json
{
  "domain": "example.com",
  "expiryDate": "2026-05-01T04:00:00Z",
  "expired": false,
  "daysLeft": 365
}
```

---

## 🚀 Possible Improvements

- Add CLI argument for custom JSON file
- Add concurrency with Promise.all
- Add notification (Slack / Email / Telegram)
- Add cron job scheduling
- Add threshold alert (e.g. < 30 days)
- Add CSV export

---

## ⚠️ Notes

- WHOIS response format varies by registrar.
- Some domains may not return `expiryDate` consistently.
- Script handles multiple possible expiry date fields.

---

## 📄 License

MIT
````
