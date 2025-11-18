import { v4 as uuidv4 } from 'uuid';
import { Database, AgentConfig } from './database';
import { getCurrentTimestamp } from 'shared';

interface CreateAgentConfigInput {
  name: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface UpdateAgentConfigInput {
  name?: string;
  prompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface Context {
  db: Database;
  userId?: string;
}

export const createResolvers = (db: Database) => ({
  Query: {
    agentConfigs: async (_: any, __: any, context: Context): Promise<AgentConfig[]> => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const collection = db.getCollection();
      const configs = await collection.find({ userId: context.userId }).toArray();
      return configs.map(config => ({
        id: config.id,
        userId: config.userId,
        name: config.name,
        prompt: config.prompt,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      }));
    },

    agentConfig: async (_: any, { id }: { id: string }, context: Context): Promise<AgentConfig | null> => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const collection = db.getCollection();
      const config = await collection.findOne({ id, userId: context.userId });
      
      if (!config) return null;

      return {
        id: config.id,
        userId: config.userId,
        name: config.name,
        prompt: config.prompt,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      };
    },
  },

  Mutation: {
    createAgentConfig: async (_: any, { input }: { input: CreateAgentConfigInput }, context: Context): Promise<AgentConfig> => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const collection = db.getCollection();

      const newConfig: AgentConfig = {
        id: uuidv4(),
        userId: context.userId,
        name: input.name,
        prompt: input.prompt,
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        createdAt: getCurrentTimestamp(),
      };

      await collection.insertOne(newConfig as any);

      console.log(`✅ Agent config created: ${newConfig.id} for user: ${context.userId}`);
      return newConfig;
    },

    updateAgentConfig: async (_: any, { id, input }: { id: string; input: UpdateAgentConfigInput }, context: Context): Promise<AgentConfig> => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const collection = db.getCollection();

      const config = await collection.findOne({ id, userId: context.userId });
      if (!config) {
        throw new Error('Agent config not found');
      }

      const updatedConfig: AgentConfig = {
        ...config,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.prompt !== undefined && { prompt: input.prompt }),
        ...(input.model !== undefined && { model: input.model }),
        ...(input.temperature !== undefined && { temperature: input.temperature }),
        ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
        updatedAt: getCurrentTimestamp(),
      };

      await collection.updateOne(
        { id, userId: context.userId },
        { $set: updatedConfig }
      );

      console.log(`✅ Agent config updated: ${id}`);
      return updatedConfig;
    },

    deleteAgentConfig: async (_: any, { id }: { id: string }, context: Context): Promise<boolean> => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const collection = db.getCollection();

      const result = await collection.deleteOne({ id, userId: context.userId });

      if (result.deletedCount === 0) {
        throw new Error('Agent config not found');
      }

      console.log(`✅ Agent config deleted: ${id}`);
      return true;
    },
  },

  AgentConfig: {
    __resolveReference: async (reference: { id: string }, context: Context): Promise<AgentConfig | null> => {
      const collection = context.db.getCollection();
      const config = await collection.findOne({ id: reference.id });
      if (!config) return null;

      return {
        id: config.id,
        userId: config.userId,
        name: config.name,
        prompt: config.prompt,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      };
    },
  },
});

