/* Eski Para Market – istemci davranışları (Vanilla JS, aşamalı geliştirme).
 * Tüm formlar JavaScript olmadan da çalışır; bu dosya yalnızca deneyimi iyileştirir. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ---------------- Bildirim (toast) ---------------- */
  function toast(message, opts) {
    opts = opts || {};
    var region = $('#toast-region');
    if (!region) return;
    var el = document.createElement('div');
    el.className = 'toast-msg' + (opts.error ? ' is-error' : '');
    el.setAttribute('role', opts.error ? 'alert' : 'status');
    var span = document.createElement('span');
    span.textContent = message;
    el.appendChild(span);
    if (opts.link) {
      var a = document.createElement('a');
      a.href = opts.link.href;
      a.textContent = opts.link.text;
      el.appendChild(a);
    }
    region.appendChild(el);
    setTimeout(function () { el.remove(); }, opts.error ? 7000 : 4500);
  }

  /* ---------------- Kategori menüsü (disclosure) ---------------- */
  var openToggle = null;
  function closeMega(focusBack) {
    if (!openToggle) return;
    var panel = document.getElementById(openToggle.getAttribute('aria-controls'));
    openToggle.setAttribute('aria-expanded', 'false');
    if (panel) panel.hidden = true;
    if (focusBack) openToggle.focus();
    openToggle = null;
  }
  $$('.cat-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wasOpen = openToggle === btn;
      closeMega(false);
      if (wasOpen) return;
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      openToggle = btn;
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMega(true);
  });
  document.addEventListener('click', function (e) {
    if (openToggle && !e.target.closest('.cat-item')) closeMega(false);
  });
  $$('[data-mega-filter]').forEach(function (input) {
    var list = input.closest('.mega').querySelector('.mega-list');
    input.addEventListener('input', function () {
      var term = input.value.toLocaleLowerCase('tr-TR').trim();
      $$(':scope > li', list).forEach(function (li) {
        li.hidden = term && li.textContent.toLocaleLowerCase('tr-TR').indexOf(term) === -1;
      });
    });
  });

  /* ---------------- Filtre içi arama, sıralama ---------------- */
  $$('[data-facet-search]').forEach(function (input) {
    var list = input.parentElement.querySelector('.check-list');
    input.addEventListener('input', function () {
      var term = input.value.toLocaleLowerCase('tr-TR').trim();
      $$('li', list).forEach(function (li) {
        li.hidden = term && li.textContent.toLocaleLowerCase('tr-TR').indexOf(term) === -1;
      });
    });
  });
  $$('form[data-autosubmit] select').forEach(function (sel) {
    sel.addEventListener('change', function () { sel.form.submit(); });
  });

  /* ---------------- Favoriler ve karşılaştırma (localStorage) ----------------
   * Yalnızca ürün handle'ları saklanır; fiyat/stok her zaman sunucudan gelir. */
  var LIMITS = { favorites: 48, compare: 4 };
  var store = {
    get: function (key) {
      try {
        var v = JSON.parse(localStorage.getItem('epm:' + key) || '[]');
        return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
      } catch (e) { return []; }
    },
    set: function (key, list) {
      try { localStorage.setItem('epm:' + key, JSON.stringify(list)); } catch (e) { /* gizli mod vb. */ }
    },
  };

  function syncLists() {
    ['favorites', 'compare'].forEach(function (key) {
      var list = store.get(key);
      $$('[data-count="' + key + '"]').forEach(function (b) {
        b.textContent = list.length;
        b.hidden = list.length === 0;
      });
      $$('[data-toggle-list="' + key + '"]').forEach(function (btn) {
        var on = list.indexOf(btn.dataset.handle) !== -1;
        btn.setAttribute('aria-pressed', String(on));
        var label = btn.querySelector('[data-label-on]');
        if (label) label.textContent = on ? label.dataset.labelOn : label.dataset.labelOff;
        var aria = btn.getAttribute('aria-label');
        if (aria) btn.setAttribute('aria-label', aria.replace(/ (favorilere ekle|favorilerden çıkar)$/, on ? ' favorilerden çıkar' : ' favorilere ekle'));
      });
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-toggle-list]');
    if (btn) {
      var key = btn.dataset.toggleList;
      var list = store.get(key);
      var i = list.indexOf(btn.dataset.handle);
      if (i === -1) {
        if (list.length >= LIMITS[key]) {
          toast(key === 'compare' ? 'En fazla 4 ürün karşılaştırabilirsiniz.' : 'Favori listesi dolu.', { error: true, link: key === 'compare' ? { href: '/karsilastir', text: 'Listeyi aç' } : null });
          return;
        }
        list.push(btn.dataset.handle);
        toast(key === 'compare' ? 'Karşılaştırma listesine eklendi.' : 'Favorilere eklendi.', { link: key === 'compare' ? { href: '/karsilastir', text: 'Karşılaştır' } : { href: '/favoriler', text: 'Favoriler' } });
      } else {
        list.splice(i, 1);
      }
      store.set(key, list);
      syncLists();
      return;
    }
    var rm = e.target.closest('[data-remove-from]');
    if (rm) {
      var k = rm.dataset.removeFrom;
      store.set(k, store.get(k).filter(function (h) { return h !== rm.dataset.handle; }));
      syncLists();
      renderListViews();
    }
  });
  window.addEventListener('storage', syncLists);

  function renderListViews() {
    $$('[data-list-view]').forEach(function (view) {
      var key = view.dataset.listView;
      var handles = store.get(key);
      if (!handles.length) {
        view.innerHTML = '';
        view.appendChild(document.getElementById(key + '-empty').content.cloneNode(true));
        return;
      }
      var qs = handles.map(function (h) { return 'h=' + encodeURIComponent(h); }).join('&');
      fetch(view.dataset.endpoint + '?' + qs, { headers: { Accept: 'text/html' } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (html) {
          // Parça, aynı kökenden gelen ve sunucuda kaçışlanmış EJS çıktısıdır.
          view.innerHTML = html.trim() || document.getElementById(key + '-empty').innerHTML;
          syncLists();
          enhanceCartForms(view);
        })
        .catch(function () {
          view.innerHTML = '<div class="notice notice-error" role="alert">Liste yüklenemedi. Sayfayı yenileyip tekrar deneyin.</div>';
        });
    });
  }

  /* ---------------- Sepete ekleme (fetch ile, form yedekli) ---------------- */
  function updateCartBadge(cart) {
    var n = cart && cart.totalQuantity ? cart.totalQuantity : 0;
    $$('[data-count="cart"]').forEach(function (b) { b.textContent = n; b.hidden = n === 0; });
    var link = $('.cart-btn');
    if (link) link.setAttribute('aria-label', 'Sepetim, ' + n + ' ürün');
  }

  function enhanceCartForms(root) {
    $$('form[data-cart-form]', root).forEach(function (form) {
      if (form.dataset.enhanced) return;
      form.dataset.enhanced = '1';
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('[type="submit"]');
        var qtyInput = form.querySelector('input[name="quantity"]');
        if (qtyInput && !qtyInput.checkValidity()) { qtyInput.reportValidity(); return; }
        btn.disabled = true;
        var body = new URLSearchParams(new FormData(form));
        fetch('/api/cart/add', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, credentials: 'same-origin' })
          .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
          .then(function (res) {
            if (!res.ok || !res.data.ok) throw new Error((res.data && res.data.message) || 'Ürün sepete eklenemedi.');
            updateCartBadge(res.data.cart);
            toast(res.data.message || 'Ürün sepete eklendi.', { link: { href: '/sepet', text: 'Sepete git' } });
          })
          .catch(function (err) {
            toast(err.message && err.message !== 'Failed to fetch' ? err.message : 'Bağlantı hatası. Lütfen tekrar deneyin.', { error: true });
          })
          .then(function () { btn.disabled = false; });
      });
    });
  }

  /* Sepet sayfası: miktar değişince formu gönder (sunucu PRG ile yeniden çizer). */
  $$('form[data-cart-update] input[name="quantity"]').forEach(function (input) {
    var t;
    input.addEventListener('change', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (!input.checkValidity()) { input.reportValidity(); return; }
        input.closest('.cart-line').classList.add('is-busy');
        input.form.submit();
      }, 400);
    });
  });
  $$('form[data-cart-remove]').forEach(function (form) {
    form.addEventListener('submit', function () { form.closest('.cart-line').classList.add('is-busy'); });
  });

  /* ---------------- Adet seçici ---------------- */
  $$('[data-qty]').forEach(function (box) {
    var input = box.querySelector('input');
    $$('.qty-btn', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var min = Number(input.min) || 1;
        var max = Number(input.max) || 99;
        var v = Math.min(max, Math.max(min, (Number(input.value) || min) + Number(b.dataset.step)));
        input.value = v;
        if (Number(b.dataset.step) > 0 && v === max) toast('Bu ürün için en fazla ' + max + ' adet seçilebilir.');
      });
    });
  });

  /* ---------------- Galeri ve yakınlaştırma ---------------- */
  var gallery = $('[data-gallery]');
  if (gallery) {
    var thumbs = $$('[data-thumb]', gallery);
    var select = function (i) {
      $$('[data-slide]', gallery).forEach(function (s) { s.hidden = Number(s.dataset.slide) !== i; });
      thumbs.forEach(function (t) { t.setAttribute('aria-selected', String(Number(t.dataset.thumb) === i)); t.tabIndex = Number(t.dataset.thumb) === i ? 0 : -1; });
    };
    thumbs.forEach(function (t, idx) {
      t.tabIndex = idx === 0 ? 0 : -1;
      t.addEventListener('click', function () { select(idx); });
      t.addEventListener('keydown', function (e) {
        var next = e.key === 'ArrowRight' ? idx + 1 : e.key === 'ArrowLeft' ? idx - 1 : null;
        if (next === null) return;
        e.preventDefault();
        next = (next + thumbs.length) % thumbs.length;
        select(next);
        thumbs[next].focus();
      });
    });

    var dialog = $('#zoom-dialog');
    var zimg = $('#zoom-img');
    var vp = dialog && $('[data-zoom-viewport]', dialog);
    var zoomed = false;
    var setOrigin = function (x, y) {
      var r = vp.getBoundingClientRect();
      zimg.style.transformOrigin = ((x - r.left) / r.width) * 100 + '% ' + ((y - r.top) / r.height) * 100 + '%';
    };
    var reset = function () { zoomed = false; vp.classList.remove('is-zoomed'); zimg.style.transform = ''; };
    if (dialog && typeof dialog.showModal === 'function') {
      $$('.zoom-trigger', gallery).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var img = btn.querySelector('img');
          zimg.src = btn.dataset.zoomSrc;
          zimg.alt = img.alt;
          reset();
          dialog.showModal();
        });
      });
      vp.addEventListener('click', function (e) {
        zoomed = !zoomed;
        vp.classList.toggle('is-zoomed', zoomed);
        setOrigin(e.clientX, e.clientY);
        zimg.style.transform = zoomed ? 'scale(2.5)' : '';
      });
      vp.addEventListener('pointermove', function (e) { if (zoomed) setOrigin(e.clientX, e.clientY); });
      dialog.addEventListener('close', reset);
      dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    } else {
      // <dialog> desteklenmiyorsa orijinal görsel yeni sekmede açılır.
      $$('.zoom-trigger', gallery).forEach(function (btn) {
        btn.addEventListener('click', function () { window.open(btn.dataset.zoomSrc, '_blank', 'noopener'); });
      });
    }
  }

  syncLists();
  renderListViews();
  enhanceCartForms(document);
})();
