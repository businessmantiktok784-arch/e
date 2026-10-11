import type { LucideIcon } from 'lucide-react';
import {
  ChartBar,
  CircleQuestionMark,
  Compass,
  History,
  Info,
  Languages,
  Map,
  MapPin,
  MessageCircleQuestion,
  Search,
  ShieldAlert,
  Telescope,
} from 'lucide-react';

/**
 * Every destination in the sidebar. Navigation lives in the left sidebar and
 * nothing is inline: Explore is the map and what it lists, Your Earth Talk is
 * the contributor's own record, Community is the shared surface, Research &
 * governance is the administrator's work, and Learn is the reading material.
 */
export type AppView =
  | 'explore'
  | 'sites'
  | 'community'
  | 'research'
  | 'validation'
  | 'reviews'
  | 'moderation'
  | 'mine'
  | 'my-map'
  | 'history'
  | 'how-it-works'
  | 'about';

export interface NavEntry {
  id: AppView;
  label: string;
  icon: LucideIcon;
  /** Short line shown under the sidebar title while this view is open. */
  subtitle: string;
  /**
   * Opens one section of another view rather than that view's default
   * section, so "My contributions" can reach the reputation panel of the
   * community view without adding a second page.
   */
  panel?: CommunityPanel;
  /** Badge text, e.g. the stage a view belongs to. */
  badge?: string;
  /**
   * Hidden while the reader is signed out and shown once they sign in. The
   * sidebar stays honest: a signed-out reader is not offered a destination
   * whose content cannot exist without a session.
   */
  requiresSignIn?: boolean;
  /**
   * Hidden unless the Super Admin is signed in. Some destinations - the
   * research dataset exports among them - are backed by endpoints that only
   * accept a Super Admin session, so offering them to a contributor would hand
   * the reader a screen that can only fail to load.
   */
  requiresAdmin?: boolean;
}

export interface NavGroup {
  /** Stable id, used for the collapsible section's DOM ids. */
  id: string;
  title: string;
  entries: NavEntry[];
}

/**
 * A utility row in the sidebar footer. These open an in-place control (the
 * Language row opens a popover of locales) rather than a full screen, so they
 * carry a stable id but no destination view.
 */
export interface NavExtraItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** One line describing what the control changes. */
  subtitle: string;
}

/**
 * The sidebar's sections, each carrying only destinations with a real feature
 * behind them. Supporting chrome that is not part of the platform's WhatsApp
 * citizen-science scope has been dropped rather than kept as dead menu rows.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'explore',
    title: 'Explore',
    entries: [
      {
        id: 'explore',
        label: 'Explore map',
        icon: Compass,
        subtitle: 'Every published observation and geoscience site in Rwanda',
      },
      {
        id: 'sites',
        label: 'Geoscience sites',
        icon: MapPin,
        subtitle: 'Grouped localities, and posts without a coordinate',
      },
    ],
  },
  {
    id: 'participate',
    title: 'Community',
    entries: [
      {
        id: 'community',
        label: 'Investigations',
        icon: Search,
        subtitle: 'Open community investigations',
        panel: 'investigations',
      },
      {
        id: 'community',
        label: 'My questions',
        icon: MessageCircleQuestion,
        subtitle: 'Your questions, the discussion and every reply',
        panel: 'questions',
        requiresSignIn: true,
      },
    ],
  },
  {
    id: 'research',
    title: 'Research & governance',
    entries: [
      {
        id: 'research',
        label: 'Research analytics',
        icon: ChartBar,
        subtitle: 'Dataset summaries, versions and exports',
        requiresAdmin: true,
      },
      {
        id: 'moderation',
        label: 'Moderation',
        icon: ShieldAlert,
        subtitle: 'Community abuse reports and flagged discussion',
        requiresAdmin: true,
      },
    ],
  },
  {
    id: 'personal',
    title: 'Your Earth Talk',
    entries: [
      {
        id: 'mine',
        label: 'My Earth Talk',
        icon: Telescope,
        subtitle: 'Your posts, questions, answers and comments',
      },
      {
        id: 'my-map',
        label: 'My Map',
        icon: Map,
        subtitle: 'Your own observations, including the private ones',
        requiresSignIn: true,
      },
      {
        id: 'history',
        label: 'History',
        icon: History,
        subtitle: 'Places you have opened, grouped by day',
      },
    ],
  },
  {
    id: 'learn',
    title: 'Learn & support',
    entries: [
      {
        id: 'how-it-works',
        label: 'How it works',
        icon: CircleQuestionMark,
        subtitle: 'From a WhatsApp photo to a Geoscience Passport',
      },
      {
        id: 'about',
        label: 'About Earth Talk',
        icon: Info,
        subtitle: 'Scope, data honesty and privacy commitments',
      },
    ],
  },
];

/** Footer utilities pinned under the sections, exactly as a map menu lists them. */
export const NAV_FOOTER_UTILS: NavExtraItem[] = [
  {
    id: 'language',
    label: 'Language',
    icon: Languages,
    subtitle: 'The language the navigation is shown in',
  },
];

export const NAV_ENTRIES: NavEntry[] = NAV_GROUPS.flatMap((group) => group.entries);

export const getNavEntry = (view: AppView): NavEntry =>
  NAV_ENTRIES.find((entry) => entry.id === view) ?? NAV_ENTRIES[0];

/**
 * A section of a view that is split across several sidebar entries. Each entry
 * that shares a view id (the three Community sections) carries one of these, and
 * the sidebar marks the entry matching the section on screen as active.
 */
export type CommunityPanel = 'investigations' | 'questions' | 'reputation';