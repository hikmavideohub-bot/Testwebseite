/* =========================
   CONFIG
========================= */

var API_URL = "https://api.aldeebtech.de/exec";   // nur /exec (storecontroller AUS)
var CDN_DATA_BASE = "/data";                      // optional: /data/<slug>.json

var ONE_DAY_MS = 24 * 60 * 60 * 1000;
var CDN_BUNDLE_MAX_AGE_MS = 365 * ONE_DAY_MS;

var CACHE_PREFIX = "store_cache_v2";
//var CACHE_TTL_MS = 10 * 60 * 1000; // 10 Min
var CACHE_TTL_MS = 0

var CLOUDINARY_CLOUD_NAME = "dt2strsjh"; // <- eintragen

/* =========================
   GLOBAL STATE
========================= */

var STORE_SLUG = "";

var currentPage = "home";
var activeCategory = "الكل";

var STORE_DATA = {};
var CURRENCY = "€";

var categoriesData = [];
var productsData = [];

var cart = [];

/* =========================
   DOM + CLASS HELPERS (ES5)
========================= */

function $(id) {
  return document.getElementById(id);
}

function hasClass(el, cls) {
  if (!el || !cls) return false;
  return (" " + el.className + " ").indexOf(" " + cls + " ") !== -1;
}

function addClass(el, cls) {
  if (!el || !cls) return;
  if (!hasClass(el, cls)) el.className = (el.className ? (el.className + " ") : "") + cls;
}

function removeClass(el, cls) {
  if (!el || !cls) return;
  var re = new RegExp("(^|\\s)" + cls + "(\\s|$)", "g");
  el.className = (el.className || "").replace(re, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function toggleClass(el, cls, force) {
  if (!el || !cls) return;
  if (force === true) addClass(el, cls);
  else if (force === false) removeClass(el, cls);
  else {
    if (hasClass(el, cls)) removeClass(el, cls);
    else addClass(el, cls);
  }
}

function qsa(selector, root) {
  var r = root || document;
  return r.querySelectorAll(selector);
}

function forEachNodeList(nodeList, fn) {
  if (!nodeList || !fn) return;
  for (var i = 0; i < nodeList.length; i++) fn(nodeList[i], i);
}

function matchesSelector(el, selector) {
  if (!el || el.nodeType !== 1) return false;
  var p = el.matches || el.msMatchesSelector || el.webkitMatchesSelector || el.mozMatchesSelector;
  if (p) return p.call(el, selector);

  // very old fallback
  var nodes = (el.ownerDocument || document).querySelectorAll(selector);
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] === el) return true;
  }
  return false;
}

function closestEl(el, selector) {
  var cur = el;
  while (cur && cur.nodeType === 1) {
    if (matchesSelector(cur, selector)) return cur;
    cur = cur.parentNode;
  }
  return null;
}

function getDataAttr(el, name) {
  if (!el || !name) return "";
  // dataset may not exist everywhere, but getAttribute always does
  var attr = "data-" + name.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase(); });
  var v = el.getAttribute(attr);
  return v === null || v === undefined ? "" : String(v);
}

/* =========================
   STRING / FORMAT HELPERS
========================= */

function pad2(n) {
  n = String(n);
  return n.length < 2 ? ("0" + n) : n;
}

function escapeHtml(str) {
  var s = (str === null || str === undefined) ? "" : String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str).split("`").join("&#096;");
}

function strTrim(v) {
  return (v === null || v === undefined) ? "" : String(v).replace(/^\s+|\s+$/g, "");
}

function startsWith(str, prefix) {
  str = String(str || "");
  return str.indexOf(prefix) === 0;
}

function includesStr(str, needle) {
  str = String(str || "");
  return str.indexOf(needle) !== -1;
}

function sanitizeImgUrl(url) {
  var u = strTrim((url || "").toString());
  if (!u) return "";
  if (startsWith(u, "http://") || startsWith(u, "https://")) return u;
  return "";
}

function normalizeImageUrl(rawUrl) {
  var u = strTrim((rawUrl || "").toString());
  if (!u) return "";
  if (!(startsWith(u, "http://") || startsWith(u, "https://"))) return "";

  var m1 = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1 && m1[1]) return "https://drive.google.com/uc?export=view&id=" + m1[1];

  var m2 = u.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m2 && m2[1]) return "https://drive.google.com/uc?export=view&id=" + m2[1];

  var mAny = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (mAny && mAny[1]) return "https://drive.google.com/uc?export=view&id=" + mAny[1];

  return u;
}

/* Image onerror helper (avoid replaceWith/nextElementSibling) */
function imgFallback(imgEl) {
  try {
    if (!imgEl) return;
    imgEl.style.display = "none";
    var sib = imgEl.nextSibling;
    while (sib && sib.nodeType !== 1) sib = sib.nextSibling;
    if (sib) sib.style.display = "block";
  } catch (e) {}
}

/* =========================
   SLUG RESOLUTION
========================= */

function looksLikeLatinSlug(s) {
  return /^[a-z0-9-]+$/i.test(s || "");
}

function getQueryParam(name) {
  var qs = window.location.search || "";
  if (qs.charAt(0) === "?") qs = qs.substring(1);
  if (!qs) return null;

  var parts = qs.split("&");
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (!part) continue;
    var idx = part.indexOf("=");
    var k = idx >= 0 ? part.substring(0, idx) : part;
    var v = idx >= 0 ? part.substring(idx + 1) : "";
    try {
      k = decodeURIComponent(k.replace(/\+/g, " "));
    } catch (e) {}
    if (k === name) {
      try {
        return decodeURIComponent(v.replace(/\+/g, " "));
      } catch (e2) {
        return v;
      }
    }
  }
  return null;
}

function getRawStoreSegment() {
  // Normal: /s/<slug>
  var parts = (window.location.pathname || "").split("/");
  if (parts[1] === "s" && parts[2]) {
    try { return decodeURIComponent(parts[2]); } catch (e) { return parts[2]; }
  }

  // SPA fallback: ?__path=/s/<slug>
  var p = getQueryParam("__path");
  if (p) {
    var ps = String(p).split("/");
    if (ps[1] === "s" && ps[2]) {
      try { return decodeURIComponent(ps[2]); } catch (e2) { return ps[2]; }
    }
  }
  return "";
}

function initStoreSlug() {
  return new Promise(function (resolve, reject) {
    var raw = getRawStoreSegment();
    if (!raw) {
      reject(new Error("missing_slug"));
      return;
    }

    // already a normal slug
    if (looksLikeLatinSlug(raw)) {
      resolve(raw);
      return;
    }

    // arabischer Name -> resolveSlug
    var url = API_URL + "?type=resolveSlug&name=" + encodeURIComponent(raw);

    fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    })
      .then(function (res) {
        if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "0"));
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.success || !json.slug) throw new Error("store_not_found");
        try {
          history.replaceState(null, "", "/s/" + json.slug);
        } catch (e) {}
        resolve(json.slug);
      })
      .catch(function (e) {
        reject(e);
      });
  });
}

/* =========================
   CART UX: Gold effect + Overlay buttons
========================= */

