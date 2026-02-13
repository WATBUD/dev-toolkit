#!/usr/bin/env node

import inquirer from "inquirer";
import chalk from "chalk";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 工具選項配置
const tools = [
  {
    name: `${chalk.blue("🔍 Check Domains")} - 檢查域名到期狀態`,
    value: "check-domains",
    script: "node/check-domain/check-domains.js",
    description: "檢查 domains.json 中所有域名的到期時間",
  },
  {
    name: `${chalk.green("🔄 HTTPS Proxy")} - HTTPS 到 HTTP 代理伺服器`,
    value: "proxy",
    script: "node/proxy-server/https-to-http-proxy.js",
    description: "啟動 HTTPS 到 HTTP 的代理伺服器",
  },
  {
    name: `${chalk.yellow("🔄 HTTPS Proxy v2")} - HTTPS 到 HTTP 代理伺服器 (版本2)`,
    value: "proxy-v2",
    script: "node/proxy-server/https-to-http-proxy-2.js",
    description: "啟動 HTTPS 到 HTTP 的代理伺服器 (進階版本)",
  },
  {
    name: chalk.gray("❌ Exit"),
    value: "exit",
    description: "退出工具選單",
  },
];

// 執行腳本
function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(chalk.cyan(`\n▶️  執行中: ${scriptPath}\n`));
    console.log(chalk.gray("─".repeat(60)));

    const fullPath = join(__dirname, scriptPath);
    const child = spawn("node", [fullPath], {
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      console.log(chalk.gray("─".repeat(60)));
      if (code === 0) {
        console.log(chalk.green(`\n✅ 執行完成\n`));
        resolve();
      } else {
        console.log(chalk.red(`\n❌ 執行失敗 (exit code: ${code})\n`));
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      console.log(chalk.red(`\n❌ 執行錯誤: ${error.message}\n`));
      reject(error);
    });
  });
}

// 顯示歡迎訊息
function showWelcome() {
  console.clear();
  console.log(chalk.bold.cyan("\n╔════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║                                        ║"));
  console.log(chalk.bold.cyan("║        🛠️  Dev Toolkit CLI 🛠️         ║"));
  console.log(chalk.bold.cyan("║                                        ║"));
  console.log(chalk.bold.cyan("╚════════════════════════════════════════╝\n"));
  console.log(chalk.gray("  開發工具集合 - 互動式選單\n"));
}

// 主選單
async function showMainMenu() {
  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "tool",
      message: chalk.bold("請選擇要執行的工具:"),
      choices: tools.map((t) => ({ name: t.name, value: t.value })),
      pageSize: 10,
    },
  ]);

  return answer.tool;
}

// 確認是否繼續
async function askContinue() {
  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "continue",
      message: chalk.bold("是否要繼續使用其他工具?"),
      default: true,
    },
  ]);

  return answer.continue;
}

// 主程式
async function main() {
  showWelcome();

  let continueLoop = true;

  while (continueLoop) {
    try {
      const selectedTool = await showMainMenu();

      if (selectedTool === "exit") {
        console.log(chalk.cyan("\n👋 再見！\n"));
        process.exit(0);
      }

      const tool = tools.find((t) => t.value === selectedTool);

      if (tool && tool.script) {
        await runScript(tool.script);
        continueLoop = await askContinue();

        if (continueLoop) {
          showWelcome();
        }
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ 發生錯誤: ${error.message}\n`));
      continueLoop = await askContinue();

      if (continueLoop) {
        showWelcome();
      }
    }
  }

  console.log(chalk.cyan("\n👋 再見！\n"));
  process.exit(0);
}

// 錯誤處理
process.on("SIGINT", () => {
  console.log(chalk.cyan("\n\n👋 已取消，再見！\n"));
  process.exit(0);
});

process.on("unhandledRejection", (error) => {
  console.error(chalk.red(`\n❌ 未處理的錯誤: ${error.message}\n`));
  process.exit(1);
});

// 啟動
main();
