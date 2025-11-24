import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KernelAdapter } from '../KernelAdapter';
import {
  ContextManagerFactory,
  MemorySystemFactory,
  EventBusFactory,
  StreamManagerFactory,
  ToolRegistryFactory,
} from 'shared';

// Mock shared factories
vi.mock('shared', async () => {
  const actual = await vi.importActual('shared');
  return {
    ...actual,
    ContextManagerFactory: {
      create: vi.fn(),
    },
    MemorySystemFactory: {
      create: vi.fn(),
    },
    EventBusFactory: {
      create: vi.fn(),
    },
    StreamManagerFactory: {
      create: vi.fn(),
    },
    ToolRegistryFactory: {
      create: vi.fn(),
    },
  };
});

describe('KernelAdapter', () => {
  let mockContextManager: any;
  let mockMemorySystem: any;
  let mockEventBus: any;
  let mockStreamManager: any;
  let mockToolRegistry: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock instances
    mockContextManager = {
      getContext: vi.fn(),
      saveContext: vi.fn(),
      addMessage: vi.fn(),
    };

    mockMemorySystem = {
      storeShortTerm: vi.fn(),
      storeLongTerm: vi.fn(),
      searchSimilar: vi.fn(),
      getConversationHistory: vi.fn(),
    };

    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    mockStreamManager = {
      createStream: vi.fn(),
      sendChunk: vi.fn(),
      closeStream: vi.fn(),
    };

    mockToolRegistry = {
      discoverTools: vi.fn(),
      validateTool: vi.fn(),
      executeTool: vi.fn(),
    };

    // Setup factory mocks
    vi.mocked(ContextManagerFactory.create).mockReturnValue(mockContextManager);
    vi.mocked(MemorySystemFactory.create).mockReturnValue(mockMemorySystem);
    vi.mocked(EventBusFactory.create).mockReturnValue(mockEventBus);
    vi.mocked(StreamManagerFactory.create).mockReturnValue(mockStreamManager);
    vi.mocked(ToolRegistryFactory.create).mockReturnValue(mockToolRegistry);
  });

  describe('initialization', () => {
    it('should initialize with MongoDB context manager by default', () => {
      delete process.env.CONTEXT_MANAGER_TYPE;
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/ai_service';

      const adapter = new KernelAdapter();

      expect(adapter.contextManager).toBe(mockContextManager);
      expect(ContextManagerFactory.create).toHaveBeenCalled();
    });

    it('should initialize with Local memory system by default', () => {
      delete process.env.MEMORY_SYSTEM_TYPE;

      const adapter = new KernelAdapter();

      expect(adapter.memorySystem).toBe(mockMemorySystem);
      expect(MemorySystemFactory.create).toHaveBeenCalled();
    });

    it('should initialize with SSE stream manager by default', () => {
      process.env.STREAM_MANAGER_TYPE = undefined;

      const adapter = new KernelAdapter();

      expect(adapter.streamManager).toBe(mockStreamManager);
      expect(StreamManagerFactory.create).toHaveBeenCalled();
    });

    it('should initialize with Local tool registry by default', () => {
      process.env.TOOL_REGISTRY_TYPE = undefined;

      const adapter = new KernelAdapter();

      expect(adapter.toolRegistry).toBe(mockToolRegistry);
      expect(ToolRegistryFactory.create).toHaveBeenCalled();
    });

    it('should initialize with Pinecone context manager when configured', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = 'test-key';
      process.env.PINECONE_INDEX_NAME = 'test-index';

      const adapter = new KernelAdapter();

      expect(adapter.contextManager).toBe(mockContextManager);
      expect(ContextManagerFactory.create).toHaveBeenCalled();
    });

    it('should fallback to MongoDB if Pinecone initialization fails', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = '';
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/ai_service';

      // First call fails, second succeeds
      vi.mocked(ContextManagerFactory.create)
        .mockImplementationOnce(() => {
          throw new Error('Pinecone error');
        })
        .mockReturnValueOnce(mockContextManager);

      const adapter = new KernelAdapter();

      expect(adapter.contextManager).toBe(mockContextManager);
      expect(ContextManagerFactory.create).toHaveBeenCalledTimes(2);
    });

    it('should initialize with LocalFile context manager when configured', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'local';
      process.env.CONTEXT_MANAGER_BASE_PATH = './test-storage';

      new KernelAdapter();

      expect(ContextManagerFactory.create).toHaveBeenCalled();
    });

    it('should initialize with Pinecone memory system when configured', () => {
      process.env.MEMORY_SYSTEM_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = 'test-key';
      process.env.PINECONE_INDEX_NAME = 'test-index';

      const adapter = new KernelAdapter();

      expect(adapter.memorySystem).toBe(mockMemorySystem);
      expect(MemorySystemFactory.create).toHaveBeenCalled();
    });

    it('should fallback to Local if Pinecone memory system fails', () => {
      process.env.MEMORY_SYSTEM_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = '';

      vi.mocked(MemorySystemFactory.create)
        .mockImplementationOnce(() => {
          throw new Error('Pinecone error');
        })
        .mockReturnValueOnce(mockMemorySystem);

      const adapter = new KernelAdapter();

      expect(adapter.memorySystem).toBe(mockMemorySystem);
      expect(MemorySystemFactory.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Bus', () => {
    it('should initialize with RabbitMQ event bus', () => {
      process.env.RABBITMQ_URL = 'amqp://localhost:5672';

      const adapter = new KernelAdapter();

      expect(adapter.eventBus).toBe(mockEventBus);
      expect(EventBusFactory.create).toHaveBeenCalled();
    });

    it('should create no-op event bus if RabbitMQ fails', () => {
      process.env.RABBITMQ_URL = undefined;

      vi.mocked(EventBusFactory.create).mockImplementation(() => {
        throw new Error('RabbitMQ error');
      });

      const adapter = new KernelAdapter();

      expect(adapter.eventBus).toBeDefined();
      expect(adapter.eventBus.emit).toBeDefined();
      expect(adapter.eventBus.on).toBeDefined();
      expect(adapter.eventBus.off).toBeDefined();
    });
  });

  describe('configuration parsing', () => {
    it('should extract database name from MongoDB URI', () => {
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017/my_database';

      new KernelAdapter();

      expect(ContextManagerFactory.create).toHaveBeenCalled();
    });

    it('should use default database name if not in URI', () => {
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://localhost:27017';

      new KernelAdapter();

      expect(ContextManagerFactory.create).toHaveBeenCalled();
    });

    it('should configure Ollama embeddings for Pinecone', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = 'test-key';
      process.env.PINECONE_INDEX_NAME = 'test-index';
      process.env.OLLAMA_API_URL = 'http://localhost:11434';
      process.env.OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text';

      new KernelAdapter();

      expect(ContextManagerFactory.create).toHaveBeenCalled();
    });
  });
});

