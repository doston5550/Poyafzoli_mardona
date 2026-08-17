const encoder = new TextEncoder();

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, data);
}

export async function authenticate(context) {
  const initData = context.request.headers.get('X-Telegram-Init-Data') || '';
  const botToken = context.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return { error: 'На Cloudflare не задан TELEGRAM_BOT_TOKEN' };
  }
  if (!initData) {
    return { error: 'Нет данных Telegram. Откройте приложение через Telegram.' };
  }

  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    const authDate = Number(params.get('auth_date') || 0);
    if (!receivedHash || !authDate) return { error: 'Неверные данные Telegram' };

    // Do not accept an old Mini App login indefinitely.
    if (Math.abs(Date.now() / 1000 - authDate) > 86400) {
      return { error: 'Сессия Telegram устарела. Закройте и снова откройте приложение.' };
    }

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = await hmac(encoder.encode('WebAppData'), encoder.encode(botToken));
    const calculatedHash = hex(await hmac(secretKey, encoder.encode(dataCheckString)));

    if (calculatedHash !== receivedHash) {
      return { error: 'Проверка Telegram не пройдена' };
    }

    const userRaw = params.get('user');
    if (!userRaw) return { error: 'Пользователь Telegram не найден' };
    const user = JSON.parse(userRaw);
    if (!user.id) return { error: 'ID пользователя Telegram не найден' };

    return { user };
  } catch (e) {
    return { error: 'Ошибка проверки Telegram: ' + e.message };
  }
}

export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function requireAuth(context) {
  const auth = await authenticate(context);
  if (auth.error) return { response: json({ error: auth.error }, 401) };
  return { user: auth.user };
}
