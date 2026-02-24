#!/usr/bin/env python3

import sys
import re
from product_utils import (
    STORE_MAPPING,
    search_products,
    get_product_by_name,
    insert_product,
    insert_inventory,
    get_category_id_by_name,
    normalize_product_name,
    get_db_connection
)

SNAPSHOT_TABLES = {
    "Calle 8": "inventory_calle8",
    "79th Street": "inventory_79th",
    "Market": "inventory_mkt"
}


def get_store_choice():
    """Prompt user to select a store."""
    print("\n" + "="*50)
    print("SELECT STORE")
    print("="*50)
    print("1. CALLE8")
    print("2. 79TH")
    print("3. MKT")
    
    while True:
        choice = input("\nEnter store number (1-3): ").strip()
        if choice == "1":
            return "Calle 8"
        elif choice == "2":
            return "79th Street"
        elif choice == "3":
            return "Market"
        else:
            print("Invalid choice. Please enter 1, 2, or 3.")


def search_and_display_products(store_name, search_term):
    """Search for products and display results."""
    print(f"\n🔍 Searching for '{search_term}' in {store_name}...")
    
    matches = search_products(store_name, search_term, exact_match=False)
    
    if not matches:
        print(f"❌ No products found matching '{search_term}'")
        return None
    
    print(f"\n✅ Found {len(matches)} matching product(s):\n")
    
    for idx, product in enumerate(matches, 1):
        name = product.get("Name", "N/A")
        qty = product.get("QtyOnHand", "0")
        price = product.get("UnitPrice", "0")
        upc = product.get("UPC", "N/A")
        
        print(f"{idx}. {name}")
        print(f"   UPC: {upc} | Qty: {qty} | Price: ${price}")
        print()
    
    return matches


def select_products(matches):
    """Allow user to select which products to add."""
    print("="*50)
    print("SELECT PRODUCTS TO ADD")
    print("="*50)
    print("Enter product numbers separated by commas (e.g., 1,3,5)")
    print("Or press Enter to select all:")
    
    selection = input("\nYour selection: ").strip()
    
    if not selection:
        return matches
    
    try:
        indices = [int(x.strip()) - 1 for x in selection.split(",")]
        selected = [matches[i] for i in indices if 0 <= i < len(matches)]
        
        if not selected:
            print("❌ Invalid selection. Using all products.")
            return matches
        
        print(f"✅ Selected {len(selected)} product(s)")
        return selected
    except (ValueError, IndexError):
        print("❌ Invalid selection. Using all products.")
        return matches


def add_to_featured_list(product_name, group_variants=True):
    """Add product to FEATURED_FULL_PRODUCTS in index.js"""
    index_path = "/Users/sandrosMac/Desktop/pycharmProjects/miami_smoke/index.js"
    try:
        with open(index_path, 'r') as f:
            content = f.read()
        
        pattern = r"(const FEATURED_FULL_PRODUCTS = \[[\s\S]*?)'([^']+)'\s*\]\s*;"
        
        match = re.search(pattern, content)
        if not match:
            return False
        
        last_product = match.group(2)
        
        if product_name in content:
            if not group_variants and "NO_GROUP_PRODUCTS" in content:
                add_to_no_group(product_name, index_path)
            return True
        
        replacement = f"\\1'{last_product}',\n  '{product_name}'\n];"
        content = re.sub(pattern, replacement, content)
        
        with open(index_path, 'w') as f:
            f.write(content)
        
        if not group_variants:
            add_to_no_group(product_name, index_path)
        
        return True
    except Exception as e:
        print(f"   ⚠️  Error adding to featured list: {e}")
        return False


def add_to_no_group(product_name, index_path):
    """Add product to NO_GROUP_PRODUCTS set in index.js"""
    try:
        with open(index_path, 'r') as f:
            content = f.read()
        
        pattern = r"(const NO_GROUP_PRODUCTS = new Set\(\[\s*)([\s\S]*?)(\s*\]\s*\)\s*;)"
        
        match = re.search(pattern, content)
        if not match:
            return
        
        existing_items = match.group(2)
        
        if product_name in existing_items:
            return
        
        before = match.group(1)
        after = match.group(3)
        
        new_items = existing_items.rstrip() + f",\n  '{product_name}'"
        replacement = f"{before}{new_items}{after}"
        
        content = re.sub(pattern, replacement, content)
        
        with open(index_path, 'w') as f:
            f.write(content)
    except Exception as e:
        print(f"   ⚠️  Error adding to NO_GROUP_PRODUCTS: {e}")


