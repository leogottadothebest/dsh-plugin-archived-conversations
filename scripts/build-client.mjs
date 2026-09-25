/**
 * dsh-plugin-archived-conversations — client bundle build.
 *
 * The DSH browser runtime executes each plugin's `./client` artifact as a
 * classic script and expects it to register a CJS factory through
 * `window.__ModuleLoader__.load({ id, factory(require) })` (the client
 * module system's lazy table). Raw ESM sources would fail to parse in the
 * browser and brick the renderer boot — so this script bundles the client
 * half into that exact format:
 *
 *   - bundled inline: zod codecs and every local module;
 *   - external (resolved through the platform seed/module graph at
 *     runtime): react, react/jsx-runtime, react-dom, and the primitives
 *     package — the same externals the first-party client bundles use;
 *   - the standard CJS preamble (`var module = { exports: {} }; …`) the
 *     bundled body expects — without it the factory throws
 *     `ReferenceError: module is not defined` at materialization and the
 *     renderer boot fails.
 *
 * The script finishes with two smoke tests that execute the artifact against
 * mocked platform seeds:
 *
 *  1. materialization — the factory must produce `apply`/`inject`;
 *  2. activation and render — `apply` runs against a mocked client Context,
 *     the `settings.section` registration it installs is rendered for every
 *     page phase, and the walk fails on any element whose type is missing.
 *     A primitives export that the runtime seed no longer carries (the
 *     0.1.7-rc.2 icon rename dropped every size-suffixed name) reaches the
 *     page as `undefined` and would otherwise only surface as a blank
 *     settings panel in the browser; the same walk also asserts that every
 *     wire codec the client mount hands the Remote gateway carries the
 *     factory DSH core ≥ 0.1.7-rc.2 validates (`create()`, not `schema`).
 *
 * Run: `pnpm run build:client` (or `node scripts/build-client.mjs`).
 */
import { build } from "esbuild";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const externals = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/dsh-client-ui-primitives"
];

const result = await build({
  entryPoints: [join(root, "client/src/index.js")],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2022"],
  external: externals,
  write: false,
  logLevel: "warning"
});

if (result.outputFiles.length !== 1) {
  throw new Error("expected exactly one bundle output");
}

