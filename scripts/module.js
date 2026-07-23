import { ImportDialog } from "./import-dialog.js";

const MODULE_ID = "roll20-import";

Hooks.once("init", () => {
  // `eq` isn't registered by core in v13; the dialog template needs it.
  if (!Handlebars.helpers.eq) {
    Handlebars.registerHelper("eq", (a, b) => a === b);
  }

  game.settings.register(MODULE_ID, "assetPath", {
    name: "ROLL20IMPORT.SettingAssetPath",
    hint: "ROLL20IMPORT.SettingAssetPathHint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    open: () => new ImportDialog().render({ force: true })
  };
});

/**
 * v13 renders the Settings sidebar tab through this hook. Module buttons
 * conventionally sit under a heading of their own.
 */
Hooks.on("renderSettings", (app, html) => {
  if (!game.user.isGM) return;

  const element = html instanceof HTMLElement ? html : html[0];
  if (!element || element.querySelector(`.${MODULE_ID}-button`)) return;

  const section = document.createElement("section");
  section.classList.add("roll20-import-settings", "flexcol");

  const heading = document.createElement("h4");
  heading.classList.add("divider");
  heading.textContent = game.i18n.localize("ROLL20IMPORT.Title");

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(`${MODULE_ID}-button`);
  button.innerHTML = `<i class="fa-solid fa-file-import"></i> ${game.i18n.localize(
    "ROLL20IMPORT.OpenButton"
  )}`;
  button.addEventListener("click", () => new ImportDialog().render({ force: true }));

  section.append(heading, button);

  // Sit alongside the other module/documentation blocks near the end.
  const anchor =
    element.querySelector("section.documentation") ??
    element.querySelector("section.settings") ??
    element;
  anchor.after?.(section) ?? anchor.appendChild(section);
});
