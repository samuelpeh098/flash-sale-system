# Flash Sale System

A production-ready flash sale system that prevents overselling, handles high concurrency, and ensures fair purchase ordering. Built to survive the chaos of limited product launches.

## 🎯 What This Solves

When 5,000 people try to buy 100 items simultaneously:
- ❌ **Most systems**: Oversell, crash, or race conditions
- ✅ **This system**: Exactly 100 purchases, fair ordering, zero crashes

## 🏗️ Architecture

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

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm

### Option 1: Run Both (Recommended)

```bash
# Terminal 1 - Start Backend
cd backend
npm install
npm run start:dev
# Backend runs at http://localhost:3001

# Terminal 2 - Start Frontend
cd frontend
npm install
npm start
# Frontend runs at http://localhost:3000
```

### Option 2: Backend Only

```bash
cd backend
npm install
npm run start:dev

# Test with curl
curl http://localhost:3001/flash-sale/status
curl -X POST http://localhost:3001/flash-sale/purchase \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123"}'
```

### Option 3: Full Test Suite

```bash
cd backend
npm install
npm run test        # Unit + Integration + Stress tests
npm run test:cov    # With coverage report
```

## 📁 Project Structure

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

## 🎮 How To Use

### 1. Start Both Services
Follow Quick Start above

### 2. Open Frontend
Navigate to http://localhost:3000

### 3. Make a Purchase
- Enter a user ID (e.g., "user123")
- Click "Buy Now"
- Watch the stock decrease in real-time

### 4. Test Concurrency
```bash
# Simulate 1000 concurrent users
cd backend
npm run test -- app.stress.spec.ts
```

## 🔥 Key Features

### Backend Highlights
- **Queue-based processing**: FIFO ordering, processes 50 requests per batch
- **Atomic operations**: Stock decrement + purchase record happen together
- **Circuit breaker**: Auto-recovers from failures (5 failures → 30s cooldown)
- **Rate limiting**: Max 10 requests/min per user
- **Real-time metrics**: Success rates, queue depth, processing times

### Frontend Highlights
- **Live updates**: Auto-refreshes every 5 seconds
- **Instant feedback**: Success/error messages for purchases
- **Purchase verification**: Check if a user already bought
- **Responsive UI**: Built with Ant Design

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/flash-sale/status` | Current stock, queue size, health |
| POST | `/flash-sale/purchase` | Attempt purchase (requires `userId`) |
| GET | `/flash-sale/purchase/:userId` | Check user's purchase status |
| GET | `/flash-sale/metrics` | System metrics (requests, success rate) |
| GET | `/flash-sale/health` | Health check (uptime, circuit breaker) |

## 🧪 Testing

```bash
cd backend

# Run all tests (unit + integration + stress)
npm run test

# Run specific test suites
npm run test -- app.service.spec.ts      # Unit tests only
npm run test -- app.controller.spec.ts   # API tests only
npm run test -- app.stress.spec.ts       # Load tests only

# Watch mode (auto-rerun on changes)
npm run test:watch

# Coverage report
npm run test:cov
```

**Stress Test Results:**
- ✅ 1000 concurrent users → Exactly 100 purchases (no overselling)
- ✅ 5000 concurrent users → System stays responsive
- ✅ Rate limiting → Blocks spam after 10 requests/min

## 📖 Documentation

- **[Backend README](./backend/README.md)** - Deep dive into architecture, algorithms, and system design
- **[Frontend README](./frontend/README.md)** - UI setup and configuration

## 🔧 Configuration

### Backend Configuration
Edit `backend/src/main.ts` or use environment variables:

```typescript
// Sale settings
totalStock: 100,              // Items available
startTime: new Date(),        // Sale start
endTime: new Date(+1 hour),   // Sale end

// System limits
maxQueueSize: 10000,          // Max concurrent requests
maxRequestsPerMinute: 10,     // Rate limit per user
batchSize: 50,                // Requests processed per batch
```

### Frontend Configuration
Edit `frontend/src/App.tsx`:

```typescript
// Backend URL
const API_BASE = 'http://localhost:3001/flash-sale';

// Auto-refresh interval (5 seconds)
setInterval(() => fetchSaleStatus(), 5000);
```

## 🚨 Troubleshooting

**Backend won't start**
- Check Node.js version (18+)
- Ensure port 3001 is free: `lsof -i :3001`

**Frontend can't connect**
- Verify backend is running at http://localhost:3001
- Check browser console for CORS errors

**"Too many requests" error**
- Rate limit is 10 requests/min per user
- Wait 60 seconds or use a different user ID

**Tests fail**
- Clear `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check Node.js version matches (18+)

## 🛠️ Tech Stack

**Backend:**
- NestJS (Node.js framework)
- TypeScript
- In-memory data structures (production would use Redis)

**Frontend:**
- React 18
- TypeScript
- Ant Design
- Create React App

## 📈 Performance Benchmarks

| Scenario | Result |
|----------|--------|
| 1000 concurrent users | ✅ 0% overselling, <100ms latency |
| 5000 concurrent users | ✅ No crashes, graceful degradation |
| Rate limit stress test | ✅ Blocks after 10 requests |
| Memory under load | ✅ Stable, no leaks |

## 📝 License

This is a test assessment project.

## 👤 Author

Built for Bookipi technical assessment.

---

**Need help?** Check the detailed READMEs in `backend/` and `frontend/` directories.
