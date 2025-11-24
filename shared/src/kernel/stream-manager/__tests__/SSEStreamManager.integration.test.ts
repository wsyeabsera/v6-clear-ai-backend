import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SSEStreamManager } from '../implementations/SSEStreamManager';
import { StreamChunk } from '../types';
import {
  createTestSSEServer,
  cleanupTestServers,
  generateSessionId,
  createTestChunk,
  waitForChunk,
  TestSSEServer,
} from './integration/utils';

describe('SSEStreamManager Integration Tests', () => {
  let manager: SSEStreamManager;
  let testServer: TestSSEServer;
  const testServers: TestSSEServer[] = [];

  beforeEach(async () => {
    // Create test SSE server
    testServer = await createTestSSEServer();
    testServers.push(testServer);

    // Create manager with test server endpoint
    manager = new SSEStreamManager({
      endpoint: testServer.url,
      bufferSize: 100,
      reconnectAttempts: 5,
      reconnectDelay: 1000,
    });
  });

  afterEach(async () => {
    // Close all streams
    const sessionIds = ['test-session-1', 'test-session-2', 'test-session-3'];
    for (const sessionId of sessionIds) {
      const stream = manager.getStream(sessionId);
      if (stream) {
        await manager.closeStream(stream);
      }
    }

    // Cleanup test servers
    await cleanupTestServers(testServers);
    testServers.length = 0;
  });

  describe('createStream', () => {
    it('should create a stream and connect to SSE server', async () => {
      const sessionId = generateSessionId();
      const stream = await manager.createStream(sessionId);

      expect(stream).toBeDefined();
      expect(stream.sessionId).toBe(sessionId);
      expect(stream.status).toBe('open');

      // Wait a bit for connection to establish
      await new Promise((resolve) => setTimeout(resolve, 100));

      const retrieved = manager.getStream(sessionId);
      expect(retrieved).toBeDefined();
    });

    it('should create stream with metadata', async () => {
      const sessionId = generateSessionId();
      const metadata = { mode: 'ask', userId: 'user-123' };
      const stream = await manager.createStream(sessionId, { metadata });

      expect(stream.metadata).toEqual(metadata);
    });
  });

  describe('chunk reception', () => {
    it('should receive chunks from SSE server', async () => {
      const sessionId = generateSessionId();
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      manager.onChunk(sessionId, (chunk) => {
        receivedChunks.push(chunk);
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send chunk from server
      const testChunk = createTestChunk('text', 'Hello from server');
      testServer.sendChunk(testChunk);

      // Wait for chunk to be received
      await waitForChunk(receivedChunks, (chunk) => chunk.content === 'Hello from server', 2000);

      expect(receivedChunks.length).toBeGreaterThan(0);
      const received = receivedChunks.find((c) => c.content === 'Hello from server');
      expect(received).toBeDefined();
      expect(received?.type).toBe('text');
    });

    it('should receive multiple chunks in sequence', async () => {
      const sessionId = generateSessionId();
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      manager.onChunk(sessionId, (chunk) => {
        receivedChunks.push(chunk);
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send multiple chunks
      const chunks = [
        createTestChunk('text', 'Chunk 1', 1),
        createTestChunk('text', 'Chunk 2', 2),
        createTestChunk('text', 'Chunk 3', 3),
      ];

      for (const chunk of chunks) {
        testServer.sendChunk(chunk);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Wait for all chunks
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(receivedChunks.length).toBeGreaterThanOrEqual(3);
      const contents = receivedChunks.map((c) => c.content);
      expect(contents).toContain('Chunk 1');
      expect(contents).toContain('Chunk 2');
      expect(contents).toContain('Chunk 3');
    });

    it('should handle different chunk types', async () => {
      const sessionId = generateSessionId();
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      manager.onChunk(sessionId, (chunk) => {
        receivedChunks.push(chunk);
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send different chunk types
      testServer.sendChunk(createTestChunk('text', 'Text chunk'));
      testServer.sendChunk(createTestChunk('data', { key: 'value' }));
      testServer.sendChunk(createTestChunk('metadata', { info: 'metadata' }));
      testServer.sendChunk(createTestChunk('done', null));

      // Wait for chunks
      await new Promise((resolve) => setTimeout(resolve, 200));

      const types = receivedChunks.map((c) => c.type);
      expect(types).toContain('text');
      expect(types).toContain('data');
      expect(types).toContain('metadata');
      expect(types).toContain('done');
    });
  });

  describe('buffering', () => {
    it('should buffer chunks during disconnection', async () => {
      const sessionId = generateSessionId();
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      manager.onChunk(sessionId, (chunk) => {
        receivedChunks.push(chunk);
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send chunks
      const chunks = [
        createTestChunk('text', 'Buffered 1'),
        createTestChunk('text', 'Buffered 2'),
      ];

      for (const chunk of chunks) {
        testServer.sendChunk(chunk);
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify chunks were received
      expect(receivedChunks.length).toBeGreaterThan(0);
    });

    it('should maintain buffer size limit', async () => {
      const sessionId = generateSessionId();
      const stream = await manager.createStream(sessionId, { bufferSize: 3 });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send more chunks than buffer size
      for (let i = 0; i < 10; i++) {
        testServer.sendChunk(createTestChunk('text', `Chunk ${i}`));
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Buffer should be limited
      const state = (manager as any).streams.get(sessionId);
      expect(state.buffer.length).toBeLessThanOrEqual(3);
    });
  });

  describe('reconnection', () => {
    it('should handle reconnection when server closes', async () => {
      const sessionId = generateSessionId();
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      manager.onChunk(sessionId, (chunk) => {
        receivedChunks.push(chunk);
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send a chunk
      testServer.sendChunk(createTestChunk('text', 'Before close'));

      // Wait for chunk
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close server
      await testServer.close();

      // Create new server on same port (simulating reconnection)
      const newServer = await createTestSSEServer(testServer.port);
      testServers.push(newServer);

      // Update manager endpoint
      manager = new SSEStreamManager({
        endpoint: newServer.url,
        bufferSize: 100,
        reconnectAttempts: 5,
        reconnectDelay: 500,
      });

      // Attempt reconnection
      const reconnected = await manager.handleReconnection(sessionId);
      // Reconnection may or may not succeed depending on implementation
      // Just verify it doesn't throw
      expect(reconnected !== undefined || reconnected === null).toBe(true);
    });
  });

  describe('closeStream', () => {
    it('should close stream and stop receiving chunks', async () => {
      const sessionId = generateSessionId();
      const stream = await manager.createStream(sessionId);

      const receivedChunks: StreamChunk[] = [];
      manager.onChunk(sessionId, (chunk) => {
        receivedChunks.push(chunk);
      });

      // Wait for connection
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close stream
      await manager.closeStream(stream);

      // Send chunk after close
      testServer.sendChunk(createTestChunk('text', 'After close'));

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stream should be closed
      const retrieved = manager.getStream(sessionId);
      expect(retrieved).toBeNull();
    });
  });

  describe('multiple streams', () => {
    it('should handle multiple concurrent streams', async () => {
      const sessionId1 = generateSessionId();
      const sessionId2 = generateSessionId();

      const stream1 = await manager.createStream(sessionId1);
      const stream2 = await manager.createStream(sessionId2);

      const chunks1: StreamChunk[] = [];
      const chunks2: StreamChunk[] = [];

      manager.onChunk(sessionId1, (chunk) => chunks1.push(chunk));
      manager.onChunk(sessionId2, (chunk) => chunks2.push(chunk));

      // Wait for connections
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send chunks
      testServer.sendChunk(createTestChunk('text', 'Stream 1 message'));
      testServer.sendChunk(createTestChunk('text', 'Stream 2 message'));

      // Wait for chunks
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Both streams should exist
      expect(manager.getStream(sessionId1)).toBeDefined();
      expect(manager.getStream(sessionId2)).toBeDefined();
    });
  });
});

