import type { CatalogDraft, CatalogDraftProduct } from './types';

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character] ?? character));

const money = (value: number | null) => value === null ? '' : String(value.toLocaleString('en-US') + ' IQD');

function productPrice(product: CatalogDraftProduct, draft: CatalogDraft): string {
  if (draft.priceMode === 'none') return '';
  return money(draft.priceMode === 'wholesale' ? product.wholesalePrice : product.retailPrice);
}

function specsFor(product: CatalogDraftProduct, draft: CatalogDraft): string {
  if (!draft.showSpecifications) return '';
  const entries: Array<[string, string]> = [
    ['Capacity', product.capacity], ['Power', product.power], ['Warranty', product.warranty],
    ['Weight', product.weight], ['CBM', product.cbm], ['CTN quantity', product.ctnQuantity],
    ...Object.entries(product.specifications),
  ];
  return entries
    .filter(([key, value]) => Boolean(value) && !product.hiddenSpecifications.includes(key))
    .map(([key, value]) => '<tr><td>' + escapeHtml(key) + '</td><td>' + escapeHtml(value) + '</td></tr>')
    .join('');
}

export function buildCatalogPrintHtml(draft: CatalogDraft): string {
  const categoryName = (id: string) => draft.categories.find((category) => category.id === id)?.name ?? 'Catalog';
  const productCard = (product: CatalogDraftProduct) => {
    const price = productPrice(product, draft);
    return '<article class="product" data-category="' + escapeHtml(product.categoryId) + '">' +
      '<img src="' + escapeHtml(product.mainImage) + '" alt="' + escapeHtml(product.name) + '" />' +
      '<div class="product-copy"><div class="eyebrow">' + escapeHtml(product.sku) + '</div>' +
      '<h2>' + escapeHtml(product.name) + '</h2><div class="category">' + escapeHtml(categoryName(product.categoryId)) + '</div>' +
      (price ? '<div class="price">' + escapeHtml(price) + '</div>' : '') +
      (draft.showSpecifications ? '<table>' + specsFor(product, draft) + '</table>' : '') +
      '<div class="meta"><span>' + escapeHtml(product.capacity || '-') + '</span><span>' + escapeHtml(product.power || '-') + '</span><span>' + escapeHtml(product.warranty || '-') + '</span></div></div></article>';
  };
  let pageNumber = 2;
  const bodyPages: string[] = [];
  for (const category of draft.categories) {
    const products = draft.products.filter((product) => product.categoryId === category.id);
    if (!products.length) continue;
    if (draft.categoryDividers.includes(category.id)) {
      const banner = draft.categoryBanners?.[category.id] ?? '';
      bodyPages.push('<section class="divider">' + (banner ? '<img class="divider-image" src="' + escapeHtml(banner) + '" alt="" />' : '<div class="divider-art"><span>VIO</span></div>') + '<div class="divider-content"><div class="brand">VIO / COLLECTION</div><h2>' + escapeHtml(category.name) + '</h2><p>Designed for everyday living</p></div><footer><span>Vio · ' + escapeHtml(draft.name) + '</span><span>' + String(pageNumber++) + '</span></footer></section>');
    }
    for (let index = 0; index < products.length; index += draft.layout) {
      const group = products.slice(index, index + draft.layout).map(productCard).join('');
      bodyPages.push('<section class="product-page layout-' + String(draft.layout) + '"><header><span class="header-brand">VIO</span><strong>' + escapeHtml(category.name) + '</strong><span class="header-page">' + String(pageNumber) + '</span></header><div class="products">' + group + '</div><footer><span>Vio · ' + escapeHtml(draft.name) + '</span><span>' + String(pageNumber++) + '</span></footer></section>');
    }
  }
  const knownIds = new Set(draft.categories.map((category) => category.id));
  const ungrouped = draft.products.filter((product) => !knownIds.has(product.categoryId));
  for (let index = 0; index < ungrouped.length; index += draft.layout) {
    bodyPages.push('<section class="product-page layout-' + String(draft.layout) + '"><header><span class="header-brand">VIO</span><strong>Products</strong><span class="header-page">' + String(pageNumber) + '</span></header><div class="products">' + ungrouped.slice(index, index + draft.layout).map(productCard).join('') + '</div><footer><span>Vio · ' + escapeHtml(draft.name) + '</span><span>' + String(pageNumber++) + '</span></footer></section>');
  }
  const customPages = draft.customPages.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((page) => '<section class="custom-page">' + (page.image ? '<img src="' + escapeHtml(page.image) + '" alt="" />' : '') + '<div class="brand">VIO / NOTE</div><h2>' + escapeHtml(page.title) + '</h2><p>' + escapeHtml(page.body) + '</p><footer><span>Vio · ' + escapeHtml(draft.name) + '</span><span>' + String(pageNumber++) + '</span></footer></section>').join('');
  const coverImage = draft.coverImage || (draft.products[0] ? draft.products[0].mainImage : '');
  const priceLabel = draft.priceMode === 'none' ? 'Product catalogue' : (draft.priceMode === 'wholesale' ? 'Wholesale' : 'Retail') + ' pricing catalogue';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(draft.name) + '</title><style>' +
    '@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;color:#182033;font-family:Arial,Helvetica,sans-serif;background:#e9edf2}.cover,.product-page,.divider,.custom-page{position:relative;width:210mm;height:297mm;padding:15mm;page-break-after:always;background:#fff;overflow:hidden}.cover{display:grid;grid-template-columns:44% 56%;gap:10mm;align-items:center;padding:20mm 18mm;background:linear-gradient(135deg,#fff 0%,#fff 67%,#faf2f2 100%)}.cover-copy{position:relative;z-index:1}.brand{color:#a5292b;letter-spacing:.24em;font-size:10px;font-weight:800}.cover h1{max-width:90mm;margin:10mm 0 5mm;color:#182033;font-size:38px;line-height:1.04;letter-spacing:-.03em}.cover p{color:#687387;font-size:12px}.cover-rule{width:28mm;height:2px;margin-top:10mm;background:#a5292b}.cover-art{position:relative;height:214mm;overflow:hidden;border-radius:9mm;background:#f3f5f7}.cover-art img{width:100%;height:100%;object-fit:cover}.cover-art:after{position:absolute;inset:0;border:1px solid #fff8;border-radius:9mm;content:""}' +
    '.product-page>header{height:13mm;display:grid;grid-template-columns:1fr auto 1fr;align-items:start;border-bottom:1px solid #e7eaf0}.header-brand{color:#a5292b;font-size:11px;font-weight:900;letter-spacing:.25em}.product-page>header strong{text-align:center;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.header-page{text-align:right;color:#8791a1;font-size:10px}.products{height:249mm;display:grid;align-content:stretch;grid-template-rows:repeat(3,minmax(0,1fr))}.product{display:grid;grid-template-columns:45mm minmax(0,1fr);min-height:0;gap:8mm;padding:5mm 0;border-bottom:1px solid #e7eaf0;page-break-inside:avoid}.product:last-child{border-bottom:0}.product>img{width:45mm;height:57mm;align-self:center;object-fit:contain;border-radius:5mm;background:#f4f6f8}.product-copy{min-width:0;display:flex;flex-direction:column;justify-content:center}.eyebrow{color:#a5292b;letter-spacing:.14em;font-size:8px;font-weight:800}.product h2{margin:2mm 0 1mm;color:#182033;font-size:18px;line-height:1.05}.category{color:#687387;font-size:9px}.price{margin:3mm 0 0;color:#a5292b;font-size:14px;font-weight:800}table{width:100%;margin-top:3mm;border-collapse:collapse;font-size:8px}td{padding:1.5mm 0;border-bottom:1px solid #eef0f4}td:first-child{width:44%;color:#8791a1}.meta{display:flex;flex-wrap:wrap;gap:2mm;margin-top:3mm;color:#687387;font-size:7.5px}.meta span{padding:1.5mm 2mm;background:#f3f5f7;border-radius:2mm}' +
    '.layout-1 .products{grid-template-rows:1fr}.layout-1 .product{grid-template-columns:82mm minmax(0,1fr);gap:12mm}.layout-1 .product>img{width:82mm;height:150mm}.layout-1 .product h2{font-size:27px}.layout-1 table{font-size:10px}.layout-2 .products{grid-template-rows:repeat(2,minmax(0,1fr))}.layout-2 .product{grid-template-columns:62mm minmax(0,1fr);gap:10mm}.layout-2 .product>img{width:62mm;height:91mm}.layout-2 .product h2{font-size:22px}.layout-2 table{font-size:9px}.divider{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;text-align:center;padding:0;background:#faf7f7}.divider-image{width:100%;height:155mm;object-fit:cover}.divider-art{display:grid;width:100%;height:155mm;place-items:center;background:radial-gradient(circle at 50% 35%,#f6dfe0 0,#faf7f7 43%,#f1e7e7 100%)}.divider-art span{color:#a5292b;font-size:42px;font-weight:900;letter-spacing:.24em}.divider-content{width:100%;padding:16mm 20mm 27mm}.divider h2{margin:5mm 0 2mm;color:#182033;font-size:36px;line-height:1.04}.divider p,.custom-page p{color:#687387;font-size:12px}.custom-page{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:#faf7f7}.custom-page img{max-width:85%;max-height:145mm;object-fit:contain;margin-bottom:14mm}.custom-page h2{margin:5mm 0 2mm;font-size:36px}' +
    'footer{position:absolute;bottom:9mm;left:15mm;right:15mm;display:flex;justify-content:space-between;border-top:1px solid #eef0f4;padding-top:4mm;color:#8791a1;font-size:8px}@media screen{body{padding:22px}.cover,.product-page,.divider,.custom-page{margin:0 auto 22px;box-shadow:0 14px 40px #1e293b33}}@media print{body{background:#fff}.cover,.product-page,.divider,.custom-page{margin:0;box-shadow:none}}' +
    '</style></head><body><section class="cover"><div class="cover-copy"><div class="brand">VIO CATALOGUE</div><h1>' + escapeHtml(draft.name) + '</h1><p>' + priceLabel + '</p><div class="cover-rule"></div></div>' +
    '<div class="cover-art">' + (coverImage ? '<img src="' + escapeHtml(coverImage) + '" alt="" />' : '') + '</div>' +
    '<footer><span>Vio · Catalog Management</span><span>1</span></footer></section>' + bodyPages.join('') + customPages + '</body></html>';
}

function openWindow(draft: CatalogDraft, print: boolean): boolean {
  const popup = window.open('', '_blank', 'width=1050,height=800');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(buildCatalogPrintHtml(draft).replace('<head>', '<head><base href="' + escapeHtml(window.location.origin) + '/">'));
  popup.document.close();
  popup.focus();
  if (print) window.setTimeout(() => popup.print(), 750);
  return true;
}

export function openCatalogPreviewWindow(draft: CatalogDraft): boolean {
  return openWindow(draft, false);
}

export function openCatalogPrintWindow(draft: CatalogDraft): boolean {
  return openWindow(draft, true);
}
