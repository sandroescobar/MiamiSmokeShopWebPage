// index.js (ESM)
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import ejsLayouts from 'express-ejs-layouts';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import { sendSlackOrderNotification } from './utils/slack.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_IMAGE_ROOT = path.join(__dirname, 'public', 'images', 'imagesForProducts');

const app = express();

app.set('trust proxy', true);


/* --------------------  EJS + layouts  -------------------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/main');

/* --------------------  Static /public  -------------------- */
app.use(express.static(path.join(__dirname, 'public')));

/* --------------------  JSON parsing  -------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



const AGECHECKER_ACCOUNT_HASH = process.env.AGECHECKER_ACCOUNT_HASH || '21LdVe41D0My3QjL';
const AGECHECKER_API_KEY = process.env.AGECHECKER_API_KEY || '9g2Z8WhFz2LhbQANYf8YjPf7930jzSrY';

app.get('/agechecker/init.js', async (req, res) => {
  try {
    const upstream = `https://agechecker.net/h/${AGECHECKER_ACCOUNT_HASH}/init.js`;
    const r = await fetch(upstream);

    // If AgeChecker ever returns non-200, surface it for debugging
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(r.status).send(txt || `AgeChecker upstream error: ${r.status}`);
    }

    const js = await r.text();
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(js);
  } catch (err) {
    res.status(502).send('AgeChecker proxy failed');
  }
});



// Fix for "NotSameOrigin" and CORS issues with 3rd party scripts (AgeChecker, Google Maps)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

/* --------------------  Config resolve  -------------------- */
const clean = (v) => (typeof v === 'string' ? v.trim() : v);

function parseMysqlUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: clean(decodeURIComponent(u.username)),
      password: clean(decodeURIComponent(u.password)),
      database: clean(u.pathname.replace(/^\//, '')),
    };
  } catch {
    return null;
  }
}

const urlCfg = process.env.MYSQL_PUBLIC_URL
  ? parseMysqlUrl(process.env.MYSQL_PUBLIC_URL)
  : null;

const cfg = urlCfg || {
  host: clean(process.env.DB_HOST || process.env.MYSQLHOST || 'localhost'),
  port: Number(clean(process.env.DB_PORT || process.env.MYSQLPORT || 3306)),
  user: clean(process.env.DB_USER || process.env.MYSQLUSER),
  password: clean(process.env.DB_PASSWORD || process.env.MYSQLPASSWORD),
  database: clean(process.env.DB_NAME || process.env.MYSQLDATABASE),
};

// SSL mode for Railway public proxy
const sslMode = String(process.env.DB_SSL || '').toLowerCase();
let ssl;
if (sslMode === 'skip-verify') {
  ssl = { rejectUnauthorized: false };
} else if (sslMode === 'true' || sslMode === 'require') {
  ssl = {};
} else {
  ssl = undefined;
}

// Safe debug (never print the secret)
console.log(
  'DB cfg →',
  { host: cfg.host, port: cfg.port, user: cfg.user, db: cfg.database, ssl: sslMode, pwd_len: (cfg.password || '').length }
);

const CONTACT_INFO = {
  email: process.env.SUPPORT_EMAIL || 'support@miamivapesmokeshop.com',
  phone: process.env.SALES_PHONE || '(305) 555-1212',
  addresses: [
    'Miami Vape Smoke Shop #1 • 6346 SW 8th St, West Miami, FL 33144',
    'Miami Vape Smoke Shop #2 • 351 NE 79th St Unit 101, Miami, FL 33138',
    process.env.MKT_ADDRESS_FULL || 'Miami Mkt Bodega • 214 NW 8th St, Miami, FL 33136'
  ],
};

const STORE_CHOICES = [
  {
    id: 'calle8',
    label: 'Calle 8',
    address: CONTACT_INFO.addresses[0],
    note: 'Closest for Coral Gables, West Miami, Little Havana deliveries',
    image: '/images/calle_ocho.jpg'
  },
  {
    id: '79th',
    label: '79th Street',
    address: CONTACT_INFO.addresses[1],
    note: 'Best for Upper Eastside, Wynwood, Miami Shores, Biscayne Corridor',
    image: '/images/miami_vape_storefront_clean.webp'
  },
  {
    id: 'mkt',
    label: 'Market',
    address: CONTACT_INFO.addresses[2],
    note: 'Best for Downtown, Overtown, Brickell area deliveries',
    image: '/images/miami_mkt_front.webp'
  },
];

const STORE_CHOICE_MAP = new Map(STORE_CHOICES.map((choice) => [choice.id, choice]));
const STORE_NAME_BY_ID = Object.fromEntries(STORE_CHOICES.map((choice) => [choice.id, choice.label]));
const DEFAULT_SHOP = 'calle8';

const FEATURED_FULL_PRODUCTS = [
  'LOST MARY TURBO 35K',
  'LOST MARY ULTRASONIC',
  'GEEKBAR X 25K',
  'RAZ LTX 25K',
  'RAZ LTX 25K ZERO NIC',
  'RAZ 9K',
  'RAZ 9K ZERO NIC',
  'OLIT HOOKALIT 40K',
  'OLIT HOOKALIT 60K',
  'CUVIE PLUS',
  'CUVIE MARS',
  'CUVIE GLAZE',
  'CUVIE GO 35K',
  'FUME EXTRA',
  'FUME ULTRA',
  'FUME INFINITY',
  'FUME PRO 30K',
  'FUME PRO 30K ZERO NIC',
  'DESTINO PRE ROLL 1GR',
  'GRABBA LEAF SMALL',
  'GEEKBAR 15K',
  'BACKWOODS 5PK',
  'ZYN 3MG',
  'ZYN 6MG',
  'GRABBA LEAF WHOLE',
  'CUVIE 2.0 NO NICOTINE',
  'NEXA 35K',
  'RAW CONE 20PK',
  'RAW CONE 3PK',
  'RAW CONE CLASSIC 1_4'
];

const FEATURED_IMAGE_GAPS = new Set([
  'OLIT HOOKALIT 60K',
  'LOST MARY ULTRASONIC',
  'DESTINO PRE ROLL 1GR'
].map(name => {
  // Normalize to base key for consistent gap checking
  const normalized = normalizeProductName(name);
  const base = extractProductVariantKey(normalized);
  return (base || normalized).toUpperCase();
}));
const SINGLE_VARIANT_FEATURED_BASES = new Set([
  'GRABBA LEAF SMALL',
  'GRABBA LEAF WHOLE',
  'RAW CONE 20PK',
  'RAW CONE 3PK',
  'RAW CONE CLASSIC 1_4'
].map((name) => name.toUpperCase()));
const IMAGE_READY_ALLOWLIST = new Set([
  'GRABBA LEAF SMALL',
  'GRABBA LEAF WHOLE',
  'CUVIE 2.0 NO NICOTINE',
  'NEXA 35K',
  'CUVIE PLUS',
  'BACKWOODS 5PK',
  'RAW CONE 20PK',
  'RAW CONE 3PK',
  'RAW CONE CLASSIC 1_4'
].map((name) => name.toUpperCase()));
const SHOW_ALL_LOCAL = String(process.env.LOCAL_SHOW_ALL || '').toLowerCase() === 'true';
const VALID_IMAGE_EXT = /\.(?:png|jpe?g|webp)$/i;
const HIDDEN_CATEGORY_NAMES = new Set([
  'THCA PRODUCTS',
  'EDIBLES',
  'DEVICES: BATTERIES & MODS',
  'BB CART 1GR',
  'BB PEN 1GR'
]);
const PRODUCT_EXCLUSION_KEYWORDS = [
  'THC',
  'THCA',
  'DELTA',
  'HHC',
  'PRE ROLL',
  'PREROLL',
  'PRE-ROLL'
];
const PRODUCTS_PAGE_SIZE = 30;
const SNAPSHOT_TABLES = ['inventory_calle8', 'inventory_79th', 'inventory_mkt'];
const SHOP_TABLES = {
  calle8: ['inventory_calle8'],
  '79th': ['inventory_79th'],
  mkt: ['inventory_mkt']
};
const SHOP_ALIAS_MAP = new Map([
  ['calle8', 'calle8'],
  ['calle 8', 'calle8'],
  ['calle-8', 'calle8'],
  ['8th', 'calle8'],
  ['79th', '79th'],
  ['79', '79th'],
  ['79th street', '79th'],
  ['mkt', 'mkt'],
  ['market', 'mkt'],
  ['bodega', 'mkt']
]);

function buildSnapshotAggSql(tables = SNAPSHOT_TABLES) {
  const list = Array.isArray(tables) && tables.length ? tables : SNAPSHOT_TABLES;
  const rowsSql = list
    .map((table) => `SELECT name, quantity, is_active FROM \`${table}\``)
    .join('\n    UNION ALL\n    ');
  return `
    SELECT
      UPPER(name) AS name_key,
      SUM(CASE WHEN COALESCE(is_active, 1) = 1 THEN quantity ELSE 0 END) AS total_qty,
      MAX(CASE WHEN COALESCE(is_active, 1) = 1 THEN 1 ELSE 0 END) AS any_active
    FROM (
      ${rowsSql}
    ) snapshot_rows
    GROUP BY UPPER(name)
  `;
}

function normalizeShop(value = '') {
  const key = String(value || '').trim().toLowerCase();
  return SHOP_ALIAS_MAP.get(key) || DEFAULT_SHOP;
}

function getStoreChoice(id = DEFAULT_SHOP) {
  return STORE_CHOICE_MAP.get(id) || STORE_CHOICE_MAP.get(DEFAULT_SHOP);
}

function containsExcludedKeyword(value = '') {
  const upperValue = value.toUpperCase();
  return PRODUCT_EXCLUSION_KEYWORDS.some((keyword) => upperValue.includes(keyword));
}

function buildStaticVariantImageMappings() {
  const entries = [];
  try {
    const brandDirs = fs.readdirSync(STATIC_IMAGE_ROOT, { withFileTypes: true });
    for (const dir of brandDirs) {
      if (!dir.isDirectory()) continue;
      const brandName = dir.name.trim();
      const dirPath = path.join(STATIC_IMAGE_ROOT, dir.name);
      const files = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !VALID_IMAGE_EXT.test(file.name)) continue;
        const flavorLabel = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        let match;
        const normFlavor = normalizeVariantKey(flavorLabel);
        const normBrand = normalizeVariantKey(brandName);
        if (normFlavor.startsWith(normBrand)) {
          match = flavorLabel;
        } else {
          match = `${brandName} ${flavorLabel}`.trim();
        }
        const encodedBrand = encodeURIComponent(dir.name).replace(/%2F/gi, '/');
        const encodedFile = encodeURIComponent(file.name).replace(/%2F/gi, '/');
        entries.push({
          match,
          imageUrl: `/images/imagesForProducts/${encodedBrand}/${encodedFile}`,
          imageAlt: `${brandName} • ${flavorLabel || brandName}`
        });
      }
    }
  } catch (err) {
    console.error('Error loading static variant images:', err.message);
  }
  return entries;
}

function buildVariantImageLookup(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    const key = normalizeVariantKey(entry.match);
    if (!key) continue;
    map.set(key, entry);

    // If the match starts with the brand name and the flavor part is redundant (same as brand)
    // also map it to just the brand name key for easier lookups
    if (entry.imageAlt && entry.imageAlt.includes(' • ')) {
      const [brand, flavor] = entry.imageAlt.split(' • ');
      if (normalizeVariantKey(brand) === normalizeVariantKey(flavor)) {
        const brandKey = normalizeVariantKey(brand);
        if (!map.has(brandKey)) {
          map.set(brandKey, entry);
        }
      }
    }
  }
  return map;
}

function normalizeVariantKey(value = '') {
  const normalized = normalizeProductName(value);
  if (!normalized) return '';
  return normalized.replace(/[^0-9A-Z]/gi, '').toUpperCase();
}

function buildImageReadyBaseSet(map = new Map()) {
  const bases = new Set();
  for (const entry of map.values()) {
    const base = extractProductVariantKey(normalizeProductName(entry.match));
    if (!base) continue;
    bases.add(base.toUpperCase());
  }
  return bases;
}

function applyLocalQtyOverride(items = [], shopId = '') {
  if (!SHOW_ALL_LOCAL) return items;

  const targetBases = new Set([
    'GRABBA LEAF WHOLE',
    'CUVIE 2.0 NO NICOTINE',
    'NEXA 35K',
    'CUVIE PLUS',
    'BACKWOODS 5PK',
    'RAW CONE 20PK',
    'RAW CONE 3PK',
    'RAW CONE CLASSIC 1_4'
  ].map(n => {
    const norm = normalizeProductName(n);
    const base = extractProductVariantKey(norm);
    return (base || norm).toUpperCase();
  }));

  const shopRestrictedBases = new Set([
    'CUVIE 2.0 NO NICOTINE',
    'BACKWOODS 5PK'
  ].map(n => {
    const norm = normalizeProductName(n);
    const base = extractProductVariantKey(norm);
    return (base || norm).toUpperCase();
  }));

  items.forEach(item => {
    const norm = normalizeProductName(item.name);
    const upperName = norm.toUpperCase();
    const base = extractProductVariantKey(norm).toUpperCase();

    // Force rolling papers, cones, wraps, and tips to be live
    if (/\b(PAPER|CONE|WRAP|TIPS)\b/i.test(upperName)) {
      item.any_active = 1;
      return;
    }

    if (targetBases.has(base)) {
      // If it's a restricted base, only override if it's 79th or calle8
      if (shopRestrictedBases.has(base)) {
        if (shopId === '79th' || shopId === 'calle8') {
          item.any_active = 1;
        }
      } else {
        item.any_active = 1;
      }
    }
  });

  return items;
}

function isImageReadyBase(name) {
  const normalizedBase = extractProductVariantKey(normalizeProductName(name));
  if (!normalizedBase) return false;
  const upperBase = normalizedBase.toUpperCase();
  if (FEATURED_IMAGE_GAPS.has(upperBase)) {
    return false;
  }
  return IMAGE_READY_BASES.has(upperBase);
}

function getVariantImage(baseName, flavor) {
  const variantName = `${baseName} ${flavor}`.trim();
  const key = normalizeVariantKey(variantName);
  if (!key) return null;

  const match = VARIANT_IMAGE_LOOKUP.get(key);
  if (match) return match;

  // Fallback: If flavor is "Original" or matches baseName, try baseName alone
  if (flavor === 'Original' || normalizeVariantKey(flavor) === normalizeVariantKey(baseName)) {
    const baseKey = normalizeVariantKey(baseName);
    return VARIANT_IMAGE_LOOKUP.get(baseKey) || null;
  }

  return null;
}

