 console.log("APP VERSION: 20251230-1");
/* =========================
   CONFIG
========================= */

const API_URL = "https://api.aldeebtech.de/exec";   // nur /exec (storecontroller AUS)
const CDN_DATA_BASE = "/data";                      // optional: /data/<slug>.json (wenn du es später nutzt)

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CDN_BUNDLE_MAX_AGE_MS = 365 * ONE_DAY_MS;

const CACHE_PREFIX = "store_cache_v2";
const CACHE_TTL_MS = 60 * 1000; // 60 Sekunden

const CLOUDINARY_CLOUD_NAME = 'dt2strsjh';


/* =========================
   GLOBAL STATE
========================= */

let STORE_SLUG = "";

let currentPage = "home";
let activeCategory = "الكل";

let STORE_DATA = {};
let CURRENCY = "€";

let categoriesData = [];
let productsData = [];

let cart = [];

/* =========================
   HELPERS
========================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return (str ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("`", "&#096;");
}

function sanitizeImgUrl(url) {
  const u = (url || "").toString().trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return "";
}

function normalizeImageUrl(rawUrl) {
  const u = (rawUrl || "").toString().trim();
  if (!u) return "";
  if (!(u.startsWith("http://") || u.startsWith("https://"))) return "";

  const m1 = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1?.[1]) return `https://drive.google.com/uc?export=view&id=${m1[1]}`;

  const m2 = u.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m2?.[1]) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;

  const mAny = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (mAny?.[1]) return `https://drive.google.com/uc?export=view&id=${mAny[1]}`;

  return u;
}

/* =========================
   SLUG RESOLUTION
========================= */

function looksLikeLatinSlug(s) {
  return /^[a-z0-9-]+$/i.test(s);
}

function getRawStoreSegment() {
  // Normal: /s/<slug>
  const parts = window.location.pathname.split("/");
  if (parts[1] === "s" && parts[2]) return decodeURIComponent(parts[2]);

  // SPA fallback: ?__path=/s/<slug>
  const params = new URLSearchParams(window.location.search);
  const p = params.get("__path");
  if (p) {
    const ps = p.split("/");
    if (ps[1] === "s" && ps[2]) return decodeURIComponent(ps[2]);
  }
  return "";
}

