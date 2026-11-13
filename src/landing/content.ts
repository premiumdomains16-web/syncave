// All landing-page copy, in English and Arabic. Keep both languages in the same
// shape — TypeScript will flag a missing translation.
//
// Honesty rule: only describe features that exist today; anything planned is
// listed with `soon: true` and rendered with a "coming soon" badge.

import type { Plan } from '@shared/types';

export const SUPPORT_EMAIL = 'hello@syncave.example'; // TODO: real inbox once the domain is live

// ---------- Pricing (prices in EGP; change here only) ----------

export interface PlanDef {
  id: Plan;
  monthly: number | null; // null = custom / contact us
  highlighted?: boolean;
}

export const PLANS: PlanDef[] = [
  { id: 'free', monthly: 0 },
  { id: 'starter', monthly: 399 },
  { id: 'business', monthly: 1499, highlighted: true },
  { id: 'agency', monthly: null },
];

/** Yearly billing = 10 months' price (2 months free). */
export const yearlyPerMonth = (monthly: number) => Math.round((monthly * 10) / 12);

// ---------- Copy ----------

interface Feature { title: string; body: string; }
interface PlanCopy { name: string; tagline: string; cta: string; features: { text: string; soon?: boolean }[]; }

export interface LandingCopy {
  nav: { features: string; how: string; pricing: string; faq: string; login: string; start: string; dashboard: string };
  hero: { badge: string; title: string; titleAccent: string; subtitle: string; primary: string; secondary: string; note: string; tryLabel: string; tryPlaceholder: string; tryButton: string };
  chat: { botName: string; online: string; welcome: string; question: string; answer: string; chips: string[]; placeholder: string };
  proof: { title: string; body: string }[];
  features: { eyebrow: string; title: string; subtitle: string; items: Feature[] };
  how: { eyebrow: string; title: string; steps: Feature[]; snippetLabel: string };
  templates: {
    eyebrow: string; title: string; subtitle: string; labels: Record<string, string>;
    pick: string; suggested: string; businessName: string; cta: string; note: string;
    /** Sample chats per template id. When missing (English), the template's own Q&A is used. */
    samples?: Record<string, TemplateSample>;
  };
  pricing: {
    eyebrow: string; title: string; subtitle: string; monthly: string; yearly: string; yearlyBadge: string;
    perMonth: string; currency: string; free: string; custom: string; billedYearly: string; popular: string; soon: string;
    comingSoon: string; availableNow: string;
    plans: Record<Plan, PlanCopy>; footnote: string;
  };
  faq: { eyebrow: string; title: string; items: { q: string; a: string }[] };
  cta: { title: string; subtitle: string; button: string };
  footer: { tagline: string; product: string; contact: string; rights: string };
}