function addToCartWithGoldEffect(productId) {
  var selector = '.product-card[data-product-id="' + String(productId) + '"]';
  var productCard = document.querySelector(selector);

  if (productCard) {
    addClass(productCard, "adding");

    setTimeout(function () {
      removeClass(productCard, "adding");
      addClass(productCard, "added");
    }, 500);

    setTimeout(function () {
      removeClass(productCard, "added");
    }, 2000);
  }

  addToCart(productId);
}



/* alias for old calls */
function filterProductsByCategory(category) {
  filterProducts(category);
}

/* =========================
   CACHE (LocalStorage)
========================= */

function cacheKey(key) {
  return CACHE_PREFIX + ":" + STORE_SLUG + ":" + key;
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify({ ts: Date.now(), value: value }));
  } catch (e) {}
}

function cacheGet(key) {
  try {
    var raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    var obj = JSON.parse(raw);
    if (!obj || !obj.ts) return null;
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return (obj.value === undefined || obj.value === null) ? null : obj.value;
  } catch (e) {
    return null;
  }
}

/* =========================
   FETCH JSON (robust) - ES5
========================= */

function mergeHeaders(a, b) {
  var out = {};
  var k;
  if (a) {
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
  }
  if (b) {
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k];
  }
  return out;
}

function setMetaDescription(store) {
  if (!store || !store.page_description) return;

  var meta = document.getElementById("meta-description");
  if (!meta) return;

  meta.setAttribute("content", String(store.page_description));
}


function fetchJson(url, opts) {
  opts = opts || {};
  var headers = mergeHeaders({ Accept: "application/json" }, (opts.headers || {}));

  var fetchOpts = {};
  var k;
  for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) fetchOpts[k] = opts[k];
  fetchOpts.headers = headers;

  return fetch(url, fetchOpts)
    .then(function (res) {
      if (!res || !res.ok) return { ok: false, status: res ? res.status : 0, json: null };
      return res.json()
        .then(function (j) { return { ok: true, status: res.status, json: j }; })
        .catch(function () { return { ok: false, status: res.status, json: null }; });
    })
    .catch(function () {
      return { ok: false, status: 0, json: null };
    });
}

/* =========================
   CDN BUNDLE (optional)
========================= */

function getCdnBundleUrl() {
  return CDN_DATA_BASE + "/" + encodeURIComponent(STORE_SLUG) + ".json";
}

function loadPublicBundleFromCDN() {
  return fetchJson(getCdnBundleUrl(), { cache: "no-store" })
    .then(function (r) {
      if (!r || !r.ok || !r.json) return null;

      // staleness check (optional)
      var json = r.json;
      var gen = null;
      if (json && json.meta && (json.meta.generatedAt || json.meta.generated_at)) gen = json.meta.generatedAt || json.meta.generated_at;
      else if (json && (json.generatedAt || json.generated_at)) gen = json.generatedAt || json.generated_at;

      if (gen) {
        var t = Date.parse(gen);
        if (!isNaN(t) && (Date.now() - t > CDN_BUNDLE_MAX_AGE_MS)) return null;
      }

      return json;
    })
    .catch(function () { return null; });
}

/* =========================
   API (only /exec)
========================= */

function apiGet(type) {
  var url =
    API_URL +
    "?type=" + encodeURIComponent(type) +
    "&slug=" + encodeURIComponent(STORE_SLUG) +
    "&_ts=" + Date.now();

  return fetch(url, { cache: "no-store" })
    .then(function (res) {
      if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : "0"));
      return res.json();
    })
    .then(function (json) {
      if (!json || !json.success) throw new Error((json && (json.message || json.error)) || ("API " + type + " failed"));
      return json;
    });
}

/* =========================
   PUBLIC BUNDLE (ONE CALL)
========================= */

function loadPublicBundle() {
  var cached = cacheGet("publicBundle");
  if (cached && typeof cached === "object") return Promise.resolve(cached);

  return apiGet("publicBundle").then(function (json) {
    cacheSet("publicBundle", json);
    return json;
  });
}

/**
 * Accepts either:
 *  - publicBundle format: { success:true, store, customerMessage, categories, products }
 *  - older bundle format: { storeConfig, customerMessage, categories, products, websiteActive }
 */
function applyAnyBundle(bundleJson) {
  if (!bundleJson || typeof bundleJson !== "object") return false;

  // If it's publicBundle
  if (bundleJson.store) return applyPublicBundle(bundleJson);

  // If it's old-style bundle
  var store = bundleJson.storeConfig || bundleJson.store_config || {};
  var products = Array.isArray(bundleJson.products) ? bundleJson.products : [];
  var categories = Array.isArray(bundleJson.categories) ? bundleJson.categories : [];
  var msg = strTrim(bundleJson.customerMessage || bundleJson.customer_message || "");

  var activeFlag =
    (bundleJson.websiteActive !== undefined && bundleJson.websiteActive !== null) ? bundleJson.websiteActive :
    ((bundleJson.website_active !== undefined && bundleJson.website_active !== null) ? bundleJson.website_active :
    ((store.website_active !== undefined && store.website_active !== null) ? store.website_active : true));

  if (activeFlag === false) {
    applyStoreInactiveUI();
    return true;
  }
  restoreStoreUIIfNeeded();

  STORE_DATA = store;
  CURRENCY = strTrim(STORE_DATA.currency || bundleJson.currency || "€") || "€";
  applyStoreConfig();
  applyCustomerMessage(msg);

  categoriesData = categories;
  productsData = products;

  var loadingEl = $("loading");
  if (loadingEl) loadingEl.style.display = "none";

  renderCategories(productsData);
  renderAllProducts(productsData);
  renderOfferProducts();
  return true;
}

function applyPublicBundle(bundleJson) {
  var store = (bundleJson && bundleJson.store) ? bundleJson.store : {};
  var products = (bundleJson && Array.isArray(bundleJson.products)) ? bundleJson.products : [];
  var categories = (bundleJson && Array.isArray(bundleJson.categories)) ? bundleJson.categories : [];
  var msg = strTrim(bundleJson && bundleJson.customerMessage ? bundleJson.customerMessage : "");

  if (store && store.website_active === false) {
    applyStoreInactiveUI();
    return true;
  }
  restoreStoreUIIfNeeded();

STORE_DATA = store || {};
setMetaDescriptionFromStore(STORE_DATA);
CURRENCY = strTrim(STORE_DATA.currency || "€") || "€";
applyStoreConfig();
applyCustomerMessage(msg);

  categoriesData = categories;
  productsData = products;

  var loadingEl = $("loading");
  if (loadingEl) loadingEl.style.display = "none";

  renderCategories(productsData);
  renderAllProducts(productsData);
  renderOfferProducts();

  return true;
}

function setMetaDescriptionFromStore(store) {
  var meta = document.querySelector('meta[name="description"]');
  if (!meta) return;

  var desc = strTrim(store && store.page_description ? store.page_description : "");
  if (!desc) return;

  meta.setAttribute("content", desc);
}

/* =========================
   UI: Inactive / Restore
========================= */

function applyStoreInactiveUI() {
  var pages = qsa(".page");
  forEachNodeList(pages, function (p) { removeClass(p, "active"); });

  var loading = $("loading");
  if (loading) {
    loading.style.display = "block";
    loading.innerHTML =
      '<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">' +
        "هذا المتجر غير متاح حالياً." +
      "</div>";
  }
}

