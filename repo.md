# Miami Smoke Repository Guide

## Application Overview
- Express 5 + EJS storefront (`index.js`) serves the Miami Vape Smoke Shop catalog, cart, checkout, FAQ, and policy content while sharing a Bootstrap-based layout/partials stack.
- Data is sourced from MySQL snapshot tables (`inventory_calle8`, `inventory_79th`) with feature flags that hide THC/THCA phrases, discontinued variants, and zero-qty rows unless `LOCAL_SHOW_ALL=true`.
- Static marketing landers (`public/*.html`), CSS/JS bundles, and hero media remain under `public/` for crawler-friendly hosting alongside the SSR experience.
- Python utilities normalize vendor exports, keep CSV snapshots in `downloads/`, and load curated data back into MySQL so the Node app can query on demand.

## Tech Stack
- **Runtime:** Node 18+ (ES modules), Express 5, EJS, `express-ejs-layouts`, `mysql2/promise`, `dotenv`.
- **Client:** Bootstrap 5.3 CDN, Google Fonts, custom CSS (`public/css/*`), and vanilla controllers (`public/js/age_gate.js`, `main.js`, `search_bar.js`, `cart.js`, `flavor_selector.js`).
- **Payments:** Authorize.Net Accept.js flow via `/api/authorize/*` routes plus the `authorizenet` SDK for XML helpers.
- **Automation:** Python 3 + pandas, mysql-connector-python, python-dotenv, Selenium 4 for CigarPOS exports (`requirements.txt`).

## Key Directories
- `index.js` – boots env parsing, configures the MySQL pool (with retriable queries + optional TLS), enforces featured-product rules, watches static variant images, and exposes all API + SSR routes.
- `views/` – `layouts/main.ejs` injects the dual navbars/age-gate wrapper and includes page bodies such as `products.ejs`, `cart.ejs`, `checkout.ejs`, `faq.ejs`, and `policy.ejs` (fed by in-memory policy copy).
- `public/` – static HTML mirrors (`index.html`, `products.html`, `checkout.html`, `product_cards.html`) plus `css/`, `js/`, `images/`, and `video/` assets consumed by both SSR and static landers.
- `downloads/` – raw and cleaned CSV snapshots (`inventory_*.csv`, `items-*.csv`) written by Selenium scripts before ETL loads them into the relational tables.
- Python utilities (`clean_data.py`, `normalize_product_names.py`, `fix_product_names.py`, `fix_typo.py`, `find_typos.py`) – enforce naming conventions, slugs, UPC sanitization, and keep store snapshot tables aligned with `products`/`product_inventory`.
- Selenium grabbers (`get_79th_data.py`, `get_calle8_dta.py`) – log into mvss.cigarspos.com, export per-store inventory, place files in `downloads/`, then invoke `clean_data.py` to push rows into MySQL.
- `add_location_column.sql` – helper DDL for adding location metadata to CSV-derived tables.
- `Procfile` + `start` – Heroku/Railway style launcher that runs `node index.js`.

## Backend Highlights (`index.js`)
- Flexible DB configuration via `MYSQL_PUBLIC_URL` or discrete `DB_*` vars with SSL modes (`skip-verify`, `true`, `require`).
- CONTACT + store metadata is centralized for Calle 8, 79th Street, and "either" catalog browsing.
- Snapshot aggregation joins `inventory_calle8`/`inventory_79th`, filters restricted keywords, and groups variants so only approved nicotine/tobacco SKUs are rendered.
- Static image pipeline scans `public/images/imagesForProducts`, builds variant lookups, auto-refreshes every 15s (configurable), and can hot-reload on fs.watch unless `DISABLE_STATIC_IMAGE_WATCH=true`.
- REST + SSR routes:
  - `GET /health` – DB readiness probe.
  - `GET /api/stores` – active store geo metadata.
  - `POST /api/check-inventory` – availability by product IDs + store.
  - `GET /api/closest-store` – Haversine lookup for nearest store.
  - `GET /api/authorize/test-auth`, `GET /api/authorize/auth-test`, `POST /api/authorize/charge` – Authorize.Net credential checks and opaqueData charge endpoint.
  - `GET /`, `/products`, `/cart`, `/checkout`, `/checkout/success`, `/policy/:slug`, `/faq`, plus redirects from `/shop` and legacy static paths.
- Checkout helpers sanitize cart payloads, enforce variant groupings, and update inventory snapshots after sales.

## Frontend Surfaces
- `layouts/main.ejs` pulls Bootstrap + custom CSS, renders the age gate overlay, and includes navbar/footer partials.
- `products.ejs` drives the hero layout, store filters, pagination, and variant carousels; `cart.ejs` + `checkout.ejs` share the same layout and rely on `cart.js` for persistence.
- `faq.ejs` and `policy.ejs` read structured copy from `policyPages` in `index.js`, ensuring policy edits stay version-controlled.
- Static marketing HTML files under `public/` mirror the EJS experience for SEO previews.

## Data & Automation Workflow
1. Run `python3 get_79th_data.py` or `python3 get_calle8_dta.py` to log into CigarPOS, export CSVs, and drop them into `downloads/` with stable names (e.g., `inventory_79th.csv`).
2. Each script normalizes the CSV (column remapping, UPC cleanup, category filtering) and writes a `*_clean.csv` companion file.
3. The grabber automatically shells out to `python3 clean_data.py <clean_csv> "Store Name"`, which:
   - Ensures required snapshot tables exist (with `is_active`),
   - Loads/creates categories, products, product_inventory rows,
   - Refreshes `inventory_<store>` tables while preserving manual `is_active` overrides.
4. `clean_data.py` can also be run manually for ad-hoc files; it honors `.env` DB credentials plus optional `SUPPLIER`/`LOCATION` hints.

## Environment & Configuration
- `.env.example` documents core vars: `MYSQL_PUBLIC_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `SUPPORT_EMAIL`, `SALES_PHONE`, `SUPPLIER`, `LOCATION`.
- Additional runtime flags from `index.js`: `LOCAL_SHOW_ALL`, `DISABLE_STATIC_IMAGE_WATCH`, `STATIC_IMAGE_REFRESH_INTERVAL_MS`, `IMAGE_READY_ONLY`, `SUPPORT_EMAIL`, `SALES_PHONE`, `ZENPAYMENTS_*` (if used), and the Authorize.Net keys (`AUTH_NET_ENV`, `AUTH_NET_LOGIN_ID`, `AUTH_NET_TRANSACTION_KEY`, `AUTH_NET_CLIENT_KEY`).

## Scripts & Commands
- `npm install` – install Node dependencies defined in `package.json`.
- `npm run "start smoking"` – launch the Express server (mirrors the `start` script + `Procfile`).
- `npm test` – placeholder that exits with an error (no automated JS tests yet).
- `python -m venv .venv && source .venv/bin/activate` then `pip install -r requirements.txt` – provision the ETL environment.
- `python3 clean_data.py <csv_path> <store label>` – manually normalize & load inventory data.

## Testing & Deployment Notes
- No automated JS test suite; rely on manual flows and `/health` for smoke checks.
- `Procfile` (`web: node index.js`) supports Heroku/Railway. Ensure the remote MySQL instance already has `products`, `product_inventory`, `categories`, and `stores`; the app will create/alter snapshot tables itself.
- Static assets are served directly from Express (`app.use(express.static(...))`), so a CDN is optional.
