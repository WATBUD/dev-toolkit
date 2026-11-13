import express, { Application, Request, Response, NextFunction } from "express";
import http, { Server } from "http";
import path from "path";
import cors from "cors";
import {
  createProxyMiddleware,
  responseInterceptor,
  fixRequestBody,
} from "http-proxy-middleware";
import { setupMiddleware, setupApiTracking } from "../middleware";
import { MainRoutes } from "../routes/main-routes";
import { SignalRService } from "./signalr-service";
import { SignalRRoutes } from "../routes/signalr-routes";
import { FileGenerator } from "../utils/file-generator";
import { RecordingService } from "./recording-service";
import { loadProjectHandlers } from "../handlers";

export interface ServerServiceOptions {
  projectId: string;
  port: number;
  websocketPort: number;
  proxyPort: number;
  targetUrl?: string;
  config: any;
}

export class ServerService {
  private app: Application;
  private server: Server;
  private signalRApp: Application;
  private signalRServer: Server;
  private proxyApp: Application;
  private proxyServer: Server;
  private fileGenerator: FileGenerator;
  private recordingService: RecordingService;
  private recordEnabled: boolean;
  private projectId: string;
  private port: number;
  private websocketPort: number;
  private proxyPort: number;
  private targetUrl?: string;
  private mocksDir: string;
  private logTag: string;
  private config: any;

  constructor(opts: ServerServiceOptions) {
    this.projectId = opts.projectId;
    this.port = opts.port;
    this.websocketPort = opts.websocketPort;
    this.proxyPort = opts.proxyPort;
    this.targetUrl = opts.targetUrl;
    this.config = opts.config;
    this.logTag = `[${this.projectId}]`;
    this.mocksDir = path.join(__dirname, "..", "mocks", this.projectId);

    this.app = express();
    this.server = http.createServer(this.app);
    this.signalRApp = express();
    this.signalRServer = http.createServer(this.signalRApp);
    this.proxyApp = express();
    this.proxyServer = http.createServer(this.proxyApp);
    this.fileGenerator = new FileGenerator(this.mocksDir);
    this.recordingService = new RecordingService(this.mocksDir, this.config);
    this.recordEnabled = process.env.RECORD_RESPONSES !== "false";

    this.setupMainServer();
    this.setupSignalRServer();
    this.setupProxyServer();
    this.setupRecordingFallback();
    if (this.targetUrl) {
      this.setupProxyFallback();
    } else {
      this.setup404Handler();
    }
  }

  private setupMainServer(): void {
    setupMiddleware(this.app);
    setupApiTracking(this.app);
    this.app.use(this.stripApiPrefix);
    this.setupRecordingAdminRoutes();
    this.setupShadowRecording();

    if (!this.config.useLatestResponse) {
      const handlers = loadProjectHandlers(this.projectId);
      const mainRoutes = new MainRoutes(this.projectId, handlers);
      this.app.use(mainRoutes.getRouter());
    }
  }

  private stripApiPrefix(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    if (req.url.startsWith("/api/")) {
      req.url = req.url.substring(4);
    } else if (req.url === "/api") {
      req.url = "/";
    }
    next();
  }

  // 資料夾名一律用帶 /api 的原始 URL（stripApiPrefix 之前），
  // msw 比對則用去掉 /api 的 path，兩者不能混。
  private folderUrlOf(req: any): string {
    return req.originalUrl || req.url || "/";
  }

