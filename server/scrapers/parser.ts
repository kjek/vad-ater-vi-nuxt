import { getConfiguration } from '~~/server/helpers/admin-db-helper';

/* ------------------------------------------------------------------ *
 * Public types
 * ------------------------------------------------------------------ */

export interface ParsedDish {
  name: string;
  price?: string;
}

export interface ParsedDay {
  day: string | null;
  date: string | null;
  dishes: ParsedDish[];
  /** Set when the restaurant says it is closed that day ("Stängt"). */
  closed?: boolean;
}

/** Items that are not tied to a weekday, e.g. "Veckans vegetariska". */
export interface ParsedExtra {
  label: string;
  dishes: ParsedDish[];
}

export interface ParsedMenu {
  days: ParsedDay[];
  extras?: ParsedExtra[];
  /** Week number if the page states one ("Vecka 44", "v. 43"). */
  week?: number;
  /** General lunch price if the page states one ("Pris: 165 kr"). */
  price?: string;
  raw: string;
}

export interface ParseMenuOptions {
  /** Lines containing one of these words are skipped (they do not end the menu). */
  ignore?: string[];
  /** Extra words that mark the end of the menu, on top of the built-in ones. */
  stop?: string[];
}

/* ------------------------------------------------------------------ *
 * How this works (read this first)
 *
 * Scraped pages are noisy, so instead of "find the menu text" we
 *   1. turn the text into clean lines and classify every line once
 *      (day header, opening hours, contact/booking noise, price info,
 *      prose, dish, ...),
 *   2. group day headers into *blocks* (Mon -> Tue -> Wed ... in order,
 *      not interrupted by noise). Opening hours, nav menus and
 *      duplicated mobile/desktop markup become separate blocks,
 *   3. keep the block that actually contains the most dishes,
 *   4. for every day except the last one the next header is the
 *      boundary. Only the LAST day has an open end, so that is the one
 *      place where we look for "where does the menu stop": at contact /
 *      booking / hours lines, a "Pris:" footer, a horizontal rule, a
 *      heading without dishes under it, or after two lines in a row that
 *      are not dishes.
 * ------------------------------------------------------------------ */

const IGNORE_DEFAULT: string[] = [];

const MAX_TAIL_LINES = 40;
const LEADING_WINDOW = 14;
const WEEK_WINDOW = 20;
const PRICE_WINDOW = 10;

/* ------------------------------------------------------------------ *
 * Vocabulary / regular expressions
 * ------------------------------------------------------------------ */

const BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const AFTER = String.raw`(?![\p{L}\p{N}])`;

const DAY_NAMES = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'] as const;

const FULL_DAY = String.raw`(?:m[åa]ndag|tisdag|onsdag|torsdag|fredag|l[öo]rdag|s[öo]ndag)`;
const DAY_TOKEN = String.raw`(?:m[åa]ndag|tisdag|onsdag|torsdag|fredag|l[öo]rdag|s[öo]ndag|m[åa]n|tis|ons|tors|fre|l[öo]r|s[öo]n)`;

const DAY_START_RE = new RegExp(`^(${DAY_TOKEN})${AFTER}`, 'iu');
const FULL_DAY_RE = new RegExp(`${BEFORE}${FULL_DAY}${AFTER}`, 'iu');
// "Måndag - Fredag", "Måndag & Tisdag", "Mån-Fre", "Måndag till fredag"
const DAY_RANGE_RE = new RegExp(
  String.raw`^\s*(?:[-–—&,/+]|och\b|till\b|samt\b)\s*${DAY_TOKEN}${AFTER}`,
  'iu'
);

const MONTHS =
  '(?:januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)';
const NUMERIC_DATE_RE =
  /^\(?\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*\d{2,4})?(?![\d:])\s*\)?/;
const NAMED_DATE_RE = new RegExp(String.raw`^\(?\s*(\d{1,2})\s+${MONTHS}\.?${AFTER}\s*\)?`, 'iu');

