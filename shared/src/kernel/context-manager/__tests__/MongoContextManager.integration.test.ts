import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { MongoContextManager } from '../implementations/MongoContextManager';
import { MongoConfig } from '../types';
import { MongoClient } from 'mongodb';
import {
  generateSessionId,
  createTestMessage,
  createTestContext,
  createTestMessages,
  cleanupMongo,
  loadTestEnv,
  checkServiceAvailability,
} from './integration/utils';

describe('MongoContextManager Integration Tests', () => {
  let manager: MongoContextManager;
  let config: MongoConfig;
  let testSessionIds: string[] = [];
  let mongoAvailable = false;

  beforeAll(async () => {
    const env = loadTestEnv();
    mongoAvailable = await checkServiceAvailability('mongo', {
      connectionString: env.mongoConnectionString,
    });
  });

  beforeEach(async () => {
    if (!mongoAvailable) {
      console.warn('MongoDB not available, skipping integration tests');
      return;
    }

    const env = loadTestEnv();
    config = {
      connectionString: env.mongoConnectionString,
      databaseName: env.mongoDatabaseName,
      collectionName: 'contexts',
    };

    manager = new MongoContextManager(config);
    testSessionIds = [];

    // Wait for connection to be established
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (!mongoAvailable) return;

    // Clean up all test documents
    if (testSessionIds.length > 0) {
      await cleanupMongo(manager, testSessionIds, config);
    }
    testSessionIds = [];
  });

  describe('Basic CRUD Operations', () => {
    it('should save context to MongoDB and retrieve it', async () => {
      if (!mongoAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Hello', 'user'),
        createTestMessage('Hi there!', 'assistant'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[0].content).toBe('Hello');
      expect(retrieved?.messages[1].content).toBe('Hi there!');
    });

    it('should add message to existing context', async () => {
      if (!mongoAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const initialContext = createTestContext(sessionId, [
        createTestMessage('First message', 'user'),
      ]);

      await manager.saveContext(sessionId, initialContext);

      const newMessage = createTestMessage('Second message', 'assistant');
      await manager.addMessage(sessionId, newMessage);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[1].content).toBe('Second message');
    });

    it('should overwrite existing context when saving again', async () => {
      if (!mongoAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context1 = createTestContext(sessionId, [
        createTestMessage('First', 'user'),
      ]);

      await manager.saveContext(sessionId, context1);

      const context2 = createTestContext(sessionId, [
        createTestMessage('Second', 'user'),
        createTestMessage('Third', 'assistant'),
      ]);

      await manager.saveContext(sessionId, context2);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[0].content).toBe('Second');
    });

    it('should return null for non-existent session', async () => {
      if (!mongoAvailable) return;

      const sessionId = generateSessionId();
      const retrieved = await manager.getContext(sessionId);
      expect(retrieved).toBeNull();
    });
  });

  describe('Multi-Session Operations', () => {
    it('should handle multiple sessions in parallel', async () => {
      if (!mongoAvailable) return;

      const sessionIds = Array.from({ length: 5 }, () => generateSessionId());
      testSessionIds.push(...sessionIds);

      // Create contexts for all sessions
      const contexts = sessionIds.map((sessionId, index) =>
        createTestContext(sessionId, [
          createTestMessage(`Message for session ${index}`, 'user'),
        ])
      );

      // Save all contexts in parallel
      await Promise.all(
        contexts.map((context) => manager.saveContext(context.sessionId, context))
      );

      // Retrieve all contexts in parallel
      const retrieved = await Promise.all(
        sessionIds.map((id) => manager.getContext(id))
      );

      // Verify all contexts were saved and retrieved correctly
      retrieved.forEach((context, index) => {
        expect(context).not.toBeNull();
        expect(context?.sessionId).toBe(sessionIds[index]);
        expect(context?.messages[0].content).toContain(`session ${index}`);
      });
    });

    it('should maintain session isolation', async () => {
      if (!mongoAvailable) return;

      const sessionId1 = generateSessionId();
      const sessionId2 = generateSessionId();
      testSessionIds.push(sessionId1, sessionId2);

      const context1 = createTestContext(sessionId1, [
        createTestMessage('Session 1 message', 'user'),
      ]);

      const context2 = createTestContext(sessionId2, [
        createTestMessage('Session 2 message', 'user'),
      ]);

      await manager.saveContext(sessionId1, context1);
      await manager.saveContext(sessionId2, context2);

      const retrieved1 = await manager.getContext(sessionId1);
      const retrieved2 = await manager.getContext(sessionId2);

      expect(retrieved1?.messages[0].content).toBe('Session 1 message');
      expect(retrieved2?.messages[0].content).toBe('Session 2 message');
      expect(retrieved1?.sessionId).not.toBe(retrieved2?.sessionId);
    });

    it('should handle multiple messages across sessions', async () => {
      if (!mongoAvailable) return;

      const sessionIds = Array.from({ length: 3 }, () => generateSessionId());
      testSessionIds.push(...sessionIds);

      // Add multiple messages to each session
      for (const sessionId of sessionIds) {
        for (let i = 0; i < 3; i++) {
          await manager.addMessage(
            sessionId,
            createTestMessage(`Message ${i + 1}`, i % 2 === 0 ? 'user' : 'assistant')
          );
        }
      }

      // Verify all sessions have correct message counts
      for (const sessionId of sessionIds) {
        const context = await manager.getContext(sessionId);
        expect(context?.messages).toHaveLength(3);
      }
    });
  });

  describe('Collection Management', () => {
    it('should use default collection name if not provided', async () => {
      if (!mongoAvailable) return;

      const env = loadTestEnv();
      const managerWithDefault = new MongoContextManager({
        connectionString: env.mongoConnectionString,
        databaseName: env.mongoDatabaseName,
      });

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Test', 'user'),
      ]);

      await managerWithDefault.saveContext(sessionId, context);
      const retrieved = await managerWithDefault.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
    });

    it('should use custom collection name if provided', async () => {
      if (!mongoAvailable) return;

      const env = loadTestEnv();
      const customCollectionName = 'custom-contexts-test';
      const managerWithCustom = new MongoContextManager({
        connectionString: env.mongoConnectionString,
        databaseName: env.mongoDatabaseName,
        collectionName: customCollectionName,
      });

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Test', 'user'),
      ]);

      await managerWithCustom.saveContext(sessionId, context);

      // Verify it's in the custom collection
      const client = new MongoClient(env.mongoConnectionString);
      await client.connect();
      const db = client.db(env.mongoDatabaseName);
      const collection = db.collection(customCollectionName);
      const doc = await collection.findOne({ sessionId });
      await client.close();

      expect(doc).not.toBeNull();
      expect(doc?.sessionId).toBe(sessionId);

      // Cleanup custom collection
      await cleanupMongo(
        managerWithCustom,
        [sessionId],
        {
          connectionString: env.mongoConnectionString,
          databaseName: env.mongoDatabaseName,
          collectionName: customCollectionName,
        }
      );
    });
  });

  describe('Conversation Flow', () => {
    it('should maintain full conversation history', async () => {
      if (!mongoAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const messages = createTestMessages(10);

      for (const message of messages) {
        await manager.addMessage(sessionId, message);
      }

      const context = await manager.getContext(sessionId);
      expect(context?.messages).toHaveLength(10);
      expect(context?.messages[0].content).toBe('Test message 1');
      expect(context?.messages[9].content).toBe('Test message 10');
    });

    it('should preserve metadata across operations', async () => {
      if (!mongoAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(
        sessionId,
        [createTestMessage('Test', 'user')],
        {
          customField: 'custom-value',
          userId: 'user-123',
        }
      );

      await manager.saveContext(sessionId, context);

      await manager.addMessage(sessionId, createTestMessage('Another message', 'assistant'));

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.metadata?.customField).toBe('custom-value');
      expect(retrieved?.metadata?.userId).toBe('user-123');
      expect(retrieved?.metadata?.updatedAt).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid connection string gracefully', async () => {
      const invalidManager = new MongoContextManager({
        connectionString: 'mongodb://invalid:27017',
        databaseName: 'test',
      });

      const sessionId = generateSessionId();

      await expect(
        invalidManager.getContext(sessionId)
      ).rejects.toThrow();
    });
  });
});