const VARIANT_IMAGE_MAPPINGS = [
  {
    match: 'LOST MARY TURBO 35K BLACKBERRY BLUEBERRY',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/BLACKBERRYBLUEBERRY.jpeg',
    imageAlt: 'Lost Mary Turbo 35K • Blackberry Blueberry'
  },
  {
    match: 'LOST MARY TURBO 35K TOASTED BANANA',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/TOASTEDBANANA.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Toasted Banana'
  },
  {
    match: 'LOST MARY TURBO 35K MIAMI MINT',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/MIAMIMINT.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Miami Mint'
  },
  {
    match: 'LOST MARY TURBO 35K BLUE RAZZ ICE',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/BLUERAZZICE.jpeg',
    imageAlt: 'Lost Mary Turbo 35K • Blue Razz Ice'
  },
  {
    match: 'LOST MARY TURBO 35K STRAWBERRY KIWI',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/STRAWBERRYKIWI.jpeg',
    imageAlt: 'Lost Mary Turbo 35K • Strawberry Kiwi'
  },
  {
    match: 'LOST MARY TURBO 35K STRAWMELON PEACH',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/STRAWMELONPEACH.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Strawmelon Peach'
  },
  {
    match: 'LOST MARY TURBO 35K SUMMER GRAPE',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/SUMMERGRAPE.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Summer Grape'
  },
  {
    match: 'LOST MARY TURBO 35K WATERMELON ICE',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/WATERMELONICE.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Watermelon Ice'
  },
  {
    match: 'LOST MARY TURBO 35K SCARY BERRY',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/SCARYBERRY.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Scary Berry'
  },
  {
    match: 'LOST MARY TURBO 35K BAJA SPLASH',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/BAJASPLASH.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Baja Splash'
  },
  {
    match: 'LOST MARY TURBO 35K GOLDEN BERRY',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/GOLDENBERRY.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Golden Berry'
  },
  {
    match: 'LOST MARY TURBO 35K ORANGE PASSION MANGO',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/ORANGEPASSIONMANGO.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Orange Passion Mango'
  },
  {
    match: 'LOST MARY TURBO 35K WINTER MINT',
    imageUrl: '/images/imagesForProducts/LOST%20MARY%20TURBO%2035K/WINTERMINT.jpg',
    imageAlt: 'Lost Mary Turbo 35K • Winter Mint'
  },
  {
    match: 'GEEKBAR X 25K BANANA TAFFY FREEZE',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/BANANATAFFYFREEZE.jpg',
    imageAlt: 'GEEKBAR X 25K • Banana Taffy Freeze'
  },
  {
    match: 'GEEKBAR X 25K ATL MINT',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/ATLMINT.jpeg',
    imageAlt: 'GEEKBAR X 25K • ATL Mint'
  },
  {
    match: 'GEEKBAR X 25K BLACKBERRY B-BURST',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/BLACKBERRYBBURST.jpg',
    imageAlt: 'GEEKBAR X 25K • Blackberry B-Burst'
  },
  {
    match: 'GEEKBAR X 25K BLACKBERRY BLUEBERRY',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/BLACKBERRYBLUEBERRY.jpg',
    imageAlt: 'GEEKBAR X 25K • Blackberry Blueberry'
  },
  {
    match: 'GEEKBAR X 25K BLACKBERRY B-POP',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/BLACKBERRYBPOP.jpg',
    imageAlt: 'GEEKBAR X 25K • Blackberry B-Pop'
  },
  {
    match: 'GEEKBAR X 25K BLUEBERRY JAM',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/BLUEBERRYJAM.jpg',
    imageAlt: 'GEEKBAR X 25K • Blueberry Jam'
  },
  {
    match: 'GEEKBAR X 25K BLUE RANCHER',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/BLUERANCHER.jpg',
    imageAlt: 'GEEKBAR X 25K • Blue Rancher'
  },
  {
    match: 'GEEKBAR X 25K BLUE RAZZ ICE',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/BLUERAZZICE.jpg',
    imageAlt: 'GEEKBAR X 25K • Blue Razz Ice'
  },
  {
    match: 'GEEKBAR X 25K COLA SLUSH',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/COLASLUSH.jpg',
    imageAlt: 'GEEKBAR X 25K • Cola Slush'
  },
  {
    match: 'GEEKBAR X 25K COOL MINT',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/COOLMINT.jpg',
    imageAlt: 'GEEKBAR X 25K • Cool Mint'
  },
  {
    match: 'GEEKBAR X 25K GRAPE SLUSH',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/GRAPESLUSH.jpg',
    imageAlt: 'GEEKBAR X 25K • Grape Slush'
  },
  {
    match: 'GEEKBAR X 25K LEMON HEADS',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/LEMONHEADS.jpg',
    imageAlt: 'GEEKBAR X 25K • Lemon Heads'
  },
  {
    match: 'GEEKBAR X 25K MIAMI MINT',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/MIAMIMINT.jpg',
    imageAlt: 'GEEKBAR X 25K • Miami Mint'
  },
  {
    match: 'GEEKBAR X 25K SOUR FCUKING FAB',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/SOURFCUKINGFAB.jpg',
    imageAlt: 'GEEKBAR X 25K • Sour Fcuking Fab'
  },
  {
    match: 'GEEKBAR X 25K ORANGE JAM',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/ORANGEJAM.jpg',
    imageAlt: 'GEEKBAR X 25K • Orange Jam'
  },
  {
    match: 'GEEKBAR X 25K ORANGE SLUSH',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/ORANGESLUSH.jpg',
    imageAlt: 'GEEKBAR X 25K • Orange Slush'
  },
  {
    match: 'GEEKBAR X 25K PEACH JAM',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/PEACHJAM.jpg',
    imageAlt: 'GEEKBAR X 25K • Peach Jam'
  },
  {
    match: 'GEEKBAR X 25K PEACH PERFECT SLUSH',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/PEACHPERFECTSLUSH.jpg',
    imageAlt: 'GEEKBAR X 25K • Peach Perfect Slush'
  },
  {
    match: 'GEEKBAR X 25K PEPPERMINTZ',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/PEPPERMINTZ.jpg',
    imageAlt: 'GEEKBAR X 25K • Peppermintz'
  },
  {
    match: 'GEEKBAR X 25K RASPBERRY JAM',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/RASPBERRYJAM.jpg',
    imageAlt: 'GEEKBAR X 25K • Raspberry Jam'
  },
  {
    match: 'GEEKBAR X 25K RASPBERRY PEACH LIME',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/RASPBERRYPEACHLIME.jpg',
    imageAlt: 'GEEKBAR X 25K • Raspberry Peach Lime'
  },
  {
    match: 'GEEKBAR X 25K RASBERRY PEACH LIME',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/RASBERRYPEACHLIME.jpg',
    imageAlt: 'GEEKBAR X 25K • Rasberry Peach Lime'
  },
  {
    match: 'GEEKBAR X 25K SOUR APPLE ICE',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/SOURAPPLEICE.jpg',
    imageAlt: 'GEEKBAR X 25K • Sour Apple Ice'
  },
  {
    match: 'GEEKBAR X 25K SOUR STRAWS',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/SOURSTRAWS.jpg',
    imageAlt: 'GEEKBAR X 25K • Sour Straws'
  },
  {
    match: 'GEEKBAR X 25K WILD CHERRY SLUSH',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/WILDCHERRYSLUSH.jpg',
    imageAlt: 'GEEKBAR X 25K • Wild Cherry Slush'
  },
  {
    match: 'GEEKBAR X 25K SOUR MANGO PINEAPPLE',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/SOURMANGOPINEAPPLE.jpg',
    imageAlt: 'GEEKBAR X 25K • Sour Mango Pineapple'
  },
  {
    match: 'GEEKBAR X 25K STRAWBERRY B-BURST',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/STAWBERRYBBURST.jpg',
    imageAlt: 'GEEKBAR X 25K • Strawberry B-Burst'
  },
  {
    match: 'GEEKBAR X 25K STRAWBERRY B-POP',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/STRAWBERRYBPOP.jpg',
    imageAlt: 'GEEKBAR X 25K • Strawberry B-Pop'
  },
  {
    match: 'GEEKBAR X 25K STRAWBERRY COLADA',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/STRAWBERRYCOLADA.jpg',
    imageAlt: 'GEEKBAR X 25K • Strawberry Colada'
  },
  {
    match: 'GEEKBAR X 25K STRAWBERRY JAM',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/STRAWBERRYJAM.jpg',
    imageAlt: 'GEEKBAR X 25K • Strawberry Jam'
  },
  {
    match: 'GEEKBAR X 25K STRAWBERRY KIWI ICE',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/STRAWBERRYKIWIICE.jpg',
    imageAlt: 'GEEKBAR X 25K • Strawberry Kiwi Ice'
  },
  {
    match: 'GEEKBAR X 25K STRAWBERRY WATERMELON',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/STRAWBERRYWATERMELON.jpg',
    imageAlt: 'GEEKBAR X 25K • Strawberry Watermelon'
  },
  {
    match: 'GEEKBAR X 25K WHITE PEACH RASPBERRY',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/WHITEPEACHRASBERRY.jpg',
    imageAlt: 'GEEKBAR X 25K • White Peach Raspberry'
  },
  {
    match: 'GEEKBAR X 25K WATERMELON ICE',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/WATERMELONICE.jpg',
    imageAlt: 'GEEKBAR X 25K • Watermelon Ice'
  },
  {
    match: 'RAZ LTX 25K BANGIN SOUR BERRIES',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/BANGINSOURBERRIES.jpg',
    imageAlt: 'RAZ LTX 25K • Bangin Sour Berries'
  },
  {
    match: 'RAZ LTX 25K BLUEBERRY PUNCH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/BLUEBERRYPUNCH.jpg',
    imageAlt: 'RAZ LTX 25K • Blueberry Punch'
  },
  {
    match: 'RAZ LTX 25K BLUEBERRY WATERMELON',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/BLUEBERRYWATERMELON.jpg',
    imageAlt: 'RAZ LTX 25K • Blueberry Watermelon'
  },
  {
    match: 'RAZ LTX 25K BLUE RAZ GUSH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/BLUERAZGUSH.jpg',
    imageAlt: 'RAZ LTX 25K • Blue Raz Gush'
  },
  {
    match: 'RAZ LTX 25K BLUE RAZ ICE',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/BLUERAZICE.jpg',
    imageAlt: 'RAZ LTX 25K • Blue Raz Ice'
  },
  {
    match: 'RAZ LTX 25K CHERRY STRAPPLE',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/CHERRYSTRAPPLE.jpg',
    imageAlt: 'RAZ LTX 25K • Cherry Strapple'
  },
  {
    match: 'RAZ LTX 25K CLEAR DIAMOND',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/CLEARDIAMOND.jpg',
    imageAlt: 'RAZ LTX 25K • Clear Diamond'
  },
  {
    match: 'RAZ LTX 25K CLEAR SAPPHIRE',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/CLEARSAPPHIRE.jpg',
    imageAlt: 'RAZ LTX 25K • Clear Sapphire'
  },
  {
    match: 'RAZ LTX 25K FIRE & ICE',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/FIRE%26ICE.jpg',
    imageAlt: 'RAZ LTX 25K • Fire & Ice'
  },
  {
    match: 'RAZ LTX 25K FROZEN RASPBERRY WATERMELON',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/FROZENASPBERRYWATERMELON.jpg',
    imageAlt: 'RAZ LTX 25K • Frozen Raspberry Watermelon'
  },
  {
    match: 'RAZ LTX 25K FROZEN BANANA',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/FROZENBANANA.jpg',
    imageAlt: 'RAZ LTX 25K • Frozen Banana'
  },
  {
    match: 'RAZ LTX 25K FROZEN CHERRY APPLE',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/FROZENCHERRYAPPLE.jpg',
    imageAlt: 'RAZ LTX 25K • Frozen Cherry Apple'
  },
  {
    match: 'RAZ LTX 25K FROZEN DRAGON FRUIT LEMON',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/FROZENDRAGONFRUITLEMON.jpg',
    imageAlt: 'RAZ LTX 25K • Frozen Dragon Fruit Lemon'
  },
  {
    match: 'RAZ LTX 25K FROZEN JUICY STRAWBERRY',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/FROZENJUICYSTRAWBERRY.jpg',
    imageAlt: 'RAZ LTX 25K • Frozen Juicy Strawberry'
  },
  {
    match: 'RAZ LTX 25K GEORGIA PEACH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/GEORGIAPEACH.jpg',
    imageAlt: 'RAZ LTX 25K • Georgia Peach'
  },
  {
    match: 'RAZ LTX 25K HAWAIIAN PUNCH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/HAWAIIANPUNCH.jpg',
    imageAlt: 'RAZ LTX 25K • Hawaiian Punch'
  },
  {
    match: 'RAZ LTX 25K ICED BLUE DRAGON',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/ICEDBLUEDRAGON.jpg',
    imageAlt: 'RAZ LTX 25K • Iced Blue Dragon'
  },
  {
    match: 'RAZ LTX 25K MANGO LOCO',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/MANGO%20LOCO.jpg',
    imageAlt: 'RAZ LTX 25K • Mango Loco'
  },
  {
    match: 'RAZ LTX 25K MIAMI MINT',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/MIAMIMINT.jpg',
    imageAlt: 'RAZ LTX 25K • Miami Mint'
  },
  {
    match: 'RAZ LTX 25K NEW YORK MINT',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/NEWYORKMINT.jpg',
    imageAlt: 'RAZ LTX 25K • New York Mint'
  },
  {
    match: 'RAZ LTX 25K NIGHT CRAWLER',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/NIGHTCRAWLER.jpg',
    imageAlt: 'RAZ LTX 25K • Night Crawler'
  },
  {
    match: 'RAZ LTX 25K ORANGE MANGO',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/ORANGEMANGO.jpg',
    imageAlt: 'RAZ LTX 25K • Orange Mango'
  },
  {
    match: 'RAZ LTX 25K ORANGE PINEAPPLE PUNCH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/ORANGEPINEAPPLEPUNCH.jpg',
    imageAlt: 'RAZ LTX 25K • Orange Pineapple Punch'
  },
  {
    match: 'RAZ LTX 25K PINK LEMONADE MINTY O\'S',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/PINKLEMONADEMINTY%20O%27S.jpg',
    imageAlt: 'RAZ LTX 25K • Pink Lemonade Minty O\'s'
  },
  {
    match: 'RAZ LTX 25K SOUR APPLE ICE',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/SOURAPPLEICE.jpg',
    imageAlt: 'RAZ LTX 25K • Sour Apple Ice'
  },
  {
    match: 'RAZ LTX 25K SOUR APPLE WATERMELON',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/SOURAPPLEWATERMELON.jpg',
    imageAlt: 'RAZ LTX 25K • Sour Apple Watermelon'
  },
  {
    match: 'RAZ LTX 25K SOUR RASPBERRY PUNCH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/SOURRASPBERRYPUNCH.jpg',
    imageAlt: 'RAZ LTX 25K • Sour Raspberry Punch'
  },
  {
    match: 'RAZ LTX 25K SOUR WATERMELON PEACH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/SOURWATERMELONPEACH.jpg',
    imageAlt: 'RAZ LTX 25K • Sour Watermelon Peach'
  },
  {
    match: 'RAZ LTX 25K STRAWBERRY BURST',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/STRAWBERRYBURST.jpg',
    imageAlt: 'RAZ LTX 25K • Strawberry Burst'
  },
  {
    match: 'RAZ LTX 25K STRAWBERRY KIWI PEAR',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/STRAWBERRYKIWIPEAR.jpg',
    imageAlt: 'RAZ LTX 25K • Strawberry Kiwi Pear'
  },
  {
    match: 'RAZ LTX 25K STRAWBERRY ORANGE TANG',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/STRAWBERRYORANGETANG.jpg',
    imageAlt: 'RAZ LTX 25K • Strawberry Orange Tang'
  },
  {
    match: 'RAZ LTX 25K STRAWBERRY PEACH GUSH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/STRAWBERRYPEACHGUSH.jpg',
    imageAlt: 'RAZ LTX 25K • Strawberry Peach Gush'
  },
  {
    match: 'RAZ LTX 25K TRIPLE BERRY GUSH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/TRIPLEBERRYGUSH.jpg',
    imageAlt: 'RAZ LTX 25K • Triple Berry Gush'
  },
  {
    match: 'RAZ LTX 25K TRIPLE BERRY PUNCH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/TRIPLEBERRYPUNCH.jpg',
    imageAlt: 'RAZ LTX 25K • Triple Berry Punch'
  },
  {
    match: 'RAZ LTX 25K TROPICAL GUSH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/TROPICALGUSH.jpg',
    imageAlt: 'RAZ LTX 25K • Tropical Gush'
  },
  {
    match: 'RAZ LTX 25K WATERMELON ICE',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/WATERMELONICE.jpg',
    imageAlt: 'RAZ LTX 25K • Watermelon Ice'
  },
  {
    match: 'RAZ LTX 25K WHITE GRAPE GUSH',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/WHITEGRAPEGUSH.jpg',
    imageAlt: 'RAZ LTX 25K • White Grape Gush'
  },
  {
    match: 'RAZ LTX 25K WINTERGREEN',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/WINTERGREEN.jpg',
    imageAlt: 'RAZ LTX 25K • Wintergreen'
  },
  {
    match: 'RAZ LTX 25K FROZEN ASPBERRY WATERMELON',
    imageUrl: '/images/imagesForProducts/RAZ%20LTX%2025K/FROZENASPBERRYWATERMELON.jpg',
    imageAlt: 'RAZ LTX 25K • Frozen Aspberry Watermelon'
  },
  {
    match: 'OLIT HOOKALIT 40K BLUEBERRY ICE',
    imageUrl: '/images/imagesForProducts/OLITHOOKALIT40K/BLUEBERRYICE.jpg',
    imageAlt: 'OLIT HOOKALIT 40K • Blueberry Ice'
  },
  {
    match: 'OLIT HOOKALIT 40K COOL MINT',
    imageUrl: '/images/imagesForProducts/OLITHOOKALIT40K/COOLMINT.jpg',
    imageAlt: 'OLIT HOOKALIT 40K • Cool Mint'
  },
  {
    match: 'OLIT HOOKALIT 40K GRAPE ICE',
    imageUrl: '/images/imagesForProducts/OLITHOOKALIT40K/GRAPEICE.jpg',
    imageAlt: 'OLIT HOOKALIT 40K • Grape Ice'
  },
  {
    match: 'OLIT HOOKALIT 40K LADY KILLER',
    imageUrl: '/images/imagesForProducts/OLITHOOKALIT40K/LADYKILLER.jpg',
    imageAlt: 'OLIT HOOKALIT 40K • Lady Killer'
  },
  {
    match: 'OLIT HOOKALIT 40K LOVE 66',
    imageUrl: '/images/imagesForProducts/OLITHOOKALIT40K/LOVE66.jpg',
    imageAlt: 'OLIT HOOKALIT 40K • Love 66'
  },
  {
    match: 'OLIT HOOKALIT 40K PEACH MANGO WATERMELON',
    imageUrl: '/images/imagesForProducts/OLITHOOKALIT40K/PEACHMANGOWATERMELON.jpg',
    imageAlt: 'OLIT HOOKALIT 40K • Peach Mango Watermelon'
  },
  {
    match: 'OLIT HOOKALIT 40K PINEAPPLE COCONUT',
    imageUrl: '/images/imagesForProducts/OLITHOOKALIT40K/PINEAPPLECOCONUT.jpg',
    imageAlt: 'OLIT HOOKALIT 40K • Pineapple Coconut'
  },
  {
    match: 'OLIT HOOKALIT 40K STRAWBERRY KIWI',
    imageUrl: '/images/imagesForProducts/OLITHOOKALIT40K/STRAWBERRYKIWI.jpg',
    imageAlt: 'OLIT HOOKALIT 40K • Strawberry Kiwi'
  },
  {
    match: 'GRABBA LEAF SMALL',
    imageUrl: '/images/imagesForProducts/GRABBALEAFSMALL/GRABBALEAFSMALL.jpg',
    imageAlt: 'Grabba Leaf Small'
  },
  {
    match: 'CUVIE PLUS BLUEBERRY',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/BLUEBERRY.jpg',
    imageAlt: 'Cuvie Plus • Blueberry'
  },
  {
    match: 'CUVIE PLUS BLUEBERRY LEMONADE',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/BLUEBERRYLEMONADE.jpg',
    imageAlt: 'Cuvie Plus • Blueberry Lemonade'
  },
  {
    match: 'CUVIE PLUS BLUEBERRY RASPBERRY',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/BLUEBERRYRASBERRY.jpg',
    imageAlt: 'Cuvie Plus • Blueberry Raspberry'
  },
  {
    match: 'CUVIE PLUS BLUEBERRY RASBERRY',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/BLUEBERRYRASBERRY.jpg',
    imageAlt: 'Cuvie Plus • Blueberry Raspberry'
  },
  {
    match: 'CUVIE PLUS LUSH ICE',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/LUSHICE.jpg',
    imageAlt: 'Cuvie Plus • Lush Ice'
  },
  {
    match: 'CUVIE PLUS LUXURY MINT',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/LUXURYMINT.jpg',
    imageAlt: 'Cuvie Plus • Luxury Mint'
  },
  {
    match: 'CUVIE PLUS SKY MINT',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/SKYMINT.jpg',
    imageAlt: 'Cuvie Plus • Sky Mint'
  },
  {
    match: 'CUVIE PLUS APPLE PEACH',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/APPLEPEACH.jpeg',
    imageAlt: 'Cuvie Plus • Apple Peach'
  },
  {
    match: 'CUVIE PLUS BLACK DIAMOND',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/BLACKDIAMOND.jpg',
    imageAlt: 'Cuvie Plus • Black Diamond'
  },
  {
    match: 'CUVIE PLUS BLACK DRAGON',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/BLACKDRAGON.jpg',
    imageAlt: 'Cuvie Plus • Black Dragon'
  },
  {
    match: 'CUVIE PLUS PINEAPPLE ICE',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/PINEAPPLEICE.jpg',
    imageAlt: 'Cuvie Plus • Pineapple Ice'
  },
  {
    match: 'CUVIE PLUS TRES LECHES',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/TRESLECHES.jpg',
    imageAlt: 'Cuvie Plus • Tres Leches'
  },
  {
    match: 'CUVIE PLUS BLACK ICE',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/BLACKICE.jpg',
    imageAlt: 'Cuvie Plus • Black Ice'
  },
  {
    match: 'CUVIE PLUS ENERGY DRINK',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/ENERGYDRINK.jpg',
    imageAlt: 'Cuvie Plus • Energy Drink'
  },
  {
    match: 'CUVIE PLUS GRAPEY',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/GRAPEY.jpg',
    imageAlt: 'Cuvie Plus • Grapey'
  },
  {
    match: 'CUVIE PLUS ICE MINT',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/ICEMINT.jpg',
    imageAlt: 'Cuvie Plus • Ice Mint'
  },
  {
    match: 'CUVIE PLUS MEXICAN MANGO',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/MEXICANMANGO.jpg',
    imageAlt: 'Cuvie Plus • Mexican Mango'
  },
  {
    match: 'CUVIE PLUS LYCHEE ICE',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/LYCHEEICE.jpg',
    imageAlt: 'Cuvie Plus • Lychee Ice'
  },
  {
    match: 'CUVIE PLUS NUTS TOBACCO',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/NUTSTOBACCO.jpg',
    imageAlt: 'Cuvie Plus • Nuts Tobacco'
  },
  {
    match: 'CUVIE PLUS STRAWBERRY',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/STRAWBERRY.jpg',
    imageAlt: 'Cuvie Plus • Strawberry'
  },
  {
    match: 'CUVIE PLUS STRAWBERRY BANANA',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/STRAWBERRYBANANA.jpg',
    imageAlt: 'Cuvie Plus • Strawberry Banana'
  },
  {
    match: 'CUVIE PLUS STRAWBERRY WATERMELON',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/STRAWBERRYWATERMELON.jpg',
    imageAlt: 'Cuvie Plus • Strawberry Watermelon'
  },
  {
    match: 'CUVIE GO 35K FRESH AF',
    imageUrl: '/images/imagesForProducts/CUVIE%20GO%2035K/FRESHAF.jpg',
    imageAlt: 'Cuvie Go 35K • Fresh AF'
  },
  {
    match: 'CUVIE PLUS TOBACCO',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/TOBACCO.jpeg',
    imageAlt: 'Cuvie Plus • Tobacco'
  },
  {
    match: 'FUME EXTRA APPLE SKITTLES',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/APPLESKITTLES.jpg',
    imageAlt: 'Fume Extra • Apple Skittles'
  },
  {
    match: 'FUME EXTRA BANANA ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/BANANAICE.jpg',
    imageAlt: 'Fume Extra • Banana Ice'
  },
  {
    match: 'FUME EXTRA APPLE SKITTLES',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/APPLESKITTLES.jpg',
    imageAlt: 'Fume Extra • Apple Skittles'
  },
  {
    match: 'FUME EXTRA BANANA ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/BANANAICE.jpg',
    imageAlt: 'Fume Extra • Banana Ice'
  },
  {
    match: 'FUME EXTRA BLACK ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/BLACKICE.jpg',
    imageAlt: 'Fume Extra • Black Ice'
  },
  {
    match: 'FUME EXTRA BLUEBERRY GUAVA',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/BLUEBERRYGUAVA.jpg',
    imageAlt: 'Fume Extra • Blueberry Guava'
  },
  {
    match: 'FUME EXTRA BLUE RAZZ',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/BLUERAZZ.jpg',
    imageAlt: 'Fume Extra • Blue Razz'
  },
  {
    match: 'FUME EXTRA CUBAN TOBACCO',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/CUBANTOBACCO.jpg',
    imageAlt: 'Fume Extra • Cuban Tobacco'
  },
  {
    match: 'FUME EXTRA GRAPE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/GRAPE.jpg',
    imageAlt: 'Fume Extra • Grape'
  },
  {
    match: 'FUME EXTRA MELON ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/MELONICE.jpg',
    imageAlt: 'Fume Extra • Melon Ice'
  },
  {
    match: 'FUME EXTRA MIAMI MIX',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/MIAMIMIX.jpg',
    imageAlt: 'Fume Extra • Miami Mix'
  },
  {
    match: 'FUME EXTRA MIAMI TROPICANA',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/MIAMITROPICANA.jpg',
    imageAlt: 'Fume Extra • Miami Tropicana'
  },
  {
    match: 'FUME EXTRA MINT ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/MINTICE.jpg',
    imageAlt: 'Fume Extra • Mint Ice'
  },
  {
    match: 'FUME EXTRA PINA COLADA',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/PINACOLADA.jpg',
    imageAlt: 'Fume Extra • Pina Colada'
  },
  {
    match: 'FUME EXTRA PARADISE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/PARADISE.jpg',
    imageAlt: 'Fume Extra • Paradise'
  },
  {
    match: 'FUME EXTRA STRAWBERRY BANANA',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/STRAWBERRYBANANA.jpg',
    imageAlt: 'Fume Extra • Strawberry Banana'
  },
  {
    match: 'CUVIE PLUS MIAMI MINT',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/MIAMIMINT.jpg',
    imageAlt: 'Cuvie Plus • Miami Mint'
  },
  {
    match: 'CUVIE PLUS PEACH ICE',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/PEACHICE.jpg',
    imageAlt: 'Cuvie Plus • Peach Ice'
  },
  {
    match: 'CUVIE PLUS SOUR APPLE ICE',
    imageUrl: '/images/imagesForProducts/CUVIE%20PLUS/SOURAPPLEICE.jpg',
    imageAlt: 'Cuvie Plus • Sour Apple Ice'
  },
  {
    match: 'FUME EXTRA BLUEBERRY MINT',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/BLUEBERRYMINT.jpg',
    imageAlt: 'Fume Extra • Blueberry Mint'
  },
  {
    match: 'FUME EXTRA CLEAR',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/CLEAR.jpg',
    imageAlt: 'Fume Extra • Clear'
  },
  {
    match: 'FUME EXTRA COFFEE TOBACCO',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/COFFEETOBACCO.jpg',
    imageAlt: 'Fume Extra • Coffee Tobacco'
  },
  {
    match: 'FUME EXTRA COTTON CANDY',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/COTTONCANDY.jpg',
    imageAlt: 'Fume Extra • Cotton Candy'
  },
  {
    match: 'FUME EXTRA FRESH LYCHEE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/FRESHLYCHEE.jpg',
    imageAlt: 'Fume Extra • Fresh Lychee'
  },
  {
    match: 'FUME EXTRA HAWAII JUICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/HAWAIIJUICE.jpg',
    imageAlt: 'Fume Extra • Hawaii Juice'
  },
  {
    match: 'FUME EXTRA LUSH ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/LUSHICE.jpg',
    imageAlt: 'Fume Extra • Lush Ice'
  },
  {
    match: 'FUME EXTRA MANGO',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/MANGO.jpg',
    imageAlt: 'Fume Extra • Mango'
  },
  {
    match: 'FUME EXTRA BUBBLEGUM',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/BUBBLEGUM.jpg',
    imageAlt: 'Fume Extra • Bubblegum'
  },
  {
    match: 'FUME EXTRA DRAGON PAPAYA',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/DRAGONPAPAYA.jpg',
    imageAlt: 'Fume Extra • Dragon Papaya'
  },
  {
    match: 'FUME EXTRA MIAMI MINT',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/MIAMIMINT.jpg',
    imageAlt: 'Fume Extra • Miami Mint'
  },
  {
    match: 'FUME EXTRA PEACH ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/PEACHICE.jpg',
    imageAlt: 'Fume Extra • Peach Ice'
  },
  {
    match: 'FUME EXTRA PINEAPPLE ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/PINEAPPLEICE.jpg',
    imageAlt: 'Fume Extra • Pineapple Ice'
  },
  {
    match: 'FUME EXTRA TANGERINE ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/TANGERINEICE.jpg',
    imageAlt: 'Fume Extra • Tangerine Ice'
  },
  {
    match: 'FUME EXTRA PINK LEMONADE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/PINKLEMONADE.jpg',
    imageAlt: 'Fume Extra • Pink Lemonade'
  },
  {
    match: 'FUME EXTRA PURPLE RAIN',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/PURPLERAIN.jpg',
    imageAlt: 'Fume Extra • Purple Rain'
  },
  {
    match: 'FUME EXTRA RAINBOW CANDY',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/RAINBOWCANDY.jpg',
    imageAlt: 'Fume Extra • Rainbow Candy'
  },
  {
    match: 'FUME EXTRA TROPICAL FRUIT',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/TROPICALFRUIT.jpg',
    imageAlt: 'Fume Extra • Tropical Fruit'
  },
  {
    match: 'FUME EXTRA STRAWBERRY',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/STRAWBERRY.jpg',
    imageAlt: 'Fume Extra • Strawberry'
  },
  {
    match: 'FUME EXTRA STRAWBERRY MANGO',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/STRAWBERRYMANGO.jpg',
    imageAlt: 'Fume Extra • Strawberry Mango'
  },
  {
    match: 'FUME EXTRA STRAWBERRY WATERMELON',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/STRAWBERRYWATERMELON.jpg',
    imageAlt: 'Fume Extra • Strawberry Watermelon'
  },
  {
    match: 'FUME EXTRA SUMMER BLACK ICE',
    imageUrl: '/images/imagesForProducts/FUME%20EXTRA/SUMMERBLACKICE.jpg',
    imageAlt: 'Fume Extra • Summer Black Ice'
  },
  {
    match: 'FUME ULTRA BANANA ICE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/BANANAICE.jpg',
    imageAlt: 'Fume Ultra • Banana Ice'
  },
  {
    match: 'FUME ULTRA BLACK ICE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/BLACKICE.jpg',
    imageAlt: 'Fume Ultra • Black Ice'
  },
  {
    match: 'FUME ULTRA BLUE RAZZ ICE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/BLUERAZZICE.jpg',
    imageAlt: 'Fume Ultra • Blue Razz Ice'
  },
  {
    match: 'FUME ULTRA BLUEBERRY MINT',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/BLUEBERRYMINT.jpeg',
    imageAlt: 'Fume Ultra • Blueberry Mint'
  },
  {
    match: 'FUME ULTRA BUBBLEGUM',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/BUBBLEGUM.jpg',
    imageAlt: 'Fume Ultra • Bubblegum'
  },
  {
    match: 'FUME ULTRA CLEAR',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/CLEAR.jpg',
    imageAlt: 'Fume Ultra • Clear'
  },
  {
    match: 'FUME ULTRA HAWAII JUICE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/HAWAIIJUICE.jpg',
    imageAlt: 'Fume Ultra • Hawaii Juice'
  },
  {
    match: 'FUME ULTRA KIWI STRAWBERRY',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/KIWISTRAWBERRY.jpg',
    imageAlt: 'Fume Ultra • Kiwi Strawberry'
  },
  {
    match: 'FUME ULTRA LUSH ICE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/LUSHICE.jpg',
    imageAlt: 'Fume Ultra • Lush Ice'
  },
  {
    match: 'FUME ULTRA MANGO',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/MANGO.jpg',
    imageAlt: 'Fume Ultra • Mango'
  },
  {
    match: 'FUME ULTRA MIAMI MIX',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/MIAMIMIX.jpg',
    imageAlt: 'Fume Ultra • Miami Mix'
  },
  {
    match: 'FUME ULTRA MINT ICE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/MINTICE.jpg',
    imageAlt: 'Fume Ultra • Mint Ice'
  },
  {
    match: 'FUME ULTRA PARADISE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/PARADISE.jpg',
    imageAlt: 'Fume Ultra • Paradise'
  },
  {
    match: 'FUME ULTRA PEACH ICE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/PEACHICE.jpg',
    imageAlt: 'Fume Ultra • Peach Ice'
  },
  {
    match: 'FUME ULTRA PINA COLADA',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/PINACOLADA.jpg',
    imageAlt: 'Fume Ultra • Pina Colada'
  },
  {
    match: 'FUME ULTRA POLAR ICE',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/POLARICE.jpg',
    imageAlt: 'Fume Ultra • Polar Ice'
  },
  {
    match: 'FUME ULTRA PURPLE RAIN',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/PURPLERAIN.jpg',
    imageAlt: 'Fume Ultra • Purple Rain'
  },
  {
    match: 'FUME ULTRA RASPBERRY WATERMELON',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/RASPBERRYWATERMELON.jpg',
    imageAlt: 'Fume Ultra • Raspberry Watermelon'
  },
  {
    match: 'FUME ULTRA STRAWBERRY',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/STRAWBERRY.jpg',
    imageAlt: 'Fume Ultra • Strawberry'
  },
  {
    match: 'FUME ULTRA STRAWBERRY BANANA',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/STRAWBERRYBANANA.jpg',
    imageAlt: 'Fume Ultra • Strawberry Banana'
  },
  {
    match: 'FUME ULTRA STRAWBERRY MANGO',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/STRAWBERRYMANGO.jpg',
    imageAlt: 'Fume Ultra • Strawberry Mango'
  },
  {
    match: 'FUME ULTRA STRAWBERRY WATERMELON',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/STRAWBERRYWATERMELON.jpg',
    imageAlt: 'Fume Ultra • Strawberry Watermelon'
  },
  {
    match: 'FUME ULTRA TROPICAL FRUIT',
    imageUrl: '/images/imagesForProducts/FUMEULTRA/TROPICALFRUIT.jpg',
    imageAlt: 'Fume Ultra • Tropical Fruit'
  },
  {
    match: 'FUME INFINITY APPLE SKITTLE',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/APPLESKITTLE.jpg',
    imageAlt: 'Fume Infinity • Apple Skittle'
  },
  {
    match: 'FUME INFINITY BLACK ICE',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/BLACKICE.jpg',
    imageAlt: 'Fume Infinity • Black Ice'
  },
  {
    match: 'FUME INFINITY BLUEBERRY GUAVA',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/BLUEBERRYGUAVA.jpg',
    imageAlt: 'Fume Infinity • Blueberry Guava'
  },
  {
    match: 'FUME INFINITY BLUEBERRY MINT',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/BLUEBERRYMINT.jpg',
    imageAlt: 'Fume Infinity • Blueberry Mint'
  },
  {
    match: 'FUME INFINITY DOUBLE APPLE',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/DOUBLEAPPLE.jpg',
    imageAlt: 'Fume Infinity • Double Apple'
  },
  {
    match: 'FUME INFINITY DRAGON FRUIT',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/DRAGONFRUIT.jpg',
    imageAlt: 'Fume Infinity • Dragon Fruit'
  },
  {
    match: 'FUME INFINITY LUSH ICE',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/LUSHICE.jpg',
    imageAlt: 'Fume Infinity • Lush Ice'
  },
  {
    match: 'FUME INFINITY MIAMI MINT',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/MIAMIMINT.jpg',
    imageAlt: 'Fume Infinity • Miami Mint'
  },
  {
    match: 'FUME INFINITY MIAMI MIX',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/MIAMIMIX.jpg',
    imageAlt: 'Fume Infinity • Miami Mix'
  },
  {
    match: 'FUME INFINITY MINT ICE',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/MINTICE.jpg',
    imageAlt: 'Fume Infinity • Mint Ice'
  },
  {
    match: 'FUME INFINITY PEACH ICE',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/PEACHICE.jpg',
    imageAlt: 'Fume Infinity • Peach Ice'
  },
  {
    match: 'FUME INFINITY PINA COLADA',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/PINACOLADA.jpg',
    imageAlt: 'Fume Infinity • Pina Colada'
  },
  {
    match: 'FUME INFINITY PURPLE RAIN',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/PURPLERAIN.jpg',
    imageAlt: 'Fume Infinity • Purple Rain'
  },
  {
    match: 'FUME INFINITY STRAWBERRY KIWI',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/STRAWBERRYKIWI.jpg',
    imageAlt: 'Fume Infinity • Strawberry Kiwi'
  },
  {
    match: 'FUME INFINITY SUMMER BLACK ICE',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/SUMMERBLACKICE.jpg',
    imageAlt: 'Fume Infinity • Summer Black Ice'
  },
  {
    match: 'FUME INFINITY TROPICAL PUNCH',
    imageUrl: '/images/imagesForProducts/FUMEINFINITY/TROPICALFRUIT.jpg',
    imageAlt: 'Fume Infinity • Tropical Punch'
  },
  {
    match: 'FUME PRO 30K BLACK ICE',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/BLACKICE.jpg',
    imageAlt: 'Fume Pro 30K • Black Ice'
  },
  {
    match: 'FUME PRO 30K DUBAI CHOCOLATE',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/DUBAICHOCOLATE.jpg',
    imageAlt: 'Fume Pro 30K • Dubai Chocolate'
  },
  {
    match: 'FUME PRO 30K FLORIDA TROPICAL BREEZE',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/FLORIDATROPICALBREEZE.jpg',
    imageAlt: 'Fume Pro 30K • Florida Tropical Breeze'
  },
  {
    match: 'FUME PRO 30K FREEZER ICE',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/FREEZERICE.jpg',
    imageAlt: 'Fume Pro 30K • Freezer Ice'
  },
  {
    match: 'FUME PRO 30K MANGO TANGO',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/MANGOTANGO.jpg',
    imageAlt: 'Fume Pro 30K • Mango Tango'
  },
  {
    match: 'FUME PRO 30K MIAMI MINT',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/MIAMIMINT.jpg',
    imageAlt: 'Fume Pro 30K • Miami Mint'
  },
  {
    match: 'FUME PRO 30K PEACH ICE',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/PEACHICE.jpg',
    imageAlt: 'Fume Pro 30K • Peach Ice'
  },
  {
    match: 'FUME PRO 30K POLAR ICE',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/POLARICE.jpg',
    imageAlt: 'Fume Pro 30K • Polar Ice'
  },
  {
    match: 'FUME PRO 30K STRAWBERRY BANANA',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/STRAWBERRYBANANA.jpg',
    imageAlt: 'Fume Pro 30K • Strawberry Banana'
  },
  {
    match: 'FUME PRO 30K STRAWBERRY WIND',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/STRAWBERRYWIND.jpg',
    imageAlt: 'Fume Pro 30K • Strawberry Wind'
  },
  {
    match: 'FUME PRO 30K TRIPLE BERRY ICE',
    imageUrl: '/images/imagesForProducts/FUMEPRO30K/TRIPLEBERRYICE.jpg',
    imageAlt: 'Fume Pro 30K • Triple Berry Ice'
  },
  {
    match: 'BB MOONROCK PRE ROLL 2GR HYBRID BLUE ZUSHI',
    imageUrl: '/images/imagesForProducts/BB%20MOONROCK%20PRE%20ROLL%202GR/HYBRIDBLUEZUSHI.jpg',
    imageAlt: 'BB Moonrock Pre Roll 2GR • Hybrid Blue Zushi'
  },
  {
    match: 'BB MOONROCK PRE ROLL 2GR HYBRID GRENADINE',
    imageUrl: '/images/imagesForProducts/BB%20MOONROCK%20PRE%20ROLL%202GR/HYBRIDGRENADINE.jpg',
    imageAlt: 'BB Moonrock Pre Roll 2GR • Hybrid Grenadine'
  },
  {
    match: 'BB MOONROCK PRE ROLL 2GR INDICA BLUE CHEESE',
    imageUrl: '/images/imagesForProducts/BB%20MOONROCK%20PRE%20ROLL%202GR/INDICABLUECHEESE.jpg',
    imageAlt: 'BB Moonrock Pre Roll 2GR • Indica Blue Cheese'
  },
  {
    match: 'BB MOONROCK PRE ROLL 2GR INDICA TROPICANA COOKIES',
    imageUrl: '/images/imagesForProducts/BB%20MOONROCK%20PRE%20ROLL%202GR/INDICATROPICANACOOKIES.jpg',
    imageAlt: 'BB Moonrock Pre Roll 2GR • Indica Tropicana Cookies'
  },
  {
    match: 'BB MOONROCK PRE ROLL 2GR SATIVA DESERT SKUNK',
    imageUrl: '/images/imagesForProducts/BB%20MOONROCK%20PRE%20ROLL%202GR/SATIVADESERTSKUNK.jpg',
    imageAlt: 'BB Moonrock Pre Roll 2GR • Sativa Desert Skunk'
  },
  {
    match: 'BB MOONROCK PRE ROLL 2GR SATIVA MAUI WOWIE',
    imageUrl: '/images/imagesForProducts/BB%20MOONROCK%20PRE%20ROLL%202GR/SATIVAMAUIWOWIE.jpg',
    imageAlt: 'BB Moonrock Pre Roll 2GR • Sativa Maui Wowie'
  },
  {
    match: 'BB PEN 1GR HYBRID CINDERELLA 99',
    imageUrl: '/images/imagesForProducts/BB%20PEN%201GR/HYBRIDCINDERLLA99.jpg',
    imageAlt: 'BB Pen 1GR • Hybrid Cinderella 99'
  },
  {
    match: 'BB PEN 1GR INDICA HINDU KUSH',
    imageUrl: '/images/imagesForProducts/BB%20PEN%201GR/INDICAHINDUKUSH.jpg',
    imageAlt: 'BB Pen 1GR • Indica Hindu Kush'
  },
  {
    match: 'BB PEN 1GR INDICA KOSHER KUSH',
    imageUrl: '/images/imagesForProducts/BB%20PEN%201GR/INDICAKOSHERKUSH.jpg',
    imageAlt: 'BB Pen 1GR • Indica Kosher Kush'
  },
  {
    match: 'BB PEN 1GR SATIVA MIAMI HAZE',
    imageUrl: '/images/imagesForProducts/BB%20PEN%201GR/SATIVAMIAMIHAZE.jpg',
    imageAlt: 'BB Pen 1GR • Sativa Miami Haze'
  },
  {
    match: 'BB PEN 1GR SATIVA PINEAPPLE EXPRESS',
    imageUrl: '/images/imagesForProducts/BB%20PEN%201GR/PINEAPPLEEXPRESS.jpg',
    imageAlt: 'BB Pen 1GR • Sativa Pineapple Express'
  },
  {
    match: 'BB CART 1GR PARTY PACK INDICA',
    imageUrl: '/images/imagesForProducts/BB%20CART%201GR/PARTYPACKINDICA.jpg',
    imageAlt: 'BB Cart 1GR • Party Pack Indica'
  },
  {
    match: 'BB CART 1GR PARTY PACK SATIVA',
    imageUrl: '/images/imagesForProducts/BB%20CART%201GR/PARTYPACKSATIVA.jpg',
    imageAlt: 'BB Cart 1GR • Party Pack Sativa'
  }
];

