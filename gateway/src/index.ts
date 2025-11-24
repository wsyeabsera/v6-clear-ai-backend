import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import cors from 'cors';
import * as dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';

// Load .env if it exists (for local development)
// Railway uses environment variables directly, so this is optional
dotenv.config();

// Track gateway start time for uptime calculation
const gatewayStartTime = Date.now();

// Simple in-memory rate limiter
interface RateLimitStore {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitStore>();

function getRateLimitKey(req: any): string {
  // Use IP address for unauthenticated, userId for authenticated
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const authHeader = req.headers.authorization || req.headers.Authorization as string;
  const token = extractTokenFromHeader(authHeader);
  
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload) {
        return `user:${payload.userId}`;
      }
    } catch {
      // Invalid token, use IP
    }
  }
  
  return `ip:${ip}`;
}

function checkRateLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    // Create new record or reset expired one
    const newRecord: RateLimitStore = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, newRecord);
    
    // Clean up old entries periodically
    if (rateLimitStore.size > 10000) {
      for (const [k, v] of rateLimitStore.entries()) {
        if (now > v.resetTime) {
          rateLimitStore.delete(k);
        }
      }
    }
    
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: newRecord.resetTime,
    };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }

  record.count++;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

// Request logging middleware
function requestLogger(req: any, res: any, next: any) {
  const startTime = Date.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${requestId}`);
  if (req.body && req.body.query) {
    const query = req.body.query.replace(/\s+/g, ' ').substring(0, 100);
    console.log(`  Query: ${query}...`);
  }

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms - ${requestId}`);
  });

  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  req.headers['x-request-id'] = requestId;

  next();
}

// JWT verification utility
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

interface JWTPayload {
  userId: string;
  email: string;
}

function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return authHeader;
}

// Custom data source to forward headers
class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  willSendRequest({ request, context }: any) {
    // Forward the authorization header from the gateway context to the subgraph
    if (context.headers?.authorization) {
      request.http.headers.set('authorization', context.headers.authorization);
    }
    // Forward user context if available
    if (context.userId) {
      request.http.headers.set('x-user-id', context.userId);
    }
  }
}

// Helper function to check if a service is ready
async function waitForService(url: string, maxRetries = 30, delayMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Service not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return false;
}

// Health check function for individual services
interface ServiceHealthResult {
  name: string;
  status: 'healthy' | 'unhealthy';
  url: string;
  responseTime: number;
  lastChecked: string;
  error?: string;
}

