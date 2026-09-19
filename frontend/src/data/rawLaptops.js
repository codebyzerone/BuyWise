/**
 * Curated REAL laptop listings for India - the raw ingestion source.
 *
 * Pipeline position:
 *   rawLaptops.js (this file) -> normalizeProduct() -> validateProduct()
 *   -> laptopCatalog.js (normalized REAL catalog) -> feasibility.js
 *
 * Sourcing rules:
 * - Real products, real retailers and real product-page URLs. Prices were
 *   captured on CHECKED_AT (see each entry) from retailer pages or public
 *   price trackers when retailer pages were inaccessible. No price or spec
 *   is invented: anything not reliably stated by the source stays null after
 *   normalization.
 * - One listing per laptop model (V1 keeps the multi-retailer `offers`
 *   model for later deduplication; see productSchema.js).
 * - Curated by hand. There is NO scraper: entries are maintained in this
 *   file, and every entry keeps its provenance (retailer, url, checkedAt).
 * - `url` is null when no verified product-page URL could be established for
 *   the listing: a purchase link is never guessed or fabricated, so the UI
 *   shows "Link unavailable" instead. Currently null on BW-IN-008,
 *   BW-IN-016 and BW-IN-020.
 */

export const RAW_CATALOG_CHECKED_AT = '2026-09-19'

