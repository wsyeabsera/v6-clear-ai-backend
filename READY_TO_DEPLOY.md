# 🚀 READY TO DEPLOY - Quick Start Guide

## ✅ Everything is Tested and Working!

### Local Testing Results:
- ✅ MongoDB Atlas: Connected and tested
- ✅ CloudAMQP (RabbitMQ): Connected and tested  
- ✅ User Service: Running with RabbitMQ events
- ✅ Agent Configs Service: Running with auth
- ✅ Gateway: Federated GraphQL working
- ✅ User Registration: Working
- ✅ User Login: Working
- ✅ Agent Config Creation: Working
- ✅ Event Publishing: All 3 event types tested

---

## 🎯 Quickest Way to Deploy (5 minutes)

### Option 1: Railway Dashboard (RECOMMENDED)

#### Step 1: Push to GitHub
```bash
cd /Users/yab/Projects/v6-clear-ai
git add .
git commit -m "Ready for deployment"
git push origin main
```

#### Step 2: Deploy on Railway
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Create 3 services from the same repo (one at a time)

#### Step 3: Configure Each Service

**Service 1: user-service**
- Root Directory: `backend`
- Build Command: `npm install && npm run build:shared && npm run build:user`
- Start Command: `npm run start:user`
- Add Environment Variables:
  ```
  RABBITMQ_URL=amqps://vywhwefa:zHxwQ_47gliiKrqyrVDYo9RUFkb7xJap@kebnekaise.lmq.cloudamqp.com/vywhwefa
  USER_SERVICE_MONGODB_URI=mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai
  JWT_SECRET=your-production-secret-key-here
  USER_SERVICE_PORT=4001
  NODE_ENV=production
  ```

**Service 2: agent-configs-service**
- Root Directory: `backend`
- Build Command: `npm install && npm run build:shared && npm run build:agent-configs`
- Start Command: `npm run start:agent-configs`
- Add Environment Variables:
  ```
  AGENT_CONFIGS_SERVICE_MONGODB_URI=mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai
  JWT_SECRET=your-production-secret-key-here
  AGENT_CONFIGS_SERVICE_PORT=4003
  NODE_ENV=production
  ```

**Service 3: gateway**
- Root Directory: `backend`
- Build Command: `npm install && npm run build:shared && npm run build:gateway`
- Start Command: `npm run start:gateway`
- Add Environment Variables (AFTER deploying services 1 & 2):
  ```
  USER_SERVICE_URL=https://user-service-production-XXXX.railway.app/graphql
  AGENT_CONFIGS_SERVICE_URL=https://agent-configs-service-production-XXXX.railway.app/graphql
  GATEWAY_PORT=4000
  NODE_ENV=production
  ```

#### Step 4: Get Gateway URL
After deployment, Railway will give you a URL like:
```
https://gateway-production-XXXX.railway.app
```

This is your API endpoint!

---

## 🧪 Test Your Deployed API

### Test 1: Health Check
```bash
curl https://your-gateway.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

Expected: `{"data":{"__typename":"Query"}}`

### Test 2: Register a User
```bash
curl https://your-gateway.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { register(input: { name: \"Test User\", email: \"test@example.com\", password: \"password123\" }) { user { id name email } tokens { accessToken } } }"
  }'
```

Expected: User object with access token

### Test 3: Login
```bash
curl https://your-gateway.railway.app/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { login(input: { email: \"test@example.com\", password: \"password123\" }) { user { id name email } tokens { accessToken } } }"
  }'
```

Expected: User object with tokens

### Test 4: Create Agent Config (with auth)
```bash
# Replace YOUR_TOKEN with the accessToken from step 2 or 3
curl https://your-gateway.railway.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "mutation { createAgentConfig(input: { name: \"Production Config\", prompt: \"You are a helpful assistant\", model: \"gpt-4\", temperature: 0.7, maxTokens: 2000 }) { id name model } }"
  }'
