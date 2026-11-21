#!/usr/bin/env python3
"""
SPINNING NEWS - Real-Time Geopolitical Intelligence & Ingestion Server
Zero-dependency Python 3 (3.8+) backend providing:
1. Static File Serving (a fixed allowlist of front-end files, proper MIME types)
2. REST API for News Ingestion (POST /api/events)
3. Server-Sent Events (SSE) Live Event Streaming (GET /api/stream)
4. Built-in RSS / Atom Ingestion Pipeline (POST /api/pipeline/poll-rss)

Usage:  python server.py [PORT] [--host HOST]        (defaults: 8080, 127.0.0.1)

Environment (the --host option wins over SPINNING_NEWS_HOST):
  SPINNING_NEWS_HOST                 bind address
  SPINNING_NEWS_TOKEN                write token; clients send "Authorization: Bearer <token>"
  SPINNING_NEWS_CORS_ORIGINS         comma-separated origins (e.g. http://localhost:3000) that may call
                                     the API cross-origin; "*" = any origin, read endpoints only
  SPINNING_NEWS_ALLOWED_HOSTS        comma-separated extra Host header names (no port)
  SPINNING_NEWS_ALLOW_PRIVATE_FEEDS  1 = the RSS poller may fetch private / loopback addresses

Security model:
- Loopback binds (127.0.0.1 / localhost / ::1) run "local only": no token unless SPINNING_NEWS_TOKEN
  is set, and the Host header must be a local name (DNS-rebinding defence).
- Any other bind address is "exposed": writes always need a token (generated and printed at
  startup when SPINNING_NEWS_TOKEN is unset).
- Writes accept same-origin or explicitly listed origins only, with JSON bodies up to 64 KB.
- normalize_event() rebuilds every ingested event field by field (the trust boundary).
- The RSS poller fetches public http(s) addresses only and re-checks the peer it connected to.
- A request must arrive within 30 s with at most 64 KB of headers; at most 256 connections are served
  at a time, and one remote address may hold at most 10 of the 100 live streams.
"""

import argparse
import hmac
import html
import http.client
import http.server
import io
import ipaddress
import json
import math
import os
import queue
import re
import secrets
import socket
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

try:
    import ssl
except ImportError:  # Python built without OpenSSL: plain-http feeds only
    ssl = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8080
DEFAULT_HOST = "127.0.0.1"

MAX_BODY_BYTES = 65536            # largest accepted JSON request body
MAX_HEADER_BYTES = 65536          # request header section (after the request line); more gets a 431
MAX_STORED_EVENTS = 200           # in-memory event store, newest first
MAX_SSE_SUBSCRIBERS = 100
SSE_STREAMS_PER_CLIENT = 10       # open streams per remote address (IPv6: per /64); loopback peers are exempt
SSE_HEARTBEAT_SECONDS = 15
SSE_QUEUE_LIMIT = 256             # frames buffered per subscriber before it is dropped as too slow
REQUEST_TIMEOUT_SECONDS = 30      # per-connection socket timeout, so stalled clients release their thread
REQUEST_DEADLINE_SECONDS = 30     # the whole request (line, headers, body) must arrive within this
MAX_CONNECTIONS = 256             # concurrent connections, open SSE streams included; more get a 503

DEFAULT_RSS_URL = "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR%3Ako"
RSS_POLL_INTERVAL_SECONDS = 5
FEED_TIMEOUT_SECONDS = 8          # per socket operation (connect, each read)
FEED_DEADLINE_SECONDS = 20        # whole download, so a slow-drip server cannot hold a thread
MAX_FEED_BYTES = 2 * 1024 * 1024
MAX_FEED_REDIRECTS = 5
MAX_FEED_URL_LENGTH = 2000
FEED_ITEMS_PER_POLL = 5
FEED_TEXT_LIMIT = 65536           # characters of one feed title / summary that get cleaned up
FEED_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SpinningNews/1.0"

# The front end. Nothing else in the folder is ever served (no directory listing either).
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/styles.css": "styles.css",
    "/flags.js": "flags.js",
    "/news-data.js": "news-data.js",
    "/audio.js": "audio.js",
    "/countries-data.js": "countries-data.js",
    "/countries.geojson": "countries.geojson",
}
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".geojson": "application/geo+json",
}

# Thread-safe in-memory event store and SSE subscribers
events_lock = threading.Lock()
custom_events = []
sse_subscribers = []
sse_lock = threading.Lock()

# Standard Country Coordinate Lookup (Fallback for automated pipelines)
COUNTRY_GEO = {
    "KR": {"name": "대한민국", "lat": 36.5, "lng": 127.8, "flag": "🇰🇷"},
    "US": {"name": "미국", "lat": 38.8951, "lng": -77.0364, "flag": "🇺🇸"},
    "CN": {"name": "중국", "lat": 39.9042, "lng": 116.4074, "flag": "🇨🇳"},
    "JP": {"name": "일본", "lat": 35.6762, "lng": 139.6503, "flag": "🇯🇵"},
    "RU": {"name": "러시아", "lat": 55.7558, "lng": 37.6173, "flag": "🇷🇺"},
    "UA": {"name": "우크라이나", "lat": 50.4501, "lng": 30.5234, "flag": "🇺🇦"},
    "IR": {"name": "이란", "lat": 35.6892, "lng": 51.3890, "flag": "🇮🇷"},
    "IL": {"name": "이스라엘", "lat": 31.7683, "lng": 35.2137, "flag": "🇮🇱"},
    "TW": {"name": "대만", "lat": 25.0330, "lng": 121.5654, "flag": "🇹🇼"},
    "DE": {"name": "독일", "lat": 52.5200, "lng": 13.4050, "flag": "🇩🇪"},
    "GB": {"name": "영국", "lat": 51.5074, "lng": -0.1278, "flag": "🇬🇧"},
    "FR": {"name": "프랑스", "lat": 48.8566, "lng": 2.3522, "flag": "🇫🇷"},
    "SA": {"name": "사우디", "lat": 24.7136, "lng": 46.6753, "flag": "🇸🇦"},
    "PH": {"name": "필리핀", "lat": 14.5995, "lng": 120.9842, "flag": "🇵🇭"},
    "BR": {"name": "브라질", "lat": -15.7975, "lng": -47.8919, "flag": "🇧🇷"},
    "IN": {"name": "인도", "lat": 28.6139, "lng": 77.2090, "flag": "🇮🇳"},
    "CL": {"name": "칠레", "lat": -33.4489, "lng": -70.6693, "flag": "🇨🇱"},
    "AU": {"name": "호주", "lat": -35.2809, "lng": 149.1300, "flag": "🇦🇺"}
}


# ---------------------------------------------------------------------------
# Configuration (pure: resolve_settings() reads only what it is given)
# ---------------------------------------------------------------------------
_LOCAL_HOST_NAMES = ("localhost", "127.0.0.1", "::1")
_WILDCARD_HOSTS = ("", "0.0.0.0", "::")
_SCHEME_RE = re.compile(r"[a-z][a-z0-9+.-]*", re.ASCII)


def _strip_brackets(host):
    host = (host or "").strip()
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    return host


def _ip_literal(name):
    """The ipaddress object for an IP literal (a zone id is ignored), else None."""
    try:
        return ipaddress.ip_address((name or "").split("%", 1)[0])
    except ValueError:
        return None


def is_loopback_host(host):
    """True for "localhost" and loopback IP literals (127.0.0.0/8, ::1)."""
    name = _strip_brackets(host).lower().rstrip(".")
    if name == "localhost":
        return True
    ip = _ip_literal(name)
    return bool(ip is not None and ip.is_loopback)


def split_host_port(value):
    """Splits "name", "name:port", "[v6]" or "[v6]:port" into (lowercase name, port string or None)."""
    v = (value or "").strip()
    if v.startswith("["):
        end = v.find("]")
        rest = v[end + 1:] if end >= 0 else ""
        if end < 0 or (rest and not rest.startswith(":")):
            return "", None
        name, port = v[1:end], (rest[1:] if rest else None)
    elif v.count(":") == 1:
        name, port = v.split(":", 1)
    else:
        name, port = v, None  # a bare name, or an unbracketed IPv6 literal
    return name.lower().rstrip("."), port


def normalize_origin(value):
    """Canonical "scheme://host[:port]" for an Origin value, or None (malformed, or "null")."""
    if not isinstance(value, str):
        return None
    v = value.strip().lower()
    if v.endswith("/"):
        v = v[:-1]
    if not v or v == "null":
        return None
    try:
        parts = urllib.parse.urlsplit(v)
        port = parts.port
    except ValueError:
        return None
    if not _SCHEME_RE.fullmatch(parts.scheme or "") or not parts.hostname or "@" in parts.netloc:
        return None
    if parts.path or parts.query or parts.fragment:
        return None
    name = parts.hostname
    if ":" in name:
        name = "[" + name + "]"
    if port is not None and port != {"http": 80, "https": 443}.get(parts.scheme):
        name += ":%d" % port
    return parts.scheme + "://" + name


