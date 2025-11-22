import { Pinecone } from '@pinecone-database/pinecone';
import { IContextManager, Message, ConversationContext, PineconeConfig } from '../types';
import { EmbeddingService } from '../utils/embeddingService';

export class PineconeContextManager implements IContextManager {
  private client: Pinecone;
  private index: ReturnType<Pinecone['Index']>;
  private embeddingService: EmbeddingService | null = null;
  private readonly VECTOR_DIMENSION = 768; // nomic-text model dimension

  constructor(config: PineconeConfig) {
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

  async getContext(sessionId: string): Promise<ConversationContext | null> {
    try {
      const fetchResponse = await this.index.fetch([sessionId]);
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

      return {
        sessionId: (metadata.sessionId as string) || sessionId,
        messages,
        metadata: {
          createdAt: metadata.createdAt as string | undefined,
          updatedAt: metadata.updatedAt as string | undefined,
        },
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
          vectorValues = await this.embeddingService.generateEmbedding(combinedText);
        } catch (embeddingError) {
          console.warn('Failed to generate embedding, using empty vector:', embeddingError);
          vectorValues = this.embeddingService.getEmptyEmbedding();
        }
      } else {
        // Use empty vector if embeddings are disabled or no messages
        vectorValues = new Array(this.VECTOR_DIMENSION).fill(0);
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

      await this.index.upsert([vector]);
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
}

