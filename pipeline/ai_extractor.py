#!/usr/bin/env python3
"""
SPINNING NEWS - AI News-to-3D Extractor Pipeline
Takes raw unformatted news text (from web scrapers, Telegram channels, or Twitter/X),
prompts an LLM (Gemini / OpenAI / Local Ollama) to extract structured geopolitical schema,
and posts directly into the Spinning News 3D Globe via Webhook.

Environment:
  SPINNING_NEWS_URL    server base URL (default http://localhost:8080)
  SPINNING_NEWS_TOKEN  write token, sent as "Authorization: Bearer <token>" when set
                       (required when the server is exposed beyond localhost)
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE_URL = (os.environ.get("SPINNING_NEWS_URL") or "http://localhost:8080").strip().rstrip("/")
WEBHOOK_URL = BASE_URL + "/api/events"
TOKEN = (os.environ.get("SPINNING_NEWS_TOKEN") or "").strip()

SYSTEM_PROMPT = """
You are a Geopolitical Intelligence Parser.
Given a raw news article or headline, extract the following JSON schema:
{
  "title": "Concise headline (Korean or English, max 60 chars)",
  "summary": "1-2 sentence executive briefing",
  "category": "conflict | treaty | trade | domestic | crisis | space",
  "primaryCountry": "2-letter ISO code (e.g. KR, US, CN, RU, UA, IR, IL, JP, etc.)",
  "countryCodes": ["Primary country code", "Opposing or partner country code if bilateral"],
  "impactScore": integer from 10 to 100
}
Output strictly valid JSON only.
"""


def _utf8_console():
    # Windows consoles (cp949 / cp1252) cannot encode the emoji below
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def parse_with_heuristic_mock(raw_text):
    """Fallback local extractor if no external LLM API key is set."""
    category = "domestic"
    country = "KR"
    countries = ["KR"]

    if any(k in raw_text for k in ["미사일", "공습", "전쟁", "대치", "충돌"]):
        category = "conflict"
        country = "UA"
        countries = ["RU", "UA"]
    elif any(k in raw_text for k in ["협정", "조약", "회담", "합의"]):
        category = "treaty"
        country = "KR"
        countries = ["KR", "US"]
    elif any(k in raw_text for k in ["반도체", "금리", "무역", "수출"]):
        category = "trade"
        country = "US"
        countries = ["US", "CN"]

    return {
        "title": raw_text[:50],
        "summary": raw_text,
        "category": category,
        "primaryCountry": country,
        "countryCodes": countries,
        "impactScore": 85,
        "sourceName": "AI Auto-Extractor"
    }


def _error_text(err):
    """The server's JSON error ({"error", "code"}) carried by an HTTPError, else its raw text."""
    try:
        raw = err.read(65536).decode("utf-8", "replace")
    except Exception:
        raw = ""
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and data.get("error"):
            return f"{data['error']} ({data.get('code', 'error')})"
    except ValueError:
        pass
    return raw.strip()[:300] or str(err.reason)


def push_to_globe(event):
    data = json.dumps(event).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(WEBHOOK_URL, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"✨ [AI Ingested] {res.get('event', {}).get('title')}")
            return True
    except urllib.error.HTTPError as e:
        print(f"❌ Error: server rejected the event (HTTP {e.code}): {_error_text(e)}")
    except Exception as e:
        print(f"❌ Error: {e}")
    return False


if __name__ == "__main__":
    _utf8_console()
    sample_raw_news = "우크라이나 남부 헤르손 전선에서 야간 포격전이 격화되며 드론 요격 체계가 비상 가동되었습니다."
    print(f"🤖 Processing raw news with AI Pipeline ({WEBHOOK_URL})...")
    parsed = parse_with_heuristic_mock(sample_raw_news)
    # the sample headline is made up: label it as test data on the globe
    parsed["title"] = "[테스트] " + parsed["title"]
    parsed["demo"] = True
    print(json.dumps(parsed, indent=2, ensure_ascii=False))
    sys.exit(0 if push_to_globe(parsed) else 1)