async function initStoreSlug() {
  const raw = getRawStoreSegment();
  if (!raw) throw new Error("missing_slug");

  // schon ein normaler Slug
  if (looksLikeLatinSlug(raw)) return raw;

  // arabischer Name -> resolveSlug
  const res = await fetch(`${API_URL}?type=resolveSlug&name=${encodeURIComponent(raw)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  if (!json.success || !json.slug) throw new Error("store_not_found");

  // URL kanonisch machen
  history.replaceState(null, "", `/s/${json.slug}`);
  return json.slug;
}

/* =========================
   CACHE (LocalStorage)
========================= */

// Füge diese Funktionen zu deiner app.js hinzu:

function addToCartWithGoldEffect(productId) {
  const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
  
  if (productCard) {
    // Goldener Glow-Effekt
    productCard.classList.add('adding');
    
    // Nach der Animation zurücksetzen
    setTimeout(() => {
      productCard.classList.remove('adding');
      productCard.classList.add('added');
    }, 500);
    
    // Nach 2 Sekunden den "added"-Status entfernen
    setTimeout(() => {
      productCard.classList.remove('added');
    }, 2000);
  }
  
  // Originale addToCart Funktion aufrufen
  addToCart(productId);
}

// Initialisiere Overlay Buttons
function initializeOverlayButtons() {
  document.querySelectorAll('.product-card').forEach(card => {
    const productId = card.dataset.productId;
    const imageContainer = card.querySelector('.product-image-container');
    
    if (imageContainer && !card.querySelector('.add-btn-overlay')) {
      const overlayBtn = document.createElement('button');
      overlayBtn.className = 'add-btn-overlay';
      overlayBtn.innerHTML = '<i class="fas fa-cart-plus"></i> Hinzufügen';
      overlayBtn.onclick = function(e) {
        e.stopPropagation();
        addToCartWithGoldEffect(productId);
      };
      
      imageContainer.appendChild(overlayBtn);
    }
  });
}

// Verknüpfe die Kategorie-Filter
function initializeCategories() {
  // Dies ist ein Beispiel - passe es an deine Daten an
  const categories = [
    { id: 'all', name: 'Alle', icon: 'fas fa-border-all' },
    { id: 'offers', name: 'Angebote', icon: 'fas fa-percentage' },
    { id: 'category1', name: 'Elektronik', icon: 'fas fa-laptop' },
    { id: 'category2', name: 'Kleidung', icon: 'fas fa-tshirt' },
    { id: 'category3', name: 'Haushalt', icon: 'fas fa-home' }
  ];
  
  const categoryNav = document.querySelector('.category-nav');
  if (categoryNav) {
    categoryNav.innerHTML = categories.map(cat => `
      <button class="cat-btn ${cat.id === 'all' ? 'active' : ''}" 
              data-category="${cat.id}">
        <i class="${cat.icon}"></i>
        <span>${cat.name}</span>
      </button>
    `).join('');
  }
}

// Initialisiere alles nach dem Laden
document.addEventListener('DOMContentLoaded', function() {
  initializeCategories();
  initializeOverlayButtons();
  
  // Kategorie Filter Event Listener
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const category = this.dataset.category;
      filterProductsByCategory(category);
      
      // Aktiven Button markieren
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });
});

function cacheKey(key) {
  return `${CACHE_PREFIX}:${STORE_SLUG}:${key}`;
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify({ ts: Date.now(), value }));
  } catch {}
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts) return null;
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return obj.value ?? null;
  } catch {
    return null;
  }
}

/* =========================
   FETCH JSON (robust)
========================= */

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { Accept: "application/json", ...(opts.headers || {}) },
  });

  if (!res.ok) return { ok: false, status: res.status, json: null };

  try {
    return { ok: true, status: res.status, json: await res.json() };
  } catch {
    return { ok: false, status: res.status, json: null };
  }
}

/* =========================
   CDN BUNDLE (optional)
========================= */

function getCdnBundleUrl() {
  return `${CDN_DATA_BASE}/${encodeURIComponent(STORE_SLUG)}.json`;
}

async function loadPublicBundleFromCDN() {
  try {
    const { ok, json } = await fetchJson(getCdnBundleUrl(), { cache: "no-store" });
    if (!ok || !json) return null;

    // staleness check (optional)
    const gen =
      json?.meta?.generatedAt ||
      json?.meta?.generated_at ||
      json?.generatedAt ||
      json?.generated_at ||
      null;

    if (gen) {
      const t = Date.parse(gen);
      if (!Number.isNaN(t) && Date.now() - t > CDN_BUNDLE_MAX_AGE_MS) return null;
    }

    return json;
  } catch {
    return null;
  }
}

/* =========================
   API (only /exec)
========================= */

async function apiGet(type) {
  const url = `${API_URL}?type=${encodeURIComponent(type)}&slug=${encodeURIComponent(
    STORE_SLUG
  )}&_ts=${Date.now()}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  if (!json.success) throw new Error(json.message || json.error || `API ${type} failed`);
  return json;
}

/* =========================
   PUBLIC BUNDLE (ONE CALL)
========================= */

async function loadPublicBundle() {
  const qs = new URLSearchParams(window.location.search);
  const forceFresh = qs.has("fresh") || qs.has("nocache") || qs.get("fresh") === "1" || qs.get("nocache") === "1";

  if (!forceFresh) {
    const cached = cacheGet("publicBundle");
    if (cached && typeof cached === "object") return cached;
  }

  const json = await apiGet("publicBundle");
  cacheSet("publicBundle", json);
  return json;
}

/**
 * Accepts either:
 *  - publicBundle format: { success:true, store, customerMessage, categories, products }
 *  - older bundle format (if you later add CDN JSON): { storeConfig, customerMessage, categories, products, websiteActive }
 */
function applyAnyBundle(bundleJson) {
  if (!bundleJson || typeof bundleJson !== "object") return false;

  // If it's publicBundle
  if (bundleJson.store) return applyPublicBundle(bundleJson);

  // If it's old-style bundle
  const store = bundleJson.storeConfig || bundleJson.store_config || {};
  const products = Array.isArray(bundleJson.products) ? bundleJson.products : [];
  const categories = Array.isArray(bundleJson.categories) ? bundleJson.categories : [];
  const msg = (bundleJson.customerMessage || bundleJson.customer_message || "").toString().trim();

  const activeFlag = bundleJson.websiteActive ?? bundleJson.website_active ?? store.website_active ?? true;
  if (activeFlag === false) {
    applyStoreInactiveUI();
    return true;
  }
  restoreStoreUIIfNeeded();

  STORE_DATA = store;
  CURRENCY = (STORE_DATA.currency || bundleJson.currency || "€").toString().trim() || "€";
  applyStoreConfig();
  applyCustomerMessage(msg);

  categoriesData = categories;
  productsData = products;

  const loadingEl = $("loading");
  if (loadingEl) loadingEl.style.display = "none";

  renderCategories(productsData);
  renderAllProducts(productsData);
  renderOfferProducts();
  return true;
}

function applyPublicBundle(bundleJson) {
  const store = bundleJson.store || {};
  const products = Array.isArray(bundleJson.products) ? bundleJson.products : [];
  const categories = Array.isArray(bundleJson.categories) ? bundleJson.categories : [];
  const msg = (bundleJson.customerMessage || "").toString().trim();

  if (store.website_active === false) {
    applyStoreInactiveUI();
    return true;
  }
  restoreStoreUIIfNeeded();

  STORE_DATA = store;
  CURRENCY = (STORE_DATA.currency || "€").toString().trim() || "€";
  applyStoreConfig();

  applyCustomerMessage(msg);

  categoriesData = categories;
  productsData = products;

  const loadingEl = $("loading");
  if (loadingEl) loadingEl.style.display = "none";

  renderCategories(productsData);
  renderAllProducts(productsData);
  renderOfferProducts();

  return true;
}

/* =========================
   UI: Inactive / Restore
========================= */

function applyStoreInactiveUI() {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));

  const loading = $("loading");
  if (loading) {
    loading.style.display = "block";
    loading.innerHTML = `
      <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">
        هذا المتجر غير متاح حالياً.
      </div>`;
  }
}

function restoreStoreUIIfNeeded() {
  // nothing special; render/apply will hide loading later
}

/* =========================
   STORE CONFIG -> DOM
========================= */

