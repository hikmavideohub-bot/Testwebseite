/* =========================
   CONFIG
========================= */

const API_URL = 'https://script.google.com/macros/s/AKfycbxmTLI6-1V7tELp7uvkDnCAMDCp6M5ZPsl4lZFL6KmaBRH9Hc9dqQdsgRDs0deca4RV6w/exec';

// GitHub Pages: /data/<storeId>.json
const CDN_DATA_BASE = './data';

// Stale-Check (365 Tage)
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CDN_BUNDLE_MAX_AGE_MS = 365 * ONE_DAY_MS;

// Cache (LocalStorage)
const CACHE_PREFIX = 'store_cache_v2';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 Minuten (nur für API/Cache-Objekte)

/* =========================
   STORE_ID from URL
========================= */
const urlParams = new URLSearchParams(window.location.search);

// ✅ 1) slug aus ?slug=... (optional fallback)
let STORE_SLUG = urlParams.get('slug') || urlParams.get('storeSlug') || urlParams.get('store_slug') || '';

// ✅ 2) slug aus hash: #/s/<slug>
function getSlugFromHash_(){
  const h = (window.location.hash || '').trim();     // مثال: "#/s/amwnty-alhlwh"
  const m = h.match(/^#\/s\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

if (!STORE_SLUG) STORE_SLUG = getSlugFromHash_();


/* =========================
   GLOBAL STATE
========================= */
let currentPage = 'home';
let activeCategory = 'الكل';

let STORE_DATA = {};
let CURRENCY = '€';

let categoriesData = [];
let productsData = [];

let cart = [];

/* =========================
   HELPERS
========================= */

function $(id){ return document.getElementById(id); }

function escapeHtml(str){
  return (str ?? '').toString()
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function escapeAttr(str){
  // for attribute contexts
  return escapeHtml(str).replaceAll('`','&#096;');
}

function stableStringify(obj){
  // stable stringify for cache keys / debug if needed
  if (!obj || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  return `{${Object.keys(obj).sort().map(k => JSON.stringify(k)+':'+stableStringify(obj[k])).join(',')}}`;
}

function sanitizeImgUrl(url){
  const u = (url || '').toString().trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return '';
}

// Drive links -> direct view link
function normalizeImageUrl(rawUrl){
  const u = (rawUrl || '').toString().trim();
  if (!u) return '';
  if (!(u.startsWith('http://') || u.startsWith('https://'))) return '';

  const m1 = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1?.[1]) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;

  const m2 = u.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m2?.[1]) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;

  const mAny = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (mAny?.[1]) return `https://drive.google.com/uc?export=view&id=${mAny[1]}`;

  return u;
}

/* =========================
   CACHE
========================= */

function cacheKey(key){
  return `${CACHE_PREFIX}:${STORE_SLUG}:${key}`;
}

function cacheSet(key, value){
  try{
    const payload = { ts: Date.now(), value };
    localStorage.setItem(cacheKey(key), JSON.stringify(payload));
  }catch(e){}
}

function cacheGet(key){
  try{
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts) return null;
    if ((Date.now() - obj.ts) > CACHE_TTL_MS) return null;
    return obj.value ?? null;
  }catch(e){
    return null;
  }
}

/* =========================
   FETCH JSON (robust)
========================= */

async function fetchJson(url, opts = {}){
  const res = await fetch(url, {
    ...opts,
    headers: { 'Accept': 'application/json', ...(opts.headers || {}) }
  });

  if (!res.ok) return { ok:false, status:res.status, json:null };

  try{
    return { ok:true, status:res.status, json: await res.json() };
  }catch(e){
    return { ok:false, status:res.status, json:null };
  }
}

/* =========================
   CDN LOAD
========================= */

function getCdnBundleUrl(){
  // GitHub Pages same-origin
  return `${CDN_DATA_BASE}/${encodeURIComponent(STORE_ID)}.json`;
}

async function loadPublicBundleFromCDN(){
  try{
    const { ok, json } = await fetchJson(getCdnBundleUrl(), { cache: 'no-store' });
    if (!ok || !json) return null;

    // storeId mismatch check (optional)
    const sid = json?.meta?.storeId || json?.meta?.store_id;
    if (sid && sid !== STORE_ID) return null;

    // staleness check
    const gen = json?.meta?.generatedAt || json?.meta?.generated_at || json?.generatedAt || null;
    if (gen){
      const t = Date.parse(gen);
      if (!Number.isNaN(t) && (Date.now() - t) > CDN_BUNDLE_MAX_AGE_MS){
        return null;
      }
    }

    console.log('CDN bundle loaded ✅', json);
    return json;
  }catch(e){
    console.warn('CDN load failed ⚠️', e);
    return null;
  }
}

/* =========================
   API LOADERS (fallback)
========================= */

async function apiGet(type){
  const url = `${API_URL}?type=${encodeURIComponent(type)}&storeId=${encodeURIComponent(STORE_ID)}&_ts=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || `API ${type} failed`);
  return json;
}

async function loadWebsiteStatus(){
  try{
    const json = await apiGet('websiteStatus');
    const data = json.data || {}; // ✅ DEIN FORMAT

    const active = data.website_active ?? data.websiteActive;
    if (active === false){
      applyStoreInactiveUI();
      return false;
    }
    restoreStoreUIIfNeeded();
    return true;
  }catch(e){
    console.error('websiteStatus failed', e);
    applyStoreInactiveUI();
    return false;
  }
}



async function loadStoreConfig(){
  const cached = cacheGet('storeConfig');
  if (cached && typeof cached === 'object'){
    STORE_DATA = cached.data ? cached.data : cached;
    applyStoreConfig();
    return;
  }

  const json = await apiGet('storeConfig');
  STORE_DATA = json.data || {};   // ✅ DEIN FORMAT
  cacheSet('storeConfig', STORE_DATA);
  applyStoreConfig();
}



async function loadCustomerMessage(){
  const cached = cacheGet('customerMessage');
  if (typeof cached === 'string'){
    applyCustomerMessage(cached);
    return;
  }

  const json = await apiGet('customerMessage');

  // ✅ DEIN FORMAT: message ist Top-Level
  const msg = (json.message || json.data?.message || '').toString().trim();

  cacheSet('customerMessage', msg);
  applyCustomerMessage(msg);
}



async function loadCategories(){
  const cached = cacheGet('categories');
  if (cached && Array.isArray(cached)){
    categoriesData = cached;
    return;
  }
  const json = await apiGet('categories');
  categoriesData = Array.isArray(json.categories) ? json.categories : [];
  cacheSet('categories', categoriesData);
}

async function fetchProducts(){
  const loadingEl = $('loading');
  const productsGrid = $('products-grid');

  const cached = cacheGet('products');
  if (cached && Array.isArray(cached)){
    productsData = cached;
    if (loadingEl) loadingEl.style.display = 'none';
    renderCategories(productsData);
    renderAllProducts(productsData);
    renderOfferProducts();
    return;
  }

  try{
    const json = await apiGet('products');
    productsData = Array.isArray(json.products) ? json.products : [];
    cacheSet('products', productsData);

    if (loadingEl) loadingEl.style.display = 'none';

    if (productsData.length > 0){
      renderCategories(productsData);
      renderAllProducts(productsData);
      renderOfferProducts();
    } else {
      if (productsGrid){
        productsGrid.innerHTML = `
          <div class="empty-state" style="text-align:center; padding:3rem; color:var(--muted); grid-column:1 / -1;">
            <i class="fas fa-box-open" style="font-size:3rem;color:rgba(122,135,151,.25)"></i>
            <h3 style="margin-top:1rem; font-weight:900;">لا توجد منتجات متاحة حالياً</h3>
            <p>سنقوم بإضافة منتجات جديدة قريباً</p>
          </div>`;
      }
    }
  }catch(e){
    console.error('خطأ في تحميل المنتجات:', e);
    if (loadingEl){
      loadingEl.style.display = 'block';
      loadingEl.innerHTML = `
        <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">
          حدث خطأ في تحميل المنتجات، يرجى المحاولة لاحقاً.
        </div>`;
    }
  }
}

/* =========================
   APPLY BUNDLE (CDN)
========================= */

function applyBundle(bundle){
  try{
    if (!bundle || typeof bundle !== 'object') return false;

    const activeFlag = bundle.websiteActive ?? bundle.website_active;
    if (activeFlag === false){
      applyStoreInactiveUI();
      return true;
    }
    restoreStoreUIIfNeeded();

    STORE_DATA = bundle.storeConfig || bundle.store_config || {};
    CURRENCY = (STORE_DATA.currency || bundle.currency || '€').toString().trim() || '€';

    applyStoreConfig();

    const msg = (bundle.customerMessage || bundle.customer_message || '').toString().trim();
    applyCustomerMessage(msg); // hide if empty

    categoriesData = Array.isArray(bundle.categories) ? bundle.categories : [];
    productsData   = Array.isArray(bundle.products) ? bundle.products : [];

    const loading = $('loading');
    if (loading) loading.style.display = 'none';

    renderCategories(productsData);
    renderAllProducts(productsData);
    renderOfferProducts();

    return true;
  }catch(e){
    console.error('applyBundle failed:', e);
    return false;
  }
}

/* =========================
   UI: Inactive / Restore
========================= */

function applyStoreInactiveUI(){
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => p.classList.remove('active'));

  const loading = $('loading');
  if (loading){
    loading.style.display = 'block';
    loading.innerHTML = `
      <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">
        هذا المتجر غير متاح حالياً.
      </div>`;
  }
}

function restoreStoreUIIfNeeded(){
  const loading = $('loading');
  if (loading && loading.style.display !== 'none'){
    // leave it – later hidden by render/apply
  }
}

/* =========================
   STORE CONFIG -> DOM (safe)
========================= */

function applyStoreConfig(){
  const setText = (id, val) => {
    const el = $(id);
    if (el) el.textContent = (val ?? '').toString();
  };

  CURRENCY = (STORE_DATA.currency || '').toString().trim() || '€';

  const storeName = STORE_DATA.store_name || 'متجر';
  const storeDesc = STORE_DATA.page_description || 'متجر إلكتروني متكامل';

  setText('store-name', storeName);
  setText('footer-store-name', storeName);
  setText('footer-store-name-bottom', storeName);
  document.title = storeName;

  setText('footer-store-description', storeDesc);

  setText('store-phone', STORE_DATA.phone || 'غير متوفر');

  // About
  setText('about-phone', STORE_DATA.phone || 'غير متوفر');
  setText('about-whatsapp', STORE_DATA.whatsapp || STORE_DATA.phone || 'غير متوفر');
  setText('about-email', STORE_DATA.email || 'غير متوفر');
  setText('about-hours', STORE_DATA.working_hours || '24/7');
  setText('about-address', STORE_DATA.address || 'غير متوفر');
  setText('about-currency', CURRENCY);

  const shippingText = STORE_DATA.shipping === true
    ? (STORE_DATA.shipping_price ? `شحن بمبلغ ${Number(STORE_DATA.shipping_price).toFixed(2)} ${CURRENCY}` : 'شحن مجاني')
    : 'لا يتوفر شحن';

  setText('about-shipping', shippingText);

  // Contact
  setText('contact-phone-text', STORE_DATA.phone || 'غير متوفر');
  setText('contact-whatsapp-text', STORE_DATA.whatsapp || STORE_DATA.phone || 'غير متوفر');
  setText('contact-email-text', STORE_DATA.email || 'غير متوفر');
  setText('contact-address-text', STORE_DATA.address || 'غير متوفر');
  setText('working-hours-weekdays', STORE_DATA.working_hours || '24/7');
  setText('working-hours-delivery', shippingText);
  setText('contact-currency', CURRENCY);

  // Footer
  setText('footer-phone', STORE_DATA.phone || 'غير متوفر');
  setText('footer-whatsapp', STORE_DATA.whatsapp || STORE_DATA.phone || 'غير متوفر');
  setText('footer-email', STORE_DATA.email || 'غير متوفر');
  setText('footer-address', STORE_DATA.address || 'غير متوفر');
  setText('footer-hours', STORE_DATA.working_hours || '24/7');
  setText('footer-shipping', shippingText);
  setText('footer-currency', CURRENCY);

  try { setupSocialLinks(); } catch {}
  try { applyMapsFromAddress(STORE_DATA.address || ''); } catch {}
}

/* =========================
   Announcement
========================= */

function applyCustomerMessage(msg){
  const m = (msg || '').toString().trim();
  STORE_DATA.message = m;

  const bar = $('announcement-bar');
  const text = $('announcement-text');
  if (!bar || !text) return;

  if (m){
    bar.style.display = 'block';
    text.textContent = m;
  } else {
    bar.style.display = 'none';
    text.textContent = '';
  }
}

/* =========================
   Social Links (safe)
========================= */

function setupSocialLinks(){
  const socialLinksContainer = $('social-links');
  const footerSocialLinks = $('footer-social-links');
  if (!socialLinksContainer || !footerSocialLinks) return;

  const links = [];

  const add = (type, url, icon) => {
    const u = (url || '').toString().trim();
    if (!u) return;
    links.push({ type, url: u, icon });
  };

  add('facebook', STORE_DATA.facebook, 'fab fa-facebook-f');
  add('instagram', STORE_DATA.instagram, 'fab fa-instagram');
  add('tiktok', STORE_DATA.tiktok, 'fab fa-tiktok');

  const makeHTML = () =>
    links.map(l => `<a href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer"><i class="${l.icon}"></i></a>`).join('');

  socialLinksContainer.innerHTML = makeHTML();
  footerSocialLinks.innerHTML = makeHTML();
}

/* =========================
   Maps (optional, safe)
========================= */

function applyMapsFromAddress(address){
  const a = (address || '').toString().trim();

  const aboutWrap = document.getElementById('about-map-wrap');
  const aboutMap  = document.getElementById('about-map');
  const aboutHint = document.getElementById('about-map-hint');

  const contactWrap = document.getElementById('contact-map-wrap');
  const contactMap  = document.getElementById('contact-map');
  const contactHint = document.getElementById('contact-map-hint');

  // wenn nichts da: alles aus
  if (!a){
    if (aboutWrap) aboutWrap.style.display = 'none';
    if (contactWrap) contactWrap.style.display = 'none';
    if (aboutHint) aboutHint.textContent = '';
    if (contactHint) contactHint.textContent = '';
    return;
  }

  const q = encodeURIComponent(a);
  const src = `https://www.google.com/maps?q=${q}&output=embed`;

  if (aboutWrap && aboutMap){
    aboutWrap.style.display = 'block';
    aboutMap.src = src;
    if (aboutHint) aboutHint.textContent = '';
  }

  if (contactWrap && contactMap){
    contactWrap.style.display = 'block';
    contactMap.src = src;
    if (contactHint) contactHint.textContent = '';
  }
}


/* =========================
   NAVIGATION (single system)
========================= */

function initNavigation(){
  // Header links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function(e){
      e.preventDefault();
      const page = this.getAttribute('data-page');
      if (page) navigateToPage(page);
    });
  });

  // Footer links
  document.querySelectorAll('footer a[data-page]').forEach(link => {
    link.addEventListener('click', function(e){
      e.preventDefault();
      const page = this.getAttribute('data-page');
      if (page) navigateToPage(page);
    });
  });

  // Mobile toggle
  const mobileToggle = $('mobileToggle');
  const navMenu = $('navMenu');

  if (mobileToggle && navMenu){
    mobileToggle.addEventListener('click', function(e){
      e.stopPropagation();
      navMenu.classList.toggle('active');
      this.innerHTML = navMenu.classList.contains('active')
        ? '<i class="fas fa-times"></i>'
        : '<i class="fas fa-bars"></i>';
    });

    // Close menu after clicking a nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!navMenu.classList.contains('active')) return;
      if (navMenu.contains(e.target)) return;
      if (mobileToggle.contains(e.target)) return;
      navMenu.classList.remove('active');
      mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
    });
  }
}

