# Miami Smoke Repository Reference

## Snapshot
- Express 5 + EJS storefront that reads curated MySQL snapshot tables for Calle 8, 79th Street, or combined inventory while hiding disallowed THC/THCA phrases unless explicitly permitted via `LOCAL_SHOW_ALL`
- Static marketing pages, CSS, JS controllers, and product media are served from `public/` in parallel with the SSR routes so crawlers and ad landers can reuse the same assets
- Python ETL scripts normalize vendor CSV exports, keep history in `downloads/`, and repopulate relational tables before the Node server aggregates rows at request time

## Runtime Stack
- **Backend:** Node 18+, Express 5, `express-ejs-layouts`, `mysql2/promise`, `dotenv`, optional SSL via `DB_SSL`, Authorize.Net SDK (`authorizenet`) for Accept.js token exchange, and `fast-xml-parser` for XML helpers
- **Client:** Bootstrap (CDN), Google Fonts, custom styles in `public/css/{styles,products,product_cards,mobile}.css`, vanilla controllers in `public/js/{main,cart,flavor_selector,search_bar,age_gate}.js`
- **Messaging & Ops:** `public/js/slack.js` posts order payloads to a Slack Incoming Webhook, `public/js/sms.js` sends Twilio Messaging Service receipts, and additional helpers (`slack.js`, `sms.js`) are written to be required from Node-side checkout flows
- **Automation:** Python 3 + pandas, `mysql-connector-python`, `python-dotenv`, and Selenium 4 (`requirements.txt`) for pulling and cleaning CigarPOS exports

## Directory Tour
- `index.js` — boots Express, resolves DB creds from `MYSQL_PUBLIC_URL` or discrete `DB_*` vars, builds store/contact metadata, filters catalog terms, aggregates snapshot tables, hydrates policy copy, and registers every API + SSR route
- `views/` — `layouts/main.ejs` applies the age-gate wrapper and includes `partials/{navbar,navbar2,footer}.ejs`; page templates cover products, cart, checkout, FAQ, policy, and the checkout success screen
- `public/` — static counterparts for high-traffic pages (`index.html`, `products.html`, `checkout.html`, `product_cards.html`, `render_logs.html`, `uber_api.html`) plus CSS, JS, hero media, and product imagery under `images/imagesForProducts/*`
- `public/js/` — browser controllers for UI interactions plus Node-friendly notification helpers (`slack.js`, `sms.js`) that are required from the server to push Slack/Twilio updates
- `downloads/` — raw and cleaned CSV snapshots (`inventory_*.csv`, `items-*.csv`) used as inputs to ETL jobs
- Python utilities (`clean_data.py`, `normalize_product_names.py`, `fix_product_names.py`, `fix_typo.py`, `find_typos.py`) — enforce naming, UPC hygiene, slug generation, and reconcile inventory rows before writing to MySQL
- Selenium grabbers (`get_79th_data.py`, `get_calle8_dta.py`) — log into mvss.cigarpos.com, export store-specific CSVs, drop them in `downloads/`, then hand them to `clean_data.py`
- `add_location_column.sql` — helper DDL to retrofit location metadata onto CSV-derived tables
- `Procfile` and `start` — minimal process definitions (`web: node index.js`) for Heroku/Railway-style hosts

## Server Responsibilities (`index.js`)
- Resolves DB configuration via URL or discrete vars, supports SSL modes (`skip-verify`, `true`, `require`), and prints only anonymized connection data for debugging
- Maintains store metadata (`STORE_CHOICES`), featured product allowlists, and exclusion keywords so restricted THC/THCA items never reach storefront queries
- Aggregates `inventory_calle8` and `inventory_79th` snapshot tables, grouping quantities per product while respecting manual `is_active` flags and pagination size (`PRODUCTS_PAGE_SIZE` = 30)
- Scans `public/images/imagesForProducts`, builds variant image mappings, and hot-reloads them on an interval controlled by `STATIC_IMAGE_REFRESH_INTERVAL_MS` unless `DISABLE_STATIC_IMAGE_WATCH=true`
- Exposes REST endpoints: `GET /health`, `GET /api/stores`, `POST /api/check-inventory`, `GET /api/closest-store`, `GET /api/geocode`, Uber Direct helpers (`/api/uber/ping`, `/api/uber/auth-test`, `/api/uber/quote`, `/api/uber/deliveries/:deliveryId`), and Authorize.Net helpers (`/api/authorize/test-auth`, `/api/authorize/auth-test`, `POST /api/authorize/charge`)
- Serves storefront routes: `/`, `/shop` redirect, `/products`, `/cart`, `/checkout`, `/checkout-success`, `/policy/:slug`, `/faq`, plus legacy static paths that map into the same templates
- Checkout utilities sanitize cart payloads, enforce variant groupings, trigger post-purchase Slack/Twilio hooks, and refresh in-memory inventory snapshots after successful orders

