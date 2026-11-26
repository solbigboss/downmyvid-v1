import React from 'react';
import { ArrowLeft, FileText, ShieldAlert, Scale, AlertTriangle, Copyright, Mail, ExternalLink } from 'lucide-react';
import { Language } from '../types';

interface TermsViewProps {
  currentLang: Language;
  onBackToHome: () => void;
}

export const TermsView: React.FC<TermsViewProps> = ({ currentLang, onBackToHome }) => {
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
          <FileText className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#0f1419] dark:text-white tracking-tight mb-3">
          {isRtl ? 'شروط الخدمة' : 'Terms of Service'}
        </h1>
        <p className="text-xs sm:text-sm text-[#536471] dark:text-[#8b98a5]">
          {isRtl ? 'آخر تحديث: 26 نوفمبر 2026' : 'Last Updated: November 26, 2026'}
        </p>
      </div>

      {/* Content Document Card */}
      <div className="bg-white dark:bg-[#15202b] border border-[#cfd9de] dark:border-[#2f3336] rounded-3xl p-6 sm:p-10 shadow-xs space-y-8 text-sm sm:text-base text-[#536471] dark:text-[#8b98a5] leading-relaxed transition-colors">

        {/* 1. Acceptance */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">1</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'قبول الشروط' : 'Acceptance of Terms'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'باستخدامك لموقع DownMyVid (downmyvid.com) أو ملحق المتصفح التابع له، فإنك توافق على الالتزام بشروط الخدمة هذه وجميع القوانين واللوائح المعمول بها. إذا كنت لا توافق على أي من هذه الشروط، فيرجى التوقف فوراً عن استخدام الخدمة.'
              : 'By accessing and using DownMyVid (downmyvid.com) or its official browser extension, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service, along with our Privacy Policy. If you do not agree with any part of these terms, you must not use our website or services.'}
          </p>
        </section>

        {/* 2. Nature of Service */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">2</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'طبيعة الخدمة والغرض منها' : 'Nature & Purpose of the Service'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'DownMyVid هي أداة مساعدة تقنية مجانية على الويب تتيح للمستخدمين تنزيل الوسائط المتاحة للجمهور (مقاطع الفيديو، الصوتيات، الصور المصغرة) من منصات التواصل الاجتماعي المدعومة (مثل X/Twitter وInstagram وFacebook وTikTok وYouTube) للاستخدام الشخصي وغير التجاري في وضع عدم الاتصال.'
              : 'DownMyVid operates as a free, client-oriented technical utility that enables users to download publicly accessible multimedia content (videos, audio, thumbnails) from supported platforms (including X/Twitter, Instagram, Facebook, TikTok, and YouTube) exclusively for personal, non-commercial, offline reference and fair use.'}
          </p>
          <div className="bg-[#f7f9f9] dark:bg-[#192734] border border-[#eff3f4] dark:border-[#22303c] rounded-2xl p-4 text-xs sm:text-sm text-[#0f1419] dark:text-[#f7f9f9] flex items-start gap-3">
            <Scale className="w-5 h-5 text-[#1d9bf0] shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-1">{isRtl ? 'خدمة خالية من الاستضافة والتخزين:' : 'Non-Hosting Platform Architecture:'}</strong>
              {isRtl
                ? 'DownMyVid لا تستضيف، ولا تحتفظ، ولا تخزن أي مقاطع فيديو محمية بحقوق الطبع والنشر على خوادمها. تتم معالجة جميع الروابط مباشرة وتدفقها في الوقت الفعلي من شبكات التوزيع الرسمية للمنصات المعنية.'
                : 'DownMyVid does not store, archive, or host any media files or copyrighted material on its servers. The service functions purely as a link parser and media extractor, fetching and piping streams directly from the originating third-party content delivery networks (CDNs).'}
            </div>
          </div>
        </section>

        {/* 3. Intellectual Property and Copyright */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">3</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'حقوق النشر والملكية الفكرية' : 'Intellectual Property & Copyright Compliance'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'جميع حقوق الملكية الفكرية والعلامات التجارية وحقوق الطبع والنشر الخاصة بمقاطع الفيديو والمحتوى المتاح عبر الخدمة تعود حصرياً إلى منشئي المحتوى والناشرين ومنصات التواصل الاجتماعي المعنية.'
              : 'All trademarks, logos, and copyrights in the media downloaded via DownMyVid belong exclusively to their respective owners, creators, and publishers. Users are solely responsible for ensuring that their downloading and use of any content complies with applicable copyright laws, fair use doctrines, and the terms of service of the respective source platform.'}
          </p>
          <p>
            {isRtl
              ? 'يتحمل المستخدم وحده المسؤولية القانونية الكاملة عن أي انتهاك لحقوق الطبع والنشر ينشأ عن استخدام المحتوى الذي تم تنزيله لأغراض تجارية أو إعادة توزيعه دون تصريح مسبق من صاحب الحقوق.'
              : 'You agree not to use DownMyVid to infringe upon the intellectual property rights of any person or entity. DownMyVid assumes no liability for copyright infringement or misuse of downloaded files by end users.'}
          </p>
        </section>

        {/* 4. DMCA & Takedown Notices */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">4</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'إخطارات حقوق الطبع والنشر وإزالة المحتوى (DMCA)' : 'DMCA & Copyright Inquiries'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'نحن نحترم حقوق الملكية الفكرية للآخرين بشكل صارم. إذا كنت مالكاً لحقوق الطبع والنشر أو وكيلاً معتمداً وترغب في حظر استخراج روابط محددة من موقعنا، يرجى مراسلتنا عبر البريد الإلكتروني المخصص:'
              : 'DownMyVid respects the intellectual property rights of copyright holders worldwide. If you are a copyright owner or an authorized representative and wish to request domain-level or link exclusion, please contact our designated contact point:'}
          </p>
          <div className="flex items-center gap-3 bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 border border-[#1d9bf0]/30 rounded-2xl p-4 text-[#0f1419] dark:text-white font-medium">
            <Mail className="w-5 h-5 text-[#1d9bf0]" />
            <a href="mailto:journeysailblog@gmail.com" className="text-[#1d9bf0] hover:underline font-bold">
              journeysailblog@gmail.com
            </a>
          </div>
          <p className="text-xs text-[#536471] dark:text-[#8b98a5]">
            {isRtl
              ? 'يرجى تقديم تفاصيل واضحة عن عنوان URL وإثبات التفويض القانوني حتى نتمكن من مراجعة الطلب وتنفيذه على الفور.'
              : 'Please provide the specific URLs, proof of ownership or authorization, and your contact details. We investigate and resolve legitimate notices within 48 business hours.'}
          </p>
        </section>

        {/* 5. User Restrictions */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">5</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'الاستخدام المحظور' : 'Prohibited Uses'}
            </h2>
          </div>
          <p>
            {isRtl ? 'يُحظر تماماً على المستخدمين القيام بأي مما يلي:' : 'When accessing or using DownMyVid, you agree that you will NOT:'}
          </p>
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>
              {isRtl
                ? 'محاولة تنزيل محتوى خاص أو مقيد أو غير مصرح به للجمهور.'
                : 'Attempt to bypass authentication, paywalls, or privacy restrictions to download non-public media.'}
            </li>
            <li>
              {isRtl
                ? 'استخدام أدوات آلية أو برامج روبوت أو طلبات جماعية لإغراق خوادمنا أو إبطاء الخدمة.'
                : 'Employ automated scripts, bots, scrapers, or flood requests that place an unreasonable load on our infrastructure.'}
            </li>
            <li>
              {isRtl
                ? 'إعادة بيع خدمات الموقع أو توزيع الملفات المحمية تجارياً لأغراض ربحية دون إذن.'
                : 'Resell, license, or commercially exploit DownMyVid or downloaded media without explicit authorization from the rights holder.'}
            </li>
            <li>
              {isRtl
                ? 'إجراء هندسة عكسية للموقع أو ملحق المتصفح أو محاولة اختراق تدابير الأمان.'
                : 'Decompile, reverse engineer, or attempt to compromise the integrity or security of our services.'}
            </li>
          </ul>
        </section>

        {/* 6. Disclaimer of Warranties */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">6</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'إخلاء المسؤولية عن الضمانات' : 'Disclaimer of Warranties'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'يتم توفير DownMyVid على أساس "كما هو" و"حسب توفره" دون أي ضمانات من أي نوع، صريحة أو ضمنية. نحن لا نضمن أن الخدمة ستكون خالية من الأخطاء أو متوفرة باستمرار دون انقطاع، حيث تخضع التحديثات لتغييرات واجهات برمجة التطبيقات للمنصات الخارجية.'
              : 'DownMyVid is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not guarantee that third-party video extractions will remain uninterrupted or error-free, as external platforms frequently modify their internal architectures.'}
          </p>
        </section>

        {/* 7. Limitation of Liability */}
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">7</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'حدود المسؤولية' : 'Limitation of Liability'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'لن تكون DownMyVid أو مسؤولوها أو القائمون عليها مسؤولين بأي حال من الأحوال عن أي أضرار مباشرة أو غير مباشرة أو عرضية أو تبعية تنشأ عن استخدامك للخدمة أو عدم قدرتك على استخدامها.'
              : 'To the fullest extent permitted by applicable law, in no event shall DownMyVid, its maintainers, developers, or affiliates be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your access to or use of (or inability to access or use) our service.'}
          </p>
        </section>

        {/* 8. Contact Information */}
        <section className="space-y-3 pt-4 border-t border-[#eff3f4] dark:border-[#2f3336]">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#e8f5fe] dark:bg-[#1d9bf0]/10 text-[#1d9bf0] font-bold text-sm flex items-center justify-center shrink-0">8</span>
            <h2 className="text-lg sm:text-xl font-bold text-[#0f1419] dark:text-white">
              {isRtl ? 'التواصل معنا' : 'Contact Information'}
            </h2>
          </div>
          <p>
            {isRtl
              ? 'إذا كان لديك أي أسئلة أو استفسارات قانونية بخصوص شروط الخدمة هذه، يرجى مراسلتنا مباشرة على:'
              : 'If you have any questions, legal inquiries, or compliance notices regarding these Terms of Service, please reach out to our team at:'}
          </p>
          <div className="bg-[#f7f9f9] dark:bg-[#192734] rounded-2xl p-4 text-xs sm:text-sm">
            <p className="font-semibold text-[#0f1419] dark:text-white">DownMyVid Legal & Inquiries</p>
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
