import { Pinecone } from '@pinecone-database/pinecone';
import {
  IMemorySystem,
  Memory,
  Message,
  PineconeMemoryConfig,
} from '../types';
import { EmbeddingService } from '../../context-manager/utils/embeddingService';

export class PineconeMemorySystem implements IMemorySystem {
  private client: Pinecone;
  private index: ReturnType<Pinecone['Index']>;
  private embeddingService: EmbeddingService | null = null;
  private readonly VECTOR_DIMENSION = 768; // nomic-text model dimension

  constructor(config: PineconeMemoryConfig) {
    const clientConfig: { apiKey: string; environment?: string } = {
      apiKey: config.apiKey,
    };
    if (config.environment) {
      clientConfig.environment = config.environment;
    }
    // Type assertion needed because Pinecone types require environment, but it's optional
    this.client = new Pinecone(clientConfig as any);
    this.index = this.client.Index(config.indexName);

    // Initialize embedding service if enabled
    if (config.useEmbeddings !== false) {
      // Default to true if not specified
      this.embeddingService = new EmbeddingService(config.embeddingConfig);
    }
  }

  async storeShortTerm(sessionId: string, data: any): Promise<void> {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    const memoryId = this.generateMemoryId(sessionId, 'short-term');

    try {
      // Generate embedding if embedding service is available
      let vectorValues: number[];
      if (this.embeddingService) {
        try {
          vectorValues = await this.embeddingService.generateEmbedding(content);
        } catch (embeddingError) {
          console.warn('Failed to generate embedding, using empty vector:', embeddingError);
          vectorValues = this.embeddingService.getEmptyEmbedding();
        }
      } else {
        vectorValues = new Array(this.VECTOR_DIMENSION).fill(0);
      }

      const vector = {
        id: memoryId,
        values: vectorValues,
        metadata: {
          sessionId,
          type: 'short-term',
          content,
          timestamp: new Date().toISOString(),
          ...(typeof data === 'object' && data !== null
            ? { dataType: typeof data }
            : {}),
        },
      };

      await this.index.upsert([vector]);
    } catch (error) {
      throw new Error(`Failed to store short-term memory: ${error}`);
    }
  }

  async storeLongTerm(userId: string, data: any): Promise<void> {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    const memoryId = this.generateMemoryId(userId, 'long-term');

    try {
      // Generate embedding if embedding service is available
      let vectorValues: number[];
      if (this.embeddingService) {
        try {
          vectorValues = await this.embeddingService.generateEmbedding(content);
        } catch (embeddingError) {
          console.warn('Failed to generate embedding, using empty vector:', embeddingError);
          vectorValues = this.embeddingService.getEmptyEmbedding();
        }
      } else {
        vectorValues = new Array(this.VECTOR_DIMENSION).fill(0);
      }

      const vector = {
        id: memoryId,
        values: vectorValues,
        metadata: {
          userId,
          type: 'long-term',
          content,
          timestamp: new Date().toISOString(),
          ...(typeof data === 'object' && data !== null
            ? { dataType: typeof data }
            : {}),
        },
      };

      await this.index.upsert([vector]);
    } catch (error) {
      throw new Error(`Failed to store long-term memory: ${error}`);
    }
  }

  async searchSimilar(query: string, limit?: number): Promise<Memory[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    try {
      // Generate embedding for query
      let queryVector: number[];
      if (this.embeddingService) {
        try {
          queryVector = await this.embeddingService.generateEmbedding(query);
        } catch (embeddingError) {
          console.warn('Failed to generate query embedding, using empty vector:', embeddingError);
          queryVector = this.embeddingService.getEmptyEmbedding();
        }
      } else {
        queryVector = new Array(this.VECTOR_DIMENSION).fill(0);
      }

      // Search Pinecone
      const queryResponse = await this.index.query({
        vector: queryVector,
        topK: limit || 10,
        includeMetadata: true,
      });

      // Convert Pinecone results to Memory objects
      const memories: Memory[] = [];
      for (const match of queryResponse.matches || []) {
        const metadata = match.metadata || {};
        const memory: Memory = {
          id: match.id,
          content: (metadata.content as string) || '',
          metadata: {
            sessionId: metadata.sessionId as string | undefined,
            userId: metadata.userId as string | undefined,
            type: (metadata.type as 'short-term' | 'long-term') || 'short-term',
            timestamp: (metadata.timestamp as string) || new Date().toISOString(),
            score: match.score,
          },
          timestamp: (metadata.timestamp as string) || new Date().toISOString(),
        };
        memories.push(memory);
      }

      return memories;
    } catch (error) {
      throw new Error(`Failed to search similar memories: ${error}`);
    }
  }

  async getConversationHistory(sessionId: string): Promise<Message[]> {
    try {
      // Query Pinecone for all memories with this sessionId
      const queryResponse = await this.index.query({
        vector: new Array(this.VECTOR_DIMENSION).fill(0), // Empty vector for metadata-only query
        topK: 1000, // Large number to get all messages
        includeMetadata: true,
        filter: {
          sessionId: { $eq: sessionId },
          type: { $eq: 'short-term' },
        },
      });

      // Extract messages from memories
      const messages: Message[] = [];
      for (const match of queryResponse.matches || []) {
        const metadata = match.metadata || {};
        const content = (metadata.content as string) || '';

        // Try to parse as Message if it's JSON, otherwise create a message
        try {
          const parsed = JSON.parse(content);
          if (parsed.id && parsed.role && parsed.content) {
            messages.push(parsed as Message);
          }
        } catch {
          // If not JSON, create a message from content
          messages.push({
            id: match.id,
            role: 'user',
            content,
            timestamp: (metadata.timestamp as string) || new Date().toISOString(),
          });
        }
      }

      // Sort by timestamp
      messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return messages;
    } catch (error) {
      throw new Error(`Failed to get conversation history: ${error}`);
    }
  }

  /**
   * Generate a unique memory ID
   */
  private generateMemoryId(identifier: string, type: 'short-term' | 'long-term'): string {
    const prefix = type === 'short-term' ? 'st' : 'lt';
    return `${prefix}-${identifier}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

