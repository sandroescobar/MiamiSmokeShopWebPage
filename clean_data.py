# db_loader.py
import os
import sys
import re
import math
import pandas as pd
import mysql.connector
from mysql.connector import errorcode
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote

# Load environment variables from .env file
load_dotenv()

# ── Parse MYSQL_PUBLIC_URL if available (Railway format) ─────────────────
def parse_mysql_url(url):
    """Parse mysql://user:pass@host:port/db URL format (like Railway provides)."""
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

# ── DB connection from env ─────────────────────────────────────────────
# Uses same env vars as index.js: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
# Also supports MYSQL_PUBLIC_URL (Railway) and SSL configuration
def get_conn():
    # Try MYSQL_PUBLIC_URL first (Railway format)
    mysql_url = os.getenv("MYSQL_PUBLIC_URL")
    if mysql_url:
        print(f"🔍 DEBUG: Using MYSQL_PUBLIC_URL")
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
        # Fall back to individual env vars
        cfg = {
            "host": os.getenv("DB_HOST") or os.getenv("MYSQLHOST") or "127.0.0.1",
            "port": int(os.getenv("DB_PORT") or os.getenv("MYSQLPORT") or 3306),
            "user": os.getenv("DB_USER") or os.getenv("MYSQLUSER") or "root",
            "password": os.getenv("DB_PASSWORD") or os.getenv("MYSQLPASSWORD") or "",
            "database": os.getenv("DB_NAME") or os.getenv("MYSQLDATABASE") or "miami_vape_shops",
            "autocommit": False,
            "connection_timeout": 10,
        }
    
    # Handle SSL configuration (like index.js does)
    ssl_mode = str(os.getenv("DB_SSL", "")).lower()
    if ssl_mode in ("skip-verify", "true", "require"):
        if ssl_mode == "skip-verify":
            cfg["ssl_disabled"] = False  # Enable SSL but don't verify cert
            cfg["ssl_verify_cert"] = False
            cfg["ssl_verify_identity"] = False
        else:
            cfg["ssl_disabled"] = False  # Enable SSL with verification
    
    return mysql.connector.connect(**cfg)

# ── Helpers ────────────────────────────────────────────────────────────
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
        # keep 2 decimals
        return round(float(str(x).replace("$","").replace(",","")), 2)
    except Exception:
        return 0.00

def safe_len(s: str, max_len: int):
    s = as_str(s)
    return s[:max_len] if len(s) > max_len else s

def normalize_product_name_spacing(name: str) -> str:
    """
    Normalize product names by fixing common spacing inconsistencies.
    Examples:
      "GEEK BAR X 25K" → "GEEKBAR X 25K"
      "FUME PRO 25K" → "FUMEPRO 25K"
    
    Rules: Brand names that should be one word are consolidated.
    """
    if not name:
        return name
    
    name = str(name).strip()
    
    # Known brand consolidation rules: "WORD WORD" → "WORDWORD"
    # Add more as you find them
    brand_consolidations = {
        "GEEK BAR": "GEEKBAR",
        "FUME PRO": "FUMEPRO",
        "LOST MARY": "LOSTMARY",
        "ELF BAR": "ELFBAR",
        "BREEZE PRO": "BREEZEPRO",
        "PUFF BAR": "PUFFBAR",
        "BANG KING": "BANGKING",
        # Add more problematic brand pairs here as needed
    }
    
    # Apply consolidations (case-insensitive matching)
    for old_pattern, new_pattern in brand_consolidations.items():
        # Match at word boundaries (start of string or after space, before space or end)
        pattern = r'(?:^|\s)' + re.escape(old_pattern) + r'(?:\s|$)'
        if re.search(pattern, name, re.IGNORECASE):
            name = re.sub(pattern, ' ' + new_pattern + ' ', name, flags=re.IGNORECASE)
    
    # Clean up extra spaces
    name = ' '.join(name.split())
    
    return name

def clean_upc(upc_raw: str, max_len=20):
    s = as_str(upc_raw)
    # keep only digits; take first piece if comma separated
    if "," in s:
        s = s.split(",", 1)[0]
    digits = "".join(ch for ch in s if ch.isdigit())
    return safe_len(digits, max_len)

# ── Ensure categories exist and return {name_upper -> id} map ──────────
def get_or_create_categories(cur, cat_names):
    # Normalize input set
    wanted = {as_str(c).strip(): None for c in cat_names if as_str(c).strip()}
    if not wanted:
        return {}

    # Fetch existing
    placeholders = ", ".join(["%s"] * len(wanted))
    cur.execute(f"SELECT id, name FROM categories WHERE name IN ({placeholders})", list(wanted.keys()))
    for cid, name in cur.fetchall():
        wanted[name] = cid

    # Insert missing
    for name, cid in list(wanted.items()):
        if cid is None:
            cur.execute("INSERT INTO categories (name) VALUES (%s)", (name,))
            wanted[name] = cur.lastrowid

    # Return uppercase map for easy lookups
    return {k.upper(): v for k, v in wanted.items()}