def is_same_origin(origin, host_header):
    """True when the Origin's host[:port] equals the Host header (case-insensitive, scheme ignored)."""
    if not isinstance(origin, str) or not host_header:
        return False
    v = origin.strip().lower()
    if not v or v == "null":
        return False
    try:
        parts = urllib.parse.urlsplit(v)
    except ValueError:
        return False
    if not parts.scheme or not parts.netloc or "@" in parts.netloc:
        return False
    if parts.path not in ("", "/") or parts.query or parts.fragment:
        return False
    return parts.netloc == host_header.strip().lower()


def _generate_token():
    return secrets.token_urlsafe(24)


class Settings(object):
    """Runtime configuration decided by resolve_settings()."""

    def __init__(self, host, loopback, token, token_source, cors_origins, cors_any,
                 allowed_hosts, host_check, allow_private_feeds):
        self.host = host                                # bind address ("" = all interfaces)
        self.loopback = loopback                        # True = "local only" mode
        self.token = token                              # write token, or None when writes need none
        self.token_source = token_source                # "env", "generated" or None
        self.cors_origins = cors_origins                # frozenset of normalized origins
        self.cors_any = cors_any                        # "*" listed: any origin may read
        self.allowed_hosts = allowed_hosts              # Host names the Host check accepts
        self.host_check = host_check                    # is the Host check active?
        self.allow_private_feeds = allow_private_feeds  # RSS poller may fetch private addresses

    @property
    def exposed(self):
        return not self.loopback

    @property
    def token_required(self):
        return self.token is not None

    @property
    def token_generated(self):
        return self.token_source == "generated"

    @property
    def mode(self):
        return "local only" if self.loopback else "exposed"

    def __repr__(self):
        # never print the token itself
        return ("Settings(host=%r, mode=%r, token=%s, cors_origins=%r, cors_any=%r, allowed_hosts=%r, "
                "host_check=%r, allow_private_feeds=%r)" % (
                    self.host, self.mode, self.token_source or "none", sorted(self.cors_origins),
                    self.cors_any, sorted(self.allowed_hosts), self.host_check, self.allow_private_feeds))


def resolve_settings(host=None, env=None, token_factory=None):
    """Decides mode, write token, CORS origins and the Host allowlist.

    host: the --host value (None = use SPINNING_NEWS_HOST, then 127.0.0.1).
    env: a mapping such as os.environ (None = empty); nothing else is read.
    """
    env = {} if env is None else env
    if host is None:
        host = (env.get("SPINNING_NEWS_HOST") or "").strip() or DEFAULT_HOST
    host = _strip_brackets(str(host))
    loopback = is_loopback_host(host)

    token = (env.get("SPINNING_NEWS_TOKEN") or "").strip() or None
    token_source = "env" if token else None
    if token is None and not loopback:
        token = (token_factory or _generate_token)()
        token_source = "generated"

    cors_any = False
    cors_origins = set()
    for item in (env.get("SPINNING_NEWS_CORS_ORIGINS") or "").split(","):
        item = item.strip()
        if item == "*":
            cors_any = True
        elif item:
            origin = normalize_origin(item)
            if origin:
                cors_origins.add(origin)

    extra_hosts = set()
    for item in (env.get("SPINNING_NEWS_ALLOWED_HOSTS") or "").split(","):
        name = split_host_port(item)[0]
        if name:
            extra_hosts.add(name)
    allowed_hosts = set(_LOCAL_HOST_NAMES) | extra_hosts
    bind_name = host.lower().rstrip(".")
    if bind_name not in _WILDCARD_HOSTS and _ip_literal(bind_name) is not None:
        # the bind IP itself (e.g. 127.0.0.2): an IP literal in Host cannot be DNS-rebound
        allowed_hosts.add(bind_name)

    return Settings(
        host=host,
        loopback=loopback,
        token=token,
        token_source=token_source,
        cors_origins=frozenset(cors_origins),
        cors_any=cors_any,
        allowed_hosts=frozenset(allowed_hosts),
        host_check=loopback or bool(extra_hosts),
        allow_private_feeds=(env.get("SPINNING_NEWS_ALLOW_PRIVATE_FEEDS") or "").strip() == "1",
    )


# ---------------------------------------------------------------------------
# Event sanitising: normalize_event() is the trust boundary for ingested data
# ---------------------------------------------------------------------------
_EVENT_ID_RE = re.compile(r"[A-Za-z0-9._:-]{1,64}", re.ASCII)
_CATEGORY_RE = re.compile(r"[a-z_-]{1,24}", re.ASCII)
_DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)
_TIME_RE = re.compile(r"[0-9]{1,2}:[0-9]{2}( ?[A-Za-z]{2,4})?", re.ASCII)
_CODE_RE = re.compile(r"[A-Za-z]{2}", re.ASCII)
_COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}|rgba?\(\s*[0-9.\s%,]+\)", re.ASCII)
_URL_RE = re.compile(r"https?://[^\s\"'<>\\`\x00-\x1f\x7f-\x9f]+", re.IGNORECASE)
# control characters except \t and \n, plus lone surrogates (they cannot be encoded as UTF-8)
_CTRL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f\ud800-\udfff]")


