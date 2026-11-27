// Local-language names and addresses (Japanese, Chinese, Korean) for showing a taxi driver or a local.
// Everything here is plain text handling: nothing is ever translated, only copied from what was found.
import type { LocalText } from './types';

export type LocalLang = 'ja' | 'zh-Hant' | 'ko';
export const LANG_LABEL: Record<LocalLang, string> = { ja: '日本語', 'zh-Hant': '繁體中文', ko: '한국어' };

/** What the full-screen "Show local" card shows. */
export interface LocalCardData {
  name?: string;
  address?: string;
  /** The English name, shown small underneath. */
  english: string;
  phone?: string;
  lang?: LocalLang;
}

/** Card data for a place with local text (undefined if it has none, so no 文 button shows). */
export function cardFor(english: string, local: LocalText | undefined, opts: { phone?: string; pos?: { lat: number; lng: number } | null; context?: string } = {}): LocalCardData | undefined {
  if (!hasLocal(local)) return undefined;
  return { name: local.name, address: local.address, english, ...(opts.phone ? { phone: opts.phone } : {}), lang: langForPlace(opts.pos, `${english} ${opts.context || ''}`) };
}

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ｦ-ﾟ]/;
const KANA = /[぀-ヿｦ-ﾟ]/;
const HANGUL = /[가-힯]/;
export const hasCjk = (s?: string) => !!s && CJK.test(s);

export const hasLocal = (l?: LocalText): l is LocalText => !!(l && (l.name?.trim() || l.address?.trim()));

/** Trimmed local text from two fields, or undefined when both are empty. */
export function toLocal(name?: string, address?: string): LocalText | undefined {
  const n = (name || '').trim(), a = (address || '').trim().replace(/[ \t]*\n[ \t]*/g, ' ');
  if (!n && !a) return undefined;
  return { ...(n ? { name: n } : {}), ...(a ? { address: a } : {}) };
}

// Characters only one of Japanese or Traditional Chinese uses (simplified Japanese forms vs traditional ones).
const JA_ONLY = /[県区駅号丁沢広竜湾楼鉄様込辺栄桜釧]/g;
const ZH_ONLY = /[號區樓灣龍廣臺鐵邨廈站舖鋪滙匯]/g;
const HK_WORDS = /hong kong|kowloon|new territories|tsim sha tsui|mong kok|wan chai|causeway bay|central,|sheung wan|lantau|sha tin|tsuen wan|macau|macao|taipei|taiwan|香港|九龍|新界|澳門|台北|臺北/i;

/** Which language a piece of local text is in (decides the font style), with a hint for Chinese characters alone. */
export function guessLang(text: string, hint?: LocalLang): LocalLang {
  if (KANA.test(text) || text.includes('〒')) return 'ja';
  if (HANGUL.test(text)) return 'ko';
  const ja = (text.match(JA_ONLY) || []).length, zh = (text.match(ZH_ONLY) || []).length;
  if (ja !== zh) return ja > zh ? 'ja' : 'zh-Hant';
  return hint ?? 'ja';
}

const inBox = (p: { lat: number; lng: number }, s: number, n: number, w: number, e: number) => p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e;
/** The local language at a map position, or from words like "Hong Kong" in the place's English text. */
export function langForPlace(pos: { lat: number; lng: number } | null | undefined, text = ''): LocalLang {
  if (pos) {
    if (inBox(pos, 22.1, 22.6, 113.5, 114.5) || inBox(pos, 21.8, 25.4, 119.9, 122.1)) return 'zh-Hant'; // Hong Kong, Macau, Taiwan
    if (inBox(pos, 33.0, 38.7, 124.5, 130.0)) return 'ko';
    if (inBox(pos, 24.0, 46.0, 122.9, 146.0)) return 'ja';
  }
  if (HK_WORDS.test(text)) return 'zh-Hant';
  if (/korea|seoul|busan|한국|서울/i.test(text)) return 'ko';
  return 'ja';
}

/** For Chinese, OpenStreetMap often holds "香港站 Hong Kong Station": keep the Chinese words only. */
function chineseOnly(s: string): string {
  if (!hasCjk(s) || !/[A-Za-z]{3,}/.test(s)) return s;
  return s.split(/\s+/).filter((t) => hasCjk(t) || /^[\d\-–/]+[號号]?$/.test(t)).join(' ') || s;
}
/** Join address parts: no space between Japanese/Chinese parts, a space between Latin words or numbers. */
function joinParts(parts: string[]): string {
  let out = '';
  for (const p of parts) {
    if (out && /[A-Za-z0-9.]$/.test(out) && /^[A-Za-z0-9]/.test(p)) out += ' ';
    else if (out && !hasCjk(out.slice(-1)) && !hasCjk(p[0]) && !/[\s-]$/.test(out)) out += ' ';
    out += p;
  }
  return out;
}

export interface NominatimResult {
  name?: string; display_name?: string;
  address?: Record<string, string>; namedetails?: Record<string, string>;
}
/**
 * A place's local name and address from an OpenStreetMap (Nominatim) result fetched with accept-language
 * set to the local language. Names only count if they are written in the local script.
 */
