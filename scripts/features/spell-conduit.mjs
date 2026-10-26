// ── Scorpious187's Custom Items ───────────────────────────────────────────────
// Spell conduits (Kilian's Eldritch Rifle).
//
// Using the conduit's activity opens a picker of the wielder's castable spells
// with a qualifying attack (ranged spell attacks by default). The chosen spell
// is cast from an unsaved, actor-parented copy of it — same _id — whose range is
// multiplied and whose attack bonus is raised, so the usage dialog, the usage
// card and the automatic attack roll all carry the channeled values.
//
// Afterwards, everything that resolves the spell from a chat card (the card's
// Attack and Damage buttons, Luck Dice Automation's rays and target
// confirmation, the roll cards' own rendering) goes through
// ChatMessage5e#getAssociatedItem / #getAssociatedActivity. Those are wrapped
// so a card from a conduit cast — or a roll card that originated from one —
// resolves to the channeled copy instead of the plain spell. Attack rolls never
// need a bonus patched in after the fact; they're made from the copy.
//
// Configure an item with `flags.scorpious187s-custom-items.spellConduit`:
// {
//   activity: "<activityId>",   // Only this activity opens the picker. Omit: any activity on the item.
//   attackBonus: 2,             // Added to the spell attack roll.
//   rangeMultiplier: 2,         // Multiplies the spell's range.
//   attackTypes: ["rsak"],      // Which attack activities qualify (rsak, msak, rwak, mwak).
//   requireEquipped: true,      // The conduit must be equipped.
//   requireAttunement: true     // The conduit must be attuned (when its attunement is "required").
// }

import { MODULE_ID, esc, loc, log, signed } from "../shared.mjs";
import { luckDiceCancelsOutOfRange } from "../integrations/luck-dice.mjs";

export const CONDUIT_FLAG = "spellConduit";
/** On the usage card of a conduit cast, and on the channeled copy itself. */
export const CAST_FLAG = "conduitCast";
/** The pre-release draft's flag (scorpious187-spell-conduit), still read so world copies keep working. */
const LEGACY_SCOPE = "scorpious187-spell-conduit";

const DEFAULTS = Object.freeze({
  activity: null,
  attackBonus: 2,
  rangeMultiplier: 2,
  attackTypes: ["rsak"],
  requireEquipped: true,
  requireAttunement: true
});

// ── Configuration ─────────────────────────────────────────────────────────────

/** An item's conduit configuration merged with the defaults, or null when it isn't a conduit. */
export function getConduitConfig(item) {
  const raw = item?.flags?.[MODULE_ID]?.[CONDUIT_FLAG] ?? item?.flags?.[LEGACY_SCOPE]?.conduit;
  if (!raw || raw.enabled === false) return null;
  const config = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULTS), raw, { inplace: false });
  config.attackBonus = Number(config.attackBonus) || 0;
  config.rangeMultiplier = Number(config.rangeMultiplier) || 1;
  if (!Array.isArray(config.attackTypes)) config.attackTypes = [...DEFAULTS.attackTypes];
  return config;
}

/** Whether a spell is available to cast: prepared, always prepared, or from a method that doesn't prepare. */
function isCastable(spell) {
  const system = spell.system;
  if (system.canPrepare && (system.prepared ?? 0) < CONFIG.DND5E.spellPreparationStates.prepared.value) return false;
  return spell.canUse !== false;
}

/** Whether an activity is an attack of a type the conduit channels. */
function isQualifyingActivity(activity, config) {
  if (activity?.type !== "attack") return false;
  try { return config.attackTypes.includes(activity.getActionType()); } catch { return false; }
}

// ── The channeled copy ────────────────────────────────────────────────────────

