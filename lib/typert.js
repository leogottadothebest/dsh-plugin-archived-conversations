/**
 * dsh-plugin-archived-conversations — host Typert manifest.
 *
 * Loaded automatically by @deepseek-ai/dsh-typert-loader when this plugin's
 * loader entry mounts (package.json exports "./typert"); registered into
 * `ctx.typert` on the host so the API gateway serves the `archivedSessions`
 * Remote namespace with strict wire codecs, and withdrawn on unmount.
 *
 * @module dsh-plugin-archived-conversations/typert
 */
import { z } from "zod";

const sessionId = z.string().min(1);
const sessionIdRequest = z.object({ sessionId });
const archivedSessionIds = z.array(sessionId);

/** One archived conversation row on the settings page. */
const archivedSessionItem = z.object({
  sessionId,
  title: z.string().nullable(),
  cwd: z.string().nullable(),
  createdAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
  archivedAt: z.number().nullable(),
  running: z.boolean(),
  readError: z.string().nullable()
});

/** Bulk operations accept an optional project (cwd) scope. */
const bulkRequest = z.object({ cwd: z.string().optional() });

const listValue = z.object({ items: z.array(archivedSessionItem), archivedSessionIds });
const archivedIdsValue = z.object({ sessionId, archivedSessionIds });
const deleteValue = z.object({ sessionId, deleted: z.boolean() });
const unarchiveAllValue = z.object({ archivedSessionIds });
const deleteAllValue = z.object({ deleted: z.number().int().nonnegative(), archivedSessionIds });

/**
 * One strict wire codec carrying the schema twice: `schema` for DSH core
 * ≤ 0.1.5 (which validates `codec.schema.parse` and parses through the
 * instance directly) and `create` for DSH core ≥ 0.1.7-rc.2 (whose registry
 * validates the factory and whose gateway parses through
 * `codec.create().parse(value)`). Both fields hand out the same frozen zod v4
 * instance, so one manifest serves either runtime and neither field is a lie.
 */
const codec = (typeSymbol, schema) => ({
  mode: "strict",
  typeSymbol,
  schema,
  create: () => schema
});
const jsonParameter = (typeSymbol, schema) => ({
  name: "request",
  wire: "request",
  source: "json",
  codec: codec(typeSymbol, schema)
});
/** One `TYPERT.schemas` record under the same two-era contract as {@link codec}. */
const contributed = (name, schema) => ({ name, schema, create: () => schema });

