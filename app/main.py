from dotenv import load_dotenv
load_dotenv()

import asyncio, hashlib, hmac, os, re, time, uuid, logging  # noqa: E402
from collections import defaultdict, deque  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from typing import Literal, Optional  # noqa: E402

from fastapi import FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from . import alerts, db, providers, risk, seed, service  # noqa: E402

logging.basicConfig(level=logging.INFO)
BASE = os.path.dirname(os.path.dirname(__file__))
UPLOADS = os.path.join(BASE, "uploads")
os.makedirs(UPLOADS, exist_ok=True)
STATUSES = ["Unverified", "Under Review", "Verified", "Resolved", "Rejected"]
PASSABLE = ["Passable", "Passable with caution", "Not passable", "Unknown"]
_hits = defaultdict(deque)


@asynccontextmanager
async def lifespan(app):
    db.init()
    seed.seed_if_empty()
    task = asyncio.create_task(alerts.scheduler())
    yield
    task.cancel()


app = FastAPI(title="FloodWatch PH", version="1.0", lifespan=lifespan)


def rate_limit(key, limit, window=3600):
    q, now = _hits[key], time.time()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, f"Rate limit reached ({limit} per {window // 60} min). Try again later.")
    q.append(now)


def client_hash(request: Request):
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "unknown"))
    return hashlib.sha256((os.getenv("IP_HASH_SALT", "dev") + ip).encode()).hexdigest()[:24]


def require_admin(token: Optional[str], request: Request):
    expected = os.getenv("ADMIN_TOKEN")
    if not expected:
        raise HTTPException(503, "Admin endpoints are disabled: ADMIN_TOKEN is not configured")
    rate_limit("admin:" + client_hash(request), 60, 60)
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(401, "Invalid admin token")


LAT = Query(..., ge=4, le=22)
LON = Query(..., ge=115, le=128)


async def forecast_or_502(lat, lon):
    try:
        return await providers.get_forecast(lat, lon)
    except providers.ProviderError as e:
        raise HTTPException(502, f"Weather provider unavailable and no cached data exists ({e})")


@app.get("/api/health")
def health():
    return {"ok": True, "time": service.now_iso()}


@app.get("/api/geocode")
async def geocode(request: Request, q: str = Query(..., min_length=2, max_length=80)):
    rate_limit("geo:" + client_hash(request), 120, 60)
    try:
        return await providers.geocode(q)
    except providers.ProviderError as e:
        raise HTTPException(502, f"Geocoding unavailable ({e})")


@app.get("/api/monitored")
def monitored():
    return db.q("SELECT name,lat,lon FROM monitored_locations ORDER BY name")


@app.get("/api/weather")
async def weather(lat: float = LAT, lon: float = LON):
    fc = await forecast_or_502(lat, lon)
    return {**fc, "rain_window": risk.rain_window(fc)}


@app.get("/api/radar")
async def radar():
    try:
        return await providers.get_radar()
    except providers.ProviderError as e:
        raise HTTPException(502, f"Radar unavailable ({e})")


@app.get("/api/flood-areas")
async def flood_areas(with_risk: bool = False):
    rows = db.q("SELECT * FROM flood_prone_areas ORDER BY id")
    if with_risk:
        res = await asyncio.gather(*[service.risk_for(r["lat"], r["lon"], True) for r in rows], return_exceptions=True)
        for r, x in zip(rows, res):
            r["risk"] = x if isinstance(x, dict) else {"level": risk.INSUFFICIENT, "factors": [], "missing": ["Assessment failed"]}
    return rows


@app.get("/api/risk")
async def risk_endpoint(lat: float = LAT, lon: float = LON, area_id: Optional[int] = None):
    susceptible = False
    if area_id is not None:
        susceptible = bool(db.q("SELECT 1 FROM flood_prone_areas WHERE id=?", (area_id,)))
    return await service.risk_for(lat, lon, susceptible, with_discharge=True)


