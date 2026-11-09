/* TextBlast — UI wiring. Imports the pure engine and binds it to the DOM.
   Runs init() on import (this script loads at the end of <body>).
   Exported functions exist so the jsdom harness can drive the real module
   graph: buildOutput, updateCounts, setCount, setSeparator, setNumbering,
   setCustomSeparator, setPrefix, setSuffix, copyOutput, downloadOutput,
   loadSample, clearAll, toggleFullOutput, getState.

   Performance note: the live readout uses estimateOutput (exact, no string
   built) and buildPreview (bounded to 2,000 chars), so typing with the
   count at 100,000 never freezes the page. The full string is only built
   when the user copies or downloads — and for outputs over 5 MB the UI
   warns first, because clipboard writes of that size can be slow. */
import {
  MAX_COUNT,
  MIN_COUNT,
  PREVIEW_LIMIT,
  SETTINGS_KEY,
  SEPARATOR_KEYS,
  NUMBERING_STYLES,
  DEFAULT_SETTINGS,
  clampCount,
  resolveSeparator,
  buildOutput as engineBuildOutput,
  buildPreview,
  estimateOutput,
  inputStats,
  resultStats,
  formatBytes,
  needsTruncation,
  parseSettings,
  normalizeSettings,
  SAMPLE_TEXT,
} from "./engine.js";

const FULL_BUILD_WARN_BYTES = 5 * 1024 * 1024;

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`TextBlast: missing element #${id}`);
  return el;
}

const els = {
  textInput: $("text-input"),
  inputChars: $("input-chars"),
  inputWords: $("input-words"),
  countRange: $("count-range"),
  countInput: $("count-input"),
  presetRow: $("preset-row"),
  sepRow: $("sep-row"),
  customSepWrap: $("custom-sep-wrap"),
  customSepInput: $("custom-sep-input"),
  numberingStyle: $("numbering-style"),
  prefixInput: $("prefix-input"),
  suffixInput: $("suffix-input"),
  sepPreview: $("sep-preview"),
  outputPreview: $("output-preview"),
  outputNote: $("output-note"),
  showFullBtn: $("show-full-btn"),
  resultChars: $("result-chars"),
  resultWords: $("result-words"),
  resultLines: $("result-lines"),
  resultSize: $("result-size"),
  copyBtn: $("copy-btn"),
  downloadBtn: $("download-btn"),
  clearBtn: $("clear-btn"),
  sampleBtn: $("sample-btn"),
  copyStatus: $("copy-status"),
};

let settings = parseSettings(safeGetItem(SETTINGS_KEY));
let showFull = false;
let lastOutput = "";
let lastOutputBuilt = false;
let lastCopyStatus = "";

function safeGetItem(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode: settings just don't persist */ }
}

function saveSettings() {
  safeSetItem(SETTINGS_KEY, JSON.stringify(settings));
}

function currentText() {
  return els.textInput.value;
}

/** Build the current output with the engine (exported for the harness). */
function buildOutput() {
  const built = engineBuildOutput(currentText(), settings);
  lastOutput = built.output;
  lastOutputBuilt = true;
  return built.output;
}

