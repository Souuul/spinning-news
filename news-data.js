/**
 * SPINNING NEWS - Global Geopolitics & Intelligence Dataset
 * Temporal Range: 2026-10-22 to 2026-10-28
 * Categories: conflict (⚔️), treaty (🤝), trade (⚡), space (🛰️), crisis (⚠️)
 */

// The stories in RAW_NEWS_EVENTS are fictional scenarios made for this demo — not real news.
// Set this to false after replacing them with real stories.
const NEWS_DATA_IS_DEMO = true;

// Country Profiles for Focused Analysis & Cinematic Fly-To
const COUNTRY_PROFILES = {
  "KR": { 
    code: "KR", 
    name: "대한민국", 
    englishName: "South Korea", 
    flag: "🇰🇷", 
    lat: 36.5, 
    lng: 127.8, 
    altitude: 1.2,
    alliances: ["US", "JP", "TW"], 
    conflicts: [],
    dossier: "동북아 핵심 테크 및 우주 안보 허브. 한·미·일 양자 반도체 및 위성 감시 조약 비준국."
  },
  "US": { 
    code: "US", 
    name: "미국", 
    englishName: "United States", 
    flag: "🇺🇸", 
    lat: 38.0, 
    lng: -97.0, 
    altitude: 1.6,
    alliances: ["KR", "JP", "EU", "GB", "AU"], 
    conflicts: ["IR", "RU", "YE"],
    dossier: "글로벌 안보 및 Starlink 궤도 네트워크 총괄국. 호르무즈 및 홍해 초계 작전 전개."
  },
  "CN": { 
    code: "CN", 
    name: "중국", 
    englishName: "China", 
    flag: "🇨🇳", 
    lat: 35.8, 
    lng: 104.1, 
    altitude: 1.6,
    alliances: [], 
    conflicts: ["PH", "US"],
    dossier: "남중국해 영유권 대치 및 태평양 자율해운 녹색 회랑 공동 추진국."
  },
  "JP": { 
    code: "JP", 
    name: "일본", 
    englishName: "Japan", 
    flag: "🇯🇵", 
    lat: 36.2, 
    lng: 138.2, 
    altitude: 1.25,
    alliances: ["KR", "US"], 
    conflicts: [],
    dossier: "동아시아 방위 사령부 및 저궤도 위성 조기경보 파트너십 구축."
  },
  "UA": { 
    code: "UA", 
    name: "우크라이나", 
    englishName: "Ukraine", 
    flag: "🇺🇦", 
    lat: 48.5, 
    lng: 31.5, 
    altitude: 1.2,
    alliances: ["EU", "US"], 
    conflicts: ["RU"],
    dossier: "동유럽 도네츠크-자포리자 전선 포격전 및 드론 방공 요격 작전 수행국."
  },
  "RU": { 
    code: "RU", 
    name: "러시아", 
    englishName: "Russia", 
    flag: "🇷🇺", 
    lat: 56.0, 
    lng: 39.0, 
    altitude: 1.5,
    alliances: [], 
    conflicts: ["UA"],
    dossier: "동유럽 접경 전선 미사일 및 에너지 인프라 교전 지속국."
  },
  "IR": { 
    code: "IR", 
    name: "이란", 
    englishName: "Iran", 
    flag: "🇮🇷", 
    lat: 32.4, 
    lng: 53.6, 
    altitude: 1.35,
    alliances: [], 
    conflicts: ["US"],
    dossier: "호르무즈 해협 원유 수송로 초계 함정 및 무인 정찰정 대치국."
  },
  "EU": { 
    code: "EU", 
    name: "유럽연합", 
    englishName: "European Union", 
    flag: "🇪🇺", 
    lat: 50.85, 
    lng: 4.35, 
    altitude: 1.45,
    alliances: ["US", "BR", "UA"], 
    conflicts: [],
    dossier: "브뤼셀 본부 기반 남미 메르코수르 그린 에너지 조약 및 노르딕 방공망 총괄."
  },
  "IN": { 
    code: "IN", 
    name: "인도", 
    englishName: "India", 
    flag: "🇮🇳", 
    lat: 22.0, 
    lng: 78.9, 
    altitude: 1.45,
    alliances: [], 
    conflicts: ["PK"],
    dossier: "카슈미르 정전선 대치 및 벵골만 초대형 사이클론 재난 긴급 대응국."
  },
  "TW": { 
    code: "TW", 
    name: "대만", 
    englishName: "Taiwan", 
    flag: "🇹🇼", 
    lat: 23.8, 
    lng: 121.0, 
    altitude: 1.1,
    alliances: ["KR", "US"], 
    conflicts: ["CN"],
    dossier: "신주 파운드리 코어 중심 한-대만 차세대 2나노 웨이퍼 백업 스왑 협정국."
  },
  "GB": {
    code: "GB",
    name: "영국",
    englishName: "United Kingdom",
    flag: "🇬🇧",
    lat: 54.0,
    lng: -2.5,
    altitude: 1.35,
    alliances: ["US", "AU", "EU"],
    conflicts: [],
    dossier: "오커스(AUKUS) 극초음속 방위망 및 글로벌 런던 금융 허브."
  },
  "FR": {
    code: "FR",
    name: "프랑스",
    englishName: "France",
    flag: "🇫🇷",
    lat: 46.5,
    lng: 2.5,
    altitude: 1.35,
    alliances: ["EU", "US"],
    conflicts: [],
    dossier: "유럽 원자력 에너지 및 독자 우주 발사체 아리안 6 총괄국."
  },
  "DE": {
    code: "DE",
    name: "독일",
    englishName: "Germany",
    flag: "🇩🇪",
    lat: 51.2,
    lng: 10.4,
    altitude: 1.35,
    alliances: ["EU", "US"],
    conflicts: [],
    dossier: "유럽 최대 경제국 및 그린 수소 인프라 연합 선도국."
  },
  "BR": {
    code: "BR",
    name: "브라질",
    englishName: "Brazil",
    flag: "🇧🇷",
    lat: -14.2,
    lng: -51.9,
    altitude: 1.5,
    alliances: ["EU"],
    conflicts: [],
    dossier: "남미 메르코수르 의장국 및 아마존 기후 위성 감시 네트워크 본부."
  },
  "AU": {
    code: "AU",
    name: "호주",
    englishName: "Australia",
    flag: "🇦🇺",
    lat: -25.3,
    lng: 133.8,
    altitude: 1.5,
    alliances: ["US", "GB"],
    conflicts: [],
    dossier: "인도-태평양 심우주 기지 및 앨리스스프링스 양자 레이저 링크국."
  },
  "SA": {
    code: "SA",
    name: "사우디아라비아",
    englishName: "Saudi Arabia",
    flag: "🇸🇦",
    lat: 23.9,
    lng: 45.1,
    altitude: 1.4,
    alliances: [],
    conflicts: ["YE"],
    dossier: "중동 에너지 공급망 및 네옴(NEOM) 신재생 스마트 인프라 추진국."
  },
  "CL": {
    code: "CL",
    name: "칠레",
    englishName: "Chile",
    flag: "🇨🇱",
    lat: -35.7,
    lng: -71.5,
    altitude: 1.4,
    alliances: ["PE"],
    conflicts: [],
    dossier: "환태평양 리튬 삼각지대 및 안데스 지진·해일 조기경보 사령부."
  },
  "PE": {
    code: "PE",
    name: "페루",
    englishName: "Peru",
    flag: "🇵🇪",
    lat: -9.2,
    lng: -75.0,
    altitude: 1.4,
    alliances: ["CL"],
    conflicts: [],
    dossier: "태평양 연안 심해 자원 및 환태평양 지진해일 연합 방재국."
  },
  "CA": {
    code: "CA",
    name: "캐나다",
    englishName: "Canada",
    flag: "🇨🇦",
    lat: 56.0,
    lng: -106.0,
    altitude: 1.6,
    alliances: ["US", "GB"],
    conflicts: [],
    dossier: "북극해 항공 순찰 및 북미 항공우주 방위사령부(NORAD) 핵심 파트너."
  },
  "MX": {
    code: "MX",
    name: "멕시코",
    englishName: "Mexico",
    flag: "🇲🇽",
    lat: 23.5,
    lng: -102.5,
    altitude: 1.4,
    alliances: ["US", "CA"],
    conflicts: [],
    dossier: "북미 제조업 및 니어쇼어링 공급망 허브."
  },
  "IT": {
    code: "IT",
    name: "이탈리아",
    englishName: "Italy",
    flag: "🇮🇹",
    lat: 42.5,
    lng: 12.5,
    altitude: 1.35,
    alliances: ["EU", "US"],
    conflicts: [],
    dossier: "지중해 해상 안보 사령부 및 남유럽 항공우주 방산 거점."
  },
  "ES": {
    code: "ES",
    name: "스페인",
    englishName: "Spain",
    flag: "🇪🇸",
    lat: 40.0,
    lng: -3.7,
    altitude: 1.35,
    alliances: ["EU", "US"],
    conflicts: [],
    dossier: "이베리아 반도 신재생에너지 및 대서양 관문 해상 물류 허브."
  },
  "PL": {
    code: "PL",
    name: "폴란드",
    englishName: "Poland",
    flag: "🇵🇱",
    lat: 52.0,
    lng: 19.0,
    altitude: 1.35,
    alliances: ["EU", "US", "KR"],
    conflicts: ["RU"],
    dossier: "동유럽 나토 최전선 방위 사령부 및 K-방산 전략 거점."
  },
  "TR": {
    code: "TR",
    name: "튀르키예",
    englishName: "Turkey",
    flag: "🇹🇷",
    lat: 39.0,
    lng: 35.0,
    altitude: 1.4,
    alliances: [],
    conflicts: [],
    dossier: "보스포루스 해협 해상 관문 및 유라시아 에너지 중계 허브."
  },
  "EG": {
    code: "EG",
    name: "이집트",
    englishName: "Egypt",
    flag: "🇪🇬",
    lat: 26.8,
    lng: 30.8,
    altitude: 1.4,
    alliances: [],
    conflicts: [],
    dossier: "수에즈 운하 글로벌 해상 물류 초크포인트 총괄 방위국."
  },
  "ZA": {
    code: "ZA",
    name: "남아프리카공화국",
    englishName: "South Africa",
    flag: "🇿🇦",
    lat: -29.0,
    lng: 24.0,
    altitude: 1.5,
    alliances: [],
    conflicts: [],
    dossier: "아프리카 대륙 경제 리더 및 희귀 핵심광물 공급망 센터."
  },
  "VN": {
    code: "VN",
    name: "베트남",
    englishName: "Vietnam",
    flag: "🇻🇳",
    lat: 15.5,
    lng: 107.5,
    altitude: 1.35,
    alliances: ["KR", "US"],
    conflicts: ["CN"],
    dossier: "동남아 첨단 전자 제조 및 남중국해 연안 해양 감시 기지."
  },
  "PH": {
    code: "PH",
    name: "필리핀",
    englishName: "Philippines",
    flag: "🇵🇭",
    lat: 13.0,
    lng: 122.0,
    altitude: 1.35,
    alliances: ["US", "JP"],
    conflicts: ["CN"],
    dossier: "서필리핀해 배타적경제수역 초계 및 태평양 연안 방위국."
  },
  "ID": {
    code: "ID",
    name: "인도네시아",
    englishName: "Indonesia",
    flag: "🇮🇩",
    lat: -0.7,
    lng: 113.9,
    altitude: 1.5,
    alliances: [],
    conflicts: [],
    dossier: "말라카 해협 핵심 항로 및 니켈 등 배터리 광물 글로벌 1위국."
  },
  "PK": {
    code: "PK",
    name: "파키스탄",
    englishName: "Pakistan",
    flag: "🇵🇰",
    lat: 30.0,
    lng: 70.0,
    altitude: 1.4,
    alliances: ["CN"],
    conflicts: ["IN"],
    dossier: "남아시아 회랑 및 아라비아해 과다르 전략항 관제국."
  },
  "SE": {
    code: "SE",
    name: "스웨덴",
    englishName: "Sweden",
    flag: "🇸🇪",
    lat: 62.0,
    lng: 15.0,
    altitude: 1.4,
    alliances: ["EU", "US"],
    conflicts: [],
    dossier: "발트해 안보 사령부 및 북유럽 첨단 테크 혁신국."
  },
  "NO": {
    code: "NO",
    name: "노르웨이",
    englishName: "Norway",
    flag: "🇳🇴",
    lat: 62.0,
    lng: 9.0,
    altitude: 1.4,
    alliances: ["EU", "US"],
    conflicts: [],
    dossier: "북해 심해 해상 유전 및 북극해 위성 레이더 기지국."
  }
};

