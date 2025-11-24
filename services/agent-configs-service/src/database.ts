import { MongoClient, Db, Collection } from 'mongodb';

export interface AgentConfig {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  createdAt: string;
  updatedAt?: string;
}

export class Database {
  private client: MongoClient;
  private db: Db | null = null;
  private configsCollection: Collection<AgentConfig> | null = null;

  constructor() {
    const uri = process.env.AGENT_CONFIGS_SERVICE_MONGODB_URI || 
      'mongodb://localhost:27017/agent_configs_service';
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
      this.configsCollection = this.db.collection<AgentConfig>('agent_configs');
      
      // Create indexes
      await this.configsCollection.createIndex({ userId: 1 });
      await this.configsCollection.createIndex({ id: 1 }, { unique: true });
      
      console.log('✅ Connected to Agent Configs Service MongoDB database');
    } catch (error) {
      console.error('❌ Database connection error:', error);
      throw error;
    }
  }

  getCollection(): Collection<AgentConfig> {
    if (!this.configsCollection) {
      throw new Error('Database not connected');
    }
    return this.configsCollection;
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      console.log('✅ Disconnected from Agent Configs Service database');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error);
      throw error;
    }
  }
}

