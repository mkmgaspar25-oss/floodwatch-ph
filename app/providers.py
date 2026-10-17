"""External data providers. Open-Meteo (forecast, geocoding, modelled river discharge),
RainViewer (radar tiles), OSRM demo server (routing). Verify each provider's current terms,
rate limits and attribution before production use (see README)."""
import asyncio
import re
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
    return [{"name": r["name"], "region": ", ".join(x for x in (r.get("admin2"), r.get("admin1")) if x) or None, "lat": r["latitude"], "lon": r["longitude"]}
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


_nom_lock = asyncio.Lock()
_nom_last = 0.0


async def _nominatim(q):
    global _nom_last
    key = ("https://nominatim.openstreetmap.org/search", (("q", q),))
    if not (key in _cache and time.time() - _cache[key][0] < 86400):
        async with _nom_lock:                       # public-instance policy: max 1 request/second
            wait = 1.1 - (time.time() - _nom_last)
            if wait > 0:
                await asyncio.sleep(wait)
            _nom_last = time.time()
    raw, _, _ = await cached_get("https://nominatim.openstreetmap.org/search",
                                 {"q": q, "format": "jsonv2", "countrycodes": "ph", "limit": 6, "addressdetails": 1}, 86400)
    return raw


def _brgy(addr):
    """Best-effort barangay/area label from Nominatim address details (OSM tagging of barangays varies)."""
    if not addr:
        return None
    for k, v in addr.items():
        if k in ("postcode", "house_number", "country_code") or not isinstance(v, str):
            continue
        if re.search(r"\b(barangay|brgy)\b", v, re.I) or re.fullmatch(r"\d{1,3}", v.strip()):
            return v if re.search(r"[A-Za-z]", v) else f"Barangay {v}"
    for k in ("neighbourhood", "suburb", "quarter", "city_district"):
        if addr.get(k):
            return addr[k]
    return None


def _hits(raw, note=None):
    out = []
    for r in raw:
        exact = r.get("addresstype") in ("house", "building", "place") or r.get("category") in ("building", "amenity", "shop", "office")
        out.append({"name": r["display_name"], "region": None, "lat": float(r["lat"]), "lon": float(r["lon"]),
                    "note": note or ("exact building/address" if exact else "approximate: street or area level"),
                    "brgy": _brgy(r.get("address"))})
    return out


_ABBR = [(r"\bSt\.?(?=[\s,]|$)", "Street"), (r"\bAve\.?(?=[\s,]|$)", "Avenue"), (r"\bBlvd\.?(?=[\s,]|$)", "Boulevard"),
         (r"\bRd\.?(?=[\s,]|$)", "Road"), (r"\bSta\.?(?=\s)", "Santa"), (r"\bSto\.?(?=\s)", "Santo")]


def expand_abbr(q):
    for pat, full in _ABBR:
        q = re.sub(pat, full, q)
    return q


def clean_ph_address(q):
    """Philippine address cleanup: pulls out 'Barangay 828' / 'Brgy. 828', drops the 4-digit ZIP after the city and
    'Philippines'. Returns (cleaned_query, barangay_or_None)."""
    brgy = None
    m = re.search(r"\b(?:barangay|brgy|bgy|brg)\.?\s*#?\s*(\w+)", q, re.I)
    if m:
        brgy = m.group(1)
        q = q[:m.start()] + " " + q[m.end():]
    q = re.sub(r"\bPhilippines\b", "", q, flags=re.I)
    q = " ".join(q.replace(" ,", ",").split()).strip(" ,")
    q = re.sub(r"(?<=[A-Za-z.])\s+\d{4}(?=\s*(?:,|$))", "", q)
    q = re.sub(r"\s*,(\s*,)+", ",", q).strip(" ,")
    return q, brgy


async def geocode_address(q):
    """Street/landmark/barangay search on OpenStreetMap Nominatim with Philippine address handling.
    Tries progressively looser versions of the address and says which one matched. House-number
    coverage in OSM is incomplete; barangay labels come from OSM tags and may be missing."""
    cleaned, brgy = clean_ph_address(q)
    cleaned = cleaned or q
    parts = [x.strip() for x in cleaned.split(",") if x.strip()]
    tail = ", ".join(parts[-2:]) if len(parts) >= 2 else None
    tries = [(expand_abbr(cleaned), None)]
    if expand_abbr(cleaned) != cleaned:
        tries.append((cleaned, None))
    no_num = re.sub(r"^\s*[\w-]*\d[\w-]*[,\s]+", "", cleaned).strip()
    if no_num and no_num != cleaned:
        tries.append((expand_abbr(no_num), "house number not found - showing the street/area instead"))
    if parts:
        loose = re.sub(r"\b(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd)\b\.?", "", parts[0], flags=re.I).strip()
        if loose and loose != parts[0] and len(parts) > 1:
            tries.append((", ".join([loose] + parts[1:]), "street name matched loosely (suffix ignored)"))
    if len(parts) > 2:
        tries.append((expand_abbr(", ".join(parts[1:])), "exact address not found - showing a wider area"))
    if tail:
        tries.append((tail, "area-level result: that street was not found in the map data"))
    out = []
    for i, (query, note) in enumerate(tries):
        try:
            raw = await _nominatim(query)
        except ProviderError:
            if i == 0:
                raise
            continue
        if raw:
            out = _hits(raw, note)
            break
    if brgy:
        try:
            raw = await _nominatim(f"Barangay {brgy}" + (f", {tail}" if tail else ""))
        except ProviderError:
            raw = []
        for h in _hits([r for r in raw if str(brgy).lower() in r["display_name"].lower()][:1], f"Barangay {brgy} area (centre of the barangay)"):
            h["brgy"] = h["brgy"] or f"Barangay {brgy}"
            out.append(h)
    return out


async def photon(q, lat=None, lon=None):
    """Typeahead search (landmarks, POIs, streets) on OpenStreetMap data via Photon, which is built for
    search-as-you-type. Public instance is fair-use only; self-host Photon for heavy traffic."""
    params = {"q": q, "limit": 6, "lang": "en", "bbox": "116.9,4.5,126.7,21.2"}
    if lat is not None and lon is not None:
        params.update({"lat": round(lat, 2), "lon": round(lon, 2)})   # bias results toward the selected area
    raw, _, _ = await cached_get("https://photon.komoot.io/api/", params, 86400)
    out = []
    for f in raw.get("features", []):
        p = f.get("properties", {})
        if p.get("countrycode") and p["countrycode"] != "PH":
            continue
        lo, la = f["geometry"]["coordinates"]
        street = " ".join(x for x in (p.get("housenumber"), p.get("street")) if x)
        parts = [p.get("name"), street or None, p.get("district"), p.get("city") or p.get("county"), p.get("state")]
        name = ", ".join(dict.fromkeys(x for x in parts if x))
        if name:
            out.append({"name": name, "region": None, "lat": la, "lon": lo, "note": None, "brgy": p.get("locality") or p.get("district")})
    return out


async def geocode_combined(q, lat=None, lon=None):
    results, errors = [], 0
    try:
        results += await photon(q, lat, lon)
    except ProviderError:
        errors += 1
    try:
        for pl in await geocode(q):
            label = f"{pl['name']}, {pl['region']}" if pl["region"] else pl["name"]
            if not any(pl["name"].lower() in r["name"].lower() for r in results):
                results.append({**pl, "name": label, "region": None, "note": None})
    except ProviderError:
        errors += 1
    if errors == 2:
        raise ProviderError("both geocoders unreachable")
    return results[:10]


_text_cache = {}


async def get_pagasa_ncr():
    """Fetch + parse PAGASA's NCR page (cached 5 min; stale copy served if PAGASA is unreachable)."""
    from . import pagasa
    key, now = pagasa.URL_NCR, time.time()
    hit = _text_cache.get(key)
    stale = False
    if not (hit and now - hit[0] < 300):
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True,
                                         headers={"User-Agent": "FloodWatchPH/1.0 (student project; links back to PAGASA)"}) as c:
                r = await c.get(key)
                r.raise_for_status()
            hit = (now, pagasa.parse_ncr(r.text))
            _text_cache[key] = hit
        except Exception as e:
            if not hit:
                raise ProviderError(f"{type(e).__name__}: {e}")
            stale = True
    return {**hit[1], "fetched_at": iso(hit[0]), "stale": stale, "source_url": key, "region": "National Capital Region (Metro Manila)"}
