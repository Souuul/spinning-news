/**
 * SPINNING NEWS — 3D Global News Radar (UI/UX v4 · information-first HUD)
 *
 * What changed vs v3 (globe texture, polygons and arc filaments are untouched):
 *  - One filter pipeline (eventMatches) feeds the globe, the feed, the counters and the timeline.
 *  - Globe markers: one beacon per event (size = impact, fade = age) with a short headline label,
 *    small flag endpoints where the arcs land, and the familiar country tags as quiet context.
 *  - A throttled label-declutter engine keeps labels from piling on top of each other.
 *  - Hovering a card highlights its beacon + arcs on the globe, and vice versa.
 *  - Event details open in a side drawer so the globe stays visible; the camera frames the whole story.
 *  - Live-ingested events are always visible and never crash on numeric source reliability.
 */

// ---------------------------------------------------------------------------
// 0. Application state
// ---------------------------------------------------------------------------
const state = {
  currentDateIndex: 6,
  dates: ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"],
  selectedCategory: "all",
  searchQuery: "",
  viewMode: "global",
  focusedCountry: null,
  hoveredArc: null,
  hoveredPolygon: null,
  highlightEventId: null,
  countriesGeoJson: [],
  isPlaying: false,
  playSpeed: 1,
  autoOrbit: true,
  showArcs: true,
  selectedEvent: null,
  mousePos: { x: 0, y: 0 },
  lastFiltered: [],
  defaultAltitude: 2.2,
  userTouchedOrbit: false,
  partnerCodes: new Set(),
  raised: null
};

let world; // Globe.gl instance
let playInterval = null;

// ---------------------------------------------------------------------------
// 1. Small utilities
// ---------------------------------------------------------------------------
function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function parseYmd(ymd) {
  const parts = String(ymd || "").split("-").map(Number);
  return new Date(Date.UTC(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1));
}

function formatDateKo(ymd, withWeekday = true) {
  const dt = parseYmd(ymd);
  const base = `${dt.getUTCMonth() + 1}월 ${dt.getUTCDate()}일`;
  return withWeekday ? `${base} (${WEEKDAYS_KO[dt.getUTCDay()]})` : base;
}

