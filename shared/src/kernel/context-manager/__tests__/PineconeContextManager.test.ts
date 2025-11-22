import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PineconeContextManager } from '../implementations/PineconeContextManager';
import { PineconeConfig, Message, ConversationContext } from '../types';

// Mock @pinecone-database/pinecone module
const mockUpsert = vi.fn();
const mockFetch = vi.fn();
const mockQuery = vi.fn();
const mockIndex = {
  upsert: mockUpsert,
  fetch: mockFetch,
  query: mockQuery,
};

const mockPinecone = {
  Index: vi.fn(() => mockIndex),
};

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn(() => mockPinecone),
}));

describe('PineconeContextManager', () => {
  let manager: PineconeContextManager;
  let config: PineconeConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks properly
    mockFetch.mockReset();
    mockUpsert.mockReset();
    mockQuery.mockReset();
    config = {
      apiKey: 'test-api-key',
      indexName: 'test-index',
      useEmbeddings: false, // Disable embeddings for unit tests
    };
    manager = new PineconeContextManager(config);
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

    it('should use environment if provided in config', async () => {
      const configWithEnv: PineconeConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        environment: 'us-west-2',
      };
      const managerWithEnv = new PineconeContextManager(configWithEnv);
      expect(managerWithEnv).toBeDefined();
    });
  });

  describe('saveContext', () => {
    it('should save context to Pinecone', async () => {
      const sessionId = 'test-session-1';
      const context: ConversationContext = {
        sessionId,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext(sessionId, context);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      expect(upsertCall[0]).toHaveLength(1);
      expect(upsertCall[0][0].id).toBe(sessionId);
      expect(upsertCall[0][0].metadata.sessionId).toBe(sessionId);
    });

    it('should save context with messages in metadata', async () => {
      const sessionId = 'test-session-2';
      const context: ConversationContext = {
        sessionId,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext(sessionId, context);

      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      // Messages are stored as JSON string in Pinecone metadata
      const messages = JSON.parse(vectorData.metadata.messages as string);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Test message');
    });

    it('should save context with metadata', async () => {
      const sessionId = 'test-session-3';
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          createdAt: new Date().toISOString(),
          customField: 'custom-value',
        },
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext(sessionId, context);

      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      expect(vectorData.metadata.customField).toBe('custom-value');
    });

    it('should update metadata updatedAt when saving', async () => {
      const sessionId = 'test-session-4';
      const context: ConversationContext = {
        sessionId,
        messages: [],
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext(sessionId, context);

      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      expect(vectorData.metadata.updatedAt).toBeDefined();
    });

    it('should include empty vector values', async () => {
      const sessionId = 'test-session-5';
      const context: ConversationContext = {
        sessionId,
        messages: [],
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext(sessionId, context);

      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      expect(vectorData.values).toBeDefined();
      expect(Array.isArray(vectorData.values)).toBe(true);
    });
  });

  describe('getContext', () => {
    it('should return null if context does not exist', async () => {
      const sessionId = 'non-existent-session';
      mockFetch.mockResolvedValue({ records: {} });

      const context = await manager.getContext(sessionId);

      expect(context).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith([sessionId]);
    });

    it('should retrieve context from Pinecone', async () => {
      const sessionId = 'test-session-6';
      const context: ConversationContext = {
        sessionId,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      mockFetch.mockResolvedValue({
        records: {
          [sessionId]: {
            id: sessionId,
            metadata: {
              sessionId,
              messages: JSON.stringify(context.messages), // Messages stored as JSON string
            },
          },
        },
      });

      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
      expect(retrieved?.messages).toHaveLength(1);
      expect(retrieved?.messages[0].content).toBe('Test message');
      expect(mockFetch).toHaveBeenCalledWith([sessionId]);
    });

    it('should retrieve context with metadata', async () => {
      const sessionId = 'test-session-7';
      const createdAt = new Date().toISOString();

      mockFetch.mockResolvedValue({
        records: {
          [sessionId]: {
            id: sessionId,
            metadata: {
              sessionId,
              messages: JSON.stringify([]), // Messages stored as JSON string
              createdAt,
            },
          },
        },
      });

      const retrieved = await manager.getContext(sessionId);

      expect(retrieved?.metadata).toBeDefined();
      expect(retrieved?.metadata?.createdAt).toBe(createdAt);
    });
  });

  describe('addMessage', () => {
    it('should add message to existing context', async () => {
      const sessionId = 'test-session-8';
      const existingMessages = [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: 'First message',
          timestamp: new Date().toISOString(),
        },
      ];

      // First verify getContext returns the existing context correctly
      mockFetch.mockResolvedValueOnce({
        records: {
          [sessionId]: {
            id: sessionId,
            metadata: {
              sessionId,
              messages: JSON.stringify(existingMessages), // Messages stored as JSON string
            },
          },
        },
      });

      const retrievedContext = await manager.getContext(sessionId);
      expect(retrievedContext).not.toBeNull();
      expect(retrievedContext?.messages).toHaveLength(1);
      expect(retrievedContext?.messages[0].content).toBe('First message');

      // Reset mocks and set up for addMessage
      mockFetch.mockReset();
      mockUpsert.mockReset();

      // Mock fetch to return existing context when addMessage calls getContext
      mockFetch.mockResolvedValueOnce({
        records: {
          [sessionId]: {
            id: sessionId,
            metadata: {
              sessionId,
              messages: JSON.stringify(existingMessages), // Messages stored as JSON string
            },
          },
        },
      });
      mockUpsert.mockResolvedValue({});

      const newMessage: Message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Second message',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      // Verify fetch was called to get existing context
      expect(mockFetch).toHaveBeenCalledWith([sessionId]);
      
      // Verify upsert was called with merged messages
      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      // Messages are stored as JSON string in Pinecone metadata
      const messages = JSON.parse(vectorData.metadata.messages as string);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('Second message');
      expect(messages[1].id).toBe('msg-2');
    });

    it('should create new context if session does not exist when adding message', async () => {
      const sessionId = 'test-session-9';
      mockFetch.mockResolvedValue({ records: {} });
      mockUpsert.mockResolvedValue({});

      const newMessage: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'First message',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      expect(vectorData.id).toBe(sessionId);
      // Messages are stored as JSON string in Pinecone metadata
      const messages = JSON.parse(vectorData.metadata.messages as string);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('First message');
    });

    it('should preserve existing messages when adding new one', async () => {
      const sessionId = 'test-session-10';
      const existingMessages = [
        { id: 'msg-1', role: 'user' as const, content: 'Message 1', timestamp: new Date().toISOString() },
        { id: 'msg-2', role: 'assistant' as const, content: 'Message 2', timestamp: new Date().toISOString() },
      ];

      // Mock fetch to return existing context
      mockFetch.mockResolvedValueOnce({
        records: {
          [sessionId]: {
            id: sessionId,
            metadata: {
              sessionId,
              messages: JSON.stringify(existingMessages), // Messages stored as JSON string
            },
          },
        },
      });
      mockUpsert.mockResolvedValue({});

      const newMessage: Message = {
        id: 'msg-3',
        role: 'user',
        content: 'Message 3',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      // Verify fetch was called to get existing context
      expect(mockFetch).toHaveBeenCalledWith([sessionId]);

      // Verify upsert was called with all messages
      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      // Messages are stored as JSON string in Pinecone metadata
      const messages = JSON.parse(vectorData.metadata.messages as string);
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('Message 1');
      expect(messages[1].content).toBe('Message 2');
      expect(messages[2].content).toBe('Message 3');
    });

    it('should update metadata updatedAt when adding message', async () => {
      const sessionId = 'test-session-11';
      const createdAt = new Date().toISOString();

      // Mock getContext to return existing context
      mockFetch.mockResolvedValueOnce({
        records: {
          [sessionId]: {
            id: sessionId,
            metadata: {
              sessionId,
              messages: JSON.stringify([]), // Messages stored as JSON string
              createdAt,
            },
          },
        },
      });
      mockUpsert.mockResolvedValue({});

      // Wait a bit to ensure timestamps are different
      await new Promise(resolve => setTimeout(resolve, 10));

      const newMessage: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Test',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      expect(vectorData.metadata.createdAt).toBe(createdAt);
      expect(vectorData.metadata.updatedAt).toBeDefined();
      expect(vectorData.metadata.updatedAt).not.toBe(createdAt);
    });
  });

  describe('error handling', () => {
    it('should handle Pinecone fetch errors', async () => {
      const sessionId = 'test-session-error';
      mockFetch.mockRejectedValueOnce(new Error('Pinecone fetch failed'));

      await expect(manager.getContext(sessionId)).rejects.toThrow();
    });

    it('should handle Pinecone upsert errors', async () => {
      const sessionId = 'test-session-save-error';
      const context: ConversationContext = {
        sessionId,
        messages: [],
      };

      mockUpsert.mockRejectedValue(new Error('Pinecone upsert failed'));

      await expect(manager.saveContext(sessionId, context)).rejects.toThrow('Pinecone upsert failed');
    });
  });

  describe('embedding configuration', () => {
    it('should initialize with embeddings disabled', async () => {
      const managerNoEmbeddings = new PineconeContextManager({
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: false,
      });

      expect(managerNoEmbeddings).toBeDefined();

      const context: ConversationContext = {
        sessionId: 'test-session',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      mockUpsert.mockResolvedValue({});

      await managerNoEmbeddings.saveContext('test-session', context);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      // Should use empty vector (768 zeros) when embeddings disabled
      expect(vectorData.values).toHaveLength(768);
      expect(vectorData.values.every((v: number) => v === 0)).toBe(true);
    });

    it('should use empty vector when no messages', async () => {
      const context: ConversationContext = {
        sessionId: 'test-session',
        messages: [],
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext('test-session', context);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      // Should use empty vector when no messages
      expect(vectorData.values).toHaveLength(768);
      expect(vectorData.values.every((v: number) => v === 0)).toBe(true);
    });
  });

  describe('metadata handling', () => {
    it('should preserve custom metadata fields', async () => {
      const sessionId = 'test-session-metadata';
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          createdAt: '2024-01-01T00:00:00.000Z',
          customField: 'custom-value',
          userId: 'user-123',
        },
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext(sessionId, context);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      expect(vectorData.metadata.customField).toBe('custom-value');
      expect(vectorData.metadata.userId).toBe('user-123');
      expect(vectorData.metadata.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should handle null/undefined metadata gracefully', async () => {
      const sessionId = 'test-session-null-metadata';
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: undefined,
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext(sessionId, context);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      expect(vectorData.metadata).toBeDefined();
      expect(vectorData.metadata.sessionId).toBe(sessionId);
      expect(vectorData.metadata.createdAt).toBeDefined();
      expect(vectorData.metadata.updatedAt).toBeDefined();
    });

    it('should stringify complex metadata values', async () => {
      const sessionId = 'test-session-complex-metadata';
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          tags: ['tag1', 'tag2'],
          settings: { theme: 'dark' },
          count: 42,
        },
      };

      mockUpsert.mockResolvedValue({});

      await manager.saveContext(sessionId, context);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertCall = mockUpsert.mock.calls[0];
      const vectorData = upsertCall[0][0];
      // Complex objects should be stringified
      expect(typeof vectorData.metadata.tags).toBe('string');
      expect(typeof vectorData.metadata.settings).toBe('string');
      // Primitives should remain as-is
      expect(vectorData.metadata.count).toBe(42);
    });
  });

  describe('error handling', () => {
    it('should throw error when getContext fails', async () => {
      const sessionId = 'test-session-error';
      const error = new Error('Pinecone fetch error');
      mockFetch.mockRejectedValueOnce(error);

      await expect(manager.getContext(sessionId)).rejects.toThrow(
        'Failed to get context from Pinecone: Error: Pinecone fetch error'
      );
    });

    it('should throw error when saveContext fails', async () => {
      const sessionId = 'test-session-error';
      const context: ConversationContext = {
        sessionId,
        messages: [],
      };
      const error = new Error('Pinecone upsert error');
      mockUpsert.mockRejectedValueOnce(error);

      await expect(manager.saveContext(sessionId, context)).rejects.toThrow(
        'Failed to save context to Pinecone: Error: Pinecone upsert error'
      );
    });
  });
});

