import EventSource from 'eventsource';
import {
  IStreamManager,
  Stream,
  StreamChunk,
  StreamOptions,
  SSEStreamConfig,
} from '../types';

interface StreamState {
  stream: Stream;
  eventSource: EventSource | null;
  buffer: StreamChunk[];
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  chunkListeners: Set<(chunk: StreamChunk) => void>;
}

export class SSEStreamManager implements IStreamManager {
  private streams: Map<string, StreamState> = new Map();
  private config: SSEStreamConfig;
  private defaultBufferSize: number = 100;
  private defaultReconnectAttempts: number = 5;
  private defaultReconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000;

  constructor(config?: SSEStreamConfig) {
    this.config = {
      endpoint: config?.endpoint || process.env.SSE_ENDPOINT || 'http://localhost:4000/stream',
      bufferSize: config?.bufferSize || this.defaultBufferSize,
      reconnectAttempts: config?.reconnectAttempts || this.defaultReconnectAttempts,
      reconnectDelay: config?.reconnectDelay || this.defaultReconnectDelay,
    };
  }

  async createStream(sessionId: string, options?: StreamOptions): Promise<Stream> {
    // Check if stream already exists
    const existing = this.streams.get(sessionId);
    if (existing && existing.stream.status === 'open') {
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

    const endpoint = this.buildEndpoint(sessionId, options);
    const eventSource = new EventSource(endpoint);

    const streamState: StreamState = {
      stream,
      eventSource,
      buffer: [],
      reconnectAttempts: 0,
      chunkListeners: new Set(),
    };

    // Setup event handlers
    this.setupEventHandlers(streamState, options);

    this.streams.set(sessionId, streamState);

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

    // Add chunk to buffer
    this.addToBuffer(state, chunk);

    // Note: SSE is one-way (server to client), so sendChunk here would typically
    // be used for internal buffering or if we have a way to send to the server.
    // For client-side streaming, chunks are received via EventSource messages.
    // This method is kept for interface consistency and potential future use.
  }

  async closeStream(stream: Stream): Promise<void> {
    const state = this.streams.get(stream.sessionId);
    if (!state) {
      return; // Stream already closed or doesn't exist
    }

    // Close EventSource connection
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
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

    if (state.stream.status === 'open' && state.eventSource?.readyState === EventSource.OPEN) {
      return state.stream; // Already connected
    }

    // Check if we've exceeded reconnect attempts
    if (state.reconnectAttempts >= (this.config.reconnectAttempts || this.defaultReconnectAttempts)) {
      state.stream.status = 'error';
      return null;
    }

    // Close existing connection if any
    if (state.eventSource) {
      state.eventSource.close();
    }

    // Increment reconnect attempts
    state.reconnectAttempts++;

    // Create new EventSource connection
    const endpoint = this.buildEndpoint(sessionId);
    const eventSource = new EventSource(endpoint);

    state.eventSource = eventSource;
    state.stream.status = 'open';

    // Setup event handlers
    this.setupEventHandlers(state);

    // Replay buffered chunks
    this.replayBuffer(state);

    return state.stream;
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

  private buildEndpoint(sessionId: string, options?: StreamOptions): string {
    const baseEndpoint = options?.transport === 'websocket'
      ? (process.env.WEBSOCKET_URL || 'ws://localhost:4000/stream')
      : (this.config.endpoint || process.env.SSE_ENDPOINT || 'http://localhost:4000/stream');

    // Add sessionId as query parameter
    const url = new URL(baseEndpoint);
    url.searchParams.set('sessionId', sessionId);
    return url.toString();
  }

  private setupEventHandlers(state: StreamState, options?: StreamOptions): void {
    if (!state.eventSource) {
      return;
    }

    const bufferSize = options?.bufferSize || this.config.bufferSize || this.defaultBufferSize;

    // Handle incoming messages
    state.eventSource.onmessage = (event) => {
      try {
        const chunk: StreamChunk = JSON.parse(event.data);
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
        console.error('Error parsing SSE message:', error);
      }
    };

    // Handle errors
    state.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      state.stream.status = 'error';

      // Attempt reconnection if not manually closed
      this.scheduleReconnect(state, options);
    };

    // Handle connection open
    state.eventSource.onopen = () => {
      state.stream.status = 'open';
      state.reconnectAttempts = 0; // Reset on successful connection
    };
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

  private scheduleReconnect(state: StreamState, options?: StreamOptions): void {
    const maxAttempts = options?.reconnectAttempts || this.config.reconnectAttempts || this.defaultReconnectAttempts;
    if (state.reconnectAttempts >= maxAttempts) {
      state.stream.status = 'error';
      return;
    }

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }

    const baseDelay = options?.reconnectDelay || this.config.reconnectDelay || this.defaultReconnectDelay;
    const nextAttempt = state.reconnectAttempts + 1;
    const delay = Math.min(baseDelay * Math.pow(2, nextAttempt - 1), this.maxReconnectDelay);

    console.warn(
      `[SSEStreamManager] reconnect attempt ${nextAttempt}/${maxAttempts} for session ${state.stream.sessionId} in ${delay}ms`
    );

    state.reconnectTimer = setTimeout(() => {
      this.handleReconnection(state.stream.sessionId);
    }, delay);
  }
}

