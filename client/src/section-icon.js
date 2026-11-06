/**
 * dsh-plugin-archived-conversations — settings navigation icon.
 *
 * DSH core ≥ 0.2.2-rc.1's settings shell declares a `settings.section.icon`
 * list slot, addressed by the **section id**: the shell renders the matching
 * entry inside its own icon cell, in front of the label cell it owns
 * (`dsh-client-ui-settings-general`: `<button><span class=navIcon>…
 * </span><span class=navLabel>…</span></button>`, 12px padding + 16px icon +
 * 8px gap). Registering here instead of swapping the glyph in the DOM keeps
 * this section's label on the same x as every first-party row **by
 * construction** — there is no extra flex child, so there is nothing to
 * misalign — and it leaves the shell's active state, hover and focus
 * handling untouched.
 *
 * The marker attribute is also the fallback's "the shell already handled
 * this" signal: `nav-icon.js` skips its legacy DOM swap on any dialog that
 * contains one, which is how old and new cores coexist in one bundle.
 *
 * @module dsh-plugin-archived-conversations/client/section-icon
 */
import { jsx } from "react/jsx-runtime";
import { IconArchiveOutline } from "./icons.js";

/** Attribute the slot icon carries; `nav-icon.js` looks for it. */
export const ICON_SLOT_MARKER = "data-dshacv-icon-slot";

/**
 * The archive glyph in the shell's navigation cell.
 * @param props - owner props supplied by the settings shell.
 * @param props.size - requested square edge in pixels (16 on a nav row).
 * @param props.active - whether the section is selected (the shell dims
 *   inactive rows itself, so the glyph inherits and needs no branch).
 * @returns the marked icon node.
 */
export function ArchivedSectionIcon({ size }) {
  return jsx("span", {
    "data-dshacv-icon-slot": "",
    style: { display: "inline-flex", alignItems: "center", justifyContent: "center" },
    children: jsx(IconArchiveOutline, { size: size ?? 16 })
  });
}
