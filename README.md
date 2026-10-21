# فروشگاه چندمحصولی

فروشگاه فارسی و RTL با Next.js 16، React، next-intl، shadcn/ui، فونت محلی یکان‌بخ، PostgreSQL/Prisma و Redis. ویترین، حساب مشتری، ثبت سفارش، مدیریت و worker مستقل در همین پروژه قرار دارند.

کاتالوگ، سفارش و ارسال، تخفیف، ورود موبایلی، مدیریت مشتریان، محتوای سایت، وبلاگ، لید، درخواست موجودی، گزارش‌ها و یادآوری‌ها پیاده شده‌اند. [فهرست امکانات و محدودیت اتصال سرویس‌ها](docs/full-feature-implementation.md) و [شواهد بررسی](docs/design/full-feature-review.md) وضعیت دقیق را مشخص می‌کنند.

## راه‌اندازی

Node.js 22.12+ و Docker Compose لازم است. پورت‌های زیرساخت توسعه فقط روی localhost منتشر می‌شوند.

```bash
npm ci
cp .env.example .env.local
npm run infra:up
npm run db:generate
npm run db:deploy
npm run db:seed
npm run infra:check
npm run dev
```

مقدار تصادفی `BETTER_AUTH_SECRET` و آدرس واقعی `BETTER_AUTH_URL` را در فایل محیط قرار دهید. [راهنمای ساخت مدیر و ورود](docs/authentication.md) را برای راه‌اندازی دسترسی کارکنان ببینید. هیچ حساب یا رمز پیش‌فرضی ساخته نمی‌شود.

در ترمینال دوم:

```bash
npm run worker
npm run worker:ping
```

Worker، Outbox، صف BullMQ، تطبیق پرداخت‌های نامشخص و زمان‌بندی اعلان‌ها را اجرا می‌کند. پیام `Event processed` برای شناسهٔ ping، اجرای مسیر صف را تأیید می‌کند. قواعد پیامک اولیه پیش‌نویس و غیرفعال‌اند. ارسال واقعی نیازمند فعال‌کردن قاعده، تنظیم سرویس و اطلاعات معتبر گیرنده است. نتیجهٔ نامشخص پیامک خودکار تکرار نمی‌شود و برای بررسی مدیر نگه داشته می‌شود.

Next، Prisma و worker ترتیب بارگذاری `.env*` یکسان دارند؛ متغیرهای محیط فرایند اولویت دارند. اسرار درگاه و پیامک فقط در سرور تنظیم شوند. `CHECKOUT_ENABLED=false` پرداخت را غیرفعال نگه می‌دارد. درگاه زرین‌پال به Merchant ID نیاز دارد؛ sandbox و محیط واقعی باید جدا تنظیم شوند.

## مسیرهای اصلی

- `/products` و `/products/[slug]`: فهرست و جزئیات محصول
- `/cart` و `/checkout`: سبد و تسویه‌حساب
- `/account`: سوابق، پیگیری و کیف پول
- `/admin/orders`: سفارش‌ها و پرینت
- `/admin/operations`: مدیریت محتوای فروشگاه و قواعد عملیاتی
- `/admin/desk/customers`: مشتریان؛ میزهای لید، اعلان، موجودی و سبد نیز در پنل در دسترس‌اند
- `/admin/bulk`: ویرایش گروهی و پیش‌نمایش تغییر قیمت اکسل
- `/admin/reports`، `/admin/seo` و `/admin/integrations`
- `/blog` و `/pages/[slug]`: مقالات و صفحات منتشرشده

## داده و استقرار

Seed تکرارپذیر است و دادهٔ موجود را بازنویسی نمی‌کند. محصول تازهٔ seed پیش‌نویس و بدون موجودی است؛ انتشار محصول و قیمت واقعی از پنل مدیریت انجام می‌شود. اجرای دوبارهٔ seed، موجودی یا قیمت تأییدشدهٔ فروشگاه موجود را تغییر نمی‌دهد.

```bash
npm run build
npm start
```

Worker فرایند مستقلی است و باید همراه وب، همیشه اجرا شود. برای اجرای worker در نصب production، `tsx` جزو وابستگی‌های اجرایی است. تولید Prisma و build به ابزارهای توسعه نیاز دارد؛ نصب با `--omit=dev` را پس از مرحلهٔ build انجام دهید و کد worker، فایل‌های تولیدشده و منابع لازم را نگه دارید. فایل‌های رسانهٔ محلی به volume پایدار نیاز دارند؛ ذخیره‌سازی خصوصی S3 نیز پشتیبانی می‌شود. برای محیط اصلی URLها، TLS، پشتیبان‌گیری و secrets مستقل تنظیم شوند. `infra:down` داده‌های volume را حذف نمی‌کند.

تغییر schema روی توسعه: `npm run db:migrate -- --name change_name`. محیط اصلی: `npm run db:deploy` پس از پشتیبان و بررسی SQL. CHECKها و partial indexهای migrationها باید در تغییرات بعدی حفظ شوند.

## بررسی‌ها

```bash
npm run db:validate
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:auth
npm run test:queue
npm run build
```

Integration از PGlite موقت و migration واقعی استفاده می‌کند و دیتابیس کاربر را مصرف نمی‌کند؛ جای تست هم‌زمانی PostgreSQL و استقرار واقعی را نمی‌گیرد. آزمون‌های صف به Redis محلی نیاز دارند و در نبود redis-server با توضیح skip می‌شوند. هیچ تستی پیامک واقعی یا تراکنش بانکی ایجاد نمی‌کند.

`GET /api/health` سلامت فرایند وب را نشان می‌دهد؛ اتصال DB/Redis با `infra:check` جدا بررسی می‌شود. `build:webpack` جایگزین رسمی bundler است. فایل‌های QA در `.data` محلی و خارج از Git هستند.

## مستندات

- [امکانات کامل و اتصال‌ها](docs/full-feature-implementation.md)
- [بررسی اصلاحات](docs/design/full-feature-review.md)
- [معماری](docs/architecture.md)
- [احراز هویت](docs/authentication.md)
- [کاتالوگ و رسانه](docs/catalog.md)
- [قواعد دامنه](docs/domain-rules.md)
- [مرز ماژول‌ها](src/modules/README.md)

### Development preview stability

`npm run dev` uses Webpack to avoid the repeated refresh/recompilation observed with the local Next.js 16.4.2 Turbopack development preview. `npm run dev:turbo` retains the alternative for diagnosis; `npm run build` is unchanged. See `docs/design/motion-system.md` for the motion performance checks and limits.
