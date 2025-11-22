// Reuse Message type from context-manager
import { Message } from '../context-manager/types';

// Memory interface representing a stored memory
export interface Memory {
  id: string;
  content: string;
  metadata?: {
    sessionId?: string;
    userId?: string;
    type?: 'short-term' | 'long-term';
    timestamp?: string;
    [key: string]: any;
  };
  embedding?: number[];
  timestamp: string;
}

// Memory system type enum
export enum MemorySystemType {
  LOCAL = 'local',
  PINECONE = 'pinecone',
}

// Minimal memory system interface
export interface IMemorySystem {
  storeShortTerm(sessionId: string, data: any): Promise<void>;
  storeLongTerm(userId: string, data: any): Promise<void>;
  searchSimilar(query: string, limit?: number): Promise<Memory[]>;
  getConversationHistory(sessionId: string): Promise<Message[]>;
}

// Factory configuration interfaces for each type
export interface LocalMemoryConfig {
  initialMemories?: Memory[];
}

export interface PineconeMemoryConfig {
  apiKey: string;
  indexName: string;
  environment?: string;
  useEmbeddings?: boolean;
  embeddingConfig?: {
    apiUrl?: string;
    model?: string;
  };
}

export type MemorySystemConfig = LocalMemoryConfig | PineconeMemoryConfig;