def finite_number(value):
    """A finite float from a JSON number or numeric string; None for bools, NaN, Infinity and the rest."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            number = float(value)
        except OverflowError:
            return None
    elif isinstance(value, str) and len(value) <= 40:
        try:
            number = float(value.strip())
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


def _clamp(value, low, high):
    return low if value < low else high if value > high else value


def clean_text(value, limit, default=""):
    """Plain text for an event field: a string (or a finite number), control characters dropped,
    trimmed and capped at `limit` characters; `default` when nothing usable is left."""
    if value is None or isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        if finite_number(value) is None:
            return default
        try:
            value = str(value)
        except ValueError:  # an integer too long to print
            return default
    elif not isinstance(value, str):
        return default
    text = _CTRL_RE.sub("", value).strip()
    if len(text) > limit:
        text = text[:limit].rstrip()
    return text or default


def _country_code(value):
    # country codes are two letters or nothing (they end up in flag image URLs and markup)
    if isinstance(value, str):
        v = value.strip()
        if _CODE_RE.fullmatch(v):
            return v.upper()
    return None


def _lat(value):
    n = finite_number(value)
    return None if n is None else _clamp(n, -90.0, 90.0)


def _lng(value):
    n = finite_number(value)
    return None if n is None else _clamp(n, -180.0, 180.0)


def new_event_id():
    return "custom-%d-%s" % (int(time.time() * 1000), secrets.token_hex(2))


def _event_id_taken(event_id):
    with events_lock:
        return any(e.get("id") == event_id for e in custom_events)


def _event_id(value):
    if isinstance(value, str) and _EVENT_ID_RE.fullmatch(value) and not _event_id_taken(value):
        return value
    return new_event_id()


def _valid_date(value):
    if isinstance(value, str):
        v = value.strip()
        if _DATE_RE.fullmatch(v):
            try:
                datetime.strptime(v, "%Y-%m-%d")
                return v
            except ValueError:
                pass
    return None


def _valid_time(value):
    if isinstance(value, str):
        v = value.strip()
        if len(v) <= 16 and _TIME_RE.fullmatch(v):
            return v
    return None


def _safe_url(value):
    """An http(s) URL of at most 500 characters, else "#"."""
    if isinstance(value, str):
        v = value.strip()
        if len(v) <= 500 and _URL_RE.fullmatch(v):
            try:
                if urllib.parse.urlsplit(v).netloc:
                    return v
            except ValueError:
                pass
    return "#"


def _sanitize_colors(value):
    items = [value] if isinstance(value, str) else value if isinstance(value, list) else []
    colors = []
    for item in items:
        if len(colors) >= 2:
            break
        if isinstance(item, str):
            c = item.strip()
            if len(c) <= 64 and _COLOR_RE.fullmatch(c):
                colors.append(c)
    return colors


def _sanitize_parties(value):
    parties = []
    for item in value if isinstance(value, list) else []:
        if len(parties) >= 8:
            break
        if not isinstance(item, dict):
            continue
        lat, lng = _lat(item.get("lat")), _lng(item.get("lng"))
        if lat is None or lng is None:
            continue
        party = {}
        code = _country_code(item.get("code"))
        if code:
            party["code"] = code
        party["name"] = clean_text(item.get("name"), 60)
        flag = clean_text(item.get("flag"), 8)
        if flag:
            party["flag"] = flag
        party["lat"] = lat
        party["lng"] = lng
        role = clean_text(item.get("role"), 24)
        if role:
            party["role"] = role
        parties.append(party)
    return parties


def _sanitize_arcs(value, event_id):
    arcs = []
    for item in value if isinstance(value, list) else []:
        if len(arcs) >= 8:
            break
        if not isinstance(item, dict):
            continue
        coords = (_lat(item.get("startLat")), _lng(item.get("startLng")),
                  _lat(item.get("endLat")), _lng(item.get("endLng")))
        if any(c is None for c in coords):
            continue
        arc_id = item.get("id")
        if not (isinstance(arc_id, str) and _EVENT_ID_RE.fullmatch(arc_id)):
            arc_id = ("arc-%d-%s" % (len(arcs), event_id))[:64]
        arc = {
            "id": arc_id,
            "startLat": coords[0],
            "startLng": coords[1],
            "endLat": coords[2],
            "endLng": coords[3],
            "sourceName": clean_text(item.get("sourceName"), 60),
            "targetName": clean_text(item.get("targetName"), 60),
        }
        for key in ("sourceFlag", "targetFlag"):
            flag = clean_text(item.get(key), 8)
            if flag:
                arc[key] = flag
        colors = _sanitize_colors(item.get("color"))
        if colors:
            arc["color"] = colors
        stroke = finite_number(item.get("stroke"))
        if stroke is not None:
            arc["stroke"] = _clamp(stroke, 0.05, 8.0)
        label = clean_text(item.get("label"), 120)
        if label:
            arc["label"] = label
        arcs.append(arc)
    return arcs


def _sanitize_sources(value):
    sources = []
    for item in value if isinstance(value, list) else []:
        if len(sources) >= 8:
            break
        if not isinstance(item, dict):
            continue
        source = {"name": clean_text(item.get("name"), 100)}
        tier = clean_text(item.get("tier"), 40)
        if tier:
            source["tier"] = tier
        source["url"] = _safe_url(item.get("url"))
        reliability = item.get("reliability")
        if isinstance(reliability, str):
            text = clean_text(reliability, 40)
            if text:
                source["reliability"] = text
        elif isinstance(reliability, (int, float)) and finite_number(reliability) is not None:
            source["reliability"] = _clamp(reliability, 0, 100)
        sources.append(source)
    return sources


def _sanitize_tags(value):
    tags = []
    for item in value if isinstance(value, list) else []:
        if len(tags) >= 10:
            break
        if isinstance(item, str):
            text = clean_text(item, 30)
            if text:
                tags.append(text)
    return tags


def normalize_event(p):
    """Enriches raw payload with standard geocoding, coordinates, and 3D arcs.

    The ingest API is public: every field is rebuilt from known keys with checked types, capped
    lengths and finite, clamped numbers, so whatever comes out is safe to store, serialise as strict
    JSON and render. Never raises for a dict.
    """
    if not isinstance(p, dict):
        raise ValueError("event must be a JSON object")
    now = datetime.now(timezone.utc)

    primary_country = _country_code(p.get("primaryCountry")) or _country_code(p.get("country")) or "KR"
    geo = COUNTRY_GEO.get(primary_country, {"name": primary_country, "lat": 36.5, "lng": 127.8, "flag": "🌐"})

    lat = _lat(p.get("lat"))
    lng = _lng(p.get("lng"))
    lat = float(geo.get("lat", 0.0)) if lat is None else lat
    lng = float(geo.get("lng", 0.0)) if lng is None else lng

    cat = p.get("category")
    cat = cat.strip().lower() if isinstance(cat, str) else ""
    if not _CATEGORY_RE.fullmatch(cat):
        cat = "domestic"
    date_str = _valid_date(p.get("date")) or now.strftime("%Y-%m-%d")
    time_str = _valid_time(p.get("time")) or now.strftime("%H:%M UTC")

    event_id = _event_id(p.get("id"))

    country_codes = []
    for raw in p.get("countryCodes") if isinstance(p.get("countryCodes"), list) else []:
        code = _country_code(raw)
        if code:
            country_codes.append(code)
            if len(country_codes) >= 8:
                break
    country_codes = country_codes or [primary_country]

    # Parties & Arcs resolution
    parties = _sanitize_parties(p.get("parties"))
    arcs = _sanitize_arcs(p.get("arcs"), event_id)

    # Auto-create bilateral arc if two countries are specified
    if len(country_codes) >= 2 and not arcs:
        c1 = country_codes[0]
        c2 = country_codes[1]
        g1 = COUNTRY_GEO.get(c1, {"lat": lat, "lng": lng, "name": c1, "flag": "🌐"})
        g2 = COUNTRY_GEO.get(c2, {"lat": _clamp(lat + 10, -90.0, 90.0), "lng": _clamp(lng + 20, -180.0, 180.0),
                                  "name": c2, "flag": "🌐"})

        if not parties:
            parties = [
                {"code": c1, "name": g1["name"], "flag": g1["flag"], "lat": g1["lat"], "lng": g1["lng"]},
                {"code": c2, "name": g2["name"], "flag": g2["flag"], "lat": g2["lat"], "lng": g2["lng"]}
            ]

        arc_color = ["#f43f5e", "#fb923c"] if cat == "conflict" else ["#c084fc", "#34d399"]
        arcs = [{
            "id": ("arc-" + event_id)[:64],
            "startLat": g1["lat"],
            "startLng": g1["lng"],
            "endLat": g2["lat"],
            "endLng": g2["lng"],
            "sourceName": g1["name"],
            "targetName": g2["name"],
            "sourceFlag": g1["flag"],
            "targetFlag": g2["flag"],
            "color": arc_color,
            "stroke": 2.8,
            "label": f"{g1['name']} ↔ {g2['name']} ({cat.upper()})"
        }]

    title = clean_text(p.get("title"), 200, "실시간 뉴스 브리핑")
    summary = clean_text(p.get("summary"), 1000) or clean_text(p.get("title"), 1000)
    details = clean_text(p.get("details"), 5000) or summary
    impact = finite_number(p.get("impactScore"))
    source_name = clean_text(p.get("sourceName"), 100, "REST API Webhook")
    sources = _sanitize_sources(p.get("sources")) or [
        {"name": source_name, "tier": "Tier-1 API", "url": "#", "reliability": 95}
    ]

    event = {
        "id": event_id,
        "date": date_str,
        "time": time_str,
        "category": cat,
        "type": cat,
        "flags": [geo.get("flag", "🌐")],
        "countryCodes": country_codes,
        "primaryCountry": primary_country,
        "title": title,
        "summary": summary,
        "details": details,
        "impactScore": 75 if impact is None else int(_clamp(impact, 0.0, 100.0)),
        "locationName": clean_text(p.get("locationName"), 100, geo.get("name") or "지구"),
        "lat": float(lat),
        "lng": float(lng),
        "parties": parties,
        "arcs": arcs,
        "sources": sources,
        "isLiveIngested": True,
        # when the server received it (the client shows true ages after a reload)
        "receivedAt": int(time.time() * 1000),
    }
    tags = _sanitize_tags(p.get("tags"))
    if tags:
        event["tags"] = tags
    if p.get("demo") is True:
        # sample / test data: the client can label it as such
        event["demo"] = True
    # optional short globe label / place name from a pipeline
    for key in ("brief", "place"):
        if isinstance(p.get(key), str):
            text = clean_text(p.get(key), 60)
            if text:
                event[key] = text
    return event


_normalize_event = normalize_event  # the name earlier versions used


# ---------------------------------------------------------------------------
# Event store and SSE fan-out
# ---------------------------------------------------------------------------
def json_bytes(obj):
    """Strict JSON (no NaN / Infinity) as UTF-8 bytes."""
    return json.dumps(obj, ensure_ascii=False, allow_nan=False).encode("utf-8", "replace")


def _sse_frame(obj):
    return b"data: " + json_bytes(obj) + b"\n\n"


class _Subscriber(object):
    """One open /api/stream connection. Its own handler thread writes the frames queued here, so a
    slow or stalled client never blocks the request that broadcasts."""

    __slots__ = ("queue", "lagging", "client")

    def __init__(self, client=None):
        self.queue = queue.Queue(maxsize=SSE_QUEUE_LIMIT)
        self.lagging = False
        self.client = client  # client_key() of the peer, for the per-client stream limit

    def offer(self, frame):
        try:
            self.queue.put_nowait(frame)
        except queue.Full:
            self.lagging = True  # the stream is closed; EventSource reconnects on its own


def client_key(address):
    """Groups peers for per-client limits: the IPv4 address, or the IPv6 /64 (one host's privacy
    addresses). None for loopback peers, which share only the global limits (in "local only" mode
    every client is one)."""
    ip = _ip_literal(str(address or ""))
    if ip is None:
        return str(address)
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if ip.is_loopback:
        return None
    if ip.version == 6:
        return str(ipaddress.IPv6Network((int(ip) >> 64 << 64, 64)))
    return str(ip)


def broadcast_sse(event_data):
    """Pushes a live event JSON frame to all open SSE connections."""
    frame = _sse_frame(event_data)
    with sse_lock:
        subscribers = list(sse_subscribers)
    for subscriber in subscribers:
        subscriber.offer(frame)


def store_event(event):
    """The one way events enter the store (POST and RSS alike): newest first, capped, then broadcast."""
    with events_lock:
        if any(e.get("id") == event.get("id") for e in custom_events):
            event["id"] = new_event_id()
        custom_events.insert(0, event)
        del custom_events[MAX_STORED_EVENTS:]
    # Broadcast to all live connected globes via SSE!
    broadcast_sse({"type": "new_event", "event": event})
    return event


# ---------------------------------------------------------------------------
# RSS / Atom poller with an SSRF guard
# ---------------------------------------------------------------------------
class FeedBlocked(Exception):
    """The feed URL, a redirect or the connected peer points at a non-public address."""


class FeedError(Exception):
    """The feed could not be fetched or parsed."""


class RateLimiter(object):
    """Allows one call per `interval` seconds across all threads."""

    def __init__(self, interval):
        self.interval = interval
        self._lock = threading.Lock()
        self._last = None

    def try_acquire(self):
        """0 when the call may go ahead (and is recorded), else the seconds left to wait."""
        with self._lock:
            now = time.monotonic()
            if self._last is not None:
                wait = self._last + self.interval - now
                if wait > 0:
                    return wait
            self._last = now
            return 0


RSS_RATE_LIMIT = RateLimiter(RSS_POLL_INTERVAL_SECONDS)

_NAT64_NET = ipaddress.ip_network("64:ff9b::/96")
_V6_GLOBAL_UNICAST = ipaddress.ip_network("2000::/3")
_V6_DOCUMENTATION_NET = ipaddress.ip_network("3fff::/20")  # RFC 9637: inside 2000::/3, not routed
_V4_IETF_NET = ipaddress.ip_network("192.0.0.0/24")         # IETF protocol assignments (Python < 3.13 misses most)


def is_public_address(address):
    """True when an IP address (string or ipaddress object) is globally routable unicast.

    IPv6 forms that carry an IPv4 address (mapped, 6to4, NAT64) are judged by that IPv4 address. Any other
    IPv6 address must be global unicast (2000::/3): ipaddress alone calls site-local fec0::/10, the
    IPv4-translated ::ffff:0:0:0/96 and other reserved space global on older Pythons.
    """
    if isinstance(address, (ipaddress.IPv4Address, ipaddress.IPv6Address)):
        ip = address
    else:
        ip = _ip_literal(str(address))
        if ip is None:
            return False
    if ip.version == 6:
        if ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        elif ip.sixtofour is not None:
            ip = ip.sixtofour
        elif ip in _NAT64_NET:
            ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
        elif ip not in _V6_GLOBAL_UNICAST or ip in _V6_DOCUMENTATION_NET:
            return False
    if ip.version == 4 and ip in _V4_IETF_NET:
        return False
    return bool(ip.is_global) and not ip.is_multicast


def _default_port(scheme):
    return 443 if scheme.lower() == "https" else 80


def validate_feed_url(url):
    """Checks a feed URL's shape. Returns (url, urlsplit parts) or raises ValueError (short message)."""
    if not isinstance(url, str):
        raise ValueError("url must be a string")
    url = url.strip()
    if not url or len(url) > MAX_FEED_URL_LENGTH:
        raise ValueError("url must be 1-%d characters" % MAX_FEED_URL_LENGTH)
    if re.search(r"[^\x21-\x7e]", url) or "\\" in url:
        raise ValueError("url must be plain ASCII without spaces (percent-encode the rest)")
    try:
        parts = urllib.parse.urlsplit(url)
        port = parts.port
    except ValueError:
        raise ValueError("url is malformed")
    if parts.scheme.lower() not in ("http", "https"):
        raise ValueError("url must be an http(s) feed")
    if not parts.hostname:
        raise ValueError("url needs a host name")
    if "@" in parts.netloc or parts.username is not None or parts.password is not None:
        raise ValueError("url must not contain credentials")
    if port == 0:
        raise ValueError("url port is invalid")
    return url, parts


