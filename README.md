# PathHole Pothole Reporting App

PathHole is a Node/Express, MongoDB, React Native (Expo), and Vite monorepo for reporting potholes, assigning municipal repair work, tracking resolution, and publishing public dashboard metrics.

## Project Structure

```text
pothole-app/
|-- backend/       # Express API, Mongoose models, Jest tests
|-- mobile/        # Expo app for public reporting, staff login, worker/admin flows
|-- admin/         # Vite staff admin console
`-- dashboard/     # Vite public dashboard
```

The backend is implemented with CommonJS (`require` and `module.exports`). The Vite frontends use ES modules.

## Runtime Requirements

- Node.js 18+
- MongoDB for the backend API
- Optional Redis for report rate limiting and BullMQ notification jobs
- Optional S3-compatible AWS credentials for uploaded photo storage
- Optional Firebase, Twilio, and SendGrid credentials for notification delivery
- Optional Mapbox token for the public dashboard heatmap

If optional services are not configured, the app falls back where the code supports it: local photo storage, synchronous/best-effort notifications, skipped Redis-backed report rate limiting, and a dashboard list view instead of a Mapbox map.

## API Base URLs

The backend mounts the same API router at both base paths:

- `http://localhost:3000/api/v1`
- `http://localhost:3000/api`

Examples in this document use `/api/v1`. The mobile app, admin console, and dashboard default to `http://localhost:3000/api/v1`.

## Commands

Install and run each package from its own directory. The root `package.json` does not define a useful workspace test/build command.

| App | Development | Build / production | Tests |
|---|---|---|---|
| Backend | `cd backend && npm install && npm run dev` | `npm start` | `npm test`, `npm run test:watch`, `npm run test:coverage` |
| Mobile | `cd mobile && npm install && npm start` | `npm run build` exports Expo web to `dist/`; `npm run android`, `npm run ios`, and `npm run web` are also available | No automated mobile tests are defined |
| Admin console | `cd admin && npm install && npm run dev` on port `5174` | `npm run build`, `npm run preview` on port `4174` | No automated admin tests are defined |
| Public dashboard | `cd dashboard && npm install && npm run dev` on port `5175` | `npm run build`, `npm run preview` on port `4175` | No automated dashboard tests are defined |

Seed ward polygons with:

```bash
cd backend
npm run seed
```

Run a standalone notification worker only when you do not want the API process to own the worker:

```bash
cd backend
node workers/notificationWorker.js
```

## Backend Setup

Create `backend/.env` from `backend/.env.example`, set at least `MONGO_URI` or `MONGODB_URI`, and set a real `JWT_SECRET`.

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

The server listens on `PORT` or `3000`. It serves local uploads from `/uploads` when S3 storage is not enabled.

## Mobile Setup

```bash
cd mobile
npm install
npm start
```

Set `expo.extra.API_BASE_URL` in `mobile/app.json`. During Expo development, `mobile/services/api.js` rewrites `localhost` or `127.0.0.1` to the Expo host when possible, which helps physical devices reach the backend on the LAN.

Common values:

- Android emulator: `http://10.0.2.2:3000/api/v1`
- iOS simulator or browser on the same machine: `http://localhost:3000/api/v1`
- Physical device: `http://<your-machine-lan-ip>:3000/api/v1`

## Admin Console Setup

```bash
cd admin
npm install
npm run dev
```

The admin console reads `VITE_API_URL` and defaults to `http://localhost:3000/api/v1`. It stores the staff JWT in `localStorage` under `pothole_admin_token`.

The implemented console has Queue, Assign, Escalations, Analytics, and Settings views. Settings currently lists wards and staff users; staff/ward write operations exist in the backend API but are not fully surfaced as editable forms in this UI.

## Dashboard Setup

```bash
cd dashboard
npm install
npm run dev
```

The public dashboard reads:

- `VITE_API_URL`, defaulting to `http://localhost:3000/api/v1`
- `VITE_MAPBOX_TOKEN` or `VITE_MAPBOX_ACCESS_TOKEN`, optional

Dashboard API endpoints are public and require no JWT:

