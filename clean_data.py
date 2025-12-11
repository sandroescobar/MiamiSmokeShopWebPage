import os
import sys
import re
import math
import pandas as pd
import mysql.connector
from mysql.connector import errorcode
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote

load_dotenv()

PARENT_CATEGORIES = {
    "NICOTINE VAPES": "nicotine-vapes",
    "THCA PRODUCTS": "thca-products",
    "TOBACCO PRODUCTS": "tobacco-products",
    "EDIBLES": "edibles",
    "GRINDERS": "grinders",
    "ROLLING PAPERS & CONES": "rolling-papers-cones",
    "VAPE JUICES": "vape-juices",
    "DEVICES: BATTERIES & MODS": "devices-batteries-mods",
    "HOOKAH RELATED": "hookah-related"
}

SUBCATEGORY_RULES = [
    {"name": "RAZ LTX 25K", "slug": "raz-25k", "parent": "NICOTINE VAPES", "tokens": ["RAZ", "LTX", "25K"]},
    {"name": "GEEKBAR X 25K", "slug": "geekbar-x-25k", "parent": "NICOTINE VAPES", "tokens": ["GEEK", "25K"]},
    {"name": "FUME PRO 30K", "slug": "fume-pro-30k", "parent": "NICOTINE VAPES", "tokens": ["FUME", "PRO"]},
    {"name": "LOST MARY TURBO 35K", "slug": "lost-mary-turbo", "parent": "NICOTINE VAPES", "tokens": ["LOST", "MARY", "TURBO"]},
    {"name": "BB CART 1GR", "slug": "bb-cart-1gr", "parent": "THCA PRODUCTS", "tokens": ["BB", "CART"]}
]

PRODUCT_SQL = (
    """
    INSERT INTO products
      (name, upc, stockcode, unit_price, category_id, supplier)
    VALUES
      (%s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
      upc = VALUES(upc),
      stockcode = VALUES(stockcode),
      unit_price = VALUES(unit_price),
      category_id = VALUES(category_id),
      supplier = VALUES(supplier),
      id = LAST_INSERT_ID(id)
    """
)

INVENTORY_SQL = (
    """
    INSERT INTO product_inventory
      (product_id, store_id, quantity_on_hand, unit_price)
    VALUES
      (%s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
      quantity_on_hand = VALUES(quantity_on_hand),
      unit_price = VALUES(unit_price),
      last_synced_at = CURRENT_TIMESTAMP
    """
)


def parse_mysql_url(url):
    try:
        parsed = urlparse(url)
        return {
            "host": parsed.hostname,
            "port": int(parsed.port) if parsed.port else 3306,
            "user": unquote(parsed.username) if parsed.username else None,
            "password": unquote(parsed.password) if parsed.password else None,
            "database": parsed.path.lstrip('/') if parsed.path else None,
        }
    except Exception:
        return None


def get_conn():
    mysql_url = os.getenv("MYSQL_PUBLIC_URL")
    if mysql_url:
        print("🔍 DEBUG: Using MYSQL_PUBLIC_URL")
        url_cfg = parse_mysql_url(mysql_url)
        if url_cfg:
            cfg = {
                "host": url_cfg["host"],
                "port": url_cfg.get("port", 3306),
                "user": url_cfg["user"],
                "password": url_cfg["password"],
                "database": url_cfg["database"],
                "autocommit": False,
                "connection_timeout": 10,
            }
        else:
            raise ValueError(f"Failed to parse MYSQL_PUBLIC_URL: {mysql_url}")
    else:
        cfg = {
            "host": os.getenv("DB_HOST") or os.getenv("MYSQLHOST") or "127.0.0.1",
            "port": int(os.getenv("DB_PORT") or os.getenv("MYSQLPORT") or 3306),
            "user": os.getenv("DB_USER") or os.getenv("MYSQLUSER") or "root",
            "password": os.getenv("DB_PASSWORD") or os.getenv("MYSQLPASSWORD") or "",
            "database": os.getenv("DB_NAME") or os.getenv("MYSQLDATABASE") or "miami_vape_shops",
            "autocommit": False,
            "connection_timeout": 10,
        }
    ssl_mode = str(os.getenv("DB_SSL", "")).lower()
    if ssl_mode in ("skip-verify", "true", "require"):
        if ssl_mode == "skip-verify":
            cfg["ssl_disabled"] = False
            cfg["ssl_verify_cert"] = False
            cfg["ssl_verify_identity"] = False
        else:
            cfg["ssl_disabled"] = False
    return mysql.connector.connect(**cfg)


