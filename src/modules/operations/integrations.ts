export const integrationCatalog=[
 {key:"kavenegar",name:"کاوه‌نگار",purpose:"کد ورود و پیامک وضعیت سفارش",state:"adapter",needs:"حساب فعال، API key، خط ارسال و قالب ورود",url:"https://kavenegar.com"},
 {key:"mellipayamak",name:"ملی پیامک",purpose:"پیامک وضعیت سفارش و یادآوری",state:"adapter",needs:"نام کاربری، رمز وب‌سرویس و خط ارسال",url:"https://www.melipayamak.com"},
 {key:"baran",name:"حسابداری باران",purpose:"انتقال فاکتور، مشتری و کالا به حسابداری",state:"contract",needs:"نسخهٔ نرم‌افزار، دسترسی وب‌سرویس و قرارداد تبادل اطلاعات",url:""},
 {key:"mahak",name:"حسابداری محک",purpose:"هماهنگی فاکتور، قیمت و موجودی با حسابداری",state:"contract",needs:"نسخهٔ نرم‌افزار و افزونه یا API متناسب با آن",url:"https://www.mahaksoft.com"},
 {key:"topin",name:"تاپین",purpose:"ثبت مرسوله و خدمات ارسال",state:"contract",needs:"حساب فروشنده، شناسهٔ فروشگاه و API سرویس انتخاب‌شده",url:"https://tapin.ir"},
 {key:"ronad",name:"روناد",purpose:"خدمات انبار، بسته‌بندی و ارسال",state:"contract",needs:"حساب عملیاتی و مستندات قرارداد انبارداری",url:"https://ronad.ir"},
 {key:"torob",name:"ترب",purpose:"دریافت اطلاعات قیمت و موجودی محصولات",state:"adapter",needs:"ثبت و تأیید فروشگاه؛ معرفی مسیر /torob_api/v3/products",url:"https://torob.com"},
 {key:"emalls",name:"ایمالز",purpose:"نمایش محصولات در مقایسه‌گر قیمت",state:"registration",needs:"ثبت فروشگاه و تأیید شیوهٔ دریافت محصولات توسط ایمالز",url:"https://emalls.ir"},
 {key:"zarebin",name:"ذره‌بین",purpose:"دیده‌شدن صفحات و محصولات در جست‌وجو",state:"registration",needs:"ثبت سایت و دریافت قرارداد اتصال در صورت ارائهٔ سرویس فروشگاهی",url:"https://zarebin.ir"},
 {key:"goftino",name:"گفتینو",purpose:"گفت‌وگوی آنلاین با بازدیدکننده",state:"adapter",needs:"ثبت‌نام و شناسهٔ عمومی ابزارک",url:"https://www.goftino.com"},
 {key:"raychat",name:"رایچت",purpose:"پاسخ‌گویی و گفت‌وگوی آنلاین",state:"contract",needs:"حساب فعال و کد نصب مخصوص پنل",url:"https://raychat.io"},
 {key:"yektanet",name:"یکتانت",purpose:"تبلیغات و اندازه‌گیری نتیجهٔ کمپین",state:"contract",needs:"حساب تبلیغ‌دهنده و کد رهگیری مخصوص کمپین",url:"https://www.yektanet.com"},
] as const;
