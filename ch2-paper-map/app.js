const map = L.map("map", { zoomControl: false, worldCopyJump: true }).setView([0, 30], 3);
L.control.zoom({ position: "topright" }).addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: "abcd",
  maxZoom: 19,
  zIndex: 0
}).addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
  subdomains: "abcd",
  maxZoom: 19,
  pane: "shadowPane"
}).addTo(map);

function layerZIndex(cfg) {
  return cfg.group === "Reference layers" ? 1 : 2;
}

const loadedLayers = {};
const activeGeorasters = {};

const loadingEl = document.getElementById("loading");
function setLoading(on) { loadingEl.classList.toggle("hidden", !on); }

async function loadGeoraster(cfg) {
  if (activeGeorasters[cfg.statKey]) return activeGeorasters[cfg.statKey].georaster;
  const resp = await fetch(cfg.url);
  const arrayBuffer = await resp.arrayBuffer();
  const georaster = await parseGeoraster(arrayBuffer);
  activeGeorasters[cfg.statKey] = { georaster, cfg };
  return georaster;
}

async function preloadAlwaysQueryLayers() {
  for (const cfg of LAYERS) {
    if (cfg.alwaysQuery && !activeGeorasters[cfg.statKey]) {
      try { await loadGeoraster(cfg); } catch (err) { console.error("Failed to preload", cfg.id, err); }
    }
  }
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}

function classifyValue(v, classification) {
  for (const b of classification.breaks) {
    if (b.test(v)) return b;
  }
  return null;
}

// Renders a locally-loaded COG as discrete classes, reading pixel values
// directly out of the parsed georaster array and reprojecting each screen
// tile's pixels to lat/lon on the fly (Web Mercator).
function createClassifiedRasterLayer(cfg, georaster) {
  const noData = cfg.noData !== undefined ? cfg.noData : georaster.noDataValue;
  const breaks = cfg.classification.breaks.map((b) => ({
    ...b,
    rgb: b.hide ? null : hexToRgb(b.color)
  }));
  const values = georaster.values[0];
  const { xmin, ymax, pixelWidth, pixelHeight, width, height } = georaster;

  const TileClass = L.GridLayer.extend({
    createTile(coords) {
      const tile = document.createElement("canvas");
      tile.width = 256; tile.height = 256;
      const ctx = tile.getContext("2d");
      const imgData = ctx.createImageData(256, 256);
      const d = imgData.data;
      const n = Math.pow(2, coords.z);
      for (let row = 0; row < 256; row++) {
        const yFrac = coords.y + row / 256;
        const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * yFrac) / n))) * 180) / Math.PI;
        const rasterRow = Math.floor((ymax - lat) / pixelHeight);
        const rowValid = rasterRow >= 0 && rasterRow < height;
        const rowBase = row * 256 * 4;
        for (let col = 0; col < 256; col++) {
          const i = rowBase + col * 4;
          if (!rowValid) { d[i + 3] = 0; continue; }
          const xFrac = coords.x + col / 256;
          const lon = (xFrac / n) * 360 - 180;
          const rasterCol = Math.floor((lon - xmin) / pixelWidth);
          if (rasterCol < 0 || rasterCol >= width) { d[i + 3] = 0; continue; }
          const v = values[rasterRow][rasterCol];
          if (v === null || v === undefined || Number.isNaN(v) || v === noData) { d[i + 3] = 0; continue; }
          const cls = classifyValue(v, { breaks });
          if (!cls || cls.hide || !cls.rgb) { d[i + 3] = 0; continue; }
          d[i] = cls.rgb[0]; d[i + 1] = cls.rgb[1]; d[i + 2] = cls.rgb[2]; d[i + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return tile;
    }
  });
  return new TileClass({ opacity: cfg.opacity, maxZoom: 14, zIndex: layerZIndex(cfg) });
}

