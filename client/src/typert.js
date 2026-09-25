/**
 * dsh-plugin-archived-conversations — client Typert contribution.
 *
 * Mounted by the client entry through `ctx.remote.$mount(TYPERT_REMOTE)`,
 * which installs the `remote.archivedSessions` namespace service with strict
 * wire codecs. The wire shapes must mirror the host manifest in lib/typert.js.
 *
 * @module dsh-plugin-archived-conversations/client/typert
 */
import { z } from "zod";

const sessionId = z.string().min(1);
const sessionIdRequest = z.object({ sessionId });
const archivedSessionIds = z.array(sessionId);

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
 * ≤ 0.1.5 (whose client registry validates `codec.schema.parse`) and `create`
 * for DSH core ≥ 0.1.7-rc.2 (whose registry validates the factory). The mount
 * is rejected outright by a registry that cannot find the field it expects,
 * so both fields hand out the same zod v4 instance.
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

const descriptor = (method, parameters, cancellation, resultSchema) => ({
  id: `dsh-plugin-archived-conversations#archivedSessions/${method}`,
  service: "archivedSessionsRemote",
  namespace: "archivedSessions",
  method,
  invocation: { kind: "direct" },
  parameters,
  ...(cancellation ? { cancellation: { parameter: "signal" } } : {}),
  result: {
    ...codec(`dsh-plugin-archived-conversations#archivedSessions/${method}:result`, resultSchema)
  },
  sourceLocation: { file: "client/typert.js", line: 1, column: 1 }
});

export const TYPERT_REMOTE = {
  package: "dsh-plugin-archived-conversations",
  descriptors: [
    descriptor("list", [], true, listValue),
    descriptor(
      "archive",
      [jsonParameter("dsh-plugin-archived-conversations#archivedSessions/archive:request", sessionIdRequest)],
      true,
      archivedIdsValue
    ),
    descriptor(
      "unarchive",
      [jsonParameter("dsh-plugin-archived-conversations#archivedSessions/unarchive:request", sessionIdRequest)],
      true,
      archivedIdsValue
    ),
    descriptor(
      "deleteSession",
      [jsonParameter("dsh-plugin-archived-conversations#archivedSessions/deleteSession:request", sessionIdRequest)],
      true,
      deleteValue
    ),
    descriptor(
      "unarchiveAll",
      [jsonParameter("dsh-plugin-archived-conversations#archivedSessions/unarchiveAll:request", bulkRequest)],
      true,
      unarchiveAllValue
    ),
    descriptor(
      "deleteAll",
      [jsonParameter("dsh-plugin-archived-conversations#archivedSessions/deleteAll:request", bulkRequest)],
      true,
      deleteAllValue
    )
  ]
};

export default TYPERT_REMOTE;
