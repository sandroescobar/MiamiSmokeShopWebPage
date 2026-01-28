
import { normalizeProductName, extractProductVariantKey } from './index.js';

const testNames = [
    'HQD CUVIE PLUS MIAMI MINT',
    'CUVIE PLUS LUSH ICE',
    'HQD CUVIE PLUS STRAWBERRY',
    'HQD CUVIE PLUS ICE MINT'
];

testNames.forEach(name => {
    const normalized = normalizeProductName(name);
    const base = extractProductVariantKey(normalized);
    console.log(`Original: "${name}"`);
    console.log(`Normalized: "${normalized}"`);
    console.log(`Base: "${base}"`);
    console.log('---');
});
