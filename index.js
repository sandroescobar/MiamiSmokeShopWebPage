// index.js (ESM)
import 'dotenv/config';
import path from 'path';
import express from 'express';
import ejsLayouts from 'express-ejs-layouts';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* --------------------  EJS + layouts  -------------------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/main');

/* --------------------  Static /public  -------------------- */
app.use(express.static(path.join(__dirname, 'public')));

/* --------------------  JSON parsing  -------------------- */
app.use(express.json());

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
  ],
};

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

/* --------------------  Health  -------------------- */
app.get('/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ status: 'error', error: String(e?.message || e) });
  }
});

/* --------------------  API: Get all stores  -------------------- */
app.get('/api/stores', async (_req, res) => {
  try {
    const [stores] = await pool.query(
      'SELECT id, name, address, latitude, longitude FROM stores WHERE is_active = true ORDER BY id'
    );
    res.json(stores);
  } catch (err) {
    console.error('Error fetching stores:', err);
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
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

    const [stores] = await pool.query('SELECT id FROM stores WHERE name = ?', [store_name]);
    if (stores.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const storeId = stores[0].id;
    const placeholders = product_ids.map(() => '?').join(',');
    const [availability] = await pool.query(
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
    const [stores] = await pool.query(
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

/* Safety redirects if old links exist */
app.get(
  ['/views/products.ejs', '/views/layouts/products.ejs', '/public/products.html', '/products.html'],
  (_req, res) => res.redirect('/products')
);

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
function normalizeProductName(name) {
  let value = String(name || '').trim();
  if (!value) return value;
  if (/^RA[ZX]\s*LTX\b/i.test(value)) {
    value = value.replace(/^RA[ZX]\s*LTX\b/i, 'RAZ LTX');
    if (!/\b25K\b/i.test(value)) {
      value = value.replace(/^RAZ LTX\b/i, 'RAZ LTX 25K');
    }
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
    value = value.replace(/^FUME\s*INFINITY\b/i, 'FUME INFINITY');
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
  if (/^BB\s*CART\b/i.test(value)) {
    value = value.replace(/^BB\s*CART\b/i, 'BB CART');
    if (/\b1G\b/i.test(value)) {
      value = value.replace(/\b1G\b/i, '1GR');
    }
    if (!/\b1GR\b/i.test(value)) {
      value = value.replace(/^BB CART\b/i, 'BB CART 1GR');
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
  
  // Find the position of the first size spec
  for (let i = 0; i < words.length; i++) {
    if (sizePattern.test(words[i])) {
      // Found size spec at position i
      // Include all words up to and including this one
      return words.slice(0, i + 1).join(' ');
    }
  }
  
  // No size spec found - fall back to original logic (first 2-3 words)
  if (words.length < 2) return name;
  
  let baseWords = words.slice(0, 2);
  
  // If there's a 3rd word and it looks like a descriptor/quantity, include it
  // (e.g., "SINGLE", "ORIGINAL", "KINGS", "SLIM", etc.)
  if (words.length > 2 && 
      /^(SINGLE|ORIGINAL|KINGS|SLIM|MINI|EXTRA|DOUBLE|TRIPLE|DUAL|WOOD|PLASTIC)$/.test(words[2])) {
    baseWords.push(words[2]);
  }
  
  return baseWords.join(' ');
}

function extractFlavor(name, baseKey) {
  // Extract flavor from product name by removing the base key
  const flavor = name.replace(new RegExp(`^${baseKey}\\s*`, 'i'), '').trim();
  return flavor || 'Original';
}

function groupProductsByVariant(products) {
  const grouped = {};
  
  products.forEach(product => {
    const normalizedName = normalizeProductName(product.name);
    const baseKey = extractProductVariantKey(normalizedName);
    const normalizedKey = baseKey.toUpperCase();
    
    if (!grouped[normalizedKey]) {
      grouped[normalizedKey] = {
        ...product,
        name: normalizedName,
        base_name: baseKey,
        variants: []
      };
    }
    
    const flavor = extractFlavor(normalizedName, baseKey);
    grouped[normalizedKey].variants.push({
      id: product.id,
      name: normalizedName,
      flavor,
      price: product.price,
      total_qty: product.total_qty,
      image_url: product.image_url,
      image_alt: product.image_alt
    });
  });
  
  return Object.values(grouped).filter(group => {
    if (group.variants.length === 1 && group.variants[0].flavor === 'Original') {
      return false;
    }
    return true;
  });
}

/* --------------------  Shopping Cart  -------------------- */
app.get('/cart', (_req, res) => {
  res.render('cart', {
    title: 'Shopping Cart • Miami Vape Smoke Shop',
    description: 'Review your items and proceed to checkout.',
  });
});

/* --------------------  Init Stores Table  -------------------- */
async function initStoresTable() {
  try {
    // Create stores table
    await pool.query(`
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
    const [stores] = await pool.query('SELECT COUNT(*) AS count FROM stores');
    
    if (stores[0].count === 0) {
      // Insert stores
      await pool.query(`
        INSERT INTO stores (name, address, latitude, longitude, is_active) VALUES
        ('Calle 8', '6346 SW 8th St, West Miami, FL 33144', 25.7635, -80.3103, true),
        ('79th Street', '351 NE 79th St Unit 101, Miami, FL 33138', 25.8389, -80.1893, true)
      `);
      console.log('✓ Stores table initialized with 2 locations');
    }
  } catch (err) {
    console.error('Error initializing stores table:', err.message);
  }
}

/* --------------------  Checkout  -------------------- */
app.get('/checkout', (_req, res) => {
  res.render('checkout', {
    title: 'Checkout • Miami Vape Smoke Shop',
    description: 'Complete your purchase'
  });
});

app.get('/faq', (_req, res) => {
  res.render('faq', {
    title: 'FAQ • Miami Vape Smoke Shop',
    description: 'Delivery, THCa, payments, and policies explained.',
    contact: CONTACT_INFO,
  });
});

/* --------------------  Products (SSR)  -------------------- */
app.get('/products', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.page_size || '24', 10), 1), 60);
    
    const q = (req.query.q || '').trim();
    const sort = (req.query.sort || 'newest').toLowerCase();
    const category = (req.query.category || '').trim();

    // WHERE
    const where = [];
    const params = [];
    if (q) {
      where.push('(p.name LIKE ? OR p.upc LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      where.push('pc.category_id = ?');
      params.push(category);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const inventoryJoinSql = `
      LEFT JOIN (
        SELECT product_id, SUM(quantity_on_hand) AS total_qty
        FROM product_inventory
        GROUP BY product_id
      ) inv ON inv.product_id = p.id
    `;

    const sortSql =
      sort === 'price_asc'  ? 'ORDER BY p.unit_price ASC' :
      sort === 'price_desc' ? 'ORDER BY p.unit_price DESC' :
      sort === 'newest'     ? 'ORDER BY p.id DESC' :
                              'ORDER BY p.id DESC';

    const countSql = `SELECT COUNT(*) AS total FROM products p ${category ? 'LEFT JOIN product_categories pc ON p.id = pc.product_id' : ''} ${whereSql}`;
    const [countRows] = await pool.query(countSql, params);
    const totalRaw = countRows[0]?.total || 0;

    const fetchMultiplier = 2.5;
    const rawFetchSize = Math.ceil(pageSize * fetchMultiplier);
    const rawOffset = (page - 1) * rawFetchSize;

    const pageSql = `
      SELECT
        p.id,
        p.name,
        COALESCE(NULLIF(p.image_url,''), '/images/products/placeholder.webp') AS image_url,
        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image,
        COALESCE(NULLIF(p.image_placeholder,''), 'Image coming soon') AS image_alt,
        p.unit_price AS price,
        COALESCE(inv.total_qty, 0) AS total_qty,
        p.supplier AS brand,
        NULL AS rating,
        NULL AS review_count
      FROM products p
      ${category ? 'LEFT JOIN product_categories pc ON p.id = pc.product_id' : ''}
      ${inventoryJoinSql}
      ${whereSql}
      ${sortSql}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(pageSql, params.concat([rawFetchSize, rawOffset]));

    // Group the fetched products by variant
    const groupedProducts = groupProductsByVariant(rows);
    
    // Slice to the requested pageSize (from the grouped results)
    const paginatedProducts = groupedProducts.slice(0, pageSize);

    let finalProducts = paginatedProducts;

    if (!q && !category && paginatedProducts.length) {
      const baseKeys = [...new Set(paginatedProducts.map(p => (p.base_name || '').toUpperCase()).filter(Boolean))];
      if (baseKeys.length) {
        const variantConditions = baseKeys.map(() => 'UPPER(p.name) LIKE ?').join(' OR ');
        const variantParams = baseKeys.map(key => `${key}%`);
        const variantSql = `
          SELECT
            p.id,
            p.name,
            COALESCE(NULLIF(p.image_url,''), '/images/products/placeholder.webp') AS image_url,
            (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image,
            COALESCE(NULLIF(p.image_placeholder,''), 'Image coming soon') AS image_alt,
            p.unit_price AS price,
            COALESCE(inv.total_qty, 0) AS total_qty,
            p.supplier AS brand,
            NULL AS rating,
            NULL AS review_count
          FROM products p
          ${inventoryJoinSql}
          WHERE ${variantConditions}
        `;
        const [variantRows] = await pool.query(variantSql, variantParams);
        const variantGroups = groupProductsByVariant(variantRows);
        const variantMap = new Map(variantGroups.map(group => [group.base_name.toUpperCase(), group]));
        finalProducts = paginatedProducts.map(group => {
          const fullGroup = variantMap.get(group.base_name.toUpperCase());
          if (!fullGroup) {
            return group;
          }
          const seen = new Set(group.variants.map(v => v.id));
          const mergedVariants = [...group.variants];
          fullGroup.variants.forEach(variant => {
            if (!seen.has(variant.id)) {
              mergedVariants.push(variant);
            }
          });
          return {
            ...group,
            variants: mergedVariants,
          };
        });
      }
    }
    
    // For pagination display, estimate the total grouped products
    // (Note: this is an approximation since grouping ratio varies by page)
    const estimatedGroupedTotal = Math.ceil(totalRaw / (rows.length > 0 ? rows.length / groupedProducts.length : 1));

    // Get all categories
    const [categoriesRows] = await pool.query('SELECT id, name, slug FROM categories ORDER BY id ASC');
    const categories = categoriesRows || [];

    res.render('products', {
      products: finalProducts,
      page, pageSize, total: estimatedGroupedTotal,
      shop: null, q, sort, category,
      categories,
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
});
