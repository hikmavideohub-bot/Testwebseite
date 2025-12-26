/* ========================================
   ⚙️ مركز التحكم
   ======================================== */
const API_URL = 'https://script.google.com/macros/s/AKfycbxmTLI6-1V7tELp7uvkDnCAMDCp6M5ZPsl4lZFL6KmaBRH9Hc9dqQdsgRDs0deca4RV6w/exec';

// storeId aus URL: ?storeId=... oder ?store_id=...
const urlParams = new URLSearchParams(window.location.search);
const STORE_ID = (urlParams.get('storeId') || urlParams.get('store_id') || '').trim();

function getCdnBundleUrl(){
  return `https://raw.githubusercontent.com/hikmavideohub-bot/Testwebseite/main/data/${STORE_ID}.json`;
}

/* ========================================
   📦 Data Source (CDN JSON + fallback)
   ======================================== */
// ✅ ضع ملفات JSON الجاهزة هنا (مثال: /data/<storeId>.json)
const CDN_DATA_BASE = './data'; // غيّره إلى رابط CDN إذا عندك (مثال: https://cdn.example.com/data)

// إذا ملف الـ CDN قديم جداً (اختياري)، نرجع للـ API
const CDN_BUNDLE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage

function getCdnBundleUrl(){
  return `${CDN_DATA_BASE}/${encodeURIComponent(STORE_ID)}.json`;
}

async function fetchJson(url, opts = {}){
  const res = await fetch(url, {
    cache: 'no-store',
    ...opts,
    headers: { 'Accept': 'application/json', ...(opts.headers || {}) }
  });

  if (!res.ok) return { ok: false, status: res.status, json: null };

  try{
    return { ok: true, status: res.status, json: await res.json() };
  }catch{
    return { ok: false, status: res.status, json: null };
  }
}


// Step 1: اقرأ JSON من CDN
async function loadPublicBundleFromCDN(){
  try{
    const { ok, json } = await fetchJson(getCdnBundleUrl());
    if (!ok || !json) return null;

    // optional staleness check based on meta.generatedAt
    const gen = json?.meta?.generatedAt || json?.meta?.generated_at || json?.generatedAt || null;
    if (gen){
      const t = Date.parse(gen);
      if (!Number.isNaN(t) && (Date.now() - t) > CDN_BUNDLE_MAX_AGE_MS){
        return null; // treat as stale
      }
    }
    return json;
  }catch(e){
    return null;
  }
}

// Step 3: hydrate UI من بيانات جاهزة
function applyBundle(bundle){
  const active = (bundle.websiteActive ?? bundle.website_active);
  if (active === false){
    applyStoreInactiveUI();
    return false;
  }
  restoreStoreUIIfNeeded();

  STORE_DATA = bundle.storeConfig || bundle.store || bundle.storeData || bundle.data || {};
  // currency ممكن تأتي داخل storeConfig أو top-level
  if (bundle.currency && !STORE_DATA.currency) STORE_DATA.currency = bundle.currency;

  applyStoreConfig();

  const msg = (bundle.customerMessage ?? bundle.message ?? '').toString().trim();
  if (msg) applyCustomerMessage(msg);

  categoriesData = Array.isArray(bundle.categories) ? bundle.categories : [];
  productsData   = Array.isArray(bundle.products) ? bundle.products : [];

  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';

  renderCategories(productsData);
  renderAllProducts(productsData);
  renderOfferProducts();
  return true;
}

// مكان واحد لتشغيل تحسينات UX (بدون تكرار listeners)
function initUXEnhancements(){
  try{ initSwipeCategories(); }catch(e){}
  try{ enhanceProductImages(); }catch(e){}
  try{ addProductCardEffects(); }catch(e){}
  try{ addScrollToTop(); }catch(e){}
  try{ lazyLoadImages(); }catch(e){}
}


/* ========================================
   🧠 Cache (LocalStorage) - TTL
   ======================================== */
// ✅ Admin-Bypass: ?nocache=1
const NO_CACHE = new URLSearchParams(location.search).get('nocache') === '1';

// ✅ Default TTL (wenn du nichts angibst)
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

// ✅ Pro-Key TTLs (hier kannst du fein steuern)
const CACHE_TTLS = {
  websiteStatus: 30 * 1000,   // 30 Sekunden (damit Updates schnell sichtbar sind)
  products:      60 * 1000,   // 1 Minute
  categories:    5 * 60 * 1000,
  bundles:       5 * 60 * 1000,
  offers:        60 * 1000
};

function cacheKey(k){ return `cache_${STORE_ID}_${k}`; }

function cacheGet(k, ttlMs){
  if (NO_CACHE) return null;

  const ttl = typeof ttlMs === 'number'
    ? ttlMs
    : (CACHE_TTLS[k] ?? DEFAULT_CACHE_TTL_MS);

  try{
    const raw = localStorage.getItem(cacheKey(k));
    if(!raw) return null;

    const obj = JSON.parse(raw);
    if(!obj || typeof obj.ts !== 'number') return null;

    if(Date.now() - obj.ts > ttl) return null;
    return obj.data;
  }catch(e){
    return null;
  }
}

function cacheSet(k, data){
  if (NO_CACHE) return;
  try{
    localStorage.setItem(cacheKey(k), JSON.stringify({ ts: Date.now(), data }));
  }catch(e){}
}

function cacheBust(){
  try{
    Object.keys(localStorage)
      .filter(k => k.startsWith(`cache_${STORE_ID}_`))
      .forEach(k => localStorage.removeItem(k));
  }catch(e){}
}

// ✅ Lösung 1: Stale-While-Revalidate helper
// verhindert doppelte Fetches für denselben Key
const __fetchLocks = new Map();

function stableStringify(x){
  try { return JSON.stringify(x); } catch { return ''; }
}

