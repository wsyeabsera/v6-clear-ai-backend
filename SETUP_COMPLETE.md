# ✅ Backend Setup Complete!

Your microservices backend is fully configured and ready to use!

## What's Been Set Up

### ✅ Project Structure
- **Root workspace** with npm workspaces configuration
- **Shared package** with common types, utilities, and RabbitMQ client
- **User Service** - GraphQL API for user management (MongoDB)
- **Auth Service** - JWT authentication with register/login (MongoDB) 
- **Apollo Gateway** - Federated GraphQL endpoint

### ✅ Database Configuration
- MongoDB running locally (localhost:27017)
- Separate databases for each service:
  - `user_service` - User data
  - `auth_service` - Authentication data
- No authentication required for local development

### ✅ Compiled and Ready
- All TypeScript code compiles successfully
- Dependencies installed
- Build artifacts generated

## 🚀 How to Start

### Option 1: Start All Services Together

```bash
cd backend
npm run dev
```

This starts:
- User Service on http://localhost:4001/graphql
- Auth Service on http://localhost:4002/graphql  
- Apollo Gateway on http://localhost:4000/graphql (main endpoint)

### Option 2: Start Services Individually

```bash
# Terminal 1 - User Service
npm run dev:user

# Terminal 2 - Auth Service
npm run dev:auth

# Terminal 3 - Gateway
npm run dev:gateway
```

## 🎯 Test the API

### Access the GraphQL Playground

Open http://localhost:4000 in your browser to access the federated GraphQL API.

### Try These Queries

**Register a New User:**
```graphql
mutation {
  register(input: {
    name: "John Doe"
    email: "john@example.com"
    password: "password123"
  }) {
    user {
      id
      name
      email
    }
    tokens {
      accessToken
      refreshToken
    }
  }
}
```

**Login:**
```graphql
mutation {
  login(input: {
    email: "john@example.com"
    password: "password123"
  }) {
    user {
      id
      email
    }
    tokens {
      accessToken
    }
  }
}
```

**Get All Users:**
```graphql
query {
  users {
    id
    name
    email
    createdAt
  }
}
```

**Create User (Direct):**
```graphql
mutation {
  createUser(input: {
    name: "Jane Smith"
    email: "jane@example.com"
  }) {
    id
    name
    email
  }
}
```

## 📊 Service Details

### User Service (http://localhost:4001/graphql)
- `users` - Get all users
- `user(id)` - Get user by ID
- `createUser(input)` - Create new user
- `updateUser(id, input)` - Update user
- `deleteUser(id)` - Delete user

### Auth Service (http://localhost:4002/graphql)
- `register(input)` - Register new user with password
- `login(input)` - Login and get JWT tokens
- `refreshToken(refreshToken)` - Refresh access token
- `validateToken(token)` - Validate JWT token

### Gateway (http://localhost:4000/graphql)
Combines both services into a single federated graph!

## 📁 Project Structure

```
backend/
├── shared/                  # Shared types and utilities
│   ├── src/
│   │   ├── types/          # Common TypeScript types
│   │   ├── rabbitmq/       # RabbitMQ client (optional)
│   │   └── utils/          # Helper functions
│   └── dist/               # Compiled shared code
│
├── services/
│   ├── user-service/       # User management
│   │   ├── src/
│   │   │   ├── index.ts       # Main server
│   │   │   ├── schema.ts      # GraphQL schema
│   │   │   ├── resolvers.ts   # Query/Mutation handlers
│   │   │   └── database.ts    # MongoDB connection
│   │   └── dist/
│   │
│   └── auth-service/       # Authentication
│       ├── src/
│       │   ├── index.ts       # Main server
│       │   ├── schema.ts      # GraphQL schema (extends User)
│       │   ├── resolvers.ts   # Auth handlers
│       │   ├── auth.ts        # JWT utilities
│       │   └── database.ts    # MongoDB connection
│       └── dist/
│
├── gateway/                # Apollo Gateway
│   ├── src/
│   │   └── index.ts        # Federation config
│   └── dist/
│
├── scripts/
│   └── check-prereqs.sh    # Check prerequisites
│
├── README.md               # Full documentation
├── QUICKSTART.md           # Quick start guide
└── package.json            # Workspace configuration
```

## 🔧 Development Commands

```bash
# Install dependencies
npm install

# Build everything
npm run build

# Build individual packages
npm run build:shared
npm run build:user
npm run build:auth
npm run build:gateway

# Start all services
npm run dev

# Start individual services
npm run dev:user
npm run dev:auth
npm run dev:gateway

# Clean build artifacts
npm run clean

# Check prerequisites
./scripts/check-prereqs.sh
```

## 🗄️ Database Management

### View MongoDB Data

```bash
# Connect to MongoDB
mongosh

# Switch to user service database
use user_service

# View users
db.users.find()

# Switch to auth service database
use auth_service

# View auth records
db.auth_records.find()
```

### Clear Database (for testing)

```bash
mongosh
use user_service
db.users.deleteMany({})
use auth_service
db.auth_records.deleteMany({})
```

## ⚠️ Notes

### RabbitMQ (Optional)
RabbitMQ is configured but not required. Services will run without it.
Event-driven communication will be disabled but all GraphQL APIs work normally.

To install RabbitMQ:
```bash
brew install rabbitmq
brew services start rabbitmq
```

### MongoDB
MongoDB must be running for services to start.
```bash
# Check if MongoDB is running
mongosh --eval "db.version()"

# Start MongoDB (if using Homebrew)
brew services start mongodb-community
```

## 🚀 Next Steps

1. **Connect Your Frontend**
   - Update frontend API endpoint to `http://localhost:4000/graphql`
   - Use the Gateway URL for all GraphQL queries

2. **Add More Services**
   - Follow the guide in README.md
   - Each service gets its own database
   - Register new services in the Gateway

3. **Add Authentication Middleware**
   - Extract JWT token from headers
   - Pass user context to resolvers
   - Protect routes that require authentication

4. **Set up Tests**
   - Add unit tests for resolvers
   - Add integration tests for APIs
   - Test federation queries

5. **Production Deployment**
   - Update JWT_SECRET in .env
   - Enable MongoDB authentication
   - Set up RabbitMQ cluster
   - Use environment-specific configs

## 📚 Resources

- README.md - Full architecture documentation
- QUICKSTART.md - Quick start guide
- Docker instructions (if you want to use containers later)

## ✨ Features Included

✅ Apollo Federation v2 - Service composition  
✅ TypeScript - Type-safe development  
✅ MongoDB - Document database  
✅ JWT Authentication - Secure token-based auth  
✅ Password Hashing - bcrypt security  
✅ GraphQL Schema Federation - Extend types across services  
✅ RabbitMQ Support - Event-driven architecture (optional)  
✅ Microservices Architecture - Independent, scalable services  
✅ npm Workspaces - Monorepo management  
✅ Hot Reload - Development with tsx watch  
✅ Graceful Shutdown - Proper cleanup on exit  

## 🎉 You're All Set!

Your backend is ready for development. Start coding! 🚀

```bash
cd backend
npm run dev
```

Then open http://localhost:4000 in your browser!