function formatDateDots(ymd) {
  const dt = parseYmd(ymd);
  return `${dt.getUTCMonth() + 1}.${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function shortTime(t) {
  const m = /(\d{1,2}:\d{2})/.exec(String(t || ""));
  return m ? m[1] : "";
}

// Parties use sub-codes such as "US-TX", "CN-SH", "ESA", "PIF"; their flag emoji names the country.
function partyCountryCode(p) {
  if (!p) return "";
  const fromFlag = p.flag && typeof emojiToIsoCode === "function" ? emojiToIsoCode(p.flag) : "";
  if (/^[A-Z]{2}$/.test(fromFlag)) return fromFlag;
  const code = String(p.code || "").toUpperCase();
  if (code === "UK") return "GB";
  const m = /^([A-Z]{2})(?:-|$)/.exec(code);
  return m ? m[1] : code;
}

const EXTRA_COUNTRY_NAMES = {
  FJ: "피지", IL: "이스라엘", BE: "벨기에", PIF: "태평양도서국포럼", ESA: "유럽우주국", NL: "네덜란드",
  QA: "카타르", TH: "태국", MY: "말레이시아", NZ: "뉴질랜드", AR: "아르헨티나", NG: "나이지리아", KE: "케냐", ET: "에티오피아"
};

// Extra search words so "한국", "남한", "USA", "UK"… find the right country
const COUNTRY_ALIASES = {
  KR: "한국 남한 Korea ROK", US: "USA America 미합중국 워싱턴", GB: "UK Britain England 잉글랜드", CN: "PRC 중화인민공화국 베이징",
  JP: "Japan 도쿄", RU: "Russia 모스크바", UA: "Ukraine 키이우", IR: "Iran 테헤란", TW: "Taiwan 타이베이", IN: "India 뉴델리",
  EU: "유럽 Europe 브뤼셀", AE: "UAE 아랍에미리트", SA: "사우디 Saudi", ZA: "남아공 South Africa", KP: "북한 North Korea",
  DE: "Germany 독일", FR: "France 프랑스", AU: "Australia 호주", BR: "Brazil 브라질", PH: "Philippines 필리핀"
};

function countrySearchText(code) {
  const p = (typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[code]) || null;
  return `${p ? `${p.name} ${p.englishName}` : countryName(code)} ${code} ${COUNTRY_ALIASES[code] || ""}`;
}

function countryName(code) {
  if (!code) return "";
  if (EXTRA_COUNTRY_NAMES[code] && !(typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[code])) return EXTRA_COUNTRY_NAMES[code];
  if (typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[code]) return COUNTRY_PROFILES[code].name;
  if (typeof MAJOR_COUNTRY_LABELS !== "undefined") {
    const m = MAJOR_COUNTRY_LABELS.find(l => l.code === code);
    if (m) return m.name;
  }
  if (typeof COUNTRY_META !== "undefined" && COUNTRY_META[code]) return COUNTRY_META[code].name;
  return code;
}

// ---------------------------------------------------------------------------
// 2. Category / severity / source model — single source of truth
// ---------------------------------------------------------------------------
const CATEGORY_META = {
  conflict: { label: "분쟁·전쟁", short: "분쟁", color: "#f43f5e", text: "#fda4af", icon: "conflict", relation: "군사 대치",
              arc: ["rgba(244, 63, 94, 0.95)", "rgba(251, 146, 60, 0.8)"] },
  treaty:   { label: "외교·협정", short: "외교", color: "#10b981", text: "#6ee7b7", icon: "treaty", relation: "협력",
              arc: ["rgba(167, 139, 250, 0.95)", "rgba(52, 211, 153, 0.8)"] },
  trade:    { label: "경제·통상", short: "경제", color: "#818cf8", text: "#a5b4fc", icon: "trade", relation: "교역",
              arc: ["rgba(168, 85, 247, 0.95)", "rgba(56, 189, 248, 0.8)"] },
  space:    { label: "우주·항공", short: "우주", color: "#e879f9", text: "#f0abfc", icon: "space", relation: "우주 협력",
              arc: ["rgba(217, 70, 239, 0.95)", "rgba(139, 92, 246, 0.8)"] },
  crisis:   { label: "위기·재난", short: "위기", color: "#f59e0b", text: "#fcd34d", icon: "crisis", relation: "재난 대응",
              arc: ["rgba(251, 146, 60, 0.95)", "rgba(239, 68, 68, 0.8)"] },
  tech:     { label: "기술·산업", short: "기술", color: "#38bdf8", text: "#7dd3fc", icon: "tech", relation: "기술 협력",
              arc: ["rgba(56, 189, 248, 0.95)", "rgba(165, 243, 252, 0.8)"] },
  other:    { label: "기타", short: "기타", color: "#94a3b8", text: "#cbd5e1", icon: "all", relation: "연결",
              arc: ["rgba(167, 139, 250, 0.9)", "rgba(129, 140, 248, 0.7)"] }
};

// Same gradient at low alpha: used for the other arcs while one story is open
function dimArc(colors, alphaA = 0.18, alphaB = 0.14) {
  return colors.map((c, i) => c.replace(/rgba\(([^)]+),\s*[\d.]+\)/, (m, rgb) => `rgba(${rgb}, ${i === 0 ? alphaA : alphaB})`));
}

// Lucide icons (ISC) — inline so nothing depends on emoji rendering
const ICON_PATHS = {
  all: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  conflict: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
  treaty: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
  trade: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  space: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  crisis: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  tech: '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  verified: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  building: '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  satellite: '<path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4 6-6-4-4Z"/><path d="m16 8 3-3"/><path d="M9 21a6 6 0 0 0-6-6"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'
};

function icon(name, size = 14) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

// inline style that hands an element its category colours
function catStyle(evtOrKey) {
  const m = typeof evtOrKey === "string" ? CATEGORY_META[evtOrKey] : categoryMeta(evtOrKey);
  return m ? `--cat:${m.color};--cat-text:${m.text}` : "";
}

// Filter chips (order = header order). "domestic" is a scope filter, not a color.
const FILTER_CHIPS = [
  { key: "all", label: "전체", short: "전체" },
  { key: "conflict", label: "분쟁·전쟁", short: "분쟁" },
  { key: "crisis", label: "위기·재난", short: "위기" },
  { key: "treaty", label: "외교·협정", short: "외교" },
  { key: "trade", label: "경제·통상", short: "경제" },
  { key: "space", label: "우주·항공", short: "우주" },
  { key: "tech", label: "기술·산업", short: "기술" },
  { key: "other", label: "기타", short: "기타" },
  { key: "domestic", label: "국가 내부", short: "국가 내부" }
];

function normalizeCategory(evt) {
  const c = String((evt && (evt.category || evt.type)) || "").toLowerCase();
  if (CATEGORY_META[c]) return c;
  if (c === "economy" || c === "finance") return "trade";
  if (c === "war" || c === "military") return "conflict";
  if (c === "disaster" || c === "incident" || c === "society" || c === "climate") return "crisis";
  if (c === "diplomacy" || c === "alliance") return "treaty";
  return "other"; // RSS "domestic" default and anything unknown
}

function categoryMeta(evt) {
  return CATEGORY_META[normalizeCategory(evt)];
}

function isDomesticEvent(evt) {
  return !!(evt && (evt.isDomestic || evt.type === "domestic"));
}

function isLiveEvent(evt) {
  return !!(evt && evt.isLiveIngested);
}

// Demo data: the bundled stories while NEWS_DATA_IS_DEMO is on, and live test events sent with demo: true
function isDemoEvent(evt) {
  return !!(evt && evt.isDemo === true);
}

// Impact is shown in brightness only, so it never fights the category colour.
function impactTier(score) {
  const s = Number(score) || 0;
  if (s >= 90) return { key: "top", label: "매우 큼" };
  if (s >= 85) return { key: "high", label: "큼" };
  return { key: "mid", label: "보통" };
}

function impactChipHtml(evt) {
  const score = Number(evt && evt.impactScore);
  const tier = impactTier(score);
  const shown = Number.isFinite(score) && score > 0 ? score : "–";
  return `<span class="impact-chip tier-${tier.key}" title="영향도 ${escapeHtml(shown)}/100 · ${tier.label}">${escapeHtml(shown)}</span>`;
}

// "호르무즈 해협 (Strait of Hormuz)" → "호르무즈 해협"; keeps Korean parentheticals like "(테헤란)"
function stripLatinParen(s) {
  return String(s || "").replace(/\s*\((?=[^)]*[A-Za-z])[^)]*\)/g, "").trim();
}

function placeOf(evt) {
  return (evt && evt.place) || stripLatinParen(evt && evt.locationName) || countryName(evt && evt.primaryCountry) || "";
}

function eventCountryCodes(evt) {
  const out = [];
  (evt.countryCodes || []).forEach(c => { if (c && !out.includes(c)) out.push(c); });
  if (!out.length && evt.primaryCountry) out.push(evt.primaryCountry);
  return out;
}

function whoLine(evt, max = 3) {
  const names = [];
  eventCountryCodes(evt).forEach(c => { const n = countryName(c); if (n && !names.includes(n)) names.push(n); });
  return names.length > max ? `${names.slice(0, max).join(" · ")} 외 ${names.length - max}` : names.join(" · ");
}

function relTime(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}

function eventTimeLabel(evt) {
  return isLiveEvent(evt) ? (relTime(evt._receivedAt) || shortTime(evt.time)) : shortTime(evt.time);
}

// Short headline for globe labels: curated `brief`, else a trimmed title.
function eventBrief(evt, max) {
  if (evt && evt.brief) return evt.brief;
  if (max === undefined) max = isLiveEvent(evt) ? 20 : 16;
  let t = String((evt && evt.title) || "").replace(/^\s*\[[^\]]*\]\s*/, "");
  // the head clause carries the news: "핵심 — 부연", "제목 - 연합뉴스", "핵심: 부연" ("속보: 본문" → "본문")
  const parts = t.split(/\s+[-—–|]\s+/);
  if (parts[0].trim().length >= 4) t = parts[0];
  const colon = t.indexOf(": ");
  if (colon >= 6) t = t.slice(0, colon);
  else if (colon >= 0) t = t.slice(colon + 2);
  t = t.replace(/\s*\([^)]*\)/g, "").trim(); // parentheticals
  if (t.length <= max + 4) return t;          // a whole clause beats a cut one
  let cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  if (sp > max * 0.55) cut = cut.slice(0, sp);
  cut = cut.replace(/\s*(및|와|과|의|에|등|,)$/, "");
  return cut + "…";
}

const RELIABILITY_KO = {
  "99% Verified": "검증 99%", "98% High-Res": "고해상 판독 98%", "Tier 1 Confirmed": "1급 매체 확인",
  "Official Release": "공식 발표", "Verified": "검증됨", "Live Sensor Feed": "실시간 센서",
  "Official Sensor Feed": "공식 관측", "Verified Live": "실시간 확인", "Verified Monitor": "현장 감시 확인",
  "Verified Specialist": "전문 매체 확인", "Peer Reviewed": "동료 심사 완료"
};
const SOURCE_TYPE_KO = {
  "Military Satellite": "군사 위성", "SAR Satellite": "레이더 위성", "Climate Satellite": "기후 위성",
  "Global Press": "국제 언론", "National Press": "주요 언론", "Regional Press": "지역 언론", "European Press": "유럽 언론",
  "Financial Press": "경제지", "Economic Press": "경제지", "Business Press": "경제지", "Tech Press": "IT 전문지",
  "Aerospace Press": "항공우주 전문지", "French National Daily": "프랑스 일간지", "Public Broadcaster": "공영 방송",
  "Public Radio": "공영 라디오", "Government Official": "정부 공식", "Government Agency": "정부 기관",
  "EU Official": "EU 공식", "UN Official": "유엔 공식", "Ministry of Trade": "통상 부처", "Central Bank": "중앙은행",
  "Port Authority": "항만 당국", "Military Command": "군 사령부", "Defense Coalition": "방위 협의체",
  "UN Peacekeeping": "유엔 평화유지", "UN Relief Agency": "유엔 구호기구", "Space Agency": "우주 기관",
  "Space Operations Feed": "우주 운용 데이터", "Seismic Sensor Feed": "지진 관측망", "NOAA Alert": "NOAA 경보",
  "Meteorological Agency": "기상청", "Cyber Agency": "사이버보안 기관", "Financial Intelligence": "금융 정보",
  "Regional Intelligence": "지역 분석", "Industry Intelligence": "산업 분석", "Maritime Intelligence": "해운 전문 정보",
  "Aerospace Intel": "항공우주 분석", "Scientific Journal": "학술지", "Tier-1 API": "API 수집", "RSS 2.0": "RSS 수집"
};

// Static dataset uses strings ("Tier 1 Confirmed"); live ingest uses numbers (95).
function sourceReliabilityText(src) {
  if (!src) return "";
  const r = src.reliability;
  if (typeof r === "number") return `신뢰도 ${r}%`;
  const key = String(r || src.tier || "");
  return RELIABILITY_KO[key] || key;
}

function sourceTypeText(src) {
  const key = String((src && (src.type || src.tier)) || "");
  return SOURCE_TYPE_KO[key] || key;
}

function sourceIsTier1(src) {
  if (!src) return false;
  if (typeof src.reliability === "number") return src.reliability >= 90;
  return /tier[\s-]?1|official/i.test(`${src.reliability || ""} ${src.tier || ""}`);
}

const PARTY_ROLE_KO = {
  interceptor: "요격·차단",
  patrol: "초계·감시",
  aggressor: "공격 측",
  defender: "방어 측",
  host: "주최",
  signatory: "서명국",
  mediator: "중재"
};

function sourceIcon(src) {
  const t = String((src && (src.type || src.tier)) || "").toLowerCase();
  if (t.includes("satellite") || t.includes("sensor") || t.includes("telemetry") || t.includes("feed")) return icon("satellite", 16);
  if (t.includes("government") || t.includes("official") || t.includes("agency") || t.includes("bank") || t.includes("command") || t.includes("ministry") || t.includes("un ")) return icon("building", 16);
  return icon("news", 16);
}

// ---------------------------------------------------------------------------
// 3. Shared filtering (globe + feed + counters + timeline all use this)
// ---------------------------------------------------------------------------
function eventMatches(evt, ignore = {}) {
  if (!evt) return false;
  const currentDate = state.dates[state.currentDateIndex];

  if (!ignore.date) {
    if (isLiveEvent(evt)) {
      if (state.currentDateIndex !== state.dates.length - 1) return false;
    } else if (evt.date > currentDate) {
      return false;
    }
  }

  if (!ignore.category && state.selectedCategory !== "all") {
    if (state.selectedCategory === "domestic") {
      if (!isDomesticEvent(evt)) return false;
    } else if (normalizeCategory(evt) !== state.selectedCategory) {
      return false;
    }
  }

  if (!ignore.country && state.focusedCountry) {
    const c = state.focusedCountry;
    if (!((evt.countryCodes || []).includes(c) || evt.primaryCountry === c)) return false;
  }

  if (!ignore.search && state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    const hay = [
      evt.title, evt.brief, evt.place, evt.summary, evt.locationName,
      ...(evt.parties || []).map(p => p && p.name),
      ...(evt.tags || []),
      ...(evt.sources || []).map(s => s && s.name),
      ...(evt.countryCodes || []).map(countrySearchText)
    ].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function getFilteredEvents(ignore) {
  return RAW_NEWS_EVENTS.filter(evt => eventMatches(evt, ignore));
}

function eventAgeDays(evt) {
  if (isLiveEvent(evt)) return 0;
  const i = state.dates.indexOf(evt.date);
  if (i < 0) return 0;
  return Math.max(0, state.currentDateIndex - i);
}

function eventPriority(evt) {
  const age = eventAgeDays(evt);
  const cat = normalizeCategory(evt);
  let score = (Number(evt.impactScore) || 0) - 1.5 * age + (cat === "conflict" ? 2 : cat === "crisis" ? 1 : 0);
  if (isLiveEvent(evt) && Date.now() - (evt._receivedAt || 0) < 600000) score += 500;
  if (state.focusedCountry && eventCountryCodes(evt).includes(state.focusedCountry)) score += 200;
  return score;
}

// Feed order: live first, then newest first (a chronological wire).
// Importance ranking lives in the "주요 이슈" brief.
function sortForFeed(events) {
  return events.slice().sort((a, b) => {
    const la = isLiveEvent(a) ? 1 : 0, lb = isLiveEvent(b) ? 1 : 0;
    if (la !== lb) return lb - la;
    if (la && lb) return (b._receivedAt || 0) - (a._receivedAt || 0);
    const ka = `${a.date}T${shortTime(a.time) || "00:00"}`;
    const kb = `${b.date}T${shortTime(b.time) || "00:00"}`;
    if (ka !== kb) return ka < kb ? 1 : -1;
    return (Number(b.impactScore) || 0) - (Number(a.impactScore) || 0);
  });
}

function rankForBrief(events) {
  return events.slice().sort((a, b) => {
    const ra = (Number(a.impactScore) || 0) - 2 * eventAgeDays(a) + (isLiveEvent(a) ? 3 : 0);
    const rb = (Number(b.impactScore) || 0) - 2 * eventAgeDays(b) + (isLiveEvent(b) ? 3 : 0);
    if (rb !== ra) return rb - ra;
    return `${b.date}${b.time}` > `${a.date}${a.time}` ? 1 : -1;
  });
}

function buildDateRange() {
  const ds = RAW_NEWS_EVENTS
    .filter(e => !isLiveEvent(e) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)))
    .map(e => e.date)
    .sort();
  if (!ds.length) return state.dates;
  const out = [];
  let d = parseYmd(ds[0]);
  const end = parseYmd(ds[ds.length - 1]);
  while (d <= end && out.length < 62) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Country boundary helpers
// ---------------------------------------------------------------------------
function getFeatureCountryCode(feat) {
  if (!feat || !feat.properties) return "";
  const p = feat.properties;
  if (p.ISO_A2 && p.ISO_A2 !== "-99") return p.ISO_A2;
  if (p.POSTAL && p.POSTAL.length === 2 && p.POSTAL !== "-99") return p.POSTAL;
  if (p.ADMIN === "France") return "FR";
  if (p.ADMIN === "Norway") return "NO";
  if (p.ADMIN === "Northern Cyprus") return "CY";
  if (p.ADMIN === "Somaliland") return "SO";
  if (p.ISO_A3 === "FRA") return "FR";
  if (p.ISO_A3 === "NOR") return "NO";
  return p.ISO_A2 || p.POSTAL || p.ADM0_A3 || "";
}

function getPolygonCentroid(feature) {
  if (!feature || !feature.geometry) return { lat: 0, lng: 0 };
  const type = feature.geometry.type;
  const coords = feature.geometry.coordinates;
  let totalLat = 0, totalLng = 0, count = 0;

  function processRing(ring) {
    for (let i = 0; i < ring.length; i++) {
      totalLng += ring[i][0];
      totalLat += ring[i][1];
      count++;
    }
  }

  if (type === "Polygon") {
    if (coords.length > 0) processRing(coords[0]);
  } else if (type === "MultiPolygon") {
    coords.forEach(poly => {
      if (poly.length > 0) processRing(poly[0]);
    });
  }

  return count > 0 ? { lat: totalLat / count, lng: totalLng / count } : { lat: 0, lng: 0 };
}

function loadCountryBoundaries() {
  function applyGeoJson(geoJson) {
    if (!geoJson || !geoJson.features) return;
    state.countriesGeoJson = geoJson.features.map(f => {
      if (f.properties) {
        f.properties._code = getFeatureCountryCode(f);
      }
      return f;
    });
    if (world) {
      world.polygonsData(state.countriesGeoJson);
    }
  }

  // 1. Direct memory fallback (works offline, file:/// protocol, and zero-latency HTTP)
  if (typeof window.COUNTRIES_GEOJSON !== "undefined" && window.COUNTRIES_GEOJSON.features) {
    applyGeoJson(window.COUNTRIES_GEOJSON);
    return;
  }

  // 2. Fetch fallback for server environments
  fetch("countries.geojson")
    .then(res => res.json())
    .then(geoJson => applyGeoJson(geoJson))
    .catch(err => {
      console.warn("Could not load local countries.geojson:", err);
    });
}

// ---------------------------------------------------------------------------
// 5. Sphere math (camera framing)
// ---------------------------------------------------------------------------
function latLngToUnit(lat, lng) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (90 - lng) * Math.PI / 180;
  return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)];
}

function unitToLatLng(v) {
  const r = Math.hypot(v[0], v[1], v[2]) || 1;
  const x = v[0] / r, y = v[1] / r, z = v[2] / r;
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
  let lng = 90 - Math.atan2(z, x) * 180 / Math.PI;
  lng = ((lng + 540) % 360) - 180;
  return { lat, lng };
}

// Camera view that keeps the event location, every party and every arc in frame — inside the
// free area (between the panels, or above a phone's story sheet), not just somewhere on the globe.
function frameEventView(evt) {
  const pts = [];
  // the story's own spot weighs double: it should sit nearest the middle
  if (Number.isFinite(evt.lat) && Number.isFinite(evt.lng)) pts.push([evt.lat, evt.lng], [evt.lat, evt.lng]);
  (evt.parties || []).forEach(p => {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) pts.push([p.lat, p.lng]);
  });
  (evt.arcs || []).forEach(a => {
    if (Number.isFinite(a.startLat) && Number.isFinite(a.startLng)) pts.push([a.startLat, a.startLng]);
    if (Number.isFinite(a.endLat) && Number.isFinite(a.endLng)) pts.push([a.endLat, a.endLng]);
  });
  if (!pts.length) return { lat: 20, lng: 0, altitude: 2.2 };

  const vs = pts.map(p => latLngToUnit(p[0], p[1]));
  const sum = vs.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]);
  const center = Math.hypot(sum[0], sum[1], sum[2]) > 0.25 ? unitToLatLng(sum) : { lat: pts[0][0], lng: pts[0][1] };
  const cv = latLngToUnit(center.lat, center.lng);
  let maxAng = 0;
  vs.forEach(v => {
    const dot = Math.max(-1, Math.min(1, v[0] * cv[0] + v[1] * cv[1] + v[2] * cv[2]));
    maxAng = Math.max(maxAng, Math.acos(dot));
  });
  // perspective: a point θ from the view centre lands f·sinθ / (1 + alt − cosθ) px from the
  // globe's centre — pick the altitude that keeps the farthest one inside the free area
  const fr = getFreeRect();
  const half = 0.85 * Math.max(80, Math.min(fr.right - fr.left, fr.bottom - fr.top)) / 2;
  const fov = (world && world.camera().fov) || 50;
  const f = (window.innerHeight / 2) / Math.tan(fov * Math.PI / 360);
  const need = maxAng > 1.4 ? 3.2 : f * Math.sin(maxAng) / half + Math.cos(maxAng) - 1;
  const altitude = Math.max(1.15, Math.min(3.2, need));
  return { lat: center.lat, lng: center.lng, altitude };
}

// Does a view put this story's own spot inside the free area? (same perspective model)
function spotInFreeArea(view, evt) {
  if (!world || !view || !Number.isFinite(evt.lat) || !Number.isFinite(evt.lng)) return true;
  const a = latLngToUnit(view.lat, view.lng), b = latLngToUnit(evt.lat, evt.lng);
  const cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const d = 1 + (view.altitude || state.defaultAltitude);
  if (cos <= 1 / d) return false; // behind the limb
  const fr = getFreeRect();
  const f = (window.innerHeight / 2) / Math.tan((world.camera().fov || 50) * Math.PI / 360);
  const off = f * Math.sqrt(1 - cos * cos) / (d - cos);
  return off < 0.8 * Math.min(fr.right - fr.left, fr.bottom - fr.top) / 2;
}

// ---------------------------------------------------------------------------
// 6. Procedural globe texture (unchanged look)
// ---------------------------------------------------------------------------
let currentArcScale = 1.0; // zoom-adaptive arc stroke

function createSpinNewsGlobeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  // 1. Deep cosmic midnight ocean gradient (#040308 to #0e0c1c)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  bgGrad.addColorStop(0, "#040308");
  bgGrad.addColorStop(0.25, "#080714");
  bgGrad.addColorStop(0.5, "#0e0c1c");
  bgGrad.addColorStop(0.75, "#080714");
  bgGrad.addColorStop(1, "#040308");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 2048, 1024);

  // 2. Subtle celestial stardust across deep ocean space
  ctx.fillStyle = "rgba(192, 132, 252, 0.05)";
  for (let i = 0; i < 450; i++) {
    const rx = (Math.sin(i * 997) * 0.5 + 0.5) * 2048;
    const ry = (Math.cos(i * 613) * 0.5 + 0.5) * 1024;
    ctx.fillRect(rx, ry, 1.2, 1.2);
  }

  // 3. Delicate graticules every 30 degrees
  ctx.lineWidth = 1;
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * 1024;
    ctx.strokeStyle = (lat === 0) ? "rgba(192, 132, 252, 0.16)" : "rgba(255, 255, 255, 0.055)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(2048, y);
    ctx.stroke();
  }
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * 2048;
    ctx.strokeStyle = (lon === 0) ? "rgba(192, 132, 252, 0.16)" : "rgba(255, 255, 255, 0.055)";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }

  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// 7. Boot
// ---------------------------------------------------------------------------
// The stories bundled in news-data.js are fictional scenarios while NEWS_DATA_IS_DEMO is on.
// Runs before any live event is added, so only those stories are marked.
function markBundledDemoEvents() {
  if (typeof NEWS_DATA_IS_DEMO === "undefined" || NEWS_DATA_IS_DEMO !== true) return;
  RAW_NEWS_EVENTS.forEach(evt => { if (evt && typeof evt === "object") evt.isDemo = true; });
}

// The header "데모" badge is shown while at least one demo story is loaded
function syncDemoBadge() {
  const badge = document.getElementById("demoBadge");
  if (!badge) return;
  const show = RAW_NEWS_EVENTS.some(isDemoEvent);
  if (badge.classList.contains("is-hidden") !== show) return; // no change
  badge.classList.toggle("is-hidden", !show);
  // the header makes room for the badge only while it is shown (.has-demo rules in styles.css)
  const header = document.getElementById("appHeader");
  if (header) header.classList.toggle("has-demo", show);
  syncHeaderHeight();
  updateChipFade();
}

document.addEventListener("DOMContentLoaded", () => {
  markBundledDemoEvents();
  state.dates = buildDateRange();
  state.currentDateIndex = state.dates.length - 1;
  applyStoredPrefs();

  initGlobe();
  loadCountryBoundaries();
  initCategoryChips();
  initCountryPicker();
  initTimeline();
  initEventListeners();
  startLabelLayoutLoop();
  // Narrow screens: the briefing panel starts closed so the globe has room
  if (window.innerWidth < 1280) setPanelCollapsed("leftSidebar", "toggleLeftPanel", true);
  syncPanelInert();
  syncDemoBadge();
  syncHeaderHeight();
  applyGlobeFraming(true);
  refreshAll();
  if (document.fonts && document.fonts.ready) {
    // label sizes were measured with fallback-font metrics; measure again once Pretendard is in
    document.fonts.ready.then(() => {
      resetLabelSizes();
      syncHeaderHeight();
      updateChipFade();
    });
  }
  initLiveApiStream();
  initDevApiModal();
});

// ---------------------------------------------------------------------------
// 8. Globe (look preserved; adds highlight-aware arc styling)
// ---------------------------------------------------------------------------
// globe.gl keeps ray-casting at its last pointer position — also after the pointer has moved onto
// a panel, and after a touch tap — so hover is only honoured for a real mouse over the globe.
const pointer = { onGlobe: false, type: "mouse" };
function pointerCanHover() {
  return pointer.onGlobe && pointer.type === "mouse";
}

function eventFromOverlay(ev) {
  const t = ev && ev.target;
  return !!(t && t.closest && t.closest(".marker-wrapper, #globeStackMenu, #farSideHint, #globeEmptyState"));
}

function activeHighlightId() {
  return state.highlightEventId || (state.selectedEvent && state.selectedEvent.id) || null;
}

function isSameArc(a, b) {
  return !!(a && b && (a === b || (a.id && b.id && a.id === b.id)));
}

// Country fills: one shared single-pass material per colour. three's default (transparent +
// DoubleSide) renders every country twice and re-versions its material each frame; the look is
// identical (the invisible side walls still write depth, so borders keep their exact weight).
function polygonCapColorFor(d) {
  const code = (d.properties && d.properties._code) || getFeatureCountryCode(d);
  if (state.focusedCountry && code === state.focusedCountry) return "rgba(147, 51, 234, 0.42)";
  if (state.raised && state.raised.codes.has(code)) return hexToRgba(state.raised.color, 0.16);
  if (state.hoveredPolygon === d) return "rgba(168, 85, 247, 0.22)";
  if (state.focusedCountry && state.partnerCodes && state.partnerCodes.has(code)) return "rgba(196, 181, 253, 0.12)";
  return "rgba(22, 20, 34, 0.88)";
}
const polyCapMats = new Map();
let polySideMat = null;
function polyCapMaterial(color) {
  let m = polyCapMats.get(color);
  if (!m) {
    const c = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(color) || [0, 22, 20, 34, "0.88"];
    const alpha = c[4] !== undefined ? +c[4] : 1;
    m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(`rgb(${c[1]}, ${c[2]}, ${c[3]})`), transparent: alpha < 1, opacity: alpha,
      side: THREE.DoubleSide, forceSinglePass: true, depthWrite: true
    });
    polyCapMats.set(color, m);
  }
  return m;
}
function polySideMaterial() {
  if (!polySideMat) polySideMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: true, side: THREE.DoubleSide, forceSinglePass: true });
  return polySideMat;
}
function repaintPolygons() {
  if (world) world.polygonCapMaterial(world.polygonCapMaterial()).polygonStrokeColor(world.polygonStrokeColor());
}

function initGlobe() {
  const container = document.getElementById("globeViz");
  const globeTextureUrl = createSpinNewsGlobeTexture();

  world = Globe()(container)
    .globeImageUrl(globeTextureUrl)
    .bumpImageUrl(null)
    .showAtmosphere(true)
    .atmosphereColor("#c084fc")
    .atmosphereAltitude(0.24)
    // 1) Country borders & hover
    .polygonsData([])
    .polygonGeoJsonGeometry(d => d.geometry)
    .polygonCapMaterial(d => polyCapMaterial(polygonCapColorFor(d)))
    .polygonSideMaterial(() => polySideMaterial())
    .polygonStrokeColor(d => {
      const code = (d.properties && d.properties._code) || getFeatureCountryCode(d);
      if (state.focusedCountry && code === state.focusedCountry) return "rgba(243, 232, 255, 1.0)";
      if (state.raised && state.raised.codes.has(code)) return hexToRgba(state.raised.color, 0.9);
      if (state.hoveredPolygon === d) return "rgba(216, 180, 254, 0.95)";
      if (state.focusedCountry && state.partnerCodes && state.partnerCodes.has(code)) return "rgba(196, 181, 253, 0.75)";
      if (state.focusedCountry) return "rgba(220, 220, 250, 0.22)";
      return "rgba(220, 220, 250, 0.45)";
    })
    .polygonAltitude(0.005)
    .onPolygonHover(p => handlePolygonHover(pointerCanHover() ? p : null))
    // globe.gl also reports clicks that land on HTML markers above the canvas: ignore those
    .onPolygonClick((polygon, ev) => { if (!eventFromOverlay(ev)) handlePolygonClick(polygon); })
    // 2) HTML markers
    .htmlElementsData([])
    .htmlLat(d => d.lat)
    .htmlLng(d => d.lng)
    .htmlAltitude(d => (d.altitude !== undefined ? d.altitude : 0.03))
    .htmlElement(createMarkerElement)
    .htmlTransitionDuration(0)
    // 3) Arcs: thin luminous filaments (unchanged look) + solo highlight
    .arcsData([])
    .arcStartLat(d => d.startLat)
    .arcStartLng(d => d.startLng)
    .arcEndLat(d => d.endLat)
    .arcEndLng(d => d.endLng)
    .arcColor(d => {
      if (d.__keep) return "rgba(0, 0, 0, 0)";
      const meta = d.eventRef ? categoryMeta(d.eventRef) : null;
      const base = meta ? meta.arc : ["rgba(167, 139, 250, 0.9)", "rgba(129, 140, 248, 0.7)"];
      if (state.hoveredArc) {
        return isSameArc(d, state.hoveredArc) ? ["#ffffff", meta ? meta.color : "#c084fc"] : "rgba(255, 255, 255, 0.04)";
      }
      const hl = activeHighlightId();
      if (hl) {
        if (d.eventRef && d.eventRef.id === hl) return ["#ffffff", meta ? meta.color : "#c084fc"];
        // transient hover → near-invisible; an open story → keep the hue, just quieter
        return state.highlightEventId ? "rgba(255, 255, 255, 0.05)" : dimArc(base);
      }
      if (state.previewCategory && d.eventRef && normalizeCategory(d.eventRef) !== state.previewCategory) {
        return "rgba(255, 255, 255, 0.05)";
      }
      return base;
    })
    .arcAltitude(d => (d.__keep ? 0 : getArcAltitude(d)))
    .arcStroke(d => {
      if (d.__keep) return 0.1;
      if (state.hoveredArc) {
        return isSameArc(d, state.hoveredArc) ? Math.max(0.7, 0.9 * currentArcScale) : 0.15;
      }
      const hl = activeHighlightId();
      if (hl) {
        if (d.eventRef && d.eventRef.id === hl) return Math.max(0.62, (state.highlightEventId ? 0.85 : 1.0) * currentArcScale);
        return 0.15;
      }
      // thin luminous filaments, a little bolder for the more important stories
      const imp = d.eventRef ? Number(d.eventRef.impactScore) || 80 : 80;
      const t = Math.max(0, Math.min(1, (imp - 78) / 16));
      return Math.max(0.18, Math.min(0.38, (0.2 + 0.18 * t) * currentArcScale));
    })
    .arcDashLength(0.32)
    .arcDashGap(0.18)
    .arcDashAnimateTime(1800)
    .arcsTransitionDuration(0)
    // stable per arc, so re-styling on hover doesn't make the dashes jump
    .arcDashInitialGap(d => hashUnit(String(d.id || `${d.startLat},${d.startLng},${d.endLat},${d.endLng}`)) * 2)
    .onArcHover(arc => handleArcHover(pointerCanHover() ? arc : null))
    .onArcClick((arc, ev) => { if (!eventFromOverlay(ev)) handleArcClick(arc); });

  world.pointOfView({ lat: 30, lng: 55, altitude: state.defaultAltitude }, 0);

  // Cap pixel ratio to keep High-DPI screens smooth
  const renderer = world.renderer ? world.renderer() : null;
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  }

  const controls = world.controls();
  controls.autoRotate = state.autoOrbit;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 110;
  controls.maxDistance = 620;

  // Zoom-adaptive line scaling (ignores pure rotation)
  let lastAlt = state.defaultAltitude;
  controls.addEventListener("change", () => {
    if (!world) return;
    const pov = world.pointOfView();
    if (!pov || typeof pov.altitude !== "number") return;
    const alt = pov.altitude;
    if (Math.abs(alt - lastAlt) < 0.06) return;
    lastAlt = alt;
    const targetScale = Math.min(1.0, Math.max(0.5, alt / (state.defaultAltitude || 2.2)));
    if (Math.abs(targetScale - currentArcScale) > 0.03) {
      currentArcScale = targetScale;
      world.arcStroke(world.arcStroke());
    }
  });

  // Rotation pauses while the user drags/zooms and resumes after a few idle seconds
  controls.addEventListener("start", () => { rotation.interacting = true; updateAutoRotate(); });
  controls.addEventListener("end", () => {
    rotation.interacting = false;
    rotation.lastInteractionAt = performance.now();
    updateAutoRotate();
  });

  const scene = world.scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));

  window.addEventListener("resize", () => {
    document.documentElement.style.removeProperty("--header-h");
    syncHeaderHeight();
    world.width(window.innerWidth);
    world.height(window.innerHeight);
    applyGlobeFraming(true);
    syncPanelInert();
    resetLabelSizes(); // label caps change with the breakpoints
  });

  // Reduced motion: static arc dashes and no auto-orbit unless the user turns it back on
  const applyMotionPref = () => {
    world.arcDashAnimateTime(RM.matches ? 0 : 1800);
    if (RM.matches && !state.userTouchedOrbit) state.autoOrbit = false;
    syncOrbitButton();
    updateAutoRotate();
  };
  if (RM.addEventListener) RM.addEventListener("change", applyMotionPref);
  applyMotionPref();
}

const rotation = { interacting: false, hovering: false, lastInteractionAt: 0, timer: null };

function syncOrbitButton() {
  const b = document.getElementById("toggleAutoOrbit");
  if (!b) return;
  b.setAttribute("aria-pressed", String(state.autoOrbit));
  b.classList.toggle("is-off", !state.autoOrbit);
}

// Auto-orbit stays the user's setting, but it only runs when nothing needs to hold still:
// a story is open, a country is focused, the pointer is on a marker, or the user just moved the globe.
function updateAutoRotate() {
  if (!world) return;
  const idleFor = performance.now() - rotation.lastInteractionAt;
  const quietPeriod = 4000;
  const want = state.autoOrbit && !state.selectedEvent && !state.focusedCountry && !stackMenuState.open &&
    !rotation.interacting && !rotation.hovering && idleFor > quietPeriod;
  const controls = world.controls();
  if (controls.autoRotate !== want) controls.autoRotate = want;
  clearTimeout(rotation.timer);
  if (!want && state.autoOrbit && !rotation.interacting && idleFor <= quietPeriod) {
    rotation.timer = setTimeout(updateAutoRotate, quietPeriod - idleFor + 30);
  }
  const btn = document.getElementById("toggleAutoOrbit");
  if (btn) btn.setAttribute("data-tip", !state.autoOrbit ? "자동 회전 켜기 (R)" : (want ? "자동 회전 끄기 (R)" : "자동 회전 켜짐 · 읽는 동안 잠시 멈춤 (R)"));
}

const RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener() {} };
function flyMs(ms) { return RM.matches ? 0 : ms; }

function flyTo(view, ms = 1300) {
  if (!world || !view) return;
  hideTooltip(); // the globe is about to move out from under the pointer
  const v = Object.assign({}, view);
  if (v.altitude === undefined && v.lat === undefined) v.altitude = state.defaultAltitude;
  world.pointOfView(v, flyMs(ms));
}

// The free area is what the panels leave uncovered; the globe is centred there with a
// camera view offset (labels and picking stay aligned) and sized to fit it.
// The header wraps to two rows on phones: everything placed under it follows its real height
function syncHeaderHeight() {
  const header = document.getElementById("appHeader");
  if (!header) return;
  const h = Math.round(header.getBoundingClientRect().height);
  if (h > 0) document.documentElement.style.setProperty("--header-h", `${h}px`);
}

function getFreeRect() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const header = document.getElementById("appHeader");
  const footer = document.getElementById("appFooter");
  const L = document.getElementById("leftSidebar");
  const R = document.getElementById("rightSidebar");
  let left = 0, right = vw;
  let top = header ? header.getBoundingClientRect().bottom : 0;
  let bottom = footer ? footer.getBoundingClientRect().top : vh;
  const visible = el => el && !el.classList.contains("is-collapsed") && getComputedStyle(el).display !== "none";
  const drawer = document.getElementById("eventModal");
  const drawerOpen = document.body.classList.contains("detail-open") && drawer && !drawer.classList.contains("is-hidden");
  if (vw >= 1024) {
    if (visible(L) && vw >= 1280) left = L.getBoundingClientRect().right;
    if (visible(R)) right = R.getBoundingClientRect().left;
    if (drawerOpen) right = Math.min(right, drawer.getBoundingClientRect().left);
  } else if (drawerOpen) {
    // phone/tablet: the story sheet covers the lower part; the globe is framed above it
    bottom = Math.min(bottom, drawer.getBoundingClientRect().top);
  } else if (R) {
    // phone/tablet: the sheet peek sits above the footer
    bottom -= parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sheet-peek")) || 96;
  }
  if (bottom - top < 120) bottom = top + 120;
  return { left, right, top, bottom };
}

function fitAltitude(freeW, freeH) {
  const cam = world.camera();
  const tanHalf = Math.tan((cam.fov || 50) * Math.PI / 360);
  const k = (window.innerHeight / 2) / (tanHalf * 0.42 * Math.max(120, Math.min(freeW, freeH)));
  return Math.min(4.8, Math.max(1.9, Math.sqrt(1 + k * k) - 1));
}

let framingRaf = null;
function applyGlobeFraming(refit) {
  if (!world) return;
  cancelAnimationFrame(framingRaf);
  framingRaf = requestAnimationFrame(() => {
    const r = getFreeRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const cam = world.camera();
    cam.setViewOffset(vw, vh, Math.round(vw / 2 - cx), Math.round(vh / 2 - cy), vw, vh);
    cam.updateProjectionMatrix();
    document.documentElement.style.setProperty("--globe-cx", `${Math.round(cx)}px`);
    document.documentElement.style.setProperty("--globe-cy", `${Math.round(cy)}px`);
    document.documentElement.style.setProperty("--free-w", `${Math.round(r.right - r.left)}px`);
    labelLayout.freeRect = r;
    const prevDefault = state.defaultAltitude;
    labelLayout.free = { w: Math.max(1, r.right - r.left), h: Math.max(1, r.bottom - r.top) };
    state.defaultAltitude = fitAltitude(r.right - r.left, r.bottom - r.top);
    if (refit) {
      const pov = world.pointOfView();
      // only re-zoom when the user is still at the overview distance
      if (!state.selectedEvent && !state.focusedCountry && Math.abs(pov.altitude - prevDefault) < 0.15) {
        world.pointOfView({ altitude: state.defaultAltitude }, flyMs(600));
      }
    }
    markHudDirty();
  });
}

// ---------------------------------------------------------------------------
// 9. Tooltip (follows the cursor, stays inside the viewport)
// ---------------------------------------------------------------------------
const tooltipState = { w: 0, h: 0, visible: false, anchored: false };

function showTooltip(html) {
  const tip = document.getElementById("globeTooltip");
  if (!tip) return;
  tip.innerHTML = html;
  tip.classList.remove("is-hidden");
  tooltipState.visible = true;
  tooltipState.w = tip.offsetWidth;
  tooltipState.h = tip.offsetHeight;
  positionTooltip(state.mousePos.x, state.mousePos.y);
}

function hideTooltip() {
  const tip = document.getElementById("globeTooltip");
  if (tip) tip.classList.add("is-hidden");
  tooltipState.visible = false;
  tooltipState.anchored = false;
}

// Marker cards anchor to the marker (not the cursor) and take the side that keeps the
// marker's own label visible: N, S, E, W, then the diagonals; least overlap wins.
function showAnchoredTooltip(html, wrapper) {
  const meta = wrapper && wrapper.__lbl;
  const p = meta && meta.screen;
  if (!p) { showTooltip(html); return; }
  const tip = document.getElementById("globeTooltip");
  if (!tip) return;
  tip.innerHTML = html;
  tip.classList.remove("is-hidden");
  tooltipState.visible = true;
  tooltipState.anchored = true;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const W = window.innerWidth, H = window.innerHeight;
  const gap = (meta.dotR || 5) + 10;
  const avoid = meta.visible && meta.labelEl ? meta.labelEl.getBoundingClientRect() : null;
  const slots = [
    [p.x - w / 2, p.y - gap - h], [p.x - w / 2, p.y + gap], [p.x + gap, p.y - h / 2], [p.x - gap - w, p.y - h / 2],
    [p.x + gap, p.y - gap - h], [p.x - gap - w, p.y - gap - h], [p.x + gap, p.y + gap], [p.x - gap - w, p.y + gap]
  ];
  let best = null;
  slots.forEach(([x, y]) => {
    const cx = Math.max(8, Math.min(W - w - 8, x)), cy = Math.max(8, Math.min(H - h - 8, y));
    let cost = Math.abs(cx - x) + Math.abs(cy - y);
    if (avoid) {
      const ox = Math.max(0, Math.min(cx + w, avoid.right) - Math.max(cx, avoid.left));
      const oy = Math.max(0, Math.min(cy + h, avoid.bottom) - Math.max(cy, avoid.top));
      cost += ox * oy * 10;
    }
    if (!best || cost < best.cost) best = { x: cx, y: cy, cost };
  });
  tip.style.transform = `translate(${Math.round(best.x)}px, ${Math.round(best.y)}px)`;
}

function positionTooltip(x, y) {
  if (!tooltipState.visible || tooltipState.anchored) return;
  const tip = document.getElementById("globeTooltip");
  if (!tip) return;
  const w = tooltipState.w, h = tooltipState.h;
  let left = x - w / 2;
  let top = y - h - 16;
  if (top < 72) top = y + 22;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function eventTooltipHtml(evt, extraLine) {
  const cm = categoryMeta(evt);
  return `
    <div class="tip-card" style="${catStyle(evt)}">
      <div class="tip-kicker">
        ${isLiveEvent(evt) ? '<span class="live-chip">실시간</span>' : ""}
        <span class="cat-tag"><i></i>${escapeHtml(cm.short)}</span>
        <span class="tip-when">${escapeHtml(formatDateDots(evt.date))} ${escapeHtml(eventTimeLabel(evt))}</span>
        ${impactChipHtml(evt)}
      </div>
      <div class="tip-title">${escapeHtml(evt.title)}</div>
      ${evt.summary && evt.summary !== evt.title ? `<div class="tip-summary">${escapeHtml(evt.summary)}</div>` : ""}
      ${extraLine ? `<div class="tip-meta">${extraLine}</div>` : `<div class="tip-meta">📍 ${escapeHtml(placeOf(evt))}${whoLine(evt) ? ` · ${escapeHtml(whoLine(evt))}` : ""}</div>`}
      <div class="tip-hint">클릭하면 상세 보기</div>
    </div>`;
}

function countryTooltipHtml(code, fallbackName) {
  const n = countryName(code);
  const name = n && n !== code ? n : (fallbackName || code);
  const related = getFilteredEvents({ country: true }).filter(e => (e.countryCodes || []).includes(code) || e.primaryCountry === code);
  const top = rankForBrief(related)[0];
  const isFocused = state.focusedCountry === code;
  return `
    <div class="tip-card">
      <div class="tip-country">${getFlagHtml(code, 18)}<b>${escapeHtml(name)}</b><span class="tip-code">${escapeHtml(code || "")}</span></div>
      <div class="tip-meta">${related.length ? `관련 뉴스 <b class="tip-num">${related.length}</b>건` : "이 기간 관련 뉴스 없음"}</div>
      ${top ? `<div class="tip-line" style="${catStyle(top)}"><i></i>최근 · ${escapeHtml(eventBrief(top, 22))} <span class="tip-when">${escapeHtml(formatDateDots(top.date))}</span></div>` : ""}
      <div class="tip-hint">${isFocused ? "클릭하면 전체 보기로" : "클릭하면 이 나라 뉴스만 보기"}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// 10. Polygon hover / click
// ---------------------------------------------------------------------------
let polyHoverRaf = null;
function handlePolygonHover(polygon) {
  const rendererDom = world.renderer ? world.renderer().domElement : null;
  // the globe keeps ray-casting under HTML markers: a hovered story owns the card
  if (polygon && highlightSources.has("marker")) polygon = null;

  if (state.hoveredPolygon === polygon) return;
  state.hoveredPolygon = polygon;

  if (polyHoverRaf) cancelAnimationFrame(polyHoverRaf);
  polyHoverRaf = requestAnimationFrame(() => {
    repaintPolygons();
  });

  if (polygon) {
    if (rendererDom) rendererDom.style.cursor = "pointer";
    if (state.hoveredArc) return;
    const code = (polygon.properties && polygon.properties._code) || getFeatureCountryCode(polygon);
    showTooltip(countryTooltipHtml(code, polygon.properties.NAME || polygon.properties.ADMIN));
  } else {
    if (!state.hoveredArc) {
      if (rendererDom) rendererDom.style.cursor = "default";
      hideTooltip();
    }
  }
}

function handlePolygonClick(polygon) {
  if (!polygon) return;
  const code = getFeatureCountryCode(polygon);
  focusCountry(code, null, polygon);
}

// ---------------------------------------------------------------------------
// 11. Arc hover / click
// ---------------------------------------------------------------------------
function handleArcHover(arc) {
  const rendererDom = world.renderer ? world.renderer().domElement : null;
  if (arc && (arc.__keep || highlightSources.has("marker"))) arc = null;
  state.hoveredArc = arc;
  world.arcColor(world.arcColor()).arcStroke(world.arcStroke());

  if (arc) {
    if (rendererDom) rendererDom.style.cursor = "pointer";
    const evt = arc.eventRef;
    const relation = escapeHtml(stripLatinParen(arc.relationType) || stripLatinParen(arc.label) || "연결");
    const ends = `${getFlagHtml(arc.sourceFlag || "UN", 16)}<b>${escapeHtml(countryName(emojiToIsoCode(arc.sourceFlag || "")) || arc.sourceName || "출발")}</b>
          <span class="tip-arrow">${icon("arrow", 13)} ${relation}</span>
          ${getFlagHtml(arc.targetFlag || "UN", 16)}<b>${escapeHtml(countryName(emojiToIsoCode(arc.targetFlag || "")) || arc.targetName || "도착")}</b>`;
    showTooltip(evt
      ? eventTooltipHtml(evt, `<span class="tip-arc">${ends}</span>`)
      : `<div class="tip-card"><div class="tip-arc">${ends}</div><div class="tip-hint">클릭하면 상세 보기</div></div>`);
    if (evt) setHighlight(evt.id, "arc");
  } else {
    if (rendererDom) rendererDom.style.cursor = "default";
    hideTooltip();
    clearHighlight("arc");
  }
}

function arcView(arc) {
  const apex = getExactArcApex(arc.startLat, arc.startLng, arc.endLat, arc.endLng, getArcAltitude(arc));
  const v = frameEventView({ lat: apex.lat, lng: apex.lng, arcs: [arc] });
  return { lat: apex.lat, lng: apex.lng, altitude: v.altitude };
}

function handleArcClick(arc) {
  if (!arc || arc.__keep) return;
  soundEngine.playRadarPing();
  if (arc.eventRef) openEventDetail(arc.eventRef, arc, arcView(arc));
}

// ---------------------------------------------------------------------------
// 12. Globe markers — stable datums (globe.gl keeps one element per datum object,
//     so filters and timeline playback no longer rebuild every marker)
// ---------------------------------------------------------------------------
// Marker kinds:
//   event    — one mark per story at the place it happened: dot area = impact, fill = category,
//              headline label (flag + short headline [+ impact chip for ≥90] [+N cluster])
//   endpoint — small category dot where a party sits / an arc lands; its pill ("이란 · 테헤란")
//              shows only while that story is raised (hovered or open)
//   chip     — relation chip on the exact arc apex ("미국 ↔ 이란 · 군사 대치"), raised stories only
//   country  — the familiar flag + Korean name tag, quiet base-map context (loses every collision)
//   state    — regional nodes (VIEW: REGIONAL), share the tag budget
const markerCache = new Map();
let currentMarkerIds = new Set();
const arcCache = new Map();

function datum(id, fields) {
  let d = markerCache.get(id);
  if (!d) { d = { id }; markerCache.set(id, d); }
  return Object.assign(d, fields);
}

function eventDotSize(evt) {
  const s = Math.max(70, Number(evt.impactScore) || 75);
  return Math.max(6, Math.min(13, Math.round(2 * Math.sqrt((s - 70) * 1.6))));
}

function shortPartyLabel(p) {
  const pc = partyCountryCode(p);
  const country = countryName(pc) || pc;
  const name = String((p && p.name) || "");
  const paren = /\(([^)]*[가-힣][^)]*)\)/.exec(name);
  if (paren) return `${country} · ${paren[1].split(/[,/]/)[0].trim()}`;
  const words = stripLatinParen(name).split(/\s+/).filter(w => w && w !== country && !country.includes(w) && !w.includes(country));
  if (words.length) return `${country} · ${words[0]}`.slice(0, 20);
  return (name || country).slice(0, 14);
}

