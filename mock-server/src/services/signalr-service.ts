import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';

export interface SignalRConnection {
  id: string;
  ws: WebSocket;
}

export interface SignalRMessage {
  type: number;
  invocationId?: string;
  target?: string;
  arguments?: any[];
}

export class SignalRService {
  private wss: WebSocketServer;
  private connections = new Map<string, WebSocket>();

  constructor(server: Server, path: string = '/chat') {
    this.wss = new WebSocketServer({ 
      server,
      path
    });

    this.setupWebSocketServer();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws, req) => {
      
      const connectionId = this.getConnectionIdFromUrl(req.url || '');
      console.log('新的 SignalR WebSocket 連線:', connectionId);
      this.connections.set(connectionId, ws);
      
      this.handleConnection(ws, connectionId);
    });
  }

  private handleConnection(ws: WebSocket, connectionId: string): void {

    ws.on('message', (message) => {
      try {
        const data = message.toString();
        
        
        if (data === '{"protocol":"json","version":1}\x1e') {
          ws.send('{}\x1e');
        } else {
          const messages = data.split('\x1e').filter(m => m);
          
          for (const msg of messages) {
            if (msg) {
              const parsed: SignalRMessage = JSON.parse(msg);
              if(parsed.type !== 6){
                console.log('收到 SignalR 訊息:', parsed);
              }
              this.handleSignalRMessage(ws, parsed);
            }
          }
        }
      } catch (error) {
        console.error('SignalR 訊息處理錯誤:', error);
      }
    });

    ws.on('close', () => {
      console.log('SignalR 連線關閉');
      this.connections.delete(connectionId);
    });

    ws.on('error', (error) => {
      console.error('SignalR WebSocket 錯誤:', error);
    });
  }

  private handleSignalRMessage(ws: WebSocket, message: SignalRMessage): void {
    switch (message.type) {
      case 1:
        console.log('處理 SignalR 訊息:', message);
        this.handleInvocation(ws, message);
        break;
      case 6:
        ws.send('{"type":6}\x1e');
        break;
      default:
        console.log('未處理的訊息類型:', message.type);
    }
  }

  private handleInvocation(ws: WebSocket, message: SignalRMessage): void {
    const { invocationId, target, arguments: args } = message;
    
    console.log(`呼叫方法: ${target}, 參數:`, args);
    
    switch (target?.toLowerCase()) {
      case 'echo':
        this.sendSignalRMessage(ws, 'Echo', { 
          message: args?.[0],
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'getdata':
        this.sendSignalRMessage(ws, 'ReceiveData', {
          data: [
            { id: 1, name: 'Item 1', value: Math.random() * 100 },
            { id: 2, name: 'Item 2', value: Math.random() * 100 },
            { id: 3, name: 'Item 3', value: Math.random() * 100 }
          ]
        });
        break;
        
      case 'subscribe':
        this.startDataStream(ws, args?.[0]);
        break;
        
      default:
        console.log('未知的方法:', target);
    }
    
    if (invocationId) {
      const completion = {
        type: 3,
        invocationId: invocationId
      };
      ws.send(JSON.stringify(completion) + '\x1e');
    }
  }

  public sendSignalRMessage(ws: WebSocket, method: string, data: any): void {
    const message = {
      type: 1,
      target: method,
      arguments: data
    };
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message) + '\x1e');
      console.log('發送 SignalR 訊息:', method, data);
    }
  }

  private startDataStream(ws: WebSocket, channel: string): void {
    let counter = 0;
    const interval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }
      
      counter++;
      this.sendSignalRMessage(ws, 'StreamData', {
        channel: channel,
        value: Math.random() * 100,
        counter: counter,
        timestamp: new Date().toISOString()
      });
    }, 2000);
  }

  public broadcast(method: string, data: any): void {
    this.connections.forEach((ws) => {
      this.sendSignalRMessage(ws, method, data);
    });
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public generateConnectionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private getConnectionIdFromUrl(url: string): string {
    const params = new URLSearchParams(url.split('?')[1]);
    return params.get('id') || this.generateConnectionId();
  }
}