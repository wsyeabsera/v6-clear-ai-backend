import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import * as dotenv from 'dotenv';
import express from 'express';
import { typeDefs } from './schema';
import { createResolvers } from './resolvers';
import { Database } from './database';
import { AuthService } from './auth';

// Load .env if it exists (for local development)
// Railway uses environment variables directly, so this is optional
dotenv.config();

async function startServer() {
  // Railway provides PORT, fallback to AGENT_CONFIGS_SERVICE_PORT for local dev
  const PORT = parseInt(process.env.PORT || process.env.AGENT_CONFIGS_SERVICE_PORT || '4003');

  // Initialize database
  const db = new Database();
  await db.connect();

  // Initialize Auth Service
  const authService = new AuthService();

  // Create Apollo Server with Federation
  const resolvers = createResolvers(db);
  const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  });

  await server.start();

  // Create Express app
  const app = express();

  // Health check endpoint
  app.get('/health', async (_req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'agent-configs-service',
      dependencies: {
        database: 'unknown',
      },
    };

    // Check database connection
    try {
      const collection = db.getCollection();
      await collection.findOne({}, { limit: 1 });
      health.dependencies.database = 'connected';
    } catch (error) {
      health.status = 'unhealthy';
      health.dependencies.database = 'disconnected';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // GraphQL endpoint
  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Extract and verify token
        const authHeader = req.headers.authorization;
        const token = authService.extractTokenFromHeader(authHeader);
        
        let userId: string | undefined;
        if (token) {
          try {
            const payload = authService.verifyToken(token);
            userId = payload.userId;
          } catch (error) {
            // Invalid token - userId remains undefined
            console.log('⚠️  Invalid token provided');
          }
        }

        return { db, authService, userId };
      },
    })
  );

  // Start Express server
  app.listen(PORT, () => {
    const baseUrl = `http://localhost:${PORT}`;
    console.log(`🚀 Agent Configs Service ready at ${baseUrl}`);
    console.log(`📊 GraphQL endpoint: ${baseUrl}/graphql`);
    console.log(`🏥 Health check endpoint: ${baseUrl}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await db.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await db.disconnect();
    process.exit(0);
  });
}

startServer().catch((error) => {
  console.error('❌ Failed to start Agent Configs Service:', error);
  process.exit(1);
});

