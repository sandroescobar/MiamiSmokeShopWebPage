import os, time, glob, shutil, re
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import pandas as pd






# ─────────────────────────────────────────────────────────────────────────────
# 0) Configure downloads BEFORE launching Chrome (single driver only)
# ─────────────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))       # folder with this script
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


chrome_options = webdriver.ChromeOptions()
chrome_prefs = {
   "download.default_directory": DOWNLOAD_DIR,
   "download.prompt_for_download": False,
   "download.directory_upgrade": True,
   "safebrowsing.enabled": True,
   "profile.default_content_setting_values.automatic_downloads": 1,
}
chrome_options.add_experimental_option("prefs", chrome_prefs)


driver = webdriver.Chrome(options=chrome_options)
wait = WebDriverWait(driver, 20)


# ─────────────────────────────────────────────────────────────────────────────
# 1) Open login page
# ─────────────────────────────────────────────────────────────────────────────
# Pre-cleanup: remove old items-*.csv files to ensure we pick the fresh one
for old_file in glob.glob(os.path.join(DOWNLOAD_DIR, "items-*.csv")):
    try:
        os.remove(old_file)
    except Exception:
        pass

driver.get("https://miamismoke.cigarspos.com/index.html?nocache=07")


# If a jQuery UI "Ok" alert appears, close it
try:
   dialog = "//div[contains(@class,'ui-dialog') and not(contains(@style,'display: none'))]"
   ok_btns = (f"{dialog}//button[@title='Ok' or normalize-space(.)='Ok' "
              f"or .//i[contains(@class,'icon-ok')]]")
   wait.until(EC.element_to_be_clickable((By.XPATH, f"({ok_btns})[last()]"))).click()
   wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, "div.ui-widget-overlay.ui-front")))
except TimeoutException:
   pass


# Some deployments stick the form in an iframe. Hop through iframes until we see username.
driver.switch_to.default_content()
for fr in driver.find_elements(By.TAG_NAME, "iframe"):
   driver.switch_to.frame(fr)
   if driver.find_elements(By.XPATH, "//input[@id='username' or @name='username']"):
       break
   driver.switch_to.default_content()


# Fill credentials and login
user = wait.until(EC.visibility_of_element_located(
   (By.XPATH, "//input[@id='username' or @name='username' or @placeholder='Username*']")))
user.clear(); user.send_keys("sandro")


pwd = wait.until(EC.visibility_of_element_located(
   (By.XPATH, "//input[@type='password' and (@id='password' or @name='password' or @placeholder='Password*')]")))
pwd.clear(); pwd.send_keys("12301230")


login_btn = wait.until(EC.element_to_be_clickable(
   (By.XPATH, "//button[@id='loginbutton' or @id='loginButton' or @title='Login' or normalize-space(.)='Login']")))
try:
   login_btn.click()
except Exception:
   driver.execute_script("arguments[0].click();", login_btn)


# Back to the top doc for the device setup dialog
driver.switch_to.default_content()


# ─────────────────────────────────────────────────────────────────────────────
# 2) Initial Device Setup → pick "Register1 (Inventory)" and "Inventory" → Register
# ─────────────────────────────────────────────────────────────────────────────
el = wait.until(EC.presence_of_element_located((By.ID, "posdevices")))
sel = Select(el)
wait.until(lambda d: len(sel.options) >= 2)
sel.select_by_index(1)  # 2nd option (Register1...)


loc = wait.until(EC.presence_of_element_located((By.ID, "poslocations")))
sel2 = Select(loc)
wait.until(EC.presence_of_element_located(
   (By.XPATH, "//select[@id='poslocations']/option[normalize-space(.)='Inventory']")))
sel2.select_by_visible_text("Inventory")


register_button = wait.until(EC.element_to_be_clickable(
   (By.XPATH, "//button[normalize-space(.)='Register']")))
register_button.click()


# Close the "Electron print support..." alert if it shows
try:
   ok_btn = wait.until(EC.element_to_be_clickable((
       By.XPATH,
       "(//div[contains(@class,'ui-dialog') and not(contains(@style,'display: none'))]"
       "//div[contains(@class,'ui-dialog-buttonset')]//button"
       "[normalize-space(.)='Ok' or .//i[contains(@class,'icon-ok')]])[last()]"
   )))
   ok_btn.click()