function relationText(arc, evt) {
  return stripLatinParen(arc && arc.relationType).split(" (")[0] ||
    stripLatinParen(arc && arc.label) || (evt ? CATEGORY_META[normalizeCategory(evt)].relation : "연결");
}

function hashUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

// ---- exact arc geometry (matches three-globe's CubicBezierCurve3) ----
const GLOBE_R = 100;
function polar2CartesianCoord(lat, lng, relAltitude = 0) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (90 - lng) * Math.PI / 180;
  const r = GLOBE_R * (1 + relAltitude);
  const phiSin = Math.sin(phi);
  return { x: r * phiSin * Math.cos(theta), y: r * Math.cos(phi), z: r * phiSin * Math.sin(theta) };
}
function cartesian2PolarCoord({ x, y, z }) {
  const r = Math.sqrt(x * x + y * y + z * z);
  const phi = Math.acos(Math.max(-1, Math.min(1, y / r)));
  const theta = Math.atan2(z, x);
  let lng = 90 - theta * 180 / Math.PI - (theta < -Math.PI / 2 ? 360 : 0);
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return { lat: 90 - phi * 180 / Math.PI, lng, altitude: (r / GLOBE_R) - 1 };
}
function getExactArcApex(startLat, startLng, endLat, endLng, altitude = 0.22) {
  const p0 = polar2CartesianCoord(startLat, startLng, 0);
  const p3 = polar2CartesianCoord(endLat, endLng, 0);
  const vA = { x: p0.x / GLOBE_R, y: p0.y / GLOBE_R, z: p0.z / GLOBE_R };
  const vB = { x: p3.x / GLOBE_R, y: p3.y / GLOBE_R, z: p3.z / GLOBE_R };
  const dot = Math.max(-1, Math.min(1, vA.x * vB.x + vA.y * vB.y + vA.z * vB.z));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  const slerp = t => {
    if (sinOmega === 0) return { lat: startLat, lng: startLng };
    const s1 = Math.sin((1 - t) * omega) / sinOmega;
    const s2 = Math.sin(t * omega) / sinOmega;
    const x = s1 * vA.x + s2 * vB.x, y = s1 * vA.y + s2 * vB.y, z = s1 * vA.z + s2 * vB.z;
    const r = Math.sqrt(x * x + y * y + z * z);
    return cartesian2PolarCoord({ x: (x / r) * GLOBE_R, y: (y / r) * GLOBE_R, z: (z / r) * GLOBE_R });
  };
  const pt1 = slerp(0.25), pt2 = slerp(0.75);
  const v1 = polar2CartesianCoord(pt1.lat, pt1.lng, altitude * 1.5);
  const v2 = polar2CartesianCoord(pt2.lat, pt2.lng, altitude * 1.5);
  return cartesian2PolarCoord({
    x: 0.125 * p0.x + 0.375 * v1.x + 0.375 * v2.x + 0.125 * p3.x,
    y: 0.125 * p0.y + 0.375 * v1.y + 0.375 * v2.y + 0.125 * p3.y,
    z: 0.125 * p0.z + 0.375 * v1.z + 0.375 * v2.z + 0.125 * p3.z
  });
}

// One arc altitude for the line and its chip. Long routes are lifted just enough that the
// middle of the line clears the surface (Texas→Alice Springs used to dip under the globe).
const arcAltCache = new Map();
function getArcAltitude(d) {
  const key = `${d.id || ""}|${d.startLat},${d.startLng},${d.endLat},${d.endLng},${d.altitude}`;
  if (arcAltCache.has(key)) return arcAltCache.get(key);
  let alt = typeof d.altitude === "number" ? Math.min(0.24, Math.max(0.06, d.altitude * 0.52)) : 0.15;
  for (let i = 0; i < 20; i++) {
    const apex = getExactArcApex(d.startLat, d.startLng, d.endLat, d.endLng, alt);
    if (!(apex.altitude < 0.06)) break;
    alt += 0.015;
  }
  arcAltCache.set(key, alt);
  return alt;
}

function buildGlobeMarkers(events) {
  const list = [];
  const ranked = events.slice().sort((a, b) => eventPriority(b) - eventPriority(a));
  const spots = [];

  ranked.forEach(evt => {
    if (!Number.isFinite(evt.lat) || !Number.isFinite(evt.lng)) return;
    spots.push([evt.lat, evt.lng]);
    list.push(datum(`evt-${evt.id}`, {
      kind: "event", lat: evt.lat, lng: evt.lng, altitude: 0.02, eventRef: evt, priority: eventPriority(evt)
    }));
  });

  ranked.forEach(evt => {
    const ends = [];
    (evt.parties || []).forEach(p => {
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) ends.push({ lat: p.lat, lng: p.lng, party: p });
    });
    (evt.arcs || []).forEach(a => {
      [[a.startLat, a.startLng, a.sourceFlag, a.sourceName], [a.endLat, a.endLng, a.targetFlag, a.targetName]].forEach(([lat, lng, flag, name]) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (ends.some(e => Math.abs(e.lat - lat) < 0.5 && Math.abs(e.lng - lng) < 0.5)) return;
        ends.push({ lat, lng, party: { name, flag, code: emojiToIsoCode(flag || "") } });
      });
    });
    ends.forEach((e, i) => {
      // the story mark already stands on this end
      if (Math.abs(e.lat - evt.lat) < 0.6 && Math.abs(e.lng - evt.lng) < 0.6) return;
      list.push(datum(`ep-${evt.id}-${i}`, {
        kind: "endpoint", lat: e.lat, lng: e.lng, altitude: 0.012, eventRef: evt, party: e.party
      }));
    });
    (evt.arcs || []).forEach((arc, i) => {
      if (![arc.startLat, arc.startLng, arc.endLat, arc.endLng].every(Number.isFinite)) return;
      const apex = getExactArcApex(arc.startLat, arc.startLng, arc.endLat, arc.endLng, getArcAltitude(arc));
      list.push(datum(`chip-${evt.id}-${arc.id || i}`, {
        kind: "chip", lat: apex.lat, lng: apex.lng, altitude: Math.max(0.02, apex.altitude), eventRef: evt, arc
      }));
    });
  });

  // Countries that appear in the visible stories (for has-intel and focus partners)
  const activeCountryCodes = new Set();
  events.forEach(evt => eventCountryCodes(evt).forEach(c => activeCountryCodes.add(c)));
  state.partnerCodes = new Set();
  if (state.focusedCountry) {
    events.forEach(evt => {
      const codes = eventCountryCodes(evt);
      if (codes.includes(state.focusedCountry)) codes.forEach(c => { if (c !== state.focusedCountry) state.partnerCodes.add(c); });
    });
  }

  if (typeof MAJOR_COUNTRY_LABELS !== "undefined") {
    MAJOR_COUNTRY_LABELS.forEach(c => {
      list.push(datum(`country-tag-${c.code}`, {
        kind: "country", lat: c.lat, lng: c.lng, altitude: 0.012,
        code: c.code, name: c.name, englishName: c.englishName, size: c.size || 1,
        hasIntel: activeCountryCodes.has(c.code)
      }));
    });
  }

  if (state.viewMode === "regional" && typeof REGIONAL_NODES !== "undefined") {
    let nodes = REGIONAL_NODES;
    if (state.focusedCountry) nodes = nodes.filter(n => n.country === state.focusedCountry);
    nodes.forEach(node => list.push(datum(`state-${node.id}`, { ...node, id: `state-${node.id}`, kind: "state", altitude: 0.02 })));
  }
  return list;
}

function createMarkerElement(d) {
  // globe.gl drops the element when a datum leaves the data (filter, timeline) and asks for a new
  // one when it returns: hand back the one we already built (listeners read d.* live)
  if (d.__el && d.__el.__lbl) {
    const m = d.__el.__lbl;
    m.visible = false; m.decided = false; m.hold = 0; m.screen = null;
    d.__el.classList.add("lbl-off");
    labelLayout.registry.set(d.id, d.__el);
    labelLayout.dirty = true;
    syncMarkerState(d);
    return d.__el;
  }
  const el = document.createElement("div");
  el.className = "marker-wrapper";
  el.setAttribute("data-id", d.id);
  d.__el = el;
  el.addEventListener("wheel", forwardWheelToGlobe, { passive: false });
  if (d.kind === "event") buildEventMarker(el, d);
  else if (d.kind === "endpoint") buildEndpointMarker(el, d);
  else if (d.kind === "chip") buildChipMarker(el, d);
  else if (d.kind === "country") buildCountryTag(el, d);
  else if (d.kind === "state") buildStateNode(el, d);
  syncMarkerState(d);
  return el;
}

// Zooming with the wheel keeps working while the pointer is over a label
function forwardWheelToGlobe(e) {
  const canvas = world && world.renderer ? world.renderer().domElement : null;
  if (!canvas) return;
  e.preventDefault();
  canvas.dispatchEvent(new WheelEvent("wheel", {
    deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
    clientX: e.clientX, clientY: e.clientY, bubbles: true, cancelable: true
  }));
}

function eventLabelInner(evt) {
  const pc = evt.primaryCountry || eventCountryCodes(evt)[0];
  const top = impactTier(evt.impactScore).key === "top";
  return `${pc ? `<span class="evt-label-flag">${getFlagHtml(pc, 14)}</span>` : ""}` +
    `<span class="evt-label-text">${escapeHtml(eventBrief(evt))}</span>` +
    `${isLiveEvent(evt) ? '<span class="live-chip">실시간</span>' : ""}` +
    `${top ? impactChipHtml(evt) : ""}` +
    `<button type="button" class="evt-count is-hidden" tabindex="-1" aria-label="같은 위치의 다른 뉴스 보기"></button>`;
}

function buildEventMarker(el, d) {
  const evt = d.eventRef;
  const cm = categoryMeta(evt);
  const size = eventDotSize(evt);
  el.classList.add("mk-event", "lbl-off");
  el.style.setProperty("--cat", cm.color);
  el.style.setProperty("--cat-text", cm.text);
  el.style.setProperty("--dot", `${size}px`);
  el.setAttribute("data-event-id", evt.id);
  el.innerHTML = `
    <span class="evt-hit" aria-hidden="true"></span>
    <span class="evt-halo" aria-hidden="true"></span>
    <span class="evt-ping" aria-hidden="true"></span>
    <span class="evt-dot" aria-hidden="true"></span>
    <span class="evt-label" data-pos="right">${eventLabelInner(evt)}</span>`;
  registerMarker(el, {
    id: d.id, kind: "event", eventId: evt.id, priority: d.priority, cat: normalizeCategory(evt),
    labelEl: el.querySelector(".evt-label"), countEl: el.querySelector(".evt-count"),
    anchor: "side", dotR: size / 2, lat: d.lat, lng: d.lng, altitude: d.altitude
  });

  el.addEventListener("mouseenter", () => {
    if (pointer.type !== "mouse") return; // a tap opens the story; it is not a hover
    rotation.hovering = true;
    updateAutoRotate();
    setHighlight(evt.id, "marker");
    showAnchoredTooltip(eventTooltipHtml(d.eventRef), el);
  });
  el.addEventListener("mouseleave", () => {
    rotation.hovering = false;
    rotation.lastInteractionAt = performance.now() - 2500;
    updateAutoRotate();
    clearHighlight("marker");
    hideTooltip();
  });
  el.addEventListener("click", e => {
    e.stopPropagation();
    hideTooltip();
    if (e.target.closest(".evt-count")) { openStackMenu(d); return; }
    soundEngine.playBeep(1100, 0.05);
    openEventDetail(d.eventRef);
  });
}

function buildEndpointMarker(el, d) {
  const evt = d.eventRef;
  const p = d.party;
  const cm = categoryMeta(evt);
  const pc = partyCountryCode(p);
  el.classList.add("mk-endpoint", "lbl-off");
  el.style.setProperty("--cat", cm.color);
  el.setAttribute("data-event-id", evt.id);
  el.innerHTML = `
    <span class="ep-dot" aria-hidden="true"></span>
    <span class="ep-pill">${pc ? getFlagHtml(pc, 14) : ""}<span>${escapeHtml(shortPartyLabel(p))}</span></span>`;
  registerMarker(el, {
    id: d.id, kind: "endpoint", eventId: evt.id, priority: 50, cat: normalizeCategory(evt),
    labelEl: el.querySelector(".ep-pill"), anchor: "side", dotR: 3, lat: d.lat, lng: d.lng, altitude: d.altitude
  });
  el.addEventListener("mouseenter", () => {
    if (pointer.type !== "mouse") return;
    setHighlight(evt.id, "marker");
    showAnchoredTooltip(eventTooltipHtml(d.eventRef, `📍 ${escapeHtml(p.name || countryName(pc))}`), el);
  });
  el.addEventListener("mouseleave", () => { clearHighlight("marker"); hideTooltip(); });
  el.addEventListener("click", e => {
    e.stopPropagation();
    hideTooltip();
    soundEngine.playBeep(1100, 0.05);
    openEventDetail(d.eventRef);
  });
}

function buildChipMarker(el, d) {
  const evt = d.eventRef;
  const arc = d.arc;
  const cm = categoryMeta(evt);
  const sc = emojiToIsoCode(arc.sourceFlag || ""), tc = emojiToIsoCode(arc.targetFlag || "");
  el.classList.add("mk-chip", "lbl-off");
  el.style.setProperty("--cat", cm.color);
  el.style.setProperty("--cat-text", cm.text);
  el.setAttribute("data-event-id", evt.id);
  el.innerHTML = `
    <span class="arc-chip">
      ${sc ? getFlagHtml(sc, 14) : ""}<span class="arc-chip-arrow" aria-hidden="true">↔</span>${tc ? getFlagHtml(tc, 14) : ""}
      <span class="arc-chip-text">${escapeHtml(relationText(arc, evt))}</span>
    </span>`;
  registerMarker(el, {
    id: d.id, kind: "chip", eventId: evt.id, priority: 40, cat: normalizeCategory(evt),
    labelEl: el.querySelector(".arc-chip"), anchor: "center", lat: d.lat, lng: d.lng, altitude: d.altitude, noLimb: true,
    ends: [arc.startLat, arc.startLng, arc.endLat, arc.endLng]
  });
  el.addEventListener("mouseenter", () => {
    if (pointer.type !== "mouse") return;
    setHighlight(evt.id, "marker");
    showAnchoredTooltip(eventTooltipHtml(d.eventRef, `${escapeHtml(arc.sourceName || "")} → ${escapeHtml(arc.targetName || "")}`), el);
  });
  el.addEventListener("mouseleave", () => { clearHighlight("marker"); hideTooltip(); });
  el.addEventListener("click", e => {
    e.stopPropagation();
    hideTooltip();
    const live = world.arcsData().find(a => isSameArc(a, arc));
    handleArcClick(live || Object.assign({}, arc, { eventRef: d.eventRef }));
  });
}

function buildCountryTag(el, d) {
  el.classList.add("mk-country", "lbl-off");
  el.innerHTML = `
    <div class="country-globe-tag">
      <span class="tag-flag">${getFlagHtml(d.code, 14)}</span>
      <span class="tag-name">${escapeHtml(d.name)}</span>
    </div>`;
  registerMarker(el, {
    id: d.id, kind: "country", code: d.code, priority: 0,
    labelEl: el.firstElementChild, anchor: "center", lat: d.lat, lng: d.lng, altitude: d.altitude
  });
  el.addEventListener("mouseenter", () => { if (pointer.type === "mouse") showTooltip(countryTooltipHtml(d.code, d.name)); });
  el.addEventListener("mouseleave", hideTooltip);
  el.addEventListener("click", e => {
    e.stopPropagation();
    soundEngine.playBeep(1100, 0.05);
    hideTooltip();
    focusCountry(d.code);
  });
}

// A regional pin whose own flag is its country's flag stands for that country; the others (straits,
// the EU seat in Brussels…) are places: "ME"/"BE" have no news or profile, so they only turn the globe.
function stateNodeCountry(d) {
  const known = (typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[d.country]) ||
    (typeof MAJOR_COUNTRY_LABELS !== "undefined" && MAJOR_COUNTRY_LABELS.some(l => l.code === d.country));
  return known && emojiToIsoCode(d.flag || "") === d.country ? d.country : null;
}

function buildStateNode(el, d) {
  const code = stateNodeCountry(d);
  const iso = emojiToIsoCode(d.flag || "");
  const flag = /^[A-Za-z]{2}$/.test(iso) ? getFlagHtml(iso, 14) : `<span class="pin-glyph" aria-hidden="true">${escapeHtml(d.flag || "📍")}</span>`;
  el.classList.add("mk-state", "lbl-off");
  el.innerHTML = `
    <div class="slim-country-pin">
      ${flag}
      <span class="slim-pin-text">${escapeHtml(d.name)}</span>
    </div>`;
  registerMarker(el, {
    id: d.id, kind: "state", priority: 40, labelEl: el.firstElementChild, anchor: "center",
    lat: d.lat, lng: d.lng, altitude: d.altitude
  });
  el.addEventListener("mouseenter", () => {
    if (pointer.type !== "mouse") return;
    const hint = code && code !== state.focusedCountry ? `클릭하면 ${escapeHtml(countryName(code))} 뉴스만 보기` : "클릭하면 이곳으로 이동";
    showTooltip(`<div class="tip-card"><div class="tip-title">${escapeHtml(d.name)}</div><div class="tip-meta">${escapeHtml(d.label || "")}</div><div class="tip-hint">${hint}</div></div>`);
  });
  el.addEventListener("mouseleave", hideTooltip);
  el.addEventListener("click", e => {
    e.stopPropagation();
    soundEngine.playBeep(1100, 0.05);
    hideTooltip();
    if (code && code !== state.focusedCountry) focusCountry(code, { lat: d.lat, lng: d.lng }, countryFeature(code));
    else flyTo({ lat: d.lat, lng: d.lng, altitude: 1.2 }, 1100);
  });
}

// State that changes between renders is applied here (never baked in at creation)
function syncMarkerState(d) {
  const el = d.__el;
  if (!el || !el.__lbl) return;
  const meta = el.__lbl;
  if (d.kind === "event") {
    const evt = d.eventRef;
    const age = Math.min(3, eventAgeDays(evt));
    meta.priority = d.priority;
    el.classList.remove("age-0", "age-1", "age-2", "age-3");
    el.classList.add(`age-${age}`);
    el.classList.toggle("is-live", isLiveEvent(evt) && Date.now() - (evt._receivedAt || 0) < 60000);
    el.classList.toggle("is-selected", !!(state.selectedEvent && state.selectedEvent.id === evt.id));
    el.classList.toggle("tier-top", impactTier(evt.impactScore).key === "top");
  } else if (d.kind === "country") {
    const focused = state.focusedCountry === d.code;
    const partner = !!(state.partnerCodes && state.partnerCodes.has(d.code));
    const tag = meta.labelEl;
    tag.classList.toggle("has-intel", !!d.hasIntel);
    tag.classList.toggle("focused", focused);
    tag.classList.toggle("is-partner", partner);
    el.classList.toggle("is-focused", focused);
    // the focused country's tag is placed right after its (focus-boosted) stories and may step off them
    meta.pinned = false;
    meta.focusTag = focused;
    meta.priority = focused ? 150 : partner ? 60 : (d.hasIntel ? 30 : 0) + (d.size || 1) * 10;
    meta.eligible = !state.focusedCountry || focused || partner;
  } else if (d.kind === "state") {
    meta.priority = 40;
  }
}

function syncAllMarkerStates(list) {
  list.forEach(syncMarkerState);
}

// ---------------------------------------------------------------------------
// 12b. Stack menu — stories that share one spot on the globe ("+N")
// ---------------------------------------------------------------------------
function openStackMenu(d) {
  closeStackMenu();
  const head = d.__el && d.__el.__lbl;
  if (!head) return;
  const members = [d.eventRef].concat((head.members || [])
    .map(m => RAW_NEWS_EVENTS.find(e => e.id === m.eventId))
    .filter(Boolean));
  const menu = document.createElement("div");
  menu.id = "globeStackMenu";
  menu.className = "stack-menu";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "이 위치의 뉴스");
  menu.innerHTML = `
    <div class="stack-head">이 위치의 뉴스 <b class="num">${members.length}</b>건</div>
    ${members.map(evt => `
      <button type="button" class="stack-row" data-event-id="${escapeHtml(evt.id)}" style="${catStyle(evt)}">
        <i class="chip-dot" style="background:var(--cat)"></i>
        <span class="stack-title">${escapeHtml(eventBrief(evt, 22))}</span>
        <span class="stack-date num">${escapeHtml(formatDateDots(evt.date))}</span>
      </button>`).join("")}`;
  document.body.appendChild(menu);
  const p = head.screen || { x: state.mousePos.x, y: state.mousePos.y };
  const w = menu.offsetWidth, h = menu.offsetHeight;
  let left = Math.min(window.innerWidth - w - 8, Math.max(8, p.x + 14));
  let top = Math.min(window.innerHeight - h - 8, Math.max(8, p.y - h / 2));
  menu.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  menu.addEventListener("click", e => {
    const row = e.target.closest(".stack-row");
    if (!row) return;
    const evt = RAW_NEWS_EVENTS.find(x => x.id === row.getAttribute("data-event-id"));
    closeStackMenu();
    if (evt) openEventDetail(evt);
  });
  menu.addEventListener("mouseover", e => {
    const row = e.target.closest(".stack-row");
    if (!row) return;
    stackMenuState.hlId = row.getAttribute("data-event-id");
    setHighlight(stackMenuState.hlId, "card");
  });
  menu.addEventListener("mouseleave", releaseStackHighlight);
  menu.addEventListener("keydown", e => {
    const rows = [...menu.querySelectorAll(".stack-row")];
    const i = rows.indexOf(document.activeElement);
    let j = -1;
    if (e.key === "ArrowDown") j = (i + 1) % rows.length;
    else if (e.key === "ArrowUp") j = (i - 1 + rows.length) % rows.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = rows.length - 1;
    if (j >= 0) { e.preventDefault(); rows[j].focus(); }
  });
  stackMenuState.open = true;
  markHudDirty();
  const c = world.camera().position;
  stackMenuState.cam = { x: c.x, y: c.y, z: c.z };
  setTimeout(() => document.addEventListener("pointerdown", stackOutside, true), 0);
  // the globe holds still while the menu is open (a turning globe would close it under the pointer)
  updateAutoRotate();
}

// a row hover raised its story; leaving or closing the menu lowers it again (only if still ours)
function releaseStackHighlight() {
  if (stackMenuState.hlId && highlightSources.get("card") === stackMenuState.hlId) clearHighlight("card");
  stackMenuState.hlId = null;
}

