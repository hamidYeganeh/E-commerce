export const notificationDefinitions=[
 ["order.created","ثبت سفارش","سفارش {{number}} ثبت شد. وضعیت پرداخت را در حساب کاربری بررسی کنید."],
 ["order.paid","پرداخت موفق","پرداخت سفارش {{number}} تأیید شد. از خرید شما سپاسگزاریم."],
 ["order.confirmed","تأیید فروشگاه","سفارش {{number}} تأیید شد و در حال آماده‌سازی است."],
 ["order.shipped","ارسال سفارش","سفارش {{number}} ارسال شد. کد رهگیری در حساب کاربری شما قرار دارد."],
 ["order.followup","پیگیری پنج روز پس از ارسال","از سفارش {{number}} راضی بودید؟ تجربهٔ خود را در حساب کاربری ثبت کنید."],
 ["wallet.credited","افزایش اعتبار کیف پول","مبلغ {{amount}} ریال به کیف پول شما اضافه شد."],
 ["cart.abandoned","یادآوری سبد","محصولات انتخابی شما در سبد خرید باقی مانده‌اند. برای بررسی قیمت و موجودی به فروشگاه برگردید."],
 ["stock.available","موجودشدن محصول","محصول {{product}} دوباره موجود شده است. قیمت و موجودی نهایی را در فروشگاه بررسی کنید."],
 ["customer.inactive","مشتریان غیرفعال","دوباره به فروشگاه ما سر بزنید و محصولات تازه را ببینید."],
 ["staff.neworder","اعلان سفارش جدید به مدیر","سفارش جدید {{number}} در فروشگاه ثبت شد."],
 ["staff.ready","یادآوری سفارش آمادهٔ ارسال","سفارش {{number}} آمادهٔ ارسال است."],
] as const;
export type NotificationTopic = typeof notificationDefinitions[number][0];
export const notificationTopics = notificationDefinitions.map(([topic]) => topic);
export const notificationLabels: Record<string,string> = Object.fromEntries(notificationDefinitions.map(([topic,title])=>[topic,title]));

export const templateTokens: Record<string, {template:string;value:string}> = {
 "order.created":{template:"drbizordercreated",value:"number"},"order.paid":{template:"drbizorderpaid",value:"number"},
 "order.confirmed":{template:"drbizorderconfirmed",value:"number"},"order.shipped":{template:"drbizordershipped",value:"number"},
 "order.followup":{template:"drbizorderfollowup",value:"number"},"wallet.credited":{template:"drbizwalletcredit",value:"amount"},
 "stock.available":{template:"drbizrestock",value:"sku"},"staff.neworder":{template:"drbizstaffneworder",value:"number"},"staff.ready":{template:"drbizstaffready",value:"number"},
};
