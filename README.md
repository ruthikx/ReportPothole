# Pothole Reporting & Tracking App

A MERN + React Native (Expo) monorepo for citizens to report potholes and track resolution.

## Architecture

```
pothole-app/
├── backend/          # Node.js + Express API
│   ├── models/       # Mongoose schemas (Ticket, User, Ward, Counter)
│   ├── routes/       # Express route handlers (auth, reports, tickets, stats)
│   ├── services/     # Business logic (geoRouter, escalation, notifications)
│   ├── middleware/    # Auth, upload, validation, error handler
│   ├── schemas/      # Zod validation schemas
│   └── scripts/      # Seed utilities
└── mobile/           # React Native + Expo app
    ├── screens/       # Auth, citizen, worker, admin screens
    ├── services/      # API client, offline queue
    └── navigation/    # Role-based navigator
```

## Prerequisites

- **Node.js** v18+
- **MongoDB** v6+ (local or Atlas)
- **Redis** v7+
- **AWS S3** bucket for photo storage
- **Firebase** project with Cloud Messaging enabled (for push notifications)
- **Twilio** account (for SMS notifications)
- **Expo CLI**: `npm install -g expo-cli`

## Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
npm install
npm run dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | Token expiry (e.g. `7d`) |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `S3_BUCKET` | S3 bucket name for photo uploads |
| `FIREBASE_SA_KEY` | Firebase service account JSON |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio SMS sender number |

### Seed Wards

Create a `wards.geojson` file in the `backend/` directory:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Central Ward", "sla_hours": 168 },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[...]]]
      }
    }
  ]
}
```

Then run:

```bash
npm run seed
```

## Mobile Setup

```bash
cd mobile
npm install
npx expo start
```

Update `API_BASE_URL` in `app.json` under `expo.extra` to point to your backend URL.

### API Base URL

For Android emulator use `http://10.0.2.2:3000/api/v1`
For iOS simulator use `http://localhost:3000/api/v1`
For physical device use your machine's local IP

## API Endpoints

### Auth
- `POST /api/v1/auth/register` — Register citizen account
- `POST /api/v1/auth/login` — Login, returns JWT
- `POST /api/v1/auth/refresh` — Refresh JWT

### Reports
- `POST /api/v1/reports` — Submit pothole report (multipart, citizen)
- `GET /api/v1/reports/:reportId` — Track report status (public)
- `POST /api/v1/reports/:id/upvote` — Upvote report (citizen)

### Tickets
- `GET /api/v1/tickets` — List tickets (worker/admin, filterable)
- `GET /api/v1/tickets/overdue` — Overdue tickets (admin)
- `GET /api/v1/tickets/:id` — Ticket detail
- `PATCH /api/v1/tickets/:id/assign` — Assign to worker (admin)
- `PATCH /api/v1/tickets/:id/status` — Update status (worker/admin)

### Stats
- `GET /api/v1/stats/summary` — Summary counts (admin)
- `GET /api/v1/stats/by-ward` — Per-ward breakdown (admin)
- `GET /api/v1/stats/heatmap` — GeoJSON heatmap (admin)

## Features

- **Duplicate Detection**: Reports within 50m of an open ticket increment upvotes instead of creating duplicates
- **Auto Ward Assignment**: Geo-spatial query assigns reports to the correct ward
- **SLA Enforcement**: Service Level Agreement deadlines auto-calculated per ward
- **Escalation Pipeline**: Daily cron job escalates overdue tickets through 4 levels (Supervisor → Engineer Officer → Commissioner)
- **Push + SMS Notifications**: Firebase Cloud Messaging and Twilio SMS for real-time alerts
- **Offline Queue**: Mobile app queues failed requests and retries on reconnect
- **Rate Limiting**: 100 req/15min global, 5 reports/hour per device
- **Role-Based Access**: Citizen, Worker, and Admin roles with separate navigation stacks
