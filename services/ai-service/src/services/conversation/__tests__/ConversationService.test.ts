import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationService } from '../ConversationService';
import { Database } from '../../../database';
import { KernelAdapter } from '../../../kernel/KernelAdapter';
import { ConversationContext, Message } from 'shared';

// Mock dependencies
vi.mock('../../../database');
vi.mock('../../../kernel/KernelAdapter');
vi.mock('mongodb');

describe('ConversationService', () => {
  let conversationService: ConversationService;
  let mockDb: any;
  let mockKernelAdapter: any;
  let mockContextManager: any;
  let mockCollection: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock MongoDB collection
    mockCollection = {
      findOne: vi.fn(),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    };

    // Mock Database
    mockDb = {
      getCollection: vi.fn().mockReturnValue(mockCollection),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    (Database as any).mockImplementation(() => mockDb);

    // Mock Context Manager
    mockContextManager = {
      getContext: vi.fn(),
      saveContext: vi.fn(),
      addMessage: vi.fn(),
    };

    // Mock KernelAdapter
    mockKernelAdapter = {
      contextManager: mockContextManager,
    };
    (KernelAdapter as any).mockImplementation(() => mockKernelAdapter);

    conversationService = new ConversationService(mockDb, mockKernelAdapter);
  });

  describe('getOrCreateSession', () => {
    it('should return existing session if found', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';

      mockCollection.findOne.mockResolvedValue({
        sessionId,
        userId,
        messages: [],
        createdAt: new Date().toISOString(),
      });

      const result = await conversationService.getOrCreateSession(userId, sessionId);

      expect(result).toBe(sessionId);
      expect(mockCollection.findOne).toHaveBeenCalledWith({ sessionId, userId });
    });

    it('should create new session if not found', async () => {
      const userId = 'user-123';
      const sessionId = 'session-456';

      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'new-id' });

      const result = await conversationService.getOrCreateSession(userId, sessionId);

      expect(result).toBe(sessionId);
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          userId,
          messages: [],
        })
      );
    });

    it('should auto-generate sessionId if not provided', async () => {
      const userId = 'user-123';

      mockCollection.insertOne.mockResolvedValue({ insertedId: 'new-id' });

      const result = await conversationService.getOrCreateSession(userId);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });
  });

  describe('getConversationHistory', () => {
    it('should return messages from MongoDB', async () => {
      const sessionId = 'session-123';
      const messages: Message[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date().toISOString(),
        },
      ];

      mockCollection.findOne.mockResolvedValue({
        sessionId,
        messages,
      });

      const result = await conversationService.getConversationHistory(sessionId);

      expect(result).toEqual(messages);
      expect(mockCollection.findOne).toHaveBeenCalledWith({ sessionId });
    });

    it('should return empty array if conversation not found', async () => {
      const sessionId = 'session-123';

      mockCollection.findOne.mockResolvedValue(null);

      const result = await conversationService.getConversationHistory(sessionId);

      expect(result).toEqual([]);
    });
  });

  describe('addMessage', () => {
    it('should add message to MongoDB and Context Manager', async () => {
      const sessionId = 'session-123';
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });
      mockContextManager.getContext.mockResolvedValue({
        sessionId,
        messages: [],
      });

      await conversationService.addMessage(sessionId, message);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { sessionId },
        expect.objectContaining({
          $push: { messages: message },
          $set: expect.objectContaining({
            updatedAt: expect.any(String),
          }),
        }),
        { upsert: true }
      );
      expect(mockContextManager.saveContext).toHaveBeenCalled();
    });

    it('should create new context if Context Manager has none', async () => {
      const sessionId = 'session-123';
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });
      mockContextManager.getContext.mockResolvedValue(null);

      await conversationService.addMessage(sessionId, message);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { sessionId },
        expect.objectContaining({
          $push: { messages: message },
        }),
        { upsert: true }
      );
      expect(mockContextManager.saveContext).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          sessionId,
          messages: [message],
        })
      );
    });

    it('should handle Context Manager errors gracefully', async () => {
      const sessionId = 'session-123';
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });
      mockContextManager.getContext.mockRejectedValue(new Error('Context error'));

      // Should not throw
      await expect(conversationService.addMessage(sessionId, message)).resolves.not.toThrow();
    });

    it('should create conversation if it does not exist (upsert)', async () => {
      const sessionId = 'session-123';
      const userId = 'user-123';
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      };

      // First update creates the document (upsert)
      mockCollection.updateOne.mockResolvedValueOnce({ modifiedCount: 0, upsertedCount: 1 });
      // Second update sets createdAt
      mockCollection.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });
      mockContextManager.getContext.mockResolvedValue(null);

      await conversationService.addMessage(sessionId, message, userId);

      // Should be called twice: once for upsert, once for createdAt
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
      expect(mockCollection.updateOne).toHaveBeenNthCalledWith(
        1,
        { sessionId },
        expect.objectContaining({
          $push: { messages: message },
          $set: expect.objectContaining({
            updatedAt: expect.any(String),
            userId,
          }),
        }),
        { upsert: true }
      );
    });
  });

  describe('getAgentConfig', () => {
    it('should return default config if configId not provided', async () => {
      const userId = 'user-123';

      const config = await conversationService.getAgentConfig(userId);

      expect(config).toBeDefined();
      expect(config?.id).toBe('default');
      expect(config?.userId).toBe(userId);
      expect(config?.model).toBeDefined();
    });

    it('should query MongoDB for agent config', async () => {
      const userId = 'user-123';
      const configId = 'config-456';
      const mockConfig = {
        id: configId,
        userId,
        name: 'Test Config',
        prompt: 'You are helpful',
        model: 'llama2',
        temperature: 0.7,
        maxTokens: 1024,
        createdAt: new Date().toISOString(),
      };

      // Mock MongoDB client for agent configs
      const { MongoClient } = await import('mongodb');
      const mockMongoClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        db: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            findOne: vi.fn().mockResolvedValue(mockConfig),
          }),
        }),
      };
      vi.mocked(MongoClient).mockImplementation(() => mockMongoClient as any);

      process.env.AGENT_CONFIGS_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/agent_configs_service';

      const config = await conversationService.getAgentConfig(userId, configId);

      expect(config).toBeDefined();
      expect(config?.id).toBe(configId);
    });

    it('should return null if config not found', async () => {
      const userId = 'user-123';
      const configId = 'non-existent';

      // Mock MongoDB client
      const { MongoClient } = await import('mongodb');
      const mockMongoClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        db: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            findOne: vi.fn().mockResolvedValue(null),
          }),
        }),
      };
      vi.mocked(MongoClient).mockImplementation(() => mockMongoClient as any);

      process.env.AGENT_CONFIGS_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/agent_configs_service';

      const config = await conversationService.getAgentConfig(userId, configId);

      expect(config).toBeNull();
    });

    it('should handle MongoDB errors gracefully', async () => {
      const userId = 'user-123';
      const configId = 'config-456';

      // Mock MongoDB client to throw error
      const { MongoClient } = await import('mongodb');
      const mockMongoClient = {
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      vi.mocked(MongoClient).mockImplementation(() => mockMongoClient as any);

      process.env.AGENT_CONFIGS_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/agent_configs_service';

      const config = await conversationService.getAgentConfig(userId, configId);

      expect(config).toBeNull();
    });
  });

  describe('getConversationContext', () => {
    it('should get context from Context Manager', async () => {
      const sessionId = 'session-123';
      const mockContext: ConversationContext = {
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

      mockContextManager.getContext.mockResolvedValue(mockContext);

      const result = await conversationService.getConversationContext(sessionId);

      expect(result).toEqual(mockContext);
      expect(mockContextManager.getContext).toHaveBeenCalledWith(sessionId);
    });

    it('should fallback to MongoDB if Context Manager fails', async () => {
      const sessionId = 'session-123';
      const createdAt = new Date().toISOString();
      const messages: Message[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          timestamp: createdAt,
        },
      ];

      mockContextManager.getContext.mockRejectedValue(new Error('Context error'));
      mockCollection.findOne.mockResolvedValue({
        sessionId,
        messages,
        createdAt,
      });

      const result = await conversationService.getConversationContext(sessionId);

      expect(result).toEqual({
        sessionId,
        messages,
        metadata: {
          createdAt,
          updatedAt: undefined,
        },
      });
    });

    it('should return null if no context found', async () => {
      const sessionId = 'session-123';

      mockContextManager.getContext.mockRejectedValue(new Error('Context error'));
      mockCollection.findOne.mockResolvedValue(null);

      const result = await conversationService.getConversationContext(sessionId);

      expect(result).toBeNull();
    });
  });

  describe('getUserPreferences', () => {
    it('should return empty object (placeholder)', async () => {
      const userId = 'user-123';

      const result = await conversationService.getUserPreferences(userId);

      expect(result).toEqual({});
    });
  });
});