def _resolve(host, port):
    try:
        return socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)
    except (OSError, UnicodeError):
        return []


def check_feed_host(host, port):
    """Raises FeedBlocked unless every address `host` resolves to is public.
    A name that does not resolve is left to the fetch (which then fails)."""
    for info in _resolve(host, port):
        if not is_public_address(info[4][0]):
            raise FeedBlocked("feed host is not a public address")


def _check_peer(sock, allow_private):
    """After connecting: the peer actually reached must be public too (DNS can change after the check)."""
    if allow_private:
        return
    try:
        peer = sock.getpeername()[0]
    except OSError:
        raise FeedError("could not verify the feed server address")
    if not is_public_address(peer):
        raise FeedBlocked("feed host is not a public address")


def _guarded_connect(address, timeout, source_address, allow_private, watch=None):
    """socket.create_connection() that dials public addresses only and re-checks the peer.

    With a watch, no lookup or connect starts after the fetch deadline and each connect attempt gets at
    most the time that is left (a host with many unreachable addresses cannot stretch the deadline).
    """
    host, port = address[0], address[1]
    if watch is not None:
        watch.check()
    infos = socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)
    if not allow_private and any(not is_public_address(info[4][0]) for info in infos):
        raise FeedBlocked("feed host is not a public address")
    last_error = None
    for family, socktype, proto, _canonname, sockaddr in infos:
        op_timeout = timeout if isinstance(timeout, (int, float)) else None
        left = watch.check() if watch is not None else None
        if left is not None:
            op_timeout = left if op_timeout is None else min(op_timeout, left)
        sock = socket.socket(family, socktype, proto)
        try:
            if op_timeout is not None:
                sock.settimeout(op_timeout)
            if source_address:
                sock.bind(source_address)
            sock.connect(sockaddr)
            _check_peer(sock, allow_private)
            return sock
        except OSError as exc:
            sock.close()
            last_error = exc
        except Exception:
            sock.close()
            raise
    raise last_error or OSError("could not resolve the feed host")


class _FetchWatch(object):
    """Shuts every socket of one feed fetch at the deadline, so a server that answers byte by byte
    (headers included) cannot hold the request thread for long."""

    def __init__(self, seconds=None):
        self._lock = threading.Lock()
        self._socks = []
        self.expired = False
        self.deadline = None if seconds is None else time.monotonic() + seconds

    def check(self):
        """Seconds left before the deadline (None without one); FeedError once it has passed."""
        left = None if self.deadline is None else self.deadline - time.monotonic()
        if self.expired or (left is not None and left <= 0):
            raise FeedError("feed took too long to download")
        return left

    def add(self, sock):
        with self._lock:
            if any(s is sock for s in self._socks):
                return
            self._socks.append(sock)
            expired = self.expired
        if expired:
            self._shut(sock)

    def expire(self):
        with self._lock:
            self.expired = True
            socks = list(self._socks)
        for sock in socks:
            self._shut(sock)

    @staticmethod
    def _shut(sock):
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass


class _PeerCheckMixin(object):
    """For http.client connections: guarded connect, then a peer check before any request is sent."""

    def _install_guard(self, allow_private, watch):
        self.allow_private = allow_private
        self._watch = watch
        self._create_connection = self._guarded_create_connection

    def _guarded_create_connection(self, address, timeout=None, source_address=None, *args, **kwargs):
        sock = _guarded_connect(address, timeout, source_address, self.allow_private, self._watch)
        if self._watch is not None:
            self._watch.add(sock)
        return sock

    def connect(self):
        super().connect()
        _check_peer(self.sock, self.allow_private)
        if self._watch is not None:
            # https: the SSLSocket http.client reads from (wrapping detached the raw socket watched above)
            self._watch.add(self.sock)


class _GuardedHTTPConnection(_PeerCheckMixin, http.client.HTTPConnection):
    def __init__(self, host, allow_private=False, watch=None, **kwargs):
        http.client.HTTPConnection.__init__(self, host, **kwargs)
        self._install_guard(allow_private, watch)


