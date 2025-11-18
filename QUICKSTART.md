# Quick Start Guide (Local Setup)

This guide is for running the backend using local MongoDB and RabbitMQ.

## Prerequisites

✅ **Node.js** >= 18.0.0  
✅ **MongoDB** running locally on port 27017  
✅ **RabbitMQ** running locally on port 5672 (optional for basic testing)

## Installation Steps

### 1. Install Dependencies

```bash
cd backend
npm install
```

This installs dependencies for all workspaces (shared, services, gateway).

### 2. Build Shared Package

The shared package must be built first since other services depend on it:

```bash
npm run build:shared
```

### 3. Start Services

Start all services in development mode:

```bash
npm run dev
```

Or start them individually in separate terminals:

```bash
# Terminal 1 - User Service
npm run dev:user

# Terminal 2 - Agent Configs Service
npm run dev:agent-configs

# Terminal 3 - Gateway
npm run dev:gateway
```

## Service Endpoints

- **Gateway** (Main endpoint): http://localhost:4000/graphql
- **User Service** (with Auth): http://localhost:4001/graphql
- **Agent Configs Service**: http://localhost:4003/graphql

## Quick Test

Open http://localhost:4000 in your browser and try this mutation:

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

## Database Setup

MongoDB databases are created automatically when services start:
- `user_service` - User data and authentication data (merged)
- `agent_configs_service` - AI agent configurations

## Troubleshooting

**Services won't start?**
- Make sure MongoDB is running: `mongosh` to test connection
- Make sure ports 4000, 4001, 4003 are available
- Check `.env` file exists with correct settings

**Gateway can't connect to services?**
- Start User Service and Agent Configs Service first
- Wait a few seconds for them to be ready
- Then start the Gateway

**Build errors?**
- Run `npm run build:shared` first
- Then run `npm run dev`

## Without RabbitMQ

If you don't have RabbitMQ installed, the services will show connection errors but GraphQL APIs will still work. RabbitMQ is only needed for event-driven communication between services.

To install RabbitMQ (optional):
- **Mac**: `brew install rabbitmq && brew services start rabbitmq`
- **Linux**: `sudo apt install rabbitmq-server`
- **Windows**: Download from https://www.rabbitmq.com/download.html