- `GET /api/v1/dashboard/stats`
- `GET /api/v1/dashboard/heatmap`
- `GET /api/v1/dashboard/wards`
- `GET /api/v1/dashboard/status/:reportId`

Without a Mapbox token, the dashboard shows an open-ticket list fallback instead of the map.

## Roles and Permissions

Actual user roles are:

- `citizen`
- `worker`
- `engineer`
- `supervisor`
- `commissioner`
- `admin`

Role ranks in `backend/middleware/auth.js` are `citizen < worker < engineer < supervisor < commissioner/admin`. `admin` is treated as an alias of `commissioner`: both have rank `4`, and permission checks generally allow either role wherever the other is required. `admin` is not a higher superuser role than `commissioner`.

Public registration accepts only `citizen` and `worker`. Staff roles (`engineer`, `supervisor`, `commissioner`, `admin`) are created through protected admin routes by an existing staff user with sufficient rank, so the first staff/admin account must be seeded or inserted outside the public registration flow.

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
| `UPLOAD_STORAGE` | No | Set to `s3` for S3 uploads; otherwise local storage is used unless real S3 credentials are present |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET` | For S3 | S3 upload and cleanup support |
| `FIREBASE_SERVICE_ACCOUNT_KEY` / `FIREBASE_SA_KEY` | For FCM | Firebase service account JSON string |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` / `TWILIO_FROM_NUMBER` | For SMS | Twilio SMS delivery |
| `SENDGRID_API_KEY`, `EMAIL_FROM` | For email | SendGrid email delivery |
| `IMAGE_HASH_DISTANCE` | No | Hamming-distance threshold for image duplicate detection, default `10` |

### Frontends

