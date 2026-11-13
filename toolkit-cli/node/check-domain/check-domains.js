import fs from "fs";
import whois from "whois-json";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// domains.json（你的網域清單）與 domain-result.json（檢查結果）都只存在本機、不進版控。
// 第一次執行時若沒有 domains.json，會從 domains.example.json 複製一份讓你填。
const FILE_PATH = join(__dirname, "./domains.json");
const EXAMPLE_PATH = join(__dirname, "./domains.example.json");
const OUTPUT_PATH = join(__dirname, "./domain-result.json");

async function checkDomain(domain) {
  try {
    const data = await whois(domain);

    const expiryRaw =
      data.registryExpiryDate ||
      data.expiryDate ||
      data["Registry Expiry Date"] ||
      null;

    if (!expiryRaw) {
      return {
        domain,
        status: "UNKNOWN",
        message: "No expiry date found",
      };
    }

    const expiryDate = new Date(expiryRaw);
    const now = new Date();

    return {
      domain,
      expiryDate: expiryDate.toISOString(),
      expired: expiryDate < now,
      daysLeft: Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)),
    };
  } catch (err) {
    return {
      domain,
      status: "ERROR",
      message: err.message,
    };
  }
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.copyFileSync(EXAMPLE_PATH, FILE_PATH);
    console.log(`已建立 ${FILE_PATH}（從 domains.example.json 複製）。`);
    console.log("請把要檢查的網域填進去後再執行一次。");
    return;
  }
  const file = fs.readFileSync(FILE_PATH, "utf-8");
  const json = JSON.parse(file);

  if (!json.domains || !Array.isArray(json.domains)) {
    console.error("Invalid JSON format. Expected { domains: [] }");
    return;
  }

  const results = [];

  for (const domain of json.domains) {
    console.log(`Checking ${domain}...`);
    const result = await checkDomain(domain);
    results.push(result);
  }

  console.log("\n=== RESULT ===");
  console.table(results);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main();