class _GuardedHTTPHandler(urllib.request.HTTPHandler):
    def __init__(self, allow_private=False, watch=None):
        urllib.request.HTTPHandler.__init__(self)
        self._allow_private = allow_private
        self._watch = watch

    def http_open(self, req):
        return self.do_open(_GuardedHTTPConnection, req, allow_private=self._allow_private, watch=self._watch)


if ssl is not None:
    class _GuardedHTTPSConnection(_PeerCheckMixin, http.client.HTTPSConnection):
        def __init__(self, host, allow_private=False, watch=None, **kwargs):
            http.client.HTTPSConnection.__init__(self, host, **kwargs)
            self._install_guard(allow_private, watch)

    class _GuardedHTTPSHandler(urllib.request.HTTPSHandler):
        def __init__(self, allow_private=False, watch=None):
            urllib.request.HTTPSHandler.__init__(self, context=ssl.create_default_context())
            self._allow_private = allow_private
            self._watch = watch

        def https_open(self, req):
            return self.do_open(_GuardedHTTPSConnection, req, context=self._context,
                                allow_private=self._allow_private, watch=self._watch)


class _FeedRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Follows at most MAX_FEED_REDIRECTS redirects, to public http(s) URLs only. Redirect bodies are never read."""

    max_redirections = MAX_FEED_REDIRECTS

    def __init__(self, allow_private=False, watch=None):
        self._allow_private = allow_private
        self._watch = watch

    def http_error_302(self, req, fp, code, msg, headers):
        # urllib reads the whole redirect body before following it (any size; a large Content-Length is
        # even allocated up front). Once the response is closed that read returns b"" at once.
        fp.close()
        location = headers.get("location") or headers.get("uri")
        if location:
            target = urllib.parse.urljoin(req.full_url, location.strip())
            if urllib.parse.urlsplit(target).scheme.lower() not in ("http", "https"):
                raise FeedBlocked("feed redirected to a non-http(s) URL")
        return urllib.request.HTTPRedirectHandler.http_error_302(self, req, fp, code, msg, headers)

    http_error_301 = http_error_303 = http_error_307 = http_error_302
    if hasattr(urllib.request.HTTPRedirectHandler, "http_error_308"):
        http_error_308 = http_error_302

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if self._watch is not None:
            self._watch.check()  # no new lookup once the fetch deadline has passed
        try:
            _url, parts = validate_feed_url(newurl)
            if not self._allow_private:
                check_feed_host(parts.hostname, parts.port or _default_port(parts.scheme))
        except (ValueError, FeedBlocked):
            fp.close()
            raise FeedBlocked("feed redirected to an address that is not allowed")
        return urllib.request.HTTPRedirectHandler.redirect_request(self, req, fp, code, msg, headers, newurl)


def build_feed_opener(allow_private=False, watch=None):
    """urllib opener for feeds: guarded http(s), redirects, errors; no proxies, no file:/ftp:/data:."""
    opener = urllib.request.OpenerDirector()
    handlers = [_GuardedHTTPHandler(allow_private, watch)]
    if ssl is not None:
        handlers.append(_GuardedHTTPSHandler(allow_private, watch))
    handlers += [_FeedRedirectHandler(allow_private, watch), urllib.request.HTTPDefaultErrorHandler(),
                 urllib.request.HTTPErrorProcessor(), urllib.request.UnknownHandler()]
    for handler in handlers:
        opener.add_handler(handler)
    return opener


def fetch_feed(url, allow_private=False):
    """Downloads a feed (at most MAX_FEED_BYTES, within about FEED_DEADLINE_SECONDS). Raises FeedBlocked or
    FeedError. The SSRF guard lives in the connections: only public addresses are dialled, then the peer is
    checked, for the feed URL and every redirect alike."""
    request = urllib.request.Request(url, headers={
        "User-Agent": FEED_USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    })
    watch = _FetchWatch(FEED_DEADLINE_SECONDS)
    timer = threading.Timer(FEED_DEADLINE_SECONDS, watch.expire)
    timer.daemon = True
    timer.start()
    data = bytearray()
    try:
        with build_feed_opener(allow_private, watch).open(request, timeout=FEED_TIMEOUT_SECONDS) as resp:
            read = getattr(resp, "read1", None) or resp.read  # read1: return what has arrived, don't wait for 64 KB
            while len(data) <= MAX_FEED_BYTES:
                chunk = read(min(65536, MAX_FEED_BYTES + 1 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
    except FeedBlocked:
        raise
    except urllib.error.HTTPError as exc:
        try:
            exc.close()
        except Exception:
            pass
        raise FeedError("feed server answered HTTP %d" % exc.code)
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, FeedBlocked):
            raise exc.reason
        raise FeedError("feed took too long to download" if watch.expired else "could not reach the feed server")
    except (FeedError, OSError, http.client.HTTPException, ValueError) as exc:
        raise FeedError("feed took too long to download" if watch.expired else
                        str(exc) if isinstance(exc, FeedError) else "could not download the feed")
    except Exception:  # e.g. MemoryError / OverflowError from an absurd length: still a plain fetch failure
        raise FeedError("feed took too long to download" if watch.expired else "could not download the feed")
    finally:
        timer.cancel()
    if watch.expired:
        raise FeedError("feed took too long to download")
    if len(data) > MAX_FEED_BYTES:
        raise FeedError("feed is larger than 2 MB")
    return bytes(data)


_TAG_RE = re.compile(r"<[^<>]*>")  # linear: a match attempt never scans past the next "<"
_SPACE_RE = re.compile(r"\s+")
_LONG_CHARREF_RE = re.compile(r"&#([0-9]{8,});?")


def _short_charref(match):
    # html.unescape() int()s a decimal reference, which raises ValueError past 4300 digits (Python's
    # int_max_str_digits). Eight significant digits are already beyond U+10FFFF, i.e. U+FFFD.
    digits = match.group(1).lstrip("0")
    return "&#%s;" % digits if 0 < len(digits) < 8 else "\ufffd"


def _plain_text(value):
    """Feed text without markup: tags dropped, entities decoded, whitespace collapsed (in linear time)."""
    text = value or ""
    if len(text) > FEED_TEXT_LIMIT:
        # titles / summaries end up as 70 / 180 characters: megabytes need no cleaning
        text = text[:FEED_TEXT_LIMIT]
        cut = text.rfind("<")
        if cut > text.rfind(">"):
            text = text[:cut]  # no half tag at the end
    text = html.unescape(_LONG_CHARREF_RE.sub(_short_charref, _TAG_RE.sub(" ", text)))
    return _SPACE_RE.sub(" ", text).strip()


def _local_name(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _child_text(el, names):
    children = [c for c in el if isinstance(c.tag, str)]
    for wanted in names:
        for child in children:
            if _local_name(child.tag) == wanted:
                text = "".join(child.itertext()).strip()
                if text:
                    return text
    return ""


def _entry_link(el):
    # RSS: <link>url</link>; Atom: <link href="url" rel="alternate"/>
    fallback = ""
    for child in el:
        if _local_name(child.tag) != "link":
            continue
        href = (child.get("href") or "").strip()
        if href:
            if (child.get("rel") or "alternate").strip().lower() == "alternate":
                return href
            fallback = fallback or href
        else:
            text = "".join(child.itertext()).strip()
            if text:
                return text
    return fallback


def parse_feed(data, limit=FEED_ITEMS_PER_POLL):
    """RSS <item> / Atom <entry> elements as dicts (title, link, summary, format). Raises FeedError."""
    if data.startswith((b"\xfe\xff", b"\xff\xfe")) or b"\x00" in data:
        raise FeedError("feed encoding is not supported")
    lowered = data.lower()
    if b"<!doctype" in lowered or b"<!entity" in lowered:
        raise FeedError("feed declares a DTD or entities (not accepted)")
    try:
        root = ET.fromstring(data)
    except Exception:
        raise FeedError("feed is not valid XML")
    entries = []
    for el in root.iter():
        name = _local_name(el.tag)
        if name in ("item", "entry"):
            entries.append({
                "title": _plain_text(_child_text(el, ("title",))),
                "link": _entry_link(el),
                "summary": _plain_text(_child_text(el, ("description", "summary", "content", "encoded"))),
                "format": "Atom" if name == "entry" else "RSS 2.0",
            })
            if len(entries) >= limit:
                break
    return entries


def classify_headline(title):
    """Heuristic country / category detection from (Korean) headline keywords."""
    matched_country = "US"
    cat = "domestic"
    if any(w in title for w in ["한국", "서울", "대통령", "K-", "반도체"]):
        matched_country = "KR"
    elif any(w in title for w in ["중국", "베이징", "시진핑", "대만"]):
        matched_country = "CN"
    elif any(w in title for w in ["러시아", "푸틴", "우크라이나", "모스크바"]):
        matched_country = "RU"
        cat = "conflict"
    elif any(w in title for w in ["이란", "이스라엘", "가자", "중동", "하마스"]):
        matched_country = "IR"
        cat = "conflict"
    elif any(w in title for w in ["일본", "도쿄"]):
        matched_country = "JP"
    elif any(w in title for w in ["협정", "회담", "조약", "정상"]):
        cat = "treaty"
    elif any(w in title for w in ["전쟁", "미사일", "공습", "폭격", "군사"]):
        cat = "conflict"
    elif any(w in title for w in ["금리", "연준", "환율", "무역", "증시"]):
        cat = "trade"
    return matched_country, cat


def ingest_feed_items(entries):
    """Converts parsed feed entries to globe events through the sanitiser and the store."""
    stamp = int(time.time())
    ingested = []
    for idx, entry in enumerate(entries):
        title = entry["title"] or "글로벌 뉴스"
        matched_country, cat = classify_headline(title)
        event = normalize_event({
            "id": f"rss-{stamp}-{idx}",
            "title": title[:70],
            "summary": (entry["summary"] or title)[:180],
            "category": cat,
            "primaryCountry": matched_country,
            "sourceName": "RSS Feed",
            "sources": [{"name": "Live RSS Stream", "tier": entry["format"], "url": entry["link"] or "#",
                         "reliability": 90}]
        })
        ingested.append(store_event(event))
    return ingested


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------
_NO_BODY = object()
_LOG_UNSAFE_RE = re.compile(r"[^\x20-\x7e]")
_API_SOURCES = [
    {"id": "webhook", "name": "Custom REST API / Webhook", "status": "active", "endpoint": "/api/events"},
    {"id": "sse_stream", "name": "Server-Sent Events (SSE)", "status": "active", "endpoint": "/api/stream"},
    {"id": "rss_poller", "name": "RSS Feed Ingestion Pipeline", "status": "active", "endpoint": "/api/pipeline/poll-rss"},
    {"id": "gdelt", "name": "GDELT Conflict Database Connector", "status": "ready", "endpoint": "/api/pipeline/gdelt"}
]


def _utc_iso():
    """ISO 8601 UTC timestamp with a "Z" suffix."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _client_closed(sock):
    """True once an SSE client has closed its side (it never sends anything after the request)."""
    timeout = sock.gettimeout()
    try:
        sock.setblocking(False)
        return sock.recv(1, socket.MSG_PEEK) == b""
    except (BlockingIOError, InterruptedError):
        return False  # still connected, nothing to read
    except OSError:
        return True
    finally:
        try:
            sock.settimeout(timeout)
        except OSError:
            pass