function navigateToPage(page){
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-page') === page);
  });

  currentPage = page;
  showPage(page);

  if (page === 'offers') renderOfferProducts();
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = $(`${page}-page`);
  if (el) el.classList.add('active');
  closeCart();
}

/* =========================
   CATEGORY SWIPE (safe)
========================= */

function initSwipeCategories(){
  const categoryNav = $('category-nav') || document.querySelector('.category-nav');
  if (!categoryNav) return;
  categoryNav.classList.add('category-nav');

  let isDragging = false;
  let startX = 0;
  let scrollLeft = 0;

  categoryNav.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.pageX - categoryNav.offsetLeft;
    scrollLeft = categoryNav.scrollLeft;
    categoryNav.style.cursor = 'grabbing';
    categoryNav.style.userSelect = 'none';
  });

  categoryNav.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - categoryNav.offsetLeft;
    const walk = (x - startX) * 1.5;
    categoryNav.scrollLeft = scrollLeft - walk;
  });

  ['mouseup', 'mouseleave'].forEach(evt => {
    categoryNav.addEventListener(evt, () => {
      isDragging = false;
      categoryNav.style.cursor = 'grab';
      categoryNav.style.userSelect = 'auto';
    });
  });

  categoryNav.addEventListener('touchstart', (e) => {
    startX = e.touches[0].pageX;
    scrollLeft = categoryNav.scrollLeft;
  }, { passive: true });

  categoryNav.addEventListener('touchmove', (e) => {
    const x = e.touches[0].pageX;
    const walk = (x - startX) * 1.5;
    categoryNav.scrollLeft = scrollLeft - walk;
  }, { passive: true });
}