// Opening hours / "kl 11-14" / "mellan 11 och 14"
const CLOCK_RE = /(?<![\d.,:])(?:[01]?\d|2[0-3])[:.][0-5]\d(?!\d|\s?(?:kr|sek)(?![\p{L}]))/iu;
const KL_RE = /(?<![\p{L}])(?:kl|klockan)\.?\s*\d/iu;
const MELLAN_RE = /(?<![\p{L}])mellan\s+(?:kl\.?\s*|klockan\s+)?\d/iu;
const RANGE_START_RE =
  /^(?:kl\.?\s*)?\d{1,2}(?:[:.]\d{2})?\s*[-–—]\s*\d{1,2}(?:[:.]\d{2})?(?!\d)/iu;

const CONTACT_RES: RegExp[] = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/u, // e-mail
  /\[email.protected\]/iu, // Cloudflare-obfuscated e-mail
  /(?:https?:\/\/|www\.)\S+/iu, // url
  /(?<![\d/.,])(?:\+46[\s\d-]{8,}|0\d{1,3}[-\s]\d{2,3}(?:\s?\d{2}){2,3})(?!\d)/u, // Swedish phone number
  /(?<!\d)\d{3}\s?\d{2}\s+\p{Lu}\p{L}+/u, // "852 30 Sundsvall"
  /©|\(c\)\s*\d{4}/iu,
];

// Matched at the START of a word, so "bokning" also hits "bokningar".
const STOP_WORDS_DEFAULT = [
  'kontakt',
  'öppet', // also catches "öppettider"
  'boka',
  'bokning',
  'beställ',
  'telefon',
  'e-post',
  'epost',
  'maila',
  'mejla',
  'sms',
  'adress',
  'org.nr',
  'orgnr',
  'följ oss',
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'nyhetsbrev',
  'prenumerera',
  'cookie',
  'integritet',
  'sekretess',
  'copyright',
  'allerg',
  'välkom', // välkommen / välkomna
  'presentkort',
  'catering',
  'konferens',
  'förfrågan',
  'sitemap',
  'skapad av',
];

// Words that open a sub-section such as "Veckans vegetariska" or "Alltid på BLOCO".
const SECTION_RE = new RegExp(
  `${BEFORE}(?:veckans|dagens|alltid|vegetarisk|vegetariskt|vegetariska|veg|vegan|veganskt|fisk|kött|sallad|salladsbuffé|soppa|buffé|förrätt|varmrätt|huvudrätt|efterrätt|dessert|extra|tillbehör|alternativ|barnmeny|husman)${AFTER}`,
  'iu'
);

const WEEK_RE = new RegExp(`${BEFORE}(?:vecka|v)\\.?\\s*(\\d{1,2})${AFTER}`, 'iu');

const PRICE_SRC = String.raw`(?<![\d.,/])\d{2,4}(?:[.,]\d{1,2})?\s?(?:(?:kr|sek)(?![\p{L}])|:-|,-|:–)`;
const PRICE_RE = new RegExp(PRICE_SRC, 'iu');
const PRICE_GLOBAL_RE = new RegExp(PRICE_SRC, 'giu');
const PRICE_LABEL_RE =
  /^(?:pris|lunchpris|pris per person|dagens lunch|veckans lunch|dagens|veckans|lunch|helglunch|buffé)$/iu;
const PRICE_FOOTER_RE = /^pris(?![\p{L}])/iu;
const PRICE_INFO_RE =
  /^(?:för|per|inkl|inklusive|ingår|pp|p\.p\.|\/|valfri|vegetarisk|med dryck)/iu;

const CLOSED_RE =
  /^(?:stängt|stängd|helgstängt|semesterstängt|ingen\s+(?:lunch|servering)|lunch\s+serveras\s+ej)(?![\p{L}])/iu;

const INCLUDED_START_RE = /^(?:allt\s+)?(?:inkl|inklusive|ingår|i\s+priset)(?![\p{L}])/iu;
const INCLUDED_WORD_RE = /(?<![\p{L}])(?:ingår|inklusive)(?![\p{L}])/iu;
const INKL_RE = /(?<![\p{L}])inkl(?![\p{L}])/iu;
const ACCOMPANIMENT_RE =
  /^(?:smör|bröd|kaffe|te|kaka|kakor|dessert|dryck|måltidsdryck|salladsbuffé|sallad|buffé|mjölk|vatten|läsk|frukt)(?![\p{L}])/iu;

