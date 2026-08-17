import { requireAuth, json } from '../../_auth.js';

export async function onRequestPost(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const id = Number(context.params?.id);
  const ownerId = String(auth.user.id);

  const sale = await db.prepare('SELECT * FROM sales WHERE id = ? AND owner_id = ?')
    .bind(id, ownerId).first();
  if (!sale) return json({ error: 'Продажа не найдена' }, 404);
  if (sale.cancelled) return json({ ok: true });

  const items = JSON.parse(sale.items_json || '[]');
  const productIds = [...new Set(items.map(i => Number(i.productId)).filter(Boolean))];
  const products = new Map();
  for (const productId of productIds) {
    const row = await db.prepare('SELECT * FROM products WHERE id = ? AND owner_id = ?')
      .bind(productId, ownerId).first();
    if (row) products.set(productId, row);
  }

  const restored = new Map();
  for (const item of items) {
    const productId = Number(item.productId);
    const size = String(item.size);
    const byProduct = restored.get(productId) || {};
    byProduct[size] = (byProduct[size] || 0) + Number(item.quantity || 0);
    restored.set(productId, byProduct);
  }

  const statements = [];
  for (const [productId, sizeRestores] of restored) {
    const row = products.get(productId);
    if (!row) continue;
    const sizes = JSON.parse(row.sizes_json || '{}');
    for (const [size, qty] of Object.entries(sizeRestores)) {
      sizes[size] = Number(sizes[size] || 0) + Number(qty || 0);
    }
    statements.push(db.prepare(
      'UPDATE products SET sizes_json = ?, version = version + 1 WHERE id = ? AND owner_id = ? AND version = ?'
    ).bind(JSON.stringify(sizes), productId, ownerId, Number(row.version || 1)));
  }
  statements.push(db.prepare(
    'UPDATE sales SET cancelled = 1 WHERE id = ? AND owner_id = ? AND cancelled = 0'
  ).bind(id, ownerId));

  try {
    await db.batch(statements);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Не удалось отменить продажу. Обновите страницу и попробуйте снова.' }, 409);
  }
}