/* =========================
   UX Enhancements
========================= */

function initUXEnhancements(){
  initSwipeCategories();
  enhanceProductImages();
}

function enhanceProductImages(){
  document.querySelectorAll('.product-image').forEach(img => {
    img.addEventListener('click', () => {
      // optional: open image in new tab
      const src = img.getAttribute('src');
      if (src && (src.startsWith('http://') || src.startsWith('https://'))) window.open(src, '_blank', 'noopener');
    });
  });
}

/* =========================
   PRODUCTS: rules
========================= */

function isProductActive(p){
  const v = p?.product_active;
  if (v === false) return false;
  if (typeof v === 'string') return v.toLowerCase() !== 'false' && v !== '0';
  return true;
}

function hasOffer(p){
  const v = p?.has_offer;
  if (v === true) return true;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return false;
}

function isOfferActive(p){
  const v = p?.offer_aktive ?? p?.offer_active ?? true;
  if (v === false) return false;
  if (typeof v === 'string') return v !== '0' && v.toLowerCase() !== 'false';

  // optional date window
  const start = p?.offer_start_date ? Date.parse(p.offer_start_date) : NaN;
  const end   = p?.offer_end_date ? Date.parse(p.offer_end_date) : NaN;
  const now = Date.now();

  if (!Number.isNaN(start) && now < start) return false;
  if (!Number.isNaN(end) && now > end) return false;

  return true;
}

