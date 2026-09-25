/**
 * dsh-plugin-archived-conversations — settings page.
 *
 * Rendered inside a `settings.section` entry; receives the page controller,
 * the locale-bound translate function, and the active-locale reader through
 * the slot inject surface.
 *
 * Layout follows the DSH settings design language: project-grouped rows
 * (like the sidebar's workspace grouping) with per-project overflow menus,
 * rendered with the `--dsw-alias-*` tokens. Rows show the archive time —
 * the moment the conversation entered the archive set — in the local
 * date/time format.
 *
 * @module dsh-plugin-archived-conversations/client/page
 */
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import {
  Button,
  Menu,
  RiskConfirmation
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
  IconArchiveOutline,
  IconEllipsisOutline,
  IconFolderClose,
  IconTrashOutline
} from "./icons.js";
import { installStyles } from "./styles.js";

/** Format an absolute archive time in the local convention (zh: 2026年8月11日，14:17). */
function formatArchiveTime(at, lang) {
  if (at === null) return null;
  const date = new Date(at);
  if (lang.startsWith("zh")) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日，${hh}:${mm}`;
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/** Split the archived rows into project groups, preserving archive order. */
function groupItems(items) {
  const groups = [];
  const byPath = new Map();
  for (const item of items) {
    const path = item.cwd ?? "";
    let group = byPath.get(path);
    if (group === undefined) {
      group = { path, items: [] };
      byPath.set(path, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  const ungrouped = groups.filter((group) => group.path === "");
  return [...groups.filter((group) => group.path !== ""), ...ungrouped];
}

/** Resolve a group's display title: workspace title → directory name → fallback. */
function projectTitle(path, projects, t) {
  if (path === "") return t("noWorkspace");
  const title = projects[path];
  if (typeof title === "string" && title !== "") return title;
  const segments = path.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

/** One conversation row: identity, archive time, unarchive/delete actions. */
function ArchivedRow({ item, t, lang, pending, onUnarchive, onDelete }) {
  const title = item.title ?? t("untitled");
  const when = formatArchiveTime(item.archivedAt, lang);
  const busy = pending;

  return jsx("li", {
    className: "dshAcv-row",
    children: [
      jsxs("div", {
        className: "dshAcv-rowMain",
        children: [
          jsx("div", { className: "dshAcv-rowTitle", title, children: title }),
          jsxs("div", {
            className: "dshAcv-rowMeta",
            children: [
              jsx("span", { children: when ?? t("timeUnknown") }),
              item.readError !== null && jsx("span", {
                className: "dshAcv-rowError",
                children: t("readErrorLabel").replace("{error}", item.readError)
              })
            ]
          })
        ]
      }),
      jsxs("div", {
        className: "dshAcv-rowActions",
        children: [
          jsx(Button, {
            variant: "outline",
            size: "sm",
            disabled: busy,
            icon: jsx(IconArchiveOutline, { size: 14 }),
            onClick: () => onUnarchive(item.sessionId),
            children: t("unarchive")
          }),
          jsx(Button, {
            variant: "outline",
            size: "sm",
            disabled: busy,
            className: "dshAcv-dangerButton",
            icon: jsx(IconTrashOutline, {}),
            onClick: () => onDelete(item),
            children: t("delete")
          })
        ]
      })
    ]
  });
}

/** One project group: header (folder icon + title + count + overflow menu) over its rows. */
function ProjectGroup({ group, projects, t, lang, pending, onUnarchive, onDelete, onUnarchiveAll, onDeleteAll }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const title = projectTitle(group.path, projects, t);
  const items = [
    {
      id: "unarchive",
      label: t("unarchiveAll"),
      icon: jsx(IconArchiveOutline, { size: 14 })
    },
    {
      id: "delete",
      label: t("deleteAll"),
      icon: jsx(IconTrashOutline, {}),
      danger: true
    }
  ];

  return jsxs("section", {
    className: "dshAcv-group",
    children: [
      jsxs("div", {
        className: "dshAcv-groupHeader",
        children: [
          jsx("span", {
            className: "dshAcv-groupIcon",
            children: jsx(IconFolderClose, { size: 14 })
          }),
          jsx("span", {
            className: "dshAcv-groupTitle",
            title: group.path === "" ? undefined : group.path,
            children: title
          }),
          jsx("span", {
            className: "dshAcv-groupCount",
            children: String(group.items.length)
          }),
          jsx(Menu, {
            open: menuOpen,
            onClose: () => setMenuOpen(false),
            items,
            onSelect: (id) => {
              setMenuOpen(false);
              if (id === "unarchive") onUnarchiveAll(group);
              else if (id === "delete") onDeleteAll(group);
            },
            portal: true,
            closeOnPointerLeave: true,
            anchor: jsx("button", {
              type: "button",
              className: "dshAcv-groupMenu",
              "aria-label": t("groupMenuAria").replace("{name}", title),
              onClick: (event) => {
                event.stopPropagation();
                setMenuOpen((open) => !open);
              },
              children: jsx(IconEllipsisOutline, {})
            })
          })
        ]
      }),
      jsx("ul", {
        className: "dshAcv-list",
        children: group.items.map((item) => jsx(ArchivedRow, {
          item,
          t,
          lang,
          pending: pending.has(item.sessionId),
          onUnarchive,
          onDelete
        }, item.sessionId))
      })
    ]
  });
}

/**
 * The archived-conversations settings page.
 * @param page - {@link ArchivedConversationsController}.
 * @param t - locale-bound translate function for this plugin's namespace.
 * @param readLocale - reader for the active locale id.
 */
export function ArchivedConversationsPage({ page, t, readLocale }) {
  const snapshot = useSyncExternalStore(page.subscribe, page.getSnapshot, page.getSnapshot);
  const [confirmItem, setConfirmItem] = useState(null);
  const [confirmAll, setConfirmAll] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const lang = readLocale() ?? "en";

  // Re-assert the stylesheet every time this page mounts (idempotent; runs
  // before paint). The module-scope injection covers boot; this covers a tag
  // removed mid-session by anything else — the page can never render unstyled.
  useLayoutEffect(() => {
    installStyles();
  }, []);

  // Reset the confirmation dialog whenever its target changes or closes.
  useEffect(() => {
    setAcknowledged(false);
  }, [confirmItem, confirmAll]);

  useEffect(() => {
    if (snapshot.message === null) return;
    const timer = setTimeout(() => page.dismissMessage(), 5000);
    return () => clearTimeout(timer);
  }, [snapshot.message, page]);

  const busyCount = snapshot.pending.size;
  const groups = groupItems(snapshot.items);

  const onConfirmSingleDelete = async () => {
    if (confirmItem === null) return;
    const sessionId = confirmItem.sessionId;
    setConfirmItem(null);
    setAcknowledged(false);
    await page.deleteSession(sessionId);
  };

  const onConfirmBulkDelete = async () => {
    if (confirmAll === null) return;
    const cwd = confirmAll.cwd;
    setConfirmAll(null);
    setAcknowledged(false);
    await page.deleteAll(cwd);
  };

  const openBulkConfirm = (group) => {
    setConfirmAll({
      cwd: group.path === "" ? undefined : group.path,
      title: projectTitle(group.path, snapshot.projects, t),
      count: group.items.length
    });
    setAcknowledged(false);
  };

  return jsxs("div", {
    className: "dshAcv",
    "data-dshb-scan": true,
    children: [
      jsxs("header", {
        className: "dshAcv-header",
        children: [
          jsxs("div", {
            children: [
              jsx("h2", { className: "dshAcv-title", children: t("heading") }),
              jsx("p", { className: "dshAcv-description", children: t("description") })
            ]
          }),
          jsxs("div", {
            className: "dshAcv-toolbar",
            children: [
              jsx(Button, {
                variant: "outline",
                size: "sm",
                disabled: snapshot.phase !== "ready" || snapshot.items.length === 0 || busyCount > 0,
                icon: jsx(IconArchiveOutline, { size: 14 }),
                onClick: () => void page.unarchiveAll(undefined),
                children: t("unarchiveAll")
              }),
              jsx(Button, {
                variant: "outline",
                size: "sm",
                disabled: snapshot.phase !== "ready" || snapshot.items.length === 0 || busyCount > 0,
                className: "dshAcv-dangerButton",
                icon: jsx(IconTrashOutline, {}),
                onClick: () => {
                  setConfirmAll({ cwd: undefined, title: t("heading"), count: snapshot.items.length });
                  setAcknowledged(false);
                },
                children: t("deleteAll")
              })
            ]
          })
        ]
      }),

      snapshot.phase === "ready" && snapshot.message !== null && jsx("div", {
        className: `dshAcv-banner dshAcv-banner-${snapshot.message.kind}`,
        children: snapshot.message.key !== undefined
          ? t(snapshot.message.key)
            .replace("{n}", String(snapshot.message.failed ?? snapshot.message.deleted ?? 0))
          : snapshot.message.text
      }),

      snapshot.phase === "loading" && jsx("div", {
        className: "dshAcv-state",
        children: jsx("span", { className: "dshAcv-spinner", "aria-hidden": "true" })
      }),

      snapshot.phase === "error" && jsxs("div", {
        className: "dshAcv-state",
        children: [
          jsx("p", {
            className: "dshAcv-stateText",
            children: t("errorLabel").replace("{error}", snapshot.message?.text ?? "")
          }),
          jsx(Button, { variant: "outline", size: "sm", onClick: () => void page.refresh(), children: t("retry") })
        ]
      }),

      snapshot.phase === "ready" && groups.length === 0 && jsxs("div", {
        className: "dshAcv-state",
        children: [
          jsx(IconArchiveOutline, { size: 28, className: "dshAcv-stateIcon" }),
          jsx("p", { className: "dshAcv-stateText", children: t("empty") })
        ]
      }),

      snapshot.phase === "ready" && groups.length > 0 && jsx("div", {
        className: "dshAcv-listWrap",
        children: groups.map((group) => jsx(ProjectGroup, {
          group,
          projects: snapshot.projects,
          t,
          lang,
          pending: snapshot.pending,
          onUnarchive: (sessionId) => void page.unarchive(sessionId),
          onDelete: (item) => {
            setConfirmItem(item);
            setAcknowledged(false);
          },
          onUnarchiveAll: (target) => void page.unarchiveAll(target.path === "" ? undefined : target.path),
          onDeleteAll: openBulkConfirm
        }, group.path === "" ? "__ungrouped__" : group.path))
      }),

      jsx(RiskConfirmation, {
        open: confirmItem !== null,
        title: t("confirmTitle"),
        description: t("confirmDescription").replace("{title}", confirmItem?.title ?? t("untitled")),
        acknowledgeLabel: t("acknowledge"),
        cancelLabel: t("cancel"),
        closeLabel: t("cancel"),
        confirmLabel: t("confirmDelete"),
        acknowledged,
        disabled: snapshot.pending.size > 0,
        onAcknowledgedChange: setAcknowledged,
        onCancel: () => {
          setConfirmItem(null);
          setAcknowledged(false);
        },
        onConfirm: () => void onConfirmSingleDelete()
      }),

      jsx(RiskConfirmation, {
        open: confirmAll !== null,
        title: t("confirmAllTitle"),
        description: confirmAll !== null && confirmAll.cwd !== undefined
          ? t("confirmProjectDescription").replace("{title}", confirmAll.title).replace("{n}", String(confirmAll.count))
          : t("confirmAllDescription").replace("{n}", String(snapshot.items.length)),
        acknowledgeLabel: t("acknowledge"),
        cancelLabel: t("cancel"),
        closeLabel: t("cancel"),
        confirmLabel: t("confirmDeleteAll"),
        acknowledged,
        disabled: snapshot.pending.size > 0,
        onAcknowledgedChange: setAcknowledged,
        onCancel: () => {
          setConfirmAll(null);
          setAcknowledged(false);
        },
        onConfirm: () => void onConfirmBulkDelete()
      })
    ]
  });
}
