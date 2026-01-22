const CART_STORAGE_KEY = 'cart';
const CART_LAST_CLOSED_KEY = 'cartLastClosedAt';
const CART_EXPIRATION_MS = 30000;
const MINI_CART_HIDE_DELAY = 320;

const miniCartState = {
  overlay: null,
  items: null,
  subtotal: null,
  closeBtn: null,
  continueBtn: null,
  checkoutBtn: null,
  hideTimer: null
};

function stampCartClosed() {
  try {
    localStorage.setItem(CART_LAST_CLOSED_KEY, String(Date.now()));
  } catch {}
}

function markCartActive() {
  try {
    localStorage.removeItem(CART_LAST_CLOSED_KEY);
  } catch {}
}

function expireCartIfNeeded() {
  try {
    const raw = localStorage.getItem(CART_LAST_CLOSED_KEY);
    if (!raw) return;
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) {
      localStorage.removeItem(CART_LAST_CLOSED_KEY);
      return;
    }
    if (Date.now() - timestamp > CART_EXPIRATION_MS) {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(CART_LAST_CLOSED_KEY);
    }
  } catch {}
}

function readCartStorage() {
  try {
    expireCartIfNeeded();
    const raw = JSON.parse(localStorage.getItem(CART_STORAGE_KEY));
    if (Array.isArray(raw)) return raw;
    return [];
  } catch {
    return [];
  }
}

function writeCartStorage(cart) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {}
}

function parsePrice(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value || '').replace(/[^0-9.]/g, '');
  const num = Number.parseFloat(str);
  return Number.isFinite(num) ? num : 0;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return '$0.00';
  return `$${value.toFixed(2)}`;
}

function getSubtotal(cart) {
  return cart.reduce((sum, item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    return sum + parsePrice(item.price) * qty;
  }, 0);
}

function updateCartCount() {
  const cart = readCartStorage();
  const count = cart.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
  const countEl = document.getElementById('cart-count');
  if (countEl) {
    countEl.textContent = count;
  }
}

function renderMiniCart() {
  if (!miniCartState.items || !miniCartState.subtotal) return;
  const cart = readCartStorage();
  if (!cart.length) {
    miniCartState.items.innerHTML = '<p class="mini-cart-row meta">Your cart is empty.</p>';
    miniCartState.subtotal.textContent = '$0.00';
    return;
  }
  const html = cart.map((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = parsePrice(item.price);
    const perUnitDisplay = unitPrice ? formatPrice(unitPrice) : (item.price || '$0.00');
    const lineTotal = unitPrice * qty;
    const lineTotalDisplay = unitPrice ? formatPrice(lineTotal) : perUnitDisplay;
    const safeImage = item.image || '/images/miami_vape_logo.webp';
    return `
      <div class="mini-cart-item">
        <div class="mini-cart-thumb">
          <img src="${safeImage}" alt="${item.name || 'Cart item'}">
        </div>
        <div class="mini-cart-details">
          <h3>${item.name || 'Cart item'}</h3>
          <div class="mini-cart-meta">
            <span>Qty ${qty}</span>
            <span>${perUnitDisplay}</span>
          </div>
          <div class="mini-cart-price">${lineTotalDisplay}</div>
        </div>
      </div>
    `;
  }).join('');
  miniCartState.items.innerHTML = html;
  miniCartState.subtotal.textContent = formatPrice(getSubtotal(cart));
}

function openMiniCart() {
  if (!miniCartState.overlay) return;
  renderMiniCart();
  miniCartState.overlay.hidden = false;
  requestAnimationFrame(() => {
    miniCartState.overlay.classList.add('is-visible');
    document.body.classList.add('mini-cart-open');
  });
}

function closeMiniCart() {
  if (!miniCartState.overlay || miniCartState.overlay.hidden) return;
  miniCartState.overlay.classList.remove('is-visible');
  document.body.classList.remove('mini-cart-open');
  if (miniCartState.hideTimer) {
    clearTimeout(miniCartState.hideTimer);
  }
  miniCartState.hideTimer = setTimeout(() => {
    if (!miniCartState.overlay.classList.contains('is-visible')) {
      miniCartState.overlay.hidden = true;
    }
  }, MINI_CART_HIDE_DELAY);
}

