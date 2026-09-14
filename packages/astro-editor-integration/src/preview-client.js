// This file is injected only into a runner-managed Astro dev page. It has no API
// credentials and can report observations only; source writes stay in the app.
(() => {
  const VERSION = "stellar.editor.v1";
  const PROPERTIES = ["color", "background-color", "padding-inline", "padding-block", "gap", "border-radius"];
  const ROUTE = /^\/(?:[a-z0-9-]+\/)*$/;
  const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const origin = "__STELLAR_APP_ORIGIN__";
  const referringOrigin = (() => { try { return new URL(document.referrer).origin; } catch { return null; } })();
  if (referringOrigin !== origin || window.parent === window) return;

  let scope = null;
  let mode = "inspect";
  let nodes = new Map();
  let current = null;
  let hover = null;
  let overlay = null;
  let hoverOverlay = null;

  const rect = (element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  };
  const validScope = (value) => value && value.protocolVersion === VERSION &&
    ["projectId", "sessionId", "previewGeneration", "frameId", "pageId", "sourceRevision"].every((key) =>
      typeof value[key] === "string" && ID.test(value[key]));
  const sameScope = (value) => scope && validScope(value) &&
    ["projectId", "sessionId", "previewGeneration", "frameId", "pageId", "sourceRevision"].every((key) => value[key] === scope[key]);
  const post = (type, payload) => {
    if (scope) window.parent.postMessage({ ...scope, type, payload }, origin);
  };
  const makeOverlay = (color) => {
    const element = document.createElement("div");
    element.setAttribute("aria-hidden", "true");
    Object.assign(element.style, {
      position: "fixed", zIndex: "2147483647", pointerEvents: "none", boxSizing: "border-box",
      border: `2px solid ${color}`, background: color === "#0071ce" ? "rgba(0,113,206,.08)" : "rgba(20,184,166,.07)",
      borderRadius: "3px", display: "none", transition: "top 60ms, left 60ms, width 60ms, height 60ms",
    });
    document.documentElement.appendChild(element);
    return element;
  };
  const paint = (element, frame) => {
    if (!frame) return;
    if (!element || mode !== "inspect" || !element.isConnected) { frame.style.display = "none"; return; }
    const bounds = rect(element);
    Object.assign(frame.style, {
      display: "block", left: `${bounds.x}px`, top: `${bounds.y}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
    });
  };
  const refresh = () => {
    paint(current, overlay);
    paint(hover, hoverOverlay);
    if (current && scope && current.isConnected) {
      const occurrenceId = current.dataset.stellarOccurrence;
      if (occurrenceId) post("geometry", { occurrenceId, geometry: rect(current) });
    } else if (current && !current.isConnected) {
      current = null;
      post("clear", { reason: "removed" });
    }
  };
  // Never silently promote an unmarked child to an editable ancestor. The
  // parent can be chosen explicitly from Studio's source-target list.
  const mapped = (element) => element instanceof Element && element.hasAttribute("data-stellar-source-key") ? element : null;
  const computed = (element) => {
    const style = window.getComputedStyle(element);
    const values = {};
    for (const property of PROPERTIES) {
      const value = style.getPropertyValue(property).trim();
      if (value && value.length <= 160) values[property] = value;
    }
    return values;
  };
  const select = (element) => {
    if (!element || !element.dataset.stellarSourceKey || !element.dataset.stellarAnchor || !element.dataset.stellarOccurrence) {
      current = null;
      refresh();
      post("diagnostic", { code: "UNMAPPED_SOURCE", message: "This rendered element has no supported source target." });
      return;
    }
    if (element.dataset.stellarAmbiguous === "true") {
      current = null;
      refresh();
      post("diagnostic", { code: "UNMAPPED_SOURCE", message: "This source anchor has multiple rendered occurrences and is read-only." });
      return;
    }
    current = element;
    refresh();
    post("selection", {
      sourceKey: element.dataset.stellarSourceKey,
      anchor: element.dataset.stellarAnchor,
      occurrenceId: element.dataset.stellarOccurrence,
      geometry: rect(element),
      computedStyles: computed(element),
    });
  };
  const bindNodes = (targets) => {
    for (const element of nodes.values()) {
      delete element.dataset.stellarSourceKey;
      delete element.dataset.stellarAnchor;
      delete element.dataset.stellarOccurrence;
      delete element.dataset.stellarAmbiguous;
    }
    nodes = new Map();
    for (const target of targets) {
      if (!target || typeof target.anchor !== "string" || !ID.test(target.anchor) ||
        typeof target.sourceKey !== "string" || !ID.test(target.sourceKey)) continue;
      const matches = [...document.querySelectorAll("[id]")].filter((element) => element.id === target.anchor);
      matches.forEach((element, index) => {
        const occurrence = `${target.anchor}:${index + 1}`;
        element.dataset.stellarSourceKey = target.sourceKey;
        element.dataset.stellarAnchor = target.anchor;
        element.dataset.stellarOccurrence = occurrence;
        if (matches.length > 1) element.dataset.stellarAmbiguous = "true";
        nodes.set(occurrence, element);
      });
    }
    current = null;
    hover = null;
    refresh();
  };
  const clear = (reason) => {
    current = null;
    hover = null;
    refresh();
    post("clear", { reason });
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== origin || !event.data || typeof event.data !== "object") return;
    const message = event.data;
    if (message.type === "stellar:hello-request") {
      window.parent.postMessage({ type: "stellar:hello", route: location.pathname }, origin);
      return;
    }
    if (message.type === "stellar:init") {
      if (!validScope(message) || message.route !== location.pathname || !ROUTE.test(message.route) ||
        !Array.isArray(message.targets) || message.targets.length > 256 ||
        (message.mode !== "inspect" && message.mode !== "interact")) return;
      scope = { protocolVersion: VERSION, projectId: message.projectId, sessionId: message.sessionId,
        previewGeneration: message.previewGeneration, frameId: message.frameId,
        pageId: message.pageId, sourceRevision: message.sourceRevision };
      mode = message.mode;
      overlay ??= makeOverlay("#0071ce");
      hoverOverlay ??= makeOverlay("#14b8a6");
      bindNodes(message.targets);
      post("ready", { route: location.pathname });
      return;
    }
    if (!sameScope(message)) return;
    if (message.type === "stellar:mode" && (message.mode === "inspect" || message.mode === "interact")) {
      mode = message.mode;
      hover = null;
      refresh();
    } else if (message.type === "stellar:clear") {
      clear("stale");
    } else if (message.type === "stellar:select" && typeof message.occurrenceId === "string") {
      const element = nodes.get(message.occurrenceId);
      if (element) select(element);
    }
  });

  document.addEventListener("click", (event) => {
    if (!scope || mode !== "inspect") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    select(mapped(event.target));
  }, true);
  document.addEventListener("submit", (event) => {
    if (scope && mode === "inspect") { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (!scope || mode !== "inspect" || event.target instanceof HTMLElement &&
      (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
    if (event.key === "Escape") { clear("escape"); return; }
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = mapped(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    select(target);
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!scope || mode !== "inspect") return;
    const next = mapped(event.target);
    if (next !== hover) { hover = next; paint(hover, hoverOverlay); }
  }, { passive: true });
  document.addEventListener("pointerleave", () => { hover = null; paint(null, hoverOverlay); }, { passive: true });
  window.addEventListener("scroll", refresh, { passive: true, capture: true });
  window.addEventListener("resize", refresh, { passive: true });
  new MutationObserver(() => {
    if (!scope) return;
    if (current && !current.isConnected) refresh();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // A hello contains route information only. It cannot select or grant write access.
  const hello = () => window.parent.postMessage({ type: "stellar:hello", route: location.pathname }, origin);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hello, { once: true });
  else hello();
})();