const DISCONTINUED_VARIANTS = new Map(
  [
    ['GEEKBAR X 25K', ['ORANGE FCUKING FAB', 'ORANGE FUCKING FAB']]
  ].map(([base, flavors]) => [base.toUpperCase(), new Set(flavors.map((name) => name.toUpperCase()))])
);

const policyPages = {
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    subtitle: 'Conditions for using the Miami Vape Smoke Shop online storefront.',
    metaDescription: 'Official terms and conditions for Miami Vape Smoke Shop online orders.',
    sections: [
      {
        heading: 'Overview',
        body: [
          'This website is operated by Miami Vape Smoke Shop. By browsing, placing an order, or interacting with our services you agree to these Terms of Service and any supplemental policies referenced below.',
          'We reserve the right to update these terms at any time. Changes take effect once posted, and continued use of the site constitutes acceptance.'
        ],
      },
      {
        heading: 'Eligibility and Age Verification',
        body: [
          'You must be at least 21 years old and able to present a valid government-issued photo ID that matches the name on your order.',
          'We may refuse or cancel any transaction that cannot be age-verified or that raises compliance concerns.'
        ],
      },
      {
        heading: 'Pricing, Availability, and Modifications',
        body: [
          'Products, pricing, promotions, and delivery windows are subject to change without notice. Quantities may be limited and certain items may only be available at specific store locations.',
          'If an item in your order becomes unavailable, we will contact you to suggest an alternative or issue a refund for the unavailable portion.'
        ],
      },
      {
        heading: 'Acceptable Use',
        body: [
          'You agree not to use this site for any unlawful purpose, to solicit others to break the law, to infringe upon intellectual property rights, to transmit malicious code, or to scrape or harvest data without written consent.',
          'We reserve the right to suspend or terminate access for any behavior that, in our sole discretion, violates these standards.'
        ],
      },
      {
        heading: 'Payments and Verification',
        body: [
          'Payments are confirmed directly with our team after we verify inventory and ID. We can collect payment over the phone, send a secure text-to-pay link, or run your card at pickup/delivery.',
          'Submitting an order authorizes us to reserve items, verify your identity, and capture payment (including delivery fees and taxes) once you approve the final total.'
        ],
      }
    ],
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    subtitle: 'How we collect, use, and protect your information.',
    metaDescription: 'Privacy practices for Miami Vape Smoke Shop online storefront.',
    sections: [
      {
        heading: 'Information We Collect',
        body: [
          'We collect contact details, delivery addresses, order history, payment confirmation tokens, device data, and geolocation signals you share for delivery routing.',
          'When required by law, we also retain copies of identification used to verify age or authorized pickup.'
        ],
      },
      {
        heading: 'How We Use Information',
        list: [
          'Process and fulfill pickup or Uber delivery orders.',
          'Coordinate age verification and delivery hand-offs.',
          'Provide customer support and respond to inquiries.',
          'Improve our product catalog, merchandising, and site performance.',
        ],
        body: ['We only retain data for as long as necessary to meet these purposes and any applicable regulatory requirements.'],
      },
      {
        heading: 'Sharing with Third Parties',
        body: [
          'We share limited data with our payment facilitators, on-demand courier partners (such as Uber), fraud-prevention tools, and law-enforcement agencies when legally required.',
          'We do not sell customer data. Any vendor we engage must agree to comparable confidentiality and security safeguards.'
        ],
      },
      {
        heading: 'Security and Retention',
        body: [
          'All checkout traffic is encrypted. Sensitive data is stored with role-based access controls, and payment credentials are handled by our PCI-compliant payment facilitators.',
          'We retain order records for the minimum period needed to satisfy state and federal regulations governing age-restricted goods.'
        ],
      },
      {
        heading: 'Your Choices',
        body: [
          'Contact us if you need to update account details, request a copy of the information we hold, or ask that we delete non-mandatory records. Certain data must remain on file to satisfy compliance obligations.'
        ],
      }
    ],
  },
  refund: {
    slug: 'refund',
    title: 'Refund Policy',
    subtitle: 'How we handle returns, replacements, and store credits.',
    metaDescription: 'Refund guidelines for Miami Vape Smoke Shop orders.',
    sections: [
      {
        heading: 'All Sales Are Final',
        body: [
          'Due to the nature of nicotine, cannabis-adjacent, and consumable products, all sales are final once payment is confirmed.',
          'We do not accept returns for change-of-mind, flavor preferences, or third-party shipping delays.'
        ],
      },
      {
        heading: 'Defective or Damaged Items',
        body: [
          'If an item arrives broken, leaking, or fails to operate out of the box, contact us within seven (7) calendar days of pickup or delivery so we can evaluate the issue.'
        ],
        list: [
          'Provide your order number, photos or video of the defect, and proof of purchase.',
          'Return any unused portion of the product and its original packaging when requested.',
          'Allow up to three business days for our team to review and confirm eligibility.',
        ],
      },
      {
        heading: 'Ineligible Items',
        body: [
          'Products showing signs of use, missing security seals, or damaged due to misuse are not eligible for replacement or refund.',
          'Promotional gifts and clearance items are final sale without exception.'
        ],
      },
      {
        heading: 'Resolution',
        body: [
          'Approved claims will be satisfied with either an identical replacement, comparable product, or store credit equal to the original purchase price.',
          'We reserve the right to deny claims we cannot verify or that fall outside the seven-day reporting window.'
        ],
      }
    ],
  },
  delivery: {
    slug: 'delivery',
    title: 'Delivery Policy',
    subtitle: 'Same-day Uber delivery across Miami-Dade and Broward Counties.',
    metaDescription: 'Delivery standards for Miami Vape Smoke Shop orders.',
    sections: [
      {
        heading: 'Service Area',
        body: [
          'We currently offer courier delivery through Uber Direct within Miami, Miami-Dade County, and Broward County. Orders outside this footprint may be declined or converted to in-store pickup.'
        ],
      },
      {
        heading: 'Order Processing',
        body: [
          'Orders received during store hours are typically released to a courier within 60 minutes. High-volume periods, severe weather, or inventory issues may extend processing times.'
        ],
      },
      {
        heading: 'Fees and Timing',
        body: [
          'Delivery fees are calculated at checkout based on distance and courier availability. You will see the final fee before confirming payment.',
          'Estimated arrival windows are provided by Uber and may change in real time. Customers receive SMS or app notifications directly from the courier platform when available.'
        ],
      },
      {
        heading: 'Verification at Hand-Off',
        body: [
          'A 21+ adult must be present with a valid ID that matches the order name. Couriers will not release products to minors or to anyone who cannot present matching identification.',
          'If verification fails, the order will be returned to the store and may incur an additional restocking or redelivery fee.'
        ],
      }
    ],
  },
  cancellations: {
    slug: 'cancellations',
    title: 'Cancellation Policy',
    subtitle: 'How to request order changes or report issues.',
    metaDescription: 'Cancellation rules for Miami Vape Smoke Shop orders.',
    sections: [
      {
        heading: 'Before Fulfillment',
        body: [
          'Contact us immediately after placing an order if you need to cancel or edit it. If the order has not been prepared or assigned to a courier, we can void the payment without penalty.'
        ],
      },
      {
        heading: 'After Courier Pickup',
        body: [
          'Once an order leaves the store, it cannot be cancelled. If you refuse delivery, the order will be treated as a completed sale and no refund will be issued.'
        ],
      },
      {
        heading: 'Defective or Damaged Items',
        body: [
          'All sales are final unless the product arrives damaged or defective. You have seven (7) days from pickup or delivery to report the issue so we can determine if a replacement or credit is warranted.'
        ],
      },
      {
        heading: 'How to Request Help',
        list: [
          'Email or call us with your order number and details.',
          'Attach photos or videos if the item is damaged.',
          'Retain all original packaging until we confirm next steps.'
        ],
        body: [
          'We respond to most cancellation or damage inquiries within one business day.'
        ],
      }
    ],
  },
};

