/**
 * dsh-plugin-archived-conversations — host source guards.
 *
 * ONE invariant, learned the hard way: **a Cordis service must not use `#`
 * private members.** `Context.get()` hands every service out through a
 * traceable `Proxy` (`getTraceable` → `createTraceable`), and the Typert
 * gateway dispatches a Remote method with
 * `Reflect.apply(method, ctx.get(serviceKey), args)` — so `this` inside any
 * gateway-invoked method is that Proxy, not the raw instance. V8's private
 * brand check does not survive a Proxy and throws
 * `TypeError: Receiver must be an instance of class …`.
 *
 * The failure is quiet and misleading: the settings page renders normally and
 * every row simply shows `readError` = that TypeError, which reads like a data
 * problem rather than a call-convention one. Hence a build-time guard.
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

const failures = [];
for (const file of readdirSync(libDir).filter((name) => name.endsWith(".js")).sort()) {
  const lines = readFileSync(join(libDir, file), "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
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

console.log(`host source guard OK (no \`#\` private members under lib/; scanned ${String(readdirSync(libDir).filter((name) => name.endsWith(".js")).length)} files)`);
