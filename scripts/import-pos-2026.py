"""Build the point of sale's item list and photos.

Run:  python scripts/import-pos-2026.py ["path to the Appliance images folder"]

Prices are the retail (موفرەد) ones, in US dollars:
  * OFFER   — "black-friday (2).pdf", pages 2-55: the regular price, the
              percentage and the Black Friday price printed on each page.
  * REGULAR — items the PDF does not have, from the showroom price list of
              1 November 2026 or the showroom catalog 2026 ("Final_catalog_.pdf").
              They have no Black Friday price.

The script stops if a Black Friday price does not agree with its page's
percentage (to the dollar), or if a photo is missing. It writes
src/services/pos/items2026.json and public/pos-items/*.webp (two sizes of each
photo, cut out on a transparent background).
"""
from collections import deque
import json
from pathlib import Path
import re
import sys

from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[1]
PHOTOS = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "Appliance images"
CATALOG = ROOT / "public" / "catalog-assets"
OUT_PHOTOS = ROOT / "public" / "pos-items"
OUT_JSON = ROOT / "src" / "services" / "pos" / "items2026.json"
SIZES = (256, 640)

OFFER = {"name": "Black Friday", "from": "2026-11-01", "to": "2026-12-01"}

CATEGORIES = [
    ("air-fryer", "Air Fryers", "ئێرفرایەر"),
    ("grill", "Grill", "گریل و ستەیک"),
    ("blender", "Blenders & Juicers", "عەسارە و بلێندەر"),
    ("chopper", "Choppers", "چۆپەر"),
    ("coffee", "Coffee Makers", "ئامێری قاوە"),
    ("cooker", "Cookers", "مەنجەڵی کارەبایی"),
    ("hand-blender", "Hand Blenders", "بلێندەری دەستی"),
    ("heater", "Heaters", "سۆبەی کارەبایی"),
    ("iron", "Irons & Steamers", "ئوتو و ئامێری هەڵم"),
    ("steam-cleaner", "Steam Cleaner", "پاککەرەوەی هەڵمی"),
    ("meat-grinder", "Meat Grinder", "مەکینەی قیمە"),
    ("oven", "Electric Ovens", "فڕنی کارەبایی"),
    ("stand-mixer", "Stand Mixers", "عەجانە"),
    ("tea", "Tea Makers & Kettles", "کتری و چایساز"),
    ("toaster", "Toasters", "تۆستەر"),
    ("vacuum", "Vacuum Cleaners", "گسکی کارەبایی"),
    ("air-cooler", "Air Coolers & ACs", "فێنککەرەوە و سپلیت"),
    ("air-purifier", "Air Purifiers", "هەوا پاککەرەوە"),
    ("cooling", "Cooling & Ice", "ساردکەرەوە و سەهۆڵ"),
]

COLORS = {
    "Black": ("ڕەش", "#2A2B2D"),
    "White": ("سپی", "#F6F5F1"),
    "Beige": ("خاکی", "#CDBFAE"),
    "Cream": ("کرێمی", "#EDE3CC"),
    "Grey": ("ڕەساسی", "#8D9196"),
    "Light Grey": ("سلڤەر", "#C5C8CB"),
    "Dark Grey": ("ڕەساسی تۆخ", "#55595E"),
    "Purple": ("مۆر", "#BFA6CF"),
    "Pink": ("پەمەیی", "#EDB0B0"),
    "Blue": ("شین", "#6F8597"),
    "Silver": ("سلڤەر", "#C5C8CB"),
}

CHOP = ("Food Chopper", "چۆپەر")


def item(model, names, category, spec, price, photos, offer=None, percent=None, page=None):
    """`photos` is one file name, or [(code, colour, file name), ...] for a colour family."""
    return dict(model=model, name=names[0], ku=names[1], category=category, spec=spec, price=price,
                offer=offer, percent=percent, page=page, photos=photos)


