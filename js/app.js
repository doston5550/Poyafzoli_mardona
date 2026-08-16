// ==================== UTILITIES ====================

function money(value) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value) + ' смн';
}

function formatDate(d) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(d));
}

function formatDateTime(d) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(d));
}

function formatMonthYear(d) {
  return new Intl.DateTimeFormat('ru-RU', {
    month: 'long', year: 'numeric'
  }).format(new Date(d));
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? '#E53935' : '#323232'};color:white;
    padding:12px 20px;border-radius:8px;font-size:14px;z-index:999;
    max-width:90%;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.2);
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ==================== STATE ====================

let currentPage = 'home';
let cart = [];
let editingProductId = null;
let selectedPhotoData = null;
let reportPeriod = 'day';
let reportDate = new Date();
let saleDate = new Date(); // date for current sale (default today)

// ==================== NAVIGATION ====================

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');

  currentPage = page;
  updateHeader(page);

  // Load data for page
  if (page === 'home') loadHome();
  if (page === 'products') loadProducts();
  if (page === 'sale') loadSaleProducts();
  if (page === 'history') loadHistory();
  if (page === 'inventory') loadInventory();
  if (page === 'reports') loadReports();
}

function updateHeader(page) {
  const titles = {
    home: 'Poyafzoli mardona',
    products: 'Товары',
    sale: 'Новая продажа',
    history: 'История продаж',
    inventory: 'Остатки',
    reports: 'Отчёты',
    settings: 'Настройки',
    'add-product': editingProductId ? 'Редактировать товар' : 'Новый товар'
  };
  document.getElementById('header-title').textContent = titles[page] || 'Poyafzoli mardona';

  const backBtn = document.getElementById('btn-back');
  const settingsBtn = document.getElementById('btn-settings');

  if (page === 'add-product' || page === 'settings') {
    backBtn.classList.remove('hidden');
    settingsBtn.classList.add('hidden');
  } else if (page === 'home') {
    backBtn.classList.add('hidden');
    settingsBtn.classList.remove('hidden');
  } else {
    backBtn.classList.remove('hidden');
    settingsBtn.classList.add('hidden');
  }
}

// ==================== HOME ====================

async function loadHome() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const report = await db.getReport(from, to);

  document.getElementById('today-amount').textContent = money(report.totalAmount);
  document.getElementById('today-profit').textContent = money(report.totalProfit);
  document.getElementById('today-sales').textContent = report.salesCount;
  document.getElementById('today-date').textContent = formatDate(now);
}

// ==================== PRODUCTS ====================

