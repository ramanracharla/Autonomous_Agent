# ICEPOT – Universal AI Solution Architect

## System Architecture Specification Document

---

## 1. Project Overview & Business Use Case

**ICEPOT** is an autonomous multi-agent travel platform that acts as a 24/7 personal travel planner, booking manager, and real-time tour guide. Unlike passive travel search engines (such as Expedia or Google Flights) that merely return lists of options, ICEPOT dynamically reasons across complex user constraints, builds customized schedules, executes live API bookings, and dynamically handles real-time disruptions (e.g., flight cancellations, delays, weather alterations) on behalf of travelers.

### 1.1 Key Target Personas
* **Busy Professionals:** Require complex multi-destination leisure or business itineraries optimized within precise time and budget constraints, eliminating hours of manual cross-site comparison.
* **Families & Group Travelers:** Need coordinated multi-passenger schedules, aligning hotel rooms, seating preferences, and age/dietary constraints into a single cohesive trip plan.
* **On-Trip Management:** Travelers facing mid-trip flight delays or cancellations who require immediate, automated rebookings and schedule adjustments.

### 1.2 Problem Statement
1. **Information Overload & Cognitive Fatigue:** Travelers spend 10 to 20+ hours across 38+ websites to organize a single trip.
2. **Context Fragmentation:** Legacy platforms lack holistic understanding of user constraints (dietary requirements, mobility needs, layover preferences).
3. **Passive Disruption Management:** Traditional OTAs place the burden of flight rebooking, hotel adjustments, and activity rescheduling onto the traveler during travel emergencies.
4. **Static Itineraries:** Conventional itineraries fail to dynamically adapt when local conditions, traffic, or flight schedules change.

---

## 2. Confirmed Architectural Decisions

| Architectural Dimension | Confirmed Decision | Rationale & Impact |
| :--- | :--- | :--- |
| **Application Scope** | Responsive Web App (React + Vite PWA) | Enables rich desktop itinerary planning with mobile-friendly PWA offline caching & push alerts. |
| **User Access & Roles** | Multi-Role RBAC | Protects sensitive PII/billing data while allowing group collaborators read/suggest access. |
| **MVP Scope** | Lean MVP | Focuses on core conversational trip planning, API flight/hotel bookings, and flight disruption alerts. |
| **Backend Architecture** | Polyglot Microservices | Node.js/TypeScript for high-throughput gateway APIs; Python/FastAPI for AI LLM agent reasoning. |
| **Communication Pattern** | Event-Driven Async Messaging | Decouples web client request threads from long-running agent background tasks via Redis Pub/Sub. |
| **Database & Storage** | MongoDB Primary Store | Provides fluid schema flexibility for nested, evolving itineraries, plus local disk storage for PDF files. |
| **API & Protocols** | Hybrid REST + SSE / WebSockets | REST for CRUD operations; Server-Sent Events/WebSockets for streaming live agent thought streams and alerts. |
| **Security Framework** | Defense-in-Depth | Enforces JWT with refresh tokens, field-level AES-256 for PII, strict Zod/Pydantic validation, and rate limits. |
| **Cloud Infrastructure** | Serverless Containers (ECS/Cloud Run) | Dockerized services automatically scale based on load with minimal operational VM maintenance overhead. |

---

## 3. Technology Stack Specification

| Layer | Technology | Alternatives | Rationale |
| :--- | :--- | :--- | :--- |
| **Frontend** | React (Vite) + TypeScript | Next.js, Vue/Nuxt | Lightweight SPA with fast HMR and seamless WebSocket/SSE stream rendering. |
| **API Gateway** | Node.js (Express / NestJS) | Python, Java Spring | High concurrency I/O, unified TypeScript interface, robust JWT auth middleware. |
| **AI Agent Service** | Python (FastAPI) | Node.js | Native ecosystem for LangGraph / CrewAI, Pydantic schemas, and direct LLM tooling. |
| **Primary Database** | MongoDB | PostgreSQL, DynamoDB | Document storage matches deeply nested, dynamic travel itineraries and agent logs. |
| **Cache & Queue** | Redis | RabbitMQ, Memcached | In-memory database backing flight result cache, rate limiting, and event queues. |
| **File Storage** | Local Server File System | AWS S3, Cloudflare R2 | Direct local file storage simplifies MVP PDF document generation and receipt management. |
| **CI/CD Pipeline** | GitHub Actions | GitLab CI, Jenkins | Automates container builds, unit testing, and zero-downtime container deployment. |
| **Monitoring** | Sentry + Winston / Structlog | Datadog, New Relic | Real-time error tracking and structured JSON logging across polyglot microservices. |

---

## 4. System Architecture & Flow

### 4.1 Request Flow Lifecycle

```
[ React PWA Client ]
         │
         ├─── (1) POST /api/v1/trips/generate ───────────────────► [ Node.js API Gateway ]
         │                                                                   │
         │                                                                   ├─── (2) Write Trip Document (PENDING) ──► [ MongoDB ]
         │                                                                   │
         │                                                                   └─── (3) Publish Event ─────────────────► [ Redis Broker ]
         │                                                                                                                  │
         ├─── (4) Connect GET /stream (SSE) ──────────────────────┐                                                          │
         │                                                        │                                                          │
         │                                                        ▼                                                          │
         │                                              [ SSE Controller ]                                                   │
         │                                                        ▲                                                          │
         │                                                        │                                                          │
         │◄── (6) Stream Progress Updates / Thought Steps ────────┴── (5) Pub/Sub Messages ◄──────────────────────────────────┤
                                                                                                                             │
                                                                                                                             ▼
                                                                                                                   [ Python Agent Worker ]
                                                                                                                             │
                                                                                                                             ├─── Query LLM Reasoning ──► [ OpenAI / Anthropic ]
                                                                                                                             │
                                                                                                                             └─── Execute Search ─────► [ Duffel / Amadeus APIs ]
```

