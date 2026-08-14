// Local dev: served by scripts/serve.py, which proxies /proxy/<url>.
// Deployed: point this at your Cloudflare Worker (see scripts/proxy-worker.js).
const PROXY_BASE = "/proxy/";

const map = L.map("map", { zoomControl: false, worldCopyJump: true }).setView([0, 30], 3);
L.control.zoom({ position: "topright" }).addTo(map);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: "abcd",
  maxZoom: 19,
  zIndex: 0
}).addTo(map);

// Within the shared tilePane, Leaflet stacks layers by explicit zIndex
// (not add order), so reference layers can sit reliably above the base
// map but below the analysis layers without needing bringToBack() —
// which sent them behind the opaque base map tiles too.
function layerZIndex(cfg) {
  return cfg.group === "Reference layers" ? 1 : 2;
}

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
  subdomains: "abcd",
  maxZoom: 19,
  pane: "shadowPane"
}).addTo(map);

const loadedLayers = {};   // id -> { leafletLayer, georaster (if cog), cfg }
const activeGeorasters = {}; // statKey -> { georaster, cfg }  (for click-query)

const loadingEl = document.getElementById("loading");
function setLoading(on) { loadingEl.classList.toggle("hidden", !on); }

let activeTheme = "overview";

function renderThemeTabs() {
  const el = document.getElementById("theme-tabs");
  el.innerHTML = "";
  THEMES.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "theme-tab" + (t.id === activeTheme ? " active" : "");
    btn.textContent = t.label;
    btn.addEventListener("click", () => switchTheme(t.id));
    el.appendChild(btn);
  });
  document.getElementById("theme-description").textContent =
    THEMES.find((t) => t.id === activeTheme).description;
}

async function switchTheme(themeId) {
  if (themeId === activeTheme) return;
  activeTheme = themeId;
  renderThemeTabs();

  const inTheme = (cfg) => activeTheme === "overview" || cfg.themes.includes(activeTheme);

  for (const cfg of LAYERS) {
    if (cfg.type === "unavailable") continue;
    const shouldBeOn = inTheme(cfg) && (activeTheme === "overview" ? loadedLayers[cfg.id]?.on ?? cfg.defaultOn : cfg.defaultOn);
    const isOn = loadedLayers[cfg.id]?.on;
    if (shouldBeOn && !isOn) await toggleLayer(cfg, true);
    if (!inTheme(cfg) && isOn) await toggleLayer(cfg, false);
  }
  renderLayerPanel();
  renderLegend();
}

async function loadGeoraster(cfg) {
  if (activeGeorasters[cfg.statKey]) return activeGeorasters[cfg.statKey].georaster;
  const resp = await fetch(cfg.url);
  const arrayBuffer = await resp.arrayBuffer();
  const georaster = await parseGeoraster(arrayBuffer);
  activeGeorasters[cfg.statKey] = { georaster, cfg };
  return georaster;
}

// Layers queried on every click regardless of visibility, so the info
// panel always has core stats (fragmentation, cost, carbon, bio, ghost roads)
// even if the user hasn't toggled those layers on visually.
async function preloadAlwaysQueryLayers() {
  for (const cfg of LAYERS) {
    if (cfg.type === "cog" && cfg.alwaysQuery && !activeGeorasters[cfg.statKey]) {
      try { await loadGeoraster(cfg); } catch (err) { console.error("Failed to preload", cfg.id, err); }
    }
  }
}

const protectedAreaCache = {}; // url -> features array, for point-in-polygon lookup

// GFW's tree-loss/tree-gain tiles encode extra data in RGB channels rather
// than being pre-styled. These filters recolor them client-side into clean,
// single-purpose layers instead of relying on GFW's (undocumented) decode shaders.
const LOSS_COLOR = [230, 57, 70]; // #e63946
const GAIN_COLOR = [31, 120, 209]; // #1f78d1
const TROPICAL_LAT_BAND = [-25.5, 25.5]; // matches the extent of the reprocessed COG layers

function makeLossFilter(minYear) {
  return (r, g, b, a) => {
    if (a === 0 || r < minYear) return null;
    return [LOSS_COLOR[0], LOSS_COLOR[1], LOSS_COLOR[2], 255];
  };
}
const TILE_FILTERS = {
  loss: (minYear) => makeLossFilter(minYear || 1),
  gain: () => (r, g, b, a) => {
    if (a === 0 || (r === 0 && b === 0)) return null;
    return [GAIN_COLOR[0], GAIN_COLOR[1], GAIN_COLOR[2], 255];
  }
};

