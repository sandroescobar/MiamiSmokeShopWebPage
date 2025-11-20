import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

try:
    conn = mysql.connector.connect(
        host=os.getenv("DB_HOST") or "127.0.0.1",
        user=os.getenv("DB_USER") or "root",
        password=os.getenv("DB_PASSWORD") or "",
        database=os.getenv("DB_NAME") or "miami_vape_shops"
    )
    cur = conn.cursor()
    
    # Find RAZZ typos
    cur.execute("SELECT id, name FROM products WHERE name LIKE '%RAZZ LTX 25K%'")
    typos = cur.fetchall()
    
    if typos:
        print(f"Found {len(typos)} products with RAZZ typo:")
        for pid, name in typos:
            print(f"  {pid}: {name}")
        
        # Fix them
        cur.execute("UPDATE products SET name = REPLACE(name, 'RAZZ LTX 25K', 'RAZ LTX 25K') WHERE name LIKE '%RAZZ LTX 25K%'")
        conn.commit()
        print(f"\n✅ Fixed {cur.rowcount} typos!")
    else:
        print("No RAZZ typos found")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")