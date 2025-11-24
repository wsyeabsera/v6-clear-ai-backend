import { describe, it, expect } from 'vitest';
import * as StreamManager from '../index';

describe('Stream Manager Index Exports', () => {
  it('should export all types', () => {
    expect(StreamManager.StreamManagerType).toBeDefined();
    expect(StreamManager.StreamManagerFactory).toBeDefined();
    expect(StreamManager.SSEStreamManager).toBeDefined();
    expect(StreamManager.WebSocketStreamManager).toBeDefined();
  });

  it('should export StreamManagerType enum', () => {
    expect(StreamManager.StreamManagerType.SSE).toBe('sse');
    expect(StreamManager.StreamManagerType.WEBSOCKET).toBe('websocket');
  });

  it('should export factory', () => {
    expect(typeof StreamManager.StreamManagerFactory.create).toBe('function');
  });

  it('should export implementations', () => {
    expect(StreamManager.SSEStreamManager).toBeDefined();
    expect(StreamManager.WebSocketStreamManager).toBeDefined();
  });
});

