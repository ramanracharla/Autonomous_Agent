# ICEPOT

## Phase 1: Foundation

Phase 1 provides the Node.js/TypeScript API gateway baseline, MongoDB user/trip/booking models, a health endpoint, and a Docker Compose development stack.

### Run with Docker

Start the gateway, MongoDB, and Redis (Docker Desktop must be installed and running). Phase 4 also requires a stream token:

```powershell
$env:STREAM_AUTH_TOKEN = "<a long random token>"
docker compose up --build
```

The gateway listens on `http://localhost:3000`. The agent service is available on `http://localhost:8000` when its OpenAI key is configured. To run the Phase 1 routing test and TypeScript build:

```powershell
npm install
npm test
npm run build
```

### Phase 1 Postman smoke test

Import [`postman/ICEPOT_Phase_1.postman_collection.json`](./postman/ICEPOT_Phase_1.postman_collection.json), then run **Gateway health**:

- **Method:** `GET`
- **URL:** `http://localhost:3000/api/v1/health`
- **Expected status:** `200 OK`

## Phase 2: Agent framework

Phase 2 adds a separate FastAPI agent service with a LangGraph itinerary-generation workflow and an OpenAI structured-output client.

### Run without Docker (Windows PowerShell)

Use Python 3.12 or later. From the project root, create and activate a virtual environment, then install the agent dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r agent_service\requirements-test.txt
```

To test the workflow without making an LLM API call:

```powershell
python -m pytest agent_service\tests
```

To run the agent API and test itinerary generation, set an OpenAI API key in the current terminal and start Uvicorn:

```powershell
$env:OPENAI_API_KEY = "<your OpenAI API key>"
python -m uvicorn app.main:app --app-dir agent_service --reload --port 8000
```

Do not commit API keys or put them in source files. Keep the server terminal running while testing.

If itinerary generation reports that OpenAI rejected the API key, create or copy a valid API key from the OpenAI developer platform, set it in the same PowerShell terminal, and restart Uvicorn. ChatGPT sign-in credentials are not API keys. Rate-limit or quota errors require checking API usage and billing; the agent-service terminal logs provider errors for diagnosis.

### Phase 2 Postman tests

Import [`postman/ICEPOT_Phase_2.postman_collection.json`](./postman/ICEPOT_Phase_2.postman_collection.json). The collection includes:

1. **Agent health** — `GET http://localhost:8000/health`, no API key required.
2. **Generate itinerary** — `POST http://localhost:8000/api/v1/agent/plan`, requires a valid `OPENAI_API_KEY`. Send JSON with `prompt`, `origin`, `destination`, `startDate`, `endDate`, and `travelers`; expected response is a generated itinerary with `title`, `summary`, and non-empty `days`.

## Phase 3: Integration adapters

Phase 3 adds Duffel flight search, Amadeus hotel search, and Stripe PaymentIntent adapters. Provider clients are implemented as injectable modules; the public routes below are deliberately mock-only and do not call providers or move money. No live booking or payment is performed by these endpoints.

### Run and test

The gateway needs MongoDB to start. Configure `MONGODB_URI` for a MongoDB instance you control, then run these commands from the project root in PowerShell:

```powershell
$env:MONGODB_URI = "<your MongoDB connection string>"
npm install
npm run dev
```

Keep the terminal running and import [`postman/ICEPOT_Phase_3.postman_collection.json`](./postman/ICEPOT_Phase_3.postman_collection.json). Run each request in the collection:

| Test | Method | URL | Expected |
| --- | --- | --- | --- |
| Sandbox flight search | `POST` | `http://localhost:3000/api/v1/sandbox/flights/search` | `200`; provider `Duffel`; sandbox offers |
| Sandbox hotel search | `POST` | `http://localhost:3000/api/v1/sandbox/hotels/search` | `200`; provider `Amadeus`; sandbox offers |
| Sandbox payment intent | `POST` | `http://localhost:3000/api/v1/sandbox/payments/intents` | `201`; provider `Stripe`; sandbox intent |

The Postman collection includes request bodies and response assertions. Sandbox routes return `404` when `NODE_ENV=production`. Invalid request bodies receive `400`.

Run automated tests without Docker, a database, or provider credentials:

```powershell
npm test
npm run build
```

The live adapters accept provider credentials through their constructors and can be used by trusted application services. Live provider calls are intentionally not exposed through public HTTP routes in this phase.

## Phase 4: Async event streaming

