/**
 * dsh-plugin-archived-conversations — page styles.
 *
 * One injected <style> element scoped by the `dshAcv-` class prefix. All
 * colors and radii ride the DSH design tokens (`--dsw-alias-*`), so the
 * page inherits the application's theme, density, and light/dark handling
 * instead of defining its own palette.
 *
 * Lifecycle follows the DSH client convention (see the first-party bundles,
 * e.g. dsh-client-ui-theme): the tag is stamped with BOTH `data-plugin` and
 * `data-plugin-css`, created at module materialization — before the host's
 * `claimStyles` inventory runs, so the module system records the tag as
 * this plugin's own stylesheet — and it is NEVER removed on dispose. A
 * disposer-removal cycle is exactly what could leave a live page with a
 * working component but no stylesheet (remove-after-remount interleaving),
 * so the injection is idempotent and is re-asserted whenever the settings
 * page opens; the tag is inert when the page is not mounted.
 *
 * @module dsh-plugin-archived-conversations/client/styles
 */

/** `data-plugin` value: the owning client module (package name). */
const STYLE_ID = "dsh-plugin-archived-conversations";
/** `data-plugin-css` value: the stylesheet identity, mirroring first-party css ids. */
const STYLE_CSS_ID = "dsh-plugin-archived-conversations/page.css";

const css = `
.dshAcv {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.dshAcv-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dshAcv-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.dshAcv-headingIcon {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-module-platform);
  border: 1px solid var(--dsw-alias-border-l2);
}

.dshAcv-title {
  margin: 0 0 2px;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--dsw-alias-label-primary);
}

.dshAcv-description {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.dshAcv-navIcon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

.dshAcv-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

/* View filter: keep real conversations, hide archived empty placeholders. */
.dshAcv-filterBar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: -6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.dshAcv-filterLabel {
  color: var(--dsw-alias-label-primary);
}

.dshAcv-filterCount {
  color: var(--dsw-alias-label-tertiary);
}

/* Empty (never-prompted) placeholder, shown only when the filter is off. */
.dshAcv-rowBlank {
  border-style: dashed;
  background: transparent;
}

.dshAcv-rowBlank .dshAcv-rowTitle {
  color: var(--dsw-alias-label-secondary);
  font-style: italic;
}

.dshAcv-toolbar .dshAcv-dangerButton,
.dshAcv .dshAcv-dangerButton,
.dshAcv .dshAcv-dangerButton:hover {
  color: var(--dsw-alias-label-error, #e5484d) !important;
}

.dshAcv-banner {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 18px;
  border: 1px solid transparent;
}

.dshAcv-banner-success {
  color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-secondary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent);
}

.dshAcv-banner-error {
  color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-secondary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
}

.dshAcv-listWrap {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dshAcv-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.dshAcv-groupHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.dshAcv-groupIcon {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-dimmed);
}

.dshAcv-groupTitle {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dshAcv-groupCount {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
}

.dshAcv-groupMenu {
  flex: none;
  margin-left: auto;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 0;
}

.dshAcv-groupMenu:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshAcv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dshAcv-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
  transition: border-color 120ms ease, background-color 120ms ease;
}

.dshAcv-row:hover {
  border-color: var(--dsw-alias-border-l3);
}

.dshAcv-rowMain {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dshAcv-rowTitle {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dshAcv-rowMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.dshAcv-rowError {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-warn-primary);
}

.dshAcv-rowActions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.dshAcv-rowActions .dshAcv-dangerButton:hover {
  color: var(--dsw-alias-label-error, #e5484d) !important;
}

.dshAcv-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 16px;
  text-align: center;
}

.dshAcv-stateIcon {
  color: var(--dsw-alias-label-dimmed);
}

.dshAcv-stateText {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}

.dshAcv-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-brand-primary);
  animation: dshAcvSpin 700ms linear infinite;
}

@keyframes dshAcvSpin {
  to { transform: rotate(360deg); }
}

@media (max-width: 560px) {
  .dshAcv-header {
    flex-direction: column;
  }
  .dshAcv-row {
    flex-direction: column;
  }
  .dshAcv-rowActions {
    width: 100%;
    justify-content: flex-end;
  }
}
`;

/**
 * Install the scoped stylesheet (idempotent; safe to call any time, anywhere —
 * module scope, apply, and every page mount). Never removes an existing tag.
 */
export function installStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_CSS_ID}"]`) !== null) return;
  const style = document.createElement("style");
  style.dataset.plugin = STYLE_ID;
  style.dataset.pluginCss = STYLE_CSS_ID;
  style.textContent = css;
  document.head.append(style);
}