class _RequestReader(io.RawIOBase):
    """The handler's raw input. Each recv waits at most until the request deadline, so a client that
    trickles its request a byte at a time is cut off like one that stalls; while `budget` is set (the
    header section) at most that many more bytes are read."""

    def __init__(self, sock, idle_timeout, deadline):
        io.RawIOBase.__init__(self)
        self._sock = sock
        self._idle = idle_timeout
        self.deadline = deadline
        self.budget = None

    def readable(self):
        return True

    def readinto(self, buf):
        size = len(buf)
        if self.budget is not None:
            if self.budget <= 0:
                raise http.client.LineTooLong("header section")  # parse_request() answers 431
            size = min(size, self.budget)
        left = self.deadline - time.monotonic()
        if left <= 0:
            raise socket.timeout("request not received within %d seconds" % REQUEST_DEADLINE_SECONDS)
        self._sock.settimeout(left if self._idle is None else min(self._idle, left))
        try:
            n = self._sock.recv_into(buf, size)
        finally:
            self._sock.settimeout(self._idle)  # writes keep the normal timeout
        if self.budget is not None:
            self.budget -= n
        return n


def _refuse_busy(sock):
    """Over MAX_CONNECTIONS: a 503 written straight from the accept loop (no thread, nothing read yet)."""
    body = json_bytes({"error": "Server is busy, try again shortly", "code": "server_busy"})
    head = ("HTTP/1.0 503 Service Unavailable\r\nServer: SpinningNews\r\n"
            "Content-Type: application/json; charset=utf-8\r\nContent-Length: %d\r\nRetry-After: 5\r\n"
            "Connection: close\r\nX-Content-Type-Options: nosniff\r\n"
            "Referrer-Policy: strict-origin-when-cross-origin\r\n\r\n" % len(body))
    try:
        sock.setblocking(False)
        sock.send(head.encode("ascii") + body)
        sock.shutdown(socket.SHUT_WR)
    except OSError:
        pass


def _discard_input(sock, chunks=4):
    """Reads (non-blocking, bounded) what a refused client sent: closing a socket with unread input
    resets the connection, and the reset can destroy the reply before the client has read it."""
    for _ in range(chunks):
        try:
            if not sock.recv(65536):
                return
        except OSError:  # BlockingIOError: nothing more has arrived
            return


def _drain_socket(sock, limit=1 << 20, seconds=2.0):
    """Lingering close after an early error reply: drop what the client still sends (bounded), so that
    closing the socket does not reset the connection before the client has read the reply."""
    try:
        sock.shutdown(socket.SHUT_WR)
    except OSError:
        return
    deadline = time.monotonic() + seconds
    try:
        while limit > 0:
            left = deadline - time.monotonic()
            if left <= 0:
                break
            sock.settimeout(left)
            chunk = sock.recv(min(65536, limit))
            if not chunk:
                break
            limit -= len(chunk)
    except OSError:
        pass