// Web Mercator tile-row -> latitude, used to blank out rows outside the
// tropical belt so live GFW tiles don't show boreal/temperate artifacts
// (e.g. Finnish forestry clear-cuts) on a pantropical map.
function tileRowLatitudes(z, y, tileSize) {
  const n = Math.pow(2, z);
  const lats = new Array(tileSize);
  for (let row = 0; row < tileSize; row++) {
    const yFrac = y + row / tileSize;
    lats[row] = (Math.atan(Math.sinh(Math.PI * (1 - (2 * yFrac) / n))) * 180) / Math.PI;
  }
  return lats;
}

function createFilteredTileLayer(cfg) {
  const filterFn = TILE_FILTERS[cfg.filter](cfg.minLossYear);
  const TileClass = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = document.createElement("canvas");
      tile.width = 256; tile.height = 256;
      const ctx = tile.getContext("2d");
      const img = new Image();
      const rawUrl = cfg.url
        .replace("{z}", coords.z)
        .replace("{x}", coords.x)
        .replace("{y}", coords.y);
      const url = PROXY_BASE + encodeURIComponent(rawUrl);
      const rowLats = cfg.tropicalClip ? tileRowLatitudes(coords.z, coords.y, 256) : null;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 256, 256);
        try {
          const imgData = ctx.getImageData(0, 0, 256, 256);
          const d = imgData.data;
          for (let row = 0; row < 256; row++) {
            const outsideTropics = rowLats && (rowLats[row] < TROPICAL_LAT_BAND[0] || rowLats[row] > TROPICAL_LAT_BAND[1]);
            const rowStart = row * 256 * 4;
            for (let col = 0; col < 256; col++) {
              const i = rowStart + col * 4;
              if (outsideTropics) { d[i + 3] = 0; continue; }
              const out = filterFn(d[i], d[i + 1], d[i + 2], d[i + 3]);
              if (out === null) { d[i + 3] = 0; }
              else { d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3]; }
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (err) { /* CORS or decode issue on this tile */ }
        done(null, tile);
      };
      img.onerror = () => done(null, tile);
      img.src = url;
      return tile;
    }
  });
  return new TileClass({ opacity: cfg.opacity, attribution: cfg.attribution, maxZoom: 14, zIndex: layerZIndex(cfg) });
}

// GFW only offers "net change" pre-aggregated to admin/district polygons.
// This builds a pixel-level equivalent by fetching both the loss and gain
// tiles for the same z/x/y and combining them: loss-only -> red, gain-only
// -> blue, both (cleared then regrown) -> purple, neither -> transparent.
const NET_LOSS_COLOR = [230, 57, 70];
const NET_GAIN_COLOR = [31, 120, 209];
const NET_BOTH_COLOR = [142, 68, 173];

function createNetChangeLayer(cfg) {
  const TileClass = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = document.createElement("canvas");
      tile.width = 256; tile.height = 256;
      const ctx = tile.getContext("2d");
      const lossUrl = PROXY_BASE + encodeURIComponent(
        cfg.lossUrl.replace("{z}", coords.z).replace("{x}", coords.x).replace("{y}", coords.y)
      );
      const gainUrl = PROXY_BASE + encodeURIComponent(
        cfg.gainUrl.replace("{z}", coords.z).replace("{x}", coords.x).replace("{y}", coords.y)
      );
      const rowLats = tileRowLatitudes(coords.z, coords.y, 256);

      Promise.all([loadImageData(lossUrl), loadImageData(gainUrl)]).then(([lossData, gainData]) => {
        const out = ctx.createImageData(256, 256);
        const d = out.data;
        for (let row = 0; row < 256; row++) {
          const outsideTropics = rowLats[row] < TROPICAL_LAT_BAND[0] || rowLats[row] > TROPICAL_LAT_BAND[1];
          const rowStart = row * 256 * 4;
          for (let col = 0; col < 256; col++) {
            const i = rowStart + col * 4;
            if (outsideTropics) { d[i + 3] = 0; continue; }
            const lossHit = lossData && lossData[i + 3] > 0 && lossData[i] >= (cfg.minLossYear || 1);
            const gainHit = gainData && gainData[i + 3] > 0 && (gainData[i] > 0 || gainData[i + 2] > 0);
            let rgb = null;
            if (lossHit && gainHit) rgb = NET_BOTH_COLOR;
            else if (lossHit) rgb = NET_LOSS_COLOR;
            else if (gainHit) rgb = NET_GAIN_COLOR;
            if (!rgb) { d[i + 3] = 0; continue; }
            d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
          }
        }
        ctx.putImageData(out, 0, 0);
        done(null, tile);
      }).catch(() => done(null, tile));
      return tile;
    }
  });
  return new TileClass({ opacity: cfg.opacity, attribution: cfg.attribution, maxZoom: 14, zIndex: layerZIndex(cfg) });
}