@app.get("/api/reports")
def list_reports(status: Optional[str] = None, limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0)):
    sql, p = "SELECT id,lat,lon,description,depth_cm,passable,photo,status,created_at,updated_at FROM flood_reports WHERE status!='Rejected'", []
    if status:
        if status not in STATUSES:
            raise HTTPException(422, "Unknown status")
        sql += " AND status=?"; p.append(status)
    return db.q(sql + " ORDER BY created_at DESC LIMIT ? OFFSET ?", (*p, limit, offset))


def _image_ok(b):
    return b[:3] == b"\xff\xd8\xff" or b[:8] == b"\x89PNG\r\n\x1a\n" or (b[:4] == b"RIFF" and b[8:12] == b"WEBP")


@app.post("/api/reports", status_code=201)
async def submit_report(request: Request, lat: float = Form(..., ge=4, le=22), lon: float = Form(..., ge=115, le=128),
                        description: str = Form(..., min_length=10, max_length=500),
                        depth_cm: Optional[int] = Form(None, ge=0, le=500),
                        passable: str = Form("Unknown"), website: str = Form(""),
                        photo: Optional[UploadFile] = File(None)):
    who = client_hash(request)
    if website:                                   # honeypot field: real users never fill it
        raise HTTPException(400, "Rejected")
    rate_limit("report:" + who, int(os.getenv("REPORT_LIMIT_PER_HOUR", "5")))
    if passable not in PASSABLE:
        raise HTTPException(422, "Invalid passability value")
    desc = re.sub(r"[\x00-\x1f\x7f]", " ", description).strip()
    if len(desc) < 10:
        raise HTTPException(422, "Description too short")
    fname = None
    if photo and photo.filename:
        data = await photo.read(2 * 1024 * 1024 + 1)
        if len(data) > 2 * 1024 * 1024:
            raise HTTPException(413, "Photo must be 2 MB or smaller")
        if not _image_ok(data):
            raise HTTPException(415, "Photo must be a JPEG, PNG or WebP image")
        fname = uuid.uuid4().hex + (".jpg" if data[:3] == b"\xff\xd8\xff" else ".png" if data[:4] == b"\x89PNG" else ".webp")
        with open(os.path.join(UPLOADS, fname), "wb") as f:
            f.write(data)
    now = service.now_iso()
    rid, _ = db.run("INSERT INTO flood_reports(lat,lon,description,depth_cm,passable,photo,status,created_at,updated_at,reporter_hash)"
                    " VALUES(?,?,?,?,?,?,'Unverified',?,?,?)", (lat, lon, desc, depth_cm, passable, fname, now, now, who))
    return {"id": rid, "status": "Unverified", "message": "Report received. It is unverified until reviewed by an administrator."}


class StatusIn(BaseModel):
    status: Literal["Unverified", "Under Review", "Verified", "Resolved", "Rejected"]


@app.patch("/api/admin/reports/{rid}")
def set_status(rid: int, body: StatusIn, request: Request, x_admin_token: Optional[str] = Header(None)):
    require_admin(x_admin_token, request)
    _, n = db.run("UPDATE flood_reports SET status=?, updated_at=? WHERE id=?", (body.status, service.now_iso(), rid))
    if not n:
        raise HTTPException(404, "Report not found")
    return {"id": rid, "status": body.status}


class AdvisoryIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    area: str = Field(min_length=2, max_length=200)
    severity: Literal["low", "moderate", "high", "severe"]
    source: str = Field(min_length=2, max_length=100)      # e.g. "PAGASA"
    url: str = Field(pattern=r"^https?://", max_length=500)  # link to the official bulletin (required)
    issued_at: datetime
    expires_at: datetime
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    lat: Optional[float] = Field(None, ge=4, le=22)
    lon: Optional[float] = Field(None, ge=115, le=128)
    radius_km: Optional[float] = Field(None, gt=0, le=1000)
    recommendation: Optional[str] = Field(None, max_length=500)


