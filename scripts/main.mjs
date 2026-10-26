// ── Scorpious187's Custom Items ───────────────────────────────────────────────
// Homebrew items with their own automation, for dnd5e 6. Each kind of item
// behaviour is a feature module, switched on per item by a flag in this
// module's scope (so items carry their behaviour into any world):
//
//   spellConduit — features/spell-conduit.mjs (Kilian's Eldritch Rifle)
//
// Designed for dnd5e's native rolls with Scorpious187's Luck Dice Automation
// (integrations/luck-dice.mjs); no Midi-QoL workflow handling.
//
// Follows the family's init/ready shape rather than the library's
// registerModule() bootstrap, which would have to run before the library's
// API exists (see integrations/lib.mjs).

import { LIB_ID, MODULE_ID, loc, log, setLogger } from "./shared.mjs";
import { libApi } from "./integrations/lib.mjs";
import * as spellConduit from "./features/spell-conduit.mjs";

Hooks.once("init", () => {
  setLogger(libApi()?.utils?.makeLogger?.(MODULE_ID));

  game.settings.register(MODULE_ID, "debug", {
    name: "S187CI.Setting.Debug.Name",
    hint: "S187CI.Setting.Debug.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  spellConduit.registerSettings();

  // Registered at init, ahead of Luck Dice's own dnd5e.preUseActivity handlers (on ready).
  Hooks.on("dnd5e.preUseActivity", spellConduit.onPreUseActivity);

  game.modules.get(MODULE_ID).api = { spellConduit: spellConduit.api };
  log.log("Initialized");
});

// dnd5e has set CONFIG.ChatMessage.documentClass by now.
Hooks.once("setup", () => spellConduit.installChatResolution());

Hooks.once("ready", () => {
  // Foundry won't normally enable this module without the library. If it happens anyway, the items still work:
  // only family logging and update notices are lost, so say so to the GM rather than stop.
  if (!libApi()) {
    log.warn(`${LIB_ID} is not active — update notices are disabled`);
    if (game.user.isGM) ui.notifications.warn(loc("LibMissing"));
  }
  log.log("Ready");
});