function calculatePrice(p){
  const price = Number(p?.price || 0);
  const hasDiscount = hasOffer(p) && (p.offer_type === 'percent' || p.offer_type === 'percentage') && Number(p.percent) > 0;
  const hasBundle = hasOffer(p) && (p.offer_type === 'bundle') && Number(p.bundle_qty) > 0 && Number(p.bundle_price) > 0;

  if (hasDiscount){
    const percent = Math.max(0, Math.min(100, Number(p.percent)));
    const finalPrice = price * (1 - percent / 100);
    return {
      originalPrice: price,
      finalPrice,
      hasDiscount: true,
      discountPercent: percent,
      hasBundle: false,
      bundleInfo: null,
      bundleText: ''
    };
  }

  if (hasBundle){
    const qty = Number(p.bundle_qty);
    const bundlePrice = Number(p.bundle_price);
    const unitPrice = bundlePrice / qty;
    const text = `${qty} بـ ${bundlePrice.toFixed(2)} ${CURRENCY}`;
    return {
      originalPrice: price,
      finalPrice: unitPrice,
      hasDiscount: false,
      discountPercent: 0,
      hasBundle: true,
      bundleInfo: { qty, bundlePrice, unitPrice },
      bundleText: text
    };
  }

  return {
    originalPrice: price,
    finalPrice: price,
    hasDiscount: false,
    discountPercent: 0,
    hasBundle: false,
    bundleInfo: null,
    bundleText: ''
  };
}

/* =========================
   PRODUCT IMAGE
========================= */

function productImageHTML(p){
  const normalized = normalizeImageUrl(p?.image);
  const safeUrl = sanitizeImgUrl(normalized);

  if (!safeUrl){
    return `
      <div class="placeholder-image">
        <div class="ph">Beispielbild<br><small>صورة توضيحية</small></div>
      </div>`;
  }

  return `
    <img
      src="${escapeAttr(safeUrl)}"
      class="product-image"
      alt="${escapeHtml(p?.name || '')}"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      onerror="this.replaceWith(this.nextElementSibling)"
    />
    <div class="placeholder-image" style="display:none">
      <div class="ph">Beispielbild<br><small>صورة توضيحية</small></div>
    </div>`;
}

/* =========================
   RENDER: Categories & Products
========================= */

function renderCategories(products){
  const nav = $('category-nav');
  if (!nav) return;

  nav.classList.add('category-nav');

  const rawCats = (Array.isArray(products) ? products : [])
    .map(p => (p.category || '').toString().trim())
    .filter(Boolean);

  const unique = (Array.isArray(categoriesData) && categoriesData.length > 0)
    ? categoriesData
    : [...new Set(rawCats)];

  if (unique.length === 0){
    nav.style.display = 'none';
    return;
  }

  nav.style.display = 'flex';
  nav.innerHTML = '';

  const mkBtn = (label, icon, isActive, onClick) => {
    const b = document.createElement('button');
    b.className = `cat-btn ${isActive ? 'active' : ''}`;
    b.innerHTML = `<i class="${icon}"></i> ${escapeHtml(label)}`;
    b.addEventListener('click', onClick);
    return b;
  };

  nav.appendChild(mkBtn('الكل', 'fas fa-th-large', activeCategory === 'الكل', () => filterProducts('الكل')));

  unique.forEach(cat => {
    nav.appendChild(mkBtn(cat, 'fas fa-tag', activeCategory === cat, () => filterProducts(cat)));
  });
}

