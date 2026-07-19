const DATA_URL = "./data/seizures.json";

const CATEGORY_META = {
  vehicles: { label: "Vehicles", code: "VEH", icon: icon("car") },
  watercraft: { label: "Watercraft", code: "WCR", icon: icon("boat") },
  airplanes: { label: "Airplanes", code: "AIR", icon: icon("plane") },
  rotorcraft: { label: "Rotorcraft", code: "ROT", icon: icon("heli") },
  properties: { label: "Properties", code: "PROP", icon: icon("building") },
  financial: { label: "Financial Instruments", code: "FIN", icon: icon("banknote") },
  crypto: { label: "Crypto", code: "XBT", icon: icon("coin") },
};

const state = {
  items: [],
  category: "all",
  query: "",
};

function icon(name) {
  const paths = {
    car: '<path d="M3 12l1.5-4.5A2 2 0 0 1 6.4 6h11.2a2 2 0 0 1 1.9 1.5L21 12M3 12v4a1 1 0 0 0 1 1h1M3 12h18m0 0v4a1 1 0 0 1-1 1h-1M6 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm12 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    boat: '<path d="M3 15l1.5 4.5c.2.6.8 1 1.4 1h10.2c.6 0 1.2-.4 1.4-1L19 15M5 15h14l1.5-4h-17L5 15zM7 11V6h6l3 5M10 6V3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    plane: '<path d="M10.5 3.5l1.5 5.5 5.8 2.3c.7.3.7 1.3 0 1.6l-5.8 2.3-1.5 5.5-1.6-.4-.4-5.1-4-1.3v-1.8l4-1.3.4-5.1 1.6-.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    heli: '<path d="M4 6h9M8.5 6v3M8.5 9c3.5 0 6.5 1.7 6.5 4.2 0 1.6-1.3 2.3-3 2.3H7c-1.7 0-3-1-3-2.6 0-2 1.9-3.9 4.5-3.9zM13 12l6.5-1.2M4 15.5h4M15 15.5v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    building: '<path d="M5 21V5.5a1 1 0 0 1 .6-.9l5-2.2a1 1 0 0 1 .8 0l5 2.2a1 1 0 0 1 .6.9V21M5 21h14M9 9h1M9 13h1M14 9h1M14 13h1M10.5 21v-4h3v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    banknote: '<rect x="3" y="6.5" width="18" height="11" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 6.5v0M17.5 17.5v0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    coin: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v10M9.3 9.3h3.6a1.9 1.9 0 0 1 0 3.7H10a1.9 1.9 0 0 0 0 3.7h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  return `<svg viewBox="0 0 24 24" width="13" height="13">${paths[name]}</svg>`;
}

function brandMarkSvg() {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12l6 6L20 6" stroke="#fefefe" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function arrowSvg() {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M9 7h8v8" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderHeader(data) {
  document.getElementById("updated-time").textContent = data.generatedAt
    ? new Date(data.generatedAt).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";
  document.getElementById("source-count").textContent = data.sourceCount ?? "—";
}

function renderStats(data) {
  const total = data.itemCount ?? data.items.length;
  const counts = data.categoryCounts || {};
  const cards = [
    { num: total, label: "Tracked seizures (60d)" },
    { num: counts.properties ?? 0, label: "Properties" },
    { num: counts.vehicles ?? 0, label: "Vehicles" },
    { num: (counts.crypto ?? 0) + (counts.financial ?? 0), label: "Financial + crypto" },
  ];
  document.getElementById("stats-row").innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-num">${c.num.toLocaleString()}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join("");
}


function renderCategoryPills(data) {
  const counts = data.categoryCounts || {};
  const total = data.itemCount ?? data.items.length;
  const all = [{ id: "all", label: "All", count: total }].concat(
    Object.entries(CATEGORY_META).map(([id, meta]) => ({
      id, label: meta.label, count: counts[id] ?? 0,
    }))
  );
  const row = document.getElementById("category-row");
  row.innerHTML = all.map((c) => `
    <button class="pill ${state.category === c.id ? "active" : ""}" data-cat="${c.id}">
      ${escapeHtml(c.label)}<span class="count">${c.count}</span>
    </button>
  `).join("");
  row.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.category = btn.dataset.cat;
      render();
    });
  });
}

function matchesFilters(item) {
  if (state.category !== "all" && item.category !== state.category) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    const hay = `${item.title} ${item.summary} ${item.source} ${item.region}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function renderGrid() {
  const filtered = state.items.filter(matchesFilters);
  const grid = document.getElementById("grid");

  if (filtered.length === 0) {
    grid.innerHTML = "";
    document.getElementById("empty-state").style.display = "block";
    return;
  }
  document.getElementById("empty-state").style.display = "none";

  grid.innerHTML = filtered.map((item) => {
    const meta = CATEGORY_META[item.category] || CATEGORY_META.vehicles;
    return `
      <a class="card" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">
        <div class="card-top">
          <span class="cat-badge">${meta.icon}${meta.code}</span>
          <span class="card-date">${timeAgo(item.publishedAt)}</span>
        </div>
        <p class="card-title">${escapeHtml(item.title)}</p>
        ${item.summary ? `<p class="card-summary">${escapeHtml(item.summary)}</p>` : ""}
        <div class="card-bottom">
          <div>
            <div class="card-source">${escapeHtml(item.source)}</div>
            <div class="card-region">${escapeHtml(item.region)}</div>
          </div>
          <span class="card-arrow">${arrowSvg()}</span>
        </div>
      </a>
    `;
  }).join("");
}

function render() {
  renderCategoryPills({ items: state.items, categoryCounts: computeCounts(state.items), itemCount: state.items.length });
  renderGrid();
}

function computeCounts(items) {
  const counts = {};
  for (const id of Object.keys(CATEGORY_META)) counts[id] = 0;
  for (const it of items) counts[it.category] = (counts[it.category] || 0) + 1;
  return counts;
}

async function init() {
  document.getElementById("brand-mark").innerHTML = brandMarkSvg();

  let data;
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    data = await res.json();
  } catch (err) {
    document.getElementById("grid").innerHTML = "";
    document.getElementById("empty-state").style.display = "block";
    document.getElementById("empty-title").textContent = "Feed unavailable";
    document.getElementById("empty-body").textContent =
      "Couldn't load data/seizures.json. Run the fetch script or check the GitHub Action.";
    return;
  }

  state.items = data.items || [];
  renderHeader(data);
  renderStats(data);
  render();

  document.getElementById("search-input").addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    renderGrid();
  });
}

init();