async function buildLayer(cfg) {
  if (cfg.type === "cog-classified") {
    const georaster = await loadGeoraster(cfg);
    return createClassifiedRasterLayer(cfg, georaster);
  }
  if (cfg.type === "cog") {
    const georaster = await loadGeoraster(cfg);
    const scale = (cfg.discreteColors || cfg.binary) ? null : getColorScale(cfg.colorScale);
    const noData = cfg.noData !== undefined ? cfg.noData : georaster.noDataValue;
    const layer = new GeoRasterLayer({
      georaster,
      opacity: cfg.opacity,
      resolution: 256,
      zIndex: layerZIndex(cfg),
      pixelValuesToColorFn: (values) => {
        const v = values[0];
        if (v === null || v === undefined || Number.isNaN(v) || v === noData) return null;
        if (cfg.hideZero && v <= 0) return null;
        if (cfg.binary) return cfg.binaryTest(v) ? cfg.trueColor : null;
        if (cfg.discreteColors) return cfg.discreteColors[Math.round(v) - 1] || null;
        return scale(v).hex();
      }
    });
    return layer;
  }
  return null;
}

function renderLegend() {
  const panel = document.getElementById("legend-content");
  panel.innerHTML = "";
  LAYERS.forEach((cfg) => {
    if (!loadedLayers[cfg.id] || !loadedLayers[cfg.id].on) return;
    const box = document.createElement("div");
    box.className = "legend-item";
    const title = document.createElement("div");
    title.className = "legend-title";
    title.textContent = cfg.label;
    box.appendChild(title);

    if (cfg.discreteColors && cfg.categoryLabels) {
      Object.entries(cfg.categoryLabels).forEach(([num, label]) => {
        const row = document.createElement("div");
        row.className = "legend-row";
        row.innerHTML = `<span class="swatch" style="background:${cfg.discreteColors[Number(num) - 1]}"></span>${num}. ${label}`;
        box.appendChild(row);
      });
    } else if (cfg.binary) {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `<span class="swatch" style="background:${cfg.trueColor}"></span>${cfg.label}`;
      box.appendChild(row);
    } else if (cfg.classification) {
      cfg.classification.breaks.filter((b) => !b.hide).forEach((b) => {
        const row = document.createElement("div");
        row.className = "legend-row";
        row.innerHTML = `<span class="swatch" style="background:${b.color}"></span>${b.label}`;
        box.appendChild(row);
      });
    } else if (cfg.colorScale) {
      const colors = PALETTES[cfg.colorScale.palette];
      const grad = document.createElement("div");
      grad.className = "legend-gradient";
      grad.style.background = `linear-gradient(to right, ${colors.join(",")})`;
      box.appendChild(grad);
      const labels = document.createElement("div");
      labels.className = "legend-labels";
      const [lo, hi] = cfg.legendLabels || cfg.colorScale.domain;
      labels.innerHTML = `<span>${lo}</span><span>${hi}</span>`;
      box.appendChild(labels);
    }
    if (cfg.source) {
      const src = document.createElement("div");
      src.className = "source-note";
      src.innerHTML = `Source: ${cfg.source.label} <a href="${cfg.source.url}" target="_blank" rel="noopener">${cfg.source.url}</a>`;
      box.appendChild(src);
    }
    panel.appendChild(box);
  });
}

function renderLayerPanel() {
  const list = document.getElementById("layer-list");
  list.innerHTML = "";

  LAYERS.forEach((cfg) => {
    const row = document.createElement("label");
    row.className = "layer-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!loadedLayers[cfg.id]?.on;
    const span = document.createElement("span");
    span.textContent = cfg.label;
    row.appendChild(checkbox);
    row.appendChild(span);
    list.appendChild(row);

    checkbox.addEventListener("change", async (e) => {
      await toggleLayer(cfg, e.target.checked);
      renderLegend();
    });

    if (cfg.source) {
      const src = document.createElement("div");
      src.className = "source-note-inline";
      src.innerHTML = `Source: <a href="${cfg.source.url}" target="_blank" rel="noopener">${cfg.source.label}</a>`;
      list.appendChild(src);
    }
  });
}

async function initLayers() {
  for (const cfg of LAYERS) {
    if (cfg.defaultOn) await toggleLayer(cfg, true);
  }
  renderLayerPanel();
  renderLegend();
  preloadAlwaysQueryLayers();
}

