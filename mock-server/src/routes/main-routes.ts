import { Router, Request, Response } from 'express';
import { createMiddleware } from '@mswjs/http-middleware';

export class MainRoutes {
  private router: Router;

  constructor(private projectId: string, private handlers: any[]) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.get('/', this.home.bind(this));
    if (this.handlers.length > 0) {
      this.router.use(createMiddleware(...this.handlers));
    }
  }

  private home(_req: Request, res: Response): void {
    res.send(`MSW 伺服器正在運行！(project=${this.projectId})`);
  }

  public getRouter(): Router {
    return this.router;
  }
}
