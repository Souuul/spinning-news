#!/usr/bin/env python3
"""
SPINNING NEWS - Feed Ingestion Example Client
Demonstrates how to push custom geopolitical news or AI agent detections
directly to the 3D Globe in real-time.

The sample events below are fictional: they are sent with "demo": true and a "[테스트] " title prefix.

Environment:
  SPINNING_NEWS_URL    server base URL (default http://localhost:8080)
  SPINNING_NEWS_TOKEN  write token, sent as "Authorization: Bearer <token>" when set
                       (required when the server is exposed beyond localhost)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE_URL = (os.environ.get("SPINNING_NEWS_URL") or "http://localhost:8080").strip().rstrip("/")
SERVER_URL = BASE_URL + "/api/events"
TOKEN = (os.environ.get("SPINNING_NEWS_TOKEN") or "").strip()


def _utf8_console():
    # Windows consoles (cp949 / cp1252) cannot encode the emoji below
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _headers():
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = "Bearer " + TOKEN
    return headers


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


def send_event(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(SERVER_URL, data=data, headers=_headers(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            res = json.loads(resp.read().decode("utf-8"))
            print(f"✅ [SUCCESS] Ingested: {res.get('event', {}).get('title')}")
            return True
    except urllib.error.HTTPError as e:
        print(f"❌ [ERROR] Server rejected the event (HTTP {e.code}): {_error_text(e)}")
    except Exception as e:
        print(f"❌ [ERROR] Failed to send event: {e}")
    return False


if __name__ == "__main__":
    _utf8_console()
    print(f"🚀 Sending Sample Intelligence Events to 3D Globe ({SERVER_URL})...")

    # 1. Bilateral Conflict Example (Creates a glowing arc between US and IR)
    sample_conflict = {
        "title": "[테스트] 호르무즈 해협 군사 억제 연합 순찰 전개",
        "demo": True,
        "category": "conflict",
        "primaryCountry": "IR",
        "countryCodes": ["US", "IR"],
        "summary": "미 해군 제5함대와 걸프 협력국 순찰정이 호르무즈 북동 해상에서 전면적인 항행의 자유 작전을 개시했습니다.",
        "details": "미 해군 이지스 구축함 2척 및 무인 수상정 편대가 호르무즈 해협 진입로에 전진 배치되었습니다. 인공위성 레이더 분석 결과 12노트 속도로 대열을 형성 중입니다.",
        "impactScore": 92,
        "sourceName": "Demo AI Recon Bot"
    }
    ok = send_event(sample_conflict)

    time.sleep(2)

    # 2. Diplomatic Treaty Example (Creates an emerald arc between KR and US)
    sample_treaty = {
        "title": "[테스트] 한·미 차세대 양자 컴퓨팅 방위 협정 비준",
        "demo": True,
        "category": "treaty",
        "primaryCountry": "KR",
        "countryCodes": ["KR", "US"],
        "summary": "워싱턴에서 차세대 군사 통신망 암호화 및 양자 레이더 공동 연구 협정이 최종 서명되었습니다.",
        "impactScore": 84,
        "sourceName": "Demo Diplomatic Wire"
    }
    ok = send_event(sample_treaty) and ok

    sys.exit(0 if ok else 1)