```

Expected: Agent config object

---

## 🔗 Update Your Frontend

After deployment, update your frontend's `.env.local`:

```bash
cd /Users/yab/Projects/v6-clear-ai/ai-frontend
```

Create or update `.env.local`:
```
NEXT_PUBLIC_API_URL=https://your-gateway.railway.app/graphql
```

Then restart your frontend:
```bash
npm run dev
```

---

## 📊 Your Architecture (Production)

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│                        Vercel / Local                        │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         │ GraphQL Queries
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Apollo Gateway                            │
│         https://gateway.railway.app/graphql                 │
└────┬────────────────────────────────────────────────┬────────┘
     │                                                 │
     │ Federation                                      │ Federation
     ▼                                                 ▼
┌──────────────────────┐                    ┌──────────────────────────┐
│   User Service       │◄─── CloudAMQP ────►│  Agent Configs Service   │
│  Railway Service     │    (RabbitMQ)      │    Railway Service       │
└──────┬───────────────┘                    └──────┬───────────────────┘
       │                                           │
       ▼                                           ▼
┌──────────────────┐                      ┌──────────────────────┐
│  MongoDB Atlas   │                      │  MongoDB Atlas       │
│  (clear-ai db)   │                      │  (clear-ai db)       │
└──────────────────┘                      └──────────────────────┘
```

---

## 💡 Pro Tips

### Security
- Change `JWT_SECRET` to a strong random string in production
- Consider using Railway's secret management
- MongoDB Atlas IP whitelist is set to allow all (0.0.0.0/0) for Railway

### Monitoring
- Check Railway logs for each service
- Monitor MongoDB Atlas metrics
- CloudAMQP dashboard shows message throughput

### Costs
- Railway: ~$5-15/month (Hobby plan)
- MongoDB Atlas: Free (M0 tier)
- CloudAMQP: Free (Little Lemur plan)
- **Total: ~$5-15/month**

### Scaling
- Railway auto-scales within plan limits
- MongoDB Atlas can be upgraded when needed
- CloudAMQP can be upgraded for more throughput

---

## 🐛 Troubleshooting

### Gateway can't reach services
1. Check service URLs in Gateway environment variables
2. Ensure `/graphql` is appended to URLs
3. Wait 1-2 minutes for services to start

### MongoDB connection fails
1. Check MongoDB Atlas Network Access (allow 0.0.0.0/0)
2. Verify connection string has correct password
3. Check database user permissions

### RabbitMQ not connecting
1. Verify CloudAMQP URL is correct
2. Check CloudAMQP instance status
3. Services will still work without RabbitMQ (graceful degradation)

### Build fails
1. Ensure `build:shared` runs before other builds
2. Check all dependencies are listed in package.json
3. Verify Node version compatibility (>= 18.0.0)

---

## 📚 Documentation Files

- `DEPLOYMENT_GUIDE.md` - Detailed deployment instructions
- `README.md` - Architecture and API documentation
- `QUICKSTART.md` - Local development setup
- `demo-rabbitmq.md` - RabbitMQ integration demo

---

## ✅ Deployment Checklist

Before going live:
- [ ] Push code to GitHub
- [ ] Deploy User Service on Railway
- [ ] Deploy Agent Configs Service on Railway
- [ ] Deploy Gateway on Railway (with service URLs)
- [ ] Test health check endpoint
- [ ] Test user registration
- [ ] Test user login
- [ ] Test agent config creation
- [ ] Update frontend with gateway URL
- [ ] Test frontend → backend integration
- [ ] Set up monitoring/alerts (optional)

---

## 🎉 You're Ready!

Your backend is:
- ✅ Built and tested locally
- ✅ Connected to cloud services (MongoDB Atlas, CloudAMQP)
- ✅ Production-ready with proper error handling
- ✅ Event-driven with RabbitMQ
- ✅ Scalable microservices architecture

**Just deploy to Railway and update your frontend URL!**

---

## 🆘 Need Help?

Check the logs:
```bash
# CLI method
railway logs --service user-service
railway logs --service agent-configs-service
railway logs --service gateway
```

Or use Railway Dashboard → Service → Logs tab

---

**Happy Deploying! 🚀**

