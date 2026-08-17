import { requireAuth, json } from './_auth.js';

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const ownerId = String(auth.user.id);

  const [productsResult, salesResult] = await Promise.all([
    db.prepare('SELECT * FROM products WHERE owner_id = ? ORDER BY id').bind(ownerId).all(),
    db.prepare('SELECT * FROM sales WHERE owner_id = ? ORDER BY id').bind(ownerId).all()
  ]);

  const products = productsResult.results.map(r => ({
    id: r.id, name: r.name, photo: r.photo,
    purchasePrice: Number(r.purchase_price), sellPrice: Number(r.sell_price),
    sizes: JSON.parse(r.sizes_json || '{}'), createdAt: r.created_at
  }));
  const sales = salesResult.results.map(r => ({
    id: r.id, date: r.date, totalAmount: Number(r.total_amount), totalProfit: Number(r.total_profit),
    cancelled: !!r.cancelled, comment: r.comment, isDebt: !!r.is_debt,
    clientName: r.client_name, clientPhone: r.client_phone, items: JSON.parse(r.items_json || '[]')
  }));

  return json({ products, sales, exportedAt: new Date().toISOString(), version: 2 });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const ownerId = String(auth.user.id);
  const data = await context.request.json();
  if (!Array.isArray(data.products) || !Array.isArray(data.sales)) {
    return json({ error: 'Неверный формат файла' }, 400);
  }

  // Clear this user's data only. Other Telegram users are untouched.
  await db.batch([
    db.prepare('DELETE FROM sales WHERE owner_id = ?').bind(ownerId),
    db.prepare('DELETE FROM products WHERE owner_id = ?').bind(ownerId)
  ]);

  const statements = [];
  for (const p of data.products) {
    statements.push(db.prepare(`
      INSERT INTO products (id, owner_id, name, photo, purchase_price, sell_price, sizes_json, created_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      Number(p.id), ownerId, String(p.name || ''), p.photo || null,
      Number(p.purchasePrice || 0), Number(p.sellPrice || 0),
      JSON.stringify(p.sizes || {}), p.createdAt || new Date().toISOString()
    ));
  }
  for (const s of data.sales) {
    statements.push(db.prepare(`
      INSERT INTO sales (id, owner_id, date, total_amount, total_profit, cancelled, comment, is_debt, client_name, client_phone, items_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      Number(s.id), ownerId, s.date || new Date().toISOString(), Number(s.totalAmount || 0), Number(s.totalProfit || 0),
      s.cancelled ? 1 : 0, s.comment || null, s.isDebt ? 1 : 0,
      s.clientName || null, s.clientPhone || null, JSON.stringify(s.items || [])
    ));
  }

  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
  return json({ ok: true });
}
