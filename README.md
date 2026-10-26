# Scorpious187's Custom Items

Homebrew magic items with their own automation for **dnd5e 6** on Foundry VTT 14. It's built for dnd5e's native rolls with [Scorpious187's Luck Dice Automation](https://github.com/nscarpinatodev/scorpious187s-luck-dice-automation), and doesn't use Midi-QoL.

## Items

### Kilian's Eldritch Rifle

*Wondrous item (spellcasting focus), requires attunement.* This crossbow/rifle hybrid doesn't fire bolts. It turns a spell cast into it into a projectile.

Use **Channel Spell** on the equipped, attuned rifle. A picker lists the wielder's prepared spells that make a ranged spell attack, showing each spell's normal and channeled range and to-hit. Pick one and it's cast with **double range** and **+2 to the spell attack roll**. For example, Eldritch Blast fires at 240 ft.

- The usage card, the automatic attack roll, and the card's **Attack** and **Damage** buttons all use the channeled spell, including rolls made later from the card.
- Spell slots, concentration, and uses are spent from the real spell as normal.
- With Luck Dice Automation: Eldritch Blast beams and Scorching Ray rays fire one attack each, and target confirmation, Luck Dice on a miss, and attack automation all use the channeled range and bonus. Luck Dice's range check uses the doubled range.

**Range check** (world setting): before casting, your current targets are compared with the channeled range. You can turn this off, have it ask before firing, or have it refuse. When Luck Dice's attack automation is on, out-of-range targets always stop the cast. Luck Dice would cancel that attack anyway, and this way the slot isn't spent.

## Making your own conduit

Any item becomes a spell conduit with this flag:

```json
"flags": {
  "scorpious187s-custom-items": {
    "spellConduit": {
      "activity": "<activity id that opens the picker; omit for any>",
      "attackBonus": 2,
      "rangeMultiplier": 2,
      "attackTypes": ["rsak"],
      "requireEquipped": true,
      "requireAttunement": true
    }
  }
}
```

Give the item a utility activity. Using that activity opens the picker instead of posting a card. Macros can call `game.modules.get("scorpious187s-custom-items").api.spellConduit.open(item)`.

## Development

```
npm install
npm run build   # src/packs/*/ JSON → packs/ (LevelDB)
npm run check   # syntax-check the scripts
```

To release, push a `v*` tag. CI builds the packs, stamps `module.json` from the tag, and publishes `module.json` + `module.zip`.
