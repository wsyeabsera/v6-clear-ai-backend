import { v4 as uuidv4 } from 'uuid';
import { Database, AuthRecord } from './database';
import { AuthService } from './auth';
import { RabbitMQClient, EXCHANGES, ROUTING_KEYS, EventType, UserCreatedEvent, UserUpdatedEvent, UserDeletedEvent, UserRegisteredEvent, UserLoginEvent, User, getCurrentTimestamp, isValidEmail } from 'shared';

interface CreateUserInput {
  name: string;
  email: string;
}

interface UpdateUserInput {
  name?: string;
  email?: string;
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

export const createResolvers = (db: Database, authService: AuthService, rabbitMQ: RabbitMQClient) => ({
  Query: {
    users: async (): Promise<User[]> => {
      const collection = db.getUsersCollection();
      const users = await collection.find({}).toArray();
      return users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));
    },

    user: async (_: any, { id }: { id: string }): Promise<User | null> => {
      const collection = db.getUsersCollection();
      const user = await collection.findOne({ id });
      if (!user) return null;
      
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    },

    validateToken: async (_: any, { token }: { token: string }): Promise<boolean> => {
      try {
        authService.verifyToken(token);
        return true;
      } catch {
        return false;
      }
    },
  },

  Mutation: {
    createUser: async (_: any, { input }: { input: CreateUserInput }): Promise<User> => {
      const collection = db.getUsersCollection();
      
      // Check if user already exists
      const existingUser = await collection.findOne({ email: input.email });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const newUser: User = {
        id: uuidv4(),
        name: input.name,
        email: input.email,
        createdAt: getCurrentTimestamp(),
      };

      await collection.insertOne(newUser as any);

      // Publish user created event
      try {
        const event: UserCreatedEvent = {
          type: EventType.USER_CREATED,
          timestamp: getCurrentTimestamp(),
          data: newUser,
        };
        await rabbitMQ.publish(EXCHANGES.USERS, ROUTING_KEYS.USER_CREATED, event);
      } catch (error) {
        // RabbitMQ not available - continue without event publishing
      }

      console.log(`✅ User created: ${newUser.id}`);
      return newUser;
    },

    updateUser: async (_: any, { id, input }: { id: string; input: UpdateUserInput }): Promise<User> => {
      const collection = db.getUsersCollection();
      
      const user = await collection.findOne({ id });
      if (!user) {
        throw new Error('User not found');
      }

      // Check email uniqueness if updating email
      if (input.email && input.email !== user.email) {
        const existingUser = await collection.findOne({ email: input.email });
        if (existingUser) {
          throw new Error('User with this email already exists');
        }
      }

      const updatedUser: User = {
        ...user,
        ...(input.name && { name: input.name }),
        ...(input.email && { email: input.email }),
        updatedAt: getCurrentTimestamp(),
      };

      await collection.updateOne(
        { id },
        { $set: updatedUser }
      );

      // Publish user updated event
      try {
        const event: UserUpdatedEvent = {
          type: EventType.USER_UPDATED,
          timestamp: getCurrentTimestamp(),
          data: updatedUser,
        };
        await rabbitMQ.publish(EXCHANGES.USERS, ROUTING_KEYS.USER_UPDATED, event);
      } catch (error) {
        // RabbitMQ not available - continue without event publishing
      }

      console.log(`✅ User updated: ${id}`);
      return updatedUser;
    },

    deleteUser: async (_: any, { id }: { id: string }): Promise<boolean> => {
      const collection = db.getUsersCollection();
      
      const result = await collection.deleteOne({ id });
      
      if (result.deletedCount === 0) {
        throw new Error('User not found');
      }

      // Publish user deleted event
      try {
        const event: UserDeletedEvent = {
          type: EventType.USER_DELETED,
          timestamp: getCurrentTimestamp(),
          data: { id },
        };
        await rabbitMQ.publish(EXCHANGES.USERS, ROUTING_KEYS.USER_DELETED, event);
      } catch (error) {
        // RabbitMQ not available - continue without event publishing
      }

      console.log(`✅ User deleted: ${id}`);
      return true;
    },

    register: async (_: any, { input }: { input: RegisterInput }) => {
      const { name, email, password } = input;

      // Validate input
      if (!isValidEmail(email)) {
        throw new Error('Invalid email format');
      }
      authService.validatePassword(password);

      const usersCollection = db.getUsersCollection();
      const authCollection = db.getAuthCollection();

      // Check if user already exists
      const existingAuth = await authCollection.findOne({ email });
      if (existingAuth) {
        throw new Error('User with this email already exists');
      }

      // Create user directly (no inter-service call needed)
      const newUser: User = {
        id: uuidv4(),
        name,
        email,
        createdAt: getCurrentTimestamp(),
      };

      await usersCollection.insertOne(newUser as any);

      // Hash password and store auth record
      const passwordHash = await authService.hashPassword(password);
      const authRecord: AuthRecord = {
        userId: newUser.id,
        email,
        passwordHash,
        refreshTokens: [],
        createdAt: getCurrentTimestamp(),
      };

      await authCollection.insertOne(authRecord);

      // Generate tokens
      const tokens = authService.generateTokens(newUser.id, email);

      // Store refresh token
      await authCollection.updateOne(
        { userId: newUser.id },
        { $push: { refreshTokens: tokens.refreshToken } }
      );

      // Publish user registered event
      try {
        const event: UserRegisteredEvent = {
          type: EventType.USER_REGISTERED,
          timestamp: getCurrentTimestamp(),
          data: { id: newUser.id, email, name, createdAt: newUser.createdAt },
        };
        await rabbitMQ.publish(EXCHANGES.AUTH, ROUTING_KEYS.USER_REGISTERED, event);
      } catch (error) {
        // RabbitMQ not available - continue without event publishing
      }

      console.log(`✅ User registered: ${newUser.id}`);

      return {
        user: { id: newUser.id, name, email },
        tokens,
      };
    },

    login: async (_: any, { input }: { input: LoginInput }) => {
      const { email, password } = input;
      const authCollection = db.getAuthCollection();
      const usersCollection = db.getUsersCollection();

      // Find auth record
      const authRecord = await authCollection.findOne({ email });
      if (!authRecord) {
        throw new Error('Invalid email or password');
      }

      // Verify password
      const isValid = await authService.comparePassword(password, authRecord.passwordHash);
      if (!isValid) {
        throw new Error('Invalid email or password');
      }

      // Get user name from users collection
      const user = await usersCollection.findOne({ id: authRecord.userId });
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new tokens
      const tokens = authService.generateTokens(authRecord.userId, authRecord.email);

      // Store refresh token
      await authCollection.updateOne(
        { userId: authRecord.userId },
        { 
          $push: { refreshTokens: tokens.refreshToken },
          $set: { updatedAt: getCurrentTimestamp() }
        }
      );

      // Publish user login event
      try {
        const event: UserLoginEvent = {
          type: EventType.USER_LOGIN,
          timestamp: getCurrentTimestamp(),
          data: { userId: authRecord.userId, email: authRecord.email },
        };
        await rabbitMQ.publish(EXCHANGES.AUTH, ROUTING_KEYS.USER_LOGIN, event);
      } catch (error) {
        // RabbitMQ not available - continue without event publishing
      }

      console.log(`✅ User logged in: ${authRecord.userId}`);

      return {
        user: { id: authRecord.userId, name: user.name, email: authRecord.email },
        tokens,
      };
    },

    refreshToken: async (_: any, { refreshToken }: { refreshToken: string }) => {
      try {
        const payload = authService.verifyToken(refreshToken);
        const authCollection = db.getAuthCollection();

        // Verify refresh token exists in database
        const authRecord = await authCollection.findOne({ 
          userId: payload.userId,
          refreshTokens: { $in: [refreshToken] }
        });

        if (!authRecord) {
          console.error(`❌ Refresh token not found in database for user: ${payload.userId}`);
          throw new Error('Invalid refresh token');
        }

        // Generate new tokens
        const newTokens = authService.generateTokens(authRecord.userId, authRecord.email);

        // Remove old refresh token
        await authCollection.updateOne(
          { userId: authRecord.userId },
          {
            $pull: { refreshTokens: refreshToken }
          }
        );

        // Add new refresh token
        await authCollection.updateOne(
          { userId: authRecord.userId },
          {
            $push: { refreshTokens: newTokens.refreshToken },
            $set: { updatedAt: getCurrentTimestamp() }
          }
        );

        console.log(`✅ Token refreshed: ${authRecord.userId}`);
        return newTokens;
      } catch (error) {
        console.error(`❌ Refresh token error:`, error);
        throw new Error('Invalid or expired refresh token');
      }
    },
  },

  User: {
    __resolveReference: async (reference: { id: string }, { db }: { db: Database }): Promise<User | null> => {
      const collection = db.getUsersCollection();
      const user = await collection.findOne({ id: reference.id });
      if (!user) return null;
      
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    },

    hasPassword: async (user: { id: string }, _: any, { db }: { db: Database }): Promise<boolean> => {
      const authCollection = db.getAuthCollection();
      const authRecord = await authCollection.findOne({ userId: user.id });
      return !!authRecord?.passwordHash;
    },
  },
});
