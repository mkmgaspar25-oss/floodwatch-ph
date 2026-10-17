import os
import sqlite3
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS monitored_locations(
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL);
CREATE TABLE IF NOT EXISTS flood_prone_areas(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT, lat REAL NOT NULL, lon REAL NOT NULL,
  frequency TEXT, causes TEXT, last_event TEXT, source TEXT, verified_on TEXT, verification TEXT);
CREATE TABLE IF NOT EXISTS flood_reports(
  id INTEGER PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL, description TEXT NOT NULL,
  depth_cm INTEGER, passable TEXT, photo TEXT, status TEXT NOT NULL DEFAULT 'Unverified',
  created_at TEXT NOT NULL, updated_at TEXT, reporter_hash TEXT);
CREATE TABLE IF NOT EXISTS alerts(
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL,            -- 'official' | 'calculated'
  title TEXT NOT NULL, area TEXT, location_key TEXT, severity TEXT NOT NULL,
  lat REAL, lon REAL, radius_km REAL, starts_at TEXT, ends_at TEXT, probability REAL,
  source TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  recommendation TEXT, url TEXT, dedupe_key TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alert_deliveries(
  id INTEGER PRIMARY KEY, alert_id INTEGER NOT NULL, channel TEXT NOT NULL, delivered_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS weather_observations(
  id INTEGER PRIMARY KEY, location_key TEXT NOT NULL, observed_at TEXT NOT NULL, temp_c REAL,
  precip_mm REAL, wind_kmh REAL, source TEXT, fetched_at TEXT);
CREATE TABLE IF NOT EXISTS weather_forecasts(
  id INTEGER PRIMARY KEY, location_key TEXT NOT NULL, fetched_at TEXT NOT NULL, payload TEXT);
CREATE TABLE IF NOT EXISTS water_level_observations(   -- no ingestion yet: needs an official gauge feed
  id INTEGER PRIMARY KEY, station TEXT NOT NULL, lat REAL, lon REAL, observed_at TEXT NOT NULL,
  level_m REAL, source TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_reports_geo ON flood_reports(lat, lon);
CREATE INDEX IF NOT EXISTS ix_reports_status ON flood_reports(status, created_at);
CREATE INDEX IF NOT EXISTS ix_areas_geo ON flood_prone_areas(lat, lon);
CREATE INDEX IF NOT EXISTS ix_alerts_exp ON alerts(expires_at);
CREATE INDEX IF NOT EXISTS ix_obs_loc ON weather_observations(location_key, observed_at);
"""


def path():
    return os.getenv("DATABASE_PATH", "floodwatch.db")


@contextmanager
def conn():
    c = sqlite3.connect(path(), timeout=10)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def q(sql, params=()):
    with conn() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def run(sql, params=()):
    with conn() as c:
        cur = c.execute(sql, params)
        return cur.lastrowid, cur.rowcount


def init():
    with conn() as c:
        c.executescript(SCHEMA)
