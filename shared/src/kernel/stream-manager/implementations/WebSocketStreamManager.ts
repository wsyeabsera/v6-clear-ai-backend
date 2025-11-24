import { WebSocket } from 'ws';
import {
  IStreamManager,
  Stream,
  StreamChunk,
  StreamOptions,
  WebSocketStreamConfig,
} from '../types';

interface StreamState {
  stream: Stream;
  websocket: WebSocket | null;
  buffer: StreamChunk[];
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  reconnectDelay: number;
  chunkListeners: Set<(chunk: StreamChunk) => void>;
  isManuallyClosed: boolean;
}

export class WebSocketStreamManager implements IStreamManager {
  private streams: Map<string, StreamState> = new Map();
  private config: WebSocketStreamConfig;
  private defaultBufferSize: number = 100;
  private defaultReconnectAttempts: number = 5;
  private defaultReconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000; // 30 seconds max

  constructor(config?: WebSocketStreamConfig) {
    this.config = {
      url: config?.url || process.env.WEBSOCKET_URL || 'ws://localhost:4000/stream',
      protocols: config?.protocols,
      bufferSize: config?.bufferSize || this.defaultBufferSize,
      reconnectAttempts: config?.reconnectAttempts || this.defaultReconnectAttempts,
      reconnectDelay: config?.reconnectDelay || this.defaultReconnectDelay,
    };
  }