Phase 4 adds Redis Pub/Sub and an authenticated Server-Sent Events stream for trip events. The stream accepts `agent_thought`, `itinerary_draft`, `agent_error`, and `disruption_alert` events. A shared bearer token (`STREAM_AUTH_TOKEN`, at least 32 bytes) is required for the stream until user JWT/RBAC is implemented. The sandbox event publisher is available only when `NODE_ENV` is not `production`.

### Run without Docker

Run Redis and MongoDB locally (or use services you control), then from the project root set the connection strings and a strong stream token in PowerShell:

```powershell
$env:MONGODB_URI = "<your MongoDB connection string>"
$env:REDIS_URL = "redis://localhost:6379"
$env:STREAM_AUTH_TOKEN = "<a long random token>"
npm run dev
```

Keep the gateway running. Import [`postman/ICEPOT_Phase_4.postman_collection.json`](./postman/ICEPOT_Phase_4.postman_collection.json), set its `streamToken` variable to the same value, and use the same `tripId` for both requests:

1. Send **Open trip event stream** (`GET /api/v1/trips/{{tripId}}/stream`) and leave it running.
2. In another tab, send **Publish sandbox agent thought** (`POST /api/v1/sandbox/trips/{{tripId}}/events`).
3. Verify the open stream displays an `agent_thought` SSE event and the publisher returns `202 Accepted`.

Automated event tests use an in-memory mock broker and do not require MongoDB, Redis, or credentials:

```powershell
npm test
npm run build
```

Sandbox publishing returns `404` in production. The SSE route returns `401` without the configured bearer token and `503` if stream authentication is not configured or Redis is unavailable.

## Phase 5: React traveler dashboard

Phase 5 adds a responsive React + Vite dashboard with a trip-planning form, day-by-day itinerary display, and live trip event feed. The planner uses the Phase 2 agent endpoint; the SSE client uses the authenticated Phase 4 gateway stream. Use the same `STREAM_AUTH_TOKEN` as the gateway. The agent service also needs `OPENAI_API_KEY` to generate plans.

### Run without Docker

Start the gateway (MongoDB and Redis must be reachable) and the agent service in separate terminals, following the Phase 2 and Phase 4 instructions. Then start the frontend from the project root:

```powershell
npm run dev:web
```

Open `http://localhost:5173`. Vite proxies `/api` to the gateway and `/agent-api` to the agent service. To test planning, enter trip details and submit the form. To test live updates, enter a valid trip ID and stream token, connect to the stream, then publish a development event using the Phase 4 Postman collection.

For a full Compose development stack, set `STREAM_AUTH_TOKEN` (and `OPENAI_API_KEY` for actual itinerary generation) before running `docker compose up --build`. The dashboard is then available at `http://localhost:5173`.

### Phase 5 tests and Postman

```powershell
npm test
npm run typecheck:web
npm run build:web
```

Import [`postman/ICEPOT_Phase_5.postman_collection.json`](./postman/ICEPOT_Phase_5.postman_collection.json) to test the APIs used by the frontend:

| Request | Method | URL | Expected |
| --- | --- | --- | --- |
| Generate itinerary (dashboard API) | `POST` | `http://localhost:8000/api/v1/agent/plan` | `200`; itinerary title and days |
| Connect to live trip stream | `GET` | `http://localhost:3000/api/v1/trips/{{tripId}}/stream` | `200`; SSE stream stays open |

The frontend itself is verified in the browser at `http://localhost:5173`; Postman tests the backend APIs it consumes.

## Phase 6: Disruption monitoring and PDF export

Phase 6 adds a scheduled confirmed-flight polling worker, change-deduplicated `disruption_alert` SSE events, and authenticated local PDF export. The default status provider is intentionally a simulator: this phase does not query airline status feeds and does not rebook, cancel, or modify any real booking. A real status provider can be supplied behind the worker interface in a later integration.

The worker checks confirmed flight bookings every `DISRUPTION_POLL_INTERVAL_MS` (default `60000`) and emits an alert only when a flight changes to delayed or cancelled. The PDF endpoint validates the itinerary, stores a copy under `storage/pdfs` by default, and returns it as a download. The Compose stack stores exports in the `pdf_exports` volume. Set `PDF_EXPORT_DIR` to choose a different server-controlled directory.

### Run and test

The gateway requires MongoDB and Redis, and PDF exports require the gateway's `STREAM_AUTH_TOKEN`. Set these in PowerShell before starting the gateway:

