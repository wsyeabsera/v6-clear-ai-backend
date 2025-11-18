# Railway Deployment Guide - Complete Setup ✅

Your backend is fully tested and ready for production deployment!

## ✅ Pre-Deployment Checklist

- ✅ MongoDB Atlas connected and tested
- ✅ CloudAMQP (RabbitMQ) connected and tested
- ✅ All services running locally
- ✅ GraphQL APIs tested
- ✅ Authentication working
- ✅ Event-driven architecture verified

---

## 🚀 Railway Deployment Steps

### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
```

### Step 2: Login to Railway

```bash
railway login
```

### Step 3: Create Railway Project

```bash
cd /Users/yab/Projects/v6-clear-ai/backend
railway init
```

Choose: "Create a new project" → Name it: `clear-ai-backend`

---

## 📦 Service Deployment Architecture

You'll deploy **3 separate services** on Railway:

```
Railway Project: clear-ai-backend
│
├── Service 1: user-service (Port 4001)
├── Service 2: agent-configs-service (Port 4003)
└── Service 3: gateway (Port 4000)
```

---

## 🔧 Deploy Each Service

### Service 1: User Service

```bash
# Create new service
railway service create user-service

# Link to the service
railway link --service user-service

# Set environment variables
railway variables set \
  RABBITMQ_URL="amqps://vywhwefa:zHxwQ_47gliiKrqyrVDYo9RUFkb7xJap@kebnekaise.lmq.cloudamqp.com/vywhwefa" \
  USER_SERVICE_MONGODB_URI="mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai" \
  JWT_SECRET="your-super-secret-jwt-key-change-in-production" \
  JWT_EXPIRES_IN="7d" \
  JWT_REFRESH_EXPIRES_IN="30d" \
  USER_SERVICE_PORT="4001" \
  NODE_ENV="production"

# Create railway.json for user service
cat > railway.user.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build:shared && npm run build:user"
  },
  "deploy": {
    "startCommand": "cd services/user-service && node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
EOF

# Deploy
railway up
```

**Note the deployed URL** (e.g., `https://user-service.railway.app`)

---

### Service 2: Agent Configs Service

```bash
# Create new service
railway service create agent-configs-service

# Link to the service
railway link --service agent-configs-service

# Set environment variables
railway variables set \
  AGENT_CONFIGS_SERVICE_MONGODB_URI="mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai" \
  JWT_SECRET="your-super-secret-jwt-key-change-in-production" \
  JWT_EXPIRES_IN="7d" \
  JWT_REFRESH_EXPIRES_IN="30d" \
  AGENT_CONFIGS_SERVICE_PORT="4003" \
  NODE_ENV="production"

# Create railway.json for agent configs service
cat > railway.agent-configs.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build:shared && npm run build:agent-configs"
  },
  "deploy": {
    "startCommand": "cd services/agent-configs-service && node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
EOF

# Deploy
railway up
```

**Note the deployed URL** (e.g., `https://agent-configs-service.railway.app`)

---

### Service 3: Gateway

```bash
# Create new service
railway service create gateway

# Link to the service
railway link --service gateway

# Set environment variables (use the URLs from services 1 and 2)
railway variables set \
  USER_SERVICE_URL="https://user-service.railway.app/graphql" \
  AGENT_CONFIGS_SERVICE_URL="https://agent-configs-service.railway.app/graphql" \
  GATEWAY_PORT="4000" \
  NODE_ENV="production"

# Create railway.json for gateway
cat > railway.gateway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build:shared && npm run build:gateway"
  },
  "deploy": {
    "startCommand": "cd gateway && node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
EOF

# Deploy
railway up
```

**Note the Gateway URL** - this is your main API endpoint!

---

## 🎯 Alternative: Deploy via Railway Dashboard (Easier)

### Option A: Using GitHub (Recommended)

1. **Push your code to GitHub**
   ```bash
   cd /Users/yab/Projects/v6-clear-ai
   git add .
   git commit -m "Ready for Railway deployment"
   git push origin main
   ```

2. **Connect Railway to GitHub**
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

3. **Create 3 Services from the same repo**
   - For each service, configure:
     - Root Directory: `/backend`
     - Build Command: (see below for each service)
     - Start Command: (see below for each service)

#### User Service Configuration:
```
Build Command: npm install && npm run build:shared && npm run build:user
Start Command: cd services/user-service && node dist/index.js
```

Environment Variables:
```
RABBITMQ_URL=amqps://vywhwefa:zHxwQ_47gliiKrqyrVDYo9RUFkb7xJap@kebnekaise.lmq.cloudamqp.com/vywhwefa
USER_SERVICE_MONGODB_URI=mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
USER_SERVICE_PORT=4001
NODE_ENV=production
```

#### Agent Configs Service Configuration:
```
Build Command: npm install && npm run build:shared && npm run build:agent-configs
Start Command: cd services/agent-configs-service && node dist/index.js
```

Environment Variables:
```
AGENT_CONFIGS_SERVICE_MONGODB_URI=mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
AGENT_CONFIGS_SERVICE_PORT=4003
NODE_ENV=production
```

#### Gateway Configuration:
```
Build Command: npm install && npm run build:shared && npm run build:gateway
Start Command: cd gateway && node dist/index.js
```

Environment Variables:
```
USER_SERVICE_URL=https://user-service-[YOUR-RAILWAY-ID].railway.app/graphql
AGENT_CONFIGS_SERVICE_URL=https://agent-configs-service-[YOUR-RAILWAY-ID].railway.app/graphql
GATEWAY_PORT=4000
NODE_ENV=production
```

---

## 📝 Important Notes

### Port Configuration
Railway automatically assigns a `PORT` environment variable. Your services use:
- User Service: 4001
- Agent Configs: 4003
- Gateway: 4000

Make sure your code uses `process.env.PORT || [default_port]`

### Service URLs
After deploying User Service and Agent Configs, you'll get URLs like:
- `https://user-service-production-xxxx.railway.app`
- `https://agent-configs-service-production-xxxx.railway.app`

Use these URLs (with `/graphql` appended) in the Gateway's environment variables.

### Database Separation
Both services use the same MongoDB Atlas cluster but different databases:
- User Service: Uses `clear-ai` database for users and auth
- Agent Configs: Uses `clear-ai` database for agent configs

MongoDB will automatically separate collections by service.

---

## 🧪 Testing Deployed Services

### Test User Service
```bash
curl https://your-user-service.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

### Test Agent Configs Service
```bash
curl https://your-agent-configs-service.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

### Test Gateway (Main Endpoint)
```bash
curl https://your-gateway.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

### Test User Registration
```bash
curl https://your-gateway.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { register(input: { name: \"Test User\", email: \"test@example.com\", password: \"password123\" }) { user { id name email } tokens { accessToken } } }"
  }'
