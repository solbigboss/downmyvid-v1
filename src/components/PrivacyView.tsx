import React from 'react';
import { ArrowLeft, ShieldCheck, Lock, EyeOff, Database, HardDrive, Cookie, Mail, UserCheck } from 'lucide-react';
import { Language } from '../types';

interface PrivacyViewProps {
  currentLang: Language;
  onBackToHome: () => void;
}

export const PrivacyView: React.FC<PrivacyViewProps> = ({ currentLang, onBackToHome }) => {
  const isRtl = currentLang === 'ar';

  return (
    <div className={`max-w-4xl mx-auto py-10 px-4 sm:px-6 ${isRtl ? 'rtl' : 'ltr'}`}>
      {/* Back to Home Button */}
      <div className="mb-8">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1d9bf0] hover:text-[#1a8cd8] dark:text-[#1d9bf0] dark:hover:text-[#78c5f8] transition-colors cursor-pointer"
        >
          <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
          {isRtl ? 'الرجوع إلى الصفحة الرئيسية' : 'Back to DownMyVid'}
        </button>
      </div>

      {/* Main Header Card */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="w-14 h-14 rounded-2xl bg-[#e8f5fe] dark:bg-[#1d9bf0]/15 text-[#1d9bf0] flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#0f1419] dark:text-white tracking-tight mb-3">
          {isRtl ? 'سياسة الخصوصية' : 'Privacy Policy'}
        </h1>
        <p className="text-xs sm:text-sm text-[#536471] dark:text-[#8b98a5]">
          {isRtl ? 'آخر تحديث: 26 نوفمبر 2026' : 'Last Updated: November 26, 2026'}
        </p>
      </div>

      {/* Content Document Card */}
      <div className="bg-white dark:bg-[#15202b] border border-[#cfd9de] dark:border-[#2f3336] rounded-3xl p-6 sm:p-10 shadow-xs space-y-8 text-sm sm:text-base text-[#536471] dark:text-[#8b98a5] leading-relaxed transition-colors">

        {/* 1. Core Commitment */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">1</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'التزامنا بحماية خصوصيتك' : 'Our Privacy-First Commitment'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'في DownMyVid (downmyvid.com)، نعتبر خصوصيتك حقاً أساسياً. تم تصميم موقعنا وملحق المتصفح التابع لنا وفق مبدأ صارم: "الخصوصية أولاً ودون تتبع". نحن لا نطلب منك إنشاء حساب، ولا نجمع أسماءك، ولا نطلب بريدك الإلكتروني لاستخدام أداة التنزيل، ولا نبيع أو نشارك بياناتك مع أي جهات خارجية أو شبكات إعلانية.'
              : 'At DownMyVid (downmyvid.com), your privacy is our core priority. Our website and Chrome extension are built on a strict Privacy-First and Zero-Tracking philosophy. We do not require registration, we do not build user behavioral profiles, and we never sell, monetize, or share your data with data brokers or advertising networks.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="bg-[#f7f9f9] dark:bg-[#192734] p-4 rounded-2xl border border-[#eff3f4] dark:border-[#22303c] text-center">
              <EyeOff className="w-5 h-5 text-[#1d9bf0] mx-auto mb-2" />
              <strong className="block text-xs sm:text-sm text-[#0f1419] dark:text-white mb-1">
                {isRtl ? 'بدون تتبع' : 'Zero Trackers'}
              </strong>
              <span className="text-xs text-[#536471] dark:text-[#8b98a5]">
                {isRtl ? 'لا توجد نصوص برمجية تتبع نشاطك' : 'No invasive analytics or user fingerprinting'}
              </span>
            </div>
            <div className="bg-[#f7f9f9] dark:bg-[#192734] p-4 rounded-2xl border border-[#eff3f4] dark:border-[#22303c] text-center">
              <UserCheck className="w-5 h-5 text-[#1d9bf0] mx-auto mb-2" />
              <strong className="block text-xs sm:text-sm text-[#0f1419] dark:text-white mb-1">
                {isRtl ? 'بدون تسجيل' : 'No Sign-Up Required'}
              </strong>
              <span className="text-xs text-[#536471] dark:text-[#8b98a5]">
                {isRtl ? 'استخدام مباشر وفوري 100%' : '100% anonymous & instant access'}
              </span>
            </div>
            <div className="bg-[#f7f9f9] dark:bg-[#192734] p-4 rounded-2xl border border-[#eff3f4] dark:border-[#22303c] text-center">
              <Database className="w-5 h-5 text-[#1d9bf0] mx-auto mb-2" />
              <strong className="block text-xs sm:text-sm text-[#0f1419] dark:text-white mb-1">
                {isRtl ? 'بدون تخزين ملفات' : 'Zero Media Storage'}
              </strong>
              <span className="text-xs text-[#536471] dark:text-[#8b98a5]">
                {isRtl ? 'لا يتم حفظ وسائطك على خوادمنا' : 'Videos stream directly from source CDNs'}
              </span>
            </div>
          </div>
        </section>

        {/* 2. What We Process */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">2</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'البيانات التي تتم معالجتها' : 'Information We Process'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'لكي تعمل أداة التنزيل بكفاءة، نتعامل فقط مع الحد الأدنى من المعلومات التقنية الضرورية:'
              : 'To provide video extraction functionality, DownMyVid processes only the absolute technical minimum:'}
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>
              <strong>{isRtl ? 'روابط مقاطع الفيديو المدخلة:' : 'Submitted URLs:'}</strong>{' '}
              {isRtl
                ? 'عند إدخال رابط منشور، نقوم بمعالجته لحظياً لاستخراج خيارات الجودة المتاحة (MP4/MP3). لا نقوم بربط هذا الرابط بعنوان IP الخاص بك أو حفظه في قاعدة بيانات دائمة.'
                : 'When you submit a video URL, our system parses it ephemerally to retrieve available resolutions and direct stream links. We do not store, index, or link submitted URLs to your IP address or personal identity.'}
            </li>
            <li>
              <strong>{isRtl ? 'سجلات الخادم المؤقتة:' : 'Ephemeral Server Logs:'}</strong>{' '}
              {isRtl
                ? 'قد تسجل خوادمنا سجلات وصول مؤقتة فقط للحماية من الهجمات الخبيثة (DDoS) وإدارة استقرار الشبكة. يتم تدوير هذه السجلات وحذفها تلقائياً بانتظام.'
                : 'Standard transient web server logs (such as request timestamps and HTTP status codes) are used solely for diagnostic health, DDoS mitigation, and rate limiting. These logs are automatically rotated and purged.'}
            </li>
          </ul>
        </section>

        {/* 3. Local Storage & Preferences */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">3</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'التخزين المحلي على جهازك (Local Storage)' : 'Local Storage & Browser Preferences'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'لا يستخدم DownMyVid ملفات تعريف الارتباط التتبعية (Tracking Cookies). بدلاً من ذلك، نستخدم ميزة التخزين المحلي الآمنة (localStorage) في متصفحك لحفظ تفضيلات العرض الخاصة بك محلياً على جهازك فقط:'
              : 'DownMyVid does NOT use persistent third-party tracking cookies or advertising cookies. Instead, we use standard client-side browser localStorage exclusively on your own device for:'}
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>{isRtl ? 'تفضيل الوضع الليلي / الفاتح (Theme mode).' : 'Your UI theme preference (Dark Mode / Light Mode / System default).'}</li>
            <li>{isRtl ? 'تفضيل اللغة المختارة (الإنجليزية، الفرنسية، الإسبانية، العربية).' : 'Your selected language preference (English, French, Spanish, Arabic).'}</li>
            <li>{isRtl ? 'سجل التنزيلات الأخيرة الخاص بك (محفوظ محلياً على جهازك ويمكنك مسحه في أي وقت).' : 'Your local recent downloads history (stored strictly on your machine, accessible only to you, and clearable at any time with one click).'}</li>
          </ul>
        </section>

        {/* 4. Chrome Extension Privacy */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">4</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'خصوصية ملحق متصفح كروم (Chrome Extension)' : 'Chrome Extension Privacy Standards'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'يلتزم ملحق المتصفح DownMyVid بأعلى معايير الخصوصية لمتجر Google Chrome (Manifest V3):'
              : 'Our official DownMyVid Chrome Extension strictly follows Google Chrome Web Store privacy requirements:'}
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>{isRtl ? 'لا يتم جمع أو نقل أي سجل تصفح أو بيانات شخصية.' : 'Zero data collection: The extension does not collect, transmit, or monitor your web browsing history.'}</li>
            <li>{isRtl ? 'تقتصر الأذونات حصرياً على إدراج زر التنزيل ثلاثي الأبعاد أسفل مشغلات الفيديو في المواقع المدعومة فقط.' : 'Strictly scoped permissions: Content scripts run only on supported social platforms to inject the 3D download button beneath active video players.'}</li>
            <li>{isRtl ? 'لا يتضمن الملحق أي أدوات تحليلات أو إعلانات أو نصوص طرف ثالث خارجية.' : 'Zero third-party analytics, zero advertising SDKs, and zero telemetry.'}</li>
          </ul>
        </section>

        {/* 5. Third-Party Links & Services */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">5</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'المنصات والخدمات التابعة لجهات خارجية' : 'Third-Party Platforms'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'تتفاعل خدمتنا مع الوسائط العامة من منصات مثل X (تويتر سابقاً) وإنستغرام وفيسبوك وتيك توك ويوتيوب. تخضع هذه المنصات لسياسات الخصوصية وشروط الخدمة الخاصة بكل منها. لا ترتبط DownMyVid بأي من هذه المنصات ولا تتحكم في ممارسات الخصوصية الخاصة بها.'
              : 'DownMyVid parses publicly accessible media from third-party platforms (X/Twitter, Instagram, Facebook, TikTok, YouTube). These platforms maintain their own independent terms and privacy practices. DownMyVid is not affiliated with, endorsed by, or sponsored by any of these social media companies.'}
          </p>
        </section>

        {/* 6. User Rights (GDPR & CCPA) */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">6</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'حقوق المستخدمين (GDPR و CCPA)' : 'Your Rights (GDPR & CCPA Compliance)'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'بموجب اللائحة العامة لحماية البيانات (GDPR) وقانون خصوصية المستهلك في كاليفورنيا (CCPA)، يحق لك معرفة البيانات التي تتم معالجتها أو طلب حذفها. نظراً لأننا لا نخزن حسابات أو هويات مستخدمين، فإن بصمتك الرقمية على خوادمنا شبه منعدمة. يمكنك مسح سجل التنزيلات المحلي في أي وقت من خلال متصفحك.'
              : 'Under global data protection regulations (including the EU GDPR and California CCPA), you have rights regarding access, deletion, and transparency. Because DownMyVid maintains no user accounts, database profiles, or persistent identity logs, we hold virtually zero identifiable personal data about you. Your local preferences can be cleared at any time directly through your browser settings.'}
          </p>
        </section>

        {/* 7. Contact Us */}
        <section className="space-y-3 pt-4 border-t border-[#eff3f4] dark:border-[#2f3336]">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">7</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'التواصل بخصوص الخصوصية' : 'Privacy Inquiries & Contact'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'إذا كانت لديك أي استفسارات أو أسئلة بخصوص سياسة الخصوصية هذه أو كيفية معالجة البيانات، يسعدنا تواصلك معنا مباشرة عبر البريد الإلكتروني:'
              : 'If you have any questions, requests, or privacy concerns regarding this policy, please reach out directly to our dedicated contact email:'}
          </p>
          <div className="bg-[#f7f9f9] dark:bg-[#192734] rounded-2xl p-4 text-xs sm:text-sm">
            <p className="font-semibold text-[#0f1419] dark:text-white">DownMyVid Privacy Team</p>
            <p className="mt-1">
              Email:{' '}
              <a href="mailto:journeysailblog@gmail.com" className="text-[#1d9bf0] hover:underline font-bold">
                journeysailblog@gmail.com
              </a>
            </p>
            <p className="mt-1 text-[#536471] dark:text-[#8b98a5]">Website: https://downmyvid.com</p>
          </div>
        </section>

      </div>
    </div>
  );
};
