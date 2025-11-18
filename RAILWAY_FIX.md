# 🔧 Railway Build Fix - Configuration Guide

## ✅ Fixed Issues

I've fixed the following issues that were causing build failures:

1. **✅ PORT Environment Variable**
   - Updated all services to use `process.env.PORT` (Railway's standard)
   - Falls back to service-specific ports for local development

2. **✅ Environment Variable Loading**
   - Simplified dotenv.config() to work in both local and production
   - Railway uses environment variables directly, so .env is optional

3. **✅ Build Configuration**
   - Created `nixpacks.toml` for better Railway build detection
   - Created `railway.json` with proper build commands

---

## 🚀 Railway Dashboard Configuration

Since you've already connected your GitHub repo, here's what to configure in the Railway Dashboard:

### For EACH Service (User Service, Agent Configs Service, Gateway):

#### 1. Root Directory
Set to: `backend`

#### 2. Build Command
```
npm install && npm run build:shared && npm run build
```

#### 3. Start Command
**For User Service:**
```
npm run start:user
```

**For Agent Configs Service:**
```
npm run start:agent-configs
```

**For Gateway:**
```
npm run start:gateway
```

---

## 📋 Environment Variables Setup

### Service 1: User Service

Go to Railway Dashboard → User Service → Variables tab, add:

```
RABBITMQ_URL=amqps://vywhwefa:zHxwQ_47gliiKrqyrVDYo9RUFkb7xJap@kebnekaise.lmq.cloudamqp.com/vywhwefa
USER_SERVICE_MONGODB_URI=mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai
JWT_SECRET=your-production-secret-key-change-this
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
NODE_ENV=production
```

**Note:** Railway automatically sets `PORT` - you don't need to set it manually.

---

### Service 2: Agent Configs Service

```
AGENT_CONFIGS_SERVICE_MONGODB_URI=mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai
JWT_SECRET=your-production-secret-key-change-this
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
NODE_ENV=production
```

---

### Service 3: Gateway

**IMPORTANT:** Deploy User Service and Agent Configs Service FIRST, then get their URLs.

After deploying services 1 & 2, Railway will give you URLs like:
- `https://user-service-production-XXXX.railway.app`
- `https://agent-configs-service-production-XXXX.railway.app`

Then set Gateway variables:

```
USER_SERVICE_URL=https://user-service-production-XXXX.railway.app/graphql
AGENT_CONFIGS_SERVICE_URL=https://agent-configs-service-production-XXXX.railway.app/graphql
NODE_ENV=production
```

---

## 🔍 Troubleshooting Build Failures

### Common Issues:

1. **"Cannot find module 'shared'"**
   - **Fix:** Ensure `build:shared` runs before other builds
   - **Check:** Build command should be: `npm install && npm run build:shared && npm run build`

2. **"Port already in use"**
   - **Fix:** Railway sets PORT automatically - don't override it
   - **Check:** Code now uses `process.env.PORT` ✅

3. **"Module not found" errors**
   - **Fix:** Ensure Root Directory is set to `backend` in Railway dashboard
   - **Check:** All dependencies are in `package.json`

4. **"Build command failed"**
   - **Fix:** Check that TypeScript compiles successfully
   - **Check:** Run `npm run build:shared && npm run build` locally first

5. **"Start command failed"**
   - **Fix:** Ensure dist/ folders exist (they're created by build)
   - **Check:** Start command matches the service (start:user, start:agent-configs, or start:gateway)

---

## ✅ Verification Steps

After deploying each service:

1. **Check Build Logs**
   - Railway Dashboard → Service → Deployments → Click latest deployment → View logs
   - Look for: `✅ Connected to MongoDB` or `✅ Connected to RabbitMQ`

2. **Check Service Health**
   - Railway Dashboard → Service → Settings → Copy the public URL
   - Test: `curl https://your-service.railway.app/graphql -H "Content-Type: application/json" -d '{"query":"{ __typename }"}'`
   - Should return: `{"data":{"__typename":"Query"}}`

3. **Check Gateway**
   - Gateway should show: `✅ All subgraph services are ready!`
   - Then: `🚀 Apollo Gateway ready!`

---

## 📝 Quick Checklist

Before deploying:
- [ ] Code pushed to GitHub
- [ ] Railway project connected to GitHub repo
- [ ] Root Directory set to `backend` for each service
- [ ] Build Command set correctly
- [ ] Start Command set correctly (different for each service)
- [ ] Environment variables added to each service
- [ ] Gateway URLs set AFTER deploying services 1 & 2

---

## 🎯 Deployment Order

1. **Deploy User Service** (with RabbitMQ and MongoDB vars)
2. **Deploy Agent Configs Service** (with MongoDB vars)
3. **Get URLs from services 1 & 2**
4. **Deploy Gateway** (with service URLs)

---

## 💡 Pro Tips

- Railway automatically rebuilds on git push
- Check logs in real-time: Railway Dashboard → Service → Logs
- Use Railway's "Redeploy" button if build fails
- Environment variables are encrypted and secure
- Each service gets its own URL automatically

---

## 🆘 Still Having Issues?

Check the build logs in Railway Dashboard:
1. Go to your service
2. Click "Deployments"
3. Click the latest deployment
4. Check "Build Logs" and "Deploy Logs"

Common error messages:
- `npm ERR!` → Dependency issue, check package.json
- `Cannot find module` → Build order issue, ensure shared builds first
- `Port XXXX already in use` → Remove PORT from env vars, Railway sets it
- `ECONNREFUSED` → Service URL issue, check USER_SERVICE_URL format

---

**All fixes are in place! Try deploying again! 🚀**