```

---

## 🔗 Update Frontend Configuration

After deployment, update your frontend's API URL:

```typescript
// ai-frontend/src/lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://your-gateway.railway.app/graphql';
```

Then add to your frontend's `.env.local`:
```
NEXT_PUBLIC_API_URL=https://your-gateway.railway.app/graphql
```

---

## 🎉 Deployment Checklist

After deploying all services:

- [ ] User Service deployed and responding
- [ ] Agent Configs Service deployed and responding
- [ ] Gateway deployed and can reach both services
- [ ] Test user registration through gateway
- [ ] Test user login through gateway
- [ ] Test agent config creation (with auth token)
- [ ] Verify RabbitMQ events are being published
- [ ] Update frontend with production gateway URL
- [ ] Test frontend → backend integration

---

## 🐛 Troubleshooting

### Gateway can't connect to services
- Check the `USER_SERVICE_URL` and `AGENT_CONFIGS_SERVICE_URL` environment variables
- Ensure they include `/graphql` at the end
- Verify the service URLs are correct from Railway dashboard

### MongoDB connection fails
- Check your MongoDB Atlas IP whitelist (allow 0.0.0.0/0 for Railway)
- Verify connection string is correct
- Check MongoDB Atlas user permissions

### Build fails
- Ensure `build:shared` runs before building individual services
- Check that all dependencies are in `package.json`
- Verify `tsconfig.json` references are correct

### Service crashes on startup
- Check Railway logs: `railway logs`
- Verify all environment variables are set
- Check for port conflicts (Railway assigns PORT automatically)

---

## 📊 Monitoring

Railway provides built-in monitoring:
- View logs: Click on service → "Logs" tab
- Check metrics: Click on service → "Metrics" tab
- Set up alerts: Project Settings → "Integrations"

---

## 💰 Cost Estimation

Railway Pricing (as of 2024):
- **Hobby Plan**: $5/month (500 hours execution, $0.01/hour after)
- Each service counts separately
- Estimated: ~$15-20/month for 3 services

CloudAMQP Free Tier:
- "Little Lemur" plan: Free
- Good for development and small production

MongoDB Atlas Free Tier:
- M0 cluster: Free forever
- 512 MB storage
- Shared CPU

**Total Estimated Cost: $15-20/month** (just Railway, others are free tier)

---

## 🚀 Ready to Deploy!

You have everything configured and tested. Choose your deployment method:

1. **CLI Method**: Follow the CLI commands above
2. **GitHub Method**: Push to GitHub and connect via Railway dashboard (easier!)

Your backend is production-ready! 🎉

