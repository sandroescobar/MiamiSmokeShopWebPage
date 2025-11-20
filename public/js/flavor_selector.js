// flavor_selector.js - Handle flavor carousel for grouped products

document.addEventListener('DOMContentLoaded', function() {
  // Flavor carousel navigation
  document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('prev-flavor') && !e.target.classList.contains('next-flavor')) return;
    
    e.preventDefault();
    const carousel = e.target.closest('.flavor-carousel');
    if (!carousel) return;
    
    const allVariants = carousel.querySelectorAll('.flavor-variant');
    if (allVariants.length === 0) return;
    
    let currentIdx = parseInt(carousel.dataset.flavorIndex || 0);
    const direction = e.target.classList.contains('next-flavor') ? 1 : -1;
    let newIdx = currentIdx + direction;
    
    // Loop around
    if (newIdx < 0) newIdx = allVariants.length - 1;
    if (newIdx >= allVariants.length) newIdx = 0;
    
    // Update display
    const variant = allVariants[newIdx];
    carousel.dataset.flavorIndex = newIdx;
    carousel.querySelector('.flavor-text').textContent = variant.dataset.flavor;
    
    // Update button states
    carousel.querySelector('.prev-flavor').disabled = false;
    carousel.querySelector('.next-flavor').disabled = false;
  });
  
  // Handle Add to Cart button click for grouped products
  document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('btn-accent')) return;
    
    e.preventDefault();
    
    const card = e.target.closest('.product-card');
    if (!card) return;
    
    const isGrouped = card.dataset.isGrouped === 'true';
    let productId = card.dataset.productId;
    
    // Find product info
    let productName, priceText, brandText, imageSrc;
    
    if (isGrouped) {
      // Get selected flavor from carousel
      const carousel = card.querySelector('.flavor-carousel');
      if (!carousel) {
        // Single variant or non-grouped
        productName = card.querySelector('.product-name')?.textContent;
      } else {
        const currentIdx = parseInt(carousel.dataset.flavorIndex || 0);
        const variant = carousel.querySelectorAll('.flavor-variant')[currentIdx];
        if (!variant) {
          alert('Please select a flavor');
          return;
        }
        
        productId = variant.dataset.variantId;
        const flavor = variant.dataset.flavor;
        const baseName = card.querySelector('.product-name')?.textContent || '';
        
        productName = `${baseName} - ${flavor}`;
      }
      
      priceText = card.querySelector('.price')?.textContent;
      brandText = card.querySelector('.brand')?.textContent;
      const img = card.querySelector('.product-media img');
      imageSrc = img?.src;
    } else {
      // Non-grouped product (legacy)
      productName = card.querySelector('.product-name')?.textContent;
      priceText = card.querySelector('.price')?.textContent;
      brandText = card.querySelector('.brand')?.textContent;
      const img = card.querySelector('.product-media img');
      imageSrc = img?.src;
    }
    
    if (productName && priceText) {
      addToCart({
        id: productId,
        name: productName,
        price: priceText,
        image: imageSrc,
        brand: brandText
      });
    }
  });
});