except TimeoutException:
   pass


# ─────────────────────────────────────────────────────────────────────────────
# 3) Go to Admin (opens in a new tab) and switch to it
# ─────────────────────────────────────────────────────────────────────────────
admin_button = wait.until(EC.element_to_be_clickable((By.ID, "admin_btn")))
admin_button.click()


wait.until(lambda d: len(d.window_handles) >= 2)
current = driver.current_window_handle
for h in driver.window_handles:
   driver.switch_to.window(h)
   if "/admin" in driver.current_url.lower() or "administration" in (driver.title or ""):
       break


# Sidebar present?
wait.until(EC.presence_of_element_located((By.ID, "sidebar")))


# ─────────────────────────────────────────────────────────────────────────────
# 4) Open "Items" (if not open) → click "Inventory"
# ─────────────────────────────────────────────────────────────────────────────
items_li = driver.find_element(By.ID, "menuparentitems")
if "open" not in (items_li.get_attribute("class") or ""):
   toggle = items_li.find_element(By.CSS_SELECTOR, "a.dropdown-toggle")
   try:
       toggle.click()
   except Exception:
       driver.execute_script("arguments[0].click();", toggle)
   wait.until(lambda d: "open" in d.find_element(By.ID, "menuparentitems").get_attribute("class"))


inv_link = wait.until(EC.element_to_be_clickable((
   By.XPATH,
   "//*[@id='sidebar']//li[@id='menuitems']/a"
   " | //*[@id='sidebar']//a[@href='#stock' or normalize-space()='Inventory' or .//span[normalize-space()='Inventory']]"
)))
driver.execute_script("arguments[0].scrollIntoView({block:'center'})", inv_link)
try:
   inv_link.click()
except Exception:
   driver.execute_script("arguments[0].click();", inv_link)


# Ensure we’re on Inventory view
wait.until(lambda d: '#stock' in d.current_url.lower() or d.find_elements(By.ID, 'menustock'))


# ─────────────────────────────────────────────────────────────────────────────
# 5) Export CSV
# ─────────────────────────────────────────────────────────────────────────────
export_btn = wait.until(EC.element_to_be_clickable(
   (By.XPATH, "//button[normalize-space(.)='Export CSV']")))
export_btn.click()


# ─────────────────────────────────────────────────────────────────────────────
# 6) Wait for download to finish and rename to downloads/inventory.csv
# ─────────────────────────────────────────────────────────────────────────────
def wait_for_csv(dir_path: str, timeout: int = 90) -> str:
   """Wait until a new items-*.csv appears and all .crdownload files are gone."""
   end = time.time() + timeout
   while time.time() < end:
       # ONLY look for the POS export pattern, ignore inventory*.csv
       csvs = glob.glob(os.path.join(dir_path, "items-*.csv"))
       crdl = glob.glob(os.path.join(dir_path, "*.crdownload"))
       if csvs and not crdl:
           return max(csvs, key=os.path.getmtime)
       time.sleep(0.5)
   raise TimeoutException(f"No new items-*.csv found in {dir_path} within {timeout}s")


csv_path = wait_for_csv(DOWNLOAD_DIR)
print(f"Detected raw download: {csv_path}")
dest = os.path.join(DOWNLOAD_DIR, "inventory.csv")






# force a stable file name in your project: downloads/inventory.csv
if os.path.abspath(csv_path) != os.path.abspath(dest):
   try:
       os.replace(csv_path, dest)              # atomic overwrite if possible
   except Exception:
       shutil.copy2(csv_path, dest)            # fallback: copy if rename fails


print("Saved CSV →", dest)


# --- READ as strings to preserve UPC/Stock Code exactly ---
# ───────────────────────── Clean & save ONE CSV ─────────────────────────
import re


df = pd.read_csv(dest, dtype=str, encoding="utf-8-sig").fillna("")


def _norm(s):  # normalize header names
   return re.sub(r'[^a-z0-9]', '', str(s).lower())


def find_col(frame, candidates):
   """Return the actual frame column matching any candidate (exact normalized first, then partial)."""
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