let STATIC_VARIANT_IMAGE_MAPPINGS = [];
let VARIANT_IMAGE_LOOKUP = new Map();
let IMAGE_READY_BASES = new Set();
const FEATURED_LIMIT_ENV = String(process.env.IMAGE_READY_ONLY || '').toLowerCase() === 'true';
const VARIANT_IMAGE_REFRESH_INTERVAL_MS = Number(process.env.STATIC_IMAGE_REFRESH_INTERVAL_MS || 15000);
const VARIANT_IMAGE_REFRESH_DEBOUNCE_MS = 250;
const variantImageWatchers = [];
let FEATURED_BASE_PRODUCTS = [...FEATURED_FULL_PRODUCTS];
let FEATURED_BASE_SET = new Set(FEATURED_BASE_PRODUCTS.map((name) => {
  const normalized = normalizeProductName(name);
  const base = extractProductVariantKey(normalized);
  return (base || normalized).toUpperCase();
}));
let FEATURED_NAME_CLAUSE = FEATURED_BASE_PRODUCTS.map(() => 'UPPER(p.name) LIKE ?').join(' OR ');
let FEATURED_NAME_PARAMS = FEATURED_BASE_PRODUCTS.map((name) => buildFeaturedNamePattern(name));
let variantImageRefreshTimer;

function buildFeaturedNamePattern(name = '') {
  const tokens = String(name || '').toUpperCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return '%';
  const [first, ...rest] = tokens;
  let pattern = first;
  rest.forEach((token) => {
    pattern += `%${token}`;
  });
  return `%${pattern}%`;
}

function rebuildFeaturedBaseFilters() {
  const sources = (FEATURED_LIMIT_ENV && !SHOW_ALL_LOCAL)
    ? FEATURED_FULL_PRODUCTS.filter((name) => {
        const upper = name.toUpperCase();
        return isImageReadyBase(name) || IMAGE_READY_ALLOWLIST.has(upper);
      })
    : FEATURED_FULL_PRODUCTS;
  FEATURED_BASE_PRODUCTS = sources;
  FEATURED_BASE_SET = new Set(sources.map((name) => {
    const normalized = normalizeProductName(name);
    const base = extractProductVariantKey(normalized);
    return (base || normalized).toUpperCase();
  }));
  FEATURED_NAME_CLAUSE = sources.map(() => 'UPPER(p.name) LIKE ?').join(' OR ');
  FEATURED_NAME_PARAMS = sources.map((name) => buildFeaturedNamePattern(name));
}

function refreshVariantImageData() {
  try {
    STATIC_VARIANT_IMAGE_MAPPINGS = buildStaticVariantImageMappings();
    VARIANT_IMAGE_LOOKUP = buildVariantImageLookup([
      ...STATIC_VARIANT_IMAGE_MAPPINGS,
      ...VARIANT_IMAGE_MAPPINGS
    ]);
    IMAGE_READY_BASES = buildImageReadyBaseSet(VARIANT_IMAGE_LOOKUP);
    rebuildFeaturedBaseFilters();
  } catch (err) {
    console.error('Error refreshing static variant images:', err.message);
  }
}

function queueVariantImageRefresh() {
  clearTimeout(variantImageRefreshTimer);
  variantImageRefreshTimer = setTimeout(() => refreshVariantImageData(), VARIANT_IMAGE_REFRESH_DEBOUNCE_MS);
}

function startVariantImageWatcher() {
  if (process.env.DISABLE_STATIC_IMAGE_WATCH === 'true') {
    return;
  }
  try {
    const watcher = fs.watch(STATIC_IMAGE_ROOT, { recursive: true }, () => queueVariantImageRefresh());
    watcher.on('error', (err) => {
      console.warn('Static variant image watcher error:', err.message);
    });
    variantImageWatchers.push(watcher);
  } catch (err) {
    console.warn('Static variant image watcher unavailable:', err.message);
  }
}

refreshVariantImageData();
startVariantImageWatcher();
if (VARIANT_IMAGE_REFRESH_INTERVAL_MS > 0) {
  setInterval(refreshVariantImageData, VARIANT_IMAGE_REFRESH_INTERVAL_MS);
}

/* --------------------  MySQL pool  -------------------- */
const pool = mysql.createPool({
  host: cfg.host,
  port: cfg.port,
  user: cfg.user,
  password: cfg.password,
  database: cfg.database,
  waitForConnections: true,
  connectionLimit: 10,
  ssl,
});

const RETRYABLE_DB_ERRORS = new Set(['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ECONNREFUSED']);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function queryWithRetry(sql, params = [], attempt = 0) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (RETRYABLE_DB_ERRORS.has(err.code) && attempt < 2) {
      await wait(200 * (attempt + 1));
      return queryWithRetry(sql, params, attempt + 1);
    }
    throw err;
  }
}

/* --------------------  Health  -------------------- */
app.get('/health', async (_req, res) => {
  try {
    const [rows] = await queryWithRetry('SELECT 1 AS ok');
    res.json({ status: 'ok', db: rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ status: 'error', error: String(e?.message || e) });
  }
});

/* --------------------  API: Get all stores  -------------------- */
app.get('/api/stores', (_req, res) => {
  // Keep store identifiers consistent across the app (frontend + backend + Slack/dispatch).
  const stores = STORE_CHOICES
    .filter(s => s.id !== 'either')
    .map(s => ({
      id: s.id,
      name: s.label || s.name,
      address: s.address || '',
      latitude: s.latitude || null,
      longitude: s.longitude || null
    }));

  res.json({ stores });
});


/* --------------------  API: Check inventory by store  -------------------- */
app.post('/api/check-inventory', async (req, res) => {
  try {
    const { product_ids, store_name } = req.body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({ error: 'product_ids must be a non-empty array' });
    }

    if (!store_name) {
      return res.status(400).json({ error: 'store_name is required' });
    }

    const [stores] = await queryWithRetry('SELECT id FROM stores WHERE name = ?', [store_name]);
    if (stores.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const storeId = stores[0].id;
    const placeholders = product_ids.map(() => '?').join(',');
    const [availability] = await queryWithRetry(
      `SELECT product_id, quantity_on_hand
       FROM product_inventory
       WHERE product_id IN (${placeholders}) AND store_id = ?`,
      [...product_ids, storeId]
    );

    const availabilityMap = {};
    product_ids.forEach(id => {
      availabilityMap[id] = false;
    });
    availability.forEach(row => {
      availabilityMap[row.product_id] = row.quantity_on_hand > 0;
    });

    res.json(availabilityMap);
  } catch (err) {
    console.error('Error checking inventory:', err);
    res.status(500).json({ error: 'Failed to check inventory' });
  }
});

