# Third-party notices

## Groupifier

Parts of this project are derived from [Groupifier](https://github.com/jonatanklosko/groupifier)
by Jonatan Kłosko and contributors, licensed under the Apache License, Version 2.0.
A copy of the license is in [`licenses/groupifier-LICENSE.txt`](licenses/groupifier-LICENSE.txt).

Derived from commit `e44cb094eb7177b65c62fd06bdcb021a416a1654` (2026-10-12):

| File here | Origin in Groupifier | Changes |
| --- | --- | --- |
| `lib/scorecards/translations.ts` | `src/logic/translations.js` | TypeScript types and exports. |
| `lib/scorecards/scorecards.ts` | `src/logic/documents/scorecards.js`, `pdf-utils.js`, `src/logic/formatters.js` | TypeScript; reads this app's assignments instead of WCIF activities; Roboto only (non-Latin local names print the Latin name, Chinese layouts not offered); no featured-competitor star. |
| `lib/group-generator.ts` | `src/logic/groups.js`, `src/logic/formulas.js`, `src/logic/competitors.js` | Reimplemented for a model without schedule times; the "name-optimised" rule no longer drops people; extra roles (delegate duty, data entry, staff) and a strict scrambler mode. |
| `lib/rounds.ts` | `src/logic/formulas.js`, `src/logic/competitors.js` | Group, scrambler and runner suggestions; expected competitors in later rounds. |

## CompScript

The PRO mode follows the design of [CompScript](https://github.com/cubingusa/compscript) (MIT,
by CubingUSA): rooms with natshelper stages (`CreateStage`), groups split like `CreateGroups`,
eligibility conditions such as `CanScramble`, and the staff scorers and per-group integer program
of `staff/scorers.js` and `staff/assign.js`. The ideas were reimplemented in TypeScript for this
app (`lib/pro/*`); no CompScript source file was copied.

## javascript-lp-solver

The PRO staff engine solves each group with [javascript-lp-solver](https://github.com/JWally/jsLPSolver),
released into the public domain under the Unlicense.

## Delegate Dashboard

The list of staff assignment types (delegate, stage lead, announcer, data entry, other) follows
[Delegate Dashboard](https://github.com/coder13/delegateDashboard). No code was copied from it,
as it is licensed under the GPL-3.0.

## pdfmake

Scorecards are rendered with [pdfmake](https://github.com/bpampuch/pdfmake) (MIT) and its bundled Roboto font (Apache-2.0).

## WCA logo

`public/wca-logo.svg` is the World Cube Association logo, taken from
[`app/assets/images/WCA Logo.svg`](https://github.com/thewca/worldcubeassociation.org/blob/main/app/assets/images/WCA%20Logo.svg)
in the WCA website repository, with the editor metadata removed. It is a registered trademark of the
World Cube Association and is used only to mark signing in with a WCA account. This project is not
an official WCA product.
