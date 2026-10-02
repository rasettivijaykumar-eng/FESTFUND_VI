# FestFund

FestFund is a festival operating system: create a celebration, keep its money and events in the open, and let visitors open one Fest ID at a time. Local vendors can publish advertisements for free.

**Celebrate Together • Manage Transparently • Connect Locally**

The official logo in `client/src/assets/festfund-logo.png` is the supplied artwork. It is not redrawn.

## Features

- Admin, committee and vendor accounts, plus visitors who only enter a Fest ID
- Festival isolation: every donor, expense, event, gallery item, note and report is stored against one Fest ID
- Manual contribution records, expenses with optional bills, and PDF receipts
- Events with a month calendar
- A separate community chat for each Fest ID, with text, image, video, and voice messages; admins and approved committee members use their accounts, while public participants appear as unverified guests
- Photo and video gallery with original-file download
- Committee join requests that stay locked until an admin approves them
- Nearby vendors within 20 km, and a list fallback when Google Maps is not configured
- Free vendor advertisements and a landing-page carousel
- PDF, CSV and Excel reports
- Analytics charts from recorded contributions and expenses. Forecast numbers appear only when `FORECAST_API_URL` is set
- Dark dashboards, reduced-motion preference, and responsive layouts

FestFund does not take online donations, donor registrations, donor logins, or paid vendor plans.

Community chat is public to anyone who knows the festival's Fest ID. Guest display names are unverified; do not post private donor or account information there. Messages and attachments are stored against that festival only.

## Screenshots

Capture these after the app is running:

1. Landing page with the FestFund logo
2. Admin dashboard
3. Public festival page for `FEST-WGL-2026-001`
4. Donor ledger and receipt
5. Vendor advertisement carousel

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind CSS, Framer Motion, GSAP, Lucide, Recharts, React Router, Axios, React Hook Form, Zod, TanStack Query |
| Backend | Node.js, Express, TypeScript, Mongoose, JWT, bcrypt, Multer, Cloudinary, PDFKit, ExcelJS |
| Data | MongoDB Atlas in production, in-memory MongoDB when `MONGODB_URI` is empty locally |
| Hosting | Vercel (client), Render or Railway (server), Cloudinary (media) |

## Folder structure

```text
festfund/
├── client/          React application
│   └── src/
│       ├── assets/ components/ pages/ hooks/ context/
├── server/          Express API
│   └── src/
│       ├── config/ controllers/ middleware/ models/ routes/ services/
├── package.json     runs client and server together
└── README.md
```

## Installation

```bash
npm install
npm install --prefix client
npm install --prefix server
```

Or from the repository root after dependencies are installed in each package:

```bash
npm run dev
```

That starts the API on port 5000 and the site on port 5173.

You can also run them separately:

```bash
cd client && npm install && npm run dev
cd server && npm install && npm run dev
```

## Environment variables

Copy the examples and fill in production secrets. Never commit a real `.env`.

Frontend `client/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=
```

Local development uses `client/.env.development` with `VITE_API_URL=/api` so the Vite proxy keeps the login cookie on the same origin.

Backend `server/.env.example`:

```env
PORT=5000
MONGODB_URI=
JWT_SECRET=
JWT_EXPIRES=7d
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GOOGLE_MAPS_API_KEY=
CLIENT_URL=http://localhost:5173
GEMINI_API_KEY=
FORECAST_API_URL=
SEED_DEMO=false
```

If `MONGODB_URI` is empty outside production, the API starts an empty in-memory database. Nothing is inserted for you. Production refuses to boot without `MONGODB_URI` and `JWT_SECRET`.

## MongoDB Atlas

1. Create a cluster and a database user.
2. Allow the host running the API (Render/Railway) in Network Access.
3. Set `MONGODB_URI` to the SRV connection string.

## Cloudinary

1. Create a Cloudinary account and copy the cloud name, API key and API secret into the server environment.
2. Uploaded photos, videos and bills are stored without extra transformations so a download can return the original file.
3. If those variables are empty, files are saved under `server/uploads` and served from `/uploads`.

## Google Maps

Set `GOOGLE_MAPS_API_KEY` on the server and `VITE_GOOGLE_MAPS_API_KEY` on the client. Nearby distance still works from latitude and longitude when the key is absent. The vendor page explains that a map pin is unavailable until the key is set.

## Build

```bash
npm run build
```

Client output is `client/dist`. Server output is `server/dist`.

## Deployment

The repository includes a Render Blueprint in `render.yaml` for deploying both the frontend and API. In Render, create a new Blueprint from the repository and provide `MONGODB_URI` when prompted. The Blueprint generates `JWT_SECRET` and configures the client/API URLs for the default service domains:

- Frontend: `https://festfund-web.onrender.com`
- API: `https://festfund-api.onrender.com`

If Render assigns different service domains, update `CLIENT_URL` on `festfund-api` and `VITE_API_URL` on `festfund-web` to match. `VITE_API_URL` must include `/api`; frontend environment variables are applied at build time, so redeploy the static site after changing it.

Use MongoDB Atlas for persistent application data and configure its Network Access to allow connections from Render. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` on `festfund-api` for durable uploaded images, videos, and bills. Render's local filesystem is ephemeral, so uploads stored locally are not persistent across deployments. In production the auth cookie uses `SameSite=None` and `Secure` so the browser can send it cross-site.

## API overview

All JSON responses use `{ success, data, message?, meta? }`.

| Area | Routes |
| --- | --- |
| Auth | `POST /api/auth/register/admin`, `/register/committee`, `/register/vendor`, `/login`, `/logout`, `GET /api/auth/me` |
| Festivals | `POST /api/festivals`, `GET /api/festivals`, `GET /api/public/festivals/:festId` |
| Donors, expenses, events, notes, gallery | CRUD under `/api/donors`, `/api/expenses`, `/api/events`, `/api/notes`, `/api/gallery` |
| Committee | `GET /api/committee/requests`, `PATCH /api/committee/requests/:id` |
| Vendors and ads | `/api/vendors/me`, `/api/vendors/nearby`, `/api/advertisements` |
| Reports and receipts | `GET /api/reports/:type?format=pdf\|csv\|xlsx`, `POST /api/receipts`, `GET /api/receipts/:id/pdf` |
| Analytics | `GET /api/analytics`, `GET /api/analytics/forecast` |
| Notifications | `GET /api/notifications` |

Forecast calls `FORECAST_API_URL` when it is set. A future service can accept `{ festId, currentContributions, currentExpenses, donorCount }` and return predicted totals. Until that service is connected, FestFund shows only the recorded totals.

## Security notes

- Passwords are hashed with bcrypt. The JWT is an HTTP-only cookie, and the API checks the role from the database on each request.
- Festival routes confirm the admin created that festival, or the committee member was approved for that Fest ID.
- Public festival responses omit donor phone numbers, emails and receipt files. Admin notes are not on the public page.
- Uploads check MIME type and size. Zod validates input. Helmet, CORS and rate limits are enabled.
- Do not put MongoDB, JWT, Cloudinary or Maps secrets in source files.

## Accessibility

Pages use labels, focus outlines, dialog roles and a control to reduce decorative motion. The same preference follows `prefers-reduced-motion`.