/** Recompute everything live: input stats, result estimate, preview. */
function updateCounts() {
  const text = currentText();
  const inStats = inputStats(text);
  els.inputChars.textContent = `${inStats.chars.toLocaleString("en-US")} characters`;
  els.inputWords.textContent = `${inStats.words.toLocaleString("en-US")} words`;

  const est = estimateOutput(text, settings);
  els.resultChars.textContent = est.chars.toLocaleString("en-US");
  els.resultWords.textContent = est.words.toLocaleString("en-US");
  els.resultLines.textContent = est.lines.toLocaleString("en-US");
  els.resultSize.textContent = formatBytes(est.bytes);

  // Separator preview: show the separator itself, escaped visibly.
  const sep = resolveSeparator(settings.separator, settings.customSeparator);
  els.sepPreview.textContent = sep === "" ? "(no separator — repeats run together)"
    : `Separator between repeats: ${JSON.stringify(sep)}`;

  // The preview never builds the whole string: bounded to 2,000 chars.
  lastOutputBuilt = false;
  if (showFull && !needsTruncation(est.chars)) {
    const built = buildOutput();
    els.outputPreview.textContent = built;
    els.outputNote.textContent = `Full output shown — ${est.chars.toLocaleString("en-US")} characters.`;
    els.showFullBtn.hidden = true;
  } else if (showFull && needsTruncation(est.chars)) {
    // "Show full" was requested but the output is huge: still render it,
    // but only after the user explicitly asked (the button is the consent).
    const built = buildOutput();
    els.outputPreview.textContent = built;
    els.outputNote.textContent = `Full output shown — ${est.chars.toLocaleString("en-US")} characters. Large outputs can be slow to scroll.`;
    els.showFullBtn.hidden = true;
  } else {
    const { preview, truncated } = buildPreview(text, settings, PREVIEW_LIMIT);
    els.outputPreview.textContent = preview;
    if (truncated) {
      els.outputNote.textContent = `Preview shows the first ${PREVIEW_LIMIT.toLocaleString("en-US")} of ${est.chars.toLocaleString("en-US")} characters — use "Show full output" to render it all, or copy/download without rendering.`;
      els.showFullBtn.hidden = false;
    } else {
      els.outputNote.textContent = text.length === 0
        ? "Type something above and the repeated output appears here."
        : `Output preview — ${est.chars.toLocaleString("en-US")} characters in total.`;
      els.showFullBtn.hidden = true;
    }
  }
  return est;
}

function syncCountControls() {
  els.countRange.value = String(settings.count);
  els.countInput.value = String(settings.count);
  els.presetRow.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.count) === settings.count);
  });
}

function syncSeparatorControls() {
  els.sepRow.querySelectorAll(".sep-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.separator === settings.separator);
  });
  els.customSepWrap.hidden = settings.separator !== "custom";
}

function syncNumberingControl() {
  els.numberingStyle.value = settings.numbering;
}

/* --- Controls (all exported so the harness can drive them) --- */

function setCount(value) {
  settings.count = clampCount(value);
  showFull = false;
  syncCountControls();
  saveSettings();
  updateCounts();
  return settings.count;
}

function setSeparator(key) {
  if (!SEPARATOR_KEYS.includes(key)) return settings.separator;
  settings.separator = key;
  showFull = false;
  syncSeparatorControls();
  saveSettings();
  updateCounts();
  return settings.separator;
}

function setCustomSeparator(value) {
  settings.customSeparator = typeof value === "string" ? value : "";
  showFull = false;
  saveSettings();
  updateCounts();
  return settings.customSeparator;
}

function setNumbering(style) {
  if (!NUMBERING_STYLES.includes(style)) return settings.numbering;
  settings.numbering = style;
  showFull = false;
  syncNumberingControl();
  saveSettings();
  updateCounts();
  return settings.numbering;
}

function setPrefix(value) {
  settings.prefix = typeof value === "string" ? value : "";
  showFull = false;
  saveSettings();
  updateCounts();
  return settings.prefix;
}

function setSuffix(value) {
  settings.suffix = typeof value === "string" ? value : "";
  showFull = false;
  saveSettings();
  updateCounts();
  return settings.suffix;
}

function toggleFullOutput() {
  showFull = !showFull;
  els.showFullBtn.textContent = showFull ? "Show preview only" : "Show full output";
  updateCounts();
  return showFull;
}

function setStatus(message) {
  lastCopyStatus = message;
  els.copyStatus.textContent = message;
}

/** Copy the full output to the clipboard (Clipboard API, textarea fallback). */
async function copyOutput() {
  const text = currentText();
  if (text.length === 0) {
    setStatus("Nothing to copy yet — type some text first.");
    return false;
  }
  const output = buildOutput();
  const est = estimateOutput(text, settings);
  if (est.bytes > FULL_BUILD_WARN_BYTES) {
    setStatus(`Output is ${formatBytes(est.bytes)} — copying a file this large can be slow; download may work better. Trying anyway…`);
  }
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(output);
      setStatus(`Copied ${est.chars.toLocaleString("en-US")} characters to the clipboard.`);
      return true;
    }
    throw new Error("Clipboard API unavailable");
  } catch {
    // Fallback for older browsers / non-secure contexts.
    try {
      const ta = document.createElement("textarea");
      ta.value = output;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
      document.body.removeChild(ta);
      if (ok) {
        setStatus(`Copied ${est.chars.toLocaleString("en-US")} characters to the clipboard.`);
        return true;
      }
      setStatus("Copy failed in this browser — use Download .txt instead.");
      return false;
    } catch {
      setStatus("Copy failed in this browser — use Download .txt instead.");
      return false;
    }
  }
}

