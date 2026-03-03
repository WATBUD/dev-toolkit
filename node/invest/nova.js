const axios = require("axios");
const fs = require("fs");
const { Console } = require("console");
const path = require("path");

const url = "https://www.play.novax.game/History/getUfoBetHistoryData";

const headers = {
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  "cookie": "_ga=GA1.1.1299471446.1762332691; PHPSESSID=kbid2g9g7ru6c25shek3mii9mn; _ga_RXEE3PDDHF=GS2.1.s1772514542$o5$g1$t1772514810$j60$l0$h0"
};

const csrf = "fa102dc6461b3b791677d22b616bc15b";

async function fetchPage(page) {
  const params = new URLSearchParams();
  params.append("page", page);
  params.append("startfrom", "03-01-2026");
  params.append("startto", "03-03-2026");
  params.append("rf_cs_rForm_", csrf);

  const res = await axios.post(url, params, { headers });
  return res.data;
}

function extractTotalPages(paginationHtml) {
  const matches = paginationHtml.match(/Nextpage\("(\d+)"\)/g);
  if (!matches) return 1;

  const pages = matches.map(m => {
    const n = m.match(/"(\d+)"/);
    return n ? parseInt(n[1]) : 1;
  });

  return Math.max(...pages);
}

async function run() {
  const logFileName = `nova_report_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const logFilePath = path.join(__dirname, logFileName);
  const fileOutput = fs.createWriteStream(logFilePath);
  const logger = new Console({ stdout: process.stdout, stderr: process.stderr });
  
  // 自定義 log 函數，同時輸出到控制台和檔案
  function customLog(...args) {
    logger.log(...args);
    const line = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    ).join(' ') + '\n';
    fileOutput.write(line);
  }

  // 自定義 table 函數，將表格寫入檔案
  function customTable(data) {
    console.table(data); // 終端顯示
    
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    let tableText = '\n' + headers.join('\t') + '\n';
    tableText += '-'.repeat(headers.join('\t').length) + '\n';
    data.forEach(row => {
      tableText += headers.map(h => row[h]).join('\t') + '\n';
    });
    fileOutput.write(tableText + '\n');
  }

  customLog("開始抓資料...");

  const firstPage = await fetchPage(1);

  const totalPages = extractTotalPages(firstPage.pagination);
  const recordsPerPage = firstPage.transactions.length;
  customLog("總頁數:", totalPages);
  customLog("每頁筆數:", recordsPerPage);

  // 初始化資料並記錄來源頁碼
  let all = firstPage.transactions.map(t => ({ ...t, sourcePage: 1 }));

  for (let i = 2; i <= totalPages; i++) {
    const data = await fetchPage(i);
    all.push(...data.transactions.map(t => ({ ...t, sourcePage: i })));
    customLog(`抓到第 ${i} 頁`);
    await new Promise(r => setTimeout(r, 400));
  }

  customLog("總筆數:", all.length);

  // ===== 統計 =====
  let totalBet = 0;
  let totalReturn = 0;
  let winCount = 0;
  let lossCount = 0;
  let maxMultiplierStats = {};

  for (const t of all) {
    const parseNum = (val) => {
      if (typeof val === 'number') return val;
      return Number(String(val || 0).replace(/,/g, ''));
    };

    const bet = parseNum(t.amount);
    const ret = parseNum(t.profit);
    const maxMulti = parseNum(t.maxmultiplier);

    totalBet += bet;
    totalReturn += ret;

    if (t.status === 1) winCount++;
    if (t.status === 2) lossCount++;

    // 處理 NaN 並標記
    const bucket = isNaN(maxMulti) ? "Unknown" : maxMulti.toFixed(2);
    
    if (!maxMultiplierStats[bucket]) {
      maxMultiplierStats[bucket] = { count: 0, pages: new Set() };
    }
    maxMultiplierStats[bucket].count++;
    maxMultiplierStats[bucket].pages.add(t.sourcePage);
  }

  const rtp = totalReturn / totalBet;
  const winRate = winCount / all.length;
  const netProfit = totalReturn - totalBet;

  customLog("\n====== 統計結果 ======");
  customLog("總下注:", totalBet.toFixed(4));
  customLog("總回收:", totalReturn.toFixed(4));
  customLog("淨利潤:", netProfit.toFixed(4));
  customLog("RTP:", (rtp * 100).toFixed(2) + "%");
  customLog("勝率:", (winRate * 100).toFixed(2) + "%");
  customLog("輸場數:", lossCount);

  customLog("\n====== Crash倍率分布 (maxmultiplier) ======");
  let cumulativeCount = 0;
  const sortedStats = Object.keys(maxMultiplierStats)
    .sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return Number(a) - Number(b);
    })
    .map(key => {
      const { count, pages } = maxMultiplierStats[key];
      cumulativeCount += count;
      return {
        "倍率": key === "Unknown" ? "未知" : `${key}x`,
        "局數": count,
        "累計總局數": cumulativeCount,
        "來源頁數": Array.from(pages).sort((x, y) => x - y).join(", ")
      };
    });
  
  customTable(sortedStats);
  console.log(`\n✅ 報表已儲存至: ${logFilePath}`);
  fileOutput.end();
}

run().catch(err => console.error(err));