ITEMS = [
    # ── Air fryers ──────────────────────────────────────────────────────────
    item("V-400", ("Air Fryer", "ئێرفرایەری شوشەدار"), "air-fryer", "10 L · 1800 W", 114, "V-400.png", 80, 30, 2),
    item("V-401", ("Air Fryer", "ئێرفرایەر"), "air-fryer", "8 L · 2000 W", 99, "V-401.png", 79, 20, 3),
    item("V-402", ("Air Fryer", "ئێرفرایەر"), "air-fryer", "9 L · 2200 W", 103, "V-402.png", 82, 20, 4),
    item("V-403", ("Dualfry Grill", "ئێرفرایەری شوشەداری دەبڵ هیتەر"), "air-fryer", "12 L · 2000 W", 133, "V-403.png"),
    item("VAF6502A2", ("Air Fryer", "ئێرفرایەری 7 لیتری"), "air-fryer", "7 L · 1700 W", 72, "V-502.png", 61, 15, 5),
    item("VAF810D", ("Air Fryer", "ئێرفرایەر"), "air-fryer", "8 L · 1800 W", 72, "V-810.png"),
    item("VAF820D", ("Air Fryer", "ئێرفرایەر"), "air-fryer", "8 L · 1800 W", 76, "V-820.png"),
    # ── Grill ───────────────────────────────────────────────────────────────
    item("V-450", ("Steak Machine", "ئامێری ستەیک"), "grill", "2000 W", 144, "V-450 2.png", 122, 15, 6),
    # ── Blenders & juicers ──────────────────────────────────────────────────
    item("V-225", ("Juicer And Blender", "عەسارەی سێتی 5 کارە"), "blender", "2.5 L · 1200 W", 99, "V-225.png", 89, 10, 7),
    item("V-226", ("Blender And Grinder", "عەسارەی 2 کارە"), "blender", "1.5 L · 1200 W", 76, "V-226.png"),
    item("V-228", ("Juice Extractor", "عەسارەی تایبەتی میوەی ڕەق"), "blender", "2 L · 1000 W", 82, "V-228.png", 66, 20, 8),
    item("V-229", ("Food Processor", "فوود پرۆسێسەر"), "blender", "5 L · 1000 W", 76, "V-229.png", 61, 20, 9),
    item("V-230", ("Juice Extractor", "عەسارەی 4 کارە"), "blender", "2 L · 1000 W", 114, "V-230.png", 97, 15, 10),
    item("V-231", ("Table Blender", "عەسارەی 2 کارە"), "blender", "1.7 L · 1400 W", 87, "V-231.png", 74, 15, 11),
    item("V-232", ("Slow Juicer & Ice Cream", "عەسارە"), "blender", "0.45 L · 200 W", 99, "V-232 2.png", 89, 10, 12),
    item("V-806", ("Blender, Chopper & Grinder", "سێتی عەسارە و چۆپەر و تاحونە"), "blender", "1.75 L · 800 W", 57, "V-806.png"),
    item("V-233", ("Gym Blender", "جیم بلێندەری شەحنی"), "blender", "0.5 L · 180 W", 28, [
        ("V-233B", "Black", "V-233.png"), ("V-233W", "White", "V-233W.png"),
        ("V-233P", "Pink", "V-233P.png"), ("V-233BLUE", "Blue", "V-233B.png")]),
    # ── Choppers ────────────────────────────────────────────────────────────
    item("V-801", CHOP, "chopper", "3 L · 400 W", 34, [
        ("V-801B", "Black", "V-801.png"), ("V-801K", "Beige", "V-801K.png"), ("V-801W", "White", "V-801W.png")], 27, 20, 13),
    item("V-802", CHOP, "chopper", "5 L · 600 W", 34, [
        ("V-802B", "Black", "V-802B.png"), ("V-802K", "Beige", "V-802.png")], 27, 20, 14),
    item("V-803", CHOP, "chopper", "5 L · 600 W", 49, [
        ("V-803B", "Black", "V-803.png"), ("V-803K", "Beige", "V-803K.png")], 39, 20, 15),
    item("V-804", CHOP, "chopper", "3 L · 400 W", 30, [
        ("V-804B", "Black", "V-804.png"), ("V-804K", "Beige", "V-804K.png")], 24, 20, 16),
    item("V-805", CHOP, "chopper", "3 L · 400 W", 34, "V-805.png", 27, 20, 17),
    item("VMB01", CHOP, "chopper", "3 L · 400 W", 27, "catalog:vmb01-a7cb2bae0d93.jpg", 22, 20, 18),
    item("VMB02W", CHOP, "chopper", "2 L · 300 W", 23, "VMB02W.png", 18, 20, 19),
    item("VMB04 K", CHOP, "chopper", "2 L · 300 W", 23, "VMB04_K.png", 18, 20, 20),
    item("VMC03", CHOP, "chopper", "6 L · 1000 W", 46, "VMC03.png", 37, 20, 21),
    item("VMC04", CHOP, "chopper", "8 L · 1000 W", 57, "VMC04.png", 46, 20, 22),
    item("VMH01", CHOP, "chopper", "3 L · 400 W", 27, "VMH01.png", 22, 20, 24),
    item("VMH02", CHOP, "chopper", "2 L · 300 W", 23, "VMH02.png", 18, 20, 23),
    item("VMH04", CHOP, "chopper", "2 L · 300 W", 23, "VMH04.png", 18, 20, 25),
    # ── Coffee makers ───────────────────────────────────────────────────────
    item("V-861", ("Espresso Coffee Maker", "ئامێری قاوەی ئێسپرێسۆ"), "coffee", "1.8 L · 1350 W · 20 BAR", 266, "V-861.png", 226, 15, 26),
    item("V-863", ("Fully Automatic Espresso", "ئامێری قاوەی فول ئۆتۆماتیکی"), "coffee", "1.2 L · 1480 W · 19 BAR", 494, [
        ("V-863B", "Black", "V-863B.png"), ("V-863W", "White", "V-863W.png")], 420, 15, 27),
    item("V-864", ("Vio Capsule Pro", "ئامێری قاوەی تایبەتی کەپسول"), "coffee", "0.85 L · 1400 W · 20 BAR", 114, "V-864 right side.png", 97, 15, 28),
    item("V-865", ("Vio Series 800 Coffee Machine", "ئامێری قاوە"), "coffee", "1.8 L · 1350 W · 20 BAR", 280, "V-865.png"),
    item("V-866", ("Vio Series 1000 Coffee Machine", "ئامێری قاوە"), "coffee", "2.6 L · 1350 W · 20 BAR", 340, "V-866.png"),
    # ── Cookers ─────────────────────────────────────────────────────────────
    item("V-200", ("Electric Pressure Cooker", "مەنجەڵی بوخاری"), "cooker", "6 L · 1000 W", 57, "V-200.png", 51, 10, 29),
    # ── Hand blenders ───────────────────────────────────────────────────────
    item("V-807-A", ("Hand Blender Set", "سێتی ئامێری هاند بلێندەر"), "hand-blender", "2 L · 1000 W", 91, "V-807.png", 77, 15, 30),
    item("V-1001", ("Vio Luxmix", "ئامێری بلێندەری دەستی"), "hand-blender", "9 speeds · 1000 W", 35, "V-1001.png"),
    item("V-1002", ("Vio Blend", "ئامێری بلێندەری دەستی"), "hand-blender", "6 speeds · 1200 W", 28, "V-1002.png"),
    # ── Heaters ─────────────────────────────────────────────────────────────
    item("V-652", ("Electric Heater", "سۆبەی کارەبایی"), "heater", "16 inch · 900 W", 53, "V-652.png"),
    item("V-653", ("Crystal Carbon Heater", "سۆبەی کریستاڵ کاربۆن"), "heater", "15 inch · 800 W", 49, "V-653.png"),
    item("V-654", ("Electric Quartz Heater", "سۆبەی کارەبایی"), "heater", "10×10×20 inch · 2000 W", 53, [
        ("V-654B", "Black", "V-654B.png"), ("V-654W", "White", "V-654W.png")]),
    item("V-655", ("Ceramic Electric Heater", "سۆبەی سیرامیک کاربۆن"), "heater", "16 inch · 1000 W", 32, [
        ("V-655", "White", "V-655.png"), ("V-655", "Black", "white:V-655 656 black.png")]),
    item("V-656", ("Ceramic Electric Heater", "سۆبەی سیرامیک کاربۆن"), "heater", "18 inch · 1100 W", 42, [
        ("V-656", "White", "V-656.png"), ("V-656", "Black", "white:V-655 656 black.png")]),
    item("V-657", ("Ceramic Electric Heater", "سۆبەی ستاندی سیرامیک"), "heater", "18 inch · 1100 W", 45, [
        ("V-657", "Black", "V-657 black-Photoroom.png"), ("V-657", "White", "V-657 white-Photoroom.png")]),
    item("V-658", ("Ceramic Electric Heater", "سۆبەی ستاندی سیرامیک"), "heater", "20 inch · 1100 W", 52, "white:658.jpg"),
    item("V-1101", ("Ceramic Electric Heater", "هیتەری شووڵدار"), "heater", "21×9×14 inch · 2000 W", 32, [
        ("V-1101B", "Black", "Black V-1101B.png"), ("V-1101W", "White", "White V-1101W.png")]),
    # ── Irons & steamers ────────────────────────────────────────────────────
    # "On request" in the catalog: off the till until the owner sets its price.
    item("V-302", ("Vio SteamForce Pro Steam Iron", "ئوتوی هەڵمی"), "iron", "390 mL · 2600 W", 0, [
        ("V-302", "Black", "V-302 black.png"), ("V-302", "Silver", "V-302.png")]),
    item("V-305P", ("Upright Garment Steamer", "ئوتوی ستاند (بۆیلەر)"), "iron", "2 L · 2900 W", 190, "V-305P.png"),
    item("V-306", ("Steam Station", "ئوتوی هەڵمی"), "iron", "1.2 L · 2400 W", 87, [
        ("V-306G", "Grey", "V-306G.png"), ("V-306P", "Purple", "V-306P.png")], 78, 10, 32),
    item("V-307", ("Steam Station", "ئوتوی هەڵمی"), "iron", "1 L · 1400 W", 61, [
        ("V-307P", "Purple", "V-307P.png"), ("V-307G", "Cream", "V-307W.png")], 55, 10, 33),
    item("V-308", ("Garment Steamer", "ئوتوی دەستی (هەڵمی)"), "iron", "0.11 L · 1000 W", 29, "V-308.png"),
    item("V-309", ("Steamepro X90", "ئامێری پاککردنەوەی هەڵمی"), "steam-cleaner", "0.33 L · 1500 W", 35, "V-309.png"),
    # ── Meat grinder ────────────────────────────────────────────────────────
    item("V-603", ("Meat Grinder", "مەکینەی قیمە"), "meat-grinder", "5 speeds · 2500 W", 178, "V-603.png", 151, 15, 34),
    # ── Ovens ───────────────────────────────────────────────────────────────
    item("VTOV-56H", ("Electric Oven", "فڕنی کارەبایی"), "oven", "60 L · 2100 W", 133, [
        ("VTOV-56H B", "Black", "VTOV-56H_B.png"), ("VTOV-56H G", "Grey", "VTOV-56H_G.png")]),
    # ── Stand mixers ────────────────────────────────────────────────────────
    item("V-100", ("Stand Mixer", "عەجانە"), "stand-mixer", "10 L · 2200 W", 190, [
        ("V-100 B PRO", "Black", "v-100_B_PRO.png"), ("V-100 10L W PRO", "White", "v-100_10L_W_PRO.png"),
        ("V-100 10L LG PRO", "Light Grey", "v-100_10L_LG_PRO.png"), ("V-100 DG PRO", "Dark Grey", "v-100_DG_PRO.png")], 171, 10, 36),
    item("V-104", ("Stand Mixer With Bowl", "عەجانە"), "stand-mixer", "4 L · 400 W", 49, [
        ("V-104 B", "Black", "V-104 B.png"), ("V-104 W", "White", "V-104 W.png"), ("V-104 G", "Grey", "V-104 G.png")], 44, 10, 37),
    item("V-106", ("Stand Mixer", "عەجانە"), "stand-mixer", "5 L · 1500 W", 190, [
        ("V-106G", "Grey", "V-106G.png"), ("V-106W", "White", "V-106W.png")], 171, 10, 35),
    # ── Tea makers & kettles ────────────────────────────────────────────────
    item("V-501", ("Tea Maker", "سەماوەری کارەبایی"), "tea", "", 72, "V-501S.png", 64, 10, 38),
    item("V-502", ("Tea Maker", "سەماوەری کارەبایی"), "tea", "3.5 L · 1800–2200 W", 72, "V-502B.png", 64, 10, 39),
    item("V-503", ("Tea Maker", "سەماوەری شوشەی کارەبایی"), "tea", "3 L · 1500 W", 84, "V-503.png", 76, 10, 40),
    item("V-507", ("Tea Maker", "کتری و قۆری کارەبایی"), "tea", "1.5 L · 1500 W", 49, "V-507.png"),
    item("V-508", ("Tea Maker", "کتری و قۆری کارەبایی"), "tea", "1.5 L · 1500 W", 49, "V-508.png"),
    item("V-510", ("Cool Touch Kettle", "کتری و قۆری کارەبایی"), "tea", "1.7 L · 2200 W", 34, "V-510.png"),
    item("V-511", ("Cool Touch Kettle", "کتری و قۆری کارەبایی"), "tea", "1.7 L · 2200 W", 34, "V-511.png"),
    item("V-512", ("Cool Touch Kettle", "کتری و قۆری کارەبایی"), "tea", "1.7 L · 2200 W", 34, "V-512.png"),
    item("V-513", ("Cool Touch Kettle", "کتری و قۆری کارەبایی"), "tea", "1.7 L · 2200 W", 34, "V-513.png"),
    # No photo of its own: the price list shows the white V-515 in its place.
    item("V-514", ("Cool Touch Kettle", "کتری و قۆری کارەبایی"), "tea", "1.7 L · 2200 W", 34, "V-515W.png"),
    item("V-515", ("Cool Touch Kettle", "کتری و قۆری کارەبایی"), "tea", "1.7 L · 2200 W", 34, "V-515B.png"),
    item("V-516", ("Tea Maker", "سەماوەری کارەبایی"), "tea", "1 L · 1000 W", 91, "V-516.png", 82, 10, 41),
    item("V-517A", ("Electric Kettle", "کتری کارەبایی"), "tea", "1.7 L · 2200 W", 38, "V-517A.png", 34, 10, 43),
    item("V-518A", ("Electric Kettle", "کتری کارەبایی"), "tea", "1.7 L · 2200 W", 38, "V-518A.png", 34, 10, 45),
    item("V-519A", ("Electric Kettle", "کتری کارەبایی"), "tea", "1.7 L · 2200 W", 38, "V-519A.png", 34, 10, 46),
    item("V-520", ("Vio Levitate Tea Maker", "چایسازی کارەبایی"), "tea", "3.0 + 1.0 L · 2280 W", 105, "V-520.png"),
    item("V-521", ("Vio Solis Tea Maker", "چایسازی کارەبایی"), "tea", "3.0 + 1.0 L · 2280 W", 105, [
        ("V-521", "Grey", "V-521.png"), ("V-521B", "Black", "V-521B.png")]),
    item("V-522", ("Vio Umbra Tea Maker", "چایسازی کارەبایی"), "tea", "1.7 + 1.0 L · 1500 W", 95, "V-522.png"),
    item("V-523", ("Vio Zenith Tea Maker", "چایسازی کارەبایی"), "tea", "1.7 + 1.0 L · 1500 W", 95, "V-523.png"),
    item("V-524", ("Vio Chrono Tea Maker", "چایسازی کارەبایی"), "tea", "1.7 + 1.0 L · 1500 W", 100, "V-524.png"),
    item("V-525", ("Vio Novo Tea Maker", "چایسازی کارەبایی"), "tea", "1.7 + 0.8 L · 1500 W", 80, [
        ("V-525", "Grey", "V-525.png"), ("V-525B", "Black", "V-525B.png"), ("V-525W", "White", "V-525W.png")]),
    # ── Toasters ────────────────────────────────────────────────────────────
    item("V-517B", ("2-Slice Toaster", "تۆستەری کارەبایی"), "toaster", "2 slices · 930 W", 38, "V-517B.png", 34, 10, 42),
    item("V-518B", ("2-Slice Toaster", "تۆستەری کارەبایی"), "toaster", "2 slices · 930 W", 38, "V-518B.png", 34, 10, 44),
    item("V-519B", ("2-Slice Toaster", "تۆستەری کارەبایی"), "toaster", "2 slices · 930 W", 38, "V-519B.png", 34, 10, 47),
    # ── Vacuum cleaners ─────────────────────────────────────────────────────
    item("V-625", ("Vacuum Cleaner", "گسکی قەمەرەی کارەبایی"), "vacuum", "8 L · 2000 W", 133, "V-625.png"),
    item("V-627", ("Vacuum Cleaner", "گسکی قەمەرەی کارەبایی"), "vacuum", "6 L · 2000 W", 133, "V-627.png"),
    item("V-628", ("Vacuum Cleaner", "گسکی شەحن"), "vacuum", "90 min", 190, "V-628.png"),
    item("V-629", ("Vacuum Cleaner", "گسکی شەحن"), "vacuum", "60 min · 400 W", 152, "V-629.png"),
    item("V-630", ("Sweep Vacuum Cleaner", "گسکی شەحنی سڕینەوە"), "vacuum", "60 min · 230 W", 266, "V-630.png", 226, 15, 31),
    item("V-631", ("Vacuum Cleaner", "گسکی سەتڵی"), "vacuum", "18 L · 1800 W", 57, "V-631.png"),
    item("V-632", ("Vacuum Cleaner", "گسکی سەتڵی"), "vacuum", "21 L · 2000 W", 72, "V-632.png"),
    item("VK806 S", ("Vacuum Cleaner", "گسکی قەمەرەی"), "vacuum", "9 L · 2000 W", 76, "VK806_S.png"),
    # ── Air coolers & ACs ───────────────────────────────────────────────────
    item("V-1201", ("Vio Air Conditioner", "سپلیتی جوڵاو"), "air-cooler", "12000 BTU · 1350 W", 285, "V-1201.png", 257, 10, 48),
    item("V-1202", ("Vio Air Conditioner", "سپلیتی جوڵاو"), "air-cooler", "12000 BTU · 1350 W", 285, "V-1202.png", 257, 10, 49),
    item("V-1203", ("Vio Air Cooler", "موبەریدەی جوڵاو"), "air-cooler", "5.5 L · 110 W", 92, [
        ("V-1203G", "Grey", "V-1203G.png"), ("V-1203W", "White", "V-1203W.png")]),
    item("V-1204", ("Vio Air Cooler", "موبەریدەی جوڵاو"), "air-cooler", "52 L · 250 W", 253, "V-1204.png"),
    item("V-1205", ("Vio Air Cooler", "موبەریدەی جوڵاوی دەبڵ پانکە"), "air-cooler", "45 L · 220 W", 158, "V-1205.png"),
    # ── Air purifiers ───────────────────────────────────────────────────────
    item("V-750", ("Vio Aircleaner Mini", "هەوا پاککەرەوە"), "air-purifier", "40 m² · 30 W", 95, "V-750.png", 86, 10, 50),
    item("V-751", ("Vio Aircleaner Max", "هەوا پاککەرەوە"), "air-purifier", "40 m² · 36 W", 158, "V-751.png", 142, 10, 51),
    item("V-752", ("Vio Aircleaner Ultra", "هەوا پاککەرەوە"), "air-purifier", "120 m² · 1386 W", 285, "V-752.png", 257, 10, 52),
    item("V-753", ("Vio Aircleaner Pro", "هەوا پاککەرەوە"), "air-purifier", "60 m² · 1355 W", 222, "V-753.png", 200, 10, 53),
    # ── Cooling & ice ───────────────────────────────────────────────────────
    item("V-900B", ("Icecraft Pro", "ئامێری سەهۆڵ دروستکردن"), "cooling", "1.3 L · 75 W", 82, "V-900.png", 74, 10, 55),
    item("V-903", ("Vio Slushie", "ئامێری دروستکردنی ئەزبەرید"), "cooling", "1.8 L · 200 W", 184, [
        ("V-903B", "Black", "V-903B.png"), ("V-903W", "White", "V-903W.png")], 166, 10, 54),
]


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


