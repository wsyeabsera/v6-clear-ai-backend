// Message interface for conversation messages
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// Conversation context containing session data
export interface ConversationContext {
  sessionId: string;
  messages: Message[];
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    [key: string]: any;
  };
}

// Context manager type enum
export enum ContextManagerType {
  LOCAL = 'local',
  MONGO = 'mongo',
  PINECONE = 'pinecone',
}

// Minimal context manager interface
export interface IContextManager {
  getContext(sessionId: string): Promise<ConversationContext | null>;
  saveContext(sessionId: string, context: ConversationContext): Promise<void>;
  addMessage(sessionId: string, message: Message): Promise<void>;
}

// Factory configuration interfaces for each type
export interface LocalFileConfig {
  basePath: string;
}

export interface MongoConfig {
  connectionString: string;
  databaseName: string;
  collectionName?: string;
}

export interface PineconeConfig {
  apiKey: string;
  indexName: string;
  environment?: string;
  useEmbeddings?: boolean;
  embeddingConfig?: {
    apiUrl?: string;
    model?: string;
  };
}

export type ContextManagerConfig = LocalFileConfig | MongoConfig | PineconeConfig;

