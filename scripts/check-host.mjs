/**
 * dsh-plugin-archived-conversations — host source guards.
 *
 * TWO invariants, each learned the hard way. Both failures are quiet: the
 * settings page renders normally and the symptom looks like a data problem
 * rather than the contract violation it is. Hence build-time guards.
 *
 * 1. **A Cordis service must not use `#` private members.** `Context.get()`
 *    hands every service out through a traceable `Proxy` (`getTraceable` →
 *    `createTraceable`), and the Typert gateway dispatches a Remote method
 *    with `Reflect.apply(method, ctx.get(serviceKey), args)` — so `this`
 *    inside any gateway-invoked method is that Proxy, not the raw instance.
 *    V8's private brand check does not survive a Proxy and throws
 *    `TypeError: Receiver must be an instance of class …`; every row then
 *    shows that TypeError as its `readError`.
 *
 * 2. **Deleting a session must announce `api-session/removed`.** The client's
 *    session list is a snapshot fed by `api-session/added` /
 *    `api-session/removed`; the sidebar hides archived rows at render time and
 *    buckets any row no workspace accounts for under "未分组" / "Ungrouped".
 *    Deleting a COLD archived session removes its artifact, un-archives it and
 *    detaches it from its workspace — with no announcement, the still-listed
 *    row simply becomes visible and unaccounted, so the deleted conversation
 *    reappears in the ungrouped bucket instead of disappearing. The core only
 *    emits that event for live sessions (`session/disposed`), so the delete
 *    path must emit it itself.
 *
 * Run: `pnpm run check` (CI runs the same script).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const libDir = join(root, "lib");

/** A private member access on the service (`this.#x`). */
const ACCESS = /this\s*\.\s*#[A-Za-z_$]/;
/** A private field or method declaration inside a class body. */
const DECLARATION = /^\s*(?:static\s+)?#[A-Za-z_$][\w$]*\s*[=(]/;
/** The removal announcement the delete path owes every client. */
const REMOVAL_ANNOUNCEMENT = /emit\(\s*["']api-session\/removed["']/;

const files = readdirSync(libDir).filter((name) => name.endsWith(".js")).sort();
const sources = new Map(files.map((file) => [file, readFileSync(join(libDir, file), "utf8")]));

const failures = [];
for (const [file, source] of sources) {
  for (const [index, line] of source.split("\n").entries()) {
    if (!ACCESS.test(line) && !DECLARATION.test(line)) continue;
    failures.push(`lib/${file}:${index + 1}: ${line.trim()}`);
  }
}

if (failures.length > 0) {
  throw new Error([
    "host source guard: `#` private members are not allowed in a Cordis service.",
    "Cordis serves services through a traceable Proxy, and the Typert gateway calls",
    "Remote methods with that Proxy as `this`, so a private brand check throws",
    "`Receiver must be an instance of class …` at call time.",
    "Use ordinary underscore-prefixed members for internal state instead:",
    ...failures.map((line) => `  ${line}`)
  ].join("\n"));
}

const remote = sources.get("remote.js") ?? "";
if (!REMOVAL_ANNOUNCEMENT.test(remote)) {
  throw new Error([
    "host source guard: lib/remote.js no longer announces `api-session/removed`.",
    "Deleting a cold archived session removes its artifact and then un-archives and",
    "un-accounts it. The client's session list is only updated by `api-session/added` /",
    "`api-session/removed`, so without that announcement the conversation reappears in",
    "the sidebar's ungrouped bucket instead of disappearing (the core emits it for live",
    "sessions only). Restore the `this.ctx.emit(\"api-session/removed\", sessionId)` call",
    "in `deleteSession` — see its method note for the full contract."
  ].join("\n"));
}

console.log(`host source guard OK (no \`#\` private members under lib/; delete path announces \`api-session/removed\`; scanned ${String(files.length)} files)`);
