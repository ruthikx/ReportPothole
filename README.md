# PathHole Pothole Reporting App

PathHole is a pothole reporting and repair-tracking monorepo. It includes an Express/MongoDB backend, an Expo mobile app, a Vite municipal admin console, and a Vite public dashboard.

Citizens can report potholes with photos and location data, view nearby/community reports, upvote duplicates, and track a report ID. Municipal staff can assign tickets, monitor SLA escalations, resolve work with after photos, and view public performance metrics.

## Project Structure

```text
pothole-app/
|-- backend/       # Express API, Mongoose models, services, Jest tests
|-- mobile/        # Expo app for citizens, workers, and mobile staff flows
|-- admin/         # Vite staff admin console
`-- dashboard/     # Vite public dashboard
```

The backend uses CommonJS. The mobile app and Vite frontends use ES modules.

## Runtime Requirements

- Node.js 18+
- MongoDB for the backend API
- Redis is optional for report rate limiting and BullMQ notification jobs
- ImageKit or AWS S3 credentials are optional for uploaded photo storage
- Firebase, Twilio, and SendGrid credentials are optional for notification delivery
- A MapLibre style URL is optional for the public dashboard map

When optional services are not configured, the app falls back where supported: local photo storage, skipped Redis-backed report rate limiting, synchronous/best-effort notifications, and an OpenStreetMap raster basemap for the dashboard.

## Quick Start

Install and run each package from its own directory. The root `package.json` is not configured as an npm workspace and its `npm test` script is only a placeholder.

```bash
cd backend
npm install
```

Create `backend/.env`:

```bash
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/pathhole
JWT_SECRET=replace-with-a-long-random-secret
UPLOAD_STORAGE=local
```

Start the API:

```bash
npm run dev
```

In separate terminals, start the clients as needed:

```bash
cd mobile && npm install && npm start
cd admin && npm install && npm run dev
cd dashboard && npm install && npm run dev
```

Default local URLs:

- Backend API: `http://localhost:3000/api/v1`
- Admin console: `http://localhost:5174`
- Public dashboard: `http://localhost:5175`

## Package Commands

| App | Development | Build / production | Tests |
|---|---|---|---|
| Backend | `cd backend && npm run dev` | `npm start` | `npm test`, `npm run test:watch`, `npm run test:coverage` |
| Mobile | `cd mobile && npm start` | `npm run build` exports Expo web to `dist/`; `npm run android`, `npm run ios`, and `npm run web` are also available | No automated mobile tests |
| Admin console | `cd admin && npm run dev` on port `5174` | `npm run build`, `npm run preview` on port `4174` | No automated admin tests |
| Public dashboard | `cd dashboard && npm run dev` on port `5175` | `npm run build`, `npm run preview` on port `4175` | No automated dashboard tests |

Seed ward polygons after creating `backend/wards.geojson`:

```bash
cd backend
npm run seed
```

The seed script expects a GeoJSON `FeatureCollection` of Polygon features. It reads ward names from `properties.name` or `properties.ward_name`, and SLA hours from `properties.sla_hours` when present.

Run a standalone notification worker only when you do not want the API process to own the worker:

```bash
cd backend
node workers/notificationWorker.js
```

## API Base URLs

The backend mounts the same router at both base paths:

- `http://localhost:3000/api/v1`
- `http://localhost:3000/api`

Examples use `/api/v1`. The mobile app, admin console, and dashboard default to `http://localhost:3000/api/v1`.

## Backend

The server listens on `PORT` or `3000`. It serves local uploads from `/uploads` when remote storage is not enabled.

Minimum environment:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/pathhole
JWT_SECRET=replace-with-a-long-random-secret
```

There is no tracked `.env.example` in this repo, so create `backend/.env` manually. The backend has an insecure development fallback for `JWT_SECRET`, but a real secret should be set for any shared environment.

## Mobile App

```bash
cd mobile
npm install
npm start
```

The Expo config is `mobile/app.config.js`. It reads `API_BASE_URL` from the environment and exposes it as `expo.extra.API_BASE_URL`, defaulting to `http://localhost:3000/api/v1`.

Common values:

- Android emulator: `http://10.0.2.2:3000/api/v1`
- iOS simulator or browser on the same machine: `http://localhost:3000/api/v1`
- Physical device: `http://<your-machine-lan-ip>:3000/api/v1`

