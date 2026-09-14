# Fieldnote Studio style lab

This is an original, two-page Astro website used to prove a narrow set of source-backed style edits. It is a normal static site: `npm run build` creates Home (`/`) and Contact (`/contact/`) without Stellar, an editor bridge, runtime credentials or sibling repositories. The site uses system fonts and CSS-drawn artwork; no third-party templates, imagery, fonts or other assets were copied. The example `hello@fieldnote.example` address is illustrative.

## Reproduce the site

From this directory:

```sh
nvm use
npm ci
npm run build
npm run dev -- --host 127.0.0.1
```

The fixture pins Node 22.23.2 (`.nvmrc` and `package.json`), npm 10.9.8 and Astro 7.3.2 exactly. Its own `package-lock.json` resolves all npm packages with registry URLs and integrity hashes. Astro 7.3.2 was checked against the npm registry on 2026-09-14; the official [Astro documentation](https://docs.astro.build/en/basics/project-structure/) describes `src/pages`, shared components and static output. The [configuration reference](https://docs.astro.build/en/reference/configuration-reference/) documents `output: 'static'`. No floating scaffold or external asset URL is needed. This lock is intentionally separate from the Stellar application's root lock.

## Edit surface

`.stellar/project.json` is the project-local edit manifest. Its paths are relative to this fixture. `source.locator` points to an authored node; `anchor` is a normal HTML ID, not a development-only editor marker. The manifest advertises only style and token editing for this known fixture. It does not imply general Astro import, HTML editing, client authorization or arbitrary source mutations.

| Rendered anchor | Source owner | Supported outcome |
| --- | --- | --- |
| `home-hero-title` | Unique `h1` in Home | Base `color`; an initial override makes reset visibly meaningful. |
| `home-hero-accent` | Nested `span` in Home hero title | Base `color`; its override rule starts empty. |
| `home-hero-actions` | Unique Home action group | Base or named mobile `gap`. |
| `home-primary-cta` | Unique Home link | Base `background-color`, `padding-inline`, `padding-block`, `border-radius`; mobile `padding-inline` has an existing override. |
| `contact-panel-title` | Unique Contact heading | Base `color`. |
| `contact-primary-cta` | Unique Contact link | Same base CTA properties; mobile `padding-inline` starts empty. |
| `home-feature-clarity`, `home-feature-rhythm` | Two calls to `FeatureCard.astro` | Inspectable, read-only shared component internals; editing the definition would affect both occurrences. |
| `contact-method-email`, `contact-method-visit` | Two calls to `ContactMethod.astro` | Inspectable, read-only shared component internals. |
| `home-process-steps` | Home `ol` with generated children | Inspectable, read-only dynamic source. |

For local style edits, `src/styles/site.css` keeps the non-editable class default in a separate rule from an existing `#id` override rule. A reset removes only the owned override declaration; the class default and rule remain. Rules that begin empty are intentional insertion points. The manifest binds each supported property to one fallback and one override CSS identity. Source edits must use the manifest's type, unit, token, bound and scope restrictions; computed style alone does not identify a writable declaration.

The named editable mobile scope is exactly `(max-width: 767px)`. Widths such as 390, 768 and 1440 CSS pixels describe previews and never silently select edit scope. The extra 1050px and 510px layout breakpoints in the authored stylesheet are read-only; they help the ordinary site adapt between preview sizes. There are no editable theme or state variants.

`src/styles/tokens.css` defines two approved concrete base tokens: color `--lab-color-action-base` and length `--lab-space-action`. Both primary CTA links use semantic `--lab-color-action` and `--lab-space-button` aliases through their shared class default. An approved `token.set` follows an alias to the concrete leaf and reviews its impact on both routes; it never replaces the `var(...)` alias declaration with a literal. The other site tokens are authored defaults outside this edit surface. Unknown, cyclic or ambiguous alias chains have no writable target.

M1-02 will create two independent working copies for runtime sessions. Those copies and their state should live in a documented gitignored local data directory owned by the runner, outside this seed fixture. The seed remains untouched while sessions edit their copies. No runner, manifest evaluator or editor integration is shipped by this fixture alone.