async function loadProducts(filter = '') {
  const list = await db.getAllProducts();
  const container = document.getElementById('products-list');

  let filtered = list;
  if (filter) {
    const q = filter.toLowerCase();
    filtered = list.filter(p => p.name.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="icon">📦</div>
        <div>Нет товаров</div>
        <div class="text-sm mt-8">Нажмите + чтобы добавить</div>
      </div>`;
    return;
  }

  // Sort: in-stock first, out-of-stock at the bottom
  filtered.sort((a, b) => {
    const stockA = Object.values(a.sizes || {}).reduce((s, v) => s + v, 0);
    const stockB = Object.values(b.sizes || {}).reduce((s, v) => s + v, 0);
    if (stockA > 0 && stockB === 0) return -1;
    if (stockA === 0 && stockB > 0) return 1;
    return a.name.localeCompare(b.name, 'ru');
  });

  // Keep products in memory for photo viewer
  window._productsCache = filtered;

  container.innerHTML = filtered.map(p => {
    const stock = Object.values(p.sizes || {}).reduce((s, v) => s + v, 0);
    const outOfStock = stock === 0;
    const photo = p.photo
      ? `<img src="${p.photo}" alt="" onclick="event.stopPropagation(); openPhotoViewerById(${p.id})">`
      : `<div class="no-photo">👟</div>`;

    return `
      <div class="product-item ${outOfStock ? 'out-of-stock' : ''}">
        ${photo}
        <div class="info">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="meta">
            <span class="price">${money(p.sellPrice)}</span>
            · ${outOfStock ? '<span style="color:#E53935;font-weight:600">Нет в наличии</span>' : 'Остаток: ' + stock + ' шт'}
          </div>
          <div class="meta">Закуп: ${money(p.purchasePrice)}</div>
        </div>
        <div class="product-menu-wrap">
          <button class="product-menu-btn" onclick="event.stopPropagation(); toggleProductMenu(${p.id})">⋮</button>
          <div class="product-menu" id="product-menu-${p.id}">
            <button onclick="event.stopPropagation(); editProduct(${p.id}); closeAllProductMenus()">✏️ Редактировать</button>
            <button class="danger" onclick="event.stopPropagation(); deleteProductById(${p.id}); closeAllProductMenus()">🗑️ Удалить</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleProductMenu(id) {
  const menu = document.getElementById('product-menu-' + id);
  const isOpen = menu.classList.contains('open');
  closeAllProductMenus();
  if (!isOpen) menu.classList.add('open');
}

function closeAllProductMenus() {
  document.querySelectorAll('.product-menu.open').forEach(m => m.classList.remove('open'));
}

function openPhotoViewerById(id) {
  const list = window._productsCache || [];
  const p = list.find(x => x.id === id);
  if (!p || !p.photo) return;
  const overlay = document.getElementById('photo-viewer');
  const img = document.getElementById('photo-viewer-img');
  img.src = p.photo;
  overlay.classList.add('open');
}

function openPhotoViewer(src) {
  if (!src) return;
  const overlay = document.getElementById('photo-viewer');
  const img = document.getElementById('photo-viewer-img');
  img.src = src;
  overlay.classList.add('open');
}

function closePhotoViewer() {
  document.getElementById('photo-viewer').classList.remove('open');
}

async function deleteProductById(id) {
  if (!confirm('Удалить этот товар?')) return;
  await db.deleteProduct(id);
  toast('Товар удалён');
  loadProducts();
}

function openAddProduct() {
  editingProductId = null;
  selectedPhotoData = null;
  document.getElementById('product-name').value = '';
  document.getElementById('product-purchase').value = '';
  document.getElementById('product-sell').value = '';
  document.getElementById('photo-preview').innerHTML = `
    <div class="placeholder">📷<br>Добавить фото</div>
    <input type="file" accept="image/*" onchange="onPhotoSelected(event)">`;

  SIZES.forEach(s => {
    document.getElementById('size-' + s).value = '';
  });

  document.getElementById('btn-delete-product').style.display = 'none';
  showPage('add-product');
}

async function editProduct(id) {
  const p = await db.getProduct(id);
  if (!p) return;

  editingProductId = id;
  selectedPhotoData = p.photo || null;

  document.getElementById('product-name').value = p.name;
  document.getElementById('product-purchase').value = p.purchasePrice;
  document.getElementById('product-sell').value = p.sellPrice;

  if (p.photo) {
    document.getElementById('photo-preview').innerHTML = `
      <img src="${p.photo}" alt="">
      <input type="file" accept="image/*" onchange="onPhotoSelected(event)">`;
  } else {
    document.getElementById('photo-preview').innerHTML = `
      <div class="placeholder">📷<br>Добавить фото</div>
      <input type="file" accept="image/*" onchange="onPhotoSelected(event)">`;
  }

  SIZES.forEach(s => {
    const qty = (p.sizes && p.sizes[s]) ? p.sizes[s] : 0;
    document.getElementById('size-' + s).value = qty > 0 ? qty : '';
  });

  document.getElementById('btn-delete-product').style.display = 'block';
  showPage('add-product');
}

function onPhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  // D1 has a 2 MB row limit, so resize/compress product photos before upload.
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      selectedPhotoData = canvas.toDataURL('image/jpeg', 0.75);
      document.getElementById('photo-preview').innerHTML = `
        <img src="${selectedPhotoData}" alt="">
        <input type="file" accept="image/*" onchange="onPhotoSelected(event)">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveProduct() {
  const name = document.getElementById('product-name').value.trim();
  const purchase = parseFloat(document.getElementById('product-purchase').value.replace(',', '.'));
  const sell = parseFloat(document.getElementById('product-sell').value.replace(',', '.'));

  if (!name) { toast('Введите название', 'error'); return; }
  if (isNaN(purchase) || purchase < 0) { toast('Неверная закупочная цена', 'error'); return; }
  if (isNaN(sell) || sell < 0) { toast('Неверная цена продажи', 'error'); return; }

  const sizes = {};
  SIZES.forEach(s => {
    const v = parseInt(document.getElementById('size-' + s).value) || 0;
    sizes[s] = Math.max(0, v);
  });

  const product = {
    name,
    photo: selectedPhotoData,
    purchasePrice: purchase,
    sellPrice: sell,
    sizes,
    createdAt: new Date().toISOString()
  };

  try {
    if (editingProductId) {
      product.id = editingProductId;
      // Keep original createdAt
      const old = await db.getProduct(editingProductId);
      if (old) product.createdAt = old.createdAt;
      await db.updateProduct(product);
      toast('Товар обновлён');
    } else {
      await db.addProduct(product);
      toast('Товар добавлен');
    }
    showPage('products');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  }
}

async function deleteProduct() {
  if (!editingProductId) return;
  if (!confirm('Удалить этот товар?')) return;

  await db.deleteProduct(editingProductId);
  toast('Товар удалён');
  showPage('products');
}

// ==================== SALE ====================

async function loadSaleProducts(filter = '') {
  const list = await db.getAllProducts();
  const withStock = list.filter(p => {
    const stock = Object.values(p.sizes || {}).reduce((s, v) => s + v, 0);
    return stock > 0;
  });

  let filtered = withStock;
  if (filter) {
    const q = filter.toLowerCase();
    filtered = withStock.filter(p => p.name.toLowerCase().includes(q));
  }

  const container = document.getElementById('sale-products-list');

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty"><div class="icon">👟</div><div>Нет товаров в наличии</div></div>`;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const stock = Object.values(p.sizes || {}).reduce((s, v) => s + v, 0);
    const photo = p.photo
      ? `<img src="${p.photo}" alt="">`
      : `<div class="no-photo">👟</div>`;

    return `
      <div class="product-item" onclick="openSizeModal(${p.id})">
        ${photo}
        <div class="info">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="meta">
            <span class="price">${money(p.sellPrice)}</span> · ${stock} шт
          </div>
        </div>
        <div style="font-size:24px;color:var(--accent)">＋</div>
      </div>`;
  }).join('');

  renderCart();
}