// Global High-Visibility Country Labels for 3D Globe Surface (대륙 추정 방지 & 국가 명칭 상시 표기)
const MAJOR_COUNTRY_LABELS = [
  { code: "KR", name: "대한민국", englishName: "S. Korea", flag: "🇰🇷", lat: 36.5, lng: 127.8, size: 1.05 },
  { code: "US", name: "미국", englishName: "United States", flag: "🇺🇸", lat: 39.0, lng: -98.0, size: 1.15 },
  { code: "CN", name: "중국", englishName: "China", flag: "🇨🇳", lat: 35.8, lng: 104.1, size: 1.15 },
  { code: "JP", name: "일본", englishName: "Japan", flag: "🇯🇵", lat: 36.5, lng: 138.0, size: 1.05 },
  { code: "UA", name: "우크라이나", englishName: "Ukraine", flag: "🇺🇦", lat: 49.0, lng: 32.0, size: 1.05 },
  { code: "RU", name: "러시아", englishName: "Russia", flag: "🇷🇺", lat: 58.0, lng: 45.0, size: 1.2 },
  { code: "GB", name: "영국", englishName: "UK", flag: "🇬🇧", lat: 54.0, lng: -2.5, size: 0.95 },
  { code: "FR", name: "프랑스", englishName: "France", flag: "🇫🇷", lat: 46.5, lng: 2.5, size: 0.95 },
  { code: "DE", name: "독일", englishName: "Germany", flag: "🇩🇪", lat: 51.2, lng: 10.4, size: 0.95 },
  { code: "IT", name: "이탈리아", englishName: "Italy", flag: "🇮🇹", lat: 42.5, lng: 12.5, size: 0.9 },
  { code: "IN", name: "인도", englishName: "India", flag: "🇮🇳", lat: 21.0, lng: 78.0, size: 1.15 },
  { code: "IR", name: "이란", englishName: "Iran", flag: "🇮🇷", lat: 32.0, lng: 53.5, size: 1.05 },
  { code: "SA", name: "사우디", englishName: "Saudi Arabia", flag: "🇸🇦", lat: 24.0, lng: 45.0, size: 1.05 },
  { code: "TW", name: "대만", englishName: "Taiwan", flag: "🇹🇼", lat: 23.7, lng: 121.0, size: 0.9 },
  { code: "AU", name: "호주", englishName: "Australia", flag: "🇦🇺", lat: -25.0, lng: 134.0, size: 1.15 },
  { code: "BR", name: "브라질", englishName: "Brazil", flag: "🇧🇷", lat: -10.0, lng: -52.0, size: 1.15 },
  { code: "CA", name: "캐나다", englishName: "Canada", flag: "🇨🇦", lat: 56.0, lng: -106.0, size: 1.15 },
  { code: "MX", name: "멕시코", englishName: "Mexico", flag: "🇲🇽", lat: 23.5, lng: -102.5, size: 1.0 },
  { code: "CL", name: "칠레", englishName: "Chile", flag: "🇨🇱", lat: -32.0, lng: -71.0, size: 0.95 },
  { code: "PE", name: "페루", englishName: "Peru", flag: "🇵🇪", lat: -9.5, lng: -75.0, size: 0.95 },
  { code: "EG", name: "이집트", englishName: "Egypt", flag: "🇪🇬", lat: 26.8, lng: 30.8, size: 0.95 },
  { code: "ZA", name: "남아공", englishName: "South Africa", flag: "🇿🇦", lat: -29.0, lng: 24.0, size: 1.0 },
  { code: "VN", name: "베트남", englishName: "Vietnam", flag: "🇻🇳", lat: 15.5, lng: 107.5, size: 0.9 },
  { code: "PH", name: "필리핀", englishName: "Philippines", flag: "🇵🇭", lat: 13.0, lng: 122.0, size: 0.9 },
  { code: "ID", name: "인도네시아", englishName: "Indonesia", flag: "🇮🇩", lat: -0.7, lng: 113.9, size: 1.05 },
  { code: "PK", name: "파키스탄", englishName: "Pakistan", flag: "🇵🇰", lat: 30.0, lng: 70.0, size: 0.95 },
  { code: "PL", name: "폴란드", englishName: "Poland", flag: "🇵🇱", lat: 52.0, lng: 19.0, size: 0.9 },
  { code: "ES", name: "스페인", englishName: "Spain", flag: "🇪🇸", lat: 40.0, lng: -3.7, size: 0.9 },
  { code: "SE", name: "스웨덴", englishName: "Sweden", flag: "🇸🇪", lat: 62.0, lng: 15.0, size: 0.95 },
  { code: "NO", name: "노르웨이", englishName: "Norway", flag: "🇳🇴", lat: 62.0, lng: 9.0, size: 0.95 },
  { code: "TR", name: "튀르키예", englishName: "Turkey", flag: "🇹🇷", lat: 39.0, lng: 35.0, size: 1.0 }
];