def as_str(x):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    return str(x).strip()


def clamp_int(x, minimum=0):
    try:
        v = int(float(str(x).replace(",", "")))
    except Exception:
        v = 0
    return max(v, minimum)


def clamp_price(x):
    try:
        return round(float(str(x).replace("$", "").replace(",", "")), 2)
    except Exception:
        return 0.00


def safe_len(s, max_len):
    s = as_str(s)
    return s[:max_len] if len(s) > max_len else s


def normalize_product_name_spacing(name):
    if not name:
        return name
    name = str(name).strip()
    brand_consolidations = {
        "GEEK BAR": "GEEKBAR",
        "FUME PRO": "FUMEPRO",
        "LOST MARY": "LOSTMARY",
        "ELF BAR": "ELFBAR",
        "BREEZE PRO": "BREEZEPRO",
        "PUFF BAR": "PUFFBAR",
        "BANG KING": "BANGKING",
    }
    for old_pattern, new_pattern in brand_consolidations.items():
        pattern = r'(?:^|\s)' + re.escape(old_pattern) + r'(?:\s|$)'
        if re.search(pattern, name, re.IGNORECASE):
            name = re.sub(pattern, ' ' + new_pattern + ' ', name, flags=re.IGNORECASE)
    name = ' '.join(name.split())
    return name


def apply_brand_specific_rules(name):
    text = as_str(name)
    if not text:
        return text
    if re.search(r'^RA[ZX]\s*LTX\b', text, re.IGNORECASE):
        text = re.sub(r'^RA[ZX]\s*LTX\b', 'RAZ LTX', text, flags=re.IGNORECASE)
        if not re.search(r'\b25K\b', text, re.IGNORECASE):
            text = re.sub(r'^RAZ LTX\b', 'RAZ LTX 25K', text, flags=re.IGNORECASE)
    if re.search(r'^(?:GEEKBAR|GEEK\s?BAR)\s*X\s*(?:25|25K)\b', text, re.IGNORECASE):
        text = re.sub(r'^(?:GEEKBAR|GEEK\s?BAR)\s*X\s*(?:25|25K)\b', 'GEEKBAR X 25K', text, flags=re.IGNORECASE)
    elif re.search(r'^(?:GEEKBAR|GEEK\s?BAR)\b', text, re.IGNORECASE):
        if not re.search(r'\b\d+(?:\.\d+)?K\b', text, re.IGNORECASE):
            text = re.sub(r'^(?:GEEKBAR|GEEK\s?BAR)\b', 'GEEKBAR 15K', text, flags=re.IGNORECASE)
        else:
            text = re.sub(r'^(?:GEEKBAR|GEEK\s?BAR)\b', 'GEEKBAR', text, flags=re.IGNORECASE)
    if re.search(r'^FUME\s*PRO\b', text, re.IGNORECASE):
        text = re.sub(r'^FUME\s*PRO\b', 'FUME PRO', text, flags=re.IGNORECASE)
        if not re.search(r'\b30K\b', text, re.IGNORECASE):
            text = re.sub(r'^FUME PRO\b', 'FUME PRO 30K', text, flags=re.IGNORECASE)
    if re.search(r'^FUME\s*EXTRA\b', text, re.IGNORECASE):
        text = re.sub(r'^FUME\s*EXTRA\b', 'FUME EXTRA', text, flags=re.IGNORECASE)
    if re.search(r'^FUME\s*ULTRA\b', text, re.IGNORECASE):
        text = re.sub(r'^FUME\s*ULTRA\b', 'FUME ULTRA', text, flags=re.IGNORECASE)
    if re.search(r'^FUME\s*INFINITY\b', text, re.IGNORECASE):
        text = re.sub(r'^FUME\s*INFINITY\b', 'FUME INFINITY', text, flags=re.IGNORECASE)
    if re.search(r'^LOST\s*MARY\s*PRO\b', text, re.IGNORECASE):
        text = re.sub(r'^LOST\s*MARY\s*PRO\b', 'LOST MARY PRO', text, flags=re.IGNORECASE)
    if re.search(r'^LOST\s*MARY\s*(?:TUBRO|TURBO)\b', text, re.IGNORECASE):
        text = re.sub(r'^LOST\s*MARY\s*(?:TUBRO|TURBO)\b', 'LOST MARY TURBO', text, flags=re.IGNORECASE)
        if not re.search(r'\b35K\b', text, re.IGNORECASE):
            text = re.sub(r'^LOST MARY TURBO\b', 'LOST MARY TURBO 35K', text, flags=re.IGNORECASE)
    if re.search(r'^BB\s*CART\b', text, re.IGNORECASE):
        text = re.sub(r'^BB\s*CART\b', 'BB CART', text, flags=re.IGNORECASE)
        if re.search(r'\b1G\b', text, re.IGNORECASE):
            text = re.sub(r'\b1G\b', '1GR', text, flags=re.IGNORECASE)
        if not re.search(r'\b1GR\b', text, re.IGNORECASE):
            text = re.sub(r'^BB CART\b', 'BB CART 1GR', text, flags=re.IGNORECASE)
    text = ' '.join(text.split())
    return text