@app.post("/api/admin/advisories", status_code=201)
def add_advisory(a: AdvisoryIn, request: Request, x_admin_token: Optional[str] = Header(None)):
    """Official advisories are entered by an administrator copying them from the official bulletin
    (no stable public PAGASA API is assumed). The source URL is mandatory."""
    require_admin(x_admin_token, request)
    iso = lambda d: d.astimezone(timezone.utc).isoformat() if d else None  # noqa: E731
    key = "official:" + hashlib.sha1(f"{a.source}|{a.title}|{a.issued_at.isoformat()}".encode()).hexdigest()
    _, n = db.run("""INSERT OR IGNORE INTO alerts(kind,title,area,location_key,severity,lat,lon,radius_km,starts_at,ends_at,
        source,issued_at,expires_at,recommendation,url,dedupe_key,created_at) VALUES('official',?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (a.title, a.area, a.severity, a.lat, a.lon, a.radius_km, iso(a.starts_at), iso(a.ends_at), a.source,
                  iso(a.issued_at), iso(a.expires_at), a.recommendation, a.url, key, service.now_iso()))
    return {"created": bool(n)}


@app.get("/api/alerts")
def list_alerts(include_expired: bool = True, limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0)):
    now = service.now_iso()
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    rows = db.q("SELECT * FROM alerts WHERE expires_at > ? ORDER BY issued_at DESC LIMIT ? OFFSET ?",
                (since if include_expired else now, limit, offset))
    for r in rows:
        r["active"] = r["expires_at"] > now
    return rows


@app.get("/api/route-risk")
async def route_risk(o_lat: float = LAT, o_lon: float = LON, d_lat: float = Query(..., ge=4, le=22),
                     d_lon: float = Query(..., ge=115, le=128)):
    try:
        routes = await providers.get_routes((o_lat, o_lon), (d_lat, d_lon))
    except providers.ProviderError as e:
        raise HTTPException(502, f"Routing service unavailable ({e})")
    hazards = [{"type": "flood-prone area", "id": a["id"], "name": a["name"], "lat": a["lat"], "lon": a["lon"],
                "basis": "Historical susceptibility (unverified starter data)" if a["verification"] != "Verified" else "Historical susceptibility"}
               for a in db.q("SELECT * FROM flood_prone_areas")]
    hazards += [{"type": "flood report", "id": r["id"], "name": f"Report #{r['id']} ({r['status']})", "lat": r["lat"],
                 "lon": r["lon"], "basis": r["description"][:120], "status": r["status"]}
                for r in db.q("SELECT * FROM flood_reports WHERE status IN ('Verified','Under Review','Unverified')")]
    out = []
    for i, rt in enumerate(routes):
        hits = risk.route_hazards(rt["geometry"]["coordinates"], hazards, 200)
        verified = [h for h in hits if h.get("status") == "Verified"]
        out.append({"index": i, "distance_km": round(rt["distance"] / 1000, 1),
                    "duration_min": round(rt["duration"] / 60), "geometry": rt["geometry"], "hazards": hits,
                    "verified_flood_reports": len(verified),
                    "warning": ("Route passes near a verified flood report." if verified else
                                "Route passes near known/reported flood locations." if hits else
                                "No known flood locations on this route in our data - current road flooding cannot be confirmed.")})
    return {"routes": out, "disclaimer": "Travel times come from a routing service without live traffic. "
            "A route is never confirmed safe: flood data here is incomplete and may be outdated. Follow official advisories."}


@app.get("/api/history")
async def history(lat: float = LAT, lon: float = LON, days: int = Query(14, ge=3, le=60)):
    try:
        rain = await providers.get_history(lat, lon, days)
    except providers.ProviderError as e:
        raise HTTPException(502, f"History unavailable ({e})")
    try:
        dis = await providers.get_discharge(lat, lon)
    except providers.ProviderError:
        dis = None
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    counts = db.q("SELECT substr(issued_at,1,10) d, severity, COUNT(*) n FROM alerts WHERE issued_at>? GROUP BY d, severity", (since,))
    rep = db.q("SELECT substr(created_at,1,10) d, COUNT(*) n FROM flood_reports WHERE created_at>? AND status!='Rejected' GROUP BY d", (since,))
    return {"rain": rain, "discharge": dis, "alerts_by_day": counts, "reports_by_day": rep,
            "gauge_data": "Unavailable: no official water-level gauge feed is configured."}


app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")


@app.get("/")
def index():
    return FileResponse(os.path.join(BASE, "static", "index.html"))


app.mount("/static", StaticFiles(directory=os.path.join(BASE, "static")), name="static")
