import React from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';

export interface LegalSectionItem {
  id: string;
  title: string;
  number: string;
}

interface LegalLayoutProps {
  currentTab: 'terms' | 'privacy';
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections?: LegalSectionItem[];
  onNavigateTab: (tab: 'terms' | 'privacy') => void;
  onBackToApp: () => void;
  children: React.ReactNode;
}

export const LegalLayout: React.FC<LegalLayoutProps> = ({
  currentTab,
  title,
  subtitle,
  lastUpdated,
  onNavigateTab,
  onBackToApp,
  children,
}) => {

  return (
    <div className="min-h-screen bg-[#f8fafd] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#e3e3e3] shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[#e3e3e3] bg-white text-[13px] font-medium text-[#3c4043] hover:bg-[#f0f4f9] hover:text-[#1f1f1f] transition-colors shadow-2xs"
              title="Return to Earth Talk application"
            >
              <ArrowLeft className="w-4 h-4 text-[#5e5e5e]" />
              <span className="hidden sm:inline">Back to map</span>
            </button>
            <div className="h-5 w-[1px] bg-[#e3e3e3] hidden sm:block" />
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={onBackToApp}
            >
              <img
                src="/icon.png"
                alt="Earth Talk Logo"
                className="w-7 h-7 rounded-md object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="leading-tight">
                <span className="font-medium text-[15px] text-[#1f1f1f] tracking-tight group-hover:text-[#0b57d0] transition-colors">
                  Earth Talk
                </span>
                <span className="hidden md:inline-block ml-2 text-[11px] text-[#5e5e5e] font-normal">
                  Legal & Transparency
                </span>
              </div>
            </div>
          </div>

          <nav className="flex items-center bg-[#f0f4f9] p-1 rounded-full border border-[#e3e3e3]">
            <button
              type="button"
              onClick={() => onNavigateTab('terms')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                currentTab === 'terms'
                  ? 'bg-white text-[#0b57d0] shadow-xs font-semibold'
                  : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
              }`}
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('privacy')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                currentTab === 'privacy'
                  ? 'bg-white text-[#0b57d0] shadow-xs font-semibold'
                  : 'text-[#5e5e5e] hover:text-[#1f1f1f]'
              }`}
            >
              Privacy Policy
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-1 w-full">
        <main className="bg-white rounded-2xl border border-[#e3e3e3] p-6 sm:p-10 lg:p-12 shadow-sm">
          {/* Header section */}
          <div className="border-b border-[#e3e3e3] pb-8 mb-8">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#5e5e5e] font-mono mb-3">
              <span className="inline-flex items-center gap-1 bg-[#f0f4f9] text-[#3c4043] px-2.5 py-1 rounded-md border border-[#e3e3e3]">
                <Calendar className="w-3.5 h-3.5 text-[#0b57d0]" />
                Last Updated: {lastUpdated}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-[#1f1f1f] tracking-tight">
              {title}
            </h1>
            <p className="mt-3 text-sm sm:text-base text-[#5e5e5e] leading-relaxed max-w-3xl">
              {subtitle}
            </p>
          </div>

          {/* Document Body */}
          <article className="prose prose-stone max-w-none text-[#3c4043] text-[14px] sm:text-[15px] leading-relaxed space-y-8">
            {children}
          </article>
        </main>
      </div>
    </div>
  );
};
