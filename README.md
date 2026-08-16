# Poyafzoli mardona — Cloudflare D1

Бу версия товарлар ва савдоларни телефондаги IndexedDB'да эмас, Cloudflare D1'да сақлайди.

Cloudflare Pages Functions `/api/*` орқали D1 билан ишлайди ва Telegram Mini App `initData` ни `TELEGRAM_BOT_TOKEN` билан серверда текширади.

Керак:
- D1 database
- `schema.sql` ишга туширилган бўлиши
- Pages D1 binding: `DB`
- Production Secret: `TELEGRAM_BOT_TOKEN`

`wrangler.toml` ичидаги `YOUR_D1_DATABASE_ID` Git deploy учун қўшимча маълумот сифатида қолдирилган. Dashboard Binding орқали улаганда `DB` номи асосийси.