const PROSE_WORD_RE = new RegExp(
  `${BEFORE}(?:vi|ni|du|dig|oss|er|ert|vår|vårt|våra|din|ditt|dina|era|välkomna?|erbjuder|erbjuds|hittar|fråga|gärna|kan|ska|skall|måste|vill)${AFTER}`,
  'iu'
);

const RULE_RE = /^(?:[-*_]\s*){3,}$/;
const EMPTY_EMPHASIS_RE = /^(?:\*\*|__)+$/;
const BULLET_RE = /^(?:[-*+•·▪●○◦‣►▸✓✔]\s+|\d{1,2}[.)]\s+)/u;
const LINK_ONLY_RE = /^(?:!?\[[^\]]*\]\([^)]*\)\s*)+$/;
const BOLD_RE = /^(?:\*\*|__)[^*_]+(?:\*\*|__)$/;

const NOT_A_DISH_START_RE = /^[–—”“"«»]/u;
const QUESTION_END_RE = /\?[”"»]?$/u;
const MENU_HEADING_RE = /lunch|meny|dagens|veckans|buffé/iu;

/* ------------------------------------------------------------------ *
 * Types used internally
 * ------------------------------------------------------------------ */

type Kind =
  | 'rule' //   * * *  /  ---
  | 'nav' //    a line that only consists of a link
  | 'day' //    Måndag [date] [dish]
  | 'hours' //   opening hours, "Måndag–Fredag ..."
  | 'stop' //    contact / booking / allergy / cookie ... : the menu is over
  | 'title' //   "Vecka 44"
  | 'price' //   "Pris: 165 kr", "Dagens lunch: 129 kr"
  | 'meta' //    "Smör, bröd, kaffe", "ingår", configured ignore words
  | 'closed' //  "Stängt"
  | 'prose' //   sentences, quotes, questions
  | 'noise'
  | 'label' //   short heading-like line ("Veckans fisk:")
  | 'weak' //    very short line that may be a dish
  | 'dish';

type DayMatch =
  | { type: 'range' }
  | { type: 'nav' }
  | { type: 'header'; index: number; date: string | null; rest: string };

interface Classified {
  kind: Kind;
  /** label that opens a menu sub-section */
  section: boolean;
  /** explicit "Pris: ..." footer line */
  footer: boolean;
  day?: Extract<DayMatch, { type: 'header' }>;
}

interface Line extends Classified {
  i: number;
  text: string;
  heading: boolean;
}

interface Flags {
  heading: boolean;
  bold: boolean;
  linkOnly: boolean;
  rule: boolean;
}

interface Ctx {
  ignoreRe: RegExp | null;
  stopRe: RegExp;
}

interface Section {
  dishes: ParsedDish[];
  closed: boolean;
  extras: ParsedExtra[];
  end: number;
}

interface BlockResult {
  days: ParsedDay[];
  extras: ParsedExtra[];
  first: number;
  end: number;
  dishCount: number;
  closedCount: number;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export async function parseMenu(text: string): Promise<ParsedMenu> {
  const [ignore, stop] = await Promise.all([
    readConfiguredList('ignored-metadata'),
    readConfiguredList('menu-stop-words'),
  ]);

  return parseMenuText(text, { ignore: ignore ?? IGNORE_DEFAULT, stop });
}

/** Pure version without database access (easy to unit test). */
export function parseMenuText(text: string, options: ParseMenuOptions = {}): ParsedMenu {
  const ctx: Ctx = {
    ignoreRe: buildWordMatcher(options.ignore ?? []),
    stopRe: buildWordMatcher([...STOP_WORDS_DEFAULT, ...(options.stop ?? [])]) ?? /(?!)/u,
  };

  const lines = toLines(text, ctx);
  const candidates = buildBlocks(lines)
    .map((headers) => extractBlock(lines, headers, ctx))
    .filter((block) => block.dishCount > 0 || block.closedCount >= 2);

  const best = pickBest(candidates);

  if (!best) {
    const dishes = findUndatedDishes(lines);
    return {
      days: dishes.length > 0 ? [{ day: null, date: null, dishes }] : [],
      extras: [],
      raw: text,
    };
  }

  const week = findWeek(lines, best.first);
  const price = findPrice(lines, best.first, best.end);

  return {
    // a weekday with neither dishes nor a "closed" notice (e.g. only a PDF link) is not useful
    days: best.days.filter((day) => day.dishes.length > 0 || day.closed),
    extras: [...readLeadingExtras(lines, best.first), ...best.extras],
    ...(week ? { week } : {}),
    ...(price ? { price } : {}),
    raw: text,
  };
}

async function readConfiguredList(key: string): Promise<string[] | undefined> {
  try {
    const configuration = await getConfiguration(key);
    const value: unknown = configuration?.value;

    return Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? (value as string[])
      : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * Step 1: text -> classified lines
 * ------------------------------------------------------------------ */

function toLines(text: string, ctx: Ctx): Line[] {
  const lines: Line[] = [];

  for (const rawLine of normalizeText(text).split('\n')) {
    const trimmed = rawLine.trim();

    if (!trimmed || EMPTY_EMPHASIS_RE.test(trimmed)) {
      continue;
    }

    const rule = RULE_RE.test(trimmed);
    const heading = /^#{1,6}\s/.test(trimmed);
    const body = trimmed.replace(/^#{1,6}\s+/, '').replace(BULLET_RE, '');
    const linkOnly = LINK_ONLY_RE.test(body);
    const bold = BOLD_RE.test(body);
    const clean = stripMarkdown(body);

    if (!rule && !clean) {
      continue;
    }

    const info = classify(rule ? trimmed : clean, { heading, bold, linkOnly, rule }, ctx);

    lines.push({ i: lines.length, text: clean, heading, ...info });
  }

  return lines;
}

function classify(text: string, flags: Flags, ctx: Ctx): Classified {
  if (flags.rule) {
    return plain('rule');
  }

  if (flags.linkOnly) {
    return plain('nav');
  }

  const day = matchDay(text);

  if (day?.type === 'nav') {
    return plain('nav');
  }

  if (day?.type === 'range') {
    return plain('hours');
  }

  if (day?.type === 'header') {
    return isHoursRest(day.rest) ? plain('hours') : { ...plain('day'), day };
  }

  if (isStopLine(text, ctx)) {
    return plain('stop');
  }

  if (isWeekTitle(text)) {
    return plain('title');
  }

  if (isPriceLine(text)) {
    return { ...plain('price'), footer: PRICE_FOOTER_RE.test(text) };
  }

  if (ctx.ignoreRe?.test(text) || isIncludedNote(text)) {
    return plain('meta');
  }

  if (CLOSED_RE.test(text)) {
    return plain('closed');
  }

  if (NOT_A_DISH_START_RE.test(text) || QUESTION_END_RE.test(text) || isProse(text)) {
    return plain('prose');
  }

  const label = labelInfo(text, flags);

  if (label) {
    return { ...plain('label'), section: label.section };
  }

  const bare = tidy(text.replace(PRICE_GLOBAL_RE, ' '));

  if (!/\p{L}{3}/u.test(bare)) {
    return plain('noise');
  }

  return plain(isWeak(bare, text) ? 'weak' : 'dish');
}

function plain(kind: Kind): Classified {
  return { kind, section: false, footer: false };
}

function matchDay(text: string): DayMatch | null {
  const match = DAY_START_RE.exec(text);
  const token = match?.[1];

  if (!token) {
    return null;
  }

  const after = text.slice(token.length);

  if (DAY_RANGE_RE.test(after)) {
    return { type: 'range' };
  }

  // Abbreviations ("Mån", "Tis") only count when followed by "." / ":" / a date,
  // otherwise a plain word like "Ons" would be taken for a header.
  if (token.length <= 4 && !/^(?:[.:]|\s+\d)/.test(after)) {
    return null;
  }

  let rest = after.replace(/^[\s:.,–—-]+/, '');
  let date: string | null = null;

  const dateMatch = matchDate(rest);

  if (dateMatch) {
    date = dateMatch.date;
    rest = rest.slice(dateMatch.length);
  }

  rest = rest.replace(/^[\s:.,–—|)-]+/, '').trim();

  // "Måndag Tisdag Onsdag ..." is a tab bar, not a header
  if (FULL_DAY_RE.test(rest)) {
    return { type: 'nav' };
  }

  return { type: 'header', index: dayIndex(token), date, rest };
}

function matchDate(rest: string): { date: string; length: number } | null {
  const numeric = NUMERIC_DATE_RE.exec(rest);

  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { date: numeric[0].replace(/[()]/g, '').trim(), length: numeric[0].length };
    }
  }

  const named = NAMED_DATE_RE.exec(rest);

  if (named) {
    const day = Number(named[1]);

    if (day >= 1 && day <= 31) {
      return { date: named[0].replace(/[()]/g, '').trim(), length: named[0].length };
    }
  }

  return null;
}

function dayIndex(token: string): number {
  const t = token.toLowerCase();

  if (t.startsWith('mån') || t.startsWith('man')) return 0;
  if (t.startsWith('tis')) return 1;
  if (t.startsWith('ons')) return 2;
  if (t.startsWith('tor')) return 3;
  if (t.startsWith('fre')) return 4;
  if (t.startsWith('lör') || t.startsWith('lor')) return 5;

  return 6;
}

function isHoursLine(text: string): boolean {
  return CLOCK_RE.test(text) || KL_RE.test(text) || MELLAN_RE.test(text);
}

function isHoursRest(rest: string): boolean {
  return isHoursLine(rest) || RANGE_START_RE.test(rest);
}

function isStopLine(text: string, ctx: Ctx): boolean {
  return isHoursLine(text) || CONTACT_RES.some((re) => re.test(text)) || ctx.stopRe.test(text);
}

function weekOf(text: string): number | undefined {
  const week = Number(WEEK_RE.exec(text)?.[1]);

  return week >= 1 && week <= 53 ? week : undefined;
}

function isWeekTitle(text: string): boolean {
  return weekOf(text) !== undefined && wordCount(text) <= 10 && !text.includes(',');
}

function isPriceLine(text: string): boolean {
  const match = PRICE_RE.exec(text);

  if (!match) {
    return false;
  }

  const before = trimSeparators(text.slice(0, match.index));
  const after = trimSeparators(text.slice(match.index + match[0].length));

  // "128 kr"  /  "139:- För valfri lunch inkl. ..."
  if (!before) {
    return !after || PRICE_INFO_RE.test(after);
  }

  // "Pris: 165 kr"  /  "Dagens lunch: 129 kr"
  if (after && !PRICE_INFO_RE.test(after)) {
    return false;
  }

  return PRICE_LABEL_RE.test(before) || PRICE_FOOTER_RE.test(before);
}

function isIncludedNote(text: string): boolean {
  if (INCLUDED_START_RE.test(text) || INCLUDED_WORD_RE.test(text)) {
    return true;
  }

  const hits = (parts: string[]) => parts.filter((part) => ACCOMPANIMENT_RE.test(part)).length;

  if (INKL_RE.test(text) && hits(text.split(/[\s,/&+]+/)) >= 2) {
    return true;
  }

  // "Smör, bröd, salladsbuffé, kaffe, kaka/dessert"
  const items = text
    .split(/\s*(?:[,/&+]|\soch\s)\s*/iu)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    items.length >= 3 &&
    items.every((item) => wordCount(item) <= 2) &&
    hits(items) >= 3 &&
    hits(items) >= items.length / 2
  );
}

function isProse(text: string): boolean {
  const words = wordCount(text);

  if (text.length > 260 || words > 30) {
    return true;
  }

  if (/[.!?]\s+\p{Lu}/u.test(text)) {
    return true;
  }

  return words >= 3 && PROSE_WORD_RE.test(text);
}

function labelInfo(text: string, flags: Flags): { section: boolean } | null {
  const words = wordCount(text);

  if (words > 4 || text.length > 40) {
    return null;
  }

  if (/[,;]/.test(text) || /:\s*\S/.test(text) || text.endsWith('.')) {
    return null;
  }

  const section = SECTION_RE.test(text);
  const upper = text === text.toUpperCase() && /\p{L}{2}/u.test(text);
  const shaped = flags.heading || flags.bold || text.endsWith(':') || upper;

  return shaped || (section && words >= 2) ? { section } : null;
}

function isWeak(bare: string, original: string): boolean {
  return wordCount(bare) <= 2 && bare.length < 16 && !/[,&]/.test(bare) && !PRICE_RE.test(original);
}

/* ------------------------------------------------------------------ *
 * Step 2: day headers -> blocks
 * ------------------------------------------------------------------ */

function buildBlocks(lines: Line[]): number[][] {
  const blocks: number[][] = [];
  let current: number[] = [];
  let previous: Line | undefined;

  for (const line of lines) {
    if (line.kind !== 'day' || !line.day) {
      continue;
    }

    if (previous?.day && current.length > 0) {
      const inOrder = line.day.index > previous.day.index;

      if (!inOrder || hasBarrier(lines, previous.i, line.i)) {
        blocks.push(current);
        current = [];
      }
    }

    current.push(line.i);
    previous = line;
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  return blocks;
}

/** Contact info, opening hours or a "Vecka 45" title between two headers means a different part of the page. */
function hasBarrier(lines: Line[], from: number, to: number): boolean {
  for (let k = from + 1; k < to; k++) {
    const kind = lines[k]?.kind;

    if (kind === 'stop' || kind === 'hours' || kind === 'title') {
      return true;
    }
  }

  return false;
}

function pickBest(blocks: BlockResult[]): BlockResult | undefined {
  let best: BlockResult | undefined;

  for (const block of blocks) {
    if (
      !best ||
      block.dishCount > best.dishCount ||
      (block.dishCount === best.dishCount && block.days.length > best.days.length)
    ) {
      best = block;
    }
  }

  return best;
}

/* ------------------------------------------------------------------ *
 * Step 3: read the days of one block
 * ------------------------------------------------------------------ */

function extractBlock(lines: Line[], headers: number[], ctx: Ctx): BlockResult {
  const days: ParsedDay[] = [];
  let extras: ParsedExtra[] = [];
  let end = headers.at(-1) ?? 0;

  headers.forEach((index, k) => {
    const header = lines[index];

    if (!header?.day) {
      return;
    }

    const inline = header.day.rest ? makeLine(header.day.rest, ctx) : undefined;
    const next = headers[k + 1];

    let section: Section;

    if (next === undefined) {
      section = readTail(lines, index + 1, inline);
      extras = section.extras;
      end = section.end;
    } else {
      section = readBounded(lines, index + 1, next, inline);
    }

    days.push({
      day: DAY_NAMES[header.day.index] ?? null,
      date: header.day.date,
      dishes: section.dishes,
      ...(section.closed ? { closed: true } : {}),
    });
  });

  return {
    days,
    extras,
    first: headers[0] ?? 0,
    end,
    dishCount: days.reduce((sum, day) => sum + day.dishes.length, 0),
    closedCount: days.filter((day) => day.closed).length,
  };
}

function makeLine(text: string, ctx: Ctx): Line {
  const clean = stripMarkdown(text);

  return {
    i: -1,
    text: clean,
    heading: false,
    ...classify(clean, { heading: false, bold: false, linkOnly: false, rule: false }, ctx),
  };
}

/** A day that is followed by another header: everything in between belongs to it. */
function readBounded(lines: Line[], from: number, to: number, inline?: Line): Section {
  const dishes: ParsedDish[] = [];
  let closed = false;
  const items: Line[] = inline ? [inline] : [];

  for (let j = from; j < to; j++) {
    const line = lines[j];

    if (line) {
      items.push(line);
    }
  }

  for (const line of items) {
    if (line.kind === 'closed') {
      closed = true;
    } else if (isDishLike(line)) {
      pushDish(dishes, line.text);
    }
  }

  return { dishes, closed: closed && dishes.length === 0, extras: [], end: to };
}

function isDishLike(line: Line): boolean {
  switch (line.kind) {
    case 'dish':
    case 'weak':
      return true;
    case 'label':
      return !line.section && !line.heading;
    default:
      return false;
  }
}

/**
 * The last day has no following header, so this is where a menu "ends".
 * Everything after the real menu (booking, contact, VIP menus, footers...)
 * would otherwise end up on that day.
 */
function readTail(lines: Line[], from: number, inline?: Line): Section {
  const dishes: ParsedDish[] = [];
  const extras: ParsedExtra[] = [];
  let group: ParsedExtra | undefined;
  let closed = false;
  let misses = 0;
  let lastAccepted = from - 1;
  let end = from - 1;

  if (inline?.kind === 'closed') {
    closed = true;
  } else if (inline && isDishLike(inline)) {
    pushDish(dishes, inline.text);
  }

  for (let j = from; j < lines.length && j - from < MAX_TAIL_LINES; j++) {
    const line = lines[j];

    if (!line) {
      break;
    }

    // Hard end: contact / booking / hours / next header / next week
    if (
      line.kind === 'stop' ||
      line.kind === 'hours' ||
      line.kind === 'day' ||
      line.kind === 'title'
    ) {
      break;
    }

    end = j;

    if (line.kind === 'rule') {
      if (dishes.length > 0 || closed || group) {
        break;
      }

      continue;
    }

    if (line.kind === 'price') {
      // "Pris: 165 kr" after the dishes is the footer of the menu
      if (line.footer && (dishes.length > 0 || group)) {
        break;
      }

      continue;
    }

    if (line.kind === 'closed') {
      closed = true;
      lastAccepted = j;
      misses = 0;
      continue;
    }

    if (line.kind === 'label') {
      const opensGroup = line.section || (line.heading && lines[j + 1]?.kind === 'dish');

      if (opensGroup) {
        group = { label: labelText(line.text), dishes: [] };
        extras.push(group);
        lastAccepted = j;
        misses = 0;
        continue;
      }

      // a heading with no dishes below it starts something else on the page
      if (line.heading) {
        break;
      }
    }

    const adjacent = lastAccepted === j - 1;

    if (line.kind === 'dish' || ((line.kind === 'weak' || line.kind === 'label') && adjacent)) {
      pushDish(group ? group.dishes : dishes, line.text);
      lastAccepted = j;
      misses = 0;
      continue;
    }

    misses++;

    if (misses >= 2) {
      break;
    }
  }

  return {
    dishes,
    closed: closed && dishes.length === 0,
    extras: extras.filter((extra) => extra.dishes.length > 0),
    end,
  };
}

/** "Veckans sallad / fisk / vegetariska" placed above the first weekday. */
function readLeadingExtras(lines: Line[], first: number): ParsedExtra[] {
  const extras: ParsedExtra[] = [];
  let pending: ParsedDish[] = [];

  for (let j = first - 1; j >= 0 && first - j <= LEADING_WINDOW; j--) {
    const line = lines[j];

    if (!line) {
      break;
    }

    if (line.kind === 'price' || line.kind === 'meta' || line.kind === 'closed') {
      continue;
    }

    if (line.kind === 'label' && line.section) {
      if (pending.length > 0) {
        extras.unshift({ label: labelText(line.text), dishes: pending });
      }

      pending = [];
      continue;
    }

    if (line.kind === 'dish' || line.kind === 'weak' || line.kind === 'label') {
      const dish = parseDish(line.text);

      if (dish) {
        pending.unshift(dish);
      }

      continue;
    }

    break;
  }

  return extras;
}

/* ------------------------------------------------------------------ *
 * Week / price / fallback
 * ------------------------------------------------------------------ */

function findWeek(lines: Line[], first: number): number | undefined {
  for (let j = first; j >= 0 && first - j <= WEEK_WINDOW; j--) {
    const week = weekOf(lines[j]?.text ?? '');

    if (week) {
      return week;
    }
  }

  return undefined;
}

function findPrice(lines: Line[], first: number, end: number): string | undefined {
  const from = Math.max(0, first - PRICE_WINDOW);
  const to = Math.min(lines.length - 1, end + PRICE_WINDOW);

  for (let j = from; j <= to; j++) {
    const line = lines[j];

    if (!line) {
      continue;
    }

    const isPriceInfo =
      line.kind === 'price' || (line.kind === 'hours' && /(?<![\p{L}])pris/iu.test(line.text));

    if (isPriceInfo) {
      const price = extractPrice(line.text);

      if (price) {
        return price;
      }
    }
  }

  return undefined;
}

/** No weekdays on the page: pick the densest run of dish lines (under a "lunch"/"meny" heading if possible). */
function findUndatedDishes(lines: Line[]): ParsedDish[] {
  let best: { dishes: ParsedDish[]; score: number } | undefined;
  let run: ParsedDish[] = [];
  let runUnderHeading = false;
  let pendingHeading = false;

  const flush = () => {
    const score = run.length + (runUnderHeading ? 3 : 0);

    if (
      (run.length >= 2 || (runUnderHeading && run.length >= 1)) &&
      (!best || score > best.score)
    ) {
      best = { dishes: run, score };
    }

    run = [];
    runUnderHeading = false;
  };

  for (const line of lines) {
    switch (line.kind) {
      case 'dish': {
        const dish = parseDish(line.text);

        if (dish) {
          if (run.length === 0) {
            runUnderHeading = pendingHeading;
          }

          run.push(dish);
        }

        break;
      }
      case 'price':
      case 'meta':
      case 'weak':
      case 'noise':
        break;
      case 'label':
        flush();
        pendingHeading = MENU_HEADING_RE.test(line.text);
        break;
      default:
        flush();
        pendingHeading = false;
    }
  }

  flush();

  return best?.dishes ?? [];
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function parseDish(text: string): ParsedDish | null {
  const price = extractPrice(text);
  const name = tidy(text.replace(PRICE_GLOBAL_RE, ' '));

  if (!/\p{L}{2}/u.test(name)) {
    return null;
  }

  return price ? { name, price } : { name };
}

function pushDish(list: ParsedDish[], text: string) {
  const dish = parseDish(text);

  if (dish && !list.some((existing) => existing.name.toLowerCase() === dish.name.toLowerCase())) {
    list.push(dish);
  }
}

function extractPrice(text: string): string | undefined {
  return PRICE_RE.exec(text)?.[0].trim();
}

function labelText(text: string): string {
  const clean = text.replace(/[\s:!.-]+$/u, '').trim();

  return clean === clean.toUpperCase()
    ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()
    : clean;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|,;.•·=]+|[\s\-–—:|,;.!=]+$/gu, '')
    .trim();
}

function trimSeparators(text: string): string {
  return text.replace(/^[\s:–—\-|,.=]+|[\s:–—\-|,.=]+$/gu, '');
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/(?:\*\*|__)/g, '')
    .replace(/\\([*_#[\]()])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/(?:\u00AD|\u200B|\u200C|\u200D|\u2060|\uFEFF)/g, '')
    .replace(/[\u00A0\u2007\u202F\t]/g, ' ');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive matcher; word-like entries match at the start of a word ("bröllop" hits "bröllopsmat"). */
function buildWordMatcher(words: readonly string[]): RegExp | null {
  const parts = words
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => {
      const body = escapeRegex(word);

      return /^[\p{L}\p{N}]/u.test(word) ? `${BEFORE}${body}` : body;
    });

  return parts.length > 0 ? new RegExp(parts.join('|'), 'iu') : null;
}
