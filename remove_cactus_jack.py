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

def remove_cactus_jack():
    conn = get_conn()
    cur = conn.cursor()
    
    target_name = "RAZ 9K CACTUS JACK"
    
    print(f"🚀 Starting removal of '{target_name}'...")
    
    try:
        # 1. Find product ID
        cur.execute("SELECT id FROM products WHERE name LIKE %s", (f"%{target_name}%",))
        products = cur.fetchall()
        
        if not products:
            print("❌ No products found matching the name.")
        else:
            product_ids = [p[0] for p in products]
            placeholders = ",".join(["%s"] * len(product_ids))
            
            # 2. Delete from product_inventory
            cur.execute(f"DELETE FROM product_inventory WHERE product_id IN ({placeholders})", tuple(product_ids))
            print(f"✅ Removed from product_inventory ({cur.rowcount} rows).")
            
            # 3. Delete from product_images (if any)
            cur.execute(f"DELETE FROM product_images WHERE product_id IN ({placeholders})", tuple(product_ids))
            print(f"✅ Removed from product_images ({cur.rowcount} rows).")
            
            # 4. Delete from products
            cur.execute(f"DELETE FROM products WHERE id IN ({placeholders})", tuple(product_ids))
            print(f"✅ Removed from products ({cur.rowcount} rows).")
            
        # 5. Delete from snapshot tables (by name)
        for table in ["inventory_calle8", "inventory_79th"]:
            cur.execute(f"DELETE FROM `{table}` WHERE name LIKE %s", (f"%{target_name}%",))
            print(f"✅ Removed from {table} ({cur.rowcount} rows).")
            
        print("🎉 Cleanup completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    remove_cactus_jack()