async function toggleLayer(cfg, on) {
  if (!loadedLayers[cfg.id]) {
    loadedLayers[cfg.id] = { leafletLayer: null, on: false, loading: false, desiredOn: false };
  }
  const entry = loadedLayers[cfg.id];
  entry.desiredOn = on; // always track the latest click, even if a load is mid-flight

  if (on) {
    if (entry.leafletLayer) {
      entry.leafletLayer.addTo(map);
      entry.on = true;
      return;
    }
    if (entry.loading) return; // a load is already in flight; it will honor desiredOn when done
    entry.loading = true;
    setLoading(true);
    try {
      const leafletLayer = await buildLayer(cfg);
      entry.leafletLayer = leafletLayer;
      // The user may have unticked the box while this was still loading —
      // only actually show it if "on" is still what they want.
      if (entry.desiredOn) {
        leafletLayer.addTo(map);
        entry.on = true;
      }
    } catch (err) {
      console.error("Failed to load layer", cfg.id, err);
      alert(`Could not load layer "${cfg.label}". See console for details.`);
    } finally {
      entry.loading = false;
      setLoading(false);
    }
  } else {
    entry.on = false;
    if (entry.leafletLayer) map.removeLayer(entry.leafletLayer);
  }
}

// ---- Country lookup (for click-query place names) ----
let countryFeatures = null;
fetch("data/countries_simplified.geojson")
  .then((r) => r.json())
  .then((fc) => { countryFeatures = fc.features; })
  .catch((err) => console.error("Failed to load country boundaries", err));

function findCountry(lat, lng) {
  if (!countryFeatures) return null;
  const pt = turf.point([lng, lat]);
  for (const f of countryFeatures) {
    try {
      if (turf.booleanPointInPolygon(pt, f)) return f.properties.NAME_0;
    } catch (err) { /* skip invalid geometry */ }
  }
  return null;
}

// ---- Legend toggle ----
const legendPanel = document.getElementById("legend-panel");
document.getElementById("legend-toggle").addEventListener("click", () => legendPanel.classList.toggle("hidden"));
document.getElementById("legend-close").addEventListener("click", () => legendPanel.classList.add("hidden"));

// ---- Click-to-query ----
const infoPanel = document.getElementById("info-panel");
document.getElementById("info-close").addEventListener("click", () => infoPanel.classList.add("hidden"));

map.on("click", async (e) => {
  const { lat, lng } = e.latlng;
  const statsEl = document.getElementById("info-stats");
  const coordsEl = document.getElementById("info-coords");
  const country = findCountry(lat, lng);
  coordsEl.textContent = `${country ? country + " — " : ""}${lat.toFixed(3)}°, ${lng.toFixed(3)}°`;
  statsEl.innerHTML = "<p>Querying…</p>";
  infoPanel.classList.remove("hidden");

  const results = {};
  for (const [statKey, entry] of Object.entries(activeGeorasters)) {
    try {
      const val = geoblaze.identify(entry.georaster, [lng, lat]);
      results[statKey] = val ? val[0] : null;
    } catch (err) {
      results[statKey] = null;
    }
  }

  const rows = [];
  LAYERS.forEach((cfg) => {
    if (!cfg.statKey) return;
    let v = results[cfg.statKey];
    const noDataVal = cfg.noData !== undefined ? cfg.noData : activeGeorasters[cfg.statKey]?.georaster.noDataValue;
    let isNoData = v === null || v === undefined || Number.isNaN(v) || v === noDataVal;
    if (cfg.hideZero && !isNoData && v <= 0) isNoData = true;
    if (cfg.classification && !isNoData) {
      const cls = classifyValue(v, cfg.classification);
      if (cls && cls.hide) isNoData = true;
    }
    if (isNoData) v = null;
    let shown;
    if (isNoData) {
      shown = "no data";
    } else if (cfg.categoryLabels) {
      shown = `${Math.round(v)}. ${cfg.categoryLabels[Math.round(v)] || ""}`;
    } else if (cfg.id === "forest_landscape_integrity") {
      const { scaled, label } = classifyFlii(v);
      shown = `${scaled.toFixed(1)} / 10 — ${label}`;
    } else if (cfg.classification) {
      const cls = classifyValue(v, cfg.classification);
      shown = cls ? cls.label : "no data";
    } else {
      shown = Number(v).toFixed(3) + " " + (cfg.unit || "");
    }
    rows.push(`<div class="stat-row"><span>${cfg.statLabel}</span><strong>${shown}</strong></div>`);
  });
  statsEl.innerHTML = rows.join("");
});

renderLayerPanel();
initLayers();
