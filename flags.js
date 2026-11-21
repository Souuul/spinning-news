/**
 * SPINNING NEWS - High-Resolution Vector & CDN Flag Renderer
 * Solves Windows emoji rendering bugs by rendering crisp circular flags on any OS.
 */

const COUNTRY_META = {
  KR: { name: "대한민국", code: "kr", color: "#d80027", svgBg: "#ffffff" },
  US: { name: "미국", code: "us", color: "#0052b4", svgBg: "#d80027" },
  JP: { name: "일본", code: "jp", color: "#d80027", svgBg: "#ffffff" },
  CN: { name: "중국", code: "cn", color: "#ffda44", svgBg: "#d80027" },
  UA: { name: "우크라이나", code: "ua", color: "#ffda44", svgBg: "#0052b4" },
  RU: { name: "러시아", code: "ru", color: "#0052b4", svgBg: "#f0f0f0" },
  IR: { name: "이란", code: "ir", color: "#d80027", svgBg: "#496e2d" },
  EU: { name: "유럽연합", code: "eu", color: "#ffda44", svgBg: "#0052b4" },
  IN: { name: "인도", code: "in", color: "#ff9933", svgBg: "#138808" },
  PK: { name: "파키스탄", code: "pk", color: "#ffffff", svgBg: "#01411c" },
  TW: { name: "대만", code: "tw", color: "#0052b4", svgBg: "#d80027" },
  GB: { name: "영국", code: "gb", color: "#cf142b", svgBg: "#00247d" },
  PH: { name: "필리핀", code: "ph", color: "#fcd116", svgBg: "#0038a8" },
  BR: { name: "브라질", code: "br", color: "#fedf00", svgBg: "#009c3b" },
  AU: { name: "호주", code: "au", color: "#ffffff", svgBg: "#00008b" },
  SG: { name: "싱가포르", code: "sg", color: "#ffffff", svgBg: "#ed2939" },
  NO: { name: "노르웨이", code: "no", color: "#ffffff", svgBg: "#ba0c2f" },
  SE: { name: "스웨덴", code: "se", color: "#fecb00", svgBg: "#006aa7" },
  FI: { name: "핀란드", code: "fi", color: "#003580", svgBg: "#ffffff" },
  SD: { name: "수단", code: "sd", color: "#007229", svgBg: "#d21034" },
  YE: { name: "예멘", code: "ye", color: "#ffffff", svgBg: "#ce1126" },
  CH: { name: "스위스", code: "ch", color: "#ffffff", svgBg: "#d52b1e" },
  UN: { name: "유엔", code: "un", color: "#ffffff", svgBg: "#4b92db" },
  DE: { name: "독일", code: "de", color: "#ffce00", svgBg: "#000000" },
  FR: { name: "프랑스", code: "fr", color: "#002395", svgBg: "#ed2939" },
  CA: { name: "캐나다", code: "ca", color: "#ff0000", svgBg: "#ffffff" },
  AE: { name: "아랍에미리트", code: "ae", color: "#00732f", svgBg: "#ff0000" },
  SA: { name: "사우디아라비아", code: "sa", color: "#ffffff", svgBg: "#006c35" },
  BD: { name: "방글라데시", code: "bd", color: "#f42a41", svgBg: "#006a4e" },
  CL: { name: "칠레", code: "cl", color: "#0039a6", svgBg: "#d52b1e" },
  PE: { name: "페루", code: "pe", color: "#d91023", svgBg: "#ffffff" }
};

// Convert emoji flag to 2-letter ISO code if needed
function emojiToIsoCode(input) {
  if (!input) return "";
  if (typeof input !== "string") return String(input);
  const trimmed = input.trim();
  if (trimmed.length >= 2) {
    const c1 = trimmed.codePointAt(0);
    const c2 = trimmed.codePointAt(2);
    if (c1 >= 0x1F1E6 && c1 <= 0x1F1FF && c2 >= 0x1F1E6 && c2 <= 0x1F1FF) {
      return String.fromCharCode(c1 - 0x1F1E6 + 65) + String.fromCharCode(c2 - 0x1F1E6 + 65);
    }
  }
  return trimmed;
}

// Generates guaranteed visible circular flag HTML (CDN image with instant SVG fallback)
function getFlagHtml(rawCode, size = 26) {
  const px = Math.max(8, Math.min(64, Number(size) || 26));
  const code = rawCode ? emojiToIsoCode(rawCode) : "";
  // Codes can arrive from the public ingest API: only a 2-letter ISO code ever reaches the markup
  if (!/^[A-Za-z]{2}$/.test(code)) {
    return `<span class="flag-circle-container flag-placeholder" style="width:${px}px; height:${px}px; background:#1e293b;"></span>`;
  }
  size = px;
  const upper = code.toUpperCase();
  const lower = code.toLowerCase();
  const meta = COUNTRY_META[upper] || { name: upper, code: lower, color: "#94a3b8", svgBg: "#1e293b" };

  return `
    <span class="flag-circle-container" style="width:${size}px; height:${size}px;">
      <img 
        src="https://flagcdn.com/w80/${meta.code}.png" 
        alt="${meta.name}" 
        class="flag-circle-img"
        style="width:${size}px; height:${size}px;"
        onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'flag-fallback\\' style=\\'width:${size}px; height:${size}px; background:${meta.svgBg}; color:${meta.color};\\'>${upper.substring(0,2)}</span>';"
      />
    </span>
  `;
}
