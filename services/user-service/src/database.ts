import { MongoClient, Db, Collection } from 'mongodb';
import { User } from 'shared';

export interface AuthRecord {
  userId: string;
  email: string;
  passwordHash: string;
  refreshTokens: string[];
  createdAt: string;
  updatedAt?: string;
}

export class Database {
  private client: MongoClient;
  private db: Db | null = null;
  private usersCollection: Collection<User> | null = null;
  private authCollection: Collection<AuthRecord> | null = null;

  constructor() {
    const uri = process.env.USER_SERVICE_MONGODB_URI || 
      'mongodb://localhost:27017/user_service';
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
      this.usersCollection = this.db.collection<User>('users');
      this.authCollection = this.db.collection<AuthRecord>('auth_records');
      
      // Create indexes for users
      await this.usersCollection.createIndex({ email: 1 }, { unique: true });
      
      // Create indexes for auth records
      await this.authCollection.createIndex({ userId: 1 }, { unique: true });
      await this.authCollection.createIndex({ email: 1 }, { unique: true });
      
      console.log('✅ Connected to User Service MongoDB database');
    } catch (error) {
      console.error('❌ Database connection error:', error);
      throw error;
    }
  }

  getUsersCollection(): Collection<User> {
    if (!this.usersCollection) {
      throw new Error('Database not connected');
    }
    return this.usersCollection;
  }

  getAuthCollection(): Collection<AuthRecord> {
    if (!this.authCollection) {
      throw new Error('Database not connected');
    }
    return this.authCollection;
  }

  // Keep backward compatibility
  getCollection(): Collection<User> {
    return this.getUsersCollection();
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      console.log('✅ Disconnected from User Service database');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error);
      throw error;
    }
  }
}
