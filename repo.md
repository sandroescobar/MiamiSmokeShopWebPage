# Miami Smoke Repository Guide

## Overview
- Express 5 + EJS storefront serving the Miami Vape Smoke Shop catalog, cart, checkout, FAQ, and policy pages with shared layouts/partials.
- Inventory data is sourced from MySQL snapshot tables (`inventory_calle8`, `inventory_79th`) and filtered to highlight a curated featured set while hiding THC/THCA keywords and discontinued variants.
- Static marketing landers (hero video, promos, checkout mockups) continue to live in `public/` for SEO or fallback hosting.
- Python ETL + Selenium scrapers normalize vendor CSV exports, load them into the relational schema, and hydrate the data consumed by the Node server.

## Tech Stack & Dependencies
- **Server:** Node 18+ (ES modules), Express 5, `express-ejs-layouts`, `mysql2/promise`, `dotenv`, optional `nodemon` for local reloads.
- **Frontend:** Bootstrap 5, custom CSS in `public/css`, vanilla JS controllers (`age_gate.js`, `cart.js`, `flavor_selector.js`, `search_bar.js`, `main.js`), and an image/video asset pack under `public/images` & `public/video`.
- **Data/Automation:** Python 3 + pandas, mysql-connector-python, python-dotenv, Selenium WebDriver (Chrome) for CigarPOS exports.

## Directory Guide
- `index.js` – boots env parsing, configures TLS-aware MySQL pool, builds featured-product + variant image metadata, exposes HTTP routes, ensures required tables, and seeds image lookups.
- `views/` – EJS layout (`layouts/main.ejs`) with navbar/footer partials plus SSR templates for products, cart, checkout, FAQ, and policy pages.
- `public/` – static HTML entries, CSS, JS, hero video, and `images/imagesForProducts/` used by the variant-image lookup.
- `downloads/` – raw + cleaned CSV snapshots (`inventory_*.csv`, `items-*.csv`) dropped in by Selenium automation for each store.
- `clean_data.py`, `normalize_product_names.py`, `fix_product_names.py`, `fix_typo.py`, `find_typos.py` – normalization helpers that dedupe brands, enforce category slugs, and upsert records.
- `get_79th_data.py`, `get_calle8_dta.py` – Selenium flows that log into mvss.cigarspos.com, export store-specific inventory, and rename files into `downloads/`.
- `add_location_column.sql` – helper DDL to augment CSV-derived tables with location metadata.
- `.env.example`, `requirements.txt`, `Procfile`, `start` – environment reference, Python deps, Heroku-style launcher, and a simple Node start shim.
- `index.updated.js`, `checkout.updated.ejs` – alternate iterations kept for reference but not wired into package scripts.

## Backend Features
- **Config + Pooling:** Accepts either `MYSQL_PUBLIC_URL` or discrete DB vars, supports `DB_SSL` flags (`skip-verify`, `true`, `require`), and retries transient MySQL errors before surfacing failures.
- **Inventory snapshots:** Aggregates `inventory_calle8` and `inventory_79th` via `SNAPSHOT_AGG_SQL`, optionally faking stock (`LOCAL_SHOW_ALL=true`) so empty items still preview locally.
- **Featured gating:** `FEATURED_BASE_SET`, `PRODUCT_EXCLUSION_KEYWORDS`, and `HIDDEN_CATEGORY_NAMES` ensure only approved nicotine/tobacco SKUs appear on the public storefront.
- **Variant imagery:** Reads `/public/images/imagesForProducts`, normalizes filenames, builds `VARIANT_IMAGE_LOOKUP`, and refreshes automatically (watcher + `STATIC_IMAGE_REFRESH_INTERVAL_MS`). Set `DISABLE_STATIC_IMAGE_WATCH=true` to turn off fs.watch.
- **Automatic schema prep:** On boot, creates `stores`, `product_images`, and snapshot tables (with `is_active` column) and seeds store rows for Calle 8 & 79th.
- **API surface:**
  - `GET /health` – DB readiness.
  - `GET /api/stores` – active store geo info.
  - `POST /api/check-inventory` – availability map for specific product IDs per store.
  - `GET /api/closest-store` – Haversine distance lookup using lat/lng query params.
  - `POST /api/zen/hosted-fields/token` – proxy to ZenPayments to obtain a short-lived Hosted Fields token (requires server-side API creds).
- **SSR routes:** `GET /`, `/shop` (redirect), `/products` (paginated featured catalog with grouping + filtering), `/cart`, `/checkout`, `/faq`, `/policy/:slug`, plus legacy redirects for old static files.