---

## 5. Database Schema Specification (MongoDB)

### 5.1 Collection: `users`
```json
{
  "_id": "65f1a2b3c4d5e6f7a8b9c0a1",
  "email": "user@example.com",
  "passwordHash": "$2b$12$e89...hash",
  "fullName": "Alex Taylor",
  "roles": ["PRIMARY_TRAVELER"],
  "preferences": {
    "seatPreference": "WINDOW",
    "dietaryRestrictions": ["VEGETARIAN"],
    "preferredAirlines": ["UA", "SQ"]
  },
  "createdAt": "2026-10-24T10:00:00Z"
}
```

### 5.2 Collection: `trips`
```json
{
  "_id": "65f1a2b3c4d5e6f7a8b9c0b2",
  "primaryUserId": "65f1a2b3c4d5e6f7a8b9c0a1",
  "title": "Tokyo Innovation & Exploration Trip",
  "status": "CONFIRMED",
  "budget": { "amount": 3500.00, "currency": "USD" },
  "startDate": "2026-11-10",
  "endDate": "2026-11-15",
  "collaborators": [
    { "userId": "65f1a2b3c4d5e6f7a8b9c0a2", "role": "COLLABORATOR" }
  ],
  "createdAt": "2026-10-24T10:05:00Z"
}
```

### 5.3 Collection: `bookings`
```json
{
  "_id": "65f1a2b3c4d5e6f7a8b9c0c3",
  "tripId": "65f1a2b3c4d5e6f7a8b9c0b2",
  "type": "FLIGHT",
  "provider": "Duffel",
  "providerReference": "DUFFEL-FL-99182",
  "status": "CONFIRMED",
  "flightDetails": {
    "airline": "All Nippon Airways",
    "flightNumber": "NH007",
    "origin": "SFO",
    "destination": "NRT",
    "departureTime": "2026-11-10T11:00:00Z",
    "arrivalTime": "2026-11-11T15:00:00Z"
  },
  "price": { "amount": 1120.00, "currency": "USD" }
}
```

---

## 6. API Endpoints & Contract Design

### 6.1 Create & Generate Trip Itinerary
* **Endpoint:** `POST /api/v1/trips/generate`
* **Headers:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`, `Content-Type: application/json`

**Request Payload:**
```json
{
  "prompt": "Plan a 5-day tech conference and leisure trip to Tokyo under $3500",
  "origin": "SFO",
  "destination": "TYO",
  "startDate": "2026-11-10",
  "endDate": "2026-11-15",
  "travelers": 1
}
```

**Response Payload (202 Accepted):**
```json
{
  "success": true,
  "tripId": "65f1a2b3c4d5e6f7a8b9c0b2",
  "status": "PROCESSING",
  "sseStreamUrl": "/api/v1/trips/65f1a2b3c4d5e6f7a8b9c0b2/stream"
}
```

### 6.2 Real-Time SSE Agent Event Stream
* **Endpoint:** `GET /api/v1/trips/:tripId/stream`

**Server-Sent Events Payload:**
```text
event: agent_thought
data: {"timestamp": "2026-10-24T10:05:02Z", "step": "ANALYZING_FLIGHTS", "message": "Evaluating non-stop flights SFO to NRT with window seats..."}

event: itinerary_draft
data: {"tripId": "65f1a2b3c4d5e6f7a8b9c0b2", "totalCost": 3240.00, "status": "DRAFT_READY"}
```

---

## 7. Implementation Phases & Roadmap

| Phase | Objective | Key Deliverables | Target Testing Scope |
| :--- | :--- | :--- | :--- |
| **Phase 1: Foundation** | Project init & monorepo setup | Docker Compose, Node.js gateway baseline, MongoDB models | Unit tests for gateway routing |
| **Phase 2: Agent Framework** | Python Agent microservice | FastAPI setup, LangGraph workflow execution, LLM client | PyTest mock reasoning tests |
| **Phase 3: Integration Adapters** | Travel & Payment APIs | Duffel flight adapter, Amadeus hotel adapter, Stripe integration | Integration sandbox mock execution |
| **Phase 4: Async Pipelines** | Real-time streaming pipeline | Redis Pub/Sub broker, Node.js SSE stream route, event handlers | End-to-end stream latency tests |
| **Phase 5: React Frontend** | Interactive user dashboard | React + Vite SPA layout, SSE hook connection, itinerary UI | Cross-browser UI integration testing |
| **Phase 6: Disruption Engine** | 24/7 Monitoring & PDF gen | Flight polling worker, rebooking alert engine, local PDF export | Simulated flight delay handling |
| **Phase 7: Cloud Deployment** | Production readiness & CI/CD | GitHub Actions CI pipeline, AWS ECS / Cloud Run deployment | Load testing & security audit |