const body = result.outputFiles[0].text;
const artifact = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {`,
  "var module = { exports: {} };",
  "var exports = module.exports;",
  'Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  body,
  "return module.exports;",
  "} });",
  ""
].join("\n");

/**
 * The platform seed's `@deepseek-ai/dsh-client-ui-primitives` surface, in both
 * naming eras this bundle supports. DSH core ≤ 0.1.5 shipped size-suffixed
 * icon names; 0.1.7-rc.2 renamed the set after its stroke weight and dropped
 * the numeric spellings. Each member is a distinct identity (or a real value),
 * so the render walk below tells a live component from the `undefined` a
 * renamed/removed export produces.
 */
function primitivesSeed(era) {
  const icon = (name) => function NamedIcon() {};
  const icons = era === "size-suffixed"
    ? {
      IconArchiveOutline20: icon("IconArchiveOutline20"),
      IconEllipsisOutline16: icon("IconEllipsisOutline16"),
      IconFolderClose16: icon("IconFolderClose16"),
      IconTrashOutline16: icon("IconTrashOutline16")
    }
    : {
      IconArchiveOutlineRegular: icon("IconArchiveOutlineRegular"),
      IconEllipsisOutlineRegular: icon("IconEllipsisOutlineRegular"),
      IconFolderCloseRegular: icon("IconFolderCloseRegular"),
      IconTrashOutlineRegular: icon("IconTrashOutlineRegular")
    };
  return {
    Button: function Button() {},
    Menu: function Menu() {},
    RiskConfirmation: function RiskConfirmation() {},
    relativeTime: () => ({ unit: "now", n: 0 }),
    ...icons
  };
}

/** The primitives eras the artifact must render against, oldest first. */
const ERAS = [
  { name: "0.1.5 (size-suffixed icons)", seed: primitivesSeed("size-suffixed") },
  { name: "0.1.7-rc.2 (stroke-weight icons)", seed: primitivesSeed("stroke-weight") }
];

/**
 * Cross-check the newest era's seed against the primitives package this build
 * targets (`devDependencies`, pinned to the line the runtime seed mirrors).
 * The seed models the platform module, which this build cannot import (the
 * published package reaches for React and the rest of the renderer stack), so
 * its export list is read from the installed artifact instead. A later rename
 * then fails here — naming the symbol — rather than in the browser, where the
 * only symptom is a blank settings panel. A checkout without node_modules
 * skips the check and still gets the render walk.
 */
function assertSeedMatchesPackage() {
  const entry = join(root, "node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js");
  if (!existsSync(entry)) {
    console.warn("warning: @deepseek-ai/dsh-client-ui-primitives is not installed; skipping the seed/package export cross-check (run pnpm install)");
    return;
  }
  const statement = /export \{([\s\S]*?)\};/.exec(readFileSync(entry, "utf8"));
  if (statement === null) throw new Error("could not read the export list of @deepseek-ai/dsh-client-ui-primitives");
  const exported = new Set(statement[1].split(",").map((name) => name.trim().split(/\s+as\s+/).pop()).filter(Boolean));
  const newest = ERAS[ERAS.length - 1];
  for (const name of Object.keys(newest.seed)) {
    if (!exported.has(name)) {
      throw new Error(`primitives seed "${name}" (${newest.name}) is not exported by @deepseek-ai/dsh-client-ui-primitives — the platform symbol was renamed or removed, so the bundle would render it as an undefined element type`);
    }
  }
}
assertSeedMatchesPackage();

/**
 * Materialize the artifact in its own realm against one era's seeds and run
 * `apply`.
 * @param seed - that era's primitives surface.
 * @returns the mount state, the registered section, and the style tags.
 */
async function activate(seed) {
  const seeds = {
    react: {
      useEffect: () => {},
      useLayoutEffect: () => {},
      useState: (value) => [value, () => {}],
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
      Fragment: "Fragment"
    },
    "react/jsx-runtime": {
      jsx: (type, props, key) => ({ __dshElement: true, type, props, key }),
      jsxs: (type, props, key) => ({ __dshElement: true, type, props, key }),
      Fragment: "Fragment"
    },
    "react-dom": {
      createPortal: (element) => element
    },
    "@deepseek-ai/dsh-client-ui-primitives": seed
  };

  // 1. Browser materialization. No `document` yet, so the module-scope
  //    stylesheet injection is a no-op here.
  let captured = null;
  const sandbox = { window: { __ModuleLoader__: { load: (entry) => { captured = entry; } } } };
  vm.createContext(sandbox);
  vm.runInContext(artifact, sandbox, { filename: "client/client.js" });
  if (captured === null) throw new Error("artifact registered no module factory");
  if (captured.id !== pkg.name) throw new Error(`artifact id ${JSON.stringify(captured.id)} does not match package name ${JSON.stringify(pkg.name)}`);
  const factoryExports = captured.factory((spec) => {
    if (Object.hasOwn(seeds, spec)) return seeds[spec];
    throw new Error(`unexpected external require: ${spec}`);
  });
  if (typeof factoryExports.apply !== "function") throw new Error("artifact exports no apply function");
  if (!Array.isArray(factoryExports.inject)) throw new Error("artifact exports no inject list");

  // 2. Activation: the minimal DOM surface `apply` touches — the settings
  //    nav-icon swap and the stylesheet tag.
  const styleTags = [];
  sandbox.document = {
    body: {},
    head: { append: (element) => styleTags.push(element) },
    createElement: () => ({ dataset: {}, textContent: "" }),
    querySelector: () => null,
    querySelectorAll: () => []
  };
  sandbox.MutationObserver = class { observe() {} disconnect() {} };
  sandbox.setInterval = () => 0;
  sandbox.clearInterval = () => {};
  sandbox.queueMicrotask = (callback) => { callback(); };

  const state = {};
  const dispose = await factoryExports.apply(mockContext(state));
  return { state, dispose, styleTags };
}

/** The archived row the render walk feeds the page. */
const ITEM = {
  sessionId: "session-1",
  title: "Smoke session",
  cwd: "/tmp/workspace",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  archivedAt: 1_700_000_200_000,
  running: false,
  readError: null
};

/** The page snapshots every phase branch renders from. */
const SNAPSHOTS = [
  { name: "ready/rows", snapshot: { phase: "ready", items: [ITEM], archivedSessionIds: [ITEM.sessionId], projects: { [ITEM.cwd]: "Workspace" }, message: { kind: "success", key: "deleted" }, pending: new Set([ITEM.sessionId]) } },
  { name: "ready/empty", snapshot: { phase: "ready", items: [], archivedSessionIds: [], projects: {}, message: null, pending: new Set() } },
  { name: "loading", snapshot: { phase: "loading", items: [], archivedSessionIds: [], projects: {}, message: null, pending: new Set() } },
  { name: "error", snapshot: { phase: "error", items: [], archivedSessionIds: [], projects: {}, message: { kind: "error", text: "boom" }, pending: new Set() } }
];

/** Walk one rendered tree and reject any element the runtime could not name. */
function assertRenderableType(node, where) {
  if (node === null || node === undefined || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertRenderableType(child, `${where}[${index}]`));
    return;
  }
  if (node.__dshElement !== true) return;
  if (node.type === undefined || node.type === null) {
    const name = node.props?.["aria-label"] ?? node.props?.className ?? "?";
    throw new Error(`${where}: element (${String(name)}) has no type — a primitives export this bundle imports is missing from the platform seed`);
  }
  assertRenderableType(node.props?.children, `${where}.children`);
}

/** Every codec DSH core ≥ 0.1.7-rc.2 validates must expose a create() factory. */
function assertCodecs(descriptors) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) throw new Error("client mount registered no remote descriptors");
  for (const descriptor of descriptors) {
    const subjects = [
      ["result", descriptor.result],
      ...(descriptor.parameters ?? []).map((parameter) => [`parameter ${parameter.name}`, parameter.codec])
    ];
    for (const [subject, codec] of subjects) {
      if (codec === undefined || typeof codec.create !== "function") {
        throw new Error(`client mount codec for ${descriptor.namespace}/${descriptor.method} ${subject} has no create() factory (DSH core ≥ 0.1.7-rc.2 rejects the contribution)`);
      }
      if (typeof codec.create().parse !== "function") {
        throw new Error(`client mount codec for ${descriptor.namespace}/${descriptor.method} ${subject} create() did not return a parsable schema`);
      }
    }
  }
}

/** The mocked client Context: just enough surface for this plugin's apply. */
function mockContext(state) {
  return {
    remote: {
      $mount: async (contribution) => {
        state.mounted = contribution;
        return async () => {};
      }
    },
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
      getLocale: () => ({ active: "zh" })
    },
    slots: {
      inject: (_key, callback) => {
        callback();
        return () => {};
      },
      register: (options, component) => {
        state.section = { options, component };
        return () => {};
      }
    },
    effect: (callback) => callback(),
    get: (key) => key === "remote.archivedSessions"
      ? { list: async () => ({ ok: true, value: { items: [], archivedSessionIds: [] } }) }
      : undefined,
    logger: { warn: () => {}, error: () => {} }
  };
}

for (const era of ERAS) {
  const { state, dispose, styleTags } = await activate(era.seed);
  const at = (what) => `${era.name}: ${what}`;
  if (state.section === undefined) throw new Error(at("apply registered no settings.section entry"));
  if (state.section.options.id !== "archived-conversations") throw new Error(at(`settings.section id ${JSON.stringify(state.section.options.id)} changed; the settings shell keys its nav icon on the id`));
  assertCodecs(state.mounted?.descriptors);
  if (styleTags.length !== 1) throw new Error(at(`apply installed ${String(styleTags.length)} stylesheet tags; the module system's claimStyles contract expects exactly one`));
  if (styleTags[0].dataset?.plugin !== pkg.name || styleTags[0].dataset?.pluginCss !== `${pkg.name}/page.css`) {
    throw new Error(at(`stylesheet tag is missing the data-plugin/data-plugin-css contract: ${JSON.stringify(styleTags[0].dataset)}`));
  }

  for (const { name, snapshot } of SNAPSHOTS) {
    const page = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      dismissMessage: () => {},
      refresh: async () => {},
      unarchive: async () => true,
      unarchiveAll: async () => {},
      deleteSession: async () => true,
      deleteAll: async () => {}
    };
    const tree = state.section.component({ page, t: (key) => key, readLocale: () => "zh" });
    assertRenderableType(tree, at(`settings.section[${name}]`));
  }
  if (typeof dispose === "function") await dispose();
}

const outPath = join(root, "client/client.js");
writeFileSync(outPath, artifact);
console.log(`built ${outPath} (${Buffer.byteLength(artifact)} bytes; smoke test: materialization + activation + ${SNAPSHOTS.length} render phases × ${ERAS.length} primitives eras OK; externals: ${externals.join(", ")})`);
