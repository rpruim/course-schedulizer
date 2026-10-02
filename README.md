# Course Schedulizer 2.0

A from-scratch rewrite of the Course Schedulizer: build and check academic course
schedules, import and export them as Excel files, and see faculty load and
conflicts. Single editor; a schedule is shared by sending its Excel file.

```
packages/core   @schedulizer/core — schema, Excel import/export, conflicts, faculty
                load, section letters, cross-listings, constraints. Pure and tested.
apps/web        @schedulizer/web  — React 18 + Vite + react-router (hash routes).
fixtures        synthetic and hand-written sample data with expected results (see its README)
design          the design notes and specification (spec.md)   [not tracked by git]
```

## Everyday commands

```bash
pnpm install
pnpm --filter @schedulizer/web dev   # http://localhost:5174 (core is used from source)
pnpm typecheck                       # core and web
pnpm test                            # vitest in both packages
pnpm build                           # core, then the static site in apps/web/dist
```

The built site is plain static files with relative paths: put `apps/web/dist` on
GitHub Pages or any web server, or open it from a file share.

Open an Excel file (the app's own export, or a file from the old Course
Schedulizer — if it has no academic year, type one in first), or load one of the
built-in synthetic examples.

## Hosting

The site is static, so any static host works. On Netlify: add the GitHub repository as a new site;
`netlify.toml` already sets the build command (`pnpm build`), the publish folder (`apps/web/dist`)
and Node 22, and `packageManager` in `package.json` pins the pnpm version. Every push to the main
branch deploys, and every branch or pull request gets a preview URL. Nothing else is needed: no
redirects, no environment variables. Schedules stay in each visitor's browser.

## Branches and releases

New work happens on `dev`; `main` is the released version that Netlify deploys. To release, fast-forward
`main` to `dev`:

```bash
git checkout main && git merge --ff-only dev && git push origin main
```

Bump `version` in the root `package.json` first if the release should have a new number (the About page
shows it). In Netlify, turn on branch deploys for `dev` (Site configuration → Build & deploy → Branches and
deploy contexts) to get a preview of `dev` at its own URL before releasing.

## Terms and parts of terms

The default terms (Fall, Winter Intensive, Spring, Summer), their parts (full term, halves,
quarters) and a few related defaults are defined in `config/settings.yaml`. Edit that file and
run `pnpm run settings` (the build, test and dev commands also do it); that regenerates
`packages/core/src/settings.defaults.generated.ts`. A schedule's own Settings sheet overrides
these defaults. A Settings screen is planned for later.

## License

MIT — see `LICENSE`. The licenses of the libraries this project uses are in
`THIRD-PARTY-NOTICES.md`; regenerate that file with `pnpm run notices` after
changing dependencies (it also refreshes the copies the built site serves from
`apps/web/public/`).