  private setupShadowRecording(): void {
    if (!this.targetUrl || !this.recordEnabled) return;
    console.log(
      `${this.logTag} 👁  Shadow 錄製: 每次 API 呼叫都會背景打 upstream 並更新 ${this.projectId}/<kebab>/latest.json`,
    );
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      if (this.config.useLatestResponse || this.shouldSkipShadow(req.path)) {
        next();
        return;
      }
      void this.shadowRecord(req);
      next();
    });
  }

  private shouldSkipShadow(p: string): boolean {
    return (
      p === "/" ||
      p === "/api-use-count" ||
      p === "/favicon.ico" ||
      p.startsWith("/__recordings")
    );
  }

  private async shadowRecord(req: Request): Promise<void> {
    if (!this.targetUrl) return;
    const url = `${this.targetUrl}${req.url}`;

    const headers: Record<string, string> = {};
    const skip = new Set([
      "host",
      "connection",
      "content-length",
      "accept-encoding",
    ]);
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string" && !skip.has(k.toLowerCase())) {
        headers[k] = v;
      }
    }

    const init: RequestInit = { method: req.method, headers };
    const hasBody =
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.body !== undefined &&
      req.body !== null;
    if (hasBody) {
      const ct = (headers["content-type"] || "").toLowerCase();
      if (typeof req.body === "string") {
        init.body = req.body;
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        init.body = new URLSearchParams(
          req.body as Record<string, string>,
        ).toString();
      } else {
        init.body = JSON.stringify(req.body);
        if (!headers["content-type"])
          headers["content-type"] = "application/json";
      }
    }

    try {
      const response = await fetch(url, init);
      const ct = response.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        console.warn(
          `${this.logTag} ⚠️  [Shadow] ${req.method} ${req.path} <- ${response.status} 非 JSON (${ct})，不錄製`,
        );
        return;
      }
      const data = await response.json();
      const saved = this.recordingService.save(
        req.method,
        this.folderUrlOf(req),
        response.status,
        data,
        ct,
      );
      if (saved) {
        console.log(
          `${this.logTag} [Shadow] ${req.method} ${req.path} <- ${response.status} -> ${saved}`,
        );
        this.maybeGenerateHandler(
          req.method,
          this.folderUrlOf(req),
          req.path,
          response.status,
          data,
        );
      }
    } catch (err) {
      console.warn(
        `${this.logTag} [Shadow] ${req.method} ${req.path} 失敗:`,
        (err as Error).message,
      );
    }
  }

  private setupRecordingAdminRoutes(): void {
    const router = express.Router();

    router.get("/__recordings", (_req, res) => {
      res.json({
        project: this.projectId,
        enabled: this.recordEnabled,
        items: this.recordingService.listPaths(),
      });
    });

    this.app.use(router);
  }

  // 錄到還沒有 handler 的 endpoint 時，順手生一份 <kebab>/<kebab>.ts + normal.json，
  // 之後就能離線回放、也能直接在上面加分支邏輯。已存在的 handler 不會被覆蓋。
  private maybeGenerateHandler(
    method: string,
    folderUrl: string,
    routePath: string,
    status: number,
    body: any,
  ): void {
    // 只用成功的回應當種子，避免把 401 / 500 寫成預設 mock。
    if (status >= 400) return;
    try {
      const result = this.fileGenerator.generateHandler({
        method,
        folderUrl,
        routePath,
        body,
      });
      if (result.created) {
        console.log(
          `${this.logTag} [Generator] 新 endpoint ${method} ${routePath} -> 已生成 ${result.handlerFile} + normal.json`,
        );
      }
    } catch (err) {
      console.warn(
        `${this.logTag} [Generator] 生成 handler 失敗 ${method} ${routePath}:`,
        (err as Error).message,
      );
    }
  }

  private setupRecordingFallback(): void {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (this.config.useLatestResponse) {
        next();
        return;
      }
      const body = this.recordingService.getActiveResponse(
        req.method,
        this.folderUrlOf(req),
      );
      if (body === null) {
        next();
        return;
      }
      console.log(`${this.logTag} [Recording] 回放 ${req.method} ${req.path}`);
      res.json(body);
    });
  }

  private setupProxyFallback(): void {
    if (!this.targetUrl) return;

    console.log(
      `${this.logTag} 🪝 主伺服器 fallback 代理目標: ${this.targetUrl}`,
    );
    console.log(
      `${this.logTag} 📼 主伺服器自動錄製: ${this.recordEnabled ? "開啟" : "關閉"}`,
    );

    this.app.use(
      createProxyMiddleware({
        target: this.targetUrl,
        changeOrigin: true,
        selfHandleResponse: this.recordEnabled,
        logger: console,
        on: {
          proxyReq: (proxyReq, req, _res) => {
            // Force uncompressed upstream responses.
            // responseInterceptor may not handle all encodings (e.g. zstd),
            // causing compressed bytes to be returned as plain text.
            proxyReq.setHeader("accept-encoding", "identity");
            console.log(
              `${this.logTag} [Fallback Proxy] ${req.method} ${req.url} -> ${this.targetUrl}${req.url}`,
            );
            fixRequestBody(proxyReq, req as any);
          },
          proxyRes: this.recordEnabled
            ? responseInterceptor(async (buffer, proxyRes, req, _res) => {
                const status = proxyRes.statusCode || 200;
                const contentType = (
                  proxyRes.headers["content-type"] || ""
                ).toString();
                const isJson = contentType.includes("application/json");

                if (!isJson) {
                  console.warn(
                    `${this.logTag} ⚠️  [Fallback Proxy] ${req.method} ${req.url} <- ${status} 非 JSON (${contentType})，不錄製`,
                  );
                } else {
                  console.log(
                    `${this.logTag} [Fallback Proxy] ${req.method} ${req.url} <- ${status}`,
                  );
                }

                if (isJson && buffer && buffer.length > 0) {
                  try {
                    const body = JSON.parse(buffer.toString("utf8"));
                    const saved = this.recordingService.save(
                      req.method || "GET",
                      this.folderUrlOf(req),
                      status,
                      body,
                      contentType,
                    );
                    if (saved) {
                      console.log(
                        `${this.logTag} [Recording] 已保存 ${req.method} ${req.url} -> ${saved}`,
                      );
                      this.maybeGenerateHandler(
                        req.method || "GET",
                        this.folderUrlOf(req),
                        req.url || "/",
                        status,
                        body,
                      );
                    }
                  } catch (err) {
                    console.warn(
                      `${this.logTag} [Recording] 無法解析 JSON ${req.url}:`,
                      (err as Error).message,
                    );
                  }
                }
                return buffer;
              })
            : (proxyRes, req, _res) => {
                console.log(
                  `${this.logTag} [Fallback Proxy] ${req.method} ${req.url} <- ${proxyRes.statusCode} (no record)`,
                );
              },
          error: (err, req, res) => {
            console.error(
              `${this.logTag} [Fallback Proxy Error] ${req.method} ${req.url}:`,
              err.message,
            );
            if (
              res &&
              "writeHead" in res &&
              "headersSent" in res &&
              !res.headersSent
            ) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Upstream error",
                  message: err.message,
                }),
              );
            }
          },
        },
      }),
    );
  }

  private setupSignalRServer(): void {
    this.signalRApp.use(
      cors({
        origin: [
          "http://localhost:4200",
          "http://localhost:4201",
          "http://localhost:5000",
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "x-requested-with",
          "x-signalr-user-agent",
        ],
        credentials: true,
      }),
    );
    this.signalRApp.use(express.json());
    this.signalRApp.use(express.text());

    const signalRService = new SignalRService(this.signalRServer, "/chat");
    const signalRRoutes = new SignalRRoutes(signalRService);
    this.signalRApp.use(signalRRoutes.getRouter());
  }

  private setupProxyServer(): void {
    this.proxyApp.use(this.stripApiPrefix);
    this.proxyApp.use(
      cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "x-requested-with"],
        credentials: true,
      }),
    );

    if (this.targetUrl) {
      this.proxyApp.use(
        "/",
        createProxyMiddleware({
          target: this.targetUrl,
          changeOrigin: true,
          selfHandleResponse: this.recordEnabled,
          logger: console,
          on: {
            proxyReq: (proxyReq, req, _res) => {
              proxyReq.setHeader("accept-encoding", "identity");
              console.log(
                `${this.logTag} [Proxy] ${req.method} ${req.url} -> ${this.targetUrl}${req.url}`,
              );
              fixRequestBody(proxyReq, req as any);
            },
            proxyRes: this.recordEnabled
              ? responseInterceptor(async (buffer, proxyRes, req, _res) => {
                  const status = proxyRes.statusCode || 200;
                  const contentType = (
                    proxyRes.headers["content-type"] || ""
                  ).toString();
                  console.log(
                    `${this.logTag} [Proxy] ${req.method} ${req.url} <- ${status}`,
                  );

                  const isJson = contentType.includes("application/json");
                  const isSuccess = status >= 200 && status < 300;
                  if (isJson && isSuccess && buffer && buffer.length > 0) {
                    try {
                      const body = JSON.parse(buffer.toString("utf8"));
                      const saved = this.recordingService.save(
                        req.method || "GET",
                        this.folderUrlOf(req),
                        status,
                        body,
                        contentType,
                      );
                      if (saved) {
                        console.log(
                          `${this.logTag} [Recording] 已保存 ${req.method} ${req.url} -> ${saved}`,
                        );
                      }
                    } catch (err) {
                      console.warn(
                        `${this.logTag} [Recording] 無法解析 JSON ${req.url}:`,
                        (err as Error).message,
                      );
                    }
                  }
                  return buffer;
                })
              : (_proxyRes, req, _res) => {
                  console.log(
                    `${this.logTag} [Proxy] ${req.method} ${req.url} <- (no record)`,
                  );
                },
            error: (err, req, res) => {
              console.error(
                `${this.logTag} [Proxy Error] ${req.method} ${req.url}:`,
                err.message,
              );
              if (
                res &&
                "writeHead" in res &&
                "headersSent" in res &&
                !res.headersSent
              ) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: "Proxy error",
                    message: err.message,
                  }),
                );
              }
            },
          },
        }),
      );
    } else {
      this.proxyApp.use("/", (_req, res) => {
        res.status(200).json({
          project: this.projectId,
          message: "反向代理伺服器已啟動",
          note: `請設定 ${this.projectId.toUpperCase()}_TARGET_URL 環境變數來指定代理目標`,
          example: `${this.projectId.toUpperCase()}_TARGET_URL=https://api.example.com`,
        });
      });
    }
  }

  private setup404Handler(): void {
    this.app.use((req, res, _next) => {
      try {
        const response = this.fileGenerator.generateMockFiles(req);
        res.status(404).send(response);
      } catch (error) {
        console.error(`${this.logTag} 檔案生成錯誤:`, error);
        res.status(500).send("無法生成檔案");
      }
    });
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(
        `${this.logTag} ⚡️ 主伺服器執行於 http://localhost:${this.port}`,
      );
      console.log(
        `${this.logTag} 📼 錄製管理: GET http://localhost:${this.port}/__recordings`,
      );
      if (this.targetUrl) {
        console.log(
          `${this.logTag} 💡 對 ${this.port} 打沒處理過的 API 會自動 forward + 錄製，下次直接回放`,
        );
      }
    });

    this.signalRServer.listen(this.websocketPort, () => {
      console.log(
        `${this.logTag} 🔗 SignalR 伺服器執行於 http://localhost:${this.websocketPort}`,
      );
      console.log(
        `${this.logTag} 🔗 SignalR WebSocket 端點: ws://localhost:${this.websocketPort}/chat`,
      );
    });

    this.proxyServer.listen(this.proxyPort, () => {
      console.log(
        `${this.logTag} 🔄 純代理伺服器執行於 http://localhost:${this.proxyPort}（可選）`,
      );
      if (this.targetUrl) {
        console.log(`${this.logTag} 🎯 代理目標: ${this.targetUrl}`);
      }
    });
  }

  public stop(): void {
    this.server.close(() => {
      console.log(`${this.logTag} 主伺服器已關閉`);
    });
    this.signalRServer.close(() => {
      console.log(`${this.logTag} SignalR 伺服器已關閉`);
    });
    this.proxyServer.close(() => {
      console.log(`${this.logTag} 反向代理伺服器已關閉`);
    });
  }
}
