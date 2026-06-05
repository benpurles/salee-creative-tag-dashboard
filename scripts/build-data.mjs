import fs from "node:fs/promises";
import path from "node:path";

const ROOT = "/Users/benpurles/Documents/Salée Hair Co (Client)/creative-tag-dashboard";
const ADS_CSV = "/Users/benpurles/Downloads/Salée Top Ads - salée's-ad-account-Ads-May-5-2023-Jun-5-2026 (1).csv";
const TAGS_CSV = "/Users/benpurles/Downloads/Salée Top Ads - Tags.csv";
const EXTRACTED_XLSX = "/tmp/salee_top_ads_xlsx";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

function money(value) {
  if (value == null || value === "") return 0;
  const parsed = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function number(value) {
  if (value == null || value === "") return 0;
  const parsed = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanTag(tag) {
  return String(tag || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Hairsyle$/i, "Hairstyle")
    .replace(/^Hairstyling set$/i, "Hairstyling Set");
}

function normalizeDupe(value) {
  const cleaned = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return cleaned.startsWith("dupe ") ? cleaned : "";
}

const adRows = parseCsv(await fs.readFile(ADS_CSV, "utf8"));
const headers = adRows[0].map((h) => h.trim());
const rows = adRows.slice(1);
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

async function copyPreviewImages() {
  const mediaDir = path.join(EXTRACTED_XLSX, "xl", "media");
  const drawingXmlPath = path.join(EXTRACTED_XLSX, "xl", "drawings", "drawing1.xml");
  const relsPath = path.join(EXTRACTED_XLSX, "xl", "drawings", "_rels", "drawing1.xml.rels");
  const rowToPreview = new Map();
  try {
    const [drawingXml, relsXml] = await Promise.all([
      fs.readFile(drawingXmlPath, "utf8"),
      fs.readFile(relsPath, "utf8"),
    ]);
    const rels = new Map();
    for (const match of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="\.\.\/media\/([^"]+)"/g)) {
      rels.set(match[1], match[2]);
    }
    const anchorRegex = /<xdr:oneCellAnchor>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"[\s\S]*?<\/xdr:oneCellAnchor>/g;
    const previewDir = path.join(ROOT, "assets", "previews");
    await fs.rm(previewDir, { recursive: true, force: true });
    await fs.mkdir(previewDir, { recursive: true });
    for (const match of drawingXml.matchAll(anchorRegex)) {
      const sheetRow = Number(match[1]) + 1;
      const mediaName = rels.get(match[2]);
      if (!mediaName) continue;
      const source = path.join(mediaDir, mediaName);
      const targetName = `row-${sheetRow}-${mediaName}`;
      await fs.copyFile(source, path.join(previewDir, targetName));
      rowToPreview.set(sheetRow, `./assets/previews/${targetName}`);
    }
  } catch {
    return rowToPreview;
  }
  return rowToPreview;
}

const rowToPreview = await copyPreviewImages();

const ads = rows.map((row, rowIndex) => {
  const tags = String(row[idx["Column 1"]] || "")
    .split(",")
    .map(cleanTag)
    .filter(Boolean);
  const spend = money(row[idx["Amount spent (USD)"]]);
  const resultsValue = money(row[idx["Results value"]]);
  const purchases = number(row[idx["Purchases"]]);
  const dupe = normalizeDupe(row[idx["Column 3"]]);
  return {
    id: row[idx["Ad ID"]] || `row-${rowIndex + 1}`,
    rowIndex: rowIndex + 1,
    adName: row[idx["Ad name"]] || "",
    previewImage: rowToPreview.get(rowIndex + 2) || "",
    spend,
    results: number(row[idx["Results"]]),
    uniqueOutboundClicks: number(row[idx["Unique outbound clicks"]]),
    landingPageViews: number(row[idx["Landing page views"]]),
    addsToCart: number(row[idx["Adds to cart"]]),
    checkoutsInitiated: number(row[idx["Checkouts initiated"]]),
    purchases,
    costPerUniqueOutboundClick: money(row[idx["Cost per unique outbound click (USD)"]]),
    averagePurchaseValue: money(row[idx["Average purchases conversion value"]]),
    resultsValue,
    resultsRoas: number(row[idx["Results ROAS"]]),
    frequency: number(row[idx["Frequency"]]),
    cpm: money(row[idx["CPM (cost per 1,000 impressions) (USD)"]]),
    costPerThousandReached: money(row[idx["Cost per 1,000 Meta Accounts reached (USD)"]]),
    tags,
    dupe,
    groupKey: dupe || `ad-${row[idx["Ad ID"]] || rowIndex + 1}`,
  };
});

