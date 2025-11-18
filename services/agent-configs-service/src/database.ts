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
    this.client = new MongoClient(uri);
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
    await this.client.close();
    console.log('✅ Disconnected from Agent Configs Service database');
  }
}