const stackMenuState = { open: false, cam: null, hlId: null };
// the menu belongs to a spot on screen: close it once the globe has really moved (not on damping jitter)
function stackMenuCameraMoved() {
  if (!stackMenuState.cam || !world) return false;
  const c = world.camera().position, o = stackMenuState.cam;
  return Math.hypot(c.x - o.x, c.y - o.y, c.z - o.z) > 4;
}
function stackOutside(e) {
  if (!e.target.closest("#globeStackMenu")) closeStackMenu();
}
function closeStackMenu() {
  const m = document.getElementById("globeStackMenu");
  if (m) m.remove();
  document.removeEventListener("pointerdown", stackOutside, true);
  const was = stackMenuState.open;
  stackMenuState.open = false;
  releaseStackHighlight();
  if (was) { markHudDirty(); updateAutoRotate(); }
  return was;
}
function cameraKey() {
  if (!world) return "";
  const c = world.camera().position;
  return `${Math.round(c.x * 4)},${Math.round(c.y * 4)},${Math.round(c.z * 4)}`;
}

// ---------------------------------------------------------------------------
// 13. Label declutter engine ("지구본 라벨 자동 정리")
// ---------------------------------------------------------------------------
// About every 120 ms while the camera moves (plus forced passes on data, hover, selection,
// resize and fonts.ready) we read the screen position the CSS2D renderer wrote into each
// marker's inline transform, cluster stories that share a spot, and greedily place labels by
// priority: inside the viewport, off the HUD panels, off other labels and story dots, trying
// right/left/top/bottom. Budgets scale with zoom and the free area between the panels.
// Hysteresis (incumbency bonus, asymmetric padding, a 2-pass hold, previous slot first,
// cluster split radius > join radius) keeps labels from flickering while the globe turns.
const labelLayout = {
  registry: new Map(), // id -> wrapper
  dirty: true,
  lastRun: 0,
  hudRects: [],
  hudDirty: true,
  timer: null,
  free: null,
  camKey: ""
};
const CSS2D_XY_RE = /translate\(\s*([-\d.e+]+)px\s*,\s*([-\d.e+]+)px\s*\)/;
const LABEL_POSITIONS = ["right", "left", "top", "bottom"];
// Centred labels may step off their anchor: a relation chip around its arc apex, the focused
// country's tag off its own story marks. Everything else stays put.
const CENTER_POSITIONS = { chip: ["center", "n", "s", "e", "w"], focusTag: ["center", "n", "s", "nn", "ss"] };
// A headline may cover — and fold in as "+N" — lower-priority stories this close to its own mark
const FOLD_R = 40;

function registerMarker(wrapper, meta) {
  wrapper.__lbl = Object.assign({
    visible: false, w: 0, h: 0, pos: meta.anchor === "center" ? "center" : "right", hold: 0, decided: false,
    eligible: true, count: 0, member: false, folded: false,
    normal: Number.isFinite(meta.lat) ? latLngToUnit(meta.lat, meta.lng) : null
  }, meta);
  labelLayout.registry.set(meta.id, wrapper);
  labelLayout.dirty = true;
}

function refreshHudRects() {
  const rects = [];
  ["appHeader", "leftSidebar", "rightSidebar", "appFooter", "eventModal", "liveIntelToast", "onboardingHint", "globeStackMenu"].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.classList.contains("is-hidden") || el.classList.contains("is-collapsed")) return;
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) rects.push({ x1: r.left, y1: r.top, x2: r.right, y2: r.bottom });
  });
  labelLayout.hudRects = rects;
  labelLayout.hudDirty = false;
}

function markHudDirty() {
  labelLayout.hudDirty = true;
  labelLayout.dirty = true;
}

function rectsOverlap(a, b, pad = 0) {
  return a.x1 < b.x2 + pad && a.x2 + pad > b.x1 && a.y1 < b.y2 + pad && a.y2 + pad > b.y1;
}

function labelBudget() {
  const alt = (world && world.pointOfView().altitude) || state.defaultAltitude || 2.2;
  const fr = labelLayout.free || { w: window.innerWidth, h: window.innerHeight };
  const f = Math.max(0.45, Math.min(1.25, (fr.w * fr.h) / 700000));
  let b;
  if (alt >= 1.8) b = { event: 8, tag: 10, endpoint: 0, chip: 0 };
  else if (alt >= 1.1) b = { event: 12, tag: 14, endpoint: 4, chip: 3 };
  else b = { event: 20, tag: 20, endpoint: 10, chip: 6 };
  if (state.focusedCountry) { b.event += 4; b.chip += 3; }
  const out = {};
  Object.keys(b).forEach(k => { out[k] = Math.round(b[k] * f); });
  out.event = Math.max(3, out.event);
  return out;
}

function slotOrder(meta) {
  if (meta.anchor === "center") {
    const list = meta.kind === "chip" ? CENTER_POSITIONS.chip : meta.focusTag ? CENTER_POSITIONS.focusTag : ["center"];
    return list.includes(meta.pos) ? [meta.pos].concat(list.filter(p => p !== meta.pos)) : list;
  }
  return [meta.pos].concat(LABEL_POSITIONS.filter(p => p !== meta.pos));
}

// dx/dy: how far the label sits from its default spot (applied through --lx/--ly)
function labelRectAt(x, y, meta, pos) {
  const w = meta.w, h = meta.h, gap = (meta.dotR || 4) + 6;
  if (meta.anchor === "center") {
    let dx = 0, dy = 0;
    if (pos === "n") dy = -(h / 2 + 12);
    else if (pos === "s") dy = h / 2 + 12;
    else if (pos === "nn") dy = -(h + 20);
    else if (pos === "ss") dy = h + 20;
    else if (pos === "e") dx = w / 2 + 14;
    else if (pos === "w") dx = -(w / 2 + 14);
    return { x1: x + dx - w / 2, y1: y + dy - h / 2, x2: x + dx + w / 2, y2: y + dy + h / 2, dx, dy };
  }
  if (pos === "left") return { x1: x - gap - w, y1: y - h / 2, x2: x - gap, y2: y + h / 2, dx: 0, dy: 0 };
  if (pos === "top" || pos === "bottom") {
    // centred over/under the mark, nudged sideways to stay inside the free area (still spanning the mark)
    let dx = 0;
    const fr = labelLayout.freeRect;
    if (fr) {
      const lo = fr.left + 6, hi = fr.right - 6;
      if (x - w / 2 < lo) dx = lo - (x - w / 2);
      else if (x + w / 2 > hi) dx = hi - (x + w / 2);
      const lim = Math.max(0, w / 2 - 12);
      dx = Math.max(-lim, Math.min(lim, dx));
    }
    const y1 = pos === "top" ? y - gap - h : y + gap;
    return { x1: x - w / 2 + dx, y1, x2: x + w / 2 + dx, y2: y1 + h, dx, dy: 0 };
  }
  return { x1: x + gap, y1: y - h / 2, x2: x + gap + w, y2: y + h / 2, dx: 0, dy: 0 };
}

function setClusterCount(meta, n) {
  if (!meta.countEl || meta.count === n) return;
  meta.count = n;
  meta.countEl.textContent = n ? `+${n}` : "";
  meta.countEl.classList.toggle("is-hidden", !n);
  // the label's width changed: measure it now (rare) so this pass places the real size
  meta.w = meta.labelEl ? meta.labelEl.offsetWidth : 0;
  meta.h = meta.labelEl ? meta.labelEl.offsetHeight : 0;
}

function applyLabelShift(meta, r) {
  const dx = Math.round((r && r.dx) || 0), dy = Math.round((r && r.dy) || 0);
  if (meta.shiftX === dx && meta.shiftY === dy) return;
  meta.shiftX = dx;
  meta.shiftY = dy;
  meta.labelEl.style.setProperty("--lx", `${dx}px`);
  meta.labelEl.style.setProperty("--ly", `${dy}px`);
}

// Lower-priority stories a headline had to cover join its "+N": still listed, never buried unseen
function foldUnder(head, dts) {
  if (!head.members) head.members = [];
  dts.forEach(dt => {
    const m = dt.meta;
    if (m.member) return;
    m.member = true;
    m.folded = true;
    m.clusterHeadId = head.id;
    dt.owner.classList.add("is-member");
    if (!head.members.includes(m)) head.members.push(m);
    if (m.visible) setLabelShown(dt.owner, false);
    setClusterCount(m, 0);
  });
  setClusterCount(head, head.members.length);
  labelLayout.dirty = true;
}

function budgetKey(kind) {
  return kind === "country" || kind === "state" ? "tag" : kind;
}

function runLabelLayout() {
  labelLayout.lastRun = performance.now();
  labelLayout.dirty = false;
  if (!world) return;
  if (labelLayout.hudDirty) refreshHudRects();

  const W = window.innerWidth, H = window.innerHeight;
  const cam = world.camera().position;
  const items = [];
  const dots = [];

  labelLayout.registry.forEach((wrapper, id) => {
    const meta = wrapper.__lbl;
    if (!meta || !currentMarkerIds.has(id)) { labelLayout.registry.delete(id); return; }
    if (!wrapper.isConnected) return; // the renderer attaches markers the first time they face the camera
    if (wrapper.style.display === "none") {
      meta.screen = null;
      if (meta.visible) setLabelShown(wrapper, false);
      meta.hold = 0;
      return;
    }
    const m = CSS2D_XY_RE.exec(wrapper.style.transform || "");
    if (!m) return;
    const x = parseFloat(m[1]), y = parseFloat(m[2]);
    meta.screen = { x, y };

    // how squarely the point faces the camera (labels on the limb band are unreadable)
    let facing = 1;
    if (meta.normal) {
      const r = GLOBE_R * (1 + (meta.altitude || 0));
      const vx = cam.x - meta.normal[0] * r, vy = cam.y - meta.normal[1] * r, vz = cam.z - meta.normal[2] * r;
      facing = (meta.normal[0] * vx + meta.normal[1] * vy + meta.normal[2] * vz) / (Math.hypot(vx, vy, vz) || 1);
    }
    meta.facing = facing;

    if (meta.kind === "event") {
      const r = (meta.dotR || 5) + 1;
      dots.push({ x1: x - r, y1: y - r, x2: x + r, y2: y + r, cx: x, cy: y, owner: wrapper, prio: meta.priority, meta });
    } else if (meta.kind === "endpoint" && !wrapper.classList.contains("is-dim")) {
      // terminals are soft obstacles: tags never cover them, story labels may as a last resort
      dots.push({ x1: x - 5, y1: y - 5, x2: x + 5, y2: y + 5, cx: x, cy: y, owner: wrapper, prio: -1, meta, soft: true });
    }
    if (!meta.labelEl) return;
    if (!meta.w) {
      meta.w = meta.labelEl.offsetWidth;
      meta.h = meta.labelEl.offsetHeight;
      if (!meta.w) return;
    }
    items.push({ wrapper, meta, x, y });
  });

  // ---- cluster stories that share a spot (join 12px, split 18px) ----
  const heads = [];
  const storyDots = dots.filter(dt => !dt.soft);
  storyDots.slice().sort((a, b) => (b.meta.pinned ? 1e6 : 0) + b.prio - ((a.meta.pinned ? 1e6 : 0) + a.prio)).forEach(dt => {
    const meta = dt.meta;
    let joined = null;
    if (!meta.pinned) {
      for (const hd of heads) {
        const mine = meta.clusterHeadId === hd.meta.id;
        const limit = mine ? (meta.folded && hd.meta.visible ? FOLD_R + 8 : 18) : 12;
        if (Math.hypot(hd.cx - dt.cx, hd.cy - dt.cy) <= limit) { joined = hd; break; }
      }
    }
    if (joined) {
      if (meta.clusterHeadId !== joined.meta.id) meta.folded = false;
      meta.clusterHeadId = joined.meta.id;
      joined.meta.members.push(meta);
    } else {
      meta.clusterHeadId = null;
      meta.folded = false;
      meta.members = [];
      heads.push(dt);
    }
  });
  storyDots.forEach(dt => {
    const meta = dt.meta;
    const isMember = !!meta.clusterHeadId;
    if (isMember !== !!meta.member) { meta.member = isMember; dt.owner.classList.toggle("is-member", isMember); }
    setClusterCount(meta, isMember ? 0 : (meta.members || []).length);
  });

  items.sort((a, b) => {
    const pa = (a.meta.pinned ? 1e6 : 0) + a.meta.priority + (a.meta.visible ? 8 : 0);
    const pb = (b.meta.pinned ? 1e6 : 0) + b.meta.priority + (b.meta.visible ? 8 : 0);
    return pb - pa;
  });
  const budget = labelBudget();
  const used = { event: 0, tag: 0, endpoint: 0, chip: 0 };
  const placed = [];
  const placedMetas = new Set();

  for (const it of items) {
    const { meta, x, y, wrapper } = it;
    if (!meta.w) continue;
    const pinned = !!meta.pinned;
    const key = budgetKey(meta.kind);
    const isEvent = meta.kind === "event";
    let chosen = null;
    let fold = null;

    // party pills and relation chips belong to a raised story only
    const raisedOnly = meta.kind === "endpoint" || meta.kind === "chip";
    let eligible = pinned || (
      !raisedOnly &&
      meta.eligible !== false &&
      !meta.member &&
      (meta.noLimb || meta.facing >= 0.18) &&
      used[key] < (budget[key] || 0)
    );
    // a relation chip whose two ends nearly touch on screen adds clutter, not information
    if (eligible && meta.kind === "chip" && meta.ends) {
      const a = world.getScreenCoords(meta.ends[0], meta.ends[1], 0.01);
      const b = world.getScreenCoords(meta.ends[2], meta.ends[3], 0.01);
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < meta.w + 16) eligible = false;
    }

    if (eligible) {
      const order = slotOrder(meta);
      const passes = isEvent ? 2 : 1;
      for (let pass = 0; pass < passes && !chosen; pass++) {
        const last = isEvent && pass === passes - 1;
        for (const pos of order) {
          const r = labelRectAt(x, y, meta, pos);
          // incumbents tolerate 2px of overlap; newcomers need 4px of clearance
          const pad = meta.visible && pos === meta.pos ? -2 : 4;
          const test = { x1: r.x1 - pad / 2, y1: r.y1 - pad / 2, x2: r.x2 + pad / 2, y2: r.y2 + pad / 2 };
          let ok = r.x1 >= 6 && r.y1 >= 6 && r.x2 <= W - 6 && r.y2 <= H - 6;
          if (ok) for (const hr of labelLayout.hudRects) { if (rectsOverlap(test, hr, 0)) { ok = false; break; } }
          // story marks are obstacles for every label (raised ones too). On a headline's last pass a
          // party terminal may be covered, and so may a lower-priority story right next to it —
          // that story is folded into this headline's "+N" instead of being buried unseen.
          let covered = null;
          if (ok) {
            for (const dt of dots) {
              if (dt.owner === wrapper || dt.meta.member || !rectsOverlap(test, dt, 0)) continue;
              if (dt.soft) {
                if (last) continue;
                ok = false; break;
              }
              if (last && !dt.meta.pinned && !dt.owner.classList.contains("is-hot") && !placedMetas.has(dt.meta) &&
                  dt.prio < meta.priority && Math.hypot(dt.cx - x, dt.cy - y) <= FOLD_R) {
                (covered || (covered = [])).push(dt);
                continue;
              }
              ok = false; break;
            }
          }
          if (ok) for (const p of placed) { if (rectsOverlap(test, p, 0)) { ok = false; break; } }
          if (ok) { chosen = { pos, r }; fold = covered; break; }
        }
      }
      // the raised headline always shows: least-bad slot (inside the screen, off the panels and the
      // labels already placed). Its party pills and chips simply stay hidden when nothing is free —
      // the drawer lists them anyway.
      if (!chosen && pinned && isEvent) {
        let best = null;
        for (const pos of order) {
          const r = labelRectAt(x, y, meta, pos);
          let cost = Math.max(0, 6 - r.x1) + Math.max(0, 6 - r.y1) + Math.max(0, r.x2 - (W - 6)) + Math.max(0, r.y2 - (H - 6));
          for (const hr of labelLayout.hudRects) {
            const ox = Math.max(0, Math.min(r.x2, hr.x2) - Math.max(r.x1, hr.x1));
            const oy = Math.max(0, Math.min(r.y2, hr.y2) - Math.max(r.y1, hr.y1));
            cost += (ox * oy) / 10;
          }
          for (const p of placed) {
            const ox = Math.max(0, Math.min(r.x2, p.x2) - Math.max(r.x1, p.x1));
            const oy = Math.max(0, Math.min(r.y2, p.y2) - Math.max(r.y1, p.y1));
            cost += (ox * oy) / 40;
          }
          if (!best || cost < best.cost) best = { pos, r, cost };
        }
        chosen = { pos: best.pos, r: best.r };
      }
    }

    const want = !!chosen;
    // 2-pass hold for non-pinned flips (first decision and pinned flips are immediate)
    let show = want;
    if (!pinned && meta.decided && want !== meta.visible) {
      meta.hold = (meta.hold || 0) + 1;
      if (meta.hold < 2) {
        show = meta.visible;
        labelLayout.dirty = true; // follow-up pass
      }
    } else {
      meta.hold = 0;
    }
    meta.decided = true;

    if (show) {
      const r = chosen ? chosen.r : labelRectAt(x, y, meta, meta.pos);
      placed.push(r);
      placedMetas.add(meta);
      used[key] = (used[key] || 0) + 1;
      if (chosen && chosen.pos !== meta.pos) {
        meta.pos = chosen.pos;
        if (meta.anchor !== "center") meta.labelEl.setAttribute("data-pos", chosen.pos);
      }
      applyLabelShift(meta, r);
      if (fold) foldUnder(meta, fold);
      if (!meta.visible) setLabelShown(wrapper, true);
    } else if (meta.visible) {
      setLabelShown(wrapper, false);
    }
  }
  if (state.highlightEventId && !state.selectedEvent) updateFarSideHint();
}

function setLabelShown(wrapper, shown) {
  const meta = wrapper.__lbl;
  meta.visible = shown;
  wrapper.classList.toggle("lbl-off", !shown);
}

function startLabelLayoutLoop() {
  if (labelLayout.timer) return;
  const tick = () => {
    labelLayout.timer = requestAnimationFrame(tick);
    if (!world || document.hidden) return;
    const key = cameraKey();
    if (key !== labelLayout.camKey) {
      labelLayout.camKey = key;
      labelLayout.dirty = true;
      if (stackMenuState.open && stackMenuCameraMoved()) closeStackMenu();
      if (state.highlightEventId) updateFarSideHint();
    }
    const since = performance.now() - labelLayout.lastRun;
    if ((labelLayout.dirty && since >= 120) || since > 600) runLabelLayout();
  };
  labelLayout.timer = requestAnimationFrame(tick);
  window.addEventListener("resize", markHudDirty);
}

// ---------------------------------------------------------------------------
// 14. Highlight sync (globe <-> feed)
// ---------------------------------------------------------------------------
const highlightSources = new Map(); // source -> eventId
let highlightLeaveTimer = null;
let scrollCardTimer = null;

function setHighlight(eventId, source) {
  clearTimeout(highlightLeaveTimer);
  highlightSources.set(source, eventId);
  updateHighlight();
  // a marker/arc hover brings its card into view after a short dwell (unless the pointer is in the list)
  clearTimeout(scrollCardTimer);
  if ((source === "marker" || source === "arc") && pointer.type === "mouse" && feedListShown()) {
    scrollCardTimer = setTimeout(() => {
      const list = document.getElementById("newsFeedList");
      if (!list || list.matches(":hover")) return;
      const card = list.querySelector(`.feed-day .feed-card[data-event-id="${cssEscape(eventId)}"]`);
      if (card) scrollCardIntoList(card, RM.matches ? "auto" : "smooth");
    }, 350);
  }
}

// The feed list is on screen (desktop panel open, or the phone sheet pulled up)
function feedListShown() {
  const R = document.getElementById("rightSidebar");
  if (!R || document.body.classList.contains("detail-open")) return false;
  if (window.innerWidth < 1024) return ["half", "full"].includes(R.getAttribute("data-sheet"));
  return !R.classList.contains("is-collapsed");
}

// Scroll only the list (never the page) so that a card is in view
function scrollCardIntoList(card, behavior = "auto") {
  const list = document.getElementById("newsFeedList");
  if (!list || !card || !list.contains(card)) return;
  const lr = list.getBoundingClientRect(), cr = card.getBoundingClientRect();
  if (cr.top >= lr.top && cr.bottom <= lr.bottom) return;
  const y = cr.top - lr.top + list.scrollTop;
  list.scrollTo({ top: Math.max(0, y - list.clientHeight / 3), behavior });
}

function clearHighlight(source) {
  clearTimeout(scrollCardTimer);
  highlightSources.delete(source);
  // a short grace so moving between a dot and its label doesn't flicker
  clearTimeout(highlightLeaveTimer);
  // a list hover that put up the far-side hint lingers briefly, so the pointer can travel to it
  const hint = document.getElementById("farSideHint");
  const toHint = source === "card" && hint && !hint.classList.contains("is-hidden");
  highlightLeaveTimer = setTimeout(updateHighlight, toHint ? 1500 : source === "card" ? 0 : 120);
}

function updateHighlight() {
  let id = null;
  ["marker", "arc", "card"].forEach(src => { if (!id && highlightSources.get(src)) id = highlightSources.get(src); });
  if (id === state.highlightEventId) return;
  state.highlightEventId = id;
  // the globe holds still while something is being pointed at, and resumes shortly after
  if (id) rotation.hovering = true;
  else { rotation.hovering = false; rotation.lastInteractionAt = performance.now() - 2500; }
  updateAutoRotate();
  applyHighlight();
}

let polyRefreshRaf = null;
function refreshPolygonColors() {
  if (polyRefreshRaf) cancelAnimationFrame(polyRefreshRaf);
  polyRefreshRaf = requestAnimationFrame(() => {
    polyRefreshRaf = null;
    repaintPolygons();
  });
}

function applyHighlight() {
  const hl = activeHighlightId();
  const evt = hl ? RAW_NEWS_EVENTS.find(e => e.id === hl) : null;
  const involved = new Set(evt ? eventCountryCodes(evt).concat((evt.parties || []).map(partyCountryCode)) : []);
  const prevKey = state.raised ? state.raised.key : "";
  state.raised = evt ? { key: `${evt.id}`, codes: involved, color: categoryMeta(evt).color } : null;

  labelLayout.registry.forEach(w => {
    const m = w.__lbl;
    if (!m) return;
    const related = !!hl && m.eventId === hl;
    if (m.kind === "country") {
      w.classList.toggle("is-dim", !!hl && !involved.has(m.code));
      return;
    }
    if (m.kind === "state") return;
    w.classList.toggle("is-hot", related);
    w.classList.toggle("is-dim", !!hl && !related);
    if (m.kind === "event" || m.kind === "endpoint" || m.kind === "chip") m.pinned = related;
  });
  document.getElementById("globeViz").classList.toggle("has-raised", !!hl);
  // a raise/lower is a deliberate change: decide every label afresh (no hysteresis hold)
  labelLayout.registry.forEach(w => { if (w.__lbl) { w.__lbl.decided = false; w.__lbl.hold = 0; } });
  labelLayout.dirty = true;
  labelLayout.lastRun = 0;
  if (world) world.arcColor(world.arcColor()).arcStroke(world.arcStroke());
  if ((state.raised ? state.raised.key : "") !== prevKey) refreshPolygonColors();

  document.querySelectorAll(".feed-card.is-linked, .story-item.is-linked").forEach(c => c.classList.remove("is-linked"));
  if (hl) {
    document.querySelectorAll(`[data-event-id="${cssEscape(hl)}"]`).forEach(c => {
      if (c.classList.contains("feed-card") || c.classList.contains("story-item")) c.classList.add("is-linked");
    });
  }
  updateFarSideHint();
}

// ---------------------------------------------------------------------------
// 14b. Far-side hint — a list hover whose story is behind the globe points to it from the rim
// ---------------------------------------------------------------------------
function updateFarSideHint() {
  const hint = document.getElementById("farSideHint");
  if (!hint || !world) return;
  const id = state.highlightEventId;
  const evt = id && !state.selectedEvent ? RAW_NEWS_EVENTS.find(e => e.id === id) : null;
  if (!evt || !Number.isFinite(evt.lat) || !Number.isFinite(evt.lng)) { hint.classList.add("is-hidden"); return; }
  // the raised headline itself is on screen (it shows even on the rim): no second pointer to it
  const wrap = labelLayout.registry.get(`evt-${evt.id}`);
  if (wrap && wrap.__lbl && wrap.__lbl.visible && wrap.isConnected && wrap.style.display !== "none") { hint.classList.add("is-hidden"); return; }

  const cam = world.camera().position;
  const camLen = Math.hypot(cam.x, cam.y, cam.z) || 1;
  const c = [cam.x / camLen, cam.y / camLen, cam.z / camLen];
  const n = latLngToUnit(evt.lat, evt.lng);
  const r = GLOBE_R * 1.02;
  const vx = cam.x - n[0] * r, vy = cam.y - n[1] * r, vz = cam.z - n[2] * r;
  const facing = (n[0] * vx + n[1] * vy + n[2] * vz) / (Math.hypot(vx, vy, vz) || 1);
  if (facing >= 0.18) { hint.classList.add("is-hidden"); return; }

  // direction on screen: the story's normal projected onto the plane facing the camera
  const dot = n[0] * c[0] + n[1] * c[1] + n[2] * c[2];
  let t = [n[0] - dot * c[0], n[1] - dot * c[1], n[2] - dot * c[2]];
  const tl = Math.hypot(t[0], t[1], t[2]);
  if (tl < 1e-3) t = [0, 1, 0]; else t = [t[0] / tl, t[1] / tl, t[2] / tl];
  // the visible rim sits at acos(R/d) from the view axis
  const limbAng = Math.acos(Math.min(1, GLOBE_R / camLen));
  const rim = [c[0] * Math.cos(limbAng) + t[0] * Math.sin(limbAng), c[1] * Math.cos(limbAng) + t[1] * Math.sin(limbAng), c[2] * Math.cos(limbAng) + t[2] * Math.sin(limbAng)];
  const rimLL = unitToLatLng(rim);
  const centre = world.getScreenCoords(0, 0, -1);
  const edge = world.getScreenCoords(rimLL.lat, rimLL.lng, 0);
  if (!centre || !edge) { hint.classList.add("is-hidden"); return; }
  const dx = edge.x - centre.x, dy = edge.y - centre.y;
  const len = Math.hypot(dx, dy) || 1;

  hint.innerHTML = `<span class="far-arrow" style="transform:rotate(${Math.atan2(dy, dx)}rad)" aria-hidden="true">${icon("arrow", 13)}</span><span>지구 반대편 · ${escapeHtml(eventBrief(evt, 16))}</span>`;
  hint.setAttribute("data-event-id", evt.id);
  hint.style.setProperty("--cat", categoryMeta(evt).color);
  hint.classList.remove("is-hidden");
  const w = hint.offsetWidth, h = hint.offsetHeight;
  let x = edge.x + (dx / len) * 26 - w / 2;
  let y = edge.y + (dy / len) * 26 - h / 2;
  // inside the free area: never on top of the panels
  const fr = labelLayout.freeRect || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  x = Math.max(fr.left + 8, Math.min(fr.right - w - 8, x));
  y = Math.max(fr.top + 8, Math.min(fr.bottom - h - 8, y));
  hint.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, "\\$&");
}

