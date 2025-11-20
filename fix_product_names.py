#!/usr/bin/env python3
"""
Fix existing product name inconsistencies in the database.
Applies the same normalization rules as clean_data.py.
This consolidates brand names like "GEEK BAR" → "GEEKBAR"
"""

import os
import sys
import re
import mysql.connector
from mysql.connector import errorcode
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote

load_dotenv()

def parse_mysql_url(url):
    """Parse mysql://user:pass@host:port/db URL format."""
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
        print(f"🔍 Using MYSQL_PUBLIC_URL")
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
    
    return mysql.connector.connect(**cfg)

# Same consolidation rules as in clean_data.py
BRAND_CONSOLIDATIONS = {
    "GEEK BAR": "GEEKBAR",
    "FUME PRO": "FUMEPRO",
    "LOST MARY": "LOSTMARY",
    "ELF BAR": "ELFBAR",
    "BREEZE PRO": "BREEZEPRO",
    "PUFF BAR": "PUFFBAR",
    "BANG KING": "BANGKING",
}

def fix_product_names():
    """Fix product names in the database by consolidating brand names."""
    conn = get_conn()
    cur = conn.cursor()
    
    try:
        host = os.getenv("DB_HOST") or os.getenv("MYSQLHOST") or "127.0.0.1"
        print(f"📦 Connected to database ({host})...")
        
        total_updates = 0
        
        for old_brand, new_brand in BRAND_CONSOLIDATIONS.items():
            # Find products with the inconsistent spacing
            pattern = f"%{old_brand}%"
            cur.execute("SELECT id, name FROM products WHERE name LIKE %s", (pattern,))
            rows = cur.fetchall()
            
            if not rows:
                print(f"  ℹ️  No products found with '{old_brand}'")
                continue
            
            print(f"  🔍 Found {len(rows)} products with '{old_brand}'")
            
            # Fix each product name
            for product_id, old_name in rows:
                # Apply the same fix: replace "OLD BRAND" with "NEWBRAND"
                regex_pattern = r'(?:^|\s)' + re.escape(old_brand) + r'(?:\s|$)'
                new_name = re.sub(regex_pattern, ' ' + new_brand + ' ', old_name, flags=re.IGNORECASE)
                # Clean extra spaces
                new_name = ' '.join(new_name.split())
                
                if new_name != old_name:
                    print(f"    ✏️  '{old_name}' → '{new_name}'")
                    cur.execute("UPDATE products SET name = %s WHERE id = %s", (new_name, product_id))
                    total_updates += 1
        
        conn.commit()
        print(f"\n✅ Successfully updated {total_updates} product names!")
        
    except mysql.connector.Error as e:
        conn.rollback()
        print(f"❌ MySQL Error: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    fix_product_names()