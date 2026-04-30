/* Runtime JLPT CSV loader.
 * Exposes globals:
 *   - loadJlptManifest(): Promise<string[]>
 *   - loadJlptDataset(level): Promise<{ level: string, rows: number }>
 */

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalizeCategoryKey(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (!key) return CATEGORY_FALLBACK;
  if (CATEGORY_META[key]) return key;
  if (!normalizeCategoryKey._warned) normalizeCategoryKey._warned = new Set();
  if (!normalizeCategoryKey._warned.has(key)) {
    normalizeCategoryKey._warned.add(key);
    console.warn(`Unknown CSV category "${key}", falling back to "${CATEGORY_FALLBACK}".`);
  }
  return CATEGORY_FALLBACK;
}

function buildDatasetFromCsvText(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    DATA = {};
    ORDER = [];
    return 0;
  }

  const header = rows[0].map((h) => String(h || "").trim().toLowerCase());
  const colJp = header.indexOf("japanese");
  const colEn = header.indexOf("english");
  const colCat = header.indexOf("categories");
  const colEmoji = header.indexOf("emoji");
  if (colJp < 0 || colEn < 0 || colCat < 0) {
    throw new Error("CSV must include japanese, english, and Categories columns.");
  }

  const groups = {};
  let count = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const jp = String(r[colJp] || "").trim();
    const en = String(r[colEn] || "").trim();
    if (!jp || !en) continue;

    const catKey = normalizeCategoryKey(r[colCat]);
    if (!groups[catKey]) groups[catKey] = [];

    const e = colEmoji >= 0 ? String(r[colEmoji] || "").trim() : "";

    groups[catKey].push({
      jp,
      r: "",
      en,
      e,
    });
    count += 1;
  }

  const discoveredKeys = Object.keys(groups);
  const knownInOrder = CANONICAL_ORDER.filter((k) => discoveredKeys.includes(k));
  const extras = discoveredKeys
    .filter((k) => !knownInOrder.includes(k))
    .sort((a, b) => a.localeCompare(b));
  ORDER = [...knownInOrder, ...extras];

  const nextData = {};
  ORDER.forEach((key) => {
    const meta = CATEGORY_META[key] || CATEGORY_META[CATEGORY_FALLBACK];
    nextData[key] = {
      label: meta.label,
      color: meta.color,
      words: groups[key] || [],
    };
  });
  DATA = nextData;
  return count;
}

async function loadJlptManifest() {
  try {
    const res = await fetch("src/jlpt-manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Manifest ${res.status}`);
    const parsed = await res.json();
    if (!Array.isArray(parsed?.levels)) throw new Error("Invalid manifest format");
    const levels = parsed.levels
      .map((v) => String(v || "").trim().toUpperCase())
      .filter((v) => /^N\d+$/.test(v));
    if (!levels.length) return ["N5"];
    return [...new Set(levels)];
  } catch (_) {
    return ["N5"];
  }
}

async function loadJlptDataset(level) {
  const normalized = String(level || "N5").trim().toUpperCase();
  const res = await fetch(`src/${normalized}-Vocab.csv`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed loading ${normalized}-Vocab.csv (${res.status})`);
  }
  const text = await res.text();
  const rows = buildDatasetFromCsvText(text);
  return { level: normalized, rows };
}