export const TYPERT = {
  package: "dsh-plugin-archived-conversations",
  face: "host",
  schemas: [
    contributed("archivedSessionItem", archivedSessionItem),
    contributed("sessionIdRequest", sessionIdRequest),
    contributed("listValue", listValue),
    contributed("archivedIdsValue", archivedIdsValue),
    contributed("deleteValue", deleteValue),
    contributed("unarchiveAllValue", unarchiveAllValue),
    contributed("bulkRequest", bulkRequest),
    contributed("deleteAllValue", deleteAllValue)
  ],
  model: {
    services: [
      {
        key: "archivedSessionsRemote",
        exportName: "ArchivedSessionsRemote",
        tags: [],
        description: "Host remote for the archived-conversation registry: list archived sessions, archive, unarchive, and permanently delete them.",
        summary: "Archive lifecycle operations for conversations hidden from every grouping surface.",
        members: [
          {
            name: "list",
            signature: "list(signal: AbortSignal): Promise<ArchivedSessionsListValue>",
            kind: "method",
            tags: [],
            jsDoc: "List every archived conversation in archive order (newest first), with title, workspace path, activity timestamps, and per-row read errors."
          },
          {
            name: "archive",
            signature: "archive(request: ArchivedSessionIdRequest, signal: AbortSignal): Promise<ArchivedSessionIdsValue>",
            kind: "method",
            tags: [],
            jsDoc: "Archive one known session through the workspace registry (delegates to the built-in archive path)."
          },
          {
            name: "unarchive",
            signature: "unarchive(request: ArchivedSessionIdRequest, signal: AbortSignal): Promise<ArchivedSessionIdsValue>",
            kind: "method",
            tags: [],
            jsDoc: "Unarchive one archived session; it reappears in the sidebar through the workspace feed."
          },
          {
            name: "deleteSession",
            signature: "deleteSession(request: ArchivedSessionIdRequest, signal: AbortSignal): Promise<ArchivedSessionDeleteValue>",
            kind: "method",
            tags: [],
            jsDoc: "Permanently delete one archived session: flush and detach the live store entry, remove the persisted JSONL artifact, and clean workspace accounting plus the archive set."
          },
          {
            name: "unarchiveAll",
            signature: "unarchiveAll(request: ArchivedSessionsBulkRequest, signal: AbortSignal): Promise<ArchivedSessionsUnarchiveAllValue>",
            kind: "method",
            tags: [],
            jsDoc: "Unarchive every archived session (optionally one project) in one serialized registry write."
          },
          {
            name: "deleteAll",
            signature: "deleteAll(request: ArchivedSessionsBulkRequest, signal: AbortSignal): Promise<ArchivedSessionsDeleteAllValue>",
            kind: "method",
            tags: [],
            jsDoc: "Permanently delete every archived session (optionally one project) sequentially; per-session business failures are skipped and counted."
          }
        ],
        types: [
          {
            name: "ArchivedSessionItem",
            declaration: "export interface ArchivedSessionItem { sessionId: string; title: string | null; cwd: string | null; createdAt: number | null; updatedAt: number | null; archivedAt: number | null; running: boolean; readError: string | null; }",
            tags: []
          },
          {
            name: "ArchivedSessionIdRequest",
            declaration: "export interface ArchivedSessionIdRequest { sessionId: string; }",
            tags: []
          },
          {
            name: "ArchivedSessionsListValue",
            declaration: "export interface ArchivedSessionsListValue { items: ArchivedSessionItem[]; archivedSessionIds: string[]; }",
            tags: []
          },
          {
            name: "ArchivedSessionIdsValue",
            declaration: "export interface ArchivedSessionIdsValue { sessionId: string; archivedSessionIds: string[]; }",
            tags: []
          },
          {
            name: "ArchivedSessionDeleteValue",
            declaration: "export interface ArchivedSessionDeleteValue { sessionId: string; deleted: boolean; }",
            tags: []
          },
          {
            name: "ArchivedSessionsBulkRequest",
            declaration: "export interface ArchivedSessionsBulkRequest { cwd?: string; }",
            tags: []
          },
          {
            name: "ArchivedSessionsUnarchiveAllValue",
            declaration: "export interface ArchivedSessionsUnarchiveAllValue { archivedSessionIds: string[]; }",
            tags: []
          },
          {
            name: "ArchivedSessionsDeleteAllValue",
            declaration: "export interface ArchivedSessionsDeleteAllValue { deleted: number; archivedSessionIds: string[]; }",
            tags: []
          }
        ]
      }
    ],
    events: [],
    objects: []
  },
  invocations: [
    {
      id: "dsh-plugin-archived-conversations#archivedSessions/list",
      service: "archivedSessionsRemote",
      namespace: "archivedSessions",
      method: "list",
      invocation: { kind: "direct" },
      parameters: [],
      cancellation: { parameter: "signal" },
      result: {
        ...codec("dsh-plugin-archived-conversations#archivedSessions/list:result", listValue)
      },
      sourceLocation: { file: "lib/remote.js", line: 1, column: 1 }
    },
    {
      id: "dsh-plugin-archived-conversations#archivedSessions/archive",
      service: "archivedSessionsRemote",
      namespace: "archivedSessions",
      method: "archive",
      invocation: { kind: "direct" },
      parameters: [
        jsonParameter("dsh-plugin-archived-conversations#archivedSessions/archive:request", sessionIdRequest)
      ],
      cancellation: { parameter: "signal" },
      result: {
        ...codec("dsh-plugin-archived-conversations#archivedSessions/archive:result", archivedIdsValue)
      },
      sourceLocation: { file: "lib/remote.js", line: 1, column: 1 }
    },
    {
      id: "dsh-plugin-archived-conversations#archivedSessions/unarchive",
      service: "archivedSessionsRemote",
      namespace: "archivedSessions",
      method: "unarchive",
      invocation: { kind: "direct" },
      parameters: [
        jsonParameter("dsh-plugin-archived-conversations#archivedSessions/unarchive:request", sessionIdRequest)
      ],
      cancellation: { parameter: "signal" },
      result: {
        ...codec("dsh-plugin-archived-conversations#archivedSessions/unarchive:result", archivedIdsValue)
      },
      sourceLocation: { file: "lib/remote.js", line: 1, column: 1 }
    },
    {
      id: "dsh-plugin-archived-conversations#archivedSessions/deleteSession",
      service: "archivedSessionsRemote",
      namespace: "archivedSessions",
      method: "deleteSession",
      invocation: { kind: "direct" },
      parameters: [
        jsonParameter("dsh-plugin-archived-conversations#archivedSessions/deleteSession:request", sessionIdRequest)
      ],
      cancellation: { parameter: "signal" },
      result: {
        ...codec("dsh-plugin-archived-conversations#archivedSessions/deleteSession:result", deleteValue)
      },
      sourceLocation: { file: "lib/remote.js", line: 1, column: 1 }
    },
    {
      id: "dsh-plugin-archived-conversations#archivedSessions/unarchiveAll",
      service: "archivedSessionsRemote",
      namespace: "archivedSessions",
      method: "unarchiveAll",
      invocation: { kind: "direct" },
      parameters: [
        jsonParameter("dsh-plugin-archived-conversations#archivedSessions/unarchiveAll:request", bulkRequest)
      ],
      cancellation: { parameter: "signal" },
      result: {
        ...codec("dsh-plugin-archived-conversations#archivedSessions/unarchiveAll:result", unarchiveAllValue)
      },
      sourceLocation: { file: "lib/remote.js", line: 1, column: 1 }
    },
    {
      id: "dsh-plugin-archived-conversations#archivedSessions/deleteAll",
      service: "archivedSessionsRemote",
      namespace: "archivedSessions",
      method: "deleteAll",
      invocation: { kind: "direct" },
      parameters: [
        jsonParameter("dsh-plugin-archived-conversations#archivedSessions/deleteAll:request", bulkRequest)
      ],
      cancellation: { parameter: "signal" },
      result: {
        ...codec("dsh-plugin-archived-conversations#archivedSessions/deleteAll:result", deleteAllValue)
      },
      sourceLocation: { file: "lib/remote.js", line: 1, column: 1 }
    }
  ]
};

export default TYPERT;