During Expo development, `mobile/services/api.js` rewrites `localhost` or `127.0.0.1` to the Expo host when possible, which helps physical devices reach the backend on the LAN.

The mobile app includes:

- Guest/citizen community feed, map, report, profile, and report tracking screens
- Citizen registration and login
- Worker ticket list and resolution flow with after-photo upload
- Staff ticket listing, assignment, and escalation screens for engineer/supervisor/commissioner/admin roles
- Offline queueing for report submissions and worker resolution updates, with retries on reconnect

## Admin Console

```bash
cd admin
npm install
npm run dev
```

The admin console reads `VITE_API_URL` and defaults to `http://localhost:3000/api/v1`. It signs in through `POST /auth/admin/login`, stores the JWT in `localStorage` as `pothole_admin_token`, and stores the user as `pothole_admin_user`.

Implemented views:

- Queue
- Assign
- Escalations
- Analytics
- Settings

Settings lists wards, field workers, and staff users. It can create field workers through the backend API. Full editable ward/staff management routes exist on the backend but are not all surfaced as forms in the UI.

## Public Dashboard

```bash
cd dashboard
npm install
npm run dev
```

The dashboard reads:

- `VITE_API_URL`, defaulting to `http://localhost:3000/api/v1`
- `VITE_MAPLIBRE_STYLE_URL`, optional MapLibre style URL

It displays monthly/all-time stats, resolution rate, average fix time, overdue work, public report lookup, recent active reports, a MapLibre open-ticket map, and ward performance. Without a custom MapLibre style URL, it uses the built-in OpenStreetMap raster basemap.

The dashboard also contains a hard-coded APK download link in `dashboard/src/App.jsx`.

## Roles and Permissions

User roles are:

- `citizen`
- `worker`
- `engineer`
- `supervisor`
- `commissioner`
- `admin`

Role ranks in `backend/middleware/auth.js` are `citizen < worker < engineer < supervisor < commissioner/admin`. `admin` is treated as an alias of `commissioner`; both have rank `4`.

Public registration creates citizen accounts only. Workers are created through protected `/admin/workers` routes by an engineer-or-higher user. Staff roles (`engineer`, `supervisor`, `commissioner`, `admin`) are created through protected `/admin/users` routes by a supervisor-or-higher user with sufficient role rank. The first staff/admin account must be seeded or inserted outside the public registration flow.

## Environment Variables

### Backend

| Variable | Required | Used for |
|---|---:|---|
| `PORT` | No | API port, defaults to `3000` |
| `NODE_ENV` | No | Disables background jobs during tests |
| `MONGO_URI` / `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | JWT signing; code has an insecure development fallback if unset |
| `JWT_EXPIRES_IN` | No | JWT lifetime, defaults to `7d` |
| `REDIS_URL` | No | Redis client for report rate limiting and BullMQ notifications |
| `ENABLE_NOTIFICATION_QUEUE` | No | Set to `true` to enqueue notifications through BullMQ |
| `NOTIFICATION_QUEUE_ATTEMPTS` | No | Queue retry attempts, default `3` |
| `NOTIFICATION_QUEUE_BACKOFF_MS` | No | Exponential backoff delay, default `5000` |
| `NOTIFICATION_WORKER_CONCURRENCY` | No | BullMQ worker concurrency, default `5` |
| `ENABLE_NOTIFICATION_WORKER` | No | Allows worker startup while `NODE_ENV=test`; mainly useful for tests |
| `UPLOAD_STORAGE` | No | `local`, `imagekit`, or `s3`. Real S3 credentials also enable S3 even if unset |
| `IMAGEKIT_PRIVATE_KEY` | For ImageKit | Private API key for server-side ImageKit uploads |
| `IMAGE_KIT_BASE_URL` | No | Optional ImageKit API base URL override |
| `IMAGEKIT_UPLOAD_FOLDER` | No | ImageKit media library folder, defaults to `/pothole-app/uploads` |
| `IMAGEKIT_URL_ENDPOINT` / `IMAGE_KIT_URL_ENDPOINT` / `IMAGEKIT_ENDPOINT` / `IMAGE_KIT_ENDPOINT` | For ImageKit URLs | Optional ImageKit delivery endpoint used to resolve stored ImageKit paths |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET` | For S3 | S3 upload, signed URL, and cleanup support |
| `FIREBASE_SERVICE_ACCOUNT_KEY` / `FIREBASE_SA_KEY` | For FCM | Firebase service account JSON string |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` / `TWILIO_FROM_NUMBER` | For SMS | Twilio SMS delivery |
| `SENDGRID_API_KEY`, `EMAIL_FROM` | For email | SendGrid email delivery |
| `IMAGE_HASH_DISTANCE` | No | Hamming-distance threshold for image duplicate detection, default `10` |

### Frontends

| App | Variable | Used for |
|---|---|---|
| Admin | `VITE_API_URL` | Backend API base URL |
| Dashboard | `VITE_API_URL` | Backend API base URL |
| Dashboard | `VITE_MAPLIBRE_STYLE_URL` | Optional MapLibre map style |
| Mobile | `API_BASE_URL` | Read by `mobile/app.config.js` and exposed as `expo.extra.API_BASE_URL` |

For EAS production builds, `mobile/eas.json` sets `API_BASE_URL` to `https://reportpothole.onrender.com/api/v1`.