function loadImageData(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const cctx = c.getContext("2d");
      cctx.drawImage(img, 0, 0, 256, 256);
      try { resolve(cctx.getImageData(0, 0, 256, 256).data); }
      catch (err) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
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

// Renders a locally-loaded COG as discrete classes (with an optional hatch
// pattern for one class) instead of a continuous colour ramp. Reads pixel
// values directly out of the already-parsed georaster array, reprojecting
// each screen tile's pixels to lat/lon on the fly (Web Mercator).
function createClassifiedRasterLayer(cfg, georaster) {
  const noData = cfg.noData !== undefined ? cfg.noData : georaster.noDataValue;
  const breaks = cfg.classification.breaks.map((b) => ({
    ...b,
    rgb: hexToRgb(b.color),
    hatchRgb: b.hatch ? hexToRgb(b.hatch) : null
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
          if (!cls) { d[i + 3] = 0; continue; }
          const rgb = cls.hatch && ((col + row) % 8) < 3 ? cls.hatchRgb : cls.rgb;
          d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return tile;
    }
  });
  return new TileClass({ opacity: cfg.opacity, attribution: cfg.attribution, maxZoom: 14, zIndex: layerZIndex(cfg) });
}

async function buildLayer(cfg) {
  if (cfg.type === "xyz") {
    return L.tileLayer(cfg.url, { opacity: cfg.opacity, attribution: cfg.attribution, maxZoom: 14, zIndex: layerZIndex(cfg) });
  }
  if (cfg.type === "xyz-filtered") {
    return createFilteredTileLayer(cfg);
  }
  if (cfg.type === "xyz-netchange") {
    return createNetChangeLayer(cfg);
  }
  if (cfg.type === "cog-classified") {
    const georaster = await loadGeoraster(cfg);
    return createClassifiedRasterLayer(cfg, georaster);
  }
  if (cfg.type === "geojson") {
    const resp = await fetch(cfg.url);
    const geojson = await resp.json();
    protectedAreaCache[cfg.id] = geojson.features;
    return L.geoJSON(geojson, { style: cfg.style });
  }
  if (cfg.type === "cog") {
    const georaster = await loadGeoraster(cfg);
    const scale = (cfg.binary || cfg.discreteColors) ? null : getColorScale(cfg.colorScale);
    const noData = cfg.noData !== undefined ? cfg.noData : georaster.noDataValue;

    const layer = new GeoRasterLayer({
      georaster,
      opacity: cfg.opacity,
      resolution: 256,
      zIndex: layerZIndex(cfg),
      pixelValuesToColorFn: (values) => {
        const v = values[0];
        if (v === null || v === undefined || Number.isNaN(v) || v === noData) return null;
        if (cfg.binary) return v === 1 ? cfg.trueColor : null;
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

    if (cfg.classification) {
      cfg.classification.breaks.forEach((b) => {
        const row = document.createElement("div");
        row.className = "legend-row";
        const swatchStyle = b.hatch
          ? `background:repeating-linear-gradient(45deg, ${b.color}, ${b.color} 3px, ${b.hatch} 3px, ${b.hatch} 6px)`
          : `background:${b.color}`;
        row.innerHTML = `<span class="swatch" style="${swatchStyle}"></span>${b.label}`;
        box.appendChild(row);
      });
    } else if (cfg.legend && cfg.legend.type === "swatches") {
      cfg.legend.items.forEach((it) => {
        const row = document.createElement("div");
        row.className = "legend-row";
        row.innerHTML = `<span class="swatch" style="background:${it.color}"></span>${it.label}`;
        box.appendChild(row);
      });
      if (cfg.legend.note) {
        const note = document.createElement("div");
        note.className = "note";
        note.textContent = cfg.legend.note;
        box.appendChild(note);
      }
    } else if (cfg.legend && cfg.legend.type === "gradient-swatches") {
      const grad = document.createElement("div");
      grad.className = "legend-gradient";
      grad.style.background = `linear-gradient(to right, ${cfg.legend.colors.join(",")})`;
      box.appendChild(grad);
      const labels = document.createElement("div");
      labels.className = "legend-labels";
      labels.innerHTML = cfg.legend.labels.map((l) => `<span>${l}</span>`).join("");
      box.appendChild(labels);
      if (cfg.legend.note) {
        const note = document.createElement("div");
        note.className = "note";
        note.textContent = cfg.legend.note;
        box.appendChild(note);
      }
    } else if (cfg.binary) {
      const row = document.createElement("div");
      row.className = "legend-row";
      row.innerHTML = `<span class="swatch" style="background:${cfg.trueColor}"></span>${(cfg.categoryLabels && cfg.categoryLabels[1]) || "Present"}`;
      box.appendChild(row);
    } else if (cfg.categorical && cfg.categoryLabels && cfg.discreteColors) {
      Object.entries(cfg.categoryLabels).forEach(([num, label]) => {
        const row = document.createElement("div");
        row.className = "legend-row";
        row.innerHTML = `<span class="swatch" style="background:${cfg.discreteColors[Number(num) - 1]}"></span>${num}. ${label}`;
        box.appendChild(row);
      });
    } else if (cfg.categorical && cfg.categoryLabels) {
      const scale = getColorScale(cfg.colorScale);
      Object.entries(cfg.categoryLabels).forEach(([num, label]) => {
        const row = document.createElement("div");
        row.className = "legend-row";
        row.innerHTML = `<span class="swatch" style="background:${scale(Number(num)).hex()}"></span>${num}. ${label}`;
        box.appendChild(row);
      });
    } else if (cfg.colorScale) {
      const grad = document.createElement("div");
      grad.className = "legend-gradient";
      const colors = cfg.colorScale.reverse ? [...PALETTES[cfg.colorScale.palette]].reverse() : PALETTES[cfg.colorScale.palette];
      grad.style.background = `linear-gradient(to right, ${colors.join(",")})`;
      box.appendChild(grad);
      const labels = document.createElement("div");
      labels.className = "legend-labels";
      labels.innerHTML = `<span>${cfg.colorScale.domain[0]}</span><span>${cfg.colorScale.domain[1]}</span>`;
      box.appendChild(labels);
      if (cfg.unit) {
        const unit = document.createElement("div");
        unit.className = "note";
        unit.textContent = cfg.unit;
        box.appendChild(unit);
      }
    }
    if (cfg.regionNote) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = cfg.regionNote;
      box.appendChild(note);
    }
    if (cfg.resolutionNote) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = cfg.resolutionNote;
      box.appendChild(note);
    }
    if (cfg.note) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = cfg.note;
      box.appendChild(note);
    }
    panel.appendChild(box);
  });
}