function hexToRgba(hex, a) {
  const h = String(hex || "#94a3b8").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---------------------------------------------------------------------------
// 15. Render pipeline
// ---------------------------------------------------------------------------
// One malformed record must not freeze the page: every view renders on its own
function safely(label, fn) {
  try { fn(); } catch (err) { console.error(`[render:${label}]`, err); }
}

function refreshAll() {
  state.lastFiltered = sortForFeed(getFilteredEvents());
  const visibleIds = new Set(state.lastFiltered.map(e => e.id));
  let dropped = false;
  ["marker", "arc"].forEach(src => {
    const id = highlightSources.get(src);
    if (id && !visibleIds.has(id)) { highlightSources.delete(src); dropped = true; }
  });
  if (dropped) { hideTooltip(); updateHighlight(); }
  safely("globe", () => renderGlobeData(state.lastFiltered));
  safely("feed", () => renderNewsFeed(state.lastFiltered));
  safely("brief", () => renderTopStories(state.lastFiltered));
  safely("chips", renderCategoryChips);
  safely("picker", renderCountryPicker);
  safely("timeline", renderTimelineDensity);
  safely("filters", renderActiveFilters);
  safely("tension", updateTensionMeter);
  safely("focus", renderFocusCounts);
  safely("fade", updateLeftFade);
  safely("demo", syncDemoBadge); // live arrivals can add (or be) demo stories
  const ge = document.getElementById("globeEmptyState");
  if (ge) ge.classList.toggle("is-hidden", state.lastFiltered.length > 0);
  if (state.selectedEvent) {
    if (!state.lastFiltered.some(e => e.id === state.selectedEvent.id)) closeEventDetail();
    else updateDetailNav();
  }
}

function renderGlobeData(events) {
  const list = events || state.lastFiltered;
  const markers = buildGlobeMarkers(list);
  currentMarkerIds = new Set(markers.map(m => m.id));
  world.htmlElementsData(markers);
  syncAllMarkerStates(markers);

  if (state.showArcs) {
    const arcs = [];
    list.forEach(evt => {
      (evt.arcs || []).forEach((arc, i) => {
        if (![arc.startLat, arc.startLng, arc.endLat, arc.endLng].every(Number.isFinite)) return;
        const key = `${evt.id}|${arc.id || i}`;
        let d = arcCache.get(key);
        if (!d) { d = Object.assign({}, arc); arcCache.set(key, d); }
        d.eventRef = evt;
        arcs.push(d);
      });
    });
    world.arcsData([KEEP_ARC].concat(arcs));
  } else {
    world.arcsData([KEEP_ARC]);
  }
  refreshPolygonColors();
  labelLayout.dirty = true;
  // freshly created markers pick up hover/selection classes on the next frame (once per frame,
  // so a hidden tab's playback ticks can't queue a backlog)
  if (!applyHlRaf) applyHlRaf = requestAnimationFrame(() => { applyHlRaf = null; applyHighlight(); });
}
let applyHlRaf = null;
// An invisible arc that is always present keeps the arc shader alive: filtering to a category with
// no arcs used to free it, and coming back recompiled it synchronously (a visible hitch).
const KEEP_ARC = { id: "__keep", startLat: 0, startLng: 0, endLat: 0, endLng: 0.01, __keep: true };

// ---------------------------------------------------------------------------
// 16. Category chips (one filter, doubles as the color legend)
// ---------------------------------------------------------------------------
function initCategoryChips() {
  const nav = document.getElementById("categoryChips");
  if (!nav) return;
  nav.innerHTML = FILTER_CHIPS.map(c => {
    const meta = CATEGORY_META[c.key];
    const dot = meta
      ? `<i class="chip-dot" style="background:${meta.color}"></i>`
      : `<span class="chip-icon">${icon(c.key === "domestic" ? "pin" : "all", 14)}</span>`;
    return `
      <button type="button" class="cat-chip${c.key === state.selectedCategory ? " is-active" : ""}" data-cat="${c.key}" aria-pressed="${c.key === state.selectedCategory}" title="${c.key === "domestic" ? "한 나라 안에서 일어난 이슈 · 국가 간 연결선 없음" : c.label}" ${meta ? `style="${catStyle(c.key)}"` : ""}>
        ${dot}<span class="chip-label">${c.label}</span><span class="chip-label-short">${c.short}</span><span class="chip-count" data-count-for="${c.key}">0</span>
      </button>`;
  }).join("");

  nav.addEventListener("click", e => {
    const btn = e.target.closest(".cat-chip");
    if (!btn) return;
    setCategoryPreview(null);
    setCategory(btn.getAttribute("data-cat"));
  });
  nav.addEventListener("mouseover", e => {
    const btn = e.target.closest(".cat-chip");
    const key = btn && btn.getAttribute("data-cat");
    setCategoryPreview(key && CATEGORY_META[key] && state.selectedCategory === "all" ? key : null);
  });
  nav.addEventListener("mouseleave", () => setCategoryPreview(null));
  // narrow desktops: a plain vertical wheel scrolls the row sideways when it overflows
  nav.addEventListener("wheel", e => {
    if (nav.scrollWidth <= nav.clientWidth + 1 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    nav.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  nav.addEventListener("scroll", updateChipFade, { passive: true });
  window.addEventListener("resize", updateChipFade);
  nav.setAttribute("role", "radiogroup");
  nav.addEventListener("keydown", e => {
    const chips = [...nav.querySelectorAll(".cat-chip")].filter(c => !c.classList.contains("is-hidden"));
    const i = chips.indexOf(document.activeElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % chips.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + chips.length) % chips.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = chips.length - 1;
    if (j < 0) return;
    e.preventDefault();
    e.stopPropagation();
    chips.forEach((c, k) => c.setAttribute("tabindex", k === j ? "0" : "-1"));
    chips[j].focus();
  });
}

// The row fades at the right edge only while more chips are hidden there
function updateChipFade() {
  const nav = document.getElementById("categoryChips");
  if (!nav) return;
  let overflow = nav.scrollWidth > nav.clientWidth + 1;
  // the fade's own end padding must not keep it on once the chips fit again (web-font swap, the
  // 데모 badge): re-check without it while the row sits at its start (nothing can shift there)
  if (overflow && nav.classList.contains("has-overflow") && nav.scrollLeft < 1) {
    nav.classList.remove("has-overflow");
    overflow = nav.scrollWidth > nav.clientWidth + 1;
  }
  nav.classList.toggle("has-overflow", overflow);
  nav.classList.toggle("at-end", !overflow || nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2);
}

// Chip hover = legend: that category stays bright on the globe, the rest fades
function setCategoryPreview(cat) {
  if ((state.previewCategory || null) === (cat || null)) return;
  state.previewCategory = cat || null;
  const globeEl = document.getElementById("globeViz");
  if (globeEl) globeEl.classList.toggle("has-preview", !!cat);
  labelLayout.registry.forEach(w => {
    const m = w.__lbl;
    if (!m || !m.cat) return;
    w.classList.toggle("is-faded", !!cat && m.cat !== cat);
  });
  if (world) world.arcColor(world.arcColor());
}

function setCategory(cat) {
  if (!cat) return;
  soundEngine.playBeep(850, 0.04);
  state.selectedCategory = (state.selectedCategory === cat && cat !== "all") ? "all" : cat;
  refreshAll();
  reframeToMatches();
}

// After an explicit filter change, if none of the matching stories is in view (all behind the
// globe or under a panel), turn the globe to the most important ones. A camera that already
// shows a match never moves, and nothing moves while reading, focusing, touring or playing.
function reframeToMatches() {
  if (!world || state.selectedEvent || state.focusedCountry || tour.running || state.isPlaying) return;
  const list = state.lastFiltered.filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng));
  if (!list.length) return;
  const cam = world.camera().position;
  const camLen = Math.hypot(cam.x, cam.y, cam.z) || 1;
  const limb = GLOBE_R / camLen;
  const fr = labelLayout.freeRect || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const inView = e => {
    const n = latLngToUnit(e.lat, e.lng);
    if ((n[0] * cam.x + n[1] * cam.y + n[2] * cam.z) / camLen < limb + 0.05) return false;
    const p = world.getScreenCoords(e.lat, e.lng, 0.02);
    return !!p && p.x >= fr.left + 12 && p.x <= fr.right - 12 && p.y >= fr.top + 12 && p.y <= fr.bottom - 12;
  };
  if (list.some(inView)) return;
  const top = rankForBrief(list).slice(0, 4);
  const v = frameEventView({ lat: top[0].lat, lng: top[0].lng, parties: top.slice(1).map(e => ({ lat: e.lat, lng: e.lng })) });
  flyTo({ lat: v.lat, lng: v.lng, altitude: Math.max(v.altitude, state.defaultAltitude * 0.9) }, 1100);
  rotation.lastInteractionAt = performance.now();
  updateAutoRotate();
}

function renderCategoryChips() {
  const base = getFilteredEvents({ category: true });
  document.querySelectorAll(".cat-chip").forEach(btn => {
    const key = btn.getAttribute("data-cat");
    const n = key === "all" ? base.length
      : key === "domestic" ? base.filter(isDomesticEvent).length
      : base.filter(e => normalizeCategory(e) === key).length;
    const countEl = btn.querySelector(".chip-count");
    if (countEl) countEl.textContent = n;
    const active = key === state.selectedCategory;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(active));
    btn.setAttribute("tabindex", active ? "0" : "-1");
    btn.classList.toggle("is-active", active);
    btn.classList.toggle("is-empty", n === 0 && !active);
    // "기타" only exists when something lands there (live/RSS items without a known topic)
    if (key === "other") btn.classList.toggle("is-hidden", n === 0 && !active);
  });
  updateChipFade();
}

// ---------------------------------------------------------------------------
// 17. Country picker + focus mode
// ---------------------------------------------------------------------------
function countryFeature(code) {
  return state.countriesGeoJson.find(f => f.properties && f.properties._code === code) || null;
}

function allPickerCountries() {
  const codes = new Set(Object.keys(typeof COUNTRY_PROFILES !== "undefined" ? COUNTRY_PROFILES : {}));
  RAW_NEWS_EVENTS.forEach(e => (e.countryCodes || []).forEach(c => codes.add(c)));
  const labelled = new Set(typeof MAJOR_COUNTRY_LABELS !== "undefined" ? MAJOR_COUNTRY_LABELS.map(l => l.code) : []);
  // a country we can't place on the globe would send the camera to 0°,0°
  return [...codes].filter(c => c && c.length === 2 &&
    ((typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[c]) || labelled.has(c) || countryFeature(c)));
}

function initCountryPicker() {
  const btn = document.getElementById("countryPickerBtn");
  const pop = document.getElementById("countryPickerPopover");
  const input = document.getElementById("countrySearchInput");
  const list = document.getElementById("countryPillsContainer");
  if (!btn || !pop || !list) return;

  btn.addEventListener("click", e => {
    e.stopPropagation();
    toggleCountryPicker();
  });
  if (input) {
    input.addEventListener("input", () => renderCountryPicker());
    input.addEventListener("keydown", e => {
      const opts = [...list.querySelectorAll(".country-option")];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        // into the list: the best match while searching, else the first row
        const target = (input.value.trim() && list.querySelector(".country-option[data-country]:not([data-country='ALL'])")) || opts[0];
        if (target) target.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const pick = list.querySelector(".country-option[data-country]:not([data-country='ALL'])");
        if (pick) pick.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeCountryPicker();
        btn.focus();
      }
    });
  }
  list.addEventListener("click", e => {
    const opt = e.target.closest(".country-option");
    if (!opt) return;
    const code = opt.getAttribute("data-country");
    closeCountryPicker();
    if (code === "ALL") clearFocusCountry();
    else if (code !== state.focusedCountry) focusCountry(code, null, countryFeature(code));
    focusQuietly(btn); // focus never falls back to <body>
  });
  list.addEventListener("keydown", e => {
    const opts = [...list.querySelectorAll(".country-option")];
    const i = opts.indexOf(document.activeElement);
    if (i < 0) return;
    let target = null;
    if (e.key === "ArrowDown") target = opts[Math.min(opts.length - 1, i + 1)];
    else if (e.key === "ArrowUp") target = i === 0 ? input : opts[i - 1];
    else if (e.key === "Home") target = opts[0];
    else if (e.key === "End") target = opts[opts.length - 1];
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCountryPicker(); btn.focus(); return; }
    if (target) { e.preventDefault(); target.focus(); }
  });
  document.addEventListener("click", e => {
    if (!pop.classList.contains("is-hidden") && !e.target.closest("#countryPicker")) closeCountryPicker();
  });
}

const pickerCursor = { index: -1 };

function toggleCountryPicker() {
  const pop = document.getElementById("countryPickerPopover");
  if (!pop) return;
  if (pop.classList.contains("is-hidden")) openCountryPicker();
  else closeCountryPicker();
}

function openCountryPicker() {
  const pop = document.getElementById("countryPickerPopover");
  const btn = document.getElementById("countryPickerBtn");
  const input = document.getElementById("countrySearchInput");
  if (!pop) return;
  pop.classList.remove("is-hidden");
  if (btn) btn.setAttribute("aria-expanded", "true");
  renderCountryPicker();
  if (input) { input.value = ""; renderCountryPicker(); setTimeout(() => input.focus(), 0); }
}

function closeCountryPicker() {
  const pop = document.getElementById("countryPickerPopover");
  const btn = document.getElementById("countryPickerBtn");
  if (!pop || pop.classList.contains("is-hidden")) return false;
  pop.classList.add("is-hidden");
  if (btn) btn.setAttribute("aria-expanded", "false");
  return true;
}

function renderCountryPicker() {
  const list = document.getElementById("countryPillsContainer");
  const pop = document.getElementById("countryPickerPopover");
  if (!list || !pop || pop.classList.contains("is-hidden")) return;
  const input = document.getElementById("countrySearchInput");
  const q = input ? input.value.trim().toLowerCase() : "";

  const base = getFilteredEvents({ country: true });
  const rows = allPickerCountries().map(code => {
    const p = (typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[code]) || null;
    const name = p ? p.name : countryName(code);
    const eng = p ? p.englishName : "";
    const n = base.filter(e => (e.countryCodes || []).includes(code) || e.primaryCountry === code).length;
    return { code, name, eng, n };
  }).filter(r => !q || `${r.name} ${r.eng} ${countrySearchText(r.code)}`.toLowerCase().includes(q))
    .sort((a, b) => (b.n - a.n) || a.name.localeCompare(b.name, "ko"));

  const allRow = !q ? `
    <button type="button" class="country-option${!state.focusedCountry ? " is-active" : ""}" data-country="ALL"${!state.focusedCountry ? ' aria-current="true"' : ""} tabindex="-1">
      <span class="co-flag">${icon("all", 17)}</span><span class="co-name">전체 국가</span><span class="co-count">${base.length}</span>
    </button>` : "";

  const row = r => `
    <button type="button" class="country-option${state.focusedCountry === r.code ? " is-active" : ""}${r.n === 0 ? " is-empty" : ""}" data-country="${escapeHtml(r.code)}"${state.focusedCountry === r.code ? ' aria-current="true"' : ""} tabindex="-1">
      <span class="co-flag">${getFlagHtml(r.code, 18)}</span>
      <span class="co-name">${escapeHtml(r.name)}<small>${escapeHtml(r.eng || r.code)}</small></span>
      ${r.n ? `<span class="co-count">${r.n}</span>` : ""}
    </button>`;
  const withNews = rows.filter(r => r.n > 0), others = rows.filter(r => r.n === 0);
  list.innerHTML = rows.length
    ? allRow +
      (withNews.length ? `<div class="picker-group">뉴스 있는 국가</div>${withNews.map(row).join("")}` : "") +
      (others.length ? `<div class="picker-group">기타 국가</div>${others.map(row).join("")}` : "")
    : `<div class="picker-empty">"${escapeHtml(q)}"에 해당하는 국가가 없습니다</div>`;
  pickerCursor.index = -1;
  // one Tab stop into the list (the current choice, else the first row); arrows move inside
  const entry = list.querySelector(".country-option[aria-current]") || list.querySelector(".country-option");
  if (entry) entry.tabIndex = 0;
}

function getOrCreateCountryProfile(code, feature) {
  if (typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[code]) {
    return COUNTRY_PROFILES[code];
  }
  let labelMatch = null;
  if (typeof MAJOR_COUNTRY_LABELS !== "undefined") {
    labelMatch = MAJOR_COUNTRY_LABELS.find(l => l.code === code);
  }

  let name = code;
  let englishName = code;
  let lat = 0;
  let lng = 0;
  let flag = "🌐";

  if (labelMatch) {
    name = labelMatch.name;
    englishName = labelMatch.englishName;
    lat = labelMatch.lat;
    lng = labelMatch.lng;
    flag = labelMatch.flag;
  } else if (feature && feature.properties) {
    name = feature.properties.NAME || feature.properties.ADMIN || code;
    englishName = feature.properties.NAME_LONG || feature.properties.ADMIN || code;
    const centroid = getPolygonCentroid(feature);
    lat = centroid.lat;
    lng = centroid.lng;
  } else {
    // a party location from any event as a last resort
    // (nothing to stand on → no profile: an invented 0°,0° sent the camera to the Gulf of Guinea)
    const ev = RAW_NEWS_EVENTS.find(e => (e.parties || []).some(p => p.code === code));
    const party = ev && ev.parties.find(p => p.code === code);
    if (!party) return null;
    lat = party.lat; lng = party.lng; name = countryName(code);
  }

  const newProfile = {
    code, name, englishName, flag, lat, lng,
    altitude: 1.35,
    alliances: [],
    conflicts: [],
    dossier: `${name} (${englishName}) — 관련 뉴스와 국가 간 연결을 모아 보는 중입니다.`
  };

  if (typeof COUNTRY_PROFILES !== "undefined") {
    COUNTRY_PROFILES[code] = newProfile;
  }
  return newProfile;
}

function focusCountry(code, customCoords, feature) {
  if (!code) return;

  // Re-selecting the focused country clears focus
  if (state.focusedCountry === code) {
    clearFocusCountry();
    return;
  }

  const profile = getOrCreateCountryProfile(code, feature);
  if (!profile) return;

  state.focusedCountry = code;
  soundEngine.playRadarPing();
  if (state.selectedEvent) closeEventDetail();

  updateFocusUi(profile, code);

  const targetLat = (customCoords && customCoords.lat !== undefined) ? customCoords.lat : profile.lat;
  const targetLng = (customCoords && customCoords.lng !== undefined) ? customCoords.lng : profile.lng;
  flyTo({ lat: targetLat, lng: targetLng, altitude: profile.altitude || 1.35 }, 1200);

  repaintPolygons();
  refreshAll();
  updateAutoRotate();
}

function updateFocusUi(profile, code) {
  const clearBtn = document.getElementById("clearFocusBtn");
  const pickerLabel = document.getElementById("countryPickerLabel");
  const pickerFlag = document.getElementById("countryPickerFlag");
  const pickerBtn = document.getElementById("countryPickerBtn");
  // the × joins the header row: 320-class phones make room for it (.has-country-focus in styles.css)
  const header = document.getElementById("appHeader");
  if (header) header.classList.toggle("has-country-focus", !!profile);

  if (profile) {
    if (clearBtn) clearBtn.classList.remove("is-hidden");
    if (pickerFlag) pickerFlag.innerHTML = getFlagHtml(code, 16);
    if (pickerBtn) pickerBtn.classList.add("is-active");
  } else {
    if (clearBtn) clearBtn.classList.add("is-hidden");
    if (pickerLabel) pickerLabel.textContent = "전체 국가";
    if (pickerFlag) pickerFlag.innerHTML = icon("all", 15);
    if (pickerBtn) pickerBtn.classList.remove("is-active");
  }

  const dossierCard = document.getElementById("countryDossierCard");
  if (!dossierCard) return;
  if (!profile) {
    dossierCard.classList.add("is-hidden");
    markHudDirty();
    return;
  }
  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  const chips = list => (list && list.length)
    ? list.map(c => `<button type="button" class="mini-country" data-focus-code="${escapeHtml(c)}">${getFlagHtml(c, 14)}${escapeHtml(countryName(c))}</button>`).join("")
    : "";
  set("dossierFlag", el => { el.innerHTML = getFlagHtml(code, 32); });
  set("dossierName", el => { el.textContent = profile.name; });
  set("dossierCode", el => { el.textContent = profile.englishName || code; });
  set("dossierDesc", el => { el.textContent = profile.dossier || ""; });
  set("dossierAlliances", el => { el.innerHTML = chips(profile.alliances) || '<span class="muted">없음</span>'; });
  set("dossierConflicts", el => { el.innerHTML = chips(profile.conflicts) || '<span class="muted">없음</span>'; });
  renderFocusCounts();
  dossierCard.classList.remove("is-hidden");
  markHudDirty();
  updateLeftFade();
}

// The focused country's counts (header picker + dossier) — re-rendered with every refresh
function renderFocusCounts() {
  const code = state.focusedCountry;
  if (!code) return;
  const has = e => (e.countryCodes || []).includes(code) || e.primaryCountry === code;
  const profile = (typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[code]) || null;
  const pickerLabel = document.getElementById("countryPickerLabel");
  if (pickerLabel) {
    const n = getFilteredEvents({ country: true }).filter(has).length;
    pickerLabel.innerHTML = `${escapeHtml(profile ? profile.name : countryName(code))} <span class="cp-count">${n}건</span>`;
  }
  const stats = document.getElementById("dossierStats");
  if (stats) {
    const rel = RAW_NEWS_EVENTS.filter(e => eventMatches(e, { country: true, category: true, search: true }) && has(e));
    const latest = rel.map(e => e.date).sort().pop();
    stats.textContent = rel.length ? `관련 뉴스 ${rel.length}건 · 최근 ${formatDateKo(latest, false)}` : "이 기간 관련 뉴스 없음";
  }
}

// The brief column hints at more content below (headless hides scrollbars; real ones are thin)
function updateLeftFade() {
  const L = document.getElementById("leftSidebar");
  if (L) L.classList.toggle("has-more", L.scrollTop + L.clientHeight < L.scrollHeight - 4);
}

function clearFocusCountry() {
  if (!state.focusedCountry) return;
  state.focusedCountry = null;
  soundEngine.playBeep(700, 0.05);
  if (state.selectedEvent) closeEventDetail();
  updateFocusUi(null);
  flyTo({ altitude: state.defaultAltitude }, 1200);
  repaintPolygons();
  refreshAll();
  updateAutoRotate();
}

// ---------------------------------------------------------------------------
// 18. Curated camera angles + "둘러보기" (tour over the top stories)
// ---------------------------------------------------------------------------
// The old hotspot strip duplicated the news list; its hand-tuned camera angles live on
// and are used whenever one of these stories is opened from the brief or the tour.
const HOTSPOT_CAMERA = {
  "evt-20261027-01": { lat: 47.8737, lng: 37.4014, altitude: 1.15 },
  "evt-20261028-01": { lat: 26.2264, lng: 55.9148, altitude: 1.15 },
  "evt-20261028-02": { lat: 75.1944, lng: -157.4884, altitude: 1.35 },
  "evt-20261028-06": { lat: 35.0032, lng: 128.0642, altitude: 0.95 },
  "evt-20261028-07": { lat: 38.8921, lng: -77.0465, altitude: 1.05 },
  "evt-20261028-05": { lat: -22.5695, lng: -74.5368, altitude: 1.25 },
  "evt-20261027-04": { lat: 37.2410, lng: 127.1775, altitude: 0.95 }
};

function triggerHotspotTour(eventId, lat, lng, alt) {
  const evt = RAW_NEWS_EVENTS.find(e => e.id === eventId);
  soundEngine.playRadarPing();
  if (evt) openEventDetail(evt, null, { lat, lng, altitude: alt });
  else flyTo({ lat, lng, altitude: alt }, 1300);
}
window.triggerHotspotTour = triggerHotspotTour;

