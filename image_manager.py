#!/usr/bin/env python3

import os
import sys
import re
from pathlib import Path
from product_utils import get_db_connection


IMAGES_DIR = os.path.join(os.path.dirname(__file__), "public", "images", "imagesForProducts")


def get_available_folders():
    """Get list of image folders."""
    if not os.path.isdir(IMAGES_DIR):
        print(f"❌ Images directory not found: {IMAGES_DIR}")
        return []
    
    folders = []
    try:
        for item in os.listdir(IMAGES_DIR):
            item_path = os.path.join(IMAGES_DIR, item)
            if os.path.isdir(item_path):
                image_count = count_images_in_folder(item)
                if image_count > 0:
                    folders.append((item, image_count))
    except Exception as e:
        print(f"❌ Error reading images directory: {e}")
        return []
    
    return sorted(folders)


def count_images_in_folder(folder_name):
    """Count image files in a folder."""
    folder_path = os.path.join(IMAGES_DIR, folder_name)
    if not os.path.isdir(folder_path):
        return 0
    
    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
    count = 0
    try:
        for item in os.listdir(folder_path):
            if os.path.isfile(os.path.join(folder_path, item)):
                if os.path.splitext(item)[1].lower() in image_exts:
                    count += 1
    except Exception:
        pass
    
    return count


def get_images_in_folder(folder_name):
    """Get list of image files (without extension) in a folder."""
    folder_path = os.path.join(IMAGES_DIR, folder_name)
    if not os.path.isdir(folder_path):
        return []
    
    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
    images = []
    try:
        for item in os.listdir(folder_path):
            filepath = os.path.join(folder_path, item)
            if os.path.isfile(filepath):
                if os.path.splitext(item)[1].lower() in image_exts:
                    name_without_ext = os.path.splitext(item)[0]
                    images.append(name_without_ext)
    except Exception:
        pass
    
    return sorted(images)


def extract_flavor_from_filename(filename, folder_name):
    """
    Extract flavor name from image filename.
    
    Tries to remove common prefixes like:
    - OLIT-60K_FLAVOR -> FLAVOR
    - OLIT_60K_FLAVOR -> FLAVOR
    - FUME_EXTRA_FLAVOR -> FLAVOR
    - CUVIE_PLUS_FLAVOR -> FLAVOR
    
    Then converts underscores to spaces.
    """
    filename = filename.upper().strip()
    folder = folder_name.upper().strip()
    
    patterns_to_try = [
        (r'^OLIT[_-]60K[_-]', ''),
        (r'^OLIT[_-]40K[_-]', ''),
        (r'^FUME[_-]EXTRA[_-]', ''),
        (r'^FUME[_-]ULTRA[_-]', ''),
        (r'^FUME[_-]INFINITY[_-]', ''),
        (r'^FUME[_-]PRO[_-]30K[_-]', ''),
        (r'^CUVIE[_-]PLUS[_-]', ''),
        (r'^CUVIE[_-]MARS[_-]', ''),
        (r'^GEEKBAR[_-]15K[_-]', ''),
        (r'^GEEKBAR[_-]X[_-]25K[_-]', ''),
        (r'^RAZ[_-]LTX[_-]25K[_-]', ''),
        (r'^RAZ[_-]9K[_-]', ''),
        (r'^LOST[_-]MARY[_-]TURBO[_-]35K[_-]', ''),
        (r'^ZYN[_-]6MG[_-]', ''),
        (r'^ZYN[_-]3MG[_-]', ''),
    ]
    
    for pattern, replacement in patterns_to_try:
        if re.match(pattern, filename):
            flavor = re.sub(pattern, replacement, filename)
            flavor = flavor.replace('_', ' ').replace('-', ' ')
            flavor = ' '.join(flavor.split())
            if flavor:
                return flavor
    
    flavor = filename.replace('_', ' ').replace('-', ' ')
    flavor = ' '.join(flavor.split())
    
    # Normalize common fraction patterns: "1 4" -> "1/4", "1 2" -> "1/2"
    flavor = re.sub(r'\b(\d+)\s+(\d+)\b', r'\1/\2', flavor)
    
    return flavor


def search_products_by_name(base_product_name):
    """Search for products in DB that start with base_product_name."""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        search_pattern = base_product_name.upper().strip() + "%"
        cur.execute("""
            SELECT id, name 
            FROM products 
            WHERE UPPER(name) LIKE %s 
            ORDER BY name
        """, (search_pattern,))
        products = cur.fetchall()
        return products
    finally:
        cur.close()
        conn.close()


def find_matching_product(base_product_name, flavor_name):
    """
    Find product in DB matching base name + flavor.
    
    Example: base="OLIT HOOKALIT 60K", flavor="BAJA SPLASH"
    Searches for: "OLIT HOOKALIT 60K BAJA SPLASH"
    """
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        base_upper = base_product_name.upper().strip()
        flavor_upper = flavor_name.upper().strip()
        
        # If flavor matches or contains the base name, treat it as the base product (no flavor suffix)
        base_normalized = base_upper.replace('/', '_').replace(' ', '')
        flavor_normalized = flavor_upper.replace('/', '_').replace(' ', '')
        if flavor_normalized == base_normalized or base_normalized in flavor_normalized or flavor_normalized in base_normalized:
            full_name = base_upper
        else:
            full_name = f"{base_upper} {flavor_upper}"
        
        # Also try matching with / and _ as equivalent (can't use / in filenames)
        full_name_slash = full_name.replace('_', '/')
        full_name_underscore = full_name.replace('/', '_')
        
        cur.execute("""
            SELECT id, name 
            FROM products 
            WHERE UPPER(name) = %s
               OR UPPER(name) = %s
               OR UPPER(name) = %s
               OR UPPER(REPLACE(name, '/', '_')) = UPPER(REPLACE(%s, '/', '_'))
            LIMIT 1
        """, (full_name, full_name_slash, full_name_underscore, full_name))
        
        product = cur.fetchone()
        return product
    finally:
        cur.close()
        conn.close()