function applyStoreConfig() {
  const setText = (id, val) => {
    const el = $(id);
    if (el) el.textContent = (val ?? "").toString();
  };

  CURRENCY = (STORE_DATA.currency || "").toString().trim() || "€";

  const storeName = STORE_DATA.store_name || "متجر";
  const storeDesc = STORE_DATA.page_description || "متجر إلكتروني متكامل";

  setText("store-name", storeName);
    document.title = `${storeName} | متجر`;

  setText("store-subtitle", storeDesc);

  setText("store-phone", STORE_DATA.phone || "غير متوفر");

  // About
  setText("about-phone", STORE_DATA.phone || "غير متوفر");
  setText("about-whatsapp", STORE_DATA.whatsapp || STORE_DATA.phone || "غير متوفر");
  setText("about-email", STORE_DATA.email || "غير متوفر");
  setText("about-hours", STORE_DATA.working_hours || "24/7");
  setText("about-address", STORE_DATA.address || "غير متوفر");
  setText("about-currency", CURRENCY);

  const shippingEnabled =
    STORE_DATA.shipping === true ||
    (typeof STORE_DATA.shipping === "string" && STORE_DATA.shipping.toLowerCase() === "true") ||
    STORE_DATA.shipping === 1;

  const shippingPriceNum = parseFloat(STORE_DATA.shipping_price || "0") || 0;

  const shippingText = shippingEnabled
    ? shippingPriceNum > 0
      ? `شحن بمبلغ ${shippingPriceNum.toFixed(2)} ${CURRENCY}`
      : "شحن مجاني"
    : "لا يتوفر شحن";

  setText("about-shipping", shippingText);

  // Contact
  setText("contact-phone-text", STORE_DATA.phone || "غير متوفر");
  setText("contact-whatsapp-text", STORE_DATA.whatsapp || STORE_DATA.phone || "غير متوفر");
  setText("contact-email-text", STORE_DATA.email || "غير متوفر");
  setText("contact-address-text", STORE_DATA.address || "غير متوفر");
  setText("working-hours-weekdays", STORE_DATA.working_hours || "24/7");
  setText("working-hours-delivery", shippingText);
  setText("contact-currency", CURRENCY);

  // Footer
  setText("footer-phone", STORE_DATA.phone || "غير متوفر");
  setText("footer-whatsapp", STORE_DATA.whatsapp || STORE_DATA.phone || "غير متوفر");
  setText("footer-email", STORE_DATA.email || "غير متوفر");
  setText("footer-address", STORE_DATA.address || "غير متوفر");
  setText("footer-hours", STORE_DATA.working_hours || "24/7");
  setText("footer-shipping", shippingText);
  setText("footer-currency", CURRENCY);


  // Click-to-call / mailto links (mobile friendly)
  const setHref = (id, href) => {
    const el = $(id);
    if (!el) return;
    if (href) {
      el.setAttribute("href", href);
      el.style.pointerEvents = "auto";
    } else {
      el.removeAttribute("href");
    }
  };

  const phoneRaw = (STORE_DATA.phone || "").toString().trim();
  const tel = normalizePhoneForTel(phoneRaw);
  const emailRaw = (STORE_DATA.email || "").toString().trim();
  const wa = normalizePhoneForWhatsApp(STORE_DATA.whatsapp || STORE_DATA.phone || "");

  if (tel) {
    setHref("store-phone-link", `tel:${tel}`);
    setHref("about-phone-link", `tel:${tel}`);
    setHref("contact-phone-link", `tel:${tel}`);
    setHref("footer-phone-link", `tel:${tel}`);
  }

  if (emailRaw) {
    setHref("about-email-link", `mailto:${emailRaw}`);
    setHref("contact-email-link", `mailto:${emailRaw}`);
    setHref("footer-email-link", `mailto:${emailRaw}`);
  }

  if (wa) {
    setHref("footer-whatsapp-link", `https://wa.me/${wa}`);
  }

  try {
    setupSocialLinks();
  } catch {}

  try {
    applyMapsFromAddress(STORE_DATA.address || "");
  } catch {}
}


function dedupeWhatsAppFab() {
  const nodes = document.querySelectorAll(".whatsapp-fab");
  nodes.forEach((n, idx) => {
    if (idx > 0) n.remove();
  });
}
window.addEventListener("pageshow", dedupeWhatsAppFab);


/* =========================
   Announcement
========================= */

function applyCustomerMessage(msg) {
  const m = (msg || "").toString().trim();
  STORE_DATA.message = m;

  const bar = $("announcement-bar");
  const text = $("announcement-text");
  if (!bar || !text) return;

  if (m) {
    bar.style.display = "block";
    text.textContent = m;
  } else {
    bar.style.display = "none";
    text.textContent = "";
  }

  try { document.body.classList.toggle('has-announcement', !!m); } catch {}
}

/* =========================
   Social Links
========================= */

function setupSocialLinks() {
  const socialLinksContainer = $("social-links");
  const footerSocialLinks = $("footer-social-links");
  if (!socialLinksContainer || !footerSocialLinks) return;

  const links = [];

  const add = (type, url, icon) => {
    const u = (url || "").toString().trim();
    if (!u) return;
    links.push({ type, url: u, icon });
  };

  add("facebook", STORE_DATA.facebook, "fab fa-facebook-f");
  add("instagram", STORE_DATA.instagram, "fab fa-instagram");
  add("tiktok", STORE_DATA.tiktok, "fab fa-tiktok");

  const makeHTML = () =>
    links
      .map(
        (l) =>
          `<a href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer"><i class="${l.icon}"></i></a>`
      )
      .join("");

  socialLinksContainer.innerHTML = makeHTML();
  footerSocialLinks.innerHTML = makeHTML();
}

/* =========================
   Maps
========================= */

function applyMapsFromAddress(address) {
  const a = (address || "").toString().trim();

  const aboutWrap = document.getElementById("about-map-wrap");
  const aboutMap = document.getElementById("about-map");
  const aboutHint = document.getElementById("about-map-hint");

  const contactWrap = document.getElementById("contact-map-wrap");
  const contactMap = document.getElementById("contact-map");
  const contactHint = document.getElementById("contact-map-hint");

  if (!a) {
    if (aboutWrap) aboutWrap.style.display = "none";
    if (contactWrap) contactWrap.style.display = "none";
    if (aboutHint) aboutHint.textContent = "";
    if (contactHint) contactHint.textContent = "";
    return;
  }

  const q = encodeURIComponent(a);
  const src = `https://www.google.com/maps?q=${q}&output=embed`;

  if (aboutWrap && aboutMap) {
    aboutWrap.style.display = "block";
    aboutMap.src = src;
    if (aboutHint) aboutHint.textContent = "";
  }

  if (contactWrap && contactMap) {
    contactWrap.style.display = "block";
    contactMap.src = src;
    if (contactHint) contactHint.textContent = "";
  }
}

/* =========================
   NAVIGATION
========================= */

function initNavigation() {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const page = this.getAttribute("data-page");
      if (page) navigateToPage(page);
    });
  });

  document.querySelectorAll("footer a[data-page]").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const page = this.getAttribute("data-page");
      if (page) navigateToPage(page);
    });
  });

  const mobileToggle = $("mobileToggle");
  const navMenu = $("navMenu");

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      navMenu.classList.toggle("active");
      this.innerHTML = navMenu.classList.contains("active")
        ? '<i class="fas fa-times"></i>'
        : '<i class="fas fa-bars"></i>';
    });

    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        navMenu.classList.remove("active");
        mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
      });
    });

    document.addEventListener("click", (e) => {
      if (!navMenu.classList.contains("active")) return;
      if (navMenu.contains(e.target)) return;
      if (mobileToggle.contains(e.target)) return;
      navMenu.classList.remove("active");
      mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
    });
  }
}

function navigateToPage(page) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("data-page") === page);
  });

  currentPage = page;
  showPage(page);

  if (page === "offers") renderOfferProducts();
}

function showPage(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const el = $(`${page}-page`);
  if (el) el.classList.add("active");
  closeCart();
}

