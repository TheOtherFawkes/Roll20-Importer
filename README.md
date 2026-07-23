# Roll20 Importer

Brings a Roll20 campaign export into Foundry VTT — scenes with their maps and
tokens, actors, journals, and images.

**Status: early.** This release reads an export and shows you what's in it. It
does not yet write scenes or actors to your world. See [Roadmap](#roadmap).

- Foundry **v13**
- System: **dnd5e** 4.0.0+

## Install

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/TheOtherFawkes/Roll20-Importer/releases/latest/download/module.json
```

Or download `module.zip` from [Releases](https://github.com/TheOtherFawkes/Roll20-Importer/releases)
and extract it into `Data/modules/roll20-import/`.

## Exporting from Roll20

Roll20 has no built-in campaign export, so you need the
[R20Exporter](https://github.com/kakaroto/R20Exporter) browser extension.

1. Install the extension in a Chromium browser.
2. Open your campaign — **Launch Game**, not the campaign settings page.
3. In the right-hand sidebar, open the **Settings** tab (the gear at the far
   right of the tab row, next to chat and journal).
4. Click **Export Campaign to ZIP** and wait. Large campaigns take a while and
   produce large files; 180 MB for a five-scene campaign is normal.

## Importing

1. Enable the module in your world.
2. Open the **Settings** tab in the sidebar and click **Import a Roll20 campaign**.
3. Drop in the ZIP. You'll see what it found before anything is written.
4. Choose how to handle documents a previous run created, then click **Import**.

### Replace or copy

- **Replace it** — updates the documents a previous run created, matching them
  by the Roll20 id stored on each one. Edits you've made in Foundry since the
  last run are lost. Useful while you're re-running imports.
- **Add a copy** — leaves existing documents alone and creates new ones.

**Reuse images already uploaded** skips re-uploading art that's already in
place. Leave it on unless images look wrong.

## What comes across

| Roll20 | Foundry |
| --- | --- |
| Page | Scene, sized from the page's grid units at 70 px each |
| Map-layer graphic | Tile |
| Token layer graphic | Token, linked to its actor where one exists |
| Character | Actor (`character` or `npc`, from the sheet's `npc` flag) |
| Journal folders | Folder structure |
| Handout | Journal entry |
| Deck | Journal entry with the card images |

Chat archives are not imported.

### Where actor statistics come from

For each Roll20 character the importer looks, in order:

1. A matching name in an Actor compendium — the dnd5e SRD packs, or anything
   else in the world.
2. 5eTools data on disk, if you have a module providing it.
3. The Roll20 sheet's own attributes.

Homebrew NPCs will always fall through to the third case, which is correct —
there's nothing to match them against. The report at the end of an import says
which source each actor used.

## Roadmap

- [x] Read the export and show its contents
- [ ] Scenes, tiles, and tokens
- [ ] Actors and folders
- [ ] Journals and handouts
- [ ] Walls and lighting

## Development

No build step. Clone into `Data/modules/roll20-import/` and reload Foundry.

```
scripts/parser.js         reads the export ZIP; knows nothing about Foundry
scripts/importer.js       writes documents into the world
scripts/import-dialog.js  the import window
templates/                Handlebars templates
```

`parser.js` is deliberately free of Foundry APIs so it can be tested outside
the VTT.

## Releasing

1. Bump `version` in `module.json` and update the `download` URL to the new tag.
2. Tag and push: `git tag v0.2.0 && git push --tags`
3. Create a GitHub release on that tag with a `module.zip` whose contents are
   the repository files (`module.json` at the root of the archive, not nested
   in a folder).

## Credits

Campaign exports come from [R20Exporter](https://github.com/kakaroto/R20Exporter)
by kakaroto. This module only reads what it produces.
