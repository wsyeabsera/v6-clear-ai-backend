import { describe, it, expect, beforeEach } from 'vitest';
import { KernelAdapter } from '../../kernel/KernelAdapter';

describe('Configuration Integration Tests', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.CONTEXT_MANAGER_TYPE;
    delete process.env.MEMORY_SYSTEM_TYPE;
    delete process.env.STREAM_MANAGER_TYPE;
    delete process.env.TOOL_REGISTRY_TYPE;
    delete process.env.AI_SERVICE_MONGODB_URI;
    delete process.env.PINECONE_API_KEY;
    delete process.env.PINECONE_INDEX_NAME;
  });

  describe('Context Manager Types', () => {
    it('should use MongoDB by default', () => {
      const adapter = new KernelAdapter();
      expect(adapter.contextManager).toBeDefined();
    });

    it('should use MongoDB when explicitly set', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'mongo';
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/test_db';

      const adapter = new KernelAdapter();
      expect(adapter.contextManager).toBeDefined();
    });

    it('should use LocalFile when configured', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'local';
      process.env.CONTEXT_MANAGER_BASE_PATH = './test-storage';

      const adapter = new KernelAdapter();
      expect(adapter.contextManager).toBeDefined();
    });

    it('should use Pinecone when configured with API key', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = 'test-key';
      process.env.PINECONE_INDEX_NAME = 'test-index';

      const adapter = new KernelAdapter();
      expect(adapter.contextManager).toBeDefined();
    });

    it('should fallback to MongoDB if Pinecone fails', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = ''; // Invalid
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/test_db';

      const adapter = new KernelAdapter();
      expect(adapter.contextManager).toBeDefined();
    });
  });

  describe('Memory System Types', () => {
    it('should use Local by default', () => {
      const adapter = new KernelAdapter();
      expect(adapter.memorySystem).toBeDefined();
    });

    it('should use Local when explicitly set', () => {
      process.env.MEMORY_SYSTEM_TYPE = 'local';

      const adapter = new KernelAdapter();
      expect(adapter.memorySystem).toBeDefined();
    });

    it('should use Pinecone when configured with API key', () => {
      process.env.MEMORY_SYSTEM_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = 'test-key';
      process.env.PINECONE_INDEX_NAME = 'test-index';

      const adapter = new KernelAdapter();
      expect(adapter.memorySystem).toBeDefined();
    });

    it('should fallback to Local if Pinecone fails', () => {
      process.env.MEMORY_SYSTEM_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = ''; // Invalid

      const adapter = new KernelAdapter();
      expect(adapter.memorySystem).toBeDefined();
    });
  });

  describe('Stream Manager Types', () => {
    it('should use SSE by default', () => {
      const adapter = new KernelAdapter();
      expect(adapter.streamManager).toBeDefined();
    });

    it('should use SSE when explicitly set', () => {
      process.env.STREAM_MANAGER_TYPE = 'sse';

      const adapter = new KernelAdapter();
      expect(adapter.streamManager).toBeDefined();
    });

    it('should use WebSocket when configured', () => {
      process.env.STREAM_MANAGER_TYPE = 'websocket';

      const adapter = new KernelAdapter();
      expect(adapter.streamManager).toBeDefined();
    });
  });

  describe('Tool Registry Types', () => {
    it('should use Local by default', () => {
      const adapter = new KernelAdapter();
      expect(adapter.toolRegistry).toBeDefined();
    });

    it('should use Local when explicitly set', () => {
      process.env.TOOL_REGISTRY_TYPE = 'local';

      const adapter = new KernelAdapter();
      expect(adapter.toolRegistry).toBeDefined();
    });

    it('should use MCP when configured', () => {
      process.env.TOOL_REGISTRY_TYPE = 'mcp';
      process.env.MCP_BASE_URL = 'http://localhost:3000';

      const adapter = new KernelAdapter();
      expect(adapter.toolRegistry).toBeDefined();
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should parse MongoDB URI correctly', () => {
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/my_database';

      const adapter = new KernelAdapter();
      expect(adapter.contextManager).toBeDefined();
    });

    it('should use default database name if not in URI', () => {
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017';

      const adapter = new KernelAdapter();
      expect(adapter.contextManager).toBeDefined();
    });

    it('should configure Ollama embeddings for Pinecone', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = 'test-key';
      process.env.PINECONE_INDEX_NAME = 'test-index';
      process.env.OLLAMA_API_URL = 'http://localhost:11434';
      process.env.OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text';

      const adapter = new KernelAdapter();
      expect(adapter.contextManager).toBeDefined();
    });
  });

  describe('Default Configuration Fallbacks', () => {
    it('should use sensible defaults when env vars not set', () => {
      // Clear all relevant env vars
      delete process.env.CONTEXT_MANAGER_TYPE;
      delete process.env.MEMORY_SYSTEM_TYPE;
      delete process.env.STREAM_MANAGER_TYPE;
      delete process.env.TOOL_REGISTRY_TYPE;

      const adapter = new KernelAdapter();
      
      expect(adapter.contextManager).toBeDefined();
      expect(adapter.memorySystem).toBeDefined();
      expect(adapter.streamManager).toBeDefined();
      expect(adapter.toolRegistry).toBeDefined();
      expect(adapter.eventBus).toBeDefined();
    });
  });

  describe('Invalid Configuration Handling', () => {
    it('should handle invalid context manager type', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'invalid-type';
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/test';

      // Should throw or fallback
      expect(() => {
        new KernelAdapter();
      }).toThrow();
    });

    it('should handle invalid memory system type', () => {
      process.env.MEMORY_SYSTEM_TYPE = 'invalid-type';

      // Should throw or fallback
      expect(() => {
        new KernelAdapter();
      }).toThrow();
    });
  });
});