function filterProducts(category){
  activeCategory = category;

  // Update buttons
  const nav = $('category-nav');
  if (nav){
    nav.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
    // simple match by text content
    nav.querySelectorAll('.cat-btn').forEach(btn => {
      if (btn.textContent.trim().includes(category)) btn.classList.add('active');
      if (category === 'الكل' && btn.textContent.trim().includes('الكل')) btn.classList.add('active');
    });
  }

  renderAllProducts(productsData);
}

function renderAllProducts(products){
  const filtered = (activeCategory === 'الكل')
    ? (Array.isArray(products) ? products : [])
    : (Array.isArray(products) ? products : []).filter(p => ((p.category || '').toString().trim() === activeCategory));

  const activeProducts = [];
  const inactiveProducts = [];

  filtered.forEach(p => (isProductActive(p) ? activeProducts : inactiveProducts).push(p));

  renderGrid('products-grid', activeProducts, false);

  const inactiveSection = $('inactive-section');
  const inactiveToggle = $('inactive-toggle');

  if (!inactiveSection || !inactiveToggle) return;

  if (inactiveProducts.length > 0){
    inactiveToggle.style.display = 'block';
    renderGrid('inactive-grid', inactiveProducts, true);
  } else {
    inactiveToggle.style.display = 'none';
    inactiveSection.style.display = 'none';
  }
}

