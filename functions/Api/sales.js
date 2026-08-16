import { requireAuth, json } from './_auth.js';

function rowToSale(row) {
  return {
    id: row.id,
    date: row.date,
    totalAmount: Number(row.total_amount),
    totalProfit: Number(row.total_profit),
    cancelled: !!row.cancelled,
    comment: row.comment,
    isDebt: !!row.is_debt,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    items: JSON.parse(row.items_json || '[]')
  };
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const id = context.params?.id;

  if (id) {
    const row = await db.prepare(
      'SELECT * FROM sales WHERE id = ? AND owner_id = ?'
    ).bind(Number(id), String(auth.user.id)).first();
    return row ? json(rowToSale(row)) : json({ error: 'Продажа не найдена' }, 404);
  }

  const { results } = await db.prepare(
    'SELECT * FROM sales WHERE owner_id = ? ORDER BY datetime(date) DESC, id DESC'
  ).bind(String(auth.user.id)).all();
  return json({ sales: results.map(rowToSale) });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const sale = await context.request.json();
  const items = Array.isArray(sale.items) ? sale.items : [];
  if (!items.length) return json({ error: 'Корзина пуста' }, 400);

  // Validate stock from the server, then update all affected products and insert the sale atomically.
  const ownerId = String(auth.user.id);
  const productIds = [...new Set(items.map(i => Number(i.productId)).filter(Boolean))];
  const products = new Map();

  for (const productId of productIds) {
    const row = await db.prepare(
      'SELECT * FROM products WHERE id = ? AND owner_id = ?'
    ).bind(productId, ownerId).first();
    if (!row) return json({ error: 'Товар не найден' }, 400);
    products.set(productId, row);
  }

  const requested = new Map();
  for (const item of items) {
    const productId = Number(item.productId);
    const size = String(item.size);
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (!productId || !qty) return json({ error: 'Неверное количество товара' }, 400);
    const byProduct = requested.get(productId) || {};
    byProduct[size] = (byProduct[size] || 0) + qty;
    requested.set(productId, byProduct);
  }

  const updates = [];
  for (const [productId, sizeRequests] of requested) {
    const row = products.get(productId);
    const sizes = JSON.parse(row.sizes_json || '{}');
    for (const [size, qty] of Object.entries(sizeRequests)) {
      const current = Number(sizes[size] || 0);
      if (current < qty) {
        return json({ error: `Недостаточно остатка: ${row.name} р.${size}` }, 400);
      }
      sizes[size] = current - qty;
    }
    updates.push(db.prepare(
      'UPDATE products SET sizes_json = ?, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ?'
    ).bind(JSON.stringify(sizes), productId, ownerId, Number(row.version || 1)));
  }

  const insertSale = db.prepare(`
    INSERT INTO sales
      (owner_id, date, total_amount, total_profit, cancelled, comment, is_debt, client_name, client_phone, items_json)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
  `).bind(
    ownerId,
    sale.date || new Date().toISOString(),
    Number(sale.totalAmount || 0),
    Number(sale.totalProfit || 0),
    sale.comment || null,
    sale.isDebt ? 1 : 0,
    sale.isDebt ? (sale.clientName || null) : null,
    sale.isDebt ? (sale.clientPhone || null) : null,
    JSON.stringify(items)
  );

  try {
    const result = await db.batch([...updates, insertSale]);
    return json({ id: result[result.length - 1]?.meta?.last_row_id });
  } catch (e) {
    return json({ error: 'Не удалось оформить продажу. Возможно, остаток уже изменился. Обновите страницу и попробуйте снова.' }, 409);
  }
}

export async function onRequestPostCancel(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const id = Number(context.params?.id);
  const ownerId = String(auth.user.id);

  const sale = await db.prepare(
    'SELECT * FROM sales WHERE id = ? AND owner_id = ?'
  ).bind(id, ownerId).first();
  if (!sale) return json({ error: 'Продажа не найдена' }, 404);
  if (sale.cancelled) return json({ ok: true });

  const items = JSON.parse(sale.items_json || '[]');
  const productIds = [...new Set(items.map(i => Number(i.productId)).filter(Boolean))];
  const products = new Map();
  for (const productId of productIds) {
    const row = await db.prepare(
      'SELECT * FROM products WHERE id = ? AND owner_id = ?'
    ).bind(productId, ownerId).first();
    if (row) products.set(productId, row);
  }

  const restored = new Map();
  for (const item of items) {
    const productId = Number(item.productId);
    const size = String(item.size);
    const key = `${productId}:${size}`;
    restored.set(key, (restored.get(key) || 0) + Number(item.quantity || 0));
  }

  const updates = [];
  for (const [key, qty] of restored) {
    const [productIdRaw, size] = key.split(':');
    const productId = Number(productIdRaw);
    const row = products.get(productId);
    if (!row) continue;
    const sizes = JSON.parse(row.sizes_json || '{}');
    sizes[size] = Number(sizes[size] || 0) + qty;
    updates.push(db.prepare(
      'UPDATE products SET sizes_json = ?, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ?'
    ).bind(JSON.stringify(sizes), productId, ownerId, Number(row.version || 1)));
  }

  updates.push(db.prepare(
    'UPDATE sales SET cancelled = 1 WHERE id = ? AND owner_id = ? AND cancelled = 0'
  ).bind(id, ownerId));

  try {
    await db.batch(updates);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Не удалось отменить продажу. Обновите страницу и попробуйте снова.' }, 409);
  }
}
