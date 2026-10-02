# Course Schedulizer 2.0

A from-scratch rewrite of the Course Schedulizer: build and check academic course
schedules, import and export them as Excel files, and see faculty load and
conflicts. Single editor; a schedule is shared by sending its Excel file.

```
packages/core   @schedulizer/core — schema, Excel import/export, conflicts, faculty
                load, section letters, cross-listings, constraints. Pure and tested.
apps/web        @schedulizer/web  — React 18 + Vite + react-router (hash routes).
fixtures        real and hand-written sample data with expected results (see its README)
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
