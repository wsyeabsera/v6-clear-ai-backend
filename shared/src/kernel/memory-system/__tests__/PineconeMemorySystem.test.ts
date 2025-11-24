import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PineconeMemorySystem } from '../implementations/PineconeMemorySystem';
import { PineconeMemoryConfig } from '../types';

// Mock @pinecone-database/pinecone module
const mockUpsert = vi.fn();
const mockQuery = vi.fn();
const mockIndex = {
  upsert: mockUpsert,
  query: mockQuery,
};

const mockPinecone = {
  Index: vi.fn(() => mockIndex),
};

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn(() => mockPinecone),
}));

// Mock EmbeddingService
const mockGenerateEmbedding = vi.fn();
const mockGetEmptyEmbedding = vi.fn(() => new Array(768).fill(0));

vi.mock('../../context-manager/utils/embeddingService', () => ({
  EmbeddingService: vi.fn().mockImplementation(() => ({
    generateEmbedding: mockGenerateEmbedding,
    getEmptyEmbedding: mockGetEmptyEmbedding,
  })),
}));

describe('PineconeMemorySystem', () => {
  let memorySystem: PineconeMemorySystem;
  let config: PineconeMemoryConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockReset();
    mockQuery.mockReset();
    mockGenerateEmbedding.mockReset();
    config = {
      apiKey: 'test-api-key',
      indexName: 'test-index',
      useEmbeddings: false, // Disable embeddings for unit tests
    };
    memorySystem = new PineconeMemorySystem(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize Pinecone client with apiKey', async () => {
      const { Pinecone } = await import('@pinecone-database/pinecone');
      expect(Pinecone).toHaveBeenCalledWith(expect.objectContaining({ apiKey: config.apiKey }));
    });

    it('should get index with provided indexName', () => {
      expect(mockPinecone.Index).toHaveBeenCalledWith(config.indexName);
    });

    it('should use environment if provided in config', () => {
      const configWithEnv: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        environment: 'us-west-2',
      };
      const systemWithEnv = new PineconeMemorySystem(configWithEnv);
      expect(systemWithEnv).toBeDefined();
    });

    it('should initialize EmbeddingService when useEmbeddings is true', () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);
      expect(systemWithEmbeddings).toBeDefined();
    });
  });

  describe('storeShortTerm', () => {
    it('should store short-term memory in Pinecone', async () => {
      const sessionId = 'test-session-1';
      mockUpsert.mockResolvedValue({});

      await memorySystem.storeShortTerm(sessionId, 'Test memory');

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0]).toHaveLength(1);
      expect(upsertCall[0][0].metadata.sessionId).toBe(sessionId);
      expect(upsertCall[0][0].metadata.type).toBe('short-term');
      expect(upsertCall[0][0].metadata.content).toBe('Test memory');
    });

    it('should store object data as JSON string', async () => {
      const sessionId = 'test-session-2';
      const data = { key: 'value' };
      mockUpsert.mockResolvedValue({});

      await memorySystem.storeShortTerm(sessionId, data);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0][0].metadata.content).toContain('key');
    });

    it('should generate embedding when embeddings enabled', async () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);

      mockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.5));
      mockUpsert.mockResolvedValue({});

      await systemWithEmbeddings.storeShortTerm('session-1', 'Test');

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('Test');
      expect(mockUpsert).toHaveBeenCalled();
    });

    it('should use empty vector when embedding generation fails', async () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);

      mockGenerateEmbedding.mockRejectedValue(new Error('Embedding failed'));
      mockUpsert.mockResolvedValue({});

      await systemWithEmbeddings.storeShortTerm('session-1', 'Test');

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      // Fallback vector has first element as 0.0001 to avoid Pinecone's all-zero restriction
      const expectedVector = new Array(768).fill(0);
      expectedVector[0] = 0.0001;
      expect(upsertCall[0][0].values).toEqual(expectedVector);
    });
  });

  describe('storeLongTerm', () => {
    it('should store long-term memory in Pinecone', async () => {
      const userId = 'test-user-1';
      mockUpsert.mockResolvedValue({});

      await memorySystem.storeLongTerm(userId, 'Long-term memory');

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0][0].metadata.userId).toBe(userId);
      expect(upsertCall[0][0].metadata.type).toBe('long-term');
      expect(upsertCall[0][0].metadata.content).toBe('Long-term memory');
    });

    it('should generate embedding when embeddings enabled', async () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);

      mockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.5));
      mockUpsert.mockResolvedValue({});

      await systemWithEmbeddings.storeLongTerm('user-1', 'Test');

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('Test');
    });

    it('should use empty vector when long-term embedding generation fails', async () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);

      mockGenerateEmbedding.mockRejectedValue(new Error('Long-term embedding failed'));
      mockUpsert.mockResolvedValue({});

      await systemWithEmbeddings.storeLongTerm('user-1', 'Test');

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      // Fallback vector has first element as 0.0001 to avoid Pinecone's all-zero restriction
      const expectedVector = new Array(768).fill(0);
      expectedVector[0] = 0.0001;
      expect(upsertCall[0][0].values).toEqual(expectedVector);
    });

    it('should store object data with dataType metadata', async () => {
      const userId = 'test-user-5';
      const data = { key: 'value', number: 42 };
      mockUpsert.mockResolvedValue({});

      await memorySystem.storeLongTerm(userId, data);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0][0].metadata.dataType).toBe('object');
    });
  });

  describe('searchSimilar', () => {
    it('should return empty array for empty query', async () => {
      const results = await memorySystem.searchSimilar('');
      expect(results).toHaveLength(0);
    });

    it('should search Pinecone with query embedding', async () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);

      const queryVector = new Array(768).fill(0.5);
      mockGenerateEmbedding.mockResolvedValue(queryVector);
      mockQuery.mockResolvedValue({
        matches: [
          {
            id: 'mem-1',
            score: 0.9,
            metadata: {
              content: 'Test memory',
              sessionId: 'session-1',
              type: 'short-term',
              timestamp: new Date().toISOString(),
            },
          },
        ],
      });

      const results = await systemWithEmbeddings.searchSimilar('test query');

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('test query');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: queryVector,
          topK: 10,
          includeMetadata: true,
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Test memory');
    });

    it('should respect limit parameter', async () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);

      mockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.5));
      mockQuery.mockResolvedValue({ matches: [] });

      await systemWithEmbeddings.searchSimilar('query', 5);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          topK: 5,
        })
      );
    });

    it('should use empty vector when embeddings disabled', async () => {
      mockQuery.mockResolvedValue({ matches: [] });

      await memorySystem.searchSimilar('query');

      // Fallback vector has first element as 0.0001 to avoid Pinecone's all-zero restriction
      const expectedVector = new Array(768).fill(0);
      expectedVector[0] = 0.0001;
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: expectedVector,
        })
      );
    });

    it('should use empty vector when query embedding generation fails', async () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);

      mockGenerateEmbedding.mockRejectedValue(new Error('Query embedding failed'));
      mockQuery.mockResolvedValue({ matches: [] });

      await systemWithEmbeddings.searchSimilar('query');

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('query');
      // Fallback vector has first element as 0.0001 to avoid Pinecone's all-zero restriction
      const expectedVector = new Array(768).fill(0);
      expectedVector[0] = 0.0001;
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          vector: expectedVector,
        })
      );
    });

    it('should convert Pinecone results to Memory objects', async () => {
      const configWithEmbeddings: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
      };
      const systemWithEmbeddings = new PineconeMemorySystem(configWithEmbeddings);

      mockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.5));
      mockQuery.mockResolvedValue({
        matches: [
          {
            id: 'mem-1',
            score: 0.95,
            metadata: {
              content: 'Memory content',
              sessionId: 'session-1',
              userId: 'user-1',
              type: 'short-term',
              timestamp: '2024-01-01T00:00:00Z',
            },
          },
        ],
      });

      const results = await systemWithEmbeddings.searchSimilar('query');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('mem-1');
      expect(results[0].content).toBe('Memory content');
      expect(results[0].metadata?.sessionId).toBe('session-1');
      expect(results[0].metadata?.score).toBe(0.95);
    });
  });

  describe('getConversationHistory', () => {
    it('should query Pinecone for session memories', async () => {
      const sessionId = 'test-session-3';
      mockQuery.mockResolvedValue({
        matches: [
          {
            id: 'mem-1',
            metadata: {
              content: JSON.stringify({
                id: 'msg-1',
                role: 'user',
                content: 'Hello',
                timestamp: '2024-01-01T00:00:00Z',
              }),
              sessionId,
              type: 'short-term',
              timestamp: '2024-01-01T00:00:00Z',
            },
          },
        ],
      });

      const history = await memorySystem.getConversationHistory(sessionId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            sessionId: { $eq: sessionId },
            type: { $eq: 'short-term' },
          },
        })
      );
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Hello');
    });

    it('should return empty array when no memories found', async () => {
      mockQuery.mockResolvedValue({ matches: [] });

      const history = await memorySystem.getConversationHistory('non-existent');

      expect(history).toHaveLength(0);
    });

    it('should create message from content if not JSON', async () => {
      const sessionId = 'test-session-4';
      mockQuery.mockResolvedValue({
        matches: [
          {
            id: 'mem-1',
            metadata: {
              content: 'Plain text content',
              sessionId,
              type: 'short-term',
              timestamp: '2024-01-01T00:00:00Z',
            },
          },
        ],
      });

      const history = await memorySystem.getConversationHistory(sessionId);

      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Plain text content');
      expect(history[0].role).toBe('user');
    });

    it('should sort messages by timestamp', async () => {
      const sessionId = 'test-session-5';
      mockQuery.mockResolvedValue({
        matches: [
          {
            id: 'mem-2',
            metadata: {
              content: JSON.stringify({
                id: 'msg-2',
                role: 'assistant',
                content: 'Second',
                timestamp: '2024-01-01T02:00:00Z',
              }),
              sessionId,
              type: 'short-term',
              timestamp: '2024-01-01T02:00:00Z',
            },
          },
          {
            id: 'mem-1',
            metadata: {
              content: JSON.stringify({
                id: 'msg-1',
                role: 'user',
                content: 'First',
                timestamp: '2024-01-01T01:00:00Z',
              }),
              sessionId,
              type: 'short-term',
              timestamp: '2024-01-01T01:00:00Z',
            },
          },
        ],
      });

      const history = await memorySystem.getConversationHistory(sessionId);

      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('First');
      expect(history[1].content).toBe('Second');
    });
  });

  describe('error handling', () => {
    it('should handle Pinecone upsert errors for short-term', async () => {
      mockUpsert.mockRejectedValue(new Error('Pinecone error'));

      await expect(
        memorySystem.storeShortTerm('session-1', 'Test')
      ).rejects.toThrow('Failed to store short-term memory');
    });

    it('should handle Pinecone upsert errors for long-term', async () => {
      mockUpsert.mockRejectedValue(new Error('Pinecone error'));

      await expect(
        memorySystem.storeLongTerm('user-1', 'Test')
      ).rejects.toThrow('Failed to store long-term memory');
    });

    it('should handle Pinecone query errors', async () => {
      mockQuery.mockRejectedValue(new Error('Pinecone query error'));

      await expect(memorySystem.searchSimilar('query')).rejects.toThrow(
        'Failed to search similar memories'
      );
    });

    it('should handle conversation history query errors', async () => {
      mockQuery.mockRejectedValue(new Error('Pinecone query error'));

      await expect(
        memorySystem.getConversationHistory('session-1')
      ).rejects.toThrow('Failed to get conversation history');
    });
  });
});

