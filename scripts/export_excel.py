import zipfile
import re
import json
import os
from xml.etree import ElementTree as ET

# Where the Excel file lives.
EXCEL = "Bản sao của Eat.xlsx"
# Walk up from this app folder to find it (placed in workspace root).
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
for _ in range(4):
    cand = os.path.join(SCRIPT_DIR, EXCEL)
    if os.path.exists(cand):
        EXCEL = cand
        break
    SCRIPT_DIR = os.path.dirname(SCRIPT_DIR)

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

def _shared_strings(z):
    out = []
    for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
        out.append(
            "".join(t.text or "" for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"))
        )
    return out

def _sheet_targets(z):
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    rid_target = dict(re.findall(r'<Relationship [^>]*?Id="(rId\d+)"[^>]*?Target="([^"]+)"', rels))
    sheet_rid = dict(re.findall(r'<sheet[^>]*?name="([^"]+)"[^>]*?r:id="(rId\d+)"', z.read("xl/workbook.xml").decode("utf-8")))
    return rid_target, sheet_rid

def _col_num(ref):
    n = 0
    for ch in ref:
        n = n * 26 + (ord(ch) - 64)
    return n

def _sheet_grid(z, target, shared):
    root = ET.fromstring(z.read("xl/" + target))
    rows = []
    for row in root.find("m:sheetData", NS).findall("m:row", NS):
        cells = {}
        mx = 0
        for c in row.findall("m:c", NS):
            ci = _col_num(re.match(r"[A-Z]+", c.get("r")).group(0))
            ct = c.get("t")
            v = c.find("m:v", NS)
            isl = c.find("m:is", NS)
            val = ""
            if ct == "s" and v is not None:
                val = shared[int(v.text)]
            elif ct == "inlineStr" and isl is not None:
                val = "".join(t.text or "" for t in isl.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"))
            elif v is not None:
                val = v.text or ""
            # collapse leading zeros / floats for "went" flags
            try:
                if isinstance(val, str) and val.replace(".", "").isdigit():
                    val = str(int(float(val))) if "." in val else str(int(val)) if val.isdigit() else val
            except Exception:
                pass
            cells[ci] = val
            mx = max(mx, ci)
        rows.append([cells.get(i, "") for i in range(1, mx + 1)])
    return [r for r in rows if any(str(c).strip() for c in r)]

def _date_from_excel(serial):
    """Convert an Excel date serial number (days since 1899-12-30) to ISO date."""
    try:
        s = float(serial)
        if s <= 0:
            return ""
        from datetime import datetime, timedelta
        return (datetime(1899, 12, 30) + timedelta(days=s)).date().isoformat()
    except Exception:
        return ""

# ---------- FOOD (Breakfast + Lunch Dinner) ----------
def extract_foods(z, shared, rid_target, sheet_rid):
    foods = []
    food_categories = {
        "Breakfast": [
            ("Bún bò", "bún bò"), ("Mỳ quảng", "Mỳ quảng"), ("Xôi", "Xôi"),
            ("Bún măng gà", "Bún măng gà"), ("Bún mắm", "Bún mắm"),
            ("Bánh mì chấm", "Bánh mì chấm"), ("Bún riêu ốc / chả cá", "Bún riêu ốc / chả cá"),
            ("Bánh cuốn", "Bánh cuốn"), ("Miến gà", "Miến gà"), ("Cháo", "Cháo"),
            ("Phở", "Phở"), ("Mì xíu", "Mì xíu"),
        ],
        "Lunch Dinner": [
            ("Bún", "Bún"), ("Cơm", "Cơm"), ("Ốc", "Ốc"),
            ("Bánh bèo - nậm - lọc", "Bánh bèo - nậm - lọc"), ("Đồ Hàn Quốc", "Đồ Hàn Quốc"),
            ("Mì xíu", "Mì xíu"), ("Bánh canh", "Bánh canh"), ("Phở", "Phở"),
            ("Nướng/ Lẩu", "Nướng/ Lẩu"), ("Nhà hàng", "Nhà hàng"), ("Chay", "Chay"),
            ("Bánh tráng", "Bánh tráng"), ("Nhậu/ Ăn vặt", "Nhậu/ Ăn vặt"),
            ("Bánh mì", "Bánh mì"), ("Bánh xèo", "Bánh xèo"),
            ("Trứng vịt lộn", "Trứng vịt lộn"),
        ],
    }
    for sheet, cats in food_categories.items():
        if sheet not in sheet_rid:
            continue
        grid = _sheet_grid(z, rid_target[sheet_rid[sheet]], shared)
        header = grid[0] if grid else []
        # each category occupies 2 columns: [name, locations...] where name col holds the dish and
        # following columns hold locations. We map dish name -> list of locations below.
        # Build a map col_index -> dish label using header row (header has dish names above columns
        # that have sub-locations). For Breakfast, row 0 is dish names and rows below are locations.
        # Build dish per column index.
        col_dish = {}
        for ci, cell in enumerate(header):
            name = str(cell).strip()
            if not name:
                continue
            col_dish[ci] = name
        for row in grid[1:]:
            for ci, dish in col_dish.items():
                loc = str(row[ci]).strip() if ci < len(row) else ""
                # Skip junk cells: empty, a "0" flag, or a location that is entirely a
                # number (Excel subtotal/count rows like "34"/"18", or date-serial "44681").
                # Real restaurant locations always contain letters.
                if not loc or loc in ("0",):
                    continue
                if loc.replace(".", "", 1).isdigit() and loc.count(".") <= 1:
                    continue
                foods.append({
                    "name": dish,
                    "category": "breakfast" if sheet == "Breakfast" else "lunch_dinner",
                    "location": loc,
                    "is_favorite": False,
                })
    return foods

# ---------- DRINK (and Dessert inside the Drink tab) ----------
def extract_drinks(z, shared, rid_target, sheet_rid):
    """Reads the 'Drink' tab. Each column is a category (Cafe / Beer-Cocktail / Kem)
    and the cells below each header are the names of places/brands."""
    if "Drink" not in sheet_rid:
        return []
    grid = _sheet_grid(z, rid_target[sheet_rid["Drink"]], shared)
    if not grid:
        return []
    header = grid[0]
    # Map each header label to (dish label shown in UI, Food category).
    cat_map = {
        "Cafe": ("Cafe ☕", "drink"),
        "Beer/ Cocktail": ("Beer / Cocktail 🍺", "drink"),
        "Beer/Cocktail": ("Beer / Cocktail 🍺", "drink"),
        "Kem": ("Kem 🍨", "dessert"),
    }
    drinks = []
    for ci, cell in enumerate(header):
        cat_name = str(cell).strip()
        if cat_name not in cat_map:
            continue
        dish, category = cat_map[cat_name]
        for row in grid[1:]:
            loc = str(row[ci]).strip() if ci < len(row) else ""
            # Skip empty / "0" placeholders. Keep pure numbers on purpose
            # (e.g. the bar "1920") unlike the Breakfast subtotal counts.
            if not loc or loc in ("0",):
                continue
            drinks.append({
                "name": dish,
                "category": category,
                "location": loc,
                "is_favorite": False,
            })
    return drinks

# ---------- TRIPS ----------
def extract_trips(z, shared, rid_target, sheet_rid):
    if "Dự định đi" not in sheet_rid:
        return []
    grid = _sheet_grid(z, rid_target[sheet_rid["Dự định đi"]], shared)
    if not grid:
        return []
    header = grid[0]
    trips = []
    for row in grid[1:]:
        for c, city in enumerate(header):
            place_col = c * 2
            went_col = c * 2 + 1
            place = str(row[place_col]).strip() if place_col < len(row) else ""
            went_raw = str(row[went_col]).strip() if went_col < len(row) else ""
            if place in ("", "0"):
                continue
            trips.append({
                "city": city,
                "place": place,
                "went": went_raw in ("1", "true", "TRUE"),
            })
    return trips

# ---------- WISHLIST ----------
def extract_wishlist(z, shared, rid_target, sheet_rid):
    if "Wishlist" not in sheet_rid:
        return []
    grid = _sheet_grid(z, rid_target[sheet_rid["Wishlist"]], shared)
    wishes = []
    for row in grid[1:]:
        for cell in row[:2]:
            item = str(cell).strip()
            if item and item != "0":
                wishes.append({"item": item, "given": False})
    return wishes

# ---------- JOURNAL ("to Nam") ----------
def extract_journal(z, shared, rid_target, sheet_rid):
    if "to Nam" not in sheet_rid:
        return []
    grid = _sheet_grid(z, rid_target[sheet_rid["to Nam"]], shared)
    posts = []
    for row in grid[1:]:
        date_serial = str(row[0]).strip() if len(row) > 0 else ""
        message = str(row[1]).strip() if len(row) > 1 else ""
        if not message:
            continue
        posts.append({
            "author": "Em ❤️",
            "message": message,
            "date": _date_from_excel(date_serial) or "2022-11-05",
            "hearts": 0,
        })
    return posts

# ---------- MAIN ----------
def main():
    with zipfile.ZipFile(EXCEL) as z:
        shared = _shared_strings(z)
        rid_target, sheet_rid = _sheet_targets(z)
        data = {
            "foods": extract_foods(z, shared, rid_target, sheet_rid)
                     + extract_drinks(z, shared, rid_target, sheet_rid),
            "trips": extract_trips(z, shared, rid_target, sheet_rid),
            "wishlist": extract_wishlist(z, shared, rid_target, sheet_rid),
            "journal": extract_journal(z, shared, rid_target, sheet_rid),
        }
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(out_dir, exist_ok=True)
    for key, items in data.items():
        path = os.path.join(out_dir, f"{key}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        print(f"{key}.json  -> {len(items)} items")

if __name__ == "__main__":
    main()