async function checkServiceHealth(name: string, url: string): Promise<ServiceHealthResult> {
  const startTime = Date.now();
  const lastChecked = new Date().toISOString();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    if (response.ok) {
      return {
        name,
        status: 'healthy',
        url,
        responseTime,
        lastChecked,
      };
    } else {
      return {
        name,
        status: 'unhealthy',
        url,
        responseTime,
        lastChecked,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      name,
      status: 'unhealthy',
      url,
      responseTime,
      lastChecked,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function startGateway() {
  // Railway provides PORT, fallback to GATEWAY_PORT for local dev
  const PORT = parseInt(process.env.PORT || process.env.GATEWAY_PORT || '4000');

  // Wait for services to be ready before starting gateway
  console.log('⏳ Waiting for subgraph services to be ready...');
  
  const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:4001/graphql';
  const agentConfigsServiceUrl = process.env.AGENT_CONFIGS_SERVICE_URL || 'http://localhost:4003/graphql';
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:4005/graphql';
  
  const [userServiceReady, agentConfigsReady, aiServiceReady] = await Promise.all([
    waitForService(userServiceUrl),
    waitForService(agentConfigsServiceUrl),
    waitForService(aiServiceUrl),
  ]);

  if (!userServiceReady) {
    console.error(`❌ User Service at ${userServiceUrl} is not responding`);
    throw new Error('User Service not available');
  }
  if (!agentConfigsReady) {
    console.error(`❌ Agent Configs Service at ${agentConfigsServiceUrl} is not responding`);
    throw new Error('Agent Configs Service not available');
  }
  if (!aiServiceReady) {
    console.error(`❌ AI Service at ${aiServiceUrl} is not responding`);
    throw new Error('AI Service not available');
  }

  console.log('✅ All subgraph services are ready!');

  // Configure subgraph services with error handling
  let gateway: ApolloGateway;
  
  try {
    gateway = new ApolloGateway({
      supergraphSdl: new IntrospectAndCompose({
        subgraphs: [
          {
            name: 'user-service',
            url: userServiceUrl,
          },
          {
            name: 'agent-configs-service',
            url: agentConfigsServiceUrl,
          },
          {
            name: 'ai-service',
            url: aiServiceUrl,
          },
        ],
        // Poll for schema updates every 10 seconds in development
        pollIntervalInMs: process.env.NODE_ENV === 'production' ? undefined : 10000,
        // Retry configuration
        introspectionHeaders: async () => {
          return {};
        },
      }),
      buildService({ url }) {
        return new AuthenticatedDataSource({ url });
      },
    });

    // Handle gateway schema changes
    gateway.onSchemaChange?.(() => {
      console.log('✅ Gateway schema composed successfully');
    });
  } catch (error) {
    console.error('❌ Failed to create Apollo Gateway:', error);
    throw error;
  }

  // Create Apollo Server with Gateway
  const server = new ApolloServer({
    gateway,
    // Disable subscriptions (not supported by gateway yet)
    // Enable introspection and playground in development
    introspection: process.env.NODE_ENV !== 'production',
    // Add error formatting
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      // Don't expose internal errors in production
      if (process.env.NODE_ENV === 'production') {
        return {
          message: error.message,
          extensions: {
            code: error.extensions?.code,
          },
        };
      }
      return error;
    },
  });

  // Start Apollo Server with error handling
  try {
    await server.start();
    console.log('✅ Apollo Server started successfully');
  } catch (error) {
    console.error('❌ Failed to start Apollo Server:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('composition') || errorMessage.includes('schema')) {
      console.error('   Schema composition failed. Common issues:');
      console.error('   - Check that all services are running and accessible');
      console.error('   - Verify all services use @key directives correctly');
      console.error('   - Ensure schemas are compatible (no type conflicts)');
      console.error('   - Check service URLs are correct');
    }
    throw error;
  }

  // Create Express app
  const app = express();

  // Configure CORS before any other middleware so preflight requests succeed
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  const allowAllOrigins = allowedOrigins.includes('*');

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Request-ID',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-ID',
    ],
    maxAge: parseInt(process.env.CORS_MAX_AGE || '600', 10),
  };

  const corsMiddleware = cors(corsOptions);
  app.use(corsMiddleware);
  app.options('*', corsMiddleware);

  // Request logging middleware (before other middleware)
  app.use(requestLogger);

  // Rate limiting middleware
  const rateLimitConfig = {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute default
    authenticatedMaxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS || '200'),
  };

  app.use('/graphql', (req, res, next) => {
    // Let CORS middleware handle OPTIONS requests
    if (req.method === 'OPTIONS') {
      return next();
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5b81f55a-0796-4e2a-a2c0-ef97a836056f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix-1',
        hypothesisId: 'H1',
        location: 'backend/gateway/src/index.ts:rateLimitMiddleware',
        message: 'Incoming /graphql request',
        data: {
          method: req.method,
          origin: req.headers.origin || null,
          hasCorsHeader: typeof res.getHeader === 'function' && !!res.getHeader('Access-Control-Allow-Origin'),
          hasAuthorizationHeader: !!req.headers.authorization,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const key = getRateLimitKey(req);
    const isAuthenticated = key.startsWith('user:');
    const maxRequests = isAuthenticated ? rateLimitConfig.authenticatedMaxRequests : rateLimitConfig.maxRequests;
    
    const rateLimit = checkRateLimit(key, maxRequests, rateLimitConfig.windowMs);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5b81f55a-0796-4e2a-a2c0-ef97a836056f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'pre-fix-1',
        hypothesisId: 'H2',
        location: 'backend/gateway/src/index.ts:rateLimitDecision',
        message: 'Rate limit evaluated',
        data: {
          allowed: rateLimit.allowed,
          remaining: rateLimit.remaining,
          resetTime: rateLimit.resetTime,
          method: req.method,
          isOptionsMethod: req.method === 'OPTIONS',
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

    res.on('finish', () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5b81f55a-0796-4e2a-a2c0-ef97a836056f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'debug-session',
          runId: 'pre-fix-1',
          hypothesisId: 'H3',
          location: 'backend/gateway/src/index.ts:rateLimitResponse',
          message: 'GraphQL response sent',
          data: {
            statusCode: res.statusCode,
            hasCorsAllowOrigin: typeof res.getHeader === 'function' && !!res.getHeader('Access-Control-Allow-Origin'),
            allowOrigin: typeof res.getHeader === 'function' ? res.getHeader('Access-Control-Allow-Origin') || null : null,
            allowHeaders: typeof res.getHeader === 'function' ? res.getHeader('Access-Control-Allow-Headers') || null : null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    });
    
    if (!rateLimit.allowed) {
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again after ${new Date(rateLimit.resetTime).toISOString()}`,
        retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
      });
      return;
    }
    
    next();
  });

  // Health check endpoint
  app.get('/health', async (_req, res) => {
    const services = [
      { name: 'user-service', url: userServiceUrl },
      { name: 'agent-configs-service', url: agentConfigsServiceUrl },
      { name: 'ai-service', url: aiServiceUrl },
    ];

    // Run health checks in parallel
    const healthChecks = await Promise.all(
      services.map(service => checkServiceHealth(service.name, service.url))
    );

    // Calculate overall status
    const allHealthy = healthChecks.every(s => s.status === 'healthy');
    const anyHealthy = healthChecks.some(s => s.status === 'healthy');
    
    const overallStatus = allHealthy ? 'healthy' : anyHealthy ? 'degraded' : 'unhealthy';
    const httpStatus = allHealthy ? 200 : 503;

    // Calculate gateway uptime
    const uptime = Math.floor((Date.now() - gatewayStartTime) / 1000);

    // Build response
    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      gateway: {
        status: 'healthy',
        uptime,
      },
      services: Object.fromEntries(
        healthChecks.map(s => [s.name, {
          status: s.status,
          url: s.url,
          responseTime: s.responseTime,
          lastChecked: s.lastChecked,
        }])
      ),
    };

    res.status(httpStatus).json(response);
  });

  // Mount Apollo Server middleware
  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Extract and verify JWT token
        const authHeader = req.headers.authorization || req.headers.Authorization as string;
        const token = extractTokenFromHeader(authHeader);
        
        let userId: string | undefined;
        let userEmail: string | undefined;
        
        if (token) {
          const payload = verifyToken(token);
          if (payload) {
            userId = payload.userId;
            userEmail = payload.email;
          } else {
            // Token is invalid but don't fail - let services handle auth
            console.warn('⚠️  Invalid JWT token in request');
          }
        }

        // Forward authorization header and user context to subgraphs
        return {
          headers: {
            authorization: authHeader || '',
          },
          userId,
          userEmail,
        };
      },
    })
  );

  // Start Express server
  app.listen(PORT, () => {
    const baseUrl = `http://localhost:${PORT}`;
    console.log('🚀 Apollo Gateway ready!');
    console.log(`📊 GraphQL endpoint: ${baseUrl}/graphql`);
    console.log(`🔍 GraphQL Playground: ${baseUrl}/graphql`);
    console.log(`🏥 Health check endpoint: ${baseUrl}/health`);
    console.log('\n📡 Federated Services:');
    console.log(`  - User Service: ${userServiceUrl}`);
    console.log(`  - Agent Configs Service: ${agentConfigsServiceUrl}`);
    console.log(`  - AI Service: ${aiServiceUrl}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

startGateway().catch((error) => {
  console.error('❌ Failed to start Apollo Gateway:', error);
  process.exit(1);
});

