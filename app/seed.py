"""Starter data. NOTE: flood-prone entries are an unverified starter list drawn from widely
reported flood areas. Coordinates are approximate and no frequency/last-event is claimed.
An administrator must verify them against MMDA / DPWH / Project NOAH / NAMRIA / LGU records
and update `verification`, `verified_on`, `frequency`, `last_event`."""
from . import db

MONITORED = [
    ("Manila", 14.5995, 120.9842), ("Quezon City", 14.6760, 121.0437),
    ("Marikina", 14.6507, 121.1029), ("Pasig", 14.5764, 121.0851),
    ("Makati", 14.5547, 121.0244), ("Valenzuela", 14.7011, 120.9830),
]
_CAUSE = "Not yet documented in this dataset"
AREAS = [
    ("España Boulevard (Sampaloc)", "Manila", 14.6097, 120.9894),
    ("Taft Avenue (Malate area)", "Manila", 14.5780, 120.9945),
    ("Roxas Boulevard / Manila Bay front", "Manila", 14.5700, 120.9780),
    ("Tumana / Marikina River banks", "Marikina", 14.6550, 121.0950),
    ("Commonwealth Avenue corridor", "Quezon City", 14.6760, 121.0540),
    ("Araneta Avenue area", "Quezon City", 14.6200, 121.0200),
    ("Cainta Junction (Ortigas Ext.)", "Cainta, Rizal", 14.5780, 121.1220),
    ("Malabon lowlands", "Malabon", 14.6620, 120.9570),
    ("Navotas coastal area", "Navotas", 14.6650, 120.9400),
    ("Valenzuela lowlands", "Valenzuela", 14.7011, 120.9830),
]


def seed_if_empty():
    if not db.q("SELECT 1 FROM monitored_locations LIMIT 1"):
        for n, la, lo in MONITORED:
            db.run("INSERT OR IGNORE INTO monitored_locations(name,lat,lon) VALUES(?,?,?)", (n, la, lo))
    if not db.q("SELECT 1 FROM flood_prone_areas LIMIT 1"):
        for n, c, la, lo in AREAS:
            db.run("""INSERT INTO flood_prone_areas(name,city,lat,lon,frequency,causes,last_event,source,
                      verified_on,verification) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                   (n, c, la, lo, "Not quantified", _CAUSE, None,
                    "Starter list from commonly reported flood areas (not an official dataset)", None,
                    "Unverified starter data"))
