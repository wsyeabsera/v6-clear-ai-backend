import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MongoConfig, Message, ConversationContext } from '../types';

// Create mocks
const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();
const mockInsertOne = vi.fn();

const mockCollection = {
  findOne: mockFindOne,
  updateOne: mockUpdateOne,
  insertOne: mockInsertOne,
};

const mockDb = {
  collection: vi.fn(() => mockCollection),
};

const mockClientInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  db: vi.fn(() => mockDb),
  close: vi.fn(),
};

// Mock mongodb module
vi.mock('mongodb', () => {
  return {
    MongoClient: vi.fn().mockImplementation(() => mockClientInstance),
  };
});

import { MongoContextManager } from '../implementations/MongoContextManager';

describe('MongoContextManager', () => {
  let manager: MongoContextManager;
  const config: MongoConfig = {
    connectionString: 'mongodb://localhost:27017',
    databaseName: 'test-db',
    collectionName: 'contexts',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClientInstance.connect.mockResolvedValue(undefined);
    mockDb.collection.mockReturnValue(mockCollection);
    manager = new MongoContextManager(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should connect to MongoDB on initialization', async () => {
      await manager.getContext('test'); // Trigger connection
      expect(mockClientInstance.connect).toHaveBeenCalled();
    });

    it('should use default collection name if not provided', async () => {
      const configWithoutCollection: MongoConfig = {
        connectionString: 'mongodb://localhost:27017',
        databaseName: 'test-db',
      };
      const managerWithoutCollection = new MongoContextManager(configWithoutCollection);
      // Accessing the collection will trigger initialization
      await managerWithoutCollection.getContext('test');
      expect(mockDb.collection).toHaveBeenCalledWith('contexts');
    });

    it('should use custom collection name if provided', async () => {
      const configWithCollection: MongoConfig = {
        connectionString: 'mongodb://localhost:27017',
        databaseName: 'test-db',
        collectionName: 'custom-contexts',
      };
      const managerWithCollection = new MongoContextManager(configWithCollection);
      await managerWithCollection.getContext('test');
      expect(mockDb.collection).toHaveBeenCalledWith('custom-contexts');
    });
  });

  describe('saveContext', () => {
    it('should save context to MongoDB collection', async () => {
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

      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      await manager.saveContext(sessionId, context);

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { sessionId },
        { $set: expect.objectContaining({ sessionId, messages: context.messages }) },
        { upsert: true }
      );
    });

    it('should save context with metadata', async () => {
      const sessionId = 'test-session-2';
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          createdAt: new Date().toISOString(),
          customField: 'custom-value',
        },
      };

      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      await manager.saveContext(sessionId, context);

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { sessionId },
        { $set: expect.objectContaining({ metadata: expect.objectContaining({ customField: 'custom-value' }) }) },
        { upsert: true }
      );
    });

    it('should update metadata updatedAt when saving', async () => {
      const sessionId = 'test-session-3';
      const context: ConversationContext = {
        sessionId,
        messages: [],
      };

      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      await manager.saveContext(sessionId, context);

      const updateCall = mockUpdateOne.mock.calls[0];
      const updateDoc = updateCall[1].$set;
      expect(updateDoc.metadata?.updatedAt).toBeDefined();
    });
  });

  describe('getContext', () => {
    it('should return null if context does not exist', async () => {
      const sessionId = 'non-existent-session';
      mockFindOne.mockResolvedValue(null);

      const context = await manager.getContext(sessionId);

      expect(context).toBeNull();
      expect(mockFindOne).toHaveBeenCalledWith({ sessionId });
    });

    it('should retrieve context from MongoDB', async () => {
      const sessionId = 'test-session-4';
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

      mockFindOne.mockResolvedValue(context);

      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
      expect(retrieved?.messages).toHaveLength(1);
      expect(retrieved?.messages[0].content).toBe('Test message');
      expect(mockFindOne).toHaveBeenCalledWith({ sessionId });
    });

    it('should retrieve context with metadata', async () => {
      const sessionId = 'test-session-5';
      const context: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          createdAt: new Date().toISOString(),
        },
      };

      mockFindOne.mockResolvedValue(context);

      const retrieved = await manager.getContext(sessionId);

      expect(retrieved?.metadata).toBeDefined();
      expect(retrieved?.metadata?.createdAt).toBeDefined();
    });
  });

  describe('addMessage', () => {
    it('should add message to existing context', async () => {
      const sessionId = 'test-session-6';
      const existingContext: ConversationContext = {
        sessionId,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'First message',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      mockFindOne.mockResolvedValue(existingContext);
      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      const newMessage: Message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Second message',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { sessionId },
        {
          $push: { messages: newMessage },
          $set: {
            'metadata.updatedAt': expect.any(String),
          },
        },
        { upsert: false }
      );
    });

    it('should create new context if session does not exist when adding message', async () => {
      const sessionId = 'test-session-7';
      mockFindOne.mockResolvedValue(null);
      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      const newMessage: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'First message',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { sessionId },
        expect.objectContaining({
          $set: expect.objectContaining({
            sessionId,
            messages: [newMessage],
          }),
        }),
        { upsert: true }
      );
    });

    it('should preserve existing messages when adding new one', async () => {
      const sessionId = 'test-session-8';
      const existingContext: ConversationContext = {
        sessionId,
        messages: [
          { id: 'msg-1', role: 'user', content: 'Message 1', timestamp: new Date().toISOString() },
          { id: 'msg-2', role: 'assistant', content: 'Message 2', timestamp: new Date().toISOString() },
        ],
      };

      mockFindOne.mockResolvedValue(existingContext);
      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      const newMessage: Message = {
        id: 'msg-3',
        role: 'user',
        content: 'Message 3',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      // Verify that $push was used to add to existing messages
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { sessionId },
        expect.objectContaining({
          $push: { messages: newMessage },
        }),
        { upsert: false }
      );
    });

    it('should update metadata updatedAt when adding message', async () => {
      const sessionId = 'test-session-9';
      const existingContext: ConversationContext = {
        sessionId,
        messages: [],
        metadata: {
          createdAt: new Date().toISOString(),
        },
      };

      mockFindOne.mockResolvedValue(existingContext);
      mockUpdateOne.mockResolvedValue({ acknowledged: true });

      const newMessage: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Test',
        timestamp: new Date().toISOString(),
      };

      await manager.addMessage(sessionId, newMessage);

      const updateCall = mockUpdateOne.mock.calls[0];
      const updateDoc = updateCall[1];
      expect(updateDoc.$set['metadata.updatedAt']).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle MongoDB connection errors', async () => {
      mockClientInstance.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const errorManager = new MongoContextManager(config);
      await expect(errorManager.getContext('test')).rejects.toThrow();
    });

    it('should handle query errors when getting context', async () => {
      const sessionId = 'test-session-error';
      mockFindOne.mockRejectedValue(new Error('Query failed'));

      await expect(manager.getContext(sessionId)).rejects.toThrow();
    });

    it('should handle save errors', async () => {
      const sessionId = 'test-session-save-error';
      const context: ConversationContext = {
        sessionId,
        messages: [],
      };

      mockUpdateOne.mockRejectedValue(new Error('Save failed'));

      await expect(manager.saveContext(sessionId, context)).rejects.toThrow();
    });
  });
});

