#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.test"

if [[ -f "$ENV_FILE" ]]; then
  echo "Loading $ENV_FILE"
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

pushd "$ROOT_DIR" >/dev/null

echo "🔎 Checking Ollama @ ${OLLAMA_API_URL:-http://localhost:11434}"
curl -s "${OLLAMA_API_URL:-http://localhost:11434}/api/tags" | head -n 1 || {
  echo "Ollama check failed"; exit 1;
}

echo "🔎 Checking MongoDB @ ${MONGO_CONNECTION_STRING:-mongodb://localhost:27017}"
mongosh --quiet "${MONGO_CONNECTION_STRING:-mongodb://localhost:27017}" --eval "db.runCommand({ ping: 1 })" >/dev/null && \
  echo "MongoDB ping ok" || {
    echo "MongoDB check failed"; exit 1;
  }

echo "🔎 Checking RabbitMQ @ ${RABBITMQ_URL:-amqp://localhost:5672}"
node <<'NODE'
const net = require('net');
const url = new URL(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
const port = Number(url.port) || 5672;
let connected = false;
const socket = net.createConnection({ host: url.hostname, port, timeout: 2000 }, () => {
  console.log(`RabbitMQ reachable at ${url.hostname}:${port}`);
  connected = true;
  socket.end();
  process.exit(0);
});
socket.on('error', (err) => {
  if (!connected) {
    console.error('RabbitMQ check failed:', err.message);
    process.exit(1);
  }
});
socket.on('close', () => {
  if (connected) {
    process.exit(0);
  }
});
NODE

echo "🔎 Checking Pinecone index ${PINECONE_INDEX_NAME:-context-manager}"
node <<'NODE'
const { Pinecone } = require('@pinecone-database/pinecone');
const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX_NAME || 'context-manager';
if (!apiKey) {
  console.error('PINECONE_API_KEY is not set');
  process.exit(1);
}
const pinecone = new Pinecone({ apiKey });
pinecone.describeIndex(indexName)
  .then((info) => {
    console.log(`Pinecone index available: ${info.name}`);
  })
  .catch((err) => {
    console.error('Pinecone check failed:', err.message);
    process.exit(1);
  });
NODE

popd >/dev/null
echo "✅ All services responded"

