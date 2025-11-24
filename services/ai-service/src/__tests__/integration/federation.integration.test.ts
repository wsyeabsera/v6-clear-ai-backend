import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import axios from 'axios';
import { Database } from '../../database';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { ConversationService } from '../../services/conversation/ConversationService';
import { AskModeHandler } from '../../handlers/AskModeHandler';
import { createResolvers } from '../../schema/resolvers';
import { typeDefs } from '../../schema/typeDefs';
import { AuthService } from '../../auth';
import {
  loadTestEnv,
  checkOllamaAvailability,
  checkOllamaModel,
  createTestAgentConfig,
  deleteTestAgentConfig,
  cleanupTestAgentConfigs,
  cleanupTestConversations,
  generateTestUserId,
  createTestJWT,
} from './utils';

describe('GraphQL Federation Integration Tests', () => {
  let server: ApolloServer;
  let serverUrl: string;
  let db: Database;
  let kernelAdapter: KernelAdapter;
  let conversationService: ConversationService;
  let askModeHandler: AskModeHandler;
  let testUserId: string;
  let testToken: string;
  let testSessionIds: string[] = [];
  let testConfigIds: string[] = [];
  let ollamaAvailable = false;
  let ollamaModel = 'llama2';

  beforeAll(async () => {
    ollamaAvailable = await checkOllamaAvailability();
    
    if (ollamaAvailable) {
      const env = loadTestEnv();
      ollamaModel = env.ollamaModel;
      const modelAvailable = await checkOllamaModel(ollamaModel);
      if (!modelAvailable) {
        ollamaModel = 'llama2';
      }
    }

    process.env.CONTEXT_MANAGER_TYPE = 'mongo';
    process.env.MEMORY_SYSTEM_TYPE = 'local';
    process.env.AI_SERVICE_MONGODB_URI = process.env.AI_SERVICE_MONGODB_URI || 'mongodb://localhost:27017/ai_service_test';

    db = new Database();
    await db.connect();

    kernelAdapter = new KernelAdapter();
    conversationService = new ConversationService(db, kernelAdapter);
    askModeHandler = new AskModeHandler(conversationService, kernelAdapter);

    const resolvers = createResolvers(db, kernelAdapter, conversationService, askModeHandler);
    server = new ApolloServer({
      schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
    });

    const { url } = await startStandaloneServer(server, {
      listen: { port: 0 },
      context: async ({ req }) => {
        const authService = new AuthService();
        const authHeader = req.headers.authorization;
        const token = authService.extractTokenFromHeader(authHeader);
        
        let userId: string | undefined;
        if (token) {
          try {
            const payload = authService.verifyToken(token);
            userId = payload.userId;
          } catch (error) {
            // Invalid token
          }
        }

        return {
          db,
          kernelAdapter,
          conversationService,
          askModeHandler,
          userId,
        };
      },
    });

    serverUrl = url;
  }, 60000);

  beforeEach(async () => {
    if (!ollamaAvailable) return;

    testUserId = generateTestUserId();
    testToken = createTestJWT(testUserId);
    testSessionIds = [];
    testConfigIds = [];
  });

  afterEach(async () => {
    if (!ollamaAvailable) return;

    if (testSessionIds.length > 0) {
      await cleanupTestConversations(testSessionIds);
    }
    
    if (testConfigIds.length > 0) {
      for (const configId of testConfigIds) {
        await deleteTestAgentConfig(configId);
      }
    }

    if (testUserId) {
      await cleanupTestAgentConfigs(testUserId);
    }
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    if (db) {
      await db.disconnect();
    }
  });

  describe('Agent Config Federation', () => {
    it('should fetch agent config from MongoDB (simulating federation)', async () => {
      if (!ollamaAvailable) return;

      // Create agent config in MongoDB
      const agentConfig = await createTestAgentConfig(testUserId, {
        name: 'Federation Test Config',
        model: ollamaModel,
        prompt: 'You are helpful.',
        temperature: 0.7,
        maxTokens: 100,
      });
      testConfigIds.push(agentConfig.id);

      // Use the config via ask mutation
      const response = await axios.post(
        `${serverUrl}graphql`,
        {
          query: `
            mutation Ask($query: String!, $configId: ID) {
              ask(query: $query, configId: $configId) {
                id
                sessionId
                response
                model
              }
            }
          `,
          variables: {
            query: 'Say hello',
            configId: agentConfig.id,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data.ask).toBeDefined();
      expect(response.data.data.ask.model).toBe(ollamaModel);
      testSessionIds.push(response.data.data.ask.sessionId);
    }, 60000);
  });

  describe('Authentication Token Forwarding', () => {
    it('should forward authentication token correctly', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // Request with token
      const response = await axios.post(
        `${serverUrl}graphql`,
        {
          query: `
            mutation Ask($query: String!) {
              ask(query: $query) {
                sessionId
                response
              }
            }
          `,
          variables: {
            query: 'Test',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.data.ask).toBeDefined();
    }, 60000);

    it('should reject requests without authentication', async () => {
      const response = await axios.post(
        `${serverUrl}graphql`,
        {
          query: `
            mutation Ask($query: String!) {
              ask(query: $query) {
                sessionId
                response
              }
            }
          `,
          variables: {
            query: 'Test',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          validateStatus: () => true,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.errors).toBeDefined();
      expect(response.data.errors[0].message).toContain('Authentication required');
    });
  });

  describe('Cross-Service Queries', () => {
    it('should handle queries that would require federation', async () => {
      if (!ollamaAvailable) return;

      // This test verifies that the service can handle queries
      // that would normally require federation with agent-configs-service
      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // Query conversation which might reference agent config
      const askResponse = await axios.post(
        `${serverUrl}graphql`,
        {
          query: `
            mutation Ask($query: String!, $configId: ID) {
              ask(query: $query, configId: $configId) {
                id
                sessionId
                response
              }
            }
          `,
          variables: {
            query: 'Hello',
            configId: agentConfig.id,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
        }
      );

      const sessionId = askResponse.data.data.ask.sessionId;
      testSessionIds.push(sessionId);

      // Query conversation
      const convResponse = await axios.post(
        `${serverUrl}graphql`,
        {
          query: `
            query Conversation($sessionId: ID!) {
              conversation(sessionId: $sessionId) {
                sessionId
                messages {
                  role
                  content
                }
              }
            }
          `,
          variables: {
            sessionId,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
        }
      );

      expect(convResponse.status).toBe(200);
      expect(convResponse.data.data.conversation).toBeDefined();
      expect(convResponse.data.data.conversation.messages.length).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Error Handling in Federated Queries', () => {
    it('should handle missing agent config gracefully', async () => {
      const response = await axios.post(
        `${serverUrl}graphql`,
        {
          query: `
            mutation Ask($query: String!, $configId: ID) {
              ask(query: $query, configId: $configId) {
                id
                response
              }
            }
          `,
          variables: {
            query: 'Test',
            configId: 'non-existent-config',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testToken}`,
          },
          validateStatus: () => true,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.errors).toBeDefined();
    });
  });
});

