import { AskModeHandler } from '../handlers/AskModeHandler';
import { PlanModeHandler } from '../handlers/PlanModeHandler';
import { AgentModeHandler } from '../handlers/AgentModeHandler';
import { ConversationService } from '../services/conversation/ConversationService';
import { Database } from '../database';
import { KernelAdapter } from '../kernel/KernelAdapter';

interface Context {
  db: Database;
  kernelAdapter: KernelAdapter;
  conversationService: ConversationService;
  askModeHandler: AskModeHandler;
  planModeHandler: PlanModeHandler;
  agentModeHandler: AgentModeHandler;
  userId?: string;
}

export const createResolvers = (
  db: Database,
  _kernelAdapter: KernelAdapter,
  conversationService: ConversationService,
  askModeHandler: AskModeHandler,
  planModeHandler: PlanModeHandler,
  agentModeHandler: AgentModeHandler
) => ({
  JSON: {
    __serialize: (value: any) => value,
    __parseValue: (value: any) => value,
    __parseLiteral: (ast: any) => {
      if (ast.kind === 'StringValue') {
        try {
          return JSON.parse(ast.value);
        } catch {
          return ast.value;
        }
      }
      return null;
    },
  },
  Query: {
    conversation: async (_: any, { sessionId }: { sessionId: string }, context: Context) => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      const messages = await conversationService.getConversationHistory(sessionId);
      
      if (messages.length === 0) {
        return null;
      }

      const collection = db.getCollection();
      const conversation = await collection.findOne({ sessionId, userId: context.userId });

      if (!conversation) {
        return null;
      }

      return {
        sessionId,
        messages,
        createdAt: conversation.createdAt || '',
        updatedAt: conversation.updatedAt,
      };
    },
    conversations: async (_: any, __: any, context: Context) => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      return await conversationService.getAllConversations(context.userId);
    },
  },

  Mutation: {
    ask: async (
      _: any,
      { query, sessionId, configId }: { query: string; sessionId?: string; configId?: string },
      context: Context
    ) => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      if (!query || query.trim().length === 0) {
        throw new Error('Query cannot be empty');
      }

      return await askModeHandler.handle({
        userId: context.userId,
        query: query.trim(),
        sessionId,
        configId,
      });
    },
    plan: async (
      _: any,
      { query, sessionId, configId }: { query: string; sessionId?: string; configId?: string },
      context: Context
    ) => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      if (!query || query.trim().length === 0) {
        throw new Error('Query cannot be empty');
      }

      return await planModeHandler.handle({
        userId: context.userId,
        query: query.trim(),
        sessionId,
        configId,
      });
    },
    execute: async (
      _: any,
      { query, sessionId, configId, maxIterations }: { query: string; sessionId?: string; configId?: string; maxIterations?: number },
      context: Context
    ) => {
      if (!context.userId) {
        throw new Error('Authentication required');
      }

      if (!query || query.trim().length === 0) {
        throw new Error('Query cannot be empty');
      }

      return await agentModeHandler.handle({
        userId: context.userId,
        query: query.trim(),
        sessionId,
        configId,
        maxIterations,
      });
    },
  },
});

