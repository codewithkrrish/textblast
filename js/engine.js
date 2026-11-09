/* TextBlast — pure text-repeating logic. No DOM, no clipboard, no storage
   access: every function here is a plain function of its arguments, so it
   can be unit-tested in Node. The DOM layer (main.js) owns the inputs, the
   preview rendering, the clipboard and localStorage; this module owns the
   repeat maths, the output assembly and the counting.

   One deliberate choice: the output is built by joining an array of
   per-repeat pieces. That is the fastest honest way to repeat a string
   100,000 times in JS (a naive += loop on a long string is quadratic-ish
   in practice), and it keeps memory at exactly one copy of the result. */

export const MAX_COUNT = 100000;
export const MIN_COUNT = 1;
export const DEFAULT_COUNT = 10;
export const PREVIEW_LIMIT = 2000;
export const SETTINGS_KEY = "textblast:settings:v1";

export const SEPARATOR_KEYS = ["space", "newline", "comma", "custom", "none"];
export const SEPARATOR_LABELS = {
  space: "Space",
  newline: "New line",
  comma: "Comma",
  custom: "Custom",
  none: "None",
};
export const NUMBERING_STYLES = ["none", "dot", "paren", "bracket"];
export const NUMBERING_LABELS = {
  none: "No numbering",
  dot: "1.  2.  3.",
  paren: "1)  2)  3)",
  bracket: "[1]  [2]  [3]",
};

export const DEFAULT_SETTINGS = {
  count: DEFAULT_COUNT,
  separator: "space",
  customSeparator: ", ",
  numbering: "none",
  prefix: "",
  suffix: "",
};

/**
 * Clamp a repeat count to the supported range 1..100,000.
 * Accepts numbers, numeric strings, or anything else: non-numeric input
 * falls back to 1, fractions are floored, values outside the range clamp.
 * Never returns NaN, Infinity, 0 or a negative number.
 */
export function clampCount(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return MIN_COUNT;
  const floored = Math.floor(n);
  if (floored < MIN_COUNT) return MIN_COUNT;
  if (floored > MAX_COUNT) return MAX_COUNT;
  return floored;
}

/**
 * Resolve a separator key to the actual string used between repeats.
 * "custom" uses the caller-supplied string verbatim (including empty,
 * which behaves like "none"); unknown keys fall back to a single space.
 */
export function resolveSeparator(separator, customSeparator = "") {
  switch (separator) {
    case "space": return " ";
    case "newline": return "\n";
    case "comma": return ", ";
    case "custom": return typeof customSeparator === "string" ? customSeparator : "";
    case "none": return "";
    default: return " ";
  }
}

/**
 * Format the number label for repeat `index` (1-based) in a given style.
 * "none" returns "" (no label at all). The label is a prefix on the repeat:
 * numbering, then the per-repeat prefix, then the text, then the suffix.
 */
export function formatNumber(index, style) {
  const n = Math.max(1, Math.floor(index));
  switch (style) {
    case "dot": return `${n}. `;
    case "paren": return `${n}) `;
    case "bracket": return `[${n}] `;
    case "none":
    default: return "";
  }
}

/** Length in characters of the number label for repeat `index`. */
export function numberLabelLength(index, style) {
  return formatNumber(index, style).length;
}

/**
 * Build one repeat piece: numbering label + prefix + text + suffix.
 * `text` is used verbatim — no trimming, no case changes. (buildOutput
 * short-circuits an empty text to an empty output before calling this,
 * so the empty-text case never reaches here.)
 */
export function buildPiece(text, index, settings) {
  const numbering = settings.numbering || "none";
  const prefix = typeof settings.prefix === "string" ? settings.prefix : "";
  const suffix = typeof settings.suffix === "string" ? settings.suffix : "";
  return `${formatNumber(index, numbering)}${prefix}${text}${suffix}`;
}

/**
 * Build the full repeated output.
 * `settings` is { count, separator, customSeparator, numbering, prefix, suffix }.
 * The count is clamped (1..100,000) before building, and the clamped count
 * is returned alongside the string so the UI can show what actually happened.
 */
