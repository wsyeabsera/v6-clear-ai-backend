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
    this.client = new MongoClient(uri);
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
    await this.client.close();
    console.log('✅ Disconnected from User Service database');
  }
}
