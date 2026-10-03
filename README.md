# Course Schedulizer 

A from-scratch rewrite of [this Course Schedulizer](https://github.com/senior-knights/course-schedulizer):
Build and check academic course
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

## Opening schedules from a link, and OneDrive

A link like `https://course-schedulizer.netlify.app/#/import?url=<file address>` opens that Excel file as a new schedule
(repeat `url=` for several files; a `name=` or `year=` after a `url=` belongs to that file). The file's server must allow other pages to read it: GitHub raw files,
Dropbox share links and files hosted on the site itself do; the Import tab builds the link.

**OneDrive / SharePoint** links and saving back to OneDrive need Microsoft sign-in, which needs an app registration (free, one time;
the site has no server, so there is no secret):

1. In the Microsoft Entra admin center: *App registrations → New registration*. Name it *Course Schedulizer*. For *Supported account
   types* choose *this organizational directory only* (then also set `VITE_MS_TENANT`, below) or *any organizational directory*.
2. Add a redirect URI of platform **Single-page application**: `https://<your site>/redirect.html` (and `http://localhost:5174/redirect.html`
   for `pnpm dev`).
3. *API permissions → Add → Microsoft Graph → Delegated*: `Files.Read.All` and `Files.ReadWrite.All`. (Opening files asks for the first;
   saving asks for the second only when someone saves.) If the organization does not let users consent themselves, an administrator
   grants consent once.
4. Copy the *Application (client) ID* into the build settings: on Netlify, *Site configuration → Environment variables* `VITE_MS_CLIENT_ID`
   (and `VITE_MS_TENANT` = the directory (tenant) ID, or leave it out for `organizations`); for local work, the same names in
   `apps/web/.env.local`. Redeploy. Without `VITE_MS_CLIENT_ID` the OneDrive features are simply hidden.

## Examples

The Import tab's **Examples** list comes from `apps/web/public/examples/examples.yml`: a list of `name` and `url`.
Choosing one fills the address box. A `url` is a file address relative to the site, or several files written
as a link's query (`url=a.xlsx&name=A&url=b.xlsx&name=B&year=AY25`). To add an example, put the workbook in that
folder and add an entry. The built-in examples are made from the synthetic fixtures by `pnpm examples`
(`apps/web/src/exampleBuilders.ts`); a test fails if the files are out of date.

## Site icon

The icon (a week grid of course blocks in maroon and gold) is `apps/web/public/favicon.svg`, used by
modern browsers. `python3 tools/make-icons.py` redraws the PNG versions (`favicon-32.png` and
`apple-touch-icon.png`) from the same geometry; edit both if the design changes.

## Release notes

`NEWS.md` lists what changed in each version, newest first, in the style of an R package's `NEWS.md`. The app shows it on
*Help → Release notes*. Add a bullet for each user-visible change; a test fails if the version in `package.json` has no
heading there.

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
