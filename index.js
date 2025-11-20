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

    // Check if store exists
    const [stores] = await pool.query('SELECT id FROM stores WHERE name = ?', [store_name]);
    if (stores.length === 0) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // Get availability for each product at this store
    const placeholders = product_ids.map(() => '?').join(',');
    const [availability] = await pool.query(
      `SELECT id, name, location, quantity_on_hand 
       FROM products 
       WHERE id IN (${placeholders}) AND location = ?`,
      [...product_ids, store_name]
    );

    // Build response: id -> available (boolean)
    const availabilityMap = {};
    product_ids.forEach(id => {
      availabilityMap[id] = false;
    });
    availability.forEach(product => {
      availabilityMap[product.id] = product.quantity_on_hand > 0;
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

/* --------------------  Helper: Group products by variant  -------------------- */
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
  const keyNormalization = {}; // Maps normalized keys back to display names
  
  products.forEach(product => {
    const baseKey = extractProductVariantKey(product.name);
    // Normalize to uppercase for case-insensitive grouping
    const normalizedKey = baseKey.toUpperCase();
    
    if (!grouped[normalizedKey]) {
      grouped[normalizedKey] = {
        ...product,
        base_name: baseKey,
        variants: []
      };
      keyNormalization[normalizedKey] = baseKey;
    }
    
    const flavor = extractFlavor(product.name, baseKey);
    grouped[normalizedKey].variants.push({
      id: product.id,
      name: product.name,
      flavor: flavor,
      price: product.price,
      total_qty: product.total_qty,
      image_url: product.image_url,
      image_alt: product.image_alt
    });
  });
  
  // Filter out single-variant products where the flavor is "Original"
  // (these are orphaned base products without actual flavor variants)
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
    description: 'Complete your purchase',
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

    // SORT
    const sortSql =
      sort === 'price_asc'  ? 'ORDER BY p.unit_price ASC' :
      sort === 'price_desc' ? 'ORDER BY p.unit_price DESC' :
      sort === 'newest'     ? 'ORDER BY p.id DESC' :
                              'ORDER BY p.id DESC';

    // COUNT TOTAL (for pagination - this counts RAW products from DB)
    const countSql = `SELECT COUNT(*) AS total FROM products p ${category ? 'LEFT JOIN product_categories pc ON p.id = pc.product_id' : ''} ${whereSql}`;
    const [countRows] = await pool.query(countSql, params);
    const totalRaw = countRows[0]?.total || 0;

    // OPTION 2: Fetch larger batch to capture all variants together
    // Multiply the page size by 2.5x to reduce risk of variants split across batches
    const fetchMultiplier = 2.5;
    const rawFetchSize = Math.ceil(pageSize * fetchMultiplier);
    const rawOffset = (page - 1) * rawFetchSize;

    // Query with larger fetch size
    const pageSql = `
      SELECT
        p.id,
        p.name,
        COALESCE(NULLIF(p.image_url,''), '/images/products/placeholder.webp') AS image_url,
        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image,
        COALESCE(NULLIF(p.image_placeholder,''), 'Image coming soon') AS image_alt,
        p.unit_price AS price,
        p.quantity_on_hand AS total_qty,
        p.supplier AS brand,
        NULL AS rating,
        NULL AS review_count
      FROM products p
      ${category ? 'LEFT JOIN product_categories pc ON p.id = pc.product_id' : ''}
      ${whereSql}
      ${sortSql}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(pageSql, params.concat([rawFetchSize, rawOffset]));

    // Group the fetched products by variant
    const groupedProducts = groupProductsByVariant(rows);
    
    // Slice to the requested pageSize (from the grouped results)
    const paginatedProducts = groupedProducts.slice(0, pageSize);
    
    // For pagination display, estimate the total grouped products
    // (Note: this is an approximation since grouping ratio varies by page)
    const estimatedGroupedTotal = Math.ceil(totalRaw / (rows.length > 0 ? rows.length / groupedProducts.length : 1));

    // Get all categories
    const [categoriesRows] = await pool.query('SELECT id, name, slug FROM categories ORDER BY id ASC');
    const categories = categoriesRows || [];

    res.render('products', {
      products: paginatedProducts,
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
