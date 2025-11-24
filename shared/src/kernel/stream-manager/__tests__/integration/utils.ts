import { createServer, Server, IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { StreamChunk } from '../../types';

export interface TestSSEServer {
  server: Server;
  port: number;
  url: string;
  sendChunk: (chunk: StreamChunk) => void;
  close: () => Promise<void>;
}

export interface TestWebSocketServer {
  server: WebSocketServer;
  port: number;
  url: string;
  sendChunk: (chunk: StreamChunk) => void;
  close: () => Promise<void>;
}

/**
 * Create a test SSE server
 */
export function createTestSSEServer(port: number = 0): Promise<TestSSEServer> {
  return new Promise((resolve, reject) => {
    const clients = new Set<any>();
    let actualPort = port;

    const server = createServer((req, res) => {
      // Parse sessionId from query params
      const url = new URL(req.url || '/', `http://localhost:${actualPort}`);
      const sessionId = url.searchParams.get('sessionId');

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Store client response
      clients.add(res);

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: 'metadata', content: { connected: true, sessionId } })}\n\n`);

      // Handle client disconnect
      req.on('close', () => {
        clients.delete(res);
      });
    });

    server.listen(port, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        actualPort = address.port;
      } else if (typeof address === 'string') {
        // Unix socket (unlikely in tests)
        actualPort = 0;
      }

      const url = `http://localhost:${actualPort}/stream`;

      resolve({
        server,
        port: actualPort,
        url,
        sendChunk: (chunk: StreamChunk) => {
          const message = `data: ${JSON.stringify(chunk)}\n\n`;
          clients.forEach((client) => {
            try {
              client.write(message);
            } catch (error) {
              // Client may have disconnected
              clients.delete(client);
            }
          });
        },
        close: () => {
          return new Promise<void>((resolveClose) => {
            clients.forEach((client) => {
              try {
                client.end();
              } catch (error) {
                // Ignore errors
              }
            });
            clients.clear();
            server.close(() => {
              resolveClose();
            });
          });
        },
      });
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Create a test WebSocket server
 */
export function createTestWebSocketServer(port: number = 0): Promise<TestWebSocketServer> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    const wss = new WebSocketServer({ server });

    const clients = new Set<WebSocket>();

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      clients.add(ws);

      // Parse sessionId from query params
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const sessionId = url.searchParams.get('sessionId');

      // Send initial connection message
      const initialChunk: StreamChunk = {
        type: 'metadata',
        content: { connected: true, sessionId },
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(initialChunk));

      // Handle client disconnect
      ws.on('close', () => {
        clients.delete(ws);
      });

      // Echo messages back (for testing bidirectional communication)
      ws.on('message', (data: Buffer) => {
        try {
          const chunk = JSON.parse(data.toString());
          // Echo back with echo flag
          const echoChunk: StreamChunk = {
            ...chunk,
            metadata: { ...chunk.metadata, echoed: true },
          };
          ws.send(JSON.stringify(echoChunk));
        } catch (error) {
          // Ignore invalid messages
        }
      });
    });

    server.listen(port, () => {
      const address = server.address();
      let actualPort = port;
      if (address && typeof address === 'object') {
        actualPort = address.port;
      }

      const url = `ws://localhost:${actualPort}/stream`;

      resolve({
        server: wss,
        port: actualPort,
        url,
        sendChunk: (chunk: StreamChunk) => {
          const message = JSON.stringify(chunk);
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              try {
                client.send(message);
              } catch (error) {
                // Client may have disconnected
                clients.delete(client);
              }
            }
          });
        },
        close: () => {
          return new Promise<void>((resolveClose) => {
            clients.forEach((client) => {
              try {
                client.close();
              } catch (error) {
                // Ignore errors
              }
            });
            clients.clear();
            wss.close(() => {
              server.close(() => {
                resolveClose();
              });
            });
          });
        },
      });
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Wait for a chunk to be received
 */
export async function waitForChunk(
  chunks: StreamChunk[],
  predicate: (chunk: StreamChunk) => boolean,
  timeout: number = 5000
): Promise<StreamChunk> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const matchingChunk = chunks.find(predicate);
    if (matchingChunk) {
      return matchingChunk;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Chunk not found within ${timeout}ms`);
}

/**
 * Cleanup test servers
 */
export async function cleanupTestServers(
  servers: Array<TestSSEServer | TestWebSocketServer>
): Promise<void> {
  await Promise.all(servers.map((server) => server.close()));
}

/**
 * Generate a unique session ID for tests
 */
export function generateSessionId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a test stream chunk
 */
export function createTestChunk(
  type: StreamChunk['type'] = 'text',
  content: any = 'Test message',
  sequence?: number
): StreamChunk {
  return {
    type,
    content,
    timestamp: new Date().toISOString(),
    sequence,
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

