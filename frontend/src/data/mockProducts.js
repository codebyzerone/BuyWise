/**
 * Fictional laptop products for development and testing only.
 *
 * - Ids are namespaced BUYWISE-TEST-* and names are obviously synthetic so
 *   these can never be mistaken for real commercial recommendations.
 * - They exist purely to exercise the catalog interface (laptopCatalog.js)
 *   and feasibility.js. Retailer names are synthetic ('test-retailer-*') -
 *   no real retailers or real products are impersonated.
 * - Pricing/source URL fields demonstrate the V1 minimum fields
 *   (see productSchema.js); BUYWISE-TEST-03 additionally carries two
 *   synthetic offers to demonstrate the future multi-retailer price model.
 * - Unknown specifications stay null per the schema rules - never guessed.
 */

export const mockProducts = [
  {
    id: 'BUYWISE-TEST-01',
    brand: 'BuyWise Test Labs',
    model: 'TEST-ALPHA-15',
    category: 'laptop',

    pricing: {
      currency: 'INR',
      currentPrice: 55000,
      originalPrice: 59990,
      source: 'test-retailer-a',
      url: 'https://example.com/buywise-test/01',
      checkedAt: '2024-01-15T00:00:00.000Z',
    },

    offers: [],

    cpu: {
      brand: 'Intel',
      model: 'Core i5-12450H',
      generation: null,
      cores: 8,
      threads: 12,
      baseClockGHz: null,
      boostClockGHz: null,
    },

    gpu: {
      model: 'RTX 3050',
      tier: 'entry-level',
      vramGb: 4,
      tgpW: null,
    },

    ram: {
      capacityGb: 8,
      type: 'DDR4',
      speedMHz: null,
      slots: null,
      upgradeable: true,
      maximumSupportedGb: null,
    },

    storage: {
      capacityGb: 256,
      type: 'NVMe SSD',
      slots: null,
      upgradeable: true,
    },

    display: {
      sizeInches: 15.6,
      resolution: '1366x768',
      panel: 'TN',
      refreshRateHz: 60,
      brightnessNits: null,
      colorGamut: null,
      tier: 'basic',
    },

    battery: { capacityWh: null },

    physical: { weightKg: 2.3, thicknessMm: null },

    connectivity: { wifi: null, bluetooth: null },

    ports: ['USB-A 3.2', 'USB-C', 'HDMI 2.0', 'Audio jack'],

    os: 'windows',

    webcam: { resolution: '720p' },

    keyboard: { backlit: false, numpad: true },

    upgradeability: { ram: true, storage: true },

    source: {
      retailer: 'test-retailer-a',
      productUrl: 'https://example.com/buywise-test/01',
      lastChecked: '2024-01-15T00:00:00.000Z',
    },
  },

  {
    id: 'BUYWISE-TEST-02',
    brand: 'BuyWise Test Labs',
    model: 'TEST-BETA-14',
    category: 'laptop',

    pricing: {
      currency: 'INR',
      currentPrice: 62990,
      originalPrice: null,
      source: 'test-retailer-a',
      url: 'https://example.com/buywise-test/02',
      checkedAt: '2024-01-15T00:00:00.000Z',
    },

    offers: [],

    cpu: {
      brand: 'AMD',
      model: 'Ryzen 5 7530U',
      generation: null,
      cores: 6,
      threads: 12,
      baseClockGHz: null,
      boostClockGHz: null,
    },

    gpu: {
      model: null,
      tier: 'integrated',
      vramGb: null,
      tgpW: null,
    },

    ram: {
      capacityGb: 16,
      type: 'DDR4',
      speedMHz: null,
      slots: null,
      upgradeable: null,
      maximumSupportedGb: null,
    },

    storage: {
      capacityGb: 512,
      type: 'NVMe SSD',
      slots: null,
      upgradeable: null,
    },

    display: {
      sizeInches: 14,
      resolution: '1920x1080',
      panel: 'IPS',
      refreshRateHz: 60,
      brightnessNits: null,
      colorGamut: null,
      tier: 'good',
    },

    battery: { capacityWh: 65 },

    physical: { weightKg: 1.4, thicknessMm: null },

    connectivity: { wifi: null, bluetooth: null },

    ports: [],

    os: 'windows',

    webcam: { resolution: null },

    keyboard: { backlit: null, numpad: false },

    upgradeability: { ram: null, storage: null },

    source: {
      retailer: 'test-retailer-a',
      productUrl: 'https://example.com/buywise-test/02',
      lastChecked: '2024-01-15T00:00:00.000Z',
    },
  },

  {
    id: 'BUYWISE-TEST-03',
    brand: 'BuyWise Test Labs',
    model: 'TEST-GAMMA-16',
    category: 'laptop',

    pricing: {
      currency: 'INR',
      currentPrice: 74990,
      originalPrice: null,
      source: 'test-retailer-a',
      url: 'https://example.com/buywise-test/03',
      checkedAt: '2024-01-15T00:00:00.000Z',
    },

    // Demonstrates the future multi-retailer price-comparison model.
    offers: [
      {
        retailer: 'test-retailer-a',
        currency: 'INR',
        price: 74990,
        url: 'https://example.com/buywise-test/03',
        checkedAt: '2024-01-15T00:00:00.000Z',
      },
      {
        retailer: 'test-retailer-b',
        currency: 'INR',
        price: 73999,
        url: 'https://example.com/buywise-test/03-b',
        checkedAt: '2024-01-15T00:00:00.000Z',
      },
    ],

    cpu: {
      brand: 'Intel',
      model: 'Core i7-13620H',
      generation: null,
      cores: null,
      threads: null,
      baseClockGHz: null,
      boostClockGHz: null,
    },

    gpu: {
      model: 'RTX 4050',
      tier: 'mid-range',
      vramGb: 6,
      tgpW: null,
    },

    ram: {
      capacityGb: 16,
      type: 'DDR5',
      speedMHz: null,
      slots: null,
      upgradeable: true,
      maximumSupportedGb: 32,
    },

    storage: {
      capacityGb: 1024,
      type: 'NVMe SSD',
      slots: null,
      upgradeable: true,
    },

    display: {
      sizeInches: 16,
      resolution: '1920x1080',
      panel: 'IPS',
      refreshRateHz: 60,
      brightnessNits: null,
      colorGamut: null,
      tier: 'good',
    },

    battery: { capacityWh: null },

    physical: { weightKg: 2.2, thicknessMm: null },

    connectivity: { wifi: null, bluetooth: null },

    ports: ['USB-A 3.2', 'USB-C', 'HDMI 2.1'],

    os: 'windows',

    webcam: { resolution: '720p' },

    keyboard: { backlit: true, numpad: true },

    upgradeability: { ram: true, storage: true },

    source: {
      retailer: 'test-retailer-a',
      productUrl: 'https://example.com/buywise-test/03',
      lastChecked: '2024-01-15T00:00:00.000Z',
    },
  },

  {
    id: 'BUYWISE-TEST-04',
    brand: 'BuyWise Test Labs',
    model: 'TEST-DELTA-16',
    category: 'laptop',

    pricing: {
      currency: 'INR',
      currentPrice: 79990,
      originalPrice: 84990,
      source: 'test-retailer-b',
      url: 'https://example.com/buywise-test/04',
      checkedAt: '2024-01-15T00:00:00.000Z',
    },

    offers: [],

    cpu: {
      brand: 'AMD',
      model: 'Ryzen 7 7840HS',
      generation: null,
      cores: null,
      threads: null,
      baseClockGHz: null,
      boostClockGHz: null,
    },

    gpu: {
      model: 'RTX 4060',
      tier: 'mid-range',
      vramGb: 8,
      tgpW: null,
    },

    ram: {
      capacityGb: 16,
      type: 'DDR5',
      speedMHz: null,
      slots: null,
      upgradeable: null,
      maximumSupportedGb: null,
    },

    storage: {
      capacityGb: 2048,
      type: 'NVMe SSD',
      slots: null,
      upgradeable: null,
    },

    display: {
      sizeInches: 16,
      resolution: '2560x1440',
      panel: 'IPS',
      refreshRateHz: 165,
      brightnessNits: null,
      colorGamut: null,
      tier: 'high-refresh',
    },

    battery: { capacityWh: null },

    physical: { weightKg: 2.5, thicknessMm: null },

    connectivity: { wifi: null, bluetooth: null },

    ports: [],

    os: 'linux',

    webcam: { resolution: null },

    keyboard: { backlit: true, numpad: null },

    upgradeability: { ram: null, storage: true },

    source: {
      retailer: 'test-retailer-b',
      productUrl: 'https://example.com/buywise-test/04',
      lastChecked: '2024-01-15T00:00:00.000Z',
    },
  },

  {
    id: 'BUYWISE-TEST-05',
    brand: 'BuyWise Test Labs',
    model: 'TEST-EPSILON-17',
    category: 'laptop',

    pricing: {
      currency: 'INR',
      currentPrice: 89990,
      originalPrice: null,
      source: 'test-retailer-a',
      url: 'https://example.com/buywise-test/05',
      checkedAt: '2024-01-15T00:00:00.000Z',
    },

    offers: [],

    cpu: {
      brand: 'Intel',
      model: 'Core i9-14900HX',
      generation: null,
      cores: null,
      threads: null,
      baseClockGHz: null,
      boostClockGHz: null,
    },

    gpu: {
      model: 'RTX 4070',
      tier: 'high-performance',
      vramGb: 8,
      tgpW: null,
    },

    ram: {
      capacityGb: 32,
      type: 'DDR5',
      speedMHz: null,
      slots: null,
      upgradeable: null,
      maximumSupportedGb: null,
    },

    storage: {
      capacityGb: 2048,
      type: 'NVMe SSD',
      slots: null,
      upgradeable: null,
    },

    display: {
      sizeInches: 17,
      resolution: '2880x1800',
      panel: 'OLED',
      refreshRateHz: 90,
      brightnessNits: null,
      colorGamut: null,
      tier: 'oled',
    },

    battery: { capacityWh: null },

    physical: { weightKg: 2.2, thicknessMm: null },

    connectivity: { wifi: null, bluetooth: null },

    ports: [],

    os: 'windows',

    webcam: { resolution: null },

    keyboard: { backlit: true, numpad: null },

    upgradeability: { ram: null, storage: null },

    source: {
      retailer: 'test-retailer-a',
      productUrl: 'https://example.com/buywise-test/05',
      lastChecked: '2024-01-15T00:00:00.000Z',
    },
  },

  {
    id: 'BUYWISE-TEST-06',
    brand: 'BuyWise Test Labs',
    model: 'TEST-ZETA-13',
    category: 'laptop',

    pricing: {
      currency: 'INR',
      currentPrice: 105000,
      originalPrice: null,
      source: 'test-retailer-b',
      url: 'https://example.com/buywise-test/06',
      checkedAt: '2024-01-15T00:00:00.000Z',
    },

    offers: [],

    cpu: {
      brand: null,
      model: null,
      generation: null,
      cores: null,
      threads: null,
      baseClockGHz: null,
      boostClockGHz: null,
    },

    gpu: {
      model: null,
      tier: 'integrated',
      vramGb: null,
      tgpW: null,
    },

    ram: {
      capacityGb: 16,
      type: 'LPDDR5',
      speedMHz: null,
      slots: null,
      upgradeable: false,
      maximumSupportedGb: null,
    },

    storage: {
      capacityGb: 512,
      type: 'NVMe SSD',
      slots: null,
      upgradeable: null,
    },

    display: {
      sizeInches: 13.6,
      resolution: '2880x1800',
      panel: 'OLED',
      refreshRateHz: 60,
      brightnessNits: null,
      colorGamut: null,
      tier: 'oled',
    },

    battery: { capacityWh: 70 },

    physical: { weightKg: 1.2, thicknessMm: null },

    connectivity: { wifi: null, bluetooth: null },

    ports: [],

    os: 'macos',

    webcam: { resolution: null },

    keyboard: { backlit: true, numpad: false },

    upgradeability: { ram: false, storage: null },

    source: {
      retailer: 'test-retailer-b',
      productUrl: 'https://example.com/buywise-test/06',
      lastChecked: '2024-01-15T00:00:00.000Z',
    },
  },
]