const en: LandingCopy = {
  nav: { features: 'Features', how: 'How it works', pricing: 'Pricing', faq: 'FAQ', login: 'Log in', start: 'Start free', dashboard: 'Open dashboard' },
  hero: {
    badge: 'Built for Arabic-speaking businesses',
    title: 'A website chatbot that',
    titleAccent: 'actually understands Arabic',
    subtitle: 'Syncave answers your visitors in Arabic, Egyptian dialect and English — using only answers you approve. Set it up in minutes, no coding.',
    primary: 'Start free',
    secondary: 'See how it works',
    note: 'Free plan · No credit card',
    tryLabel: 'Or see it on your own website first:',
    tryPlaceholder: 'your-website.com',
    tryButton: 'Preview',
  },
  chat: {
    botName: 'Al Nour Store',
    online: 'Online',
    welcome: 'Hi! Ask me about prices, opening hours or delivery.',
    question: 'how much are your prices?',
    answer: 'Our prices start from **250 EGP**. See the full price list on our site.',
    chips: ['Opening hours?', 'Do you deliver?'],
    placeholder: 'Type a question…',
  },
  proof: [
    { title: 'Arabic, Egyptian & English', body: 'Understands how your customers really type' },
    { title: 'One line of code', body: 'Works on most websites and site builders' },
    { title: 'Your answers only', body: 'Never invents prices or promises' },
  ],
  features: {
    eyebrow: 'Features',
    title: 'Everything you need to answer customers 24/7',
    subtitle: 'Stop answering the same questions on WhatsApp and the phone. Let your website do it.',
    items: [
      { title: 'Understands real questions', body: 'Spelling variants, Egyptian dialect like “عايز أعرف الأسعار كام”, and English — all matched to the right answer.' },
      { title: 'No made-up answers', body: 'The bot only replies with answers you wrote and approved. Anything else gets your own fallback message.' },
      { title: 'Ready-made templates', body: 'Start from an industry template with the common questions already written, then edit them in your words.' },
      { title: 'Collect orders in the chat', body: 'Visitors leave their name, phone and order details. Export everything to Excel anytime.' },
      { title: 'Looks like your brand', body: 'Your colors and logo. The chat switches to Arabic automatically when your content is in Arabic.' },
      { title: 'Edit safely, publish when ready', body: 'Changes stay as a private draft you can test. Visitors see them only when you hit Publish.' },
    ],
  },
  how: {
    eyebrow: 'How it works',
    title: 'Live on your website in four steps',
    steps: [
      { title: 'Add your website', body: 'Enter your address and choose a template for your industry.' },
      { title: 'Write your answers', body: 'Edit the ready questions or add your own, and test them in the live preview.' },
      { title: 'Verify your site', body: 'Paste a small tag to confirm the website is yours.' },
      { title: 'Paste one line & publish', body: 'Add the snippet to your site. The chat bubble appears instantly.' },
    ],
    snippetLabel: 'All it takes on your website:',
  },
  templates: {
    eyebrow: 'Templates',
    title: 'Templates for your industry',
    subtitle: 'Start with questions customers in your field actually ask.',
    pick: 'Pick your industry',
    suggested: 'Customers also ask',
    businessName: 'Your business',
    cta: 'Start with this template',
    note: 'Every answer is editable. These are just a starting point.',
    labels: {
      ecommerce: 'E-commerce', financial: 'Financial services', digital: 'Digital business', support: 'Customer service',
      education: 'Education', hospitality: 'Hotels & hospitality', restaurant: 'Restaurants & cafés', realestate: 'Real estate',
      healthcare: 'Clinics & healthcare', salon: 'Salons & spas', fitness: 'Gyms & fitness', agency: 'Agencies & consulting',
      events: 'Events & booking', nonprofit: 'Non-profits',
    },
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Simple pricing in Egyptian pounds',
    subtitle: 'Start free. Upgrade when your chatbot is bringing you customers.',
    monthly: 'Monthly', yearly: 'Yearly', yearlyBadge: '2 months free',
    perMonth: '/ month', currency: 'EGP', free: 'Free', custom: 'Custom', billedYearly: 'billed yearly', popular: 'Most popular', soon: 'Soon',
    comingSoon: 'Coming soon', availableNow: 'Available now',
    plans: {
      free: {
        name: 'Free', tagline: 'Try Syncave on your website', cta: 'Start free',
        features: [{ text: '1 website' }, { text: 'Up to 20 questions' }, { text: 'Arabic, Egyptian & English' }, { text: 'Industry templates' }, { text: '“Powered by Syncave” label' }],
      },
      starter: {
        name: 'Starter', tagline: 'For a small business website', cta: 'Get Starter',
        features: [{ text: '1 website' }, { text: 'Unlimited questions' }, { text: 'Order collection + Excel export' }, { text: 'Your logo, colors & background' }, { text: 'Remove “Powered by” label', soon: true }],
      },
      business: {
        name: 'Business', tagline: 'For growing companies', cta: 'Get Business',
        features: [{ text: 'Up to 5 websites' }, { text: 'Everything in Starter' }, { text: 'Priority support' }, { text: 'AI answers from your approved content', soon: true }, { text: 'WhatsApp alerts for orders', soon: true }],
      },
      agency: {
        name: 'Agency', tagline: 'For agencies managing client sites', cta: 'Contact us',
        features: [{ text: 'Unlimited client websites' }, { text: 'Reseller pricing' }, { text: 'Everything in Business' }, { text: 'Your own branding (white-label)', soon: true }],
      },
    },
    footnote: 'Paid plans are coming soon. Start free today and we’ll let you know when they launch. Prices include no hidden fees.',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Questions, answered',
    items: [
      { q: 'Do I need technical skills?', a: 'No. You paste one line of code into your website — or send it to whoever manages your site. It works with WordPress, Shopify, custom sites and most builders that allow custom code.' },
      { q: 'Does Syncave use AI?', a: 'Today it answers from the questions and answers you approve, using matching built for Arabic — so it never invents prices or promises. AI-powered answers are coming, and they will also stay limited to content you approve.' },
      { q: 'Which languages does it support?', a: 'Arabic (formal and Egyptian dialect) and English. The chat window switches to Arabic automatically when your content is in Arabic.' },
      { q: 'Will it slow down my website?', a: 'No. It is a single small script that loads on its own without blocking your page.' },
      { q: 'Can I try it before paying?', a: 'Yes. The Free plan is free forever for one website, no credit card needed.' },
      { q: 'What happens to orders customers send?', a: 'They appear in your dashboard instantly, and you can export them to Excel whenever you like.' },
    ],
  },
  cta: { title: 'Let your website answer for you', subtitle: 'Set up your first chatbot in minutes — free.', button: 'Start free' },
  footer: { tagline: 'Arabic-first chatbots for business websites.', product: 'Product', contact: 'Contact', rights: 'All rights reserved.' },
};