function renderGrid(containerId, products, isInactive){
  const grid = $(containerId);
  if (!grid) return;

  const list = Array.isArray(products) ? products : [];

  if (list.length === 0 && !isInactive){
    grid.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:3rem; color:var(--muted); grid-column:1 / -1;">
        <i class="fas fa-box-open" style="font-size:3rem;color:rgba(122,135,151,.25)"></i>
        <h3 style="margin-top:1rem; font-weight:900;">لا توجد منتجات</h3>
        <p>لا توجد منتجات نشطة في هذا القسم حالياً</p>
      </div>`;
    return;
  }

  if (list.length === 0 && isInactive){
    grid.innerHTML = '';
    return;
  }

  const isMobile = window.innerWidth <= 992;
  let html = '';

  for (const p of list){
    const pricing = calculatePrice(p);
    const active = isProductActive(p) && !isInactive;

    let priceHTML = '';
    let badgeHTML = '';

    if (pricing.hasDiscount){
      priceHTML = `
        <div class="price-wrapper">
          <span class="price-old">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
          <span class="price-new discount">${pricing.finalPrice.toFixed(2)} ${CURRENCY}</span>
        </div>`;
      badgeHTML = `<div class="discount-badge">${isMobile ? `${pricing.discountPercent}%` : `خصم ${pricing.discountPercent}%`}</div>`;
    } else if (pricing.hasBundle){
      priceHTML = `
        <div class="price-wrapper">
          <span class="price-old">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
          <span class="price-new bundle">${pricing.bundleInfo.unitPrice.toFixed(2)} ${CURRENCY}</span>
        </div>`;
      badgeHTML = `<div class="bundle-badge">${isMobile ? pricing.bundleText.replace(' بـ ', '/') : pricing.bundleText}</div>`;
    } else {
      priceHTML = `
        <div class="price-wrapper">
          <span class="price-new">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
        </div>`;
    }

    const cardClass = active ? 'product-card' : 'product-card inactive';
    const inactiveBadge = !active ? '<div class="inactive-badge">غير متوفر</div>' : '';

    const btnState = active ? '' : 'disabled';
    const btnText = active ? (isMobile ? 'أضف' : 'أضف للسلة') : (isMobile ? 'نفذ' : 'نفذت الكمية');
    const btnIcon = active ? 'fa-plus' : 'fa-times';
    const btnClick = active ? `onclick="addToCart('${escapeAttr(p.id)}', this)"` : '';

    const sizeValue = (p.sizevalue || '').toString().trim();
    const sizeUnit = (p.sizeunit || '').toString().trim();
    const sizeDisplay = (!isMobile && sizeValue && sizeUnit)
      ? `<div class="product-size"><i class="fas fa-weight-hanging"></i> الحجم: ${escapeHtml(sizeValue)} ${escapeHtml(sizeUnit)}</div>`
      : '';

    const bundleInfoHTML = (!isMobile && pricing.hasBundle)
      ? `<div class="bundle-info">عرض حزمة: ${pricing.bundleText}</div>`
      : '';

    const descToggleHTML = !isMobile
      ? `<span class="desc-toggle" onclick="toggleDescription(this, '${escapeAttr(p.id)}')"><i class="fas fa-chevron-down"></i></span>`
      : '';

    html += `
      <div class="${cardClass}">
        <div class="product-image-container">
          ${productImageHTML(p)}
          <div class="product-badges">
            ${badgeHTML}
            ${inactiveBadge}
          </div>
        </div>

        <div class="product-info">
          <h3 class="product-title" ${!isMobile ? `onclick="toggleDescription(this, '${escapeAttr(p.id)}')"` : ''}>
            ${escapeHtml(p.name || '')}
            ${descToggleHTML}
          </h3>
          ${sizeDisplay}
          <p class="product-desc">${escapeHtml(p.description || '')}</p>
          ${bundleInfoHTML}

          <div class="price-container">
            ${priceHTML}
            <button class="add-btn" ${btnClick} ${btnState}>
              <i class="fas ${btnIcon}"></i> ${btnText}
            </button>
          </div>
        </div>
      </div>`;
  }

  grid.innerHTML = html;
}

function toggleDescription(el, productId){
  // simple toggle for desktop
  const card = el?.closest?.('.product-card');
  if (!card) return;
  card.classList.toggle('desc-open');
}

/* =========================
   OFFERS RENDER
========================= */

function renderOfferProducts(){
  const offersGrid = $('offers-grid');
  const noOffers = $('no-offers');
  if (!offersGrid || !noOffers) return;

  const list = Array.isArray(productsData) ? productsData : [];
  if (list.length === 0){
    offersGrid.innerHTML = '';
    noOffers.style.display = 'block';
    return;
  }

  const offerProducts = list.filter(p => isProductActive(p) && hasOffer(p) && isOfferActive(p));
  if (offerProducts.length === 0){
    offersGrid.innerHTML = '';
    noOffers.style.display = 'block';
    return;
  }

  noOffers.style.display = 'none';

  const isMobile = window.innerWidth <= 992;
  let html = '';

  for (const p of offerProducts){
    const pricing = calculatePrice(p);

    let priceHTML = '';
    let badgeHTML = '';

    if (pricing.hasDiscount){
      priceHTML = `
        <div class="price-wrapper">
          <span class="price-old">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
          <span class="price-new discount">${pricing.finalPrice.toFixed(2)} ${CURRENCY}</span>
        </div>`;
      badgeHTML = `<div class="discount-badge">${isMobile ? `${pricing.discountPercent}%` : `خصم ${pricing.discountPercent}%`}</div>`;
    } else if (pricing.hasBundle){
      priceHTML = `
        <div class="price-wrapper">
          <span class="price-old">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
          <span class="price-new bundle">${pricing.bundleInfo.unitPrice.toFixed(2)} ${CURRENCY}</span>
        </div>`;
      badgeHTML = `<div class="bundle-badge">${isMobile ? pricing.bundleText.replace(' بـ ', '/') : pricing.bundleText}</div>`;
    } else {
      priceHTML = `<div class="price-wrapper"><span class="price-new">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span></div>`;
      badgeHTML = `<div class="discount-badge">عرض</div>`;
    }

    const sizeValue = (p.sizevalue || '').toString().trim();
    const sizeUnit = (p.sizeunit || '').toString().trim();
    const sizeDisplay = (!isMobile && sizeValue && sizeUnit)
      ? `<div class="product-size"><i class="fas fa-weight-hanging"></i> الحجم: ${escapeHtml(sizeValue)} ${escapeHtml(sizeUnit)}</div>`
      : '';

    const bundleInfoHTML = (!isMobile && pricing.hasBundle)
      ? `<div class="bundle-info">عرض حزمة: ${pricing.bundleText}</div>`
      : '';

    const descToggleHTML = !isMobile
      ? `<span class="desc-toggle" onclick="toggleDescription(this, '${escapeAttr(p.id)}')"><i class="fas fa-chevron-down"></i></span>`
      : '';

    html += `
      <div class="product-card">
        <div class="product-image-container">
          ${productImageHTML(p)}
          <div class="product-badges">${badgeHTML}</div>
        </div>

        <div class="product-info">
          <h3 class="product-title" ${!isMobile ? `onclick="toggleDescription(this, '${escapeAttr(p.id)}')"` : ''}>
            ${escapeHtml(p.name || '')}
            ${descToggleHTML}
          </h3>
          ${sizeDisplay}
          <p class="product-desc">${escapeHtml(p.description || '')}</p>
          ${bundleInfoHTML}

          <div class="price-container">
            ${priceHTML}
            <button class="add-btn" onclick="addToCart('${escapeAttr(p.id)}', this)">
              <i class="fas fa-plus"></i> ${isMobile ? 'أضف' : 'أضف للسلة'}
            </button>
          </div>
        </div>
      </div>`;
  }

  offersGrid.innerHTML = html;
}

/* =========================
   OFFER TIMER (simple)
========================= */

let offerTimerIntervalId = null;

function initOfferTimer(){
  if (offerTimerIntervalId) clearInterval(offerTimerIntervalId);

  // Dummy timer (you can replace with real end date)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

  function updateTimer(){
    const now = Date.now();
    const distance = endDate.getTime() - now;

    const t = document.querySelector('.timer');
    if (!t) return;

    if (distance < 0){
      t.innerHTML = '<div>انتهت العروض</div>';
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const d = $('days'); if (d) d.textContent = String(days).padStart(2,'0');
    const h = $('hours'); if (h) h.textContent = String(hours).padStart(2,'0');
    const m = $('minutes'); if (m) m.textContent = String(minutes).padStart(2,'0');
    const s = $('seconds'); if (s) s.textContent = String(seconds).padStart(2,'0');
  }

  updateTimer();
  offerTimerIntervalId = setInterval(updateTimer, 1000);
}

/* =========================
   CART
========================= */

function normalizePhoneForWhatsApp(input){
  const raw = (input || '').toString().trim();
  if (!raw) return '';

  // keep digits only, allow leading +
  let s = raw.replace(/[^\d+]/g, '');
  // if multiple +, keep first
  if (s.includes('+')) {
    s = '+' + s.replace(/\+/g, '');
  }

  // WhatsApp wa.me requires digits only (no +)
  s = s.replace(/\+/g, '');

  // remove leading 00 (international prefix)
  if (s.startsWith('00')) s = s.slice(2);

  // basic sanity
  if (s.length < 8) return '';
  return s;
}

function buildOrderMessage(){
  const items = Array.isArray(cart) ? cart : [];
  if (items.length === 0) return '';

  let subtotal = 0;

  const lines = items.map((it, idx) => {
    const qty = Number(it.qty) || 0;
    const itemTotal = calculateCartItemPrice(it);
    subtotal += itemTotal;

    const size = (it.sizeValue && it.sizeUnit) ? ` (${it.sizeValue} ${it.sizeUnit})` : '';
    return `${idx + 1}) ${it.name || ''}${size}\n   الكمية: ${qty}\n   المجموع: ${itemTotal.toFixed(2)} ${CURRENCY}`;
  });

  const shippingPrice = (STORE_DATA && STORE_DATA.shipping === true)
    ? (parseFloat(STORE_DATA.shipping_price) || 0)
    : 0;

  const total = subtotal + shippingPrice;

  const header = `طلب جديد من المتجر: ${(STORE_DATA && STORE_DATA.store_name) ? STORE_DATA.store_name : ''}`.trim();
  const shipText = (STORE_DATA && STORE_DATA.shipping === true)
    ? (shippingPrice > 0 ? `${shippingPrice.toFixed(2)} ${CURRENCY}` : 'مجاني')
    : 'غير متوفر';

  const footer =
`-------------------------
الإجمالي الفرعي: ${subtotal.toFixed(2)} ${CURRENCY}
الشحن: ${shipText}
الإجمالي: ${total.toFixed(2)} ${CURRENCY}

شكراً لكم 🌟`;

  return `${header}\n\n${lines.join('\n\n')}\n${footer}`;
}

function checkout(){
  const items = Array.isArray(cart) ? cart : [];
  if (items.length === 0){
    alert('سلة المشتريات فارغة');
    return;
  }

  const message = buildOrderMessage();
  if (!message){
    alert('تعذر إنشاء رسالة الطلب');
    return;
  }

  // Prefer WhatsApp, fallback to phone
  const waRaw = (STORE_DATA && (STORE_DATA.whatsapp || STORE_DATA.phone)) ? (STORE_DATA.whatsapp || STORE_DATA.phone) : '';
  const waNumber = normalizePhoneForWhatsApp(waRaw);

  if (!waNumber){
    alert('لا يوجد رقم واتساب/هاتف صحيح للمتجر');
    return;
  }

  const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function cartStorageKey(){
  return `cart:${STORE_ID}`;
}

function loadCart(){
  try{
    const raw = localStorage.getItem(cartStorageKey());
    cart = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(cart)) cart = [];
  }catch(e){
    cart = [];
  }
}

function saveCart(){
  try{ localStorage.setItem(cartStorageKey(), JSON.stringify(cart)); }catch(e){}
  updateCartCount();
  renderCartItems();
}

function updateCartCount(){
  const totalItems = Array.isArray(cart)
    ? cart.reduce((sum, i) => sum + (Number(i.qty) || 0), 0)
    : 0;

  const badge = $('cart-badge');
  if (badge) badge.textContent = totalItems;

  const empty = document.querySelector('.cart-empty');
  const summary = $('cart-summary');

  if (totalItems === 0){
    if (empty) empty.style.display = 'flex';
    if (summary) summary.style.display = 'none';
  } else {
    if (empty) empty.style.display = 'none';
    if (summary) summary.style.display = 'block';
  }
}

function openCart(){
  renderCartItems();
  const cm = $('cartModal');
  if (!cm) return;
  cm.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCart(){
  const cm = $('cartModal');
  if (!cm) return;
  cm.classList.remove('active');
  document.body.style.overflow = 'auto';
}

function initCartModalClose(){
  const cm = $('cartModal');
  if (!cm) return;

  cm.addEventListener('click', (e) => {
    if (e.target === cm) closeCart();
  });

  const closeBtn = $('cartClose');
  if (closeBtn) closeBtn.addEventListener('click', closeCart);

  const openBtn = $('cartOpen');
  if (openBtn) openBtn.addEventListener('click', openCart);
}

function addToCart(productId){
  const p = (Array.isArray(productsData) ? productsData : []).find(x => String(x.id) === String(productId));
  if (!p) return;

  const pricing = calculatePrice(p);

  const existing = cart.find(i => String(i.id) === String(productId));
  if (existing){
    existing.qty = (Number(existing.qty) || 0) + 1;
  } else {
    cart.push({
      id: p.id,
      name: p.name || '',
      qty: 1,

      sizeValue: p.sizevalue || '',
      sizeUnit: p.sizeunit || '',

      originalPrice: pricing.originalPrice,
      finalPrice: pricing.finalPrice,
      hasDiscount: pricing.hasDiscount,
      hasBundle: pricing.hasBundle,
      bundleInfo: pricing.bundleInfo,
      bundleText: pricing.bundleText
    });
  }

  saveCart();
  openCart();
}

function removeFromCart(productId){
  cart = cart.filter(i => String(i.id) !== String(productId));
  saveCart();
}

function changeQty(productId, delta){
  const item = cart.find(i => String(i.id) === String(productId));
  if (!item) return;
  item.qty = (Number(item.qty) || 0) + Number(delta || 0);
  if (item.qty <= 0) cart = cart.filter(i => String(i.id) !== String(productId));
  saveCart();
}

function calculateCartItemPrice(item){
  const qty = Number(item.qty) || 0;

  // bundle pricing
  if (item.hasBundle && item.bundleInfo){
    const bq = Number(item.bundleInfo.qty) || 0;
    const bp = Number(item.bundleInfo.bundlePrice) || 0;
    const unit = Number(item.bundleInfo.unitPrice) || 0;

    if (bq > 0){
      const bundles = Math.floor(qty / bq);
      const remainder = qty % bq;
      return (bundles * bp) + (remainder * Number(item.originalPrice || 0));
    }
    return qty * Number(item.originalPrice || 0);
  }

  // discount pricing
  if (item.hasDiscount){
    return qty * Number(item.finalPrice || 0);
  }

  return qty * Number(item.originalPrice || 0);
}

function renderCartItems(){
  const container = $('cart-items');
  if (!container) return;

  const summaryEl  = $('cart-summary');
  const subtotalEl = $('cart-subtotal');
  const shippingEl = $('cart-shipping');
  const totalEl    = $('cart-total');

  const items = Array.isArray(cart) ? cart : [];

  if (items.length === 0){
    container.innerHTML = `
      <div class="cart-empty">
        <i class="fas fa-shopping-basket"></i>
        <p>سلة المشتريات فارغة</p>
      </div>`;

    if (summaryEl) summaryEl.style.display = 'none';
    if (subtotalEl) subtotalEl.textContent = `0.00 ${CURRENCY}`;
    if (shippingEl) shippingEl.textContent = 'مجاني';
    if (totalEl) totalEl.textContent = `0.00 ${CURRENCY}`;
    return;
  }

  if (summaryEl) summaryEl.style.display = 'block';

  let subtotal = 0;
  let html = '';

  for (const item of items){
    const qty = Number(item.qty) || 0;
    const itemTotal = calculateCartItemPrice(item);
    subtotal += itemTotal;

    let priceDisplay = '';

    if (item.hasBundle && item.bundleInfo){
      const bundleQty = Number(item.bundleInfo.qty) || 0;
      const bundles = bundleQty > 0 ? Math.floor(qty / bundleQty) : 0;

      if (bundles > 0){
        priceDisplay = `
          <div class="item-price">
            <span class="old-price">${Number(item.originalPrice || 0).toFixed(2)} ${CURRENCY}</span>
            ${Number(item.bundleInfo.unitPrice || 0).toFixed(2)} ${CURRENCY}
            <div class="bundle-note">(${escapeHtml(item.bundleText || '')})</div>
          </div>`;
      } else {
        priceDisplay = `
          <div class="item-price">
            ${Number(item.originalPrice || 0).toFixed(2)} ${CURRENCY}
            <div class="bundle-note">(العرض يبدأ عند ${bundleQty || 0})</div>
          </div>`;
      }
    } else if (item.hasDiscount){
      priceDisplay = `
        <div class="item-price">
          <span class="old-price">${Number(item.originalPrice || 0).toFixed(2)} ${CURRENCY}</span>
          ${Number(item.finalPrice || 0).toFixed(2)} ${CURRENCY}
        </div>`;
    } else {
      priceDisplay = `<div class="item-price">${Number(item.originalPrice || 0).toFixed(2)} ${CURRENCY}</div>`;
    }

    const sizeInfo = (item.sizeValue && item.sizeUnit)
      ? `<div class="item-size">${escapeHtml(item.sizeValue)} ${escapeHtml(item.sizeUnit)}</div>`
      : '';

    html += `
      <div class="cart-item">
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name || '')}</div>
          ${sizeInfo}
          ${priceDisplay}
          <div style="color: var(--accent-dark); font-weight: 900; margin-top: 6px;">
            المجموع: ${Number(itemTotal || 0).toFixed(2)} ${CURRENCY}
          </div>
        </div>
        <div class="item-controls">
          <button onclick="changeQty('${escapeAttr(item.id)}', -1)">-</button>
          <span class="item-qty">${qty}</span>
          <button onclick="changeQty('${escapeAttr(item.id)}', 1)">+</button>
          <button class="remove-item-btn" onclick="removeFromCart('${escapeAttr(item.id)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
  }

  container.innerHTML = html;

  const shippingPrice = (STORE_DATA && STORE_DATA.shipping === true)
    ? (parseFloat(STORE_DATA.shipping_price) || 0)
    : 0;

  const total = subtotal + shippingPrice;

  if (subtotalEl) subtotalEl.textContent = `${subtotal.toFixed(2)} ${CURRENCY}`;
  if (shippingEl) shippingEl.textContent = shippingPrice > 0 ? `${shippingPrice.toFixed(2)} ${CURRENCY}` : 'مجاني';
  if (totalEl) totalEl.textContent = `${total.toFixed(2)} ${CURRENCY}`;
}

