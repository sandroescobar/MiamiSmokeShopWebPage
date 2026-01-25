import os
import mysql.connector
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote

load_dotenv()

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
        cfg = {
            "host": url_cfg["host"],
            "port": url_cfg.get("port", 3306),
            "user": url_cfg["user"],
            "password": url_cfg["password"],
            "database": url_cfg["database"],
            "autocommit": True,
        }
    else:
        cfg = {
            "host": os.getenv("DB_HOST") or "127.0.0.1",
            "port": int(os.getenv("DB_PORT") or 3306),
            "user": os.getenv("DB_USER") or "root",
            "password": os.getenv("DB_PASSWORD") or "",
            "database": os.getenv("DB_NAME") or "miami_vape_shops",
            "autocommit": True,
        }
    return mysql.connector.connect(**cfg)

def remove_typo():
    conn = get_conn()
    cur = conn.cursor()
    
    target_name = "RAZ 9K ORANGE RASPBERRY"
    
    print(f"🚀 Starting removal of typo '{target_name}'...")
    
    try:
        # 1. Find product ID
        cur.execute("SELECT id FROM products WHERE name = %s", (target_name,))
        product = cur.fetchone()
        
        if not product:
            print("❌ No product found with exact name.")
        else:
            product_id = product[0]
            
            # 2. Delete from product_inventory
            cur.execute("DELETE FROM product_inventory WHERE product_id = %s", (product_id,))
            print(f"✅ Removed from product_inventory ({cur.rowcount} rows).")
            
            # 3. Delete from product_images
            cur.execute("DELETE FROM product_images WHERE product_id = %s", (product_id,))
            print(f"✅ Removed from product_images ({cur.rowcount} rows).")
            
            # 4. Delete from products
            cur.execute("DELETE FROM products WHERE id = %s", (product_id,))
            print(f"✅ Removed from products ({cur.rowcount} rows).")
            
        # 5. Delete from snapshot tables (by name)
        for table in ["inventory_calle8", "inventory_79th"]:
            cur.execute(f"DELETE FROM `{table}` WHERE name = %s", (target_name,))
            print(f"✅ Removed from {table} ({cur.rowcount} rows).")
            
        print("🎉 Cleanup completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    remove_typo()
