// ── Scorpious187's Custom Items ───────────────────────────────────────────────
// Shared constants and helpers. Nothing here touches Foundry globals at import time.

export const MODULE_ID = "scorpious187s-custom-items";
export const LIB_ID = "scorpious187s-lib";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ESCAPES[c]);
export const signed = (n) => (n < 0 ? `${n}` : `+${n}`);

/** Localize `S187CI.<key>`, formatting when data is given. */
export const loc = (key, data) => data
  ? game.i18n.format(`S187CI.${key}`, data)
  : game.i18n.localize(`S187CI.${key}`);

const fallbackLog = {
  isDebug: () => false,
  log:   (...args) => console.log(`${MODULE_ID} |`, ...args),
  warn:  (...args) => console.warn(`${MODULE_ID} |`, ...args),
  error: (...args) => console.error(`${MODULE_ID} |`, ...args),
  debug: () => {}
};

/** The family logger (scorpious187s-lib), set on init; console until then. */
export let log = fallbackLog;
export function setLogger(logger) { log = logger ?? fallbackLog; }