/* =========================
   CATEGORY SWIPE + UX
========================= */

function initSwipeCategories() {
  const categoryNav = $("category-nav") || document.querySelector(".category-nav");
  if (!categoryNav) return;
  categoryNav.classList.add("category-nav");

  let isDragging = false;
  let startX = 0;
  let scrollLeft = 0;

  categoryNav.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.pageX - categoryNav.offsetLeft;
    scrollLeft = categoryNav.scrollLeft;
    categoryNav.style.cursor = "grabbing";
    categoryNav.style.userSelect = "none";
  });

  categoryNav.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - categoryNav.offsetLeft;
    const walk = (x - startX) * 1.5;
    categoryNav.scrollLeft = scrollLeft - walk;
  });

  ["mouseup", "mouseleave"].forEach((evt) => {
    categoryNav.addEventListener(evt, () => {
      isDragging = false;
      categoryNav.style.cursor = "grab";
      categoryNav.style.userSelect = "auto";
    });
  });

  categoryNav.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].pageX;
      scrollLeft = categoryNav.scrollLeft;
    },
    { passive: true }
  );

  categoryNav.addEventListener(
    "touchmove",
    (e) => {
      const x = e.touches[0].pageX;
      const walk = (x - startX) * 1.5;
      categoryNav.scrollLeft = scrollLeft - walk;
    },
    { passive: true }
  );
}

function initUXEnhancements() {
  initSwipeCategories();
  enhanceProductImages();
}

function enhanceProductImages() {
  document.querySelectorAll(".product-image").forEach((img) => {
    img.addEventListener("click", () => {
      const src = img.getAttribute("src");
      if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
        window.open(src, "_blank", "noopener");
      }
    });
  });
}

/* =========================
   PRODUCTS: rules
========================= */

function isProductActive(p) {
  const v = p?.product_active;
  if (v === false) return false;
  if (typeof v === "string") return v.toLowerCase() !== "false" && v !== "0";
  return true;
}

function hasOffer(p) {
  const v = p?.has_offer;
  if (v === true) return true;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
}

function isOfferActive(p) {
  const v = p?.offer_aktive ?? p?.offer_active ?? true;
  if (v === false) return false;
  if (typeof v === "string") return v !== "0" && v.toLowerCase() !== "false";

  const start = p?.offer_start_date ? Date.parse(p.offer_start_date) : NaN;
  const end = p?.offer_end_date ? Date.parse(p.offer_end_date) : NaN;
  const now = Date.now();

  if (!Number.isNaN(start) && now < start) return false;
  if (!Number.isNaN(end) && now > end) return false;

  return true;
}

function calculatePrice(p) {
  const price = Number(p?.price || 0);

  const hasDiscount =
    hasOffer(p) &&
    (p.offer_type === "percent" || p.offer_type === "percentage") &&
    Number(p.percent) > 0;

  const hasBundle =
    hasOffer(p) &&
    p.offer_type === "bundle" &&
    Number(p.bundle_qty) > 0 &&
    Number(p.bundle_price) > 0;

  if (hasDiscount) {
    const percent = Math.max(0, Math.min(100, Number(p.percent)));
    const finalPrice = price * (1 - percent / 100);
    return {
      originalPrice: price,
      finalPrice,
      hasDiscount: true,
      discountPercent: percent,
      hasBundle: false,
      bundleInfo: null,
      bundleText: "",
    };
  }

  if (hasBundle) {
  const qty = Number(p.bundle_qty);           // z.B. 3
  const bundlePrice = Number(p.bundle_price); // z.B. 6
  const unitPrice = price;                    // Normalpreis pro Stück

  // Wie viele Stück werden effektiv bezahlt? (z.B. 6 / 3 = 2)
  const payQtyGuess = Math.round(bundlePrice / unitPrice);

  // Fallback (klassisch, arabisch wie bei dir vorher)
  let bundleText = `${qty} بـ ${bundlePrice.toFixed(2)} ${CURRENCY}`;
  let bundleBadge = `${qty}/${bundlePrice.toFixed(0)}`;

  // Wenn es "zum Preis von X" ist:
  if (
    payQtyGuess >= 1 &&
    payQtyGuess < qty &&
    Math.abs(bundlePrice - payQtyGuess * unitPrice) < 0.1
  ) {
    bundleText = `اشتري ${payQtyGuess} وخذ ${qty}`;        // "Pay X, get Y"
    bundleBadge = `${qty} بسعر ${payQtyGuess}`;           // kurz fürs Badge
  }

  return {
    originalPrice: price,
    finalPrice: unitPrice,
    hasDiscount: false,
    discountPercent: 0,
    hasBundle: true,
    bundleInfo: {
      qty,
      bundlePrice,
      unitPrice: bundlePrice / qty
    },
    bundleText,
    bundleBadge
  };
}



  return {
    originalPrice: price,
    finalPrice: price,
    hasDiscount: false,
    discountPercent: 0,
    hasBundle: false,
    bundleInfo: null,
    bundleText: "",
  };
}

/* =========================
   PRODUCT IMAGE
========================= */


function productImageHTML(p, opts = {}) {
  const { priority = false, w = 720, h = 720 } = opts;

  const normalized = normalizeImageUrl(p?.image);
  const safeUrl = sanitizeImgUrl(normalized);

  if (!safeUrl) {
    return `
      <div class="placeholder-image">
        <div class="ph">Beispielbild<br><small>صورة توضيحية</small></div>
      </div>`;
  }
  // HIER Cloudinary anwenden
    const optimizedUrl = toOptimizedImageUrl(
    safeUrl,
    window.innerWidth <= 992 ? 700 : 1100
  );


  // ✅ src VOR dem return berechnen
  const src = toOptimizedImageUrl(safeUrl, w);

  return `
    <img
      src="${escapeAttr(optimizedUrl)}"
      class="product-image"
      alt="${escapeHtml(p?.name || "")}"
      width="${w}"
      height="${h}"
      loading="${priority ? "eager" : "lazy"}"
      fetchpriority="${priority ? "high" : "low"}"
      decoding="async"
      referrerpolicy="no-referrer"
      onerror="this.style.display='none'; if(this.nextElementSibling){this.nextElementSibling.style.display='flex';}"
    />
    <div class="placeholder-image" style="display:none">
      <div class="ph">Beispielbild<br><small>صورة توضيحية</small></div>
    </div>`;
}

