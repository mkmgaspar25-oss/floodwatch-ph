# FloodWatch PH — Real-Time Weather and Flood Monitoring (Python)

FastAPI backend + SQLite (prototype) + Leaflet/Chart.js dashboard served by FastAPI.
It is an informational decision-support tool and does **not** replace PAGASA / NDRRMC / LGU instructions.

## Structure
```
app/main.py       REST API, uploads, admin endpoints, rate limits
app/providers.py  Open-Meteo (forecast, geocoding, modelled river discharge), RainViewer radar, OSRM routing, TTL cache + request de-dup + stale fallback
app/risk.py       Flood-risk engine, rain window, route hazard check (no third-party deps; unit tested)
app/alerts.py     Background alert engine: dedupe key, 3 h cooldown, expiry, in-app delivery log
app/service.py    Shared helpers (risk_for, nearby reports, active official advisories)
app/db.py, seed.py  Schema (9 tables, indexes) + starter data
static/           index.html, app.js, style.css (dashboard)
tests/            pytest suite
```

## Setup
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # set ADMIN_TOKEN and IP_HASH_SALT
uvicorn app.main:app --reload                           # open http://127.0.0.1:8000
pytest                                                  # run tests
```
Interactive API docs: `/docs`. Database: SQLite file `floodwatch.db` is created on first start.

## Environment variables
`ADMIN_TOKEN` (required for admin endpoints; they return 503 if unset), `DATABASE_PATH`, `ALERT_INTERVAL_MIN` (default 15),
`FORECAST_TTL_SEC` (600), `REPORT_LIMIT_PER_HOUR` (5), `IP_HASH_SALT`. No third-party API keys are needed for the default providers.

## Admin actions
```bash
# review a report
curl -X PATCH localhost:8000/api/admin/reports/1 -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"status":"Verified"}'
# enter an official advisory (copy from the official bulletin; url is mandatory)
curl -X POST localhost:8000/api/admin/advisories -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{
 "title":"Heavy Rainfall Warning (Orange)","area":"Metro Manila","severity":"high","source":"PAGASA","url":"https://www.pagasa.dost.gov.ph/",
 "issued_at":"2026-10-17T08:00:00+08:00","expires_at":"2026-10-17T14:00:00+08:00","lat":14.6,"lon":121.0,"radius_km":30}'
```
The dashboard also shows review buttons when you paste the admin token in Settings (kept in sessionStorage only).

## Data sources — verify before production
| Need | Provider | Notes |
|---|---|---|
| Weather, forecast, rain probability, geocoding, modelled river discharge | Open-Meteo | Free tier is for non-commercial use with rate limits; attribution (CC BY 4.0) required. **Past "observations" are model data, not gauge readings** and are labelled as such. |
| Radar tiles | RainViewer | Check current free-tier limits/terms; the layer fails gracefully if unavailable. |
| Routing | OSRM public demo server | Demo only, no live traffic, no SLA. Self-host OSRM or use a commercial router for production. |
| Official warnings | PAGASA | No stable public API is assumed. Admins enter advisories with a source link. Never fabricated. |
| River/water-level gauges, evacuation centers, road closures | — | **Not connected** (need an official feed/dataset, e.g. from PAGASA-HYDROMET, MMDA, LGUs). Toggles are disabled; verified "not passable" reports populate the closures layer. |

## Limitations / honest notes
- **Flood-prone area list is an unverified starter set** (approximate coordinates, no frequency or last-event claimed). Replace/verify it with official records and set `verification`/`verified_on`.
- Risk levels are heuristic estimates (PAGASA intensity bands + accumulation heuristics), not hydrological modelling; thresholds live in `app/risk.py` and should be reviewed by a domain expert.
- Alerts only run for locations in `monitored_locations` (6 Metro Manila cities by default); other searched places get live weather/risk on demand but no background alerts.
- Notifications: in-app + browser notifications while the page is open. No service-worker push, email or SMS.
- SQLite is for prototyping; for production move to PostgreSQL/PostGIS (schema maps directly; replace the bounding-box queries with `ST_DWithin`). No migrations tool is included (add Alembic when you move to Postgres).
- Rate limiting is in-memory (single process). Use a shared store (e.g. Redis) behind multiple workers. Behind a proxy, ensure `X-Forwarded-For` is set by a trusted proxy.
- Uploaded photos are stored on local disk after type/size checks; add malware scanning and object storage for production.
- Not built: user accounts, route "safe" labelling (intentionally never claimed), historical gauge analytics.

## Deploy online (no command prompt)
See `render.yaml`. Upload this folder (without `.env`, `venv`, `.venv`) to a GitHub repo, then on render.com choose
New + → Blueprint → pick the repo → Apply. Free-tier caveats: the service sleeps after ~15 min idle (first load ~1 min),
and its filesystem is wiped on restart/redeploy, so submitted reports, photos and stored alerts reset.
For persistence use a paid instance with a disk, or move the database to PostgreSQL.
