from datetime import datetime, timezone

from . import db, providers, risk


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def nearby_reports(lat, lon, km=1.0):
    rows = db.q("SELECT id,lat,lon,status FROM flood_reports WHERE status IN ('Unverified','Under Review','Verified')"
                " AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?", (lat - 0.02, lat + 0.02, lon - 0.02, lon + 0.02))
    return [r for r in rows if risk.haversine_km(lat, lon, r["lat"], r["lon"]) <= km]


def active_officials(lat, lon):
    rows = db.q("SELECT * FROM alerts WHERE kind='official' AND expires_at > ?", (now_iso(),))
    return [r for r in rows if r["lat"] is None or r["radius_km"] is None
            or risk.haversine_km(lat, lon, r["lat"], r["lon"]) <= r["radius_km"]]


async def risk_for(lat, lon, susceptible=False, with_discharge=False):
    try:
        fc = await providers.get_forecast(lat, lon)
    except providers.ProviderError:
        fc = None
    discharge = None
    if fc and with_discharge:
        try:
            discharge = await providers.get_discharge(lat, lon)
        except providers.ProviderError:
            pass
    return risk.assess(fc, susceptible, nearby_reports(lat, lon), active_officials(lat, lon), discharge)