function cloudinaryFetchUrl(sourceUrl, { w = 700 } = {}) {
  if (!CLOUDINARY_CLOUD_NAME || !sourceUrl) return sourceUrl;
  const encoded = encodeURIComponent(sourceUrl);
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/f_auto,q_auto,w_${w}/${encoded}`;
}

function toOptimizedImageUrl(remoteUrl, w = 720) {
  const u = sanitizeImgUrl(remoteUrl);
  if (!u) return "";
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === "DEIN_CLOUD_NAME") return u;

  // f_auto/q_auto liefert WebP/AVIF + sinnvolle Kompression
  const base = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch`;
  return `${base}/f_auto,q_auto,w_${w},c_fill/${encodeURIComponent(u)}`;
}

/* =========================
   RENDER: Categories & Products
========================= */



function renderCategories(products) {
  const nav = $("category-nav");
  if (!nav) return;

  nav.classList.add("category-nav");

  const rawCats = (Array.isArray(products) ? products : [])
    .map((p) => (p.category || "").toString().trim())
    .filter(Boolean);

  const unique = Array.isArray(categoriesData) && categoriesData.length > 0 ? categoriesData : [...new Set(rawCats)];

  if (unique.length === 0) {
    nav.style.display = "none";
    return;
  }

  nav.style.display = "flex";
  nav.innerHTML = "";

  const mkBtn = (label, icon, isActive, onClick) => {
    const b = document.createElement("button");
    b.className = `cat-btn ${isActive ? "active" : ""}`;
    b.innerHTML = `<i class="${icon}"></i> ${escapeHtml(label)}`;
    b.addEventListener("click", onClick);
    return b;
  };

  nav.appendChild(mkBtn("الكل", "fas fa-th-large", activeCategory === "الكل", () => filterProducts("الكل")));

  unique.forEach((cat) => {
    nav.appendChild(mkBtn(cat, "fas fa-tag", activeCategory === cat, () => filterProducts(cat)));
  });
}

function filterProducts(category) {
  activeCategory = category;

  const nav = $("category-nav");
  if (nav) {
    nav.querySelectorAll(".cat-btn").forEach((btn) => btn.classList.remove("active"));
    nav.querySelectorAll(".cat-btn").forEach((btn) => {
      if (btn.textContent.trim().includes(category)) btn.classList.add("active");
      if (category === "الكل" && btn.textContent.trim().includes("الكل")) btn.classList.add("active");
    });
  }

  renderAllProducts(productsData);
}

function renderAllProducts(products) {
  const filtered =
    activeCategory === "الكل"
      ? Array.isArray(products)
        ? products
        : []
      : (Array.isArray(products) ? products : []).filter(
          (p) => ((p.category || "").toString().trim() === activeCategory)
        );

  const activeProducts = [];
  const inactiveProducts = [];

  filtered.forEach((p) => (isProductActive(p) ? activeProducts : inactiveProducts).push(p));

  renderGrid("products-grid", activeProducts, false);

  const inactiveSection = $("inactive-section");
  const inactiveToggle = $("inactive-toggle");
  if (!inactiveSection || !inactiveToggle) return;

  if (inactiveProducts.length > 0) {
    inactiveToggle.style.display = "block";
    renderGrid("inactive-grid", inactiveProducts, true);
  } else {
    inactiveToggle.style.display = "none";
    inactiveSection.style.display = "none";
  }
}

