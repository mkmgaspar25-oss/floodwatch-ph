"""External data providers. Open-Meteo (forecast, geocoding, modelled river discharge),
RainViewer (radar tiles), OSRM demo server (routing). Verify each provider's current terms,
rate limits and attribution before production use (see README)."""
import asyncio
import os
import time
from datetime import datetime, timedelta, timezone

import httpx

PH = timezone(timedelta(hours=8))
_cache, _locks = {}, {}


class ProviderError(Exception):
    pass


async def cached_get(url, params, ttl):
    key = (url, tuple(sorted((k, str(v)) for k, v in params.items())))
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:                      # request de-duplication
        hit, now = _cache.get(key), time.time()
        if hit and now - hit[0] < ttl:
            return hit[1], hit[0], False
        try:
            async with httpx.AsyncClient(timeout=12, headers={"User-Agent": "FloodWatchPH/1.0"}) as c:
                r = await c.get(url, params=params)
                r.raise_for_status()
                data = r.json()
            _cache[key] = (now, data)
            return data, now, False
        except Exception as e:
            if hit:                       # serve stale, flagged
                return hit[1], hit[0], True
            raise ProviderError(f"{type(e).__name__}: {e}")


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


async def get_forecast(lat, lon):
    ttl = int(os.getenv("FORECAST_TTL_SEC", "600"))
    raw, ts, stale = await cached_get("https://api.open-meteo.com/v1/forecast", {
        "latitude": round(lat, 2), "longitude": round(lon, 2), "timezone": "Asia/Manila",
        "past_days": 1, "forecast_days": 7, "wind_speed_unit": "kmh",
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,"
                   "wind_speed_10m,wind_direction_10m",
        "hourly": "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,visibility",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
                 "precipitation_probability_max,wind_speed_10m_max"}, ttl)
    return normalize(raw, ts, stale)


def normalize(raw, ts, stale):
    h, cur = raw["hourly"], raw["current"]
    idx = next((i for i, t in enumerate(h["time"]) if t[:13] == cur["time"][:13]), None)
    if idx is None:
        raise ProviderError("Provider returned no hourly slot for the current time")
    hourly = [{"time": t + ":00+08:00", "temp": h["temperature_2m"][i], "prob": h["precipitation_probability"][i],
               "precip": h["precipitation"][i], "code": h["weather_code"][i], "wind": h["wind_speed_10m"][i],
               "visibility": h["visibility"][i], "forecast": i > idx} for i, t in enumerate(h["time"])]
    d = raw["daily"]
    daily = [{"date": t, "code": d["weather_code"][i], "tmax": d["temperature_2m_max"][i],
              "tmin": d["temperature_2m_min"][i], "precip_sum": d["precipitation_sum"][i],
              "prob_max": d["precipitation_probability_max"][i], "wind_max": d["wind_speed_10m_max"][i]}
             for i, t in enumerate(d["time"])]
    now_h = hourly[idx]
    return {"source": "Open-Meteo (model-based; not a gauge or station observation)",
            "fetched_at": iso(ts), "stale": stale, "now_index": idx, "model_time": cur["time"] + ":00+08:00",
            "current": {"temp": cur["temperature_2m"], "feels": cur["apparent_temperature"],
                        "humidity": cur["relative_humidity_2m"], "precip": cur["precipitation"],
                        "code": cur["weather_code"], "wind": cur["wind_speed_10m"],
                        "wind_dir": cur["wind_direction_10m"], "prob": now_h["prob"],
                        "visibility": now_h["visibility"]},
            "hourly": hourly, "daily": daily,
            "notes": "Hours marked forecast=false are model analysis, not rain-gauge observations."}


async def get_discharge(lat, lon):
    raw, ts, stale = await cached_get("https://flood-api.open-meteo.com/v1/flood", {
        "latitude": round(lat, 2), "longitude": round(lon, 2), "past_days": 7, "forecast_days": 7,
        "daily": "river_discharge,river_discharge_mean,river_discharge_max"}, 3600)
    d, today = raw["daily"], datetime.now(PH).strftime("%Y-%m-%d")
    i = d["time"].index(today) if today in d["time"] else None
    if i is None or d["river_discharge"][i] is None:
        return None
    return {"today": d["river_discharge"][i], "mean": d["river_discharge_mean"][i],
            "series": {"time": d["time"], "discharge": d["river_discharge"]},
            "note": "Modelled GloFAS grid-cell discharge (~5 km); not a river gauge reading."}


async def get_history(lat, lon, days):
    raw, ts, stale = await cached_get("https://api.open-meteo.com/v1/forecast", {
        "latitude": round(lat, 2), "longitude": round(lon, 2), "timezone": "Asia/Manila",
        "past_days": days, "forecast_days": 1, "daily": "precipitation_sum"}, 3600)
    d = raw["daily"]
    return {"time": d["time"], "precip_sum": d["precipitation_sum"], "fetched_at": iso(ts), "stale": stale,
            "source": "Open-Meteo model reanalysis (estimated; may differ from gauge data)"}


async def geocode(q):
    raw, _, _ = await cached_get("https://geocoding-api.open-meteo.com/v1/search",
                                 {"name": q, "count": 8, "language": "en", "country_code": "PH"}, 86400)
    return [{"name": r["name"], "region": r.get("admin1"), "lat": r["latitude"], "lon": r["longitude"]}
            for r in raw.get("results", [])]


async def get_radar():
    raw, ts, stale = await cached_get("https://api.rainviewer.com/public/weather-maps.json", {}, 300)
    past = raw.get("radar", {}).get("past", [])
    if not past:
        raise ProviderError("Radar frames unavailable")
    last = past[-1]
    return {"tile_url": f"{raw['host']}{last['path']}/256/{{z}}/{{x}}/{{y}}/2/1_1.png",
            "frame_time": iso(last["time"]), "fetched_at": iso(ts), "stale": stale,
            "attribution": "Radar © RainViewer"}


async def get_routes(o, d):
    url = f"https://router.project-osrm.org/route/v1/driving/{o[1]},{o[0]};{d[1]},{d[0]}"
    raw, _, _ = await cached_get(url, {"alternatives": "true", "overview": "full", "geometries": "geojson"}, 300)
    if raw.get("code") != "Ok":
        raise ProviderError(f"Routing failed: {raw.get('code')}")
    return raw["routes"]