## Main API Surface

All routes below are available under both `/api/v1` and `/api`.

### Auth

- `POST /auth/register` - public citizen registration
- `POST /auth/login` - login for any account
- `POST /auth/admin/login` - login for engineer/supervisor/commissioner/admin portal access
- `POST /auth/refresh` - refresh an existing JWT
- `POST /auth/device` - update citizen `fcmToken` and/or `deviceId`

### Reports

- `POST /reports` - public or authenticated multipart report submission. Accepts `photo` or up to five `photos`, plus `lat`, `lng`, optional `description`, `address`, `deviceId`, and `fcmToken`.
- `GET /reports` - public report feed with `page`, `limit`, optional comma-separated `status`, and `mine=true` for authenticated citizen reports.
- `GET /reports/mine` - authenticated citizen report list.
- `GET /reports/:reportId` - public report status and public event history.
- `POST /reports/:id/upvote` - public duplicate/upvote count, where `id` may be a Mongo ticket id or `reportId`.

### Tickets

- `GET /tickets` - `worker` and above. Workers are filtered to their assigned tickets; staff can filter by `status`, `ward`, `page`, and `limit`.
- `GET /tickets/overdue` - `supervisor` and above.
- `GET /tickets/meta/workers` - `engineer` and above.
- `GET /tickets/meta/wards` - `engineer` and above.
- `GET /tickets/meta/users` - `supervisor` and above.
- `GET /tickets/:id/history` - assigned worker or staff.
- `GET /tickets/:id` - `worker` and above.
- `PATCH /tickets/:id/assign` - `engineer` and above; body `{ "workerId": "..." }`.
- `PATCH /tickets/:id/status` - `worker` and above; accepts status `assigned`, `in_progress`, or `resolved`, and optional multipart `afterPhoto`.

### Dashboard

Dashboard endpoints are public:

- `GET /dashboard/stats`
- `GET /dashboard/heatmap`
- `GET /dashboard/wards`
- `GET /dashboard/status/:reportId`

### Admin and Stats

- `GET /stats/summary`, `GET /stats/by-ward`, `GET /stats/heatmap` - commissioner/admin-equivalent access through role-rank checks.
- `GET /admin/workers`, `POST /admin/workers`, `PATCH /admin/workers/:id` - field worker management.
- `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/:id` - staff management, bounded by actor role rank.
- `GET /admin/wards`, `POST /admin/wards`, `PATCH /admin/wards/:id`, `PATCH /admin/wards/:id/engineer`, `PATCH /admin/wards/:id/sla` - ward and SLA management.

## Ticket Schema

The implemented `Ticket` model stores:

