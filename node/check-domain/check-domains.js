import fs from "fs";
import whois from "whois-json";

const FILE_PATH = "./domains.json";
const OUTPUT_PATH = "./domain-result.json";

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
