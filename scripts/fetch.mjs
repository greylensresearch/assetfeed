// AssetFeed data pipeline
// Fetches every feed in data/sources.json, keeps only items that read as an
// asset seizure/forfeiture, sorts each into one of the seven categories, and
// merges the result into data/seizures.json. Designed to run once a day from
// GitHub Actions with zero external services and zero cost.

import { readFile, writeFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";

const SOURCES_PATH = new URL("../data/sources.json", import.meta.url);
const OUTPUT_PATH = new URL("../data/seizures.json", import.meta.url);

const USER_AGENT =
  "AssetFeedBot/1.0 (+https://github.com/; research dashboard, contact via repo issues)";
const FETCH_TIMEOUT_MS = 20_000;
const RETENTION_DAYS = 60; // how long an item stays in the feed once seen
const MAX_ITEMS_PER_SOURCE = 40; // per-run cap per feed, keeps runs light

// ---- Category keyword map -------------------------------------------------
// Order matters only for the "primary category" pick when an item matches
// more than one bucket (e.g. "seized a helicopter and a villa").
const CATEGORIES = [
  {
    id: "rotorcraft",
    label: "Rotorcraft",
    code: "ROT",
    keywords: [/\bhelicopters?\b/i, /\brotorcraft\b/i, /\bchoppers?\b/i],
  },
  {
    id: "airplanes",
    label: "Airplanes",
    code: "AIR",
    keywords: [
      /\bprivate jets?\b/i,
      /\bjet aircraft\b/i,
      /\baircrafts?\b/i,
      /\bairplanes?\b/i,
      /\bwarplanes?\b/i,
      /\bgulfstream\b/i,
      /\blearjet\b/i,
      /\bcessna\b/i,
      /\bboeing\b/i,
      /\bairbus\b/i,
    ],
  },
  {
    id: "watercraft",
    label: "Watercraft",
    code: "WCR",
    keywords: [
      /\byachts?\b/i,
      /\bsuperyachts?\b/i,
      /\bvessels?\b/i,
      /\bboats?\b/i,
      /\bcatamarans?\b/i,
      /\bspeedboats?\b/i,
      /\bcargo ships?\b/i,
      /\btankers?\b/i,
    ],
  },
  {
    id: "vehicles",
    label: "Vehicles",
    code: "VEH",
    keywords: [
      /\bcars?\b/i,
      /\bvehicles?\b/i,
      /\bSUVs?\b/i,
      /\bsedans?\b/i,
      /\btrucks?\b/i,
      /\bmotorcycles?\b/i,
      /\blamborghinis?\b/i,
      /\bferraris?\b/i,
      /\brolls[- ]royces?\b/i,
      /\bbentleys?\b/i,
      /\bluxury cars?\b/i,
      /\bfleet of cars?\b/i,
    ],
  },
  {
    id: "crypto",
    label: "Crypto",
    code: "XBT",
    keywords: [
      /\bbitcoins?\b/i,
      /\bcryptocurrenc(y|ies)\b/i,
      /\bcrypto\b/i,
      /\bethereum\b/i,
      /\busdt\b/i,
      /\bstablecoins?\b/i,
      /\bdigital assets?\b/i,
      /\bcrypto wallets?\b/i,
      /\bblockchain\b/i,
    ],
  },
  {
    id: "financial",
    label: "Financial Instruments",
    code: "FIN",
    keywords: [
      /\bbank accounts?\b/i,
      /\bcash\b/i,
      /\bfunds\b/i,
      /\bstocks?\b/i,
      /\bbonds\b/i,
      /\bsecurities\b/i,
      /\bshares\b/i,
      /\bsafe deposit\b/i,
      /\bgold bars?\b/i,
      /\bjewelr(y|ies)\b/i,
      /\bwire transfers?\b/i,
    ],
  },
  {
    id: "properties",
    label: "Properties",
    code: "PROP",
    keywords: [
      /\bmansions?\b/i,
      /\bvillas?\b/i,
      /\bestates?\b/i,
      /\bproper(ty|ties)\b/i,
      /\breal estate\b/i,
      /\bhouses?\b/i,
      /\bcondominiums?\b/i,
      /\bapartments?\b/i,
      /\branch(es)?\b/i,
      /\bland parcels?\b/i,
      /\bpenthouse\b/i,
    ],
  },
];

// An item only qualifies as a "seizure" at all if it matches this.
const SEIZURE_RE =
  /\b(seiz(e|ed|es|ing|ure|ures)|forfeit(ed|s|ure|ures)?|confiscat(e|ed|es|ing|ion)|assets? (frozen|freeze)|impound(ed|s|ing)?|asset recovery|sanctioned assets?)\b/i;

// Drop obvious false-positive contexts (e.g. sports "seized the lead").
const NEGATIVE_RE =
  /\b(seized the (lead|moment|opportunity|initiative|day)|market share|seized up|engine seized)\b/i;

function withinTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { promise: promise(controller.signal), cancel: () => clearTimeout(timer) };
}