async function fetchJson(url){
  const res = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function applyPublicBundle(bundle){
  if (!bundle || typeof bundle !== 'object') throw new Error('Empty/invalid bundle');

  // ---- 1) Website Active (optional, aber gut)
  const activeFlag = bundle.websiteActive ?? bundle.website_active;
  if (activeFlag === false){
    applyStoreInactiveUI();
    return;
  } else {
    restoreStoreUIIfNeeded();
  }

  // ---- 2) Store config
  // Erwartet: bundle.storeConfig (empfohlen)
  // Fallbacks für andere Keys, falls du sie anders nennst
  STORE_DATA = bundle.storeConfig || bundle.store_config || bundle.data?.storeConfig || {};

  // Currency: in deinem Code wird CURRENCY später benutzt
  CURRENCY = (STORE_DATA.currency || bundle.currency || '€').toString().trim() || '€';

  // UI anwenden (Header/Footer/About/Contact etc.)
  applyStoreConfig();

  // ---- 3) Customer message
  const msg = (bundle.customerMessage || bundle.customer_message || '').toString().trim();
  if (msg) applyCustomerMessage(msg);

  // ---- 4) Categories
  categoriesData = Array.isArray(bundle.categories) ? bundle.categories : [];

  // ---- 5) Products
  productsData = Array.isArray(bundle.products) ? bundle.products : [];

  // ---- 6) Render
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';

  renderCategories(productsData);
  renderAllProducts(productsData);
  renderOfferProducts();

  // Optional: Angebote-Page korrekt initialisieren, falls user direkt dort landet
  if (currentPage === 'offers') renderOfferProducts();
}


async function fetchWithCache(key, fetcher, onFresh, ttlMs){
  const cached = cacheGet(key, ttlMs);

  const runFetchLocked = async () => {
    if (__fetchLocks.has(key)) return __fetchLocks.get(key);

    const p = Promise.resolve()
      .then(fetcher)
      .finally(() => __fetchLocks.delete(key));

    __fetchLocks.set(key, p);
    return p;
  };

  if (cached != null) {
    runFetchLocked()
      .then(fresh => {
        if (fresh == null) return;

        if (stableStringify(fresh) !== stableStringify(cached)) {
          cacheSet(key, fresh);
          if (typeof onFresh === 'function') onFresh(fresh, cached);
        } else {
          cacheSet(key, cached);
        }
      })
      .catch(()=>{});

    return cached;
  }

  const fresh = await runFetchLocked();
  if (fresh != null) cacheSet(key, fresh);
  if (typeof onFresh === 'function') onFresh(fresh, null);
  return fresh;
}



/* ========================================
   المتغيرات العامة
   ======================================== */
let STORE_DATA = {};
let CURRENCY = ''; // سيتم جلبها من Sheets stores.currency
let cart = [];
let productsData = [];
let categoriesData = [];
let activeCategory = 'الكل';
let currentPage = 'home';

function cartStorageKey(){ return 'cart_' + STORE_ID; }
function loadCart(){
  try{ cart = JSON.parse(localStorage.getItem(cartStorageKey())) || []; }
  catch(e){ cart = []; }
}

/* ========================================
   🚀 التهيئة
   ======================================== */
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('current-year').textContent = new Date().getFullYear();

  if (!STORE_ID){
    const loadingEl = document.getElementById("loading");
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">
          ⚠️ ضع STORE_ID داخل الكود ثم أعد تحميل الصفحة
        </div>`;
    } else {
      alert("⚠️ ضع STORE_ID داخل الكود ثم أعد تحميل الصفحة");
    }
    return;
  }

  loadCart();
  updateCartCount();
  initNavigation();

  // ✅ Public: حاول تحميل بيانات جاهزة من CDN أولاً (Step 1 + 3)
  const bundle = await loadPublicBundleFromCDN();

if (bundle) {
  const ok = applyBundle(bundle);
  if (!ok) return;

  initOfferTimer();
  showPage(currentPage);
  initUXEnhancements();
  return; // <- wichtig: API-Fallback verhindern
}


  // ✅ Fallback: API (Apps Script) فقط إذا لم يوجد ملف JSON أو كان غير صالح
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

/* ========================================
   ✅ حالة الموقع + رسالة العملاء + التصنيفات
   ======================================== */
async function loadWebsiteStatus(){
  // websiteStatus soll schnell aktualisieren
  const STATUS_TTL_MS = 30 * 1000;

  const activeObj = await fetchWithCache(
    'websiteStatus',
    async () => {
      const ts = NO_CACHE ? `&_ts=${Date.now()}` : '';
      const res = await fetch(
        `${API_URL}?type=websiteStatus&storeId=${STORE_ID}${ts}`,
        { headers: { 'Accept': 'application/json' } }
      );

      const json = await res.json();

      // Wenn API "nicht success" -> Standard: aktiv (wie vorher)
      if (!json || !json.success) return { active: true };

      const data = json.data || {};
      const flag = data.website_active ?? data.websiteActive;
      const active = flag !== false;

      return { active };
    },
    (fresh, cached) => {
      // UI nur updaten wenn sich active wirklich geändert hat
      const freshActive = !!fresh?.active;
      const cachedActive = !!cached?.active;

      if (freshActive !== cachedActive) {
        if (!freshActive) {
          applyStoreInactiveUI();
        } else {
          restoreStoreUIIfNeeded();
        }
      }
    },
    STATUS_TTL_MS
  );

  const active = !!activeObj?.active;

  // sofort (cached oder fresh) anwenden
  if (!active) {
    applyStoreInactiveUI();
    return false;
  } else {
    restoreStoreUIIfNeeded();
    return true;
  }
}

function applyStoreInactiveUI(){
  const loadingEl = document.getElementById('loading');
  if (loadingEl){
    loadingEl.innerHTML = `
      <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">
        ⛔ هذا المتجر غير متاح حالياً.
      </div>`;
  }
  const main = document.querySelector('.main-content');
  if (main) main.style.display = 'none';
}

function restoreStoreUIIfNeeded(){
  const main = document.querySelector('.main-content');
  if (main) main.style.display = '';
}


async function loadCustomerMessage(){
  const MESSAGE_TTL_MS = 60 * 1000; // 1 Minute

  const data = await fetchWithCache(
    'customerMessage',
    async () => {
      const ts = NO_CACHE ? `&_ts=${Date.now()}` : '';
      const res = await fetch(
        `${API_URL}?type=customerMessage&storeId=${STORE_ID}${ts}`,
        { headers: { 'Accept': 'application/json' } }
      );

      const json = await res.json();
      if (!json || !json.success) return { msg: '' };

      const msg = (json.message || '').toString().trim();
      return { msg };
    },
    (fresh, cached) => {
      // UI nur aktualisieren wenn Nachricht sich geändert hat
      if ((fresh?.msg || '') !== (cached?.msg || '')) {
        applyCustomerMessage(fresh?.msg || '');
      }
    },
    MESSAGE_TTL_MS
  );

  applyCustomerMessage(data?.msg || '');
}

function applyCustomerMessage(msg){
  if (!msg) return;
  STORE_DATA.message = msg;
  const bar = document.getElementById('announcement-bar');
  const textEl = document.getElementById('announcement-text');
  if (bar && textEl){
    bar.style.display = 'block';
    textEl.textContent = msg;
  }
}

async function loadCategories(){
  const CATEGORIES_TTL_MS = 5 * 60 * 1000; // 5 Minuten

  const data = await fetchWithCache(
    'categories',
    async () => {
      const ts = NO_CACHE ? `&_ts=${Date.now()}` : '';
      const res = await fetch(
        `${API_URL}?type=categories&storeId=${STORE_ID}${ts}`,
        { headers: { 'Accept': 'application/json' } }
      );

      const json = await res.json();
      if (!json || !json.success) return { categories: [] };

      return {
        categories: Array.isArray(json.categories) ? json.categories : []
      };
    },
    (fresh, cached) => {
      // nur updaten wenn sich wirklich was geändert hat
      const freshArr = fresh?.categories || [];
      const cachedArr = cached?.categories || [];
      if (JSON.stringify(freshArr) !== JSON.stringify(cachedArr)) {
        categoriesData = freshArr;
      }
    },
    CATEGORIES_TTL_MS
  );

  categoriesData = data?.categories || [];
}

/* ========================================
   📡 جلب بيانات المتجر (Sheets stores)
   ======================================== */
async function loadStoreConfig(){
  const cached = cacheGet('storeConfig');
  if (cached && cached.data){
    STORE_DATA = cached.data;
    applyStoreConfig();
    return;
  }

  try{
    const res = await fetch(`${API_URL}?type=storeConfig&storeId=${STORE_ID}&_ts=${Date.now()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'فشل تحميل بيانات المتجر');
    STORE_DATA = json.data || {};
    cacheSet('storeConfig', {data: STORE_DATA});
    applyStoreConfig();
  }catch(e){
    console.error('خطأ في تحميل بيانات المتجر:', e);
    showAlert('حدث خطأ في تحميل بيانات المتجر. يرجى المحاولة لاحقاً.', 'error');
  }
}