/* =========================
   BOOTSTRAP
========================= */

window.addEventListener('DOMContentLoaded', async () => {
  const yearEl = $('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  if (!STORE_SLUG){
  const loadingEl = $('loading');
  const msg = `⚠️ Bitte URL mit #/s/<slug> öffnen (z.B. #/s/madina-market)`;
  if (loadingEl){
    loadingEl.innerHTML = `<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">${msg}</div>`;
  } else {
    alert(msg);
  }
  return;
}


  loadCart();
  updateCartCount();
  initNavigation();
  initCartModalClose();

  // CDN first
  const bundle = null; // CDN disabled – everything comes from Sheets/API
 // if (bundle){
 //   try{
  //    const ok = applyBundle(bundle);
    //  if (!ok) throw new Error('applyBundle returned false');
//
  //    initOfferTimer();
    //  showPage(currentPage);
     // initUXEnhancements();
     // return;
   // }catch(e){
   //   console.error('CDN loaded but apply/render failed -> fallback to API', e);
   // }
 // }

  // API fallback
  const active = await loadWebsiteStatus();
  if (!active) return;

  await loadStoreConfig();
  await loadCustomerMessage();
  await loadCategories();
  await fetchProducts();

  initOfferTimer();
  showPage(currentPage);
  initUXEnhancements();
});