const tour = { running: false, idx: 0, list: [], timer: null, dwell: 7000 };

function startTour() {
  tour.list = rankForBrief(state.lastFiltered).slice(0, briefSize(state.lastFiltered.length));
  if (!tour.list.length) return;
  if (state.isPlaying) toggleTimelinePlay();
  tour.running = true;
  tour.idx = 0;
  stepTour();
}

function stepTour() {
  if (!tour.running) return;
  // stops the filters now hide are skipped (category or country changed mid-tour)
  while (tour.list[tour.idx] && !eventMatches(tour.list[tour.idx])) tour.idx++;
  const evt = tour.list[tour.idx];
  if (!evt) { stopTour(); return; }
  openEventDetail(evt, null, HOTSPOT_CAMERA[evt.id] || null, { fromTour: true });
  updateTourButton();
  clearTimeout(tour.timer);
  tour.timer = setTimeout(() => {
    tour.idx++;
    if (tour.idx >= tour.list.length) stopTour();
    else stepTour();
  }, tour.dwell);
}

function stopTour() {
  if (!tour.running) return;
  tour.running = false;
  clearTimeout(tour.timer);
  updateTourButton();
}

function updateTourButton() {
  const btn = document.getElementById("tourBtn");
  const bar = document.getElementById("tourProgress");
  if (btn) {
    btn.classList.toggle("is-running", tour.running);
    btn.innerHTML = tour.running
      ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>중지 <span class="num">${tour.idx + 1}/${tour.list.length}</span>`
      : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>둘러보기`;
  }
  if (bar) {
    bar.classList.toggle("is-running", tour.running);
    bar.style.setProperty("--tour-dwell", `${tour.dwell}ms`);
    // restart the progress animation for each stop
    bar.classList.remove("is-tick");
    void bar.offsetWidth;
    if (tour.running) bar.classList.add("is-tick");
  }
}

// ---------------------------------------------------------------------------
// 19. Left panel: top stories + tension
// ---------------------------------------------------------------------------
function briefSize(visibleCount) {
  return (window.innerHeight < 860 || (visibleCount >= 4 && visibleCount <= 7)) ? 3 : 5;
}

function renderTopStories(events) {
  const list = document.getElementById("topStoriesList");
  if (!list) return;
  const heading = document.getElementById("topStoriesTitle");
  const caption = document.getElementById("topStoriesCaption");
  const atLatest = state.currentDateIndex === state.dates.length - 1;
  if (heading) {
    const scope = (state.focusedCountry || state.selectedCategory !== "all") ? feedScopeTitle().replace(/ 뉴스$/, " ") : (atLatest ? "지금 " : "");
    heading.textContent = `${scope}주요 이슈`;
  }
  if (caption) caption.textContent = `${formatDateKo(state.dates[state.currentDateIndex], false)} 기준`;

  const card = document.getElementById("topStoriesCard");
  const n = briefSize(events.length);
  if (card) card.classList.toggle("is-hidden", events.length <= 3);
  const top = rankForBrief(events).slice(0, n);
  if (!top.length) {
    list.innerHTML = `<li class="story-empty">조건에 맞는 뉴스가 없습니다.</li>`;
    return;
  }
  list.innerHTML = top.map((evt, i) => {
    const cm = categoryMeta(evt);
    const selected = state.selectedEvent && state.selectedEvent.id === evt.id;
    const flags = eventCountryCodes(evt).slice(0, 3).map(c => getFlagHtml(c, 16)).join("");
    return `
      <li>
        <button type="button" class="story-item${i === 0 ? " is-lead" : ""}${selected ? " is-selected" : ""}" data-event-id="${escapeHtml(evt.id)}" style="${catStyle(evt)}">
          <span class="story-rank">${i + 1}</span>
          <span class="story-body">
            <span class="story-kicker">${isLiveEvent(evt) ? '<span class="live-chip">실시간</span>' : ""}<span class="cat-tag"><i></i>${escapeHtml(cm.short)}</span><span class="fc-sep">·</span><span class="story-place">${escapeHtml(placeOf(evt))}</span></span>
            <span class="story-title">${escapeHtml(i === 0 ? evt.title : eventBrief(evt, 22))}</span>
            ${i === 0 && evt.summary ? `<span class="story-summary">${escapeHtml(evt.summary)}</span>` : ""}
            ${i === 0 ? `<span class="story-who"><span class="fc-flags">${flags}</span>${escapeHtml(whoLine(evt))}</span>` : ""}
          </span>
          ${impactChipHtml(evt)}
        </button>
      </li>`;
  }).join("");
}

function computeTension(dateIndex) {
  const date = state.dates[dateIndex];
  let tension = 52;
  RAW_NEWS_EVENTS.forEach(e => {
    if (!isLiveEvent(e) && e.date > date) return;
    if (e.tensionDelta) tension += Number(e.tensionDelta) || 0;
  });
  return Math.max(10, Math.min(98, tension));
}

function updateTensionMeter() {
  const tension = computeTension(state.currentDateIndex);
  const prev = state.currentDateIndex > 0 ? computeTension(state.currentDateIndex - 1) : tension;
  const delta = tension - prev;

  const meterBar = document.getElementById("tensionMeterBar");
  const meterVal = document.getElementById("tensionMeterValue");
  const levelEl = document.getElementById("defconLevel");
  const deltaEl = document.getElementById("tensionDelta");
  const card = document.getElementById("tensionCard");
  const caption = document.getElementById("tensionCaption");
  const drivers = document.getElementById("tensionDrivers");

  let level = { key: "calm", label: "안정" };
  if (tension > 75) level = { key: "alert", label: "위험" };
  else if (tension > 45) level = { key: "watch", label: "주의" };

  if (meterBar) meterBar.style.width = `${tension}%`;
  if (meterVal) meterVal.textContent = tension;
  if (levelEl) levelEl.textContent = level.label;
  if (card) card.setAttribute("data-level", level.key);
  if (caption) caption.textContent = `전 세계 · ${formatDateKo(state.dates[state.currentDateIndex], false)}까지`;
  if (deltaEl) {
    deltaEl.textContent = delta === 0 ? "전일과 같음" : `전일 대비 ${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}`;
    deltaEl.setAttribute("data-trend", delta > 0 ? "up" : delta < 0 ? "down" : "flat");
  }
  const sum = document.getElementById("sheetSummary");
  if (sum) {
    sum.setAttribute("data-level", level.key);
    sum.innerHTML = `<span class="ss-tension">글로벌 긴장도 <b class="num">${tension}</b><em>${level.label}</em>${delta ? `<small>${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}</small>` : ""}</span>` +
      `<span class="ss-legend"><i class="key-dot key-dot--s"></i><i class="key-dot"></i> 크기 = 영향도 · <i class="key-line"></i> 선 = 국가 간 관계</span>`;
  }
  if (drivers) {
    const date = state.dates[state.currentDateIndex];
    const top = RAW_NEWS_EVENTS
      .filter(e => !isLiveEvent(e) && e.date <= date && Number(e.tensionDelta) > 0)
      .sort((a, b) => Number(b.tensionDelta) - Number(a.tensionDelta))
      .slice(0, 3);
    drivers.innerHTML = top.length
      ? `<span class="drivers-label">주요 요인</span>` + top.map(e =>
          `<button type="button" class="driver" data-event-id="${escapeHtml(e.id)}" style="${catStyle(e)}">${escapeHtml(placeOf(e))} <b>+${escapeHtml(e.tensionDelta)}</b></button>`).join("")
      : "";
  }
}

// ---------------------------------------------------------------------------
// 20. News feed (grouped by day, most important first)
// ---------------------------------------------------------------------------
function feedCardHtml(evt) {
  const cm = categoryMeta(evt);
  const live = isLiveEvent(evt);
  const codes = eventCountryCodes(evt).slice(0, 3);
  const flags = codes.map(c => getFlagHtml(c, 16)).join("");
  const who = whoLine(evt);
  const selected = state.selectedEvent && state.selectedEvent.id === evt.id;
  return `
    <article class="feed-card${selected ? " is-selected" : ""}${evt._fresh ? " is-new" : ""}" data-event-id="${escapeHtml(evt.id)}" style="${catStyle(evt)}" tabindex="0" role="button"${selected ? ' aria-current="true"' : ""} aria-label="${escapeHtml(`${live ? "실시간 · " : ""}${cm.short} · ${placeOf(evt)} · ${evt.title}`)}">
      <div class="fc-kicker">
        ${live ? '<span class="live-chip">실시간</span>' : ""}
        <span class="cat-tag"><i></i>${escapeHtml(cm.short)}</span>
        <span class="fc-sep" aria-hidden="true">·</span>
        <span class="fc-place">${escapeHtml(placeOf(evt))}</span>
        <span class="fc-sep" aria-hidden="true">·</span>
        <span class="fc-time"${live ? ` data-reltime="${escapeHtml(evt._receivedAt || "")}"` : ""}>${escapeHtml(eventTimeLabel(evt))}</span>
        ${impactChipHtml(evt)}
      </div>
      <h4 class="fc-title">${escapeHtml(evt.title)}</h4>
      ${who ? `<div class="fc-who"><span class="fc-flags">${flags}</span><span class="fc-who-text">${escapeHtml(who)}</span>${isDomesticEvent(evt) ? '<span class="badge-scope" title="한 나라 안에서 일어난 이슈 · 국가 간 연결선 없음">국가 내부</span>' : ""}</div>` : ""}
    </article>`;
}

function feedScopeTitle() {
  const parts = [];
  if (state.focusedCountry) parts.push(countryName(state.focusedCountry));
  if (state.selectedCategory !== "all") {
    const chip = FILTER_CHIPS.find(c => c.key === state.selectedCategory);
    parts.push(chip ? chip.short : state.selectedCategory);
  }
  if (state.currentDateIndex !== state.dates.length - 1) parts.push(`${formatDateDots(state.dates[state.currentDateIndex])}까지`);
  return parts.length ? `${parts.join(" · ")} 뉴스` : "최신 뉴스";
}

function renderNewsFeed(events) {
  const feedList = document.getElementById("newsFeedList");
  if (!feedList) return;
  const list = events || state.lastFiltered;

  const badge = document.getElementById("feedCountBadge");
  if (badge) badge.textContent = `${list.length}건`;
  const title = document.getElementById("feedTitleText");
  if (title) title.textContent = feedScopeTitle();

  const sheetPeek = document.getElementById("feedSheetPeek");
  if (sheetPeek) {
    const top = rankForBrief(list)[0];
    sheetPeek.textContent = top ? top.title : "조건에 맞는 뉴스가 없습니다.";
  }
  const sheetCount = document.getElementById("feedSheetCount");
  if (sheetCount) sheetCount.textContent = `${list.length}건`;
  const sheetTitle = document.getElementById("feedSheetTitle");
  if (sheetTitle) sheetTitle.textContent = feedScopeTitle();

  if (list.length === 0) {
    feedList.innerHTML = `
      <div class="feed-empty">
        <div class="feed-empty-title">조건에 맞는 뉴스가 없습니다.</div>
        <div class="feed-empty-sub">필터를 줄이거나 날짜를 최신으로 옮겨 보세요.</div>
        <button type="button" class="btn-ghost" data-action="reset-filters">모두 해제</button>
      </div>`;
    announceFeed(list);
    return;
  }

  const groups = [];
  const byKey = new Map();
  list.forEach(evt => {
    const key = isLiveEvent(evt) ? "LIVE" : evt.date;
    if (!byKey.has(key)) { const g = { key, items: [] }; byKey.set(key, g); groups.push(g); }
    byKey.get(key).items.push(evt);
  });

  const latest = state.dates[state.dates.length - 1];
  const briefTop = rankForBrief(list).slice(0, 3);
  const sheetBrief = list.length > 3 ? `
    <section class="sheet-brief" aria-label="지금 주요 이슈">
      <h3 class="panel-title">지금 주요 이슈</h3>
      ${briefTop.map(feedCardHtml).join("")}
    </section>` : "";
  feedList.innerHTML = sheetBrief + groups.map(g => {
    let title, tag = "";
    if (g.key === "LIVE") {
      const d = new Date();
      title = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS_KO[d.getDay()]})`;
      tag = '<span class="day-tag day-tag--live">● 실시간</span>';
    } else {
      title = formatDateKo(g.key);
      if (g.key === latest) tag = '<span class="day-tag">최신</span>';
    }
    return `
      <section class="feed-day" data-day="${escapeHtml(g.key)}">
        <h3 class="feed-day-head">${g.key === "LIVE" ? tag : ""}<span>${escapeHtml(title)}</span>${g.key !== "LIVE" ? tag : ""}<span class="day-count">${g.items.length}건</span></h3>
        ${g.items.map(feedCardHtml).join("")}
      </section>`;
  }).join("");

  list.forEach(evt => { if (evt._fresh) delete evt._fresh; });
  applyHighlight();
  announceFeed(list);
}

// Screen readers hear one line per settled change (not the whole list on every tick)
let feedStatusTimer = null;
function announceFeed(list) {
  clearTimeout(feedStatusTimer);
  if (state.isPlaying) return;
  feedStatusTimer = setTimeout(() => {
    const el = document.getElementById("feedStatus");
    if (!el) return;
    const msg = `${feedScopeTitle()} ${list.length}건 · ${formatDateKo(state.dates[state.currentDateIndex], false)}까지`;
    if (el.textContent !== msg) el.textContent = msg;
  }, 700);
}

function renderActiveFilters() {
  const box = document.getElementById("feedActiveFilters");
  if (!box) return;
  const parts = [];
  if (state.selectedCategory !== "all") {
    const chip = FILTER_CHIPS.find(c => c.key === state.selectedCategory);
    parts.push(`<button type="button" class="filter-pill" data-clear="category">${escapeHtml(chip ? chip.label : state.selectedCategory)}<span aria-hidden="true">✕</span></button>`);
  }
  if (state.focusedCountry) {
    parts.push(`<button type="button" class="filter-pill" data-clear="country">${getFlagHtml(state.focusedCountry, 14)}${escapeHtml(countryName(state.focusedCountry))}<span aria-hidden="true">✕</span></button>`);
  }
  if (state.searchQuery) {
    parts.push(`<button type="button" class="filter-pill" data-clear="search">“${escapeHtml(state.searchQuery)}”<span aria-hidden="true">✕</span></button>`);
  }
  if (state.currentDateIndex !== state.dates.length - 1) {
    parts.push(`<button type="button" class="filter-pill" data-clear="date">~ ${escapeHtml(formatDateKo(state.dates[state.currentDateIndex], false))}<span aria-hidden="true">✕</span></button>`);
  }
  box.innerHTML = parts.join("");
  box.classList.toggle("is-hidden", parts.length === 0);
}

function resetAllFilters() {
  state.selectedCategory = "all";
  state.searchQuery = "";
  const input = document.getElementById("newsSearchInput");
  if (input) input.value = "";
  updateSearchClear();
  state.currentDateIndex = state.dates.length - 1;
  updateTimelineUI();
  if (state.focusedCountry) { clearFocusCountry(); return; }
  refreshAll();
  reframeToMatches();
}

// ---------------------------------------------------------------------------
// 21. Event detail drawer (keeps the globe visible)
// ---------------------------------------------------------------------------
function focusEvent(eventId) {
  const evt = RAW_NEWS_EVENTS.find(e => e.id === eventId);
  if (!evt) return;
  openEventDetail(evt);
}
window.focusEvent = focusEvent;

// A story opened from outside the list (tension driver, live toast) must not open "behind" the
// filters: relax only what hides it (date → category → country → search), then open it.
function openStoryFromOutside(evt, focusedArc = null, customView = null, opts = {}) {
  if (!evt) return;
  if (!eventMatches(evt)) {
    if (!eventMatches(evt, { category: true, country: true, search: true })) {
      state.currentDateIndex = state.dates.length - 1;
      updateTimelineUI();
    }
    if (!eventMatches(evt, { country: true, search: true })) state.selectedCategory = "all";
    if (!eventMatches(evt, { search: true }) && state.focusedCountry) {
      state.focusedCountry = null;
      updateFocusUi(null);
      repaintPolygons();
    }
    if (!eventMatches(evt)) {
      state.searchQuery = "";
      const input = document.getElementById("newsSearchInput");
      if (input) input.value = "";
      updateSearchClear();
    }
    refreshAll();
  }
  openEventDetail(evt, focusedArc, customView, opts);
}

function openEventDetail(evt, focusedArc = null, customView = null, opts = {}) {
  if (!evt) return;
  if (!opts.fromTour) stopTour();
  state.selectedEvent = evt;
  closeCountryPicker();

  const cat = normalizeCategory(evt);
  if (cat === "conflict") soundEngine.playClash();
  else if (cat === "treaty") soundEngine.playTreatyChime();
  else if (cat === "crisis") soundEngine.playAlert();
  else soundEngine.playBeep(980, 0.08);

  const cm = CATEGORY_META[cat];
  const tier = impactTier(evt.impactScore);
  const drawer = document.getElementById("eventModal");
  drawer.style.setProperty("--cat", cm.color);
  drawer.style.setProperty("--cat-text", cm.text);

  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  set("modalTypeBadge", el => {
    el.innerHTML = `${icon(cm.icon, 13)}${escapeHtml(cm.label)}`;
  });
  set("modalLiveChip", el => el.classList.toggle("is-hidden", !isLiveEvent(evt)));
  set("modalScope", el => {
    const n = eventCountryCodes(evt).length;
    el.textContent = isDomesticEvent(evt) || n <= 1 ? "국가 내부" : n === 2 ? "양자" : "다자";
  });
  set("modalDate", el => { el.textContent = detailDateText(evt); });
  set("modalTitle", el => { el.textContent = evt.title; });
  set("modalDemoNote", el => {
    const demo = isDemoEvent(evt);
    el.classList.toggle("is-hidden", !demo);
    const text = document.getElementById("modalDemoNoteText");
    if (text) text.textContent = !demo ? "" : isLiveEvent(evt) ? "테스트 이벤트 · 시연용 데모 데이터입니다" : "가상 시나리오 · 시연용 데모 데이터입니다";
  });
  set("modalLocation", el => { el.textContent = stripLatinParen(evt.locationName) || placeOf(evt); el.title = evt.locationName || ""; });
  set("modalWho", el => {
    el.innerHTML = eventCountryCodes(evt).map(c => `<span class="who-item">${getFlagHtml(c, 18)}${escapeHtml(countryName(c))}</span>`).join("");
  });
  set("modalImpactScore", el => { el.outerHTML = impactChipHtml(evt).replace('class="impact-chip', 'id="modalImpactScore" class="impact-chip impact-chip--lg'); });
  set("modalSeverity", el => { el.textContent = tier.label; });
  set("modalImpactBar", el => {
    el.style.width = `${Math.max(0, Math.min(100, Number(evt.impactScore) || 0))}%`;
    el.setAttribute("data-tier", tier.key);
  });
  set("modalSummary", el => { el.textContent = evt.summary || ""; el.classList.toggle("is-hidden", !evt.summary); });
  set("modalDetails", el => { el.textContent = evt.details || ""; });
  set("modalDetailsSection", el => el.classList.toggle("is-hidden", !evt.details || evt.details === evt.summary));

  // Links between countries (arcs)
  set("modalArcsList", el => {
    el.innerHTML = (evt.arcs || []).map((arc, i) => {
      const sc = emojiToIsoCode(arc.sourceFlag || ""), tc = emojiToIsoCode(arc.targetFlag || "");
      const rel = stripLatinParen(arc.relationType) || stripLatinParen(arc.label) || "연결";
      return `
        <button type="button" class="arc-row${focusedArc && isSameArc(arc, focusedArc) ? " is-focused" : ""}" data-arc-index="${i}">
          <span class="arc-ends">
            ${getFlagHtml(sc || "UN", 20)}<b>${escapeHtml(countryName(sc) || arc.sourceName || "출발")}</b>
            <span class="arc-arrow" aria-hidden="true">${icon("arrow", 14)}</span>
            ${getFlagHtml(tc || "UN", 20)}<b>${escapeHtml(countryName(tc) || arc.targetName || "도착")}</b>
            <span class="arc-rel">${escapeHtml(rel)}</span>
          </span>
          <span class="arc-sub">${escapeHtml(arc.sourceName || "")} → ${escapeHtml(arc.targetName || "")}</span>
        </button>`;
    }).join("");
  });
  set("modalArcsSection", el => el.classList.toggle("is-hidden", !(evt.arcs && evt.arcs.length)));

  // Parties as chips (click → that country's news)
  set("modalPartiesList", el => {
    const parties = (evt.parties && evt.parties.length) ? evt.parties : [{
      name: placeOf(evt), code: eventCountryCodes(evt)[0], flag: ""
    }];
    el.innerHTML = parties.map(p => {
      const pc = partyCountryCode(p);
      const focusable = !!(pc && ((typeof COUNTRY_PROFILES !== "undefined" && COUNTRY_PROFILES[pc]) ||
        (typeof MAJOR_COUNTRY_LABELS !== "undefined" && MAJOR_COUNTRY_LABELS.some(l => l.code === pc))));
      const role = p.role ? ` <small>${escapeHtml(PARTY_ROLE_KO[p.role] || p.role)}</small>` : "";
      return focusable
        ? `<button type="button" class="party-chip" data-focus-code="${escapeHtml(pc)}" title="${escapeHtml(countryName(pc))} 뉴스만 보기">${getFlagHtml(pc, 16)}<span>${escapeHtml(p.name || countryName(pc))}</span>${role}</button>`
        : `<span class="party-chip">${getFlagHtml(pc, 16)}<span>${escapeHtml(p.name || countryName(pc))}</span>${role}</span>`;
    }).join("");
  });

  // Sources
  set("modalSourcesCount", el => { const n = (evt.sources || []).length; el.textContent = n ? `${n}곳` : ""; });
  set("modalSources", el => {
    const srcs = evt.sources || [];
    el.innerHTML = srcs.length ? srcs.map(src => {
      const meta = [sourceTypeText(src), sourceReliabilityText(src)].filter(Boolean).join(" · ");
      const url = src.url && src.url !== "#" && /^https?:/i.test(src.url) ? src.url : "";
      return `
        <div class="source-row${sourceIsTier1(src) ? " is-tier1" : ""}">
          <span class="source-icon" aria-hidden="true">${sourceIcon(src)}</span>
          <div class="source-text">
            <div class="source-name">${escapeHtml(src.name || "출처 미상")}</div>
            ${meta ? `<div class="source-type">${escapeHtml(meta)}</div>` : ""}
          </div>
          ${url ? `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">원문 ↗</a>` : ""}
        </div>`;
    }).join("") : `<div class="muted">출처 정보 없음</div>`;
  });

  set("modalTags", el => {
    const tags = (evt.tags || []).filter(t => t !== "자체뉴스" && t !== "국내속보");
    el.innerHTML = tags.map(t => `<button type="button" class="tag-pill" data-tag="${escapeHtml(t)}" title="'${escapeHtml(t)}'(으)로 검색">#${escapeHtml(t)}</button>`).join("");
    el.classList.toggle("is-hidden", tags.length === 0);
  });

  const wasOpen = !drawer.classList.contains("is-hidden");
  drawer.classList.remove("is-hidden");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-open");
  const body = drawer.querySelector(".dd-body");
  if (body) body.scrollTop = 0;
  syncPanelInert();
  markHudDirty();
  // phones/tablets: the drawer is a bottom sheet, so the globe re-centres above it
  if (!wasOpen) applyGlobeFraming(false);

  // Camera: frame the whole story (event + parties + arcs); rotation pauses while reading. The
  // hand-tuned angles predate the side panels: one is used only if the story's own spot stays in view.
  const hot = HOTSPOT_CAMERA[evt.id];
  let view = customView;
  if (!focusedArc && hot && (!view || view === hot)) view = spotInFreeArea(hot, evt) ? hot : null;
  flyTo(view || frameEventView(evt), 1300);
  updateAutoRotate();

  document.querySelectorAll(".feed-card.is-selected").forEach(c => { c.classList.remove("is-selected"); c.removeAttribute("aria-current"); });
  document.querySelectorAll(`.feed-card[data-event-id="${cssEscape(evt.id)}"]`).forEach(c => { c.classList.add("is-selected"); c.setAttribute("aria-current", "true"); });

  updateDetailNav();
  applyHighlight();

  if (!drawer.contains(document.activeElement)) {
    const ae = document.activeElement;
    detailReturnFocus = ae && ae !== document.body ? ae : null;
    const titleEl = document.getElementById("modalTitle");
    if (titleEl) setTimeout(() => { try { titleEl.focus({ preventScroll: true }); } catch (e) { titleEl.focus(); } }, 30);
  }
}

let detailReturnFocus = null;
let returningFocus = false; // focus moving back after a close is not a "keyboard hover"

function detailDateText(evt) {
  return isLiveEvent(evt)
    ? `${relTime(evt._receivedAt) || ""} · ${shortTime(evt.time)} UTC`.replace(/^ · /, "")
    : `${formatDateKo(evt.date)} ${shortTime(evt.time)} UTC`.trim();
}

