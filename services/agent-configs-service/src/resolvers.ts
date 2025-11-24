import { v4 as uuidv4 } from 'uuid';
import { Database, AgentConfig } from './database';
import { getCurrentTimestamp } from 'shared';

// Supported model names (can be extended)
const SUPPORTED_MODELS = [
  'gpt-4',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'llama2',
  'llama3',
  'mistral',
  'gemini-pro',
];

// Validation constants
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;
const MIN_MAX_TOKENS = 1;
const MAX_MAX_TOKENS = 1000000; // 1 million tokens max
const MIN_PROMPT_LENGTH = 1;
const MAX_PROMPT_LENGTH = 100000; // 100k characters max
const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 200;

/**
 * Validate agent config input
 */
function validateAgentConfig(input: Partial<CreateAgentConfigInput>, isUpdate: boolean = false): void {
  if (input.name !== undefined) {
    if (typeof input.name !== 'string') {
      throw new Error('Name must be a string');
    }
    if (input.name.trim().length < MIN_NAME_LENGTH) {
      throw new Error(`Name must be at least ${MIN_NAME_LENGTH} character long`);
    }
    if (input.name.length > MAX_NAME_LENGTH) {
      throw new Error(`Name must be at most ${MAX_NAME_LENGTH} characters long`);
    }
  } else if (!isUpdate) {
    throw new Error('Name is required');
  }

  if (input.prompt !== undefined) {
    if (typeof input.prompt !== 'string') {
      throw new Error('Prompt must be a string');
    }
    if (input.prompt.trim().length < MIN_PROMPT_LENGTH) {
      throw new Error(`Prompt must be at least ${MIN_PROMPT_LENGTH} character long`);
    }
    if (input.prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Prompt must be at most ${MAX_PROMPT_LENGTH} characters long`);
    }
  } else if (!isUpdate) {
    throw new Error('Prompt is required');
  }

  if (input.model !== undefined) {
    if (typeof input.model !== 'string') {
      throw new Error('Model must be a string');
    }
    if (input.model.trim().length === 0) {
      throw new Error('Model cannot be empty');
    }
    // Allow custom models but warn if not in supported list
    const normalizedModel = input.model.toLowerCase().trim();
    if (!SUPPORTED_MODELS.some(m => normalizedModel.includes(m.toLowerCase()))) {
      console.warn(`⚠️  Using potentially unsupported model: ${input.model}`);
    }
  } else if (!isUpdate) {
    throw new Error('Model is required');
  }

  if (input.temperature !== undefined) {
    if (typeof input.temperature !== 'number') {
      throw new Error('Temperature must be a number');
    }
    if (isNaN(input.temperature)) {
      throw new Error('Temperature must be a valid number');
    }
    if (input.temperature < MIN_TEMPERATURE || input.temperature > MAX_TEMPERATURE) {
      throw new Error(`Temperature must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}`);
    }
  } else if (!isUpdate) {
    throw new Error('Temperature is required');
  }

  if (input.maxTokens !== undefined) {
    if (typeof input.maxTokens !== 'number') {
      throw new Error('MaxTokens must be a number');
    }
    if (isNaN(input.maxTokens)) {
      throw new Error('MaxTokens must be a valid number');
    }
    if (!Number.isInteger(input.maxTokens)) {
      throw new Error('MaxTokens must be an integer');
    }
    if (input.maxTokens < MIN_MAX_TOKENS || input.maxTokens > MAX_MAX_TOKENS) {
      throw new Error(`MaxTokens must be between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`);
    }
  } else if (!isUpdate) {
    throw new Error('MaxTokens is required');
  }
}

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

      // Validate input
      validateAgentConfig(input, false);

      const collection = db.getCollection();

      const newConfig: AgentConfig = {
        id: uuidv4(),
        userId: context.userId,
        name: input.name.trim(),
        prompt: input.prompt.trim(),
        model: input.model.trim(),
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

      // Validate input (merge with existing config for validation)
      const collection = db.getCollection();
      const existingConfig = await collection.findOne({ id, userId: context.userId });
      if (!existingConfig) {
        throw new Error('Agent config not found');
      }

      // Create merged input for validation
      const mergedInput: Partial<CreateAgentConfigInput> = {
        name: input.name !== undefined ? input.name : existingConfig.name,
        prompt: input.prompt !== undefined ? input.prompt : existingConfig.prompt,
        model: input.model !== undefined ? input.model : existingConfig.model,
        temperature: input.temperature !== undefined ? input.temperature : existingConfig.temperature,
        maxTokens: input.maxTokens !== undefined ? input.maxTokens : existingConfig.maxTokens,
      };
      validateAgentConfig(mergedInput, true);

      const updatedConfig: AgentConfig = {
        ...existingConfig,
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.prompt !== undefined && { prompt: input.prompt.trim() }),
        ...(input.model !== undefined && { model: input.model.trim() }),
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

