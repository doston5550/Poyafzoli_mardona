import { requireAuth, json } from '../_auth.js';

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const from = new Date(url.searchParams.get('from'));
  const to = new Date(url.searchParams.get('to'));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 10)));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return json({ error: 'Неверный период' }, 400);
  }

  const { results } = await db.prepare(`
    SELECT items_json FROM sales
    WHERE owner_id = ? AND cancelled = 0 AND datetime(date) >= datetime(?) AND datetime(date) <= datetime(?)
  `).bind(String(auth.user.id), from.toISOString(), to.toISOString()).all();

  const map = {};
  for (const row of results) {
    for (const item of JSON.parse(row.items_json || '[]')) {
      const key = `${item.productId}_${item.size}`;
      if (!map[key]) {
        map[key] = { productName: item.productName, size: item.size, totalQty: 0, totalAmount: 0, totalProfit: 0 };
      }
      map[key].totalQty += Number(item.quantity || 0);
      map[key].totalAmount += Number(item.sellPrice || 0) * Number(item.quantity || 0);
      map[key].totalProfit += (Number(item.sellPrice || 0) - Number(item.purchasePrice || 0)) * Number(item.quantity || 0);
    }
  }

  const top = Object.values(map).sort((a, b) => b.totalQty - a.totalQty).slice(0, limit);
  return json({ top });
}
