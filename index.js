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

const FEATURED_BASE_PRODUCTS = [
  'LOST MARY TURBO 35K',
  'GEEKBAR X 25K',
  'GEEKBAR',
  'CUVIE PLUS',
  'FUME EXTRA',
  'DESTINO PRE ROLL 1GR',
  'BB CART 1GR',
  'BB PEN 1GR',
  'BB MOONROCK PRE ROLL 2GR'
];
const FEATURED_BASE_SET = new Set(FEATURED_BASE_PRODUCTS.map((name) => name.toUpperCase()));
const FEATURED_NAME_CLAUSE = FEATURED_BASE_PRODUCTS.map(() => 'UPPER(p.name) LIKE ?').join(' OR ');
const FEATURED_NAME_PARAMS = FEATURED_BASE_PRODUCTS.map((name) => `${name.toUpperCase()}%`);

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
    match: 'GEEKBAR X 25K ORANGE FCUKING FAB',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/ORANGEFCUKINGFAB.jpg',
    imageAlt: 'GEEKBAR X 25K • Orange Fcuking Fab'
  },
  {
    match: 'GEEKBAR X 25K SOUR FCUKING FAB',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/SOURFCUKINGFAB.jpeg',
    imageAlt: 'GEEKBAR X 25K • Sour Fcuking Fab'
  },
  {
    match: 'GEEKBAR X 25K ORANGE JAM',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/ORANGEJAM.jpg',
    imageAlt: 'GEEKBAR X 25K • Orange Jam'
  },
  {
    match: 'GEEKBAR X 25K PEACH JAM',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/PEACHJAM.jpg',
    imageAlt: 'GEEKBAR X 25K • Peach Jam'
  },
  {
    match: 'GEEKBAR X 25K RASPBERRY JAM',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/RASPBERRYJAM.jpg',
    imageAlt: 'GEEKBAR X 25K • Raspberry Jam'
  },
  {
    match: 'GEEKBAR X 25K RASPBERRY PEACH LIME',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/RASBERRYPEACHLIME.jpg',
    imageAlt: 'GEEKBAR X 25K • Raspberry Peach Lime'
  },
  {
    match: 'GEEKBAR X 25K SOUR STRAWS',
    imageUrl: '/images/imagesForProducts/GEEKBAR%20X%2025K/SOURSTRAWS.jpg',
    imageAlt: 'GEEKBAR X 25K • Sour Straws'
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
  }
];

const DISCONTINUED_VARIANTS = new Map([
  ['BB CART 1GR', new Set(['PARTY PACK'])]
]);

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
app.get('/api/stores', async (_req, res) => {
  try {
    const [stores] = await queryWithRetry(
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
  if (/^BB\s*PEN\b/i.test(value)) {
    value = value.replace(/^BB\s*PEN\b/i, 'BB PEN');
    if (/\b1G\b/i.test(value)) {
      value = value.replace(/\b1G\b/i, '1GR');
    }
    if (!/\b1GR\b/i.test(value)) {
      value = value.replace(/^BB PEN\b/i, 'BB PEN 1GR');
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
    const blockSet = DISCONTINUED_VARIANTS.get(normalizedKey);
    if (blockSet && blockSet.has(flavor.toUpperCase())) {
      return;
    }
    grouped[normalizedKey].variants.push({
      id: product.id,
      name: normalizedName,
      flavor,
      price: product.price,
      total_qty: product.total_qty,
      image_url: product.image_url,
      image_alt: product.image_alt,
      has_image: !!product.has_image
    });
  });
  
  Object.values(grouped).forEach(group => {
    group.variants.sort((a, b) => {
      if (!!a.has_image === !!b.has_image) {
        return a.flavor.localeCompare(b.flavor);
      }
      return a.has_image ? -1 : 1;
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
        ('79th Street', '351 NE 79th St Unit 101, Miami, FL 33138', 25.8389, -80.1893, true)
      `);
      console.log('✓ Stores table initialized with 2 locations');
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

async function seedVariantImages() {
  if (!VARIANT_IMAGE_MAPPINGS.length) return;
  try {
    const insertSql = `
      INSERT INTO product_images (product_id, image_url, image_alt)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        image_url = VALUES(image_url),
        image_alt = VALUES(image_alt),
        updated_at = CURRENT_TIMESTAMP
    `;

    for (const mapping of VARIANT_IMAGE_MAPPINGS) {
      const [products] = await queryWithRetry('SELECT id FROM products WHERE UPPER(name) = ?', [mapping.match.toUpperCase()]);
      if (!products.length) continue;
      for (const product of products) {
        await queryWithRetry(insertSql, [product.id, mapping.imageUrl, mapping.imageAlt]);
      }
    }
  } catch (err) {
    console.error('Error seeding variant images:', err.message);
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
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const inventoryJoinSql = `
      LEFT JOIN (
        SELECT product_id, SUM(quantity_on_hand) AS total_qty
        FROM product_inventory
        GROUP BY product_id
      ) inv ON inv.product_id = p.id
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
        COALESCE(inv.total_qty, 0) AS total_qty,
        p.supplier AS brand,
        NULL AS rating,
        NULL AS review_count
      FROM products p
      ${inventoryJoinSql}
      ${whereSql}
      ${sortSql}
    `;
    const [rows] = await queryWithRetry(pageSql, params);

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
        const variantParams = baseKeys.map(key => `${key}%`);
        const variantSql = `
          SELECT
            p.id,
            p.name,
            COALESCE(NULLIF(pi.image_url,''), COALESCE(NULLIF(p.image_url,''), '/images/products/placeholder.webp')) AS image_url,
            ((pi.image_url IS NOT NULL AND pi.image_url <> '') OR (p.image_url IS NOT NULL AND p.image_url <> '')) AS has_image,
            COALESCE(NULLIF(pi.image_alt,''), COALESCE(NULLIF(p.image_placeholder,''), 'Image coming soon')) AS image_alt,
            p.unit_price AS price,
            COALESCE(inv.total_qty, 0) AS total_qty,
            p.supplier AS brand,
            NULL AS rating,
            NULL AS review_count
          FROM products p
          ${inventoryJoinSql}
          WHERE ${variantConditions}
        `;
        const [variantRows] = await queryWithRetry(variantSql, variantParams);
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
    
    const estimatedGroupedTotal = totalGrouped;

    // Get all categories
    const [categoriesRows] = await queryWithRetry('SELECT id, name, slug FROM categories ORDER BY id ASC');
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
  await ensureProductImagesTable();
  await seedVariantImages();
});