let modalProduct = null;
let modalSize = null;
let modalQty = 1;

async function openSizeModal(productId) {
  modalProduct = await db.getProduct(productId);
  if (!modalProduct) return;

  // Find first size with stock
  modalSize = SIZES.find(s => (modalProduct.sizes[s] || 0) > 0) || 40;
  modalQty = 1;

  document.getElementById('modal-product-name').textContent = modalProduct.name;
  document.getElementById('modal-product-price').textContent = money(modalProduct.sellPrice);
  document.getElementById('modal-sell-price').value = modalProduct.sellPrice;

  const chips = document.getElementById('modal-size-chips');
  chips.innerHTML = SIZES.map(s => {
    const qty = modalProduct.sizes[s] || 0;
    const disabled = qty <= 0;
    const selected = s === modalSize;
    return `<button class="chip ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}"
              onclick="${disabled ? '' : `selectSize(${s})`}">
              ${s}${qty > 0 ? ` (${qty})` : ''}
            </button>`;
  }).join('');

  document.getElementById('modal-qty').textContent = modalQty;
  document.getElementById('size-modal').classList.add('open');
}

function selectSize(size) {
  modalSize = size;
  modalQty = 1;
  document.getElementById('modal-qty').textContent = 1;

  document.querySelectorAll('#modal-size-chips .chip').forEach(c => c.classList.remove('selected'));
  event.target.classList.add('selected');
}

