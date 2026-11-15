import React, { useState } from 'react';
import { ChevronDown, HelpCircle, Search } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../data/translations';

interface FaqSectionProps {
  currentLang: Language;
}

interface FaqItem {
  q: Record<Language, string>;
  a: Record<Language, string>;
}

const FAQ_DATA: FaqItem[] = [
  {
    q: {
      en: 'How to save Twitter / X videos directly to iPhone Camera Roll?',
      fr: 'Comment enregistrer les vidéos Twitter directement dans la pellicule iPhone ?',
      es: '¿Cómo guardar videos de Twitter directamente en el carrete del iPhone?',
      ar: 'كيف أحفظ مقاطع فيديو تويتر مباشرة إلى ألبوم الكاميرا في آيفون؟',
    },
    a: {
      en: 'On iOS, choose Download and follow Safari’s download or share prompts. The saved location depends on your browser and device settings.',
      fr: 'Après avoir cliqué sur "Télécharger" dans Safari, appuyez sur la flèche bleue de téléchargement dans la barre d\'adresse, ouvrez la vidéo, appuyez sur l\'icône Partager d\'iOS et sélectionnez "Enregistrer la vidéo".',
      es: 'Tras pulsar "Descargar" en Safari, toca la flecha azul de descargas en la barra de direcciones, abre el video, toca el icono de Compartir de iOS y elige "Guardar video".',
      ar: 'بعد الضغط على "تحميل" في متصفح سفاري للآيفون، اضغط على سهم التنزيل الأزرق في شريط العنوان، وافتح الفيديو، ثم اضغط على زر المشاركة واختر "حفظ الفيديو" ليظهر مباشرة في تطبيق الصور.',
    },
  },
  {
    q: {
      en: 'Can I download Twitter videos from private accounts?',
      fr: 'Puis-je télécharger des vidéos Twitter à partir de comptes privés ?',
      es: '¿Puedo descargar videos de Twitter de cuentas privadas?',
      ar: 'هل يمكنني تحميل مقاطع الفيديو من حسابات تويتر الخاصة أو المغلقة؟',
    },
    a: {
      en: 'No. To respect user privacy and security protocols, our downloader operates strictly on publicly accessible tweets and broadcasts.',
      fr: 'Non. Pour respecter la confidentialité des utilisateurs, notre service ne fonctionne qu\'avec les tweets et diffusions accessibles au public.',
      es: 'No. Por respeto a la privacidad y seguridad, nuestro descargador solo procesa tweets y emisiones públicos.',
      ar: 'لا. احتراماً لخصوصية المستخدمين ومعايير الأمان، يعمل المحمل لدينا فقط مع التغريدات والبث العام المتاح للجميع.',
    },
  },
  {
    q: {
      en: 'Does Downmyvid have any daily download limits or subscription fees?',
      fr: 'Downmyvid a-t-il des limites quotidiennes ou des frais d\'abonnement ?',
      es: '¿Tiene Downmyvid límites de descarga diarios o suscripciones?',
      ar: 'هل توجد أي حدود يومية للتحميل أو رسوم اشتراك في Downmyvid؟',
    },
    a: {
      en: 'DownMyVid is free to use and does not require registration. Available formats depend on the source; some features require a backend that is not present on static hosting.',
      fr: 'DownMyVid est gratuit et sans inscription. Les formats dépendent de la source ; certaines fonctions nécessitent un serveur backend.',
      es: 'DownMyVid es gratis y no requiere registro. Los formatos dependen del origen; algunas funciones necesitan un servidor backend.',
      ar: 'DownMyVid مجاني ولا يتطلب التسجيل. تعتمد التنسيقات على المصدر؛ وتتطلب بعض الميزات خادماً خلفياً.',
    },
  },
  {
    q: {
      en: 'Can I convert X videos or Spaces to MP3?',
      fr: 'Puis-je convertir des vidéos X ou Spaces en MP3 ?',
      es: '¿Puedo convertir videos o Spaces de X a MP3?',
      ar: 'هل يمكن تحويل فيديوهات X أو Spaces إلى MP3؟',
    },
    a: {
      en: 'MP3 conversion requires the Express backend and ffmpeg. It is not available on this static Firebase Hosting site.',
      fr: 'La conversion MP3 nécessite le serveur Express et ffmpeg. Elle n’est pas disponible sur cet hébergement Firebase statique.',
      es: 'La conversión MP3 requiere el servidor Express y ffmpeg. No está disponible en este sitio estático de Firebase Hosting.',
      ar: 'يتطلب تحويل MP3 خادم Express وffmpeg. وهو غير متاح على استضافة Firebase الثابتة هذه.',
    },
  },
];

export const FaqSection: React.FC<FaqSectionProps> = ({ currentLang }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const t = translations[currentLang];

  const filteredFaqs = FAQ_DATA.filter((item) => {
    const q = item.q[currentLang].toLowerCase();
    const a = item.a[currentLang].toLowerCase();
    const term = searchTerm.toLowerCase().trim();
    return q.includes(term) || a.includes(term);
  });

  return (
    <section className="py-12 sm:py-16 px-4 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1d9bf0] bg-[#e8f5fe] dark:bg-[#1d9bf0]/15 px-3 py-1 rounded-full mb-3">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Knowledge Base</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-[#0f1419] dark:text-white tracking-tight mb-2">
          {t.faqTitle}
        </h2>
        <p className="text-sm text-[#536471] dark:text-[#8b98a5] max-w-lg mx-auto">
          {t.faqSubtitle}
        </p>
      </div>

      {/* Search FAQ Input */}
      <div className="relative mb-6">
        <Search className="w-4 h-4 text-[#8b98a5] absolute left-3.5 top-1/2 -translate-y-1/2 rtl:left-auto rtl:right-3.5" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter questions..."
          className="w-full bg-white dark:bg-[#15202b] border border-[#cfd9de] dark:border-[#2f3336] focus:border-[#1d9bf0] dark:focus:border-[#1d9bf0] text-[#0f1419] dark:text-white rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]/20 rtl:pl-4 rtl:pr-10 transition-colors"
        />
      </div>

      {/* Accordion Items */}
      <div className="space-y-3">
        {filteredFaqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className="bg-white dark:bg-[#15202b] border border-[#cfd9de] dark:border-[#2f3336] rounded-2xl overflow-hidden transition-all shadow-xs"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full p-4 sm:p-5 text-left rtl:text-right font-bold text-sm sm:text-base text-[#0f1419] dark:text-white flex items-center justify-between gap-4 transition-colors hover:bg-[#f7f9f9] dark:hover:bg-[#1e2732] touch-target"
                aria-expanded={isOpen}
              >
                <span>{faq.q[currentLang]}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#8b98a5] transition-transform shrink-0 ${
                    isOpen ? 'rotate-180 text-[#1d9bf0]' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="px-4 sm:px-5 pb-5 pt-1 text-xs sm:text-sm text-[#536471] dark:text-[#8b98a5] leading-relaxed border-t border-[#eff3f4] dark:border-[#2f3336] bg-[#f7f9f9]/40 dark:bg-[#1e2732]/30 animate-in fade-in duration-150">
                  {faq.a[currentLang]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