```js
{
  reportId: String,               // unique, indexed, e.g. RPT-00001
  location: {
    type: 'Point',
    coordinates: [lng, lat]
  },
  ward: ObjectId,                 // Ward reference
  wardName: String,               // fallback/display ward name
  address: String,
  photos: {
    before: [String],             // upload keys or remote URLs
    after: [String]
  },
  imageHashes: {
    before: [String],
    after: [String]
  },
  description: String,
  status: 'open' | 'assigned' | 'in_progress' | 'resolved',
  assignedTo: ObjectId,           // User reference
  reportedBy: ObjectId,           // User reference when authenticated
  duplicateOf: ObjectId,          // modeled, not actively populated by report flow
  upvotes: Number,
  slaDeadline: Date,
  escalationLevel: Number,        // 0..3
  resolvedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

Before photos are written during report submission. After photos are written when a worker/staff member updates a ticket status with `afterPhoto`. Image hashes are used for duplicate detection when image bytes are available to the backend process. S3-only metadata is skipped for hashing.

## Implemented Behavior Notes

- Duplicate detection first checks for an unresolved ticket within 50 meters, then checks image hashes within 100 meters when a hash can be computed.
- Report IDs come from the Mongo `Counter` model and use the `RPT-00001` format.
- Ward assignment uses geospatial lookup against `Ward.boundary`. If no ward polygon matches, the app may infer/store a `wardName` from address/description data.
- SLA deadlines use the matched ward's `slaHours` or default to `168` hours.
- A daily cron inside the backend runs escalation at `06:00` server time and increments overdue unresolved tickets up to level `3`.
- Mobile offline queue stores failed report submissions and worker resolution updates in AsyncStorage, retries on reconnect, and marks items failed after three retries while keeping them on the device.

## Notification Queue Behavior

`dispatchNotification` uses `backend/services/notificationQueue.js`.

- When `ENABLE_NOTIFICATION_QUEUE` is not `true`, Redis is missing, or the user has no deliverable channel for the requested notification, delivery is attempted synchronously through `notify`.
- When queueing is enabled and Redis is configured, notifications are added to BullMQ queue `notifications` as job `send-notification`.
- Queue jobs default to `3` attempts with exponential backoff starting at `5000ms`, remove completed jobs, and keep failed jobs.
- If enqueueing fails, the backend logs the error and falls back to synchronous delivery.
- The API process starts a notification worker outside `NODE_ENV=test`. A standalone worker can also be started with `node workers/notificationWorker.js`.
- Delivery is best effort. FCM requires a Firebase service account and user `fcmToken`; SMS requires Twilio credentials, a Twilio sender, and user `phone`; email requires SendGrid credentials and user `email`.

## Known Limitations and Setup Notes

- There is no public first-admin bootstrap endpoint. Create the first staff account through seed data, direct database insertion, or a trusted internal script.
- There is no tracked `backend/.env.example`.
- Redis-backed report rate limiting is skipped if Redis is not configured or errors. The global Express rate limiter still runs in-process.
- Ticket status updates require a worker-or-higher role but do not currently verify that a worker is assigned to that specific ticket.
- Image duplicate detection is unavailable for S3-only uploads unless bytes are available to the backend process. ImageKit uploads keep bytes in memory during request processing, so hashing still runs.
- Admin Settings can create workers and list wards/staff, but not every backend staff/ward mutation route has an editable UI form.
- Automated tests exist for the backend only. Admin, dashboard, and mobile currently rely on builds and manual QA.
- The root package is not configured as an npm workspace.
- `mobile/app.config.js` references `./assets/splash.png`, while the tracked asset is currently `mobile/assets/splash.png.png`; rename the asset or update the config if Expo reports a missing splash image.

## Manual QA Checklist

- Backend: start MongoDB, run `npm run dev`, confirm `GET /api/v1/dashboard/stats` returns JSON.
- Public report flow: submit a report from the mobile app with a photo and location; confirm an `RPT-` id is returned and `Track` can load it.
- Duplicate/upvote flow: submit or upvote the same nearby report and confirm the existing report's `upvotes` increases.
- Staff auth: sign in as an engineer/supervisor/commissioner/admin in the admin console and confirm Queue, Escalations, Analytics, and Settings load from the API.
- Worker creation: create a field worker from admin Settings and confirm the user appears in the worker list.
- Assignment flow: from admin Queue/Assign, assign an open ticket to a worker and confirm it appears in the worker mobile ticket list.
- Resolution flow: from the worker mobile app, add an after photo, mark the ticket resolved, and confirm public tracking shows `resolved`.
- Dashboard: run the dashboard, confirm stats and ward table load, and verify the MapLibre open-ticket map renders ticket clusters.
- Offline queue: disable network during mobile report or resolution submission, confirm the item is queued, restore network, and confirm retry clears or updates the queue state.
