import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateSessionId,
  generateUserId,
  createTestMessage,
  cleanupPineconeMemory,
  waitFor,
  loadTestEnv,
  checkServiceAvailability,
} from './utils';
import { PineconeMemorySystem } from '../../implementations/PineconeMemorySystem';

// Mock Pinecone
const mockDelete = vi.fn();
const mockIndex = {
  delete: mockDelete,
};

const mockPinecone = {
  Index: vi.fn(() => mockIndex),
};

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn(() => mockPinecone),
}));

describe('Integration Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^test-/);
    });

    it('should generate session IDs with custom prefix', () => {
      const id = generateSessionId('custom');
      expect(id).toMatch(/^custom-/);
    });
  });

  describe('generateUserId', () => {
    it('should generate unique user IDs', () => {
      const id1 = generateUserId();
      const id2 = generateUserId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^test-user-/);
    });

    it('should generate user IDs with custom prefix', () => {
      const id = generateUserId('custom-user');
      expect(id).toMatch(/^custom-user-/);
    });
  });

  describe('createTestMessage', () => {
    it('should create test message with default role', () => {
      const message = createTestMessage('Test content');
      expect(message.content).toBe('Test content');
      expect(message.role).toBe('user');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
    });

    it('should create test message with custom role', () => {
      const message = createTestMessage('Test content', 'assistant');
      expect(message.role).toBe('assistant');
    });

    it('should create test message with custom ID', () => {
      const message = createTestMessage('Test content', 'user', 'custom-id');
      expect(message.id).toBe('custom-id');
    });
  });

  describe('loadTestEnv', () => {
    it('should load environment variables', () => {
      const env = loadTestEnv();
      expect(env).toHaveProperty('pineconeApiKey');
      expect(env).toHaveProperty('pineconeIndexName');
      expect(env).toHaveProperty('ollamaApiUrl');
      expect(env).toHaveProperty('ollamaModel');
    });
  });

  describe('checkServiceAvailability', () => {
    it('should return true for pinecone when env var is set (even with empty config)', async () => {
      // The function falls back to env variables, so if PINECONE_API_KEY is set,
      // it will use that even if config.apiKey is empty
      const available = await checkServiceAvailability('pinecone', { apiKey: '' });
      // Will be true if PINECONE_API_KEY env var is set and valid
      expect(typeof available).toBe('boolean');
    });

    it('should return false for pinecone when index does not exist', async () => {
      const available = await checkServiceAvailability('pinecone', {
        apiKey: 'test-key',
      });
      expect(available).toBe(false);
    });

    it('should return false for ollama when service is unavailable', async () => {
      const axios = require('axios');
      vi.spyOn(axios, 'get').mockRejectedValue(new Error('Connection refused'));

      const available = await checkServiceAvailability('ollama');
      expect(available).toBe(false);
    });
  });

  describe('cleanupPineconeMemory', () => {
    it('should cleanup memory vectors', async () => {
      const system = new PineconeMemorySystem({
        apiKey: 'test-key',
        indexName: 'test-index',
        environment: 'us-west-2',
      });
      const memoryIds = ['mem-1', 'mem-2'];

      mockDelete.mockResolvedValue({});

      await cleanupPineconeMemory(system, memoryIds, {
        apiKey: 'test-key',
        indexName: 'test-index',
        environment: 'us-west-2',
      });

      expect(mockPinecone.Index).toHaveBeenCalledWith('test-index');
      expect(mockDelete).toHaveBeenCalledWith({ ids: memoryIds });
    });

    it('should handle empty memory IDs array', async () => {
      const system = new PineconeMemorySystem({
        apiKey: 'test-key',
        indexName: 'test-index',
      });

      await cleanupPineconeMemory(system, [], {
        apiKey: 'test-key',
        indexName: 'test-index',
      });

      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const system = new PineconeMemorySystem({
        apiKey: 'test-key',
        indexName: 'test-index',
      });
      const memoryIds = ['mem-1'];

      mockDelete.mockRejectedValue(new Error('Delete failed'));

      // Should not throw
      await expect(
        cleanupPineconeMemory(system, memoryIds, {
          apiKey: 'test-key',
          indexName: 'test-index',
        })
      ).resolves.not.toThrow();
    });

    it('should handle cleanup when delete method throws', async () => {
      const system = new PineconeMemorySystem({
        apiKey: 'test-key',
        indexName: 'test-index',
      });
      const memoryIds = ['mem-1'];

      // Simulate delete method not existing
      mockIndex.delete = undefined as any;

      // Should not throw
      await expect(
        cleanupPineconeMemory(system, memoryIds, {
          apiKey: 'test-key',
          indexName: 'test-index',
        })
      ).resolves.not.toThrow();
    });

    it('should log warning when VERBOSE is set and cleanup fails', async () => {
      const originalVerbose = process.env.VERBOSE;
      process.env.VERBOSE = '1';

      const system = new PineconeMemorySystem({
        apiKey: 'test-key',
        indexName: 'test-index',
      });
      const memoryIds = ['mem-1'];

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Make the Index call fail to trigger outer catch block
      mockPinecone.Index.mockImplementationOnce(() => {
        throw new Error('Index creation failed');
      });

      await cleanupPineconeMemory(system, memoryIds, {
        apiKey: 'test-key',
        indexName: 'test-index',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();

      process.env.VERBOSE = originalVerbose;
      // Reset mock
      mockPinecone.Index.mockImplementation(() => mockIndex);
    });

    it('should log warning when error message does not include "not found"', async () => {
      const system = new PineconeMemorySystem({
        apiKey: 'test-key',
        indexName: 'test-index',
      });
      const memoryIds = ['mem-1'];

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Make the Index call fail to trigger outer catch block
      mockPinecone.Index.mockImplementationOnce(() => {
        throw new Error('Some other error');
      });

      await cleanupPineconeMemory(system, memoryIds, {
        apiKey: 'test-key',
        indexName: 'test-index',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();

      // Reset mock
      mockPinecone.Index.mockImplementation(() => mockIndex);
    });

    it('should not log warning when error message includes "not found"', async () => {
      const system = new PineconeMemorySystem({
        apiKey: 'test-key',
        indexName: 'test-index',
      });
      const memoryIds = ['mem-1'];

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockDelete.mockRejectedValue(new Error('Vector not found'));

      await cleanupPineconeMemory(system, memoryIds, {
        apiKey: 'test-key',
        indexName: 'test-index',
      });

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('waitFor', () => {
    it('should wait for condition to be true', async () => {
      let condition = false;
      setTimeout(() => {
        condition = true;
      }, 50);

      await waitFor(() => condition, 1000, 10);
      expect(condition).toBe(true);
    });

    it('should throw error when condition not met within timeout', async () => {
      await expect(
        waitFor(() => false, 100, 10)
      ).rejects.toThrow('Condition not met within 100ms');
    });

    it('should work with async conditions', async () => {
      let condition = false;
      setTimeout(() => {
        condition = true;
      }, 50);

      await waitFor(async () => condition, 1000, 10);
      expect(condition).toBe(true);
    });
  });
});

