import React, { useEffect, useState } from 'react';
import {
  MessageSquarePlus,
  LogIn,
  LogOut,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import {
  NAV_FOOTER_UTILS,
  NAV_GROUPS,
  type AppView,
  type CommunityPanel,
  type NavEntry,
} from '../navigation.js';
import { useTranslator } from '../i18n.js';
import { LanguageCard } from './LanguageCard.js';
import type { ExpertUser } from '../types/expert.js';
import type { CommunityUser } from '../types/communityPosts.js';

interface SidebarProps {
  view: AppView;
  /** `panel` jumps a view straight to one of its sections. */
  onNavigate: (view: AppView, panel?: CommunityPanel) => void;
  onOpenWhatsApp: () => void;
  /** Opens the general sign-in modal (contributor phone or administrator email). */
  onOpenLogin: () => void;
  onSignOut: () => void;
  currentExpert: ExpertUser | null;
  /** The signed-in WhatsApp contributor, when there is one. */
  currentUser: CommunityUser | null;
  /**
   * The section on screen, when the open view is split across several entries
   * that share its id (the four Community sections). Each such entry carries a
   * `panel`, and this decides which one is marked active.
   */
  activePanel?: CommunityPanel | null;
  /**
   * Icon-only mode, and the control that toggles it. The three horizontal
   * lines live in this header and open or narrow this column only. On a phone
   * the same control shuts the drawer; the map's "show sidebar" button and the
   * floating Menu button are what bring it back.
   */
  collapsed?: boolean;
  onToggleCollapsed?: (() => void) | null;
  /** Closes this column: folds it to the icon rail, or shuts the phone drawer. */
  onClose?: (() => void) | null;
  /**
   * True while the column is an overlay drawer rather than an inline column.
   * The drawer has no icon-rail mode to narrow into - its own X and the
   * backdrop are the close controls - so the rail toggle is suppressed.
   */
  overlay?: boolean;
  /**
   * Panel content for the active view. It renders inside the same scroll
   * region as the navigation, directly beneath it, which is how a Google-style
   * desktop sidebar works: one column, navigation on top, contextual panel
   * underneath. Nothing is duplicated inline in the page header.
   */
  children?: React.ReactNode;
}

/**
 * The single navigation surface for the app.
 *
 * It follows the map-drawer menu pattern: an "Earth Talk" wordmark, a plain
 * list of destinations (no section headings), and a
 * short column of footer utilities. The column folds to an icon-only rail whose
 * top-left control reopens it.
 *
 * Every row is a plain destination. Whether the reader is signed in is shown
 * once, in the pinned action area at the foot of the column: a "Sign in" button
 * while signed out, replaced by the reader's identity once they sign in. The
 * Super Admin console (field validation, expert reviews) is not part of this
 * reader's navigation.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  view,
  onNavigate,
  onOpenWhatsApp,
  onOpenLogin,
  onSignOut,
  currentExpert,
  currentUser,
  activePanel,
  onToggleCollapsed = null,
  collapsed = false,
  onClose = null,
  overlay = false,
  children,
}) => {
  // The footer Language row opens a popover instead of leaving for a screen, so
  // a reader switches the navigation's language without losing their place.
  const [languageOpen, setLanguageOpen] = useState(false);
  // The icon rail hides the sign-out button; the reader's avatar opens this
  // small menu instead, so the session is still reachable in the narrow column.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Navigation chrome follows the language chosen in Language settings.
  const t = useTranslator();

  // Escape shuts the phone drawer, matching every other overlay in the app.
  useEffect(() => {
    if (!overlay || !onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [overlay, onClose]);

  const handleEntry = (entry: NavEntry) => onNavigate(entry.id, entry.panel);

  // An entry is active when it matches the open view and, for a view split
  // across several entries (the four Community sections), the section the view
  // is currently showing.
  const isEntryActive = (entry: NavEntry) =>
    entry.id === view && (entry.panel ? entry.panel === activePanel : activePanel == null);

  const iconButton = (
    label: string,
    onClick: () => void,
    icon: React.ReactNode,
    extraClass = ''
  ) => (
    <button
      type="button"
      className={`g-icon-btn h-11 w-11 shrink-0 ${extraClass}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  // Whoever is signed in - the administrator or the WhatsApp contributor -
  // is shown in the pinned action area so the session is never ambiguous.
  const initials = (value: string) =>
    value
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const identity = currentExpert
    ? {
        name: currentExpert.name,
        role: 'Super Admin',
        admin: true,
        avatarClass: 'bg-[#d3e3fd] text-[#041e49]',
        initials: initials(currentExpert.name),
      }
    : currentUser
      ? {
          name: currentUser.display_name || 'Earth Talk member',
          role: 'Contributor',
          admin: false,
          avatarClass: 'bg-[#ceead6] text-[#1f4f33]',
          initials: initials(currentUser.display_name || currentUser.public_user_id),
        }
      : null;

  // Destinations that need a session are hidden until there is one, and a
  // section that ends up empty is not drawn as a bare rule. Destinations that
  // need the Super Admin are hidden from everyone else, so a contributor is
  // never offered a screen whose endpoint would only answer with an error.
  const signedIn = Boolean(currentUser) || Boolean(currentExpert);
  const isAdmin = Boolean(currentExpert);
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter(
      (entry) =>
        !(entry.requiresSignIn && !signedIn) && !(entry.requiresAdmin && !isAdmin),
    ),
  })).filter((group) => group.entries.length > 0);

  // A signed-in contributor is sent straight into My Earth Talk on WhatsApp, so
  // the entry names the destination rather than the onboarding step. A visitor
  // still sees "Start on WhatsApp" because there is no account to carry over yet.
  const whatsAppLabel = signedIn ? 'My Earth Talk on WhatsApp' : 'Start on WhatsApp';

  // The reader's account controls. There is no standalone sign-out icon in the
  // column; the avatar itself opens this menu in both the full column and the
  // icon rail, so Log out is always one click from the reader's own image.
  const accountMenu =
    identity && accountMenuOpen ? (
      <>
        <div
          className="fixed inset-0 z-40"
          aria-hidden="true"
          onClick={() => setAccountMenuOpen(false)}
        />
        <div
          className={`absolute bottom-full z-50 mb-2 overflow-hidden rounded-xl border border-[#e3e3e3] bg-white p-1 shadow-[var(--g-elev-2)] ${
            collapsed ? 'left-1/2 w-44 -translate-x-1/2' : 'right-0 left-0'
          }`}
        >
          <div className="px-2.5 py-2">
            <div className="truncate text-[12px] font-medium text-[#1f1f1f]">{identity.name}</div>
            <div className="flex items-center gap-1 truncate text-[10px] text-[#5e5e5e]">
              {identity.admin && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
              {identity.role}
            </div>
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-[#1f1f1f] hover:bg-[#f0f4f9]"
            onClick={() => {
              setAccountMenuOpen(false);
              onSignOut();
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </>
    ) : null;

  return (
    <aside className={`g-sidebar ${collapsed ? 'g-sidebar--rail' : ''}`}>
      {/* Header — fixed above the scroll region. The export control (the
          three lines) lives only in the icon rail: the full column is opened
          by it, and closed from its X, which narrows the column straight back
          to this top-left control rather than removing it from the page. */}
      <div className="shrink-0 border-b border-[#e3e3e3]">
        {collapsed ? (
          <div className="flex items-center justify-center py-2">
            {onToggleCollapsed &&
              iconButton(
                'Show the full sidebar',
                onToggleCollapsed,
                <Menu className="w-5 h-5" aria-hidden="true" />,
              )}
          </div>
        ) : (
          <div className="flex h-14 items-center gap-1 px-3">
            <img
              src="/logo_withsubtitle.png"
              alt="Earth Talk"
              className="mr-auto h-9 w-auto max-w-full object-contain select-none"
            />
            {onClose && iconButton('Collapse sidebar', onClose, <X className="w-5 h-5" aria-hidden="true" />)}
          </div>
        )}
      </div>

      {/* Navigation + contextual panel — the one scroll region, with the
          header, the switch and the footer held outside it. */}
      <div className="g-scroll min-h-0 flex-1 overflow-y-auto pb-2">
        {visibleGroups.map((group, groupIndex) => {
          return (
            <nav
              key={group.id}
              aria-label={group.title}
              className={groupIndex > 0 ? 'mt-1 pt-1' : 'pt-1'}
            >
              {group.id === 'learn' && !collapsed && (
                <div className="relative">
                  {NAV_FOOTER_UTILS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="et-menu-item"
                      data-menu-id={item.id}
                      aria-haspopup="menu"
                      aria-expanded={languageOpen}
                      aria-label={item.label}
                      title={item.subtitle}
                      onClick={() => setLanguageOpen((prev) => !prev)}
                    >
                      <item.icon className="h-6 w-6 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      <span className="et-menu-label">{t(item.label)}</span>
                    </button>
                  ))}

                  {languageOpen && (
                    <>
                      {/* A full-surface catcher dismisses the popover on the next click anywhere. */}
                      <div
                        className="fixed inset-0 z-40"
                        aria-hidden="true"
                        onClick={() => setLanguageOpen(false)}
                      />
                      <div className="absolute bottom-full left-2 z-50 mb-1">
                        <LanguageCard onSelect={() => setLanguageOpen(false)} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {group.entries.map((entry) => {
                const Icon = entry.icon;
                const isActive = isEntryActive(entry);

                return (
                  <button
                    key={`${entry.id}-${entry.panel ?? 'default'}`}
                    type="button"
                    className={`et-menu-item ${collapsed ? 'et-menu-item--rail' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={entry.label}
                    title={collapsed ? entry.label : undefined}
                    onClick={() => handleEntry(entry)}
                  >
                    <Icon
                      className="h-6 w-6 shrink-0"
                      strokeWidth={isActive ? 2.1 : 1.75}
                      aria-hidden="true"
                    />
                    <span className="et-menu-label">{t(entry.label)}</span>
                  </button>
                );
              })}
            </nav>
          );
        })}

        {!collapsed && children}
      </div>

      {/* Primary action + session state — pinned to the bottom, outside the
          scroll region, so starting on WhatsApp is always one click away. */}
      <div
        className={`shrink-0 border-t border-[#e3e3e3] bg-[#f8fafd] space-y-2 ${
          collapsed ? 'flex flex-col items-center px-2 py-3' : 'px-3 py-3'
        }`}
      >
        {collapsed ? (
          <>
            <button
              type="button"
              className="g-icon-btn h-11 w-11"
              title={whatsAppLabel}
              aria-label={whatsAppLabel}
              onClick={onOpenWhatsApp}
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
            {identity ? (
              <div className="relative">
                <button
                  type="button"
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${identity.avatarClass}`}
                  title={`${identity.name} · ${identity.role}`}
                  aria-label={`${identity.name} — account and log out`}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                >
                  {identity.initials}
                </button>
                {accountMenu}
              </div>
            ) : (
              <button
                type="button"
                className="g-icon-btn h-11 w-11"
                title="Sign in"
                aria-label="Sign in"
                onClick={onOpenLogin}
              >
                <LogIn className="h-5 w-5" />
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="g-btn g-btn-filled h-11 w-full"
              onClick={onOpenWhatsApp}
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
              <span>{whatsAppLabel}</span>
            </button>

            {identity ? (
              <div className="relative">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-[#f0f4f9]"
                  title={`${identity.name} · ${identity.role}`}
                  aria-label={`${identity.name} — account and log out`}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${identity.avatarClass}`}
                  >
                    {identity.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium leading-tight text-[#1f1f1f]">
                      {identity.name}
                    </div>
                    <div className="flex items-center gap-1 truncate text-[10px] leading-tight text-[#5e5e5e]">
                      {identity.admin && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
                      {identity.role}
                    </div>
                  </div>
                </button>
                {accountMenu}
              </div>
            ) : (
              <button
                type="button"
                className="g-btn g-btn-outlined h-11 w-full"
                onClick={onOpenLogin}
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>Sign in</span>
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