function restoreStoreUIIfNeeded() {
  // nothing special; render/apply will hide loading later
}

/* =========================
   STORE CONFIG -> DOM
========================= */

function applyStoreConfig() {
  function setText(id, val) {
    var el = $(id);
    if (el) el.textContent = (val === null || val === undefined) ? "" : String(val);
  }

  CURRENCY = strTrim(STORE_DATA.currency || "") || "€";

  var storeName = STORE_DATA.store_name || "متجر";
  var storeDesc = STORE_DATA.page_description || "متجر إلكتروني متكامل";

  setText("store-name", storeName);
  setText("footer-store-name", storeName);
  setText("footer-store-name-bottom", storeName);

  document.title = storeName + " | متجر";

  setText("footer-store-description", storeDesc);

  setText("store-phone", STORE_DATA.phone || "غير متوفر");

  // About
  setText("about-phone", STORE_DATA.phone || "غير متوفر");
  setText("about-whatsapp", STORE_DATA.whatsapp || STORE_DATA.phone || "غير متوفر");
  setText("about-email", STORE_DATA.email || "غير متوفر");
  setText("about-hours", STORE_DATA.working_hours || "24/7");
  setText("about-address", STORE_DATA.address || "غير متوفر");
  setText("about-currency", CURRENCY);

  var shippingEnabled =
    STORE_DATA.shipping === true ||
    (typeof STORE_DATA.shipping === "string" && String(STORE_DATA.shipping).toLowerCase() === "true") ||
    STORE_DATA.shipping === 1;

  var shippingPriceNum = parseFloat(STORE_DATA.shipping_price || "0") || 0;

  var shippingText = shippingEnabled
    ? (shippingPriceNum > 0
      ? ("شحن بمبلغ " + shippingPriceNum.toFixed(2) + " " + CURRENCY)
      : "شحن مجاني")
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

  try { setupSocialLinks(); } catch (e) {}
  try { applyMapsFromAddress(STORE_DATA.address || ""); } catch (e2) {}
}

function openStoreWhatsApp() {
  if (!STORE_DATA) return;

  var wa = STORE_DATA.whatsapp || STORE_DATA.phone || "";
  wa = String(wa).replace(/\D/g, ""); // nur Zahlen

  if (!wa) return;

  var text = STORE_DATA.whatsapp_message || "";
  var url = "https://wa.me/" + wa;

  if (text) {
    url += "?text=" + encodeURIComponent(text);
  }

  window.open(url, "_blank");
}

/* =========================
   Announcement
========================= */

function applyCustomerMessage(msg) {
  var m = strTrim(msg || "");
  STORE_DATA.message = m;

  var bar = $("announcement-bar");
  var text = $("announcement-text");
  if (!bar || !text) return;

  if (m) {
    bar.style.display = "block";
    text.textContent = m;
  } else {
    bar.style.display = "none";
    text.textContent = "";
  }
}

/* =========================
   Social Links
========================= */

function setupSocialLinks() {
  var socialLinksContainer = $("social-links");
  var footerSocialLinks = $("footer-social-links");
  if (!socialLinksContainer || !footerSocialLinks) return;

  var links = [];

  function add(type, url, icon) {
    var u = strTrim(url || "");
    if (!u) return;
    links.push({ type: type, url: u, icon: icon });
  }

  add("facebook", STORE_DATA.facebook, "fab fa-facebook-f");
  add("instagram", STORE_DATA.instagram, "fab fa-instagram");
  add("tiktok", STORE_DATA.tiktok, "fab fa-tiktok");

  function makeHTML() {
    var out = "";
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      out += '<a href="' + escapeAttr(l.url) + '" target="_blank" rel="noopener noreferrer"><i class="' + escapeAttr(l.icon) + '"></i></a>';
    }
    return out;
  }

  socialLinksContainer.innerHTML = makeHTML();
  footerSocialLinks.innerHTML = makeHTML();
}

/* =========================
   Maps
========================= */

function applyMapsFromAddress(address) {
  var a = strTrim(address || "");

  var aboutWrap = document.getElementById("about-map-wrap");
  var aboutMap = document.getElementById("about-map");
  var aboutHint = document.getElementById("about-map-hint");

  var contactWrap = document.getElementById("contact-map-wrap");
  var contactMap = document.getElementById("contact-map");
  var contactHint = document.getElementById("contact-map-hint");

  if (!a) {
    if (aboutWrap) aboutWrap.style.display = "none";
    if (contactWrap) contactWrap.style.display = "none";
    if (aboutHint) aboutHint.textContent = "";
    if (contactHint) contactHint.textContent = "";
    return;
  }

  var q = encodeURIComponent(a);
  var src = "https://www.google.com/maps?q=" + q + "&output=embed";

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
  var navLinks = qsa(".nav-link");
  forEachNodeList(navLinks, function (link) {
    link.addEventListener("click", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var page = this.getAttribute("data-page");
      if (page) navigateToPage(page);
    });
  });

  var footerLinks = qsa("footer a[data-page]");
  forEachNodeList(footerLinks, function (link) {
    link.addEventListener("click", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var page = this.getAttribute("data-page");
      if (page) navigateToPage(page);
    });
  });

  var mobileToggle = $("mobileToggle");
  var navMenu = $("navMenu");

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener("click", function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      toggleClass(navMenu, "active");
      this.innerHTML = hasClass(navMenu, "active")
        ? '<i class="fas fa-times"></i>'
        : '<i class="fas fa-bars"></i>';
    });

    forEachNodeList(navLinks, function (link) {
      link.addEventListener("click", function () {
        removeClass(navMenu, "active");
        mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
      });
    });

    document.addEventListener("click", function (e) {
      if (!hasClass(navMenu, "active")) return;
      if (navMenu.contains(e.target)) return;
      if (mobileToggle.contains(e.target)) return;
      removeClass(navMenu, "active");
      mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
    });
  }
}

function navigateToPage(page) {
  var links = qsa(".nav-link");
  forEachNodeList(links, function (link) {
    var isActive = link.getAttribute("data-page") === page;
    toggleClass(link, "active", isActive);
  });

  currentPage = page;
  showPage(page);

  if (page === "offers") renderOfferProducts();
}

function showPage(page) {
  var pages = qsa(".page");
  forEachNodeList(pages, function (p) { removeClass(p, "active"); });
  var el = $(page + "-page");
  if (el) addClass(el, "active");
  closeCart();
}

/* =========================
   CATEGORY SWIPE + UX
========================= */

