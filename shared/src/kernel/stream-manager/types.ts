// Stream Manager Types

// Stream status
export type StreamStatus = 'open' | 'closed' | 'error';

// Stream chunk types
export type StreamChunkType = 'text' | 'data' | 'error' | 'done' | 'metadata';

// Stream interface representing an active stream
export interface Stream {
  id: string;
  sessionId: string;
  status: StreamStatus;
  createdAt: string;
  lastChunkAt?: string;
  metadata?: Record<string, any>;
}

// Stream chunk interface
export interface StreamChunk {
  type: StreamChunkType;
  content: any;
  timestamp: string;
  sequence?: number; // For ordering chunks
  metadata?: Record<string, any>;
}

// Stream options for creating a new stream
export interface StreamOptions {
  transport?: 'sse' | 'websocket'; // Default: 'sse'
  bufferSize?: number; // Default: 100 chunks
  reconnectAttempts?: number; // Default: 5
  reconnectDelay?: number; // Default: 1000ms
  metadata?: Record<string, any>;
}

// Stream Manager type enum
export enum StreamManagerType {
  SSE = 'sse',
  WEBSOCKET = 'websocket',
}

// SSE Stream configuration
export interface SSEStreamConfig {
  endpoint?: string; // Default: process.env.SSE_ENDPOINT
  bufferSize?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

// WebSocket Stream configuration
export interface WebSocketStreamConfig {
  url?: string; // Default: process.env.WEBSOCKET_URL
  protocols?: string[];
  bufferSize?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

// Stream Manager configuration union type
export type StreamManagerConfig = SSEStreamConfig | WebSocketStreamConfig;

// Stream Manager interface
export interface IStreamManager {
  createStream(sessionId: string, options?: StreamOptions): Promise<Stream>;
  sendChunk(stream: Stream, chunk: StreamChunk): Promise<void>;
  closeStream(stream: Stream): Promise<void>;
  handleReconnection(sessionId: string): Promise<Stream | null>;
  getStream(sessionId: string): Stream | null;
}

