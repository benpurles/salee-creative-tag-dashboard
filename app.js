const DATA = window.SALEE_DASHBOARD_DATA;

const state = {
  selectedTags: new Set(),
  mode: "all",
  tab: "creatives",
  search: "",
  creativeSort: "spend_desc",
  tagSort: "spend_desc",
  comboSort: "spend_desc",
  showTagPreviews: localStorage.getItem("saleeShowTagPreviews") === "true",
  titles: JSON.parse(localStorage.getItem("saleeCreativeTitles") || "{}"),
};

const els = {
  summaryText: document.querySelector("#summaryText"),
  metricStrip: document.querySelector("#metricStrip"),
  tagList: document.querySelector("#tagList"),
  searchInput: document.querySelector("#searchInput"),
  clearTagsButton: document.querySelector("#clearTagsButton"),
  resetButton: document.querySelector("#resetButton"),
  creativeSort: document.querySelector("#creativeSort"),
  tagSort: document.querySelector("#tagSort"),
  tagPreviewToggle: document.querySelector("#tagPreviewToggle"),
  comboSort: document.querySelector("#comboSort"),
  creativeTable: document.querySelector("#creativeTable"),
  tagTable: document.querySelector("#tagTable"),
  comboTable: document.querySelector("#comboTable"),
  guideGrid: document.querySelector("#guideGrid"),
  lightbox: document.querySelector("#lightbox"),
  lightboxImage: document.querySelector("#lightboxImage"),
};