function applyStoreConfig(){
  // ✅ currency من Sheet stores.currency (بدون أي تثبيت داخل الكود)
  CURRENCY = (STORE_DATA.currency || '').toString().trim();
  if (!CURRENCY) CURRENCY = '€'; // fallback فقط إذا كانت الخانة فارغة

  const storeName = STORE_DATA.store_name || 'متجر';
  const storeDescription = STORE_DATA.page_description || 'متجر إلكتروني متكامل';

  // عنوان/اسم
  document.getElementById('store-name').textContent = storeName;
  document.getElementById('footer-store-name').textContent = storeName;
  document.getElementById('footer-store-name-bottom').textContent = storeName;
  document.title = storeName;

  // وصف
  document.getElementById('footer-store-description').textContent = storeDescription;

  // Header phone (desktop)
  document.getElementById('store-phone').textContent = STORE_DATA.phone || 'غير متوفر';

  // About page
  const aboutPhoneEl = document.getElementById('about-phone'); if (aboutPhoneEl) aboutPhoneEl.textContent = STORE_DATA.phone || 'غير متوفر';
  const aboutWhatsappEl = document.getElementById('about-whatsapp'); if (aboutWhatsappEl) aboutWhatsappEl.textContent = STORE_DATA.whatsapp || STORE_DATA.phone || 'غير متوفر';
  const aboutEmailEl = document.getElementById('about-email'); if (aboutEmailEl) aboutEmailEl.textContent = STORE_DATA.email || 'غير متوفر';
  const aboutHoursEl = document.getElementById('about-hours'); if (aboutHoursEl) aboutHoursEl.textContent = STORE_DATA.working_hours || '24/7';
  const aboutAddressEl = document.getElementById('about-address'); if (aboutAddressEl) aboutAddressEl.textContent = STORE_DATA.address || 'غير متوفر';
  const aboutCurrencyEl = document.getElementById('about-currency'); if (aboutCurrencyEl) aboutCurrencyEl.textContent = CURRENCY;

  // Shipping
  const shippingText = STORE_DATA.shipping === true
    ? (STORE_DATA.shipping_price ? `شحن بمبلغ ${Number(STORE_DATA.shipping_price).toFixed(2)} ${CURRENCY}` : 'شحن مجاني')
    : 'لا يتوفر شحن';
  const aboutShippingEl = document.getElementById('about-shipping'); if (aboutShippingEl) aboutShippingEl.textContent = shippingText;

  // Contact page
  document.getElementById('contact-phone-text').textContent = STORE_DATA.phone || 'غير متوفر';
  document.getElementById('contact-whatsapp-text').textContent = STORE_DATA.whatsapp || STORE_DATA.phone || 'غير متوفر';
  document.getElementById('contact-email-text').textContent = STORE_DATA.email || 'غير متوفر';
  document.getElementById('contact-address-text').textContent = STORE_DATA.address || 'غير متوفر';
  document.getElementById('working-hours-weekdays').textContent = STORE_DATA.working_hours || '24/7';
  document.getElementById('working-hours-delivery').textContent = (STORE_DATA.shipping === true) ? shippingText : 'لا يتوفر شحن';
  const contactCurrencyEl = document.getElementById('contact-currency'); if (contactCurrencyEl) contactCurrencyEl.textContent = CURRENCY;

  // Footer
  document.getElementById('footer-phone').textContent = STORE_DATA.phone || 'غير متوفر';
  document.getElementById('footer-whatsapp').textContent = STORE_DATA.whatsapp || STORE_DATA.phone || 'غير متوفر';
  document.getElementById('footer-email').textContent = STORE_DATA.email || 'غير متوفر';
  document.getElementById('footer-address').textContent = STORE_DATA.address || 'غير متوفر';
  document.getElementById('footer-hours').textContent = STORE_DATA.working_hours || '24/7';
  document.getElementById('footer-shipping').textContent = shippingText;
  document.getElementById('footer-currency').textContent = CURRENCY;

  // Social links
  setupSocialLinks();

  // Announcement from store config (if present)
  if (STORE_DATA.message && STORE_DATA.message.trim() !== ''){
    document.getElementById('announcement-bar').style.display = 'block';
    document.getElementById('announcement-text').textContent = STORE_DATA.message;
  }

  // ✅ Maps (About + Contact)
  applyMapsFromAddress(STORE_DATA.address || '');
}

