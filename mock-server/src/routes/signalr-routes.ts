import { Request, Response, Router } from 'express';
import { SignalRService } from '../services/signalr-service';

export interface NegotiateResponse {
  connectionId: string;
  connectionToken: string;
  negotiateVersion: number;
  availableTransports: Array<{
    transport: string;
    transferFormats: string[];
  }>;
}

export class SignalRRoutes {
  private router: Router;
  private signalRService: SignalRService;

  constructor(signalRService: SignalRService) {
    this.router = Router();
    this.signalRService = signalRService;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.router.post('/chat/negotiate', this.negotiate.bind(this));
    this.router.post('/api/broadcast', this.broadcast.bind(this));
    this.router.get('/health', this.health.bind(this));
  }

  private negotiate(_req: Request, res: Response): void {
    const connectionId = this.signalRService.generateConnectionId();
    
    const negotiateResponse: NegotiateResponse = {
      connectionId: connectionId,
      connectionToken: connectionId,
      negotiateVersion: 1,
      availableTransports: [
        {
          transport: 'WebSockets',
          transferFormats: ['Text', 'Binary']
        },
        {
          transport: 'ServerSentEvents',
          transferFormats: ['Text']
        },
        {
          transport: 'LongPolling',
          transferFormats: ['Text', 'Binary']
        }
      ]
    };
    
    res.json(negotiateResponse);
  }

  private broadcast(req: Request, res: Response): void {
    const { method, data } = req.body;
    this.signalRService.broadcast(
      method || 'Broadcast', 
      data || { message: 'Test broadcast' }
    );
    
    res.json({ 
      success: true, 
      connections: this.signalRService.getConnectionCount() 
    });
  }

  private health(_req: Request, res: Response): void {
    res.json({ 
      status: 'ok', 
      connections: this.signalRService.getConnectionCount(),
      timestamp: new Date().toISOString()
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}