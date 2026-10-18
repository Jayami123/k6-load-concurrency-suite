# Phase 4 batch 2: Medusa German layout, long titles, visual baselines and network states

## Context

Batch 1 (PR #37) gave P1 a Medusa admin suite (FW-001..005, X01..X05) and the `medusa-self-hosted` CI job with `visual_requested=false`. Batch 2 adds what the P1 test map calls P1-MED-I18N-001/002 and P1-MED-VIS-001/002/003. These are the layout-under-expansion, visual-stability and honest-loading/error primitives, plus the deferred a11y candidate (X06) and the extra cases below, all proven by a two-run live probe. The probe also found an environment gap: the harness-built admin bundle is a **development build**. That gap blocks the "no stack trace" oracles and is reported as a harness change (E-01, D9). P1 does not patch around it.

## 1. Header

- Repo: `D:\Jayami\Portfolio\p1-web-e2e-ci` · [Jayami123/playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework) · P1.
- Branch: **to be given by Jayami** after PR #37 merges. Placeholder only: `feat/2026-10-17-p1-phase4-batch2-medusa`. No branch was created.
- Base: **main @ `8c7d4ca9084ca579f3e5eecc35ed9d5cd022bb75`** (PR #37 merge). Verified 2026-10-17: `gh pr view 37` → `MERGED 8c7d4ca…`; `git fetch` + `git rev-parse origin/main` → `8c7d4ca…`. The plan was drafted from the PR #37 head `5ee47e3c5e20ec178be9f9e17e69632bc56a689f`, which is the merge's second parent, so every P1 path:line cited here is the same on the base.
- Harness: `qa-portfolio-harness#v0.2.10` = `312dae581cec2ec23eb05645ee0eb17e524d40a4` (local checkout `git describe` = `v0.2.10`; `package-lock.json:2196-2198`). That lock entry still says `"version": "0.2.9"` because the harness `package.json` version was not bumped in the tag. This is cosmetic and reported only.
- Medusa fork: `Jayami123/medusa-dtc-starter` @ **`f677db438f27294fc50e4c7c6612e71ff38eeff5`** (`git rev-parse HEAD`, clean), `@medusajs/medusa` and `@medusajs/dashboard` **2.21.2** (`apps/backend/package.json:29,32`).
- German strings: `node_modules/.pnpm/@medusajs+dashboard@2.21.2__f2dd…/node_modules/@medusajs/dashboard/src/i18n/translations/de.json` in the fork (cited below as `de.json:<line>`; English as `en.json:<line>`).
- Status: **approved with review answers (2026-10-17): D9–D12 and the review edits. Step 1 probe done twice. Not built.** Building waits for the harness tag `v0.2.11` (D9). That harness PR is a **separate task**: Jayami gives the go-ahead before it starts, and this plan does not change the harness.
- Plan file: `docs/plans/2026-10-17-p1-phase4-batch2-medusa.md`.
- Structure/depth model: [2026-10-11-phase-2e-task3-2fa.md](2026-10-11-phase-2e-task3-2fa.md). Facts and fixtures: [2026-10-16-phase4-batch1-medusa.md](2026-10-16-phase4-batch1-medusa.md). Visual/i18n/a11y patterns: Phase 3 cal/rest plans, ADR 0017, ADR 0018.
- "Verified" means seen live in this session's probe (rows Q-xx, run 1 and run 2) or read in source with path:line. Everything else is marked **not verified**. Probe scripts, JSON and PNGs stay only in the session scratchpad (`…/scratchpad/probe/`). Nothing was written to the repo, harness or fork.

## 2. Step 1: probe findings (run 1 and run 2)

Medusa was started with harness `node scripts/up.mjs medusa` (exit 0, 21 s: "Medusa already healthy … storefront already running"), then `npm run smoke -- medusa` (exit 0, 68 s, "smoke ok"). Both harness `.env` greps printed `1`, and both P1 `.env` greps printed `1`. All browser probes used Playwright 1.63.0 Chromium from P1's `node_modules` with a real admin session (API login → `POST /auth/session` → `connect.sid`, as `tests/setup/medusa.setup.ts:15-21`). **Run 2 matched run 1 on every row.** A scripted comparison of normalised JSON showed `SAME` for lang, order-de, long-title, tooltip, orders-visual, errors2, slow, a11y and extras; only the new order ids differed.

### Language (I18N-001 input)

| #    | Step                             | Request / UI                                                                                                            | Expected         | Observed r1 / r2                                                                                                                                                                                                                                        | Verdict                                                      |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Q-01 | Switch to Deutsch in the UI      | `/app/settings/profile` → unnamed menu → menuitem "Edit" → dialog "Edit Profile" → combobox → option "Deutsch" → "Save" | language changes | the only write is `POST /admin/users/{id} 200` (first/last name). Then cookie `lng=de` (SameSite Strict, session cookie, path `/`), `localStorage.lng=de`, `html[lang=de]`, h1 "Bestellungen". `GET /admin/users/me?fields=metadata` → `metadata: null` | Persisted **client-side only**; Save writes the shared admin |
| Q-02 | Fresh context, cookie only       | `context.addCookies([{name:"lng",value:"de"}])` → `/app/orders`                                                         | German           | `html[lang=de]`, h1 "Bestellungen"                                                                                                                                                                                                                      | Pass (isolation D1)                                          |
| Q-03 | Fresh context, localStorage only | storageState origin `lng=de`                                                                                            | German           | German, and the app also writes cookie `lng=de`                                                                                                                                                                                                         | Pass                                                         |
| Q-04 | Browser locale only              | `locale: "de-DE"`, nothing stored                                                                                       | –                | English (`Orders`); the detector order is cookie, localStorage, header (`i18n/config.ts:5-9`)                                                                                                                                                           | Locale is not a lever                                        |
| Q-05 | Other context while A is German  | new context, no `lng`                                                                                                   | English          | English                                                                                                                                                                                                                                                 | Pass: no cross-context leak                                  |
| Q-06 | Switch back                      | same flow → "English" (`exact`, because "English (UK)" also exists)                                                     | English          | `POST /admin/users/{id} 200`, cookie `lng=en`, h1 "Orders"                                                                                                                                                                                              | Pass                                                         |

### German order detail (I18N-001)

| #    | Step                | Viewport  | Observed r1 / r2                                                                                                                                                                                                                                                                                                                | Verdict                                       |
| ---- | ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Q-07 | Overflow            | 1440×900  | doc sw/cw 1440/1440; `main` sw/cw 1220/1220; 0 truncated leaves (sw > cw); 0 leaves beyond the viewport. Badges "Autorisiert" ×2 (`de.json:1300`) and "Ausstehend" ×2 (`de.json:1246/1303`) all sw = cw. 5 `[aria-haspopup=menu]` triggers in `main`, none clipped                                                              | Pass                                          |
| Q-08 | Overflow            | 820×1180  | doc 820/820, `main` 820/820, 0 truncated, 0 beyond viewport, badges sw = cw, 5 triggers none clipped                                                                                                                                                                                                                            | Pass                                          |
| Q-09 | Menu and headings   | both      | header trigger opens menu with menuitem "Abbrechen" (`de.json:125`). Headings "Zusammenfassung", "Zahlungen", "Unerfüllte Artikel", "Kunde", "Aktivität" all sw = cw. Console: 1 React `validateDOMNesting` warning (dev build, E-01)                                                                                           | Pass                                          |
| Q-10 | 393×852 (en and de) | 393×852   | doc 393/393, **`main` sw 438 (en) / 444 (de) > 393**. The "Unfulfilled Items"/"Unerfüllte Artikel" section trigger ends at x 438/444. `main` is `overflow-x: auto`, `scrollLeft` 45 after `scrollIntoViewIfNeeded`                                                                                                              | Candidate F-07 (X13), **not German-specific** |
| Q-11 | Variability         | 1440, 820 | same order loaded twice: **0 px**. Two different orders differ in: display id (h1 and breadcrumb `#N`), header date line ("16. Okt. 2026 18:30 von …"), payment id `#XXXXXXX`, payment date, "Die Zahlung #… kann erfasst werden.", item title, address name lines                                                              | Mask list D3                                  |
| Q-12 | Clip + masks        | 1440, 820 | clip from the page top to 8 px above h2 "Zahlungen" (height 630). Desktop width = h2 "Kunde" x − 24 (988); tablet full width. Masks: text `/^#\d+$/` + `main div:has(> h1)`. Two different orders: **desktop 40–56 px (≤ 0.009 %), tablet 40 px (0.008 %)**, both runs. Badges and the action menu stay visible (image checked) | Baseline design D3                            |

### Long title (I18N-002)

| #    | Step           | Request / UI                                                                                                    | Observed r1 / r2                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Verdict                             |
| ---- | -------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Q-13 | API boundary   | `POST /admin/products` titles of 254, 255, 256, 255 umlaut (`ä`), 255 UTF-16 units with emoji, 255 German words | all **200**; stored `title.length` equals sent (254/255/256/255/255/255). There is no 255 limit (batch 1 P-29 accepted 5,033)                                                                                                                                                                                                                                                                                                                                                               | BVA has no server edge; UI only     |
| Q-14 | List rendering | `/app/products?q=<prefix>` at 1440, 820, 393                                                                    | request `GET /admin/products?limit=20&offset=0&is_giftcard=false&q=…&fields=id,title,handle,status,*collection,*sales_channels,variants.id,thumbnail,…`. Title span: `text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap`, long titles sw (1669–2247) > cw 214, short sw = cw 120. **Row height 48 for every row**; span right ≤ cell right ≤ next cell left. The only `[title]` in the row is 21 chars ("Default Sales Channel"), so **no title attribute on the name**    | Pass (ellipsis, stable height)      |
| Q-15 | Tooltip        | hover the title span, 3 attempts per title                                                                      | `role=tooltip` text **equals the full title** for every long title (254/255/256/umlaut/emoji/words) at 1440 and 820. Short title: no tooltip. The first long-title hover on a fresh page needed a **second pointer move** (l254 attempt 1, both viewports, both runs); after that the first hover was enough. The tooltip stays until `Escape`. The span is not focusable (`tabindex` null). Source: `truncated-text.tsx:19-47` measures overflow on `mouseenter`, then enables the tooltip | Pass; page object hovers twice (D5) |

### Orders list baseline (VIS-001)

| #    | Step                                            | Observed r1 / r2                                                                                                                                                                                                                                                                                                                            | Verdict                       |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Q-16 | Request and filter                              | `GET /admin/orders?fields=id,status,created_at,email,display_id,custom_display_id,payment_status,fulfillment_status,total,currency_code,*customer,*sales_channel,*payment_collections,*shipping_address&limit…&q=<q>`. `?q=` filters ("3 of 3 results"). Searchbox is `input[type=search]` with the query as its value                      | Pass                          |
| Q-17 | Variable content                                | Date column is absolute server `created_at` ("Oct 16, 2026 " **with a trailing space**; tooltip "Oct 16, 2026 6:30 PM"), so a frozen clock does not change it. The Order column is `#N`, the Customer column is the email. Each row loads a flag SVG from **`https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/4x3/de.svg`** (third party) | Masks/stub D3                 |
| Q-18 | Two loads, same data                            | 0 px (ratio 0, max delta 0) at 393, 820 and 1440, masked and unmasked                                                                                                                                                                                                                                                                       | Stable rendering              |
| Q-19 | Two runs, different data                        | emails `p1-probe-r1-…` vs `p1-probe-r2-…` (same length), text masks: mobile 0.081 %, desktop 0.849 %, **tablet 1.087 % (> 1 % tolerance)**. `table { table-layout: auto }`: column lefts shift 1–2 px with content                                                                                                                          | **Text masks are not enough** |
| Q-20 | Same emails, token only in shipping `last_name` | `q` searches `shipping_address` (`order.js:81,91`, `address.js:9-18`). Two sets with identical emails, token only in `last_name`: column lefts identical; text masks 40 px (≤ 0.012 %). With **whole-cell masks** (`main tbody td:nth-child(1)`, `td:nth-child(2)`, `main input[type=search]`): **0 px at 393, 820 and 1440, both runs**    | Data design D2 + masks D3     |
| Q-21 | Title reuse                                     | create title T, delete it, create T again → **200**, same handle (both runs)                                                                                                                                                                                                                                                                | Constant titles allowed (D2)  |

### Error states (VIS-002, X09, X12)

`page.route("**/admin/products*")` matched only the products list call (`?limit=20&offset=0&is_giftcard=false&fields=…`). "cold" = `page.goto("/app/products")`; "nav" = orders first, then sidebar link "Products".

| #    | Mock                          | Observed r1 / r2 (cold and nav identical)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Verdict                            |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Q-22 | 500 JSON                      | title **"500 - Internal server error"** (`en.json:387`) + "An unexpected error occurred on the server. Please try again later." (`en.json:388`). **2 requests about 1.1 s apart** (`retry: 1`, `lib/query-client.ts:10`). URL stays `/app/products`; sidebar and breadcrumb render; rows 0; `role=alert`/`status` 0; **no retry control** (`error-boundary.tsx:96-151` has none). **"Error Details (Development Mode)" with the mock message and a JS stack trace is shown.** 2 `pageerror` ("P1 mocked failure"), 10 console errors incl. "Failed to load resource: … 500". Reload after unroute → rows | Pass except stack trace → **E-01** |
| Q-23 | 401                           | redirect to **`/app/login`** (`error-boundary.tsx:17-19`), 2 requests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Pass                               |
| Q-24 | 403 / 429 / malformed / abort | "An error occurred" (`en.json:389`); dev details shown (stack for 403/429/abort; malformed shows the `SyntaxError` message)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Pass except E-01                   |
| Q-25 | 404                           | "404 - There is no page at this address" (`en.json:385`), dev details shown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Pass except E-01                   |
| Q-26 | Root cause of dev details     | The served bundle `apps/backend/.medusa/server/public/admin/assets/index-uRwD5BXG.js` compiled the `process.env.NODE_ENV === "development"` branch of `error-boundary.tsx:25,35,113` unconditionally (`{console.error(e); …}` and `n && …`). `medusa build` sets `NODE_ENV                                                                                                                                                                                                                                                                                                                               |                                    | = "development"` (`@medusajs/cli/dist/create-cli.js:541`). The admin bundler forces `production` only for plugin builds (`admin-bundler/dist/index.js:1573-1574`), not for the app build (`:1442-1450`). The harness runs `pnpm medusa build`with only the fork`.env` (`medusa.adapter.ts:252-258,394-398`), which has no `NODE_ENV` | **ENVIRONMENT (harness) E-01** |
| Q-27 | Back after a 500              | products (500) → orders → unroute → `goBack` → products rows, no error title, **0 new products requests** (90 s `staleTime`, `query-client.ts:9`)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Pass                               |

### Loading states and races (VIS-003, X10)

A "gate" holds matching routes in an array until the probe calls `route.continue()`. There is no timer.

| #    | Step                                        | Observed r1 / r2                                                                                                                                                                                                                                                                               | Verdict                                          |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Q-28 | Cold `/app/orders`, held                    | h1 "Orders", **28 `[class*=animate-pulse]` nodes**, 0 rows, 0 `#N` links; **no `aria-busy`, `role=progressbar` or `role=status`**                                                                                                                                                              | Skeleton exists, not exposed to AT               |
| Q-29 | products (real) → Orders link, orders held  | h1 "Orders", skeleton 28, **0 order links, 0 product rows, product title text 0**; after release 20 links, product title 0                                                                                                                                                                     | VIS-003 oracle                                   |
| Q-30 | orders → products → orders within 90 s      | **no `/admin/orders` request at all**; cached rows shown at once (`staleTime: 90000`, `query-client.ts:9`)                                                                                                                                                                                     | The map's "between" sequence needs a first visit |
| Q-31 | orders → Products link, products held       | h1 "Products", skeleton 28, 0 order links                                                                                                                                                                                                                                                      | Pass                                             |
| Q-32 | Search race                                 | Type the broad token (request held), then the narrow email (held). While both are pending the **old unfiltered 20 rows stay** (`keepPreviousData`, `order-list-table.tsx:31`), with no indicator. Release narrow first → 1 link; then release broad late → **still 1 link** (the narrow order) | Pass (X10)                                       |
| Q-33 | Back to products within 90 s, products held | no request; cached product rows, 0 order links                                                                                                                                                                                                                                                 | Pass                                             |

### Other extras (X09, X11)

| #    | Step             | Observed r1 / r2                                                                                                                                                                                     | Verdict |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Q-34 | Mid-session 401  | orders list loaded, then `**/admin/orders*` → 401, then search typed → **`/app/login`**, heading "Welcome to Medusa", 2 requests, 0 order links                                                      | Pass    |
| Q-35 | Unknown order id | `/app/orders/order_P1PROBEDOESNOTEXIST` → `GET 404` ×3 → "404 - There is no page at this address". Real order → `goBack` → 404 again, previous `#N` heading 0, previous email 0; `goForward` → order | Pass    |

### a11y re-probe (F-03 … F-06b; AxeBuilder tags `wcag2a, wcag2aa, wcag21a, wcag21aa`, as `axe.ts:12`)

| #    | Page                   | Observed r1 / r2                                                                                                                                                                                                                                             | Verdict                                                                                     |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Q-36 | Login (non-real creds) | axe serious: `color-contrast` ×1 (a link). Error "Invalid email or password" is a `SPAN` with **no role, no `aria-live` and no id** (so no `aria-describedby` can reference it). Password input: `labels.length 1`, `aria-labelledby=":r3:-form-item-label"` | **F-06 holds; F-06b retracted**: `type=password` has no `textbox` role, and its name exists |
| Q-37 | Orders list            | `button-name` (critical) ×3, `role-img-alt` (serious) ×1                                                                                                                                                                                                     | Findings; targets are Radix ids (unstable)                                                  |
| Q-38 | Order detail           | `button-name` ×8 (incl. the header trigger and 4 section triggers), `link-name` ×1. Header trigger: no `aria-label`, text, `aria-labelledby`, title or sr-only. **Keyboard: reached in 6 Tabs, `Enter` opens the menu ("Cancel"), `Escape` returns focus**   | **F-05 (batch 1 F-05b) holds**; keyboard passes                                             |
| Q-39 | Products list          | `button-name` ×13 (row menus), `link-name` ×10 (empty row links `tabindex=-1`), `role-img-alt` ×1                                                                                                                                                            | Findings                                                                                    |
| Q-40 | `/app/products/create` | **2 `[role=dialog]`, both `aria-hidden="true"`, `data-state=open`**; `getByRole("dialog")` = 0; `html` aria snapshot = only region "Notifications alt+T"; axe 0 violations (axe skips hidden content)                                                        | **F-03 holds** (X06); F-04/F-05 cannot be reached by AT while F-03 exists                   |

### Docker path

| #    | Step                     | Observed r1 / r2                                                                                                                                                         | Verdict |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Q-41 | Container reaches Medusa | `docker run --add-host host.docker.internal:host-gateway mcr.microsoft.com/playwright:v1.63.0-jammy node -e fetch('http://host.docker.internal:9000/health')` → `200 OK` | Pass    |

### Records the probe created and removed

- Created: 18 `P1-PROBE-r{1,2}-…` orders (3 base + 6 same-email per run), 32 products (7 titles + 3 order products + 6 same-email products per run, + 2 title-reuse products per run) and 6 guest customers (`p1-probe-r{1,2}-o{1,2,3}@qa.local`, `p1-probe-vis-o{1,2,3}@qa.local`).
- Deleted by id: cleanup run 1 and run 2, **31 actions each, all 200**. Orders were cancelled then archived (`destroyOrderById`, `sweep.ts:15-35`); products via `DELETE /admin/products/{id}` → `deleted: true`; customers via `destroyCustomersByEmail`. The title-reuse products were deleted inline (200).
- Not deletable (no route, batch 1 P-39): **18 archived orders and 18 carts** (`email ILIKE 'p1-probe-%'`).
- Final read-only SQL (2026-10-17): `P1-PROBE` live products 0, options 0, customers 0, non-archived orders 0, open fulfillments 0, archived 18, carts 18; `P1-QA` live 0 everywhere, archived 22, carts 22 (batch 1 local runs).
- Side effect: Q-01/Q-06 sent `POST /admin/users/{id}` twice per run (first/last name unchanged, "-"). The admin's language state is client-side only, so nothing global changed (Q-05).
- Medusa was left running. Cal, Documenso and Twenty containers were not touched.

## 3. Resolved decisions

- **D1 Language isolation: cookie `lng=de` per test context.** A test-scoped fixture option `adminLanguage` (default `"en"`) calls `context.addCookies([{ name: "lng", value, domain: "127.0.0.1", path: "/", sameSite: "Strict" }])` before the first `goto`. Evidence: the cookie alone loads German in a fresh context (Q-02); the cookie is first in detection order (`i18n/config.ts:5-9`; `components/utilities/i18n/i18n.tsx:18-21`). Rejected: the UI switch. It writes the shared admin (`POST /admin/users/{id}`, Q-01) and is not per context. The "is German" oracle is `html[lang="de"]` plus h1 text from `de.json` (Q-01, Q-02). P1 never changes the admin's language globally, so nothing needs restoring.
- **D2 Order data source: P1-created `P1-QA` orders through the batch 1 helper, with fixed visible values.** `medusaQa.createOrder` gains options `{ email, lastName, productTitle }`, and `createStoreOrder` gains an optional `address` override (`store-order.ts:19-26,64`). Evidence: per-run emails break the 1 % tolerance at 820 (Q-19). Identical emails with a per-test token only in `shipping_address.last_name` give 0 px (Q-20). Titles can be reused after delete (Q-21).
  - VIS-001: 3 orders per test, emails `p1-qa-vis-<worker>-o<n>@qa.local`, `lastName` = `<P1-QA prefix>-<project>` (unique per test, searchable via `q`, not shown in the list), product titles `P1-QA-VIS-<worker>-o<n>`.
  - I18N-001: 1 order, email `p1-qa-vis-<worker>-de@qa.local`, default address, product title `P1-QA-VIS-<worker>-Bestellung`.
  - All values keep the `P1-QA-` / `p1-qa-` prefix, so the batch 1 sweep and leak SQL cover them (`sweep.ts:81-98,166-184`). No harness seed data is used.
- **D3 Masks (`src/support/visual/masks.ts`, each with a reason).**
  - Orders list (`medusa-orders-list`), Q-20: selectors `main tbody td:nth-child(1)` (display id, server sequence), `main tbody td:nth-child(2)` (server `created_at`, not affected by the frozen clock), `main input[type=search]` (per-test token).
  - Flags: **stubbed, not masked.** `page.route("https://cdn.jsdelivr.net/gh/lipis/flag-icons/**")` is fulfilled with a fixed 4×3 grey SVG. Reason: third-party CDN outside test control (ADR 0017 masking policy), and `waitForVisualStability` waits for every image to load (`screenshot.ts:48-54`), so a slow or blocked CDN would hang the settle.
  - Order detail (`medusa-order-detail`), Q-11/Q-12: text `/^#\d+$/` (breadcrumb display id) and selector `main div:has(> h1)` (heading row: display id and creation date). Clip: top of page to 8 px above h2 "Zahlungen"; desktop width = h2 "Kunde" x − 24; tablet full width. This follows the Twenty I18N-001 clip precedent (`tests/twenty/i18n/german.i18n.spec.ts:38-46`).
  - Every mask is asserted to match (count ≥ 1) before the shot, so a mask never silently covers nothing.
- **D4 Error and loading oracles.**
  - VIS-002: error title + message (`en.json:387-388`); exactly 2 list requests (`retry: 1`), asserted again after the error title is visible (refetch-loop check); shell intact (sidebar link "Orders" visible, URL `/app/products`); product rows 0; no stack trace (needs E-01); the console recorder has ≥ 1 "status of 500" entry and only allowed entries; recovery message and recovery after unroute + reload (D10).
  - VIS-003: on the products → orders first visit with `/admin/orders*` held, skeleton visible, `#N` links 0, the previous page's product title 0, ≥ 1 held request; after release, skeleton 0 and the test's own `#<displayId>` visible.
  - **The map's "Delay 3 s" is implemented as a hold-until-released gate**, not a timer. A timer races the assertion on slow runners; the gate holds exactly as long as the assertions need and releases in `finally`. No `waitForTimeout` and no `setTimeout` anywhere.
- **D5 255-char data.** `medusaQaTitleOfLength(prefix, 255, "x")` builds an exact 255 UTF-16 unit title starting with the P1-QA prefix (pure, unit-tested). It is created through the API (`medusaQa.createProduct(title)`). Independent oracle: API `GET /admin/products/{id}?fields=title` → `title.length === 255` and equal to the sent string. The UI tooltip must equal that API string. The tooltip needs two pointer events on a cold page (Q-15, `truncated-text.tsx:23-28,40`), so `revealTitleTooltip` hovers the centre, then hovers `{x: 4, y: 4}`. That is two deterministic moves, not a retry.
- **D6 Where the cases run:** all batch 2 specs live under `tests/medusa/{i18n,visual,a11y}/`, so they run only in `visual-*` projects (Docker) and `medusa-chromium` ignores them (`playwright.config.ts:43-48,327`). Network-state and a11y cases run on `visual-desktop` only (Twenty precedent `tests/twenty/visual/graphql-error.visual.spec.ts:46`); X13 runs on `visual-mobile`.
- **D7 Admin session in visual projects:** a worker fixture does the API login (`loginAdminToken` + `createAdminSession`, `admin-api.ts:97-116`) in a throwaway browser context and keeps the `storageState()` object in memory. The test `storageState` fixture returns it. This mirrors Twenty's `storageState` override (`twenty/visual-fixtures.ts:78`) without a file. `baseURL` comes from `medusaBaseUrlFromEnv()` (`env.ts:131-133`).
- **D9 (OQ1, Jayami 2026-10-17) Production admin build:** testing against a production build is the standard. A separate harness PR, tagged `v0.2.11`, runs `medusa build` with `NODE_ENV=production` and records the build mode in `harness-build.json` so cached dev builds rebuild. P1 is never patched for it. This batch bumps the pin to `#v0.2.11` (its one approved exception, like batch 1 D10) and bumps the CI build-cache key. **Building waits for the tag.** The harness PR is a separate task that starts only on Jayami's go-ahead; this plan does not change the harness.
- **D10 (OQ2) VIS-002 retry:** keep the map wording. Assert the recovery message ("Please try again later.", `en.json:388`) and recovery after a reload. Log the missing in-page retry control as observation O-03.
- **D11 (OQ3) Extras:** all nine accepted (X06–X14). X13 stands: 393 px is wider than the 320 px that WCAG 1.4.10 Reflow requires, so overflow at 393 also fails at 320.
- **D12 (OQ4) Pages parity:** add the `blob-functional-medusa` upload in the CI commit. It copies Twenty's existing upload (`e2e.yml:1540-1546`), so it is parity, not a new process.
- **D8 Console recorder:** a new non-asserting fixture `consoleRecorder` collects `console.error` and `pageerror`. The core `attachConsoleGuard` (`src/core/fixtures.ts:7-35`) fails on any entry and drops allowlisted ones, so it cannot record an _expected_ error. VIS-002 asserts the recorder's contents.

## 4. Goal and scope

**In:** P1-MED-I18N-001, P1-MED-I18N-002, P1-MED-VIS-001, P1-MED-VIS-002, P1-MED-VIS-003 (IDs and titles unchanged); the Medusa visual product in the Docker wrapper, masks and CI; extras X06–X14 (accepted, D11); known-issue entries for proven product bugs only; ADR 0018 amendment; README coverage.

**Interpretations of map wording (stated, not changed):**

- I18N-001 "Admin language = de (profile setting)": the profile setting _is_ the `lng` cookie/localStorage (Q-01). The test sets that same storage per context (D1).
- VIS-002 "Error state with retry": the product has no retry control (Q-22). Resolved by D10.
- VIS-003 "Delay 3 s": a gate (D4).

**Out (with reasons):**

- Batch 3 (Twenty CSV import + 2FA) and Batch 4 (Twenty live updates/reconnect, TW-VIS-X07 Arabic RTL, making `e2e / visual` required): carried, not built.
- Page-wide axe scans with allowlists for Q-37/Q-39: dropped. Every target is a generated Radix id or a bare `<button>`, and ADR 0017's amendment requires stable targets. The trigger finding is covered by X07.
- F-04/F-05 (unnamed option picker, unassociated values label): carried. They cannot be tested through AT while F-03 hides the dialog.
- Retry double-click: dropped (no retry control, Q-22).
- German at 393: no German-specific defect (Q-10, en 438 vs de 444). Reflow is covered by X13.

## 5. Test-case mapping

| ID                                                       | File                                                | Projects (run)                | Tags                                     | Oracle (independent)                                                                                                                                                                                                                                                                                                                   | Cleanup                                                                      |
| -------------------------------------------------------- | --------------------------------------------------- | ----------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P1-MED-I18N-001 German Admin order page layout           | `tests/medusa/i18n/order-german.i18n.spec.ts`       | visual-desktop, visual-tablet | `@medusa @i18n @visual`; P2              | `html[lang=de]`; h1 `#<displayId from API>`; badges "Autorisiert" ×2 / "Ausstehend" ×2 (`de.json`), counts fixed by D2 and guarded by an API precondition (Step 4); doc and `main` sw ≤ cw + 1; every badge sw ≤ cw + 1 and inside the viewport; header trigger box inside the viewport, menuitem "Abbrechen"; baseline `med-order-de` | `medusaQa` teardown: order cancel → archive, product delete, customer delete |
| P1-MED-I18N-002 Long product title truncation in list    | `tests/medusa/visual/long-title.visual.spec.ts`     | visual-desktop, visual-tablet | `@medusa @visual`; P2                    | API title length 255 and equality; UI `text-overflow: ellipsis` and sw > cw; row height == short-title row height; span right ≤ cell right; tooltip text == API title                                                                                                                                                                  | product delete ×2                                                            |
| P1-MED-VIS-001 Orders list baseline at three viewports   | `tests/medusa/visual/orders-list.visual.spec.ts`    | all three                     | `@medusa @visual`; P2                    | 3 `#N` links (ids from API) + "3 of 3 results"; baseline `med-orders-list` (masks D3, flags stubbed, clock frozen)                                                                                                                                                                                                                     | 3 orders, 3 products, 3 customers                                            |
| P1-MED-VIS-002 Products API 500 shows an error state     | `tests/medusa/visual/network-states.visual.spec.ts` | visual-desktop                | `@medusa @visual @network`; P2           | D4 (request count from the route, console recorder)                                                                                                                                                                                                                                                                                    | none (no data)                                                               |
| P1-MED-VIS-003 Slow API shows a skeleton, not stale data | same file                                           | visual-desktop                | `@medusa @visual @network`; P3           | D4 (product title and display id from the API)                                                                                                                                                                                                                                                                                         | 1 order, 1 product, 1 customer                                               |
| X06–X14                                                  | see §6                                              | §6                            | `@medusa` + `@a11y`/`@network`/`@visual` | §6                                                                                                                                                                                                                                                                                                                                     | §6                                                                           |

The UI E2E rule holds. Setup is API, fixtures or `page.route` only. Every Expected-column assertion goes through the UI. API reads are only the oracles named above.

## 6. Extra cases (all nine accepted 2026-10-17, D11)

| ID                                                                         | Technique            | Probe               | Assertions in order                                                                                                                                                                                                | Expected               |
| -------------------------------------------------------------------------- | -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **P1-MED-FW-X06** a11y: Create Product dialog is exposed to AT             | a11y (WCAG 4.1.2)    | Q-40 ×2             | hard: `dialog(includeHidden)` count 2, Title field attached → evidence `{ariaHiddenDialogs, visibleDialogs}` → `test.fail(F-03)` → `getByRole("dialog", {name: "Create Product"})` count 1                         | **expected fail** F-03 |
| **P1-MED-FW-X07** a11y: order header menu has a name and works by keyboard | a11y (4.1.2, 2.1.1)  | Q-38 ×2             | hard: Tab reaches the trigger within 10 presses, `Enter` opens menuitem "Cancel", `Escape` returns focus → evidence → `test.fail(F-05)` → trigger `toHaveAccessibleName(/\S/)`                                     | **expected fail** F-05 |
| **P1-MED-FW-X08** a11y: login error is announced                           | a11y (4.1.3)         | Q-36 ×2             | hard: wrong non-real credentials show the error, URL `/app/login` → evidence `{role, ariaLive, id}` → `test.fail(F-06)` → `getByRole("alert").filter({hasText: "Invalid email or password"})` count 1              | **expected fail** F-06 |
| **P1-MED-FW-X09** Error codes map to visible states                        | network mocking      | Q-23–Q-25, Q-34 ×2  | steps: 401 mid-session on the orders search → `/app/login`; 403, 429, malformed JSON, abort → "An error occurred"; 404 → "404 - …". Each: product rows 0, shell visible, mock message text count 0, no stack trace | pass **after E-01**    |
| **P1-MED-FW-X10** Response ordering on search                              | race (gate)          | Q-32 ×2             | 2 orders sharing a token; hold broad, type narrow; release narrow → 1 link; release broad → still exactly that link                                                                                                | pass                   |
| **P1-MED-FW-X11** Unknown order id shows not-found, no stale data          | authz/IDOR in UI     | Q-35 ×2             | 404 title; real order; `goBack` → 404 title, real `#N` 0, real email 0; `goForward` → real heading                                                                                                                 | pass                   |
| **P1-MED-FW-X12** Back after a 500 recovers                                | replay               | Q-27 ×2             | products 500 → orders → unroute → `goBack` → product rows ≥ 1, error title 0                                                                                                                                       | pass                   |
| **P1-MED-FW-X13** Order detail reflows at 393 px                           | layout (WCAG 1.4.10) | Q-10 ×2 (en and de) | hard: heading visible, doc sw ≤ cw + 1 → evidence `{mainSW, mainCW, triggerRights}` → `test.fail(F-07)` → `main` sw ≤ cw + 1 and every trigger right ≤ 394                                                         | **expected fail** F-07 |
| **P1-MED-FW-X14** Title boundaries 254/256/multi-byte                      | BVA                  | Q-13–Q-15 ×2        | `test.step` per title (254, 256, umlaut 255, emoji 255, words 255): ellipsis, sw > cw, row height == short, tooltip == API title                                                                                   | pass                   |

Dropped: retry double-click (no control), German at 393 (not German-specific), page-wide axe (unstable targets). F-06b is **retracted**: Q-36 shows the password field is labelled. P1 locates it with `getByPlaceholder` because `type=password` has no `textbox` role. X08's commit corrects the batch 1 comment at `login.page.ts:11` (§8).

## 7. Architecture (every file touched, one responsibility each)

New:

| Path                                                | Responsibility                                                                                                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/products/medusa/visual.ts`                     | Constants: German strings (with `de.json` lines), error titles (`en.json` lines), flag CDN glob + stub SVG, clip rule doc                                              |
| `src/products/medusa/network.ts`                    | `page.route` helpers: `failProductsList`, `holdRequests` (gate), `stubFlagImages`                                                                                      |
| `src/products/medusa/visual-fixtures.ts`            | `test` = batch 1 `test` + `baseURL`, worker `medusaAdminState`, `storageState`, option `adminLanguage`, `consoleRecorder`                                              |
| `src/products/medusa/pages/error-state.page.ts`     | App-wide error boundary (title, message, dev details, shell link)                                                                                                      |
| `tests/medusa/i18n/order-german.i18n.spec.ts`       | I18N-001                                                                                                                                                               |
| `tests/medusa/visual/long-title.visual.spec.ts`     | I18N-002 (+ X14)                                                                                                                                                       |
| `tests/medusa/visual/orders-list.visual.spec.ts`    | VIS-001                                                                                                                                                                |
| `tests/medusa/visual/network-states.visual.spec.ts` | VIS-002, VIS-003 (+ X09–X12)                                                                                                                                           |
| `tests/medusa/a11y/admin.a11y.spec.ts`              | X06, X07, X08, X13                                                                                                                                                     |
| `tests/unit/medusa-names.spec.ts`                   | `medusaQaTitleOfLength`                                                                                                                                                |
| 5 PNGs                                              | `tests/medusa/visual/__screenshots__/visual-{mobile,tablet,desktop}/med-orders-list.png`, `tests/medusa/i18n/__screenshots__/visual-{tablet,desktop}/med-order-de.png` |

Modified:

| Path                                                                                  | Change                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/support/visual/masks.ts`                                                         | `MaskSet` adds `medusa-orders-list`, `medusa-order-detail` (D3); `maskSpecs`/`maskLocators` take a `MaskSet`                                                                                                                                                                                                           |
| `src/support/visual/docker.ts`                                                        | `VisualProduct` gains `medusa`; `VISUAL_TEST_DIRS.medusa = "tests/medusa"`; `parseVisualArgs` regex (`:33`) and usage text; `productsFor("all")` includes medusa; `VisualEnvInput.medusa { baseUrl, email?, password? }`; `buildVisualDockerEnv` sets `MEDUSA_BASE_URL`, `MEDUSA_ADMIN_EMAIL`, `MEDUSA_ADMIN_PASSWORD` |
| `scripts/visual-docker.mts`                                                           | medusa branch: `requireHealthy("Medusa", <base>/health, "medusa")`, forward port 9000 only (fixtures use the HTTP API, never SQL)                                                                                                                                                                                      |
| `src/products/medusa/store-order.ts`                                                  | optional `address` in `StoreOrderInput` (default `ADDRESS`)                                                                                                                                                                                                                                                            |
| `src/products/medusa/fixtures.ts`                                                     | `createOrder(leaf, quantity, opts?: { email?, lastName?, productTitle? })`; `createProduct(leafOrTitle, { exactTitle? })`                                                                                                                                                                                              |
| `src/products/medusa/names.ts`                                                        | `medusaQaTitleOfLength`, `medusaQaVisualEmail(worker, leaf)`                                                                                                                                                                                                                                                           |
| `src/products/medusa/known-issues.ts`                                                 | issue strings for F-03, F-05, F-06, F-07                                                                                                                                                                                                                                                                               |
| `src/products/medusa/pages/{orders,order-detail,products,login}.page.ts`              | locators §8                                                                                                                                                                                                                                                                                                            |
| `tests/unit/visual-helpers.spec.ts`                                                   | `:302` (medusa no longer invalid, use `--product=nope`); +3 tests; mask-reason loop (`:103-110`) iterates `MaskSet`                                                                                                                                                                                                    |
| `.github/workflows/e2e.yml`                                                           | §12                                                                                                                                                                                                                                                                                                                    |
| `.github/workflows/visual-baselines.yml`                                              | `options: [cal, documenso, twenty, medusa]` (`:11`)                                                                                                                                                                                                                                                                    |
| `package.json` / lock                                                                 | harness pin `#v0.2.11` (D9)                                                                                                                                                                                                                                                                                            |
| `docs/adr/0018-medusa-ci.md`, `README.md`, `docs/observations/medusa-known-issues.md` | §17                                                                                                                                                                                                                                                                                                                    |

Not changed: forks, harness source, Cal/Documenso/Twenty specs, baselines and jobs, `medusa-chromium` specs (still 11 tests).

## 8. Locators per page object (from the probe)

The rule is semantic first. Every exception carries `eslint-disable-next-line <rule> -- <reason + probe row>` inside the page object only.

**MedusaOrdersPage** (Q-16, Q-28, Q-32):

- `gotoSearch(q)` → `/app/orders?q=<encoded>`
- `searchbox` = `getByRole("searchbox", { name: "Search" })`
- `orderLinks` = `getByRole("link", { name: /^#\d+$/ })`
- `resultsSummary(n)` = `getByText(\`${n} of ${n} results\`)`
- `skeleton` = `main.locator("[class*=animate-pulse]")`. Exception (`no-raw-locators`): the skeleton has no role, `aria-busy` or test id (Q-28).

**MedusaOrderDetailPage** (Q-07–Q-10, Q-38):

- existing `heading(displayId)`, `actionsMenuButton`, `statusText(text)`
- `sectionMenuTriggers` = `main.locator("[aria-haspopup=menu]")`. Same exception as `:388`: all triggers are unnamed (Q-38).
- `sectionHeading(name)` = `main.getByRole("heading", { name, level: 2 })`
- `menuItem(name)` = `page.getByRole("menuitem", { name })`

**MedusaProductsPage** (Q-14, Q-15, Q-40):

- `titleText(row, title)` = `row.getByText(title, { exact: true })`
- `tooltip` = `page.getByRole("tooltip")`
- `revealTitleTooltip(row, title)`: hover, then hover `{ position: { x: 4, y: 4 } }` (D5)
- `exposedCreateDialog` = `getByRole("dialog", { name: "Create Product" })` (no `includeHidden`; X06)
- `createDialogsIncludingHidden` = `getByRole("dialog", { name: "Create Product", includeHidden: true })`

**MedusaLoginPage** (Q-36):

- Replace the comment at `:11` with "type=password has no textbox role; the field is labelled (Q-36)".
- Keep `getByPlaceholder("Password")` **unless** Step 6 shows `getByLabel("Password", { exact: true })` count 1. Then switch, and FW-001/FW-005 must still pass twice.
- `errorAlert` = `getByRole("alert").filter({ hasText: "Invalid email or password" })` (X08 strict)

**MedusaErrorState** (new; Q-22–Q-25):

- `title(text)` = `getByText(text, { exact: true })` for the four `en.json:385-389` titles
- `message500` = `getByText("An unexpected error occurred on the server. Please try again later.", { exact: true })`
- `devDetails` = `getByText("Error Details (Development Mode)")`
- `shellOrdersLink` = `getByRole("link", { name: "Orders", exact: true })`

## 9. Oracle design

- **I18N-001.** German strings come from `de.json`, never from the UI under test. Overflow is measured with the existing helpers `documentScroll`, `measureScroll`, `overflowingControls` and `rectInsideWidth` (`dom.ts:17-55`, `layout.ts:40-46`). Values at 1440/820 are all 0 overflow (Q-07/Q-08). The display id comes from the API (`createOrder`).
- **I18N-002 / X14.** The full title comes from the API GET (independent of the UI). Height equality compares the long row with a short-title row in the same render. The truncation is proven by both CSS (`text-overflow: ellipsis`) and geometry (sw > cw); CSS alone could be set without anything being cut.
- **VIS-001.** The pinned Linux baseline. Data (3 ids) comes from the API. The masks cover only server-assigned values.
- **VIS-002.** The number of list requests is counted in the route handler (expected 2: initial + `retry: 1`, `query-client.ts:10`). It is asserted twice: when the poll first reaches 2, and again after the error title is visible, so a refetch loop fails the test. Console entries come from the recorder. Recovery: unroute, reload, rows ≥ 1 (Q-22).
- **VIS-003.** The previous page's data is the API-created product title. The new page's data is the API display id. The skeleton is checked while the request is provably held (held count ≥ 1).
- **X06/X07/X08/X13.** The oracle is the named WCAG SC (4.1.2, 4.1.3, 1.4.10), with the working path asserted hard first.
- **X10/X11/X12.** The oracle is the sequential behaviour seen live (Q-32, Q-35, Q-27).

## 10. Test data, isolation, cleanup and leak check

- Prefixes: as batch 1 D5 (`P1-QA-<seed>-<worker>`), plus the D2 constant visual values (`P1-QA-VIS-<worker>-…`, `p1-qa-vis-<worker>-…@qa.local`), all inside the sweep's `P1-QA-` / `p1-qa-` match.
- Teardown is the existing `runMedusaQaCleanup` (`fixtures.ts:193-228`). Every created id is captured, each step is in its own try/catch, and one `AggregateError` is thrown at the end. Customers with constant emails are deleted by exact email each test (`sweep.ts:37`).
- Visual runs: fixtures run inside the container against the API on `127.0.0.1:9000` (proxied). The host leak step runs afterwards (§12).
- Read-only SQL after each run, from the host (`countMedusaQaLeaks`, `sweep.ts:158-189`):
  - `SELECT count(*)::int FROM product WHERE title ILIKE 'P1-QA-%' AND deleted_at IS NULL` → 0
  - `SELECT count(*)::int FROM product_option WHERE title ILIKE 'P1-QA-%' AND deleted_at IS NULL` → 0
  - `SELECT count(*)::int FROM customer WHERE email ILIKE 'p1-qa-%' AND deleted_at IS NULL` → 0
  - `SELECT count(*)::int FROM "order" WHERE email ILIKE 'p1-qa-%' AND status <> 'archived'` → 0
  - open fulfillments join (`sweep.ts:179`) → 0
  - informational: archived orders and carts grow by **17 per full visual run** (I18N-001 ×2, VIS-001 ×9, VIS-003 1, X07 1, X10 2, X11 1, X13 1)
- Seeded data is read-only. The admin's language is never changed globally (D1). The UI Profile Save is never used.

## 11. Known-bug handling (proof process)

| Finding | What                                                                              | Label                     | Evidence                                | Standard                               | Handling                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------- | ------------------------- | --------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-03    | Both Create Product dialogs are `aria-hidden`; AT sees no dialog                  | PRODUCT BUG               | Q-40 ×2, batch 1 P-22                   | WCAG 4.1.2                             | X06: hard → `attachKnownBugEvidence` → `test.fail(true, MED_X06_DIALOG_HIDDEN_ISSUE)` → strict                                                       |
| F-05    | Order menu triggers have no accessible name                                       | PRODUCT BUG               | Q-38 ×2 (axe `button-name` critical ×8) | WCAG 4.1.2                             | X07, same pattern                                                                                                                                    |
| F-06    | Login error not announced (no role, live region or id)                            | PRODUCT BUG               | Q-36 ×2                                 | WCAG 4.1.3                             | X08, same pattern                                                                                                                                    |
| F-07    | Order detail needs horizontal scrolling of `main` at 393 px (en and de)           | PRODUCT BUG               | Q-10 ×2                                 | WCAG 1.4.10                            | X13, same pattern. Risk: 1.4.10 exempts content that needs 2D layout; the section is an item list, not a data table, so the exemption does not apply |
| E-01    | Admin bundle built in development mode: stack traces, dev React                   | **ENVIRONMENT (harness)** | Q-22–Q-26 ×2                            | –                                      | **Stop/report: harness PR** (D9, separate task). No P1 workaround                                                                                    |
| O-03    | No in-page retry control on the error state                                       | Observation               | Q-22                                    | none                                   | ADR 0018 note (OQ2)                                                                                                                                  |
| O-04    | Skeleton not exposed to AT (no `aria-busy` / `role=status`)                       | Observation               | Q-28                                    | no single SC that strictly requires it | ADR note                                                                                                                                             |
| O-05    | During a filter change, previous rows stay with no indicator (`keepPreviousData`) | Observation               | Q-32                                    | by design                              | ADR note                                                                                                                                             |
| F-06b   | Unnamed password field                                                            | **Retracted**             | Q-36                                    | –                                      | comment fix only                                                                                                                                     |

Rules carried from batch 1:

- At build, each `test.fail` case must fail the same way in **both** local runs (§15) before it is kept, with measured facts appended to `docs/observations/medusa-known-issues.md`. If either run passes or fails differently: stop and report. Never loosen the assertion.
- Working-path and known-bug assertions stay in separate tests.
- Never attach an aria snapshot of a filled login form. X08 uses non-real credentials `p1-qa-nobody@qa.local` / `p1-qa-not-a-password`, and attaches only `{role, ariaLive, id}`.

## 12. CI job design (extend `medusa-self-hosted` in `.github/workflows/e2e.yml`)

- **Path filter** `med_re` (`:119`): add `src/support/|scripts/visual-docker`, as `cal_re`/`doc_re`/`tw_re` have (`:116-118`).
- **Job `if:`** (`:1641-1643`) becomes `needs.changes.outputs.medusa == 'true' && (inputs.visual_product == '' || inputs.visual_product == 'medusa')`. This is the Twenty pattern (`:1252-1254`). `visual_only` no longer skips the job.
- **Outputs** (`:1644-1647`): `visual: ${{ steps.visual.outcome }}`.
- **`visual_requested` step** (`:1661-1666`): copy Twenty `:1264-1273` (requested=false only on matrix runs).
- **Functional steps** (`:1766-1817`) gain `&& !inputs.visual_only`, as Twenty `:1383,1399,1415`.
- New steps, in order, after "Merge blob reports into HTML" (`:1801-1817`) and before "Count Medusa QA leaks" (`:1819`):
  1. "Seed Medusa for visual only": `if: steps.medusa_up.outcome == 'success' && inputs.visual_only`, `npx playwright test --project=medusa-setup` (Twenty `:1449-1460`; global setup seeds the admin, `global-setup/medusa.ts`).
  2. "Pull Playwright image (visual medusa)": copy `:1461-1472`.
  3. "Run Medusa visual suite (Docker)": `id: visual`, `continue-on-error: true`, `if: steps.medusa_up.outcome == 'success' && !inputs.run_browser_matrix`. Env `P1_PW_REPORT_ID: visual-medusa`, `VISUAL_MODE: ${{ inputs.visual_mode }}`; `MEDUSA_BASE_URL`/`MEDUSA_ADMIN_EMAIL` come from job env and `MEDUSA_ADMIN_PASSWORD` from `GITHUB_ENV` (`:1735-1740`). Run `npm run "visual:${VISUAL_MODE}" -- --product=medusa --output=test-results-visual` with the `case` guard (`:1486-1487`). No free-text input reaches `run:`.
  4. "Merge visual HTML report (medusa)", "Collect updated baselines (medusa)" (`git status`/`ls-files` on `tests/medusa`), uploads `visual-baselines-medusa`, `visual-failure-medusa`, `blob-visual-medusa` (push to `main` only). All copied from Twenty `:1488-1539`, with `!cancelled()` kept.
- **`continue-on-error` cannot hide a failure.** With `continue-on-error: true`, a failed step has `outcome: failure` and `conclusion: success`. The job output therefore **must read `steps.visual.outcome`**, exactly as Twenty does (`e2e.yml:1256`), never `.conclusion`. The `visual` gate then sees `failure` and sets `status=1` (`:1927`). Build Step 9 checks this with `grep -n "steps.visual.conclusion" .github/workflows/e2e.yml` → no output, and `grep -n "visual: \${{ steps.visual.outcome }}"` → 4 lines (cal, documenso, twenty, medusa). Any other output: stop and report.
- **Pages parity (D12):** add `blob-functional-medusa` (copy of `:1540-1546`, push to `main` only, `!cancelled()`, retention 3).
- **Gate:** unchanged. `visual` already `needs` the job and runs `check medusa` (`:1899,1915-1917,1941`). With a real outcome, `check` passes on `success`, errors on `failure` (`:1925-1928`), and errors when requested but skipped (`:1933-1935`). Medusa is then gated exactly like Cal/Documenso/Twenty.
- **Build cache key** (`:1728`, `:1895`): `${{ runner.os }}-medusa-build-${{ env.MEDUSA_REF }}-h0.2.11` (D9). The old key holds a development bundle (E-01).
- **Leak count, log redaction, `down`, uploads, cache saves and the job summary row:** unchanged, still after the visual steps (`:1819-1895`).
- **`visual-baselines.yml`:** add `medusa` (`:11`). `e2e.yml` input description (`:48`) lists medusa.
- **Timeout arithmetic (`medusa_self_hosted_timeout_minutes` stays 60).** PR #37 head run 38937821403: job 2 m 39 s (install 13 s, harness up 69 s, Medusa E2E 32 s). Image pull in the same run (Twenty step) 34 s. Twenty visual suite (5 m 14 s) is the largest existing visual step. Medusa visual suite: **not measured yet**; Step 11 measures it locally and records it. Worst case = ADR 0018's 27.5 min + pull 1 min + rebuild after the key bump (in the 2 min build budget) + visual budget 10 min = **38.5 min < 60**. If the measured visual time exceeds 10 min: stop and report before pushing.

## 13. Risks and unknowns (each with a probe)

| #   | Risk                                                                                | Probe / evidence                                                     | Mitigation                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **E-01 dev-mode admin bundle** (stack traces, dev React, extra console/page errors) | Q-22–Q-26 ×2                                                         | Harness v0.2.11 (D9). Step 0a reruns the functional suite; Step 0b re-probes Q-22–Q-25, Q-28, Q-18, Q-36–Q-40 on the production bundle; any difference → stop and report |
| R2  | Console/page errors on a production bundle                                          | **not verified** (only the dev bundle was probed)                    | Step 0b records them; VIS-002's allowed-pattern list comes from that re-probe; unknown entries → stop                                                                    |
| R3  | Display-id digit count differs between CI and local                                 | Q-20 (cell masks give fixed boxes); column 1 width set by the header | Baselines are generated and compared in Docker; whole-cell masks; tolerance 1 % stays                                                                                    |
| R4  | First tooltip hover on a cold page                                                  | Q-15 ×2                                                              | two pointer moves (D5)                                                                                                                                                   |
| R5  | `staleTime` 90 s makes a revisit cache-only                                         | Q-30, Q-33                                                           | VIS-003 uses the first orders visit (Q-29)                                                                                                                               |
| R6  | Flag CDN unreachable or slow                                                        | Q-17                                                                 | stubbed (D3)                                                                                                                                                             |
| R7  | WCAG 1.4.10 2D-layout exemption argued for F-07                                     | Q-10                                                                 | evidence names the section; if Jayami judges it exempt, drop X13                                                                                                         |
| R8  | Constant visual emails collide if two P1 runs share one Medusa DB                   | design                                                               | P1 never shares the DB (CI is ephemeral; locally one run at a time, `PW_WORKERS=1` default `playwright.config.ts:188`)                                                   |
| R9  | Medusa visual suite duration unknown                                                | not measured                                                         | Step 11 measures; §12 rule                                                                                                                                               |
| R10 | `main div:has(> h1)` depends on DOM shape                                           | Q-12 ×2 (count 1)                                                    | mask counts asserted ≥ 1 before each shot                                                                                                                                |

## 14. Build steps (Git Bash, repo root; on any differing output: **stop and report**, paste it)

### Step 0. Branch, plan, prerequisites

- `git checkout main && git pull --ff-only && git rev-parse HEAD` → **`8c7d4ca9084ca579f3e5eecc35ed9d5cd022bb75`**. If different: stop and report.
- `git checkout -b <branch from Jayami>`.
- Save this plan as `docs/plans/2026-10-17-p1-phase4-batch2-medusa.md`, run `npx prettier --write` on it, commit `docs(plan): phase 4 batch 2 medusa i18n and visual`.
- **Harness prerequisite (D9).** The `v0.2.11` harness PR is a separate task, started only after Jayami's go-ahead and reviewed and merged by her. Nothing in this plan edits the harness. Check: `git ls-remote --tags https://github.com/Jayami123/qa-portfolio-harness.git v0.2.11` prints one line. If it prints nothing: stop; do not continue past this point. Then → `npm install github:Jayami123/qa-portfolio-harness#v0.2.11` → `git diff package.json package-lock.json` shows only the pin → commit `chore(deps): bump qa-portfolio-harness to v0.2.11`.
- Local rebuild through the harness: `cd ../qa-portfolio-harness && MEDUSA_WEB_REBUILD=1 node scripts/up.mjs medusa` (flag named at `medusa.adapter.ts:288`), then `npm run smoke -- medusa` → "smoke ok".

### Step 0a. Functional suite on the production bundle, twice (before anything else)

- `npm run test:medusa` (run 1), leak script, then `npm run test:medusa` (run 2), leak script.
- Expected each run: **11 passed** (setup + FW-001…005 + X01…X03 + X04/X05 as expected failures), 0 failed, 0 flaky. The X04 and X05 `known-bug-evidence` JSON must show the same observed values as `docs/observations/medusa-known-issues.md` (X04 `statuses [200, 200]` with a pending `credit_line` change; X05 `canceled` + `fulfilled` with 1 open fulfillment). `npx tsx scripts/count-medusa-qa-leaks.mts` → products 0, options 0, customers 0, liveOrders 0, openFulfillments 0.
- Any difference (count, outcome, evidence values): **stop and report**. No other step starts before this passes twice.

### Step 0b. Re-probe on the production bundle (scratchpad scripts, not committed)

- Re-run the session's `errors2`, `slow`, `orders-visual`, `a11y` probe scripts twice.
- Expected: Q-22–Q-25 titles, request counts and recovery unchanged; **"Error Details (Development Mode)" count 0, no `at …js:N:N` text**; Q-28 skeleton, Q-18 0 px and Q-36–Q-40 unchanged.
- Record the exact console/pageerror lists for 500 → allowed patterns for VIS-002.
- Any other change: stop and report.

### Step 1. Names, store-order address, fixtures

Skeleton `src/products/medusa/names.ts` additions:

```
export function medusaQaTitleOfLength(prefix: string, length: number, fill: string): string
  // prefix + "-L<length>-" then repeat fill; never split a UTF-16 surrogate pair; throw if prefix is longer than length
export function medusaQaVisualEmail(worker: number, leaf: string): string   // `p1-qa-vis-${worker}-${leaf}@qa.local`
```

Skeleton `store-order.ts`: `StoreOrderInput { …; address?: StoreAddress }`, where `StoreAddress = typeof ADDRESS` widened to `string` fields, used at `:64`.

Skeleton `fixtures.ts`:

```
createProduct(leaf?: string, opts?: { exactTitle?: string }): Promise<{ id; variantId; title; unitPrice }>
createOrder(leaf = "order", quantity = 2, opts?: { email?: string; lastName?: string; productTitle?: string }): Promise<MedusaQaOrder>
  // email default unchanged (`fixtures.ts:290`); captured.customerEmails gets the email actually used
```

Unit `tests/unit/medusa-names.spec.ts`, tag `@unit`:

- "medusaQaTitleOfLength pads to the exact UTF-16 length" (254/255/256)
- "medusaQaTitleOfLength never splits a surrogate pair" (emoji fill, odd target → ends with an ASCII filler)

Command: `npm run test:unit -- --grep "medusa"` → previous medusa unit count + 2 passed.

### Step 2. Docker wrapper and masks

- `docker.ts`, `visual-docker.mts`, `masks.ts` per §7.
- Mask reasons:
  - "display id is a server sequence"
  - "created_at is server time; page.clock does not reach it"
  - "search value is the per-test token"
  - "heading row holds display id and creation date"
  - "breadcrumb shows the display id"
- Unit additions in `visual-helpers.spec.ts`:
  - "parseVisualArgs accepts --product=medusa"
  - "buildVisualDockerEnv passes the Medusa URL and admin credentials"
  - "productsFor(all) includes medusa"
  - line 302 now uses `--product=nope`
- Commands:
  - `npm run test:unit` → **184 passed** (179 + 3 + 2)
  - `P1_PLAYWRIGHT_HARNESS=0 npx playwright test --list --project=unit` → `Total: 184 tests in 26 files`

### Step 3. Network helpers, visual fixtures, error-state page object

Skeleton `network.ts`:

```
export type ProductsFailure = 500 | 401 | 403 | 404 | 429 | "malformed" | "abort";
export async function failProductsList(page: Page, kind: ProductsFailure): Promise<{ hits(): number }>   // glob "**/admin/products*", JSON bodies as Q-22..Q-25
export async function failOrdersList(page: Page, status: 401): Promise<{ hits(): number }>               // X09 mid-session
export interface RequestGate { arm(): void; held(): number; releaseAll(): Promise<void>; releaseNewest(): Promise<void> }
export async function holdRequests(page: Page, glob: string): Promise<RequestGate>   // unarmed → route.continue(); armed → push; no timers
export async function stubFlagImages(page: Page): Promise<void>                         // fulfil MED_FLAG_GLOB with MED_FLAG_STUB_SVG
```

Skeleton `visual-fixtures.ts`:

```
export const test = base.extend<{ adminLanguage: "en" | "de"; appliedLanguage: undefined; consoleRecorder: { entries(): string[] } },
                                { medusaAdminState: StorageState }>({
  baseURL: ({}, use) => use(medusaBaseUrlFromEnv()),
  medusaAdminState: [/* browser.newContext → loginAdminToken + createAdminSession on ctx.request → ctx.storageState() → close */, { scope: "worker" }],
  storageState: ({ medusaAdminState }, use) => use(medusaAdminState),
  adminLanguage: ["en", { option: true }],
  appliedLanguage: [/* context.addCookies lng (D1) */, { auto: true }],
  consoleRecorder: /* page.on("console" error) + page.on("pageerror"); no assertion */ });
```

Page objects per §8. Commands: `npm run lint && npm run typecheck` → exit 0.

### Step 4. I18N-001

Skeleton `order-german.i18n.spec.ts`:

```
test.describe("Medusa German admin", () => { test.use({ adminLanguage: "de" });
 test("P1-MED-I18N-001 German Admin order page layout", { tag: ["@medusa","@i18n","@visual"], annotation: [{type:"testId",description:"P1-MED-I18N-001"},{type:"priority",description:"P2"}] }, async ({ page, medusaQa }, testInfo) => {
  onlyOnProjects(testInfo.project.name, ["visual-desktop","visual-tablet"]);
  // order = medusaQa.createOrder("de", 2, { email: medusaQaVisualEmail(idx,"de"), productTitle: `P1-QA-VIS-${idx}-Bestellung` })
  step "open the order in German": freezeClock; detail.goto; heading(#id) visible; html lang "de"
  step "no horizontal overflow": documentScroll sw ≤ cw+1; main sw ≤ cw+1
  step "API precondition for the badge counts": api.getOrder(id) → payment_status "authorized", fulfillment_status "not_fulfilled", exactly 1 payment collection with 1 payment
    // The counts of 2 are fixed by D2 (one order, one authorized payment, nothing fulfilled): header badge + Payments section badge (Q-07). If the precondition fails, the data changed: stop.
  step "status badges are fully visible": statusText("Autorisiert") count 2; statusText("Ausstehend") count 2; overflowingControls(measureScroll(badges)) == []; rectInsideWidth per badge
  step "action menu is fully visible": actionsMenuButton box inside viewport; open → menuItem("Abbrechen") visible; Escape
  step "baseline": masks = maskLocators(page,"medusa-order-detail") each count ≥ 1; clip per D3; stableScreenshot(page, "med-order-de", { mask, clip }) }) });
```

Command: `npm run visual:update -- --product=medusa --grep "P1-MED-I18N-001"` → 2 passed, 1 skipped; 2 PNGs `med-order-de.png` (tablet, desktop).

### Step 5. I18N-002 (+ X14)

Steps:

1. "create a 255-char product and a short one" (API; assert API title length 255 and equality)
2. "open the products list" (`gotoSearch(prefix)`; both rows visible)
3. "the long title is truncated with an ellipsis" (`computedStyleOf` → `"ellipsis"`; `scrollSizeOf` sw > cw)
4. "row height is unchanged" (`boundingBoxOf` long.height == short.height)
5. "the tooltip shows the full title" (`revealTitleTooltip`; `tooltip.toHaveText(apiTitle)`)

X14 repeats steps 3–5 per boundary title in its own `test.step`. Command: `npm run visual:test -- --product=medusa --grep "P1-MED-I18N-002|P1-MED-FW-X14"` → 4 passed, 2 skipped.

### Step 6. VIS-001

Skeleton:

1. `onlyOnProjects` all three
2. 3 × `createOrder("oN", 2, { email: medusaQaVisualEmail(idx, "oN"), lastName: token, productTitle: \`P1-QA-VIS-${idx}-oN\` })`, token = `${prefix}-${project}`
3. `freezeClock`
4. `stubFlagImages`
5. `orders.gotoSearch(token)`
6. 3 `orderLinks` with API ids
7. `resultsSummary(3)`
8. mask counts [3, 3, 1]
9. `stableScreenshot("med-orders-list", { mask })`

Also in this step: verify the login label (§8) with a scratchpad `count()`.

Commands:

- `npm run visual:update -- --product=medusa --grep "P1-MED-VIS-001"` → 3 passed, 3 PNGs
- then `npm run visual:test -- --product=medusa --grep "P1-MED-VIS-001"` → 3 passed

### Step 7. VIS-002, VIS-003 (+ X09–X12)

VIS-002 steps:

1. "mock the products list with a 500" (`failProductsList(500)`)
2. "open products" (`goto /app/products`)
3. "the error state is shown" (`expect.poll(hits).toBe(2)`; then the 500 title and `message500` visible; then **`expect(hits()).toBe(2)` again once the title is visible**, which catches a refetch loop; product rows 0; shell link visible; URL `/app/products`)
4. "no stack trace or raw error is shown" (`devDetails` count 0; `main` text has no `/\bat .+\.js:\d+/` and no "P1 mocked failure")
5. "the console guard recorded the failure" (entries ⊇ /status of 500/; all ⊂ Step 0b allowed patterns)
6. "reloading after the outage recovers" (unroute, reload, product rows ≥ 1)

VIS-003 steps:

1. "products list shows real data" (`createProduct` + `createOrder`; `gotoSearch(product title)` row visible)
2. "orders are held" (`holdRequests("**/admin/orders*")`, `arm`)
3. "navigate to orders" (sidebar link)
4. "loading state, no stale data" (held ≥ 1, `skeleton.first()` visible, `orderLinks` 0, product title count 0)
5. "release shows the new data" (`releaseAll`, skeleton count 0, `orderLink(displayId)` visible, product title 0)

A `finally` block always calls `releaseAll`.

Command: `npm run visual:test -- --product=medusa --grep "P1-MED-VIS-00[23]|P1-MED-FW-X(09|1[0-2])"` → 6 passed, 12 skipped.

### Step 8. a11y and reflow (X06–X08, X13)

Each test:

1. `onlyOnProjects`
2. hard working path (§6)
3. `attachKnownBugEvidence(page, testInfo, { issue, observed, expected })` (`known-bug-evidence.ts`)
4. `test.fail(true, ISSUE)`
5. strict assertion

X08 uses `test.use({ storageState: { cookies: [], origins: [] } })`.

Command: `npm run visual:test -- --product=medusa --grep "P1-MED-FW-X(0[678]|13)"` → 4 passed (all 4 expected failures), 8 skipped.

### Step 9. CI and docs

YAML per §12, docs per §17. Commands: `npm run check` → exit 0 (includes actionlint and prettier); the two `grep` checks of §12 (outcome, not conclusion) → expected output exactly as stated.

### Step 10. `--list` sanity

| Command                                                                                                 | Expected                                       |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `P1_PLAYWRIGHT_HARNESS=0 npx playwright test --list --project=visual-desktop` (same for mobile, tablet) | **55 tests in 28 files**                       |
| `--project=medusa-chromium`                                                                             | 11 tests in 6 files (unchanged)                |
| `--project=cal-chromium`, `documenso-chromium`, `twenty-chromium`                                       | unchanged from `main` (record on `main` first) |

### Step 11. Baselines, stability and timing

1. `SECONDS=0; npm run visual:update -- --product=medusa; echo $SECONDS` → record the seconds (R9). Copy `tests/medusa/**/__screenshots__` to the scratchpad.
2. `npm run visual:update -- --product=medusa` again. Compare the 5 PNG pairs with the scratchpad canvas diff (as Phase 3 Step 14). Each pair must be **≤ 0.01 % px and max channel delta ≤ 2** (Q-12/Q-20 predict 0–0.009 %). Any pair above: stop and report.
3. `git status` shows only the 5 new PNGs under `tests/medusa/`, and **no change** under `tests/cal|documenso|twenty/**/__screenshots__`.

## 15. Verification plan (hard gate before any push; paste real output)

1. `npm run check` → exit 0.
2. `npm run test:unit` → **184 passed**.
3. Medusa functional, run 1 and run 2 (again after all changes; first done in Step 0a): `npm run test:medusa` → **11 passed** (setup + 8 + X04/X05 expected failures), 0 failed, 0 flaky. Leaks after each: `npx tsx scripts/count-medusa-qa-leaks.mts` → `products 0, options 0, customers 0, liveOrders 0, openFulfillments 0`.
4. Medusa visual, run 1 and run 2: `npm run visual:test -- --product=medusa` →
   - **19 run = 15 passed + 4 expected failures (X06, X07, X08, X13), 23 skipped**, 0 flaky;
   - The leak script after each shows the same zeros; archived/carts grow by 17. Evidence JSON for X06/X07/X08/X13 must be identical in both runs.
5. The baseline stability check from Step 11.
6. Unchanged suites, one at a time: `npm run test:cal`, `npm run test:documenso`, `npm run test:twenty`, and `npm run visual:test -- --product=cal|documenso|twenty`. Each must equal its `main` baseline; their leak scripts show 0.
7. After the push (Jayami pushes or approves): paste the `medusa-self-hosted` footer, its summary rows (harness up seconds, seed, Playwright totals, leak block) and the visual step outcome. Confirm the job output came from `steps.visual.outcome` and `e2e / visual` reads "medusa: visual passed", all other jobs are green, and there are no `flaky`/`retry` lines.

## 16. Commit plan (Conventional, lowercase, no trailer, explicit paths, never `git add -A`)

1. `docs(plan): phase 4 batch 2 medusa i18n and visual`
2. `chore(deps): bump qa-portfolio-harness to v0.2.11` (D9, after the tag exists)
3. `feat(medusa): visual order options and title length helper` (+ `tests/unit/medusa-names.spec.ts`)
4. `feat(visual): medusa product in the docker wrapper and masks` (+ `tests/unit/visual-helpers.spec.ts`)
5. `feat(medusa): route helpers, visual fixtures and page object locators`
6. `test(medusa): german order page and long title cases` (+ 2 PNGs)
7. `test(medusa): orders list baselines at three viewports` (+ 3 PNGs)
8. `test(medusa): products error and loading states` (+ X09–X12)
9. `test(medusa): a11y and reflow known bugs` (X06–X08, X13; includes the `login.page.ts` comment fix)
10. `ci(e2e): run the medusa visual suite and gate it` (`e2e.yml` incl. `blob-functional-medusa`, `visual-baselines.yml`)
11. `docs(medusa): adr 0018 amendment, known issues and readme coverage`

No merge, tag or force-push. No CodeRabbit (Jayami runs `cr review --agent`). Never the Bridge-bss account. No Co-Authored-By.

## 17. Docs and ADR

- `docs/adr/0018-medusa-ci.md`, section "Amendment (batch 2)":
  - visual step and gate entry; measured visual seconds; timeout arithmetic (§12)
  - `--product=medusa`, port 9000 only
  - masks and the flag stub (D3); same-email data design (D2); the gate instead of a timer (D4)
  - E-01 and the harness v0.2.11 pin and cache key
  - O-03/O-04/O-05; F-06b retracted
- `docs/observations/medusa-known-issues.md`: MED-F-03, MED-F-05, MED-F-06, MED-F-07, each with measured facts from both build runs (only for accepted, reproduced cases).
- `README.md` (real numbers only, pasted from §15):
  - implemented cases I18N-001/002, VIS-001..003 (+ accepted X)
  - known bugs; Medusa visual run command
  - carried table: batch 3/4, F-04/F-05

## 18. Will NOT do

- No edits to forks or harness source. No harness bump except `v0.2.11` (D9). The harness PR itself is a separate task on Jayami's go-ahead. No `NODE_ENV` override, `X-Forwarded-Proto` spoofing or bundle patching in P1.
- No UI language switch, and no write to the admin user.
- No `waitForTimeout`, sleeps, retries, longer timeouts, timer delays in mocks, or env-conditional test logic.
- No new workflow, artifact type, report format or script. No exported PNG/JSON beyond the 5 baselines. No new `.md` except this plan and known-issue entries.
- No new dependency.
- No batch 3/4 (Twenty) work.
- No branch creation now, no CodeRabbit, no merge/tag/force-push, never Bridge-bss, no Co-Authored-By.

## 19. Open questions for Jayami

None. OQ1–OQ4 were answered on 2026-10-17 and are recorded as D9–D12. The review edits (base `8c7d4ca`, Step 0a, the VIS-002 refetch check, the I18N-001 badge precondition, outcome-not-conclusion in §12, and the harness PR as a separate task) are applied above.

Plan saved as docs/plans/2026-10-17-p1-phase4-batch2-medusa.md. Not built: building starts after harness `v0.2.11` is tagged (D9) and Jayami gives the branch name.
