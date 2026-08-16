import { requireAuth, json } from './_auth.js';

function range(url) {
  const from = new Date(url.searchParams.get('from'));
  const to = new Date(url.searchParams.get('to'));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error('Неверный период');
  return { from, to };
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;
  const db = context.env.DB;
  const { from, to } = range(new URL(context.request.url));
  const { results } = await db.prepare(`
    SELECT total_amount, total_profit, items_json
    FROM sales
    WHERE owner_id = ? AND cancelled = 0 AND datetime(date) >= datetime(?) AND datetime(date) <= datetime(?)
  `).bind(String(auth.user.id), from.toISOString(), to.toISOString()).all();

  let totalAmount = 0, totalProfit = 0, itemsCount = 0;
  for (const row of results) {
    totalAmount += Number(row.total_amount || 0);
    totalProfit += Number(row.total_profit || 0);
    for (const item of JSON.parse(row.items_json || '[]')) itemsCount += Number(item.quantity || 0);
  }

  return json({ totalAmount, totalProfit, salesCount: results.length, itemsCount });
}