function applyMapsFromAddress(address){
  const addr = (address || '').toString().trim();
  const aboutWrap = document.getElementById('about-map-wrap');
  const aboutMap = document.getElementById('about-map');
  const aboutHint = document.getElementById('about-map-hint');

  const contactWrap = document.getElementById('contact-map-wrap');
  const contactMap = document.getElementById('contact-map');
  const contactHint = document.getElementById('contact-map-hint');

  if (!addr){
    if (aboutWrap) aboutWrap.style.display = 'none';
    if (contactWrap) contactWrap.style.display = 'none';
    if (aboutHint) aboutHint.textContent = 'لم يتم إدخال عنوان في Sheets.';
    if (contactHint) contactHint.textContent = 'لم يتم إدخال عنوان في Sheets.';
    return;
  }

  const src = `https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed`;
  if (aboutMap){ aboutMap.src = src; }
  if (contactMap){ contactMap.src = src; }
  if (aboutWrap) aboutWrap.style.display = 'block';
  if (contactWrap) contactWrap.style.display = 'block';
  if (aboutHint) aboutHint.textContent = '';
  if (contactHint) contactHint.textContent = '';
}

/* ========================================
   📡 جلب المنتجات
   ======================================== */
async function fetchProducts(){
  const cached = cacheGet('products');
  if (cached && Array.isArray(cached.products)){
    productsData = cached.products;
    document.getElementById('loading').style.display = 'none';
    renderCategories(productsData);
    renderAllProducts(productsData);
    renderOfferProducts();
    return;
  }

  try{
    const res = await fetch(`${API_URL}?type=products&storeId=${STORE_ID}&_ts=${Date.now()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'فشل تحميل المنتجات');

    productsData = json.products || [];
    cacheSet('products', {products: productsData});

    document.getElementById('loading').style.display = 'none';

    if (productsData.length > 0){
      renderCategories(productsData);
      renderAllProducts(productsData);
      renderOfferProducts();
    } else {
      document.getElementById('products-grid').innerHTML = `
        <div class="empty-state" style="text-align:center; padding:3rem; color:var(--muted); grid-column:1 / -1;">
          <i class="fas fa-box-open" style="font-size:3rem;color:rgba(122,135,151,.25)"></i>
          <h3 style="margin-top:1rem; font-weight:900;">لا توجد منتجات متاحة حالياً</h3>
          <p>سنقوم بإضافة منتجات جديدة قريباً</p>
        </div>`;
    }
  }catch(e){
    console.error('خطأ في تحميل المنتجات:', e);
    document.getElementById('loading').innerHTML = `
      <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">
        حدث خطأ في تحميل المنتجات، يرجى المحاولة لاحقاً.
      </div>`;
  }
}

/* ========================================
   🔧 وظائف معالجة البيانات (نفس منطقك)
   ======================================== */
function checkBooleanValue(value){
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  const strValue = value.toString().toLowerCase().trim();
  return (strValue === 'true' || strValue === 'yes' || strValue === '1' || strValue === 'نعم' || strValue === '✓' || strValue === '✔' || strValue === 'صحيح' || strValue === 'صح');
}

function isProductActive(product){
  const v = product.product_active ?? product.productActive ?? product.active;
  return checkBooleanValue(v);
}

function hasOffer(product){
  const v = product.has_offer ?? product.hasOffer;
  return checkBooleanValue(v);
}

function parseDate(dateString){
  if (!dateString) return null;
  try{
    const s = dateString.toString().trim();
    // DD.MM.YYYY
    if (s.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)){
      const parts = s.split('.');
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    // YYYY-MM-DD
    if (s.match(/^\d{4}-\d{1,2}-\d{1,2}$/)){
      const [y,m,d] = s.split('-').map(Number);
      return new Date(y, m-1, d);
    }
    return new Date(s);
  }catch(e){
    console.error('خطأ في تحليل التاريخ:', dateString);
    return null;
  }
}

function isOfferActive(product){
  if (!hasOffer(product)) return false;

  const activeFlag =
    product.offer_aktive ?? product.offerAktive ??
    product.offer_active ?? product.offerActive;

  if (!checkBooleanValue(activeFlag)) return false;

  const now = new Date();
  const startDate = parseDate(product.offer_start_date ?? product.offerStartDate);
  const endDate   = parseDate(product.offer_end_date   ?? product.offerEndDate);

  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;

  return true;
}

function calculatePrice(product){
  const originalPrice = parseFloat(product.price) || 0;
  let finalPrice = originalPrice;
  let hasDiscount = false;
  let hasBundle = false;
  let discountPercent = 0;
  let bundleInfo = null;
  let bundleText = '';

  const offerTypeRaw = (product.offer_type ?? product.offerType ?? '').toString().toLowerCase();
  const percentRaw = Number(product.percent ?? product.offerPercent ?? 0);
  const bundleQtyRaw = Number(product.bundle_qty ?? product.bundleQty ?? 1);
  const bundlePriceRaw = Number(product.bundle_price ?? product.bundlePrice ?? originalPrice);

  if (hasOffer(product) && isOfferActive(product)){
    if (offerTypeRaw.includes('percent') || offerTypeRaw.includes('rabatt') || offerTypeRaw.includes('discount')){
      discountPercent = parseFloat(percentRaw) || 0;
      if (discountPercent > 0 && discountPercent <= 100){
        finalPrice = originalPrice - (originalPrice * discountPercent / 100);
        hasDiscount = true;
      }
    } else if (offerTypeRaw.includes('bundle')){
      const bundleQty = parseInt(bundleQtyRaw) || 1;
      const bundlePrice = parseFloat(bundlePriceRaw) || originalPrice;
      if (bundleQty > 1 && bundlePrice > 0){
        hasBundle = true;
        bundleInfo = { qty: bundleQty, price: bundlePrice, unitPrice: bundlePrice / bundleQty };
        bundleText = `${bundleQty} بـ ${bundlePrice.toFixed(2)} ${CURRENCY}`;
      }
    }
  }

  return {
    originalPrice,
    finalPrice: parseFloat(finalPrice.toFixed(2)),
    hasDiscount,
    hasBundle,
    bundleInfo,
    discountPercent,
    bundleText
  };
}

function calculateCartItemPrice(item){
  let total = 0;
  if (item.hasBundle && item.bundleInfo){
    const bundles = Math.floor(item.qty / item.bundleInfo.qty);
    const remainder = item.qty % item.bundleInfo.qty;
    total = (bundles * item.bundleInfo.price) + (remainder * item.originalPrice);
  } else if (item.hasDiscount){
    total = item.finalPrice * item.qty;
  } else {
    total = item.originalPrice * item.qty;
  }
  return parseFloat(total.toFixed(2));
}

/* ========================================
   🖼️ عرض المنتجات - UPDATED WITH DESCRIPTION TOGGLE
   ======================================== */
function productImageHTML(p){
  const url = (p.image || '').toString().trim();
  if (!url){
    return `
      <div class="placeholder-image">
        <div class="ph">Beispielbild<br><small>صورة توضيحية</small></div>
      </div>
    `;
  }
  return `
    <img src="${url}"
      class="product-image"
      alt="${escapeHtml(p.name || '')}"
      onerror="this.outerHTML='<div class=&quot;placeholder-image&quot;><div class=&quot;ph&quot;>Beispielbild<br><small>صورة توضيحية</small></div></div>'"
    />
  `;
}

function toggleDescription(element, productId) {
  const desc = element.closest('.product-info').querySelector('.product-desc');
  const toggleIcon = element.querySelector('.desc-toggle i');
  
  if (desc.classList.contains('expanded')) {
    desc.classList.remove('expanded');
    toggleIcon.className = 'fas fa-chevron-down';
  } else {
    desc.classList.add('expanded');
    toggleIcon.className = 'fas fa-chevron-up';
  }
}

function renderAllProducts(products){
  let filtered = products;
  if (activeCategory !== 'الكل'){
    filtered = products.filter(p => (p.category && p.category.trim() === activeCategory));
  }

  const activeProducts = [];
  const inactiveProducts = [];

  filtered.forEach(p => (isProductActive(p) ? activeProducts : inactiveProducts).push(p));

  renderGrid('products-grid', activeProducts, false);

  const inactiveContainer = document.getElementById('inactive-section');
  const toggleBtn = document.getElementById('inactive-toggle');

  if (inactiveProducts.length > 0){
    toggleBtn.style.display = 'block';
    renderGrid('inactive-grid', inactiveProducts, true);
  } else {
    toggleBtn.style.display = 'none';
    inactiveContainer.style.display = 'none';
  }
}

function renderGrid(containerId, products, isInactive){
  const grid = document.getElementById(containerId);

  if (products.length === 0 && !isInactive){
    grid.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:3rem; color:var(--muted); grid-column:1 / -1;">
        <i class="fas fa-box-open" style="font-size:3rem;color:rgba(122,135,151,.25)"></i>
        <h3 style="margin-top:1rem; font-weight:900;">لا توجد منتجات</h3>
        <p>لا توجد منتجات نشطة في هذا القسم حالياً</p>
      </div>`;
    return;
  }
  if (products.length === 0 && isInactive){ grid.innerHTML = ''; return; }

  grid.innerHTML = '';

  products.forEach(p => {
    const pricing = calculatePrice(p);
    const isActive = isProductActive(p) && !isInactive;
    const isMobile = window.innerWidth <= 992;

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

    const cardClass = isActive ? 'product-card' : 'product-card inactive';
    const inactiveBadge = !isActive ? '<div class="inactive-badge">غير متوفر</div>' : '';
    const btnState = isActive ? '' : 'disabled';
    const btnText = isActive ? (isMobile ? 'أضف' : 'أضف للسلة') : (isMobile ? 'نفذ' : 'نفذت الكمية');
    const btnIcon = isActive ? 'fa-plus' : 'fa-times';
    const btnClick = isActive ? `onclick="addToCart('${escapeAttr(p.id)}', this)"` : '';

    const sizeValue = p.sizevalue || '';
    const sizeUnit = p.sizeunit || '';
    const sizeDisplay = (!isMobile && sizeValue && sizeUnit) ? `<div class="product-size"><i class="fas fa-weight-hanging"></i> الحجم: ${escapeHtml(sizeValue)} ${escapeHtml(sizeUnit)}</div>` : '';

    const bundleInfoHTML = (!isMobile && pricing.hasBundle) ? `<div class="bundle-info">عرض حزمة: ${pricing.bundleText}</div>` : '';
    
    // Check if we're on mobile to decide whether to show description toggle
    const descToggleHTML = !isMobile ? `<span class="desc-toggle" onclick="toggleDescription(this, '${escapeAttr(p.id)}')"><i class="fas fa-chevron-down"></i></span>` : '';

    grid.innerHTML += `
      <div class="${cardClass}">
        <div class="product-image-container">
          ${productImageHTML(p)}
          <div class="product-badges">
            ${badgeHTML}
            ${inactiveBadge}
          </div>
        </div>

        <div class="product-info">
          <h3 class="product-title" onclick="${!isMobile ? `toggleDescription(this, '${escapeAttr(p.id)}')` : ''}">
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
  });
}

function renderOfferProducts(){
  const offersGrid = document.getElementById('offers-grid');
  const noOffers = document.getElementById('no-offers');

  if (!productsData || productsData.length === 0){
    offersGrid.innerHTML = '';
    noOffers.style.display = 'block';
    return;
  }

  const offerProducts = productsData.filter(p => isProductActive(p) && hasOffer(p) && isOfferActive(p));

  if (offerProducts.length === 0){
    offersGrid.innerHTML = '';
    noOffers.style.display = 'block';
    return;
  }

  noOffers.style.display = 'none';
  offersGrid.innerHTML = '';
  offerProducts.forEach(p => {
    const pricing = calculatePrice(p);
    const isMobile = window.innerWidth <= 992;

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
      // should not happen, but keep safe
      priceHTML = `<div class="price-wrapper"><span class="price-new">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span></div>`;
      badgeHTML = `<div class="discount-badge">${isMobile ? 'عرض' : 'عرض'}</div>`;
    }

    const sizeValue = p.sizevalue || '';
    const sizeUnit = p.sizeunit || '';
    const sizeDisplay = (!isMobile && sizeValue && sizeUnit) ? `<div class="product-size"><i class="fas fa-weight-hanging"></i> الحجم: ${escapeHtml(sizeValue)} ${escapeHtml(sizeUnit)}</div>` : '';
    const bundleInfoHTML = (!isMobile && pricing.hasBundle) ? `<div class="bundle-info">عرض حزمة: ${pricing.bundleText}</div>` : '';
    
    // Check if we're on mobile
    const descToggleHTML = !isMobile ? `<span class="desc-toggle" onclick="toggleDescription(this, '${escapeAttr(p.id)}')"><i class="fas fa-chevron-down"></i></span>` : '';

    offersGrid.innerHTML += `
      <div class="product-card">
        <div class="product-image-container">
          ${productImageHTML(p)}
          <div class="product-badges">${badgeHTML}</div>
        </div>

        <div class="product-info">
          <h3 class="product-title" onclick="${!isMobile ? `toggleDescription(this, '${escapeAttr(p.id)}')` : ''}">
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
  });
}

function renderCategories(products){
  const nav = document.getElementById('category-nav');
  const rawCategories = products.map(p => p.category).filter(c => c && c.trim() !== '');
  const uniqueCategories = (Array.isArray(categoriesData) && categoriesData.length) ? categoriesData : [...new Set(rawCategories)];

  if (uniqueCategories.length > 0){
    nav.style.display = 'flex';
    nav.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'cat-btn active';
    allBtn.innerHTML = '<i class="fas fa-th-large"></i> الكل';
    allBtn.onclick = () => filterProducts('الكل', allBtn);
    nav.appendChild(allBtn);

    uniqueCategories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-btn';
      btn.innerHTML = `<i class="fas fa-tag"></i> ${escapeHtml(cat)}`;
      btn.onclick = () => filterProducts(cat, btn);
      nav.appendChild(btn);
    });
  }
}

