 console.log("APP VERSION: 20251230-2");

/* =========================
   TEXT & UI ENHANCEMENTS
========================= */

function formatPrice(price) {
  const num = parseFloat(price) || 0;
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getCurrencySymbol() {
  return CURRENCY === "€" ? "€" : 
         CURRENCY === "$" ? "$" : 
         CURRENCY === "£" ? "£" : CURRENCY;
}

function renderTimeRemaining(endDate) {
  if (!endDate) return "";
  
  const end = new Date(endDate);
  const now = new Date();
  const diff = end - now;
  
  if (diff <= 0) return "انتهى العرض";
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days} يوم${days > 1 ? 'اً' : ''} متبقي`;
  } else if (hours > 0) {
    return `${hours} ساعة${hours > 1 ? 'ً' : ''} متبقية`;
  } else {
    return "ينتهي قريباً";
  }
}

/* =========================
   ENHANCED PRODUCT CARD
========================= */

function renderEnhancedProductCard(p, opts = {}) {
  const {
    isInactive = false,
    isOffer = false,
    priority = false,
    showCategory = false
  } = opts;
  
  const pricing = calculatePrice(p);
  const active = isProductActive(p) && !isInactive;
  const currency = getCurrencySymbol();
  
  // Determine badges
  const badges = [];
  
  if (pricing.hasDiscount) {
    badges.push({
      type: 'discount',
      text: `${pricing.discountPercent}% خصم`,
      icon: 'fas fa-percentage'
    });
  }
  
  if (pricing.hasBundle) {
    badges.push({
      type: 'bundle',
      text: pricing.bundleBadge || pricing.bundleText,
      icon: 'fas fa-boxes'
    });
  }
  
  if (isOffer) {
    badges.push({
      type: 'offer',
      text: 'عرض خاص',
      icon: 'fas fa-star'
    });
  }
  
  if (!active) {
    badges.push({
      type: 'inactive',
      text: 'غير متوفر',
      icon: 'fas fa-clock'
    });
  }
  
  // Product status
  const status = !active ? 'inactive' : 
                pricing.hasDiscount ? 'discount' :
                pricing.hasBundle ? 'bundle' : 'normal';
  
  // Price display
  let priceDisplay = '';
  if (pricing.hasDiscount) {
    priceDisplay = `
      <div class="price-display enhanced">
        <div class="price-original">
          <span class="currency">${currency}</span>
          <span class="amount">${formatPrice(pricing.originalPrice)}</span>
        </div>
        <div class="price-final discount">
          <span class="currency">${currency}</span>
          <span class="amount">${formatPrice(pricing.finalPrice)}</span>
          <span class="save-label">وفر ${pricing.discountPercent}%</span>
        </div>
      </div>
    `;
  } else if (pricing.hasBundle) {
    priceDisplay = `
      <div class="price-display enhanced">
        <div class="price-original">
          <span class="currency">${currency}</span>
          <span class="amount">${formatPrice(pricing.originalPrice)}</span>
          <span class="unit">/وحدة</span>
        </div>
        <div class="price-final bundle">
          <span class="currency">${currency}</span>
          <span class="amount">${formatPrice(pricing.bundleInfo.unitPrice)}</span>
          <span class="bundle-label">${pricing.bundleText}</span>
        </div>
      </div>
    `;
  } else {
    priceDisplay = `
      <div class="price-display enhanced">
        <div class="price-final normal">
          <span class="currency">${currency}</span>
          <span class="amount">${formatPrice(pricing.finalPrice)}</span>
        </div>
      </div>
    `;
  }
  
  // Offer timer if applicable
  let timerHTML = '';
  if (isOffer && p.offer_end_date) {
    timerHTML = `
      <div class="offer-timer">
        <i class="fas fa-clock"></i>
        <span>${renderTimeRemaining(p.offer_end_date)}</span>
      </div>
    `;
  }
  
  // Category badge
  let categoryHTML = '';
  if (showCategory && p.category) {
    categoryHTML = `
      <div class="product-category-badge">
        <i class="fas fa-tag"></i>
        ${escapeHtml(p.category)}
      </div>
    `;
  }
  
  // Action button
  const btnClass = active ? 'add-btn enhanced' : 'add-btn enhanced disabled';
  const btnIcon = active ? 'fas fa-cart-plus' : 'fas fa-ban';
  const btnText = active ? 'أضف للسلة' : 'غير متوفر';
  const btnAction = active ? `onclick="addToCart('${escapeAttr(p.id)}', this)"` : '';
  
  return `
    <div class="product-card enhanced status-${status}" data-product-id="${p.id}">
      <div class="product-image-container enhanced">
        ${productImageHTML(p, { priority })}
        <div class="product-badges enhanced">
          ${badges.map(badge => `
            <div class="badge badge-${badge.type}">
              <i class="${badge.icon}"></i>
              <span>${badge.text}</span>
            </div>
          `).join('')}
        </div>
        ${categoryHTML}
        ${timerHTML}
      </div>
      
      <div class="product-info enhanced">
        <div class="product-header">
          <h3 class="product-title enhanced">
            ${escapeHtml(p.name || '')}
            <span class="desc-toggle" onclick="toggleDescription(this)">
              <i class="fas fa-chevron-down"></i>
            </span>
          </h3>
          
          ${p.sizevalue && p.sizeunit ? `
            <div class="product-size enhanced">
              <i class="fas fa-weight-hanging"></i>
              <span>${escapeHtml(p.sizevalue)} ${escapeHtml(p.sizeunit)}</span>
            </div>
          ` : ''}
        </div>
        
        <p class="product-desc enhanced">${escapeHtml(p.description || '')}</p>
        
        <div class="product-footer">
          ${priceDisplay}
          
          <button class="${btnClass}" ${btnAction}>
            <i class="${btnIcon}"></i>
            <span>${btnText}</span>
          </button>
        </div>
        
        ${pricing.hasBundle && pricing.bundleText ? `
          <div class="bundle-info enhanced">
            <i class="fas fa-gift"></i>
            <span>${pricing.bundleText}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/* =========================
   ENHANCED OFFERS PAGE
========================= */

function renderEnhancedOffersPage() {
  const offersGrid = $("offers-grid");
  const noOffers = $("no-offers");
  if (!offersGrid || !noOffers) return;

  const list = Array.isArray(productsData) ? productsData : [];
  
  // Filter offers
  const offerProducts = list.filter((p) => 
    isProductActive(p) && hasOffer(p) && isOfferActive(p)
  );

  if (offerProducts.length === 0) {
    offersGrid.innerHTML = `
      <div class="empty-state enhanced">
        <div class="empty-icon">
          <i class="fas fa-gift"></i>
        </div>
        <h3>لا توجد عروض حالياً</h3>
        <p>لا توجد عروض خاصة متاحة الآن. تابعنا لمعرفة أحدث العروض!</p>
        <button class="btn-primary" onclick="navigateToPage('home')">
          <i class="fas fa-store"></i>
          تصفح المنتجات
        </button>
      </div>
    `;
    noOffers.style.display = "block";
    return;
  }

  noOffers.style.display = "none";

  // Group offers by type
  const discountOffers = offerProducts.filter(p => 
    hasOffer(p) && p.offer_type === "percent"
  );
  
  const bundleOffers = offerProducts.filter(p => 
    hasOffer(p) && p.offer_type === "bundle"
  );

  let html = '';
  
  // Discount Offers Section
  if (discountOffers.length > 0) {
    html += `
      <div class="offers-section">
        <div class="section-header">
          <div class="section-icon">
            <i class="fas fa-percentage"></i>
          </div>
          <h2>خصومات مميزة</h2>
          <p>توفير حتى ${Math.max(...discountOffers.map(p => {
            const pricing = calculatePrice(p);
            return pricing.discountPercent || 0;
          }))}%</p>
        </div>
        <div class="offers-grid discount-grid">
          ${discountOffers.slice(0, 6).map(p => renderEnhancedProductCard(p, {
            isOffer: true,
            showCategory: true
          })).join('')}
        </div>
      </div>
    `;
  }
  
  // Bundle Offers Section
  if (bundleOffers.length > 0) {
    html += `
      <div class="offers-section">
        <div class="section-header">
          <div class="section-icon">
            <i class="fas fa-boxes"></i>
          </div>
          <h2>عروض حزم</h2>
          <p>شراء أكثر ودفع أقل</p>
        </div>
        <div class="offers-grid bundle-grid">
          ${bundleOffers.slice(0, 6).map(p => renderEnhancedProductCard(p, {
            isOffer: true,
            showCategory: true
          })).join('')}
        </div>
      </div>
    `;
  }
  
  // Timer for all offers
  const soonestEndDate = offerProducts
    .map(p => p.offer_end_date)
    .filter(Boolean)
    .map(date => new Date(date).getTime())
    .sort((a, b) => a - b)[0];
  
  if (soonestEndDate) {
    html = `
      <div class="offers-timer-banner">
        <div class="timer-content">
          <i class="fas fa-bolt"></i>
          <div class="timer-text">
            <span class="label">العروض تنتهي خلال:</span>
            <div class="countdown" id="global-offer-timer">
              <div class="time-unit">
                <span id="offers-days">00</span>
                <small>أيام</small>
              </div>
              <div class="time-unit">
                <span id="offers-hours">00</span>
                <small>ساعات</small>
              </div>
              <div class="time-unit">
                <span id="offers-minutes">00</span>
                <small>دقائق</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    ` + html;
    
    // Start global timer
    startGlobalOfferTimer(soonestEndDate);
  }

  offersGrid.innerHTML = html;
}

function startGlobalOfferTimer(endTimestamp) {
  const timerId = setInterval(() => {
    const now = Date.now();
    const diff = endTimestamp - now;
    
    if (diff <= 0) {
      clearInterval(timerId);
      // Refresh offers
      renderEnhancedOffersPage();
      return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    const daysEl = $("offers-days");
    const hoursEl = $("offers-hours");
    const minutesEl = $("offers-minutes");
    
    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
  }, 60000); // Update every minute
}

/* =========================
   ENHANCED CATEGORIES
========================= */

function renderEnhancedCategories(products) {
  const nav = $("category-nav");
  if (!nav) return;

  const rawCats = (Array.isArray(products) ? products : [])
    .map((p) => (p.category || "").toString().trim())
    .filter(Boolean);

  const unique = Array.isArray(categoriesData) && categoriesData.length > 0 ? 
    categoriesData : [...new Set(rawCats)];

  if (unique.length === 0) {
    nav.style.display = "none";
    return;
  }

  nav.style.display = "flex";
  
  const categoryCounts = {};
  products.forEach(p => {
    const cat = (p.category || "").toString().trim();
    if (cat) {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  });

  const allCount = products.filter(p => isProductActive(p)).length;

  let html = `
    <button class="cat-btn enhanced ${activeCategory === "الكل" ? 'active' : ''}" 
            onclick="filterProducts('الكل')">
      <div class="cat-icon">
        <i class="fas fa-border-all"></i>
      </div>
      <div class="cat-content">
        <span class="cat-name">الكل</span>
        <span class="cat-count">${allCount} منتج</span>
      </div>
    </button>
  `;

  unique.forEach(cat => {
    const count = categoryCounts[cat] || 0;
    const icon = getCategoryIcon(cat);
    
    html += `
      <button class="cat-btn enhanced ${activeCategory === cat ? 'active' : ''}" 
              onclick="filterProducts('${escapeHtml(cat)}')">
        <div class="cat-icon">
          <i class="${icon}"></i>
        </div>
        <div class="cat-content">
          <span class="cat-name">${escapeHtml(cat)}</span>
          <span class="cat-count">${count} منتج</span>
        </div>
      </button>
    `;
  });

  nav.innerHTML = html;
}

function getCategoryIcon(categoryName) {
  const icons = {
    'كهربائيات': 'fas fa-plug',
    'أجهزة': 'fas fa-laptop',
    'ملابس': 'fas fa-tshirt',
    'أطعمة': 'fas fa-utensils',
    'مشروبات': 'fas fa-coffee',
    'منزلية': 'fas fa-home',
    'رياضية': 'fas fa-dumbbell',
    'جمال': 'fas fa-spa',
    'أطفال': 'fas fa-baby',
    'سيارات': 'fas fa-car'
  };
  
  return icons[categoryName] || 'fas fa-tag';
}

/* =========================
   ENHANCED CART ITEMS
========================= */

function renderEnhancedCartItems() {
  const container = $("cart-items");
  if (!container) return;

  const items = Array.isArray(cart) ? cart : [];

  if (items.length === 0) {
    container.innerHTML = `
      <div class="cart-empty enhanced">
        <div class="empty-cart-icon">
          <i class="fas fa-shopping-basket"></i>
        </div>
        <h3>سلة المشتريات فارغة</h3>
        <p>أضف بعض المنتجات لبدء التسوق</p>
        <button class="btn-primary" onclick="closeCart(); navigateToPage('home');">
          <i class="fas fa-store"></i>
          تصفح المنتجات
        </button>
      </div>
    `;
    return;
  }

  let subtotal = 0;
  let html = '';

  items.forEach((item, index) => {
    const qty = Number(item.qty) || 0;
    const itemTotal = calculateCartItemPrice(item);
    subtotal += itemTotal;

    let priceInfo = '';
    if (item.hasBundle && item.bundleInfo) {
      const bundleQty = Number(item.bundleInfo.qty) || 0;
      const bundles = bundleQty > 0 ? Math.floor(qty / bundleQty) : 0;
      
      priceInfo = `
        <div class="item-pricing">
          <div class="price-line">
            <span>السعر العادي:</span>
            <span>${formatPrice(item.originalPrice)} ${getCurrencySymbol()}</span>
          </div>
          <div class="price-line highlight">
            <span>سعر العرض:</span>
            <span>${formatPrice(item.bundleInfo.unitPrice)} ${getCurrencySymbol()}</span>
          </div>
          <div class="bundle-note">
            <i class="fas fa-gift"></i>
            ${item.bundleText}
          </div>
        </div>
      `;
    } else if (item.hasDiscount) {
      priceInfo = `
        <div class="item-pricing">
          <div class="price-line">
            <span>السعر الأصلي:</span>
            <span class="old-price">${formatPrice(item.originalPrice)} ${getCurrencySymbol()}</span>
          </div>
          <div class="price-line highlight">
            <span>بعد الخصم:</span>
            <span>${formatPrice(item.finalPrice)} ${getCurrencySymbol()}</span>
          </div>
        </div>
      `;
    } else {
      priceInfo = `
        <div class="item-pricing">
          <div class="price-line">
            <span>السعر:</span>
            <span>${formatPrice(item.originalPrice)} ${getCurrencySymbol()}</span>
          </div>
        </div>
      `;
    }

    html += `
      <div class="cart-item enhanced">
        <div class="item-index">
          <span>${index + 1}</span>
        </div>
        <div class="item-main">
          <div class="item-header">
            <h4 class="item-name">${escapeHtml(item.name || '')}</h4>
            <button class="remove-item-btn enhanced" onclick="removeFromCart('${escapeAttr(item.id)}')">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          ${item.sizeValue && item.sizeUnit ? `
            <div class="item-size">
              <i class="fas fa-ruler"></i>
              ${escapeHtml(item.sizeValue)} ${escapeHtml(item.sizeUnit)}
            </div>
          ` : ''}
          
          ${priceInfo}
          
          <div class="item-total">
            <span>المجموع:</span>
            <span class="total-amount">${formatPrice(itemTotal)} ${getCurrencySymbol()}</span>
          </div>
        </div>
        
        <div class="item-controls enhanced">
          <button class="qty-btn" onclick="changeQty('${escapeAttr(item.id)}', -1)">
            <i class="fas fa-minus"></i>
          </button>
          <div class="qty-display">
            <span class="qty-number">${qty}</span>
            <span class="qty-label">قطعة</span>
          </div>
          <button class="qty-btn" onclick="changeQty('${escapeAttr(item.id)}', 1)">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  
  // Update summary with enhanced styling
  const shippingEnabled = STORE_DATA.shipping === true ||
    (typeof STORE_DATA.shipping === "string" && STORE_DATA.shipping.toLowerCase() === "true") ||
    STORE_DATA.shipping === 1;

  const shippingPrice = shippingEnabled ? parseFloat(STORE_DATA.shipping_price) || 0 : 0;
  const total = subtotal + shippingPrice;
  const currency = getCurrencySymbol();

  const summaryHTML = `
    <div class="cart-summary enhanced">
      <div class="summary-line">
        <span>الإجمالي الفرعي:</span>
        <span class="amount">${formatPrice(subtotal)} ${currency}</span>
      </div>
      <div class="summary-line ${shippingPrice > 0 ? 'shipping' : 'free-shipping'}">
        <span>رسوم الشحن:</span>
        <span class="amount">
          ${shippingPrice > 0 ? `${formatPrice(shippingPrice)} ${currency}` : 'مجاني'}
          ${shippingPrice === 0 ? '<i class="fas fa-check-circle"></i>' : ''}
        </span>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-line total">
        <span>الإجمالي النهائي:</span>
        <span class="amount">${formatPrice(total)} ${currency}</span>
      </div>
      
      <div class="summary-actions">
        <button class="btn-secondary" onclick="closeCart()">
          <i class="fas fa-arrow-right"></i>
          متابعة التسوق
        </button>
        <button class="btn-primary checkout-btn" onclick="checkout()">
          <i class="fas fa-whatsapp"></i>
          إتمام الطلب عبر واتساب
        </button>
      </div>
      
      <div class="security-note">
        <i class="fas fa-shield-alt"></i>
        <span>طلبك آمن ومضمون. لن نشارك معلوماتك مع أي طرف ثالث.</span>
      </div>
    </div>
  `;

  const summaryEl = $("cart-summary");
  if (summaryEl) {
    summaryEl.innerHTML = summaryHTML;
    summaryEl.style.display = "block";
  }
}

/* =========================
   UPDATE EXISTING FUNCTIONS
========================= */

// Replace renderAllProducts with enhanced version
function renderAllProducts(products) {
  const filtered =
    activeCategory === "الكل"
      ? Array.isArray(products) ? products : []
      : (Array.isArray(products) ? products : []).filter(
          (p) => ((p.category || "").toString().trim() === activeCategory)
        );

  const activeProducts = [];
  const inactiveProducts = [];

  filtered.forEach((p) => (isProductActive(p) ? activeProducts : inactiveProducts).push(p));

  // Render active products
  const grid = $("products-grid");
  if (grid) {
    if (activeProducts.length === 0) {
      grid.innerHTML = `
        <div class="empty-state enhanced">
          <div class="empty-icon">
            <i class="fas fa-box-open"></i>
          </div>
          <h3>لا توجد منتجات</h3>
          <p>لا توجد منتجات ${activeCategory === "الكل" ? '' : 'في هذه الفئة'} متاحة حالياً</p>
          ${activeCategory !== "الكل" ? `
            <button class="btn-secondary" onclick="filterProducts('الكل')">
              <i class="fas fa-border-all"></i>
              عرض جميع المنتجات
            </button>
          ` : ''}
        </div>
      `;
    } else {
      grid.innerHTML = activeProducts.map((p, index) => 
        renderEnhancedProductCard(p, {
          priority: index < 4, // Prioritize first 4 images
          showCategory: true
        })
      ).join('');
    }
  }

  // Handle inactive products
  const inactiveSection = $("inactive-section");
  const inactiveToggle = $("inactive-toggle");
  
  if (inactiveSection && inactiveToggle) {
    if (inactiveProducts.length > 0) {
      inactiveToggle.innerHTML = `
        <div class="inactive-toggle enhanced">
          <i class="fas fa-eye-slash"></i>
          <span>عرض المنتجات غير المتاحة (${inactiveProducts.length})</span>
          <i class="fas fa-chevron-down"></i>
        </div>
      `;
      
      const inactiveGrid = $("inactive-grid");
      if (inactiveGrid) {
        inactiveGrid.innerHTML = inactiveProducts.map(p => 
          renderEnhancedProductCard(p, { isInactive: true })
        ).join('');
      }
      
      // Toggle functionality
      inactiveToggle.onclick = () => {
        inactiveSection.classList.toggle('expanded');
      };
      
      inactiveToggle.style.display = "block";
    } else {
      inactiveToggle.style.display = "none";
      inactiveSection.style.display = "none";
    }
  }
}

// Update renderOfferProducts to use enhanced version
function renderOfferProducts() {
  const offersGrid = $("offers-grid");
  const noOffers = $("no-offers");
  if (!offersGrid || !noOffers) return;

  renderEnhancedOffersPage();
}

// Update renderCategories to use enhanced version
function renderCategories(products) {
  renderEnhancedCategories(products);
}

// Update cart rendering
function renderCartItems() {
  renderEnhancedCartItems();
}

/* =========================
   ENHANCED EMPTY STATES
========================= */

function showEnhancedEmptyState(type, options = {}) {
  const states = {
    products: {
      icon: 'fas fa-box-open',
      title: 'لا توجد منتجات',
      message: 'لم يتم إضافة أي منتجات بعد. سيتم عرض المنتجات هنا قريباً.',
      action: null
    },
    search: {
      icon: 'fas fa-search',
      title: 'لا توجد نتائج',
      message: 'لم نعثر على أي منتجات تطابق بحثك.',
      action: {
        text: 'عرض جميع المنتجات',
        onClick: () => filterProducts('الكل')
      }
    },
    category: {
      icon: 'fas fa-folder-open',
      title: 'الفئة فارغة',
      message: 'لا توجد منتجات في هذه الفئة حالياً.',
      action: {
        text: 'عرض جميع الفئات',
        onClick: () => filterProducts('الكل')
      }
    },
    cart: {
      icon: 'fas fa-shopping-basket',
      title: 'سلة المشتريات فارغة',
      message: 'أضف بعض المنتجات لبدء التسوق.',
      action: {
        text: 'تصفح المنتجات',
        onClick: () => { closeCart(); navigateToPage('home'); }
      }
    }
  };

  const state = states[type] || states.products;
  
  return `
    <div class="empty-state enhanced">
      <div class="empty-icon">
        <i class="${state.icon}"></i>
      </div>
      <h3>${state.title}</h3>
      <p>${state.message}</p>
      ${state.action ? `
        <button class="btn-primary" onclick="${state.action.onClick.toString().replace(/"/g, '&quot;')}">
          <i class="fas fa-${type === 'cart' ? 'store' : 'border-all'}"></i>
          ${state.action.text}
        </button>
      ` : ''}
    </div>
  `;
}
