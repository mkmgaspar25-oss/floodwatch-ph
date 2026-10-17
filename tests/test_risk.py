import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app import risk


def fc(precip_now=0.0, nxt=(0,) * 6, past=0.0):
    hs = [{"time": f"2026-10-17T{h:02d}:00:00+08:00", "precip": past / 24, "prob": 50, "forecast": False} for h in range(0, 12)]
    i = 11
    hs[i]["precip"] = precip_now
    hs += [{"time": f"2026-10-17T{12 + k:02d}:00:00+08:00", "precip": p, "prob": 70, "forecast": True} for k, p in enumerate(nxt)]
    return {"hourly": hs, "now_index": i, "fetched_at": "x"}


def test_insufficient_when_no_forecast():
    assert risk.assess(None)["level"] == risk.INSUFFICIENT


def test_dry_is_low_and_susceptibility_alone_does_not_raise():
    r = risk.assess(fc(), susceptible=True)
    assert r["level"] == "Low" and r["estimate"] and r["missing"]


def test_intense_rain_in_flood_prone_is_severe():
    assert risk.assess(fc(nxt=(16, 20, 5, 0, 0, 0)), susceptible=True)["level"] == "Severe"


def test_official_warning_never_downgraded():
    r = risk.assess(fc(), officials=[{"severity": "high"}])
    assert r["level"] == "High" and r["official_override"]


def test_unverified_reports_not_counted():
    r = risk.assess(fc(), reports=[{"status": "Unverified"}])
    assert r["level"] == "Low"


def test_route_hazards():
    coords = [[121.0, 14.60], [121.0, 14.61]]
    near = {"lat": 14.605, "lon": 121.0005, "name": "a"}
    far = {"lat": 14.70, "lon": 121.2, "name": "b"}
    hits = risk.route_hazards(coords, [near, far], 200)
    assert [h["name"] for h in hits] == ["a"]


def test_rain_window():
    w = risk.rain_window(fc(nxt=(0, 1, 2, 0, 0, 0)))
    assert w["rain_expected"] and w["start"].endswith("13:00:00+08:00")