function filterProducts(category, btnElement){
  activeCategory = category;
  document.querySelectorAll('#category-nav .cat-btn').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderAllProducts(productsData);
}

function toggleInactive(){
  const section = document.getElementById('inactive-section');
  const btn = document.getElementById('toggle-inactive-text');

  if (section.style.display === 'none'){
    section.style.display = 'block';
    btn.textContent = 'إخفاء المنتجات غير النشطة';
  } else {
    section.style.display = 'none';
    btn.textContent = 'عرض المنتجات غير النشطة';
  }
}

/* ========================================
   🗺️ التنقل
   ======================================== */
function initNavigation(){
  // prevent double-binding (helps if initNavigation is called مرة ثانية)
  if (document.body && document.body.dataset && document.body.dataset.navInit === '1') return;
  if (document.body && document.body.dataset) document.body.dataset.navInit = '1';

  const navMenu = document.getElementById('navMenu');
  const mobileToggle = document.getElementById('mobileToggle');

  const setToggleIcon = (open) => {
    if (!mobileToggle) return;
    mobileToggle.innerHTML = open ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
  };

  const openMenu = () => {
    if (!navMenu) return;
    navMenu.classList.add('active');
    setToggleIcon(true);
  };

  const closeMenu = () => {
    if (!navMenu) return;
    navMenu.classList.remove('active');
    setToggleIcon(false);
  };

  const toggleMenu = () => {
    if (!navMenu) return;
    const open = navMenu.classList.toggle('active');
    setToggleIcon(open);
  };

  // ✅ Nav links (Header)
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.addEventListener('click', function(e){
      e.preventDefault();
      const page = this.getAttribute('data-page');
      if (!page) return;
      navigateToPage(page);
      closeMenu(); // mobile: close after navigation
    });
  });

  // ✅ Footer links
  document.querySelectorAll('footer a[data-page]').forEach(link => {
    link.addEventListener('click', function(e){
      e.preventDefault();
      const page = this.getAttribute('data-page');
      if (!page) return;
      navigateToPage(page);
      closeMenu();
    });
  });

  // ✅ Mobile toggle
  if (mobileToggle){
    mobileToggle.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });
    setToggleIcon(navMenu?.classList.contains('active'));
  }

  // ✅ Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!navMenu || !mobileToggle) return;
    if (!navMenu.classList.contains('active')) return;

    const clickedInsideMenu = navMenu.contains(e.target);
    const clickedToggle = mobileToggle.contains(e.target);
    if (!clickedInsideMenu && !clickedToggle) closeMenu();
  });

  // ✅ Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
}

