import os
import re
import math
import pandas as pd
import mysql.connector
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote

load_dotenv()

STORE_MAPPING = {
    "CALLE8": "Calle 8",
    "79TH": "79th Street",
    "MKT": "Market"
}

INVENTORY_CSV_PATHS = {
    "Calle 8": "downloads/calle8/inventory_calle8_clean.csv",
    "79th Street": "downloads/79th/inventory_79th_clean.csv",
    "Market": "downloads/mkt/inventory_mkt_clean.csv"
}


def get_db_connection():
    """Create and return a MySQL database connection."""
    mysql_url = os.getenv("MYSQL_PUBLIC_URL")
    if mysql_url:
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


def parse_mysql_url(url):
    """Parse MySQL connection URL."""
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


def as_str(x):
    """Convert value to string safely."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    return str(x).strip()


def normalize_product_name(name):
    """Normalize product name using brand-specific rules."""
    text = as_str(name)
    if not text:
        return text
    
    text = text.upper()
    
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
        if re.search(pattern, text, re.IGNORECASE):
            text = re.sub(pattern, ' ' + new_pattern + ' ', text, flags=re.IGNORECASE)
    
    text = ' '.join(text.split())
    return text


def get_store_id(store_name):
    """Get store ID from database by store name."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM stores WHERE name = %s LIMIT 1", (store_name,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Store '{store_name}' not found in database.")
        return row[0]
    finally:
        cur.close()
        conn.close()


def get_inventory_csv(store_name):
    """
    Load inventory CSV for a store.
    
    Args:
        store_name: "Calle 8", "79th Street", or "Market"
    
    Returns:
        pandas DataFrame with columns: Name, StockCode, UPC, QtyOnHand, UnitPrice, Category
    """
    if store_name not in INVENTORY_CSV_PATHS:
        raise ValueError(f"Unknown store: {store_name}")
    
    csv_path = os.path.join(os.path.dirname(__file__), INVENTORY_CSV_PATHS[store_name])
    
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Inventory CSV not found: {csv_path}")
    
    df = pd.read_csv(csv_path, dtype=str).fillna("")
    return df


def search_products(store_name, search_term, exact_match=False):
    """
    Search for products in a store's inventory.
    
    Args:
        store_name: "Calle 8", "79th Street", or "Market"
        search_term: Product name or partial name to search
        exact_match: If True, only exact matches; if False, partial matches
    
    Returns:
        List of matching product dictionaries with keys: Name, StockCode, UPC, QtyOnHand, UnitPrice
    """
    df = get_inventory_csv(store_name)
    
    search_upper = search_term.upper().strip()
    
    if exact_match:
        mask = df["Name"].str.upper() == search_upper
    else:
        mask = df["Name"].str.upper().str.contains(search_upper, regex=False, na=False)
    
    matches = df[mask].to_dict('records')
    return matches


def get_db_products_by_store(store_name):
    """
    Get all products in a store's inventory from database.
    
    Args:
        store_name: "Calle 8", "79th Street", or "Market"
    
    Returns:
        List of product dictionaries with keys: id, name, upc, stockcode, unit_price
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        store_id = get_store_id(store_name)
        cur.execute("""
            SELECT p.id, p.name, p.upc, p.stockcode, p.unit_price
            FROM products p
            JOIN product_inventory pi ON pi.product_id = p.id
            WHERE pi.store_id = %s
            ORDER BY p.name
        """, (store_id,))
        products = cur.fetchall()
        return products
    finally:
        cur.close()
        conn.close()


def get_product_by_name(product_name):
    """
    Get a product from database by exact name match.
    
    Args:
        product_name: Product name to search
    
    Returns:
        Product dictionary or None if not found
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, name, upc, stockcode, unit_price FROM products WHERE UPPER(name) = UPPER(%s) LIMIT 1", (product_name,))
        product = cur.fetchone()
        return product
    finally:
        cur.close()
        conn.close()


def insert_product(name, upc, stockcode, unit_price, category_id):
    """
    Insert a new product into database.
    
    Args:
        name: Product name
        upc: Product UPC
        stockcode: Stock code
        unit_price: Unit price
        category_id: Category ID
    
    Returns:
        Product ID of inserted product
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO products (name, upc, stockcode, unit_price, category_id, supplier)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
        """, (name, upc, stockcode, unit_price, category_id, "Manual Entry"))
        product_id = cur.lastrowid
        conn.commit()
        return product_id
    finally:
        cur.close()
        conn.close()


def insert_inventory(product_id, store_name, quantity, unit_price):
    """
    Insert or update inventory for a product at a store.
    
    Args:
        product_id: Product ID
        store_name: Store name
        quantity: Quantity on hand
        unit_price: Unit price
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        store_id = get_store_id(store_name)
        cur.execute("""
            INSERT INTO product_inventory (product_id, store_id, quantity_on_hand, unit_price)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                quantity_on_hand = VALUES(quantity_on_hand),
                unit_price = VALUES(unit_price),
                last_synced_at = CURRENT_TIMESTAMP
        """, (product_id, store_id, quantity, unit_price))
        conn.commit()
    finally:
        cur.close()
        conn.close()


def get_category_id_by_name(category_name):
    """Get category ID by exact name match."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM categories WHERE UPPER(name) = UPPER(%s) LIMIT 1", (category_name,))
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        cur.close()
        conn.close()
