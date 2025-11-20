// search_bar.js - Keyword mapping and search functionality

// Keyword-to-category/product mappings
const keywordMappings = {
  // NICOTINE VAPES keywords
  'vape': { type: 'search', terms: ['vape', 'disposable', 'nic vape', 'nicotine'] },
  'disposable': { type: 'search', terms: ['disposable', 'vape'] },
  'nic': { type: 'search', terms: ['nicotine', 'vape'] },
  'pod': { type: 'search', terms: ['pod', 'vape'] },
  'puff': { type: 'search', terms: ['puff', 'disposable'] },

  // THCA PRODUCTS keywords
  'joints': { type: 'search', terms: ['joint', 'thca', 'preroll'] },
  'thca': { type: 'search', terms: ['thca', 'hemp', 'delta'] },
  'hemp': { type: 'search', terms: ['hemp', 'cbd', 'thca'] },
  'preroll': { type: 'search', terms: ['preroll', 'joint'] },
  'flower': { type: 'search', terms: ['flower', 'hemp', 'thca'] },

  // TOBACCO PRODUCTS keywords
  'cigar': { type: 'search', terms: ['cigar', 'tobacco'] },
  'cigarette': { type: 'search', terms: ['cigarette', 'tobacco'] },
  'tobacco': { type: 'search', terms: ['tobacco'] },
  'blunt': { type: 'search', terms: ['blunt', 'cigar'] },

  // EDIBLES keywords
  'edible': { type: 'search', terms: ['edible', 'gummy', 'candy', 'chocolate'] },
  'gummy': { type: 'search', terms: ['gummy', 'edible'] },
  'chocolate': { type: 'search', terms: ['chocolate', 'edible'] },
  'candy': { type: 'search', terms: ['candy', 'edible'] },

  // VAPE CARTS keywords
  'cart': { type: 'search', terms: ['cart', 'cartridge', 'vape'] },
  'cartridge': { type: 'search', terms: ['cartridge', 'cart'] },
  'concentrate': { type: 'search', terms: ['concentrate', 'cart'] },
  'oil': { type: 'search', terms: ['oil', 'vape', 'cart'] },

  // GRINDERS keywords
  'grinder': { type: 'search', terms: ['grinder', 'herb grinder'] },
  'herb grinder': { type: 'search', terms: ['grinder', 'herb'] },

  // ROLLING PAPERS & CONES keywords
  'rolling papers': { type: 'search', terms: ['rolling paper', 'papers'] },
  'rolling paper': { type: 'search', terms: ['rolling paper'] },
  'cone': { type: 'search', terms: ['cone', 'rolling'] },
  'paper': { type: 'search', terms: ['paper', 'rolling'] },
  'skins': { type: 'search', terms: ['skin', 'rolling paper'] },

  // DEVICES: BATTERIES & MODS keywords
  'battery': { type: 'search', terms: ['battery', 'mod', 'device'] },
  'mod': { type: 'search', terms: ['mod', 'battery', 'device'] },
  'device': { type: 'search', terms: ['device', 'battery', 'vape'] },
  'charger': { type: 'search', terms: ['charger', 'battery'] },

  // HOOKAH RELATED keywords
  'hookah': { type: 'search', terms: ['hookah', 'shisha'] },
  'shisha': { type: 'search', terms: ['shisha', 'hookah'] },
  'coal': { type: 'search', terms: ['coal', 'hookah'] },
  'bowl': { type: 'search', terms: ['bowl', 'hookah'] }
};

/**
 * Transform user search query using keyword mappings
 * @param {string} query - Original search query
 * @returns {string} - Transformed search query
 */
function transformSearchQuery(query) {
  if (!query || query.trim().length === 0) {
    return query;
  }

  const lowerQuery = query.toLowerCase().trim();
  
  // Check if query matches any keywords
  for (const [keyword, mapping] of Object.entries(keywordMappings)) {
    if (lowerQuery.includes(keyword)) {
      // Return expanded terms for better matching
      const terms = mapping.terms.join(' OR ');
      return terms;
    }
  }

  // If no keyword match, return original query
  return query;
}

/**
 * Handle search form submission with keyword transformation
 */
function initSearchBar() {
  const searchForm = document.querySelector('form[role="search"]');
  const searchInput = document.querySelector('input[name="q"]');

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', function(e) {
      // Transform the search query before submission
      const originalQuery = searchInput.value;
      const transformedQuery = transformSearchQuery(originalQuery);
      searchInput.value = transformedQuery;
    });

    // Also handle mobile filter form if it exists
    const mobileFilterForm = document.getElementById('mobile-filters');
    if (mobileFilterForm) {
      mobileFilterForm.addEventListener('submit', function(e) {
        const mobileInput = document.querySelector('input[name="q"][form="mobile-filters"]');
        if (mobileInput) {
          const originalQuery = mobileInput.value;
          const transformedQuery = transformSearchQuery(originalQuery);
          mobileInput.value = transformedQuery;
        }
      });
    }
  }
}

/**
 * Initialize search bar when DOM is ready
 */
document.addEventListener('DOMContentLoaded', function() {
  initSearchBar();
});