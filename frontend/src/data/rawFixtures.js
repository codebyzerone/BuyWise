/**
 * Deliberately messy RAW laptop listings - normalization fixtures ONLY.
 *
 * These are NOT normalized products and are NOT part of the app catalog
 * (laptopCatalog.js now serves the curated REAL India catalog built from
 * rawLaptops.js). They exist solely to exercise normalizeProduct():
 *
 *   RAW FIXTURE -> normalizeProduct() -> validateProduct()
 *
 * Values are intentionally inconsistent (mixed strings/objects, currency
 * prefixes, missing fields, ambiguous wording) to prove the "never invent a
 * value" rules: unknown or ambiguous data must stay null, never guessed.
 * Ids, brands, retailers and URLs are synthetic fixtures - no real products,
 * no real retailers, no real dataset.
 */

export const rawFixtures = [
  {
    // Fully messy string-shaped listing.
    id: 'RAW-FIXTURE-01',
    brand: 'Aster Labs',
    model: 'Aster Nitro 15X',
    price: '₹79,990',
    originalPrice: 'M.R.P.: ₹1,29,990',
    currency: 'INR',
    retailer: 'fixture-store-a',
    url: 'https://fixtures.example.com/raw-01',
    checkedAt: '2025-01-15',
    cpu: 'Intel Core i5-13420H 13th Gen 8 cores 12 threads 1.3 GHz (up to 4.6 GHz)',
    gpu: 'NVIDIA GeForce RTX 4050 6GB TGP 75W',
    ram: '16 GB DDR5 5500 MHz',
    storage: '1 TB SSD',
    display: '15.6" FHD 1920x1080 IPS 144Hz',
    battery: '70 Wh',
    weight: '2.29 kg',
    thickness: '22.6 mm',
    connectivity: 'Wi-Fi 6E, Bluetooth 5.3',
    ports: 'USB-C, HDMI 2.1, USB-A',
    os: 'Windows 11 Home',
    webcam: '1080p FHD camera',
    keyboard: 'Backlit keyboard with numeric keypad',
  },

  {
    // Object-shaped listing with everything already structured.
    id: 'RAW-FIXTURE-02',
    brand: 'Aster Labs',
    model: 'Aster Blade 16',
    pricing: {
      currency: 'INR',
      currentPrice: 104990,
      url: 'https://fixtures.example.com/raw-02',
      checkedAt: '2025-01-16',
    },
    retailer: 'fixture-store-b',
    cpu: {
      brand: 'Intel',
      model: 'Core i7-13700H',
      generation: '13th Gen',
      cores: 14,
      threads: 20,
      baseClockGHz: 2.4,
      boostClockGHz: 5.0,
    },
    gpu: { model: 'RTX 4070', vramGb: 8, tgpW: 115 },
    ram: {
      capacityGb: 32,
      type: 'DDR5',
      speedMHz: 5600,
      slots: 2,
      upgradeable: true,
    },
    storage: { capacityGb: 1024, type: 'NVMe SSD', upgradeable: true },
    display: {
      sizeInches: 16,
      resolution: '2560x1600',
      panel: 'IPS',
      refreshRateHz: 165,
    },
    battery: { capacityWh: 90 },
    physical: { weightKg: 2.4, thicknessMm: 21 },
    connectivity: { wifi: 'Wi-Fi 6', bluetooth: 'Bluetooth 5.2' },
    ports: ['USB-C', 'USB-A', 'HDMI 2.1'],
    os: 'Windows 11 Pro',
    keyboard: { backlit: true, numpad: true },
  },

  {
    // Sparse listing - almost everything unknown, must stay null.
    id: 'RAW-FIXTURE-03',
    brand: 'Aster Labs',
    model: 'Aster Basic 14',
    price: '₹34,990',
    retailer: 'fixture-store-a',
    url: 'https://fixtures.example.com/raw-03',
  },

  {
    // GPU outside BuyWise's known model list - tier must stay null.
    id: 'RAW-FIXTURE-04',
    brand: 'Northwind',
    model: 'Northwind Pulse 15',
    price: '₹89,990',
    retailer: 'fixture-store-c',
    url: 'https://fixtures.example.com/raw-04',
    gpu: 'AMD Radeon RX 7600S 8GB',
    ram: '16 GB DDR5',
    storage: '512 GB NVMe SSD',
    display: '15.6-inch 1920x1200 IPS 60Hz',
    os: 'Windows 11 Home',
  },

  {
    // Integrated graphics, OLED display, macOS wording, soldered RAM.
    id: 'RAW-FIXTURE-05',
    brand: 'Northwind',
    model: 'Northwind Air 13',
    price: '₹59,990',
    retailer: 'fixture-store-c',
    url: 'https://fixtures.example.com/raw-05',
    cpu: 'Intel Core i5-1235U 10 cores 12 threads',
    gpu: 'Intel Iris Xe integrated graphics',
    ram: '16 GB LPDDR5 (soldered, not upgradeable)',
    display: '13.6-inch 2880x1800 OLED 60Hz',
    weight: '1.2 kg',
    os: 'macOS Sonoma',
    upgradeability: { ram: false, storage: null },
  },

  {
    // Ambiguous values - everything here must stay null or stay unstated.
    id: 'RAW-FIXTURE-06',
    brand: 'Sable Systems',
    model: 'Sable Studio 14',
    price: 'Price on request',
    retailer: 'fixture-store-d',
    url: 'https://fixtures.example.com/raw-06',
    cpu: 'Octa-core processor',
    ram: '8 GB DDR4',
    storage: '256 GB SSD',
    display: '14-inch HD 1366x768 60Hz TN panel',
    webcam: 'HD camera',
    keyboard: 'Chiclet keyboard',
    os: 'Ubuntu 22.04 LTS',
  },

  {
    // Duplicate id of RAW-FIXTURE-01 from another listing - the catalog-level
    // duplicate detector must catch this pair.
    id: 'RAW-FIXTURE-01',
    brand: 'Aster Labs',
    model: 'Aster Nitro 15X (listing B)',
    price: '₹81,990',
    retailer: 'fixture-store-b',
    url: 'https://fixtures.example.com/raw-01-b',
  },

  {
    // Indian grouping prices, Whr unit, Linux wording, untrimmed port list.
    id: 'RAW-FIXTURE-08',
    brand: 'Sable Systems',
    model: 'Sable Dev 17',
    price: '₹1,07,990',
    originalPrice: '₹1,49,990 (M.R.P.)',
    retailer: 'fixture-store-d',
    url: 'https://fixtures.example.com/raw-08',
    checkedAt: '2025-02-01',
    cpu: 'AMD Ryzen 7 7840HS 8 Cores 16 Threads',
    gpu: 'NVIDIA GeForce RTX 4060 8GB',
    ram: '32 GB DDR5',
    storage: '2 TB SSD',
    display: '17.3-inch 1920x1080 120Hz',
    battery: '90Whr',
    os: 'Linux (Ubuntu)',
    ports: ['HDMI 2.1', '  USB-C  ', 'RJ-45'],
    webcam: '720p camera',
  },

  {
    // Non-INR currency; USD amount must keep its stated currency.
    id: 'RAW-FIXTURE-09',
    brand: 'Aster Labs',
    model: 'Aster Mini 13 (US listing)',
    currency: 'USD',
    price: '$1,199.99',
    retailer: 'fixture-store-us',
    url: 'https://fixtures.example.com/raw-09',
    cpu: 'Apple M2 8 cores',
    gpu: 'Integrated 10-core GPU',
    ram: '16 GB LPDDR4X',
    display: '13.6-inch 2560x1664 60Hz',
    os: 'macOS',
  },
]