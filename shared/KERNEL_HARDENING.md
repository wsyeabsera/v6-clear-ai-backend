## Kernel Hardening Tracker

This document captures ongoing efforts to keep the kernel resilient when external services misbehave. It complements `KERNEL_TEST_RESULTS.md`, focusing on risks and the mitigations we’re adding.

### 1. Baseline Risk Assessment (Nov 22 2025)

| Subsystem | Observed Symptoms | Current Mitigation | Gaps / Next Steps |
|-----------|-------------------|--------------------|-------------------|
| **Stream Manager (SSE / WebSocket)** | Integration suites log repeated connection errors when mock servers are offline (`ECONNREFUSED`, generic SSE error events). Tests assert graceful degradation but there is no automatic backoff or alerting. | Tests verify buffering + error handling logic. Manual logs show we don’t crash when servers vanish. | Add configurable retry/backoff + structured error logs so operators can distinguish intentional test errors from real outages. Consider lightweight mock servers for CI to exercise happy paths. |
| **RabbitMQ Event Bus** | Handler error test emits stack traces from intentional exceptions, and reconnect chatter floods logs during integration runs. | Consumers catch handler failures; tests confirm queues stay durable and reconnects succeed. | Provide dead-letter logging hooks or alert surface so production teams see when handlers repeatedly fail. Rate-limit reconnect logs. |
| **Pinecone + Ollama** | When embedding generation fails (e.g., invalid Ollama URL), tests rely on fallback vectors. Pinecone serverless rejects all-zero vectors, so fallbacks must stay non-zero. | Context & memory managers already inject non-zero fallback vectors and stringify metadata. Tests ran against live Pinecone + Ollama and passed. | Add retry + timeout wrappers around embedding + Pinecone calls to avoid silent stalls. Emit structured metrics (latency, error counts). |
| **Service Verification** | Manual commands (curl/nc/mongosh) confirm services before tests, but there is no automated preflight script. | Logged commands in `KERNEL_TEST_RESULTS.md`. | Provide `scripts/check-services.sh` so future runs validate dependencies consistently. Integrate into CI pre-run hook. |

_Next actions_: handle runtime safeguards (timeouts/retries/logging), add failure-focused tests, then codify runbooks.

### 2. Service Preflight Checklist

Run `backend/shared/scripts/check-services.sh` before any integration suite (or CI job) to verify all dependencies:

1. Loads `backend/shared/.env.test` if present.
2. Hits `OLLAMA_API_URL` `/api/tags` and prints available models (ensure `nomic-embed-text` is listed).
3. Executes `mongosh --quiet "$MONGO_CONNECTION_STRING" --eval "db.runCommand({ ping: 1 })"`.
4. Uses Node’s `net` module to confirm the RabbitMQ host/port from `RABBITMQ_URL` (defaults to `amqp://localhost:5672`).
5. Calls `describeIndex` via `@pinecone-database/pinecone` using `PINECONE_API_KEY` / `PINECONE_INDEX_NAME`.

If any step fails, the script exits non‑zero so CI can short-circuit before running tests.

### 3. Troubleshooting Recipes

- **Pinecone**: Rotate API keys in the Pinecone console, update `.env.test`, and rerun `scripts/check-services.sh`. The new retry logic (`PINECONE_MAX_RETRIES`, `PINECONE_TIMEOUT_MS`) defaults to 3 attempts / 10s timeout—override via env vars when Pinecone is under maintenance.
- **Ollama**: Ensure `OLLAMA_API_URL` points to the host running the `nomic-embed-text` model. The embedding service already times out after 30 s and falls back to non-zero vectors; repeated failures log `[Ollama.generateEmbedding]` warnings.
- **RabbitMQ**: Set `deadLetterExchange` in `RabbitMQEventConfig` to route handler failures to an alerting queue. The CLI check validates TCP reachability; if it fails, restart the local broker (`brew services restart rabbitmq`) or update the URL.
- **Stream managers**: SSE/WebSocket managers now back off exponentially and cap retries at 5 (configurable). If integration tests spam `ECONNREFUSED`, confirm the mock SSE/WS servers are running or adjust `reconnectAttempts`/`reconnectDelay` in test configs.

Keep `KERNEL_TEST_RESULTS.md` updated after each integration run so we can correlate service availability with test outcomes.*** End Patch