class SpinningNewsHandler(http.server.SimpleHTTPRequestHandler):
    """Static allowlist, JSON API and SSE. One request per connection (HTTP/1.0)."""

    server_version = "SpinningNews"
    timeout = REQUEST_TIMEOUT_SECONDS

    def __init__(self, *args, **kwargs):
        self._extra_headers = []
        self._body_pending = False
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    # -- plumbing ------------------------------------------------------------
    def setup(self):
        super().setup()
        # the request (line, headers, body) must arrive within REQUEST_DEADLINE_SECONDS in all
        self.rfile.close()
        self._reader = _RequestReader(self.connection, self.timeout, time.monotonic() + REQUEST_DEADLINE_SECONDS)
        self.rfile = io.BufferedReader(self._reader)

    def parse_request(self):
        # http.server alone accepts 100 header lines of 64 KB each
        self._reader.budget = MAX_HEADER_BYTES
        try:
            return super().parse_request()
        finally:
            self._reader.budget = None

    def version_string(self):
        return self.server_version

    def _cfg(self):
        cfg = getattr(self.server, "settings", None)
        return cfg if cfg is not None else resolve_settings(DEFAULT_HOST, {})

    def end_headers(self):
        # on every response; no blanket CORS (only allowed origins get it, per response)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        extra, self._extra_headers = self._extra_headers, []
        for name, value in extra:
            self.send_header(name, value)
        super().end_headers()

    def log_message(self, format, *args):
        # request lines come from the network: escape what could drive the terminal
        message = _LOG_UNSAFE_RE.sub(lambda m: m.group().encode("unicode_escape").decode("ascii"), format % args)
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), message))

    def finish(self):
        try:
            super().finish()
        finally:
            if self._body_pending:
                self._body_pending = False
                _drain_socket(self.connection)

    def send_error(self, code, message=None, explain=None):
        """Protocol-level errors (bad request line, unsupported method, oversized headers, ...) as JSON too."""
        try:
            short = self.responses[code][0]
        except KeyError:
            short = "Error"
        if code == 431:
            message = "Request headers are too large"
        # the client may still be sending (the rest of a long request line or of its headers, a body)
        self._body_pending = True
        text = clean_text(message, 160) or short
        self.log_error("code %d, message %s", code, text)
        self.send_response(code, short)
        self.send_header("Connection", "close")
        body = b""
        if code >= 200 and code not in (204, 205, 304):
            body = json_bytes({"error": text, "code": "not_found" if code == 404 else "bad_request"})
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD" and body:
            self.wfile.write(body)

    def _send_json(self, status, obj, headers=()):
        body = json_bytes(obj)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_error_json(self, status, code, message, headers=()):
        self._send_json(status, {"error": message, "code": code}, headers)

    def _route(self):
        # exact URL path: the query (cache-busting ?v=...) is ignored, nothing is decoded or normalised
        return (self.path or "").split("?", 1)[0].split("#", 1)[0]

    def _begin(self):
        """Per-request setup and the Host check. False when an error reply was already sent."""
        self._extra_headers = []
        # a body we never read must be drained before closing (see finish)
        length = (self.headers.get("Content-Length") or "").strip()
        self._body_pending = (self.command == "POST" or self.headers.get("Transfer-Encoding") is not None
                              or length not in ("", "0"))
        cfg = self._cfg()
        if not cfg.host_check:
            return True
        # DNS-rebinding defence: a page on evil.example resolved to 127.0.0.1 still sends its own Host
        hosts = self.headers.get_all("Host") or []
        if len(hosts) != 1 or not hosts[0].strip():
            self._send_error_json(400, "bad_request", "Missing or repeated Host header")
            return False
        if split_host_port(hosts[0])[0] not in cfg.allowed_hosts:
            self._send_error_json(403, "bad_host", "Host not allowed")
            return False
        return True

    def _cors_headers(self, write):
        """CORS for one API response: listed origins are echoed; "*" covers reads only."""
        cfg = self._cfg()
        origin = self.headers.get("Origin")
        normalized = normalize_origin(origin)
        if normalized is not None and normalized in cfg.cors_origins:
            return [("Access-Control-Allow-Origin", origin.strip()), ("Vary", "Origin")]
        if cfg.cors_any and not write:
            return [("Access-Control-Allow-Origin", "*")]
        return [("Vary", "Origin")] if cfg.cors_origins else []

    # -- GET / HEAD ------------------------------------------------------------
    def do_GET(self):
        self._handle_read()

    def do_HEAD(self):
        # SimpleHTTPRequestHandler.do_HEAD would answer for any file in the folder
        self._handle_read()

    def _handle_read(self):
        if not self._begin():
            return
        path = self._route()
        if path == "/api/stream":
            return self._serve_stream()
        if path == "/api/events":
            with events_lock:
                data = list(custom_events)
            return self._send_json(200, {"status": "success", "count": len(data), "events": data},
                                   self._cors_headers(write=False))
        if path == "/api/sources":
            return self._send_json(200, {"status": "success", "sources": _API_SOURCES},
                                   self._cors_headers(write=False))
        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        name = STATIC_FILES.get(path)
        if name is None or not os.path.isfile(os.path.join(BASE_DIR, name)):
            cors = self._cors_headers(write=False) if path.startswith("/api/") else ()
            return self._send_error_json(404, "not_found", "Not found", cors)
        # map to the canonical file and let SimpleHTTPRequestHandler send it (Last-Modified, 304)
        self.path = "/" + name
        self._extra_headers.append(("Cache-Control", "no-cache"))
        if self.command == "HEAD":
            http.server.SimpleHTTPRequestHandler.do_HEAD(self)
        else:
            http.server.SimpleHTTPRequestHandler.do_GET(self)

    def guess_type(self, path):
        return STATIC_TYPES.get(os.path.splitext(path)[1].lower(), "application/octet-stream")

    def _serve_stream(self):
        cors = self._cors_headers(write=False)
        stream_headers = [("Content-Type", "text/event-stream"), ("Cache-Control", "no-cache"),
                          ("Connection", "keep-alive")] + cors
        if self.command == "HEAD":
            self.send_response(200)
            for name, value in stream_headers:
                self.send_header(name, value)
            self.end_headers()
            self.close_connection = True  # one request per connection ("keep-alive" above is for the client)
            return

        subscriber = _Subscriber(client_key(self.client_address[0]))
        with sse_lock:
            if len(sse_subscribers) >= MAX_SSE_SUBSCRIBERS:
                refusal = "Too many live streams are open"
            elif subscriber.client is not None and sum(
                    1 for s in sse_subscribers if s.client == subscriber.client) >= SSE_STREAMS_PER_CLIENT:
                refusal = "Too many live streams from this address"  # one client cannot take every slot
            else:
                refusal = None
                sse_subscribers.append(subscriber)
                total = len(sse_subscribers)
        if refusal:
            return self._send_error_json(503, "too_many_streams", refusal, cors + [("Retry-After", "30")])
        try:
            self.send_response(200)
            for name, value in stream_headers:
                self.send_header(name, value)
            self.end_headers()

            # Send immediate handshake packet
            with events_lock:
                stored = len(custom_events)
            self.wfile.write(_sse_frame({
                "type": "handshake",
                "connectedAt": _utc_iso(),
                "totalSubscribers": total,
                "customEventsCount": stored
            }))
            self.wfile.flush()

            # Relay queued events; keep the connection alive with a heartbeat every 15 s
            next_beat = time.monotonic() + SSE_HEARTBEAT_SECONDS
            while not subscriber.lagging:
                wait = next_beat - time.monotonic()
                if wait <= 0:
                    self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
                    next_beat = time.monotonic() + SSE_HEARTBEAT_SECONDS
                    continue
                try:
                    frame = subscriber.queue.get(timeout=min(wait, 1.0))
                except queue.Empty:
                    if _client_closed(self.connection):
                        break  # frees the slot now instead of at the next failed write
                    continue
                self.wfile.write(frame)
                self.wfile.flush()
        except (OSError, ValueError):
            pass  # the client went away
        finally:
            # one request per connection: never wait for another request after a stream (send_header()
            # turned "Connection: keep-alive" into close_connection = False)
            self.close_connection = True
            with sse_lock:
                if subscriber in sse_subscribers:
                    sse_subscribers.remove(subscriber)

    # -- OPTIONS (CORS preflight) -----------------------------------------------
    def do_OPTIONS(self):
        if not self._begin():
            return
        if not self._route().startswith("/api/"):
            return self._send_error_json(404, "not_found", "Not found")
        cfg = self._cfg()
        origin = self.headers.get("Origin")
        normalized = normalize_origin(origin)
        method = (self.headers.get("Access-Control-Request-Method") or "").strip().upper()
        if normalized is not None and normalized in cfg.cors_origins:
            allow_origin = origin.strip()
        elif cfg.cors_any and method in ("GET", "HEAD"):
            allow_origin = "*"
        else:
            return self._send_error_json(403, "forbidden_origin", "Origin not allowed", [("Vary", "Origin")])
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", allow_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Vary", "Origin")
        self.end_headers()

    # -- POST (writes) -------------------------------------------------------------
    def do_POST(self):
        if not self._begin():                       # 1. Host
            return
        path = self._route()
        if path not in ("/api/events", "/api/pipeline/poll-rss"):
            return self._send_error_json(404, "not_found", "Not found")
        cors = self._cors_headers(write=True)
        if not self._check_write_origin():          # 2. Origin
            return
        if not self._check_token(cors):             # 3. token
            return
        payload = self._read_json_body(cors, allow_empty=(path == "/api/pipeline/poll-rss"))  # 4.-6.
        if payload is _NO_BODY:
            return
        if path == "/api/events":
            self._ingest_event(payload, cors)
        else:
            self._poll_rss(payload, cors)

    def _check_write_origin(self):
        origins = self.headers.get_all("Origin")
        if not origins:
            return True  # not a browser (curl, scripts, the test harness)
        if len(origins) == 1:
            origin = origins[0]
            if is_same_origin(origin, self.headers.get("Host", "")):
                return True
            normalized = normalize_origin(origin)
            if normalized is not None and normalized in self._cfg().cors_origins:
                return True
        self._send_error_json(403, "forbidden_origin", "Cross-origin writes are not allowed")
        return False

    def _check_token(self, cors):
        token = self._cfg().token
        if not token:
            return True
        scheme, _, value = (self.headers.get("Authorization") or "").strip().partition(" ")
        presented = value.strip().encode("latin-1", "replace")
        if scheme.lower() == "bearer" and presented and hmac.compare_digest(presented, token.encode("utf-8")):
            return True
        self._send_error_json(401, "unauthorized", "Missing or invalid write token",
                              cors + [("WWW-Authenticate", "Bearer")])
        return False

    def _read_json_body(self, cors, allow_empty=False):
        ctype = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            self._send_error_json(415, "unsupported_media_type", "Content-Type must be application/json", cors)
            return _NO_BODY
        if self.headers.get("Transfer-Encoding") is not None:
            self._send_error_json(411, "length_required", "Send a Content-Length (chunked bodies are not accepted)", cors)
            return _NO_BODY
        lengths = self.headers.get_all("Content-Length") or []
        if not lengths:
            self._send_error_json(411, "length_required", "Content-Length is required", cors)
            return _NO_BODY
        raw_length = lengths[0].strip()
        if len(lengths) > 1 or not re.fullmatch(r"[0-9]+", raw_length):
            self._send_error_json(400, "bad_request", "Invalid Content-Length", cors)
            return _NO_BODY
        digits = raw_length.lstrip("0") or "0"
        if len(digits) > 9 or int(digits) > MAX_BODY_BYTES:
            self._send_error_json(413, "payload_too_large", "Request body is larger than 64 KB", cors)
            return _NO_BODY
        length = int(digits)
        try:
            raw = self.rfile.read(length) if length else b""
        except (OSError, ValueError):
            self.close_connection = True  # the client stalled or vanished mid-body
            return _NO_BODY
        if len(raw) < length:
            self._send_error_json(400, "bad_request", "Request body is shorter than Content-Length", cors)
            return _NO_BODY
        self._body_pending = False
        if not raw and allow_empty:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:  # UnicodeDecodeError, ValueError, RecursionError (deep nesting)
            self._send_error_json(400, "bad_json", "Body must be valid UTF-8 JSON", cors)
            return _NO_BODY

    def _normalize_event(self, p):
        """Earlier versions sanitised here; kept for callers of the old method (see normalize_event)."""
        return normalize_event(p)

    def _ingest_event(self, payload, cors):
        # 1. REST API: Ingest New Custom Geopolitical Event
        if not isinstance(payload, dict):
            return self._send_error_json(400, "invalid_event", "Event must be a JSON object", cors)
        try:
            event = normalize_event(payload)
        except Exception as exc:  # defensive: the sanitiser is meant to accept any object
            self.log_error("event rejected: %r", exc)
            return self._send_error_json(400, "invalid_event", "Event could not be processed", cors)
        event = store_event(event)
        self._send_json(201, {
            "status": "success",
            "message": "Event successfully ingested and broadcast to 3D Globe",
            "event": event
        }, cors)

    def _poll_rss(self, body, cors):
        # 2. Pipeline: Poll and Ingest Live RSS / Atom Feed
        if not isinstance(body, dict):
            return self._send_error_json(400, "bad_request", "Body must be a JSON object", cors)
        url = body.get("url")
        if url is None:
            url = DEFAULT_RSS_URL
        try:
            url, _parts = validate_feed_url(url)
        except ValueError as exc:
            return self._send_error_json(400, "bad_request", str(exc), cors)
        # the slot is taken before any name is resolved: a blocked URL uses it up too, so lookups (and
        # what a blocked / not blocked answer tells about a name) are limited to one poll per interval
        wait = RSS_RATE_LIMIT.try_acquire()
        if wait:
            return self._send_error_json(
                429, "rate_limited", "One RSS poll every %d seconds" % RSS_POLL_INTERVAL_SECONDS,
                cors + [("Retry-After", str(max(1, int(math.ceil(wait)))))])
        try:
            # SSRF guard: fetch_feed() resolves the host and dials it only when every address is public
            entries = parse_feed(fetch_feed(url, self._cfg().allow_private_feeds))
            ingested_events = ingest_feed_items(entries)
        except FeedBlocked as exc:
            return self._send_error_json(400, "feed_not_allowed", str(exc), cors)
        except FeedError as exc:
            self.log_error("RSS poll failed: %s", exc)
            return self._send_error_json(502, "feed_fetch_failed", str(exc), cors)
        except Exception as exc:  # whatever a hostile feed triggers, the client still gets a JSON answer
            self.log_error("RSS poll failed: %s", type(exc).__name__)
            return self._send_error_json(502, "feed_fetch_failed", "feed could not be processed", cors)
        self._send_json(200, {
            "status": "success",
            "rssUrl": url,
            "ingestedCount": len(ingested_events),
            "events": ingested_events
        }, cors)


