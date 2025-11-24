import { MongoClient, Db, Collection } from 'mongodb';
import { Message } from 'shared';

export interface Conversation {
  sessionId: string;
  userId: string;
  messages: Message[];
  createdAt: string;
  updatedAt?: string;
}

export class Database {
  private client: MongoClient;
  private db: Db | null = null;
  private conversationsCollection: Collection<Conversation> | null = null;

  constructor() {
    const uri = process.env.AI_SERVICE_MONGODB_URI || 
      'mongodb://localhost:27017/ai_service';
    this.client = new MongoClient(uri, {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10'),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2'),
      maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '30000'),
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000'),
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '45000'),
      connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || '10000'),
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db();
      this.conversationsCollection = this.db.collection<Conversation>('conversations');
      
      // Create indexes
      await this.conversationsCollection.createIndex({ userId: 1 });
      await this.conversationsCollection.createIndex({ sessionId: 1 }, { unique: true });
      await this.conversationsCollection.createIndex({ 'messages.timestamp': 1 });
      
      console.log('✅ Connected to AI Service MongoDB database');
    } catch (error) {
      console.error('❌ Database connection error:', error);
      throw error;
    }
  }

  getCollection(): Collection<Conversation> {
    if (!this.conversationsCollection) {
      throw new Error('Database not connected');
    }
    return this.conversationsCollection;
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      console.log('✅ Disconnected from AI Service database');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error);
      throw error;
    }
  }
}