def display_folder_choice(folders):
    """Display available folders and let user choose."""
    if not folders:
        print("❌ No folders with images found.")
        return None
    
    print("\n" + "="*70)
    print("AVAILABLE IMAGE FOLDERS")
    print("="*70)
    
    for idx, (folder_name, image_count) in enumerate(folders, 1):
        print(f"{idx}. {folder_name} ({image_count} images)")
    
    print()
    while True:
        choice = input("Select folder number (or 'q' to quit): ").strip()
        
        if choice.lower() == "q":
            return None
        
        try:
            idx = int(choice) - 1
            if 0 <= idx < len(folders):
                return folders[idx][0]
            else:
                print("Invalid choice. Please try again.")
        except ValueError:
            print("Invalid input. Please enter a number.")


def insert_image_to_product(product_id, image_folder, image_filename):
    """Insert image mapping into product_images table."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        image_url = f"/images/imagesForProducts/{image_folder}/{image_filename}"
        image_alt = f"{image_folder.replace('_', ' ')} • {image_filename.replace('_', ' ').replace('.jpg', '').replace('.jpeg', '').replace('.png', '')}"
        
        cur.execute("""
            INSERT INTO product_images (product_id, image_url, image_alt)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE
                image_url = VALUES(image_url),
                image_alt = VALUES(image_alt)
        """, (product_id, image_url, image_alt))
        conn.commit()
        return True
    except Exception as e:
        print(f"   ⚠️  Error saving to DB: {e}")
        return False
    finally:
        cur.close()
        conn.close()


def confirm_product_match(base_name, flavor, product_name, product_id, image_folder, image_filename):
    """Ask user to confirm if product match is correct."""
    print(f"\n   Image: {flavor}")
    print(f"   Suggested match: {product_name}")
    
    confirm = input("   ✅ Correct? (y/n/skip): ").strip().lower()
    
    if confirm == "y":
        if insert_image_to_product(product_id, image_folder, image_filename):
            return True
        else:
            return False
    elif confirm == "skip":
        return "skip"
    else:
        return False


def main():
    """Main image linker loop."""
    print("\n" + "="*70)
    print("IMAGE LINKER")
    print("="*70)
    print("Link image flavors to products in database.\n")
    
    folders = get_available_folders()
    
    while True:
        folder_name = display_folder_choice(folders)
        
        if not folder_name:
            print("\n👋 Goodbye!")
            break
        
        print(f"\n✅ Selected folder: {folder_name}")
        
        base_product_name = input("📝 Enter base product name from DB (e.g., 'OLIT HOOKALIT 60K'): ").strip()
        
        if not base_product_name:
            print("❌ Product name required.")
            continue
        
        matching_products = search_products_by_name(base_product_name)
        
        if not matching_products:
            print(f"❌ No products found starting with '{base_product_name}'")
            continue
        
        print(f"\n✅ Found {len(matching_products)} product(s) in DB:")
        for p in matching_products[:10]:
            print(f"   - {p['name']}")
        if len(matching_products) > 10:
            print(f"   ... and {len(matching_products) - 10} more")
        
        images = get_images_in_folder(folder_name)
        
        if not images:
            print(f"❌ No images found in {folder_name}")
            continue
        
        print(f"\n📁 Found {len(images)} image(s) to link:\n")
        
        matched_count = 0
        not_found = []
        skipped = []
        
        for image_name in images:
            flavor_name = extract_flavor_from_filename(image_name, folder_name)
            product = find_matching_product(base_product_name, flavor_name)
            
            if product:
                image_filename = None
                for item in os.listdir(os.path.join(IMAGES_DIR, folder_name)):
                    if os.path.splitext(item)[0].upper() == image_name.upper():
                        image_filename = item
                        break
                
                result = confirm_product_match(base_product_name, flavor_name, product['name'], product['id'], folder_name, image_filename or f"{image_name}.jpg")
                
                if result is True:
                    print(f"      ✅ Linked & saved to DB")
                    matched_count += 1
                elif result == "skip":
                    print(f"      ⏭️  Skipped")
                    skipped.append(image_name)
                else:
                    print(f"      ❌ Skipped (not matched)")
                    not_found.append(image_name)
            else:
                print(f"\n   Image: {image_name}")
                print(f"   Extracted flavor: {flavor_name}")
                print(f"   ❌ No match found for: {base_product_name} {flavor_name}")
                not_found.append(image_name)
        
        print("\n" + "="*70)
        print("SUMMARY")
        print("="*70)
        print(f"✅ Matched: {matched_count}/{len(images)}")
        
        if not_found:
            print(f"\n❌ Not found ({len(not_found)}):")
            for img in not_found:
                print(f"   - {img}")
        
        if skipped:
            print(f"\n⏭️  Skipped ({len(skipped)}):")
            for img in skipped:
                print(f"   - {img}")
        
        print()
        again = input("🔄 Link another folder? (y/n): ").strip().lower()
        if again != "y":
            print("\n👋 Goodbye!")
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Cancelled.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