## Frontend Surfaces
- `layouts/main.ejs` injects the age-gate overlay, dual navbars, and Bootstrap + custom CSS bundles, then includes per-page content via `<%- body %>`.
- `products.ejs` renders the hero, responsive filter toolbar, grouped product cards with flavor carousels, stock states, and pagination controlled by `flavor_selector.js` and `cart.js`.
- `cart.ejs` and `checkout.ejs` share the same layout and rely on `cart.js` for client-side persistence plus `checkout.ejs` sections for delivery, payment, and FAQ content.
- `faq.ejs` and `policy.ejs` pull structured copy from in-memory data in `index.js`, so updating legal content stays version-controlled.
- `public/index.html`, `product_cards.html`, `products.html`, and `checkout.html` mirror the SSR experience for marketing/preview use, referencing the same CSS/JS bundles.

## Data & Automation Tooling
- `clean_data.py` enforces category hierarchies, slugs, UPC sanitization, feature flags, and pushes products + inventory into MySQL via upserts while syncing snapshot tables.
- `normalize_product_names.py` centralizes brand/token fixes so ETL output aligns with the storefront’s grouping logic.
- `fix_product_names.py`, `fix_typo.py`, `find_typos.py` offer smaller utilities for correcting CSV exports without rerunning full ETL passes.
- `get_79th_data.py` / `get_calle8_dta.py` automate CigarPOS logins with Selenium, export inventory CSVs, wait for downloads to finish, and rename them consistently (credentials currently hard-coded for manual runs).
- `requirements.txt` (pandas, mysql-connector-python, python-dotenv, selenium) powers all ETL helpers; install into a virtualenv referenced by `.venv/`.

## Environment Variables
- **Database:** `MYSQL_PUBLIC_URL` or (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) with optional Railway-style `MYSQLHOST` aliases; `DB_SSL` tunes TLS; `LOCAL_SHOW_ALL` forces zero-qty items to appear.
- **Static imagery:** `DISABLE_STATIC_IMAGE_WATCH`, `STATIC_IMAGE_REFRESH_INTERVAL_MS` control the watcher cadence; `IMAGE_READY_ALLOWLIST` is defined in code but can be extended there.
- **Contact/branding:** `SUPPORT_EMAIL`, `SALES_PHONE`, plus per-store addresses baked into `CONTACT_INFO`.
- **ZenPayments:** `ZENPAYMENTS_API_BASE`, `ZENPAYMENTS_API_TOKEN`, `ZENPAYMENTS_TERMINAL_ID`, `ZENPAYMENTS_DOMAIN` for Hosted Fields tokenization.
- **Python ETL:** shares the same DB vars and optionally uses `SUPPLIER` / `LOCATION` hints when cleaning vendor files.

## Local Development
1. `npm install` to pull server deps (package script name is `"start smoking"`).
2. Create a `.env` based on `.env.example` with DB + contact + ZenPayments values.
3. Run `npm run "start smoking"` (or `nodemon index.js`) and visit `http://localhost:3000`.
4. For ETL, create/activate `.venv`, then `pip install -r requirements.txt` before running any Python scripts.
5. Drop sample CSVs into `downloads/` or run the Selenium grabbers to populate them.

## CSV / Inventory Refresh Workflow
1. Use `get_79th_data.py` / `get_calle8_dta.py` to export the latest CigarPOS inventory (files land in `downloads/` with standardized names like `inventory_79th.csv`).
2. Optionally run quick fixes (`find_typos.py`, `fix_typo.py`) on obvious formatting issues.
3. Execute `python clean_data.py` (see `--help`) to normalize rows, enforce categories, and upsert products + per-store inventory while refreshing snapshot tables.
4. Repeat whenever new exports arrive; the Express app will immediately reflect the refreshed data because it queries MySQL on demand.

## Testing & Observability
- `npm test` is a placeholder and exits with an error message; no automated coverage exists yet.
- Rely on `/health`, API responses, and manual cart/checkout flows for verification; logs stream to stdout (or host logs) and include safe DB config summaries.

## Deployment Notes
- `Procfile` declares `web: node index.js` for Heroku/Railway style hosts; the `start` bash wrapper simply invokes the same entrypoint.
- Node 18+ is recommended to ensure global `fetch` availability for the ZenPayments proxy; older runtimes would need a fetch polyfill.
- Ensure MySQL instances already contain `products`, `product_inventory`, `categories`, and `stores` tables; the app will create/alter snapshot-related tables automatically but expects the rest to exist.
- Static assets can be served directly from Express (`app.use(express.static(...))`), so no CDN setup is required unless desired.
