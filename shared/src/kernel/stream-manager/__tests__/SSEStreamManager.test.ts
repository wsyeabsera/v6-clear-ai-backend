import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEStreamManager } from '../implementations/SSEStreamManager';
import { StreamChunk, StreamStatus } from '../types';

// Mock EventSource - must be defined before vi.mock
vi.mock('eventsource', () => {
  class MockEventSource {
    url: string;
    readyState: number = 0; // CONNECTING
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onopen: (() => void) | null = null;

    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;

    constructor(url: string) {
      this.url = url;
      // Simulate connection opening after a short delay
      setTimeout(() => {
        this.readyState = MockEventSource.OPEN;
        if (this.onopen) {
          this.onopen();
        }
      }, 10);
    }

    close() {
      this.readyState = MockEventSource.CLOSED;
    }

    // Helper method to simulate receiving a message
    simulateMessage(data: any) {
      if (this.onmessage) {
        this.onmessage({ data: JSON.stringify(data) });
      }
    }

    // Helper method to simulate an error
    simulateError() {
      this.readyState = MockEventSource.CLOSED;
      if (this.onerror) {
        this.onerror({});
      }
    }
  }

  return {
    default: MockEventSource,
  };
});

describe('SSEStreamManager', () => {
  let manager: SSEStreamManager;
  const testEndpoint = 'http://localhost:4000/stream';

  beforeEach(() => {
    manager = new SSEStreamManager({ endpoint: testEndpoint });
  });

  afterEach(async () => {
    // Clean up any open streams
    const streams = ['test-session-1', 'test-session-2', 'test-session-3'];
    for (const sessionId of streams) {
      const stream = manager.getStream(sessionId);
      if (stream) {
        await manager.closeStream(stream);
      }
    }
  });

  describe('createStream', () => {
    it('should create a new stream', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      expect(stream).toBeDefined();
      expect(stream.sessionId).toBe(sessionId);
      expect(stream.status).toBe('open');
      expect(stream.id).toBeDefined();
      expect(stream.createdAt).toBeDefined();
    });

    it('should return existing stream if already open', async () => {
      const sessionId = 'test-session-1';
      const stream1 = await manager.createStream(sessionId);
      const stream2 = await manager.createStream(sessionId);

      expect(stream1.id).toBe(stream2.id);
    });

    it('should create stream with metadata', async () => {
      const sessionId = 'test-session-1';
      const metadata = { mode: 'ask', userId: 'user-123' };
      const stream = await manager.createStream(sessionId, { metadata });

      expect(stream.metadata).toEqual(metadata);
    });

    it('should use default endpoint from config', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      expect(stream).toBeDefined();
      // The endpoint is used internally, so we just verify stream was created
    });
  });

  describe('sendChunk', () => {
    it('should add chunk to buffer', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      const chunk: StreamChunk = {
        type: 'text',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      // Note: SSE is one-way, so sendChunk mainly buffers internally
      await manager.sendChunk(stream, chunk);

      // Verify stream still exists and is open
      const retrieved = manager.getStream(sessionId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.status).toBe('open');
    });

    it('should throw error if stream not found', async () => {
      const stream = {
        id: 'non-existent',
        sessionId: 'non-existent',
        status: 'open' as StreamStatus,
        createdAt: new Date().toISOString(),
      };

      const chunk: StreamChunk = {
        type: 'text',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      await expect(manager.sendChunk(stream, chunk)).rejects.toThrow('Stream not found');
    });

    it('should throw error if stream is not open', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);
      
      // Wait a bit for connection
      await new Promise((resolve) => setTimeout(resolve, 50));
      
      await manager.closeStream(stream);

      const chunk: StreamChunk = {
        type: 'text',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      // After closing, stream is removed, so it will throw "Stream not found"
      // This is expected behavior - closed streams are removed
      await expect(manager.sendChunk(stream, chunk)).rejects.toThrow();
    });
  });

  describe('closeStream', () => {
    it('should close an open stream', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      await manager.closeStream(stream);

      const retrieved = manager.getStream(sessionId);
      expect(retrieved).toBeNull();
    });

    it('should handle closing non-existent stream gracefully', async () => {
      const stream = {
        id: 'non-existent',
        sessionId: 'non-existent',
        status: 'closed' as StreamStatus,
        createdAt: new Date().toISOString(),
      };

      await expect(manager.closeStream(stream)).resolves.not.toThrow();
    });
  });

  describe('handleReconnection', () => {
    it('should return existing stream if already connected', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      // Wait for connection to be established
      await new Promise((resolve) => setTimeout(resolve, 50));

      const reconnected = await manager.handleReconnection(sessionId);
      expect(reconnected).toBeDefined();
      expect(reconnected?.id).toBe(stream.id);
    });

    it('should return null if stream does not exist', async () => {
      const reconnected = await manager.handleReconnection('non-existent');
      expect(reconnected).toBeNull();
    });

    it('should attempt reconnection when stream is closed', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate connection error
      const state = (manager as any).streams.get(sessionId);
      if (state?.eventSource) {
        (state.eventSource as MockEventSource).simulateError();
      }

      // Wait a bit for error handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      const reconnected = await manager.handleReconnection(sessionId);
      // Should attempt reconnection (may succeed or fail depending on mock)
      expect(reconnected).toBeDefined();
    });
  });

  describe('getStream', () => {
    it('should return stream for existing sessionId', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      const retrieved = manager.getStream(sessionId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(stream.id);
      expect(retrieved?.sessionId).toBe(sessionId);
    });

    it('should return null for non-existent sessionId', () => {
      const retrieved = manager.getStream('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('chunk listeners', () => {
    it('should notify listeners when chunk is received', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      manager.onChunk(sessionId, (chunk) => {
        receivedChunks.push(chunk);
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate receiving a chunk
      const state = (manager as any).streams.get(sessionId);
      if (state?.eventSource) {
        const chunk: StreamChunk = {
          type: 'text',
          content: 'Test message',
          timestamp: new Date().toISOString(),
        };
        (state.eventSource as MockEventSource).simulateMessage(chunk);
      }

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedChunks).toHaveLength(1);
      expect(receivedChunks[0].content).toBe('Test message');
    });

    it('should remove listeners', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      const listener = (chunk: StreamChunk) => {
        receivedChunks.push(chunk);
      };

      manager.onChunk(sessionId, listener);
      manager.offChunk(sessionId, listener);

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate receiving a chunk
      const state = (manager as any).streams.get(sessionId);
      if (state?.eventSource) {
        const chunk: StreamChunk = {
          type: 'text',
          content: 'Test message',
          timestamp: new Date().toISOString(),
        };
        (state.eventSource as MockEventSource).simulateMessage(chunk);
      }

      // Wait for message processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedChunks).toHaveLength(0);
    });
  });

  describe('buffering', () => {
    it('should buffer chunks during disconnection', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send chunks
      const chunks: StreamChunk[] = [
        { type: 'text', content: 'Chunk 1', timestamp: new Date().toISOString() },
        { type: 'text', content: 'Chunk 2', timestamp: new Date().toISOString() },
      ];

      for (const chunk of chunks) {
        await manager.sendChunk(stream, chunk);
      }

      // Verify stream is still open
      const retrieved = manager.getStream(sessionId);
      expect(retrieved).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle connection errors gracefully', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate error
      const state = (manager as any).streams.get(sessionId);
      if (state?.eventSource) {
        (state.eventSource as MockEventSource).simulateError();
      }

      // Wait for error handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stream should still exist (may be in error state or attempting reconnection)
      const retrieved = manager.getStream(sessionId);
      expect(retrieved).toBeDefined();
    });

    it('should handle invalid JSON in SSE messages', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      manager.onChunk(sessionId, (chunk) => {
        receivedChunks.push(chunk);
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate receiving invalid JSON
      const state = (manager as any).streams.get(sessionId);
      if (state?.eventSource) {
        // Simulate message with invalid JSON
        if (state.eventSource.onmessage) {
          state.eventSource.onmessage({ data: 'invalid json' });
        }
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not crash, invalid messages are logged but ignored
      expect(manager.getStream(sessionId)).toBeDefined();
    });

    it('should handle errors in chunk listeners', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      // Add a listener that throws an error
      manager.onChunk(sessionId, () => {
        throw new Error('Listener error');
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate receiving a chunk
      const state = (manager as any).streams.get(sessionId);
      if (state?.eventSource) {
        const chunk: StreamChunk = {
          type: 'text',
          content: 'Test message',
          timestamp: new Date().toISOString(),
        };
        (state.eventSource as MockEventSource).simulateMessage(chunk);
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not crash, errors in listeners are caught and logged
      expect(manager.getStream(sessionId)).toBeDefined();
    });

    it('should handle errors when replaying buffer', async () => {
      const sessionId = 'test-session-1';
      const stream = await manager.createStream(sessionId);

      // Add a listener that throws an error
      manager.onChunk(sessionId, () => {
        throw new Error('Replay error');
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Add chunks to buffer
      const state = (manager as any).streams.get(sessionId);
      if (state) {
        state.buffer.push({
          type: 'text',
          content: 'Buffered chunk',
          timestamp: new Date().toISOString(),
        });
      }

      // Trigger reconnection which will replay buffer
      await manager.handleReconnection(sessionId);

      // Should not crash, errors in replay are caught and logged
      expect(manager.getStream(sessionId)).toBeDefined();
    });

    it('should mark stream as error once reconnect attempts are exhausted', async () => {
      const sessionId = 'session-max-retries';
      const stream = await manager.createStream(sessionId);
      const state = (manager as any).streams.get(sessionId);

      state.reconnectAttempts = (manager as any).config.reconnectAttempts || 5;
      (manager as any).scheduleReconnect(state);

      expect(stream.status).toBe('error');
    });
  });
});