def add_to_snapshot_table(store_name, name, upc, quantity):
    """Add product to store's snapshot table."""
    if store_name not in SNAPSHOT_TABLES:
        return False
    
    table_name = SNAPSHOT_TABLES[store_name]
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(f"""
            DELETE FROM `{table_name}` WHERE UPPER(name) = UPPER(%s) AND upc = %s
        """, (name, upc))
        
        cur.execute(f"""
            INSERT INTO `{table_name}` (name, upc, quantity, is_active)
            VALUES (%s, %s, %s, 1)
        """, (name, upc, quantity))
        conn.commit()
        return True
    except Exception as e:
        print(f"   ⚠️  Error adding to snapshot: {e}")
        return False
    finally:
        cur.close()
        conn.close()


def confirm_and_add(store_name, selected_products):
    """Confirm details and add products to database."""
    print("\n" + "="*50)
    print("CONFIRM & ADD PRODUCTS")
    print("="*50)
    
    group_variants = input("\n🔗 Group variants together? (y/n, default=y): ").strip().lower()
    group_variants = group_variants != "n"
    
    added_count = 0
    skipped_count = 0
    
    for product in selected_products:
        name = product.get("Name", "").strip()
        upc = product.get("UPC", "").strip()
        stockcode = product.get("StockCode", "").strip()
        
        try:
            price = float(product.get("UnitPrice", "0") or "0")
        except (ValueError, TypeError):
            price = 0.0
        
        try:
            quantity = int(product.get("QtyOnHand", "0") or "0")
        except (ValueError, TypeError):
            quantity = 0
        
        print(f"\n📦 Product: {name}")
        print(f"   UPC: {upc}")
        print(f"   Qty: {quantity} | Price: ${price}")
        
        confirm = input("   Add this product? (y/n): ").strip().lower()
        
        if confirm != "y":
            print("   ⏭️  Skipped")
            skipped_count += 1
            continue
        
        existing = get_product_by_name(name)
        
        if existing:
            print(f"   ✅ Product already exists (ID: {existing['id']})")
            product_id = existing['id']
        else:
            category_name = product.get("Category", "MISCELLANEOUS SMOKE SHOP").strip().upper()
            category_id = get_category_id_by_name(category_name)
            
            if not category_id:
                print(f"   ⚠️  Category '{category_name}' not found. Using default.")
                category_id = get_category_id_by_name("MISCELLANEOUS SMOKE SHOP")
            
            if not category_id:
                print(f"   ❌ Could not find category. Skipping.")
                skipped_count += 1
                continue
            
            product_id = insert_product(name, upc, stockcode, price, category_id)
            print(f"   ✅ Product created (ID: {product_id})")
        
        insert_inventory(product_id, store_name, quantity, price)
        print(f"   ✅ Inventory updated for {store_name}")
        
        add_to_snapshot_table(store_name, name, upc, quantity)
        print(f"   ✅ Added to {store_name} snapshot table")
        
        if add_to_featured_list(name, group_variants):
            if group_variants:
                print(f"   ✅ Added to featured products (grouped)")
            else:
                print(f"   ✅ Added to featured products (separate cards)")
        
        added_count += 1
    
    print("\n" + "="*50)
    print(f"✅ Added: {added_count} | ⏭️ Skipped: {skipped_count}")
    print("="*50)


def main():
    """Main interactive loop."""
    print("\n" + "="*50)
    print("PRODUCT CREATOR")
    print("="*50)
    
    store_name = get_store_choice()
    print(f"\n✅ Selected: {store_name}")
    
    while True:
        search_term = input("\n🔎 Enter product name to search (or 'q' to quit): ").strip()
        
        if search_term.lower() == "q":
            print("👋 Goodbye!")
            break
        
        if not search_term:
            print("❌ Please enter a search term.")
            continue
        
        matches = search_and_display_products(store_name, search_term)
        
        if not matches:
            continue
        
        selected = select_products(matches)
        
        if selected:
            confirm_and_add(store_name, selected)
        
        again = input("\n🔄 Search for another product? (y/n): ").strip().lower()
        if again != "y":
            print("👋 Goodbye!")
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Cancelled.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
