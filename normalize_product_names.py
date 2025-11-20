#!/usr/bin/env python3
"""
Normalize all existing product names in the database to UPPERCASE.
This ensures that variant grouping works correctly regardless of original case.
"""

import os
import sys
import mysql.connector
from mysql.connector import errorcode
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote

# Load environment variables from .env file
load_dotenv()

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

def normalize_product_names():
    """Normalize all product names to UPPERCASE."""
    conn = get_conn()
    cur = conn.cursor()
    
    try:
        host = os.getenv("DB_HOST") or os.getenv("MYSQLHOST") or "127.0.0.1"
        print(f"📦 Connected to database ({host})...")
        
        # First, get count of products with lowercase letters
        cur.execute("SELECT COUNT(*) as count FROM products WHERE name != UPPER(name)")
        rows = cur.fetchall()
        count = rows[0][0] if rows else 0
        
        if count == 0:
            print("✅ All product names are already normalized (uppercase)!")
            return
        
        print(f"🔄 Found {count} products with mixed/lowercase names...")
        print(f"   Normalizing to UPPERCASE...")
        
        # Update all product names to uppercase
        cur.execute("UPDATE products SET name = UPPER(name)")
        conn.commit()
        
        print(f"✅ Successfully normalized {cur.rowcount} product names!")
        
    except mysql.connector.Error as e:
        conn.rollback()
        print(f"❌ MySQL Error: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    normalize_product_names()