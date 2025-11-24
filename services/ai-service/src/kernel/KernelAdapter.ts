import {
  ContextManagerFactory,
  ContextManagerType,
  IContextManager,
  ContextManagerConfig,
  MemorySystemFactory,
  MemorySystemType,
  IMemorySystem,
  MemorySystemConfig,
  EventBusFactory,
  EventBusType,
  IEventBus,
  StreamManagerFactory,
  StreamManagerType,
  IStreamManager,
  ToolRegistryFactory,
  ToolRegistryType,
  IToolRegistry,
} from 'shared';

export class KernelAdapter {
  public contextManager: IContextManager;
  public memorySystem: IMemorySystem;
  public eventBus: IEventBus;
  public streamManager: IStreamManager;
  public toolRegistry: IToolRegistry;

  constructor() {
    // Initialize Context Manager
    // Default to MongoDB instead of Pinecone (more commonly available)
    const contextManagerType = (process.env.CONTEXT_MANAGER_TYPE || 'mongo') as ContextManagerType;
    let contextManagerConfig = this.getContextManagerConfig(contextManagerType);
    
    try {
      this.contextManager = ContextManagerFactory.create(contextManagerType, contextManagerConfig);
    } catch (error: any) {
      // If Pinecone fails (e.g., missing API key), fall back to MongoDB
      if (contextManagerType === ContextManagerType.PINECONE) {
        console.warn('⚠️  Pinecone initialization failed, falling back to MongoDB:', error.message);
        const fallbackConfig = this.getContextManagerConfig(ContextManagerType.MONGO);
        this.contextManager = ContextManagerFactory.create(ContextManagerType.MONGO, fallbackConfig);
      } else {
        throw error;
      }
    }

    // Initialize Memory System
    // Default to Local instead of Pinecone (more commonly available)
    const memorySystemType = (process.env.MEMORY_SYSTEM_TYPE || 'local') as MemorySystemType;
    let memorySystemConfig = this.getMemorySystemConfig(memorySystemType);
    
    try {
      this.memorySystem = MemorySystemFactory.create(memorySystemType, memorySystemConfig);
    } catch (error: any) {
      // If Pinecone fails (e.g., missing API key), fall back to Local
      if (memorySystemType === MemorySystemType.PINECONE) {
        console.warn('⚠️  Pinecone Memory System initialization failed, falling back to Local:', error.message);
        this.memorySystem = MemorySystemFactory.create(MemorySystemType.LOCAL, {});
      } else {
        throw error;
      }
    }

    // Initialize Event Bus
    const eventBusType = EventBusType.RABBITMQ;
    const eventBusConfig = {
      serviceName: 'ai-service',
      url: process.env.RABBITMQ_URL,
    };
    try {
      this.eventBus = EventBusFactory.create(eventBusType, eventBusConfig);
    } catch (error) {
      console.warn('⚠️  Event Bus initialization failed - service will run without event messaging:', error);
      // Create a no-op event bus for graceful degradation
      this.eventBus = this.createNoOpEventBus();
    }

    // Initialize Stream Manager
    const streamManagerType = (process.env.STREAM_MANAGER_TYPE || 'sse') as StreamManagerType;
    this.streamManager = StreamManagerFactory.create(streamManagerType);

    // Initialize Tool Registry
    const toolRegistryType = (process.env.TOOL_REGISTRY_TYPE || 'local') as ToolRegistryType;
    this.toolRegistry = ToolRegistryFactory.create(toolRegistryType);
  }

  private getContextManagerConfig(type: ContextManagerType): ContextManagerConfig | undefined {
    switch (type) {
      case ContextManagerType.LOCAL:
        return {
          basePath: process.env.CONTEXT_MANAGER_BASE_PATH || './context-storage',
        };
      case ContextManagerType.MONGO:
        const mongoUri = process.env.AI_SERVICE_MONGODB_URI || 'mongodb://localhost:27017/ai_service';
        // Extract database name from URI if present, otherwise use default
        const dbNameMatch = mongoUri.match(/\/([^\/]+)$/);
        const databaseName = dbNameMatch ? dbNameMatch[1] : 'ai_service';
        return {
          connectionString: mongoUri,
          databaseName,
          collectionName: 'contexts',
        };
      case ContextManagerType.PINECONE:
        return {
          apiKey: process.env.PINECONE_API_KEY || '',
          indexName: process.env.PINECONE_INDEX_NAME || 'context-manager',
          useEmbeddings: true,
          embeddingConfig: {
            apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
            model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
          },
        };
      default:
        return undefined;
    }
  }

  private getMemorySystemConfig(type: MemorySystemType): MemorySystemConfig | undefined {
    switch (type) {
      case MemorySystemType.LOCAL:
        return {};
      case MemorySystemType.PINECONE:
        return {
          apiKey: process.env.PINECONE_API_KEY || '',
          indexName: process.env.PINECONE_INDEX_NAME || 'context-manager',
          useEmbeddings: true,
          embeddingConfig: {
            apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
            model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
          },
        };
      default:
        return undefined;
    }
  }

  private createNoOpEventBus(): IEventBus {
    return {
      emit: async () => {
        // No-op
      },
      on: async () => {
        // No-op
      },
      off: async () => {
        // No-op
      },
    };
  }
}