function renderGrid(containerId, products, isInactive) {
  const grid = $(containerId);
  if (!grid) return;

  const list = Array.isArray(products) ? products : [];

  if (list.length === 0 && !isInactive) {
    grid.innerHTML =
      '<div class="empty-state" style="text-align:center; padding:3rem; color:var(--muted); grid-column:1 / -1;">' +
      '<i class="fas fa-box-open" style="font-size:3rem;color:rgba(122,135,151,.25)"></i>' +
      '<h3 style="margin-top:1rem; font-weight:900;">لا توجد منتجات</h3>' +
      "<p>لا توجد منتجات نشطة في هذا القسم حالياً</p>" +
      "</div>";
    return;
  }

  if (list.length === 0 && isInactive) {
    grid.innerHTML = "";
    return;
  }

  const isMobile = window.innerWidth <= 992;
  let html = "";
// ALT:
// for (const p of list) {

for (let i = 0; i < list.length; i++) {
  const p = list[i];

  const pricing = calculatePrice(p);
  const active = isProductActive(p) && !isInactive;

  // ✅ Die ersten 1–2 sichtbaren Karten bekommen Bild-Priorität (nicht lazy)
  // Wenn du ganz sicher gehen willst: nur bei "active" priorisieren
  const priorityImg = !isInactive && i < 2;

  let priceHTML = "";
  let badgeHTML = "";

  if (pricing.hasDiscount) {
    priceHTML = `
      <div class="price-wrapper">
        <span class="price-old">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
        <span class="price-new discount">${pricing.finalPrice.toFixed(2)} ${CURRENCY}</span>
      </div>`;
    badgeHTML = `<div class="discount-badge">${isMobile ? `${pricing.discountPercent}%` : `خصم ${pricing.discountPercent}%`}</div>`;
  } else if (pricing.hasBundle) {
    priceHTML = `
      <div class="price-wrapper">
        <span class="price-old">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
        <span class="price-new bundle">${pricing.bundleInfo.unitPrice.toFixed(2)} ${CURRENCY}</span>
      </div>`;
    badgeHTML = `<div class="bundle-badge">
     ${isMobile ? (pricing.bundleBadge || pricing.bundleText) : pricing.bundleText}
     </div>`;

  } else {
    priceHTML = `
      <div class="price-wrapper">
        <span class="price-new">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
      </div>`;
  }

  // ... dein restlicher Card-HTML bleibt gleich,
  // nur beim Bild rufst du productImageHTML so auf:



    const cardClass = active ? "product-card" : "product-card inactive";
    const inactiveBadge = !active ? '<div class="inactive-badge">غير متوفر</div>' : "";

    const btnState = active ? "" : "disabled";
    const btnText = active ? (isMobile ? "أضف" : "أضف للسلة") : isMobile ? "نفذ" : "نفذت الكمية";
    const btnIcon = active ? "fa-plus" : "fa-times";
    const btnClick = active ? `onclick="addToCart('${escapeAttr(p.id)}', this)"` : "";

    const sizeValue = (p.sizevalue || "").toString().trim();
    const sizeUnit = (p.sizeunit || "").toString().trim();
    const sizeDisplay =
      !isMobile && sizeValue && sizeUnit
        ? `<div class="product-size"><i class="fas fa-weight-hanging"></i> الحجم: ${escapeHtml(sizeValue)} ${escapeHtml(sizeUnit)}</div>`
        : "";

    const bundleInfoHTML =
      !isMobile && pricing.hasBundle ? `<div class="bundle-info">عرض حزمة: ${pricing.bundleText}</div>` : "";

    const descToggleHTML = !isMobile
      ? `<span class="desc-toggle" onclick="toggleDescription(this, '${escapeAttr(p.id)}')"><i class="fas fa-chevron-down"></i></span>`
      : "";

    html += `
      <div class="${cardClass}">
        <div class="product-image-container">
          ${productImageHTML(p, { priority: priorityImg })}
          <div class="product-badges">
            ${badgeHTML}
            ${inactiveBadge}
          </div>
        </div>

        <div class="product-info">
          <h3 class="product-title" ${!isMobile ? `onclick="toggleDescription(this, '${escapeAttr(p.id)}')"` : ""}>
            ${escapeHtml(p.name || "")}
            ${descToggleHTML}
          </h3>
          ${sizeDisplay}
          <p class="product-desc">${escapeHtml(p.description || "")}</p>
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

function toggleDescription(el) {
  const card = el?.closest?.(".product-card");
  if (!card) return;
  card.classList.toggle("desc-open");
}

/* =========================
   OFFERS
========================= */

function renderOfferProducts() {
  const offersGrid = $("offers-grid");
  const noOffers = $("no-offers");
  if (!offersGrid || !noOffers) return;

  const list = Array.isArray(productsData) ? productsData : [];
  if (list.length === 0) {
    offersGrid.innerHTML = "";
    noOffers.style.display = "block";
    return;
  }

  const offerProducts = list.filter((p) => isProductActive(p) && hasOffer(p) && isOfferActive(p));
  if (offerProducts.length === 0) {
    offersGrid.innerHTML = "";
    noOffers.style.display = "block";
    return;
  }

  noOffers.style.display = "none";

  const isMobile = window.innerWidth <= 992;
  let html = "";

  for (const p of offerProducts) {
    const pricing = calculatePrice(p);

    let priceHTML = "";
    let badgeHTML = "";

    if (pricing.hasDiscount) {
      priceHTML = `
        <div class="price-wrapper">
          <span class="price-old">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
          <span class="price-new discount">${pricing.finalPrice.toFixed(2)} ${CURRENCY}</span>
        </div>`;
      badgeHTML = `<div class="discount-badge">${isMobile ? `${pricing.discountPercent}%` : `خصم ${pricing.discountPercent}%`}</div>`;
} else if (pricing.hasBundle) {
  priceHTML = `
    <div class="price-wrapper">
      <span class="price-old">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
      <span class="price-new bundle">${pricing.bundleInfo.unitPrice.toFixed(2)} ${CURRENCY}</span>
    </div>`;
  badgeHTML = `<div class="bundle-badge">
    ${isMobile ? (pricing.bundleBadge || pricing.bundleText) : pricing.bundleText}
  </div>`;

} else {
  priceHTML = `
    <div class="price-wrapper">
      <span class="price-new">${pricing.originalPrice.toFixed(2)} ${CURRENCY}</span>
    </div>`;
  badgeHTML = "";   // ✅ kein Angebot -> kein Badge
}


    const sizeValue = (p.sizevalue || "").toString().trim();
    const sizeUnit = (p.sizeunit || "").toString().trim();
    const sizeDisplay =
      !isMobile && sizeValue && sizeUnit
        ? `<div class="product-size"><i class="fas fa-weight-hanging"></i> الحجم: ${escapeHtml(sizeValue)} ${escapeHtml(sizeUnit)}</div>`
        : "";

    const bundleInfoHTML =
      !isMobile && pricing.hasBundle ? `<div class="bundle-info">عرض حزمة: ${pricing.bundleText}</div>` : "";

    const descToggleHTML = !isMobile
      ? `<span class="desc-toggle" onclick="toggleDescription(this)"><i class="fas fa-chevron-down"></i></span>`
      : "";

    html += `
      <div class="product-card">
        <div class="product-image-container">
          ${productImageHTML(p)}
          <div class="product-badges">${badgeHTML}</div>
        </div>

        <div class="product-info">
          <h3 class="product-title">
            ${escapeHtml(p.name || "")}
            ${descToggleHTML}
          </h3>
          ${sizeDisplay}
          <p class="product-desc">${escapeHtml(p.description || "")}</p>
          ${bundleInfoHTML}

          <div class="price-container">
            ${priceHTML}
            <button class="add-btn" onclick="addToCart('${escapeAttr(p.id)}', this)">
              <i class="fas fa-plus"></i> ${isMobile ? "أضف" : "أضف للسلة"}
            </button>
          </div>
        </div>
      </div>`;
  }

  offersGrid.innerHTML = html;
}

/* =========================
   OFFER TIMER
========================= */

let offerTimerIntervalId = null;

function initOfferTimer() {
  if (offerTimerIntervalId) clearInterval(offerTimerIntervalId);

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

  function updateTimer() {
    const now = Date.now();
    const distance = endDate.getTime() - now;

    const t = document.querySelector(".timer");
    if (!t) return;

    if (distance < 0) {
      t.innerHTML = "<div>انتهت العروض</div>";
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    const d = $("days");
    if (d) d.textContent = String(days).padStart(2, "0");
    const h = $("hours");
    if (h) h.textContent = String(hours).padStart(2, "0");
    const m = $("minutes");
    if (m) m.textContent = String(minutes).padStart(2, "0");
    const s = $("seconds");
    if (s) s.textContent = String(seconds).padStart(2, "0");
  }

  updateTimer();
  offerTimerIntervalId = setInterval(updateTimer, 1000);
}

/* =========================
   CART
========================= */

function normalizePhoneForWhatsApp(input) {
  const raw = (input || "").toString().trim();
  if (!raw) return "";

  let s = raw.replace(/[^\d+]/g, "");
  if (s.includes("+")) s = "+" + s.replace(/\+/g, "");
  s = s.replace(/\+/g, "");
  if (s.startsWith("00")) s = s.slice(2);
  if (s.length < 8) return "";
  return s;
}

function normalizePhoneForTel(input) {
  const raw = (input || "").toString().trim();
  if (!raw) return "";
  let s = raw.replace(/[^\d+]/g, "");
  // keep only first '+'
  s = s.replace(/(?!^)\+/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  const digits = s.replace(/\D/g, "");
  if (digits.length < 6) return "";
  return s;
}


function cartStorageKey() {
  return `cart:${STORE_SLUG}`;
}

function loadCart() {
  try {
    const raw = localStorage.getItem(cartStorageKey());
    cart = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch {
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(cartStorageKey(), JSON.stringify(cart));
  } catch {}
  updateCartCount();
  renderCartItems();
}

function updateCartCount() {
  const totalItems = Array.isArray(cart) ? cart.reduce((sum, i) => sum + (Number(i.qty) || 0), 0) : 0;

  const badge = $("cart-badge");
  if (badge) badge.textContent = totalItems;

  const empty = document.querySelector(".cart-empty");
  const summary = $("cart-summary");

  if (totalItems === 0) {
    if (empty) empty.style.display = "flex";
    if (summary) summary.style.display = "none";
  } else {
    if (empty) empty.style.display = "none";
    if (summary) summary.style.display = "block";
  }
}

function openCart() {
  renderCartItems();
  const cm = $("cartModal");
  if (!cm) return;
  cm.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  const cm = $("cartModal");
  if (!cm) return;
  cm.classList.remove("active");
  document.body.style.overflow = "auto";
}

function initCartModalClose() {
  const cm = $("cartModal");
  if (!cm) return;

  cm.addEventListener("click", (e) => {
    if (e.target === cm) closeCart();
  });

  const closeBtn = $("cartClose");
  if (closeBtn) closeBtn.addEventListener("click", closeCart);

  const openBtn = $("cartOpen");
  if (openBtn) openBtn.addEventListener("click", openCart);
}


function bumpCartBadge() {
  const badge = $("cart-badge");
  if (!badge) return;
  badge.classList.remove("bump");
  // force reflow to restart animation
  void badge.offsetWidth;
  badge.classList.add("bump");
}

function animateAddButton(btnEl) {
  if (!btnEl) return;

  const prev = btnEl.innerHTML;
  btnEl.classList.add("added");
  btnEl.innerHTML = '<i class="fas fa-check"></i> تمت';
  btnEl.disabled = true;

  window.setTimeout(() => {
    btnEl.classList.remove("added");
    btnEl.innerHTML = prev;
    btnEl.disabled = false;
  }, 650);
}

function addToCart(productId, btnEl) {
  const p = (Array.isArray(productsData) ? productsData : []).find((x) => String(x.id) === String(productId));
  if (!p) return;

  const pricing = calculatePrice(p);

  const existing = cart.find((i) => String(i.id) === String(productId));
  if (existing) {
    existing.qty = (Number(existing.qty) || 0) + 1;
  } else {
    cart.push({
      id: p.id,
      name: p.name || "",
      qty: 1,
      sizeValue: p.sizevalue || "",
      sizeUnit: p.sizeunit || "",
      originalPrice: pricing.originalPrice,
      finalPrice: pricing.finalPrice,
      hasDiscount: pricing.hasDiscount,
      hasBundle: pricing.hasBundle,
      bundleInfo: pricing.bundleInfo,
      bundleText: pricing.bundleText,
    });
  }

  saveCart();
  bumpCartBadge();
  animateAddButton(btnEl);
}

function removeFromCart(productId) {
  cart = cart.filter((i) => String(i.id) !== String(productId));
  saveCart();
}

function changeQty(productId, delta) {
  const item = cart.find((i) => String(i.id) === String(productId));
  if (!item) return;
  item.qty = (Number(item.qty) || 0) + Number(delta || 0);
  if (item.qty <= 0) cart = cart.filter((i) => String(i.id) !== String(productId));
  saveCart();
}

function calculateCartItemPrice(item) {
  const qty = Number(item.qty) || 0;

  if (item.hasBundle && item.bundleInfo) {
    const bq = Number(item.bundleInfo.qty) || 0;
    const bp = Number(item.bundleInfo.bundlePrice) || 0;

    if (bq > 0) {
      const bundles = Math.floor(qty / bq);
      const remainder = qty % bq;
      return bundles * bp + remainder * Number(item.originalPrice || 0);
    }
    return qty * Number(item.originalPrice || 0);
  }

  if (item.hasDiscount) return qty * Number(item.finalPrice || 0);

  return qty * Number(item.originalPrice || 0);
}

function renderCartItems() {
  const container = $("cart-items");
  if (!container) return;

  const summaryEl = $("cart-summary");
  const subtotalEl = $("cart-subtotal");
  const shippingEl = $("cart-shipping");
  const totalEl = $("cart-total");

  const items = Array.isArray(cart) ? cart : [];

  if (items.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <i class="fas fa-shopping-basket"></i>
        <p>سلة المشتريات فارغة</p>
      </div>`;

    if (summaryEl) summaryEl.style.display = "none";
    if (subtotalEl) subtotalEl.textContent = `0.00 ${CURRENCY}`;
    if (shippingEl) shippingEl.textContent = "مجاني";
    if (totalEl) totalEl.textContent = `0.00 ${CURRENCY}`;
    return;
  }

  if (summaryEl) summaryEl.style.display = "block";

  let subtotal = 0;
  let html = "";

  for (const item of items) {
    const qty = Number(item.qty) || 0;
    const itemTotal = calculateCartItemPrice(item);
    subtotal += itemTotal;

    let priceDisplay = "";

    if (item.hasBundle && item.bundleInfo) {
      const bundleQty = Number(item.bundleInfo.qty) || 0;
      const bundles = bundleQty > 0 ? Math.floor(qty / bundleQty) : 0;

      if (bundles > 0) {
        priceDisplay = `
          <div class="item-price">
            <span class="old-price">${Number(item.originalPrice || 0).toFixed(2)} ${CURRENCY}</span>
            ${Number(item.bundleInfo.unitPrice || 0).toFixed(2)} ${CURRENCY}
            <div class="bundle-note">(${escapeHtml(item.bundleText || "")})</div>
          </div>`;
      } else {
        priceDisplay = `
          <div class="item-price">
            ${Number(item.originalPrice || 0).toFixed(2)} ${CURRENCY}
            <div class="bundle-note">(العرض يبدأ عند ${bundleQty || 0})</div>
          </div>`;
      }
    } else if (item.hasDiscount) {
      priceDisplay = `
        <div class="item-price">
          <span class="old-price">${Number(item.originalPrice || 0).toFixed(2)} ${CURRENCY}</span>
          ${Number(item.finalPrice || 0).toFixed(2)} ${CURRENCY}
        </div>`;
    } else {
      priceDisplay = `<div class="item-price">${Number(item.originalPrice || 0).toFixed(2)} ${CURRENCY}</div>`;
    }

    const sizeInfo =
      item.sizeValue && item.sizeUnit
        ? `<div class="item-size">${escapeHtml(item.sizeValue)} ${escapeHtml(item.sizeUnit)}</div>`
        : "";

    html += `
      <div class="cart-item">
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name || "")}</div>
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

  const shippingEnabled =
    STORE_DATA.shipping === true ||
    (typeof STORE_DATA.shipping === "string" && STORE_DATA.shipping.toLowerCase() === "true") ||
    STORE_DATA.shipping === 1;

  const shippingPrice = shippingEnabled ? parseFloat(STORE_DATA.shipping_price) || 0 : 0;
  const total = subtotal + shippingPrice;

  if (subtotalEl) subtotalEl.textContent = `${subtotal.toFixed(2)} ${CURRENCY}`;
  if (shippingEl) shippingEl.textContent = shippingPrice > 0 ? `${shippingPrice.toFixed(2)} ${CURRENCY}` : "مجاني";
  if (totalEl) totalEl.textContent = `${total.toFixed(2)} ${CURRENCY}`;
}

function buildOrderMessage() {
  const items = Array.isArray(cart) ? cart : [];
  if (items.length === 0) return "";

  let subtotal = 0;

  const lines = items.map((it, idx) => {
    const qty = Number(it.qty) || 0;
    const itemTotal = calculateCartItemPrice(it);
    subtotal += itemTotal;

    const size = it.sizeValue && it.sizeUnit ? ` (${it.sizeValue} ${it.sizeUnit})` : "";
    return `${idx + 1}) ${it.name || ""}${size}\n   الكمية: ${qty}\n   المجموع: ${itemTotal.toFixed(2)} ${CURRENCY}`;
  });

  const shippingEnabled =
    STORE_DATA.shipping === true ||
    (typeof STORE_DATA.shipping === "string" && STORE_DATA.shipping.toLowerCase() === "true") ||
    STORE_DATA.shipping === 1;

  const shippingPrice = shippingEnabled ? parseFloat(STORE_DATA.shipping_price) || 0 : 0;
  const total = subtotal + shippingPrice;

  const header = `طلب جديد من المتجر: ${(STORE_DATA && STORE_DATA.store_name) ? STORE_DATA.store_name : ""}`.trim();
  const shipText = shippingEnabled ? (shippingPrice > 0 ? `${shippingPrice.toFixed(2)} ${CURRENCY}` : "مجاني") : "غير متوفر";

  const footer = `-------------------------
الإجمالي الفرعي: ${subtotal.toFixed(2)} ${CURRENCY}
الشحن: ${shipText}
الإجمالي: ${total.toFixed(2)} ${CURRENCY}

شكراً لكم 🌟`;

  return `${header}\n\n${lines.join("\n\n")}\n${footer}`;
}

function openStoreWhatsApp() {
  const waRaw = STORE_DATA?.whatsapp || STORE_DATA?.phone || "";
  const waNumber = normalizePhoneForWhatsApp(waRaw);
  if (!waNumber) {
    alert("لا يوجد رقم واتساب/هاتف صحيح للمتجر");
    return;
  }
  const url = `https://wa.me/${waNumber}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function checkout() {
  const items = Array.isArray(cart) ? cart : [];
  if (items.length === 0) {
    alert("سلة المشتريات فارغة");
    return;
  }

  const message = buildOrderMessage();
  if (!message) {
    alert("تعذر إنشاء رسالة الطلب");
    return;
  }

  const waRaw = STORE_DATA?.whatsapp || STORE_DATA?.phone || "";
  const waNumber = normalizePhoneForWhatsApp(waRaw);

  if (!waNumber) {
    alert("لا يوجد رقم واتساب/هاتف صحيح للمتجر");
    return;
  }

  const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* =========================
   BOOTSTRAP (ONE & ONLY ONE)
========================= */

window.addEventListener("DOMContentLoaded", async () => {
  const yearEl = $("current-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();


   // UI init that doesn't depend on data
  try {
    initNavigation();
  } catch {}

  try {
    initCartModalClose();
  } catch {}

  try {
    // will use STORE_SLUG once set, but safe even if empty (falls back to "cart:")
    loadCart();
    updateCartCount();
  } catch {}

  try {
    STORE_SLUG = await initStoreSlug();

    // reload cart with correct key once slug exists
    loadCart();
    updateCartCount();

    // 1) CDN first (optional)
    const cdnBundle = await loadPublicBundleFromCDN();
    if (cdnBundle && applyAnyBundle(cdnBundle)) {
      initOfferTimer();
      showPage(currentPage);
      initUXEnhancements();
      return;
    }

    // 2) ONE call: publicBundle
    const bundleJson = await loadPublicBundle();
    applyPublicBundle(bundleJson);

    initOfferTimer();
    showPage(currentPage);
    initUXEnhancements();
  } catch (e) {
    console.error(e);
    const loadingEl = $("loading");
    if (loadingEl) {
      loadingEl.style.display = "block";
      loadingEl.innerHTML = `
        <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">
          حدث خطأ. تأكد من رابط المتجر ثم أعد المحاولة.
        </div>`;
    }
  }
});