function initSwipeCategories() {
  var categoryNav = $("category-nav") || document.querySelector(".category-nav");
  if (!categoryNav) return;
  addClass(categoryNav, "category-nav");

  var isDragging = false;
  var startX = 0;
  var scrollLeft = 0;

  categoryNav.addEventListener("mousedown", function (e) {
    isDragging = true;
    startX = e.pageX - categoryNav.offsetLeft;
    scrollLeft = categoryNav.scrollLeft;
    categoryNav.style.cursor = "grabbing";
    categoryNav.style.userSelect = "none";
  });

  categoryNav.addEventListener("mousemove", function (e) {
    if (!isDragging) return;
    if (e && e.preventDefault) e.preventDefault();
    var x = e.pageX - categoryNav.offsetLeft;
    var walk = (x - startX) * 1.5;
    categoryNav.scrollLeft = scrollLeft - walk;
  });

  categoryNav.addEventListener("mouseup", function () {
    isDragging = false;
    categoryNav.style.cursor = "grab";
    categoryNav.style.userSelect = "auto";
  });

  categoryNav.addEventListener("mouseleave", function () {
    isDragging = false;
    categoryNav.style.cursor = "grab";
    categoryNav.style.userSelect = "auto";
  });

  categoryNav.addEventListener("touchstart", function (e) {
    if (!e || !e.touches || !e.touches[0]) return;
    startX = e.touches[0].pageX;
    scrollLeft = categoryNav.scrollLeft;
  }, false);

  categoryNav.addEventListener("touchmove", function (e) {
    if (!e || !e.touches || !e.touches[0]) return;
    var x = e.touches[0].pageX;
    var walk = (x - startX) * 1.5;
    categoryNav.scrollLeft = scrollLeft - walk;
  }, false);
}

function initUXEnhancements() {
  initSwipeCategories();
  enhanceProductImages();
  // overlay buttons need cards in DOM
  try { initializeOverlayButtons(); } catch (e) {}
}

function enhanceProductImages() {
  var imgs = qsa(".product-image");
  forEachNodeList(imgs, function (img) {
    img.addEventListener("click", function () {
      var src = img.getAttribute("src");
      if (src && (startsWith(src, "http://") || startsWith(src, "https://"))) {
        window.open(src, "_blank", "noopener");
      }
    });
  });
}

/* =========================
   PRODUCTS: rules
========================= */

function isProductActive(p) {
  var v = p && p.product_active;
  if (v === false) return false;
  if (typeof v === "string") return String(v).toLowerCase() !== "false" && v !== "0";
  return true;
}

function hasOffer(p) {
  var v = p && p.has_offer;
  if (v === true) return true;
  if (typeof v === "string") return v === "1" || String(v).toLowerCase() === "true";
  return false;
}

function isOfferActive(p) {
  var v =
    (p && p.offer_aktive !== undefined && p.offer_aktive !== null) ? p.offer_aktive :
    ((p && p.offer_active !== undefined && p.offer_active !== null) ? p.offer_active : true);

  if (v === false) return false;
  if (typeof v === "string") return v !== "0" && String(v).toLowerCase() !== "false";

  var start = (p && p.offer_start_date) ? Date.parse(p.offer_start_date) : NaN;
  var end = (p && p.offer_end_date) ? Date.parse(p.offer_end_date) : NaN;
  var now = Date.now();

  if (!isNaN(start) && now < start) return false;
  if (!isNaN(end) && now > end) return false;

  return true;
}

function calculatePrice(p) {
  var price = Number(p && p.price ? p.price : 0);

  var offerType = (p && p.offer_type ? p.offer_type : "").toLowerCase();
  var percentRaw = Number(p && p.percent ? p.percent : 0);

  var qty = Number(p && p.bundle_qty ? p.bundle_qty : 0);
  var bundlePrice = Number(p && p.bundle_price ? p.bundle_price : 0);

  var hasPercent =
    hasOffer(p) &&
    (offerType === "percent" || offerType === "percentage") &&
    percentRaw > 0;

  var hasBundle =
    hasOffer(p) &&
    offerType === "bundle" &&
    qty > 0 &&
    bundlePrice > 0 &&
    price > 0;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function roundMoney(v) {
    return Math.round((v + 0.0000001) * 100) / 100;
  }

  function money(v) {
    return roundMoney(v).toFixed(2) + " " + CURRENCY;
  }

  /* Prozent-Angebot */
  if (hasPercent) {
    var percent = clamp(percentRaw, 0, 100);
    var finalPrice = roundMoney(price * (1 - percent / 100));

    return {
      originalPrice: price,
      finalPrice: finalPrice,

      hasDiscount: true,
      discountPercent: percent,

      hasBundle: false,
      bundleInfo: null,

      badgeText: "-" + percent + "%",
      offerLabelShort: "خصم " + percent + "%",
      offerLabelLong: "خصم " + percent + "% — بدلاً من " + money(price),
      offerDetails: "السعر بعد الخصم: " + money(finalPrice)
    };
  }

  /* Bundle-Angebot */
  if (hasBundle) {
    var unitPrice = price;
    var unitInBundle = bundlePrice / qty;

    var payQtyGuess = Math.round(bundlePrice / unitPrice);
    var isPayGet =
      payQtyGuess >= 1 &&
      payQtyGuess < qty &&
      Math.abs(bundlePrice - payQtyGuess * unitPrice) < 0.10;

    var badgeText = "عرض";
    var offerLabelShort = qty + "× بـ " + money(bundlePrice);
    var offerLabelLong =
      qty + " حبات بـ " + money(bundlePrice) +
      " (للقطعة: " + money(unitInBundle) + ")";
    var offerDetails = "بدلاً من " + money(qty * unitPrice);

    if (isPayGet) {
      var freeQty = qty - payQtyGuess;
      badgeText = freeQty + " مجاناً";
      offerLabelShort = payQtyGuess + " + " + freeQty + " مجاناً";
      offerLabelLong =
        "اشترِ " + payQtyGuess +
        " واحصل على " + freeQty +
        " مجاناً (المجموع " + qty + ")";
      offerDetails = "تدفع سعر " + payQtyGuess + " فقط: " + money(bundlePrice);
    } else {
      badgeText = qty + "×";
    }

    return {
      originalPrice: price,
      finalPrice: unitPrice,

      hasDiscount: false,
      discountPercent: 0,

      hasBundle: true,
      bundleInfo: {
        qty: qty,
        bundlePrice: bundlePrice,
        unitPrice: unitInBundle
      },

      badgeText: badgeText,
      offerLabelShort: offerLabelShort,
      offerLabelLong: offerLabelLong,
      offerDetails: offerDetails
    };
  }

  /* Kein Angebot */
  return {
    originalPrice: price,
    finalPrice: price,

    hasDiscount: false,
    discountPercent: 0,

    hasBundle: false,
    bundleInfo: null,

    badgeText: "",
    offerLabelShort: "",
    offerLabelLong: "",
    offerDetails: ""
  };
}


/* =========================
   PRODUCT IMAGE
========================= */

function wireContactLinks() {
  var phone = strTrim(STORE_DATA.phone || "");
  var wa = strTrim(STORE_DATA.whatsapp || STORE_DATA.phone || "");
  var email = strTrim(STORE_DATA.email || "");

  var phoneLink = document.getElementById("footer-phone-link");
  if (phoneLink && phone) phoneLink.setAttribute("href", "tel:" + phone.replace(/[^\d+]/g, ""));

  var waLink = document.getElementById("footer-whatsapp-link");
  if (waLink && wa) {
    var waNum = normalizePhoneForWhatsApp(wa);
    if (waNum) waLink.setAttribute("href", "https://wa.me/" + waNum);
    waLink.setAttribute("target", "_blank");
    waLink.setAttribute("rel", "noopener noreferrer");
  }

  var emailLink = document.getElementById("footer-email-link");
  if (emailLink && email) emailLink.setAttribute("href", "mailto:" + email);
}


