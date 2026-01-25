document.addEventListener('DOMContentLoaded', function() {
  function updateVariantAvailability(card, variant) {
    if (!card || !variant) return;
    const btn = card.querySelector('.btn-accent[data-primary-btn]');
    if (!btn) return;
    const qty = Number(variant.dataset.qty || 0);
    const inStock = btn.dataset.stockLabelAvailable || 'Add to cart';
    const outStock = btn.dataset.stockLabelOut || 'Out of stock';
    if (qty > 0) {
      btn.disabled = false;
      btn.textContent = inStock;
      card.classList.remove('sold-out');
    } else {
      btn.disabled = true;
      btn.textContent = outStock;
      card.classList.add('sold-out');
    }
  }

  function syncInitialVariantState(card) {
    const carousel = card.querySelector('.flavor-carousel');
    if (!carousel) return;
    const variants = carousel.querySelectorAll('.flavor-variant');
    if (!variants.length) return;
    let idx = parseInt(carousel.dataset.flavorIndex || 0, 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= variants.length) idx = 0;
    carousel.dataset.flavorIndex = idx;
    const variant = variants[idx];
    const flavorText = carousel.querySelector('.flavor-text');
    if (flavorText && variant?.dataset.flavor) {
      flavorText.textContent = variant.dataset.flavor;
    }
    updateVariantAvailability(card, variant);
  }

  document.querySelectorAll('.product-card').forEach(syncInitialVariantState);

  document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('prev-flavor') && !e.target.classList.contains('next-flavor')) return;

    e.preventDefault();
    const carousel = e.target.closest('.flavor-carousel');
    if (!carousel) return;

    const variants = carousel.querySelectorAll('.flavor-variant');
    if (!variants.length) return;

    let idx = parseInt(carousel.dataset.flavorIndex || 0, 10);
    if (Number.isNaN(idx)) idx = 0;
    const direction = e.target.classList.contains('next-flavor') ? 1 : -1;
    idx += direction;
    if (idx < 0) idx = variants.length - 1;
    if (idx >= variants.length) idx = 0;

    const variant = variants[idx];
    carousel.dataset.flavorIndex = idx;
    const flavorText = carousel.querySelector('.flavor-text');
    if (flavorText && variant?.dataset.flavor) {
      flavorText.textContent = variant.dataset.flavor;
    }

    const card = carousel.closest('.product-card');
    const mediaImg = card?.querySelector('.product-media img');
    if (mediaImg && variant.dataset.image) {
      mediaImg.src = variant.dataset.image;
      if (variant.dataset.imageAlt) {
        mediaImg.alt = variant.dataset.imageAlt;
      }
    }
    const badge = card?.querySelector('.no-image-badge');
    if (badge) {
      if (variant.dataset.hasImage === 'true') {
        badge.classList.add('is-hidden');
      } else {
        badge.classList.remove('is-hidden');
        badge.textContent = variant.dataset.imageAlt || 'Image coming soon';
      }
    }

    updateVariantAvailability(card, variant);

    carousel.querySelector('.prev-flavor').disabled = false;
    carousel.querySelector('.next-flavor').disabled = false;
  });

  document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('btn-accent')) return;
    if (e.target.disabled) return;

    e.preventDefault();

    const card = e.target.closest('.product-card');
    if (!card) return;

    const isGrouped = card.dataset.isGrouped === 'true';
    let productId = card.dataset.productId;

    let productName, priceText, brandText, imageSrc;

    if (isGrouped) {
      const carousel = card.querySelector('.flavor-carousel');
      if (!carousel) {
        productName = card.querySelector('.product-name')?.textContent;
      } else {
        let idx = parseInt(carousel.dataset.flavorIndex || 0, 10);
        if (Number.isNaN(idx)) idx = 0;
        const variant = carousel.querySelectorAll('.flavor-variant')[idx];
        if (!variant) {
          Swal.fire({
            icon: 'info',
            title: 'Flavor Selection',
            text: 'Please select a flavor',
            background: '#0e1828',
            color: '#fff',
            confirmButtonColor: '#69CEE9'
          });
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
      productName = card.querySelector('.product-name')?.textContent;
      priceText = card.querySelector('.price')?.textContent;
      brandText = card.querySelector('.brand')?.textContent;
      const img = card.querySelector('.product-media img');
      imageSrc = img?.src;
    }

    if (productName && priceText) {
      const carousel = card.querySelector('.flavor-carousel');
      let maxQty = 999;
      if (isGrouped && carousel) {
        let idx = parseInt(carousel.dataset.flavorIndex || 0, 10);
        const variant = carousel.querySelectorAll('.flavor-variant')[idx];
        if (variant) {
          maxQty = parseInt(variant.dataset.qty || 999, 10);
        }
      } else {
        maxQty = parseInt(card.dataset.qty || 999, 10);
      }

      addToCart({
        id: productId,
        name: productName,
        price: priceText,
        image: imageSrc,
        brand: brandText
      }, 1, maxQty);
    }
  });
});
