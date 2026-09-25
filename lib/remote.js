/**
 * dsh-plugin-archived-conversations — host remote service.
 *
 * Owns the `archivedSessions` Remote namespace (service key
 * `archivedSessionsRemote`). The workspace registry already keeps the
 * authoritative archive set (`archivedSessionIds`); this service adds the
 * missing lifecycle halves:
 *
 *   - `list`          — archived rows for the settings page (title, cwd,
 *                       activity time, per-row read errors),
 *   - `archive`       — delegate to the built-in registry archive,
 *   - `unarchive`     — remove one id from the archive set,
 *   - `deleteSession` — permanent deletion: live-store teardown, durable
 *                       artifact removal, workspace accounting and archive
 *                       set cleanup.
 *
 * All registry mutations run through the registry's `enqueueOperation`
 * chain, so they serialize against every other workspace write; the storage
 * domain publishes `domain/changed` for each committed state write, which
 * the workspace feed turns into client `archived` increments — unarchive
 * therefore brings the conversation straight back into the sidebar without
 * any extra plumbing.
 *
 * @module dsh-plugin-archived-conversations/remote
 */
import { dirname } from "node:path";
import { rm } from "node:fs/promises";
import { Service } from "@deepseek-ai/cordis";
import { SessionLogOffset } from "@deepseek-ai/dsh-session";
import { RemoteError, TypertRemoteService, remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { archiveTimesDomainSpec } from "./times.js";

/** Cordis service key (must match the Typert invocation `service` field). */
export const ARCHIVED_SESSIONS_SERVICE_KEY = "archivedSessionsRemote";
/** Wire namespace (must match the Typert invocation `namespace` field). */
export const ARCHIVED_SESSIONS_NAMESPACE = "archivedSessions";

/**
 * Raise one business failure carried to the client as `{ ok: false, error }`.
 *
 * The wire failure type is `RemoteError`, discriminated structurally by its
 * `code` (`remoteErrorOf`) — never by `instanceof`, per the protocol's
 * cross-realm contract.
 */
function failure(code, message, details = {}) {
  return new RemoteError(code, message, details);
}

/**
 * Whether a caught value is a Remote business failure this host raised, on
 * any realm copy of the failure class.
 */
function isRemoteFailure(value) {
  return remoteErrorOf(value) !== undefined;
}

/**
 * Detach one live session from the SessionStore.
 *
 * The store's public surface only returns a detach disposer to the fiber
 * that called `enter()`; there is no public remove-by-id. The compiled
 * SessionStore keeps its entry map and `detachEntered(entry)` reachable, so
 * this helper uses them under a feature guard and fails with a clear
 * business error when a future refactor hides them. Detaching emits
 * `session/disposed`, which drives the persistence retirement drain — so the
 * caller must flush BEFORE calling this, and must not delete the artifact
 * until the flush settled (see `deleteSession`).
 *
 * @param sessions - the live SessionStore service (`ctx.sessions`).
 * @param sessionId - the session to detach.
 * @returns true when an entry was detached, false when none was live.
 * @throws {RemoteError} when the internal escape hatch is unavailable.
 */
function detachLiveSession(sessions, sessionId) {
  if (typeof sessions?.detachEntered !== "function" || !(sessions.store instanceof Map)) {
    throw failure(
      "live-detach-unsupported",
      `session "${sessionId}" is live and this build exposes no store detach surface; retry after the session is no longer open`,
      { sessionId }
    );
  }
  const entry = sessions.store.get(sessionId);
  if (entry === undefined) return false;
  sessions.detachEntered(entry);
  return true;
}

/**
 * Host remote for archived-conversation management.
 *
 * NO `#` private members here, deliberately. Cordis hands every service out
 * through a traceable `Proxy` (`Context.get()` → `getTraceable` →
 * `createTraceable`), and the Typert gateway invokes a Remote method with
 * `Reflect.apply(method, ctx.get(serviceKey), args)` — so `this` inside a
 * gateway-dispatched method is that Proxy, not the raw instance. A `#private`
 * brand check does not survive a Proxy and throws
 * `TypeError: Receiver must be an instance of class ArchivedSessionsRemote`,
 * which surfaces as a per-row `readError` (or a failing bulk action) instead
 * of data. Internal state therefore uses ordinary underscore-prefixed
 * members, and `scripts/check-host.mjs` fails the build if `#` comes back.
 */
export class ArchivedSessionsRemote extends TypertRemoteService {
  static inject = [
    "workspaceRegistry",
    "sessionPersistence",
    "sessions",
    "sessionProjections",
    "sessionProjectionCache",
    "storageDomain"
  ];

  /** Archive-time table, opened at service init. */
  timesTable;
  /** Last observed archive set, for transition stamping (internal). */
  _lastArchived = [];

  constructor(ctx) {
    super(ctx, ARCHIVED_SESSIONS_SERVICE_KEY, { namespace: ARCHIVED_SESSIONS_NAMESPACE });
  }

  /**
   * Open the archive-time domain and watch the workspace archive set: a
   * conversation entering the set (through the sidebar menu or this
   * plugin's own endpoints) gets stamped with the current time.
   *
   * Conversations archived before this service started have no record, so
   * their entries are backfilled once with the closest real timestamp the
   * session carries (last activity, then creation) — an approximation the
   * UI prefers over an empty field. Re-archiving always stamps the exact
   * moment.
   */
  async [Service.init]() {
    const domain = await this.ctx.storageDomain.open(archiveTimesDomainSpec);
    this.ctx.effect(() => () => domain.close(), "archived-conversations: archive-time domain close");
    this.timesTable = domain.table("sessions");
    this._lastArchived = [...this.ctx.workspaceRegistry.archivedSessionIds];
    for (const sessionId of this._lastArchived) {
      if (this.timesTable.get(sessionId) !== undefined) continue;
      try {
        const row = await this.describe(sessionId);
        const fallback = row.updatedAt ?? row.createdAt ?? Date.now();
        await this.timesTable.put(sessionId, { archivedAt: fallback });
      } catch (error) {
        // A single unreadable entry must not fail the service activation.
        this.ctx.logger.warn(`archived-conversations: archive-time backfill for "${sessionId}" failed: ${String(error)}`);
      }
    }
    this.ctx.on("domain/changed", (change) => {
      if (change.domain !== "workspace" || change.table !== "") return;
      queueMicrotask(() => {
        this.reconcileArchiveTimes().catch((error) => {
          this.ctx.logger.warn(`archived-conversations: archive-time reconcile failed: ${String(error)}`);
        });
      });
    });
  }

  /** Stamp every id that just entered the archive set. */
  async reconcileArchiveTimes() {
    const current = this.ctx.workspaceRegistry.archivedSessionIds;
    const previous = new Set(this._lastArchived);
    const now = Date.now();
    for (const sessionId of current) {
      if (previous.has(sessionId)) continue;
      await this.timesTable.put(sessionId, { archivedAt: now });
    }
    this._lastArchived = [...current];
  }

  /** Archive time for one id, when a record exists. */
  archivedAtOf(sessionId) {
    const record = this.timesTable?.get(sessionId);
    return typeof record?.archivedAt === "number" ? record.archivedAt : null;
  }

  /** Forget the stamp of a permanently deleted session. */
  async forgetArchiveTime(sessionId) {
    await this.timesTable?.delete(sessionId);
  }

  /**
   * Filter archived ids to one project's cwd. An unreadable row cannot
   * match a project filter (the unfiltered bulk paths still reach it).
   * Internal (underscore, not `#`): see the class note on the traceable Proxy.
   */
  async _matchProject(ids, cwd, signal) {
    if (cwd === undefined) return [...ids];
    const matches = [];
    for (const sessionId of ids) {
      signal?.throwIfAborted();
      try {
        const header = await this.ctx.workspaceRegistry.readSessionHeader(sessionId);
        if (header?.cwd === cwd) matches.push(sessionId);
      } catch {
        // Unreadable rows are skipped by project-scoped sweeps.
      }
    }
    return matches;
  }

  /**
   * Cold-row projection ladder, mirroring the core session list's
   * `projectionsFor`: the strict identity-checked checkpoint read first, then
   * the title-only predecessor hint. A checkpoint written before a session
   * format migration carries no `formatVersion`, so it fails the strict
   * identity check even though it names the same lifecycle — the predecessor
   * rung serves its title (validated against the current title unit's row
   * version and schema) instead of dropping a title the log still holds.
   * `cachedPredecessorTitle` is feature-guarded: runtimes that predate it
   * simply serve the strict read.
   *
   * The listing face changed shape in DSH core 0.1.7-rc.2. Up to 0.1.5 the
   * pair took the listed log's inherited cut —
   * `cachedSnapshot(meta, inheritedEventCount, keys?)` and
   * `cachedPredecessorTitle(meta, inheritedEventCount)` — because the cache
   * record was located by the full log identity. From 0.1.7-rc.2 the record is
   * bound by the header's lifecycle alone (`formatVersion`, `createdAt`,
   * `cwd`, `isSeeded`; within one format generation the fork cut is fixed, so
   * it distinguishes no lifecycle the other fields do not), and the pair
   * became `cachedSnapshot(meta, keys?)` / `cachedPredecessorTitle(meta)` —
   * the old cut is now read as `keys`, a non-iterable brand, and throws. The
   * declared arity is the discriminator: only a face that still asks for the
   * cut is handed one.
   * Internal (underscore, not `#`): see the class note on the traceable Proxy.
   */
  _coldProjections(header) {
    const cache = this.ctx.get("sessionProjectionCache");
    if (typeof cache?.cachedSnapshot !== "function") return cache?.cachedPredecessorTitle?.(header);
    if (cache.cachedSnapshot.length >= 3) {
      // ≤ 0.1.5 listing face: the inherited cut is a required argument.
      const cut = SessionLogOffset(0);
      return cache.cachedSnapshot(header, cut) ?? cache.cachedPredecessorTitle?.(header, cut);
    }
    // ≥ 0.1.7-rc.2 listing face: header-bound, no cut.
    return cache.cachedSnapshot(header) ?? cache.cachedPredecessorTitle?.(header);
  }

  /**
   * Resolve one archived row through the zero-I/O projection ladder (the same
   * rung the core session list serves rows from): live sessions read the
   * already-materialized cells of the in-memory projection registry; cold
   * sessions read the persisted projection cache's durable checkpoint rows
   * (identity-witnessed by the stored header, with the predecessor-title
   * fallback above; seeded logs are excluded, they need a tail read the cache
   * cannot serve). A row that cannot be read still returns with `readError`
   * set — the management page must be able to delete a broken archive entry.
   */
  async describe(sessionId, signal) {
    signal?.throwIfAborted();
    const row = {
      sessionId,
      title: null,
      cwd: null,
      createdAt: null,
      updatedAt: null,
      archivedAt: null,
      running: this.ctx.sessions.get(sessionId) !== undefined,
      readError: null
    };
    try {
      const header = await this.ctx.workspaceRegistry.readSessionHeader(sessionId);
      signal?.throwIfAborted();
      const live = this.ctx.sessions.get(sessionId);
      const projections = live !== undefined
        ? this.ctx.get("sessionProjections")?.cachedSnapshot?.(live)
        : header.isSeeded === true
          ? undefined
          : this._coldProjections(header);
      const values = projections?.values;
      const lastPromptAt = values?.sessionListMetadata?.lastPromptAt ?? 0;
      row.title = values?.title ?? null;
      row.cwd = header.cwd ?? null;
      row.createdAt = header.createdAt ?? null;
      row.updatedAt = Math.max(header.createdAt ?? 0, lastPromptAt) || null;
      row.archivedAt = this.archivedAtOf(sessionId);
    } catch (error) {
      row.readError = error instanceof Error ? error.message : String(error);
    }
    return row;
  }

  /**
   * List every archived conversation, newest archived first.
   * @param signal - cancellation for header reads.
   */
  async list(signal) {
    const registry = this.ctx.workspaceRegistry;
    const ids = [...registry.archivedSessionIds].reverse();
    const items = [];
    for (const sessionId of ids) {
      items.push(await this.describe(sessionId, signal));
    }
    return { items, archivedSessionIds: [...registry.archivedSessionIds] };
  }

  /**
   * Archive one known session through the built-in registry path. Provided
   * for API completeness; the sidebar menu already archives through the core
   * workspace controller.
   */
  async archive(request, signal) {
    signal?.throwIfAborted();
    await this.ctx.workspaceRegistry.archiveSession(request.sessionId);
    return {
      sessionId: request.sessionId,
      archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds]
    };
  }

  /**
   * Unarchive one session: remove its id from the durable archive set. The
   * session keeps its workspace accounting, so it reappears exactly where it
   * was in the sidebar as soon as the workspace feed replays the change.
   */
  async unarchive(request, signal) {
    signal?.throwIfAborted();
    const registry = this.ctx.workspaceRegistry;
    const { sessionId } = request;
    if (!registry.archivedSessionIds.includes(sessionId)) {
      throw failure("not-archived", `session "${sessionId}" is not archived`, { sessionId });
    }
    await registry.enqueueOperation(async () => {
      const state = registry.requireState();
      if (!state.archivedSessionIds.includes(sessionId)) return;
      await registry.setState({
        ...state,
        archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId)
      });
    });
    return { sessionId, archivedSessionIds: [...registry.archivedSessionIds] };
  }

  /**
   * Unarchive every archived session (optionally scoped to one project's
   * cwd) in one serialized registry write: the archive set is replaced once,
   * so the workspace feed emits a single `archived` increment and the
   * sidebar restores every conversation together.
   */
  async unarchiveAll(request, signal) {
    signal?.throwIfAborted();
    const registry = this.ctx.workspaceRegistry;
    const ids = await this._matchProject([...registry.archivedSessionIds], request?.cwd, signal);
    if (ids.length === 0) return { archivedSessionIds: [...registry.archivedSessionIds] };
    await registry.enqueueOperation(async () => {
      const state = registry.requireState();
      await registry.setState({
        ...state,
        archivedSessionIds: state.archivedSessionIds.filter((id) => !ids.includes(id))
      });
    });
    return { archivedSessionIds: [...registry.archivedSessionIds] };
  }

  /**
   * Permanently delete every archived session (optionally scoped to one
   * project's cwd), sequentially, reusing the single-session deletion order
   * (flush → detach → artifact removal → registry cleanup). A per-session
   * business failure is skipped and counted in the result instead of
   * aborting the sweep.
   */
  async deleteAll(request, signal) {
    const registry = this.ctx.workspaceRegistry;
    const ids = await this._matchProject([...registry.archivedSessionIds], request?.cwd, signal);
    let deleted = 0;
    for (const sessionId of ids) {
      signal?.throwIfAborted();
      try {
        await this.deleteSession({ sessionId }, signal);
        deleted += 1;
      } catch (error) {
        if (isRemoteFailure(error)) {
          this.ctx.logger.warn(`archived-conversations: deleteAll skipped "${sessionId}": ${error.message}`);
          continue;
        }
        throw error;
      }
    }
    return { deleted, archivedSessionIds: [...registry.archivedSessionIds] };
  }

  /**
   * Permanently delete one archived session.
   *
   * Order matters:
   *  1. flush the live store entry (public `SessionStore.flush`) so every
   *     buffered event is durable before anything is removed;
   *  2. detach the entry (feature-guarded) — the paired `session/disposed`
   *     retirement drain then finds nothing left to write;
   *  3. remove the persisted artifact directory (`fs.rm`, recursive);
   *  4. inside one registry operation: drop the id from the archive set and
   *     detach it from its workspace's `sessionIds` accounting.
   *
   * A row whose artifact is already gone (broken archive entry) still
   * cleans the registry — the operation is self-healing.
   */
  async deleteSession(request, signal) {
    signal?.throwIfAborted();
    const registry = this.ctx.workspaceRegistry;
    const { sessionId } = request;
    if (!registry.archivedSessionIds.includes(sessionId)) {
      throw failure("not-archived", `session "${sessionId}" is not archived`, { sessionId });
    }

    // 1 + 2 — live-store teardown.
    const sessions = this.ctx.sessions;
    const live = sessions.get(sessionId);
    if (live !== undefined) {
      await sessions.flush(live);
      detachLiveSession(sessions, sessionId);
    }

    // 3 — durable artifact removal. `locate` is the jsonl backend's path
    // resolution; a backend without it cannot support deletion.
    try {
      const header = await registry.readSessionHeader(sessionId);
      const location = this.ctx.sessionPersistence.locate?.(header);
      if (location === undefined) {
        throw failure(
          "unsupported-backend",
          "this session-persistence backend does not expose session artifacts; nothing was removed from disk",
          { sessionId }
        );
      }
      await rm(dirname(location.path), { recursive: true, force: true });
    } catch (error) {
      if (isRemoteFailure(error)) throw error;
      // Header lookup or removal failed; registry cleanup still proceeds so
      // the archive entry cannot resurrect a half-deleted conversation.
      this.ctx.logger.warn(`archived-conversations: artifact removal for "${sessionId}" failed: ${String(error)}`);
    }

    // 4 — registry cleanup in one serialized operation.
    await registry.enqueueOperation(async () => {
      const state = registry.requireState();
      await registry.setState({
        ...state,
        archivedSessionIds: state.archivedSessionIds.filter((id) => id !== sessionId)
      });
      for (const entity of registry.list()) {
        if (entity.sessionIds.includes(sessionId)) await entity.detachSession(sessionId);
      }
    });

    // 5 — forget the archive-time stamp.
    await this.forgetArchiveTime(sessionId);

    return { sessionId, deleted: true };
  }
}

export default ArchivedSessionsRemote;
