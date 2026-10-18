"""Flood-risk assessment. Pure Python, no third-party deps, fully unit-testable.
Results are ESTIMATES from forecast/model data, never official warnings.
Hourly intensity bands follow the PAGASA rainfall-intensity categories (mm/h); accumulation
thresholds are heuristics. Both are constants - review them with a hydrologist."""
import math
from datetime import datetime, timedelta, timezone

LEVELS = ["Low", "Moderate", "High", "Severe"]
CAT_SCORE = {"None": 0, "Light": 0, "Moderate": 0, "Heavy": 1, "Intense": 2, "Torrential": 3}
INSUFFICIENT = "Insufficient data"


def haversine_km(la1, lo1, la2, lo2):
    p1, p2 = math.radians(la1), math.radians(la2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def intensity_category(mm_h):
    if mm_h is None:
        return None
    if mm_h > 30: return "Torrential"
    if mm_h >= 15: return "Intense"
    if mm_h >= 7.5: return "Heavy"
    if mm_h >= 2.5: return "Moderate"
    if mm_h >= 0.1: return "Light"
    return "None"


def accum_score(mm):
    return 3 if mm >= 100 else 2 if mm >= 50 else 1 if mm >= 25 else 0


def _vals(items):
    return [h["precip"] for h in items if h.get("precip") is not None]


def summarize(fc):
    hs, i = fc["hourly"], fc["now_index"]
    past = _vals(hs[max(0, i - 23): i + 1])
    nxt = _vals(hs[i + 1: i + 7])
    return {"past24": round(sum(past), 1) if past else None,
            "next6_sum": round(sum(nxt), 1) if nxt else None,
            "next6_peak": max(nxt) if nxt else None}


def rain_window(fc):
    hs, i = fc["hourly"], fc["now_index"]
    seg = hs[i: i + 25]
    wet = [k for k, h in enumerate(seg) if (h.get("precip") or 0) >= 0.1]
    note = ("Timing comes from a weather model and carries uncertainty; it can shift by hours. "
            "Check the probability values and official PAGASA advisories.")
    if not wet:
        return {"rain_expected": False, "note": "No measurable rain in the model for the next 24 h. " + note}
    s = e = wet[0]
    while e + 1 < len(seg) and (seg[e + 1].get("precip") or 0) >= 0.1:
        e += 1
    end = (datetime.fromisoformat(seg[e]["time"]) + timedelta(hours=1)).isoformat()
    return {"rain_expected": True, "ongoing": s == 0, "start": seg[s]["time"], "end": end, "note": note}


def assess(fc, susceptible=False, reports=(), officials=(), discharge=None, now=None):
    now = now or datetime.now(timezone.utc)
    base = {"estimate": True, "assessed_at": now.isoformat(),
            "disclaimer": "Calculated estimate. Not an official warning; follow PAGASA/NDRRMC/LGU instructions."}
    missing = ["Real-time river/water-level gauge readings are not connected",
               "Drainage capacity and tide data are not available", "Terrain/elevation is not modelled"]
    official_level = max((LEVELS.index(o["severity"].capitalize()) for o in officials
                          if o["severity"].capitalize() in LEVELS), default=None)
    if fc is None or not _vals(fc["hourly"]):
        out = {**base, "level": INSUFFICIENT, "factors": [], "missing": ["Forecast data unavailable"] + missing,
               "sources": [], "officials": list(officials)}
        if official_level is not None:
            out["level"] = LEVELS[official_level]
            out["factors"] = ["An active official advisory applies to this area (shown separately)."]
            out["official_override"] = True
        return out

    s = summarize(fc)
    factors, score = [], 0
    peak = s["next6_peak"]
    cat = intensity_category(peak) if peak is not None else None
    if cat:
        score = max(score, CAT_SCORE[cat])
        factors.append(f"Peak forecast intensity next 6 h: {peak} mm/h ({cat.lower()} rain)")
    if s["past24"] is not None:
        total = s["past24"] + (s["next6_sum"] or 0)
        score = max(score, accum_score(total))
        factors.append(f"Modelled rainfall past 24 h: {s['past24']} mm; next 6 h: {s['next6_sum'] or 0} mm")
    if susceptible and score >= 2:
        score += 1
        factors.append("Location has a recorded history of flooding (susceptibility, not current flooding)")
    elif susceptible:
        factors.append("Location is flood-prone historically; current rainfall alone does not raise the level")
    near = [r for r in reports if r["status"] == "Verified"]
    unv = [r for r in reports if r["status"] in ("Unverified", "Under Review")]
    if near:
        score = max(score + 1, 1)
        factors.append(f"{len(near)} verified flood report(s) within 1 km")
    if unv:
        factors.append(f"{len(unv)} unverified report(s) nearby (not counted toward the level)")
    if discharge and discharge.get("today") is not None:
        factors.append(f"Modelled river discharge (GloFAS grid, not a gauge): {discharge['today']} m³/s"
                       + (f" vs mean {discharge['mean']}" if discharge.get("mean") else "") + " - informational only")
    level_i = min(score, 3)
    out = {**base, "level": LEVELS[level_i], "factors": factors, "missing": missing,
           "metrics": s, "officials": list(officials),
           "sources": [{"name": "Open-Meteo forecast (model data)", "fetched_at": fc.get("fetched_at"),
                        "stale": fc.get("stale", False)}]}
    if official_level is not None and official_level > level_i:
        out["level"] = LEVELS[official_level]
        out["official_override"] = True
        out["factors"].insert(0, "Level raised to match an active official advisory (never downgraded).")
    return out


def route_hazards(coords, hazards, radius_m):
    """coords: [[lon,lat],...]; hazards: [{'lat','lon',...}]. Returns hazards within radius_m of any
    route SEGMENT (point-to-segment distance, so sparse geometry on straight roads is handled)."""
    hits = []
    for h in hazards:
        k = math.cos(math.radians(h["lat"]))
        pts = [((lo - h["lon"]) * 111320 * k, (la - h["lat"]) * 110540) for lo, la in coords]  # hazard at origin
        best = None
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]) if len(pts) > 1 else [(pts[0], pts[0])] if pts else []:
            dx, dy = x2 - x1, y2 - y1
            t = 0 if dx == dy == 0 else max(0, min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy)))
            d = math.hypot(x1 + t * dx, y1 + t * dy)
            best = d if best is None or d < best else best
        if best is not None and best <= h.get("radius_m", radius_m):
            hits.append({**h, "distance_m": round(best)})
    return hits


def step_text(step):
    """Readable instruction built only from fields the routing service returns (maneuver type/modifier, street name)."""
    m = step.get("maneuver", {})
    t, mod = m.get("type"), (m.get("modifier") or "").replace("slight ", "slightly ")
    name, road = step.get("name") or "", step.get("name") or "the road"
    if t == "depart":
        return f"Head {mod or 'out'} on {road}" if name else "Start"
    if t == "arrive":
        return "Arrive at your destination"
    if t in ("roundabout", "rotary", "exit roundabout", "exit rotary"):
        return f"At the roundabout, exit onto {road}"
    if t in ("turn", "end of road"):
        return f"Turn {mod} onto {road}" if mod and mod != "straight" else f"Continue onto {road}"
    if t == "fork":
        return f"Keep {mod} at the fork onto {road}" if mod else f"Take the fork onto {road}"
    if t == "merge":
        return f"Merge onto {road}"
    if t == "on ramp":
        return f"Take the ramp onto {road}"
    if t == "off ramp":
        return f"Take the exit onto {road}"
    return f"Continue on {road}"