function initMiniCart() {
  if (miniCartState.overlay) return;
  miniCartState.overlay = document.querySelector('[data-mini-cart-overlay]');
  if (!miniCartState.overlay) return;
  miniCartState.items = miniCartState.overlay.querySelector('[data-mini-cart-items]');
  miniCartState.subtotal = miniCartState.overlay.querySelector('[data-mini-cart-subtotal]');
  miniCartState.closeBtn = miniCartState.overlay.querySelector('[data-mini-cart-close]');
  miniCartState.continueBtn = miniCartState.overlay.querySelector('[data-mini-cart-continue]');
  miniCartState.checkoutBtn = miniCartState.overlay.querySelector('[data-mini-cart-checkout]');
  const closers = [miniCartState.closeBtn, miniCartState.continueBtn];
  closers.forEach((btn) => {
    if (btn) btn.addEventListener('click', closeMiniCart);
  });
  if (miniCartState.checkoutBtn) {
    miniCartState.checkoutBtn.addEventListener('click', () => {
      closeMiniCart();
      (function () {
        const params = new URLSearchParams(window.location.search);
        const shopFromUrl = params.get('shop') || params.get('store');
        const shopFromStorage =
          localStorage.getItem('preferredShop') ||
          localStorage.getItem('selectedShop') ||
          localStorage.getItem('selectedStore') ||
          localStorage.getItem('shop') ||
          sessionStorage.getItem('preferredShop') ||
          sessionStorage.getItem('selectedShop') ||
          sessionStorage.getItem('selectedStore') ||
          sessionStorage.getItem('shop');

        const shop = (shopFromUrl || shopFromStorage || '').toString().trim();
        const qs = shop ? `?shop=${encodeURIComponent(shop)}` : '';
        window.location.href = `/checkout${qs}`;
      })();
    });
  }
  miniCartState.overlay.addEventListener('click', (event) => {
    if (event.target === miniCartState.overlay) {
      closeMiniCart();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMiniCart();
    }
  });
}

function ensureToastStyles() {
  if (document.getElementById('mini-cart-toast-animations')) return;
  const style = document.createElement('style');
  style.id = 'mini-cart-toast-animations';
  style.textContent = `
    @keyframes slideIn { from { transform: translateX(500px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(500px); opacity: 0; } }
  `;
  document.head.appendChild(style);
}

function showAddToCartNotification() {
  ensureToastStyles();
  const notification = document.createElement('div');
  notification.textContent = '✓ Added to cart';
  notification.style.cssText = [
    'position: fixed',
    'bottom: 2rem',
    'right: 2rem',
    'background: #69CEE9',
    'color: #0a1222',
    'padding: 1rem 1.5rem',
    'border-radius: 12px',
    'font-weight: 600',
    'z-index: 10000',
    'animation: slideIn 0.3s ease'
  ].join(';');
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

function addToCart(product, quantity = 1) {
  const cart = readCartStorage();
  const wasEmpty = cart.length === 0;
  const existingItem = cart.find((item) => item.id === product.id);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    const priceNum = parsePrice(product.price);
    cart.push({
      id: product.id,
      name: product.name,
      price: priceNum || product.price,
      image: product.image,
      brand: product.brand || 'Miami Vape',
      quantity
    });
  }
  writeCartStorage(cart);
  markCartActive();
  updateCartCount();
  initMiniCart();
  if (miniCartState.overlay && miniCartState.overlay.classList.contains('is-visible')) {
    renderMiniCart();
  }
  showAddToCartNotification();
  if (wasEmpty && miniCartState.overlay) {
    openMiniCart();
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    stampCartClosed();
    return;
  }
  expireCartIfNeeded();
  markCartActive();
  updateCartCount();
  if (miniCartState.overlay && miniCartState.overlay.classList.contains('is-visible')) {
    renderMiniCart();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  expireCartIfNeeded();
  markCartActive();
  updateCartCount();
  initMiniCart();
});

document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', stampCartClosed);
window.addEventListener('pagehide', stampCartClosed);
