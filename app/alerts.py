"""Alert engine: evaluates provider forecasts for monitored locations and creates calculated alerts.
Deduplication: UNIQUE dedupe_key. Cooldown: no new alert of the same kind/location within 3 h unless
severity escalates. Expiry: alerts carry expires_at and are filtered by time, never deleted."""
import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from . import db, providers, risk, service

log = logging.getLogger("floodwatch.alerts")
RANK = {"low": 0, "moderate": 1, "high": 2, "severe": 3}
COOLDOWN_H = 3
RAIN = {  # category -> (title, severity, precaution)
    "Light": ("Rain expected soon", "low", "Bring rain protection if heading out."),
    "Moderate": ("Moderate rain expected", "low", "Allow extra travel time; watch for ponding."),
    "Heavy": ("Heavy rainfall forecast", "moderate", "Avoid low-lying roads; monitor official advisories."),
    "Intense": ("Intense rainfall forecast", "high", "Avoid flood-prone roads; prepare to move to higher ground."),
    "Torrential": ("Torrential rainfall forecast", "severe", "Avoid travel if possible; follow LGU/NDRRMC instructions."),
}
SOURCE = "FloodWatch calculation from Open-Meteo forecast (not an official warning)"


def _add(kind, loc, title, sev, start, end, prob, rec):
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=COOLDOWN_H)).isoformat()
    recent = db.q("SELECT severity FROM alerts WHERE location_key=? AND dedupe_key LIKE ? AND issued_at>? AND expires_at>?",
                  (loc, f"{kind}:{loc}:%", cutoff, now.isoformat()))
    if any(RANK[r["severity"]] >= RANK[sev] for r in recent):
        return 0
    expires = end or (datetime.fromisoformat(start) + timedelta(hours=3)).isoformat()
    if expires <= now.isoformat():
        return 0
    aid, n = db.run("""INSERT OR IGNORE INTO alerts(kind,title,area,location_key,severity,starts_at,ends_at,probability,
        source,issued_at,expires_at,recommendation,dedupe_key,created_at) VALUES('calculated',?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (title, loc, loc, sev, start, end, prob, SOURCE, now.isoformat(), expires, rec,
                     f"{kind}:{loc}:{title}:{start[:13]}", now.isoformat()))
    if n:
        db.run("INSERT INTO alert_deliveries(alert_id,channel,delivered_at) VALUES(?,?,?)", (aid, "in_app", now.isoformat()))
    return n


async def evaluate_location(name, lat, lon):
    try:
        fc = await providers.get_forecast(lat, lon)
    except providers.ProviderError as e:
        log.warning("skip %s: %s", name, e)
        return 0
    i, hs, made = fc["now_index"], fc["hourly"], 0
    cur = fc["current"]
    db.run("INSERT INTO weather_observations(location_key,observed_at,temp_c,precip_mm,wind_kmh,source,fetched_at) VALUES(?,?,?,?,?,?,?)",
           (name, fc["model_time"], cur["temp"], cur["precip"], cur["wind"], fc["source"], fc["fetched_at"]))
    db.run("INSERT INTO weather_forecasts(location_key,fetched_at,payload) VALUES(?,?,?)",
           (name, fc["fetched_at"], json.dumps([{"t": h["time"], "p": h["precip"], "pr": h["prob"]} for h in hs[i:i + 25]])))
    win = risk.rain_window(fc)
    nxt = hs[i: i + 7]
    peak = max((h["precip"] or 0 for h in nxt), default=0)
    cat = risk.intensity_category(peak)
    wet = [h for h in nxt if (h["precip"] or 0) >= 0.1]
    if win["rain_expected"] and cat in RAIN and wet:
        prob = max((h["prob"] for h in wet if h["prob"] is not None), default=None)
        if cat != "Light" or (prob is not None and prob >= 60):
            t, sev, rec = RAIN[cat]
            made += _add("rain", name, t, sev, win["start"], win["end"], prob, rec)
    if any(h["code"] in (95, 96, 99) for h in nxt):
        t0 = next(h for h in nxt if h["code"] in (95, 96, 99))["time"]
        made += _add("storm", name, "Thunderstorm forecast", "moderate", t0, None, None,
                     "Stay indoors during lightning; avoid open areas and flooded roads.")
    r = await service.risk_for(lat, lon, False)
    if r["level"] in ("High", "Severe"):
        made += _add("flood", name, f"{r['level']} flood-risk estimate", r["level"].lower(), fc["model_time"], None, None,
                     "Avoid flood-prone roads and follow official advisories. This is an estimate, not an official warning.")
    return made


async def run_cycle():
    total = 0
    for loc in db.q("SELECT name,lat,lon FROM monitored_locations"):
        try:
            total += await evaluate_location(loc["name"], loc["lat"], loc["lon"])
        except Exception:
            log.exception("evaluation failed for %s", loc["name"])
    log.info("alert cycle done, %d new alerts", total)


async def scheduler():
    interval = max(5, int(os.getenv("ALERT_INTERVAL_MIN", "15"))) * 60
    while True:
        await run_cycle()
        await asyncio.sleep(interval)