function productImageHTML(p, opts) {
  opts = opts || {};
  var priority = opts.priority === true;
  var w = (opts.w !== undefined && opts.w !== null) ? opts.w : 720;
  var h = (opts.h !== undefined && opts.h !== null) ? opts.h : 720;

  var normalized = normalizeImageUrl(p && p.image);
  var safeUrl = sanitizeImgUrl(normalized);

  if (!safeUrl) {
    return '' +
      '<div class="placeholder-image">' +
        '<div class="ph">Beispielbild<br><small>صورة توضيحية</small></div>' +
      "</div>";
  }

  var src = toOptimizedImageUrl(safeUrl, w);

  return '' +
    '<img' +
      ' src="' + escapeAttr(src) + '"' +
      ' class="product-image"' +
      ' alt="' + escapeHtml((p && p.name) ? p.name : "") + '"' +
      ' width="' + String(w) + '"' +
      ' height="' + String(h) + '"' +
      ' loading="' + (priority ? "eager" : "lazy") + '"' +
      ' fetchpriority="' + (priority ? "high" : "low") + '"' +
      ' decoding="async"' +
      ' referrerpolicy="no-referrer"' +
      ' onerror="imgFallback(this)"' +
    " />" +
    '<div class="placeholder-image" style="display:none">' +
      '<div class="ph">Beispielbild<br><small>صورة توضيحية</small></div>' +
    "</div>";
}

function toOptimizedImageUrl(remoteUrl, w) {
  w = (w !== undefined && w !== null) ? w : 720;
  var u = sanitizeImgUrl(remoteUrl);
  if (!u) return "";
  if (!CLOUDINARY_CLOUD_NAME) return u;

  var base = "https://res.cloudinary.com/" + CLOUDINARY_CLOUD_NAME + "/image/fetch";
  return base + "/f_auto,q_auto,w_" + w + ",c_fill/" + encodeURIComponent(u);
}

/* =========================
   RENDER: Categories & Products
========================= */

function uniqueArrayFromStrings(arr) {
  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var s = arr[i];
    if (!s) continue;
    if (!seen[s]) {
      seen[s] = true;
      out.push(s);
    }
  }
  return out;
}

function renderCategories(products) {
  var nav = $("category-nav");
  if (!nav) return;

  addClass(nav, "category-nav");

  var list = Array.isArray(products) ? products : [];
  var rawCats = [];
  for (var i = 0; i < list.length; i++) {
    var c = strTrim((list[i] && list[i].category) ? list[i].category : "");
    if (c) rawCats.push(c);
  }

  var unique = (Array.isArray(categoriesData) && categoriesData.length > 0)
    ? categoriesData
    : uniqueArrayFromStrings(rawCats);

  if (!unique || unique.length === 0) {
    nav.style.display = "none";
    return;
  }

  nav.style.display = "flex";
  nav.innerHTML = "";

  function mkBtn(label, icon, isActive, onClick) {
    var b = document.createElement("button");
    b.className = "cat-btn" + (isActive ? " active" : "");
    b.innerHTML = '<i class="' + escapeAttr(icon) + '"></i> ' + escapeHtml(label);
    b.addEventListener("click", onClick);
    return b;
  }

  nav.appendChild(mkBtn("الكل", "fas fa-th-large", activeCategory === "الكل", function () { filterProducts("الكل"); }));

  for (var j = 0; j < unique.length; j++) {
    (function (cat) {
      nav.appendChild(mkBtn(cat, "fas fa-tag", activeCategory === cat, function () { filterProducts(cat); }));
    })(unique[j]);
  }
}

function filterProducts(category) {
  activeCategory = category;

  var nav = $("category-nav");
  if (nav) {
    var btns = nav.querySelectorAll(".cat-btn");
    forEachNodeList(btns, function (btn) { removeClass(btn, "active"); });

    forEachNodeList(btns, function (btn) {
      var txt = strTrim(btn.textContent || "");
      if (category !== "الكل" && includesStr(txt, category)) addClass(btn, "active");
      if (category === "الكل" && includesStr(txt, "الكل")) addClass(btn, "active");
    });
  }

  renderAllProducts(productsData);
  try { initializeOverlayButtons(); } catch (e) {}
}

function renderAllProducts(products) {
  var list = Array.isArray(products) ? products : [];
  var filtered = [];

  if (activeCategory === "الكل") {
    filtered = list;
  } else {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (strTrim((p && p.category) ? p.category : "") === activeCategory) filtered.push(p);
    }
  }

  var activeProducts = [];
  var inactiveProducts = [];

  for (var j = 0; j < filtered.length; j++) {
    var pp = filtered[j];
    if (isProductActive(pp)) activeProducts.push(pp);
    else inactiveProducts.push(pp);
  }

  renderGrid("products-grid", activeProducts, false);

  var inactiveSection = $("inactive-section");
  var inactiveToggle = $("inactive-toggle");
  if (!inactiveSection || !inactiveToggle) return;

  if (inactiveProducts.length > 0) {
    inactiveToggle.style.display = "block";
    renderGrid("inactive-grid", inactiveProducts, true);
  } else {
    inactiveToggle.style.display = "none";
    inactiveSection.style.display = "none";
  }

  try { initializeOverlayButtons(); } catch (e) {}
}

