# Content validators

Every `*.ts` file in this folder (except `*.test.ts`) is a validator run by `npm run validate:content`.
Default export: `async (ctx: ValidationContext) => ValidationReport` (see `scripts/lib/validation.ts`).
Owners: `puzzles.ts` (WP-03), `bots.ts` (WP-04), `lessons.ts` (WP-07). How to add one: `docs/team/CONVENTIONS.md`.