export interface TemplateSample { welcome: string; qa: { q: string; a: string }[] }

/** Arabic (Egyptian) sample chats for the landing's template preview. */
const AR_SAMPLES: Record<string, TemplateSample> = {
  ecommerce: { welcome: 'أهلاً! محتاج مساعدة في طلب، استرجاع، أو بتدور على منتج؟', qa: [
    { q: 'طلبي فين؟', a: 'أول ما الطلب يتشحن هيوصلك رابط تتبع على الإيميل أو واتساب. ابعتلنا رقم الطلب ونشوفهولك فوراً.' },
    { q: 'سياسة الاسترجاع إيه؟', a: 'تقدر ترجّع أي منتج خلال 14 يوم من الاستلام، بشرط يكون بحالته الأصلية وفي علبته.' },
    { q: 'الشحن بياخد قد إيه؟', a: 'جوه القاهرة والجيزة من يوم لـ 3 أيام، وباقي المحافظات من 3 لـ 5 أيام عمل.' },
    { q: 'بتقبلوا الدفع إزاي؟', a: 'كاش عند الاستلام، فيزا، فودافون كاش، وإنستاباي.' },
  ] },
  financial: { welcome: 'أهلاً بيك. أقدر أساعدك في الحسابات والمنتجات والأمان، أو أوصلك بممثل خدمة عملاء.', qa: [
    { q: 'إيه أنواع الحسابات عندكم؟', a: 'عندنا حساب جاري، حساب توفير، وشهادات ادخار. قولّي هدفك وأرشحلك الأنسب.' },
    { q: 'أفتح حساب إزاي؟', a: 'تقدر تفتح أغلب الحسابات أونلاين في حوالي 10 دقايق. هتحتاج بطاقة الرقم القومي وإثبات عنوان.' },
    { q: 'فلوسي في أمان؟', a: 'كل العمليات مشفّرة، وبنستخدم تحقق بخطوتين في كل تسجيل دخول.' },
  ] },
  digital: { welcome: 'أهلاً! بتدور على الأسعار، التكاملات، أو عايز ديمو؟', qa: [
    { q: 'الأسعار عاملة إزاي؟', a: 'عندنا باقات شهرية وسنوية، وفي فترة تجربة مجانية 14 يوم من غير كارت.' },
    { q: 'عندكم API؟', a: 'أيوه، عندنا API كامل بتوثيق واضح، وتقدر تعمل المفاتيح من لوحة التحكم.' },
    { q: 'ممكن أحجز ديمو؟', a: 'أكيد! سيبلي إيميلك والوقت المناسب ليك، وفريقنا هيتواصل معاك.' },
  ] },
  support: { welcome: 'أهلاً! أقدر أساعدك إزاي النهارده؟', qa: [
    { q: 'أكلم الدعم إزاي؟', a: 'تقدر تكلمنا على واتساب أو الإيميل، أو تفتح تذكرة من هنا وهنرد عليك في أسرع وقت.' },
    { q: 'مواعيد الدعم إيه؟', a: 'من الأحد للخميس، من 9 الصبح لـ 6 المسا.' },
    { q: 'نسيت الباسورد، أعمل إيه؟', a: 'دوس على "نسيت كلمة السر" في صفحة الدخول، وهيوصلك لينك على الإيميل تغيّرها منه.' },
  ] },
  education: { welcome: 'أهلاً! بتفكر تقدّم أو عندك سؤال عن برنامج؟', qa: [
    { q: 'إيه البرامج اللي عندكم؟', a: 'عندنا برامج في البرمجة والتصميم والتسويق الرقمي، أونلاين وحضوري.' },
    { q: 'آخر ميعاد للتقديم إمتى؟', a: 'التقديم للدفعة الجاية مفتوح لحد آخر الشهر. الأماكن محدودة، فالأفضل تقدّم بدري.' },
    { q: 'المصاريف كام؟', a: 'المصاريف بتختلف حسب البرنامج، وفي تقسيط على 3 أو 6 شهور.' },
  ] },
  hospitality: { welcome: 'أهلاً بيك! أقدر أساعدك في الحجز والخدمات وأي حاجة تحتاجها في إقامتك.', qa: [
    { q: 'أحجز أوضة إزاي؟', a: 'تقدر تحجز من الموقع مباشرة، أو تبعتلنا التواريخ وعدد الأفراد ونأكدلك الحجز.' },
    { q: 'مواعيد الدخول والخروج إيه؟', a: 'الدخول من الساعة 2 الضهر، والخروج لحد الساعة 12 الضهر.' },
    { q: 'الفطار متضمّن؟', a: 'أيوه، فطار البوفيه متضمّن في كل الحجوزات من 7 لـ 10:30 الصبح.' },
  ] },
  restaurant: { welcome: 'أهلاً! عايز تحجز ترابيزة، تشوف المنيو، أو تطلب ديليفري؟', qa: [
    { q: 'أحجز ترابيزة إزاي؟', a: 'قولّي اليوم والساعة وعدد الأفراد، وهنأكدلك الحجز على واتساب.' },
    { q: 'المنيو فيه إيه؟', a: 'عندنا مشويات، باستا، سلطات، وحلويات. تقدر تشوف المنيو كامل بالأسعار من هنا.' },
    { q: 'مواعيدكم إيه؟', a: 'فاتحين كل يوم من 12 الضهر لحد 1 بالليل.' },
  ] },
  realestate: { welcome: 'أهلاً! عايز تشتري، تبيع، ولا تأجّر؟ أقدر أساعدك تلاقي الوحدة المناسبة.', qa: [
    { q: 'أشوف الوحدات المتاحة إزاي؟', a: 'كل الوحدات المتاحة في صفحة العقارات، وتقدر تفلتر بالمنطقة والسعر والمساحة.' },
    { q: 'ممكن أحجز معاينة؟', a: 'أكيد! ابعتلنا الوحدة اللي عاجباك والوقت المناسب، والمندوب هيتواصل معاك.' },
    { q: 'في تقسيط؟', a: 'أيوه، في أنظمة تقسيط لحد 7 سنين على أغلب المشاريع.' },
  ] },
  healthcare: { welcome: 'أهلاً! أقدر أساعدك تحجز ميعاد، أو أجاوبك عن خدماتنا وزيارتك.', qa: [
    { q: 'أحجز ميعاد إزاي؟', a: 'ابعتلنا اسمك ورقم موبايلك والتخصص، وهنكلمك نأكد أقرب ميعاد.' },
    { q: 'بتتعاملوا مع التأمين؟', a: 'بنتعامل مع أغلب شركات التأمين الطبي. ابعتلنا اسم الشركة ونأكدلك.' },
    { q: 'الكشف بكام؟', a: 'سعر الكشف بيختلف حسب التخصص، ويبدأ من 300 جنيه.' },
  ] },
  salon: { welcome: 'أهلاً! أقدر أوريك الخدمات والأسعار والمواعيد المتاحة.', qa: [
    { q: 'أحجز ميعاد إزاي؟', a: 'اختار الخدمة واليوم المناسب، وهنأكدلك الحجز على واتساب.' },
    { q: 'الخدمات والأسعار إيه؟', a: 'قص وسشوار، صبغة، عناية بالبشرة، ومانيكير وباديكير. الأسعار كلها في صفحة الخدمات.' },
    { q: 'مواعيدكم إيه؟', a: 'من 11 الصبح لـ 10 بالليل، كل الأيام ما عدا الاتنين.' },
  ] },
  fitness: { welcome: 'أهلاً! جديد في الجيم أو بتفكر تشترك؟ أقدر أساعدك في الاشتراكات والكلاسات.', qa: [
    { q: 'الاشتراكات بكام؟', a: 'عندنا اشتراك شهري، 3 شهور، وسنوي. وكل ما المدة أطول، السعر أوفر.' },
    { q: 'ممكن يوم تجربة؟', a: 'أيوه، أول زيارة مجاناً! تعالى في أي وقت ومعاك البطاقة.' },
    { q: 'مواعيد الكلاسات إيه؟', a: 'في كلاسات يوجا وكروس فيت وزومبا طول الأسبوع. الجدول كامل في صفحة الكلاسات.' },
  ] },
  agency: { welcome: 'أهلاً! عايز تعرف بنشتغل إزاي، الأسعار، أو تحجز مكالمة؟', qa: [
    { q: 'بتقدموا خدمات إيه؟', a: 'تصميم مواقع، سوشيال ميديا، إعلانات ممولة، وتصميم هوية بصرية.' },
    { q: 'الأسعار بتتحسب إزاي؟', a: 'بنشتغل بباقات شهرية أو بسعر ثابت للمشروع، حسب حجم الشغل.' },
    { q: 'ممكن أشوف شغلكم؟', a: 'أكيد! كل المشاريع اللي اشتغلنا عليها موجودة في صفحة أعمالنا.' },
  ] },
  events: { welcome: 'أهلاً! بتدور على تذاكر، الجدول، أو تفاصيل الحدث؟', qa: [
    { q: 'أشتري تذاكر إزاي؟', a: 'التذاكر متاحة أونلاين من صفحة الحجز، وبتوصلك على الإيميل فوراً.' },
    { q: 'الجدول إيه؟', a: 'الأبواب بتفتح الساعة 6، والفقرات بتبدأ 7 بالظبط.' },
    { q: 'المكان فين؟', a: 'المكان في التجمع الخامس، وفي باركينج مجاني جنب المدخل.' },
  ] },
  nonprofit: { welcome: 'أهلاً بيك! أقدر أساعدك في التبرع أو التطوع، أو تعرف أكتر عن شغلنا.', qa: [
    { q: 'أتبرع إزاي؟', a: 'تقدر تتبرع أونلاين بالكارت أو فودافون كاش، أو بتحويل بنكي على حسابنا.' },
    { q: 'رسالتكم إيه؟', a: 'بنساعد الأسر الأكثر احتياجاً في التعليم والرعاية الصحية.' },
    { q: 'أتطوع إزاي؟', a: 'سجّل بياناتك في استمارة التطوع، وهنتواصل معاك بأقرب نشاط مناسب.' },
  ] },
};

