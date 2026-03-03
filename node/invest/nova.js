const axios = require("axios");

const url = "https://www.play.novax.game/History/getUfoBetHistoryData";

const headers = {
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  "x-requested-with": "XMLHttpRequest",
  "cookie": "貼你的完整cookie"
};

const csrf = "貼你的rf_cs_rForm_";

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
  console.log("總頁數:", totalPages);

  let all = [...firstPage.transactions];

  for (let i = 2; i <= totalPages; i++) {
    const data = await fetchPage(i);
    all.push(...data.transactions);
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
    const bet = Number(t.amount);
    const ret = Number(t.profit);
    const maxMulti = Number(t.maxmultiplier);

    totalBet += bet;
    totalReturn += ret;

    if (t.status === 1) winCount++;
    if (t.status === 2) lossCount++;

    const bucket = Math.floor(maxMulti);
    maxMultiplierStats[bucket] = (maxMultiplierStats[bucket] || 0) + 1;
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
  console.log(maxMultiplierStats);
}

run().catch(err => console.error(err));