export function buildOutput(text, settings) {
  const s = normalizeSettings(settings);
  const safeText = typeof text === "string" ? text : "";
  const sep = resolveSeparator(s.separator, s.customSeparator);
  // Repeating nothing is nothing: an empty input always yields an empty
  // output, whatever the numbering/prefix/suffix settings say. Without
  // this, 10 empty repeats joined by spaces would report "9 characters"
  // on an empty text box — technically what join() does, but confusing.
  if (safeText === "") return { output: "", count: s.count, separator: sep };
  const pieces = new Array(s.count);
  for (let i = 0; i < s.count; i += 1) {
    pieces[i] = buildPiece(safeText, i + 1, s);
  }
  return { output: pieces.join(sep), count: s.count, separator: sep };
}

/**
 * Estimate the result size WITHOUT building the string — used for the live
 * "estimated output" readout before the user copies or downloads.
 * Returns { chars, bytes, words, lines }: chars is exact (the same number
 * buildOutput would produce), bytes is the exact UTF-8 length, words/lines
 * are counted on the same structure (separator words/lines included).
 * Numbering labels are pure ASCII, so their byte length equals their char
 * length; text/prefix/suffix/separator bytes are measured once with
 * TextEncoder and multiplied.
 */
export function estimateOutput(text, settings) {
  const s = normalizeSettings(settings);
  const safeText = typeof text === "string" ? text : "";
  // Matches buildOutput: empty input estimates to zero across the board.
  if (safeText === "") return { chars: 0, bytes: 0, words: 0, lines: 0, count: s.count };
  const sep = resolveSeparator(s.separator, s.customSeparator);
  const enc = new TextEncoder();
  const pieceChars = safeText.length + s.prefix.length + s.suffix.length;
  const pieceBytes = enc.encode(safeText + s.prefix + s.suffix).length;
  const sepBytes = enc.encode(sep).length;

  // Numbering labels grow with the digit count: repeats 1..9 are 1 digit,
  // 10..99 are 2, and so on. Sum them exactly instead of approximating.
  let numberingChars = 0;
  if (s.numbering !== "none") {
    // ". " and ") " add 2 chars around the digits; "[ ] " adds 3.
    const extra = s.numbering === "bracket" ? 3 : 2;
    let remaining = s.count;
    let digits = 1;
    let block = 9;
    while (remaining > 0) {
      const inBlock = Math.min(remaining, block);
      numberingChars += inBlock * (digits + extra);
      remaining -= inBlock;
      digits += 1;
      block *= 10;
    }
  }

  const chars = s.count * pieceChars + numberingChars + (s.count - 1) * sep.length;
  const bytes = s.count * pieceBytes + numberingChars + (s.count - 1) * sepBytes;

  // Words/lines of the result: the result is count copies of the text joined
  // by the separator, so count them structurally instead of building it.
  // Words inside one piece (text + prefix + suffix, numbering is one token
  // when present) plus words contributed by a separator that contains
  // whitespace boundaries — measured by counting the words in one join.
  const pieceWords = countWords(`${formatNumber(1, s.numbering)}${s.prefix}${safeText}${s.suffix}`);
  // Joining two pieces can merge the words at the boundary (e.g. a space
  // separator keeps them separate, a "none" separator merges them). The
  // exact count: words in (piece + sep + piece) minus the words in one
  // piece, times the joins, plus one piece — computed on a two-piece sample.
  const twoPieceWords = countWords(
    `${formatNumber(1, s.numbering)}${s.prefix}${safeText}${s.suffix}${sep}${formatNumber(2, s.numbering)}${s.prefix}${safeText}${s.suffix}`,
  );
  const words = s.count <= 1 ? pieceWords : pieceWords + (s.count - 1) * (twoPieceWords - pieceWords);
  const lines = countLinesOfResult(safeText, s, sep);

  return { chars, bytes, words, lines, count: s.count };
}

/** Lines in the result, counted structurally (no string built). */
function countLinesOfResult(text, settings, sep) {
  // Newlines inside one piece + newlines inside the separator, times joins.
  const pieceLines = countLines(`${formatNumber(1, settings.numbering)}${settings.prefix}${text}${settings.suffix}`);
  const sepLines = countLines(sep);
  // A newline at the very end of a piece followed by a newline at the start
  // of the separator (or vice versa) still counts as two line breaks, so the
  // simple sum is exact: every newline character is one line break.
  const pieceNewlines = pieceLines - 1;
  const sepNewlines = sepLines - 1;
  return 1 + settings.count * pieceNewlines + (settings.count - 1) * sepNewlines;
}

