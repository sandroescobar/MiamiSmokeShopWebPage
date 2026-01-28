# Miami Smoke Repository Reference

## Snapshot
- **Express 5 + EJS storefront** that reads curated MySQL snapshot tables for Calle 8, 79th Street, or Market inventory while hiding disallowed THC/THCA phrases unless explicitly permitted via `LOCAL_SHOW_ALL`.
- **Static marketing pages**, CSS, JS controllers, and product media are served from `public/` in parallel with the SSR routes.
- **Python ETL scripts** normalize vendor CSV exports, keep history in `downloads/`, and repopulate relational tables before the Node server aggregates rows at request time.

## Runtime Stack
- **Backend:** Node 18+, Express 5, `express-ejs-layouts`, `mysql2/promise`, `dotenv`, optional SSL via `DB_SSL`, Authorize.Net SDK (`authorizenet`) for Accept.js token exchange, and `fast-xml-parser` for XML helpers.
- **Client:** Bootstrap (CDN), Google Fonts, custom styles in `public/css/`, vanilla controllers in `public/js/`.
- **Messaging & Ops:** `utils/slack.js` (and legacy `public/js/slack.js`) posts order payloads to a Slack Incoming Webhook; optional Twilio Messaging Service support for receipts.
- **Automation:** Python 3 + pandas, `mysql-connector-python`, `python-dotenv`, and Selenium 4 (`requirements.txt`) for pulling and cleaning CigarPOS exports.

## Directory Tour
- `index.js` — Core Express application; handles DB resolution, store metadata, product normalization/grouping, and registers all API + SSR routes.
- `views/` — EJS templates for the storefront (products, cart, checkout, success, etc.) and layouts.
- `public/` — Static assets (HTML, CSS, JS, images, video).
- `public/js/` — Browser-side controllers (cart, search, flavor selector, age gate).
- `utils/` — Server-side utility functions (e.g., `slack.js`).
- `downloads/` — Raw and cleaned CSV snapshots used as inputs to ETL jobs.
- `SQL Scripts` (`add_location_column.sql`) — Database schema migrations and DDL.

### Automation & Cleanup Scripts
- `get_79th_data.py` / `get_calle8_data.py` / `get_mkt_data.py` — Selenium scrapers that export inventory from CigarPOS/BottlePOS.
- `clean_data.py` — Chained after scrapers to upsert categories and repopulate store snapshot tables.
- `sync_raz9k_images.py` — Maps static images in `public/images/imagesForProducts/RAZ 9K` to database products.
- `cleanup_raz9k_zero_nic_images.py` — Specifically removes image mappings for RAZ 9K Zero Nic variants.
- `remove_cactus_jack.py` / `remove_orange_raspberry_typo.py` — Maintenance scripts to purge specific products/typos from all tables.
- `normalize_product_names.py` / `fix_product_names.py` / `fix_typo.py` / `find_typos.py` — Hygiene utilities for naming consistency and slug generation.

## Server Responsibilities (`index.js`)
- **Product Normalization:** Uses `normalizeProductName` and `extractProductVariantKey` to group disparate inventory rows into clean product "bases" with variants (flavors/sizes).
- **Inventory Aggregation:** Unifies `inventory_calle8`, `inventory_79th`, and `inventory_mkt` tables on-the-fly, respecting `is_active` flags.
- **Image Resolution:** Combines hardcoded `VARIANT_IMAGE_MAPPINGS`, dynamic directory scanning, and `product_images` table lookups.
- **API Endpoints:**
  - `GET /health`
  - `POST /api/check-inventory` — Pre-checkout stock validation.
  - `GET /api/uber/deliveries/:deliveryId` — Live tracking polling.
  - `POST /api/authorize/charge` — Authorize.Net payment processing + Uber Direct dispatch.

## Integrations
- **Authorize.Net:** Uses Accept.js for client-side tokenization and server-side charging via `api/authorize/charge`.
- **Uber Direct:** Post-payment delivery dispatch with real-time status updates and tracking.
- **Slack:** Broadcasts purchase receipts (pickup vs delivery) to a designated channel.
- **Twilio:** Optional SMS receipts for customers.

## Environment & Configuration
- `MYSQL_PUBLIC_URL` or discrete `DB_*` vars for MySQL connectivity.
- `UBER_DIRECT_*` and `AUTH_NET_*` for third-party integrations.
- `LOCAL_SHOW_ALL=true` to bypass keyword filtering for local development.
- `STATIC_IMAGE_REFRESH_INTERVAL_MS` controls how often the server rescans the product image directory.

## Commands & Deployment
- **Install:** `npm install` and `pip install -r requirements.txt`.
- **Run:** `npm run "start smoking"` (node index.js).
- **Process Manager:** `Procfile` for Heroku/Railway (`web: node index.js`).
- **Data Refresh:** Run the Selenium scrapers manually to pull fresh inventory CSVs into `downloads/`.