export function localFromNominatim(r: NominatimResult, lang: LocalLang): LocalText | undefined {
  const nd = r.namedetails || {};
  const cands = lang === 'zh-Hant'
    ? [nd['name:zh-Hant'], nd['name:zh_TW'], nd['name:zh-HK'], nd['name:zh'], nd.name, r.name]
    : [nd[`name:${lang}`], nd.name, r.name];
  let name = cands.find((c) => hasCjk(c)) || '';
  if (lang === 'zh-Hant') name = chineseOnly(name);
  const a = r.address || {};
  let parts = (r.display_name || '').split(/,\s*/).map((p) => p.trim()).filter(Boolean);
  const drop = new Set([r.name, nd.name, name, a.country, a.postcode, a.country_code].filter(Boolean).map((x) => x!.trim()));
  if (parts.length && (drop.has(parts[0]) || (name && parts[0] === name))) parts = parts.slice(1);
  parts = parts.filter((p) => !drop.has(p) && !/^\d{3}-?\d{4}$/.test(p) && !/^(日本|中国|中國|대한민국|Japan|China)$/i.test(p));
  if (lang === 'zh-Hant') parts = parts.map(chineseOnly);
  parts.reverse();
  let address = joinParts(parts);
  if (lang === 'ja' && a.postcode && address) address = `〒${a.postcode} ${address}`;
  if (!hasCjk(address)) address = '';
  return toLocal(name, address);
}

/**
 * Split local text into pieces that should stay together when the line wraps: words, and in Japanese and
 * Chinese addresses the prefecture, county, city and ward, the street, and the numbers.
 */
export function wrapPieces(text: string): string[] {
  const out: string[] = [];
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if (/^\s+$/.test(word) || !hasCjk(word)) { out.push(word); continue; }
    let rest = word;
    const pref = rest.match(/^(〒?\d{3}-?\d{4})?(東京都|北海道|京都府|大阪府|[^\s\d〒]{2,3}?県)/);
    if (pref) { out.push(pref[0]); rest = rest.slice(pref[0].length); }
    // Break after units of an address (county, city, ward; street words in Chinese), and before the numbers.
    rest.split(/(?:(?<=[郡市区區])|(?<=[^郡市区區\d][道街路]))(?=[^\d\-－０-９号號丁目番地]{2})|(?<=[^\d\-－０-９])(?=[\d０-９]+(?:[\-－丁番号號]|$))/).forEach((p) => p && out.push(p));
  }
  return out;
}

// ---------- local text in booking emails (copied only, never translated) ----------
/** Text compared without spaces and with full-width letters/digits made plain, to check something was copied. */
const squash = (s: string) => s.normalize('NFKC').replace(/[‐‑‒–—―−]/g, '-').replace(/\s+/g, '');
export const copiedFrom = (value: string, text: string) => !!value && squash(text).includes(squash(value));

const ADDR_LABEL = /^(?:住所|所在地|アドレス|地址|Address(?: \((?:Japanese|local)\))?)\s*[:：]?\s*/i;
/** A Japanese or Hong Kong street address in the email text ("〒048-1711 北海道…", "香港九龍尖沙咀彌敦道20號"). */
export function findLocalAddress(text: string): string | undefined {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i].replace(ADDR_LABEL, '');
    const zip = l.match(/〒\s*\d{3}-?\d{4}/);
    if (zip) {
      l = l.slice(zip.index);
      if (!hasCjk(l.replace(/^〒/, '')) && hasCjk(lines[i + 1] || '')) l = `${l} ${lines[i + 1].replace(ADDR_LABEL, '')}`;
      return l.replace(/\s+/g, ' ').slice(0, 160).trim();
    }
    const m = l.match(/(?:東京都|北海道|京都府|大阪府|[^\s\d:：]{2,3}県)[^\n]{3,}?[\d０-９]/) || l.match(/(?:香港|九龍|新界)[^\n]{2,}?[道街路][^\n]*?[\d０-９]+\s*[號号]/);
    if (m && hasCjk(m[0])) return l.slice(m.index).replace(/\s+/g, ' ').slice(0, 160).trim();
  }
  return undefined;
}
const NAME_LABEL = /^(?:施設名|ホテル名|宿泊施設名?|宿名|店名|店舗名|レストラン名|会場名?|酒店名稱|酒店|餐廳名稱|餐廳)\s*[:：]\s*(.+)$/;
/** A local name written after a label like "施設名：" or "店名：". */
export function findLocalName(text: string): string | undefined {
  for (const l of text.split(/\n/)) {
    const m = l.trim().match(NAME_LABEL);
    if (m && hasCjk(m[1])) return m[1].trim().slice(0, 80);
  }
  return undefined;
}
/** A phone number written after "Tel", "Phone" or "電話". */
export function findPhone(text: string): string | undefined {
  const m = text.match(/(?:\btel(?:ephone)?\b|\bphone\b|電話(?:番号)?|TEL)\s*(?:number|no\.?)?\s*[.:：]?\s*(\+?[\d(（][\d\s\-－()（）]{6,18}\d)/i);
  return m ? cleanPhone(m[1]) : undefined;
}
/** A phone number as digits, spaces, "+", "-" and brackets; undefined if it isn't one. */
export function cleanPhone(v: unknown): string | undefined {
  const s = String(v ?? '').normalize('NFKC').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/\s+/g, ' ').trim();
  const digits = s.replace(/\D/g, '');
  return /^\+?[\d\s\-()]+$/.test(s) && digits.length >= 6 && digits.length <= 16 ? s : undefined;
}
/** For tel: links. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
