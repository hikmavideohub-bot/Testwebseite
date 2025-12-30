 console.log("APP VERSION: 20251230-3");
/* =========================
   ENHANCED TEXT & DISPLAY FUNCTIONS
========================= */

// Verbesserte Preisformatierung
function formatPrice(price) {
  const num = parseFloat(price) || 0;
  const formatted = num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return formatted;
}

// Währungszeichen mit Fallback
function getCurrencyDisplay() {
  const currencyMap = {
    "€": "€",
    "$": "$",
    "£": "£",
    "د.إ": "د.إ",
    "ر.س": "ر.س",
    "د.م.": "د.م.",
    "ج.م.": "ج.م.",
    "د.ل.": "د.ل.",
    "د.ت.": "د.ت."
  };
  return currencyMap[CURRENCY] || CURRENCY;
}

// Formatierte Datumsanzeige für Angebote
function formatOfferTime(endDate) {
  if (!endDate) return null;
  
  const end = new Date(endDate);
  const now = new Date();
  const diff = end - now;
  
  if (diff <= 0) {
    return { text: "انتهى العرض", expired: true };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 7) {
    return { text: `ينتهي في ${end.toLocaleDateString('ar-SA')}`, remaining: days };
  } else if (days > 0) {
    return { text: `${days} يوم${days > 1 ? 'اً' : ''} متبقية`, remaining: days };
  } else if (hours > 0) {
    return { text: `${hours} ساعة${hours > 1 ? 'ً' : ''} متبقية`, remaining: hours };
  } else {
    return { text: "ينتهي قريباً", remaining: 0 };
  }
}

// Rabattberechnung in lesbarer Form
function getDiscountText(original, final) {
  const discount = ((original - final) / original * 100).toFixed(0);
  return {
    percent: `${discount}%`,
    saved: `وفر ${formatPrice(original - final)} ${getCurrencyDisplay()}`,
    percentage: parseInt(discount)
  };
}

/* =========================
   ENHANCED PRODUCT CARD RENDER
========================= */