/** Word count of a text (words = whitespace-separated tokens). */
export function countWords(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Line count of a text (1 for a non-empty string with no newlines). */
export function countLines(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  return text.split("\n").length;
}

/** Character count of a text (UTF-16 code units, same as .length). */
export function countChars(text) {
  return typeof text === "string" ? text.length : 0;
}

/** UTF-8 byte length of a text. */
export function byteLength(text) {
  return typeof text === "string" ? new TextEncoder().encode(text).length : 0;
}

/** Human-readable byte size: "842 B", "12.4 KB", "3.1 MB". Never NaN. */
export function formatBytes(bytes) {
  const n = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${trimNumber(n / 1024)} KB`;
  return `${trimNumber(n / (1024 * 1024))} MB`;
}

function trimNumber(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Stats for an already-built result string: chars, words, lines, bytes. */
export function resultStats(output) {
  const text = typeof output === "string" ? output : "";
  return {
    chars: text.length,
    words: countWords(text),
    lines: countLines(text),
    bytes: byteLength(text),
  };
}

/** Stats for the input textarea: chars and words. */
export function inputStats(text) {
  const safe = typeof text === "string" ? text : "";
  return { chars: safe.length, words: countWords(safe), lines: countLines(safe) };
}

/**
 * Is the output too big to render in full? The preview shows the first
 * PREVIEW_LIMIT characters with a "show full" toggle once the output
 * passes this limit.
 */
export function needsTruncation(outputLength) {
  return outputLength > PREVIEW_LIMIT;
}

/** The preview slice of an output (first PREVIEW_LIMIT chars, or all of it). */
export function previewSlice(output) {
  const text = typeof output === "string" ? output : "";
  return text.length > PREVIEW_LIMIT ? text.slice(0, PREVIEW_LIMIT) : text;
}

/* --- Settings (plain JSON; main.js owns the localStorage calls) --- */

/**
 * Merge a partial settings object onto the defaults. Unknown separator /
 * numbering values fall back to their defaults instead of breaking the
 * build, and the count is clamped. The text itself is never part of
 * settings — it is not saved.
 */
export function normalizeSettings(input) {
  const raw = input && typeof input === "object" ? input : {};
  const separator = SEPARATOR_KEYS.includes(raw.separator) ? raw.separator : DEFAULT_SETTINGS.separator;
  const numbering = NUMBERING_STYLES.includes(raw.numbering) ? raw.numbering : DEFAULT_SETTINGS.numbering;
  return {
    count: clampCount(raw.count === undefined ? DEFAULT_SETTINGS.count : raw.count),
    separator,
    customSeparator: typeof raw.customSeparator === "string" ? raw.customSeparator : DEFAULT_SETTINGS.customSeparator,
    numbering,
    prefix: typeof raw.prefix === "string" ? raw.prefix : "",
    suffix: typeof raw.suffix === "string" ? raw.suffix : "",
  };
}

/** Parse a stored settings blob; garbage in, defaults out. */
export function parseSettings(raw) {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Build just enough of the output to fill a preview of `limit` characters.
 * The full output is never assembled here, so a 100,000-repeat job with a
 * long text cannot freeze the page while the user is still typing.
 * Returns { preview, truncated } — truncated is true when the real output
 * is longer than the preview.
 */
export function buildPreview(text, settings, limit = PREVIEW_LIMIT) {
  const s = normalizeSettings(settings);
  const safeText = typeof text === "string" ? text : "";
  if (safeText === "") return { preview: "", truncated: false };
  const sep = resolveSeparator(s.separator, s.customSeparator);
  const pieces = [];
  let length = 0;
  for (let i = 0; i < s.count; i += 1) {
    if (i > 0) {
      pieces.push(sep);
      length += sep.length;
    }
    const piece = buildPiece(safeText, i + 1, s);
    pieces.push(piece);
    length += piece.length;
    if (length >= limit) break;
  }
  const preview = pieces.join("").slice(0, limit);
  const est = estimateOutput(safeText, s);
  return { preview, truncated: est.chars > limit };
}

/** A short, honest sample text for the "Try a sample" button. */
export const SAMPLE_TEXT = "Hello, world!";