## Client Surfaces
- `layouts/main.ejs` loads Bootstrap, fonts, and shared navbars while handling the age-gate overlay
- `products.ejs` drives store filtering, hero copy, pagination, featured group rendering, and variant carousels using the aggregated data
- `cart.ejs`, `checkout.ejs`, and `checkout-success.ejs` reuse the layout and depend on `public/js/cart.js` for client-side persistence
- `faq.ejs` and `policy.ejs` consume structured copy sourced from `policyPages` in `index.js`
- Static HTML files under `public/` mirror the SSR experience for marketing campaigns or health/debug pages such as `render_logs.html` and `uber_api.html`
- JavaScript helpers: `age_gate.js` stores adult confirmation, `search_bar.js` filters SKUs in-page, `flavor_selector.js` toggles variant swatches, and `main.js` wires common UI behaviors

## Data & Automation Workflow
1. Run `python3 get_79th_data.py` or `python3 get_calle8_dta.py` to authenticate against CigarPOS, download raw inventory CSVs, and drop them into `downloads/`
2. Each grabber cleans column headers, normalizes UPCs, and writes `*_clean.csv` companions before chaining into `python3 clean_data.py <clean_csv> "Store Name"`
3. `clean_data.py` ensures `products`, `product_inventory`, and store snapshot tables exist, upserts categories/subcategories, and repopulates `inventory_<store>` while preserving manual `is_active` overrides
4. Cleaned data becomes the source of truth for the Express layer, which performs on-demand aggregation without re-querying the upstream vendor APIs

## Supporting Scripts & Utilities
- `normalize_product_names.py`, `fix_product_names.py`, `fix_typo.py`, and `find_typos.py` apply deterministic casing, token replacements, and typo audits to keep naming consistent across CSV drops
- `fix_product_names.py` and `normalize_product_names.py` share helper logic for slug generation so front-end URLs remain stable
- `add_location_column.sql` can be run manually when new CSV tables need explicit location metadata before the Node server consumes them

## Integrations
- **Authorize.Net:** Accept.js credentials (`AUTH_NET_LOGIN_ID`, `AUTH_NET_CLIENT_KEY`, `AUTH_NET_TRANSACTION_KEY`, `AUTH_NET_ENV`) back the `/api/authorize/*` routes used during checkout
- **Uber Direct:** `.env` exposes `UBER_DIRECT_*` credentials plus sandbox URLs; corresponding Express routes handle auth checks, quotes, and delivery polling
- **Slack:** `SLACK_WEBHOOK_URL` lets `public/js/slack.js` (required server-side) broadcast pickup vs delivery receipts without impacting checkout when failures occur
- **Twilio:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, and `TWILIO_SMS_ENABLED` govern the optional SMS receipts built in `public/js/sms.js`

## Environment & Configuration
- `.env.example` documents DB credentials (`MYSQL_PUBLIC_URL` or `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`), SSL toggle (`DB_SSL`), contact channels (`SUPPORT_EMAIL`, `SALES_PHONE`), store-specific phone/address fields, and Uber Direct credentials
- Feature flags: `LOCAL_SHOW_ALL` bypasses keyword/category filtering locally, `DISABLE_STATIC_IMAGE_WATCH` stops the watcher, `STATIC_IMAGE_REFRESH_INTERVAL_MS` customizes the rescan cadence, and `IMAGE_READY_ONLY` can restrict product exposure to SKUs with photo coverage

## Commands & Deployment
- `npm install` installs the Node dependencies defined in `package.json`
- `npm run "start smoking"` (or `node index.js`) boots the Express server; `npm test` is a placeholder that exits non-zero
- Python setup: `python -m venv .venv && source .venv/bin/activate` followed by `pip install -r requirements.txt`
- Data refresh: `python3 clean_data.py <csv_path> <store label>` can be run manually for ad-hoc inventory drops
- Deployment: `Procfile` (`web: node index.js`) and the `start` shim support Heroku/Railway; ensure a remote MySQL instance already contains `products`, `product_inventory`, `categories`, and `stores` so the ETL can manage `inventory_<store>` tables
