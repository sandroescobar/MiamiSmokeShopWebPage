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
    
    cur.execute(
        """
        SELECT p.id, p.name, s.name AS store_name, pi.quantity_on_hand
        FROM products p
        JOIN product_inventory pi ON pi.product_id = p.id
        JOIN stores s ON s.id = pi.store_id
        WHERE p.name LIKE '%RAZ%LTX%25K%'
        ORDER BY p.name, s.name
        """
    )
    
    print("Products found with 'RAZ' and 'LTX' and '25K':")
    print("-" * 80)
    for pid, name, store_name, qty in cur.fetchall():
        print(f"ID: {pid:4} | Name: {name:30} | Store: {store_name:15} | Qty: {qty}")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")