function navigateToPage(page){
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-page') === page);
  });

  showPage(page);
  currentPage = page;

  if (page === 'offers') renderOfferProducts();
}

function showPage(page){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageElement = document.getElementById(`${page}-page`);
  if (pageElement) pageElement.classList.add('active');
  closeCart();
}

/* ========================================
   🛒 السلة - COMPLETELY REVISED
   ======================================== */
function addToCart(id, btn){
  const product = productsData.find(p => String(p.id) === String(id));
  if (!product || !isProductActive(product)) return;

  const pricing = calculatePrice(product);
  const existingItem = cart.find(item => String(item.id) === String(id));

  if (existingItem){
    existingItem.qty++;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      originalPrice: pricing.originalPrice,
      finalPrice: pricing.finalPrice,
      hasDiscount: pricing.hasDiscount,
      hasBundle: pricing.hasBundle,
      bundleInfo: pricing.bundleInfo,
      bundleText: pricing.bundleText,
      qty: 1,
      sizeValue: product.sizevalue,
      sizeUnit: product.sizeunit
    });
  }

  saveCart();

  if (btn){
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> تمت الإضافة';
    btn.style.background = 'linear-gradient(135deg, var(--accent), var(--accent-light))';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 1500);
  }

  showAlert('تمت إضافة المنتج إلى سلة المشتريات', 'success');
}

function saveCart(){
  try{ localStorage.setItem(cartStorageKey(), JSON.stringify(cart)); }catch(e){}
  updateCartCount();
  renderCartItems();
}

function updateCartCount(){
  const totalItems = cart.reduce((sum, i) => sum + (i.qty || 0), 0);
  document.getElementById('cart-badge').textContent = totalItems;

  if (totalItems === 0){
    const empty = document.querySelector('.cart-empty');
    if (empty) empty.style.display = 'flex';
    document.getElementById('cart-summary').style.display = 'none';
  } else {
    const empty = document.querySelector('.cart-empty');
    if (empty) empty.style.display = 'none';
    document.getElementById('cart-summary').style.display = 'block';
  }
}

// FIXED: These functions now work properly
function changeQty(id, delta){
  const item = cart.find(i => String(i.id) === String(id));
  if (item){
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => String(i.id) !== String(id));
    saveCart();
  }
}

function removeFromCart(id){
  cart = cart.filter(i => String(i.id) !== String(id));
  saveCart();
}