/** A prepared range multiplied, as a source value; null when it isn't a distance (self, touch, sight…). */
function scaleRange(range, mult) {
  if (!range?.scalar) return null;
  const value = Number(range.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return String(Math.round(value * mult * 100) / 100);
}

/** A flat bonus appended to an attack bonus formula. */
function appendBonus(existing, bonus) {
  const current = String(existing ?? "").trim();
  if (!bonus) return current;
  return current ? `${current} + ${bonus}` : `${bonus}`;
}

/** Whether this item is a channeled copy (rather than the spell on the actor). */
export const isChanneled = (item) => !!item?.flags?.[MODULE_ID]?.[CAST_FLAG];

/**
 * An unsaved, actor-parented copy of a spell with the cast's range and attack bonus applied. It keeps the spell's
 * _id, so consumption, concentration and anything else that writes back by id still lands on the real spell.
 * @param {Item5e} spell  The spell (or a scaled clone of it).
 * @param {{activityId: string, attackBonus: number, rangeMultiplier: number}} cast
 */
export function buildChanneledSpell(spell, cast) {
  const source = spell.toObject();
  const mult = Number(cast.rangeMultiplier) || 1;

  const itemRange = scaleRange(spell.system.range, mult);
  if (itemRange) source.system.range.value = itemRange;

  for (const [id, data] of Object.entries(source.system.activities ?? {})) {
    // Activities that inherit the item's range pick up the scaled one; overridden ranges are scaled here.
    if (data.range?.override) {
      const scaled = scaleRange(spell.system.activities.get(id)?.range, mult);
      if (scaled) data.range.value = scaled;
    }
    if (id === cast.activityId && data.attack) data.attack.bonus = appendBonus(data.attack.bonus, Number(cast.attackBonus) || 0);
  }

  foundry.utils.setProperty(source, `flags.${MODULE_ID}.${CAST_FLAG}`, { ...cast });

  // An owned item's final preparation (ranges, labels, to-hit) normally happens in its actor's; a copy made
  // outside it needs it done here, the way dnd5e prepares its own temporary items.
  const actor = spell.actor;
  let item;
  try {
    if (actor) actor._embeddedPreparation = true;
    item = new Item.implementation(source, { parent: actor });
  } finally {
    if (actor) delete actor._embeddedPreparation;
  }
  item.prepareFinalAttributes?.();
  return item;
}

/** What a cast through this conduit records: on the usage card, and on the channeled copy. */
function castData(conduit, spell, activity, config) {
  return {
    conduitId: conduit.id,
    conduitName: conduit.name,
    spellId: spell.id,
    activityId: activity.id,
    attackBonus: config.attackBonus,
    rangeMultiplier: config.rangeMultiplier
  };
}

// ── Chat cards resolve to the channeled copy ──────────────────────────────────

/** The conduit cast a card belongs to: its own flag, or its usage card's. */
function castOf(message) {
  const own = message?.flags?.[MODULE_ID]?.[CAST_FLAG];
  if (own) return own;
  let origin = null;
  try { origin = message?.getOriginatingMessage?.(); } catch { /* not a dnd5e card */ }
  return (origin && origin !== message) ? origin.flags?.[MODULE_ID]?.[CAST_FLAG] ?? null : null;
}

// Cards resolve their item several times per render; a copy is reused briefly rather than rebuilt each time.
const CACHE_TTL = 1000;
const recent = new Map();

function channeledFor(spell, cast) {
  const scaling = spell.flags?.dnd5e?.scaling ?? 0;
  const key = [spell.uuid, scaling, cast.activityId, cast.attackBonus, cast.rangeMultiplier].join("|");
  const now = Date.now();
  const hit = recent.get(key);
  if (hit && hit.expires > now) return hit.item;
  const item = buildChanneledSpell(spell, cast);
  recent.set(key, { item, expires: now + CACHE_TTL });
  if (recent.size > 32) for (const [k, v] of recent) if (v.expires <= now) recent.delete(k);
  return item;
}

/** The item a card resolved, swapped for the channeled copy when the card is from a conduit cast. */
function channelItem(message, item) {
  if (item?.type !== "spell" || isChanneled(item)) return item;
  const cast = castOf(message);
  if (!cast || cast.spellId !== item.id) return item;
  try { return channeledFor(item, cast); } catch (err) {
    log.error(`Could not channel ${item.name} for card ${message.id}`, err);
    return item;
  }
}

/** The activity a card resolved, swapped for the channeled copy's. */
function channelActivity(message, activity) {
  const item = activity?.item;
  if (!item) return activity;
  const channeled = channelItem(message, item);
  return channeled === item ? activity : channeled.system.activities.get(activity.id) ?? activity;
}

/** Wrap ChatMessage5e's item / activity resolution (libWrapper when it's active). Call on setup. */
export function installChatResolution() {
  const cls = CONFIG.ChatMessage.documentClass;
  const wrappers = {
    getAssociatedItem(wrapped, ...args) { return channelItem(this, wrapped(...args)); },
    getAssociatedActivity(wrapped, ...args) { return channelActivity(this, wrapped(...args)); }
  };
  const useLibWrapper = game.modules.get("lib-wrapper")?.active && globalThis.libWrapper;
  for (const [name, wrapper] of Object.entries(wrappers)) {
    if (typeof cls?.prototype?.[name] !== "function") {
      log.warn(`ChatMessage5e#${name} not found — channeled spells' chat cards will roll the plain spell.`);
      continue;
    }
    if (useLibWrapper) {
      libWrapper.register(MODULE_ID, `CONFIG.ChatMessage.documentClass.prototype.${name}`, wrapper, "WRAPPER");
    } else {
      const original = cls.prototype[name];
      cls.prototype[name] = function (...args) { return wrapper.call(this, original.bind(this), ...args); };
    }
  }
}

// ── Picking a spell ───────────────────────────────────────────────────────────

/** Every spell + attack activity the actor can fire through the conduit, with its channeled copy. */
function collectOptions(actor, conduit, config) {
  const options = [];
  for (const spell of actor.itemTypes.spell ?? []) {
    if (!isCastable(spell)) continue;
    for (const activity of spell.system.activities ?? []) {
      if (!isQualifyingActivity(activity, config) || !activity.canUse) continue;
      let channeled;
      try {
        channeled = buildChanneledSpell(spell, castData(conduit, spell, activity, config));
      } catch (err) {
        log.error(`Could not prepare ${spell.name} for channeling`, err);
        continue;
      }
      const channeledActivity = channeled.system.activities.get(activity.id);
      if (channeledActivity) options.push({ spell, activity, channeledActivity });
    }
  }
  return options.sort((a, b) => (a.spell.system.level - b.spell.system.level)
    || a.spell.name.localeCompare(b.spell.name, game.i18n.lang));
}

/** A prepared range, for display. */
function rangeLabel(range) {
  if (range?.scalar && Number(range.value) > 0) return dnd5e.utils.formatLength(Number(range.value), range.units);
  return range?.labels?.simple ?? "—";
}

/** The picker. Resolves with the chosen option, or null. */
async function promptForSpell(conduit, options, config) {
  const rows = options.map(({ spell, activity, channeledActivity }, index) => {
    const level = spell.system.level;
    const levelLabel = level === 0 ? loc("Conduit.Cantrip") : (CONFIG.DND5E.spellLevels[level] ?? `${level}`);
    const showActivity = spell.system.activities.size > 1;
    return `
      <li>
        <label>
          <input type="radio" name="choice" value="${index}" ${index === 0 ? "checked" : ""}>
          <img src="${esc(spell.img)}" alt="">
          <span class="s187ci-name">
            ${esc(spell.name)}
            <small>${esc(levelLabel)}${showActivity ? ` · ${esc(activity.name)}` : ""}</small>
          </span>
          <span class="s187ci-stat" data-tooltip="${esc(loc("Conduit.Range"))}">
            <s>${esc(rangeLabel(activity.range))}</s>
            <strong>${esc(rangeLabel(channeledActivity.range))}</strong>
          </span>
          <span class="s187ci-stat" data-tooltip="${esc(loc("Conduit.ToHit"))}">
            <s>${esc(activity.labels?.toHit ?? "")}</s>
            <strong>${esc(channeledActivity.labels?.toHit ?? "")}</strong>
          </span>
        </label>
      </li>`;
  }).join("");

  const hint = loc("Conduit.Hint", { item: esc(conduit.name), mult: config.rangeMultiplier, bonus: signed(config.attackBonus) });

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${loc("Conduit.Title")}: ${conduit.name}`, icon: "fa-solid fa-wand-sparkles" },
    classes: [MODULE_ID, "s187ci-conduit"],
    position: { width: 520 },
    content: `<p class="s187ci-hint">${hint}</p><ul class="s187ci-spell-list">${rows}</ul>`,
    buttons: [
      {
        action: "fire", label: loc("Conduit.Fire"), icon: "fa-solid fa-crosshairs", default: true,
        callback: (_event, button) => button.form?.querySelector('input[name="choice"]:checked')?.value ?? null
      },
      { action: "cancel", label: loc("Conduit.Cancel"), icon: "fa-solid fa-xmark" }
    ],
    render: (_event, dialog) => {
      // Double-click a row to fire straight away.
      const element = dialog.element;
      element.querySelectorAll(".s187ci-spell-list li").forEach(li => li.addEventListener("dblclick", () => {
        element.querySelector('button[data-action="fire"]')?.click();
      }));
    },
    rejectClose: false
  });

  if (result === null || result === undefined || result === "cancel") return null;
  return options[Number(result)] ?? null;
}

// ── Range check before casting ────────────────────────────────────────────────

/** The scene's grid units as a dnd5e movement unit key. */
function sceneUnits() {
  const raw = String(canvas.scene?.grid?.units ?? canvas.grid?.units ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (raw in (CONFIG.DND5E.movementUnits ?? {})) return raw;
  const aliases = { feet: "ft", foot: "ft", miles: "mi", mile: "mi", meters: "m", meter: "m", metres: "m", metre: "m",
    kilometers: "km", kilometer: "km", kilometres: "km", kilometre: "km" };
  return aliases[raw] ?? "ft";
}

/**
 * Distance between two tokens' nearest grid spaces, elevation included — measured the way Luck Dice Automation
 * measures it, so the two never disagree about whether a target is in range.
 */
function tokenDistance(a, b) {
  a = a?.document ?? a; b = b?.document ?? b;
  const grid = canvas?.grid;
  if (!a || !b || !grid || a.parent !== b.parent) return Infinity;
  const at = (token, point) => ({ ...point, elevation: token.elevation ?? 0 });
  if (!grid.isGridless && a.getOccupiedGridSpaceOffsets && b.getOccupiedGridSpaceOffsets) {
    let best = Infinity;
    for (const oa of a.getOccupiedGridSpaceOffsets()) {
      for (const ob of b.getOccupiedGridSpaceOffsets()) {
        const d = grid.measurePath([at(a, grid.getCenterPoint(oa)), at(b, grid.getCenterPoint(ob))]).distance;
        if (d < best) best = d;
      }
    }
    return best;
  }
  // Gridless: centre to centre, less each token's half-size.
  const center = (t) => t.object?.center ?? { x: t.x + (t.width * grid.size) / 2, y: t.y + (t.height * grid.size) / 2 };
  const d = grid.measurePath([at(a, center(a)), at(b, center(b))]).distance;
  return Math.max(0, d - ((a.width + b.width) / 2) * grid.distance + grid.distance);
}

/**
 * Compare the caster's current targets with the channeled range before anything is spent. When Luck Dice
 * Automation would cancel the attack at an out-of-range target anyway, firing is refused rather than offered.
 * @returns {Promise<boolean>}  Whether to cast.
 */
async function checkRange(actor, activity) {
  let mode = game.settings.get(MODULE_ID, "conduitRangeCheck");
  if (mode === "off" || !canvas?.ready) return true;

  const range = activity.range;
  if (!range?.scalar || !(Number(range.value) > 0)) return true;

  const source = activity.getUsageToken?.() ?? actor.getActiveTokens()[0];
  const targets = Array.from(game.user.targets ?? []);
  if (!source || !targets.length) return true;

  const max = dnd5e.utils.convertLength(Number(range.value), range.units, sceneUnits(), { strict: false });
  const sourceId = (source.document ?? source).id;
  const far = targets.filter(t => t.document.id !== sourceId && tokenDistance(source, t) > max + 1e-6);
  if (!far.length) return true;

  const label = rangeLabel(range);
  const names = far.map(t => esc(t.name)).join(", ");
  const luckDice = luckDiceCancelsOutOfRange();
  if (luckDice) mode = "block";

  if (mode === "block") {
    ui.notifications.warn(loc(luckDice ? "Conduit.OutOfRangeLuckDice" : "Conduit.OutOfRange", { range: label, targets: names }));
    return false;
  }
  return foundry.applications.api.DialogV2.confirm({
    window: { title: loc("Conduit.OutOfRangeTitle"), icon: "fa-solid fa-ruler" },
    content: `<p>${loc("Conduit.OutOfRangeConfirm", { spell: esc(activity.item.name), range: esc(label), targets: names })}</p>`,
    rejectClose: false
  });
}

// ── Firing ────────────────────────────────────────────────────────────────────

/** Cast the chosen spell through the conduit. Resolves with dnd5e's usage results. */
async function fire(actor, conduit, { spell, activity, channeledActivity }, config) {
  if (!(await checkRange(actor, channeledActivity))) return;
  log.debug(`${actor.name} channels ${spell.name} through ${conduit.name}`);
  return channeledActivity.use({}, {}, {
    data: {
      flavor: conduit.name,
      flags: { [MODULE_ID]: { [CAST_FLAG]: castData(conduit, spell, activity, config) } }
    }
  });
}

/**
 * Open the conduit picker for an item, and cast what's chosen.
 * @param {Item5e} conduit  The conduit item, owned by an actor.
 */
export async function openConduit(conduit) {
  const config = getConduitConfig(conduit);
  if (!config) return;
  const actor = conduit.actor;
  if (!actor) return ui.notifications.warn(loc("Conduit.NoActor", { item: conduit.name }));

  const system = conduit.system;
  if (config.requireEquipped && ("equipped" in system) && !system.equipped) {
    return ui.notifications.warn(loc("Conduit.NotEquipped", { item: conduit.name }));
  }
  if (config.requireAttunement && system.attunement === "required" && !system.attuned) {
    return ui.notifications.warn(loc("Conduit.NotAttuned", { item: conduit.name }));
  }

  const options = collectOptions(actor, conduit, config);
  if (!options.length) return ui.notifications.warn(loc("Conduit.NoSpells", { actor: actor.name, item: conduit.name }));

  const choice = await promptForSpell(conduit, options, config);
  if (!choice) return;
  return fire(actor, conduit, choice, config);
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerSettings() {
  game.settings.register(MODULE_ID, "conduitRangeCheck", {
    name: "S187CI.Setting.ConduitRangeCheck.Name",
    hint: "S187CI.Setting.ConduitRangeCheck.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "confirm",
    choices: {
      off: "S187CI.Setting.ConduitRangeCheck.Off",
      confirm: "S187CI.Setting.ConduitRangeCheck.Confirm",
      block: "S187CI.Setting.ConduitRangeCheck.Block"
    }
  });
}

/**
 * dnd5e.preUseActivity: the conduit's activity opens the picker instead of making its own card.
 * Returns false only for a conduit activity.
 */
export function onPreUseActivity(activity) {
  const config = getConduitConfig(activity?.item);
  if (!config) return;
  if (config.activity && config.activity !== activity.id) return;
  // activity.item is dnd5e's working clone; open the picker for the item on the actor.
  const conduit = activity.actor?.items.get(activity.item.id) ?? activity.item;
  openConduit(conduit).catch(err => log.error("Failed to channel a spell", err));
  return false;
}

export const api = { open: openConduit, getConduitConfig, buildChanneledSpell, isChanneled };
