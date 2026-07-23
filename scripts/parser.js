/**
 * Reads a Roll20 campaign export ZIP and turns it into a plain-object
 * description of what it contains. Nothing here touches Foundry documents —
 * this stage only understands Roll20's layout.
 *
 * Expected layout (confirmed against a real export):
 *   campaign.json
 *   characters/<NNN - Name>/{character.json, avatar.png, token.png, bio.html}
 *   journal/<...nested folders...>/<NNN - Name>/character.json
 *   pages/<NNN - Name>/{page.json, thumbnail.*, graphics/<id>.<ext>}
 *   decks/<NNN - Name>/<NNN - Card>.png
 *   chat_archive.json
 */

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|bmp)$/i;

/** Roll20 folder names are prefixed with a sort index: "004 - Archibald Holmes". */
function stripIndex(name) {
  return name.replace(/^\d+\s*-\s*/, "");
}

/**
 * Roll20 permits trailing spaces in names, and the export writes them into
 * paths verbatim — so "Gossypium" and "Gossypium " are different directories.
 * Every lookup key goes through here.
 */
export function normalizeName(name) {
  return String(name ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Split a zip path into segments, dropping any leading "./" and empty parts. */
function segments(path) {
  return path.replace(/^\.\//, "").split("/").filter(Boolean);
}

async function readJSON(entry) {
  const text = await entry.async("string");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Could not read ${entry.name}: ${err.message}`);
  }
}

/**
 * @param {File} file  The .zip the user selected.
 * @param {(msg: string, pct: number) => void} [onProgress]
 * @returns {Promise<ParsedCampaign>}
 */
export async function parseCampaignZip(file, onProgress = () => {}) {
  const JSZip = await loadJSZip();

  onProgress("Reading archive", 0);
  const zip = await JSZip.loadAsync(file);

  const result = {
    campaign: null,
    characters: [], // { id, name, folderPath, data, avatar, token, bioHtml }
    pages: [], // { id, name, data, thumbnail, graphics: Map<id, entry> }
    decks: [], // { name, cards: [{ name, entry }], avatar }
    warnings: []
  };

  // ---- campaign.json -------------------------------------------------------
  const campaignEntry = findEntry(zip, "campaign.json");
  if (campaignEntry) result.campaign = await readJSON(campaignEntry);
  else result.warnings.push("No campaign.json found. Continuing without campaign settings.");

  // ---- group every file by its owning directory ---------------------------
  /** @type {Map<string, {dir: string, files: Map<string, JSZip.JSZipObject>}>} */
  const dirs = new Map();
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const segs = segments(path);
    if (segs.length < 2) return;
    const dir = segs.slice(0, -1).join("/");
    const filename = segs[segs.length - 1];
    if (!dirs.has(dir)) dirs.set(dir, { dir, files: new Map() });
    dirs.get(dir).files.set(filename, entry);
  });

  // ---- characters ---------------------------------------------------------
  // The flat characters/ tree is the canonical list. journal/ repeats the same
  // actors inside the folder hierarchy, so we read journal/ only to learn where
  // each actor lives and merge that onto the canonical record by Roll20 id.
  onProgress("Reading characters", 0.15);

  const byId = new Map();

  for (const { dir, files } of dirs.values()) {
    const segs = segments(dir);
    if (segs[0] !== "characters") continue;
    const charJson = files.get("character.json");
    if (!charJson) continue;

    const data = await readJSON(charJson);
    const record = {
      id: data.id ?? dir,
      name: normalizeName(data.name ?? stripIndex(segs[segs.length - 1])),
      folderPath: [],
      data,
      avatar: files.get("avatar.png") ?? null,
      token: files.get("token.png") ?? null,
      bioHtml: files.has("bio.html") ? await files.get("bio.html").async("string") : null
    };
    byId.set(record.id, record);
  }

  // journal/ supplies folder structure (and occasionally an actor that isn't
  // in characters/ at all, which we then adopt).
  for (const { dir, files } of dirs.values()) {
    const segs = segments(dir);
    if (segs[0] !== "journal") continue;
    const charJson = files.get("character.json");
    if (!charJson) continue;

    const data = await readJSON(charJson);
    // Folder path = everything between "journal" and the actor's own directory.
    const folderPath = segs.slice(1, -1).map((s) => normalizeName(stripIndex(s)));

    const existing = byId.get(data.id);
    if (existing) {
      existing.folderPath = folderPath;
      existing.avatar ??= files.get("avatar.png") ?? null;
      existing.token ??= files.get("token.png") ?? null;
      if (!existing.bioHtml && files.has("bio.html")) {
        existing.bioHtml = await files.get("bio.html").async("string");
      }
    } else {
      byId.set(data.id, {
        id: data.id ?? dir,
        name: normalizeName(data.name ?? stripIndex(segs[segs.length - 1])),
        folderPath,
        data,
        avatar: files.get("avatar.png") ?? null,
        token: files.get("token.png") ?? null,
        bioHtml: files.has("bio.html") ? await files.get("bio.html").async("string") : null
      });
    }
  }

  result.characters = [...byId.values()];

  // ---- pages --------------------------------------------------------------
  onProgress("Reading scenes", 0.5);

  for (const { dir, files } of dirs.values()) {
    const segs = segments(dir);
    if (segs[0] !== "pages" || segs.length !== 2) continue;
    const pageJson = files.get("page.json");
    if (!pageJson) continue;

    const data = await readJSON(pageJson);

    // Graphics live one level down in pages/<name>/graphics/<graphicId>.<ext>
    const graphicsDir = dirs.get(`${dir}/graphics`);
    const graphics = new Map();
    if (graphicsDir) {
      for (const [filename, entry] of graphicsDir.files) {
        if (!IMAGE_EXT.test(filename)) continue;
        graphics.set(filename.replace(IMAGE_EXT, ""), entry);
      }
    }

    let thumbnail = null;
    for (const [filename, entry] of files) {
      if (/^thumbnail\./i.test(filename)) thumbnail = entry;
    }

    result.pages.push({
      id: data.id ?? dir,
      name: normalizeName(data.name ?? stripIndex(segs[1])),
      data,
      thumbnail,
      graphics
    });
  }

  // Keep pages in the order Roll20 listed them.
  result.pages.sort((a, b) => (a.data.placement ?? 0) - (b.data.placement ?? 0));

  // ---- decks --------------------------------------------------------------
  onProgress("Reading decks", 0.8);

  for (const { dir, files } of dirs.values()) {
    const segs = segments(dir);
    if (segs[0] !== "decks" || segs.length !== 2) continue;

    const cards = [];
    let avatar = null;
    for (const [filename, entry] of files) {
      if (!IMAGE_EXT.test(filename)) continue;
      if (filename.toLowerCase().startsWith("avatar.")) {
        avatar = entry;
        continue;
      }
      cards.push({ name: normalizeName(stripIndex(filename.replace(IMAGE_EXT, ""))), entry });
    }
    cards.sort((a, b) => a.name.localeCompare(b.name));

    result.decks.push({ name: normalizeName(stripIndex(segs[1])), cards, avatar });
  }

  onProgress("Archive read", 1);
  return result;
}

function findEntry(zip, name) {
  let found = null;
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const segs = segments(path);
    if (segs.length === 1 && segs[0] === name) found = entry;
  });
  return found;
}

/**
 * JSZip is loaded from the module directory so the import works on servers
 * with no outbound network access.
 */
let _jszip = null;
async function loadJSZip() {
  if (_jszip) return _jszip;
  if (globalThis.JSZip) return (_jszip = globalThis.JSZip);

  const url = "modules/roll20-import/scripts/lib/jszip.min.js";
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load JSZip from ${url}`));
    document.head.appendChild(script);
  });

  if (!globalThis.JSZip) throw new Error("JSZip loaded but did not register itself.");
  return (_jszip = globalThis.JSZip);
}
