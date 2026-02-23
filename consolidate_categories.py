#!/usr/bin/env python3
"""
Consolidate rolling papers/cones categories into a single "ROLLING PAPERS AND CONES" record.
This script:
1. Finds all old category records (PAPERS, CONES, ROLLING PAPERS, etc.)
2. Updates all products using old categories to use "ROLLING PAPERS AND CONES"
3. Deletes the old category records
"""
import os
import mysql.connector
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote

load_dotenv()

OLD_CATEGORY_NAMES = [
    'ROLLING PAPERS & CONES',
    'ROLLING PAPERS',
    'ROLLING PAPER,CONES, TIPS AND WRAPS',
    'ROLLING PAPER/CONES/WRAPS',
    'PAPERS',
    'PAPERS/CONES',
    'CONES',
    'CONES TIPS AND WRAPS',
    'RAW'
]

CANONICAL_NAME = 'ROLLING PAPERS AND CONES'


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


def consolidate_categories():
    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    
    try:
        # 1. Get or create the canonical category
        cur.execute(
            "SELECT id FROM categories WHERE UPPER(name) = %s LIMIT 1",
            (CANONICAL_NAME.upper(),)
        )
        canonical_result = cur.fetchone()
        
        if canonical_result:
            canonical_id = canonical_result['id']
            print(f"✅ Found canonical category '{CANONICAL_NAME}' (ID: {canonical_id})")
        else:
            # Check if slug already exists
            cur.execute(
                "SELECT id, name FROM categories WHERE slug = %s LIMIT 1",
                ("rolling-papers-cones",)
            )
            slug_result = cur.fetchone()
            
            if slug_result:
                canonical_id = slug_result['id']
                old_name = slug_result['name']
                print(f"📝 Found existing category with slug 'rolling-papers-cones': '{old_name}'")
                print(f"   Renaming to '{CANONICAL_NAME}'...")
                cur.execute(
                    "UPDATE categories SET name = %s WHERE id = %s",
                    (CANONICAL_NAME, canonical_id)
                )
                conn.commit()
                print(f"✅ Renamed to '{CANONICAL_NAME}' (ID: {canonical_id})")
            else:
                print(f"📝 Creating canonical category '{CANONICAL_NAME}'...")
                cur.execute(
                    "INSERT INTO categories (name, slug, parent_id) VALUES (%s, %s, %s)",
                    (CANONICAL_NAME, "rolling-papers-cones", None)
                )
                canonical_id = cur.lastrowid
                conn.commit()
                print(f"✅ Created canonical category '{CANONICAL_NAME}' (ID: {canonical_id})")
        
        # 2. Find all old category IDs
        old_category_ids = []
        for old_name in OLD_CATEGORY_NAMES:
            cur.execute(
                "SELECT id FROM categories WHERE UPPER(name) = %s",
                (old_name.upper(),)
            )
            result = cur.fetchone()
            if result:
                old_id = result['id']
                if old_id != canonical_id:
                    old_category_ids.append({'name': old_name, 'id': old_id})
                    print(f"  Found old category: {old_name} (ID: {old_id})")
        
        if not old_category_ids:
            print("✅ No old categories to consolidate!")
            return
        
        print(f"\nConsolidating {len(old_category_ids)} old categories...")
        
        # 3. Update products with old category IDs to use canonical ID
        total_updated = 0
        for old_cat in old_category_ids:
            cur.execute(
                "UPDATE products SET category_id = %s WHERE category_id = %s",
                (canonical_id, old_cat['id'])
            )
            updated = cur.rowcount or 0
            total_updated += updated
            print(f"  ✓ Updated {updated} products from '{old_cat['name']}' to '{CANONICAL_NAME}'")
        
        # 4. Delete old category records
        for old_cat in old_category_ids:
            cur.execute("DELETE FROM categories WHERE id = %s", (old_cat['id'],))
            print(f"  ✓ Deleted category '{old_cat['name']}' (ID: {old_cat['id']})")
        
        # Commit changes
        conn.commit()
        print(f"\n✅ Consolidation complete! Updated {total_updated} products.")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error during consolidation: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    consolidate_categories()
