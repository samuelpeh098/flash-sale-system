# Flash Sale System

A production-ready flash sale system that prevents overselling, handles high concurrency, and ensures fair purchase ordering. Built to survive the chaos of limited product launches.

## What This Solves

When 5,000 people try to buy 100 items simultaneously:
- ❌ **Most systems**: Oversell, crash, or race conditions
- ✅ **This system**: Exactly 100 purchases, fair ordering, zero crashes

## Architecture

This is a **monorepo** containing:

```
test-assessment/
├── backend/           # NestJS API + queue-based purchase system
├── frontend/          # React UI with live status updates
└── README.md          # You are here
```

**Backend** handles:
- Queue-based purchase processing (prevents race conditions)
- Circuit breaker (prevents cascading failures)
- Rate limiting (10 requests/min per user)
- Real-time metrics and monitoring

**Frontend** provides:
- Live stock updates (every 5 seconds)
- Purchase interface
- User purchase status checking

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── app.controller.ts       # REST API endpoints
│   │   ├── app.service.ts          # Core business logic
│   │   ├── app.controller.spec.ts  # Integration tests
│   │   ├── app.service.spec.ts     # Unit tests
│   │   └── app.stress.spec.ts      # Load tests (1000-5000 users)
│   ├── README.md                    # Detailed backend docs
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Main React component
│   │   └── ...
│   ├── README.md                    # Frontend setup guide
│   └── package.json
│
└── README.md                        # This file
```

## How To Use

### 1. Start Both Services
Follow Quick Start above

### 2. Open Frontend
Navigate to http://localhost:3000

### 3. Make a Purchase
- Enter a user ID (e.g., "user123")
- Click "Buy Now"
- Watch the stock decrease in real-time
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/flash-sale/status` | Current stock, queue size, health |
| POST | `/flash-sale/purchase` | Attempt purchase (requires `userId`) |
| GET | `/flash-sale/purchase/:userId` | Check user's purchase status |
| GET | `/flash-sale/metrics` | System metrics (requests, success rate) |
| GET | `/flash-sale/health` | Health check (uptime, circuit breaker) |
```


## Tech Stack

**Backend:**
- NestJS (Node.js framework)
- TypeScript
- In-memory data structures

**Frontend:**
- React 18
- TypeScript
- Ant Design
- Create React App