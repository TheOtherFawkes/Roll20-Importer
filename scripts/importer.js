/**
 * Writes a parsed campaign into the world.
 *
 * This is the skeleton: it proves the plumbing (upload target, folders, write
 * mode, progress, report) without yet converting scenes or actors. Those land
 * next, behind the same interface.
 */

const MODULE_ID = "roll20-import";

/** Every document this module creates carries its Roll20 id, so re-runs can find it. */
export const FLAG_SCOPE = MODULE_ID;
export const FLAG_KEY = "sourceId";

export async function runImport(parsed, { mode, reuseImages, onProgress } = {}) {
  const report = { scenes: 0, actors: 0, journals: 0, images: 0, notes: [] };

  onProgress?.("Preparing asset folder", 0.05);
  const assetRoot = await ensureAssetFolder();
  report.notes.push(`Images will be written to ${assetRoot}`);

  onProgress?.("Checking existing import", 0.1);
  const existing = findExistingDocuments();
  if (mode === "overwrite" && existing.total > 0) {
    report.notes.push(
      `Replacing ${existing.total} document(s) from a previous run.`
    );
  }

  // Converters attach here.
  onProgress?.("Nothing to write yet", 1);
  report.notes.push(
    "Skeleton run: the archive was read and the write target confirmed. Scene and actor conversion are not wired up yet."
  );

  return report;
}

/**
 * Assets go under the world's own directory so they travel with a world export
 * and never collide with another world's import.
 */
async function ensureAssetFolder() {
  const configured = game.settings.get(MODULE_ID, "assetPath");
  const root = configured?.trim() || `worlds/${game.world.id}/roll20-import`;

  const parts = root.split("/").filter(Boolean);
  let path = "";
  for (const part of parts) {
    path = path ? `${path}/${part}` : part;
    try {
      await foundry.applications.apps.FilePicker.implementation.createDirectory("data", path);
    } catch (err) {
      // "EEXIST" is the expected result on every run after the first.
      if (!/exists/i.test(err.message)) throw err;
    }
  }
  return root;
}

function findExistingDocuments() {
  const collections = [game.scenes, game.actors, game.journal, game.folders];
  let total = 0;
  const byId = new Map();

  for (const collection of collections) {
    for (const doc of collection) {
      const sourceId = doc.getFlag(FLAG_SCOPE, FLAG_KEY);
      if (!sourceId) continue;
      byId.set(sourceId, doc);
      total++;
    }
  }
  return { total, byId };
}
