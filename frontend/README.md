# Flash Sale Frontend

React-based UI for the flash sale system. Shows live stock updates and handles purchases.

## Setup

```bash
# Install dependencies
npm install

# Start dev server
npm start
```

Open [http://localhost:3000](http://localhost:3000)

**Important:** Backend must be running at `http://localhost:3001` first.

## What It Does

- **Live Status** - Shows available stock, updates every 5 seconds
- **Make Purchase** - Enter user ID and buy
- **Check Status** - Verify if a user bought something

## Features

### Sale Status
- Total items, sold count, remaining stock
- Sale active/ended indicator
- Auto-refreshes every 5 seconds

### Purchase Flow
1. Enter your user ID (e.g., "user123")
2. Click "Buy Now"
3. Get instant success/error feedback

### Error Handling
- Sale ended/not started
- Already purchased (1 per user)
- Rate limited (10 requests/min)
- Sold out
- Backend errors

## API Endpoints Used

```
GET  /flash-sale/status              - Get current status
POST /flash-sale/purchase            - Attempt purchase
GET  /flash-sale/purchase/:userId    - Check user's purchase
```

## Configuration

Change backend URL in `src/App.tsx`:
```typescript
const API_BASE = 'http://localhost:3001/flash-sale';
```

Change auto-refresh interval (default 5 seconds):
```typescript
setInterval(() => {
  fetchSaleStatus();
}, 5000); // milliseconds
```

## Available Scripts

### `npm start`
Runs the app at [http://localhost:3000](http://localhost:3000)

### `npm test`
Launches test runner

### `npm run build`
Builds for production to `build/` folder

### `npm run eject`
⚠️ One-way operation. Ejects from Create React App.

## Tech Stack

- React 18 + TypeScript
- Ant Design (UI components)
- Create React App

## Troubleshooting

**"Failed to fetch"** → Check backend is running at port 3001

**"Purchase Failed"** → Could be: sale ended, sold out, already purchased, or rate limited

**Stale data** → Wait 5 seconds for auto-refresh or reload page