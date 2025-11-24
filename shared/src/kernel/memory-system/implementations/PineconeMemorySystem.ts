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
  private readonly requestTimeoutMs = Number(process.env.PINECONE_TIMEOUT_MS || 10000);
  private readonly maxRetries = Number(process.env.PINECONE_MAX_RETRIES || 2);

  /**
   * Generate a fallback vector with at least one non-zero value
   * Pinecone serverless doesn't allow all-zero vectors
   */
  private getFallbackVector(): number[] {
    const vector = new Array(this.VECTOR_DIMENSION).fill(0);
    // Set first value to a small non-zero number to satisfy Pinecone requirement
    vector[0] = 0.0001;
    return vector;
  }

  constructor(config: PineconeMemoryConfig) {
    // Pinecone SDK v6+ (serverless) does NOT require environment property
    // Just use the API key - the SDK handles serverless automatically
    this.client = new Pinecone({ 
      apiKey: config.apiKey
    });
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
          vectorValues = await this.executeWithRetry(
            () => this.embeddingService!.generateEmbedding(content),
            'Ollama.generateEmbedding'
          );
        } catch (embeddingError) {
          console.warn('Failed to generate embedding, using fallback vector:', embeddingError);
          vectorValues = this.getFallbackVector();
        }
      } else {
        vectorValues = this.getFallbackVector();
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

      await this.executeWithRetry(() => this.index.upsert([vector]), 'PineconeMemorySystem.upsert');
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
          vectorValues = await this.executeWithRetry(
            () => this.embeddingService!.generateEmbedding(content),
            'Ollama.generateEmbedding'
          );
        } catch (embeddingError) {
          console.warn('Failed to generate embedding, using fallback vector:', embeddingError);
          vectorValues = this.getFallbackVector();
        }
      } else {
        vectorValues = this.getFallbackVector();
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

      await this.executeWithRetry(() => this.index.upsert([vector]), 'PineconeMemorySystem.upsert');
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
          queryVector = await this.executeWithRetry(
            () => this.embeddingService!.generateEmbedding(query),
            'Ollama.generateEmbedding'
          );
        } catch (embeddingError) {
          console.warn('Failed to generate query embedding, using fallback vector:', embeddingError);
          queryVector = this.getFallbackVector();
        }
      } else {
        queryVector = this.getFallbackVector();
      }

      // Search Pinecone
      const queryResponse = await this.executeWithRetry(
        () =>
          this.index.query({
            vector: queryVector,
            topK: limit || 10,
            includeMetadata: true,
          }),
        'PineconeMemorySystem.query'
      );

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
      const queryResponse = await this.executeWithRetry(
        () =>
          this.index.query({
            vector: this.getFallbackVector(), // Fallback vector for metadata-only query (Pinecone doesn't allow all zeros)
            topK: 1000, // Large number to get all messages
            includeMetadata: true,
            filter: {
              sessionId: { $eq: sessionId },
              type: { $eq: 'short-term' },
            },
          }),
        'PineconeMemorySystem.historyQuery'
      );

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

  private async executeWithRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= this.maxRetries) {
      try {
        return await this.withTimeout(operation(), context);
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt > this.maxRetries) {
          throw error;
        }
        const delay = Math.min(500 * attempt, 2000);
        console.warn(`[${context}] attempt ${attempt} failed: ${(error as Error)?.message}; retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError as Error;
  }

  private async withTimeout<T>(promise: Promise<T>, context: string): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${context} timed out after ${this.requestTimeoutMs}ms`)), this.requestTimeoutMs)
      ),
    ]);
  }
}

