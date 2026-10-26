// ── Scorpious187's Custom Items ───────────────────────────────────────────────
// Scorpious187's Luck Dice Automation, native dnd5e 6 mode (active whenever Midi-QoL is not).
//
// Nothing here calls into Luck Dice to make it work: its native hooks read the
// activity a roll comes from (config.subject / data.subject), and a channeled
// spell's attack rolls come from the channeled copy (see chat resolution in
// spell-conduit.mjs). So its range check, ray firing, target confirmation and
// Luck Dice on a miss all see the conduit's range and attack bonus. This file
// only answers what Luck Dice will do, so the conduit can agree with it.

export const LDA_ID = "scorpious187s-luck-dice-automation";

/** Luck Dice is running its native dnd5e mode. */
export function luckDiceNative() {
  return !!game.modules.get(LDA_ID)?.active && !game.modules.get("midi-qol")?.active;
}

/** Luck Dice's own (window.LDA) setting readers, when they're there. */
const lda = () => globalThis.LDA ?? null;

/**
 * Luck Dice cancels attack rolls at targets beyond the attack's range (its "attack advantage" automation),
 * unless Automated Conditions 5e is set to do that instead.
 */
export function luckDiceCancelsOutOfRange() {
  if (!luckDiceNative()) return false;
  try {
    if (!lda()?.isAttackAdvantageEnabled?.()) return false;
  } catch { return false; }
  if (game.modules.get("automated-conditions-5e")?.active) {
    try {
      const checks = game.settings.get("automated-conditions-5e", "autoRangeChecks");
      if (checks && typeof checks !== "string" && [...checks].includes("rangedOoR")) return false;
    } catch { /* AC5E setting missing: Luck Dice does the check */ }
  }
  return true;
}
