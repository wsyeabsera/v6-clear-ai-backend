import { MongoClient, Db, Collection } from 'mongodb';
import { IContextManager, Message, ConversationContext, MongoConfig } from '../types';
import { KernelErrors, KernelError } from '../../errors';

export class MongoContextManager implements IContextManager {
  private client: MongoClient;
  private db: Db | null = null;
  private collection: Collection | null = null;
  private config: MongoConfig;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: MongoConfig) {
    this.config = config;
    this.client = new MongoClient(config.connectionString, {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2'),
      maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '30000'),
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000'),
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '45000'),
      connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || '10000'),
    });
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
        throw KernelErrors.connectionFailed(
          'MongoContextManager',
          'connect',
          error,
          { databaseName: this.config.databaseName }
        );
      }
    })();

    await this.connectionPromise;
  }

  async getContext(sessionId: string): Promise<ConversationContext | null> {
    await this.ensureConnected();
    if (!this.collection) {
      throw KernelErrors.notInitialized('MongoContextManager', 'collection');
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
      throw KernelErrors.operationFailed(
        'MongoContextManager',
        'getContext',
        undefined,
        error,
        { sessionId }
      );
    }
  }

  async saveContext(sessionId: string, context: ConversationContext): Promise<void> {
    await this.ensureConnected();
    if (!this.collection) {
      throw KernelErrors.notInitialized('MongoContextManager', 'collection');
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
      throw KernelErrors.operationFailed(
        'MongoContextManager',
        'saveContext',
        undefined,
        error,
        { sessionId }
      );
    }
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    await this.ensureConnected();
    if (!this.collection) {
      throw KernelErrors.notInitialized('MongoContextManager', 'collection');
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
        throw KernelErrors.operationFailed(
          'MongoContextManager',
          'addMessage',
          undefined,
          error,
          { sessionId }
        );
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