/* --------------------  API: Get closest store to coordinates  -------------------- */
app.get('/api/closest-store', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    if (isNaN(userLat) || isNaN(userLng)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Get all stores
    const [stores] = await queryWithRetry(
      'SELECT id, name, address, latitude, longitude FROM stores WHERE is_active = true'
    );

    if (stores.length === 0) {
      return res.status(404).json({ error: 'No stores found' });
    }

    // Calculate distance using Haversine formula
    function haversineDistance(lat1, lon1, lat2, lon2) {
      const R = 3959; // Earth's radius in miles
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // Find closest store
    let closest = stores[0];
    let minDistance = haversineDistance(userLat, userLng, closest.latitude, closest.longitude);

    for (let i = 1; i < stores.length; i++) {
      const distance = haversineDistance(userLat, userLng, stores[i].latitude, stores[i].longitude);
      if (distance < minDistance) {
        minDistance = distance;
        closest = stores[i];
      }
    }

    res.json({
      store: {
        id: closest.id,
        name: closest.name,
        address: closest.address,
        latitude: closest.latitude,
        longitude: closest.longitude,
      },
      distance_miles: parseFloat(minDistance.toFixed(2)),
    });
  } catch (err) {
    console.error('Error finding closest store:', err);
    res.status(500).json({ error: 'Failed to find closest store' });
  }
});

/* --------------------  Home  -------------------- */
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/shop', (_req, res) => res.redirect('/products'));

/* Safety redirects if old links exist */
app.get(
  ['/views/products.ejs', '/views/layouts/products.ejs', '/public/products.html', '/products.html'],
  (_req, res) => res.redirect('/products')
);

app.get('/faq', (req, res) => {
  res.render('faq', {
    title: 'FAQ • Miami Vape Smoke Shop',
    description: 'Frequently asked questions about delivery, pickup, and product policies at Miami Vape Smoke Shop.',
    contact: CONTACT_INFO,
  });
});

app.get('/policy/:slug', (req, res) => {
  const page = policyPages[req.params.slug];
  if (!page) {
    return res.status(404).send('Policy not found');
  }
  res.render('policy', {
    title: `${page.title} • Miami Vape Smoke Shop`,
    description: page.metaDescription,
    page,
    contact: CONTACT_INFO,
  });
});

/* --------------------  Helper: Group products by variant  -------------------- */
function isRestrictedProduct(normalizedName = '', normalizedKey = '', rawName = '') {
  const upperKey = (normalizedKey || '').toUpperCase();
  const nameCandidates = [(normalizedName || '').toUpperCase(), (rawName || '').toUpperCase()];
  const includesPhrase = (phrase) => nameCandidates.some((value) => value && value.includes(phrase));
  const hasZeroNic = includesPhrase('ZERO NIC') || includesPhrase('ZERO-NIC');
  const hasNoNicotine = includesPhrase('NO NICOTINE');

  if (upperKey === 'FUME PRO 30K' && (hasNoNicotine || hasZeroNic)) {
    return true;
  }
  if (upperKey === 'RAZ LTX 25K' && hasZeroNic) {
    return true;
  }
  if (containsExcludedKeyword(normalizedName) || containsExcludedKeyword(rawName)) {
    return true;
  }
  return false;
}