```powershell
$env:MONGODB_URI = "<your MongoDB connection string>"
$env:REDIS_URL = "redis://localhost:6379"
$env:STREAM_AUTH_TOKEN = "<a long random token>"
npm run dev
```

Automated tests use in-memory booking/event fakes and a temporary PDF directory; no external services are needed:

```powershell
npm test
npm run build
npm run typecheck:web
```

### Phase 6 Postman tests

Import [`postman/ICEPOT_Phase_6.postman_collection.json`](./postman/ICEPOT_Phase_6.postman_collection.json) and set `streamToken` to the same value as `STREAM_AUTH_TOKEN`:

1. **Create sandbox confirmed flight** — `POST http://localhost:3000/api/v1/sandbox/disruptions/bookings`. Copy the returned IDs into the collection variables (the fixture request also saves them automatically).
2. **Open trip SSE stream** — `GET http://localhost:3000/api/v1/trips/{{tripId}}/stream`. Leave this request open.
3. **Simulate delayed flight** — `POST http://localhost:3000/api/v1/sandbox/disruptions/{{bookingId}}/simulate` with `{"status":"DELAYED"}`. Expect `202` and a `disruption_alert` event on the open stream. Change the status to `CANCELLED` to test a cancellation alert.
4. **Export itinerary as PDF** — `POST http://localhost:3000/api/v1/trips/{{tripId}}/export/pdf`, with the bearer token and sample itinerary JSON in the collection. Expect `200 application/pdf`; the server also saves a copy in `storage/pdfs`.

The sandbox fixture and simulation endpoints return `404` in production. PDF exports and event streams require bearer authentication. Alerts are informational only and ask the traveler to review options with the airline; no automatic rebooking occurs.

## Phase 7: Production readiness and CI

Phase 7 adds `/api/v1/ready` dependency readiness reporting, container health checks, non-root gateway and agent images, an Nginx production frontend image with SSE-friendly proxy settings, and GitHub Actions CI. CI runs Node tests/build/audit, frontend type-check/build, Python agent tests, and all three container builds. Workflow checks do not publish images or deploy to a cloud account.

### Local production-like stack

Docker Compose in this repository is a local integration stack, not a hardened production deployment. It publishes service ports for local Postman testing. Use managed MongoDB and Redis for cloud deployment; do not expose their ports publicly. Provide credentials through the cloud provider's secret manager, use TLS at the ingress/load balancer, and configure network access restrictions.

To run the local container stack:

```powershell
$env:STREAM_AUTH_TOKEN = "<a long random token of at least 32 bytes>"
$env:OPENAI_API_KEY = "<your OpenAI API key>"
docker compose up --build
```

The gateway, agent, and frontend are available at `127.0.0.1` ports `3000`, `8000`, and `5173`. MongoDB and Redis are also bound only to loopback for local development. Health checks are configured for all app services. The gateway liveness check remains `200` while alive; readiness at `/api/v1/ready` is `200` only when MongoDB and Redis are connected, otherwise `503`.

### CI and validation

GitHub Actions runs on pushes to `main`, pull requests, and manual dispatch. Check the **CI** workflow in the repository's Actions tab. Locally run:

```powershell
npm ci
npm test
npm run build
npm run typecheck:web
npm run build:web
npm audit
.\.venv\Scripts\python.exe -m pytest agent_service\tests -q
.\.venv\Scripts\pip-audit.exe -r agent_service\requirements-test.txt
```

### Deployment outline

1. Build the gateway (`Dockerfile`), agent (`agent_service/Dockerfile`), and frontend (`frontend/Dockerfile`) images through the CI workflow.
2. Push reviewed image tags to your private container registry using a separately configured workflow and registry credentials.
3. Deploy gateway, agent, and frontend as separate services on ECS, Cloud Run, or another container platform. Route public traffic through the frontend/HTTPS ingress; keep database and Redis endpoints private.
4. Set `MONGODB_URI`, `REDIS_URL`, `STREAM_AUTH_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DISRUPTION_POLL_INTERVAL_MS`, and `PDF_EXPORT_DIR` through managed secrets/runtime configuration. Ensure PDF storage is persistent and private.
5. Configure liveness with `/api/v1/health`, readiness with `/api/v1/ready`, and agent health with `/health`. Verify the deployed services with [`postman/ICEPOT_Phase_7.postman_collection.json`](./postman/ICEPOT_Phase_7.postman_collection.json).

No cloud account, production credentials, image registry, or deployment target was provided, so this phase prepares and validates deployable artifacts but does not publish or deploy them.
