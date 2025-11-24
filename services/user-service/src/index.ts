import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import * as dotenv from 'dotenv';
import express from 'express';
import { typeDefs } from './schema';
import { createResolvers } from './resolvers';
import { Database } from './database';
import { AuthService } from './auth';
import { RabbitMQClient, EXCHANGES, QUEUES, ROUTING_KEYS } from 'shared';

// Load .env if it exists (for local development)
// Railway uses environment variables directly, so this is optional
dotenv.config();

async function startServer() {
  // Railway provides PORT, fallback to USER_SERVICE_PORT for local dev
  const PORT = parseInt(process.env.PORT || process.env.USER_SERVICE_PORT || '4001');

  // Initialize database
  const db = new Database();
  await db.connect();

  // Initialize Auth Service
  const authService = new AuthService();

  // Initialize RabbitMQ (optional)
  const rabbitMQ = new RabbitMQClient();
  let rabbitMQConnected = false;
  
  try {
    await rabbitMQ.connect();
    await rabbitMQ.assertExchange(EXCHANGES.USERS);
    await rabbitMQ.assertExchange(EXCHANGES.AUTH);
    await rabbitMQ.assertQueue(QUEUES.USER_SERVICE);
    await rabbitMQ.bindQueue(QUEUES.USER_SERVICE, EXCHANGES.AUTH, ROUTING_KEYS.USER_REGISTERED);
    
    // Listen for events from other services
    await rabbitMQ.consume(QUEUES.USER_SERVICE, async (event) => {
      console.log(`📨 Received event: ${event.type}`, event.data);
      // Handle events from other services
    });
    
    rabbitMQConnected = true;
  } catch (error) {
    console.log('⚠️  RabbitMQ not available - service will run without event messaging');
  }

  // Create Apollo Server with Federation
  const resolvers = createResolvers(db, authService, rabbitMQ);
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
      service: 'user-service',
      dependencies: {
        database: 'unknown',
        rabbitMQ: rabbitMQConnected ? 'connected' : 'disconnected',
      },
    };

    // Check database connection
    try {
      const collection = db.getUsersCollection();
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
      context: async () => ({ db, authService, rabbitMQ }),
    })
  );

  // Start Express server
  app.listen(PORT, () => {
    const baseUrl = `http://localhost:${PORT}`;
    console.log(`🚀 User Service ready at ${baseUrl}`);
    console.log(`📊 GraphQL endpoint: ${baseUrl}/graphql`);
    console.log(`🏥 Health check endpoint: ${baseUrl}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await db.disconnect();
    if (rabbitMQConnected) await rabbitMQ.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await db.disconnect();
    if (rabbitMQConnected) await rabbitMQ.disconnect();
    process.exit(0);
  });
}

startServer().catch((error) => {
  console.error('❌ Failed to start User Service:', error);
  process.exit(1);
});

