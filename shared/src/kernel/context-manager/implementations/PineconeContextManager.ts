import { Pinecone } from '@pinecone-database/pinecone';
import { IContextManager, Message, ConversationContext, PineconeConfig } from '../types';
import { EmbeddingService } from '../utils/embeddingService';

export class PineconeContextManager implements IContextManager {
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

  constructor(config: PineconeConfig) {
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

  async getContext(sessionId: string): Promise<ConversationContext | null> {
    try {
      const fetchResponse = await this.executeWithRetry(
        () => this.index.fetch([sessionId]),
        'PineconeContextManager.fetch'
      );
      const records = fetchResponse.records || {};

      if (!records[sessionId]) {
        return null;
      }

      const record = records[sessionId];
      const metadata = record.metadata || {};

      // Extract messages from metadata (stored as JSON string or array)
      let messages: Message[] = [];
      if (metadata.messages) {
        if (Array.isArray(metadata.messages)) {
          // Convert through unknown to ensure type safety
          messages = metadata.messages as unknown as Message[];
        } else if (typeof metadata.messages === 'string') {
          try {
            const parsed = JSON.parse(metadata.messages as string);
            messages = Array.isArray(parsed) ? (parsed as unknown as Message[]) : [];
          } catch {
            messages = [];
          }
        }
      }

      // Reconstruct metadata object, parsing any JSON-stringified values
      const reconstructedMetadata: Record<string, any> = {};
      
      // Extract standard metadata fields
      for (const [key, value] of Object.entries(metadata)) {
        // Skip internal fields that are handled separately
        if (key === 'sessionId' || key === 'messages') {
          continue;
        }
        
        // Parse JSON-stringified values back to their original types
        if (typeof value === 'string') {
          try {
            // Try to parse as JSON (for complex objects that were stringified)
            const parsed = JSON.parse(value);
            reconstructedMetadata[key] = parsed;
          } catch {
            // If parsing fails, it's a regular string, keep it as is
            reconstructedMetadata[key] = value;
          }
        } else {
          // Primitive types (number, boolean) are kept as is
          reconstructedMetadata[key] = value;
        }
      }

      return {
        sessionId: (metadata.sessionId as string) || sessionId,
        messages,
        metadata: reconstructedMetadata,
      } as ConversationContext;
    } catch (error) {
      throw new Error(`Failed to get context from Pinecone: ${error}`);
    }
  }

  async saveContext(sessionId: string, context: ConversationContext): Promise<void> {
    const contextWithMetadata: ConversationContext = {
      ...context,
      metadata: {
        ...context.metadata,
        updatedAt: new Date().toISOString(),
        ...(context.metadata?.createdAt ? {} : { createdAt: new Date().toISOString() }),
      },
    };

    try {
      // Generate embedding from message content if embedding service is available
      let vectorValues: number[];
      if (this.embeddingService && contextWithMetadata.messages.length > 0) {
        // Combine all message contents for embedding
        const combinedText = contextWithMetadata.messages
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join('\n');
        
        try {
          vectorValues = await this.executeWithRetry(
            () => this.embeddingService!.generateEmbedding(combinedText),
            'Ollama.generateEmbedding'
          );
        } catch (embeddingError) {
          console.warn('Failed to generate embedding, using fallback vector:', embeddingError);
          // Pinecone serverless doesn't allow all-zero vectors, use a small random vector
          vectorValues = this.getFallbackVector();
        }
      } else {
        // Pinecone serverless doesn't allow all-zero vectors, use a small random vector
        vectorValues = this.getFallbackVector();
      }

      // Extract messages and sessionId from metadata to avoid overwriting
      const { messages: _, sessionId: __, ...restMetadata } = contextWithMetadata.metadata || {};
      
      // Pinecone metadata only accepts primitive types, so we stringify complex objects
      const vector = {
        id: sessionId,
        values: vectorValues,
        metadata: {
          sessionId: contextWithMetadata.sessionId,
          messages: JSON.stringify(contextWithMetadata.messages), // Stringify messages for Pinecone metadata
          ...Object.fromEntries(
            Object.entries(restMetadata || {}).map(([key, value]) => [
              key,
              typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                ? value
                : JSON.stringify(value),
            ])
          ),
        },
      };

      await this.executeWithRetry(() => this.index.upsert([vector]), 'PineconeContextManager.upsert');
    } catch (error) {
      throw new Error(`Failed to save context to Pinecone: ${error}`);
    }
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const existingContext = await this.getContext(sessionId);

    let context: ConversationContext;
    if (existingContext) {
      context = {
        ...existingContext,
        messages: [...existingContext.messages, message],
        metadata: {
          ...existingContext.metadata,
          updatedAt: new Date().toISOString(),
        },
      };
    } else {
      context = {
        sessionId,
        messages: [message],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    }

    await this.saveContext(sessionId, context);
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

