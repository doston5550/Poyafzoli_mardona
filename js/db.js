// Cloudflare D1 API wrapper for Shoe Store
// Data is stored online in Cloudflare D1, not in the phone's IndexedDB.

const SIZES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45];

class StoreDB {
  constructor() {
    this.apiBase = './api';
  }

  getTelegramInitData() {
    return window.Telegram?.WebApp?.initData || '';
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');

    const initData = this.getTelegramInitData();
    if (initData) headers.set('X-Telegram-Init-Data', initData);

    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${this.apiBase}/${path}`, {
      ...options,
      headers
    });

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new Error(data?.error || data || `Ошибка сервера (${response.status})`);
    }
    return data;
  }

  async init() {
    if (!this.getTelegramInitData()) {
      throw new Error('Откройте приложение через Telegram Mini App');
    }
    await this.request('health');
  }

  // ---------- PRODUCTS ----------
  async addProduct(product) {
    const result = await this.request('products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
    return result.id;
  }

  async updateProduct(product) {
    const result = await this.request(`products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      body: JSON.stringify(product)
    });
    return result.id;
  }

  async deleteProduct(id) {
    await this.request(`products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async getProduct(id) {
    return this.request(`products/${encodeURIComponent(id)}`);
  }

  async getAllProducts() {
    const result = await this.request('products');
    const list = result.products || [];
    list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return list;
  }

  // ---------- SALES ----------
  async addSale(sale) {
    const result = await this.request('sales', {
      method: 'POST',
      body: JSON.stringify(sale)
    });
    return result.id;
  }

  async cancelSale(saleId) {
    await this.request(`sales/${encodeURIComponent(saleId)}/cancel`, { method: 'POST' });
  }

  async getSale(id) {
    return this.request(`sales/${encodeURIComponent(id)}`);
  }

  async getAllSales() {
    const result = await this.request('sales');
    const list = result.sales || [];
    list.sort((a, b) => new Date(b.date) - new Date(a.date));
    return list;
  }

  // ---------- REPORTS ----------
  async getReport(from, to) {
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString()
    });
    return this.request(`reports?${params.toString()}`);
  }

  async getTopProducts(from, to, limit = 10) {
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      limit: String(limit)
    });
    const result = await this.request(`reports/top?${params.toString()}`);
    return result.top || [];
  }

  // ---------- BACKUP ----------
  async exportData() {
    return this.request('backup');
  }

  async importData(data) {
    return this.request('backup', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

const db = new StoreDB();