function renderGrid(containerId, products, isInactive) {
  var grid = $(containerId);
  if (!grid) return;

  var list = Array.isArray(products) ? products : [];

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

  var isMobile = window.innerWidth <= 992;
  var html = "";

  for (var i = 0; i < list.length; i++) {
    var p = list[i];

    var pricing = calculatePrice(p);
    var active = isProductActive(p) && !isInactive;

    // first visible card: image priority
    var priorityImg = (!isInactive && i === 0);

    var priceHTML = "";
    var badgeHTML = "";

    if (pricing.hasDiscount) {
      priceHTML =
        '<div class="price-wrapper">' +
          '<span class="price-old">' + pricing.originalPrice.toFixed(2) + " " + CURRENCY + "</span>" +
          '<span class="price-new discount">' + pricing.finalPrice.toFixed(2) + " " + CURRENCY + "</span>" +
        "</div>";

      badgeHTML =
        '<div class="discount-badge">' +
          (isMobile ? (pricing.discountPercent + "%") : ("خصم " + pricing.discountPercent + "%")) +
        "</div>";

    } else if (pricing.hasBundle) {
  priceHTML =
    '<div class="price-wrapper">' +
      '<span class="price-old">' + pricing.originalPrice.toFixed(2) + " " + CURRENCY + "</span>" +
      '<span class="price-new bundle">' + pricing.bundleInfo.unitPrice.toFixed(2) + " " + CURRENCY + "</span>" +
    "</div>";

  badgeHTML =
    '<div class="bundle-badge">' +
      (isMobile ? (pricing.offerLabelShort || pricing.badgeText || "عرض") : (pricing.offerLabelLong || pricing.offerLabelShort || "عرض")) +
    "</div>";


    } else {
      priceHTML =
        '<div class="price-wrapper">' +
          '<span class="price-new">' + pricing.originalPrice.toFixed(2) + " " + CURRENCY + "</span>" +
        "</div>";
    }

    var cardClass = active ? "product-card" : "product-card inactive";
    var inactiveBadge = !active ? '<div class="inactive-badge">غير متوفر</div>' : "";

    var btnState = active ? "" : "disabled";
    var btnText = active ? (isMobile ? "أضف" : "أضف للسلة") : (isMobile ? "نفذ" : "نفذت الكمية");
    var btnIcon = active ? "fa-plus" : "fa-times";
    var btnClick = active ? 'onclick="addToCartWithGoldEffect(\'' + escapeAttr(p.id) + '\')"': "";




    var sizeValue = strTrim(p && p.sizevalue ? p.sizevalue : "");
    var sizeUnit = strTrim(p && p.sizeunit ? p.sizeunit : "");
    var sizeDisplay =
      (!isMobile && sizeValue && sizeUnit)
        ? ('<div class="product-size"><i class="fas fa-weight-hanging"></i> الحجم: ' + escapeHtml(sizeValue) + " " + escapeHtml(sizeUnit) + "</div>")
        : "";

    var bundleInfoHTML =
  (!isMobile && pricing.hasBundle)
    ? ('<div class="bundle-info">عرض حزمة: ' + escapeHtml(pricing.offerLabelLong || pricing.offerLabelShort || "") + "</div>")
    : "";



    var descToggleHTML = !isMobile
      ? '<span class="desc-toggle" onclick="toggleDescription(this)"><i class="fas fa-chevron-down"></i></span>'
      : "";

    html +=
      '<div class="' + cardClass + '" data-product-id="' + escapeAttr(p.id) + '">' +
        '<div class="product-image-container">' +
          productImageHTML(p, { priority: priorityImg }) +
          '<div class="product-badges">' +
            badgeHTML +
            inactiveBadge +
          "</div>" +
        "</div>" +

        '<div class="product-info">' +
          '<h3 class="product-title"' + (!isMobile ? ' onclick="toggleDescription(this)"' : "") + ">" +
            escapeHtml(p && p.name ? p.name : "") +
            descToggleHTML +
          "</h3>" +
          sizeDisplay +
          '<p class="product-desc">' + escapeHtml(p && p.description ? p.description : "") + "</p>" +
          bundleInfoHTML +

          '<div class="price-container">' +
            priceHTML +
            "<button class=\"add-btn\" " + btnClick + " " + btnState + ">" +
              '<i class="fas ' + btnIcon + '"></i> ' + btnText +
            "</button>" +
          "</div>" +
        "</div>" +
      "</div>";
  }

  grid.innerHTML = html;
}

function toggleDescription(el) {
  // Click may come from title or chevron; find closest card
  var card = closestEl(el, ".product-card");
  if (!card) return;
  toggleClass(card, "desc-open");
}

/* =========================
   OFFERS
========================= */

function renderOfferProducts() {
  var offersGrid = $("offers-grid");
  var noOffers = $("no-offers");
  if (!offersGrid || !noOffers) return;

  var list = Array.isArray(productsData) ? productsData : [];
  if (list.length === 0) {
    offersGrid.innerHTML = "";
    noOffers.style.display = "block";
    return;
  }

  var offerProducts = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (isProductActive(p) && hasOffer(p) && isOfferActive(p)) {
      offerProducts.push(p);
    }
  }

  if (offerProducts.length === 0) {
    offersGrid.innerHTML = "";
    noOffers.style.display = "block";
    return;
  }

  noOffers.style.display = "none";

  var isMobile = window.innerWidth <= 992;
  var html = "";

  for (var j = 0; j < offerProducts.length; j++) {
    var p2 = offerProducts[j];
    var pricing = calculatePrice(p2);

    var priceHTML = "";
    var badgeHTML = "";

    if (pricing.hasDiscount) {
      priceHTML =
        '<div class="price-wrapper">' +
          '<span class="price-old">' + pricing.originalPrice.toFixed(2) + " " + CURRENCY + "</span>" +
          '<span class="price-new discount">' + pricing.finalPrice.toFixed(2) + " " + CURRENCY + "</span>" +
        "</div>";

      badgeHTML =
        '<div class="discount-badge">' +
          (isMobile ? (pricing.discountPercent + "%") : ("خصم " + pricing.discountPercent + "%")) +
        "</div>";

    } else if (pricing.hasBundle) {
  priceHTML =
    '<div class="price-wrapper">' +
      '<span class="price-old">' + pricing.originalPrice.toFixed(2) + " " + CURRENCY + "</span>" +
      '<span class="price-new bundle">' + pricing.bundleInfo.unitPrice.toFixed(2) + " " + CURRENCY + "</span>" +
    "</div>";

  badgeHTML =
    '<div class="bundle-badge">' +
      (isMobile ? (pricing.offerLabelShort || pricing.badgeText || "عرض") : (pricing.offerLabelLong || pricing.offerLabelShort || "عرض")) +
    "</div>";


    } else {
      priceHTML =
        '<div class="price-wrapper">' +
          '<span class="price-new">' + pricing.originalPrice.toFixed(2) + " " + CURRENCY + "</span>" +
        "</div>";

      badgeHTML = '<div class="neutral-badge">متوفر</div>';
    }

    var sizeValue = strTrim(p2 && p2.sizevalue ? p2.sizevalue : "");
    var sizeUnit = strTrim(p2 && p2.sizeunit ? p2.sizeunit : "");
    var sizeDisplay = "";
    if (!isMobile && sizeValue && sizeUnit) {
      sizeDisplay =
        '<div class="product-size">' +
          '<i class="fas fa-weight-hanging"></i> الحجم: ' +
          escapeHtml(sizeValue) + " " + escapeHtml(sizeUnit) +
        "</div>";
    }

    var bundleInfoHTML = "";
    if (!isMobile && pricing.hasBundle) {
      bundleInfoHTML = '<div class="bundle-info">عرض حزمة: ' + escapeHtml(pricing.bundleText) + "</div>";
    }

    var descToggleHTML = "";
    if (!isMobile) {
      descToggleHTML =
        '<span class="desc-toggle" onclick="toggleDescription(this)">' +
          '<i class="fas fa-chevron-down"></i>' +
        "</span>";
    }

    html +=
      '<div class="product-card" data-product-id="' + escapeAttr(p2.id) + '">' +
        '<div class="product-image-container">' +
          productImageHTML(p2, {}) +
          '<div class="product-badges">' + badgeHTML + "</div>" +
        "</div>" +

        '<div class="product-info">' +
          '<h3 class="product-title" onclick="toggleDescription(this)">' +
            escapeHtml(p2 && p2.name ? p2.name : "") +
            descToggleHTML +
          "</h3>" +
          sizeDisplay +
          '<p class="product-desc">' + escapeHtml(p2 && p2.description ? p2.description : "") + "</p>" +
          bundleInfoHTML +

          '<div class="price-container">' +
            priceHTML +
            '<button class="add-btn" onclick="addToCartWithGoldEffect(\'' + escapeAttr(p2.id) + '\')">' +
              '<i class="fas fa-plus"></i> ' + (isMobile ? "أضف" : "أضف للسلة") +
            "</button>" +
          "</div>" +
        "</div>" +
      "</div>";
  }

  offersGrid.innerHTML = html;

  try { initializeOverlayButtons(); } catch (e) {}
}

