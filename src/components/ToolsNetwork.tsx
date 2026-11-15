import React from 'react';
import { ArrowRight, Radio, Tv, Music, Film, Droplets, Smartphone } from 'lucide-react';
import { Language, ActiveTab } from '../types';
import { translations } from '../data/translations';

interface ToolsNetworkProps {
  currentLang: Language;
  onSelectTool: (tab: ActiveTab) => void;
}

export const ToolsNetwork: React.FC<ToolsNetworkProps> = ({ currentLang, onSelectTool }) => {
  const t = translations[currentLang];

  const tools = [
    {
      title: 'X / Twitter video downloads',
      desc: 'Available public video formats depend on the source.',
      icon: Film,
      tab: 'home' as ActiveTab,
      color: 'text-[#1d9bf0]',
    },
    {
      title: 'MP3 conversion',
      desc: 'Requires the Express backend and ffmpeg.',
      icon: Music,
      tab: 'home' as ActiveTab,
      color: 'text-[#ffad1f]',
    },
  ];

  return (
    <section className="py-12 sm:py-16 px-4 bg-white dark:bg-[#15202b] border-t border-[#cfd9de] dark:border-[#2f3336] transition-colors">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-[#0f1419] dark:text-white tracking-tight mb-2">
            {currentLang === 'ar' ? 'أدوات الوسائط' : 'Other media tools'}
          </h2>
          <p className="text-sm text-[#536471] dark:text-[#8b98a5]">
            {currentLang === 'ar'
              ? 'اختر الأداة المناسبة حسب نوع المحتوى الذي ترغب بتنزيله من إكس'
              : 'Choose the dedicated extraction pipeline tailored to your preferred media format'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool, idx) => {
            const Icon = tool.icon;
            return (
              <button
                key={idx}
                onClick={() => onSelectTool(tool.tab)}
                className="bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de] dark:border-[#2f3336] hover:border-[#1d9bf0] dark:hover:border-[#1d9bf0] hover:bg-white dark:hover:bg-[#15202b] p-5 rounded-2xl flex items-center justify-between text-left rtl:text-right transition-all group shadow-xs touch-target"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#15202b] border border-[#eff3f4] dark:border-[#2f3336] flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                    <Icon className={`w-5 h-5 ${tool.color}`} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-[#0f1419] dark:text-white group-hover:text-[#1d9bf0] transition-colors">
                      {tool.title}
                    </h4>
                    <p className="text-xs text-[#536471] dark:text-[#8b98a5] mt-0.5">
                      {tool.desc}
                    </p>
                  </div>
                </div>

                <ArrowRight className="w-4 h-4 text-[#8b98a5] group-hover:text-[#1d9bf0] group-hover:translate-x-0.5 rtl:rotate-180 transition-all shrink-0 ml-2 rtl:mr-2 rtl:ml-0" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