function normalizeProductName(name) {
  let value = String(name || '').trim();
  if (!value) return value;

  // Normalize ZERO NICOTINE to ZERO NIC for consistent matching
  value = value.replace(/\bZERO\s+NICOTINE\b/gi, 'ZERO NIC');

  if (/^RA[ZX]\s*LTX\b/i.test(value)) {
    value = value.replace(/^RA[ZX]\s*LTX\b/i, 'RAZ LTX');
    if (!/\b25K\b/i.test(value)) {
      value = value.replace(/^RAZ LTX\b/i, 'RAZ LTX 25K');
    }
  }
  if (/^RAZ\s*LTX\s*25K\b/i.test(value) && /FROZEN\s+CHERRY\s+PIE/i.test(value)) {
    value = value.replace(/FROZEN\s+CHERRY\s+PIE/gi, 'FROZEN CHERRY APPLE');
  }
  if (/^RAZ\s*LTX\s*25K\b/i.test(value) && /PINK\s+LEMONADE\s+MINTY/i.test(value)) {
    value = value.replace(/PINK\s+LEMONADE\s+MINTY(?:\s+O'?S?)?/gi, "PINK LEMONADE MINTY O'S");
  }
  if (/^(?:GEEKBAR|GEEK\s?BAR)\s*X\s*(?:25|25K)\b/i.test(value)) {
    value = value.replace(/^(?:GEEKBAR|GEEK\s?BAR)\s*X\s*(?:25|25K)\b/i, 'GEEKBAR X 25K');
  } else if (/^(?:GEEKBAR|GEEK\s?BAR)\b/i.test(value)) {
    if (!/\b\d+(?:\.\d+)?K\b/i.test(value)) {
      value = value.replace(/^(?:GEEKBAR|GEEK\s?BAR)\b/i, 'GEEKBAR 15K');
    } else {
      value = value.replace(/^(?:GEEKBAR|GEEK\s?BAR)\b/i, 'GEEKBAR');
    }
  }
  if (/^GEEKBAR\s*X\s*25K\b/i.test(value) && /STRAWBERRY\s+PI(?:N|Ñ)A\s+COLADA/i.test(value)) {
    value = value.replace(/STRAWBERRY\s+PI(?:N|Ñ)A\s+COLADA/gi, 'STRAWBERRY COLADA');
  }
  if (/^FUME\s*INFINITY\b/i.test(value) && /TROPICAL\s+FRUIT/i.test(value)) {
    value = value.replace(/TROPICAL\s+FRUIT/gi, 'TROPICAL PUNCH');
  }
  if (/^FUME\s*PRO\b/i.test(value)) {
    value = value.replace(/^FUME\s*PRO\b/i, 'FUME PRO');
    if (!/\b30K\b/i.test(value)) {
      value = value.replace(/^FUME PRO\b/i, 'FUME PRO 30K');
    }
  }
  if (/^FUME\s*EXTRA\b/i.test(value)) {
    value = value.replace(/^FUME\s*EXTRA\b/i, 'FUME EXTRA');
  }
  if (/^FUME\s*ULTRA\b/i.test(value)) {
    value = value.replace(/^FUME\s*ULTRA\b/i, 'FUME ULTRA');
  }
  if (/^FUME\s*INFINITY\b/i.test(value)) {
    value = value.replace(/^FUME\s*INFINITY(?:\s*4500)?\b/i, 'FUME INFINITY');
  }
  if (/^LOST\s*MARY\s*PRO\b/i.test(value)) {
    value = value.replace(/^LOST\s*MARY\s*PRO\b/i, 'LOST MARY PRO');
  }
  if (/^LOST\s*MARY\s*(?:TUBRO|TURBO)\b/i.test(value)) {
    value = value.replace(/^LOST\s*MARY\s*(?:TUBRO|TURBO)\b/i, 'LOST MARY TURBO');
    if (!/\b35K\b/i.test(value)) {
      value = value.replace(/^LOST MARY TURBO\b/i, 'LOST MARY TURBO 35K');
    }
  }
  if (/^(?:G?OLIT\s+HOOKALIT|HOOKALIT\s+VAPE)\b/i.test(value)) {
    if (/\b60K\b/i.test(value)) {
      value = value.replace(/^(?:G?OLIT\s+HOOKALIT|HOOKALIT\s+VAPE)(?:\s+40K)?(?:\s+PRO)?(?:\s+60K)?\b/i, 'OLIT HOOKALIT 60K');
    } else {
      value = value.replace(/^(?:G?OLIT\s+HOOKALIT|HOOKALIT\s+VAPE)(?:\s+40K)?\b/i, 'OLIT HOOKALIT 40K');
    }
    value = value.replace(/\bVAPE\b/gi, '');
  }
  if (/^(?:HQD|H1D)\s+CUVIE\b/i.test(value)) {
    value = value.replace(/^(?:HQD|H1D)\s+/, '');
  }
  value = value.replace(/\b\d+(?:\.\d+)?%\s*/g, '');
  if (/^BB\s*CART\b/i.test(value)) {
    value = value.replace(/^BB\s*CART\b/i, 'BB CART');
    if (/\b1G\b/i.test(value)) {
      value = value.replace(/\b1G\b/i, '1GR');
    }
    if (!/\b1GR\b/i.test(value)) {
      value = value.replace(/^BB CART\b/i, 'BB CART 1GR');
    }
  }
  if (/^BB\s*PEN\b/i.test(value)) {
    value = value.replace(/^BB\s*PEN\b/i, 'BB PEN');
    if (/\b1G\b/i.test(value)) {
      value = value.replace(/\b1G\b/i, '1GR');
    }
    if (!/\b1GR\b/i.test(value)) {
      value = value.replace(/^BB PEN\b/i, 'BB PEN 1GR');
    }
  }
  if (/^NEXA\b/i.test(value)) {
    value = value.replace(/\bPIX?A?\b/gi, '');
    value = value.replace(/^NEXA\s*(?:35K?)?\b/i, 'NEXA 35K ');
    value = value.replace(/^(NEXA 35K)\s*35K/i, '$1');
  }
  if (/^CUVIE\s*2\.0\b/i.test(value)) {
    // Normalize NO NIC to NO NICOTINE first
    value = value.replace(/\bNO\s*NIC\b/gi, 'NO NICOTINE');
    if (!/\bNO\s*NICOTINE\b/i.test(value)) {
      value = value.replace(/^(CUVIE\s*2\.0)\b/i, '$1 NO NICOTINE');
    }
  }
  if (/^GRABBA\s+LEAF\s+WHOLE\s+LEAF$/i.test(value)) {
    value = 'GRABBA LEAF WHOLE';
  }
  if (/^RAW\s+CONES?\b/i.test(value)) {
    value = value.replace(/^RAW\s+CONES?\b/i, 'RAW CONE');

    // Normalize 1 1/4 or 1/4 or 1 4 or 1_4 to 1_4
    value = value.replace(/\b(?:1\s+)?1[\/\s]4\b/g, '1_4');
    value = value.replace(/\b1_4\b/g, '1_4');

    // Normalize Organic Hemp to Organic
    value = value.replace(/\bORGANIC\s+HEMP\b/gi, 'ORGANIC');

    // If it doesn't have 20PK or 3PK, and it's not the 1_4 base,
    // it's likely a 3PK (standard for these smaller quantities)
    if (!/\b\d+PK\b/i.test(value) && !/\b1_4\b/.test(value) && !/\bTIPS\b/i.test(value) && !/\bSTAGE\b/i.test(value)) {
       if (/\b(CLASSIC|BLACK|ORGANIC|KING)\b/i.test(value)) {
         value = value.replace(/^(RAW CONE)/i, '$1 3PK');
       }
    }

    // Move 20PK or 3PK to be right after RAW CONE
    const pkMatch = value.match(/\b(\d+PK)\b/i);
    if (pkMatch) {
      const pk = pkMatch[1].toUpperCase();
      value = value.replace(/\b\d+PK\b/gi, '').replace(/\s+/g, ' ').trim();
      value = value.replace(/^(RAW CONE)/i, `$1 ${pk}`);
    }

    // Strip SIZE from the end or after KING
    value = value.replace(/\bSIZE\b/gi, '');

    // Normalize flavor names
    if (/\bBLACK\b/i.test(value) && /\bCLASSIC\b/i.test(value)) {
      value = value.replace(/\bCLASSIC\b/gi, '');
    }
  }
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

function extractProductVariantKey(name) {
  // Normalize name to uppercase to ensure consistent grouping
  name = String(name || '').toUpperCase().trim();

  // Smart extraction that finds size specifications (like 25K, 3GR, 2PK, 50MG, etc.)
  // and uses them as the grouping boundary.
  // Everything UP TO and INCLUDING the size spec = product base
  // Everything AFTER = flavor/variant
  //
  // Examples:
  //   "FUME PRO 25K STRAWBERRY BANANA" → "FUME PRO 25K"
  //   "DESTINO JAR 3.5GR INDICA PURPLE RUNTZ" → "DESTINO JAR 3.5GR"
  //   "SWISHER SWEETS 2PK BANANA SMASH" → "SWISHER SWEETS 2PK"
  //   "BLACK & MILD ORIGINAL SINGLE PLASTIC TIP" → "BLACK & MILD ORIGINAL SINGLE PLASTIC TIP" (no size, use fallback)

  // Size spec pattern: number (with optional decimal) + unit
  // Units: K, KMG (puff counts), GR (grams), MG (milligrams), ML (milliliters),
  //        OZ (ounces), PK (pack count), CT (count), G (grams)
  const sizePattern = /\d+(?:\.\d+)?(?:K|KMG|GR|MG|ML|OZ|PK|CT|G)\b/;

  const words = name.split(/\s+/);
  let baseKey = '';

  // Find the position of the first size spec
  for (let i = 0; i < words.length; i++) {
    if (sizePattern.test(words[i])) {
      // Found size spec at position i
      // Include all words up to and including this one
      baseKey = words.slice(0, i + 1).join(' ');
      break;
    }
  }

  if (!baseKey) {
    // No size spec found - fall back to original logic (first 2-3 words)
    if (words.length < 2) {
      baseKey = name;
    } else {
      let baseWords = words.slice(0, 2);

      // If there's a 3rd word and it looks like a descriptor/quantity, include it
      // (e.g., "SINGLE", "ORIGINAL", "KINGS", "SLIM", etc.)
      if (words.length > 2 &&
          /^(SINGLE|ORIGINAL|KINGS|SLIM|MINI|EXTRA|DOUBLE|TRIPLE|DUAL|WOOD|PLASTIC|SMALL|CLASSIC|ORGANIC)$/.test(words[2])) {
        baseWords.push(words[2]);

        // Specific for RAW CONE CLASSIC 1_4 or RAW CONE ORGANIC 1_4
        if ((words[2] === 'CLASSIC' || words[2] === 'ORGANIC') && words[3] === '1_4') {
          baseWords.push(words[3]);
        }
      }
      baseKey = baseWords.join(' ');
    }
  }

  // Handle ZERO NICOTINE separation as a distinct product base
  if (name.includes('ZERO NICOTINE') || name.includes('ZERO NIC')) {
    return `${baseKey} ZERO NIC`.trim();
  }

  // Handle NO NICOTINE separation (e.g. CUVIE 2.0 NO NICOTINE)
  if (name.includes('NO NICOTINE')) {
    return `${baseKey} NO NICOTINE`.trim();
  }

  // Handle WHOLE separation (e.g. GRABBA LEAF WHOLE)
  if (name.includes('WHOLE')) {
    return `${baseKey} WHOLE`.trim();
  }

  return baseKey;
}

function extractFlavor(name, baseKey) {
  // Extract flavor from product name by removing the base key
  let flavor = name.replace(new RegExp(`^${baseKey}\\s*`, 'i'), '').trim();

  // If the base key was artificially augmented with ZERO NIC, we may need to strip it from the middle/end of the flavor too
  if (baseKey.includes('ZERO NIC')) {
    const baseWithoutNic = baseKey.replace(/\s*ZERO\s*NIC(OTINE)?/i, '').trim();
    flavor = name.replace(new RegExp(`^${baseWithoutNic}\\s*`, 'i'), '').trim();
    flavor = flavor.replace(/\s*ZERO\s*NIC(OTINE)?/gi, '').trim();
  }

  // If the base key was artificially augmented with NO NICOTINE
  if (baseKey.includes('NO NICOTINE')) {
    const baseWithoutNic = baseKey.replace(/\s*NO\s*NICOTINE/i, '').trim();
    flavor = name.replace(new RegExp(`^${baseWithoutNic}\\s*`, 'i'), '').trim();
    flavor = flavor.replace(/\s*NO\s*NICOTINE/gi, '').trim();
  }

  // If the base key was artificially augmented with WHOLE
  if (baseKey.includes('WHOLE')) {
    const baseWithoutWhole = baseKey.replace(/\s*WHOLE/i, '').trim();
    flavor = name.replace(new RegExp(`^${baseWithoutWhole}\\s*`, 'i'), '').trim();
    flavor = flavor.replace(/\s*WHOLE/gi, '').trim();
  }

  return flavor || 'Original';
}

function groupProductsByVariant(products) {
  const grouped = {};

  products.forEach(product => {
    const normalizedName = normalizeProductName(product.name) || '';
    const baseKey = extractProductVariantKey(normalizedName);
    const normalizedKey = (baseKey || '').toUpperCase();

    // Skip products explicitly marked as inactive in snapshot tables
    if (product.any_active === 0) {
      return;
    }

    if (isRestrictedProduct(normalizedName, normalizedKey, product.name)) {
      return;
    }

    if (!grouped[normalizedKey]) {
      grouped[normalizedKey] = {
        ...product,
        name: normalizedName,
        base_name: baseKey,
        variants: [],
        variantMap: new Map()
      };
    }

    const flavor = extractFlavor(normalizedName, baseKey);
    const blockSet = DISCONTINUED_VARIANTS.get(normalizedKey);
    if (blockSet && blockSet.has(flavor.toUpperCase())) {
      return;
    }
    const variantImage = getVariantImage(baseKey, flavor);
    let variantImageUrl = product.image_url;
    let variantImageAlt = product.image_alt;
    let variantHasImage = !!product.has_image;
    if (!variantHasImage && variantImage) {
      variantImageUrl = variantImage.imageUrl;
      variantImageAlt = variantImage.imageAlt;
      variantHasImage = true;
    }
    if (!grouped[normalizedKey].has_image && variantHasImage) {
      grouped[normalizedKey].image_url = variantImageUrl;
      grouped[normalizedKey].image_alt = variantImageAlt;
      grouped[normalizedKey].has_image = true;
    }

    const group = grouped[normalizedKey];
    const variantKey = flavor.toUpperCase() || 'ORIGINAL';
    const existingVariant = group.variantMap.get(variantKey);
    const inventoryNameKey = (product.name || '').toUpperCase();

    if (existingVariant) {
      if (!existingVariant.countedInventoryNames.has(inventoryNameKey)) {
        existingVariant.total_qty = Number(existingVariant.total_qty || 0) + Number(product.total_qty || 0);
        existingVariant.countedInventoryNames.add(inventoryNameKey);
      }
      if (!existingVariant.has_image && variantHasImage) {
        existingVariant.image_url = variantImageUrl;
        existingVariant.image_alt = variantImageAlt;
        existingVariant.has_image = true;
      }
    } else {
      const variantPayload = {
        id: product.id,
        name: normalizedName,
        flavor,
        price: product.price,
        total_qty: product.total_qty,
        image_url: variantImageUrl,
        image_alt: variantImageAlt,
        has_image: variantHasImage,
        countedInventoryNames: new Set([inventoryNameKey])
      };
      group.variantMap.set(variantKey, variantPayload);
      group.variants.push(variantPayload);
    }
  });

  Object.values(grouped).forEach(group => {
    group.variants.forEach(v => {
      delete v.countedInventoryNames;
    });
    group.variants.sort((a, b) => {
      if (!!a.has_image === !!b.has_image) {
        return a.flavor.localeCompare(b.flavor);
      }
      return a.has_image ? -1 : 1;
    });
    delete group.variantMap;
  });

  return Object.values(grouped).filter(group => {
    if (group.variants.length === 0) {
      return false;
    }

    if (group.variants.length === 1 && group.variants[0].flavor === 'Original') {
      const baseKey = (group.base_name || group.name || '').toUpperCase();
      return SINGLE_VARIANT_FEATURED_BASES.has(baseKey) || FEATURED_BASE_SET.has(baseKey) || SHOW_ALL_LOCAL;
    }
    return true;
  });
}

/* --------------------  AgeChecker Helper  -------------------- */
function getAgeCheckerKey(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.includes('miamivapedelivery.com')) {
    return process.env.AGECHECKER_API_KEY_DELIVERY || process.env.AGECHECKER_API_KEY;
  }
  // Default to smoke shop key
  return process.env.AGECHECKER_API_KEY_SMOKE || process.env.AGECHECKER_API_KEY;
}

/* --------------------  Shopping Cart  -------------------- */
app.get('/cart', (req, res) => {
  res.render('cart', {
    title: 'Shopping Cart • Miami Vape Smoke Shop',
    description: 'Review your items and proceed to checkout.',
    ageCheckerApiKey: getAgeCheckerKey(req.hostname),
  });
});

/* --------------------  Init Stores Table  -------------------- */
async function initStoresTable() {
  try {
    // Create stores table
    await queryWithRetry(`
      CREATE TABLE IF NOT EXISTS stores (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        address VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if stores exist
    const [stores] = await queryWithRetry('SELECT COUNT(*) AS count FROM stores');

    if (stores[0].count === 0) {
      // Insert stores
      await queryWithRetry(`
        INSERT INTO stores (name, address, latitude, longitude, is_active) VALUES
        ('Calle 8', '6346 SW 8th St, West Miami, FL 33144', 25.7635, -80.3103, true),
        ('79th Street', '351 NE 79th St Unit 101, Miami, FL 33138', 25.8389, -80.1893, true),
        ('Market', '214 NW 8th St, Miami, FL 33136', 25.7813, -80.1982, true)
      `);
      console.log('✓ Stores table initialized with 3 locations');
    }
  } catch (err) {
    console.error('Error initializing stores table:', err.message);
  }
}

async function ensureProductImagesTable() {
  try {
    await queryWithRetry(`
      CREATE TABLE IF NOT EXISTS product_images (
        id INT NOT NULL AUTO_INCREMENT,
        product_id INT NOT NULL,
        image_url VARCHAR(255) NOT NULL,
        image_alt VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_product_image (product_id),
        CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
  } catch (err) {
    console.error('Error ensuring product_images table:', err.message);
  }
}

async function ensureSnapshotTables() {
  try {
    for (const table of SNAPSHOT_TABLES) {
      await queryWithRetry(`
        CREATE TABLE IF NOT EXISTS \`${table}\` (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          upc VARCHAR(32) NOT NULL,
          quantity INT NOT NULL DEFAULT 0,
          is_active TINYINT(1) NOT NULL DEFAULT 1
        )
      `);
      const [cols] = await queryWithRetry(`SHOW COLUMNS FROM \`${table}\` LIKE 'is_active'`);
      if (!cols.length) {
        await queryWithRetry(`
          ALTER TABLE \`${table}\`
          ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER quantity
        `);
      }
    }
  } catch (err) {
    console.error('Error ensuring snapshot tables:', err.message);
  }
}


async function ensureOrderReceiptsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS order_receipts (
      order_id VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      store_id VARCHAR(16) NULL,
      delivery_option VARCHAR(16) NULL,
      pickup_store_id VARCHAR(32) NULL,
      customer_email VARCHAR(255) NULL,
      customer_first_name VARCHAR(255) NULL,
      customer_last_name VARCHAR(255) NULL,
      customer_phone VARCHAR(64) NULL,
      items_json JSON NULL,
      totals_json JSON NULL,
      uber_response_json JSON NULL,
      uber_error TEXT NULL,
      checkout_payload_json JSON NULL,
      PRIMARY KEY (order_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
  `;
  await queryWithRetry(sql);
  console.log('Order receipts table ensured.');
}



async function seedVariantImages() {
  if (!VARIANT_IMAGE_LOOKUP.size) return;
  try {
    const insertSql = `
      INSERT INTO product_images (product_id, image_url, image_alt)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        image_url = VALUES(image_url),
        image_alt = VALUES(image_alt),
        updated_at = CURRENT_TIMESTAMP
    `;

    const [products] = await queryWithRetry('SELECT id, name FROM products');
    const normalizedMap = new Map();
    for (const product of products) {
      const normalized = normalizeProductName(product.name).toUpperCase();
      if (!normalized) continue;
      if (!normalizedMap.has(normalized)) {
        normalizedMap.set(normalized, []);
      }
      normalizedMap.get(normalized).push(product.id);
    }

    for (const mapping of VARIANT_IMAGE_LOOKUP.values()) {
      const normalizedMatch = normalizeProductName(mapping.match).toUpperCase();
      const productIds = normalizedMap.get(normalizedMatch);
      if (!productIds) continue;
      for (const productId of productIds) {
        await queryWithRetry(insertSql, [productId, mapping.imageUrl, mapping.imageAlt]);
      }
    }
  } catch (err) {
    console.error('Error seeding variant images:', err.message);
  }
}

/* --------------------  Checkout  -------------------- */
app.get('/checkout', (req, res) => {
  const selectedShop = normalizeShop(req.query.shop);
  res.render('checkout', {
    title: 'Checkout • Miami Vape Smoke Shop',
    description: 'Complete your purchase',
    user: (req.user || null),
    selectedShop,
    storeMeta: getStoreChoice(selectedShop),
    storeOptions: STORE_CHOICES,
    storeNameMap: STORE_NAME_BY_ID,

    // ---- Authorize.Net (Accept.js) ----
    // These get injected into checkout.ejs so the browser can tokenize card data.
    // Make sure these env vars are set where your app runs.
    authorizeLoginId: _getAuthNetConfig().apiLoginId,

    authorizeClientKey: _getAuthNetConfig().clientKey,

    authorizeEnv: (process.env.AUTH_NET_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox')),
    ageCheckerApiKey: getAgeCheckerKey(req.hostname),
  });


// Success page (client-side reads sessionStorage checkoutSuccessPayload)
app.get('/checkout-success', (req, res) => {
  const selectedShop = normalizeShop(req.query.shop);
  res.render('checkout-success', {
    title: 'Order Confirmed • Miami Vape Smoke Shop',
    description: 'Thanks for your order',
    user: (req.user || null),
    selectedShop,
    storeMeta: getStoreChoice(selectedShop),
    storeOptions: STORE_CHOICES,
    storeNameMap: STORE_NAME_BY_ID,
  });
});
});


/* --------------------  Authorize.Net Charge (Accept.js opaqueData)  -------------------- */
/**
 * Client: checkout.ejs tokenizes card details via Accept.js -> opaqueData
 * Server: uses opaqueData + merchant auth to create an authCaptureTransaction.
 *
 * SECURITY NOTE:
 * Right now the client sends totals computed from localStorage. That's not secure.
 * For production, compute the amount on the server from your cart/order items.
 */


function _cleanEnvVal(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/\uFEFF/g, '')         // strip BOM
    .replace(/[\r\n]+/g, '')        // strip newlines
    .trim()
    .replace(/^['"]|['"]$/g, '')    // strip surrounding quotes
    .trim();
}

function _getAuthNetConfig() {
  const rawEnv =
    _cleanEnvVal(process.env.AUTH_NET_ENV) ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

  const envNorm = String(rawEnv).toLowerCase();
  const isProd = envNorm === 'production' || envNorm === 'prod' || envNorm === 'live';

  const apiLoginId = _cleanEnvVal(process.env.AUTH_NET_LOGIN_ID);
  const transactionKey = _cleanEnvVal(process.env.AUTH_NET_TRANSACTION_KEY);
  const clientKey = _cleanEnvVal(process.env.AUTH_NET_CLIENT_KEY);

  const endpoint = isProd
    ? 'https://api.authorize.net/xml/v1/request.api'
    : 'https://apitest.authorize.net/xml/v1/request.api';

  return {
    env: isProd ? 'production' : 'sandbox',
    endpoint,
    apiLoginId,
    transactionKey,
    clientKey,
  };
}



/* --------------------  Geocoding Proxy (Nominatim)  -------------------- */
// Browsers calling Nominatim directly will often fail due to CORS / rate limits / missing UA.
// We proxy geocoding through the server so the checkout page can safely obtain lat/lng.

const GEOCODE_ENDPOINT = process.env.GEOCODE_ENDPOINT || 'https://nominatim.openstreetmap.org/search';
const GEOCODE_USER_AGENT =
  process.env.GEOCODE_USER_AGENT ||
  'MiamiVapeSmokeShop/1.0 (contact: support@miamivapesmoke.com)';

// Simple in-memory cache (query -> { lat, lng, ts })
const __geocodeCache = new Map();
const __GEOCODE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

async function geocodeNominatim(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  const now = Date.now();
  const cached = __geocodeCache.get(q);
  if (cached && cached.value && now - cached.ts < __GEOCODE_TTL_MS) return cached.value;
  if (cached && cached.promise) return cached.promise;

  const p = (async () => {
    try {
      const url = new URL(GEOCODE_ENDPOINT);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');
      url.searchParams.set('q', q);

      const r = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': GEOCODE_USER_AGENT,
          'Accept': 'application/json',
          'Accept-Language': 'en',
          // Some Nominatim instances like having a referer, too.
          'Referer': 'https://www.miamivapesmoke.com',
        },
      });

      const raw = await r.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }

      if (!r.ok) {
        console.error('[geocode] nominatim error', {
          status: r.status,
          q: q.slice(0, 120),
          body: (raw || '').slice(0, 200),
        });
        return null;
      }

      if (!Array.isArray(data) || data.length === 0) return null;

      const lat = Number(data[0].lat);
      const lng = Number(data[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return { lat, lng, displayName: data[0].display_name || null };
    } catch (err) {
      console.error('[geocode] Nominatim request failed:', err.message);
      return null;
    } finally {
      // Clear in-flight marker
      const cur = __geocodeCache.get(q);
      if (cur && cur.promise) __geocodeCache.set(q, { ts: Date.now(), value: cur.value || null });
    }
  })();

  __geocodeCache.set(q, { ts: now, promise: p, value: null });
  const value = await p;
  __geocodeCache.set(q, { ts: Date.now(), value });
  return value;
}

app.get('/api/geocode', async (req, res) => {
  try {
    const { q, street, street1, street2, city, state, zip, country } = req.query;

    const query =
      String(q || '') ||
      [street || street1, street2, city, state, zip, country || 'US']
        .filter(Boolean)
        .join(', ');

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: 'Missing address query.' });
    }

    const r = await geocodeNominatim(query);
    if (!r) return res.status(404).json({ error: 'No geocode result.' });

    return res.json({ lat: r.lat, lng: r.lng, displayName: r.displayName });
  } catch (e) {
    console.error('[geocode] exception', e);
    return res.status(500).json({ error: 'Geocoding failed.' });
  }
});

/* --------------------  Uber Direct (Courier)  -------------------- */
// NOTE: This section is additive and does not modify the Authorize.Net transaction payload.
// It only:
//  1) uses the selected pickup store (Calle 8 vs 79th) for Uber pickup_address
//  2) creates a delivery (after successful card charge) and returns tracking_url
//  3) exposes an endpoint to fetch live delivery status/courier info

const UBER_DIRECT = {
  customerId: (process.env.UBER_DIRECT_CUSTOMER_ID || '').trim(),
  clientId: (process.env.UBER_DIRECT_CLIENT_ID || '').trim(),
  clientSecret: (process.env.UBER_DIRECT_CLIENT_SECRET || '').trim(),
  authUrl: (process.env.UBER_DIRECT_AUTH_URL || 'https://auth.uber.com/oauth/v2/token').trim(),
  apiBaseUrl: (process.env.UBER_DIRECT_API_BASE_URL || 'https://api.uber.com/v1').trim().replace(/\/+$/, ''),
};

const _uberTokenCache = { accessToken: null, expiresAtMs: 0 };

function _digitsOnly(v) {
  return String(v ?? '').replace(/\D+/g, '');
}

function toE164US(phone) {
  const d = _digitsOnly(phone);
  if (!d) return '';
  if (d.length == 10) return '+1' + d;
  if (d.length == 11 && d.startsWith('1')) return '+' + d;
  return d.startsWith('+') ? d : '+' + d;
}

function normalizeStoreId(v) {
  const raw = String(v ?? '').trim().toLowerCase();
  const s = raw.replace(/\s+/g, '');
  if (!s) return 'calle8';
  if (s === '1' || s.includes('calle8') || s.includes('sw8') || s == 'calle8') return 'calle8';
  if (s.includes('calleocho') || raw.includes('ocho')) return 'calle8';
  if (s === '2' || s.includes('79th') || s.includes('79') || s == '79th') return '79th';
  if (s === '3' || s.includes('market') || s.includes('bodega') || s.includes('mkt')) return 'mkt';
  // Accept "Calle 8" / "79th Street" labels
  if (raw.includes('calle') && raw.includes('8')) return 'calle8';
  if (raw.includes('79')) return '79th';
  return s;
}

function storeLabelFromId(storeId) {
  const id = normalizeStoreId(storeId);
  if (id === '79th') return '79th Street';
  if (id === 'mkt') return 'Market';
  return 'Calle 8';
}

function buildStoreAddress(storeId) {
  const id = normalizeStoreId(storeId);
  if (id === '79th') {
    const line2 = (process.env.STORE_79_STREET2 || '').trim();
    const street = [ (process.env.STORE_79_STREET1 || '').trim(), line2 ].filter(Boolean);
    return {
      street_address: street,
      city: (process.env.STORE_79_CITY || '').trim(),
      state: (process.env.STORE_79_STATE || '').trim(),
      zip_code: (process.env.STORE_79_ZIP || '').trim(),
      country: (process.env.STORE_79_COUNTRY || 'US').trim(),
      phone_number: toE164US(process.env.STORE_79_PHONE),
      name: storeLabelFromId(id),
    };
  }

  if (id === 'mkt') {
    const line2 = (process.env.MKT_STREET2 || '').trim();
    const street = [(process.env.MKT_STREET1 || '214 NW 8th St').trim(), line2].filter(Boolean);
    return {
      street_address: street,
      city: (process.env.MKT_CITY || 'Miami').trim(),
      state: (process.env.MKT_STATE || 'FL').trim(),
      zip_code: (process.env.MKT_ZIP || '33136').trim(),
      country: (process.env.MKT_COUNTRY || 'US').trim(),
      phone_number: toE164US(process.env.MKT_PHONE || '7869686843'),
      name: storeLabelFromId(id),
    };
  }

  const street = [ (process.env.CALLE8_STREET1 || '').trim() ].filter(Boolean);
  return {
    street_address: street,
    city: (process.env.CALLE8_CITY || '').trim(),
    state: (process.env.CALLE8_STATE || '').trim(),
    zip_code: (process.env.CALLE8_ZIP || '').trim(),
    country: (process.env.CALLE8_COUNTRY || 'US').trim(),
    phone_number: toE164US(process.env.CALLE8_PHONE),
    name: storeLabelFromId(id),
  };
}

function buildCustomerDropoffAddress(billing = {}) {
  const lines = [];
  const s1 = String(billing.street || billing.address || '').trim();
  if (s1) lines.push(s1);
  const s2 = String(billing.address2 || billing.unit || billing.street2 || '').trim();
  if (s2 && s2 !== s1) lines.push(s2);

  return {
    street_address: lines,
    city: String(billing.city || '').trim(),
    state: String(billing.state || '').trim(),
    zip_code: String(billing.zip || billing.postalCode || '').trim(),
    country: String(billing.country || 'US').trim(),
  };
}

function assertUberConfigured() {
  const missing = [];
  if (!UBER_DIRECT.customerId) missing.push('UBER_DIRECT_CUSTOMER_ID');
  if (!UBER_DIRECT.clientId) missing.push('UBER_DIRECT_CLIENT_ID');
  if (!UBER_DIRECT.clientSecret) missing.push('UBER_DIRECT_CLIENT_SECRET');
  if (missing.length) {
    const msg = `Uber Direct config missing: ${missing.join(', ')}`;
    console.error('[Uber Direct] ' + msg);
    throw new Error(msg);
  }
}

async function uberGetAccessToken() {
  assertUberConfigured();

  const now = Date.now();
  if (_uberTokenCache.accessToken && _uberTokenCache.expiresAtMs - now > 30_000) {
    return _uberTokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'eats.deliveries',
    client_id: UBER_DIRECT.clientId,
    client_secret: UBER_DIRECT.clientSecret,
  });

  const r = await fetch(UBER_DIRECT.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    console.error('[Uber Direct] token error', { status: r.status, data });
    throw new Error('Failed to obtain Uber access token.');
  }

  const expiresIn = Number(data.expires_in || 0);
  _uberTokenCache.accessToken = data.access_token;
  _uberTokenCache.expiresAtMs = now + Math.max(60, expiresIn) * 1000;
  return data.access_token;
}

async function uberRequest(path, { method = 'GET', json = null } = {}) {
  const token = await uberGetAccessToken();
  const url = `${UBER_DIRECT.apiBaseUrl}${path}`;

  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: json ? JSON.stringify(json) : undefined,
  });

  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 800) }; }

  if (!r.ok) {
    console.error('[Uber Direct] API error', { method, url, status: r.status, data });
    const msg = data?.message || data?.error?.message || data?.title || 'Uber API request failed.';
    const e = new Error(msg);
    e.status = r.status;
    e.data = data;
    throw e;
  }

  return data;
}

function uberAddressJsonString(addressObj = {}) {
  const street = Array.isArray(addressObj.street_address)
    ? addressObj.street_address.filter(Boolean).join(' ')
    : String(addressObj.street_address || '').trim();

  return JSON.stringify({
    street_address: street,
    city: addressObj.city || '',
    state: addressObj.state || '',
    zip_code: addressObj.zip_code || '',
    country: addressObj.country || 'US',
  });
}

async function uberCreateQuote({ pickupStoreId, dropoffAddress }) {
  const store = buildStoreAddress(pickupStoreId);
  const payload = {
    pickup_address: uberAddressJsonString(store),
    dropoff_address: uberAddressJsonString(dropoffAddress),
  };

  const data = await uberRequest(`/customers/${UBER_DIRECT.customerId}/delivery_quotes`, { method: 'POST', json: payload });
  return data;
}

async function uberCreateDelivery({ quoteId, pickupStoreId, dropoffName, dropoffPhone, dropoffAddress, manifestItems, manifestTotalValueCents, manifestReference }) {
  const store = buildStoreAddress(pickupStoreId);
  const payload = {
    quote_id: quoteId,
    pickup_name: store.name,
    pickup_phone_number: store.phone_number || toE164US(process.env.CALLE8_PHONE || process.env.STORE_79_PHONE),
    pickup_address: uberAddressJsonString(store),

    dropoff_name: String(dropoffName || '').slice(0, 80) || 'Customer',
    dropoff_phone_number: toE164US(dropoffPhone),
    dropoff_address: uberAddressJsonString(dropoffAddress),

    manifest_items: Array.isArray(manifestItems) && manifestItems.length ? manifestItems : [{ name: 'Order', quantity: 1, size: 'small', price: 0 }],
    manifest_total_value: Number.isFinite(Number(manifestTotalValueCents)) ? Number(manifestTotalValueCents) : 0,
    manifest_reference: String(manifestReference || '').slice(0, 80) || undefined,
  };

  const data = await uberRequest(`/customers/${UBER_DIRECT.customerId}/deliveries`, { method: 'POST', json: payload });
  return data;
}

app.get('/api/uber/ping', (req, res) => {
  const isSandbox = /sandbox/i.test(UBER_DIRECT.apiBaseUrl) || /sandbox/i.test(UBER_DIRECT.authUrl);
  return res.json({
    ok: true,
    mode: isSandbox ? 'sandbox' : 'production',
    apiBaseUrl: UBER_DIRECT.apiBaseUrl,
    authUrl: UBER_DIRECT.authUrl,
    customerIdPresent: !!UBER_DIRECT.customerId,
  });
});

// Quick auth check (does not create quotes/deliveries)
app.get('/api/uber/auth-test', async (req, res) => {
  try {
    const token = await uberGetAccessToken();
    return res.json({ ok: true, tokenPresent: !!token, tokenLen: token.length, apiBaseUrl: UBER_DIRECT.apiBaseUrl });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Create a quote (for debugging / fee estimates)
app.post('/api/uber/quote', async (req, res) => {
  try {
    const body = req.body || {};
    const pickupStoreId = normalizeStoreId(body.pickupStoreId || body.selectedDeliveryStore || body.pickupStore || body.pickupStoreLabel);

    const dropoff = body.dropoffAddress || body.deliveryAddress || body.shippingAddress || body.billingAddress || body.billing || {};
    const dropoffAddress = {
      street_address: [dropoff.address || dropoff.street1 || dropoff.street || dropoff.line1, dropoff.street2 || dropoff.line2].filter(Boolean),
      city: dropoff.city,
      state: dropoff.state,
      zip_code: dropoff.zip || dropoff.postalCode,
      country: dropoff.country || 'US',
    };

    if (!dropoffAddress.street_address.length || !dropoffAddress.city || !dropoffAddress.state || !dropoffAddress.zip_code) {
      return res.status(400).json({ error: 'Missing dropoff address (street/city/state/zip) for Uber quote.' });
    }

    const quote = await uberCreateQuote({ pickupStoreId, dropoffAddress });
    return res.json({ ok: true, pickupStoreId, quote });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message, details: e.data || undefined });
  }
});

/**
 * Fetch quotes and inventory for ALL active stores simultaneously.
 * Used by checkout flow to auto-select the best fulfillment center.
 */
app.post('/api/uber/delivery-options', async (req, res) => {
  try {
    const { dropoffAddress, cartItems, lat, lng } = req.body;

    if (!dropoffAddress || !cartItems || !Array.isArray(cartItems)) {
      return res.status(400).json({ error: 'dropoffAddress and cartItems (array) are required.' });
    }

    const productIds = cartItems
      .map(it => it.id || it.product_id || it.productId)
      .filter(id => id && Number.isFinite(Number(id)));

    // 1. Get all active stores from DB
    const [dbStores] = await queryWithRetry(
      'SELECT id, name, address, latitude, longitude FROM stores WHERE is_active = true'
    );

    if (!dbStores || dbStores.length === 0) {
      return res.json({ options: [] });
    }

    // 2. Check inventory for all stores using their specific snapshot tables
    const invMap = {}; // storeId -> { productId -> hasStock }
    for (const store of dbStores) {
      invMap[store.id] = {};
      productIds.forEach(pid => { invMap[store.id][pid] = false; });

      if (productIds.length > 0) {
        const normalizedId = normalizeStoreId(store.id);
        const tables = SHOP_TABLES[normalizedId] || SHOP_TABLES['calle8'];
        const placeholders = productIds.map(() => '?').join(',');

        for (const table of tables) {
          const [rows] = await queryWithRetry(
            `SELECT p.id as product_id, i.quantity
             FROM \`${table}\` i
             JOIN products p ON (
               UPPER(p.name) = UPPER(i.name)
               OR (UPPER(p.name) LIKE CONCAT('%', UPPER(i.name), '%'))
               OR (UPPER(i.name) LIKE CONCAT('%', UPPER(p.name), '%'))
             )
             WHERE p.id IN (${placeholders}) AND i.is_active = 1`,
            [...productIds]
          );

          rows.forEach(row => {
            const requestedItem = cartItems.find(it => (it.id || it.product_id || it.productId) == row.product_id);
            const reqQty = requestedItem ? Number(requestedItem.quantity || 1) : 1;

            // Critical check: must have at least the requested quantity
            if (row.quantity >= reqQty) {
              invMap[store.id][row.product_id] = true;
            }
          });
        }
      }
    }

    // 3. Request Uber quotes for each store in parallel
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    const options = await Promise.all(dbStores.map(async (store) => {
      let quote = null;
      let error = null;
      let isManual = false;
      let warning = null;

      try {
        if (dropoffAddress.street_address?.length || dropoffAddress.address) {
          quote = await uberCreateQuote({ pickupStoreId: store.id, dropoffAddress });
        }
      } catch (e) {
        console.warn(`[delivery-options] Quote failed for store ${store.id}: ${e.message}`);
        error = e.message;

        // If it's a known range error or API failure, we flag as manual
        if (e.message.toLowerCase().includes('range') || e.message.toLowerCase().includes('out of service')) {
          isManual = true;
          warning = "Uber Direct cannot deliver this distance; order will be handled manually.";
        } else {
          isManual = true;
          warning = "Courier service unavailable; fallback to manual delivery.";
        }
      }

      // Calculate fallback distance if Uber distance is missing or it's manual
      let distance = quote?.estimated_distance_miles;
      if ((distance === undefined || distance === null) && !isNaN(userLat) && !isNaN(userLng) && store.latitude && store.longitude) {
        // Use backend haversine fallback
        function haversineDist(l1, n1, l2, n2) {
          const R = 3959;
          const dLat = ((l2 - l1) * Math.PI) / 180;
          const dLon = ((n2 - n1) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((l1 * Math.PI) / 180) * Math.cos((l2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        distance = haversineDist(userLat, userLng, parseFloat(store.latitude), parseFloat(store.longitude));
      }

      // Fallback fee if Uber quote failed
      let fee = (quote?.fee || 0) / 100;
      if (!quote && distance) {
        // Manual fee estimation: $10.99 base + $1.25 per mile over 4 miles
        const surcharge = Math.max(0, distance - 4) * 1.25;
        fee = Math.min(24.99, 10.99 + surcharge);
      }

      const storeInv = invMap[store.id] || {};
      const availableCount = Object.values(storeInv).filter(Boolean).length;
      const missingCount = Math.max(0, productIds.length - availableCount);

      return {
        id: store.id,
        name: store.name,
        address: store.address,
        latitude: store.latitude,
        longitude: store.longitude,
        quote,
        error,
        isManual,
        warning,
        distance: distance || 0,
        fee: fee || 0,
        inventory: {
          availableCount,
          missingCount,
          isFullyStocked: (missingCount === 0 && productIds.length > 0),
          details: storeInv
        }
      };
    }));

    return res.json({ options });
  } catch (err) {
    console.error('[delivery-options] Fatal error:', err);
    return res.status(500).json({ error: 'Failed to fetch delivery options.' });
  }
});

// Fetch live delivery status (includes courier details when assigned)
app.get('/api/uber/deliveries/:deliveryId', async (req, res) => {
  try {
    const deliveryId = req.params.deliveryId;
    const data = await uberRequest(`/customers/${UBER_DIRECT.customerId}/deliveries/${encodeURIComponent(deliveryId)}`, { method: 'GET' });
    return res.json({ ok: true, delivery: data });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message, details: e.data || undefined });
  }
});


// Quick sanity-check endpoint (does NOT charge)
// Visit /api/authorize/test-auth in your browser or curl it.
app.get('/api/authorize/test-auth', async (req, res) => {
  try {
    const { endpoint, env, apiLoginId, transactionKey } = _getAuthNetConfig();

    if (!apiLoginId || !transactionKey) {
      return res.status(500).json({
        error: 'Missing AUTH_NET_LOGIN_ID or AUTH_NET_TRANSACTION_KEY on server.',
        debug: { env, endpoint, loginIdPresent: !!apiLoginId, transactionKeyPresent: !!transactionKey },
      });
    }

    const payload = {
      authenticateTestRequest: {
        merchantAuthentication: { name: apiLoginId, transactionKey },
      },
    };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const rawText = await resp.text();
    const cleanedText = String(rawText).replace(/^\uFEFF/, '').trim();

    let result;
    try {
      result = JSON.parse(cleanedText);
    } catch {
      return res.status(502).json({
        error: 'Authorize.Net returned an invalid response.',
        debug: { status: resp.status, contentType: resp.headers.get('content-type'), bodyPreview: cleanedText.slice(0, 300) },
      });
    }

    return res.json({
      ok: true,
      env,
      endpoint,
      messages: result?.messages,
    });
  } catch (err) {
    console.error('[Authorize.Net] test-auth exception', err);
    return res.status(500).json({ error: 'Server error while testing gateway auth.' });
  }
});

// Alias (some environments/bookmarks may hit this path)
app.get('/api/authorize/auth-test', async (req, res) => {
  return res.redirect(302, '/api/authorize/test-auth');
});


app.post('/api/authorize/charge', async (req, res) => {
  console.log("[Charge Route] Body:", JSON.stringify(req.body).slice(0, 200));
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* ignore */ }
  }
  body = body || {};

  const uuid =
    (body.agechecker_uuid || body.agechecker_token || body.agecheckerUUID || body.agecheckerToken ||
     body.age_uuid || body.ageToken ||
     (req.headers['x-agechecker-uuid'] || req.headers['x-agechecker-token'] || '')).toString().trim();

  if (!uuid) {
    console.error("[Charge Route] REJECTED: No AgeChecker token/uuid found. Keys present:", Object.keys(body));
    return res.status(403).json({ error: "Age verification required." });
  }

  console.log("[Charge Route] Parsed AgeChecker UUID:", uuid);

  try {
    const response = await fetch(
      `https://api.agechecker.net/v1/status/${uuid}`,
      {
        headers: {
          "X-AgeChecker-Secret": AGECHECKER_API_KEY
        }
      }
    );

    const ageText = await response.text();
    console.log("[AgeChecker] API response status:", response.status, "body:", ageText.slice(0, 500));
    
    if (!response.ok) {
      throw new Error(`AgeChecker API returned ${response.status}: ${ageText.slice(0, 200)}`);
    }

    let ageData;
    try { ageData = JSON.parse(ageText); } catch { throw new Error(`AgeChecker API returned invalid JSON: ${ageText.slice(0, 200)}`); }

    if (ageData.status !== "accepted") {
      return res.status(403).json({ error: "Age verification not accepted." });
    }

  } catch (err) {
    console.error("[AgeChecker] Verification failed:", err);
    return res.status(500).json({ error: "Age verification failed." });
  }

  //Important: if something fails AFTER the card is successfully charged,
  // return 200 with a warning (not 500) so the client does not retry and risk double-charging.
  let chargeResponse = null;
  let transactionId = null;
  let orderId = null;

  try {
    const { endpoint, env, apiLoginId, transactionKey } = _getAuthNetConfig();

    if (!apiLoginId || !transactionKey) {
      console.error('[Authorize.Net] Missing credentials', {
        env,
        loginIdPresent: !!apiLoginId,
        transactionKeyPresent: !!transactionKey,
      });
      return res.status(500).json({ error: 'Payment configuration missing on server.' });
    }

    // Accept.js typically sends: { opaqueData: { dataDescriptor, dataValue }, totals: { total }, ... }
    // body is already normalized above

    // Extract common fields from body
    const items = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {};
    const email = customer.email || body.email || '';
    const firstName = customer.firstName || '';
    const lastName = customer.lastName || '';
    const phone = customer.phone || '';

    const totals = body.totals || {};
    const orderTotal = Number(body.amount ?? totals.total ?? 0);
    const subtotal = Number(totals.subtotal ?? 0);
    const taxAmount = Number(totals.tax ?? 0);
    const deliveryFee = Number(totals.delivery ?? 0);

    const deliveryOption = String(body.deliveryMethod || '').toLowerCase();
    const isManualSelection = !!body.isManual;
    const manualWarning = body.deliveryWarning || null;

    const pickupStoreId = normalizeStoreId(
      body.pickupStoreId || body.selectedDeliveryStore || body.pickupStore || 'calle8'
    );

    const opaque = body.opaqueData || {};
    const opaqueDataDescriptor = body.opaqueDataDescriptor || opaque.dataDescriptor;
    const opaqueDataValue = body.opaqueDataValue || opaque.dataValue;

    if (!opaqueDataDescriptor || !opaqueDataValue) {
      console.warn('[Authorize.Net] Missing opaqueData', {
        contentType: req.headers['content-type'],
        bodyType: typeof req.body,
        keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 25) : [],
        hasOpaqueDataObj: !!(body && body.opaqueData),
        hasOpaqueDescriptor: !!body.opaqueDataDescriptor,
        hasOpaqueValue: !!body.opaqueDataValue,
      });
      return res.status(400).json({ error: 'Missing payment token (opaqueData).' });
    }

    if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
      return res.status(400).json({ error: 'Invalid charge amount.' });
    }



    // --- PRE-CHARGE ADDRESS VALIDATION ---
    if (deliveryOption === 'delivery' || deliveryOption === 'uber') {
      const billing = body.billing || {};
      const missingFields = [];
      if (!billing.street) missingFields.push('Street Address');
      if (!billing.city) missingFields.push('City');
      if (!billing.state) missingFields.push('State');
      if (!billing.zip) missingFields.push('ZIP Code');

      if (missingFields.length > 0) {
        return res.status(400).json({
          error: `Missing required delivery information: ${missingFields.join(', ')}.`
        });
      }
    }

    // --- PRE-CHARGE INVENTORY VALIDATION ---
    try {
      const normalizedId = normalizeStoreId(pickupStoreId);
      const inventoryTable = normalizedId === '79th' ? 'inventory_79th' : 'inventory_calle8';

      for (const it of items) {
        const reqQty = Number(it?.quantity || 0);
        if (reqQty <= 0) continue;
        const productId = it?.id;
        const fallbackName = String(it?.name || '').trim();

        let availableQty = 0;
        if (productId) {
          const [rows] = await queryWithRetry(
            `SELECT i.quantity
             FROM ${inventoryTable} i
             JOIN products p ON UPPER(p.name) = UPPER(i.name)
             WHERE p.id = ? AND i.is_active = 1`,
            [productId]
          );
          availableQty = Number(rows[0]?.quantity || 0);
        } else if (fallbackName) {
          const [rows] = await queryWithRetry(
            `SELECT quantity FROM ${inventoryTable} WHERE name = ? AND is_active = 1`,
            [fallbackName]
          );
          availableQty = Number(rows[0]?.quantity || 0);
        }

        if (availableQty < reqQty) {
          return res.status(400).json({
            error: `Insufficient stock for one or more items in your cart. Please review your order.`
          });
        }
      }
    } catch (invErr) {
      console.error('[Inventory Validation] Failed:', invErr);
    }

    const amountStr = orderTotal.toFixed(2);

    const payload = {
      createTransactionRequest: {
        merchantAuthentication: { name: apiLoginId, transactionKey },
        refId: String(Date.now()),
        transactionRequest: {
          transactionType: 'authCaptureTransaction',
          amount: amountStr,
          payment: {
            opaqueData: {
              dataDescriptor: opaqueDataDescriptor,
              dataValue: opaqueDataValue,
            },
          },
        },
      },
    };

    // Optional data (kept minimal, but useful)
    if (email) {
      payload.createTransactionRequest.transactionRequest.customer = { email: String(email).slice(0, 255) };
    }

    const billing = body.billing || {};
    if (billing.firstName || billing.lastName || billing.address || billing.city || billing.state || billing.zip) {
      payload.createTransactionRequest.transactionRequest.billTo = {
        firstName: billing.firstName ? String(billing.firstName).slice(0, 50) : undefined,
        lastName: billing.lastName ? String(billing.lastName).slice(0, 50) : undefined,
        address: billing.address ? String(billing.address).slice(0, 60) : undefined,
        city: billing.city ? String(billing.city).slice(0, 40) : undefined,
        state: billing.state ? String(billing.state).slice(0, 40) : undefined,
        zip: billing.zip ? String(billing.zip).slice(0, 20) : undefined,
        country: billing.country ? String(billing.country).slice(0, 60) : undefined,
        phoneNumber: (billing.phoneNumber || billing.phone) ? String(billing.phoneNumber || billing.phone).slice(0, 25) : undefined,
      };
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const rawText = await resp.text();
    const cleanedText = String(rawText).replace(/^\uFEFF/, '').trim();

    let result;
    try {
      result = JSON.parse(cleanedText);
    } catch (e) {
      console.error('[Authorize.Net] Returned invalid JSON', {
        status: resp.status,
        contentType: resp.headers.get('content-type'),
        bodyPreview: cleanedText.slice(0, 300),
      });
      return res.status(502).json({ error: 'Authorize.Net returned an invalid response.' });
    }

    const msg = result?.messages;
    if (msg?.resultCode === 'Error') {
      const err = msg?.message?.[0] || {};
      const code = err.code;
      const text = err.text || 'Payment was declined.';
      console.error('[Authorize.Net] API error', { code, text });

      if (code === 'E00007') {
        // Most common causes:
        // - wrong Transaction Key (people paste the Signature Key)
        // - sandbox vs production mismatch
        // - key regenerated but env not updated/redeployed
        return res.status(500).json({
          error: 'Payment gateway authentication failed (check API Login ID / Transaction Key and sandbox vs production).',
          code,
          debug: { env, endpoint, loginIdLen: apiLoginId.length, transactionKeyLen: transactionKey.length },
        });
      }

      return res.status(402).json({ error: text, code });
    }

    const trx = result?.transactionResponse;
    const transId = trx?.transId;
    const authCode = trx?.authCode;
    const responseCode = String(trx?.responseCode || '');

    if (!transId) {
      console.error('[Authorize.Net] Missing transaction id', {
        responseCode,
        errors: trx?.errors,
        messages: msg,
      });
      return res.status(502).json({ error: 'Authorize.Net did not return a transaction id.' });
    }

    // responseCode '1' is Approved. '2' is Declined, '3' is Error, '4' is Held for Review.
    if (responseCode !== '1') {
      const errorText = trx?.errors?.[0]?.errorText || 'Transaction was declined or held for review.';
      console.error('[Authorize.Net] Transaction not approved', { responseCode, transId, errorText });
      return res.status(402).json({
        error: errorText,
        responseCode,
        transactionId: transId
      });
    }

    // From this point forward, the charge was successful.
    transactionId = transId;

    let uberDelivery = null;
    let uberError = null;
    try {
      if (deliveryOption === 'delivery') {
        if (isManualSelection) {
          uberError = manualWarning || 'Manual delivery fallback (out of Uber range).';
          console.log('[Uber Direct] skipping courier (manual selection)', { uberError });
        } else {
          const billingInfo = body?.billing || {};
          const dropoffAddress = buildCustomerDropoffAddress(billingInfo);
          console.log('[Uber Direct] courier branch start', {
            pickupStoreId,
            billingKeys: Object.keys(billingInfo || {}),
            dropoffStreetLines: dropoffAddress.street_address,
            dropoffCity: dropoffAddress.city,
            dropoffState: dropoffAddress.state,
            dropoffZip: dropoffAddress.zip_code,
          });
          if (!dropoffAddress.street_address.length || !dropoffAddress.city || !dropoffAddress.state || !dropoffAddress.zip_code) {
            throw new Error('Missing delivery address fields.');
          }
          const dropoffPhone = toE164US(billingInfo.phoneNumber || body?.customer?.phone || '');
          if (!dropoffPhone) {
            throw new Error('Missing delivery phone number.');
          }
          const dropoffName = `${billingInfo.firstName || ''} ${billingInfo.lastName || ''}`.trim() || 'Customer';
          console.log('[Uber Direct] courier contact', { dropoffName, dropoffPhone });
          const manifestCents = Math.max(0, Math.round(orderTotal * 100));
          console.log('[Uber Direct] quote request input', { pickupStoreId, manifestCents });

          const quote = await uberCreateQuote({ pickupStoreId, dropoffAddress });
          console.log('[Uber Direct] quote response', { quoteId: quote?.id, fee: quote?.fee, currency: quote?.currency_code });

          const delivery = await uberCreateDelivery({
            quoteId: quote?.id,
            pickupStoreId,
            dropoffName,
            dropoffPhone,
            dropoffAddress,
            manifestTotalValueCents: manifestCents,
            manifestReference: `order-${transId}`,
          });
          console.log('[Uber Direct] delivery response', {
            deliveryId: delivery?.id,
            status: delivery?.status,
            tracking: delivery?.tracking_url || delivery?.trackingUrl || delivery?.share_url,
            fee: delivery?.fee,
          });

          uberDelivery = {
            deliveryId: delivery?.id || null,
            trackingUrl: delivery?.tracking_url || delivery?.trackingUrl || delivery?.share_url || null,
            status: delivery?.status || null,
            fee: delivery?.fee || null,
            quoteId: quote?.id || null,
            pickupStoreId,
          };
        }
      } else {
        console.log('[Uber Direct] courier branch skipped (delivery not selected)');
      }
    } catch (e) {
      uberError = e?.message || 'Uber courier request failed.';
      console.error('[Uber Direct] post-payment delivery create failed:', {
        error: uberError,
        stack: e?.stack,
      });
    }


    // --- Persist order receipt + decrement inventory (best-effort) ---
    orderId = crypto.randomUUID();
    const createdAtIso = new Date().toISOString();

    const receiptPayload = {
      orderId,
      createdAt: createdAtIso,
      deliveryMethod: deliveryOption,
      pickupStoreId,
      pickupStoreLabel: storeLabelFromId(pickupStoreId),
      pickupStoreAddress: buildStoreAddress(pickupStoreId),
      customer: { email, firstName, lastName, phone },
      items,
      totals: { subtotal, tax: taxAmount, delivery: deliveryFee, total: orderTotal },
      uber: uberDelivery || null,
      uberError: uberError || null,
      transactionId,
      billing: billing || {}
    };

    try {
      const normalizedId = normalizeStoreId(pickupStoreId);
      let inventoryTable = 'inventory_calle8';
      if (normalizedId === '79th') inventoryTable = 'inventory_79th';
      else if (normalizedId === 'mkt') inventoryTable = 'inventory_mkt';

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Get numeric store ID for product_inventory table
        let numericStoreId = 1; // Default Calle 8
        if (normalizedId === '79th') {
          const [storeRows] = await conn.query('SELECT id FROM stores WHERE name LIKE ?', ['%79th%']);
          numericStoreId = storeRows[0]?.id || 2;
        } else if (normalizedId === 'mkt') {
          const [storeRows] = await conn.query('SELECT id FROM stores WHERE name LIKE ?', ['%Market%']);
          numericStoreId = storeRows[0]?.id || 3;
        } else {
          const [storeRows] = await conn.query('SELECT id FROM stores WHERE name LIKE ?', ['%Calle 8%']);
          numericStoreId = storeRows[0]?.id || 1;
        }

        await conn.query(
          `INSERT INTO order_receipts
            (order_id, store_id, delivery_option, pickup_store_id, customer_email, customer_first_name, customer_last_name, customer_phone,
             items_json, totals_json, uber_response_json, uber_error, checkout_payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            normalizeStoreId(pickupStoreId),
            String(deliveryOption || ''),
            String(pickupStoreId || ''),
            String(email || ''),
            String(firstName || ''),
            String(lastName || ''),
            String(phone || ''),
            JSON.stringify(items || []),
            JSON.stringify({ subtotal, tax: taxAmount, delivery: deliveryFee, total: orderTotal }),
            uberDelivery ? JSON.stringify(uberDelivery) : null,
            uberError ? String(uberError) : null,
            JSON.stringify(req.body || {})
          ]
        );

        if (inventoryTable && Array.isArray(items) && items.length) {
          for (const it of items) {
            const qty = Number(it?.quantity || 0);
            if (!Number.isFinite(qty) || qty <= 0) continue;

            const productId = it?.id;
            const fallbackName = String(it?.name || '').trim();

            if (productId) {
              // 1. Update legacy snapshot table (used for frontend listing)
              await conn.query(
                `UPDATE ${inventoryTable} i
                 JOIN products p ON UPPER(p.name) = UPPER(i.name)
                 SET i.quantity = GREATEST(i.quantity - ?, 0)
                 WHERE p.id = ? AND i.is_active = 1`,
                [qty, productId]
              );
              // 2. Update central product_inventory table (used for real-time checks)
              await conn.query(
                `UPDATE product_inventory
                 SET quantity_on_hand = GREATEST(CAST(quantity_on_hand AS SIGNED) - ?, 0)
                 WHERE product_id = ? AND store_id = ?`,
                [qty, productId, numericStoreId]
              );
            } else if (fallbackName) {
              // 1. Update legacy snapshot table
              await conn.query(
                `UPDATE ${inventoryTable}
                 SET quantity = GREATEST(quantity - ?, 0)
                 WHERE name = ? AND is_active = 1`,
                [qty, fallbackName]
              );
              // 2. Update central product_inventory table
              await conn.query(
                `UPDATE product_inventory pi
                 JOIN products p ON p.id = pi.product_id
                 SET pi.quantity_on_hand = GREATEST(CAST(pi.quantity_on_hand AS SIGNED) - ?, 0)
                 WHERE UPPER(p.name) = UPPER(?) AND pi.store_id = ?`,
                [qty, fallbackName, numericStoreId]
              );
            }
          }
        }

        await conn.commit();

        // Notify Slack (async, don't await if you don't want to delay response,
        // but we're in an async block already and it's best-effort)
        sendSlackOrderNotification(receiptPayload).catch(e =>
          console.error('[Slack] notification failed:', e?.message || e)
        );

      } catch (dbErr) {
        try { await conn.rollback(); } catch {}
        console.error('[order_receipts] persist failed:', dbErr?.message || dbErr);
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error('[order_receipts] connection failed:', err?.message || err);
    }

    return res.json({
      ok: true,
      success: true,
      transactionId,
      authCode,
      responseCode,
      orderTotal,
      taxAmount,
      deliveryFee,
      uberDelivery,
      uberError,
      receipt: { order_id: orderId },
      receiptPayload
    });
  } catch (err) {
    console.error('[Authorize.Net] charge exception', err);
    // If a transactionId exists, the payment likely succeeded; do not return 500.
    if (transactionId) {
      return res.status(200).json({
        ok: true,
        success: true,
        transactionId,
        receipt: { order_id: orderId || null },
        warning: 'post_charge_error',
        warningMessage: err?.message || String(err)
      });
    }
    return res.status(500).json({ error: 'Server error while charging card.' });
  }
});


// Fetch a persisted receipt payload so /checkout-success works even after refresh
app.get('/api/order-receipts/:orderId', async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) return res.status(400).json({ ok: false, error: 'Missing orderId' });

    const [rows] = await queryWithRetry('SELECT * FROM order_receipts WHERE order_id = ? LIMIT 1', [orderId]);
    if (!rows || !rows.length) return res.status(404).json({ ok: false, error: 'Receipt not found' });

    const r = rows[0];

    const items = (() => { try { return r.items_json ? JSON.parse(r.items_json) : []; } catch { return []; } })();
    const totals = (() => { try { return r.totals_json ? JSON.parse(r.totals_json) : {}; } catch { return {}; } })();
    const uber = (() => { try { return r.uber_response_json ? JSON.parse(r.uber_response_json) : null; } catch { return null; } })();

    const payload = {
      orderId: r.order_id,
      createdAt: r.created_at,
      deliveryMethod: r.delivery_option,
      pickupStoreId: r.pickup_store_id,
      pickupStoreLabel: storeLabelFromId(r.pickup_store_id),
      pickupStoreAddress: buildStoreAddress(r.pickup_store_id),
      customer: {
        email: r.customer_email,
        firstName: r.customer_first_name,
        lastName: r.customer_last_name,
        phone: r.customer_phone
      },
      items,
      totals,
      uber,
      uberError: r.uber_error || null
    };

    return res.json({ ok: true, payload });
  } catch (err) {
    console.error('Error fetching receipt:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});



/* --------------------  Products (SSR)  -------------------- */
app.get('/products', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = PRODUCTS_PAGE_SIZE;
    const selectedShop = normalizeShop(req.query.shop);
    const snapshotTables = SHOP_TABLES[selectedShop] || SNAPSHOT_TABLES;
    const snapshotAggSql = buildSnapshotAggSql(snapshotTables);
    const storeMeta = getStoreChoice(selectedShop);

    const q = (req.query.q || '').trim();
    const sort = (req.query.sort || 'newest').toLowerCase();
    const category = (req.query.category || '').trim();
    const categoryId = category && !Number.isNaN(Number(category)) ? Number(category) : null;

    // WHERE
    const where = [];
    const params = [];
    if (q) {
      where.push('(p.name LIKE ? OR p.upc LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (categoryId !== null) {
      const [categoryRows] = await queryWithRetry(
        'SELECT id FROM categories WHERE id = ? OR parent_id = ? ORDER BY parent_id IS NULL DESC, id ASC',
        [categoryId, categoryId]
      );
      let categoryFilterIds = categoryRows.map((row) => row.id);
      if (!categoryFilterIds.length) {
        categoryFilterIds = [categoryId];
      } else if (!categoryFilterIds.includes(categoryId)) {
        categoryFilterIds.unshift(categoryId);
      }
      const placeholders = categoryFilterIds.map(() => '?').join(',');
      where.push(`p.category_id IN (${placeholders})`);
      params.push(...categoryFilterIds);
    }
    if (FEATURED_NAME_CLAUSE) {
      where.push(`(${FEATURED_NAME_CLAUSE})`);
      params.push(...FEATURED_NAME_PARAMS);
    }
    PRODUCT_EXCLUSION_KEYWORDS.forEach((keyword) => {
      where.push('UPPER(p.name) NOT LIKE ?');
      params.push(`%${keyword}%`);
    });
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const isStrictStore = selectedShop !== 'either';
    const inventoryJoinSql = `
        INNER JOIN (
          ${snapshotAggSql}
        ) snap ON snap.name_key = UPPER(p.name) AND (snap.any_active = 1 OR ${SHOW_ALL_LOCAL ? '1=1' : '0=1'})
        LEFT JOIN product_images pi ON pi.product_id = p.id
      `;

    const sortSql =
      sort === 'price_asc'  ? 'ORDER BY p.unit_price ASC' :
      sort === 'price_desc' ? 'ORDER BY p.unit_price DESC' :
      sort === 'newest'     ? 'ORDER BY p.id DESC' :
                              'ORDER BY p.id DESC';

    const pageSql = `
      SELECT
        p.id,
        p.name,
        COALESCE(NULLIF(pi.image_url,''), COALESCE(NULLIF(p.image_url,''), '/images/products/placeholder.webp')) AS image_url,
        ((pi.image_url IS NOT NULL AND pi.image_url <> '') OR (p.image_url IS NOT NULL AND p.image_url <> '')) AS has_image,
        COALESCE(NULLIF(pi.image_alt,''), COALESCE(NULLIF(p.image_placeholder,''), 'Image coming soon')) AS image_alt,
        p.unit_price AS price,
        COALESCE(snap.total_qty, 0) AS total_qty,
        p.supplier AS brand,
        COALESCE(snap.any_active, 0) AS any_active,
        NULL AS rating,
        NULL AS review_count
      FROM products p
      ${inventoryJoinSql}
      ${whereSql}
      ${sortSql}
    `;
    const [rows] = await queryWithRetry(pageSql, params);
    applyLocalQtyOverride(rows, selectedShop);

    // Group the fetched products by variant
    const groupedProducts = groupProductsByVariant(rows).filter(group =>
      FEATURED_BASE_SET.has((group.base_name || group.name || '').toUpperCase())
    );
    const totalGrouped = groupedProducts.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedProducts = groupedProducts.slice(startIndex, startIndex + pageSize);

    let finalProducts = paginatedProducts;

    if (paginatedProducts.length) {
      const baseKeys = [...new Set(paginatedProducts.map(p => (p.base_name || '').toUpperCase()).filter(Boolean))];
      if (baseKeys.length) {
        const variantConditions = baseKeys.map(() => 'UPPER(p.name) LIKE ?').join(' OR ');
        const variantParams = baseKeys.map(key => buildFeaturedNamePattern(key));
        const variantSql = `
          SELECT
            p.id,
            p.name,
            COALESCE(NULLIF(pi.image_url,''), COALESCE(NULLIF(p.image_url,''), '/images/products/placeholder.webp')) AS image_url,
            ((pi.image_url IS NOT NULL AND pi.image_url <> '') OR (p.image_url IS NOT NULL AND p.image_url <> '')) AS has_image,
            COALESCE(NULLIF(pi.image_alt,''), COALESCE(NULLIF(p.image_placeholder,''), 'Image coming soon')) AS image_alt,
            p.unit_price AS price,
            COALESCE(snap.total_qty, 0) AS total_qty,
            p.supplier AS brand,
            COALESCE(snap.any_active, 0) AS any_active,
            NULL AS rating,
            NULL AS review_count
          FROM products p
          ${inventoryJoinSql}
          WHERE (${variantConditions}) ${where.length ? 'AND ' + where.join(' AND ') : ''}
        `;
        const [variantRows] = await queryWithRetry(variantSql, [...variantParams, ...params]);
        applyLocalQtyOverride(variantRows, selectedShop);
        const variantGroups = groupProductsByVariant(variantRows);
        const variantMap = new Map(variantGroups.map(group => [group.base_name.toUpperCase(), group]));
        finalProducts = paginatedProducts.map(group => {
          const fullGroup = variantMap.get(group.base_name.toUpperCase());
          if (!fullGroup) {
            return group;
          }
          // Use fullGroup variants directly as they are already correctly aggregated and merged
          return {
            ...group,
            variants: fullGroup.variants,
          };
        });
      }
    }

    const estimatedGroupedTotal = totalGrouped;

    // Get all categories
    const [categoriesRows] = await queryWithRetry('SELECT id, name, slug FROM categories ORDER BY id ASC');
    const categories = (categoriesRows || []).filter((cat) => !HIDDEN_CATEGORY_NAMES.has((cat.name || '').toUpperCase()));

    res.render('products', {
      products: finalProducts,
      page,
      pageSize,
      total: estimatedGroupedTotal,
      q,
      sort,
      category,
      categories,
      selectedShop,
      storeMeta,
      storeOptions: STORE_CHOICES,
      title: 'Shop Products • Miami Vape Smoke Shop',
      description: 'Same-day pickup or delivery from either location.',
    });
  } catch (err) {
    console.error('Error loading products:', err);
    res.status(500).send('Error loading products');
  }
});

/* --------------------  Start  -------------------- */
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, async () => {
  console.log(`Server running → http://localhost:${PORT}`);
  await initStoresTable();
  await ensureProductImagesTable();
  await ensureSnapshotTables();
  await ensureOrderReceiptsTable();
  await seedVariantImages();
});















