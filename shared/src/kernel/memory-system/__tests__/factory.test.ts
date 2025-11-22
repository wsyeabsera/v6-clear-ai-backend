import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemorySystemType,
  LocalMemoryConfig,
  PineconeMemoryConfig,
} from '../types';

// Mock implementations before importing factory
vi.mock('../implementations/LocalMemorySystem', () => ({
  LocalMemorySystem: vi.fn().mockImplementation(() => ({
    storeShortTerm: vi.fn(),
    storeLongTerm: vi.fn(),
    searchSimilar: vi.fn(),
    getConversationHistory: vi.fn(),
  })),
}));

vi.mock('../implementations/PineconeMemorySystem', () => ({
  PineconeMemorySystem: vi.fn().mockImplementation(() => ({
    storeShortTerm: vi.fn(),
    storeLongTerm: vi.fn(),
    searchSimilar: vi.fn(),
    getConversationHistory: vi.fn(),
  })),
}));

import { MemorySystemFactory } from '../factory';

describe('MemorySystemFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create LocalMemorySystem instance when type is LOCAL', () => {
      const config: LocalMemoryConfig = {};
      const system = MemorySystemFactory.create(MemorySystemType.LOCAL, config);

      expect(system).toBeDefined();
      expect(system).toHaveProperty('storeShortTerm');
      expect(system).toHaveProperty('storeLongTerm');
      expect(system).toHaveProperty('searchSimilar');
      expect(system).toHaveProperty('getConversationHistory');
    });

    it('should create LocalMemorySystem with initial memories', () => {
      const config: LocalMemoryConfig = {
        initialMemories: [
          {
            id: 'mem-1',
            content: 'Test memory',
            timestamp: new Date().toISOString(),
          },
        ],
      };
      const system = MemorySystemFactory.create(MemorySystemType.LOCAL, config);
      expect(system).toBeDefined();
    });

    it('should create PineconeMemorySystem instance when type is PINECONE', () => {
      const config: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
      };
      const system = MemorySystemFactory.create(MemorySystemType.PINECONE, config);

      expect(system).toBeDefined();
      expect(system).toHaveProperty('storeShortTerm');
      expect(system).toHaveProperty('storeLongTerm');
      expect(system).toHaveProperty('searchSimilar');
      expect(system).toHaveProperty('getConversationHistory');
    });

    it('should create PineconeMemorySystem with environment', () => {
      const config: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        environment: 'us-west-2',
      };
      const system = MemorySystemFactory.create(MemorySystemType.PINECONE, config);
      expect(system).toBeDefined();
    });

    it('should create PineconeMemorySystem with embedding config', () => {
      const config: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
        useEmbeddings: true,
        embeddingConfig: {
          apiUrl: 'http://localhost:11434',
          model: 'nomic-text',
        },
      };
      const system = MemorySystemFactory.create(MemorySystemType.PINECONE, config);
      expect(system).toBeDefined();
    });

    it('should throw error for invalid memory system type', () => {
      expect(() => {
        MemorySystemFactory.create('invalid' as MemorySystemType, {} as LocalMemoryConfig);
      }).toThrow('Invalid memory system type: invalid');
    });

    it('should throw error when Pinecone config missing apiKey', () => {
      expect(() => {
        MemorySystemFactory.create(MemorySystemType.PINECONE, {} as PineconeMemoryConfig);
      }).toThrow('PineconeMemorySystem requires apiKey and indexName in config');
    });

    it('should throw error when Pinecone config is undefined', () => {
      expect(() => {
        MemorySystemFactory.create(MemorySystemType.PINECONE);
      }).toThrow('PineconeMemorySystem requires apiKey and indexName in config');
    });

    it('should accept config for LOCAL type', () => {
      const config: LocalMemoryConfig = {};
      const system = MemorySystemFactory.create(MemorySystemType.LOCAL, config);
      expect(system).toBeDefined();
    });

    it('should return instances that implement IMemorySystem interface', () => {
      const localConfig: LocalMemoryConfig = {};
      const localSystem = MemorySystemFactory.create(MemorySystemType.LOCAL, localConfig);

      const pineconeConfig: PineconeMemoryConfig = {
        apiKey: 'test-api-key',
        indexName: 'test-index',
      };
      const pineconeSystem = MemorySystemFactory.create(
        MemorySystemType.PINECONE,
        pineconeConfig
      );

      // All should implement IMemorySystem interface
      [localSystem, pineconeSystem].forEach((system) => {
        expect(system).toHaveProperty('storeShortTerm');
        expect(system).toHaveProperty('storeLongTerm');
        expect(system).toHaveProperty('searchSimilar');
        expect(system).toHaveProperty('getConversationHistory');
        expect(typeof system.storeShortTerm).toBe('function');
        expect(typeof system.storeLongTerm).toBe('function');
        expect(typeof system.searchSimilar).toBe('function');
        expect(typeof system.getConversationHistory).toBe('function');
      });
    });
  });
});

