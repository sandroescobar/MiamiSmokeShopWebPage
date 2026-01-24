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

def cleanup_raz9k_zero_nic_images():
    conn = get_conn()
    cur = conn.cursor()

    try:
        # Find product IDs for RAZ 9K ZERO NIC variants
        query = """
            DELETE pi FROM product_images pi
            JOIN products p ON pi.product_id = p.id
            WHERE (p.name LIKE '%RAZ 9K%') 
            AND (p.name LIKE '%ZERO NIC%' OR p.name LIKE '%ZERO NICOTINE%')
        """
        cur.execute(query)
        print(f"✅ Removed {cur.rowcount} image mappings for RAZ 9K ZERO NIC variants.")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    cleanup_raz9k_zero_nic_images()