function renderCartItems(){
  const container = document.getElementById('cart-items');

  if (cart.length === 0){
    container.innerHTML = `
      <div class="cart-empty">
        <i class="fas fa-shopping-basket"></i>
        <p>سلة المشتريات فارغة</p>
      </div>`;
    document.getElementById('cart-summary').style.display = 'none';
    return;
  }

  let subtotal = 0;

  container.innerHTML = cart.map(item => {
    const itemTotal = calculateCartItemPrice(item);
    subtotal += itemTotal;

    let priceDisplay = '';

    if (item.hasBundle && item.bundleInfo){
      const bundles = Math.floor(item.qty / item.bundleInfo.qty);
      if (bundles > 0){
        priceDisplay = `
          <div class="item-price">
            <span class="old-price">${item.originalPrice.toFixed(2)} ${CURRENCY}</span>
            ${item.bundleInfo.unitPrice.toFixed(2)} ${CURRENCY}
            <div class="bundle-note">(${item.bundleText})</div>
          </div>`;
      } else {
        priceDisplay = `
          <div class="item-price">
            ${item.originalPrice.toFixed(2)} ${CURRENCY}
            <div class="bundle-note">(العرض يبدأ عند ${item.bundleInfo.qty})</div>
          </div>`;
      }
    } else if (item.hasDiscount){
      priceDisplay = `
        <div class="item-price">
          <span class="old-price">${item.originalPrice.toFixed(2)} ${CURRENCY}</span>
          ${item.finalPrice.toFixed(2)} ${CURRENCY}
        </div>`;
    } else {
      priceDisplay = `<div class="item-price">${item.originalPrice.toFixed(2)} ${CURRENCY}</div>`;
    }

    const sizeInfo = (item.sizeValue && item.sizeUnit) ? `<div class="item-size">${escapeHtml(item.sizeValue)} ${escapeHtml(item.sizeUnit)}</div>` : '';

    return `
      <div class="cart-item">
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name || '')}</div>
          ${sizeInfo}
          ${priceDisplay}
          <div style="color: var(--accent-dark); font-weight: 900; margin-top: 6px;">
            المجموع: ${itemTotal.toFixed(2)} ${CURRENCY}
          </div>
        </div>
        <div class="item-controls">
          <button onclick="changeQty('${escapeAttr(item.id)}', -1)">-</button>
          <span class="item-qty">${item.qty}</span>
          <button onclick="changeQty('${escapeAttr(item.id)}', 1)">+</button>
          <button class="remove-item-btn" onclick="removeFromCart('${escapeAttr(item.id)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
  }).join('');

  const shippingPrice = (STORE_DATA.shipping === true) ? (parseFloat(STORE_DATA.shipping_price) || 0) : 0;
  const total = subtotal + shippingPrice;

  document.getElementById('cart-subtotal').textContent = subtotal.toFixed(2) + ' ' + CURRENCY;
  document.getElementById('cart-shipping').textContent = shippingPrice > 0 ? shippingPrice.toFixed(2) + ' ' + CURRENCY : 'مجاني';
  document.getElementById('cart-total').textContent = total.toFixed(2) + ' ' + CURRENCY;
}

function openCart(){
  renderCartItems();
  document.getElementById('cartModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCart(){
  document.getElementById('cartModal').classList.remove('active');
  document.body.style.overflow = 'auto';
}

// Fix for closing modal when clicking outside
document.getElementById('cartModal').addEventListener('click', (e) => {
  if (e.target.id === 'cartModal') closeCart();
});

/* ========================================
   🚀 إرسال الطلب عبر واتساب
   ======================================== */
function checkout(){
  const name = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const address = document.getElementById('cust-address').value.trim();

  if (!name || !phone || cart.length === 0){
    showAlert('الرجاء تعبئة جميع الحقول والتأكد من وجود منتجات في السلة', 'error');
    return;
  }

  const shippingPrice = (STORE_DATA.shipping === true) ? (parseFloat(STORE_DATA.shipping_price) || 0) : 0;

  let msg = `*طلب جديد من ${STORE_DATA.store_name || ''}*\n`;
  msg += `========================\n`;
  msg += `👤 الاسم: ${name}\n`;
  msg += `📞 الهاتف: ${phone}\n`;
  msg += `📍 العنوان: ${address}\n`;
  msg += `📅 التاريخ: ${new Date().toLocaleDateString('ar-SA')}\n`;
  msg += `⏰ الوقت: ${new Date().toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'})}\n`;
  msg += `========================\n`;
  msg += `📋 *الطلبات:*\n\n`;

  let subtotal = 0;
  let savedAmount = 0;

  cart.forEach((item, index) => {
    const itemTotal = calculateCartItemPrice(item);
    subtotal += itemTotal;

    const originalTotal = item.originalPrice * item.qty;
    savedAmount += (originalTotal - itemTotal);

    msg += `*${index + 1}. ${item.name}*\n`;

    if (item.sizeValue && item.sizeUnit){
      msg += `   الحجم: ${item.sizeValue} ${item.sizeUnit}\n`;
    }

    msg += `   الكمية: ${item.qty}\n`;

    if (item.hasBundle && item.bundleInfo){
      const bundles = Math.floor(item.qty / item.bundleInfo.qty);
      if (bundles > 0){
        msg += `   السعر: ${item.bundleInfo.unitPrice.toFixed(2)} ${CURRENCY} (${item.bundleText})\n`;
      } else {
        msg += `   السعر: ${item.originalPrice.toFixed(2)} ${CURRENCY} (العرض يبدأ عند ${item.bundleInfo.qty})\n`;
      }
    } else if (item.hasDiscount){
      msg += `   السعر: ${item.finalPrice.toFixed(2)} ${CURRENCY} (بدلاً من ${item.originalPrice.toFixed(2)} ${CURRENCY})\n`;
    } else {
      msg += `   السعر: ${item.originalPrice.toFixed(2)} ${CURRENCY}\n`;
    }

    msg += `   المجموع: ${itemTotal.toFixed(2)} ${CURRENCY}\n\n`;
  });

  msg += `========================\n`;
  if (savedAmount > 0) msg += `🎉 *لقد وفرت: ${savedAmount.toFixed(2)} ${CURRENCY}*\n`;
  msg += `📦 *الشحن: ${shippingPrice > 0 ? shippingPrice.toFixed(2) + ' ' + CURRENCY : 'مجاني'}*\n`;
  msg += `💰 *الإجمالي النهائي: ${(subtotal + shippingPrice).toFixed(2)} ${CURRENCY}*\n`;
  msg += `========================\n`;
  msg += `شكراً لثقتكم بـ ${STORE_DATA.store_name || ''}!`;

  const whatsappNumber = (STORE_DATA.whatsapp || STORE_DATA.phone || '').toString().trim();
  if (whatsappNumber){
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`, '_blank');

    cart = [];
    saveCart();
    closeCart();

    document.getElementById('cust-name').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-address').value = '';

    showAlert('تم إرسال طلبك بنجاح! سيتم التواصل معك قريباً', 'success');
  } else {
    showAlert('لا يوجد رقم واتساب مسجل للمتجر', 'error');
  }
}

/* ========================================
   🔗 روابط التواصل
   ======================================== */
function setupSocialLinks(){
  const socialLinksContainer = document.getElementById('social-links');
  const footerSocialLinks = document.getElementById('footer-social-links');

  const socialLinks = [];
  if (STORE_DATA.facebook) socialLinks.push({icon: 'fab fa-facebook-f', url: STORE_DATA.facebook, class: 'facebook'});
  if (STORE_DATA.instagram) socialLinks.push({icon: 'fab fa-instagram', url: STORE_DATA.instagram, class: 'instagram'});
  if (STORE_DATA.tiktok) socialLinks.push({icon: 'fab fa-tiktok', url: STORE_DATA.tiktok, class: 'tiktok'});

  const socialHTML = socialLinks.map(link =>
    `<a href="${link.url}" target="_blank" rel="noopener noreferrer" class="${link.class}"><i class="${link.icon}"></i></a>`
  ).join('');

  socialLinksContainer.innerHTML = socialHTML;
  footerSocialLinks.innerHTML = socialHTML;
}

/* ========================================
   ⏳ عداد العروض (UI فقط)
   ======================================== */
let offerTimerIntervalId = null;

function initOfferTimer(){
  if (offerTimerIntervalId) clearInterval(offerTimerIntervalId);

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

  function updateTimer(){
    const now = Date.now();
    const distance = endDate.getTime() - now;

    if (distance < 0){
      const t = document.querySelector('.timer');
      if (t) t.innerHTML = '<div>انتهت العروض</div>';
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const d = document.getElementById('days'); if (d) d.textContent = String(days).padStart(2,'0');
    const h = document.getElementById('hours'); if (h) h.textContent = String(hours).padStart(2,'0');
    const m = document.getElementById('minutes'); if (m) m.textContent = String(minutes).padStart(2,'0');
    const s = document.getElementById('seconds'); if (s) s.textContent = String(seconds).padStart(2,'0');
  }

  updateTimer();
  offerTimerIntervalId = setInterval(updateTimer, 1000);
}


/* ========================================
   🔔 Alerts
   ======================================== */
function showAlert(message, type='success'){
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
    <span>${escapeHtml(message)}</span>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 118px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'success' ? 'linear-gradient(135deg, var(--accent), var(--accent-light))' : 'linear-gradient(135deg, var(--danger), var(--danger-dark))'};
    color: white;
    padding: 1rem 1.3rem;
    border-radius: 14px;
    box-shadow: 0 18px 40px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    z-index: 3000;
    max-width: 92%;
    width: max-content;
    font-weight: 900;
  `;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(-50%) translateY(-10px)';
    notification.style.transition = 'all .25s ease';
    setTimeout(() => notification.remove(), 250);
  }, 2600);
}

/* ========================================
   ✨ تحسينات UX متقدمة
   ======================================== */

// 1. سوإيب للتصنيفات
function initCategorySwipe() {
  const categoryNav = document.querySelector('.category-nav');
  if (!categoryNav) return;

  let startX = 0;
  let scrollLeft = 0;
  let isDragging = false;

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
    const walk = (x - startX) * 2;
    categoryNav.scrollLeft = scrollLeft - walk;
  });

  ['mouseup', 'mouseleave'].forEach(evt => {
    categoryNav.addEventListener(evt, () => {
      isDragging = false;
      categoryNav.style.cursor = 'grab';
      categoryNav.style.userSelect = 'auto';
    });
  });

  // للموبايل (لمس)
  categoryNav.addEventListener('touchstart', (e) => {
    startX = e.touches[0].pageX;
    scrollLeft = categoryNav.scrollLeft;
  });

  categoryNav.addEventListener('touchmove', (e) => {
    const x = e.touches[0].pageX;
    const walk = (x - startX) * 2;
    categoryNav.scrollLeft = scrollLeft - walk;
  });
}