# ---------------------------------------------------------------------------
# Server and startup
# ---------------------------------------------------------------------------
_CLIENT_GONE = (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, socket.timeout)


class SpinningNewsServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """A thread per connection, so a long-lived SSE stream never blocks static files or POST ingest.
    At most MAX_CONNECTIONS at a time: the next ones get an immediate 503 instead of a thread."""

    daemon_threads = True
    # On Windows SO_REUSEADDR lets another process bind the very same port: keep it off there.
    allow_reuse_address = os.name != "nt"
    request_queue_size = 64

    def __init__(self, server_address, handler_class=SpinningNewsHandler, settings=None):
        self.settings = settings if settings is not None else resolve_settings(server_address[0], {})
        self._slots = threading.BoundedSemaphore(MAX_CONNECTIONS)
        self._busy_log = RateLimiter(10)
        self._refused = []  # (close_at, socket) of connections answered 503, closed a moment later
        if ":" in server_address[0]:
            self.address_family = socket.AF_INET6
        socketserver.TCPServer.__init__(self, server_address, handler_class)

    def process_request(self, request, client_address):
        if not self._slots.acquire(False):
            if not self._busy_log.try_acquire():
                sys.stderr.write("%d connections open: refusing new ones with 503 for now\n" % MAX_CONNECTIONS)
            _refuse_busy(request)
            if len(self._refused) < MAX_CONNECTIONS:
                self._refused.append((time.monotonic() + 1.0, request))  # see service_actions()
            else:
                self.close_request(request)
            return
        try:
            socketserver.ThreadingMixIn.process_request(self, request, client_address)
        except BaseException:
            self._slots.release()  # the thread never started
            raise

    def process_request_thread(self, request, client_address):
        try:
            socketserver.ThreadingMixIn.process_request_thread(self, request, client_address)
        finally:
            self._slots.release()

    def service_actions(self):
        # serve_forever() calls this between requests: close the refused connections whose clients had
        # a second to read the 503, dropping what they sent first (see _discard_input)
        if self._refused:
            now = time.monotonic()
            due = [sock for close_at, sock in self._refused if close_at <= now]
            self._refused = [item for item in self._refused if item[0] > now]
            for sock in due:
                _discard_input(sock)
                self.close_request(sock)

    def server_close(self):
        for _close_at, sock in self._refused:
            self.close_request(sock)
        self._refused = []
        super().server_close()

    def handle_error(self, request, client_address):
        # a client that disconnects or stalls is routine, not a traceback
        if isinstance(sys.exc_info()[1], _CLIENT_GONE):
            return
        socketserver.TCPServer.handle_error(self, request, client_address)


def create_server(settings, port):
    return SpinningNewsServer((settings.host, port), SpinningNewsHandler, settings)


def _display_url(settings, port):
    host = settings.host
    if host in _WILDCARD_HOSTS:
        host = "localhost"
    elif ":" in host:
        host = "[" + host + "]"
    return "http://%s:%d" % (host, port)


def print_banner(settings, port):
    url = _display_url(settings, port)
    listen = "  (listening on all interfaces)" if settings.host in _WILDCARD_HOSTS else ""
    lines = [
        "",
        "=======================================================",
        "🛰️  SPINNING NEWS - Real-Time Geopolitical Core Engine",
        "=======================================================",
        f"📡 Web Application  : {url}{listen}",
        "🔒 Mode             : " + ("local only" if settings.loopback else "exposed — writes need the token"),
    ]
    if settings.token_source == "env":
        lines.append("🔑 Write Token      : (from SPINNING_NEWS_TOKEN)")
    elif settings.token_source == "generated":
        lines.append(f"🔑 Write Token      : {settings.token}")
        lines.append("                     send it as  Authorization: Bearer <token>")
    if settings.cors_origins or settings.cors_any:
        origins = sorted(settings.cors_origins) + (["* (reads only)"] if settings.cors_any else [])
        lines.append("🌍 CORS Origins     : " + ", ".join(origins))
    lines += [
        f"⚡ Ingest Webhook    : POST {url}/api/events",
        f"🔴 Live SSE Stream   : GET  {url}/api/stream",
        f"📰 RSS Auto-Feeder   : POST {url}/api/pipeline/poll-rss",
        "=======================================================",
        "",
    ]
    print("\n".join(lines), flush=True)


def _utf8_console():
    # Windows consoles (cp949 / cp1252) cannot encode emoji: a log line must never kill the server
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _port_number(text):
    try:
        port = int(text)
    except ValueError:
        raise argparse.ArgumentTypeError("port must be a number (0-65535)")
    if not 0 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be 0-65535")
    return port


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="server.py", description="Spinning News server: front end, ingest API, SSE stream and RSS poller.")
    parser.add_argument("port", nargs="?", type=_port_number, default=DEFAULT_PORT,
                        help="TCP port (default %d)" % DEFAULT_PORT)
    parser.add_argument("--host", default=None,
                        help="bind address (default: SPINNING_NEWS_HOST or %s; anything else needs a token)" % DEFAULT_HOST)
    return parser.parse_args(argv)


def main(argv=None):
    _utf8_console()
    args = parse_args(sys.argv[1:] if argv is None else argv)
    settings = resolve_settings(args.host, os.environ)
    try:
        httpd = create_server(settings, args.port)
    except OSError as exc:
        print(f"❌ Cannot listen on {settings.host or '*'} port {args.port}: {exc}", file=sys.stderr)
        return 1
    with httpd:
        print_banner(settings, httpd.server_address[1])
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