function renderLayerPanel() {
  const list = document.getElementById("layer-list");
  list.innerHTML = "";
  const inTheme = (cfg) => activeTheme === "overview" || (cfg.themes && cfg.themes.includes(activeTheme));

  const groups = {};
  LAYERS.forEach((cfg) => {
    if (!inTheme(cfg)) return;
    groups[cfg.group] = groups[cfg.group] || [];
    groups[cfg.group].push(cfg);
  });

  Object.entries(groups).forEach(([groupName, cfgs]) => {
    const groupEl = document.createElement("div");
    groupEl.className = "layer-group";
    const h = document.createElement("h3");
    h.textContent = groupName;
    groupEl.appendChild(h);

    cfgs.forEach((cfg) => {
      const row = document.createElement("label");
      row.className = "layer-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.disabled = cfg.type === "unavailable";
      checkbox.checked = !!loadedLayers[cfg.id]?.on;
      const span = document.createElement("span");
      span.textContent = cfg.label + (cfg.type === "unavailable" ? " (coming soon)" : "");
      row.appendChild(checkbox);
      row.appendChild(span);
      groupEl.appendChild(row);

      if (cfg.type === "unavailable") {
        row.title = cfg.note;
        row.classList.add("disabled-row");
      } else {
        checkbox.addEventListener("change", async (e) => {
          await toggleLayer(cfg, e.target.checked);
          renderLegend();
        });
      }
    });
    list.appendChild(groupEl);
  });
}

