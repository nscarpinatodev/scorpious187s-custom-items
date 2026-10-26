// ── Scorpious187's Custom Items ───────────────────────────────────────────────
// Scorpious187's Module Library (scorpious187s-lib), a required dependency.
//
// Loading the library is also what puts this module on the family update
// board: its notifier finds every active module by author and reads
// {moduleId}-update.json from the scorpious187-updates repo. There is nothing
// to register for that.
//
// The library publishes its API from its own init hook, which Foundry runs
// before this module's (declared dependencies load first). Nothing here may be
// called at module-evaluation time.

import { LIB_ID } from "../shared.mjs";

/** The library's API, or null when it isn't active. */
export function libApi() {
  return globalThis.game?.modules?.get(LIB_ID)?.api ?? null;
}