// 2. تحميل صور أفضل
function enhanceProductImages() {
  const images = document.querySelectorAll('.product-image');
  images.forEach(img => {
    // إضافة تأثير تحميل
    if (!img.complete) {
      img.style.opacity = '0';
      img.addEventListener('load', () => {
        img.style.transition = 'opacity 0.5s ease';
        img.style.opacity = '1';
      });
    }
  });
}

// 3. تأثيرات تفاعلية للكروت
function addProductCardEffects() {
  const cards = document.querySelectorAll('.product-card');
  cards.forEach(card => {
    card.addEventListener('touchstart', () => {
      card.style.transform = 'scale(0.98)';
    });
    
    card.addEventListener('touchend', () => {
      card.style.transform = '';
    });
  });
}

// 4. إضافة زر العودة للأعلى
function addScrollToTop() {
  const btn = document.createElement('button');
  btn.id = 'scrollToTop';
  btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--gold), var(--accent));
    color: white;
    border: none;
    box-shadow: 0 5px 20px rgba(0,0,0,0.2);
    cursor: pointer;
    z-index: 1000;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    transition: all 0.3s ease;
  `;
  
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  document.body.appendChild(btn);
  
  window.addEventListener('scroll', () => {
    btn.style.display = window.scrollY > 500 ? 'flex' : 'none';
  });
}



/* ========================================
   🧼 Escape helpers
   ======================================== */
function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
function escapeAttr(s){
  return escapeHtml(s).replaceAll('"','&quot;');
}
// في نهاية ملف app.js أضف هذا الكود:

/* ========================================
   تحسينات UX للجوال
   ======================================== */

// 1. إضافة تأثير السحب للتصنيفات
function initSwipeCategories() {
  const categoryNav = document.querySelector('.category-nav');
  if (!categoryNav) return;

  let isDragging = false;
  let startX = 0;
  let scrollLeft = 0;

  // للماوس
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

  // للمس
  categoryNav.addEventListener('touchstart', (e) => {
    startX = e.touches[0].pageX;
    scrollLeft = categoryNav.scrollLeft;
  });

  categoryNav.addEventListener('touchmove', (e) => {
    const x = e.touches[0].pageX;
    const walk = (x - startX) * 1.5;
    categoryNav.scrollLeft = scrollLeft - walk;
  });
}

// 2. تحسين القائمة الجانبية
function initMobileMenu() {
  const mobileToggle = document.getElementById('mobileToggle');
  const navMenu = document.getElementById('navMenu');
  
  if (!mobileToggle || !navMenu) return;

  mobileToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    navMenu.classList.toggle('active');
    this.innerHTML = navMenu.classList.contains('active') 
      ? '<i class="fas fa-times"></i>' 
      : '<i class="fas fa-bars"></i>';
  });

  // إغلاق القائمة عند النقر خارجها
  document.addEventListener('click', (e) => {
    if (navMenu.classList.contains('active') && 
        !navMenu.contains(e.target) && 
        !mobileToggle.contains(e.target)) {
      navMenu.classList.remove('active');
      mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
    }
  });

  // إغلاق القائمة عند النقر على رابط
  document.querySelectorAll('#navMenu .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('active');
      mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
    });
  });
}

// 3. تحسين تحميل الصور
function lazyLoadImages() {
  const images = document.querySelectorAll('.product-image');
  
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
        }
        imageObserver.unobserve(img);
      }
    });
  }, {
    rootMargin: '100px'
  });

  images.forEach(img => imageObserver.observe(img));
}


