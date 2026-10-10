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

## Deploy a public demo

The project includes a Render Blueprint in `render.yaml`. It deploys the built frontend and FastAPI
backend together, pins Python in `.python-version`, binds to the host-provided `PORT`, and requires
PostgreSQL rather than writing production data to the service filesystem.

1. Push this folder to a GitHub repository and create a Render Blueprint from that repository.
2. Provide `DATABASE_URL` for a PostgreSQL database, plus a unique `METRO_ADMIN_USERNAME` and a
   strong `METRO_ADMIN_PASSWORD` of at least 14 characters when Render prompts for them. The
   Blueprint generates `METRO_SECRET` for you. Do not put these values in this file or commit them.
3. The included Blueprint enables **demo mode**. The app will seed synthetic sample fleet data and
   show a persistent warning that its plans do not represent live trains. The known local demo
   accounts are removed and cannot be used on the hosted service.
4. Keep the database URL, secret, and admin password private. Use a PostgreSQL provider whose plan
   preserves data for the period you need; Render's free web service has an ephemeral filesystem,
   and Render's free Postgres database expires after 30 days. See [Render free service limits](https://render.com/docs/free).

This setup is suitable for a **demonstration with synthetic data**, not for dispatching trains.
Before connecting real fleet records or using this for operations, deploy in a controlled environment,
load and validate the real data, set `METRO_DEMO_MODE=false`, and complete an operational/security
review. If production mode is selected with an empty database, startup intentionally fails rather
than silently inventing fleet data.

---

## Current scope

The interface has three main tabs: **Overview**, **Tonight's Plan**, and **Trains**. The backend includes
the safety-constrained optimizer, fault/risk scoring, plan approvals, and PDF reporting. Local development
uses a synthetic fleet and demo accounts. Hosted demo deployments use synthetic data with an on-screen
warning, but never create the built-in demo accounts. The Python dependencies, including the PostgreSQL
driver for hosted use, are listed in `backend/requirements.txt`.