const ar: LandingCopy = {
  nav: { features: 'المميزات', how: 'إزاي بيشتغل', pricing: 'الأسعار', faq: 'أسئلة شائعة', login: 'تسجيل الدخول', start: 'ابدأ مجاناً', dashboard: 'افتح لوحة التحكم' },
  hero: {
    badge: 'معمول مخصوص للشركات العربية',
    title: 'شات بوت لموقعك',
    titleAccent: 'بيفهم عربي بجد',
    subtitle: 'Syncave بيرد على زوار موقعك بالعربي والمصري والإنجليزي — بالإجابات اللي إنت موافق عليها بس. جهّزه في دقايق ومن غير برمجة.',
    primary: 'ابدأ مجاناً',
    secondary: 'شوف إزاي بيشتغل',
    note: 'باقة مجانية · من غير كارت بنكي',
    tryLabel: 'أو شوفه على موقعك الأول:',
    tryPlaceholder: 'your-website.com',
    tryButton: 'عاين',
  },
  chat: {
    botName: 'متجر النور',
    online: 'متصل الآن',
    welcome: 'أهلاً بيك! اسألني عن الأسعار أو المواعيد أو التوصيل.',
    question: 'عايز اعرف الاسعار كام',
    answer: 'أسعارنا تبدأ من **250 جنيه**. تقدر تشوف قائمة الأسعار كاملة على موقعنا.',
    chips: ['مواعيد العمل إيه؟', 'بتوصلوا؟'],
    placeholder: 'اكتب سؤالك...',
  },
  proof: [
    { title: 'عربي ومصري وإنجليزي', body: 'بيفهم عملاءك بيكتبوا إزاي فعلاً' },
    { title: 'سطر كود واحد', body: 'بيشتغل على معظم المواقع ومنصات بناء المواقع' },
    { title: 'إجاباتك إنت بس', body: 'عمره ما هيألف سعر أو وعد' },
  ],
  features: {
    eyebrow: 'المميزات',
    title: 'كل اللي محتاجه علشان ترد على عملاءك ٢٤ ساعة',
    subtitle: 'كفاية ترد على نفس الأسئلة على الواتساب والتليفون. خلّي موقعك يرد بدالك.',
    items: [
      { title: 'بيفهم الأسئلة الحقيقية', body: 'الأخطاء الإملائية، واللهجة المصرية زي «عايز أعرف الأسعار كام»، والإنجليزي — وكله بيوصل للإجابة الصح.' },
      { title: 'مفيش إجابات مألّفة', body: 'البوت بيرد بس بالإجابات اللي إنت كتبتها ووافقت عليها. أي سؤال تاني بياخد رسالتك الافتراضية.' },
      { title: 'قوالب جاهزة', body: 'ابدأ بقالب لمجالك فيه الأسئلة الشائعة مكتوبة، وعدّلها بأسلوبك.' },
      { title: 'استقبل الطلبات في الشات', body: 'الزائر يسيب اسمه ورقمه وتفاصيل طلبه، وتقدر تنزّل كل الطلبات على Excel في أي وقت.' },
      { title: 'بشكل علامتك التجارية', body: 'ألوانك واللوجو بتاعك. والشات بيتحوّل للعربي لوحده لما يكون المحتوى بتاعك عربي.' },
      { title: 'عدّل براحتك وانشر لما تجهز', body: 'التعديلات بتفضل مسودة خاصة تقدر تجربها، والزوار مش هيشوفوها غير لما تدوس «نشر».' },
    ],
  },
  how: {
    eyebrow: 'إزاي بيشتغل',
    title: 'يشتغل على موقعك في ٤ خطوات',
    steps: [
      { title: 'ضيف موقعك', body: 'اكتب عنوان موقعك واختار قالب لمجالك.' },
      { title: 'اكتب إجاباتك', body: 'عدّل الأسئلة الجاهزة أو ضيف أسئلتك، وجرّبها في المعاينة المباشرة.' },
      { title: 'أكّد ملكيتك للموقع', body: 'حط كود صغير علشان نتأكد إن الموقع بتاعك.' },
      { title: 'الصق سطر واحد وانشر', body: 'ضيف الكود لموقعك، وأيقونة الشات هتظهر على طول.' },
    ],
    snippetLabel: 'ده كل اللي هتضيفه لموقعك:',
  },
  templates: {
    eyebrow: 'القوالب',
    title: 'قوالب لمجالك',
    subtitle: 'ابدأ بالأسئلة اللي عملاء مجالك بيسألوها فعلاً.',
    pick: 'اختار مجالك',
    suggested: 'العملاء بيسألوا كمان',
    businessName: 'نشاطك',
    cta: 'ابدأ بالقالب ده',
    note: 'كل الإجابات تقدر تعدّلها، دي بس نقطة بداية.',
    samples: AR_SAMPLES,
    labels: {
      ecommerce: 'متاجر إلكترونية', financial: 'خدمات مالية', digital: 'أعمال رقمية', support: 'خدمة العملاء',
      education: 'تعليم', hospitality: 'فنادق وضيافة', restaurant: 'مطاعم وكافيهات', realestate: 'عقارات',
      healthcare: 'عيادات ورعاية صحية', salon: 'صالونات وسبا', fitness: 'جيم ولياقة', agency: 'وكالات واستشارات',
      events: 'مناسبات وحجوزات', nonprofit: 'جمعيات خيرية',
    },
  },
  pricing: {
    eyebrow: 'الأسعار',
    title: 'أسعار بسيطة بالجنيه المصري',
    subtitle: 'ابدأ مجاناً، ورقّي باقتك لما الشات بوت يبدأ يجيبلك عملاء.',
    monthly: 'شهري', yearly: 'سنوي', yearlyBadge: 'شهرين مجاناً',
    perMonth: '/ شهرياً', currency: 'جنيه', free: 'مجاناً', custom: 'حسب الاحتياج', billedYearly: 'بيتدفع سنوياً', popular: 'الأكثر طلباً', soon: 'قريباً',
    comingSoon: 'قريباً', availableNow: 'متاحة دلوقتي',
    plans: {
      free: {
        name: 'مجانية', tagline: 'جرّب Syncave على موقعك', cta: 'ابدأ مجاناً',
        features: [{ text: 'موقع واحد' }, { text: 'لحد ٢٠ سؤال' }, { text: 'عربي ومصري وإنجليزي' }, { text: 'قوالب حسب المجال' }, { text: 'علامة «مدعوم من Syncave»' }],
      },
      starter: {
        name: 'المبتدئة', tagline: 'لموقع شركة صغيرة', cta: 'اختار المبتدئة',
        features: [{ text: 'موقع واحد' }, { text: 'أسئلة بلا حدود' }, { text: 'استقبال الطلبات + تصدير Excel' }, { text: 'اللوجو والألوان والخلفية بتاعتك' }, { text: 'إزالة علامة «مدعوم من»', soon: true }],
      },
      business: {
        name: 'الأعمال', tagline: 'للشركات اللي بتكبر', cta: 'اختار الأعمال',
        features: [{ text: 'لحد ٥ مواقع' }, { text: 'كل مميزات المبتدئة' }, { text: 'دعم بأولوية' }, { text: 'إجابات بالذكاء الاصطناعي من محتواك', soon: true }, { text: 'تنبيهات الطلبات على الواتساب', soon: true }],
      },
      agency: {
        name: 'الوكالات', tagline: 'للوكالات اللي بتدير مواقع عملاء', cta: 'تواصل معانا',
        features: [{ text: 'مواقع عملاء بلا حدود' }, { text: 'أسعار خاصة للموزعين' }, { text: 'كل مميزات الأعمال' }, { text: 'علامتك التجارية الخاصة', soon: true }],
      },
    },
    footnote: 'الباقات المدفوعة قريباً. ابدأ مجاناً النهارده، وهنبلغك أول ما تتاح. من غير أي رسوم مخفية.',
  },
  faq: {
    eyebrow: 'أسئلة شائعة',
    title: 'إجابات أسئلتك',
    items: [
      { q: 'محتاج خبرة تقنية؟', a: 'لأ. هتلصق سطر كود واحد في موقعك — أو تبعته للي بيدير موقعك. بيشتغل مع WordPress وShopify والمواقع المبرمجة ومعظم منصات بناء المواقع اللي بتسمح بإضافة كود.' },
      { q: 'هل Syncave بيستخدم ذكاء اصطناعي؟', a: 'حالياً بيرد من الأسئلة والإجابات اللي إنت بتوافق عليها، بطريقة مطابقة معمولة للعربي — علشان كده عمره ما هيألف سعر أو وعد. الإجابات بالذكاء الاصطناعي جاية قريب، وبرضه هتفضل محدودة بالمحتوى اللي إنت موافق عليه.' },
      { q: 'بيدعم أنهي لغات؟', a: 'العربي (الفصحى واللهجة المصرية) والإنجليزي. وشباك الشات بيتحوّل للعربي لوحده لما يكون محتواك عربي.' },
      { q: 'هيبطّأ موقعي؟', a: 'لأ. هو ملف صغير واحد بيحمّل لوحده من غير ما يعطّل صفحتك.' },
      { q: 'أقدر أجرّب قبل ما أدفع؟', a: 'أكيد. الباقة المجانية مجانية على طول لموقع واحد، ومن غير كارت بنكي.' },
      { q: 'الطلبات اللي العملاء بيبعتوها بتروح فين؟', a: 'بتظهر في لوحة التحكم بتاعتك على طول، وتقدر تنزّلها على Excel في أي وقت.' },
    ],
  },
  cta: { title: 'خلّي موقعك يرد بدالك', subtitle: 'جهّز أول شات بوت ليك في دقايق — مجاناً.', button: 'ابدأ مجاناً' },
  footer: { tagline: 'شات بوت عربي أولاً لمواقع الشركات.', product: 'المنتج', contact: 'تواصل', rights: 'جميع الحقوق محفوظة.' },
};

export const LANDING_COPY = { en, ar };
