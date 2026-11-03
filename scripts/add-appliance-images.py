"""Add the products photographed in "Appliance images" to the reference catalog.

The folder's photos of products the PDF catalogue did not have become new
reference products (no price yet, apart from the air fryers the price sheet
in the folder lists). Extra views of products already in the catalogue become
additional images. File names that disagree with the product in the photo are
left out. Safe to run again: nothing already added is added twice.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import re

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[1]
PHOTOS = ROOT / "Appliance images"
ASSETS = ROOT / "public" / "catalog-assets"
REFERENCE = ROOT / "src" / "services" / "catalog" / "reference.json"
PRICES = PHOTOS / "Air fryer - setup offer - Sheet1 (1).csv"
ADDED_AT = "2026-11-03T16:00:00.000Z"
NOTE = "Added from the Appliance images folder; review the specifications."

# sku, name, category, main photo, more photos
NEW = [
    ("VAF501AS", "Air Fryer", "Air Fryer", "VAF501AS.PNG", []),
    ("V-404", "Dualfry Grill", "Air Fryer", "V-404.png", []),
    ("VAF840D", "Air Fryer", "Air Fryer", "V-840.png", []),
    ("VAF880A", "Air Fryer", "Air Fryer", "V-880.png", []),
    ("V-227", "Citrus Juicer", "Blender", "V-227.png", []),
    ("V-616", "Juicer And Blender", "Blender", "V-616.png", []),
    ("VZK60T", "Electric Pressure Cooker", "Cooker", "VZK60T.png", []),
    ("V-105G", "Hand Blender", "Hand Blender", "V-105G.png", []),
    ("V-650", "Convector Heater", "Heater", "V-650.png", []),
    ("V-651B", "Electric Quartz Heater", "Heater", "V-651B.png", []),
    ("V-651W", "Electric Quartz Heater", "Heater", "V-651W.png", []),
    ("V-656", "Electric Heater", "Heater", "V-656.png", ["V-655 656 black.png", "V-655 656 white.jpg"]),
    ("V-657", "Electric Heater", "Heater", "V-657.png", ["V-657 black-Photoroom.png", "V-657 white-Photoroom.png"]),
    ("V-658", "Electric Heater", "Heater", "658.jpg", []),
    ("V-1100", "Electric Heater", "Heater", "V-1100.png", []),
    ("V-1101B", "Electric Quartz Heater", "Heater", "Black V-1101B.png", []),
    ("V-1101W", "Electric Quartz Heater", "Heater", "White V-1101W.png", []),
    ("V-301", "Electric Steam Iron", "Iron", "V-301.png", []),
    ("V-301W", "Electric Steam Iron", "Iron", "V-301W.png", []),
    ("V-302", "Electric Steam Iron", "Iron", "V-302.png", []),
    ("V-303B", "Electric Steam Iron", "Iron", "V-303B.png", []),
    ("V-600", "Meat Grinder", "Meat Grinder", "V-600.png", []),
    ("V-601", "Meat Grinder", "Meat Grinder", "V-601.png", []),
    ("VTOV-46H_B", "Electric Oven", "Oven", "VTOV-46H_B.png", []),
    ("VTOV-46H_G", "Electric Oven", "Oven", "VTOV-46H_G.png", []),
    ("V-101_B_PRO", "Stand Mixer", "Stand Mixer", "V-101_B_PRO.png", []),
    ("V-101_DG_PRO", "Stand Mixer", "Stand Mixer", "V-101_DG_PRO.png", []),
    ("V-101_LG_PRO", "Stand Mixer", "Stand Mixer", "V-101_LG_PRO.png", []),
    ("V-101_W_PRO", "Stand Mixer", "Stand Mixer", "V-101_W_PRO.png", []),
    ("V-102_B_PRO", "Stand Mixer", "Stand Mixer", "V-102_B_PRO.png", []),
    ("V-102_DG_PRO", "Stand Mixer", "Stand Mixer", "V.102_DG_PRO.png", []),
    ("V-102_LG_PRO", "Stand Mixer", "Stand Mixer", "V.102_LG_PRO.png", []),
    ("V-103_B_PRO", "Stand Mixer", "Stand Mixer", "V-103_B_PRO.png", []),
    ("V-103_DG_PRO", "Stand Mixer", "Stand Mixer", "V.103_DG_PRO.png", []),
    ("V-103_LG_PRO", "Stand Mixer", "Stand Mixer", "V.103_LG_PRO.png", []),
    ("V-103_W_PRO", "Stand Mixer", "Stand Mixer", "V-103_W_PRO.png", []),
    ("V-501S", "Tea Maker", "Tea Maker", "V-501S.png", []),
    ("V-504", "Tea Maker", "Tea Maker", "V-504.png", []),
    ("V-509", "Tea Maker", "Tea Maker", "V-509.png", []),
    ("VB705_B", "Vacuum Cleaner", "Vacuum Cleaner", "VB705_B.png", []),
    ("VB-806", "Vacuum Cleaner", "Vacuum Cleaner", "VB-806.png", []),
    ("VB-806B", "Vacuum Cleaner", "Vacuum Cleaner", "VB-806B.png", []),
    ("V340G_B", "Stand Fan", "Fan", "V340G_B.png", []),
    ("V340G_W", "Stand Fan", "Fan", "V340G_W.png", []),
    ("V340GR_B", "Stand Fan", "Fan", "V340GR_B.png", []),
    ("V340GR_W", "Stand Fan", "Fan", "V340GR_W.png", []),
    ("V340L_B", "Stand Fan", "Fan", "V340L_B.png", []),
    ("V340L_W", "Stand Fan", "Fan", "V340L_W.png", []),
    ("V340_E2_W", "Stand Fan", "Fan", "V340_e2_W.png", []),
]

# More views of products the catalogue already has.
MORE = {
    "V-232": ["V-232 2.png"],
    "V-450": ["V-450.png", "V-450 3.png"],
    "V-628": ["V-628 2.png"],
    "V-629": ["V-629 2.png"],
    "V-864": ["V-864 right side.png"],
}


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def model_key(value):
    return re.sub(r"[\s.\-_/\\,·]+", "", value.upper())


def save_photo(file_name, label):
    image = Image.open(PHOTOS / file_name)
    image.thumbnail((900, 900))
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        background = Image.new("RGB", image.size, "white")
        background.paste(image, mask=image.getchannel("A"))
        image = background
    output = io.BytesIO()
    image.convert("RGB").save(output, format="JPEG", quality=90, optimize=True)
    data = output.getvalue()
    name = f"{slug(label)}-{hashlib.sha256(data).hexdigest()[:12]}.jpg"
    (ASSETS / name).write_bytes(data)
    return f"/catalog-assets/{name}"


def price_sheet():
    """The air fryer sheet's rows by model: price and specifications."""
    rows = {}
    with PRICES.open(encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            row = {k.strip(): (v or "").strip() for k, v in row.items()}
            digits = re.sub(r"[^\d]", "", row["Price"])
            rows[model_key(row["Model"])] = {
                "price": int(digits) if digits else None,
                "capacity": row["Capacity"],
                "power": row["Power"],
                "warranty": row["Warraenty"],
                "weight": f"{row['KG']} KGS" if row["KG"] else "",
                "cbm": row["CBM"],
                "ctnQuantity": f"{row['CTN']} Pcs" if row["CTN"] else "",
            }
    return rows


data = json.loads(REFERENCE.read_text(encoding="utf-8"))
categories, products = data["categories"], data["products"]
sheet = price_sheet()

if not any(c["name"] == "Fan" for c in categories):
    categories.append({"id": "ref-fan", "name": "Fan", "sortOrder": len(categories), "visible": True})
category_ids = {c["name"]: c["id"] for c in categories}
category_order = {c["id"]: c["sortOrder"] for c in categories}

have = {p["id"] for p in products}
added = []
for sku, name, category, main, more in NEW:
    product_id = "ref-" + slug(sku)
    if product_id in have:
        continue
    specs = sheet.get(model_key(sku), {})
    products.append({
        "id": product_id, "name": name, "sku": sku, "categoryId": category_ids[category],
        "mainImage": save_photo(main, sku), "additionalImages": [save_photo(f, sku) for f in more],
        "capacity": specs.get("capacity", ""), "power": specs.get("power", ""),
        "warranty": specs.get("warranty", ""), "cbm": specs.get("cbm", ""),
        "weight": specs.get("weight", ""), "ctnQuantity": specs.get("ctnQuantity", ""),
        "retailPrice": specs.get("price"), "wholesalePrice": None,
        "specifications": {}, "status": "active", "sortOrder": 0,
        "updatedAt": ADDED_AT, "sourceNotes": NOTE,
    })
    added.append(sku)

by_sku = {p["sku"]: p for p in products}
for sku, files in MORE.items():
    product = by_sku[sku]
    if not product["additionalImages"]:
        product["additionalImages"] = [save_photo(f, sku) for f in files]

priced = []
for product in products:
    specs = sheet.get(model_key(product["sku"]))
    if specs and product["retailPrice"] is None and specs["price"] is not None:
        product["retailPrice"] = specs["price"]
        priced.append(product["sku"])

# New products sit at the end of their own group.
products.sort(key=lambda p: (category_order[p["categoryId"]], p["sortOrder"] if p.get("sourcePage") else 10_000))
for index, product in enumerate(products):
    product["sortOrder"] = index

assert len({p["sku"] for p in products}) == len(products), "Duplicate SKU"
data["priceNote"] = (
    "The PDF catalogue had no visible prices. Retail prices come only from the "
    "air fryer price sheet in Appliance images; every other product starts blank."
)
REFERENCE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps({"added": len(added), "products": len(products), "priced": priced}))