// Something focus may land on: attached, rendered, not inert, not visibility-hidden
function canTakeFocus(el) {
  if (!el || !el.isConnected || typeof el.focus !== "function") return false;
  if (!el.getClientRects().length || el.closest("[inert]")) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

// Move focus without scrolling the page; on touch, never pop the on-screen keyboard
function focusQuietly(el) {
  if (!canTakeFocus(el)) return false;
  if (pointer.type !== "mouse" && el.tagName === "INPUT") return false;
  try { el.focus({ preventScroll: true }); } catch (e) { return false; }
  return true;
}

// Panels that are out of sight leave the tab order and the accessibility tree
function syncPanelInert() {
  const narrow = window.innerWidth < 1024;
  const detailOpen = document.body.classList.contains("detail-open");
  const L = document.getElementById("leftSidebar");
  const R = document.getElementById("rightSidebar");
  const F = document.getElementById("appFooter");
  if (L) L.inert = narrow || L.classList.contains("is-collapsed");
  if (R) {
    R.inert = detailOpen || (!narrow && R.classList.contains("is-collapsed"));
    // the phone sheet in its peek state: only the handle is reachable
    const open = ["half", "full"].includes(R.getAttribute("data-sheet"));
    [...R.children].forEach(ch => { if (!ch.classList.contains("sheet-handle")) ch.inert = narrow && !open; });
  }
  if (F) F.inert = narrow && detailOpen;
}

function updateDetailNav() {
  const prevBtn = document.getElementById("detailPrevBtn");
  const nextBtn = document.getElementById("detailNextBtn");
  const pos = document.getElementById("detailPosition");
  const list = state.lastFiltered;
  const idx = state.selectedEvent ? list.findIndex(e => e.id === state.selectedEvent.id) : -1;
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx < 0 || idx >= list.length - 1;
  if (pos) pos.textContent = idx >= 0 ? `${idx + 1} / ${list.length}` : "";
}

function stepDetail(dir) {
  if (!state.selectedEvent) return;
  const list = state.lastFiltered;
  const idx = list.findIndex(e => e.id === state.selectedEvent.id);
  if (idx < 0) return; // the open story isn't in the list: there is no "next"
  const next = list[idx + dir];
  if (next) openEventDetail(next);
}

function closeEventDetail() {
  const drawer = document.getElementById("eventModal");
  if (!drawer || drawer.classList.contains("is-hidden")) return false;
  stopTour();
  soundEngine.playBeep(600, 0.04);
  const hadFocus = drawer.contains(document.activeElement);
  drawer.classList.add("is-hidden");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("detail-open");
  const closedId = state.selectedEvent && state.selectedEvent.id;
  state.selectedEvent = null;
  document.querySelectorAll(".feed-card.is-selected").forEach(c => { c.classList.remove("is-selected"); c.removeAttribute("aria-current"); });
  syncPanelInert();
  markHudDirty();
  applyGlobeFraming(false);
  applyHighlight();
  updateAutoRotate();
  // focus goes back to whatever opened the story (or its card, or the search box) — never to
  // <body> or to something hidden — and that move must not raise the story again
  if (hadFocus || !document.activeElement || document.activeElement === document.body) {
    const card = closedId && document.querySelector(`.feed-day .feed-card[data-event-id="${cssEscape(closedId)}"]`);
    let back = canTakeFocus(detailReturnFocus) ? detailReturnFocus : null;
    if (!back && canTakeFocus(card)) { scrollCardIntoList(card); back = card; }
    returningFocus = true;
    try {
      if (!(back && focusQuietly(back))) {
        [document.getElementById("newsSearchInput"), document.getElementById("countryPickerBtn")].some(focusQuietly);
      }
    } finally {
      returningFocus = false;
    }
  }
  detailReturnFocus = null;
  return true;
}
window.closeEventDetail = closeEventDetail;

// ---------------------------------------------------------------------------
// 22. Timeline (per-day density + cumulative range)
// ---------------------------------------------------------------------------
function initTimeline() {
  const slider = document.getElementById("timelineSlider");
  if (slider) {
    slider.min = "0";
    slider.max = String(state.dates.length - 1);
    slider.value = String(state.currentDateIndex);
  }
  const track = document.querySelector(".timeline-track");
  if (track) {
    // the slider's thumb lines up with the day columns (first column centre → last column centre)
    track.style.setProperty("--tl-n2", String(state.dates.length * 2));
    track.style.setProperty("--tl-gaps", `${(state.dates.length - 1) * 6}px`);
  }
  const bars = document.getElementById("timelineDensity");
  if (bars) {
    bars.innerHTML = state.dates.map((d, i) => `
      <button type="button" class="tl-day" data-index="${i}" aria-label="${escapeHtml(formatDateKo(d))}까지 보기">
        <span class="tl-count">0</span>
        <span class="tl-bar"></span>
        <span class="tl-label">${escapeHtml(formatDateDots(d))}<span class="tl-wd"> (${WEEKDAYS_KO[parseYmd(d).getUTCDay()]})</span>${i === state.dates.length - 1 ? "<em>최신</em>" : ""}</span>
      </button>`).join("");
    bars.addEventListener("click", e => {
      const b = e.target.closest(".tl-day");
      if (!b) return;
      setDateIndex(parseInt(b.getAttribute("data-index"), 10));
      reframeToMatches();
    });
  }
  updateTimelineUI();
}

function setDateIndex(i) {
  const idx = Math.max(0, Math.min(state.dates.length - 1, i));
  if (idx === state.currentDateIndex) return;
  state.currentDateIndex = idx;
  soundEngine.playTick();
  updateTimelineUI();
  refreshAll();
}

function updateTimelineUI() {
  const currentDate = state.dates[state.currentDateIndex];
  const slider = document.getElementById("timelineSlider");
  const dateDisplay = document.getElementById("currentDateDisplay");
  if (slider) {
    slider.value = state.currentDateIndex;
    slider.style.setProperty("--pct", `${(state.currentDateIndex / Math.max(1, state.dates.length - 1)) * 100}%`);
    slider.setAttribute("aria-valuetext", formatDateKo(currentDate));
  }
  if (!state.isPlaying) setPlayButton(false);
  if (dateDisplay) {
    const liveN = state.currentDateIndex === state.dates.length - 1 ? getFilteredEvents().filter(isLiveEvent).length : 0;
    dateDisplay.textContent = `${formatDateKo(currentDate)}까지${liveN ? ` · 실시간 ${liveN}건 포함` : ""}`;
  }
  document.querySelectorAll(".tl-day").forEach((b, idx) => {
    b.classList.toggle("is-included", idx <= state.currentDateIndex);
    b.classList.toggle("is-current", idx === state.currentDateIndex);
    if (idx === state.currentDateIndex) b.setAttribute("aria-current", "date");
    else b.removeAttribute("aria-current");
  });
}

function renderTimelineDensity() {
  const order = ["conflict", "crisis", "treaty", "trade", "space", "tech", "other"];
  const perDay = state.dates.map(() => ({ total: 0 }));
  getFilteredEvents({ date: true }).forEach(e => {
    if (isLiveEvent(e)) return;
    const i = state.dates.indexOf(e.date);
    if (i < 0) return;
    const k = normalizeCategory(e);
    perDay[i][k] = (perDay[i][k] || 0) + 1;
    perDay[i].total++;
  });
  const max = Math.max(1, ...perDay.map(d => d.total));
  document.querySelectorAll(".tl-day").forEach((b, i) => {
    const day = perDay[i] || { total: 0 };
    const bar = b.querySelector(".tl-bar");
    const cnt = b.querySelector(".tl-count");
    if (bar) {
      const h = day.total ? Math.max(18, (day.total / max) * 100) : 0;
      bar.style.height = `${(h / 100) * (window.innerWidth < 1024 ? 16 : 22)}px`;
      bar.innerHTML = order.filter(k => day[k]).map(k =>
        `<i style="--c:${CATEGORY_META[k].color};flex:${day[k]} 1 0"></i>`).join("");
      bar.title = day.total ? order.filter(k => day[k]).map(k => `${CATEGORY_META[k].short} ${day[k]}`).join(" · ") : "소식 없음";
    }
    if (cnt) cnt.textContent = day.total ? day.total : "";
    b.classList.toggle("is-zero", day.total === 0);
  });
  const rangeEl = document.getElementById("timelineRangeLabel");
  if (rangeEl) {
    rangeEl.textContent = `${formatDateDots(state.dates[0])} – ${formatDateDots(state.dates[state.currentDateIndex])} · ${state.lastFiltered.length}건 표시`;
  }
}

function setPlayButton(playing) {
  const playBtn = document.getElementById("playPauseBtn");
  if (!playBtn) return;
  const atEnd = state.currentDateIndex >= state.dates.length - 1;
  playBtn.removeAttribute("aria-pressed"); // the name itself says what a press does
  playBtn.setAttribute("aria-label", playing ? "일시정지" : atEnd ? "처음부터 재생" : "재생");
  playBtn.innerHTML = playing
    ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg><span>일시정지</span>`
    : atEnd
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg><span>처음부터</span>`
      : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg><span>재생</span>`;
}

function toggleTimelinePlay() {
  stopTour();
  soundEngine.playBeep(780, 0.05);
  const on = !state.isPlaying;
  state.isPlaying = on;
  // starting from the last day replays the week from the first day
  if (on && state.currentDateIndex >= state.dates.length - 1) {
    state.currentDateIndex = 0;
    updateTimelineUI();
    refreshAll();
  }
  setPlaying(on);
}

// Playback without the click sound (also pauses/resumes while the tab is hidden)
function setPlaying(on) {
  state.isPlaying = on;
  setPlayButton(on);
  clearInterval(playInterval);
  if (!on) { announceFeed(state.lastFiltered); return; }
  playInterval = setInterval(() => {
    if (state.currentDateIndex >= state.dates.length - 1) { setPlaying(false); return; }
    state.currentDateIndex++;
    soundEngine.playTick();
    updateTimelineUI();
    refreshAll();
  }, Math.max(400, 2400 / state.playSpeed));
}

function setPlaySpeed(multiplier) {
  soundEngine.playBeep(900, 0.04);
  state.playSpeed = multiplier;
  document.querySelectorAll(".speed-btn").forEach(btn => {
    const on = btn.getAttribute("data-speed") === String(multiplier);
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
  if (state.isPlaying) setPlaying(true); // restart at the new speed
}

// ---------------------------------------------------------------------------
// 24. Event listeners
// ---------------------------------------------------------------------------
function updateSearchClear() {
  const btn = document.getElementById("searchClearBtn");
  if (btn) btn.classList.toggle("is-hidden", !state.searchQuery);
}

function isTypingTarget(el) {
  return !!(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
}

function setPanelCollapsed(panelId, btnId, collapsed) {
  const panel = document.getElementById(panelId);
  const btn = document.getElementById(btnId);
  if (!panel) return;
  panel.classList.toggle("is-collapsed", collapsed);
  if (btn) {
    btn.setAttribute("aria-checked", String(!collapsed));
    btn.classList.toggle("is-off", collapsed);
  }
  syncPanelInert();
  markHudDirty();
  setTimeout(() => { markHudDirty(); applyGlobeFraming(true); }, 360);
}

function initEventListeners() {
  // pointer facts for hover (see pointerCanHover)
  const globeHost = document.getElementById("globeViz");
  if (globeHost) {
    pointer.onGlobe = globeHost.matches(":hover");
    globeHost.addEventListener("pointerenter", e => { pointer.onGlobe = true; if (e.pointerType) pointer.type = e.pointerType; });
    globeHost.addEventListener("pointerleave", () => {
      pointer.onGlobe = false;
      if (state.hoveredPolygon) handlePolygonHover(null);
      if (state.hoveredArc) handleArcHover(null);
    });
  }
  window.addEventListener("pointerdown", e => {
    pointer.type = e.pointerType || "mouse";
    if (pointer.type !== "mouse") hideTooltip();
  }, true);
  window.addEventListener("pointermove", e => { if (e.pointerType === "mouse") pointer.type = "mouse"; }, { passive: true, capture: true });

  // a hidden tab neither plays nor tours (nor makes sounds); both resume on return
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.isPlaying) { state.resumePlay = true; setPlaying(false); }
      if (tour.running) { clearTimeout(tour.timer); tour.paused = true; }
    } else {
      if (state.resumePlay) { state.resumePlay = false; setPlaying(true); }
      if (tour.paused) { tour.paused = false; if (tour.running) stepTour(); }
    }
  });

  const leftCol = document.getElementById("leftSidebar");
  if (leftCol) leftCol.addEventListener("scroll", updateLeftFade, { passive: true });

  window.addEventListener("mousemove", e => {
    state.mousePos.x = e.clientX;
    state.mousePos.y = e.clientY;
    positionTooltip(e.clientX, e.clientY);
  }, { passive: true });

  const slider = document.getElementById("timelineSlider");
  if (slider) {
    slider.addEventListener("input", e => setDateIndex(parseInt(e.target.value, 10)));
    slider.addEventListener("change", reframeToMatches);
  }

  const playBtn = document.getElementById("playPauseBtn");
  if (playBtn) playBtn.addEventListener("click", toggleTimelinePlay);
  setPlayButton(false);

  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", () => setPlaySpeed(parseFloat(btn.getAttribute("data-speed"))));
  });

  // Search (debounced)
  const searchInput = document.getElementById("newsSearchInput");
  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      clearTimeout(searchTimer);
      const v = e.target.value.trim();
      searchTimer = setTimeout(() => {
        state.searchQuery = v;
        updateSearchClear();
        refreshAll();
        if (v) reframeToMatches();
      }, 140);
    });
    searchInput.addEventListener("keydown", e => {
      if (e.key === "Escape" && searchInput.value) {
        e.stopPropagation();
        searchInput.value = "";
        state.searchQuery = "";
        updateSearchClear();
        refreshAll();
      }
    });
  }
  const searchClear = document.getElementById("searchClearBtn");
  if (searchClear) {
    searchClear.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      state.searchQuery = "";
      updateSearchClear();
      refreshAll();
      if (searchInput) searchInput.focus();
    });
  }

  // Feed: click / keyboard / hover sync (event delegation)
  const feed = document.getElementById("newsFeedList");
  if (feed) {
    feed.addEventListener("click", e => {
      const reset = e.target.closest("[data-action='reset-filters']");
      if (reset) { resetAllFilters(); return; }
      const card = e.target.closest(".feed-card");
      if (card) focusEvent(card.getAttribute("data-event-id"));
    });
    feed.addEventListener("keydown", e => {
      const card = e.target.closest(".feed-card");
      if (!card) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focusEvent(card.getAttribute("data-event-id")); }
    });
    feed.addEventListener("mouseover", e => {
      const card = e.target.closest(".feed-card");
      if (card && pointer.type === "mouse") setHighlight(card.getAttribute("data-event-id"), "card");
    });
    feed.addEventListener("mouseleave", () => clearHighlight("card"));
    feed.addEventListener("focusin", e => {
      if (returningFocus) return;
      const card = e.target.closest(".feed-card");
      if (card && card.matches(":focus-visible")) setHighlight(card.getAttribute("data-event-id"), "card");
    });
    feed.addEventListener("focusout", () => clearHighlight("card"));
  }

  const stories = document.getElementById("topStoriesList");
  if (stories) {
    stories.addEventListener("click", e => {
      const item = e.target.closest(".story-item");
      if (!item) return;
      const evt = RAW_NEWS_EVENTS.find(x => x.id === item.getAttribute("data-event-id"));
      if (evt) openEventDetail(evt, null, null, { fromBrief: true });
    });
    stories.addEventListener("mouseover", e => {
      const item = e.target.closest(".story-item");
      if (item && pointer.type === "mouse") setHighlight(item.getAttribute("data-event-id"), "card");
    });
    stories.addEventListener("mouseleave", () => clearHighlight("card"));
  }

  // Far-side hint: click turns the globe to the story
  const farHint = document.getElementById("farSideHint");
  if (farHint) {
    farHint.addEventListener("mouseenter", () => { const id = farHint.getAttribute("data-event-id"); if (id) setHighlight(id, "card"); });
    farHint.addEventListener("mouseleave", () => clearHighlight("card"));
    farHint.addEventListener("click", () => {
      const evt = RAW_NEWS_EVENTS.find(e => e.id === farHint.getAttribute("data-event-id"));
      if (!evt) return;
      rotation.lastInteractionAt = performance.now();
      flyTo({ lat: evt.lat, lng: evt.lng, altitude: world.pointOfView().altitude }, 900);
      farHint.classList.add("is-hidden");
    });
  }

  // Header ⋯ menu
  const moreBtn = document.getElementById("moreMenuBtn");
  const moreMenu = document.getElementById("moreMenu");
  if (moreBtn && moreMenu) {
    moreBtn.addEventListener("click", e => { e.stopPropagation(); toggleMoreMenu(); });
    moreMenu.addEventListener("click", e => {
      if (e.target.closest("[role='menuitem'], [role='menuitemcheckbox']")) setTimeout(closeMoreMenu, 0);
    });
    moreMenu.addEventListener("keydown", e => {
      const items = [...moreMenu.querySelectorAll("[role='menuitem'], [role='menuitemcheckbox']")].filter(b => b.offsetParent !== null);
      const i = items.indexOf(document.activeElement);
      let j = -1;
      if (e.key === "ArrowDown") j = (i + 1) % items.length;
      else if (e.key === "ArrowUp") j = (i - 1 + items.length) % items.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = items.length - 1;
      if (j < 0) return;
      e.preventDefault();
      items[j].focus();
    });
    document.addEventListener("click", e => { if (!e.target.closest("#moreMenuWrap")) closeMoreMenu(); });
  }

  // Narrow screens: "주요 이슈 ▸" tab opens the brief drawer; Esc or a click outside closes it
  const briefTab = document.getElementById("briefTab");
  if (briefTab) briefTab.addEventListener("click", () => setPanelCollapsed("leftSidebar", "toggleLeftPanel", false));
  document.addEventListener("pointerdown", e => {
    if (window.innerWidth >= 1280) return;
    const panel = document.getElementById("leftSidebar");
    if (!panel || panel.classList.contains("is-collapsed")) return;
    if (e.target.closest("#leftSidebar, #briefTab, #moreMenuWrap")) return;
    setPanelCollapsed("leftSidebar", "toggleLeftPanel", true);
  }, true);

  // Tour over the brief
  const tourBtn = document.getElementById("tourBtn");
  if (tourBtn) tourBtn.addEventListener("click", () => (tour.running ? stopTour() : startTour()));
  const globeEl = document.getElementById("globeViz");
  if (globeEl) {
    globeEl.addEventListener("pointerdown", stopTour, { passive: true });
    globeEl.addEventListener("wheel", stopTour, { passive: true });
  }

  // Help dialog + first-run hint
  const helpBtn = document.getElementById("helpBtn");
  if (helpBtn) helpBtn.addEventListener("click", openHelp);
  const helpClose = document.getElementById("helpCloseBtn");
  if (helpClose) helpClose.addEventListener("click", closeHelp);
  const helpModal = document.getElementById("helpModal");
  if (helpModal) helpModal.addEventListener("click", e => { if (e.target === helpModal) closeHelp(); });
  initOnboardingHint();
  initUiTips();

  // Dossier: allied / rival countries are links
  const dossier = document.getElementById("countryDossierCard");
  if (dossier) {
    dossier.addEventListener("click", e => {
      const b = e.target.closest(".mini-country[data-focus-code]");
      if (b && b.getAttribute("data-focus-code") !== state.focusedCountry) focusCountry(b.getAttribute("data-focus-code"));
    });
  }

  // Tension drivers → open the story
  const drivers = document.getElementById("tensionDrivers");
  if (drivers) {
    drivers.addEventListener("click", e => {
      const b = e.target.closest(".driver");
      if (b) openStoryFromOutside(RAW_NEWS_EVENTS.find(x => x.id === b.getAttribute("data-event-id")));
    });
  }

  // Detail drawer: party chips focus a country, tags search, arc rows solo-highlight + frame
  const drawerEl = document.getElementById("eventModal");
  if (drawerEl) {
    drawerEl.addEventListener("click", e => {
      const chip = e.target.closest(".party-chip[data-focus-code]");
      if (chip) {
        const code = chip.getAttribute("data-focus-code");
        if (code !== state.focusedCountry) focusCountry(code, null, countryFeature(code));
        return;
      }
      const tag = e.target.closest(".tag-pill[data-tag]");
      if (tag) {
        const q = tag.getAttribute("data-tag");
        const input = document.getElementById("newsSearchInput");
        if (input) input.value = q;
        state.searchQuery = q;
        updateSearchClear();
        closeEventDetail();
        refreshAll();
        reframeToMatches();
        return;
      }
      const row = e.target.closest(".arc-row[data-arc-index]");
      if (row && state.selectedEvent) {
        const arc = (state.selectedEvent.arcs || [])[parseInt(row.getAttribute("data-arc-index"), 10)];
        if (arc) flyTo(arcView(arc), 1100);
      }
    });
    drawerEl.addEventListener("mouseover", e => {
      const row = e.target.closest(".arc-row[data-arc-index]");
      if (!row || !state.selectedEvent) return;
      const arc = (state.selectedEvent.arcs || [])[parseInt(row.getAttribute("data-arc-index"), 10)];
      const live = arc && world.arcsData().find(a => isSameArc(a, arc));
      if (live && state.hoveredArc !== live) {
        state.hoveredArc = live;
        world.arcColor(world.arcColor()).arcStroke(world.arcStroke());
      }
    });
    drawerEl.addEventListener("mouseout", e => {
      const row = e.target.closest(".arc-row[data-arc-index]");
      if (!row || row.contains(e.relatedTarget)) return;
      if (state.hoveredArc) {
        state.hoveredArc = null;
        world.arcColor(world.arcColor()).arcStroke(world.arcStroke());
      }
    });
  }

  const globeEmpty = document.getElementById("globeEmptyState");
  if (globeEmpty) globeEmpty.addEventListener("click", e => { if (e.target.closest("[data-action='reset-filters']")) resetAllFilters(); });

  const activeFilters = document.getElementById("feedActiveFilters");
  if (activeFilters) {
    activeFilters.addEventListener("click", e => {
      const pill = e.target.closest(".filter-pill");
      if (!pill) return;
      const idx = [...activeFilters.querySelectorAll(".filter-pill")].indexOf(pill);
      const what = pill.getAttribute("data-clear");
      if (what === "category") { state.selectedCategory = "all"; refreshAll(); }
      else if (what === "country") clearFocusCountry();
      else if (what === "search") { if (searchInput) searchInput.value = ""; state.searchQuery = ""; updateSearchClear(); refreshAll(); }
      else if (what === "date") { state.currentDateIndex = state.dates.length - 1; updateTimelineUI(); refreshAll(); }
      reframeToMatches();
      // focus stays in the filter row (the pill now at this spot), else goes to the search box
      const pills = [...activeFilters.querySelectorAll(".filter-pill")];
      if (!focusQuietly(pills[Math.min(idx, pills.length - 1)])) focusQuietly(searchInput);
    });
  }

  // both buttons vanish with the focus: hand focus to the picker instead of <body>
  const clearAndRefocus = () => { clearFocusCountry(); focusQuietly(document.getElementById("countryPickerBtn")); };
  const clearFocusBtn = document.getElementById("clearFocusBtn");
  if (clearFocusBtn) clearFocusBtn.addEventListener("click", clearAndRefocus);
  const closeDossierBtn = document.getElementById("closeDossierBtn");
  if (closeDossierBtn) closeDossierBtn.addEventListener("click", clearAndRefocus);

  // Detail drawer
  const modalClose = document.getElementById("modalCloseBtn");
  if (modalClose) modalClose.addEventListener("click", closeEventDetail);
  const backBtn = document.getElementById("detailBackBtn");
  if (backBtn) backBtn.addEventListener("click", closeEventDetail);
  const prevBtn = document.getElementById("detailPrevBtn");
  if (prevBtn) prevBtn.addEventListener("click", () => stepDetail(-1));
  const nextBtn = document.getElementById("detailNextBtn");
  if (nextBtn) nextBtn.addEventListener("click", () => stepDetail(1));

  // Panel toggles
  const toggleLeftBtn = document.getElementById("toggleLeftPanel");
  if (toggleLeftBtn) {
    toggleLeftBtn.addEventListener("click", () => {
      soundEngine.playBeep(800, 0.04);
      const panel = document.getElementById("leftSidebar");
      setPanelCollapsed("leftSidebar", "toggleLeftPanel", !panel.classList.contains("is-collapsed"));
    });
  }
  const toggleRightBtn = document.getElementById("toggleRightPanel");
  if (toggleRightBtn) {
    toggleRightBtn.addEventListener("click", () => {
      soundEngine.playBeep(800, 0.04);
      const panel = document.getElementById("rightSidebar");
      setPanelCollapsed("rightSidebar", "toggleRightPanel", !panel.classList.contains("is-collapsed"));
    });
  }

  // Mobile: feed bottom sheet
  const sheetToggle = document.getElementById("feedSheetToggle");
  if (sheetToggle) {
    sheetToggle.addEventListener("click", () => {
      const panel = document.getElementById("rightSidebar");
      const cur = panel.getAttribute("data-sheet") || "peek";
      const next = cur === "peek" ? "half" : cur === "half" ? "full" : "peek";
      panel.setAttribute("data-sheet", next);
      sheetToggle.setAttribute("aria-expanded", String(next !== "peek"));
      syncPanelInert();
      markHudDirty();
      setTimeout(markHudDirty, 360);
    });
  }

  // View mode
  const viewModeBtn = document.getElementById("viewModeToggle");
  const viewModeLabel = document.getElementById("viewModeLabel");
  if (viewModeBtn && viewModeLabel) {
    viewModeBtn.addEventListener("click", () => {
      soundEngine.playBeep(1100, 0.06);
      const regional = state.viewMode !== "regional";
      state.viewMode = regional ? "regional" : "global";
      viewModeLabel.textContent = "세부 지역 표시";
      viewModeBtn.setAttribute("aria-checked", String(regional));
      flyTo({ altitude: regional ? 1.4 : state.defaultAltitude }, 1200);
      refreshAll();
    });
  }

  const orbitToggle = document.getElementById("toggleAutoOrbit");
  if (orbitToggle) {
    orbitToggle.addEventListener("click", () => {
      soundEngine.playBeep(750, 0.04);
      state.autoOrbit = !state.autoOrbit;
      state.userTouchedOrbit = true;
      writePref("op.orbit", state.autoOrbit ? "on" : "off");
      rotation.lastInteractionAt = 0;
      syncOrbitButton();
      updateAutoRotate();
    });
  }

  const audioToggle = document.getElementById("toggleAudio");
  if (audioToggle) {
    audioToggle.addEventListener("click", () => {
      const muted = soundEngine.toggleMute();
      writePref("op.sound", muted ? "off" : "on");
      renderAudioButton();
      if (!muted) soundEngine.playBeep(880, 0.05);
    });
  }

  const fsToggle = document.getElementById("toggleFullscreen");
  const syncFs = () => {
    if (!fsToggle) return;
    const on = !!document.fullscreenElement;
    fsToggle.setAttribute("aria-label", on ? "전체 화면 종료" : "전체 화면");
    fsToggle.setAttribute("data-tip", on ? "전체 화면 종료 (F)" : "전체 화면 (F)");
    fsToggle.innerHTML = on
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
  };
  document.addEventListener("fullscreenchange", syncFs);
  if (fsToggle) {
    fsToggle.addEventListener("click", () => {
      soundEngine.playBeep(920, 0.05);
      if (!document.fullscreenElement) {
        const req = document.documentElement.requestFullscreen;
        if (req) req.call(document.documentElement).catch(() => {});
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    });
  }

  // Keyboard
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (closeMoreMenu()) { const b = document.getElementById("moreMenuBtn"); if (b) b.focus(); return; }
      if (closeStackMenu()) return;
      if (closeHelp()) return;
      if (closeDevModal()) return;
      if (closeCountryPicker()) { focusQuietly(document.getElementById("countryPickerBtn")); return; }
      if (tour.running) { stopTour(); return; }
      if (closeEventDetail()) return;
      const lp = document.getElementById("leftSidebar");
      if (window.innerWidth < 1280 && lp && !lp.classList.contains("is-collapsed")) {
        setPanelCollapsed("leftSidebar", "toggleLeftPanel", true);
        const t = document.getElementById("briefTab");
        if (t) t.focus();
        return;
      }
      return;
    }
    if (isTypingTarget(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isModalOpen()) return; // nothing behind a dialog reacts to keys
    const k = e.key;
    // single-character shortcuts can be switched off in the help dialog (WCAG 2.1.4)
    if (k.length === 1 && k !== " " && state.shortcutsOn === false) return;
    if (!["Tab", "Shift", "Control", "Alt", "Meta", "CapsLock", "ContextMenu", "Escape"].includes(k)) stopTour();
    if (k === "/") {
      e.preventDefault();
      const input = document.getElementById("newsSearchInput");
      if (input) input.focus();
      return;
    }
    if (k === "?") { e.preventDefault(); openHelp(); return; }
    if (state.selectedEvent && (k === "ArrowRight" || k === "ArrowDown" || k === "j")) { e.preventDefault(); stepDetail(1); return; }
    if (state.selectedEvent && (k === "ArrowLeft" || k === "ArrowUp" || k === "k")) { e.preventDefault(); stepDetail(-1); return; }
    // keys below act on the page only when focus isn't on another control
    const onControl = document.activeElement && document.activeElement !== document.body && document.activeElement.matches("button, [role='button'], a, input, select");
    if (k === "ArrowRight" && !onControl) { e.preventDefault(); setDateIndex(state.currentDateIndex + 1); reframeToMatches(); return; }
    if (k === "ArrowLeft" && !onControl) { e.preventDefault(); setDateIndex(state.currentDateIndex - 1); reframeToMatches(); return; }
    if (k === " " && !onControl) { e.preventDefault(); toggleTimelinePlay(); return; }
    const lower = k.toLowerCase();
    if (lower === "r") { const b = document.getElementById("toggleAutoOrbit"); if (b) b.click(); return; }
    if (lower === "m") { const b = document.getElementById("toggleAudio"); if (b) b.click(); return; }
    if (lower === "f") { const b = document.getElementById("toggleFullscreen"); if (b) b.click(); }
  });

  // HUD rects change after transitions
  ["leftSidebar", "rightSidebar", "eventModal"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("transitionend", e => { if (e.target === el) markHudDirty(); });
  });
  const drawerHost = document.getElementById("eventModal");
  if (drawerHost) drawerHost.addEventListener("animationend", e => { if (e.target === drawerHost) applyGlobeFraming(false); });
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => markHudDirty());
    ["appHeader", "leftSidebar", "rightSidebar", "appFooter", "eventModal"].forEach(id => { const el = document.getElementById(id); if (el) ro.observe(el); });
  }

  // help: single-key shortcuts on/off
  const keysToggle = document.getElementById("shortcutsToggle");
  if (keysToggle) {
    keysToggle.checked = state.shortcutsOn !== false;
    keysToggle.addEventListener("change", () => {
      state.shortcutsOn = keysToggle.checked;
      writePref("op.keys", state.shortcutsOn ? "on" : "off");
    });
  }
}

function isModalOpen() {
  return ["helpModal", "devApiModal"].some(id => { const m = document.getElementById(id); return m && !m.classList.contains("is-hidden"); });
}

// While a dialog is open everything behind it is inert (focus can't wander behind the backdrop)
function setModalInert() {
  const on = isModalOpen();
  document.querySelectorAll(".hud-layer, #globeViz, #onboardingHint, #liveIntelToast, #farSideHint, #globeEmptyState").forEach(el => { el.inert = on; });
  if (on) closeStackMenu();
}

function resetLabelSizes() {
  labelLayout.registry.forEach(w => { if (w.__lbl) { w.__lbl.w = 0; w.__lbl.h = 0; } });
  labelLayout.dirty = true;
}

// ---------------------------------------------------------------------------
// 24a. Small custom tooltips for icon buttons ([data-tip]) — instant, styled, keyboard-friendly
// ---------------------------------------------------------------------------
function initUiTips() {
  const tip = document.getElementById("uiTip");
  if (!tip) return;
  let timer = null, owner = null;
  const show = el => {
    owner = el;
    tip.textContent = el.getAttribute("data-tip");
    tip.classList.remove("is-hidden");
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 8) y = r.top - h - 8;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const hide = () => { clearTimeout(timer); owner = null; tip.classList.add("is-hidden"); };
  const arm = (el, delay) => { clearTimeout(timer); timer = setTimeout(() => show(el), delay); };
  document.addEventListener("mouseover", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el && el !== owner) arm(el, 350);
    else if (!el && owner) hide();
  });
  document.addEventListener("focusin", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el && el.matches(":focus-visible")) arm(el, 0);
  });
  // touch has no hover: a tap on a tip owner that is not a control (the 데모 badge) shows its tip
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el && !el.matches("button, a, input, select, textarea, [role='button']")) { clearTimeout(timer); show(el); }
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
}

// ---------------------------------------------------------------------------
// 24b. Preferences, help dialog, first-run hint
// ---------------------------------------------------------------------------
function readPref(key) {
  try { return window.localStorage ? localStorage.getItem(key) : null; } catch (e) { return null; }
}
function writePref(key, value) {
  try { if (window.localStorage) localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}

function renderAudioButton() {
  const btn = document.getElementById("toggleAudio");
  if (!btn) return;
  const muted = !!soundEngine.muted;
  btn.setAttribute("aria-pressed", String(!muted));
  btn.classList.toggle("is-off", muted);
  const tip = muted ? "효과음 켜기 (M)" : "효과음 끄기 (M)";
  btn.removeAttribute("title");
  btn.setAttribute("data-tip", tip);
  btn.setAttribute("aria-label", "효과음"); // fixed name; aria-pressed carries on/off
  btn.innerHTML = muted
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
}

function applyStoredPrefs() {
  if (readPref("op.sound") === "off") soundEngine.muted = true;
  renderAudioButton();
  state.shortcutsOn = readPref("op.keys") !== "off";
  const orbit = readPref("op.orbit");
  if (orbit === "off" || orbit === "on") {
    state.autoOrbit = orbit === "on";
    state.userTouchedOrbit = true;
  }
  syncOrbitButton();
}

function toggleMoreMenu() {
  const m = document.getElementById("moreMenu");
  if (!m) return;
  if (m.classList.contains("is-hidden")) {
    m.classList.remove("is-hidden");
    document.getElementById("moreMenuBtn").setAttribute("aria-expanded", "true");
    const first = m.querySelector("[role='menuitemcheckbox'], [role='menuitem']");
    if (first) setTimeout(() => first.focus(), 0);
  } else {
    closeMoreMenu();
  }
}
function closeMoreMenu() {
  const m = document.getElementById("moreMenu");
  if (!m || m.classList.contains("is-hidden")) return false;
  m.classList.add("is-hidden");
  const b = document.getElementById("moreMenuBtn");
  if (b) b.setAttribute("aria-expanded", "false");
  return true;
}

let helpReturnFocus = null;
function openHelp() {
  const m = document.getElementById("helpModal");
  if (!m) return;
  helpReturnFocus = document.activeElement;
  m.classList.remove("is-hidden");
  setModalInert();
  const keysToggle = document.getElementById("shortcutsToggle");
  if (keysToggle) keysToggle.checked = state.shortcutsOn !== false;
  const c = document.getElementById("helpCloseBtn");
  if (c) setTimeout(() => c.focus(), 20);
}
function closeHelp() {
  const m = document.getElementById("helpModal");
  if (!m || m.classList.contains("is-hidden")) return false;
  m.classList.add("is-hidden");
  setModalInert();
  // back to the opener — or to the ⋯ button when the opener lived in the (now closed) menu
  if (!focusQuietly(helpReturnFocus)) focusQuietly(document.getElementById("moreMenuBtn"));
  helpReturnFocus = null;
  return true;
}

function initOnboardingHint() {
  const hint = document.getElementById("onboardingHint");
  if (!hint) return;
  const seen = parseInt(readPref("op.hintSeen") || "0", 10) || 0;
  if (seen >= 3) return;
  writePref("op.hintSeen", String(seen + 1));
  hint.classList.remove("is-hidden");
  const dismiss = () => { hint.classList.add("is-hidden"); markHudDirty(); };
  const close = hint.querySelector("[data-action='dismiss-hint']");
  if (close) close.addEventListener("click", () => { writePref("op.hintSeen", "3"); dismiss(); });
  const globeEl = document.getElementById("globeViz");
  if (globeEl) globeEl.addEventListener("click", dismiss, { once: true });
  setTimeout(dismiss, 15000);
}

// ---------------------------------------------------------------------------
// 25. Live API (REST bootstrap + SSE)
// ---------------------------------------------------------------------------
function normalizeIncomingEvent(evt, opts = {}) {
  if (!evt || typeof evt !== "object") return null;
  const out = { ...evt };
  out.id = String(out.id || `live-${Date.now()}`);
  out.title = String(out.title || "새로운 소식");
  out.summary = String(out.summary || out.title);
  out.details = String(out.details || out.summary);
  out.impactScore = Number(out.impactScore) || 75;
  out.lat = Number(out.lat);
  out.lng = Number(out.lng);
  // the ingest API is public: keep only well-formed codes, objects and numbers
  const iso = c => (typeof c === "string" && /^[A-Za-z]{2}$/.test(c.trim())) ? c.trim().toUpperCase() : null;
  out.primaryCountry = iso(out.primaryCountry) || undefined;
  out.countryCodes = (Array.isArray(out.countryCodes) ? out.countryCodes : []).map(iso).filter(Boolean);
  if (!out.countryCodes.length && out.primaryCountry) out.countryCodes = [out.primaryCountry];
  const finite = v => Number.isFinite(Number(v));
  out.parties = (Array.isArray(out.parties) ? out.parties : [])
    .filter(p => p && typeof p === "object" && finite(p.lat) && finite(p.lng))
    .map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng), name: String(p.name || ""), code: String(p.code || "") }));
  out.arcs = (Array.isArray(out.arcs) ? out.arcs : [])
    .filter(a => a && typeof a === "object" && [a.startLat, a.startLng, a.endLat, a.endLng].every(finite))
    .map(a => ({ ...a, startLat: +a.startLat, startLng: +a.startLng, endLat: +a.endLat, endLng: +a.endLng }));
  out.sources = (Array.isArray(out.sources) ? out.sources : []).filter(x => x && typeof x === "object");
  out.tags = (Array.isArray(out.tags) ? out.tags : []).filter(t => typeof t === "string");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.date || ""))) out.date = new Date().toISOString().slice(0, 10);
  out.time = String(out.time || "");
  out.locationName = String(out.locationName || countryName(out.primaryCountry) || "위치 미상");
  out.isLiveIngested = out.isLiveIngested !== false;
  out.isDemo = evt.demo === true; // test events (dev console, examples) are sent with demo: true
  if (!out._receivedAt) {
    // stories loaded at boot keep their real age; only SSE arrivals are "just now"
    const hm = /(\d{1,2}):(\d{2})/.exec(out.time);
    const rx = Number(out.receivedAt); // server receive time (ms), when the server sends it
    const stamp = Number.isFinite(rx) && rx > 0 ? rx
      : Date.parse(`${out.date}T${hm ? `${hm[1].padStart(2, "0")}:${hm[2]}` : "00:00"}:00Z`);
    out._receivedAt = opts.fromBoot && Number.isFinite(stamp) ? Math.min(stamp, Date.now()) : Date.now();
  }
  return out;
}

// The live API needs server.py. Opened as a file or from a static host (the GitHub Pages demo)
// there is none: the app then runs on the bundled stories without any API requests.
const STATIC_DEMO_HOST = /\.github\.io$/i.test(location.hostname);
function hasLiveServer() {
  return location.protocol.startsWith("http") && !STATIC_DEMO_HOST;
}

function initLiveApiStream() {
  const dot0 = document.getElementById("apiStatusDot");
  if (!hasLiveServer()) {
    // no server: no requests, no console errors
    if (dot0) dot0.setAttribute("data-status", "off");
    return;
  }
  // 1. Fetch any ingested events from backend store
  fetch("/api/events")
    .then(res => res.json())
    .then(data => {
      if (data && data.events && data.events.length > 0) {
        // the server lists newest first: insert oldest first so the newest ends up on top
        data.events.slice().reverse().forEach(raw => {
          const evt = normalizeIncomingEvent(raw, { fromBoot: true });
          if (evt && !RAW_NEWS_EVENTS.some(e => e.id === evt.id)) RAW_NEWS_EVENTS.unshift(evt);
        });
        refreshAll();
      }
    })
    .catch(err => console.warn("[live] stored events not loaded:", err));

  // 2. Connect to SSE Live Stream
  const dot = document.getElementById("apiStatusDot");
  const setStatus = (ok) => {
    if (dot) dot.setAttribute("data-status", ok ? "on" : "off");
    const liveMark = document.getElementById("feedLiveMark");
    if (liveMark) liveMark.classList.toggle("is-hidden", !ok);
    const btn = document.getElementById("openDevApiBtn");
    const more = document.getElementById("moreMenuBtn");
    if (more) more.setAttribute("data-tip", ok ? "더 보기 · 실시간 수신 연결됨" : "더 보기 · 실시간 수신 끊김");
  };
  setStatus(false);
  if (window.EventSource) {
    // The browser retries a dropped stream by itself but gives up for good when the server refuses
    // one (e.g. 503 while it is busy): then reconnect after a pause that grows up to a minute.
    let retryMs = 5000;
    const connect = () => {
      let sse;
      try { sse = new EventSource("/api/stream"); } catch (e) { return; }
      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "new_event" && payload.event) handleIncomingLiveEvent(payload.event);
        } catch (err) { /* ignore malformed */ }
      };
      sse.onopen = () => { retryMs = 5000; setStatus(true); };
      sse.onerror = () => {
        setStatus(false);
        if (sse.readyState === EventSource.CLOSED) {
          setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 60000);
        }
      };
    };
    connect();
  }
}

setInterval(() => {
  if (!world || !RAW_NEWS_EVENTS.some(isLiveEvent)) return;
  // the live boost (10 min) and the live ping (1 min) wear off on their own
  markerCache.forEach(d => { if (d.kind === "event" && d.__el && d.eventRef) { d.priority = eventPriority(d.eventRef); syncMarkerState(d); } });
  labelLayout.dirty = true;
}, 15000);

// "3분 전" style times stay true
setInterval(() => {
  document.querySelectorAll("[data-reltime]").forEach(el => {
    const ts = Number(el.getAttribute("data-reltime"));
    if (ts) el.textContent = relTime(ts);
  });
  if (state.selectedEvent && isLiveEvent(state.selectedEvent)) {
    const d = document.getElementById("modalDate");
    if (d) d.textContent = detailDateText(state.selectedEvent);
  }
}, 60000);

function handleIncomingLiveEvent(raw) {
  const evt = normalizeIncomingEvent(raw);
  if (!evt || RAW_NEWS_EVENTS.some(e => e.id === evt.id)) return;
  evt._fresh = true;
  RAW_NEWS_EVENTS.unshift(evt);

  soundEngine.playRadarPing();
  showLiveIntelToast(evt);
  refreshAll();

  scheduleLiveFly(evt);
}

const liveFly = { queue: [], timer: null };
function scheduleLiveFly(evt) {
  liveFly.queue.push(evt);
  clearTimeout(liveFly.timer);
  liveFly.timer = setTimeout(() => {
    const q = liveFly.queue;
    liveFly.queue = [];
    if (q.length !== 1) return; // a burst never drags the camera around
    const e = q[0];
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) return;
    if (state.selectedEvent || state.focusedCountry || tour.running || state.highlightEventId) return;
    if (performance.now() - rotation.lastInteractionAt < 15000) return;
    if (!state.lastFiltered.some(x => x.id === e.id)) return;
    flyTo(frameEventView(e), 1300);
  }, 1500);
}

let toastTimer = null;
const toastBurst = { count: 0, since: 0 };
function showLiveIntelToast(evt) {
  const toast = document.getElementById("liveIntelToast");
  const title = document.getElementById("liveToastTitle");
  if (!toast || !title) return;

  const now = Date.now();
  if (!toast.classList.contains("is-hidden") && now - toastBurst.since < 8000) toastBurst.count++;
  else { toastBurst.count = 1; toastBurst.since = now; }
  const kicker = document.getElementById("liveToastKicker");
  if (kicker) kicker.textContent = toastBurst.count > 1 ? `실시간 속보 ${toastBurst.count}건` : "실시간 속보";
  title.textContent = (toastBurst.count > 1 ? "최신: " : "") + (evt.title || "새 소식");
  toast.setAttribute("data-event-id", evt.id);
  toast.style.setProperty("--cat", categoryMeta(evt).color);
  toast.classList.remove("is-hidden");
  requestAnimationFrame(() => toast.classList.add("is-shown"));
  markHudDirty();

  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideLiveToast, 8000);
}

function hideLiveToast() {
  const toast = document.getElementById("liveIntelToast");
  if (!toast) return;
  toast.classList.remove("is-shown");
  setTimeout(() => { toast.classList.add("is-hidden"); markHudDirty(); }, 250);
}

// ---------------------------------------------------------------------------
// 26. Developer API & pipeline modal
// ---------------------------------------------------------------------------
let devReturnFocus = null;
function openDevModal() {
  const modal = document.getElementById("devApiModal");
  if (!modal) return;
  soundEngine.playBeep(950, 0.04);
  devReturnFocus = document.activeElement;
  modal.classList.remove("is-hidden");
  setModalInert();
  const closeBtn = document.getElementById("devApiCloseBtn");
  if (closeBtn) setTimeout(() => closeBtn.focus(), 30);
}

function closeDevModal() {
  const modal = document.getElementById("devApiModal");
  if (!modal || modal.classList.contains("is-hidden")) return false;
  modal.classList.add("is-hidden");
  setModalInert();
  if (!focusQuietly(devReturnFocus)) focusQuietly(document.getElementById("moreMenuBtn"));
  devReturnFocus = null;
  return true;
}

// A failed API call explains itself in Korean (the server answers { error, code }) — never a ✅
const API_ERROR_KO = {
  401: "토큰이 필요한 서버입니다. 서버를 켠 터미널에 표시된 토큰(또는 SPINNING_NEWS_TOKEN 값)을 Authorization 헤더로 보내 주세요.",
  403: "허용되지 않은 곳에서 보낸 요청입니다 (보안 설정).",
  413: "보낼 내용이 너무 큽니다.",
  415: "JSON 형식으로 보내야 합니다.",
  429: "잠시 후 다시 시도해 주세요.",
  502: "피드를 불러오지 못했습니다."
};
function apiErrorText(status, body) {
  if (body && body.code === "feed_not_allowed") return "내부망 주소의 피드는 불러올 수 없습니다.";
  return API_ERROR_KO[status] || `요청 실패 (${status})`;
}

function initDevApiModal() {
  const modal = document.getElementById("devApiModal");
  const openBtn = document.getElementById("openDevApiBtn");
  const closeBtn = document.getElementById("devApiCloseBtn");
  const feedback = document.getElementById("devApiFeedback");

  const endpoint = document.getElementById("devApiEndpoint");
  if (endpoint && hasLiveServer()) endpoint.textContent = `${location.origin}/api/events`;
  const snippet = document.getElementById("curlSnippet");
  if (snippet && hasLiveServer()) snippet.textContent = snippet.textContent.replace("http://localhost:8080", location.origin);

  if (openBtn) openBtn.addEventListener("click", openDevModal);
  if (closeBtn) closeBtn.addEventListener("click", closeDevModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeDevModal();
    });
  }

  let feedbackTimer = null;
  function setFeedback(msg, isSuccess = true) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.classList.remove("is-hidden");
    feedback.setAttribute("data-ok", String(isSuccess));
    clearTimeout(feedbackTimer);
    // failures stay up longer: they ask the reader to do something
    feedbackTimer = setTimeout(() => feedback.classList.add("is-hidden"), isSuccess ? 5000 : 10000);
  }

  // POST JSON → { ok, status, data }. Only a network failure rejects; HTTP errors come back as
  // { ok: false } with the server's { error, code } body (or {} when it isn't JSON).
  function postJson(url, payload) {
    // no server (file or static demo host): fail like a network error, minus the console error
    if (!hasLiveServer()) return Promise.reject(new TypeError(STATIC_DEMO_HOST ? "서버 없이 보는 데모 페이지입니다" : "Failed to fetch"));
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(res => res.json().catch(() => ({})).then(data => ({ ok: res.ok, status: res.status, data: data || {} })));
  }

  function postEvent(payload, okLabel) {
    soundEngine.playTick();
    postJson("/api/events", payload)
      .then(r => {
        if (!r.ok) { setFeedback(`❌ ${apiErrorText(r.status, r.data)}`, false); return; }
        setFeedback(`✅ ${okLabel}: ${r.data.event ? r.data.event.title : "전송 완료"}`);
      })
      .catch(err => setFeedback(`❌ 전송 실패: ${err.message} (python server.py 로 실행 중인지 확인하세요)`, false));
  }

  // one-click tests are demo data: marked demo: true and titled "[테스트] …"
  const btnConflict = document.getElementById("btnTestConflict");
  if (btnConflict) {
    btnConflict.addEventListener("click", () => postEvent({
      title: "[테스트] 호르무즈 해협 다국적 함대 비상 경계 전개",
      category: "conflict",
      primaryCountry: "IR",
      countryCodes: ["US", "IR"],
      summary: "미 해군 제5함대와 걸프 해군 연합군이 주요 유조선 항로에 요격함을 증파했습니다.",
      impactScore: 92,
      demo: true
    }, "분쟁 이벤트 전송 성공"));
  }

  const btnTreaty = document.getElementById("btnTestTreaty");
  if (btnTreaty) {
    btnTreaty.addEventListener("click", () => postEvent({
      title: "[테스트] 한·미 차세대 양자 컴퓨팅 방위 협정 비준",
      category: "treaty",
      primaryCountry: "KR",
      countryCodes: ["KR", "US"],
      summary: "워싱턴에서 차세대 군사 통신망 암호화 및 양자 레이더 공동 연구 협정이 최종 서명되었습니다.",
      impactScore: 86,
      demo: true
    }, "외교 이벤트 전송 성공"));
  }

  const btnPollRss = document.getElementById("btnPollRss");
  if (btnPollRss) {
    btnPollRss.addEventListener("click", () => {
      soundEngine.playRadarPing();
      setFeedback("⏳ RSS 피드를 불러와 위치를 계산하는 중...");
      postJson("/api/pipeline/poll-rss", {})
        .then(r => {
          if (!r.ok) { setFeedback(`❌ ${apiErrorText(r.status, r.data)}`, false); return; }
          setFeedback(`✅ RSS 수집 완료: 새 소식 ${r.data.ingestedCount || 0}건을 지구본에 추가했습니다.`);
        })
        .catch(err => setFeedback(`❌ RSS 수집 실패: ${err.message}`, false));
    });
  }

  const btnCopyCurl = document.getElementById("btnCopyCurl");
  if (btnCopyCurl) {
    btnCopyCurl.addEventListener("click", () => {
      const text = document.getElementById("curlSnippet").textContent;
      const done = () => {
        soundEngine.playBeep(1200, 0.04);
        btnCopyCurl.textContent = "복사됨";
        setTimeout(() => { btnCopyCurl.textContent = "복사"; }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {});
      }
    });
  }

  const toast = document.getElementById("liveIntelToast");
  if (toast) {
    toast.addEventListener("click", e => {
      if (e.target.closest("[data-action='dismiss-toast']")) { hideLiveToast(); return; }
      const id = toast.getAttribute("data-event-id");
      hideLiveToast();
      // whatever the filters are, the story opens in the list (they relax just enough)
      openStoryFromOutside(id && RAW_NEWS_EVENTS.find(e => e.id === id));
    });
  }
}
