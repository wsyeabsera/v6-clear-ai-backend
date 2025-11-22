import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContextManagerType,
  LocalFileConfig,
  MongoConfig,
  PineconeConfig,
} from '../types';

// Mock implementations before importing factory
vi.mock('../implementations/LocalFileContextManager', () => ({
  LocalFileContextManager: vi.fn().mockImplementation(() => ({
    getContext: vi.fn(),
    saveContext: vi.fn(),
    addMessage: vi.fn(),
  })),
}));

vi.mock('../implementations/MongoContextManager', () => ({
  MongoContextManager: vi.fn().mockImplementation(() => ({
    getContext: vi.fn(),
    saveContext: vi.fn(),
    addMessage: vi.fn(),
  })),
}));

vi.mock('../implementations/PineconeContextManager', () => ({
  PineconeContextManager: vi.fn().mockImplementation(() => ({
    getContext: vi.fn(),
    saveContext: vi.fn(),
    addMessage: vi.fn(),
  })),
}));

import { ContextManagerFactory } from '../factory';

describe('ContextManagerFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create LocalFileContextManager instance when type is LOCAL', () => {
      const config: LocalFileConfig = { basePath: '/tmp/test' };
      const manager = ContextManagerFactory.create(ContextManagerType.LOCAL, config);

      expect(manager).toBeDefined();
      expect(manager).toHaveProperty('getContext');
      expect(manager).toHaveProperty('saveContext');
      expect(manager).toHaveProperty('addMessage');
    });

    it('should create MongoContextManager instance when type is MONGO', () => {
      const config: MongoConfig = {
        connectionString: 'mongodb://localhost:27017',
        databaseName: 'test',
      };
      const manager = ContextManagerFactory.create(ContextManagerType.MONGO, config);

      expect(manager).toBeDefined();
      expect(manager).toHaveProperty('getContext');
      expect(manager).toHaveProperty('saveContext');
      expect(manager).toHaveProperty('addMessage');
    });

    it('should create PineconeContextManager instance when type is PINECONE', () => {
      const config: PineconeConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
      };
      const manager = ContextManagerFactory.create(ContextManagerType.PINECONE, config);

      expect(manager).toBeDefined();
      expect(manager).toHaveProperty('getContext');
      expect(manager).toHaveProperty('saveContext');
      expect(manager).toHaveProperty('addMessage');
    });

    it('should throw error for invalid context manager type', () => {
      expect(() => {
        ContextManagerFactory.create('invalid' as ContextManagerType, {} as LocalFileConfig);
      }).toThrow('Invalid context manager type: invalid');
    });

    it('should accept config for LOCAL type', () => {
      const config: LocalFileConfig = { basePath: '/custom/path' };
      const manager = ContextManagerFactory.create(ContextManagerType.LOCAL, config);
      expect(manager).toBeDefined();
    });

    it('should accept config for MONGO type with collection name', () => {
      const config: MongoConfig = {
        connectionString: 'mongodb://localhost:27017',
        databaseName: 'test',
        collectionName: 'custom-collection',
      };
      const manager = ContextManagerFactory.create(ContextManagerType.MONGO, config);
      expect(manager).toBeDefined();
    });

    it('should accept config for PINECONE type with environment', () => {
      const config: PineconeConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        environment: 'us-west-2',
      };
      const manager = ContextManagerFactory.create(ContextManagerType.PINECONE, config);
      expect(manager).toBeDefined();
    });

    it('should return instances that implement IContextManager interface', () => {
      const localConfig: LocalFileConfig = { basePath: '/tmp/test' };
      const localManager = ContextManagerFactory.create(ContextManagerType.LOCAL, localConfig);

      const mongoConfig: MongoConfig = {
        connectionString: 'mongodb://localhost:27017',
        databaseName: 'test',
      };
      const mongoManager = ContextManagerFactory.create(ContextManagerType.MONGO, mongoConfig);

      const pineconeConfig: PineconeConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
      };
      const pineconeManager = ContextManagerFactory.create(
        ContextManagerType.PINECONE,
        pineconeConfig
      );

      // All should implement IContextManager interface
      [localManager, mongoManager, pineconeManager].forEach((manager) => {
        expect(manager).toHaveProperty('getContext');
        expect(manager).toHaveProperty('saveContext');
        expect(manager).toHaveProperty('addMessage');
        expect(typeof manager.getContext).toBe('function');
        expect(typeof manager.saveContext).toBe('function');
        expect(typeof manager.addMessage).toBe('function');
      });
    });
  });
});

