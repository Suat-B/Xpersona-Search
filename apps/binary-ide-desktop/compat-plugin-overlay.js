(async () => {
  if (window.__binaryCompatPluginOverlayInstalled) {
    return true;
  }
  window.__binaryCompatPluginOverlayInstalled = true;

  const ROOT_ID = "binary-compat-plugin-overlay";
  const STYLE_ID = "binary-compat-plugin-overlay-style";
  const state = {
    capabilities: null,
    preferences: null,
    loading: false,
    error: "",
    flash: "",
    selected: new Set(),
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pluralize(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
  }

  function titleCase(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        margin: 0 0 24px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background:
          radial-gradient(circle at top right, rgba(58, 108, 255, 0.18), transparent 36%),
          linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
        color: var(--token-foreground, #f4f4f5);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
        overflow: hidden;
        backdrop-filter: blur(18px);
      }
      #${ROOT_ID} * {
        box-sizing: border-box;
      }
      #${ROOT_ID} .binary-head {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        padding: 20px 22px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      #${ROOT_ID} .binary-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(116, 161, 255, 0.22);
        background: rgba(65, 117, 255, 0.12);
        color: #d6e4ff;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      #${ROOT_ID} .binary-title {
        font-size: 18px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }
      #${ROOT_ID} .binary-subtitle {
        margin-top: 6px;
        max-width: 780px;
        color: var(--token-description-foreground, rgba(255,255,255,0.74));
        font-size: 13px;
        line-height: 1.6;
      }
      #${ROOT_ID} .binary-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      #${ROOT_ID} .binary-btn {
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.04);
        color: inherit;
        border-radius: 999px;
        padding: 9px 14px;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
      }
      #${ROOT_ID} .binary-btn:hover {
        background: rgba(255,255,255,0.09);
        border-color: rgba(255,255,255,0.18);
      }
      #${ROOT_ID} .binary-btn[data-variant="primary"] {
        background: linear-gradient(180deg, rgba(82, 132, 255, 0.9), rgba(55, 96, 221, 0.92));
        border-color: rgba(101, 143, 255, 0.86);
        color: #ffffff;
        box-shadow: 0 12px 24px rgba(50, 96, 210, 0.26);
      }
      #${ROOT_ID} .binary-btn[data-variant="primary"]:hover {
        background: linear-gradient(180deg, rgba(93, 141, 255, 0.95), rgba(59, 100, 226, 0.96));
      }
      #${ROOT_ID} .binary-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        padding: 16px 22px 0;
      }
      #${ROOT_ID} .binary-stat {
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 16px;
        background: rgba(255,255,255,0.03);
        padding: 14px 14px 13px;
      }
      #${ROOT_ID} .binary-stat-value {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      #${ROOT_ID} .binary-stat-label {
        margin-top: 4px;
        color: var(--token-description-foreground, rgba(255,255,255,0.7));
        font-size: 12px;
        line-height: 1.5;
      }
      #${ROOT_ID} .binary-body {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
        gap: 18px;
        padding: 18px 22px 22px;
      }
      #${ROOT_ID} .binary-column {
        display: grid;
        gap: 14px;
        align-content: start;
      }
      #${ROOT_ID} .binary-card {
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 16px;
        padding: 16px;
        background: rgba(255,255,255,0.025);
      }
      #${ROOT_ID} .binary-card-title {
        font-size: 13px;
        font-weight: 650;
        letter-spacing: 0.01em;
      }
      #${ROOT_ID} .binary-card-copy {
        margin-top: 6px;
        color: var(--token-description-foreground, rgba(255,255,255,0.72));
        font-size: 12px;
        line-height: 1.55;
      }
      #${ROOT_ID} .binary-list {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }
      #${ROOT_ID} .binary-offering,
      #${ROOT_ID} .binary-source,
      #${ROOT_ID} .binary-pack {
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 14px;
        padding: 13px;
        background: rgba(0,0,0,0.16);
      }
      #${ROOT_ID} .binary-offering-head,
      #${ROOT_ID} .binary-pack-head {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        justify-content: space-between;
      }
      #${ROOT_ID} .binary-offering-title,
      #${ROOT_ID} .binary-source-title,
      #${ROOT_ID} .binary-pack-title {
        font-size: 13px;
        font-weight: 650;
        line-height: 1.4;
      }
      #${ROOT_ID} .binary-offering-copy,
      #${ROOT_ID} .binary-source-copy,
      #${ROOT_ID} .binary-pack-copy {
        margin-top: 5px;
        color: var(--token-description-foreground, rgba(255,255,255,0.72));
        font-size: 12px;
        line-height: 1.55;
      }
      #${ROOT_ID} .binary-meta {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      #${ROOT_ID} .binary-pill {
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 11px;
        line-height: 1;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: var(--token-description-foreground, rgba(255,255,255,0.78));
      }
      #${ROOT_ID} .binary-pill[data-state="available"],
      #${ROOT_ID} .binary-pill[data-state="active"] {
        border-color: rgba(76, 181, 137, 0.26);
        background: rgba(76, 181, 137, 0.12);
        color: #baf0d2;
      }
      #${ROOT_ID} .binary-pill[data-state="limited"] {
        border-color: rgba(238, 192, 90, 0.22);
        background: rgba(238, 192, 90, 0.12);
        color: #ffebb6;
      }
      #${ROOT_ID} .binary-pill[data-state="missing"] {
        border-color: rgba(255, 113, 113, 0.22);
        background: rgba(255, 113, 113, 0.12);
        color: #ffc3c3;
      }
      #${ROOT_ID} .binary-toggle {
        min-width: 88px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: inherit;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      #${ROOT_ID} .binary-toggle[data-selected="true"] {
        border-color: rgba(101, 143, 255, 0.84);
        background: rgba(65, 117, 255, 0.18);
        color: #d7e5ff;
      }
      #${ROOT_ID} .binary-note,
      #${ROOT_ID} .binary-empty,
      #${ROOT_ID} .binary-status {
        color: var(--token-description-foreground, rgba(255,255,255,0.7));
        font-size: 12px;
        line-height: 1.55;
      }
      #${ROOT_ID} .binary-status-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 12px;
      }
      #${ROOT_ID} .binary-flash {
        color: #d5e3ff;
      }
      #${ROOT_ID} .binary-error {
        color: #ffc0c0;
      }
      @media (max-width: 1080px) {
        #${ROOT_ID} .binary-summary {
          grid-template-columns: 1fr;
        }
        #${ROOT_ID} .binary-body {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function pluginRouteActive() {
    const path = String(window.location.pathname || "").toLowerCase();
    if (path.includes("plugins")) return true;
    const text = String(document.body?.innerText || "");
    return text.includes("Make Codex work your way") || text.includes("No plugins found");
  }

  function skillsRouteActive() {
    const path = String(window.location.pathname || "").toLowerCase();
    if (path.includes("skills")) return true;
    const text = String(document.body?.innerText || "");
    return text.includes("Give Codex superpowers") || text.includes("No skills found");
  }

  function detectRoute() {
    if (pluginRouteActive()) return "plugins";
    if (skillsRouteActive()) return "skills";
    return null;
  }

  function findContainer() {
    const candidates = Array.from(document.querySelectorAll("div")).filter((element) => {
      const className = typeof element.className === "string" ? element.className : "";
      return className.includes("thread-content-max-width") || className.includes("max-w-[var(--thread-content-max-width)]");
    });
    return candidates[0] || document.querySelector("main") || document.getElementById("root");
  }

  async function loadData(force = false) {
    if (state.loading) return;
    if (!force && state.capabilities) return;
    state.loading = true;
    state.error = "";
    try {
      const [capabilities, preferences] = await Promise.all([
        window.binaryDesktop?.openHandsCapabilities?.(),
        window.binaryDesktop?.getHostPreferences?.(),
      ]);
      state.capabilities = capabilities || null;
      state.preferences = preferences || null;
      state.selected = new Set(
        ((preferences && preferences.defaultPluginPacks) ||
          (capabilities && capabilities.defaultPluginPacks) ||
          []).map((value) => String(value)),
      );
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error || "Unable to load Binary OpenHands data.");
    } finally {
      state.loading = false;
    }
  }

  function renderOfferings(offerings) {
    if (!Array.isArray(offerings) || offerings.length === 0) {
      return `<div class="binary-empty">Binary can load OpenHands capabilities here once the local host is ready.</div>`;
    }
    return offerings
      .map((offering) => {
        const detail = offering.detail ? `<div class="binary-offering-copy">${escapeHtml(offering.detail)}</div>` : "";
        return `
          <div class="binary-offering">
            <div class="binary-offering-head">
              <div>
                <div class="binary-offering-title">${escapeHtml(offering.title || offering.id || "Capability")}</div>
                <div class="binary-offering-copy">${escapeHtml(offering.description || "")}</div>
                ${detail}
              </div>
              <span class="binary-pill" data-state="${escapeHtml(offering.status || "limited")}">${escapeHtml(titleCase(offering.status || "limited"))}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderPluginPacks(pluginPacks) {
    if (!Array.isArray(pluginPacks) || pluginPacks.length === 0) {
      return `<div class="binary-empty">No Binary-managed OpenHands plugin packs are registered yet.</div>`;
    }
    return pluginPacks
      .map((pack) => {
        const id = String(pack.id || "");
        const selected = state.selected.has(id);
        return `
          <div class="binary-pack">
            <div class="binary-pack-head">
              <div>
                <div class="binary-pack-title">${escapeHtml(pack.title || id)}</div>
                <div class="binary-pack-copy">${escapeHtml(pack.description || "")}</div>
              </div>
              <button
                class="binary-toggle"
                type="button"
                data-binary-pack-id="${escapeHtml(id)}"
                data-selected="${selected ? "true" : "false"}"
              >
                ${selected ? "Selected" : "Select"}
              </button>
            </div>
            <div class="binary-meta">
              <span class="binary-pill" data-state="${escapeHtml(pack.status || "missing")}">${escapeHtml(titleCase(pack.status || "missing"))}</span>
              <span class="binary-pill">${escapeHtml(pluralize(Number(pack.skillCount || 0), "skill"))}</span>
              <span class="binary-pill">${escapeHtml(pluralize(Number(pack.mcpServerCount || 0), "MCP server"))}</span>
              <span class="binary-pill">${escapeHtml(titleCase(pack.source || "binary_managed"))}</span>
              ${pack.loadedLazily ? `<span class="binary-pill">Lazy loaded</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderSkillSources(skillSources) {
    if (!Array.isArray(skillSources) || skillSources.length === 0) {
      return `<div class="binary-empty">No OpenHands skill sources are active yet.</div>`;
    }
    return skillSources
      .map((source) => {
        const availability = source.available ? "available" : "missing";
        return `
          <div class="binary-source">
            <div class="binary-source-title">${escapeHtml(source.label || source.id || "Skill source")}</div>
            <div class="binary-source-copy">
              ${escapeHtml(
                source.available
                  ? "Binary can load this skill source when the active run needs it."
                  : "Configured for discovery, but the folder is not present on this machine right now.",
              )}
            </div>
            <div class="binary-meta">
              <span class="binary-pill" data-state="${escapeHtml(availability)}">${escapeHtml(source.available ? "Available" : "Missing")}</span>
              <span class="binary-pill">${escapeHtml(titleCase(source.kind || "source"))}</span>
              ${source.loadedLazily ? `<span class="binary-pill">Lazy loaded</span>` : ""}
              ${source.path ? `<span class="binary-pill">${escapeHtml(source.path)}</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderStats(route, capabilities) {
    const pluginPacks = Array.isArray(capabilities.pluginPacks) ? capabilities.pluginPacks : [];
    const skillSources = Array.isArray(capabilities.skillSources) ? capabilities.skillSources : [];
    const offerings = Array.isArray(capabilities.offerings) ? capabilities.offerings : [];
    const availableOfferings = offerings.filter((item) => item && item.status === "available").length;
    const activeSkillSources = skillSources.filter((item) => item && item.available).length;
    const selectedDefaults = state.selected.size;

    const cards =
      route === "skills"
        ? [
            { value: activeSkillSources, label: "active skill sources ready for OpenHands runs" },
            { value: skillSources.length, label: "total skill source locations Binary can inspect" },
            { value: availableOfferings, label: "OpenHands runtime capabilities already available" },
          ]
        : [
            { value: availableOfferings, label: "OpenHands capabilities currently available in Binary" },
            { value: pluginPacks.length, label: "plugin packs available to bias runs and workflows" },
            { value: selectedDefaults, label: "default plugin packs applied to new runs" },
          ];

    return cards
      .map(
        (card) => `
          <div class="binary-stat">
            <div class="binary-stat-value">${escapeHtml(String(card.value))}</div>
            <div class="binary-stat-label">${escapeHtml(card.label)}</div>
          </div>
        `,
      )
      .join("");
  }

  function render() {
    ensureStyle();
    const route = detectRoute();
    let root = document.getElementById(ROOT_ID);
    if (!route) {
      root?.remove();
      return;
    }
    const container = findContainer();
    if (!container) return;
    if (!root) {
      root = document.createElement("section");
      root.id = ROOT_ID;
    }
    if (root.parentElement !== container) {
      container.prepend(root);
    }

    const capabilities = state.capabilities || {};
    const pluginPacks = Array.isArray(capabilities.pluginPacks) ? capabilities.pluginPacks : [];
    const skillSources = Array.isArray(capabilities.skillSources) ? capabilities.skillSources : [];
    const offerings = Array.isArray(capabilities.offerings) ? capabilities.offerings : [];
    const workspaceRoot = typeof capabilities.workspaceRoot === "string" ? capabilities.workspaceRoot : "";
    const subtitle =
      route === "skills"
        ? "Binary is surfacing the real OpenHands skill sources that can shape behavior across desktop, CLI, and long-running jobs."
        : "Binary is surfacing the real OpenHands capabilities and plugin packs that are wired into the current host and runtime.";

    root.innerHTML = `
      <div class="binary-head">
        <div>
          <div class="binary-kicker">Binary x OpenHands</div>
          <div class="binary-title">${route === "skills" ? "Skills that shape the agent" : "Capabilities wired into Binary"}</div>
          <div class="binary-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <div class="binary-actions">
          <button class="binary-btn" type="button" data-binary-action="refresh">Refresh</button>
          ${
            route === "plugins"
              ? `<button class="binary-btn" type="button" data-variant="primary" data-binary-action="save">Save defaults</button>`
              : ""
          }
          ${
            route === "plugins"
              ? `<button class="binary-btn" type="button" data-binary-action="clear">Clear defaults</button>`
              : ""
          }
        </div>
      </div>
      <div class="binary-summary">${renderStats(route, capabilities)}</div>
      <div class="binary-body">
        <div class="binary-column">
          <div class="binary-card">
            <div class="binary-card-title">${route === "skills" ? "Skill Sources" : "What Binary Offers Today"}</div>
            <div class="binary-card-copy">
              ${
                route === "skills"
                  ? escapeHtml(workspaceRoot ? `Workspace-aware discovery is active for ${workspaceRoot}.` : "Repo-local, user, and organization skill folders are discovered lazily.")
                  : "These are the actual OpenHands capabilities Binary can expose right now, not placeholder roadmap items."
              }
            </div>
            <div class="binary-list">
              ${route === "skills" ? renderSkillSources(skillSources) : renderOfferings(offerings)}
            </div>
          </div>
        </div>
        <div class="binary-column">
          ${
            route === "plugins"
              ? `
                <div class="binary-card">
                  <div class="binary-card-title">Plugin Packs</div>
                  <div class="binary-card-copy">
                    Pick the Binary-managed OpenHands packs that should be applied by default to new runs.
                  </div>
                  <div class="binary-list">
                    ${renderPluginPacks(pluginPacks)}
                  </div>
                  <div class="binary-status-row">
                    <div class="binary-status">
                      ${
                        state.loading
                          ? "Loading capability data..."
                          : `${pluralize(state.selected.size, "default pack")} selected`
                      }
                    </div>
                    ${state.flash ? `<div class="binary-status binary-flash">${escapeHtml(state.flash)}</div>` : ""}
                    ${state.error ? `<div class="binary-status binary-error">${escapeHtml(state.error)}</div>` : ""}
                  </div>
                </div>
                <div class="binary-card">
                  <div class="binary-card-title">Skill Sources In Play</div>
                  <div class="binary-card-copy">
                    Plugin packs complement these skill locations. Binary only loads them when a run actually needs them.
                  </div>
                  <div class="binary-list">
                    ${renderSkillSources(skillSources)}
                  </div>
                </div>
              `
              : `
                <div class="binary-card">
                  <div class="binary-card-title">Default Plugin Packs</div>
                  <div class="binary-card-copy">
                    These are the packs Binary can apply to new runs today from the same host-backed configuration used everywhere else.
                  </div>
                  <div class="binary-list">
                    ${renderPluginPacks(pluginPacks)}
                  </div>
                  <div class="binary-status-row">
                    <div class="binary-status">${pluralize(state.selected.size, "default pack")} selected in host preferences</div>
                    ${state.error ? `<div class="binary-status binary-error">${escapeHtml(state.error)}</div>` : ""}
                  </div>
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  async function saveDefaults() {
    state.flash = "";
    await window.binaryDesktop?.setHostPreferences?.({
      defaultPluginPacks: Array.from(state.selected),
    });
    await loadData(true);
    state.flash = "Saved to Binary host defaults.";
    render();
  }

  async function clearDefaults() {
    state.selected = new Set();
    await saveDefaults();
  }

  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-binary-pack-id],[data-binary-action]") : null;
    if (!target) return;
    if (target instanceof HTMLElement && target.dataset.binaryPackId) {
      const packId = target.dataset.binaryPackId;
      state.flash = "";
      if (state.selected.has(packId)) state.selected.delete(packId);
      else state.selected.add(packId);
      render();
      return;
    }
    const action = target instanceof HTMLElement ? target.dataset.binaryAction : "";
    if (action === "refresh") {
      state.flash = "";
      await loadData(true);
      render();
      return;
    }
    if (action === "save") {
      await saveDefaults();
      return;
    }
    if (action === "clear") {
      await clearDefaults();
    }
  });

  const rerender = () => render();
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    const result = originalPushState(...args);
    setTimeout(rerender, 0);
    return result;
  };

  history.replaceState = (...args) => {
    const result = originalReplaceState(...args);
    setTimeout(rerender, 0);
    return result;
  };

  window.addEventListener("popstate", rerender);

  const observer = new MutationObserver(() => {
    render();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  await loadData();
  render();
  return true;
})()
  .catch((error) => {
    console.error("[BinaryCompatPluginOverlay]", error);
    return false;
  });
