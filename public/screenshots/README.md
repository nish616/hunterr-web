# Landing-page screenshots

Save the five screenshots here with these exact filenames (the landing page
references them):

| File | Which screenshot |
|------|------------------|
| `results.png`   | Dashboard with scored results (the "Stretch" matches with verdicts) — the featured/hero image |
| `progress.png`  | Dashboard mid-run (the live "Fetching → Filtering → Scoring" stages) |
| `profile.png`   | Profile & Preferences page (titles, skills, search window) |
| `companies.png` | Companies tracked page (the 85-company grid) |
| `resume.png`    | Résumé page (the AI-parsed "Current profile") |

PNG or JPG both work; if you use `.jpg`, update the `src` paths in
`src/app/page.tsx` accordingly. ~1600–2000px wide is plenty.

Tip: crop out the browser chrome for a cleaner look. These are committed to the
repo (they're in `public/`, not gitignored), so they'll deploy with the app.
