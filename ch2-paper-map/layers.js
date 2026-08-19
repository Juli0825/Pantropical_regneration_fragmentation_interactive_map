// Layer configuration for the Chapter 2 (Natural Regeneration Opportunity) paper map.

const PALETTES = {
  Greens: ["#f7fcf5", "#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#006d2c", "#00441b"],
  // Approximated from the palette pasted from the paper (light cream/low -> orange -> dark brown/high).
  // Send exact hex codes if this needs to match precisely.
  PNR_YlOrBr: ["#ffffe5", "#fff7bc", "#fee391", "#fec44f", "#fe9929", "#ec7014", "#cc4c02", "#993404", "#662506"]
};

function getColorScale(cfg) {
  const colors = cfg.reverse ? [...PALETTES[cfg.palette]].reverse() : PALETTES[cfg.palette];
  return chroma.scale(colors).domain(cfg.domain);
}

// Extinction-risk-reduction classification. The source raster has no true
// NoData tag over ocean/non-target areas — it's baked in as exactly 0 —
// so "hide" has to catch v <= 0, not just v < 0, or the ocean shows as "Low".
const EXT_RISK_CLASSES = {
  breaks: [
    { test: (v) => v <= 0, hide: true },
    { test: (v) => v > 0 && v <= 0.001, color: "#FFBEBE", label: "Low" },
    { test: (v) => v > 0.001, color: "#6699CD", label: "High" }
  ]
};

// Forest Landscape Integrity Index: displayed to readers on a 0-10 scale
// (raw score / 1000) with an intuitive Low/Medium/High class, rather than
// the raw 0-10000 score which means nothing to a general audience.
const FLII_CLASSES = [
  { max: 6, label: "Low integrity" },
  { max: 9.6, label: "Medium integrity" },
  { max: Infinity, label: "High integrity" }
];
function classifyFlii(raw) {
  const scaled = raw / 1000;
  const cls = FLII_CLASSES.find((c) => scaled <= c.max);
  return { scaled, label: cls.label };
}

const LAYERS = [
  {
    id: "regen_category",
    label: "Cost–benefit categories for potential of natural regeneration",
    type: "cog",
    url: "data/regen_category_classes.tif",
    defaultOn: true,
    opacity: 0.8,
    resampleMethod: "nearest",
    categorical: true,
    alwaysQuery: true,
    discreteColors: [
      "#D3B7F1", "#BC92D9", "#BE71A4", "#A14BEF",
      "#BACDE1", "#5882B9", "#233D7F", "#000000",
      "#FAA9B9", "#FF72A0", "#F40550", "#AE0002"
    ],
    noData: 255,
    unit: "category",
    statKey: "regenCategory",
    statLabel: "Cost–benefit category",
    categoryLabels: {
      1: "Low cost, low carbon, low biodiversity",
      2: "Low cost, high carbon, low biodiversity",
      3: "Low cost, low carbon, high biodiversity",
      4: "Low cost, high carbon, high biodiversity  (= holistic hotspot)",
      5: "Medium cost, low carbon, low biodiversity",
      6: "Medium cost, high carbon, low biodiversity",
      7: "Medium cost, low carbon, high biodiversity",
      8: "Medium cost, high carbon, high biodiversity",
      9: "High cost, low carbon, low biodiversity",
      10: "High cost, high carbon, low biodiversity",
      11: "High cost, low carbon, high biodiversity",
      12: "High cost, high carbon, high biodiversity"
    },
    source: null
  },
  {
    id: "regen_category_4",
    label: "Holistic hotspot only (low cost, high carbon, high biodiversity)",
    type: "cog",
    url: "data/regen_category_classes.tif",
    defaultOn: false,
    opacity: 0.85,
    resampleMethod: "nearest",
    binary: true,
    binaryTest: (v) => v === 4,
    trueColor: "#A14BEF",
    noData: 255,
    source: null
  },
  {
    id: "ext_risk_reduction",
    label: "Species extinction-risk reduction",
    type: "cog-classified",
    url: "data/ext_risk_reduction.tif",
    defaultOn: false,
    opacity: 0.8,
    alwaysQuery: true,
    classification: EXT_RISK_CLASSES,
    unit: "risk-reduction score",
    statKey: "extRiskReduction",
    statLabel: "Species extinction-risk reduction",
    source: null
  },
  {
    id: "pnr_score",
    label: "Potential for natural regeneration score",
    type: "cog",
    url: "data/pnr_score_williams.tif",
    defaultOn: false,
    opacity: 0.75,
    resampleMethod: "bilinear",
    alwaysQuery: true,
    colorScale: { domain: [0, 1], palette: "PNR_YlOrBr" },
    legendLabels: ["Low", "High"],
    hideZero: true,
    unit: "score (0–1)",
    statKey: "pnrScore",
    statLabel: "Potential for natural regeneration score",
    source: {
      label: "Williams, B.A. et al. (2024). Nature.",
      url: "https://www.nature.com/articles/s41586-024-08106-4"
    }
  },
  {
    id: "forest_landscape_integrity",
    label: "Forest Landscape Integrity Index",
    type: "cog",
    url: "data/forest_landscape_integrity_tropics.tif",
    defaultOn: true,
    opacity: 0.8,
    resampleMethod: "bilinear",
    colorScale: { domain: [0, 10000], palette: "Greens" },
    legendLabels: ["0", "10"],
    noData: -9999,
    unit: "FLII score",
    statKey: "flii",
    statLabel: "Forest Landscape Integrity Index",
    source: {
      label: "Grantham, H.S. et al. (2020). Nature Communications.",
      url: "https://www.nature.com/articles/s41467-020-19493-3#Fig3"
    }
  }
];
