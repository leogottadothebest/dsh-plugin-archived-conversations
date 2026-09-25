/**
 * dsh-plugin-archived-conversations — primitives icon resolution.
 *
 * DSH core ≤ 0.1.5 shipped size-suffixed icon names (`IconArchiveOutline20`,
 * `IconTrashOutline16`, …); 0.1.7-rc.2 renamed the whole set after the stroke
 * weight it draws with (`…Regular` / `…Medium`) and dropped every numeric
 * spelling. The platform seed is the same module on both lines, so the
 * spelling a runtime does not know is simply `undefined` — resolving through
 * `??` lets one bundle render on either line instead of reaching an undefined
 * element type (a blank settings page) on one of them.
 *
 * The build's render smoke test exercises both seed shapes, so a name that
 * disappears from BOTH eras still fails the build.
 *
 * @module dsh-plugin-archived-conversations/client/icons
 */
import * as primitives from "@deepseek-ai/dsh-client-ui-primitives";

/** Archive glyph, used by the row action, the group menu, the toolbar and the empty state. */
export const IconArchiveOutline =
  primitives.IconArchiveOutlineRegular ?? primitives.IconArchiveOutline20;

/** Overflow-menu glyph on a project group header. */
export const IconEllipsisOutline =
  primitives.IconEllipsisOutlineRegular ?? primitives.IconEllipsisOutline16;

/** Closed-folder glyph on a project group header. */
export const IconFolderClose =
  primitives.IconFolderCloseRegular ?? primitives.IconFolderClose16;

/** Destructive-action glyph. */
export const IconTrashOutline =
  primitives.IconTrashOutlineRegular ?? primitives.IconTrashOutline16;
