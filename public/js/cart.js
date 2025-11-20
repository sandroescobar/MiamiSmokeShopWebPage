// cart.js - Shopping cart functionality

/**
 * Add item to cart
 * @param {object} product - Product object with id, name, price, image, brand
 * @param {number} quantity - Quantity to add (default: 1)
 */
function addToCart(product, quantity = 1) {
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  
  // Check if product already in cart
  const existingItem = cart.find(item => item.id === product.id);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    // Format price as a proper number for calculations
    const priceNum = typeof product.price === 'string' 
      ? parseFloat(product.price.replace('$', '')) 
      : parseFloat(product.price);
    
    cart.push({
      id: product.id,
      name: product.name,
      price: priceNum,
      image: product.image,
      brand: product.brand || 'Miami Vape',
      quantity: quantity
    });
  }
  
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
  showAddToCartNotification();
}

/**
 * Update cart count in navbar
 */
function updateCartCount() {
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const countEl = document.getElementById('cart-count');
  if (countEl) {
    countEl.textContent = count;
  }
}

/**
 * Show a brief notification when item is added
 */
function showAddToCartNotification() {
  // Create notification element
  const notification = document.createElement('div');
  notification.textContent = '✓ Added to cart';
  notification.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: #69CEE9;
    color: #0a1222;
    padding: 1rem 1.5rem;
    border-radius: 12px;
    font-weight: 600;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(500px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(500px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(notification);

  // Remove after 2 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

/**
 * Initialize cart functionality on page load
 */
document.addEventListener('DOMContentLoaded', function() {
  updateCartCount();
});