import os
import mysql.connector
from dotenv import load_dotenv
from urllib.parse import urlparse, unquote
import re

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

def normalize(s):
    return re.sub(r'[^A-Z0-9]', '', s.upper())

def sync_images():
    img_dir = "public/images/imagesForProducts/RAZ 9K"
    if not os.path.exists(img_dir):
        print(f"❌ Directory not found: {img_dir}")
        return

    images = os.listdir(img_dir)
    img_map = {}
    for img in images:
        if img.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            name_part = os.path.splitext(img)[0]
            norm_name = normalize(name_part)
            img_map[norm_name] = img

    conn = get_conn()
    cur = conn.cursor(dictionary=True)

    try:
        cur.execute("SELECT id, name FROM products WHERE name LIKE '%RAZ 9K%'")
        products = cur.fetchall()

        count = 0
        for p in products:
            p_id = p['id']
            p_name = p['name'].upper()
            
            # Skip ZERO NIC variants - they will have their own images
            if 'ZERO NIC' in p_name or 'ZERO NICOTINE' in p_name:
                print(f"⏩ Skipping ZERO NIC variant: {p['name']}")
                continue
            
            # Extract flavor part
            flavor = p_name.replace('RAZ 9K', '').strip()
            norm_flavor = normalize(flavor)
            
            # Special case for variants with slight name differences
            if "BLUERAZZ" in norm_flavor:
                norm_flavor = norm_flavor.replace("BLUERAZZ", "BLUERAZ")
            if norm_flavor == "BLUERAZBPOP":
                norm_flavor = "BLUERAZBPOP"
            if norm_flavor == "BLUERAZ":
                norm_flavor = "BLUERAZICE" # Fallback for plain "Blue Razz"
            if norm_flavor == "MANGOCOLADA" and "MANGICOLADA" in img_map:
                norm_flavor = "MANGICOLADA"
            if norm_flavor == "DAYCRAWLER" and "DAYCRAWLER" in img_map:
                norm_flavor = "DAYCRAWLER"
            if norm_flavor == "DRAGONFRUITLEMONADE" and "DRAGONFRUITLEMONADE" in img_map:
                norm_flavor = "DRAGONFRUITLEMONADE"
            
            img_file = img_map.get(norm_flavor)
            if img_file:
                img_url = f"/images/imagesForProducts/RAZ 9K/{img_file}"
                img_alt = f"RAZ 9K • {flavor.title()}"
                
                cur.execute("""
                    INSERT INTO product_images (product_id, image_url, image_alt)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), image_alt = VALUES(image_alt)
                """, (p_id, img_url, img_alt))
                print(f"✅ Synced: {p_name} -> {img_file}")
                count += 1
            else:
                print(f"⚠️ No image for: {p_name} (Flavor: {flavor}, Norm: {norm_flavor})")

        print(f"\n🎉 Successfully synced {count} images!")

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    sync_images()