# ── Photos ───────────────────────────────────────────────────────────────────
def cut_white(image):
    """Make the white that touches the edges transparent."""
    image = image.convert("RGB")
    image.thumbnail((1400, 1400), Image.LANCZOS)
    w, h = image.size
    px = image.load()
    white = lambda p: min(p) >= 244
    seen = bytearray(w * h)
    queue = deque()
    for x in range(w):
        queue.extend(((x, 0), (x, h - 1)))
    for y in range(h):
        queue.extend(((0, y), (w - 1, y)))
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[y * w + x] or not white(px[x, y]):
            continue
        seen[y * w + x] = 1
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    alpha = Image.frombytes("L", (w, h), bytes(0 if s else 255 for s in seen))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = image.convert("RGBA")
    out.putalpha(alpha)
    return out


def without_steel_bowl(image):
    """V-802 comes without the steel bowl on the right of its photos; what stands in front of it stays."""
    k = image.width / 1400
    s = lambda pts: [(x * k, y * k) for x, y in pts]
    bowl = Image.new("L", image.size, 0)
    ImageDraw.Draw(bowl).polygon(s([
        (642, 398), (700, 378), (760, 342), (950, 336), (1130, 342), (1200, 378), (1264, 398), (1264, 448),
        (1204, 472), (1199, 600), (1194, 720), (1166, 800), (1040, 838), (760, 838), (694, 745), (682, 480),
        (642, 470)]), fill=255)
    keep = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(keep)
    draw.polygon(s([(829, 612), (847, 612), (850, 640), (853, 700), (859, 724), (863, 838), (805, 838), (808, 724),
                    (817, 700), (821, 640)]), fill=255)
    draw.polygon(s([(636, 738), (700, 741), (766, 733), (766, 743), (700, 752), (636, 754)]), fill=255)
    out = image.copy()
    a, r, g, b = out.getchannel("A"), *out.split()[:3]
    pa, pr, pg, pb, pbowl, pkeep = a.load(), r.load(), g.load(), b.load(), bowl.load(), keep.load()
    for y in range(out.height):
        for x in range(out.width):
            if pbowl[x, y] and not pkeep[x, y]:
                gold = y > 755 * k and pr[x, y] > 120 and pr[x, y] - pb[x, y] > 34
                if not gold:
                    pa[x, y] = 0
    out.putalpha(a)
    return out