/* =========================
   OFFER TIMER
========================= */

var offerTimerIntervalId = null;

function initOfferTimer() {
  if (offerTimerIntervalId) clearInterval(offerTimerIntervalId);

  var endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);

  function updateTimer() {
    var now = Date.now();
    var distance = endDate.getTime() - now;

    var t = document.querySelector(".timer");
    if (!t) return;

    if (distance < 0) {
      t.innerHTML = "<div>انتهت العروض</div>";
      return;
    }

    var days = Math.floor(distance / (1000 * 60 * 60 * 24));
    var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((distance % (1000 * 60)) / 1000);

    var d = $("days");
    if (d) d.textContent = pad2(days);
    var h = $("hours");
    if (h) h.textContent = pad2(hours);
    var m = $("minutes");
    if (m) m.textContent = pad2(minutes);
    var s = $("seconds");
    if (s) s.textContent = pad2(seconds);
  }

  updateTimer();
  offerTimerIntervalId = setInterval(updateTimer, 1000);
}

/* =========================
   CART
========================= */

function normalizePhoneForWhatsApp(input) {
  var raw = strTrim(input || "");
  if (!raw) return "";

  var s = raw.replace(/[^\d+]/g, "");
  if (includesStr(s, "+")) s = "+" + s.replace(/\+/g, "");
  s = s.replace(/\+/g, "");
  if (startsWith(s, "00")) s = s.slice(2);
  if (s.length < 8) return "";
  return s;
}

function cartStorageKey() {
  return "cart:" + STORE_SLUG;
}

function loadCart() {
  try {
    var raw = localStorage.getItem(cartStorageKey());
    cart = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch (e) {
    cart = [];
  }
}

function saveCart() {
  try {
    localStorage.setItem(cartStorageKey(), JSON.stringify(cart));
  } catch (e) {}
  updateCartCount();
  renderCartItems();
}

function updateCartCount() {
  var totalItems = 0;
  if (Array.isArray(cart)) {
    for (var i = 0; i < cart.length; i++) totalItems += (Number(cart[i].qty) || 0);
  }

  var badge = $("cart-badge");
  if (badge) badge.textContent = String(totalItems);

  var empty = document.querySelector(".cart-empty");
  var summary = $("cart-summary");

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
  var cm = $("cartModal");
  if (!cm) return;
  addClass(cm, "active");
  document.body.style.overflow = "hidden";
}

function closeCart() {
  var cm = $("cartModal");
  if (!cm) return;
  removeClass(cm, "active");
  document.body.style.overflow = "auto";
}

function initCartModalClose() {
  var cm = $("cartModal");
  if (!cm) return;

  cm.addEventListener("click", function (e) {
    if (e && e.target === cm) closeCart();
  });

  var closeBtn = $("cartClose");
  if (closeBtn) closeBtn.addEventListener("click", closeCart);

  var openBtn = $("cartOpen");
  if (openBtn) openBtn.addEventListener("click", openCart);
}

function findProductById(productId) {
  var list = Array.isArray(productsData) ? productsData : [];
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].id) === String(productId)) return list[i];
  }
  return null;
}

function findCartItemById(productId) {
  for (var i = 0; i < cart.length; i++) {
    if (String(cart[i].id) === String(productId)) return cart[i];
  }
  return null;
}

function addToCart(productId) {
  var p = findProductById(productId);
  if (!p) return;

  var pricing = calculatePrice(p);

  var existing = findCartItemById(productId);
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
      bundleText: pricing.offerLabelShort || pricing.offerLabelLong || ""
    });
  }

  saveCart();
}

function removeFromCart(productId) {
  var out = [];
  for (var i = 0; i < cart.length; i++) {
    if (String(cart[i].id) !== String(productId)) out.push(cart[i]);
  }
  cart = out;
  saveCart();
}

function changeQty(productId, delta) {
  var item = findCartItemById(productId);
  if (!item) return;
  item.qty = (Number(item.qty) || 0) + Number(delta || 0);

  if (item.qty <= 0) removeFromCart(productId);
  else saveCart();
}

function calculateCartItemPrice(item) {
  var qty = Number(item.qty) || 0;

  if (item.hasBundle && item.bundleInfo) {
    var bq = Number(item.bundleInfo.qty) || 0;
    var bp = Number(item.bundleInfo.bundlePrice) || 0;

    if (bq > 0) {
      var bundles = Math.floor(qty / bq);
      var remainder = qty % bq;
      return bundles * bp + remainder * Number(item.originalPrice || 0);
    }
    return qty * Number(item.originalPrice || 0);
  }

  if (item.hasDiscount) return qty * Number(item.finalPrice || 0);

  return qty * Number(item.originalPrice || 0);
}

