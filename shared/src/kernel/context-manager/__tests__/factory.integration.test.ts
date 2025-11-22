import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { ContextManagerFactory } from '../factory';
import { ContextManagerType, LocalFileConfig, MongoConfig, PineconeConfig } from '../types';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import {
  generateSessionId,
  createTestContext,
  createTestMessage,
  cleanupLocalFile,
  cleanupMongo,
  cleanupPinecone,
  loadTestEnv,
  checkServiceAvailability,
} from './integration/utils';
import { LocalFileContextManager } from '../implementations/LocalFileContextManager';
import { MongoContextManager } from '../implementations/MongoContextManager';
import { PineconeContextManager } from '../implementations/PineconeContextManager';

describe('ContextManagerFactory Integration Tests', () => {
  const testBasePath = join(process.cwd(), 'test-factory-integration-storage');
  let testSessionIds: string[] = [];
  let mongoAvailable = false;
  let pineconeAvailable = false;
  let ollamaAvailable = false;

  beforeAll(async () => {
    const env = loadTestEnv();
    mongoAvailable = await checkServiceAvailability('mongo', {
      connectionString: env.mongoConnectionString,
    });
    pineconeAvailable = await checkServiceAvailability('pinecone', {
      apiKey: env.pineconeApiKey,
    });
    ollamaAvailable = await checkServiceAvailability('ollama');

    // Clean up test directory
    if (existsSync(testBasePath)) {
      rmSync(testBasePath, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    testSessionIds = [];
  });

  afterEach(async () => {
    // Clean up test session IDs
    testSessionIds = [];
  });

  afterAll(async () => {
    // Clean up test directory
    if (existsSync(testBasePath)) {
      rmSync(testBasePath, { recursive: true, force: true });
    }
  });

  describe('LocalFile Manager Creation', () => {
    it('should create LocalFileContextManager with real config', () => {
      const config: LocalFileConfig = {
        basePath: testBasePath,
      };

      const manager = ContextManagerFactory.create(ContextManagerType.LOCAL, config);

      expect(manager).toBeInstanceOf(LocalFileContextManager);
      expect(manager).toHaveProperty('getContext');
      expect(manager).toHaveProperty('saveContext');
      expect(manager).toHaveProperty('addMessage');
    });

    it('should work with LocalFile manager for real operations', async () => {
      const config: LocalFileConfig = {
        basePath: testBasePath,
      };

      const manager = ContextManagerFactory.create(ContextManagerType.LOCAL, config) as LocalFileContextManager;
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Factory test', 'user'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.messages[0].content).toBe('Factory test');

      // Cleanup
      await cleanupLocalFile(manager, [sessionId], testBasePath);
    });
  });

  describe('Mongo Manager Creation', () => {
    it('should create MongoContextManager with real config', () => {
      if (!mongoAvailable) return;

      const env = loadTestEnv();
      const config: MongoConfig = {
        connectionString: env.mongoConnectionString,
        databaseName: env.mongoDatabaseName,
      };

      const manager = ContextManagerFactory.create(ContextManagerType.MONGO, config);

      expect(manager).toBeInstanceOf(MongoContextManager);
      expect(manager).toHaveProperty('getContext');
      expect(manager).toHaveProperty('saveContext');
      expect(manager).toHaveProperty('addMessage');
    });

    it('should work with Mongo manager for real operations', async () => {
      if (!mongoAvailable) return;

      const env = loadTestEnv();
      const config: MongoConfig = {
        connectionString: env.mongoConnectionString,
        databaseName: env.mongoDatabaseName,
        collectionName: 'contexts',
      };

      const manager = ContextManagerFactory.create(ContextManagerType.MONGO, config) as MongoContextManager;
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Factory test', 'user'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.messages[0].content).toBe('Factory test');

      // Cleanup
      await cleanupMongo(manager, [sessionId], config);
    });

    it('should use custom collection name when provided', async () => {
      if (!mongoAvailable) return;

      const env = loadTestEnv();
      const config: MongoConfig = {
        connectionString: env.mongoConnectionString,
        databaseName: env.mongoDatabaseName,
        collectionName: 'custom-contexts-factory-test',
      };

      const manager = ContextManagerFactory.create(ContextManagerType.MONGO, config) as MongoContextManager;
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Custom collection test', 'user'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();

      // Cleanup
      await cleanupMongo(manager, [sessionId], config);
    });
  });

  describe('Pinecone Manager Creation', () => {
    it('should create PineconeContextManager with real config', () => {
      if (!pineconeAvailable) return;

      const env = loadTestEnv();
      const config: PineconeConfig = {
        apiKey: env.pineconeApiKey,
        indexName: env.pineconeIndexName,
        useEmbeddings: ollamaAvailable,
        embeddingConfig: ollamaAvailable
          ? {
              apiUrl: env.ollamaApiUrl,
              model: env.ollamaModel,
            }
          : undefined,
      };

      const manager = ContextManagerFactory.create(ContextManagerType.PINECONE, config);

      expect(manager).toBeInstanceOf(PineconeContextManager);
      expect(manager).toHaveProperty('getContext');
      expect(manager).toHaveProperty('saveContext');
      expect(manager).toHaveProperty('addMessage');
    });

    it('should work with Pinecone manager for real operations', async () => {
      if (!pineconeAvailable) return;

      const env = loadTestEnv();
      const config: PineconeConfig = {
        apiKey: env.pineconeApiKey,
        indexName: env.pineconeIndexName,
        useEmbeddings: ollamaAvailable,
        embeddingConfig: ollamaAvailable
          ? {
              apiUrl: env.ollamaApiUrl,
              model: env.ollamaModel,
            }
          : undefined,
      };

      const manager = ContextManagerFactory.create(ContextManagerType.PINECONE, config) as PineconeContextManager;
      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Factory test', 'user'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.messages[0].content).toBe('Factory test');

      // Cleanup
      await cleanupPinecone(manager, [sessionId], config);
    }, 30000); // Longer timeout for embedding generation
  });

  describe('Factory with Multiple Implementations', () => {
    it('should create and use all three implementations', async () => {
      const localConfig: LocalFileConfig = {
        basePath: testBasePath,
      };

      const localManager = ContextManagerFactory.create(ContextManagerType.LOCAL, localConfig);
      const localSessionId = generateSessionId();
      testSessionIds.push(localSessionId);

      const localContext = createTestContext(localSessionId, [
        createTestMessage('Local test', 'user'),
      ]);

      await localManager.saveContext(localSessionId, localContext);
      const localRetrieved = await localManager.getContext(localSessionId);
      expect(localRetrieved?.messages[0].content).toBe('Local test');

      if (mongoAvailable) {
        const env = loadTestEnv();
        const mongoConfig: MongoConfig = {
          connectionString: env.mongoConnectionString,
          databaseName: env.mongoDatabaseName,
        };

        const mongoManager = ContextManagerFactory.create(ContextManagerType.MONGO, mongoConfig);
        const mongoSessionId = generateSessionId();
        testSessionIds.push(mongoSessionId);

        const mongoContext = createTestContext(mongoSessionId, [
          createTestMessage('Mongo test', 'user'),
        ]);

        await mongoManager.saveContext(mongoSessionId, mongoContext);
        const mongoRetrieved = await mongoManager.getContext(mongoSessionId);
        expect(mongoRetrieved?.messages[0].content).toBe('Mongo test');

        await cleanupMongo(mongoManager as MongoContextManager, [mongoSessionId], mongoConfig);
      }

      if (pineconeAvailable) {
        const env = loadTestEnv();
        const pineconeConfig: PineconeConfig = {
          apiKey: env.pineconeApiKey,
          indexName: env.pineconeIndexName,
          useEmbeddings: ollamaAvailable,
          embeddingConfig: ollamaAvailable
            ? {
                apiUrl: env.ollamaApiUrl,
                model: env.ollamaModel,
              }
            : undefined,
        };

        const pineconeManager = ContextManagerFactory.create(ContextManagerType.PINECONE, pineconeConfig);
        const pineconeSessionId = generateSessionId();
        testSessionIds.push(pineconeSessionId);

        const pineconeContext = createTestContext(pineconeSessionId, [
          createTestMessage('Pinecone test', 'user'),
        ]);

        await pineconeManager.saveContext(pineconeSessionId, pineconeContext);
        const pineconeRetrieved = await pineconeManager.getContext(pineconeSessionId);
        expect(pineconeRetrieved?.messages[0].content).toBe('Pinecone test');

        await cleanupPinecone(
          pineconeManager as PineconeContextManager,
          [pineconeSessionId],
          pineconeConfig
        );
      }

      // Cleanup local
      await cleanupLocalFile(localManager as LocalFileContextManager, [localSessionId], testBasePath);
    }, 60000); // Longer timeout for all operations
  });

  describe('Config Validation', () => {
    it('should throw error for invalid context manager type', () => {
      expect(() => {
        ContextManagerFactory.create('invalid' as ContextManagerType, {} as LocalFileConfig);
      }).toThrow('Invalid context manager type');
    });

    it('should throw error for LOCAL without basePath', () => {
      expect(() => {
        ContextManagerFactory.create(ContextManagerType.LOCAL, {} as LocalFileConfig);
      }).toThrow();
    });

    it('should throw error for MONGO without connectionString', () => {
      expect(() => {
        ContextManagerFactory.create(ContextManagerType.MONGO, {} as MongoConfig);
      }).toThrow();
    });

    it('should throw error for PINECONE without apiKey', () => {
      expect(() => {
        ContextManagerFactory.create(ContextManagerType.PINECONE, {} as PineconeConfig);
      }).toThrow();
    });
  });
});

