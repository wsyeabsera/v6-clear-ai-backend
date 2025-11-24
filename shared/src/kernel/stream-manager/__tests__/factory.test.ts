import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StreamManagerType,
  SSEStreamConfig,
  WebSocketStreamConfig,
} from '../types';

// Mock implementations before importing factory
vi.mock('../implementations/SSEStreamManager', () => ({
  SSEStreamManager: vi.fn().mockImplementation(() => ({
    createStream: vi.fn(),
    sendChunk: vi.fn(),
    closeStream: vi.fn(),
    handleReconnection: vi.fn(),
    getStream: vi.fn(),
  })),
}));

vi.mock('../implementations/WebSocketStreamManager', () => ({
  WebSocketStreamManager: vi.fn().mockImplementation(() => ({
    createStream: vi.fn(),
    sendChunk: vi.fn(),
    closeStream: vi.fn(),
    handleReconnection: vi.fn(),
    getStream: vi.fn(),
  })),
}));

import { StreamManagerFactory } from '../factory';

describe('StreamManagerFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create SSEStreamManager instance when type is SSE', () => {
      const config: SSEStreamConfig = { endpoint: 'http://localhost:4000/stream' };
      const manager = StreamManagerFactory.create(StreamManagerType.SSE, config);

      expect(manager).toBeDefined();
      expect(manager).toHaveProperty('createStream');
      expect(manager).toHaveProperty('sendChunk');
      expect(manager).toHaveProperty('closeStream');
      expect(manager).toHaveProperty('handleReconnection');
      expect(manager).toHaveProperty('getStream');
    });

    it('should create WebSocketStreamManager instance when type is WEBSOCKET', () => {
      const config: WebSocketStreamConfig = {
        url: 'ws://localhost:4000/stream',
      };
      const manager = StreamManagerFactory.create(StreamManagerType.WEBSOCKET, config);

      expect(manager).toBeDefined();
      expect(manager).toHaveProperty('createStream');
      expect(manager).toHaveProperty('sendChunk');
      expect(manager).toHaveProperty('closeStream');
      expect(manager).toHaveProperty('handleReconnection');
      expect(manager).toHaveProperty('getStream');
    });

    it('should throw error for invalid stream manager type', () => {
      expect(() => {
        StreamManagerFactory.create('invalid' as StreamManagerType, {} as SSEStreamConfig);
      }).toThrow('Invalid stream manager type: invalid');
    });

    it('should accept config for SSE type', () => {
      const config: SSEStreamConfig = { endpoint: 'http://custom:5000/stream' };
      const manager = StreamManagerFactory.create(StreamManagerType.SSE, config);
      expect(manager).toBeDefined();
    });

    it('should accept config for SSE type with buffer settings', () => {
      const config: SSEStreamConfig = {
        endpoint: 'http://localhost:4000/stream',
        bufferSize: 200,
        reconnectAttempts: 10,
        reconnectDelay: 2000,
      };
      const manager = StreamManagerFactory.create(StreamManagerType.SSE, config);
      expect(manager).toBeDefined();
    });

    it('should accept config for WEBSOCKET type', () => {
      const config: WebSocketStreamConfig = {
        url: 'ws://custom:5000/stream',
      };
      const manager = StreamManagerFactory.create(StreamManagerType.WEBSOCKET, config);
      expect(manager).toBeDefined();
    });

    it('should accept config for WEBSOCKET type with protocols', () => {
      const config: WebSocketStreamConfig = {
        url: 'ws://localhost:4000/stream',
        protocols: ['custom-protocol'],
        bufferSize: 150,
        reconnectAttempts: 8,
        reconnectDelay: 1500,
      };
      const manager = StreamManagerFactory.create(StreamManagerType.WEBSOCKET, config);
      expect(manager).toBeDefined();
    });

    it('should work without config (uses defaults)', () => {
      const sseManager = StreamManagerFactory.create(StreamManagerType.SSE);
      expect(sseManager).toBeDefined();

      const wsManager = StreamManagerFactory.create(StreamManagerType.WEBSOCKET);
      expect(wsManager).toBeDefined();
    });

    it('should return instances that implement IStreamManager interface', () => {
      const sseConfig: SSEStreamConfig = { endpoint: 'http://localhost:4000/stream' };
      const sseManager = StreamManagerFactory.create(StreamManagerType.SSE, sseConfig);

      const wsConfig: WebSocketStreamConfig = {
        url: 'ws://localhost:4000/stream',
      };
      const wsManager = StreamManagerFactory.create(StreamManagerType.WEBSOCKET, wsConfig);

      // All should implement IStreamManager interface
      [sseManager, wsManager].forEach((manager) => {
        expect(manager).toHaveProperty('createStream');
        expect(manager).toHaveProperty('sendChunk');
        expect(manager).toHaveProperty('closeStream');
        expect(manager).toHaveProperty('handleReconnection');
        expect(manager).toHaveProperty('getStream');
        expect(typeof manager.createStream).toBe('function');
        expect(typeof manager.sendChunk).toBe('function');
        expect(typeof manager.closeStream).toBe('function');
        expect(typeof manager.handleReconnection).toBe('function');
        expect(typeof manager.getStream).toBe('function');
      });
    });

    it('should create different instances for different types', () => {
      const sseConfig: SSEStreamConfig = { endpoint: 'http://localhost:4000/stream' };
      const sseManager = StreamManagerFactory.create(StreamManagerType.SSE, sseConfig);

      const wsConfig: WebSocketStreamConfig = {
        url: 'ws://localhost:4000/stream',
      };
      const wsManager = StreamManagerFactory.create(StreamManagerType.WEBSOCKET, wsConfig);

      expect(sseManager).not.toBe(wsManager);
    });
  });
});