def clean_upc(upc_raw, max_len=20):
    s = as_str(upc_raw)
    if "," in s:
        s = s.split(",", 1)[0]
    digits = "".join(ch for ch in s if ch.isdigit())
    return safe_len(digits, max_len)


def slugify(value):
    value = re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')
    return value or 'category'


def load_category_cache(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id, name, slug, parent_id FROM categories")
    rows = cur.fetchall()
    cur.close()
    cache = {"by_name": {}, "by_slug": {}}
    for row in rows:
        key = row["name"].upper()
        cache["by_name"][key] = {"id": row["id"], "slug": row["slug"], "parent_id": row["parent_id"]}
        if row["slug"]:
            cache["by_slug"][row["slug"]] = row["id"]
    return cache


def ensure_category(cur, cache, name, slug_value=None, parent_id=None):
    key = name.upper()
    existing = cache["by_name"].get(key)
    if existing:
        if existing["parent_id"] != parent_id:
            cur.execute("UPDATE categories SET parent_id = %s WHERE id = %s", (parent_id, existing["id"]))
            existing["parent_id"] = parent_id
        return existing["id"]
    slug_candidate = slug_value or slugify(name)
    base = slug_candidate or 'category'
    suffix = 1
    while slug_candidate in cache["by_slug"]:
        slug_candidate = f"{base}-{suffix}"
        suffix += 1
    cur.execute("INSERT INTO categories (name, slug, parent_id) VALUES (%s, %s, %s)", (name, slug_candidate, parent_id))
    new_id = cur.lastrowid
    cache["by_name"][key] = {"id": new_id, "slug": slug_candidate, "parent_id": parent_id}
    cache["by_slug"][slug_candidate] = new_id
    return new_id


def ensure_parent_categories(cur, cache):
    parent_ids = {}
    for name, slug_value in PARENT_CATEGORIES.items():
        parent_ids[name] = ensure_category(cur, cache, name, slug_value, None)
    return parent_ids


def infer_subcategory(name, parent_name):
    upper_name = name.upper()
    for rule in SUBCATEGORY_RULES:
        if rule["parent"] != parent_name:
            continue
        if all(token in upper_name for token in rule["tokens"]):
            return rule
    return None


def get_store_id(cur, store_name):
    cur.execute("SELECT id FROM stores WHERE name = %s LIMIT 1", (store_name,))
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Store '{store_name}' not found. Initialize stores before loading data.")
    return row[0]


def prune_missing_inventory(cur, store_id, current_product_ids):
    cur.execute("SELECT product_id FROM product_inventory WHERE store_id = %s", (store_id,))
    existing = {row[0] for row in cur.fetchall()}
    missing = existing - current_product_ids
    if not missing:
        return 0
    deleted = 0
    missing_list = list(missing)
    batch_size = 500
    for i in range(0, len(missing_list), batch_size):
        chunk = missing_list[i:i + batch_size]
        placeholders = ",".join(["%s"] * len(chunk))
        cur.execute(
            f"DELETE FROM product_inventory WHERE store_id = %s AND product_id IN ({placeholders})",
            (store_id, *chunk)
        )
        deleted += cur.rowcount or 0
    return deleted


def upsert_product(cur, payload):
    cur.execute(PRODUCT_SQL, payload)
    product_id = cur.lastrowid
    if not product_id:
        cur.execute("SELECT id FROM products WHERE name = %s LIMIT 1", (payload[0],))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Unable to resolve product id for {payload[0]}")
        product_id = row[0]
    return product_id


def upsert_inventory(cur, product_id, store_id, qty, price):
    cur.execute(INVENTORY_SQL, (product_id, store_id, qty, price))


def load_csv_to_db(csv_path, supplier_label=None, location=None):
    supplier_label = supplier_label or os.getenv("SUPPLIER", "CigarPOS")
    location = location or os.getenv("LOCATION", "Calle 8")
    df = pd.read_csv(csv_path, dtype=str).fillna("")
    for col in ["Name", "StockCode", "UPC", "QtyOnHand", "UnitPrice", "Category"]:
        if col not in df.columns:
            df[col] = ""
    df["Name"] = df["Name"].apply(lambda s: safe_len(apply_brand_specific_rules(normalize_product_name_spacing(s)).upper() if s else '', 200))
    df["StockCode"] = df["StockCode"].apply(lambda s: safe_len(s, 64))
    df["UPC"] = df["UPC"].apply(clean_upc)
    df["QtyOnHand"] = df["QtyOnHand"].apply(clamp_int)
    df["UnitPrice"] = df["UnitPrice"].apply(clamp_price)
    df["Category"] = df["Category"].apply(as_str)
    df = df[df["Name"].str.len() > 0].copy()
    rows = len(df)
    if rows == 0:
        print("No rows to load.")
        return
    supplier_value = safe_len(supplier_label, 120)
    store_label = safe_len(location, 100)
    conn = get_conn()
    cur = conn.cursor()
    try:
        host = os.getenv("DB_HOST") or os.getenv("MYSQLHOST") or "127.0.0.1"
        print(f"📦 Connected to database ({host})...")
        store_id = get_store_id(cur, store_label)
        cache = load_category_cache(conn)
        print("  Ensuring categories...")
        parent_ids = ensure_parent_categories(cur, cache)
        conn.commit()
        print("  Loading products...")
        current_product_ids = set()
        processed = 0
        for _, record in df.iterrows():
            parent_name = as_str(record["Category"]).upper()
            if parent_name not in parent_ids:
                continue
            parent_id = parent_ids[parent_name]
            sub_rule = infer_subcategory(record["Name"], parent_name)
            if sub_rule:
                category_id = ensure_category(cur, cache, sub_rule["name"], sub_rule["slug"], parent_id)
            else:
                category_id = parent_id
            product_id = upsert_product(
                cur,
                (
                    as_str(record["Name"]),
                    as_str(record["UPC"]),
                    as_str(record["StockCode"]),
                    clamp_price(record["UnitPrice"]),
                    int(category_id),
                    supplier_value,
                )
            )
            current_product_ids.add(product_id)
            upsert_inventory(cur, product_id, store_id, clamp_int(record["QtyOnHand"]), clamp_price(record["UnitPrice"]))
            processed += 1
            if processed % 100 == 0:
                print(f"    Processed {processed}/{rows}")
        removed = prune_missing_inventory(cur, store_id, current_product_ids)
        if removed:
            print(f"  🧹 Removed {removed} inventory rows for {store_label}.")
        else:
            print("  🧹 No obsolete inventory to prune.")
        conn.commit()
        print(f"✅ Upserted {processed} inventory rows for {store_label}.")
    except mysql.connector.Error as e:
        conn.rollback()
        if e.errno == errorcode.ER_NO_SUCH_TABLE:
            print("Error: Required tables do not exist.")
        elif e.errno == errorcode.ER_BAD_FIELD_ERROR:
            print("Error: Column mismatch between CSV and database schema.")
        else:
            print("MySQL Error:", e)
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    csv = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "downloads", "inventory_clean.csv")
    location = sys.argv[2] if len(sys.argv) > 2 else "Calle 8"
    load_csv_to_db(csv, location=location)