def load_photo(name):
    if name.startswith("catalog:"):
        return cut_white(Image.open(CATALOG / name[8:]))
    if name.startswith("white:"):
        return cut_white(Image.open(PHOTOS / name[6:]))
    image = Image.open(PHOTOS / name)
    image.draft("RGB", (2000, 2000))
    image = image.convert("RGBA")
    if max(image.size) > 2600:
        image.thumbnail((2600, 2600), Image.LANCZOS)
    box = image.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box == (0, 0, *image.size) and min(image.getchannel("A").getextrema()) == 255:
        image = cut_white(image)
    image = image.crop(box) if box else image
    if name in ("V-802.png", "V-802B.png"):
        image = without_steel_bowl(image)
    return image


def save_photo(source, label):
    image = load_photo(source)
    box = image.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    image = image.crop(box)
    side = max(image.size)
    square = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    base = slug(label)
    for size in SIZES:
        small = square.resize((size, size), Image.LANCZOS)
        small.save(OUT_PHOTOS / f"{base}-{size}.webp", "WEBP", quality=84, alpha_quality=90, method=6)
    return f"/pos-items/{base}"


# ── Checks ───────────────────────────────────────────────────────────────────
problems, pages = [], []
for it in ITEMS:
    if it["offer"] is not None:
        pages.append(it["page"])
        exact = it["price"] * (1 - it["percent"] / 100)
        if abs(it["offer"] - exact) >= 1:
            problems.append(f"{it['model']}: {it['price']} - {it['percent']}% = {exact:.1f}, the list says {it['offer']}")
