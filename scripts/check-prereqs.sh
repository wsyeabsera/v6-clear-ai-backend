#!/bin/bash

echo "🔍 Checking prerequisites..."
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js not found"
    exit 1
fi

# Check MongoDB
echo -n "Checking MongoDB... "
if mongosh --eval "db.version()" --quiet > /dev/null 2>&1; then
    MONGO_VERSION=$(mongosh --eval "db.version()" --quiet 2>&1 | head -n 1)
    echo "✅ MongoDB: $MONGO_VERSION"
else
    echo "❌ MongoDB not running or not installed"
    echo "   Start MongoDB with: brew services start mongodb-community"
    echo "   Or install it: brew install mongodb-community"
    exit 1
fi

# Check RabbitMQ (optional)
echo -n "Checking RabbitMQ... "
if curl -s http://localhost:15672 > /dev/null 2>&1; then
    echo "✅ RabbitMQ Management UI running"
elif nc -z localhost 5672 2>&1 | grep -q succeeded; then
    echo "⚠️  RabbitMQ AMQP port open but Management UI not accessible"
else
    echo "⚠️  RabbitMQ not running (optional - services will work without it)"
    echo "   Install: brew install rabbitmq"
    echo "   Start: brew services start rabbitmq"
fi

echo ""
echo "✅ All required prerequisites are met!"
echo ""
echo "Next steps:"
echo "  1. cd backend"
echo "  2. npm run dev"

