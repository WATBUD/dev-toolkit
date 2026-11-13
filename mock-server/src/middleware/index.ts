import cors from 'cors';
import express, { Application } from 'express';

export function setupMiddleware(app: Application): void {
  // CORS 設定
  app.use(cors());
  
  // JSON 和文字解析
  app.use(express.json());
  app.use(express.text());
}

export function setupApiTracking(app: Application): { apiUseCount: Record<string, { [path: string]: number }> } {
  const apiUseCount: Record<string, { [path: string]: number }> = {};

  // API 使用次數統計端點
  app.get("/api-use-count", (_req, res) => {
    res.json(apiUseCount);
  });

  // API 使用次數統計中間件
  app.use((req, _res, next) => {
    const pagePath = req.headers.referer || 'server-side';
    console.log(`[Request]: ${pagePath} ${req.url}`);
    if (apiUseCount[pagePath]) {
      apiUseCount[pagePath][req.url] = (apiUseCount[pagePath][req.url] || 0) + 1;
    } else {
      apiUseCount[pagePath] = { [req.url]: 1 };
    }
    next();
  });

  return { apiUseCount };
}