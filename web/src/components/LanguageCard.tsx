import React from 'react';
import { Check } from 'lucide-react';
import { LOCALES, setPreference, usePreferences } from '../services/preferences.js';

interface LanguageCardProps {
  /** Called after a locale is chosen, so a popover can dismiss itself. */
  onSelect?: () => void;
}

/**
 * LANGUAGE.
 *
 * A compact card of locales that anchors to the footer's Language row. Choosing
 * one switches the language the sidebar chrome is shown in immediately - there
 * is no separate screen to visit and nothing to confirm. Record content is
 * never translated: a contribution keeps the language its author wrote it in.
 */
export const LanguageCard: React.FC<LanguageCardProps> = ({ onSelect }) => {
  const { locale } = usePreferences();

  return (
    <div
      role="menu"
      aria-label="Language"
      className="w-56 rounded-xl border border-[#e3e3e3] bg-white p-1.5 shadow-[var(--g-elev-3)]"
    >
      {LOCALES.map((option) => {
        const active = option.id === locale;
        return (
          <button
            key={option.id}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => {
              setPreference('locale', option.id);
              onSelect?.();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
              active ? 'bg-[#e8f0fe]' : 'hover:bg-[#f0f4f9]'
            }`}
          >
            <img
              src={option.flag}
              alt=""
              loading="lazy"
              className="h-5 w-auto shrink-0 rounded-[3px] ring-1 ring-black/10"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-[#1f1f1f]">{option.nativeLabel}</span>
              {option.nativeLabel !== option.label && (
                <span className="block truncate font-mono text-[11px] text-[#5e5e5e]">{option.label}</span>
              )}
            </span>
            {active && <Check className="h-4 w-4 shrink-0 text-[#0b57d0]" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
};
