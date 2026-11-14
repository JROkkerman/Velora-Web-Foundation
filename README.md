# Velora Web Foundation

A shared, modular interface for Velora web applications. Version **0.1.0**, foundation API **1**.

Velora Music is the first consumer. This package is frontend JavaScript and CSS; it has no music catalog, playback, authentication, database, Rust server or third-party runtime dependency.

## Modules

| Module | Provides | Requires |
| --- | --- | --- |
| `core` | Neutral Light/Dark tokens, basic document styling, module runtime | — |
| `components` | Buttons, inputs, dialogs, focus, menus and shared colour bindings | core |
| `appearance` | Theme API 1 integration, Device mode, font choices and settings styles | core, components |
| `shell` | Sidebar layout, profile menu, branding, animated collapse and disclosures | core, components |

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

The consumer owns profile selection, authentication and server writes. No account credentials or profile data are handled by this package. Use different storage keys for different apps unless you deliberately want a shared preference.

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

API 1 retains existing colour token names, including some media-related aliases, for compatibility with shipped theme packages. The palette does not enable any music feature. Profile/account workflows, routing, settings persistence and product screens are intentionally supplied by each app. Further shared settings and shell markup can be extracted incrementally.

## Develop and preview

```sh
npm test
npm run build:demo
npx --yes http-server examples/workspace -p 8010
```

The example is an independent document workspace using the same package; it requires no Velora Music backend. Generated demo assets are committed so any static server can serve the example. All production assets work without an internet connection. The preview server above is a development convenience, not a runtime dependency.

## Updates

Update the pinned source deliberately, regenerate the consumer's lock and bundles, then run appearance, interaction and layout checks before releasing the app. Keep the previous lock/release to roll back. There are no background GitHub downloads or automatic updates.

Source: [JROkkerman/Velora-Web-Foundation](https://github.com/JROkkerman/Velora-Web-Foundation). Clone or download this repository and pin a reviewed commit when integrating it into an app. No package-registry release has been published. The existing all-rights-reserved license is retained; see `LICENSE`.
