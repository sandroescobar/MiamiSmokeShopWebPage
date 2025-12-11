# Miami Smoke

## Overview
- Full-stack Express + EJS storefront for Miami Vape Smoke Shop with manual checkout, store locator, and policy pages backed by MySQL.
- Static landing assets (`public/`) complement the server-rendered flows in `views/`, sharing the same branding and content.
- Python ETL scripts normalize vendor CSV exports and upsert products/inventory so APIs always reflect accurate stock per location.

## Tech Stack
- **Runtime**: Node.js 20 (ESM) with Express 5, express-ejs-layouts, mysql2, dotenv, Nodemon.
- **Templating & Assets**: EJS layouts/partials, hand-written CSS/JS, promo media under `public/images` and `public/video`.
- **Data Tooling**: Python 3.12, pandas, mysql-connector-python, python-dotenv, selenium.

## Key Paths
- `index.js`: Configures env parsing, MySQL pool, static assets, global contact data, policy copy, API routes, and checkout/cart endpoints.
- `views/`: `layouts/main.ejs`, shared header/footer/cart partials, and page templates for cart, checkout, FAQ, policy, and catalog flows.
- `public/`: Static marketing pages (`index.html`, `products.html`, `product_cards.html`, `checkout.html`) plus css/js/media folders.
- `downloads/`: Raw CSV dumps from CigarPOS (e.g., `inventory_79th.csv`, `items-*.csv`) used as ETL inputs.
- `python scripts`: `clean_data.py`, `normalize_product_names.py`, `fix_product_names.py`, `get_79th_data.py`, etc. for data cleanup, normalization, scraping, and MySQL upserts.
- `add_location_column.sql`: One-off migration that adds `products.location` before running ETL jobs.

## Server Capabilities
- `/health`: MySQL connectivity probe.
- `/api/stores`: Active store list with coordinates.
- `/api/check-inventory`: Validates product availability at a requested location.
- `/api/closest-store`: Haversine distance calculation to recommend the nearest store.
- Policy pages (`/policy/:slug`) are hydrated from the in-file `policyPages` dataset covering terms, privacy, refund, delivery, and cancellation content.

## Data + Automation Workflow
1. Export latest inventory CSVs into `downloads/`.
2. Run `clean_data.py` (and supporting scripts) to standardize brands, UPCs, categories, and quantities.
3. Scripts read `.env` for DB credentials, connect via mysql-connector-python, and upsert products, categories, and store-specific `quantity_on_hand` values.
4. Express APIs and checkout flows consume the refreshed tables for inventory validation and pickup/delivery eligibility.

## Environment Variables
Set via `.env` (never committed):
- `MYSQL_PUBLIC_URL` **or** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (also honors `MYSQLHOST`, `MYSQLPORT`, etc.).
- `DB_SSL` values `skip-verify`, `true`, or `require` configure TLS for managed db providers.
- `SUPPORT_EMAIL`, `SALES_PHONE` feed contact info rendered across layouts and policy pages.
- Python ETL scripts also respect `SUPPLIER`, `LOCATION`, and the same DB vars.

## Local Development
1. Install Node deps: `npm install`.
2. Run the server: `npm run "start smoking"` (or `nodemon index.js` during development).
3. Populate `.env` with database + contact values; ensure MySQL tables (`stores`, `products`, `categories`, etc.) exist.
4. (Optional) For data tooling: `python3 -m venv .venv && source .venv/bin/activate`, `pip install -r requirements.txt`, then run `python clean_data.py --help` after placing CSVs in `downloads/`.
5. Static HTML under `public/` can be previewed via any static web server, but cart/checkout features require the Express app.

## Testing & Observability
- No automated tests yet; `npm test` exits with a placeholder error.
- Use manual verification plus `/health` for DB checks; runtime logs stream to stdout (or configured host logs) for delivery/cart debugging.
