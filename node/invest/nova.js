const axios = require("axios");

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
  console.log("開始抓資料...");

  const firstPage = await fetchPage(1);

  const totalPages = extractTotalPages(firstPage.pagination);
  const recordsPerPage = firstPage.transactions.length;
  console.log("總頁數:", totalPages);
  console.log("每頁筆數:", recordsPerPage);

  // 初始化資料並記錄來源頁碼
  let all = firstPage.transactions.map(t => ({ ...t, sourcePage: 1 }));

  for (let i = 2; i <= totalPages; i++) {
    const data = await fetchPage(i);
    all.push(...data.transactions.map(t => ({ ...t, sourcePage: i })));
    console.log(`抓到第 ${i} 頁`);
    await new Promise(r => setTimeout(r, 400));
  }

  console.log("總筆數:", all.length);

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

  console.log("\n====== 統計結果 ======");
  console.log("總下注:", totalBet.toFixed(4));
  console.log("總回收:", totalReturn.toFixed(4));
  console.log("淨利潤:", netProfit.toFixed(4));
  console.log("RTP:", (rtp * 100).toFixed(2) + "%");
  console.log("勝率:", (winRate * 100).toFixed(2) + "%");
  console.log("輸場數:", lossCount);

  console.log("\n====== Crash倍率分布 (maxmultiplier) ======");
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
  console.table(sortedStats);
}

run().catch(err => console.error(err));