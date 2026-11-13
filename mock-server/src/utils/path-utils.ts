// 資料夾命名：完全照 API 實際大小寫，只把斜線去掉。
// /api/AppService/ActiveListBank        -> apiAppServiceActiveListBank
// /api/AppService/vip/GetRewardVipHistory -> apiAppServicevipGetRewardVipHistory
// 這樣資料夾名可以直接拿去 Chrome DevTools 搜尋。
export function urlToFolderName(url: string): string {
  return stripQuery(url)
    .split('/')
    .filter(Boolean)
    .join('');
}

// 由資料夾名產生合法的 JS identifier（handler / response 變數名用）。
export function toIdentifier(folderName: string): string {
  const cleaned = folderName.replace(/[^A-Za-z0-9_$]/g, '');
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

export function stripQuery(url: string): string {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.substring(0, idx);
}

export function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
