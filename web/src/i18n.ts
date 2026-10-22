import { usePreferences, type Locale } from './services/preferences.js';

/**
 * The small translation layer for the navigation chrome.
 *
 * The sidebar is keyed by the English label it was written with, and each one is
 * looked up here. A label with no entry - or a language that does not translate
 * it - falls through to English, so nothing ever renders a blank row. Only the
 * shell's navigation is translated: record content keeps the language its author
 * wrote it in, and that boundary is stated on the Language screen itself.
 */

const DICTIONARY: Record<string, Record<Exclude<Locale, 'en'>, string>> = {
  // Group titles
  Explore: { fr: 'Explorer' },
  'Your Earth Talk': { fr: 'Votre Earth Talk' },
  Community: { fr: 'Communauté' },
  'Research & governance': { fr: 'Recherche et gouvernance' },
  'Learn & support': { fr: 'Apprendre et assistance' },

  // Navigation entries
  'Explore map': { fr: 'Explorer la carte' },
  Observations: { fr: 'Observations' },
  'Geoscience sites': { fr: 'Sites géoscientifiques' },
  'My Earth Talk': { fr: 'Mon Earth Talk' },
  History: { fr: 'Historique' },
  'Community discovery': { fr: 'Découverte communautaire' },
  'Research analytics': { fr: 'Analyse de recherche' },
  'Field validation': { fr: 'Validation de terrain' },
  'Expert reviews': { fr: 'Revues d’experts' },
  'How it works': { fr: 'Comment ça marche' },
  'About Earth Talk': { fr: 'À propos d’Earth Talk' },

  // Footer utilities
  Language: { fr: 'Langue' },

  // Community section switcher
  'Community sections': { fr: 'Sections de la communauté' },
  Sites: { fr: 'Sites' },
  Investigations: { fr: 'Enquêtes' },
  Questions: { fr: 'Questions' },
  'My questions': { fr: 'Mes questions' },
  'My contributions': { fr: 'Mes contributions' },
};

export function translate(locale: Locale, text: string): string {
  if (locale === 'en') return text;
  return DICTIONARY[text]?.[locale] ?? text;
}

/** A locale-bound translator that re-renders when the language changes. */
export function useTranslator(): (text: string) => string {
  const { locale } = usePreferences();
  return (text: string) => translate(locale, text);
}