if sorted(pages) != list(range(2, 56)):
    problems.append(f"PDF pages: {sorted(set(range(2, 56)) - set(pages))} missing")
codes = [v[0] + v[1] for it in ITEMS if isinstance(it["photos"], list) for v in it["photos"]]
codes += [it["model"] for it in ITEMS if not isinstance(it["photos"], list)]
if len(set(codes)) != len(codes):
    problems.append("a code is listed twice")
if problems:
    sys.exit("\n".join(problems))

# ── Write ────────────────────────────────────────────────────────────────────
OUT_PHOTOS.mkdir(parents=True, exist_ok=True)
OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
for old in OUT_PHOTOS.glob("*.webp"):
    old.unlink()

rows, photos = [], 0
for it in ITEMS:
    row = {"id": slug(it["model"]), "model": it["model"], "name": it["name"], "ku": it["ku"],
           "category": it["category"], "spec": it["spec"], "price": it["price"]}
    if not it["price"]:
        row["hidden"] = True
    if it["offer"] is not None:
        row["offer"] = it["offer"]
        row["percent"] = it["percent"]
    if isinstance(it["photos"], list):
        row["variants"] = []
        for code, color, source in it["photos"]:
            image = save_photo(source, f"{it['model']} {code} {color}" if code == it["model"] else code)
            row["variants"].append({"code": code, "color": color, "image": image})
            photos += 1
        row["image"] = row["variants"][0]["image"]
    else:
        row["image"] = save_photo(it["photos"], it["model"])
        photos += 1
    rows.append(row)

OUT_JSON.write_text(json.dumps({
    "source": "black-friday (2).pdf; showroom price list of 1 November 2026 and the showroom catalog 2026 for items without an offer",
    "note": "Retail (mufrad) prices of one piece in US dollars.",
    "offer": OFFER,
    "colors": {name: {"ku": ku, "hex": hex_} for name, (ku, hex_) in COLORS.items()},
    "categories": [{"id": i, "name": n, "ku": k} for i, n, k in CATEGORIES],
    "items": rows,
}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
size = sum(f.stat().st_size for f in OUT_PHOTOS.glob("*.webp"))
print(json.dumps({"items": len(rows), "with_offer": len(pages), "photos": photos, "photo_bytes": size}))