/** Download the full output as a .txt file. */
function downloadOutput() {
  const text = currentText();
  if (text.length === 0) {
    setStatus("Nothing to download yet — type some text first.");
    return false;
  }
  const output = buildOutput();
  const est = estimateOutput(text, settings);
  try {
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `textblast-${settings.count}x.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
    setStatus(`Downloaded textblast-${settings.count}x.txt (${formatBytes(est.bytes)}).`);
    return true;
  } catch {
    setStatus("Download failed in this browser — try copying instead.");
    return false;
  }
}

function loadSample() {
  els.textInput.value = SAMPLE_TEXT;
  showFull = false;
  updateCounts();
  els.textInput.focus();
  return SAMPLE_TEXT;
}

function clearAll() {
  els.textInput.value = "";
  settings = { ...DEFAULT_SETTINGS };
  showFull = false;
  syncCountControls();
  syncSeparatorControls();
  syncNumberingControl();
  els.prefixInput.value = "";
  els.suffixInput.value = "";
  els.customSepInput.value = DEFAULT_SETTINGS.customSeparator;
  saveSettings();
  updateCounts();
  setStatus("Cleared. Settings reset to defaults.");
  return true;
}

/* --- Events --- */

els.textInput.addEventListener("input", () => { showFull = false; updateCounts(); });
els.countRange.addEventListener("input", (event) => setCount(event.target.value));
els.countInput.addEventListener("input", (event) => setCount(event.target.value));
els.countInput.addEventListener("change", () => {
  // Re-clamp on blur/Enter so a typed "0" or "999999" snaps to the range.
  els.countInput.value = String(settings.count);
});
els.presetRow.addEventListener("click", (event) => {
  const btn = event.target.closest(".preset-btn");
  if (btn) setCount(Number(btn.dataset.count));
});
els.sepRow.addEventListener("click", (event) => {
  const btn = event.target.closest(".sep-btn");
  if (btn) setSeparator(btn.dataset.separator);
});
els.customSepInput.addEventListener("input", (event) => setCustomSeparator(event.target.value));
els.numberingStyle.addEventListener("change", (event) => setNumbering(event.target.value));
els.prefixInput.addEventListener("input", (event) => setPrefix(event.target.value));
els.suffixInput.addEventListener("input", (event) => setSuffix(event.target.value));
els.showFullBtn.addEventListener("click", (event) => { event.currentTarget.blur(); toggleFullOutput(); });
els.copyBtn.addEventListener("click", (event) => { event.currentTarget.blur(); copyOutput(); });
els.downloadBtn.addEventListener("click", (event) => { event.currentTarget.blur(); downloadOutput(); });
els.clearBtn.addEventListener("click", (event) => { event.currentTarget.blur(); clearAll(); });
els.sampleBtn.addEventListener("click", (event) => { event.currentTarget.blur(); loadSample(); });

/* --- Init --- */

function init() {
  settings = normalizeSettings(settings);
  els.countRange.min = String(MIN_COUNT);
  els.countRange.max = String(MAX_COUNT);
  els.countRange.value = String(settings.count);
  els.countInput.value = String(settings.count);
  els.customSepInput.value = settings.customSeparator;
  els.prefixInput.value = settings.prefix;
  els.suffixInput.value = settings.suffix;
  syncCountControls();
  syncSeparatorControls();
  syncNumberingControl();
  updateCounts();
}

init();

export {
  buildOutput,
  updateCounts,
  setCount,
  setSeparator,
  setCustomSeparator,
  setNumbering,
  setPrefix,
  setSuffix,
  copyOutput,
  downloadOutput,
  loadSample,
  clearAll,
  toggleFullOutput,
  getState,
  getSettings,
};

function getState() {
  return {
    text: currentText(),
    settings: { ...settings },
    showFull,
    lastOutputBuilt,
    lastCopyStatus,
    estimate: estimateOutput(currentText(), settings),
  };
}
function getSettings() {
  return { ...settings };
}