  async createStream(sessionId: string, options?: StreamOptions): Promise<Stream> {
    // Check if stream already exists
    const existing = this.streams.get(sessionId);
    if (existing && existing.stream.status === 'open' && existing.websocket?.readyState === WebSocket.OPEN) {
      return existing.stream;
    }

    // Create new stream
    const stream: Stream = {
      id: `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      status: 'open',
      createdAt: new Date().toISOString(),
      metadata: options?.metadata,
    };

    const url = this.buildWebSocketUrl(sessionId, options);
    const websocket = new WebSocket(url, this.config.protocols);

    const reconnectDelay = options?.reconnectDelay || this.config.reconnectDelay || this.defaultReconnectDelay;

    const streamState: StreamState = {
      stream,
      websocket,
      buffer: [],
      reconnectAttempts: 0,
      reconnectDelay,
      chunkListeners: new Set(),
      isManuallyClosed: false,
    };

    // Setup event handlers
    this.setupEventHandlers(streamState, options);

    this.streams.set(sessionId, streamState);

    // Wait for connection to open
    await this.waitForConnection(websocket);

    return stream;
  }

  async sendChunk(stream: Stream, chunk: StreamChunk): Promise<void> {
    const state = this.streams.get(stream.sessionId);
    if (!state) {
      throw new Error(`Stream not found for sessionId: ${stream.sessionId}`);
    }

    if (state.stream.status !== 'open') {
      throw new Error(`Stream is not open for sessionId: ${stream.sessionId}`);
    }

    if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN) {
      // Buffer chunk if connection is not open
      this.addToBuffer(state, chunk);
      throw new Error(`WebSocket is not open for sessionId: ${stream.sessionId}`);
    }

    try {
      // Ensure chunk has timestamp
      if (!chunk.timestamp) {
        chunk.timestamp = new Date().toISOString();
      }

      // Send chunk via WebSocket
      const message = JSON.stringify(chunk);
      state.websocket.send(message);

      // Update lastChunkAt
      state.stream.lastChunkAt = chunk.timestamp;

      // Add to buffer for potential replay
      this.addToBuffer(state, chunk);
    } catch (error) {
      // Buffer chunk on error
      this.addToBuffer(state, chunk);
      throw new Error(`Failed to send chunk: ${error}`);
    }
  }

  async closeStream(stream: Stream): Promise<void> {
    const state = this.streams.get(stream.sessionId);
    if (!state) {
      return; // Stream already closed or doesn't exist
    }

    // Mark as manually closed to prevent reconnection
    state.isManuallyClosed = true;

    // Close WebSocket connection
    if (state.websocket) {
      if (state.websocket.readyState === WebSocket.OPEN || state.websocket.readyState === WebSocket.CONNECTING) {
        state.websocket.close();
      }
      state.websocket = null;
    }

    // Clear reconnect timer
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = undefined;
    }

    // Update stream status
    state.stream.status = 'closed';

    // Remove from active streams
    this.streams.delete(stream.sessionId);
  }

  async handleReconnection(sessionId: string): Promise<Stream | null> {
    const state = this.streams.get(sessionId);
    if (!state) {
      return null;
    }

    if (state.isManuallyClosed) {
      return null; // Don't reconnect if manually closed
    }

    if (state.stream.status === 'open' && state.websocket?.readyState === WebSocket.OPEN) {
      return state.stream; // Already connected
    }

    // Check if we've exceeded reconnect attempts
    const maxAttempts = this.config.reconnectAttempts || this.defaultReconnectAttempts;
    if (state.reconnectAttempts >= maxAttempts) {
      console.warn(
        `[WebSocketStreamManager] reached max reconnect attempts (${maxAttempts}) for session ${sessionId}`
      );
      state.stream.status = 'error';
      return null;
    }

    // Close existing connection if any
    if (state.websocket) {
      state.websocket.removeAllListeners();
      if (state.websocket.readyState !== WebSocket.CLOSED) {
        state.websocket.close();
      }
    }

    // Increment reconnect attempts
    state.reconnectAttempts++;

    // Calculate exponential backoff delay
    const delay = Math.min(
      state.reconnectDelay * Math.pow(2, state.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }

    console.warn(
      `[WebSocketStreamManager] reconnect attempt ${state.reconnectAttempts}/${maxAttempts} for session ${sessionId} in ${delay}ms`
    );

    return new Promise((resolve) => {
      state.reconnectTimer = setTimeout(async () => {
        try {
          // Create new WebSocket connection
          const url = this.buildWebSocketUrl(sessionId);
          const websocket = new WebSocket(url, this.config.protocols);

          state.websocket = websocket;
          state.stream.status = 'open';

          // Setup event handlers
          this.setupEventHandlers(state);

          // Wait for connection
          await this.waitForConnection(websocket);

          // Replay buffered chunks
          this.replayBuffer(state);

          resolve(state.stream);
        } catch (error) {
          state.stream.status = 'error';
          resolve(null);
        }
      }, delay);
    });
  }

  getStream(sessionId: string): Stream | null {
    const state = this.streams.get(sessionId);
    return state ? state.stream : null;
  }

  // Add listener for chunk events
  onChunk(sessionId: string, listener: (chunk: StreamChunk) => void): void {
    const state = this.streams.get(sessionId);
    if (state) {
      state.chunkListeners.add(listener);
    }
  }

  // Remove listener for chunk events
  offChunk(sessionId: string, listener: (chunk: StreamChunk) => void): void {
    const state = this.streams.get(sessionId);
    if (state) {
      state.chunkListeners.delete(listener);
    }
  }

  private buildWebSocketUrl(sessionId: string, options?: StreamOptions): string {
    const baseUrl = options?.transport === 'sse'
      ? (process.env.SSE_ENDPOINT?.replace(/^http/, 'ws') || 'ws://localhost:4000/stream')
      : (this.config.url || process.env.WEBSOCKET_URL || 'ws://localhost:4000/stream');

    // Add sessionId as query parameter
    const url = new URL(baseUrl);
    url.searchParams.set('sessionId', sessionId);
    return url.toString();
  }

  private setupEventHandlers(state: StreamState, options?: StreamOptions): void {
    if (!state.websocket) {
      return;
    }

    const bufferSize = options?.bufferSize || this.config.bufferSize || this.defaultBufferSize;

    // Handle incoming messages
    state.websocket.on('message', (data: any) => {
      try {
        const message = data.toString();
        const chunk: StreamChunk = JSON.parse(message);
        chunk.timestamp = chunk.timestamp || new Date().toISOString();

        // Add to buffer
        this.addToBuffer(state, chunk, bufferSize);

        // Update lastChunkAt
        state.stream.lastChunkAt = chunk.timestamp;

        // Notify listeners
        state.chunkListeners.forEach((listener) => {
          try {
            listener(chunk);
          } catch (error) {
            console.error('Error in chunk listener:', error);
          }
        });
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Handle connection open
    state.websocket.on('open', () => {
      state.stream.status = 'open';
      state.reconnectAttempts = 0; // Reset on successful connection
      state.reconnectDelay = options?.reconnectDelay || this.config.reconnectDelay || this.defaultReconnectDelay;
    });

    // Handle errors
    state.websocket.on('error', (error) => {
      console.error('WebSocket connection error:', error);
      state.stream.status = 'error';

      // Attempt reconnection if not manually closed
      if (!state.isManuallyClosed) {
        this.handleReconnection(state.stream.sessionId);
      }
    });

    // Handle connection close
    state.websocket.on('close', (code, _reason) => {
      state.stream.status = 'closed';

      // Attempt reconnection if not manually closed and not a normal closure
      if (!state.isManuallyClosed && code !== 1000) {
        this.handleReconnection(state.stream.sessionId);
      }
    });
  }

  private waitForConnection(websocket: WebSocket, timeout: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      // WebSocket.OPEN = 1
      if (websocket.readyState === 1) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, timeout);

      websocket.once('open', () => {
        clearTimeout(timeoutId);
        resolve();
      });

      websocket.once('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  private addToBuffer(state: StreamState, chunk: StreamChunk, maxSize?: number): void {
    const bufferSize = maxSize || this.config.bufferSize || this.defaultBufferSize;
    state.buffer.push(chunk);

    // Maintain buffer size
    if (state.buffer.length > bufferSize) {
      state.buffer.shift(); // Remove oldest chunk
    }
  }

  private replayBuffer(state: StreamState): void {
    // Replay buffered chunks to listeners
    state.buffer.forEach((chunk) => {
      state.chunkListeners.forEach((listener) => {
        try {
          listener(chunk);
        } catch (error) {
          console.error('Error replaying chunk to listener:', error);
        }
      });
    });
  }
}