const RAW_NEWS_EVENTS = [
  // --- 2026-10-28 (TODAY) ---
  {
    id: "evt-20261028-01",
    date: "2026-10-28",
    time: "09:45 UTC",
    category: "conflict",
    type: "conflict",
    flags: ["🇺🇸", "🇮🇷"],
    countryCodes: ["US", "IR"],
    primaryCountry: "IR",
    title: "호르무즈 해협 해상 대치 및 무인 함정 교전 경보",
    brief: "호르무즈 해상 대치",
    place: "호르무즈 해협",
    summary: "유조선 핵심 항로 부근에서 무인 정찰정과 호위함 간의 초계 경계선 침범으로 군사적 대치가 격화되었습니다.",
    details: "2026년 10월 28일 오전, 국제 주요 원유 수송로인 호르무즈 해협 북부 수역에서 연합 기동함대와 연안 방위대 간의 전자전 재밍 및 경고사격 대치가 발생했습니다. 국제 해사기구는 해당 수역의 항행 경보 등급을 '위험(Red)'으로 상향 조정했습니다.",
    impactScore: 92,
    locationName: "호르무즈 해협 (Strait of Hormuz)",
    lat: 26.56,
    lng: 56.25,
    country: "Middle East",
    state: "Maritime Sector 4",
    parties: [
      { name: "연합 해상 태스크포스 (바레인/걸프)", code: "US", flag: "🇺🇸", lat: 26.22, lng: 50.58, role: "interceptor" },
      { name: "이란 군사 사령부 (테헤란)", code: "IR", flag: "🇮🇷", lat: 35.6892, lng: 51.3890, role: "patrol" }
    ],
    arcs: [
      {
        id: "arc-20261028-01",
        startLat: 26.22, startLng: 50.58,
        endLat: 35.6892, endLng: 51.3890,
        sourceName: "연합 해상 기지 (걸프/바레인)",
        targetName: "이란 군사 사령부 (테헤란)",
        sourceFlag: "🇺🇸",
        targetFlag: "🇮🇷",
        color: ["#ff0055", "#ff5500"],
        altitude: 0.28,
        stroke: 3.6,
        label: "호르무즈 군사 대치선 (US-IR)",
        relationType: "군사 대치 (Military Standoff)"
      }
    ],
    sources: [
      { name: "Orbital Recon-04", type: "Military Satellite", reliability: "99% Verified" },
      { name: "Reuters Maritime Wire", type: "Global Press", reliability: "Tier 1 Confirmed" },
      { name: "Bloomberg Terminal", type: "Financial Intelligence", reliability: "Verified" }
    ],
    tags: ["군사대치", "해양안보", "호르무즈", "에너지위기"],
    tensionDelta: +12
  },
  {
    id: "evt-20261028-02",
    date: "2026-10-28",
    time: "07:15 UTC",
    category: "treaty",
    type: "treaty",
    flags: ["🇰🇷", "🇺🇸", "🇯🇵"],
    countryCodes: ["KR", "US", "JP"],
    primaryCountry: "KR",
    title: "한·미·일 차세대 우주 통신 및 양자 반도체 안보 동맹 체결",
    brief: "한·미·일 안보 동맹 체결",
    place: "서울",
    summary: "서울에서 개최된 3국 안보 정상회담에서 차세대 양자 암호 위성 통신망 및 핵심 반도체 공급망 상호 방위 협정을 최종 비준했습니다.",
    details: "대한민국 서울 용산 대통령실에서 한·미·일 3국 정상 및 안보실장이 참석한 가운데 '포괄적 궤도 안보 및 첨단 테크 얼라이언스(Q-S Alliance)' 협정이 공식 체결되었습니다. 이에 따라 3국은 저궤도 위성 감시 데이터와 반도체 공급망 위기대응 프로토콜을 100% 실시간 공유하게 됩니다.",
    impactScore: 94,
    locationName: "대한민국 서울 (Seoul, South Korea)",
    lat: 37.5665,
    lng: 126.9780,
    country: "South Korea",
    state: "Seoul Capital Region",
    parties: [
      { name: "대한민국 서울 용산", code: "KR", flag: "🇰🇷", lat: 37.5665, lng: 126.9780 },
      { name: "미국 워싱턴 백악관", code: "US", flag: "🇺🇸", lat: 38.8951, lng: -77.0364 },
      { name: "일본 도쿄 총리관저", code: "JP", flag: "🇯🇵", lat: 35.6762, lng: 139.6503 }
    ],
    arcs: [
      {
        id: "arc-20261028-02a",
        startLat: 37.5665, startLng: 126.9780,
        endLat: 38.8951, endLng: -77.0364,
        sourceName: "대한민국 서울",
        targetName: "미국 워싱턴 D.C.",
        sourceFlag: "🇰🇷",
        targetFlag: "🇺🇸",
        color: ["#00ffff", "#00ff88"],
        altitude: 0.45,
        stroke: 3.2,
        label: "한·미 양자 테크 및 궤도 안보 조약선",
        relationType: "안보 동맹 (Security Alliance)"
      },
      {
        id: "arc-20261028-02b",
        startLat: 37.5665, startLng: 126.9780,
        endLat: 35.6762, endLng: 139.6503,
        sourceName: "대한민국 서울",
        targetName: "일본 도쿄",
        sourceFlag: "🇰🇷",
        targetFlag: "🇯🇵",
        color: ["#00ffff", "#00aaff"],
        altitude: 0.16,
        stroke: 2.8,
        label: "한·일 궤도 레이더 정보 공유 링크",
        relationType: "정보 동맹 (Intel Alliance)"
      }
    ],
    sources: [
      { name: "대통령실 공식 브리핑", type: "Government Official", reliability: "Official Release" },
      { name: "Yonhap News Agency", type: "National Press", reliability: "Tier 1 Confirmed" },
      { name: "Nikkei Asia Dispatch", type: "Regional Intelligence", reliability: "Verified" }
    ],
    tags: ["안보협정", "우주통신", "반도체동맹", "한미일조약"],
    tensionDelta: -8
  },
  {
    id: "evt-20261028-03",
    date: "2026-10-28",
    time: "05:30 UTC",
    category: "space",
    type: "space",
    flags: ["🇺🇸", "🇦🇺"],
    countryCodes: ["US", "AU"],
    primaryCountry: "US",
    title: "SpaceX Starlink 차세대 양자 다이렉트 투 셀(Direct-to-Cell) 궤도망 전면 가동",
    brief: "스타링크 다이렉트셀 가동",
    place: "미국 텍사스",
    summary: "텍사스 보카치카 스타베이스에서 발사된 54기의 신형 V3 위성이 전 세계 오지 및 해상에 지연시간 5ms 급 초고속 위성 데이터 중계를 개시했습니다.",
    details: "SpaceX가 텍사스 스타베이스 발사 기지에서 팔콘 헤비로 궤도에 올린 차세대 Starlink 편대가 550km 상공에서 전파 간섭 없는 레이저 인터-새틀라이트 링크(ISL) 편대 비행을 달성했습니다. 이로써 전 세계 140개국의 재난 통신망이 우주 궤도와 직접 연동됩니다.",
    impactScore: 85,
    locationName: "미국 텍사스 보카치카 (Starbase, Texas)",
    lat: 25.9972,
    lng: -97.1561,
    country: "United States",
    state: "Texas",
    parties: [
      { name: "SpaceX Starbase (Texas)", code: "US-TX", flag: "🇺🇸", lat: 25.9972, lng: -97.1561 },
      { name: "호주 앨리스스프링스 심우주 기지", code: "AU", flag: "🇦🇺", lat: -23.6980, lng: 133.8807 }
    ],
    arcs: [
      {
        id: "arc-20261028-03",
        startLat: 25.9972, startLng: -97.1561,
        endLat: -23.6980, endLng: 133.8807,
        sourceName: "미국 텍사스 스타베이스",
        targetName: "호주 앨리스스프링스",
        sourceFlag: "🇺🇸",
        targetFlag: "🇦🇺",
        color: ["#d946ef", "#8b5cf6"],
        altitude: 0.55,
        stroke: 2.8,
        label: "SpaceX Starlink 저지연 위성 빔",
        relationType: "우주 통신망 (Space Telemetry)"
      }
    ],
    sources: [
      { name: "SpaceX Orbital Telemetry", type: "Space Operations Feed", reliability: "Live Sensor Feed" },
      { name: "Aviation Week", type: "Aerospace Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["스페이스X", "스타링크", "우주인터넷", "보카치카"],
    tensionDelta: -3
  },
  {
    id: "evt-20261028-04",
    date: "2026-10-28",
    time: "03:10 UTC",
    category: "trade",
    type: "trade",
    flags: ["🇺🇸", "🇨🇳"],
    countryCodes: ["US", "CN"],
    primaryCountry: "US",
    title: "캘리포니아-상하이 친환경 자율해운 녹색 회랑(Green Corridor) 협정 발효",
    brief: "LA–상하이 녹색 해운 회랑",
    place: "LA·상하이",
    summary: "로스앤젤레스 항과 상하이 양산항을 잇는 무탄소 컨테이너 수송 및 디지털 스마트 통관 간소화 협정이 오늘부터 시행됩니다.",
    details: "미국 캘리포니아주와 중국 상하이시 간의 민관 합동 합작으로, 태평양 횡단 항로 상의 탄소 배출을 70% 감축하고 블록체인 통관을 통해 운송 기간을 3일 단축하는 태평양 녹색 해운 통로 협약이 체결되었습니다.",
    impactScore: 78,
    locationName: "미국 캘리포니아주 로스앤젤레스 항 (Los Angeles, CA)",
    lat: 33.7432,
    lng: -118.2673,
    country: "United States",
    state: "California",
    parties: [
      { name: "로스앤젤레스 항만청", code: "US-CA", flag: "🇺🇸", lat: 33.7432, lng: -118.2673 },
      { name: "상하이 양산 심수항", code: "CN-SH", flag: "🇨🇳", lat: 30.6277, lng: 122.0642 }
    ],
    arcs: [
      {
        id: "arc-20261028-04",
        startLat: 33.7432, startLng: -118.2673,
        endLat: 30.6277, endLng: 122.0642,
        sourceName: "미국 LA항 (California)",
        targetName: "중국 상하이항",
        sourceFlag: "🇺🇸",
        targetFlag: "🇨🇳",
        color: ["#10b981", "#3b82f6"],
        altitude: 0.38,
        stroke: 2.8,
        label: "태평양 녹색 물류 회랑",
        relationType: "해운 무역 협약 (Green Maritime)"
      }
    ],
    sources: [
      { name: "Port of Los Angeles Release", type: "Port Authority", reliability: "Official Release" },
      { name: "Financial Times", type: "Global Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["무역협약", "캘리포니아", "상하이", "녹색물류"],
    tensionDelta: -5
  },
  {
    id: "evt-20261028-05",
    date: "2026-10-28",
    time: "02:15 UTC",
    category: "crisis",
    type: "crisis",
    flags: ["🇨🇱", "🇵🇪"],
    countryCodes: ["CL", "PE"],
    primaryCountry: "CL",
    title: "환태평양 '불의 고리' 해구 규모 7.7 해저 대지진 및 쓰나미 경보",
    brief: "칠레 해저 7.7 지진·쓰나미",
    place: "칠레 앞바다",
    summary: "칠레 발파라이소 연안에서 발생한 강진으로 환태평양 지진해일 조기경보가 발령되었으며 칠레·페루 연합 방재 지휘선이 가동되었습니다.",
    details: "남태평양 나스카 판과 남미 판 접경 수역 해저 22km에서 규모 7.7의 강진이 발생했습니다. 칠레 국립 재난관리청과 페루 해양경보센터는 즉각 태평양 연안 저지대 주민들에게 긴급 대피령을 내리고 초국경 실시간 해일 파고 관측망을 연동했습니다.",
    impactScore: 88,
    locationName: "칠레 연안 환태평양 해구 (Pacific Trench)",
    lat: -30.0472,
    lng: -72.6127,
    country: "Chile",
    state: "Valparaiso Region",
    parties: [
      { name: "칠레 국립재난관리청", code: "CL", flag: "🇨🇱", lat: -33.0472, lng: -71.6127 },
      { name: "페루 해양경보센터", code: "PE", flag: "🇵🇪", lat: -12.0464, lng: -77.0428 }
    ],
    arcs: [
      {
        id: "arc-20261028-05",
        startLat: -33.0472, startLng: -71.6127,
        endLat: -12.0464, endLng: -77.0428,
        sourceName: "칠레 발파라이소 재난본부",
        targetName: "페루 리마 지진관측소",
        sourceFlag: "🇨🇱",
        targetFlag: "🇵🇪",
        color: ["#f59e0b", "#ef4444"],
        altitude: 0.16,
        stroke: 2.8,
        label: "초국경 쓰나미 조기경보 및 연합 방재선",
        relationType: "해저 지진·쓰나미 경보 (Seismic Alert)"
      }
    ],
    sources: [
      { name: "USGS Earthquake Hazards", type: "Seismic Sensor Feed", reliability: "Live Sensor Feed" },
      { name: "Pacific Tsunami Warning Center", type: "NOAA Alert", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["대지진", "쓰나미경보", "불의고리", "자연재해"],
    tensionDelta: +8
  },
  {
    id: "evt-20261028-06",
    date: "2026-10-28",
    time: "08:30 UTC",
    category: "tech",
    type: "domestic",
    isDomestic: true,
    flags: ["🇰🇷"],
    countryCodes: ["KR"],
    primaryCountry: "KR",
    title: "대한민국 우주항공청, 독자 달 착륙선 및 심우주 궤도선 발사 마일스톤 공식 발표",
    brief: "한국 독자 달 착륙선 발표",
    place: "경남 사천",
    summary: "사천 우주항공청 본청에서 2032년 독자 달 표면 연착륙을 위한 차세대 100톤급 다단연소사이클 로켓 엔진 3기 종합 연소 시험 성공을 공식 선언했습니다.",
    details: "대한민국 우주항공청(KASA)과 나로우주센터는 대전 한국항공우주연구원과 공동으로 독자 개발한 심우주 추진체의 종합 지상 연소 시험을 성공적으로 완료했다고 밝혔습니다. 이번 성과로 외국의 기술 지원 없는 독자 달 탐사선 및 화성 탐사선 발사 궤적 로드맵이 최종 승인되었습니다.",
    impactScore: 89,
    locationName: "대한민국 사천 우주항공청 & 나로우주센터",
    lat: 35.0032,
    lng: 128.0642,
    country: "South Korea",
    state: "Gyeongnam Aerospace Hub",
    domesticCategory: "tech",
    sources: [
      { name: "KASA Official Dispatch", type: "Government Agency", reliability: "Official Release" },
      { name: "Yonhap News Wire", type: "National Press", reliability: "Tier 1 Confirmed" },
      { name: "Aviation Week Tech", type: "Aerospace Intel", reliability: "Verified" }
    ],
    tags: ["국내속보", "우주항공청", "달탐사", "누리호", "자체뉴스"],
    tensionDelta: -2
  },
  {
    id: "evt-20261028-07",
    date: "2026-10-28",
    time: "06:15 UTC",
    category: "trade",
    type: "domestic",
    isDomestic: true,
    flags: ["🇺🇸"],
    countryCodes: ["US"],
    primaryCountry: "US",
    title: "미 연방준비제도(Fed), 긴급 통화정책회의 소집 및 양적 긴축(QT) 조기 종료 선언",
    brief: "미 연준 긴급회의·QT 종료",
    place: "워싱턴 D.C.",
    summary: "워싱턴 D.C. 연준 본부에서 국채 시장 유동성 방어 및 차세대 AI 테크 설비투자를 지원하기 위해 대차대조표 축소 조기 중단을 발표했습니다.",
    details: "미국 연방준비제도 이사회는 금융 유동성 경색 신호를 선제 차단하기 위해 월 600억 달러 규모의 양적 긴축을 즉시 종료하고 글로벌 단기 자금시장에 유동성을 공급하는 긴급 금융 안정화 프로그램을 가동한다고 발표했습니다.",
    impactScore: 93,
    locationName: "미국 워싱턴 D.C. 연방준비제도 본부",
    lat: 38.8921,
    lng: -77.0465,
    country: "United States",
    state: "Federal District",
    domesticCategory: "economy",
    sources: [
      { name: "Federal Reserve Board Press", type: "Central Bank", reliability: "Official Release" },
      { name: "Wall Street Journal Wire", type: "Financial Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["국내속보", "연준금리", "금융시장", "양적긴축", "자체뉴스"],
    tensionDelta: -4
  },
  {
    id: "evt-20261028-08",
    date: "2026-10-28",
    time: "04:00 UTC",
    category: "crisis",
    type: "domestic",
    isDomestic: true,
    flags: ["🇯🇵"],
    countryCodes: ["JP"],
    primaryCountry: "JP",
    title: "일본 규슈 아소산 화산성 지진 급증 및 분화 경계 레벨 3(입산 규제) 상향 격상",
    brief: "아소산 분화 경계 레벨 3",
    place: "일본 구마모토",
    summary: "구마모토현 아소산 분화구 주변에서 24시간 동안 400회 이상의 화산성 지동이 관측되어 반경 4km 출입이 전면 차단되었습니다.",
    details: "일본 기상청은 아소산 나카다케 제1분화구의 팽창 변형과 지하 마그마 상승을 확인하고 화산 분화 경계 수준을 '레벨 3'으로 격상했습니다. 규슈 방재 당국은 인근 관광객과 주민 2,400명을 긴급 대피소로 이동 조치했습니다.",
    impactScore: 84,
    locationName: "일본 구마모토현 아소산 화산 지대",
    lat: 32.8841,
    lng: 131.1040,
    country: "Japan",
    state: "Kumamoto Prefecture",
    domesticCategory: "incident",
    sources: [
      { name: "JMA Volcanic Advisory", type: "Meteorological Agency", reliability: "Official Sensor Feed" },
      { name: "NHK World News", type: "Public Broadcaster", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["국내속보", "화산분화", "아소산", "자연재해", "자체뉴스"],
    tensionDelta: +3
  },

  // --- 2026-10-27 ---
  {
    id: "evt-20261027-01",
    date: "2026-10-27",
    time: "18:20 UTC",
    category: "conflict",
    type: "conflict",
    flags: ["🇺🇦", "🇷🇺"],
    countryCodes: ["UA", "RU"],
    primaryCountry: "UA",
    title: "동유럽 도네츠크-자포리자 전선 포격전 및 드론 요격 격돌",
    brief: "자포리자 전선 포격전",
    place: "자포리자 전선",
    summary: "국경 접경 지대에서 대규모 자폭 드론 공습과 지대공 미사일 요격 전투가 야간에 집중 발생했습니다.",
    details: "동유럽 접경 전선에서 장거리 정밀 미사일과 FPV 요격 드론 간의 치열한 공중전이 벌어졌습니다. 전선 부근 에너지 인프라 3곳이 타격을 입어 인근 지역의 전력망이 차단되었습니다.",
    impactScore: 91,
    locationName: "동유럽 분쟁 접경지대 (Zaporizhzhia Line)",
    lat: 47.8388,
    lng: 35.1396,
    country: "Eastern Europe",
    state: "Conflict Zone E-1",
    parties: [
      { name: "우크라이나 국방 총사령부 (키이우)", code: "UA", flag: "🇺🇦", lat: 50.4501, lng: 30.5234 },
      { name: "러시아 군사 사령부 (모스크바)", code: "RU", flag: "🇷🇺", lat: 55.7558, lng: 37.6173 }
    ],
    arcs: [
      {
        id: "arc-20261027-01",
        startLat: 50.4501, startLng: 30.5234,
        endLat: 55.7558, endLng: 37.6173,
        sourceName: "우크라이나 국방 총사령부 (키이우)",
        targetName: "러시아 군사 사령부 (모스크바)",
        sourceFlag: "🇺🇦",
        targetFlag: "🇷🇺",
        color: ["#ff1744", "#d50000"],
        altitude: 0.28,
        stroke: 3.8,
        label: "동유럽 전선 교전선 (UA-RU)",
        relationType: "전면 군사 충돌 (Active Warfare)"
      }
    ],
    sources: [
      { name: "Sentinel-2 SAR Radar", type: "SAR Satellite", reliability: "98% High-Res" },
      { name: "AFP Dispatch", type: "Global Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["동유럽전쟁", "드론공습", "에너지위기", "전선교전"],
    tensionDelta: +15
  },
  {
    id: "evt-20261027-02",
    date: "2026-10-27",
    time: "14:00 UTC",
    category: "treaty",
    type: "treaty",
    flags: ["🇪🇺", "🇧🇷"],
    countryCodes: ["EU", "BR"],
    primaryCountry: "EU",
    title: "EU-남미 메르코수르 핵심 광물 및 수소 공급 협정(Green Energy Pact) 최종 서명",
    brief: "EU–메르코수르 에너지 협정",
    place: "브뤼셀",
    summary: "브뤼셀과 브라질리아 간 20년간 지연되던 자유무역협정이 친환경 조항을 포함하여 역사적으로 서명되었습니다.",
    details: "유럽연합 집행위원회 본부에서 EU 27개국과 남미 공동시장(메르코수르) 대표단이 리튬·니켈 무관세 수입과 유럽산 첨단 수소 플랜트 설비 수출을 골자로 하는 메가 경제안보 조약에 서명하며 악수를 교환했습니다.",
    impactScore: 86,
    locationName: "벨기에 브뤼셀 (Brussels, Belgium)",
    lat: 50.8503,
    lng: 4.3517,
    country: "Belgium",
    state: "Brussels Capital",
    parties: [
      { name: "EU 집행위 본부", code: "EU", flag: "🇪🇺", lat: 50.8503, lng: 4.3517 },
      { name: "메르코수르 연합 사령부", code: "BR", flag: "🇧🇷", lat: -15.7975, lng: -47.8919 }
    ],
    arcs: [
      {
        id: "arc-20261027-02",
        startLat: 50.8503, startLng: 4.3517,
        endLat: -15.7975, endLng: -47.8919,
        sourceName: "유럽연합 집행위 (브뤼셀)",
        targetName: "남미 메르코수르 (브라질리아)",
        sourceFlag: "🇪🇺",
        targetFlag: "🇧🇷",
        color: ["#10b981", "#06b6d4"],
        altitude: 0.44,
        stroke: 3.0,
        label: "EU-남미 그린에너지 파트너십",
        relationType: "전략적 경제 조약 (Strategic Pact)"
      }
    ],
    sources: [
      { name: "European Council Press", type: "EU Official", reliability: "Official Release" },
      { name: "Le Monde Wire", type: "European Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["EU조약", "메르코수르", "희토류협정", "탄소중립"],
    tensionDelta: -7
  },
  {
    id: "evt-20261027-03",
    date: "2026-10-27",
    time: "10:15 UTC",
    category: "crisis",
    type: "crisis",
    flags: ["🇮🇳", "🇧🇩"],
    countryCodes: ["IN", "BD"],
    primaryCountry: "IN",
    title: "남아시아 벵골만 초대형 사이클론 상륙 및 인도·방글라데시 합동 대피령",
    brief: "벵골만 사이클론 대피령",
    place: "벵골만",
    summary: "카테고리 4급 사이클론 '바루나'가 콜카타와 다카 해안선에 접근하여 300만 명의 대규모 피난 작전이 개시되었습니다.",
    details: "벵골만에서 급격히 발달한 슈퍼 사이클론으로 인해 연안 제방 붕괴 위험이 제기되었으며, 위성 모니터링 센터는 해일 높이가 최대 5.5m에 이를 것으로 예측했습니다. 다국적 구호 함대가 구호 물자 수송 아크를 형성하고 있습니다.",
    impactScore: 82,
    locationName: "인도 콜카타 & 벵골만 해안 (Bay of Bengal)",
    lat: 22.5726,
    lng: 88.3639,
    country: "India",
    state: "West Bengal",
    parties: [
      { name: "인도 재난대응군", code: "IN", flag: "🇮🇳", lat: 22.5726, lng: 88.3639 },
      { name: "방글라데시 다카 지원팀", code: "BD", flag: "🇧🇩", lat: 23.8103, lng: 90.4125 }
    ],
    arcs: [
      {
        id: "arc-20261027-03",
        startLat: 22.5726, startLng: 88.3639,
        endLat: 23.8103, endLng: 90.4125,
        sourceName: "인도 콜카타 재난본부",
        targetName: "방글라데시 다카 구호팀",
        sourceFlag: "🇮🇳",
        targetFlag: "🇧🇩",
        color: ["#f59e0b", "#ef4444"],
        altitude: 0.12,
        stroke: 2.8,
        label: "초국경 재난 구호 긴급 회랑",
        relationType: "인도주의적 구호선 (Disaster Relief)"
      }
    ],
    sources: [
      { name: "NASA Earth Observatory", type: "Climate Satellite", reliability: "Live Sensor Feed" },
      { name: "Times of India", type: "National Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["자연재해", "사이클론", "벵골만", "기후위기"],
    tensionDelta: +4
  },
  {
    id: "evt-20261027-04",
    date: "2026-10-27",
    time: "07:30 UTC",
    category: "tech",
    type: "domestic",
    isDomestic: true,
    flags: ["🇰🇷"],
    countryCodes: ["KR"],
    primaryCountry: "KR",
    title: "용인 첨단 시스템 반도체 메가 클러스터 1단계 전력·용수 국가망 조기 착공",
    brief: "용인 반도체 클러스터 착공",
    place: "경기 용인",
    summary: "경기도 용인 남사·원삼 메가 클러스터에 3GW급 전용 전력망과 하루 100만 톤급 공업용수 공급망 인프라가 1년 앞당겨 동시 착공되었습니다.",
    details: "대한민국 산업통상자원부와 경기도는 차세대 2나노 이하 첨단 파운드리 팹(Fab) 6기 조기 가동을 지원하기 위해 동해안 초고압 직류송전(HVDC) 신규 연계 라인과 팔당호 용수관로 증설 프로젝트를 착공했다고 밝혔습니다.",
    impactScore: 86,
    locationName: "대한민국 경기도 용인 메가 반도체 클러스터",
    lat: 37.2410,
    lng: 127.1775,
    country: "South Korea",
    state: "Gyeonggi Semiconductor Belt",
    domesticCategory: "tech",
    sources: [
      { name: "MOTIE Official Release", type: "Ministry of Trade", reliability: "Official Release" },
      { name: "Maeil Business Newspaper", type: "Economic Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["국내속보", "용인반도체", "시스템반도체", "인프라착공", "자체뉴스"],
    tensionDelta: -3
  },
  {
    id: "evt-20261027-05",
    date: "2026-10-27",
    time: "11:00 UTC",
    category: "crisis",
    type: "domestic",
    isDomestic: true,
    flags: ["🇫🇷"],
    countryCodes: ["FR"],
    primaryCountry: "FR",
    title: "프랑스 파리 대규모 전국 철도·에너지 총파업 돌입 및 50만 명 도심 집회",
    brief: "파리 50만 명 총파업",
    place: "파리",
    summary: "파리 콩코르드 광장과 리옹역을 중심으로 공공부문 긴축 재정안 철회를 요구하는 전국 총파업이 개시되어 TGV 운행이 60% 감축되었습니다.",
    details: "프랑스 주요 노동조합 연맹(CGT, CFDT)이 연대하여 국가 부채 감축을 위한 공공요금 인상과 연금 개편안에 반대하는 무기한 총파업에 돌입했습니다. 프랑스 내무부는 파리 도심에 1만 2천 명의 기동경찰을 배치했습니다.",
    impactScore: 83,
    locationName: "프랑스 파리 도심 & 콩코르드 광장",
    lat: 48.8566,
    lng: 2.3522,
    country: "France",
    state: "Ile-de-France",
    domesticCategory: "society",
    sources: [
      { name: "Le Figaro", type: "French National Daily", reliability: "Tier 1 Confirmed" },
      { name: "France Info Radio", type: "Public Radio", reliability: "Verified Live" }
    ],
    tags: ["국내속보", "프랑스총파업", "파리집회", "공공부문", "자체뉴스"],
    tensionDelta: +5
  },

  // --- 2026-10-26 ---
  {
    id: "evt-20261026-01",
    date: "2026-10-26",
    time: "21:00 UTC",
    category: "conflict",
    type: "conflict",
    flags: ["🇵🇭", "🇨🇳"],
    countryCodes: ["PH", "CN", "US"],
    primaryCountry: "PH",
    title: "남중국해 세컨드 토마스 숄 해양경비대 충돌 및 고압 물대포 교전",
    brief: "남중국해 물대포 충돌",
    place: "남중국해",
    summary: "필리핀 보급선과 해경선 간의 충돌 및 통신 방해 사건으로 아시아 태평양 안보 회의가 긴급 소집되었습니다.",
    details: "스프래틀리 군도 인근에서 필리핀 해양경비대 초계정과 상대국 대형 해경함이 20미터 거리까지 근접 대치하며 선체 충돌 및 레이저 조준 사건이 발생했습니다. 미국 국방부는 상호방위조약 제4조 적용 가능성을 경고했습니다.",
    impactScore: 89,
    locationName: "남중국해 세컨드 토마스 숄 (Second Thomas Shoal)",
    lat: 9.8756,
    lng: 115.8550,
    country: "South China Sea",
    state: "Spratly Sector",
    parties: [
      { name: "필리핀 마닐라 해경청", code: "PH", flag: "🇵🇭", lat: 14.5995, lng: 120.9842 },
      { name: "중국 남부전구 해군 기지 (광저우)", code: "CN", flag: "🇨🇳", lat: 23.1291, lng: 113.2644 }
    ],
    arcs: [
      {
        id: "arc-20261026-01",
        startLat: 14.5995, startLng: 120.9842,
        endLat: 23.1291, endLng: 113.2644,
        sourceName: "필리핀 마닐라 해경",
        targetName: "중국 남부전구 해군 기지 (광저우)",
        sourceFlag: "🇵🇭",
        targetFlag: "🇨🇳",
        color: ["#ff0055", "#ffaa00"],
        altitude: 0.26,
        stroke: 3.4,
        label: "남중국해 해상 영유권 분쟁선 (PH-CN)",
        relationType: "해상 대치선 (Maritime Clash)"
      }
    ],
    sources: [
      { name: "Philippine Coast Guard", type: "Government Official", reliability: "Official Release" },
      { name: "US INDOPACOM Feed", type: "Military Command", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["남중국해", "해상영유권", "충돌", "필리핀"],
    tensionDelta: +10
  },
  {
    id: "evt-20261026-02",
    date: "2026-10-26",
    time: "15:40 UTC",
    category: "treaty",
    type: "treaty",
    flags: ["🇺🇸", "🇬🇧", "🇨🇭"],
    countryCodes: ["US", "GB", "CH"],
    primaryCountry: "US",
    title: "미국 캘리포니아 실리콘밸리 글로벌 AI 세이프티 다자간 협약 체결",
    brief: "AI 세이프티 다자 협약",
    place: "샌프란시스코",
    summary: "오픈AI, 구글, 앤트로픽 및 24개국 정부 대표가 샌프란시스코에서 '프런티어 AI 자율 군사화 금지 조약'에 서명했습니다.",
    details: "샌프란시스코 팰리스 오브 파인 아츠에서 열린 세계 AI 정상회의에서 차세대 프론티어 인공지능의 자율 살상무기 탑재 금지 및 공동 레드팀 워터마크 기술 표준 도입 협약이 승인되었습니다. 실리콘밸리와 각국 규제기관 간의 실시간 검증 API가 개방됩니다.",
    impactScore: 87,
    locationName: "미국 캘리포니아주 샌프란시스코 (San Francisco, CA)",
    lat: 37.7749,
    lng: -122.4194,
    country: "United States",
    state: "California",
    parties: [
      { name: "캘리포니아 테크 얼라이언스", code: "US-CA", flag: "🇺🇸", lat: 37.7749, lng: -122.4194 },
      { name: "영국 런던 AI 안보기구", code: "GB", flag: "🇬🇧", lat: 51.5074, lng: -0.1278 },
      { name: "스위스 제네바 UN 본부", code: "CH", flag: "🇨🇭", lat: 46.2044, lng: 6.1432 }
    ],
    arcs: [
      {
        id: "arc-20261026-02a",
        startLat: 37.7749, startLng: -122.4194,
        endLat: 51.5074, endLng: -0.1278,
        sourceName: "실리콘밸리 (샌프란시스코)",
        targetName: "영국 런던 AI안보청",
        sourceFlag: "🇺🇸",
        targetFlag: "🇬🇧",
        color: ["#38bdf8", "#818cf8"],
        altitude: 0.46,
        stroke: 3.0,
        label: "대서양 AI 안전 표준 협약선",
        relationType: "기술 규제 조약 (Tech Regulation)"
      },
      {
        id: "arc-20261026-02b",
        startLat: 37.7749, startLng: -122.4194,
        endLat: 46.2044, endLng: 6.1432,
        sourceName: "실리콘밸리 (샌프란시스코)",
        targetName: "스위스 제네바 UN본부",
        sourceFlag: "🇺🇸",
        targetFlag: "🇨🇭",
        color: ["#38bdf8", "#a855f7"],
        altitude: 0.48,
        stroke: 2.6,
        label: "UN 글로벌 거버넌스 연결선",
        relationType: "다자간 협약 (Multilateral Pact)"
      }
    ],
    sources: [
      { name: "Wired Tech Intel", type: "Tech Press", reliability: "Tier 1 Confirmed" },
      { name: "Reuters Tech Desk", type: "Global Press", reliability: "Verified" }
    ],
    tags: ["AI안전조약", "실리콘밸리", "캘리포니아", "다자협정"],
    tensionDelta: -6
  },
  {
    id: "evt-20261026-03",
    date: "2026-10-26",
    time: "11:20 UTC",
    category: "trade",
    type: "trade",
    flags: ["🇰🇷", "🇹🇼"],
    countryCodes: ["KR", "TW"],
    primaryCountry: "KR",
    title: "대한민국 경기도-대만 신주 차세대 2나노 웨이퍼 상호 백업 스왑 협정",
    brief: "한·대만 2나노 웨이퍼 협정",
    place: "평택·신주",
    summary: "삼성전자와 TSMC 협력사들이 지정학적 위기 시 웨이퍼 파운드리 생산 라인을 상호 분산 생산하는 안전망을 수립했습니다.",
    details: "대한민국 경기도 평택 반도체 밸리와 대만 신주 사이언스 파크 간에 극단적 공급망 단절 사태 시 상호 패키징 및 테스트를 대행해 주는 민간 반도체 레질리언스(복원력) 협약이 성사되었습니다.",
    impactScore: 84,
    locationName: "대한민국 경기도 평택 (Pyeongtaek, Gyeonggi)",
    lat: 36.9921,
    lng: 127.1129,
    country: "South Korea",
    state: "Gyeonggi-do",
    parties: [
      { name: "경기도 평택 반도체 메가팹", code: "KR-GG", flag: "🇰🇷", lat: 36.9921, lng: 127.1129 },
      { name: "대만 신주 사이언스 파크", code: "TW-HSIP", flag: "🇹🇼", lat: 24.7820, lng: 120.9984 }
    ],
    arcs: [
      {
        id: "arc-20261026-03",
        startLat: 36.9921, startLng: 127.1129,
        endLat: 24.7820, endLng: 120.9984,
        sourceName: "대한민국 평택 메가팹",
        targetName: "대만 신주 파운드리",
        sourceFlag: "🇰🇷",
        targetFlag: "🇹🇼",
        color: ["#10b981", "#06b6d4"],
        altitude: 0.16,
        stroke: 3.0,
        label: "한-대만 반도체 공급망 백업 루프",
        relationType: "전략 반도체 동맹 (Chip Alliance)"
      }
    ],
    sources: [
      { name: "Chosun Biz Semiconductor", type: "Business Press", reliability: "Tier 1 Confirmed" },
      { name: "DigiTimes Taiwan", type: "Industry Intelligence", reliability: "Verified" }
    ],
    tags: ["반도체", "경기도", "신주", "공급망스왑"],
    tensionDelta: -4
  },

  // --- 2026-10-25 ---
  {
    id: "evt-20261025-01",
    date: "2026-10-25",
    time: "16:45 UTC",
    category: "conflict",
    type: "conflict",
    flags: ["🇸🇩", "🇸🇩"],
    countryCodes: ["SD"],
    primaryCountry: "SD",
    title: "수단 다르푸르 국경지대 정부군과 신속지원군(RSF) 중화기 무력 충돌",
    brief: "수단 다르푸르 무력 충돌",
    place: "수단 엘파셔",
    summary: "난민 캠프 인근에서 발생한 포격전으로 수만 명의 국경 탈출 행렬이 발생하며 인도주의적 비상사태가 선포되었습니다.",
    details: "수단 서부 엘파셔 인근에서 대구경 야포와 무장 드론을 동원한 교전이 재발하여 국경 없는 의사회 병원이 긴급 소개되었습니다. 인접국 차드 국경 지대에는 수색 구조 및 비상 식량 공수가 전개되고 있습니다.",
    impactScore: 88,
    locationName: "수단 엘파셔 (El Fasher, North Darfur)",
    lat: 13.6288,
    lng: 25.3548,
    country: "Sudan",
    state: "Darfur Region",
    parties: [
      { name: "수단 정규군(SAF)", code: "SD-SAF", flag: "🇸🇩", lat: 15.5007, lng: 32.5599 },
      { name: "신속지원군(RSF)", code: "SD-RSF", flag: "🇸🇩", lat: 13.6288, lng: 25.3548 }
    ],
    arcs: [
      {
        id: "arc-20261025-01",
        startLat: 15.5007, startLng: 32.5599,
        endLat: 13.6288, endLng: 25.3548,
        sourceName: "수단 하르툼 정규군 본부",
        targetName: "다르푸르 RSF 전선",
        sourceFlag: "🇸🇩",
        targetFlag: "🇸🇩",
        color: ["#ef4444", "#dc2626"],
        altitude: 0.14,
        stroke: 3.0,
        label: "수단 내전 포격 및 교전선",
        relationType: "내전 무력 충돌 (Civil War Conflict)"
      }
    ],
    sources: [
      { name: "UNHCR Official Dispatch", type: "UN Relief Agency", reliability: "Official Release" },
      { name: "Al Jazeera English", type: "Regional Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["수단내전", "난민위기", "군사충돌", "아프리카"],
    tensionDelta: +11
  },
  {
    id: "evt-20261025-02",
    date: "2026-10-25",
    time: "12:00 UTC",
    category: "treaty",
    type: "treaty",
    flags: ["🇳🇴", "🇸🇪", "🇫🇮"],
    countryCodes: ["NO", "SE", "FI", "EU"],
    primaryCountry: "NO",
    title: "북유럽 4개국 통합 방공 방패망(Nordic Air Shield) 공식 발족 협정",
    brief: "북유럽 통합 방공망 발족",
    place: "오슬로",
    summary: "노르웨이 오슬로에서 노르웨이·스웨덴·핀란드·덴마크가 250대 전투기 레이더망 단일 지휘체계 통합 협약에 서명했습니다.",
    details: "북유럽 4개국 국방장관들이 나토 북동부 방위선의 핵심이 될 '노르딕 에어 쉴드' 조약에 최종 서명했습니다. 이에 따라 4개국의 F-35 및 그리펜 편대는 하나의 통합된 공중 관제 소프트웨어로 실시간 영공 초계 임무를 수행합니다.",
    impactScore: 86,
    locationName: "노르웨이 오슬로 (Oslo, Norway)",
    lat: 59.9139,
    lng: 10.7522,
    country: "Norway",
    state: "Oslo Region",
    parties: [
      { name: "노르웨이 오슬로 국방부", code: "NO", flag: "🇳🇴", lat: 59.9139, lng: 10.7522 },
      { name: "스웨덴 스톡홀름 사령부", code: "SE", flag: "🇸🇪", lat: 59.3293, lng: 18.0686 },
      { name: "핀란드 헬싱키 공군본부", code: "FI", flag: "🇫🇮", lat: 60.1699, lng: 24.9384 }
    ],
    arcs: [
      {
        id: "arc-20261025-02a",
        startLat: 59.9139, startLng: 10.7522,
        endLat: 59.3293, endLng: 18.0686,
        sourceName: "노르웨이 오슬로",
        targetName: "스웨덴 스톡홀름",
        sourceFlag: "🇳🇴",
        targetFlag: "🇸🇪",
        color: ["#00f0ff", "#38bdf8"],
        altitude: 0.12,
        stroke: 2.8,
        label: "노르딕 방공 통합 링크",
        relationType: "통합 방공망 (Joint Air Defense)"
      },
      {
        id: "arc-20261025-02b",
        startLat: 59.3293, startLng: 18.0686,
        endLat: 60.1699, endLng: 24.9384,
        sourceName: "스웨덴 스톡홀름",
        targetName: "핀란드 헬싱키",
        sourceFlag: "🇸🇪",
        targetFlag: "🇫🇮",
        color: ["#00f0ff", "#00ff88"],
        altitude: 0.12,
        stroke: 2.8,
        label: "발트해 방위 쉴드선",
        relationType: "발트해 방어 조약 (Baltic Shield)"
      }
    ],
    sources: [
      { name: "NORDEFCO HQ Press", type: "Defense Coalition", reliability: "Official Release" },
      { name: "BBC Defense Wire", type: "Global Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["나토", "북유럽동맹", "방공협정", "오슬로조약"],
    tensionDelta: -5
  },

  // --- 2026-10-24 ---
  {
    id: "evt-20261024-01",
    date: "2026-10-24",
    time: "19:30 UTC",
    category: "conflict",
    type: "conflict",
    flags: ["🇮🇳", "🇵🇰"],
    countryCodes: ["IN", "PK"],
    primaryCountry: "IN",
    title: "카슈미르 정전선(LoC) 중화기 교전 및 양국 외교관 초치",
    brief: "카슈미르 정전선 교전",
    place: "카슈미르",
    summary: "인도-파키스탄 국경 카슈미르 산악지대 감시초소 간 포격으로 군인 4명 사상 및 주민 긴급 대피 발생.",
    details: "히말라야 산악 지대 실질통제선(LoC) 부근에서 박격포 및 야포 탄착이 발생하여 양국 군사 핫라인이 긴급 가동되었습니다. 양국 국방부는 상대방의 정전 협정 위반을 규탄하는 성명을 발표했습니다.",
    impactScore: 84,
    locationName: "인도-파키스탄 통제선 (Line of Control, Kashmir)",
    lat: 34.0837,
    lng: 74.7973,
    country: "Kashmir",
    state: "LoC Sector North",
    parties: [
      { name: "뉴델리 인도 육군본부", code: "IN", flag: "🇮🇳", lat: 28.6139, lng: 77.2090 },
      { name: "이슬라마바드 파키스탄 군사령부", code: "PK", flag: "🇵🇰", lat: 33.6844, lng: 73.0479 }
    ],
    arcs: [
      {
        id: "arc-20261024-01",
        startLat: 28.6139, startLng: 77.2090,
        endLat: 33.6844, endLng: 73.0479,
        sourceName: "인도 뉴델리 사령부",
        targetName: "파키스탄 이슬라마바드",
        sourceFlag: "🇮🇳",
        targetFlag: "🇵🇰",
        color: ["#ff0033", "#ff6600"],
        altitude: 0.26,
        stroke: 3.4,
        label: "카슈미르 통제선 포격 및 대치선 (IN-PK)",
        relationType: "국경 군사 교전 (Border Clashes)"
      }
    ],
    sources: [
      { name: "UN Military Observer Group", type: "UN Peacekeeping", reliability: "Verified Monitor" },
      { name: "The Hindu Wire", type: "National Press", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["카슈미르", "포격전", "인도파키스탄", "국경분쟁"],
    tensionDelta: +9
  },
  {
    id: "evt-20261024-02",
    date: "2026-10-24",
    time: "13:10 UTC",
    category: "treaty",
    type: "treaty",
    flags: ["🇺🇳", "🇫🇯"],
    countryCodes: ["UN", "US", "FJ"],
    primaryCountry: "UN",
    title: "미국 뉴욕 유엔본부 글로벌 해양 생물다양성 BBNJ 비준 조약 발효",
    brief: "유엔 해양 BBNJ 조약 발효",
    place: "뉴욕 유엔본부",
    summary: "60개국 이상의 공식 비준서 기탁으로 공해(High Seas) 환경 보호를 위한 역사적인 국제 구속력 조약이 공식 발효되었습니다.",
    details: "뉴욕 유엔 본부 총회장에서 공해(전 세계 해양의 3분의 2) 내 심해 채굴 제한과 해양보호구역 지정을 강제하는 BBNJ(공해 생물다양성) 협정이 발효되어 각국 대표단이 기립 박수를 보냈습니다.",
    impactScore: 83,
    locationName: "미국 뉴욕 유엔본부 (United Nations HQ, New York)",
    lat: 40.7499,
    lng: -73.9674,
    country: "United States",
    state: "New York",
    parties: [
      { name: "유엔 본부 (New York)", code: "UN", flag: "🇺🇳", lat: 40.7499, lng: -73.9674 },
      { name: "태평양 도서국 포럼 (Suva, Fiji)", code: "PIF", flag: "🇫🇯", lat: -18.1416, lng: 178.4419 }
    ],
    arcs: [
      {
        id: "arc-20261024-02",
        startLat: 40.7499, startLng: -73.9674,
        endLat: -18.1416, endLng: 178.4419,
        sourceName: "유엔 본부 (뉴욕)",
        targetName: "태평양 도서국 포럼 (피지)",
        sourceFlag: "🇺🇳",
        targetFlag: "🇫🇯",
        color: ["#3b82f6", "#10b981"],
        altitude: 0.52,
        stroke: 3.0,
        label: "글로벌 공해 환경보호 조약선",
        relationType: "해양 환경 조약 (Ocean Treaty)"
      }
    ],
    sources: [
      { name: "UN News Centre", type: "UN Official", reliability: "Official Release" },
      { name: "Nature Sustainability", type: "Scientific Journal", reliability: "Peer Reviewed" }
    ],
    tags: ["유엔조약", "해양보호", "뉴욕", "생물다양성"],
    tensionDelta: -7
  },

  // --- 2026-10-23 ---
  {
    id: "evt-20261023-01",
    date: "2026-10-23",
    time: "17:00 UTC",
    category: "space",
    type: "space",
    flags: ["🇺🇸", "🇪🇺"],
    countryCodes: ["US", "EU"],
    primaryCountry: "US",
    title: "아르테미스 4호 루나 게이트웨이 궤도 랑데부 도킹 성공",
    brief: "아르테미스 4호 도킹 성공",
    place: "케네디 우주센터",
    summary: "미국 플로리다 케네디 우주센터에서 발사된 다국적 유인 우주선이 달 궤도 우주정거장에 성공적으로 결합했습니다.",
    details: "NASA, ESA, JAXA 합작의 아르테미스 프로그램 우주선이 달 주변 영구 기지 '게이트웨이'와의 자율 랑데부 도킹에 성공했습니다. 딥 스페이스 광통신망을 통해 지구로 4K 실시간 영상 스트림이 전송되었습니다.",
    impactScore: 88,
    locationName: "미국 플로리다 케네디 우주센터 (Cape Canaveral, FL)",
    lat: 28.5729,
    lng: -80.6490,
    country: "United States",
    state: "Florida",
    parties: [
      { name: "케네디 우주센터 (Florida)", code: "US-FL", flag: "🇺🇸", lat: 28.5729, lng: -80.6490 },
      { name: "유럽우주국 본부 (Darmstadt, DE)", code: "ESA", flag: "🇪🇺", lat: 49.8728, lng: 8.6512 }
    ],
    arcs: [
      {
        id: "arc-20261023-01",
        startLat: 28.5729, startLng: -80.6490,
        endLat: 49.8728, endLng: 8.6512,
        sourceName: "미국 케네디 우주센터 (플로리다)",
        targetName: "유럽우주국 관제센터 (독일)",
        sourceFlag: "🇺🇸",
        targetFlag: "🇪🇺",
        color: ["#d946ef", "#60a5fa"],
        altitude: 0.44,
        stroke: 2.8,
        label: "심우주 통신 및 데이터 링크",
        relationType: "우주 탐사 동맹 (Space Alliance)"
      }
    ],
    sources: [
      { name: "NASA Headquarters", type: "Space Agency", reliability: "Official Release" },
      { name: "ESA Communications", type: "Space Agency", reliability: "Official Release" }
    ],
    tags: ["우주탐사", "플로리다", "아르테미스", "루나게이트웨이"],
    tensionDelta: -4
  },
  {
    id: "evt-20261023-02",
    date: "2026-10-23",
    time: "08:15 UTC",
    category: "trade",
    type: "trade",
    flags: ["🇸🇬", "🇦🇺"],
    countryCodes: ["SG", "AU"],
    primaryCountry: "SG",
    title: "동아시아 RCEP 디지털 전자상거래 무관세 패키지 확대 합의",
    brief: "RCEP 디지털 무관세 확대",
    place: "싱가포르",
    summary: "싱가포르에서 아세안 10개국 및 한·중·일·호주·뉴질랜드가 국경 간 데이터 이동 자유화 협정을 타결했습니다.",
    details: "싱가포르 마리나 베이 샌즈 컨벤션 센터에서 RCEP 회원국 무역장관들이 모여 데이터 주권 보장과 핀테크 상호 호환성을 골자로 하는 디지털 경제 프레임워크에 최종 서명했습니다.",
    impactScore: 80,
    locationName: "싱가포르 (Singapore)",
    lat: 1.3521,
    lng: 103.8198,
    country: "Singapore",
    state: "Central Region",
    parties: [
      { name: "싱가포르 통상교섭본부", code: "SG", flag: "🇸🇬", lat: 1.3521, lng: 103.8198 },
      { name: "호주 캔버라 무역대표부", code: "AU", flag: "🇦🇺", lat: -35.2809, lng: 149.1300 }
    ],
    arcs: [
      {
        id: "arc-20261023-02",
        startLat: 1.3521, startLng: 103.8198,
        endLat: -35.2809, endLng: 149.1300,
        sourceName: "싱가포르 통상본부",
        targetName: "호주 캔버라 무역대표부",
        sourceFlag: "🇸🇬",
        targetFlag: "🇦🇺",
        color: ["#10b981", "#3b82f6"],
        altitude: 0.28,
        stroke: 2.8,
        label: "RCEP 디지털 무역 백본망",
        relationType: "디지털 경제 협약 (Digital Trade)"
      }
    ],
    sources: [
      { name: "The Straits Times", type: "National Press", reliability: "Tier 1 Confirmed" },
      { name: "Nikkei Asia", type: "Regional Intelligence", reliability: "Verified" }
    ],
    tags: ["RCEP", "디지털무역", "싱가포르", "아세안"],
    tensionDelta: -3
  },

  // --- 2026-10-22 ---
  {
    id: "evt-20261022-01",
    date: "2026-10-22",
    time: "22:15 UTC",
    category: "conflict",
    type: "conflict",
    flags: ["🇺🇸", "🇾🇪"],
    countryCodes: ["US", "YE"],
    primaryCountry: "YE",
    title: "바브엘만데브 해협 민간 상선 대함 탄도미사일 요격전",
    brief: "홍해 탄도미사일 요격전",
    place: "바브엘만데브 해협",
    summary: "홍해 남단 상선 행렬을 겨냥한 대함 미사일 3발을 다국적 연합 이지스함이 SM-6 미사일로 해상 요격했습니다.",
    details: "홍해 남부 바브엘만데브 해협에서 발생한 상선 공격 시도를 구축함 레이더가 포착하고 요격 미사일을 연속 발사하여 격추했습니다. 상선 항로가 일시적으로 아프리카 희망봉 우회 항로로 전환되었습니다.",
    impactScore: 90,
    locationName: "홍해 바브엘만데브 해협 (Bab-el-Mandeb Strait)",
    lat: 12.5855,
    lng: 43.3364,
    country: "Red Sea",
    state: "Maritime Sector 1",
    parties: [
      { name: "홍해 연합 해상 사령부 (지부티 기지)", code: "US-NAVY", flag: "🇺🇸", lat: 11.5880, lng: 43.1450 },
      { name: "예멘 군사 사령부 (사나)", code: "YE", flag: "🇾🇪", lat: 15.3694, lng: 44.1910 }
    ],
    arcs: [
      {
        id: "arc-20261022-01",
        startLat: 11.5880, startLng: 43.1450,
        endLat: 15.3694, endLng: 44.1910,
        sourceName: "연합 이지스 해상 사령부 (지부티/홍해)",
        targetName: "예멘 후티 군사 사령부 (사나)",
        sourceFlag: "🇺🇸",
        targetFlag: "🇾🇪",
        color: ["#ff0055", "#ff0000"],
        altitude: 0.25,
        stroke: 3.4,
        label: "홍해-바브엘만데브 대함 미사일 요격선 (US-YE)",
        relationType: "미사일 요격전 (Missile Intercept)"
      }
    ],
    sources: [
      { name: "US CENTCOM Operational Brief", type: "Military Command", reliability: "Official Release" },
      { name: "Lloyd's List Intelligence", type: "Maritime Intelligence", reliability: "Verified Specialist" }
    ],
    tags: ["홍해위기", "해양안보", "미사일요격", "물류혼란"],
    tensionDelta: +13
  },
  {
    id: "evt-20261022-02",
    date: "2026-10-22",
    time: "14:50 UTC",
    category: "treaty",
    type: "treaty",
    flags: ["🇺🇸", "🇬🇧", "🇨🇦"],
    countryCodes: ["US", "GB", "CA"],
    primaryCountry: "US",
    title: "워싱턴 D.C. 글로벌 사이버 복원력 및 핵심 인프라 공동 방호 협약",
    brief: "사이버 인프라 방호 협약",
    place: "워싱턴 D.C.",
    summary: "미국 국토안보부와 파이브 아이즈(Five Eyes) 5개국이 국가 송전망·병원 해킹에 대응하는 다자간 사이버 상호 방위 협정을 비준했습니다.",
    details: "워싱턴 D.C. 백악관 국가안보회의에서 국가 핵심 기반시설에 대한 랜섬웨어 및 국가 배후 해킹 그룹의 사이버 테러에 대해 물리적 공격과 동등한 집단 방위권을 발동하는 조약에 공식 서명했습니다.",
    impactScore: 88,
    locationName: "미국 워싱턴 D.C. (Washington, D.C.)",
    lat: 38.8951,
    lng: -77.0364,
    country: "United States",
    state: "District of Columbia",
    parties: [
      { name: "미국 백악관 국가안보실", code: "US-DC", flag: "🇺🇸", lat: 38.8951, lng: -77.0364 },
      { name: "영국 런던 사이버안보센터 (GCHQ)", code: "UK", flag: "🇬🇧", lat: 51.5074, lng: -0.1278 },
      { name: "캐나다 오타와 통신안보국", code: "CA", flag: "🇨🇦", lat: 45.4215, lng: -75.6972 }
    ],
    arcs: [
      {
        id: "arc-20261022-02a",
        startLat: 38.8951, startLng: -77.0364,
        endLat: 51.5074, endLng: -0.1278,
        sourceName: "미국 워싱턴 백악관",
        targetName: "영국 런던 GCHQ",
        sourceFlag: "🇺🇸",
        targetFlag: "🇬🇧",
        color: ["#00f0ff", "#3b82f6"],
        altitude: 0.38,
        stroke: 3.0,
        label: "대서양 사이버 집단방위 통신망",
        relationType: "사이버 상호방위 (Cyber Defense)"
      },
      {
        id: "arc-20261022-02b",
        startLat: 38.8951, startLng: -77.0364,
        endLat: 45.4215, endLng: -75.6972,
        sourceName: "미국 워싱턴 백악관",
        targetName: "캐나다 오타와 안보기구",
        sourceFlag: "🇺🇸",
        targetFlag: "🇨🇦",
        color: ["#00f0ff", "#00ff88"],
        altitude: 0.16,
        stroke: 2.6,
        label: "북미 인프라 방호선",
        relationType: "북미 인프라 협정 (Infrastructure)"
      }
    ],
    sources: [
      { name: "White House Official Release", type: "Government Official", reliability: "Official Release" },
      { name: "CISA Security Bulletin", type: "Cyber Agency", reliability: "Tier 1 Confirmed" }
    ],
    tags: ["사이버안보", "파이브아이즈", "워싱턴조약", "인프라보호"],
    tensionDelta: -6
  }
];

// Major Regional & US / Asian / European Sub-State Focus Nodes
const REGIONAL_NODES = [
  // United States States
  { id: "st-us-ca", name: "캘리포니아 (실리콘밸리)", stateCode: "CA", country: "US", flag: "🇺🇸", lat: 37.3861, lng: -122.0839, type: "tech", label: "AI & 테크 허브" },
  { id: "st-us-tx", name: "텍사스 (스타베이스 & 오스틴)", stateCode: "TX", country: "US", flag: "🇺🇸", lat: 30.2672, lng: -97.7431, type: "space", label: "우주 & 에너지 기지" },
  { id: "st-us-dc", name: "워싱턴 D.C. (백악관 & 펜타곤)", stateCode: "DC", country: "US", flag: "🇺🇸", lat: 38.8951, lng: -77.0364, type: "treaty", label: "외교·안보 사령부" },
  { id: "st-us-ny", name: "뉴욕 (유엔본부 & 월스트리트)", stateCode: "NY", country: "US", flag: "🇺🇸", lat: 40.7128, lng: -74.0060, type: "trade", label: "UN & 글로벌 금융" },
  { id: "st-us-fl", name: "플로리다 (케네디 우주센터)", stateCode: "FL", country: "US", flag: "🇺🇸", lat: 28.5383, lng: -81.3792, type: "space", label: "우주 발사지구" },

  // South Korea Regions
  { id: "st-kr-sel", name: "대한민국 서울 수도권", stateCode: "SEOUL", country: "KR", flag: "🇰🇷", lat: 37.5665, lng: 126.9780, type: "treaty", label: "동북아 외교 중심" },
  { id: "st-kr-gg", name: "대한민국 경기 반도체 메가팹", stateCode: "GG", country: "KR", flag: "🇰🇷", lat: 37.2636, lng: 127.0286, type: "trade", label: "양자 반도체 밸리" },
  { id: "st-kr-bus", name: "대한민국 부산 항만 물류", stateCode: "BUSAN", country: "KR", flag: "🇰🇷", lat: 35.1796, lng: 129.0756, type: "trade", label: "동북아 해양 물류" },

  // Japan
  { id: "st-jp-tky", name: "일본 도쿄 수도권", stateCode: "TOKYO", country: "JP", flag: "🇯🇵", lat: 35.6762, lng: 139.6503, type: "treaty", label: "동아시아 방위 사령부" },
  
  // Europe
  { id: "st-eu-bru", name: "벨기에 브뤼셀 (EU/NATO 본부)", stateCode: "BRU", country: "BE", flag: "🇪🇺", lat: 50.8503, lng: 4.3517, type: "treaty", label: "EU 집행위 & 나토" },
  { id: "st-eu-lon", name: "영국 런던 웨스트민스터", stateCode: "LON", country: "GB", flag: "🇬🇧", lat: 51.5074, lng: -0.1278, type: "trade", label: "금융 & 사이버 본부" },
  { id: "st-eu-ber", name: "독일 베를린 연방정부", stateCode: "BER", country: "DE", flag: "🇩🇪", lat: 52.5200, lng: 13.4050, type: "trade", label: "유럽 산업 코어" },

  // Taiwan
  { id: "st-tw-tpe", name: "대만 타이베이 & 신주 사이언스", stateCode: "HSIP", country: "TW", flag: "🇹🇼", lat: 25.0330, lng: 121.5654, type: "trade", label: "첨단 파운드리 코어" },

  // Middle East Strategic Straits
  { id: "st-me-hor", name: "호르무즈 해협 초계 구역", stateCode: "HOR", country: "ME", flag: "⚓", lat: 26.56, lng: 56.25, type: "conflict", label: "원유 수송 초크포인트" },
  { id: "st-me-red", name: "바브엘만데브 해협 항로", stateCode: "RED", country: "ME", flag: "⚓", lat: 12.5855, lng: 43.3364, type: "conflict", label: "홍해 남단 초크포인트" }
];

if (typeof window !== "undefined") {
  window.COUNTRY_PROFILES = COUNTRY_PROFILES;
  window.MAJOR_COUNTRY_LABELS = MAJOR_COUNTRY_LABELS;
  window.RAW_NEWS_EVENTS = RAW_NEWS_EVENTS;
  window.REGIONAL_NODES = REGIONAL_NODES;
}
