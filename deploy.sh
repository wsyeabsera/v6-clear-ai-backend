#!/bin/bash

# Clear AI Backend - Railway Deployment Script
# This script helps you deploy all three services to Railway

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Clear AI Backend - Railway Deployment               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}⚠️  Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
fi

echo -e "${GREEN}✅ Railway CLI is installed${NC}"
echo ""

# Check if logged in
echo -e "${BLUE}Checking Railway authentication...${NC}"
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}Please login to Railway:${NC}"
    railway login
else
    echo -e "${GREEN}✅ Already logged in to Railway${NC}"
fi
echo ""

# Show current directory
echo -e "${BLUE}Current directory:${NC} $(pwd)"
echo ""

# Build all services first
echo -e "${BLUE}Building all services...${NC}"
npm run build:shared
npm run build:user
npm run build:agent-configs
npm run build:gateway
echo -e "${GREEN}✅ All services built successfully${NC}"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     Deployment Options                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "You need to deploy 3 separate services:"
echo ""
echo "1️⃣  User Service (with RabbitMQ)"
echo "2️⃣  Agent Configs Service"
echo "3️⃣  Gateway (federated API)"
echo ""
echo "Choose your deployment method:"
echo ""
echo "A) Deploy via Railway Dashboard (Recommended for first time)"
echo "   - Go to railway.app"
echo "   - Create new project"
echo "   - Deploy from GitHub (push your code first)"
echo "   - Create 3 services from the same repo"
echo ""
echo "B) Deploy via CLI (Advanced)"
echo "   - Use 'railway up' for each service"
echo "   - Configure separately with railway.*.json files"
echo ""

read -p "Would you like to push to GitHub now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Checking git status...${NC}"
    
    # Check if git repo exists
    if [ ! -d .git ]; then
        echo -e "${YELLOW}Initializing git repository...${NC}"
        git init
        git add .
        git commit -m "Initial commit - Ready for deployment"
    else
        echo -e "${BLUE}Adding changes to git...${NC}"
        git add .
        git commit -m "Ready for Railway deployment" || echo "No changes to commit"
    fi
    
    echo ""
    echo -e "${GREEN}✅ Code committed locally${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Create a GitHub repository"
    echo "2. Run: git remote add origin <your-repo-url>"
    echo "3. Run: git push -u origin main"
    echo "4. Then connect Railway to your GitHub repo"
else
    echo ""
    echo -e "${BLUE}Skipping git push${NC}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   Environment Variables                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "You'll need to set these in Railway for each service:"
echo ""
echo -e "${BLUE}User Service:${NC}"
echo "  RABBITMQ_URL=amqps://vywhwefa:zHxwQ_47gliiKrqyrVDYo9RUFkb7xJap@kebnekaise.lmq.cloudamqp.com/vywhwefa"
echo "  USER_SERVICE_MONGODB_URI=mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai"
echo "  JWT_SECRET=your-super-secret-jwt-key-change-in-production"
echo "  USER_SERVICE_PORT=4001"
echo "  NODE_ENV=production"
echo ""
echo -e "${BLUE}Agent Configs Service:${NC}"
echo "  AGENT_CONFIGS_SERVICE_MONGODB_URI=mongodb+srv://yeabsera0830_db_user:DSKuVIWPw6DOefUD@cluster0.eclb7pj.mongodb.net/clear-ai"
echo "  JWT_SECRET=your-super-secret-jwt-key-change-in-production"
echo "  AGENT_CONFIGS_SERVICE_PORT=4003"
echo "  NODE_ENV=production"
echo ""
echo -e "${BLUE}Gateway:${NC}"
echo "  USER_SERVICE_URL=https://[your-user-service].railway.app/graphql"
echo "  AGENT_CONFIGS_SERVICE_URL=https://[your-agent-configs-service].railway.app/graphql"
echo "  GATEWAY_PORT=4000"
echo "  NODE_ENV=production"
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   Railway Service Setup                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "For each service in Railway Dashboard:"
echo ""
echo "📦 User Service:"
echo "   Build: npm install && npm run build:shared && npm run build:user"
echo "   Start: npm run start:user"
echo ""
echo "📦 Agent Configs Service:"
echo "   Build: npm install && npm run build:shared && npm run build:agent-configs"
echo "   Start: npm run start:agent-configs"
echo ""
echo "📦 Gateway:"
echo "   Build: npm install && npm run build:shared && npm run build:gateway"
echo "   Start: npm run start:gateway"
echo ""
echo -e "${GREEN}✅ Deployment preparation complete!${NC}"
echo ""
echo "📚 See DEPLOYMENT_GUIDE.md for detailed instructions"
echo ""

