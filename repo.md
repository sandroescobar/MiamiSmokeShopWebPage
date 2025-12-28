# Miami Smoke

## Overview
- Express 5 + EJS storefront serving catalog, cart, checkout, FAQ, and policy content for Miami Vape Smoke Shop.
- Static marketing microsite under `public/` mirrors the dynamic pages rendered from `views/`.
- Inventory, featured-product art, and store data are sourced from MySQL and refreshed via Python ETL jobs that normalize vendor CSV exports.

## App Structure
- `index.js`: boots env parsing, MySQL pool (URL or discrete vars, optional TLS), global contact data, featured-product logic, Express routes, and policy datasets.
- `views/`: layout + partials plus `cart.ejs`, `checkout.ejs`, `products.ejs`, `faq.ejs`, and `policy.ejs` templates used by server routes.
- `public/`: standalone HTML entry points with shared CSS/JS/images/video assets for promotional pages and SEO landers.
- `downloads/`: raw CigarPOS CSV exports (inventory snapshots per store) consumed by the Python scripts.
- `python scripts`: `clean_data.py`, `normalize_product_names.py`, `fix_product_names.py`, `get_79th_data.py`, etc. handle cleaning, deduping, and upserts into MySQL tables.

## HTTP Surface
- `GET /health`: pings the DB connection.
- `GET /api/stores`: returns active stores with coordinates, hours, and contact info.
- `POST /api/check-inventory`: validates requested items against live quantities and hides THC/THCA categories via keyword filters.
- `POST /api/closest-store`: Haversine distance helper for locating the nearest branch.
- `GET /policy/:slug`: renders terms, privacy, refund, delivery, and cancellation copy from in-memory content.
- Cart and checkout flows hydrate featured products, inventory snapshots, and variant image mappings to show only stocked SKUs.

## Data + Automation Workflow
1. Drop the latest vendor CSVs into `downloads/` (per-store `inventory_*.csv` or `items-*.csv`).
2. Activate the Python venv and install `requirements.txt` (pandas, mysql-connector-python, python-dotenv, selenium).
3. Run the cleaning scripts (e.g., `python clean_data.py --help`) to standardize brands, categories, UPCs, and per-store stock levels.
4. Scripts read `.env`, connect to MySQL, and upsert products, categories, and location quantity tables consumed by the Express APIs.

## Environment Variables
- Supply either `MYSQL_PUBLIC_URL` or individual `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (also honor `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`).
- `DB_SSL` accepts `skip-verify`, `true`, or `require` for managed DB proxies.
- `SUPPORT_EMAIL`, `SALES_PHONE`, and optional `IMAGE_READY_ONLY` customize contact info and featured-product filtering.
- Python tooling also respects `SUPPLIER`, `LOCATION`, and the same DB credentials.

## Local Development
1. Install Node deps: `npm install`.
2. Boot the server: `npm run "start smoking"` (or `nodemon index.js`).
3. Create `.env` with the DB + contact variables and ensure schema tables (`stores`, `products`, `categories`, `inventory_*`) exist.
4. Optional: set up `python3 -m venv .venv`, activate it, then `pip install -r requirements.txt` before running ETL helpers.
5. Static files under `public/` can be previewed with any static host, but cart/checkout + APIs require the Express instance.

## Testing & Observability
- No automated tests yet; `npm test` is a placeholder exit.
- Use `/health` plus manual checkout/cart exercises for verification; server logs stream to stdout (or host logs) for debugging.