function renderProductCardEnhanced(p, options = {}) {
  const {
    isInactive = false,
    isOffer = false,
    showCategory = false,
    showTimer = false,
    compact = false
  } = options;
  
  const pricing = calculatePrice(p);
  const active = isProductActive(p) && !isInactive;
  const currency = getCurrencyDisplay();
  
  // Produktstatus bestimmen
  const status = !active ? 'inactive' : 
                pricing.hasDiscount ? 'discount' :
                pricing.hasBundle ? 'bundle' : 'normal';
  
  // Preis-Display mit verbesserter Darstellung
  let priceDisplay = '';
  if (pricing.hasDiscount) {
    const discountInfo = getDiscountText(pricing.originalPrice, pricing.finalPrice);
    priceDisplay = `
      <div class="price-display enhanced ${compact ? 'compact' : ''}">
        <div class="price-original">
          <span class="label">السعر الأصلي</span>
          <div class="amount">
            <span class="value">${formatPrice(pricing.originalPrice)}</span>
            <span class="currency">${currency}</span>
          </div>
        </div>
        <div class="price-final discount">
          <span class="label">السعر بعد الخصم</span>
          <div class="amount">
            <span class="value">${formatPrice(pricing.finalPrice)}</span>
            <span class="currency">${currency}</span>
          </div>
          <div class="discount-info">
            <span class="percent">خصم ${discountInfo.percent}</span>
            <span class="saved">${discountInfo.saved}</span>
          </div>
        </div>
      </div>
    `;
  } else if (pricing.hasBundle) {
    const unitPrice = pricing.bundleInfo.unitPrice;
    const savings = pricing.originalPrice - unitPrice;
    
    priceDisplay = `
      <div class="price-display enhanced ${compact ? 'compact' : ''}">
        <div class="price-original">
          <span class="label">السعر العادي</span>
          <div class="amount">
            <span class="value">${formatPrice(pricing.originalPrice)}</span>
            <span class="currency">${currency}</span>
          </div>
        </div>
        <div class="price-final bundle">
          <span class="label">سعر الحزمة</span>
          <div class="amount">
            <span class="value">${formatPrice(unitPrice)}</span>
            <span class="currency">${currency}</span>
            <span class="per-unit">/للقطعة</span>
          </div>
          <div class="bundle-info">
            <i class="fas fa-boxes"></i>
            <span>${pricing.bundleText}</span>
          </div>
          ${savings > 0 ? `
            <div class="savings">
              <i class="fas fa-coins"></i>
              <span>توفير ${formatPrice(savings)} ${currency} للقطعة</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  } else {
    priceDisplay = `
      <div class="price-display enhanced ${compact ? 'compact' : ''}">
        <div class="price-final normal">
          <span class="label">السعر</span>
          <div class="amount">
            <span class="value">${formatPrice(pricing.finalPrice)}</span>
            <span class="currency">${currency}</span>
          </div>
        </div>
      </div>
    `;
  }
  
  // Produkt-Badges
  const badges = [];
  
  if (pricing.hasDiscount) {
    const discountInfo = getDiscountText(pricing.originalPrice, pricing.finalPrice);
    badges.push(`
      <div class="badge discount-badge">
        <i class="fas fa-tag"></i>
        <span class="badge-text">خصم ${discountInfo.percent}</span>
        <div class="badge-tooltip">توفير ${formatPrice(pricing.originalPrice - pricing.finalPrice)} ${currency}</div>
      </div>
    `);
  }
  
  if (pricing.hasBundle) {
    badges.push(`
      <div class="badge bundle-badge">
        <i class="fas fa-gift"></i>
        <span class="badge-text">عرض حزمة</span>
        <div class="badge-tooltip">${pricing.bundleText}</div>
      </div>
    `);
  }
  
  if (isOffer) {
    badges.push(`
      <div class="badge offer-badge">
        <i class="fas fa-bolt"></i>
        <span class="badge-text">عرض خاص</span>
      </div>
    `);
  }
  
  if (p.category && showCategory) {
    badges.push(`
      <div class="badge category-badge">
        <i class="fas fa-tag"></i>
        <span class="badge-text">${escapeHtml(p.category)}</span>
      </div>
    `);
  }
  
  // Angebots-Timer falls vorhanden
  let timerHTML = '';
  if (showTimer && p.offer_end_date) {
    const timeInfo = formatOfferTime(p.offer_end_date);
    if (timeInfo) {
      timerHTML = `
        <div class="offer-timer ${timeInfo.expired ? 'expired' : ''}">
          <div class="timer-icon">
            <i class="fas fa-clock"></i>
          </div>
          <div class="timer-text">
            <span class="label">${timeInfo.text}</span>
            ${timeInfo.remaining > 0 ? `
              <div class="progress-bar">
                <div class="progress" style="width: ${Math.min(100, timeInfo.remaining * 10)}%"></div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
  }
  
  // Aktions-Button
  const btnClass = active ? 'add-btn enhanced' : 'add-btn enhanced disabled';
  const btnIcon = active ? 'fas fa-cart-plus' : 'fas fa-ban';
  const btnText = active ? (compact ? 'أضف' : 'أضف إلى السلة') : 'غير متوفر';
  const btnAction = active ? `onclick="addToCartWithAnimation('${escapeAttr(p.id)}', this)"` : '';
  const btnTooltip = active ? 'data-tooltip="إضف إلى سلة التسوق"' : 'data-tooltip="المنتج غير متوفر حالياً"';
  
  // Produktbild mit verbesserter Ladeanzeige
  const imageHTML = productImageHTML(p);
  
  // Größenangabe falls vorhanden
  const sizeHTML = p.sizevalue && p.sizeunit ? `
    <div class="product-size enhanced">
      <div class="size-icon">
        <i class="fas fa-weight-hanging"></i>
      </div>
      <div class="size-info">
        <span class="label">الحجم:</span>
        <span class="value">${escapeHtml(p.sizevalue)} ${escapeHtml(p.sizeunit)}</span>
      </div>
    </div>
  ` : '';
  
  // Beschreibung mit Read More
  const desc = p.description || '';
  const shortDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
  const hasMore = desc.length > 100;
  
  const descHTML = `
    <div class="product-desc enhanced">
      <p class="desc-text">${escapeHtml(shortDesc)}</p>
      ${hasMore ? `
        <button class="read-more-btn" onclick="toggleProductDescription(this)">
          <span class="more">قراءة المزيد</span>
          <span class="less" style="display:none">قراءة أقل</span>
          <i class="fas fa-chevron-down"></i>
        </button>
        <div class="full-desc" style="display:none">${escapeHtml(desc)}</div>
      ` : ''}
    </div>
  `;
  
  return `
    <div class="product-card enhanced status-${status}" data-product-id="${p.id}">
      <div class="card-header">
        <div class="product-badges enhanced">
          ${badges.join('')}
        </div>
        ${timerHTML}
      </div>
      
      <div class="product-image-container enhanced">
        ${imageHTML}
        <div class="image-overlay">
          <button class="quick-view-btn" onclick="quickView('${escapeAttr(p.id)}')">
            <i class="fas fa-eye"></i>
            <span>عرض سريع</span>
          </button>
        </div>
      </div>
      
      <div class="product-info enhanced">
        <div class="product-title enhanced">
          <h3>${escapeHtml(p.name || '')}</h3>
          <div class="product-rating">
            <i class="fas fa-star"></i>
            <i class="fas fa-star"></i>
            <i class="fas fa-star"></i>
            <i class="fas fa-star"></i>
            <i class="fas fa-star-half-alt"></i>
          </div>
        </div>
        
        ${sizeHTML}
        ${descHTML}
        
        <div class="product-footer enhanced">
          ${priceDisplay}
          
          <button class="${btnClass}" ${btnAction} ${btnTooltip}>
            <span class="btn-icon">
              <i class="${btnIcon}"></i>
            </span>
            <span class="btn-text">${btnText}</span>
            ${active ? '<span class="btn-pulse"></span>' : ''}
          </button>
        </div>
        
        ${pricing.hasBundle && pricing.bundleInfo ? `
          <div class="bundle-details">
            <div class="bundle-header">
              <i class="fas fa-crown"></i>
              <span>تفاصيل العرض:</span>
            </div>
            <div class="bundle-items">
              <div class="bundle-item">
                <span class="label">الكمية:</span>
                <span class="value">${pricing.bundleInfo.qty} قطعة</span>
              </div>
              <div class="bundle-item">
                <span class="label">السعر الإجمالي:</span>
                <span class="value">${formatPrice(pricing.bundleInfo.bundlePrice)} ${currency}</span>
              </div>
              <div class="bundle-item highlight">
                <span class="label">السعر للقطعة:</span>
                <span class="value">${formatPrice(pricing.bundleInfo.unitPrice)} ${currency}</span>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/* =========================
   ENHANCED OFFERS PAGE
========================= */

function renderOffersEnhanced() {
  const offersGrid = $("offers-grid");
  const noOffers = $("no-offers");
  if (!offersGrid || !noOffers) return;

  const products = Array.isArray(productsData) ? productsData : [];
  const offerProducts = products.filter((p) => 
    isProductActive(p) && hasOffer(p) && isOfferActive(p)
  );

  if (offerProducts.length === 0) {
    offersGrid.innerHTML = '';
    noOffers.innerHTML = `
      <div class="empty-offers-state">
        <div class="empty-offers-icon">
          <i class="fas fa-gift"></i>
        </div>
        <div class="empty-offers-content">
          <h3>🎁 لا توجد عروض حالياً</h3>
          <p>لم نجد عروضاً نشطة في الوقت الحالي. تابعنا لمعرفة أحدث العروض!</p>
          <div class="empty-offers-actions">
            <button class="btn-primary" onclick="navigateToPage('home')">
              <i class="fas fa-store"></i>
              تصفح جميع المنتجات
            </button>
            <button class="btn-secondary" onclick="subscribeToOffers()">
              <i class="fas fa-bell"></i>
              إشعارني بالعروض
            </button>
          </div>
        </div>
      </div>
    `;
    noOffers.style.display = "block";
    return;
  }

  noOffers.style.display = "none";

  // Gruppiere Angebote nach Typ
  const discountOffers = offerProducts.filter(p => 
    hasOffer(p) && (p.offer_type === "percent" || p.offer_type === "percentage")
  );
  
  const bundleOffers = offerProducts.filter(p => 
    hasOffer(p) && p.offer_type === "bundle"
  );
  
  const flashOffers = offerProducts.filter(p => 
    p.offer_end_date && (new Date(p.offer_end_date) - new Date()) < 24 * 60 * 60 * 1000
  );

  let html = '';
  
  // Banner mit Countdown für Flash Sales
  if (flashOffers.length > 0) {
    const soonestEnd = flashOffers
      .map(p => new Date(p.offer_end_date).getTime())
      .sort((a, b) => a - b)[0];
    
    html += `
      <div class="flash-sale-banner">
        <div class="flash-sale-content">
          <div class="flash-icon">
            <i class="fas fa-bolt"></i>
          </div>
          <div class="flash-text">
            <h2>⚡ عروض فلاش سريعة!</h2>
            <p>عروض محدودة تنتهي قريباً</p>
          </div>
          <div class="flash-timer" id="flash-timer">
            <div class="time-unit">
              <span class="value" id="flash-hours">00</span>
              <span class="label">ساعات</span>
            </div>
            <div class="time-unit">
              <span class="value" id="flash-minutes">00</span>
              <span class="label">دقائق</span>
            </div>
            <div class="time-unit">
              <span class="value" id="flash-seconds">00</span>
              <span class="label">ثواني</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    startFlashTimer(soonestEnd);
  }

  // Rabatt-Angebote
  if (discountOffers.length > 0) {
    const maxDiscount = Math.max(...discountOffers.map(p => {
      const pricing = calculatePrice(p);
      return pricing.discountPercent || 0;
    }));
    
    html += `
      <div class="offers-section">
        <div class="section-header enhanced">
          <div class="section-icon">
            <i class="fas fa-percentage"></i>
          </div>
          <div class="section-content">
            <h2>خصومات مميزة</h2>
            <p>توفير يصل إلى <span class="highlight">${maxDiscount}%</span> على منتجات مختارة</p>
          </div>
          <div class="section-badge">
            <span>${discountOffers.length} منتج</span>
          </div>
        </div>
        <div class="offers-grid discount-offers">
          ${discountOffers.slice(0, 8).map(p => renderProductCardEnhanced(p, {
            isOffer: true,
            showTimer: true,
            showCategory: true
          })).join('')}
        </div>
        ${discountOffers.length > 8 ? `
          <div class="show-more-container">
            <button class="show-more-btn" onclick="showAllOffers('discount')">
              <i class="fas fa-chevron-down"></i>
              <span>عرض ${discountOffers.length - 8} منتج إضافي</span>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  // Bundle-Angebote
  if (bundleOffers.length > 0) {
    html += `
      <div class="offers-section">
        <div class="section-header enhanced">
          <div class="section-icon">
            <i class="fas fa-boxes"></i>
          </div>
          <div class="section-content">
            <h2>عروض حزم</h2>
            <p>اشترِ أكثر وادفع أقل مع عروضنا المميزة</p>
          </div>
          <div class="section-badge">
            <span>${bundleOffers.length} عرض</span>
          </div>
        </div>
        <div class="offers-grid bundle-offers">
          ${bundleOffers.slice(0, 6).map(p => renderProductCardEnhanced(p, {
            isOffer: true,
            showTimer: true,
            showCategory: true
          })).join('')}
        </div>
        ${bundleOffers.length > 6 ? `
          <div class="show-more-container">
            <button class="show-more-btn" onclick="showAllOffers('bundle')">
              <i class="fas fa-chevron-down"></i>
              <span>عرض ${bundleOffers.length - 6} عرض إضافي</span>
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  offersGrid.innerHTML = html;
}

function startFlashTimer(endTimestamp) {
  const timer = setInterval(() => {
    const now = Date.now();
    const diff = endTimestamp - now;
    
    if (diff <= 0) {
      clearInterval(timer);
      // Refresh offers page
      renderOffersEnhanced();
      return;
    }
    
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    const hoursEl = $("flash-hours");
    const minutesEl = $("flash-minutes");
    const secondsEl = $("flash-seconds");
    
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
    if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
  }, 1000);
}

/* =========================
   ENHANCED ANIMATIONS & INTERACTIONS
========================= */

function addToCartWithAnimation(productId, btnEl) {
  const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  
  if (productCard) {
    // Goldener Glow Effekt
    productCard.classList.add('cart-pulse');
    
    // Floating Cart Animation
    const rect = productCard.getBoundingClientRect();
    const floatingItem = document.createElement('div');
    floatingItem.className = 'floating-item';
    floatingItem.innerHTML = '<i class="fas fa-shopping-cart"></i>';
    floatingItem.style.position = 'fixed';
    floatingItem.style.left = rect.left + rect.width / 2 + 'px';
    floatingItem.style.top = rect.top + rect.height / 2 + 'px';
    floatingItem.style.zIndex = '9999';
    document.body.appendChild(floatingItem);
    
    // Animation zum Warenkorb
    const cartBtn = $("cartOpen");
    const cartRect = cartBtn.getBoundingClientRect();
    
    floatingItem.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${cartRect.left - rect.left - rect.width/2}px, ${cartRect.top - rect.top - rect.height/2}px) scale(0.5)`, opacity: 0 }
    ], {
      duration: 800,
      easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
    }).onfinish = () => {
      floatingItem.remove();
    };
    
    // Button Animation
    const prevHtml = btnEl.innerHTML;
    btnEl.classList.add('adding');
    btnEl.innerHTML = '<i class="fas fa-check"></i> تمت الإضافة';
    btnEl.disabled = true;
    
    setTimeout(() => {
      productCard.classList.remove('cart-pulse');
      btnEl.classList.remove('adding');
      btnEl.innerHTML = prevHtml;
      btnEl.disabled = false;
    }, 1500);
  }
  
  // Originale Funktion aufrufen
  addToCart(productId, btnEl);
}

function toggleProductDescription(btn) {
  const card = btn.closest('.product-card');
  const descText = card.querySelector('.desc-text');
  const fullDesc = card.querySelector('.full-desc');
  const moreText = btn.querySelector('.more');
  const lessText = btn.querySelector('.less');
  const icon = btn.querySelector('i');
  
  if (fullDesc.style.display === 'none') {
    // Expand
    descText.style.display = 'none';
    fullDesc.style.display = 'block';
    moreText.style.display = 'none';
    lessText.style.display = 'inline';
    icon.className = 'fas fa-chevron-up';
    btn.classList.add('expanded');
  } else {
    // Collapse
    descText.style.display = 'block';
    fullDesc.style.display = 'none';
    moreText.style.display = 'inline';
    lessText.style.display = 'none';
    icon.className = 'fas fa-chevron-down';
    btn.classList.remove('expanded');
  }
}

function quickView(productId) {
  const product = productsData.find(p => String(p.id) === String(productId));
  if (!product) return;
  
  const pricing = calculatePrice(product);
  const currency = getCurrencyDisplay();
  
  let priceInfo = '';
  if (pricing.hasDiscount) {
    const discountInfo = getDiscountText(pricing.originalPrice, pricing.finalPrice);
    priceInfo = `
      <div class="quick-price">
        <div class="original-price">
          <span class="label">السعر الأصلي:</span>
          <span class="value">${formatPrice(pricing.originalPrice)} ${currency}</span>
        </div>
        <div class="current-price">
          <span class="label">السعر بعد الخصم:</span>
          <span class="value discount">${formatPrice(pricing.finalPrice)} ${currency}</span>
          <span class="discount-badge">${discountInfo.percent}</span>
        </div>
        <div class="savings">
          <i class="fas fa-coins"></i>
          <span>وفر ${discountInfo.saved}</span>
        </div>
      </div>
    `;
  } else if (pricing.hasBundle) {
    priceInfo = `
      <div class="quick-price">
        <div class="current-price">
          <span class="label">سعر الحزمة:</span>
          <span class="value bundle">${formatPrice(pricing.bundleInfo.unitPrice)} ${currency}</span>
          <span class="unit">/للقطعة</span>
        </div>
        <div class="bundle-details">
          <span>${pricing.bundleText}</span>
        </div>
      </div>
    `;
  } else {
    priceInfo = `
      <div class="quick-price">
        <div class="current-price">
          <span class="label">السعر:</span>
          <span class="value">${formatPrice(pricing.finalPrice)} ${currency}</span>
        </div>
      </div>
    `;
  }
  
  const modalHTML = `
    <div class="quick-view-modal active">
      <div class="quick-view-overlay" onclick="closeQuickView()"></div>
      <div class="quick-view-content">
        <button class="close-quick-view" onclick="closeQuickView()">
          <i class="fas fa-times"></i>
        </button>
        
        <div class="quick-view-grid">
          <div class="quick-view-image">
            ${productImageHTML(product, { priority: true })}
          </div>
          
          <div class="quick-view-info">
            <div class="quick-view-header">
              <h2>${escapeHtml(product.name || '')}</h2>
              ${product.category ? `
                <span class="product-category">
                  <i class="fas fa-tag"></i>
                  ${escapeHtml(product.category)}
                </span>
              ` : ''}
            </div>
            
            ${product.sizevalue && product.sizeunit ? `
              <div class="product-specs">
                <div class="spec-item">
                  <i class="fas fa-weight-hanging"></i>
                  <span>الحجم: ${escapeHtml(product.sizevalue)} ${escapeHtml(product.sizeunit)}</span>
                </div>
              </div>
            ` : ''}
            
            <div class="product-description">
              <h3>وصف المنتج</h3>
              <p>${escapeHtml(product.description || 'لا يوجد وصف')}</p>
            </div>
            
            <div class="quick-view-pricing">
              ${priceInfo}
            </div>
            
            <div class="quick-view-actions">
              <button class="btn-secondary" onclick="closeQuickView()">
                <i class="fas fa-times"></i>
                إغلاق
              </button>
              <button class="btn-primary" onclick="addToCartWithAnimation('${escapeAttr(product.id)}'); closeQuickView();">
                <i class="fas fa-cart-plus"></i>
                أضف إلى السلة
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const existingModal = document.querySelector('.quick-view-modal');
  if (existingModal) existingModal.remove();
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  document.body.style.overflow = 'hidden';
}

function closeQuickView() {
  const modal = document.querySelector('.quick-view-modal');
  if (modal) modal.remove();
  document.body.style.overflow = 'auto';
}

/* =========================
   UPDATE EXISTING FUNCTIONS WITH ENHANCED STYLES
========================= */

// Update renderAllProducts function
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

  const grid = $("products-grid");
  if (grid) {
    if (activeProducts.length === 0) {
      grid.innerHTML = `
        <div class="empty-state enhanced">
          <div class="empty-icon">
            <i class="fas fa-box-open"></i>
          </div>
          <h3>📦 لا توجد منتجات</h3>
          <p>${activeCategory === "الكل" ? 'لم يتم إضافة أي منتجات بعد.' : 'لا توجد منتجات في هذه الفئة حالياً.'}</p>
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
        renderProductCardEnhanced(p, {
          showCategory: true,
          compact: window.innerWidth <= 992
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
          renderProductCardEnhanced(p, { 
            isInactive: true,
            compact: window.innerWidth <= 992 
          })
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

// Update renderOfferProducts function
function renderOfferProducts() {
  renderOffersEnhanced();
}

// Update cart badge with animation
function bumpCartBadge() {
  const badge = $("cart-badge");
  if (!badge) return;
  
  badge.classList.remove('bump');
  void badge.offsetWidth; // Trigger reflow
  badge.classList.add('bump');
  
  // Add confetti effect for large orders
  const totalItems = cart.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  if (totalItems % 5 === 0 && totalItems > 0) {
    createConfetti();
  }
}

function createConfetti() {
  const colors = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0'];
  
  for (let i = 0; i < 30; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.position = 'fixed';
    confetti.style.width = '10px';
    confetti.style.height = '10px';
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.borderRadius = '50%';
    confetti.style.zIndex = '9999';
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.top = '-10px';
    confetti.style.opacity = '0.8';
    
    document.body.appendChild(confetti);
    
    confetti.animate([
      { transform: 'translateY(0) rotate(0deg)', opacity: 0.8 },
      { transform: `translateY(${window.innerHeight}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }
    ], {
      duration: 1000 + Math.random() * 1000,
      easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)'
    }).onfinish = () => {
      confetti.remove();
    };
  }
}

/* =========================
   NEW CSS STYLES TO ADD
========================= */

// Füge diese CSS-Regeln zu deinem styles.css hinzu:

/*
.enhanced {
  --gold: #FFD700;
  --gold-light: #FFF8DC;
  --silver: #C0C0C0;
  --bronze: #CD7F32;
}

/* Enhanced Product Cards */
.product-card.enhanced {
  border: 2px solid transparent;
  background: linear-gradient(white, white) padding-box,
              linear-gradient(135deg, var(--primary-light), rgba(255, 138, 31, 0.1)) border-box;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.product-card.enhanced:hover {
  border-color: var(--primary);
  transform: translateY(-5px) scale(1.01);
  box-shadow: 0 20px 40px rgba(31, 58, 95, 0.15);
}

.product-card.enhanced.status-discount {
  background: linear-gradient(white, white) padding-box,
              linear-gradient(135deg, #FF6B6B, #FFE66D) border-box;
}

.product-card.enhanced.status-bundle {
  background: linear-gradient(white, white) padding-box,
              linear-gradient(135deg, #4ECDC4, #44A08D) border-box;
}

/* Enhanced Badges */
.badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 12px;
  color: white;
  margin: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transition: all 0.3s ease;
  cursor: pointer;
}

.badge:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.15);
}

.badge-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.9);
  color: white;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.3s ease;
  z-index: 1000;
}

.badge:hover .badge-tooltip {
  opacity: 1;
  visibility: visible;
  bottom: calc(100% + 8px);
}

.discount-badge {
  background: linear-gradient(135deg, #FF6B6B, #FF8E53);
}

.bundle-badge {
  background: linear-gradient(135deg, #4ECDC4, #44A08D);
}

.offer-badge {
  background: linear-gradient(135deg, #FFD166, #FF9A3C);
  animation: pulse 2s infinite;
}

/* Enhanced Price Display */
.price-display.enhanced {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #E2E8F0;
}

.price-original .label,
.price-final .label {
  font-size: 12px;
  color: #64748B;
  margin-bottom: 4px;
}

.price-original .amount {
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: #94A3B8;
  text-decoration: line-through;
}

.price-final .amount {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 24px;
  font-weight: 900;
}

.price-final.discount .amount {
  color: #EF4444;
}

.price-final.bundle .amount {
  color: #10B981;
}

.discount-info {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
}

.discount-info .percent {
  background: #FEE2E2;
  color: #EF4444;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 700;
}

.discount-info .saved {
  color: #64748B;
}

/* Enhanced Buttons */
.add-btn.enhanced {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  border: none;
  padding: 16px 24px;
  border-radius: 12px;
  color: white;
  font-weight: 700;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.add-btn.enhanced:hover {
  background: linear-gradient(135deg, var(--primary-light), var(--primary));
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(31, 58, 95, 0.2);
}

.add-btn.enhanced:active {
  transform: translateY(0);
}

.add-btn.enhanced .btn-pulse {
  position: absolute;
  width: 100%;
  height: 100%;
  background: rgba(255,255,255,0.1);
  border-radius: 12px;
  animation: pulse-glow 2s infinite;
}

/* Cart Pulse Animation */
.cart-pulse {
  animation: cart-pulse 0.5s ease;
}

@keyframes cart-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7); }
  70% { box-shadow: 0 0 0 20px rgba(255, 215, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
}

@keyframes pulse-glow {
  0% { opacity: 0; transform: scale(1); }
  50% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.2); }
}

/* Floating Item Animation */
.floating-item {
  background: var(--primary);
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: 0 10px 20px rgba(0,0,0,0.2);
}

/* Quick View Modal */
.quick-view-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2001;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-view-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(4px);
}

.quick-view-content {
  position: relative;
  background: white;
  width: 90%;
  max-width: 1000px;
  max-height: 90vh;
  border-radius: 24px;
  overflow: hidden;
  animation: modal-slide-up 0.3s ease;
}

.quick-view-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  padding: 40px;
}

.close-quick-view {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(0,0,0,0.1);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: white;
  font-size: 20px;
  cursor: pointer;
  z-index: 10;
  transition: all 0.3s ease;
}

.close-quick-view:hover {
  background: rgba(0,0,0,0.2);
  transform: rotate(90deg);
}

/* Flash Sale Banner */
.flash-sale-banner {
  background: linear-gradient(135deg, #FF416C, #FF4B2B);
  color: white;
  padding: 24px;
  border-radius: 20px;
  margin-bottom: 30px;
  animation: flash-pulse 2s infinite;
}

.flash-sale-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.flash-timer {
  display: flex;
  gap: 20px;
}

.time-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255,255,255,0.2);
  padding: 12px;
  border-radius: 12px;
  min-width: 80px;
}

.time-unit .value {
  font-size: 32px;
  font-weight: 900;
}

.time-unit .label {
  font-size: 14px;
  opacity: 0.9;
}

@keyframes flash-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.9; }
}

@keyframes modal-slide-up {
  from {
    opacity: 0;
    transform: translateY(50px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Mobile Optimizations */
@media (max-width: 992px) {
  .quick-view-grid {
    grid-template-columns: 1fr;
    gap: 20px;
    padding: 20px;
  }
  
  .flash-sale-content {
    flex-direction: column;
    text-align: center;
  }
  
  .flash-timer {
    width: 100%;
    justify-content: center;
  }
  
  .price-display.enhanced {
    padding: 12px;
  }
  
  .price-final .amount {
    font-size: 20px;
  }
  
  .add-btn.enhanced {
    padding: 14px 20px;
    font-size: 14px;
  }
}
/* =========================
   DYNAMIC CSS INJECTION
========================= */

function injectEnhancedStyles() {
  const styleId = 'enhanced-styles';
  if (document.getElementById(styleId)) return;
  
  const css = `
    /* Enhanced Product Cards */
    .price-display.enhanced {
      background: #F8FAFC;
      border-radius: 12px;
      padding: 12px;
      margin: 10px 0;
      border: 1px solid #E2E8F0;
    }
    
    .product-badges.enhanced {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 10px;
    }
    
    .badge {
      padding: 6px 10px;
      border-radius: 15px;
      font-size: 12px;
      font-weight: 700;
      color: white;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    
    .discount-badge { background: linear-gradient(135deg, #FF6B6B, #FF8E53); }
    .bundle-badge { background: linear-gradient(135deg, #4ECDC4, #44A08D); }
    .offer-badge { background: linear-gradient(135deg, #FFD166, #FF9A3C); }
    
    /* Button Animation */
    .cart-pulse {
      animation: cart-pulse 0.5s ease;
    }
    
    @keyframes cart-pulse {
      0% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(255, 215, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
    }
    
    .add-btn.enhanced {
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    
    .add-btn.enhanced.adding {
      background: #10B981 !important;
    }
    
    /* Flash Sale Banner */
    .flash-sale-banner {
      background: linear-gradient(135deg, #FF416C, #FF4B2B);
      color: white;
      padding: 15px;
      border-radius: 12px;
      margin-bottom: 20px;
      text-align: center;
    }
    
    /* Quick View Modal */
    .quick-view-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .quick-view-content {
      background: white;
      border-radius: 15px;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
    }
    
    @media (max-width: 992px) {
      .price-display.enhanced {
        padding: 8px;
      }
      
      .badge {
        font-size: 10px;
        padding: 4px 8px;
      }
    }
  `;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
}

// Am Ende der bootstrap-Funktion hinzufügen
window.addEventListener("DOMContentLoaded", async () => {
  // ... existierender Code ...
  
  try {
    STORE_SLUG = await initStoreSlug();
    // ... restlicher Code ...
    
    // Neue Styles injecten
    injectEnhancedStyles();
    
  } catch (e) {
    console.error(e);
    // ... Fehlerbehandlung ...
  }
});