function changeQty(delta) {
  const available = modalProduct.sizes[modalSize] || 0;
  let newQty = modalQty + delta;
  if (newQty < 1) newQty = 1;
  if (newQty > available) newQty = available;
  modalQty = newQty;
  document.getElementById('modal-qty').textContent = modalQty;
}

function addToCart() {
  if (!modalProduct || !modalSize) return;

  const available = modalProduct.sizes[modalSize] || 0;
  if (modalQty > available) {
    toast('Недостаточно на складе', 'error');
    return;
  }

  // Allow custom sell price for this sale
  let sellPrice = parseFloat(document.getElementById('modal-sell-price').value.replace(',', '.'));
  if (isNaN(sellPrice) || sellPrice < 0) {
    toast('Введите правильную цену', 'error');
    return;
  }

  // If same product+size already in cart with SAME price — increase qty
  // If different price — add as separate line
  const existing = cart.findIndex(c =>
    c.productId === modalProduct.id && c.size === modalSize && c.sellPrice === sellPrice
  );

  if (existing >= 0) {
    const newQty = cart[existing].quantity + modalQty;
    if (newQty > available) {
      toast('Недостаточно на складе', 'error');
      return;
    }
    cart[existing].quantity = newQty;
  } else {
    cart.push({
      productId: modalProduct.id,
      productName: modalProduct.name,
      size: modalSize,
      quantity: modalQty,
      sellPrice: sellPrice,
      purchasePrice: modalProduct.purchasePrice
    });
  }

  closeModal();
  renderCart();
  toast('Добавлено в корзину');
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

function updateSaleDateLabel() {
  const label = document.getElementById('cart-sale-date-label');
  if (label) label.textContent = formatDate(saleDate);
}

function changeSaleDate() {
  const input = document.getElementById('cart-sale-date-input');
  if (!input) return;
  // set current value as YYYY-MM-DD
  const y = saleDate.getFullYear();
  const m = String(saleDate.getMonth() + 1).padStart(2, '0');
  const d = String(saleDate.getDate()).padStart(2, '0');
  input.value = `${y}-${m}-${d}`;
  input.showPicker ? input.showPicker() : input.click();
}

function onSaleDatePicked(value) {
  if (!value) return;
  const [y, m, d] = value.split('-').map(Number);
  const now = new Date();
  saleDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  updateSaleDateLabel();
}

function renderCart() {
  const bar = document.getElementById('cart-bar');
  if (cart.length === 0) {
    bar.classList.remove('visible');
    return;
  }

  bar.classList.add('visible');
  updateSaleDateLabel();

  const itemsEl = document.getElementById('cart-items');
  itemsEl.innerHTML = cart.map((c, i) => `
    <div class="cart-item">
      <div>${escapeHtml(c.productName)} (р.${c.size}) × ${c.quantity}<br>
        <span style="font-size:12px;color:#888">${money(c.sellPrice)} / шт</span>
      </div>
      <div>
        <strong>${money(c.sellPrice * c.quantity)}</strong>
        <button onclick="removeFromCart(${i})" style="border:none;background:none;color:var(--danger);font-size:18px;margin-left:8px;cursor:pointer">×</button>
      </div>
    </div>
  `).join('');

  const total = cart.reduce((s, c) => s + c.sellPrice * c.quantity, 0);
  const profit = cart.reduce((s, c) => s + (c.sellPrice - c.purchasePrice) * c.quantity, 0);

  document.getElementById('cart-total-amount').textContent = money(total);
  document.getElementById('cart-total-profit').textContent = 'Прибыль: ' + money(profit);
}

function toggleDebtFields(on) {
  const box = document.getElementById('debt-fields');
  if (box) {
    if (on) box.classList.remove('hidden');
    else box.classList.add('hidden');
  }
}

function resetSaleForm() {
  saleDate = new Date();
  const comment = document.getElementById('sale-comment');
  const isDebt = document.getElementById('sale-is-debt');
  const name = document.getElementById('sale-client-name');
  const phone = document.getElementById('sale-client-phone');
  if (comment) comment.value = '';
  if (isDebt) isDebt.checked = false;
  if (name) name.value = '';
  if (phone) phone.value = '';
  toggleDebtFields(false);
}

async function completeSale() {
  if (cart.length === 0) return;

  const totalAmount = cart.reduce((s, c) => s + c.sellPrice * c.quantity, 0);
  const totalProfit = cart.reduce((s, c) => s + (c.sellPrice - c.purchasePrice) * c.quantity, 0);

  const comment = (document.getElementById('sale-comment')?.value || '').trim();
  const isDebt = !!(document.getElementById('sale-is-debt')?.checked);
  const clientName = (document.getElementById('sale-client-name')?.value || '').trim();
  const clientPhone = (document.getElementById('sale-client-phone')?.value || '').trim();

  if (isDebt) {
    if (!clientName) {
      toast('Введите имя клиента (обязательно для долга)', 'error');
      return;
    }
    if (!clientPhone) {
      toast('Введите телефон клиента (обязательно для долга)', 'error');
      return;
    }
  }

  let msg = `Оформить продажу на ${money(totalAmount)}?\nДата: ${formatDate(saleDate)}\nПрибыль: ${money(totalProfit)}`;
  if (isDebt) msg += `\n💳 В ДОЛГ\nКлиент: ${clientName}\nТел: ${clientPhone}`;
  if (comment) msg += `\nКомментарий: ${comment}`;

  if (!confirm(msg)) return;

  const sale = {
    date: saleDate.toISOString(),
    totalAmount,
    totalProfit,
    cancelled: false,
    comment: comment || null,
    isDebt: isDebt,
    clientName: isDebt ? clientName : null,
    clientPhone: isDebt ? clientPhone : null,
    items: cart.map(c => ({
      productId: c.productId,
      productName: c.productName,
      size: c.size,
      quantity: c.quantity,
      sellPrice: c.sellPrice,
      purchasePrice: c.purchasePrice
    }))
  };

  try {
    await db.addSale(sale);
    cart = [];
    resetSaleForm();
    renderCart();
    toast(isDebt ? 'Продажа в долг оформлена!' : 'Продажа оформлена!');
    loadSaleProducts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function closeModal() {
  document.getElementById('size-modal').classList.remove('open');
}

// ==================== HISTORY ====================

async function loadHistory() {
  const sales = await db.getAllSales();
  const container = document.getElementById('history-list');

  if (sales.length === 0) {
    container.innerHTML = `<div class="empty"><div class="icon">🧾</div><div>Продаж пока нет</div></div>`;
    return;
  }

  container.innerHTML = sales.map(s => {
    let badges = '';
    if (s.cancelled) badges = '<span class="badge badge-danger">Отменена</span>';
    else if (s.isDebt) badges = '<span class="badge" style="background:#FFF3E0;color:#E65100">💳 Долг</span>';
    else badges = `<div class="profit">+${money(s.totalProfit)}</div>`;

    let extra = '';
    if (s.isDebt && s.clientName) extra += ` · ${escapeHtml(s.clientName)}`;
    if (s.comment) extra += ` · 💬`;

    return `
    <div class="sale-item ${s.cancelled ? 'cancelled' : ''} ${s.isDebt && !s.cancelled ? 'debt-sale' : ''}" onclick="showSaleDetails(${s.id})">
      <div class="row">
        <div class="amount" style="${s.cancelled ? 'text-decoration:line-through' : ''}">${money(s.totalAmount)}</div>
        ${badges}
      </div>
      <div class="date">${formatDateTime(s.date)} · ${s.items.length} поз.${extra}</div>
    </div>`;
  }).join('');
}

async function showSaleDetails(id) {
  const sale = await db.getSale(id);
  if (!sale) return;

  let html = `
    <div class="modal-handle"></div>
    <h3>Продажа #${sale.id}</h3>
    <div class="text-muted text-sm mb-8">${formatDateTime(sale.date)}</div>
    ${sale.cancelled ? '<div class="badge badge-danger mb-8">ОТМЕНЕНА</div>' : ''}
    ${sale.isDebt ? '<div class="badge mb-8" style="background:#FFF3E0;color:#E65100">💳 ПРОДАЖА В ДОЛГ</div>' : ''}
    ${sale.isDebt && sale.clientName ? `<div class="text-sm mb-4"><strong>Клиент:</strong> ${escapeHtml(sale.clientName)}</div>` : ''}
    ${sale.isDebt && sale.clientPhone ? `<div class="text-sm mb-8"><strong>Телефон:</strong> ${escapeHtml(sale.clientPhone)}</div>` : ''}
    ${sale.comment ? `<div class="text-sm mb-8" style="background:rgba(0,0,0,0.05);padding:8px 10px;border-radius:8px">💬 ${escapeHtml(sale.comment)}</div>` : ''}
  `;

  sale.items.forEach(item => {
    html += `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F0F0F0">
        <div>
          <div class="fw-600">${escapeHtml(item.productName)} (р.${item.size})</div>
          <div class="text-sm text-muted">${item.quantity} × ${money(item.sellPrice)}</div>
        </div>
        <div class="fw-600">${money(item.sellPrice * item.quantity)}</div>
      </div>`;
  });

  html += `
    <div style="margin-top:16px;padding-top:12px;border-top:2px solid #EEE">
      <div style="display:flex;justify-content:space-between;font-size:17px">
        <span>Итого:</span>
        <strong>${money(sale.totalAmount)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;color:var(--accent);margin-top:4px">
        <span>Прибыль:</span>
        <strong>${money(sale.totalProfit)}</strong>
      </div>
    </div>`;

  if (!sale.cancelled) {
    html += `
      <button class="btn btn-outline btn-block mt-16" style="border-color:var(--danger);color:var(--danger)"
              onclick="cancelSale(${sale.id})">
        Отменить продажу
      </button>`;
  }

  html += `<button class="btn btn-primary btn-block mt-8" onclick="closeDetailsModal()">Закрыть</button>`;

  document.getElementById('details-modal-content').innerHTML = html;
  document.getElementById('details-modal').classList.add('open');
}

async function cancelSale(id) {
  if (!confirm('Отменить продажу? Товар вернётся на склад.')) return;
  await db.cancelSale(id);
  closeDetailsModal();
  loadHistory();
  toast('Продажа отменена, товар возвращён');
}

function closeDetailsModal() {
  document.getElementById('details-modal').classList.remove('open');
}

// ==================== INVENTORY ====================

async function loadInventory() {
  const list = await db.getAllProducts();
  const container = document.getElementById('inventory-list');

  let totalPairs = 0;
  let totalValue = 0;

  list.forEach(p => {
    const stock = Object.values(p.sizes || {}).reduce((s, v) => s + v, 0);
    totalPairs += stock;
    totalValue += stock * p.purchasePrice;
  });

  document.getElementById('inv-total-pairs').textContent = totalPairs;
  document.getElementById('inv-total-value').textContent = money(totalValue);

  if (list.length === 0) {
    container.innerHTML = `<div class="empty"><div class="icon">📦</div><div>Нет товаров</div></div>`;
    return;
  }

  container.innerHTML = list.map(p => {
    const stock = Object.values(p.sizes || {}).reduce((s, v) => s + v, 0);
    const photo = p.photo
      ? `<img src="${p.photo}" alt="" style="width:48px;height:48px;border-radius:6px;object-fit:cover">`
      : `<div class="no-photo" style="width:48px;height:48px;font-size:20px">👟</div>`;

    const addedDate = p.createdAt ? formatDate(p.createdAt) : '—';

    const sizeTags = SIZES.map(s => {
      const qty = (p.sizes && p.sizes[s]) || 0;
      return `<span class="size-tag ${qty === 0 ? 'empty' : ''}">${s}: ${qty}</span>`;
    }).join('');

    return `
      <div class="card">
        <div style="display:flex;gap:12px;align-items:center">
          ${photo}
          <div style="flex:1">
            <div class="fw-600">${escapeHtml(p.name)}</div>
            <div class="text-sm text-muted">Всего: ${stock} шт · Закуп: ${money(p.purchasePrice)}</div>
            <div class="text-sm text-muted">Добавлен: ${addedDate}</div>
          </div>
        </div>
        <div class="size-tags">${sizeTags}</div>
      </div>`;
  }).join('');
}

// ==================== REPORTS ====================

async function loadReports() {
  let from, to;
  const d = reportDate;

  if (reportPeriod === 'day') {
    from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    document.getElementById('report-period-label').textContent = formatDate(d);
  } else if (reportPeriod === 'month') {
    from = new Date(d.getFullYear(), d.getMonth(), 1);
    to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    document.getElementById('report-period-label').textContent = formatMonthYear(d);
  } else {
    from = new Date(d.getFullYear(), 0, 1);
    to = new Date(d.getFullYear(), 11, 31, 23, 59, 59);
    document.getElementById('report-period-label').textContent = d.getFullYear();
  }

  const report = await db.getReport(from, to);
  const top = await db.getTopProducts(from, to);

  document.getElementById('rep-amount').textContent = money(report.totalAmount);
  document.getElementById('rep-profit').textContent = money(report.totalProfit);
  document.getElementById('rep-sales').textContent = report.salesCount;
  document.getElementById('rep-items').textContent = report.itemsCount;

  const topEl = document.getElementById('top-products');
  if (top.length === 0) {
    topEl.innerHTML = `<div class="empty text-sm">Нет продаж за этот период</div>`;
  } else {
    topEl.innerHTML = top.map((item, i) => `
      <div class="card" style="padding:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(26,115,232,0.15);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${i + 1}</div>
          <div style="flex:1">
            <div class="fw-600">${escapeHtml(item.productName)} (р.${item.size})</div>
            <div class="text-sm text-muted">Продано: ${item.totalQty} шт · ${money(item.totalAmount)}</div>
          </div>
          <div style="color:var(--accent);font-weight:600;font-size:13px">+${money(item.totalProfit)}</div>
        </div>
      </div>
    `).join('');
  }
}

function setReportPeriod(period) {
  reportPeriod = period;
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.period-tab[data-period="${period}"]`).classList.add('active');
  loadReports();
}

function changeReportDate(delta) {
  if (reportPeriod === 'day') {
    reportDate.setDate(reportDate.getDate() + delta);
  } else if (reportPeriod === 'month') {
    reportDate.setMonth(reportDate.getMonth() + delta);
  } else {
    reportDate.setFullYear(reportDate.getFullYear() + delta);
  }
  loadReports();
}

// ==================== SETTINGS / BACKUP ====================

async function exportBackup() {
  try {
    const data = await db.exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shoe_store_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Резервная копия скачана');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  }
}

function importBackup() {
  document.getElementById('import-file').click();
}

async function onImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm('Импорт заменит все текущие данные. Продолжить?')) {
    e.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.importData(data);
    toast('Данные успешно восстановлены');
    showPage('home');
  } catch (err) {
    toast('Ошибка импорта: ' + err.message, 'error');
  }
  e.target.value = '';
}

// ==================== HELPERS ====================

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== DARK MODE ====================

function isDarkMode() {
  return localStorage.getItem('darkMode') === '1';
}

function applyDarkMode(on) {
  if (on) {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = !!on;
}

function toggleDarkMode(on) {
  localStorage.setItem('darkMode', on ? '1' : '0');
  applyDarkMode(on);
}

// ==================== INIT ====================

async function init() {
  try {
    // Apply saved theme first
    applyDarkMode(isDarkMode());

    // Telegram Mini App support
    if (window.Telegram && Telegram.WebApp) {
      const tg = Telegram.WebApp;
      tg.ready();
      tg.expand();
      tg.MainButton.hide();
    }

    await db.init();
    showPage('home');

    // Register service worker for PWA (works outside Telegram too)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px;text-align:center">
      <h2>Ошибка загрузки</h2>
      <p>${e.message}</p>
      <p style="margin-top:16px;color:#666">Попробуйте открыть в Chrome или обновить страницу</p>
    </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);

// Close product menus when tapping outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.product-menu-wrap')) {
    closeAllProductMenus();
  }
});
