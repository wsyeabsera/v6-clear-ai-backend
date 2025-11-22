import { MongoClient, Db, Collection } from 'mongodb';
import { IContextManager, Message, ConversationContext, MongoConfig } from '../types';

export class MongoContextManager implements IContextManager {
  private client: MongoClient;
  private db: Db | null = null;
  private collection: Collection | null = null;
  private config: MongoConfig;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: MongoConfig) {
    this.config = config;
    this.client = new MongoClient(config.connectionString);
  }

  private async ensureConnected(): Promise<void> {
    if (this.connectionPromise) {
      await this.connectionPromise;
      return;
    }

    if (this.db && this.collection) {
      return;
    }

    this.connectionPromise = (async () => {
      try {
        await this.client.connect();
        this.db = this.client.db(this.config.databaseName);
        const collectionName = this.config.collectionName || 'contexts';
        this.collection = this.db.collection(collectionName);
      } catch (error) {
        this.connectionPromise = null;
        throw new Error(`Failed to connect to MongoDB: ${error}`);
      }
    })();

    await this.connectionPromise;
  }

  async getContext(sessionId: string): Promise<ConversationContext | null> {
    await this.ensureConnected();
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      const document = await this.collection.findOne({ sessionId });
      if (!document) {
        return null;
      }
      // Convert MongoDB document to ConversationContext
      const context: ConversationContext = {
        sessionId: document.sessionId as string,
        messages: document.messages as Message[],
        metadata: document.metadata as ConversationContext['metadata'],
      };
      return context;
    } catch (error) {
      throw new Error(`Failed to get context from MongoDB: ${error}`);
    }
  }

  async saveContext(sessionId: string, context: ConversationContext): Promise<void> {
    await this.ensureConnected();
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    const contextWithMetadata: ConversationContext = {
      ...context,
      metadata: {
        ...context.metadata,
        updatedAt: new Date().toISOString(),
        ...(context.metadata?.createdAt ? {} : { createdAt: new Date().toISOString() }),
      },
    };

    try {
      await this.collection.updateOne(
        { sessionId },
        { $set: contextWithMetadata },
        { upsert: true }
      );
    } catch (error) {
      throw new Error(`Failed to save context to MongoDB: ${error}`);
    }
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    await this.ensureConnected();
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    const existingContext = await this.getContext(sessionId);

    if (existingContext) {
      // Add message to existing context
      try {
        await this.collection.updateOne(
          { sessionId },
          {
            $push: { messages: message as any },
            $set: {
              'metadata.updatedAt': new Date().toISOString(),
            },
          },
          { upsert: false }
        );
      } catch (error) {
        throw new Error(`Failed to add message to MongoDB: ${error}`);
      }
    } else {
      // Create new context with message
      const newContext: ConversationContext = {
        sessionId,
        messages: [message],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      await this.saveContext(sessionId, newContext);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.db = null;
      this.collection = null;
      this.connectionPromise = null;
    }
  }
}

