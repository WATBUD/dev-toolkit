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
├── domains.json
├── domain-result.json (generated)
└── README.md
```

---

## 📝 domains.json Format

Create a `domains.json` file:

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
