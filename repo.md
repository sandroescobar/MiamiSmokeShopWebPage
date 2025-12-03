# Miami Smoke

## Overview
- Full-stack Express + EJS storefront for Miami Vape Smoke Shop with Stripe checkout, MySQL catalog, and policy pages.
- Static marketing assets live under `public/`, while server-rendered templates use `views/` with `express-ejs-layouts`.
- Python ETL scripts keep product and inventory data synchronized with the MySQL schema.

## Tech Stack
- Runtime: Node.js 20+ (ESM) with Express 5, Stripe SDK, MySQL2, dotenv, Nodemon.
- Views: EJS templates with shared layout (`views/layouts/main.ejs`) and partials for header/footer/cart widgets.
- Styling & assets: Plain CSS/JS (`public/css`, `public/js`), image/video promos under `public/images` and `public/video`.
- Data tooling: Python 3.12 with pandas, mysql-connector-python, python-dotenv, selenium for scraping/automation.

## Application Structure
- `index.js`: Main Express app configuring env parsing, MySQL pool, Stripe keys, static assets, policy content, and JSON APIs (health, store list, inventory checks, closest-store lookup, checkout/cart flows).
- `views/`: Cart/checkout/policy/product templates plus reusable layout/partials for navigation, modals, and promo sections.
- `public/`: Landing pages (`index.html`, `products.html`, `product_cards.html`, `checkout.html`) mirroring server-rendered content for marketing or static hosting needs.
- `downloads/`: Raw CSV exports from CigarPOS / store systems that feed the cleanup scripts.
- `python scripts`: `clean_data.py`, `normalize_product_names.py`, `fix_product_names.py`, etc., normalizing CSVs, ensuring categories exist, and bulk upserting into `products` with location metadata.
- `add_location_column.sql`: Helper migration ensuring `products.location` exists before running the ETL jobs.

## Data & Automation Workflow
1. Pull latest POS exports into `downloads/` (e.g., `inventory_79th.csv`).
2. Run `clean_data.py` (or supporting scripts) to normalize brand names, UPCs, quantities, and categories.
3. Scripts connect to the same MySQL instance as the Express app (shared env vars) and upsert products, categories, and stock levels with store location tags.
4. Frontend APIs (`/api/stores`, `/api/check-inventory`, `/api/closest-store`) consume these tables to power cart validation and pickup/delivery logic.

## Environment Variables
Set in `.env` (never committed). Key variables consumed by Node & Python:
- `MYSQL_PUBLIC_URL` **or** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (also `MYSQLHOST/MYSQLUSER/...` fallbacks) for database access.
- `DB_SSL` to toggle TLS (`skip-verify`, `true`, `require`).
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` (or `STRIPE_PUBLIC_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
- `SUPPORT_EMAIL`, `SALES_PHONE` for contact info.
- Python ETL honors `SUPPLIER`, `LOCATION` overrides when stamping product rows.

## Local Development
1. Install Node deps: `npm install` (already includes Express, EJS, Stripe, MySQL clients).
2. Start the server: `npm run "start smoking"` (runs `node index.js`). Use `nodemon index.js` for auto-reload if desired.
3. Populate `.env` with database + Stripe keys, then ensure MySQL has required tables (`products`, `stores`, `categories`, etc.).
4. (Optional) Prepare data: `python3 -m venv .venv && source .venv/bin/activate`, `pip install -r requirements.txt`, run `python clean_data.py --help` for options after placing CSVs into `downloads/`.
5. Static HTML under `public/` can be previewed directly via any web server, but dynamic cart/checkout requires the Express app.

## Testing & Observability
- No automated tests yet; `npm test` is a placeholder. Focus on manual verification plus `/health` endpoint for DB connectivity.
- Server logs (`logs.txt`) capture operational output; Stripe + MySQL errors log to console.
