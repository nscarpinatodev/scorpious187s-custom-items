// Compile the compendium packs from their JSON sources (src/packs/<pack>/*.json → packs/<pack>).
// Run with `npm run build`; CI runs it before packaging a release.
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { promises as fs } from "fs";

const PACKS = [
  { src: "src/packs/custom-items", dest: "packs/custom-items" }
];

for (const { src, dest } of PACKS) {
  await fs.rm(dest, { recursive: true, force: true });
  console.log(`Compiling ${src} → ${dest}`);
  await compilePack(src, dest, { recursive: true, log: true });
}
