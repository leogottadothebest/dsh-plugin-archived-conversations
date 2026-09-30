/**
 * dsh-plugin-archived-conversations — declared-core support guard.
 *
 * ONE invariant, learned the hard way twice over: **every DSH core line this
 * plugin claims to support must be covered by every `@deepseek-ai/dsh*` peer
 * range in package.json.**
 *
 * DSH core 0.2.0-rc.2 turned an unsatisfied peer into a silent whole-bundle
 * skip. `dsh-app-boot`'s `evaluatePluginCompatibility` evaluates a bundle's
 * `peerDependencies` against the running runtime version with
 * `semver.satisfies(runtime, range, { includePrerelease: true })`, and
 * `loadProfileDirectory` treats a mismatch as a reason to leave the bundle out
 * of the composition entirely — no crash, no dialog, just a `skippedBundles`
 * entry:
 *
 *   skipping profile bundle "dsh-plugin-archived-conversations": Plugin
 *   dsh-plugin-archived-conversations@0.1.6 is incompatible with dsh
 *   0.2.0-rc.2: peerDependencies {...}. Running it may cause crashes or data
 *   loss. …
 *
 * So 0.1.6 shipped, every API it calls was unchanged in 0.2.0-rc.2, and the
 * settings page still vanished: a caret range pinned to `0.x` does not cover
 * the next minor line (`^0.1.7-rc.2` is `>=0.1.7-rc.2 <0.2.0-0`), and
 * `includePrerelease` does not widen a caret's upper bound.
 *
 * This script makes the support matrix and the peer ranges impossible to drift
 * apart: adding a core line to {@link SUPPORTED_CORE_VERSIONS} without
 * widening the ranges — or widening the ranges without recording the line —
 * fails `pnpm run check`, which CI runs on every push.
 *
 * Run: `pnpm run check` (or `node scripts/check-peers.mjs`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The DSH core lines this plugin supports, oldest first — the same matrix the
 * README's compatibility table and `scripts/build-client.mjs`'s primitives
 * eras describe. Adding an entry here is a promise that the plugin runs on
 * that line; the peer ranges below must accept it, and the host/client
 * contracts for it must have been verified.
 */
export const SUPPORTED_CORE_VERSIONS = [
  "0.1.2-rc.1",
  "0.1.5-rc.2",
  "0.1.7-rc.2",
  "0.2.0-rc.2"
];

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const peers = manifest.peerDependencies ?? {};

/** Whether a peer name is one the DSH core compatibility gate evaluates. */
function isDshPeer(name) {
  return name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-");
}

/**
 * The range a missing version should be appended to, so the failure message
 * carries the exact edit rather than a description of it.
 * @param range - the range as declared today.
 * @param version - the uncovered core version.
 * @returns the widened range.
 */
function widened(range, version) {
  return `${range} || ^${version}`;
}

const failures = [];
for (const [name, range] of Object.entries(peers).sort(([a], [b]) => a.localeCompare(b))) {
  if (!isDshPeer(name)) continue;
  if (typeof range !== "string") {
    failures.push(`${name}: peer range must be a string, got ${JSON.stringify(range)}`);
    continue;
  }
  for (const version of SUPPORTED_CORE_VERSIONS) {
    // The core gate's own predicate, options included — a range this script
    // accepts must be one `evaluatePluginCompatibility` accepts too.
    if (semver.satisfies(version, range, { includePrerelease: true })) continue;
    failures.push([
      `${name}: range ${JSON.stringify(range)} does not accept DSH core ${version},`,
      `  which this plugin declares as supported. On a ${version} runtime the profile loader`,
      "  skips the whole bundle and the plugin never mounts (no error, just skippedBundles).",
      `  Fix: set the range to ${JSON.stringify(widened(range, version))}`
    ].join("\n"));
  }
}

if (failures.length > 0) {
  throw new Error([
    "peer support guard: a declared DSH core line is not covered by a peer range.",
    ...failures.map((line) => `  ${line}`)
  ].join("\n"));
}

const checked = Object.keys(peers).filter(isDshPeer).length;
console.log(`peer support guard OK (${String(checked)} @deepseek-ai/dsh* peer ranges × ${String(SUPPORTED_CORE_VERSIONS.length)} supported core lines: ${SUPPORTED_CORE_VERSIONS.join(", ")})`);
