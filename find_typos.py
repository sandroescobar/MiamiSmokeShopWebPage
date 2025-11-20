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
    
    # Find all variants of RAZ/RAZZ LTX products
    cur.execute("SELECT id, name, location, quantity_on_hand FROM products WHERE name LIKE '%RAZ%LTX%25K%' ORDER BY name")
    
    print("Products found with 'RAZ' and 'LTX' and '25K':")
    print("-" * 80)
    for pid, name, loc, qty in cur.fetchall():
        print(f"ID: {pid:4} | Name: {name:30} | Location: {loc:15} | Qty: {qty}")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")