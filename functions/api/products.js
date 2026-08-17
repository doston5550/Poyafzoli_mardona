import { requireAuth, json } from './_auth.js';

function normalizeProduct(input) {
  const sizes = {};
  for (const size of [36,37,38,39,40,41,42,43,44,45]) {
    const value = Number(input?.sizes?.[size] || 0);
    sizes[size] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
  return {
    name: String(input?.name || '').trim(),
    photo: input?.photo || null,
    purchasePrice: Number(input?.purchasePrice || 0),
    sellPrice: Number(input?.sellPrice || 0),
    sizes,
    createdAt: input?.createdAt || new Date().toISOString()
  };
}

function rowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    photo: row.photo,
    purchasePrice: Number(row.purchase_price),
    sellPrice: Number(row.sell_price),
    sizes: JSON.parse(row.sizes_json || '{}'),
    createdAt: row.created_at,
    version: row.version || 1
  };
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  if (!db) return json({ error: 'D1 binding DB не подключён' }, 500);

  const id = context.params?.id;
  if (id) {
    const row = await db.prepare(
      'SELECT * FROM products WHERE id = ? AND owner_id = ?'
    ).bind(Number(id), String(auth.user.id)).first();
    return row ? json(rowToProduct(row)) : json({ error: 'Товар не найден' }, 404);
  }

  const { results } = await db.prepare(
    'SELECT * FROM products WHERE owner_id = ? ORDER BY name COLLATE NOCASE'
  ).bind(String(auth.user.id)).all();
  return json({ products: results.map(rowToProduct) });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const input = await context.request.json();
  const product = normalizeProduct(input);

  if (!product.name) return json({ error: 'Введите название товара' }, 400);
  if (!Number.isFinite(product.purchasePrice) || !Number.isFinite(product.sellPrice)) {
    return json({ error: 'Неверная цена' }, 400);
  }

  const result = await db.prepare(`
    INSERT INTO products
      (owner_id, name, photo, purchase_price, sell_price, sizes_json, created_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    String(auth.user.id), product.name, product.photo,
    product.purchasePrice, product.sellPrice,
    JSON.stringify(product.sizes), product.createdAt
  ).run();

  return json({ id: result.meta.last_row_id });
}

export async function onRequestPut(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const id = Number(context.params?.id);
  if (!id) return json({ error: 'Неверный ID товара' }, 400);

  const input = await context.request.json();
  const product = normalizeProduct(input);
  const old = await db.prepare(
    'SELECT created_at, version FROM products WHERE id = ? AND owner_id = ?'
  ).bind(id, String(auth.user.id)).first();
  if (!old) return json({ error: 'Товар не найден' }, 404);

  await db.prepare(`
    UPDATE products
    SET name = ?, photo = ?, purchase_price = ?, sell_price = ?, sizes_json = ?, version = version + 1
    WHERE id = ? AND owner_id = ?
  `).bind(
    product.name, product.photo, product.purchasePrice, product.sellPrice,
    JSON.stringify(product.sizes), id, String(auth.user.id)
  ).run();

  return json({ id });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const id = Number(context.params?.id);
  if (!id) return json({ error: 'Неверный ID товара' }, 400);

  const sales = await db.prepare(
    'SELECT COUNT(*) AS count FROM sales WHERE owner_id = ? AND cancelled = 0 AND items_json LIKE ?'
  ).bind(String(auth.user.id), `%"productId":${id}%`).first();
  if (Number(sales?.count || 0) > 0) {
    return json({ error: 'Нельзя удалить товар, который уже был продан. Оставьте его с нулевым остатком.' }, 400);
  }

  await db.prepare('DELETE FROM products WHERE id = ? AND owner_id = ?')
    .bind(id, String(auth.user.id)).run();
  return json({ ok: true });
}
