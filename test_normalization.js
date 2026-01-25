
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_IMAGE_ROOT = path.join(__dirname, 'public', 'images', 'imagesForProducts');
const VALID_IMAGE_EXT = /\.(?:png|jpe?g|webp)$/i;

function normalizeProductName(name) {
  let value = String(name || '').trim();
  if (!value) return value;
  value = value.replace(/\bZERO\s+NICOTINE\b/gi, 'ZERO NIC');
  if (/^NEXA\b/i.test(value)) {
    value = value.replace(/\bPIX?A?\b/gi, '');
    value = value.replace(/^NEXA\s*(?:35K?)?\b/i, 'NEXA 35K ');
    value = value.replace(/^(NEXA 35K)\s*35K/i, '$1');
  }
  if (/^GRABBA\s+LEAF\s+WHOLE\s+LEAF$/i.test(value)) {
    value = 'GRABBA LEAF WHOLE';
  }
  return value;
}

function normalizeVariantKey(value = '') {
  const normalized = normalizeProductName(value);
  if (!normalized) return '';
  return normalized.replace(/[^0-9A-Z]/gi, '').toUpperCase();
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
        const match = `${brandName} ${flavorLabel}`.trim();
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

function getVariantImage(baseName, flavor, lookup) {
  const variantName = `${baseName} ${flavor}`.trim();
  const key = normalizeVariantKey(variantName);
  if (!key) return null;
  
  const match = lookup.get(key);
  if (match) return match;

  if (flavor === 'Original' || normalizeVariantKey(flavor) === normalizeVariantKey(baseName)) {
    const baseKey = normalizeVariantKey(baseName);
    return lookup.get(baseKey) || null;
  }

  return null;
}

const entries = buildStaticVariantImageMappings();
const lookup = buildVariantImageLookup(entries);

console.log('--- Static Entries ---');
entries.filter(e => e.match.includes('GRABBA')).forEach(e => console.log(e));

console.log('\n--- Lookup Keys ---');
for (const key of lookup.keys()) {
    if (key.includes('GRABBA')) console.log(key);
}

const base = 'GRABBA LEAF WHOLE';
const flavor = 'Original';
const img = getVariantImage(base, flavor, lookup);

console.log(`\nResult for "${base}" / "${flavor}":`);
console.log(img);
