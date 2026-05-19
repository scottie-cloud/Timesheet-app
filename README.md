# Millewa Pumping — Weekly Timesheet

A mobile-first React app for staff to submit weekly timesheets, with an admin view for aggregated weekly summaries.

## Quick start

```bash
npm install
npm run dev
```

The app opens at http://localhost:5173.

## Building for production

```bash
npm run build
npm run preview   # smoke-test the production build locally
```

The built site lives in `dist/`. It's a static site — drop it on Vercel, Netlify, Cloudflare Pages, S3, or any static host.

## How data is stored

All timesheets and staff list changes are persisted to the browser's `localStorage` under the prefix `mt:`. This means:

- Data is **per-browser, per-device**. Two staff on two different phones do *not* see each other's data.
- The "admin summary" only shows timesheets submitted on the **same browser** the admin is using.

This is fine for local testing or a single-shared-tablet workflow. If you need true multi-user shared data (so admin sees everyone's submissions from anywhere), replace `src/lib/storage.js` with a small backend client. Supabase or Firebase are the easiest options — both have free tiers and the storage API in `storage.js` is small enough that swapping it is a one-file change.

## Configuration

Edit `src/App.jsx` near the top:

```js
const COMPANY    = "Millewa Pumping";
const ADMIN_PIN  = "2025";          // change to whatever you want
const DEFAULT_STAFF = [ ... ];      // edit the default staff list
```

The admin can also add/remove staff from the in-app **Manage Staff** screen; those changes persist to localStorage.

## Logging in

- **Staff**: pick your name from the list on the login screen.
- **Admin**: tap "Admin Login" at the bottom and enter the PIN (default `2025`).

## PDF export

PDF export uses `jspdf` + `html2canvas`. When you tap "Export PDF" on a timesheet or weekly summary, the printable view is rendered off-screen, captured as a high-DPI image, and saved to a real PDF file that downloads automatically. No print dialog, no "save as PDF" step.

Filenames:
- Individual timesheets → `Timesheet_<Employee_Name>_<YYYY-MM-DD>.pdf`
- Admin weekly summaries → `Millewa_WeeklySummary_<YYYY-MM-DD>.pdf`

If you'd rather skip the heavy `html2canvas` + `jspdf` bundle (they add ~700 KB to the build), you can revert to the simpler `window.print()` flow — see the Git history of `src/App.jsx`.

## Project structure

```
.
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx        — entry point; installs storage shim then mounts <App>
    ├── App.jsx         — full app (login, staff view, admin view, PDF view)
    └── lib/
        └── storage.js  — localStorage adapter exposing window.storage.*
```

The full app currently lives in a single `App.jsx` (~780 lines). If you want it split into one-component-per-file, see `claude_code_instructions.md` Path B for the suggested layout.
