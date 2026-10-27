# WCIF extensions of Grupitos

Grupitos keeps its settings in the competition's WCIF, as Groupifier and Delegate Dashboard keep theirs, so whoever manages the competition finds them on any device.

The app was first called WCA Easy Groups. Settings and files saved under the old ids (`wcaEasyGroups.Settings`, `wcaEasyGroups.Draft`, `wca-easy-groups.Draft`) are still read, and publishing replaces the old settings extension with `grupitos.Settings`.

## `grupitos.Settings` (competition)

Written when someone publishes from the app (Publish step) and read when the competition is opened.

```json
{
  "id": "grupitos.Settings",
  "specUrl": "https://github.com/ruben-lopez-dejuan/grupitos/blob/main/docs/WCIF_EXTENSION.md",
  "data": {
    "version": 1,
    "savedAt": "2026-10-24T18:40:00.000Z",
    "savedBy": "Name of who saved",
    "encoding": "deflate-raw;base64",
    "payload": "…"
  }
}
```

- `payload` is the JSON `{ "settings": WorkspaceSettings, "generatedWith": string }` compressed with raw DEFLATE and encoded in base64. It is compressed because the WCA keeps each extension in a 64 KB text column. `WorkspaceSettings` is defined in [`lib/draft.ts`](../lib/draft.ts): stations, rounds, rules, people's roles, printing options and the PRO configuration (schedule, properties, volunteers, clusters, assignment sets, station rules, teams, scoring).
- The groups and tasks themselves are not in the extension: they are the WCIF's own group activities and assignments.
- Competition extensions are part of the public WCIF. The settings must not hold private data.

## `grupitos.Draft` (files only)

The WCIF downloaded from the Publish step carries the whole draft (settings and proposal, including hand edits) in this competition extension, so that importing the file on another device restores the work. It holds personal data and is never sent to the WCA.

## Other extensions the app writes

- `org.cubingusa.natshelper.v1.Room` (stages), `org.cubingusa.natshelper.v1.Group` (stage of a group) and `org.cubingusa.natshelper.v1.Person` (properties), as [CompScript](https://github.com/cubingusa/compscript) uses them.
- `groupifier.ActivityConfig` with `featuredCompetitorWcaUserIds`, as [Groupifier](https://github.com/jonatanklosko/groupifier) uses it.