function usd(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

function int(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

function decimal(value, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

function pct(value) {
  return `${decimal((Number.isFinite(value) ? value : 0) * 100, 1)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveTitles() {
  localStorage.setItem("saleeCreativeTitles", JSON.stringify(state.titles));
}

function creativeTitle(creative) {
  return state.titles[creative.key] || creative.label;
}

function aggregate(items) {
  const spend = items.reduce((sum, item) => sum + item.spend, 0);
  const purchases = items.reduce((sum, item) => sum + item.purchases, 0);
  const resultsValue = items.reduce((sum, item) => sum + item.resultsValue, 0);
  const uniqueOutboundClicks = items.reduce((sum, item) => sum + item.uniqueOutboundClicks, 0);
  const landingPageViews = items.reduce((sum, item) => sum + item.landingPageViews, 0);
  const addsToCart = items.reduce((sum, item) => sum + item.addsToCart, 0);
  const checkoutsInitiated = items.reduce((sum, item) => sum + item.checkoutsInitiated, 0);
  return {
    creativeCount: items.length,
    spend,
    purchases,
    resultsValue,
    uniqueOutboundClicks,
    landingPageViews,
    addsToCart,
    checkoutsInitiated,
    cac: purchases ? spend / purchases : 0,
    roas: spend ? resultsValue / spend : 0,
    aov: purchases ? resultsValue / purchases : 0,
    cpc: uniqueOutboundClicks ? spend / uniqueOutboundClicks : 0,
    atcRate: landingPageViews ? addsToCart / landingPageViews : 0,
    purchaseRate: checkoutsInitiated ? purchases / checkoutsInitiated : 0,
  };
}

function sortRows(rows, sortKey) {
  const direction = sortKey.endsWith("_asc") ? "asc" : "desc";
  const metric = sortKey.replace(/_(asc|desc)$/, "");
  const keyMap = {
    spend: "spend",
    roas: "roas",
    cac: "cac",
    purchases: "purchases",
    aov: "aov",
    creative_count: "creativeCount",
  };
  const key = keyMap[metric] || "spend";
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (key === "cac") {
      if (!av) return 1;
      if (!bv) return -1;
    }
    return (av - bv) * dir;
  });
}

function matchesSearch(creative) {
  if (!state.search) return true;
  const haystack = [
    creativeTitle(creative),
    creative.label,
    creative.primaryAdName,
    creative.duplicateTag,
    creative.tags.join(" "),
    creative.adNames.join(" "),
    creative.adIds.join(" "),
  ].join(" ").toLowerCase();
  return haystack.includes(state.search.toLowerCase());
}

function matchesTags(creative) {
  if (!state.selectedTags.size) return true;
  const tagSet = new Set(creative.tags);
  if (state.mode === "any") {
    return [...state.selectedTags].some((tag) => tagSet.has(tag));
  }
  return [...state.selectedTags].every((tag) => tagSet.has(tag));
}

function filteredCreatives() {
  return DATA.creatives.filter((creative) => matchesSearch(creative) && matchesTags(creative));
}

function metricCard(label, value, sub = "") {
  return `
    <div class="metric">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${value}</div>
      ${sub ? `<div class="creative-sub">${escapeHtml(sub)}</div>` : ""}
    </div>
  `;
}

function renderSummary(creatives) {
  const totals = aggregate(creatives);
  els.summaryText.textContent = `${DATA.rawAds.length} raw ad rows became ${DATA.creatives.length} collapsed creatives. Current view contains ${creatives.length} creatives.`;
  els.metricStrip.innerHTML = [
    metricCard("Spend", usd(totals.spend), `${int(totals.creativeCount)} creatives`),
    metricCard("Purchases", int(totals.purchases), `${usd(totals.cac, 2)} CAC`),
    metricCard("ROAS", decimal(totals.roas, 2), `${usd(totals.resultsValue)} revenue`),
    metricCard("AOV", usd(totals.aov, 2), `${pct(totals.purchaseRate)} checkout to purchase`),
  ].join("");
}

function renderTags() {
  const byCategory = new Map();
  for (const item of DATA.allTags) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  els.tagList.innerHTML = [...byCategory.entries()].map(([category, tags]) => `
    <div class="tag-category">
      <div class="creative-sub">${escapeHtml(category)}</div>
      <div class="tag-list">
        ${tags.map(({ tag }) => `
          <button class="tag-chip ${state.selectedTags.has(tag) ? "active" : ""}" type="button" data-tag="${escapeHtml(tag)}">
            ${escapeHtml(tag)}
          </button>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function renderCreativeTable(creatives) {
  const rows = sortRows(creatives, state.creativeSort);
  if (!rows.length) {
    els.creativeTable.innerHTML = `<tr><td class="empty" colspan="9">No creatives match the current filters.</td></tr>`;
    return;
  }
  els.creativeTable.innerHTML = rows.map((creative) => `
    <tr>
      <td class="preview-cell">
        ${creative.previewImage ? `
          <button class="preview-frame" type="button" data-preview="${escapeHtml(creative.previewImage)}" title="Open preview">
            <img src="${escapeHtml(creative.previewImage)}" alt="Preview for ${escapeHtml(creative.label)}" loading="lazy" />
            ${creative.previewImages?.length > 1 ? `<span class="preview-count">${creative.previewImages.length}</span>` : ""}
          </button>
        ` : `<div class="preview-frame empty">No preview</div>`}
      </td>
      <td>
        <div class="creative-name">
          <span>${escapeHtml(creativeTitle(creative))}</span>
          ${creative.collapsed ? `<span class="badge">${creative.duplicateCount} rows</span>` : ""}
          <button class="rename-button" type="button" data-edit-title="${escapeHtml(creative.key)}" title="Rename creative">Rename</button>
        </div>
        ${creativeTitle(creative) !== creative.label ? `<div class="creative-sub">Original: ${escapeHtml(creative.label)}</div>` : ""}
        <div class="creative-sub">${escapeHtml(creative.primaryAdName)}</div>
        ${creative.collapsed ? `<div class="creative-sub">${escapeHtml(creative.adNames.join(" / "))}</div>` : ""}
      </td>
      <td><div class="tags-cell">${creative.tags.map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join("")}</div></td>
      <td class="num">${usd(creative.spend)}</td>
      <td class="num">${int(creative.purchases)}</td>
      <td class="num">${usd(creative.cac, 2)}</td>
      <td class="num">${decimal(creative.roas, 2)}</td>
      <td class="num">${usd(creative.aov, 2)}</td>
      <td class="num">${int(creative.addsToCart)}</td>
    </tr>
  `).join("");
}

function tagRollups(creatives) {
  return DATA.allTags.map(({ tag, category }) => {
    const matching = creatives.filter((creative) => creative.tags.includes(tag));
    return {
      tag,
      category,
      creatives: matching,
      ...aggregate(matching),
    };
  }).filter((row) => row.creativeCount > 0);
}

function previewStrip(creatives, limit = 10) {
  const withPreviews = creatives.filter((creative) => creative.previewImage);
  const visible = withPreviews.slice(0, limit);
  const remainder = withPreviews.length - visible.length;
  if (!withPreviews.length) return `<div class="creative-sub">No previews</div>`;
  return `
    <div class="preview-strip">
      ${visible.map((creative) => `
        <button class="preview-mini" type="button" data-preview="${escapeHtml(creative.previewImage)}" title="${escapeHtml(creativeTitle(creative))}">
          <img src="${escapeHtml(creative.previewImage)}" alt="Preview for ${escapeHtml(creativeTitle(creative))}" loading="lazy" />
        </button>
      `).join("")}
      ${remainder > 0 ? `<div class="preview-mini-more">+${remainder}</div>` : ""}
    </div>
  `;
}

function renderTagTable(creatives) {
  const rows = sortRows(tagRollups(creatives), state.tagSort);
  if (!rows.length) {
    els.tagTable.innerHTML = `<tr><td class="empty" colspan="9">No tags match the current filters.</td></tr>`;
    return;
  }
  els.tagTable.innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.tag)}</strong></td>
      <td>${escapeHtml(row.category)}</td>
      <td class="tag-previews-col">${previewStrip(row.creatives)}</td>
      <td class="num">${int(row.creativeCount)}</td>
      <td class="num">${usd(row.spend)}</td>
      <td class="num">${int(row.purchases)}</td>
      <td class="num">${usd(row.cac, 2)}</td>
      <td class="num">${decimal(row.roas, 2)}</td>
      <td class="num">${usd(row.aov, 2)}</td>
    </tr>
  `).join("");
}

function combinationRollups(creatives) {
  const map = new Map();
  for (const creative of creatives) {
    const tags = creative.tags;
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const combo = [tags[i], tags[j]].sort((a, b) => a.localeCompare(b)).join(" + ");
        if (!map.has(combo)) map.set(combo, []);
        map.get(combo).push(creative);
      }
    }
  }
  return [...map.entries()]
    .map(([combo, comboCreatives]) => ({ combo, ...aggregate(comboCreatives) }))
    .filter((row) => row.creativeCount >= 2);
}

function renderComboTable(creatives) {
  const rows = sortRows(combinationRollups(creatives), state.comboSort);
  if (!rows.length) {
    els.comboTable.innerHTML = `<tr><td class="empty" colspan="7">No recurring tag combinations match the current filters.</td></tr>`;
    return;
  }
  els.comboTable.innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.combo)}</strong></td>
      <td class="num">${int(row.creativeCount)}</td>
      <td class="num">${usd(row.spend)}</td>
      <td class="num">${int(row.purchases)}</td>
      <td class="num">${usd(row.cac, 2)}</td>
      <td class="num">${decimal(row.roas, 2)}</td>
      <td class="num">${usd(row.aov, 2)}</td>
    </tr>
  `).join("");
}

function renderGuide() {
  els.guideGrid.innerHTML = DATA.tagGuide.map((row) => `
    <div class="guide-item">
      <strong>${escapeHtml(row.tag)}</strong>
      <span>${escapeHtml(row.category)}</span>
    </div>
  `).join("");
}

function render() {
  const creatives = filteredCreatives();
  document.body.classList.toggle("show-tag-previews", state.showTagPreviews);
  els.tagPreviewToggle.checked = state.showTagPreviews;
  renderSummary(creatives);
  renderTags();
  renderCreativeTable(creatives);
  renderTagTable(creatives);
  renderComboTable(creatives);
  renderGuide();
}

document.addEventListener("click", (event) => {
  const preview = event.target.closest("[data-preview]");
  if (preview) {
    els.lightboxImage.src = preview.dataset.preview;
    els.lightbox.classList.add("open");
    els.lightbox.setAttribute("aria-hidden", "false");
    return;
  }

  const rename = event.target.closest("[data-edit-title]");
  if (rename) {
    const creative = DATA.creatives.find((item) => item.key === rename.dataset.editTitle);
    if (!creative) return;
    const current = creativeTitle(creative);
    const next = window.prompt("Rename this creative", current);
    if (next == null) return;
    const cleaned = next.trim();
    if (!cleaned || cleaned === creative.label) delete state.titles[creative.key];
    else state.titles[creative.key] = cleaned;
    saveTitles();
    render();
    return;
  }

  if (event.target.closest(".lightbox-close") || event.target === els.lightbox) {
    els.lightbox.classList.remove("open");
    els.lightbox.setAttribute("aria-hidden", "true");
    els.lightboxImage.removeAttribute("src");
    return;
  }

  const tagButton = event.target.closest("[data-tag]");
  if (tagButton) {
    const tag = tagButton.dataset.tag;
    if (state.selectedTags.has(tag)) state.selectedTags.delete(tag);
    else state.selectedTags.add(tag);
    render();
    return;
  }

  const segment = event.target.closest("[data-mode]");
  if (segment) {
    state.mode = segment.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
    render();
    return;
  }

  const tab = event.target.closest("[data-tab]");
  if (tab) {
    state.tab = tab.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === state.tab));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    document.querySelector(`#${state.tab}Panel`).classList.add("active");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.lightbox.classList.contains("open")) {
    els.lightbox.classList.remove("open");
    els.lightbox.setAttribute("aria-hidden", "true");
    els.lightboxImage.removeAttribute("src");
  }
});

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  render();
});

els.clearTagsButton.addEventListener("click", () => {
  state.selectedTags.clear();
  render();
});

els.resetButton.addEventListener("click", () => {
  state.selectedTags.clear();
  state.search = "";
  state.mode = "all";
  els.searchInput.value = "";
  document.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
  render();
});

els.creativeSort.addEventListener("change", (event) => {
  state.creativeSort = event.target.value;
  render();
});

els.tagSort.addEventListener("change", (event) => {
  state.tagSort = event.target.value;
  render();
});

els.tagPreviewToggle.addEventListener("change", (event) => {
  state.showTagPreviews = event.target.checked;
  localStorage.setItem("saleeShowTagPreviews", String(state.showTagPreviews));
  render();
});

els.comboSort.addEventListener("change", (event) => {
  state.comboSort = event.target.value;
  render();
});

render();