function renderCartItems() {
  var container = $("cart-items");
  if (!container) return;

  var summaryEl = $("cart-summary");
  var subtotalEl = $("cart-subtotal");
  var shippingEl = $("cart-shipping");
  var totalEl = $("cart-total");

  var items = Array.isArray(cart) ? cart : [];

  if (items.length === 0) {
    container.innerHTML =
      '<div class="cart-empty">' +
        '<i class="fas fa-shopping-basket"></i>' +
        "<p>سلة المشتريات فارغة</p>" +
      "</div>";

    if (summaryEl) summaryEl.style.display = "none";
    if (subtotalEl) subtotalEl.textContent = "0.00 " + CURRENCY;
    if (shippingEl) shippingEl.textContent = "مجاني";
    if (totalEl) totalEl.textContent = "0.00 " + CURRENCY;
    return;
  }

  if (summaryEl) summaryEl.style.display = "block";

  var subtotal = 0;
  var html = "";

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var qty = Number(item.qty) || 0;
    var itemTotal = calculateCartItemPrice(item);
    subtotal += itemTotal;

    var priceDisplay = "";

    if (item.hasBundle && item.bundleInfo) {
      var bundleQty = Number(item.bundleInfo.qty) || 0;
      var bundles = bundleQty > 0 ? Math.floor(qty / bundleQty) : 0;

      if (bundles > 0) {
        priceDisplay =
          '<div class="item-price">' +
            '<span class="old-price">' + Number(item.originalPrice || 0).toFixed(2) + " " + CURRENCY + "</span>" +
            Number(item.bundleInfo.unitPrice || 0).toFixed(2) + " " + CURRENCY +
            '<div class="bundle-note">(' + escapeHtml(item.bundleText || "") + ")</div>" +
          "</div>";
      } else {
        priceDisplay =
          '<div class="item-price">' +
            Number(item.originalPrice || 0).toFixed(2) + " " + CURRENCY +
            '<div class="bundle-note">(العرض يبدأ عند ' + escapeHtml(bundleQty || 0) + ")</div>" +
          "</div>";
      }
    } else if (item.hasDiscount) {
      priceDisplay =
        '<div class="item-price">' +
          '<span class="old-price">' + Number(item.originalPrice || 0).toFixed(2) + " " + CURRENCY + "</span>" +
          Number(item.finalPrice || 0).toFixed(2) + " " + CURRENCY +
        "</div>";
    } else {
      priceDisplay =
        '<div class="item-price">' + Number(item.originalPrice || 0).toFixed(2) + " " + CURRENCY + "</div>";
    }

    var sizeInfo =
      item.sizeValue && item.sizeUnit
        ? '<div class="item-size">' + escapeHtml(item.sizeValue) + " " + escapeHtml(item.sizeUnit) + "</div>"
        : "";

    html +=
      '<div class="cart-item">' +
        '<div class="item-info">' +
          '<div class="item-name">' + escapeHtml(item.name || "") + "</div>" +
          sizeInfo +
          priceDisplay +
          '<div style="color: var(--accent-dark); font-weight: 900; margin-top: 6px;">' +
            "المجموع: " + Number(itemTotal || 0).toFixed(2) + " " + CURRENCY +
          "</div>" +
        "</div>" +
        '<div class="item-controls">' +
          '<button onclick="changeQty(\'' + escapeAttr(item.id) + '\', -1)">-</button>' +
          '<span class="item-qty">' + String(qty) + "</span>" +
          '<button onclick="changeQty(\'' + escapeAttr(item.id) + '\', 1)">+</button>' +
          '<button class="remove-item-btn" onclick="removeFromCart(\'' + escapeAttr(item.id) + '\')">' +
            '<i class="fas fa-trash"></i>' +
          "</button>" +
        "</div>" +
      "</div>";
  }

  container.innerHTML = html;

  var shippingEnabled =
    STORE_DATA.shipping === true ||
    (typeof STORE_DATA.shipping === "string" && String(STORE_DATA.shipping).toLowerCase() === "true") ||
    STORE_DATA.shipping === 1;

  var shippingPrice = shippingEnabled ? (parseFloat(STORE_DATA.shipping_price) || 0) : 0;
  var total = subtotal + shippingPrice;

  if (subtotalEl) subtotalEl.textContent = subtotal.toFixed(2) + " " + CURRENCY;
  if (shippingEl) shippingEl.textContent = shippingPrice > 0 ? (shippingPrice.toFixed(2) + " " + CURRENCY) : "مجاني";
  if (totalEl) totalEl.textContent = total.toFixed(2) + " " + CURRENCY;
}

function buildOrderMessage() {
  var items = Array.isArray(cart) ? cart : [];
  if (items.length === 0) return "";

  var subtotal = 0;
  var lines = [];

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var qty = Number(it.qty) || 0;
    var itemTotal = calculateCartItemPrice(it);
    subtotal += itemTotal;

    var size = (it.sizeValue && it.sizeUnit) ? (" (" + it.sizeValue + " " + it.sizeUnit + ")") : "";
    lines.push(
      (i + 1) + ") " + (it.name || "") + size + "\n" +
      "   الكمية: " + qty + "\n" +
      "   المجموع: " + itemTotal.toFixed(2) + " " + CURRENCY
    );
  }

  var shippingEnabled =
    STORE_DATA.shipping === true ||
    (typeof STORE_DATA.shipping === "string" && String(STORE_DATA.shipping).toLowerCase() === "true") ||
    STORE_DATA.shipping === 1;

  var shippingPrice = shippingEnabled ? (parseFloat(STORE_DATA.shipping_price) || 0) : 0;
  var total = subtotal + shippingPrice;

  var header = ("طلب جديد من المتجر: " + ((STORE_DATA && STORE_DATA.store_name) ? STORE_DATA.store_name : "")).replace(/^\s+|\s+$/g, "");
  var shipText = shippingEnabled ? (shippingPrice > 0 ? (shippingPrice.toFixed(2) + " " + CURRENCY) : "مجاني") : "غير متوفر";

  var footer =
    "-------------------------\n" +
    "الإجمالي الفرعي: " + subtotal.toFixed(2) + " " + CURRENCY + "\n" +
    "الشحن: " + shipText + "\n" +
    "الإجمالي: " + total.toFixed(2) + " " + CURRENCY + "\n\n" +
    "شكراً لكم 🌟";

  return header + "\n\n" + lines.join("\n\n") + "\n" + footer;
}

function checkout() {
  var items = Array.isArray(cart) ? cart : [];
  if (items.length === 0) {
    alert("سلة المشتريات فارغة");
    return;
  }

  var message = buildOrderMessage();
  if (!message) {
    alert("تعذر إنشاء رسالة الطلب");
    return;
  }

  var waRaw = (STORE_DATA && STORE_DATA.whatsapp) || (STORE_DATA && STORE_DATA.phone) || "";
  var waNumber = normalizePhoneForWhatsApp(waRaw);

  if (!waNumber) {
    alert("لا يوجد رقم واتساب/هاتف صحيح للمتجر");
    return;
  }

  var url = "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(message);
  window.open(url, "_blank", "noopener,noreferrer");
}

/* =========================
   BOOTSTRAP (ONE & ONLY ONE)
========================= */

document.addEventListener("DOMContentLoaded", function () {
  // Demo category buttons (optional)
  try { initializeCategories(); } catch (e0) {}

  // Wire demo category filter buttons to real filter
  try {
    var catBtns = qsa(".cat-btn");
    forEachNodeList(catBtns, function (btn) {
      btn.addEventListener("click", function () {
        var category = getDataAttr(this, "category") || this.getAttribute("data-category") || "";
        filterProductsByCategory(category);

        var all = qsa(".cat-btn");
        forEachNodeList(all, function (b) { removeClass(b, "active"); });
        addClass(this, "active");
      });
    });
  } catch (e1) {}

  var yearEl = $("current-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // UI init that doesn't depend on data
  try { initNavigation(); } catch (e2) {}
  try { initCartModalClose(); } catch (e3) {}

  try {
    // will use STORE_SLUG once set, but safe even if empty
    loadCart();
    updateCartCount();
  } catch (e4) {}

  // Main async flow (ES5): promise chain
  initStoreSlug()
    .then(function (slug) {
      STORE_SLUG = slug;

      // reload cart with correct key once slug exists
      try {
        loadCart();
        updateCartCount();
      } catch (e5) {}

      // 1) CDN first (optional)
      return loadPublicBundleFromCDN().then(function (cdnBundle) {
        if (cdnBundle && applyAnyBundle(cdnBundle)) {
          initOfferTimer();
          showPage(currentPage);
          initUXEnhancements();
          return null; // stop chain
        }

        // 2) ONE call: publicBundle
        return loadPublicBundle().then(function (bundleJson) {
          applyPublicBundle(bundleJson);
           console.log("BUNDLE JSON:", bundleJson);
           


          initOfferTimer();
          showPage(currentPage);
          initUXEnhancements();
          return null;
        });
      });
    })
    .catch(function (e) {
      try { console.error(e); } catch (e0) {}
      var loadingEl = $("loading");
      if (loadingEl) {
        loadingEl.style.display = "block";
        loadingEl.innerHTML =
          '<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:16px;border:1px solid rgba(16,24,40,.08);box-shadow:var(--shadow)">' +
            "حدث خطأ. تأكد من رابط المتجر ثم أعد المحاولة." +
          "</div>";
      }
    });
});