async function initLayers() {
  for (const cfg of LAYERS) {
    if (cfg.type !== "unavailable" && cfg.defaultOn) {
      await toggleLayer(cfg, true);
    }
  }
  renderLayerPanel();
  renderLegend();
  preloadAlwaysQueryLayers();
}

async function toggleLayer(cfg, on) {
  if (on) {
    if (!loadedLayers[cfg.id]) {
      setLoading(true);
      try {
        const leafletLayer = await buildLayer(cfg);
        loadedLayers[cfg.id] = { leafletLayer, on: true, cfg };
        if (leafletLayer.setZIndex) leafletLayer.setZIndex(layerZIndex(cfg));
        leafletLayer.addTo(map);
      } catch (err) {
        console.error("Failed to load layer", cfg.id, err);
        alert(`Could not load layer "${cfg.label}". See console for details.`);
      } finally {
        setLoading(false);
      }
    } else {
      loadedLayers[cfg.id].leafletLayer.addTo(map);
      loadedLayers[cfg.id].on = true;
    }
  } else if (loadedLayers[cfg.id]) {
    map.removeLayer(loadedLayers[cfg.id].leafletLayer);
    loadedLayers[cfg.id].on = false;
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

function findProtectedArea(lat, lng) {
  const features = protectedAreaCache["protected_areas"];
  if (!features) return undefined; // layer not loaded yet
  const pt = turf.point([lng, lat]);
  for (const f of features) {
    try {
      if (turf.booleanPointInPolygon(pt, f)) return true;
    } catch (err) { /* skip invalid geometry */ }
  }
  return false;
}

// ---- Legend toggle ----
const legendPanel = document.getElementById("legend-panel");
document.getElementById("legend-toggle").addEventListener("click", () => legendPanel.classList.toggle("hidden"));
document.getElementById("legend-close").addEventListener("click", () => legendPanel.classList.add("hidden"));

// ---- Click-to-query ----
const infoPanel = document.getElementById("info-panel");
document.getElementById("info-close").addEventListener("click", () => infoPanel.classList.add("hidden"));

let compareChart = null;

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
    const isNoData = v === null || v === undefined || Number.isNaN(v) || v === noDataVal;
    if (isNoData) v = null;
    let shown;
    if (isNoData) {
      shown = "no data";
    } else if (cfg.binary && cfg.categoryLabels) {
      shown = cfg.categoryLabels[Math.round(v)] || String(v);
    } else if (cfg.categoryLabels) {
      shown = `${Math.round(v)}. ${cfg.categoryLabels[Math.round(v)] || ""}`;
    } else if (cfg.classification) {
      const cls = classifyValue(v, cfg.classification);
      shown = `${Number(v).toFixed(3)}${cls ? " — " + cls.label : ""}`;
    } else {
      shown = Number(v).toFixed(cfg.categorical ? 0 : 3) + (cfg.categorical ? "" : " " + (cfg.unit || ""));
    }
    rows.push(`<div class="stat-row"><span>${cfg.statLabel}</span><strong>${shown}</strong></div>`);
  });

  const inPA = findProtectedArea(lat, lng);
  const paShown = inPA === undefined ? "toggle layer to check" : (inPA ? "Yes" : "No");
  rows.push(`<div class="stat-row"><span>Within protected area (Ch.4)</span><strong>${paShown}</strong></div>`);

  statsEl.innerHTML = rows.join("");

  // Comparison chart: current vs regeneration-scenario fragmentation at this point
  const chartData = {
    labels: ["Current", "All-PNR regen.", "Holistic-hotspot regen."],
    values: [results.currentFFI, results.allPnrFFI, results.hhFFI].map((v) => (v === null || v === undefined || Number.isNaN(v) ? null : v))
  };
  const ctx = document.getElementById("compare-chart").getContext("2d");
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chartData.labels,
      datasets: [{
        label: "Fragmentation Index",
        data: chartData.values,
        backgroundColor: ["#fc4e2a", "#41ab5d", "#2166ac"]
      }]
    },
    options: {
      scales: { y: { beginAtZero: true, max: 1 } },
      plugins: { legend: { display: false } }
    }
  });
});

renderThemeTabs();
initLayers();
