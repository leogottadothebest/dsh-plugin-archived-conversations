/**
 * dsh-plugin-archived-conversations — legacy settings nav-icon swap.
 *
 * DSH core ≥ 0.2.2-rc.1 ships a first-party icon slot (`settings.section.icon`)
 * and the client registers into it — see `section-icon.js`. This module is the
 * **fallback for older cores** (≤ 0.2.0), whose settings shell hardcodes nav
 * icons per section id and offers no extension point, so a third-party section
 * gets the generic gear.
 *
 * Two lessons are baked into it:
 *
 *  1. **Never add a flex child to the nav button.** The shell's row is
 *     `[icon cell][8px gap][label]`; inserting a sibling `<span>` next to the
 *     icon cell adds its width *and* another gap, which is exactly what pushed
 *     this plugin's label ~8–24px right of every other row. The glyph is
 *     therefore inserted **inside** the shell's own icon cell, replacing the
 *     hidden gear, so the row's flex geometry stays byte-identical to its
 *     neighbours.
 *  2. **Defer to the shell when it handles the icon.** On cores that render
 *     the slot, `section-icon.js` already put the archive glyph in that cell
 *     (marked with `data-dshacv-icon-slot`); swapping again could only double
 *     it, so any dialog containing the marker is skipped outright.
 *
 * Installed from the client apply — not from the page component — so the swap
 * applies as soon as the settings panel opens, regardless of which section is
 * active. A MutationObserver runs as a microtask before the next paint (no
 * gear flash), a slow safety poll covers remounts/reconnections, and the
 * idempotent per-row check makes the whole thing self-healing across locale
 * changes and React reconciliation. It no-ops when no row matches.
 *
 * @module dsh-plugin-archived-conversations/client/nav-icon
 */
import { ICON_SLOT_MARKER } from "./section-icon.js";

const ARCHIVE_ICON_SVG = [
  '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
  '<path fill-rule="evenodd" clip-rule="evenodd" d="M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z" fill="currentColor"/>',
  '<path d="M12.7962 12.5661V11.0832H7.20548V12.5661L12.7962 12.5661Z" fill="currentColor"/>',
  "</svg>"
].join("");

/**
 * Install the legacy nav-icon swap for cores without `settings.section.icon`.
 * Reacts to DOM changes in the same frame the settings panel first renders.
 * @param readLabel - reader for the section's nav label in the active locale.
 * @returns a disposer.
 */
export function installNavIcon(readLabel) {
  let disposed = false;
  let queued = false;
  const apply = () => {
    if (disposed) return;
    const label = readLabel();
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      // The shell rendered our slot icon: it owns the cell, leave it alone.
      if (dialog.querySelector(`[${ICON_SLOT_MARKER}]`) !== null) continue;
      for (const button of dialog.querySelectorAll("nav button")) {
        const spans = [...button.children].filter((child) => child.tagName === "SPAN");
        if (!spans.some((span) => span.textContent === label)) continue;
        if (button.querySelector(".dshAcv-navIcon") !== null) continue;
        // The icon cell is the span that owns the glyph. Inserting INSIDE it
        // (rather than beside it) is what keeps the label aligned: the cell
        // keeps its 16px box and the row keeps its single 8px gap.
        const cell = spans.find((span) => span.querySelector("svg") !== null);
        // Unknown chrome — keep the shell's own glyph rather than guess.
        if (cell === undefined) continue;
        const gear = cell.querySelector("svg");
        if (gear !== null) gear.style.display = "none";
        const wrap = document.createElement("span");
        wrap.className = "dshAcv-navIcon";
        wrap.innerHTML = ARCHIVE_ICON_SVG;
        cell.insertBefore(wrap, cell.firstChild);
      }
    }
  };
  const schedule = () => {
    if (disposed || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      apply();
    });
  };
  // The observer callback runs as a microtask before the next paint, so the
  // swap lands before the gear is ever visible.
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();
  // Slow safety net: catches anything the observer missed (reconnect,
  // exotic mounting) without the 500ms-first-paint flash.
  const timer = setInterval(schedule, 1000);
  return () => {
    disposed = true;
    observer.disconnect();
    clearInterval(timer);
  };
}
