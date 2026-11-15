# Velora Web Foundation

A shared, modular interface for Velora web applications. Version **0.3.1**, foundation API **1**.

Velora Music and Velora Receipts consume this package. This package is frontend JavaScript and CSS; it has no music catalog, playback, authentication server, database, Rust server or third-party runtime dependency.

## Modules

| Module | Provides | Requires |
| --- | --- | --- |
| `core` | Neutral Light/Dark tokens, basic document styling, module runtime | — |
| `components` | Buttons, inputs, dialogs, focus, menus and shared colour bindings | core |
| `appearance` | Theme API 1 integration, Device mode, font choices and settings styles | core, components |
| `shell` | Sidebar layout, profile menu, branding, animated collapse and disclosures | core, components |
| `identity` | Login forms, profile picker, PIN dialog and personal-settings UI | core, components |

Every module has a `velora-module.json` with an ID, version, module API, dependencies and declared assets. Select only the modules your app needs. Dependencies are resolved automatically. New releases may update individual module versions without changing their IDs. An incompatible module API requires an explicit consumer upgrade.

## Use in an application

1. Pin a reviewed release or commit of this repository. Vendor a copy into the app so it works offline and in a standalone Docker build.
2. Select modules and call `createLock(packageRoot, modules, source)` from `tools/build.mjs`. Commit the returned lock with the consumer. It records SHA-256 digests of manifests, assets and build tooling.
3. Call `bundle(packageRoot, {lock, css})` during development or release builds. It verifies the lock, resolves dependencies and returns JS and CSS. Node 22+ is needed only to build; the deployed app needs no Node process.
4. Serve the output locally. Load the JS before your appearance adapter and stylesheet so the remembered appearance applies before first paint.

```js
const theme = window.VeloraFoundation.use('appearance').createTheme({
  catalog: yourThemeCatalog,
  storageKey: 'velora-finance-last-appearance',
  onChange: changes => saveSettingsForCurrentProfile(changes)
});
const font = window.VeloraFoundation.use('fonts').create({
  onChange: changes => saveSettingsForCurrentProfile(changes)
});
```

Call `theme.load(savedTheme)` and `font.load(savedFont)` when selecting a profile. `load` never saves preferences. `set` invokes the supplied callback. `remember` persists the welcome-screen theme independently. Device follows `prefers-color-scheme`; unknown themes fall back to Device. Both controllers have `destroy()` for unmounting.

The consumer owns authorization of profile selection, authentication and server writes. Identity UI receives app-supplied data and calls app-supplied handlers; it stores no accounts, credentials or sessions. Use different storage keys for different apps unless you deliberately want a shared preference.