async function fetchText(url) {
  const { promise, cancel } = withinTimeout(
    (signal) => fetch(url, { headers: { "User-Agent": USER_AGENT }, signal }),
    FETCH_TIMEOUT_MS
  );
  try {
    const res = await promise;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    cancel();
  }
}

function googleNewsUrl(query) {
  const params = new URLSearchParams({
    q: `${query} when:2d`,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function asArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function stripHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseFeedItems(xmlText) {
  let doc;
  try {
    doc = xmlParser.parse(xmlText);
  } catch {
    return [];
  }

  // RSS 2.0
  const rssItems = doc?.rss?.channel?.item;
  if (rssItems) {
    return asArray(rssItems).map((it) => ({
      title: stripHtml(it.title?.["#text"] ?? it.title),
      link:
        typeof it.link === "string"
          ? it.link
          : it.link?.["#text"] ?? it.link?.["@_href"] ?? "",
      description: stripHtml(
        it.description?.["#text"] ?? it.description ?? it["content:encoded"] ?? ""
      ),
      pubDate: it.pubDate ?? it["dc:date"] ?? null,
    }));
  }

  // Atom
  const atomEntries = doc?.feed?.entry;
  if (atomEntries) {
    return asArray(atomEntries).map((it) => {
      const linkField = asArray(it.link).find((l) => l?.["@_rel"] !== "self") ?? it.link;
      return {
        title: stripHtml(it.title?.["#text"] ?? it.title),
        link:
          typeof linkField === "string" ? linkField : linkField?.["@_href"] ?? "",
        description: stripHtml(it.summary?.["#text"] ?? it.summary ?? it.content ?? ""),
        pubDate: it.updated ?? it.published ?? null,
      };
    });
  }

  return [];
}

function categorize(title, description) {
  const text = `${title} ${description}`;
  if (!SEIZURE_RE.test(text)) return null;
  if (NEGATIVE_RE.test(text)) return null;

  const matched = CATEGORIES.filter((c) => c.keywords.some((re) => re.test(text)));
  if (matched.length === 0) return null;

  return {
    primary: matched[0].id,
    all: matched.map((c) => c.id),
  };
}

function normalizeDate(raw) {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

async function loadExisting() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function processSource(source) {
  const url = source.kind === "google_news" ? googleNewsUrl(source.query) : source.url;
  let xml;
  try {
    xml = await fetchText(url);
  } catch (err) {
    console.error(`[skip] ${source.id}: ${err.message}`);
    return [];
  }

  const rawItems = parseFeedItems(xml).slice(0, MAX_ITEMS_PER_SOURCE);
  const out = [];

  for (const it of rawItems) {
    if (!it.title || !it.link) continue;
    const cat = categorize(it.title, it.description);
    if (!cat) continue;

    out.push({
      id: it.link,
      title: it.title,
      link: it.link,
      summary: it.description ? it.description.slice(0, 320) : "",
      publishedAt: normalizeDate(it.pubDate),
      source: source.name,
      sourceId: source.id,
      region: source.region,
      tier: source.tier,
      category: cat.primary,
      categories: cat.all,
    });
  }

  return out;
}

async function main() {
  const { feeds } = JSON.parse(await readFile(SOURCES_PATH, "utf-8"));
  const existing = await loadExisting();

  const results = await Promise.all(feeds.map(processSource));
  const fresh = results.flat();

  const byId = new Map();
  for (const item of existing) byId.set(item.id, item);
  for (const item of fresh) byId.set(item.id, item); // fresh data wins on conflict

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const merged = [...byId.values()].filter(
    (item) => new Date(item.publishedAt).getTime() >= cutoff
  );

  merged.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const counts = CATEGORIES.reduce((acc, c) => {
    acc[c.id] = merged.filter((i) => i.category === c.id).length;
    return acc;
  }, {});

  const payload = {
    generatedAt: new Date().toISOString(),
    itemCount: merged.length,
    categoryCounts: counts,
    sourceCount: feeds.length,
    items: merged,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(
    `Wrote ${merged.length} items (${fresh.length} fresh this run) across ${feeds.length} sources.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
