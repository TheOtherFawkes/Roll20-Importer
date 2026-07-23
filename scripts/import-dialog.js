import { parseCampaignZip } from "./parser.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The whole import flow lives in one window with three states:
 *   pick   → choose a file
 *   review → show what's in it, choose how to write it
 *   done   → report
 */
export class ImportDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "roll20-import-dialog",
    tag: "div",
    window: {
      title: "ROLL20IMPORT.Title",
      icon: "fa-solid fa-file-import",
      resizable: true
    },
    position: { width: 620, height: "auto" },
    classes: ["roll20-import"],
    actions: {
      chooseFile: ImportDialog.#onChooseFile,
      startImport: ImportDialog.#onStartImport,
      back: ImportDialog.#onBack,
      close: ImportDialog.#onCloseReport
    }
  };

  static PARTS = {
    body: { template: "modules/roll20-import/templates/import-dialog.hbs" }
  };

  /** @type {"pick"|"review"|"working"|"done"} */
  #stage = "pick";
  #file = null;
  #parsed = null;
  #progress = { message: "", pct: 0 };
  #report = null;
  #error = null;

  /** Write mode: replace matching documents, or always create new ones. */
  #mode = "overwrite";
  /** Skip re-uploading images that are already present. */
  #reuseImages = true;

  async _prepareContext() {
    return {
      stage: this.#stage,
      file: this.#file ? { name: this.#file.name, size: formatBytes(this.#file.size) } : null,
      parsed: this.#parsed ? this.#summarize(this.#parsed) : null,
      progress: this.#progress,
      report: this.#report,
      error: this.#error,
      mode: this.#mode,
      reuseImages: this.#reuseImages
    };
  }

  #summarize(parsed) {
    const npcs = parsed.characters.filter((c) => isNpc(c.data)).length;
    return {
      campaignName: parsed.campaign?.name ?? null,
      scenes: parsed.pages.length,
      characters: parsed.characters.length,
      npcs,
      pcs: parsed.characters.length - npcs,
      decks: parsed.decks.length,
      cards: parsed.decks.reduce((n, d) => n + d.cards.length, 0),
      warnings: parsed.warnings
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const el = this.element;

    el.querySelector("#roll20-zip")?.addEventListener("change", (ev) => {
      const file = ev.currentTarget.files?.[0] ?? null;
      if (file) this.#readFile(file);
    });

    el.querySelector("[name=mode]")?.addEventListener("change", (ev) => {
      this.#mode = ev.currentTarget.value;
    });

    el.querySelector("[name=reuseImages]")?.addEventListener("change", (ev) => {
      this.#reuseImages = ev.currentTarget.checked;
    });

    // Drag and drop onto the picker.
    const drop = el.querySelector(".drop-target");
    if (drop) {
      drop.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        drop.classList.add("is-over");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
      drop.addEventListener("drop", (ev) => {
        ev.preventDefault();
        drop.classList.remove("is-over");
        const file = ev.dataTransfer?.files?.[0];
        if (file) this.#readFile(file);
      });
    }
  }

  async #readFile(file) {
    if (!/\.zip$/i.test(file.name)) {
      this.#error = "That isn't a .zip. Choose the archive R20Exporter produced.";
      this.render();
      return;
    }

    this.#file = file;
    this.#error = null;
    this.#stage = "working";
    this.#progress = { message: "Reading archive", pct: 0 };
    this.render();

    try {
      this.#parsed = await parseCampaignZip(file, (message, pct) => {
        this.#progress = { message, pct: Math.round(pct * 100) };
        this.render();
      });
      this.#stage = "review";
    } catch (err) {
      console.error("Roll20 Import |", err);
      this.#error = err.message;
      this.#stage = "pick";
    }
    this.render();
  }

  static #onChooseFile() {
    this.element.querySelector("#roll20-zip")?.click();
  }

  static #onBack() {
    this.#stage = "pick";
    this.#parsed = null;
    this.#file = null;
    this.render();
  }

  static #onCloseReport() {
    this.close();
  }

  static async #onStartImport() {
    this.#stage = "working";
    this.#progress = { message: "Starting", pct: 0 };
    this.render();

    try {
      const { runImport } = await import("./importer.js");
      this.#report = await runImport(this.#parsed, {
        mode: this.#mode,
        reuseImages: this.#reuseImages,
        onProgress: (message, pct) => {
          this.#progress = { message, pct: Math.round(pct * 100) };
          this.render();
        }
      });
      this.#stage = "done";
    } catch (err) {
      console.error("Roll20 Import |", err);
      this.#error = err.message;
      this.#stage = "review";
    }
    this.render();
  }
}

function isNpc(data) {
  const attrs = data?.attributes ?? [];
  const npc = attrs.find((a) => a.name === "npc");
  return String(npc?.current ?? "") === "1";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}