The existing [Velora-Web-Themes](https://github.com/JROkkerman/Velora-Web-Themes) packages remain separate, colour-data-only plugins. Supply their validated API 1 catalog to the appearance module. Foundation modules are executable application dependencies, bundled at release time, not uploaded or executed as theme data.

## Preserve an existing design

Use explicit CSS includes at their original cascade positions:

```css
/* @foundation core/base.css */
/* @foundation components/controls.css */
/* application-specific rules */
/* @foundation core/appearance.css */
```

The build expands these locally without reordering rules. Keep application-specific styles in the consumer. Each module manifest lists its available styles. A new app can omit `css` to use all selected module styles in the package’s declared cascade order. The root manifest’s `style_order` keeps shared palette bindings after base shell rules, regardless of which optional modules are selected.

The shell defaults to no bottom bar. Apps with a persistent player can set `--app-bottom-inset`. Provide app-specific branding and navigation in HTML; `mountSidebar` receives actual elements and any number of disclosure groups. Use `.sidebar-disclosure`, `.sidebar-subnav-inner` and `.nav-chevron`; each trigger gets `data-sidebar-disclosure`. The shell handles keyboard access, outside clicks, focus return, reduced motion (CSS), small-screen behaviour and stored collapse state. See the workspace example for the complete markup.

API 1 retains existing colour token names, including some media-related aliases, for compatibility with shipped theme packages. The palette does not enable any music feature. Account policies, routing, settings persistence and product screens are supplied by each app; reusable identity UI belongs to the optional identity module.

## Develop and preview

```sh
npm test
npm run build:demo
npx --yes http-server examples/workspace -p 8010
```

The example is an independent document workspace using the same package; it requires no Velora Music backend. Generated demo assets are committed so any static server can serve the example. All production assets work without an internet connection. The preview server above is a development convenience, not a runtime dependency.

## Update Music and Receipts together

Keep `Velora-Web-Foundation`, `Velora-Music-Web`, and `Velora-Receipts-Web` next to each other. After editing Foundation, run this from the Foundation checkout:

```sh
./scripts/update-apps.sh
```

This takes one snapshot of the local Foundation package and applies it to both apps. It updates the vendored package and integrity lock, rebuilds generated assets, and runs each app's frontend checks. It preserves product code and each app's selected modules. There are no commits, pushes, database changes, or container restarts.

The launcher uses Node 22+ and Git when installed. Otherwise it uses Docker Desktop and a small cached updater image, so it works on a laptop without Node. Start Docker Desktop first. The Docker fallback mounts the common parent folder containing the checkouts; custom paths outside that folder should use Node directly.

```sh
# Preview which apps would change; current checks still run.
./scripts/update-apps.sh --check

# Update both apps from a published GitHub branch, release tag, or commit.
./scripts/update-apps.sh --ref main
./scripts/update-apps.sh --ref v0.1.1

# Explicit destinations, including future Velora products.
./scripts/update-apps.sh --app ../Velora-Music-Web --app ../Velora-Receipts-Web
```

`--ref` requires the updater-enabled Foundation 0.1.1+ source to have been committed and pushed to GitHub; tags must also exist on GitHub. The current local edits are not published automatically. A Git source is pinned to its resolved commit SHA. Local snapshots are clearly marked `local-worktree` with a base commit and SHA-256 file hashes, so uncommitted edits are never presented as a published release.

With Node installed, `npm run update:apps` is equivalent to the shell launcher. `node tools/update.mjs --app /path/to/app --source /path/to/Foundation` works with custom checkout locations.

## Update just one app

From Music or Receipts:

```sh
./scripts/update-foundation.sh
./scripts/update-foundation.sh --ref main
```

The default uses a sibling `Velora-Web-Foundation` checkout when present; otherwise it fetches GitHub `main`. An explicit `--ref` always uses GitHub. Use `--source /path/to/Foundation` for another local checkout, or `--check` for a preview.

After updating, review and commit the changed package, lock, and generated files in each app. Rebuild/redeploy each app to serve the new assets from Docker:

```sh
docker compose up -d --build app
```

Updates do not hot-swap files inside running containers. API-breaking releases are rejected until the consumer is deliberately upgraded.

## Safety and recovery

Each app defines its build command, checks and generated output files in `frontend/foundation.config.json`. Existing lock integrity and checks must pass before an update starts. Direct edits to locked vendor files or stale generated outputs stop the update; move shared changes into Foundation and rebuild app-specific changes first.

Before changing anything, the updater backs up the package, lock and generated outputs under the app's ignored `temp/foundation-backups/<backup-id>/`. If either app fails to build or pass its checks, both apps' Foundation files are restored. Unrelated application changes are preserved. A lock prevents concurrent updater processes.

To undo a successful update, use the backup ID printed by the updater. The central tool can also restore packages from before the updater existed:

```sh
./scripts/update-apps.sh --restore BACKUP_ID
# Or restore one app:
./scripts/update-apps.sh --app ../Velora-Music-Web --restore BACKUP_ID
```

Restore verifies the backup and reruns consumer checks. It saves the current files in another backup first. If a process is forcibly interrupted, stop any surviving updater process, inspect the backup directory, remove only that app's `.foundation-update.lock`, then run the central restore command. Do not remove a lock belonging to a running update. Backups are local and ignored by Git; retain them until you are satisfied with the update.

Source: [JROkkerman/Velora-Web-Foundation](https://github.com/JROkkerman/Velora-Web-Foundation). No package-registry release has been published. The existing all-rights-reserved license is retained; see `LICENSE`.

## Identity: login, profiles and personal settings

The optional `identity` module (API 1) supplies shared login layouts, profile cards, profile/PIN settings styles and form behavior. Music and Receipts use the same household login, profile picker, add-profile dialog and family management screens. Product branding, app-specific actions and private-data descriptions come from adapters. Nothing here grants access or stores credentials.

Add `"identity"` to `modules` in the application's `frontend/foundation.config.json`, then run the normal updater. This explicitly changes the selected modules in the integrity lock; other apps can omit identity. Existing consumers without a modules setting keep their lock selection.

```js
const identity = window.VeloraFoundation.use('identity');
const forms = identity.bindForms(document, {
  selector: '#login-form',
  submit: (values, {signal}) => app.signIn(values, {signal}),
  onSuccess: session => app.openSession(session),
});
// Without a submit callback, a form keeps its native POST and CSRF fields.
const serverForms = identity.bindForms(document);
// Server forms opt in with data-vf-identity-form.
// Destroy controllers when their owning view is removed.
```

`bindForms` handles duplicate submission, busy controls, safe text errors, async callbacks and cleanup. `validate(form, FormData)` can return a client-side error. Optional `context` and `isCurrent` callbacks prevent late responses from updating another profile. `onSuccess` receives the result and `{form, context, values, message}`. `reset()` aborts pending callbacks and restores controls; native submissions also reset after browser history restoration. Server-side validation remains required.

`mountProfilePicker({grid,status,onSelect,onAdd})` renders escaped profile names, keyboard-operable buttons and themed initials. Call `render([{id,name,first_name,description,disabled}], {allowAdd})`, `filter(predicate,{allowAdd})`, `setBusy(boolean)` or `destroy()`. Pass only profiles the server allows the current session to see. Labels, role descriptions and selection authorization come from the app.

`mountPinDialog({dialog,form,input,heading,status,cancel,onSubmit})` enhances a native `<dialog>`. `open(profile,{title,submitLabel})` focuses the PIN; closing/Escape clears it and restores focus. The app's `onSubmit(profile,pin,{signal,isCurrent})` verifies it on the server. Return false to keep the dialog open. Foundation never persists PINs.

`nameFields(person, labels)` renders first/prefix/last name inputs with escaping and autocomplete. `avatar(profile)` supplies a deterministic theme colour and initial. Apps choose which fields they expose.

Minimal login markup uses `identity-login`, `identity-login-card`, `identity-login-logo`; a panel composition uses `login-page`, `login-card`, `login-copy`. Profile settings use `profile-panel`, `profile-form-grid`, `profile-form-footer` and `person-name-fields`. Picker/PIN recipes use `profile-picker-grid`, `profile-choice`, `profile-pin-dialog` and `profile-pin-settings`. See Music and Receipts for both compositions. All colours use Foundation tokens. Music includes styles at existing cascade positions; Receipts uses the default Foundation bundle.

**Application boundary:** Rust owns sessions, CSRF, passwords/PINs, rate limits, administrator checks, profile ownership and API calls. Shared frontend UI does not imply shared accounts or cross-application login. A household session can list the household's profile names but must select/unlock a profile before accessing its data. Existing password-protected profiles must stay protected during migration.

## Shared first-run setup

The identity module owns `setup.html` and `setup.css`, based on Music's setup page. Both apps build this same page with `tools/setup.mjs`; branding supplies only `productName` and a local SVG `logo` (`href`, `viewBox`). The shared fields are first name, optional name prefix, last name, username, password and confirmation. The copy and layout are owned by Foundation.

`renderSetup(packageRoot, {productName, logo, transport, hidden})` supports a static SPA form and a `minijinja` server form. The server adapter preserves CSRF, escaped non-secret values and validation errors. Passwords are never put back into HTML. Each backend validates names, usernames, matching passwords and the one-time administrator boundary. This does not add shared sessions between apps.

Music's generated setup region in `frontend/index.html` and Receipts' `frontend/templates/foundation/setup.html` are verified build outputs, covered by the updater's backup and rollback alongside CSS and JavaScript. Do not edit these generated layouts in an app; update Foundation, then run the consumer updater and rebuild Docker.

The setup heading includes the product symbol inline before Velora, with the app name in the smaller sidebar wordmark style. Name prefixes remain optional without an extra label; password rules are enforced by the inputs and backend rather than a note below the form.

## Shared household flow (0.4.0)

`tools/household.mjs` exports `renderHousehold(root, {productName, logo, transport, hidden, heading, eyebrow, actions, connectDevices})`. It renders the integrity-pinned `identity/login.html` and `identity/picker.html`. `transport` is `static` for Music and `minijinja` for Receipts; the latter keeps native POST, CSRF and escaped username/error feedback. `actions` is trusted build-time markup for app-specific management links, never user content. Apps generate these templates during the normal Foundation build and check them in CI.

At runtime, use `mountAddProfile` for administrator-approved additions and `renderHouseholdManagement` + `mountHouseholdManagement` for the profile list, roles, access controls, creation and household credentials form. A request adapter receives `create`, `update` or `login` plus validated UI values; the server must revalidate every value and permission. Music retains its Library Management and connected-device actions. Receipts keeps declaration/export settings in its own profile page.

`mountPinDialog` and `mountAddProfile` accept `password_required` to preserve old account passwords during an upgrade. New profiles use optional PINs. Closing dialogs clears secrets. Household sign-in and profile selection must rotate credentials, validate CSRF, throttle unlock attempts and invalidate affected sessions after security changes. Foundation provides no cross-app SSO: each application's household remains local to its own server and database.

### Shared profile settings

The identity module provides `renderProfileSettings` and `mountProfileSettings` for the same personal-details and optional-PIN page in every app. Apps supply profile values, request callbacks and optional structured fields (for example Receipts' company and email). Foundation owns the markup, styling, validation, busy states and feedback. A missing `saveDetails` callback preserves a native POST form with the supplied CSRF token. Credentials, authorization and data ownership remain in each backend.

### Shared application settings and device connection

The optional appearance module exports `settings.render({themeChoices,fontChoices,productName,fontSample,persistenceNote})` and `settings.mount({root,theme,font})`. Both apps use the same Light/Dark/Device cards, theme preview, searchable theme selector and font selector. The existing appearance/font controllers own state; each app owns persistence. Destroy the mount before replacing a single-page view. Music-specific player and home preferences remain in Music.

Household pickers have no top-left branding. Pass `connectDevices: true` to `renderHousehold` for the shared connect-device button. `identity.renderConnectedDevices({productName})` supplies the common QR form and device list; each app supplies authorization, polling, cancellation and disconnect requests. Pairing must be administrator-approved, short-lived, single-use and leave the native client at profile selection. Foundation stores no pairing credentials.
