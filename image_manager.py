#!/usr/bin/env python3

import os
import re
import sys
from pathlib import Path
from product_utils import (
    get_db_products_by_store,
    get_product_by_name,
    normalize_product_name
)


IMAGES_DIR = os.path.join(os.path.dirname(__file__), "public", "images", "imagesForProducts")


def denormalize_folder_name(folder_name):
    """
    Convert folder name to product name format.
    
    Examples:
        "LOST MARY TURBO 35K" -> "LOST MARY TURBO 35K"
        "OLITHOOKALIT60K" -> "OLIT HOOKALIT 60K"
        "CUVIE PLUS" -> "CUVIE PLUS"
        "FUMEINFINITY" -> "FUME INFINITY"
        "FUMEULTRA" -> "FUME ULTRA"
        "FUMEPRO30K" -> "FUME PRO 30K"
    """
    name = folder_name.upper().strip()
    
    replacements = [
        ("OLITHOOKALIT40K", "OLIT HOOKALIT 40K"),
        ("OLITHOOKALIT60K", "OLIT HOOKALIT 60K"),
        ("OLIT_60K", "OLIT HOOKALIT 60K"),
        ("OLIT60K", "OLIT HOOKALIT 60K"),
        ("FUMEPRO30K", "FUME PRO 30K"),
        ("FUMEINFINITY", "FUME INFINITY"),
        ("FUMEULTRA", "FUME ULTRA"),
        ("FUMEPRO", "FUME PRO"),
        ("FUMEEXTRA", "FUME EXTRA"),
        ("GRABBALEAFSMALL", "GRABBA LEAF SMALL"),
        ("GRABBALEAFWHOLE", "GRABBA LEAF WHOLE"),
    ]
    
    for pattern, replacement in replacements:
        if name == pattern or name.startswith(pattern):
            name = replacement + name[len(pattern):]
            return name.strip()
    
    name = re.sub(r'([A-Z])([A-Z][a-z])', r'\1 \2', name)
    
    if "CUVIE" in name and "MARS" in name and "CUVIE MARS" not in name:
        name = name.replace("CUVIE", "CUVIE").replace("MARS", "MARS")
        if "CUVIEMARS" in name:
            name = name.replace("CUVIEMARS", "CUVIE MARS")
    
    return name.strip()


def normalize_name_for_matching(name):
    """Normalize name for case-insensitive matching."""
    return name.upper().strip()


def get_image_folders():
    """Get list of image folders."""
    if not os.path.isdir(IMAGES_DIR):
        print(f"❌ Images directory not found: {IMAGES_DIR}")
        return []
    
    folders = []
    try:
        for item in os.listdir(IMAGES_DIR):
            item_path = os.path.join(IMAGES_DIR, item)
            if os.path.isdir(item_path):
                folders.append(item)
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


def check_product_in_store(product_name, store_name):
    """Check if a product exists in a store's inventory."""
    try:
        db_products = get_db_products_by_store(store_name)
        db_names = {p['name'].upper().strip() for p in db_products}
        return normalize_name_for_matching(product_name) in db_names
    except Exception:
        return None


def main():
    """Main image manager loop."""
    print("\n" + "="*70)
    print("IMAGE MANAGER")
    print("="*70)
    print("This tool scans for images in /public/images/imagesForProducts/")
    print("and matches them to products in the database.\n")
    
    folders = get_image_folders()
    
    if not folders:
        print("❌ No image folders found.")
        return
    
    print(f"✅ Found {len(folders)} image folder(s)\n")
    
    stores = ["Calle 8", "79th Street", "Market"]
    
    matched = 0
    orphaned = []
    
    for folder in folders:
        image_count = count_images_in_folder(folder)
        product_name = denormalize_folder_name(folder)
        
        print(f"📁 {folder}")
        print(f"   Product name: {product_name}")
        print(f"   Images: {image_count}")
        
        found_stores = []
        not_found_stores = []
        
        for store in stores:
            result = check_product_in_store(product_name, store)
            if result is True:
                found_stores.append(store)
            elif result is False:
                not_found_stores.append(store)
        
        if found_stores:
            print(f"   ✅ Available in: {', '.join(found_stores)}")
            matched += 1
        
        if not_found_stores:
            print(f"   ❌ Not in: {', '.join(not_found_stores)}")
        
        if not found_stores and not_found_stores:
            orphaned.append(folder)
        
        print()
    
    print("="*70)
    print("SUMMARY")
    print("="*70)
    print(f"✅ Matched to inventory: {matched}/{len(folders)}")
    
    if orphaned:
        print(f"\n⚠️  Orphaned images (not in any store inventory):")
        for folder in orphaned:
            print(f"   - {folder}")
    
    print("\n💡 Tips:")
    print("   - Run 'python product_creator.py' to add products first")
    print("   - Then run this tool again to verify image links")
    print("   - Images only appear for products that exist in store inventory")
    print()


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
