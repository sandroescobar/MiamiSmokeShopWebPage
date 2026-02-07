import os
import re
import pandas as pd
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

def _norm(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())

def find_col(frame, candidates):
    norm_map = {_norm(c): c for c in frame.columns}
    for cand in candidates:
        key = _norm(cand)
        if key in norm_map:
            return norm_map[key]
    for cand in candidates:
        key = _norm(cand)
        for c in frame.columns:
            if key and key in _norm(c):
                return c
    return None

def clean_upc(val: str) -> str:
    if not isinstance(val, str):
        val = "" if pd.isna(val) else str(val)
    val = val.split(",")[0]
    digits = re.sub(r"\D", "", val)
    return digits

def to_int_series(s):
    def parse_cell(val):
        if pd.isna(val):
            return 0
        numbers = re.findall(r"-?\d+(?:\.\d+)?", str(val))
        if not numbers:
            return 0
        total = sum(float(num) for num in numbers)
        return int(round(total))
    return s.apply(parse_cell)

def to_price_series(s):
    s = s.astype(str).str.replace(r"[^\d.\-]", "", regex=True)
    return pd.to_numeric(s, errors="coerce").round(2)

def clean_file(filename, location, requested_products=None, allowed_categories=None):
    path = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(path):
        print(f"File {path} not found.")
        return

    print(f"Cleaning {filename} for {location}...")
    df = pd.read_csv(path, dtype=str, encoding="utf-8-sig").fillna("")
    
    NAME_COL     = find_col(df, ["Name", "Item Name", "Product Name"]) or "Name"
    STOCK_COL    = find_col(df, ["Stock Code", "Stockcode", "SKU", "Item Code"])
    UPC_COL      = find_col(df, ["UPC Full", "UPC", "UPC Code", "Barcode", "EAN", "GTIN"])
    UPC_ALT_COL  = find_col(df, ["UPC", "UPC Full", "Barcode", "EAN", "GTIN"])
    QTY_COL      = find_col(df, ["Qty On Hand", "Quantity on Hand", "QOH", "On Hand", "Quantity", "Qty", "Total Qty On Hand"])
    PRICE_COL    = find_col(df, ["Unit Price", "Price", "Retail", "Selling Price", "Sell Price"])
    CAT_COL      = find_col(df, ["Category Name", "Category", "Main Category", "Category Group Name"])

    out = pd.DataFrame({"Name": df[NAME_COL].astype(str).str.strip()})
    if STOCK_COL: out["StockCode"] = df[STOCK_COL].astype(str).str.strip()
    
    if UPC_COL: upc_a = df[UPC_COL].apply(clean_upc)
    else: upc_a = pd.Series([""] * len(df))
    
    if UPC_ALT_COL and UPC_ALT_COL != UPC_COL: upc_b = df[UPC_ALT_COL].apply(clean_upc)
    else: upc_b = pd.Series([""] * len(df))
    
    out["UPC"] = [a if len(a) >= len(b) else b for a, b in zip(upc_a, upc_b)]
    if QTY_COL: out["QtyOnHand"] = to_int_series(df[QTY_COL])
    if PRICE_COL: out["UnitPrice"] = to_price_series(df[PRICE_COL])
    if CAT_COL: out["Category"] = df[CAT_COL].astype(str).str.strip()
    else: out["Category"] = ""

    if requested_products:
        def matches_requested(name):
            name_up = str(name).upper()
            return any(p in name_up for p in requested_products)
        out["is_requested"] = out["Name"].apply(matches_requested)
        out = out[out["is_requested"] == True].copy()
    
    if allowed_categories:
        out = out[out["Category"].str.upper().str.strip().isin(allowed_categories)]

    out = out[~out["Name"].str.upper().str.contains("RAZ 9K CACTUS JACK", na=False)]
    out = out[~out["Name"].str.upper().str.contains("RAZ 9K ORANGE RASPBERRY", na=False)]

    cols = [c for c in ["Name", "StockCode", "UPC", "QtyOnHand", "UnitPrice", "Category"] if c in out.columns]
    out = out[cols]

    cleaned_path = os.path.join(DOWNLOAD_DIR, f"{filename.replace('.csv', '')}_clean.csv")
    out.to_csv(cleaned_path, index=False)
    print(f"Saved cleaned CSV to {cleaned_path} ({len(out)} rows)")

    print(f"Loading {location} into DB...")
    result = subprocess.run(["python3", "clean_data.py", cleaned_path, location], capture_output=True, text=True)
    print(result.stdout)
    if result.stderr: print(result.stderr)

# Market setup
requested_mkt = [
    "FUME EXTRA", "FUME ULTRA", "FUME INFINITY",
    "CUVIE PLUS", "CUVIE MARS",
    "GEEKBAR 15K", "GEEKBAR X 25K",
    "RAZ 9K", "RAZ LTX 25K",
    "ZYN 3MG", "ZYN 6MG",
    "GRABBA LEAF SMALL", "GRABBA LEAF WHOLE",
    "RAW CONE 20PK CLASSIC BLACK KING",
    "RAW CONE 20PK CLASSIC KING",
    "RAW CONE CLASSIC 20PK 1/4",
    "RAW CONE CLASSIC 1/4"
]

# 79th setup
allowed_79th = {
   "NICOTINE VAPES", "NICOTINE VAPE", "VAPES", "VAPE", "DISPOSABLE VAPES",
   "THCA PRODUCTS", "THCA RELATED: FLOWER, CARTS & VAPES",
   "TOBACCO PRODUCTS", "EDIBLES", "GRINDERS",
   "ROLLING PAPERS & CONES", "ROLLING PAPER,CONES, TIPS AND WRAPS",
   "VAPE JUICES", "DEVICES: BATTERIES & MODS", "HOOKAH RELATED",
}

clean_file("inventory_mkt.csv", "Market", requested_products=requested_mkt)
clean_file("inventory_79th.csv", "79th Street", allowed_categories=allowed_79th)
