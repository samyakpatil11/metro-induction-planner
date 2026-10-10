# Metro Induction Planner

Every night, a metro depot has to decide which trains **run passenger service**, which go for
**maintenance**, and which stay on **standby**. This app makes that decision for you, explains it in
plain words, and lets a depot officer approve it before anything is final.

Built for Nagpur Metro (23 trains, 2 lines, 2 depots).

---

## Start it (one command)

**Windows:** double-click **`start.bat`**
**Mac / Linux:** run `./start.sh`

The first start installs what it needs (about a minute) and opens **http://localhost:8000**.
You need Python 3.10 or newer. You do **not** need Node.js.

| Log in as | Username | Password | Can do |
|---|---|---|---|
| Depot Officer (local demo only) | `officer` | `officer123` | Everything, including approving plans |
| Viewer (local demo only) | `viewer` | `viewer123` | Look only |

These sample accounts are created only in development. The hosted deployment removes these names,
requires a private administrator credential, and does not show the quick-fill buttons.

Start over with fresh demo data: `start.bat --reset` (or `./start.sh --reset`).
Check everything works: `cd backend`, activate the environment, then `python check.py`.

---

## How to use it (3 steps)

1. **Overview**: read the alerts (expired certificates, serious faults, overhauls due).
2. **Tonight's Plan**: read which train does what and why. Click **Approve**, or **Reject** with a reason.
   Not happy? Pick a different priority and **Create new plan**, or use **Try a change (what-if)**
   to see the effect of moving one train before you commit.
3. **Download PDF report** for the night shift.

The **Trains** tab lists every train. Click one to see its faults and *why* its breakdown risk is high or low.
Officers can report a new fault or mark one as fixed there; the risk updates straight away.

---

## How the planner decides

1. **Safety rules (never broken).** A train with an expired fitness certificate, a serious open fault,
   or 25,000 km since its last overhaul can never carry passengers.
2. **Demand.** 8 trains on Line 1 and 8 on Line 2. Spare trains fill any gaps.
3. **Preferences.** Choose low-risk and low-wear trains, keep advertising-wrapped trains running, avoid
   trains due for cleaning or parked behind another train.

The **risk** number is the chance of a fault in the next 7 days, predicted by a small machine-learning
model (logistic regression) trained on each train's daily history. The **plan** is found by Google OR-Tools
(a solver that finds the best answer that obeys every rule).

If a new serious fault appears *after* a plan is approved, an alert warns you and the plan can't be re-approved
until a fresh one is made.

---

## What's inside

```
start.bat / start.sh          <- start everything
backend/
  run.py                      <- the launcher
  check.py                    <- self-test
  app/
    config.py                 <- ALL numbers and rules (fleet size, limits, priorities)  <- start here
    optimizer.py              <- the planner (safety rules + preferences)
    risk.py                   <- risk prediction and its explanation
    alerts.py                 <- what needs attention
    main.py                   <- the web API (about 20 short routes)
    db.py, auth.py            <- database tables, login
    report.py                 <- the PDF
    seed.py                   <- creates the demo data on first run
    static/                   <- the ready-built website
frontend/src/                 <- the website's source (React + Tailwind)
```

**Want to change a rule?** Open `backend/app/config.py`. For example, change `OVERHAUL_KM`, `SERVICE_NEEDED`,
or add a priority under `STRATEGIES`. Restart and it applies everywhere.

**Want to use real data?** The demo data comes from `seed.py`. Replace it with your own trains, fault reports and
daily logs (same table layout as in `db.py`) and the rest works unchanged.

**Want to change the website?** Install Node.js, then in `frontend/` run `npm install`, and `npm run dev`
(live preview on port 5173, with the backend running). `npm run build` updates the site in `backend/app/static`.

## Deployment with Firebase

You can host the React frontend on **Firebase Hosting** and run the FastAPI backend on **Google Cloud Run** (with Firebase Hosting rewrites to route `/api/**` to Cloud Run):

1. **Frontend on Firebase Hosting**:
   - Install Firebase CLI: `npm install -g firebase-tools`
   - Run `firebase login` and `firebase init hosting`
   - Set public directory to `frontend/dist` (or `backend/app/static`)
   - Build frontend: `cd frontend && npm run build`
   - Deploy: `firebase deploy --only hosting`

2. **Full-stack with Cloud Run**:
   - Containerize or deploy the FastAPI backend to Cloud Run.
   - Configure Firebase Hosting rewrites in `firebase.json` to proxy `/api/**` to Cloud Run.

---

## Current scope

The interface has three main tabs: **Overview**, **Tonight's Plan**, and **Trains**. The backend includes
the safety-constrained optimizer, fault/risk scoring, plan approvals, and PDF reporting. Local development
uses a synthetic fleet and demo accounts. Hosted demo deployments use synthetic data with an on-screen
warning, but never create the built-in demo accounts. The Python dependencies, including the PostgreSQL
driver for hosted use, are listed in `backend/requirements.txt`.