const groupsByKey = new Map();
for (const ad of ads) {
  if (!groupsByKey.has(ad.groupKey)) {
    groupsByKey.set(ad.groupKey, []);
  }
  groupsByKey.get(ad.groupKey).push(ad);
}

function aggregateAds(groupAds) {
  const tagSet = new Set();
  for (const ad of groupAds) ad.tags.forEach((tag) => tagSet.add(tag));
  const spend = groupAds.reduce((sum, ad) => sum + ad.spend, 0);
  const resultsValue = groupAds.reduce((sum, ad) => sum + ad.resultsValue, 0);
  const purchases = groupAds.reduce((sum, ad) => sum + ad.purchases, 0);
  const uniqueOutboundClicks = groupAds.reduce((sum, ad) => sum + ad.uniqueOutboundClicks, 0);
  const landingPageViews = groupAds.reduce((sum, ad) => sum + ad.landingPageViews, 0);
  const addsToCart = groupAds.reduce((sum, ad) => sum + ad.addsToCart, 0);
  const checkoutsInitiated = groupAds.reduce((sum, ad) => sum + ad.checkoutsInitiated, 0);
  const first = groupAds[0];
  const names = [...new Set(groupAds.map((ad) => ad.adName))];
  const adIds = groupAds.map((ad) => ad.id).filter(Boolean);
  const previewImages = [...new Set(groupAds.map((ad) => ad.previewImage).filter(Boolean))];
  return {
    key: first.groupKey,
    label: first.dupe ? first.dupe.replace(/^d/, "D") : first.adName,
    primaryAdName: first.adName,
    adNames: names,
    adIds,
    previewImage: previewImages[0] || "",
    previewImages,
    sourceRows: groupAds.map((ad) => ad.rowIndex),
    duplicateTag: first.dupe,
    duplicateCount: groupAds.length,
    collapsed: groupAds.length > 1,
    tags: [...tagSet].sort((a, b) => a.localeCompare(b)),
    spend,
    results: groupAds.reduce((sum, ad) => sum + ad.results, 0),
    uniqueOutboundClicks,
    landingPageViews,
    addsToCart,
    checkoutsInitiated,
    purchases,
    resultsValue,
    cac: purchases ? spend / purchases : 0,
    roas: spend ? resultsValue / spend : 0,
    aov: purchases ? resultsValue / purchases : 0,
    cpc: uniqueOutboundClicks ? spend / uniqueOutboundClicks : 0,
    lpvRate: uniqueOutboundClicks ? landingPageViews / uniqueOutboundClicks : 0,
    atcRate: landingPageViews ? addsToCart / landingPageViews : 0,
    checkoutRate: addsToCart ? checkoutsInitiated / addsToCart : 0,
    purchaseRate: checkoutsInitiated ? purchases / checkoutsInitiated : 0,
    frequency: groupAds.reduce((sum, ad) => sum + ad.frequency * ad.spend, 0) / (spend || 1),
    cpm: groupAds.reduce((sum, ad) => sum + ad.cpm * ad.spend, 0) / (spend || 1),
  };
}

const creatives = [...groupsByKey.values()].map(aggregateAds);

const guideRows = parseCsv(await fs.readFile(TAGS_CSV, "utf8"));
const tagGuide = guideRows
  .map((row) => ({ tag: cleanTag(row[0]), category: cleanTag(row[1]) }))
  .filter((row) => row.tag && row.category);

const guideMap = Object.fromEntries(tagGuide.map((row) => [row.tag, row.category]));
const allTags = [...new Set(creatives.flatMap((creative) => creative.tags))]
  .sort((a, b) => a.localeCompare(b))
  .map((tag) => ({ tag, category: guideMap[tag] || "Uncategorized" }));

const totals = aggregateAds(ads);
totals.key = "all";
totals.label = "All raw top ads";

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    adsCsv: path.basename(ADS_CSV),
    tagsCsv: path.basename(TAGS_CSV),
  },
  totals,
  rawAds: ads,
  creatives,
  allTags,
  tagGuide,
};

await fs.mkdir(path.join(ROOT, "assets"), { recursive: true });
await fs.writeFile(
  path.join(ROOT, "assets", "data.js"),
  `window.SALEE_DASHBOARD_DATA = ${JSON.stringify(payload, null, 2)};\n`,
  "utf8",
);

console.log(JSON.stringify({
  rawAds: ads.length,
  collapsedCreatives: creatives.length,
  duplicateGroups: creatives.filter((creative) => creative.collapsed).length,
  tags: allTags.length,
}, null, 2));