export const rawLaptops = [
  {
    // Acer Aspire Lite AL15-53 (i3-1305U) - Flipkart listing.
    id: 'BW-IN-001',
    brand: 'Acer',
    model: 'Aspire Lite AL15-53',
    price: '₹54,990',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/acer-aspire-lite-intel-core-i3-13th-gen-1305u-16-gb-512-gb-ssd-windows-11-home-al15-53-thin-and-light-laptop/p/itmb2b6ffaf3b25b',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i3-1305U',
    ram: '16 GB',
    storage: '512 GB SSD',
    os: 'Windows 11 Home',
  },

  {
    // Acer Aspire Lite AL15-52 (i3-1215U) - Flipkart listing.
    id: 'BW-IN-002',
    brand: 'Acer',
    model: 'Aspire Lite AL15-52',
    price: '₹52,990',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/acer-aspire-lite-intel-core-i3-12th-gen-1215u-8-gb-512-gb-ssd-windows-11-home-al15-52-thin-and-light-laptop/p/itm975b259f16ed6',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i3-1215U',
    ram: '8 GB',
    storage: '512 GB SSD',
    os: 'Windows 11 Home',
  },

  {
    // Apple MacBook Air 13.6" M2 (8GB/256GB) - price tracked via Smartprix
    // public product page (retailer pages for this config were not directly
    // accessible at capture time).
    id: 'BW-IN-003',
    brand: 'Apple',
    model: 'MacBook Air 13-inch M2 (8GB/256GB)',
    price: '₹57,999',
    currency: 'INR',
    retailer: 'Smartprix (price tracker)',
    url: 'https://www.smartprix.com/laptops/apple-macbook-air-2022-laptop-apple-m2-8gb-ppd1legzqinv',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Apple M2',
    ram: '8 GB',
    storage: '256 GB SSD',
    display: '13.6-inch Liquid Retina display',
    os: 'macOS',
  },

  {
    // MSI Thin 15 B13UCX-1657IN - Flipkart listing.
    id: 'BW-IN-004',
    brand: 'MSI',
    model: 'Thin 15 B13UCX-1657IN',
    price: '₹63,990',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/msi-thin-15-intel-core-i5-13th-gen-13420h-16-gb-1-tb-ssd-windows-11-home-nvidia-geforce-rtx-3050-b13ucx-1657in-gaming-laptop/p/itm5d6d64b3171c0',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i5-13420H',
    gpu: 'NVIDIA GeForce RTX 3050',
    ram: '16 GB DDR4',
    storage: '1 TB SSD',
    display: '15.6" FHD 144Hz',
    os: 'Windows 11 Home',
  },

  {
    // Lenovo IdeaPad Slim 5 14IRH10 (83HR000WIN) - Lenovo India store,
    // full spec table verified at capture time.
    id: 'BW-IN-005',
    brand: 'Lenovo',
    model: 'IdeaPad Slim 5 14IRH10 (83HR000WIN)',
    price: '₹73,991',
    originalPrice: '₹97,291',
    currency: 'INR',
    retailer: 'Lenovo India Store',
    url: 'https://store.lenovo.com/in/en/nb-ip-slim-5-14irh10-i5-16g-1t-11s-83hr000win-393.html',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: {
      brand: 'Intel',
      model: 'Core i5-13420H',
      generation: '13th Gen',
      boostClockGHz: 4.6,
    },
    gpu: 'Intel UHD Graphics (integrated)',
    ram: '16 GB DDR5-5600 (SODIMM)',
    storage: '1 TB SSD',
    display: '14-inch WUXGA 1920x1200 OLED 60Hz',
    os: 'Windows 11 Home',
    weight: '1.49 kg',
    battery: '60 Wh',
    webcam: '1080p FHD camera',
    keyboard: 'Backlit keyboard',
  },

  {
    // Dell Inspiron 15 3520 (i5-1235U, 16GB/512GB) - Flipkart listing.
    id: 'BW-IN-006',
    brand: 'Dell',
    model: 'Inspiron 15 3520',
    price: '₹75,000',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/dell-inspiron-core-i5-12th-gen-1235u-16-gb-512-gb-ssd-windows-11-home-inspiron-15-3520-thin-light-laptop/p/itmb579a1d2c6a79',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i5-1235U',
    ram: '16 GB',
    storage: '512 GB SSD',
    display: '15.6" FHD',
    os: 'Windows 11 Home',
    weight: '1.85 kg',
  },

  {
    // HP Pavilion 14-dv2041TU - Flipkart listing.
    id: 'BW-IN-007',
    brand: 'HP',
    model: 'Pavilion 14-dv2041TU',
    price: '₹75,414',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/hp-pavilion-core-i5-12th-gen-1235u-16-gb-512-gb-ssd-windows-11-home-14-dv2041tu-thin-light-laptop/p/itm3d8077f046b32',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i5-1235U',
    ram: '16 GB',
    storage: '512 GB SSD',
    display: '14" FHD',
    os: 'Windows 11 Home',
  },

  {
    // Acer Aspire Lite AL15-52H (i7-13620H) - Flipkart listing.
    id: 'BW-IN-008',
    brand: 'Acer',
    model: 'Aspire Lite AL15-52H',
    price: '₹73,990',
    currency: 'INR',
    retailer: 'Flipkart',
    // No verified URL: the curated Flipkart product id ('itmha1qxs8xz4vst')
    // was malformed (non-hex) and no replacement for this exact
    // configuration could be verified from this project, so the purchase
    // link is withheld rather than guessed.
    url: null,
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i7-13620H',
    ram: '16 GB',
    storage: '512 GB SSD',
    os: 'Windows 11 Home',
  },

  {
    // Acer Aspire 7 A715-76G-59WG (RTX 2050) - Flipkart listing.
    // RTX 2050 is outside BuyWise's GPU_MODELS vocabulary -> tier stays null.
    id: 'BW-IN-009',
    brand: 'Acer',
    model: 'Aspire 7 A715-76G-59WG',
    price: '₹83,999',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/acer-aspire-7-intel-core-i5-12th-gen-12450h-8-gb-512-gb-ssd-windows-11-home-nvidia-geforce-rtx-2050-a715-76g-gaming-laptop/p/itm08d4ab60e3b70',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i5-12450H',
    gpu: 'NVIDIA GeForce RTX 2050 4GB',
    ram: '8 GB',
    storage: '512 GB SSD',
    os: 'Windows 11 Home',
  },

  {
    // Apple MacBook Air 13.6" M2 (16GB/256GB, MC7W4HN/A) - Flipkart listing.
    id: 'BW-IN-010',
    brand: 'Apple',
    model: 'MacBook Air 13-inch M2 (16GB/256GB) MC7W4HN/A',
    price: '₹85,900',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/apple-macbook-air-m2-13-6-inch-liquid-retina-display-m2-16gb-memory-256gb-ssd-midnight/p/itmc0eeae19d09f1',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Apple M2',
    ram: '16 GB',
    storage: '256 GB SSD',
    display: '13.6-inch Liquid Retina display',
    os: 'macOS',
  },

  {
    // Lenovo LOQ 15IAX9 (RTX 3050 6GB) - Flipkart listing.
    id: 'BW-IN-011',
    brand: 'Lenovo',
    model: 'LOQ 15IAX9',
    price: '₹89,990',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/lenovo-loq-intel-core-i5-12th-gen-12450hx-16-gb-512-gb-ssd-windows-11-home-6-gb-graphics-nvidia-geforce-rtx-3050-15iax9-gaming-laptop/p/itmbb786f35227bc?pid=COMGYSFGZYMGFJ4A',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i5-12450HX',
    gpu: 'NVIDIA GeForce RTX 3050 6GB',
    ram: '16 GB',
    storage: '512 GB SSD',
    display: '15.6-inch',
    os: 'Windows 11 Home',
    weight: '2.38 kg',
  },

  {
    // HP Victus Gaming Laptop 15-fb3385AX - HP India store, spec sheet
    // verified at capture time (Ryzen 7 7445H / RTX 4050 6GB / 16GB / 512GB /
    // 15.6" FHD 1920x1080 144Hz / Windows 11 Home).
    id: 'BW-IN-012',
    brand: 'HP',
    model: 'Victus Gaming Laptop 15-fb3385AX',
    price: '₹1,19,999',
    originalPrice: '₹2,55,395',
    currency: 'INR',
    retailer: 'HP India Store',
    url: 'https://www.hp.com/in-en/shop/products/laptops/victus-gaming-laptop-15-fb3385ax-e20rqpa-acj',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: { brand: 'AMD', model: 'Ryzen 7 7445H' },
    gpu: 'NVIDIA GeForce RTX 4050 6GB',
    ram: '16 GB',
    storage: '512 GB SSD',
    display: '15.6" FHD 1920x1080 144Hz',
    os: 'Windows 11 Home',
  },

  {
    // Acer Nitro V ANV15-51 (i5-13420H / RTX 4050 / 16GB / 1TB) - Acer India
    // store listing (configuration stated in the store URL slug).
    id: 'BW-IN-013',
    brand: 'Acer',
    model: 'Nitro V ANV15-51',
    price: '₹1,06,990',
    currency: 'INR',
    retailer: 'Acer India Store',
    url: 'https://store.acer.com/en-in/acer-nitro-v-intel-core-i5-13420h-processor-laptop-windows-11-home-1-16-gb-ram-1-tb-ssd-nvidia-geforce-rtxtm-4050-with-6-gb-of-dedicated-gddr6-vram-anv15-51-with-39-6-cm-15-6-ips-full-hd-display-keyboard-obsidian-black-2-113-kg',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i5-13420H',
    gpu: 'NVIDIA GeForce RTX 4050 6GB',
    ram: '16 GB',
    storage: '1 TB SSD',
    display: '15.6" FHD IPS',
    os: 'Windows 11 Home',
    weight: '2.113 kg',
  },

  {
    // MSI Cyborg 15 AI A1VEK-051IN (Core Ultra 5 125H / RTX 4050) - Flipkart.
    id: 'BW-IN-014',
    brand: 'MSI',
    model: 'Cyborg 15 AI A1VEK-051IN',
    price: '₹1,11,990',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/msi-cyborg-15-ai-intel-core-ultra-5-125h-16-gb-1-tb-ssd-windows-11-home-nvidia-geforce-rtx-4050-a1vek-051in-gaming-laptop/p/itmbfa35c5be1a7b',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core Ultra 5 125H',
    gpu: 'NVIDIA GeForce RTX 4050 6GB',
    ram: '16 GB',
    storage: '1 TB SSD',
    os: 'Windows 11 Home',
  },

  {
    // ASUS TUF Gaming A15 FA507NVR-LP204WS - ASUS India store listing
    // (Ryzen 7 7435HS / RTX 4060 8GB / 16GB DDR5 / 1TB / FHD 144Hz).
    id: 'BW-IN-015',
    brand: 'ASUS',
    model: 'TUF Gaming A15 FA507NVR-LP204WS',
    price: '₹1,19,990',
    currency: 'INR',
    retailer: 'ASUS India Store',
    url: 'https://in.store.asus.com/gaming-laptop-asus-tuf-gaming-a15-fa507nvr-lp204ws.html',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'AMD Ryzen 7 7435HS',
    gpu: 'NVIDIA GeForce RTX 4060 8GB',
    ram: '16 GB DDR5',
    storage: '1 TB SSD',
    display: '15.6" FHD 144Hz',
    os: 'Windows 11 Home',
  },

  {
    // Lenovo LOQ 15IRX9 (i5-12450HX / RTX 4060 8GB / 16GB / 512GB) - Flipkart.
    id: 'BW-IN-016',
    brand: 'Lenovo',
    model: 'LOQ 15IRX9',
    price: '₹1,23,000',
    currency: 'INR',
    retailer: 'Flipkart',
    // No verified URL: the curated Flipkart product id ('itmb9b4zdvgfjhzq')
    // was malformed (non-hex) and no replacement for this exact
    // configuration could be verified from this project, so the purchase
    // link is withheld rather than guessed.
    url: null,
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Intel Core i5-12450HX',
    gpu: 'NVIDIA GeForce RTX 4060 8GB',
    ram: '16 GB',
    storage: '512 GB SSD',
    display: '15.6-inch 144Hz',
    os: 'Windows 11 Home',
  },

  {
    // Dell G15 5530 (i7-13650HX / RTX 4060 8GB / 16GB DDR5 / 1TB) - Amazon.in
    // listing; price cross-checked via digit.in spec/price page.
    id: 'BW-IN-017',
    brand: 'Dell',
    model: 'G15 5530 Gaming Laptop',
    price: '₹1,21,990',
    currency: 'INR',
    retailer: 'Amazon.in',
    url: 'https://www.amazon.in/dp/B0C4ZWZJ9S',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: {
      brand: 'Intel',
      model: 'Core i7-13650HX',
      generation: '13th Gen',
      boostClockGHz: 4.9,
    },
    gpu: 'NVIDIA GeForce RTX 4060 8GB',
    ram: '16 GB DDR5 4800 MHz',
    storage: '1 TB SSD',
    display: '15.6" 1920x1080',
    os: 'Windows 11 Home',
    weight: '2.65 kg',
    webcam: '720p camera',
    keyboard: '4-zone RGB backlit keyboard with numeric keypad',
  },

  {
    // Apple MacBook Air 13.6" M5 (16GB/512GB, MDH74HN/A) - Flipkart listing.
    id: 'BW-IN-018',
    brand: 'Apple',
    model: 'MacBook Air 13-inch M5 (16GB/512GB) MDH74HN/A',
    price: '₹1,19,900',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/apple-macbook-air-m5-13-6-inch-liquid-retina-display-m5-16gb-memory-512gb-ssd-midnight/p/itmd76ea2d7ba3f25?pid=COMHGRAVHFT7XCH2',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Apple M5',
    ram: '16 GB',
    storage: '512 GB SSD',
    display: '13.6-inch Liquid Retina display',
    os: 'macOS',
  },

  {
    // Apple MacBook Air 13.6" M5 (16GB/1TB, MDHH4HN/A) - Flipkart listing.
    id: 'BW-IN-019',
    brand: 'Apple',
    model: 'MacBook Air 13-inch M5 (16GB/1TB) MDHH4HN/A',
    price: '₹1,39,900',
    currency: 'INR',
    retailer: 'Flipkart',
    url: 'https://www.flipkart.com/apple-macbook-air-m5-13-6-inch-liquid-retina-display-m5-16gb-memory-1tb-ssd-sky-blue/p/itme5933e24a24a56?pid=COMHGDWQC4ZGHRBY',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Apple M5',
    ram: '16 GB',
    storage: '1 TB SSD',
    display: '13.6-inch Liquid Retina display',
    os: 'macOS',
  },

  {
    // Apple MacBook Air 15.3" M5 (16GB/1TB, MDVT4HN/A) - Flipkart listing.
    id: 'BW-IN-020',
    brand: 'Apple',
    model: 'MacBook Air 15-inch M5 (16GB/1TB) MDVT4HN/A',
    price: '₹1,64,900',
    currency: 'INR',
    retailer: 'Flipkart',
    // No verified URL: the curated Flipkart product id ('itmnbwzdgngvgdwf')
    // was malformed (non-hex) and no replacement for this exact
    // configuration could be verified from this project, so the purchase
    // link is withheld rather than guessed.
    url: null,
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: 'Apple M5',
    ram: '16 GB',
    storage: '1 TB SSD',
    display: '15.3-inch Liquid Retina display',
    os: 'macOS',
  },

  {
    // Lenovo Legion 5 16IRX9 (83DG009DIN) - Lenovo India store, full spec
    // table verified at capture time (i7-14650HX / RTX 4070 8GB / 16GB DDR5 /
    // 1TB / 16" WQXGA 2560x1600 IPS 165Hz / 80Wh).
    id: 'BW-IN-021',
    brand: 'Lenovo',
    model: 'Legion 5 16IRX9 (83DG009DIN)',
    price: '₹1,72,491',
    originalPrice: '₹2,38,591',
    currency: 'INR',
    retailer: 'Lenovo India Store',
    url: 'https://store.lenovo.com/in/en/nb-ln-legion-5-16irx9-i7-16g-1t-11s-83dg009din-375.html',
    checkedAt: RAW_CATALOG_CHECKED_AT,
    cpu: {
      brand: 'Intel',
      model: 'Core i7-14650HX',
      generation: '14th Gen',
      boostClockGHz: 5.2,
    },
    gpu: 'NVIDIA GeForce RTX 4070 Laptop GPU 8GB GDDR6',
    ram: '16 GB DDR5-5600MHz',
    storage: '1 TB SSD',
    display: '16-inch WQXGA 2560x1600 IPS 165Hz',
    os: 'Windows 11 Home',
    battery: '80 Wh',
    connectivity: 'Wi-Fi 6E, Bluetooth 5.1',
    webcam: '1080p FHD camera',
    keyboard: '4-zone RGB backlit keyboard',
  },
]