# prefer the per-store quantity over the "Total" one
NAME_COL     = find_col(df, ["Name", "Item Name", "Product Name"]) or "Name"
STOCK_COL    = find_col(df, ["Stock Code", "Stockcode", "SKU", "Item Code"])
UPC_COL      = find_col(df, ["UPC Full", "UPC", "UPC Code", "Barcode", "EAN", "GTIN"])
UPC_ALT_COL  = find_col(df, ["UPC", "UPC Full", "Barcode", "EAN", "GTIN"])  # may be same as UPC_COL, that's fine
QTY_COL      = find_col(df, ["Qty On Hand", "Quantity on Hand", "QOH", "On Hand", "Quantity", "Qty", "Total Qty On Hand"])
PRICE_COL    = find_col(df, ["Unit Price", "Price", "Retail", "Selling Price", "Sell Price"])
CAT_COL      = find_col(df, ["Category Name", "Category", "Main Category", "Category Group Name"])


def clean_upc(val: str) -> str:
   if not isinstance(val, str):
       val = "" if pd.isna(val) else str(val)
   # keep only digits; if comma-separated, take first piece
   val = val.split(",")[0]
   digits = re.sub(r"\D", "", val)
   return digits  # keep as string to preserve leading zeros


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


# build the cleaned table
out = pd.DataFrame({
   "Name": df[NAME_COL].astype(str).str.strip()
})


if STOCK_COL:
   out["StockCode"] = df[STOCK_COL].astype(str).str.strip()


# best UPC from two possible sources
if UPC_COL:
   upc_a = df[UPC_COL].apply(clean_upc)
else:
   upc_a = pd.Series([""] * len(df))


if UPC_ALT_COL and UPC_ALT_COL != UPC_COL:
   upc_b = df[UPC_ALT_COL].apply(clean_upc)
else:
   upc_b = pd.Series([""] * len(df))


out["UPC"] = [
   a if len(a) >= len(b) else b
   for a, b in zip(upc_a, upc_b)
]


if QTY_COL:
   out["QtyOnHand"] = to_int_series(df[QTY_COL])
if PRICE_COL:
   out["UnitPrice"] = to_price_series(df[PRICE_COL])


# choose category name (prefer specific name over group)
if CAT_COL:
   out["Category"] = df[CAT_COL].astype(str).str.strip()
else:
   out["Category"] = ""


# keep only the categories you care about
allowed = {
   "NICOTINE VAPES",
   "NICOTINE VAPE",
   "VAPES",
   "VAPE",
   "DISPOSABLE VAPES",
   "THCA PRODUCTS",
   "THCA RELATED: FLOWER, CARTS & VAPES",
   "TOBACCO PRODUCTS",
   "EDIBLES",
   "GRINDERS",
   "ROLLING PAPERS & CONES",
   "VAPE JUICES",
   "DEVICES: BATTERIES & MODS",
   "HOOKAH RELATED",
}
out = out[out["Category"].str.upper().str.strip().isin(allowed)]

# Exclude specific flavors as requested by user
out = out[~out["Name"].str.upper().str.contains("RAZ 9K CACTUS JACK", na=False)]
out = out[~out["Name"].str.upper().str.contains("RAZ 9K ORANGE RASPBERRY", na=False)]


# final column order
cols = [c for c in ["Name", "StockCode", "UPC", "QtyOnHand", "UnitPrice", "Category"] if c in out.columns]
out = out[cols]


# save one cleaned CSV in your project downloads folder
cleaned_path = os.path.join(DOWNLOAD_DIR, "inventory_clean.csv")
out.to_csv(cleaned_path, index=False)
print(f"Cleaned CSV → {cleaned_path}  ({len(out)} rows)")
# ─────────────────────── End single-CSV cleaner ───────────────────────


print("\n📦 Loading data into database...")
import subprocess
try:
    result = subprocess.run(
        ["python3", os.path.join(BASE_DIR, "clean_data.py"), cleaned_path, "Calle 8"],
        capture_output=True,
        text=True,
        timeout=480
    )
    print(result.stdout)
    if result.stderr:
        print("⚠️  Warnings:", result.stderr)
    if result.returncode == 0:
        print("✅ Database updated with Calle 8 inventory!")
    else:
        print(f"❌ Error loading data (exit code {result.returncode})")
except Exception as e:
    print(f"❌ Error running loader: {e}")


# brew services start mysql run this line to start
# mysql -u root run this to connect to mysql server


# OPTIONAL: auto-update DB after cleaning