# ── Upsert products in batch (unique key on products.name) ─────────────
UPSERT_SQL = """
INSERT INTO products
  (name, upc, stockcode, quantity_on_hand, unit_price, category_id, supplier, location)
VALUES
  (%s,   %s,  %s,        %s,               %s,         %s,           %s,       %s)
ON DUPLICATE KEY UPDATE
  upc = VALUES(upc),
  stockcode = VALUES(stockcode),
  quantity_on_hand = VALUES(quantity_on_hand),
  unit_price = VALUES(unit_price),
  category_id = VALUES(category_id),
  supplier = VALUES(supplier),
  location = VALUES(location);
"""

def ensure_location_column(cur):
    """Ensure the location column exists in products table."""
    try:
        cur.execute("ALTER TABLE products ADD COLUMN location VARCHAR(100) DEFAULT 'Calle 8' AFTER supplier")
        print("  ✅ Added 'location' column to products table")
    except Exception as e:
        # Column might already exist, that's fine
        if "Duplicate column" not in str(e) and "already exists" not in str(e):
            print(f"  ⚠️  Warning adding location column: {e}")

def load_csv_to_db(csv_path: str, supplier_label: str = None, location: str = None):
    supplier_label = supplier_label or os.getenv("SUPPLIER", "CigarPOS")
    location = location or os.getenv("LOCATION", "Calle 8")

    df = pd.read_csv(csv_path, dtype=str).fillna("")
    # Expecting columns from your cleaner: Name, StockCode, UPC, QtyOnHand, UnitPrice, Category
    # If any are missing, create empties to avoid KeyErrors.
    for col in ["Name", "StockCode", "UPC", "QtyOnHand", "UnitPrice", "Category"]:
        if col not in df.columns:
            df[col] = ""

    # Pre-clean frame to match schema constraints
    # First normalize spacing issues (e.g., "GEEK BAR" → "GEEKBAR"), then uppercase
    df["Name"]       = df["Name"].apply(lambda s: safe_len(normalize_product_name_spacing(s).upper() if s else '', 200))
    df["StockCode"]  = df["StockCode"].apply(lambda s: safe_len(s, 64))
    df["UPC"]        = df["UPC"].apply(clean_upc)  # trims to varchar(20)
    df["QtyOnHand"]  = df["QtyOnHand"].apply(clamp_int)
    df["UnitPrice"]  = df["UnitPrice"].apply(clamp_price)
    df["Category"]   = df["Category"].apply(as_str)

    # Remove empty names (cannot insert without the unique key)
    df = df[df["Name"].str.len() > 0].copy()
    rows = len(df)

    if rows == 0:
        print("No rows to load.")
        return

    conn = get_conn()
    cur = conn.cursor()

    try:
        host = os.getenv("DB_HOST") or os.getenv("MYSQLHOST") or "127.0.0.1"
        print(f"📦 Connected to database ({host})...")
        
        # 0) Ensure location column exists
        print(f"  Checking database schema...")
        ensure_location_column(cur)
        conn.commit()  # Commit the schema change if it happened
        
        # 1) Ensure categories exist
        cats = sorted({c for c in df["Category"].tolist() if c})
        print(f"  Found {len(cats)} unique categories, ensuring they exist...")
        cat_map = get_or_create_categories(cur, cats)

        # 2) Build batches for executemany
        payload = []
        for _, r in df.iterrows():
            cat_id = cat_map.get(as_str(r["Category"]).upper())
            if not cat_id:
                # fallback: create on the fly (should be rare)
                cur.execute("INSERT INTO categories (name) VALUES (%s)", (as_str(r["Category"]),))
                cat_id = cur.lastrowid
                cat_map[as_str(r["Category"]).upper()] = cat_id

            payload.append((
                as_str(r["Name"]),
                as_str(r["UPC"]),
                as_str(r["StockCode"]),
                clamp_int(r["QtyOnHand"]),
                clamp_price(r["UnitPrice"]),
                int(cat_id),
                safe_len(supplier_label, 120),
                safe_len(location, 100),
            ))

        # 3) Upsert in batches (improves performance and shows progress)
        batch_size = 100
        for i in range(0, len(payload), batch_size):
            batch = payload[i:i+batch_size]
            print(f"  Upserting batch {i//batch_size + 1}... ({i + len(batch)}/{len(payload)})")
            cur.executemany(UPSERT_SQL, batch)
        
        conn.commit()
        print(f"✅ Upserted {len(payload)} products into 'products'.")

    except mysql.connector.Error as e:
        conn.rollback()
        if e.errno == errorcode.ER_NO_SUCH_TABLE:
            print("Error: One of the tables does not exist. Check that 'products' and 'categories' are created.")
        elif e.errno == errorcode.ER_BAD_FIELD_ERROR:
            print("Error: Column mismatch. Confirm your table columns: name, upc, stockcode, quantity_on_hand, unit_price, category_id, supplier.")
        else:
            print("MySQL Error:", e)
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    # Usage:
    #   python clean_data.py downloads/inventory_clean.csv
    #   python clean_data.py downloads/inventory_clean.csv "Calle 8"
    #   python clean_data.py downloads/inventory_clean.csv "79th Street"
    csv = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "downloads", "inventory_clean.csv")
    location = sys.argv[2] if len(sys.argv) > 2 else "Calle 8"
    load_csv_to_db(csv, location=location)