| App | Variable | Used for |
|---|---|---|
| Admin | `VITE_API_URL` | Backend API base URL |
| Dashboard | `VITE_API_URL` | Backend API base URL |
| Dashboard | `VITE_MAPBOX_TOKEN` / `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox heatmap rendering |
| Mobile | `expo.extra.API_BASE_URL` in `mobile/app.json` | Backend API base URL |

## Main API Surface

All routes below are available under both `/api/v1` and `/api`.

### Auth

- `POST /auth/register` - public registration for `citizen` or `worker`
- `POST /auth/login` - login and return JWT
- `POST /auth/refresh` - refresh an existing JWT
- `POST /auth/device` - update citizen `fcmToken` and/or `deviceId`

### Reports

- `POST /reports` - public or authenticated multipart report submission. Accepts `photo` or up to five `photos`, plus `lat`, `lng`, optional `description`, `address`, `deviceId`, and `fcmToken`.
- `GET /reports/:reportId` - public report status and public event history
- `POST /reports/:id/upvote` - public duplicate/upvote count, where `id` may be a Mongo ticket id or `reportId`

### Tickets

- `GET /tickets` - `worker` and above. Workers are filtered to their assigned tickets; staff can filter by `status`, `ward`, `page`, and `limit`.
- `GET /tickets/overdue` - `supervisor` and above
- `GET /tickets/meta/workers` - `engineer` and above
- `GET /tickets/meta/wards` - `engineer` and above
- `GET /tickets/meta/users` - `supervisor` and above
- `GET /tickets/:id/history` - assigned worker or staff
- `GET /tickets/:id` - `worker` and above
- `PATCH /tickets/:id/assign` - `engineer` and above; body `{ "workerId": "..." }`
- `PATCH /tickets/:id/status` - `worker` and above; accepts status `assigned`, `in_progress`, or `resolved`, and optional multipart `afterPhoto`

### Admin and Stats

- `GET /stats/summary`, `GET /stats/by-ward`, `GET /stats/heatmap` - `admin`/`commissioner` equivalent access through role-rank checks
- `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/:id` - staff management for `supervisor` and above, bounded by role rank
- `GET /admin/wards`, `POST /admin/wards`, `PATCH /admin/wards/:id`, `PATCH /admin/wards/:id/engineer`, `PATCH /admin/wards/:id/sla` - ward and SLA management

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
  address: String,
  photos: {
    before: [String],             // upload keys, not guaranteed public URLs
    after: [String]
  },
  imageHashes: {
    before: [String],             // perceptual hashes when image bytes are readable
    after: [String]
  },
  description: String,
  status: 'open' | 'assigned' | 'in_progress' | 'resolved',
  assignedTo: ObjectId,           // User reference
  reportedBy: ObjectId,           // User reference when authenticated
  duplicateOf: ObjectId,          // currently modeled, not actively populated by report flow
  upvotes: Number,
  slaDeadline: Date,
  escalationLevel: Number,        // 0..3
  resolvedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

Before photos are written during report submission. After photos are written when a worker/staff member updates a ticket status with `afterPhoto`. Image hashes are used for duplicate detection when the upload is local or otherwise readable by the Node process; S3-only metadata is skipped for hashing.

## Notification Queue Behavior

`dispatchNotification` uses `backend/services/notificationQueue.js`.

- When `ENABLE_NOTIFICATION_QUEUE` is not `true`, Redis is missing, or the user has no deliverable channel for the requested notification, delivery is attempted synchronously through `notify`.
- When queueing is enabled and Redis is configured, notifications are added to BullMQ queue `notifications` as job `send-notification`.
- Queue jobs default to `3` attempts with exponential backoff starting at `5000ms`, remove completed jobs, and keep failed jobs.
- If enqueueing fails, the backend logs the error and falls back to synchronous delivery.
- The API process starts a notification worker outside `NODE_ENV=test`. A standalone worker can also be started with `node workers/notificationWorker.js`.
- Delivery is best effort. FCM requires a Firebase service account and user `fcmToken`; SMS requires Twilio credentials and user `phone`; email requires SendGrid credentials and user `email`.

## Implemented Behavior Notes

- Duplicate detection first checks for an unresolved ticket within 50 meters, then checks image hashes within 100 meters when a hash can be computed.
- Report IDs come from the Mongo `Counter` model and use the `RPT-00001` format.
- Ward assignment uses geospatial lookup against `Ward.boundary`.
- SLA deadlines use the matched ward's `slaHours` or default to `168` hours.
- A daily cron inside the backend runs escalation at `06:00` server time and increments overdue unresolved tickets up to level `3`.
- Mobile offline queue stores failed report submissions and worker resolution updates in AsyncStorage, retries on reconnect, and marks items failed after three retries while keeping them on the device.

## Known Limitations

- There is no public first-admin bootstrap endpoint; create the first staff account through seed data, direct database insertion, or a trusted internal script.
- Redis-backed report rate limiting is skipped if Redis is not configured or errors. The global Express rate limiter still runs in-process.
- Ticket status updates require a worker-or-higher role but do not currently verify that a worker is assigned to that specific ticket.
- S3 upload keys are stored on tickets, but public/mobile UI surfaces mostly show photo presence rather than rendering signed image URLs.
- Image duplicate detection is unavailable for S3-only uploads unless bytes are available to the backend process; GPS duplicate detection still runs.
- Admin Settings is mostly read-only in the Vite UI even though backend staff and ward mutation routes exist.
- Automated tests exist for the backend only. Admin, dashboard, and mobile currently rely on builds and manual QA.
- The root package is not configured as an npm workspace and its `npm test` script is a placeholder that exits with failure.

## Manual QA Checklist

- Backend: start MongoDB, run `npm run dev`, confirm `GET /api/v1/dashboard/stats` returns JSON.
- Public report flow: submit a report from the mobile app with a photo and location; confirm an `RPT-` id is returned and `Track` can load it.
- Duplicate/upvote flow: submit or upvote the same nearby report and confirm the existing report's `upvotes` increases.
- Staff auth: sign in as an engineer/supervisor/commissioner/admin in the admin console and confirm Queue, Escalations, Analytics, and Settings load from the API.
- Assignment flow: from admin Queue/Assign, assign an open ticket to a worker and confirm it appears in the worker mobile ticket list.
- Resolution flow: from the worker mobile app, add an after photo, mark the ticket resolved, and confirm public tracking shows `resolved`.
- Dashboard: run the dashboard, confirm stats and ward table load, verify the Mapbox heatmap when a token is configured or the list fallback when it is not.
- Offline queue: disable network during mobile report or resolution submission, confirm the item is queued, restore network, and confirm retry clears or updates the queue state.
