import { requireAuth, json } from './_auth.js';

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth.response) return auth.response;

  if (!context.env.DB) return json({ error: 'D1 binding DB не подключён' }, 500);
  return json({ ok: true, userId: String(auth.user.id) });
}
