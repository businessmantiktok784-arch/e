import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SiteExplorerModal } from './components/SiteExplorerModal.js';
import { AboutSection, HowItWorksSection } from './components/AboutSection.js';
import { WhatsAppCtaModal } from './components/WhatsAppCtaModal.js';
import { GeneralLoginModal } from './components/GeneralLoginModal.js';
import { ExpertDashboardView } from './components/ExpertDashboardView.js';
import { AdminModerationDashboard } from './components/AdminModerationDashboard.js';
import { ResearchAnalyticsDashboard } from './components/ResearchAnalyticsDashboard.js';
import { CommunityDiscoveryView } from './components/CommunityDiscoveryView.js';
import { ValidationEvaluationDashboard } from './components/ValidationEvaluationDashboard.js';
import { Sidebar } from './components/Sidebar.js';
import { MapSearchOverlay } from './components/MapSearchOverlay.js';
import { MapFilterControl } from './components/MapFilterControl.js';
import { MapView, type MapNavTarget, type OwnerMapPost } from './components/MapView.js';
import { ObservationSideCard } from './components/ObservationSideCard.js';
import { MyEarthTalkView } from './components/MyEarthTalkView.js';
import { MyMapView } from './components/MyMapView.js';
import { HistoryView } from './components/HistoryView.js';
import { recordHistory, type HistoryEntry } from './services/history.js';
import { openWhatsApp, WHATSAPP_MY_EARTH_TALK_MESSAGE } from './services/whatsapp.js';

import { fetchSitesGeoJson } from './services/communityApi.js';
import { fetchPost, fetchMyPosts } from './services/postsApi.js';
import { refreshSession, signOut as signOutCommunity, useCommunityUser } from './services/communityAuth.js';
import {
  createFieldExplorerAccount,
  localAccountAsUser,
  signOutLocalAccount,
  useLocalAccount,
} from './services/localAccount.js';
import { LocalAccountModal } from './components/LocalAccountModal.js';
import type { CommunityPostDetail } from './types/communityPosts.js';
import {
  getNavEntry,
  NAV_ENTRIES,
  type AppView,
  type CommunityPanel,
} from './navigation.js';
import type { PublicSiteGeoJson } from './types/community.js';
import { getStoredExpertUser, clearExpertSession } from './services/expertApi.js';
import type { ExpertUser } from './types/expert.js';
import {
  fetchPublicGeoJson,
  fetchPublicDistricts,
  fetchPublicCategories,
  fetchUnlocatedObservations,
} from './services/publicApi.js';
import type {
  PublicObservationGeoJson,
  PublicObservationSummary,
  PublicDistrictCount,
  PublicCategoryCount,
  ObservationFilters,
} from './types/public.js';
import {
  AlertCircle,
  RefreshCw,
  Layers,
  MapPin,
  Menu,
  Search,
} from 'lucide-react';
import {
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  NO_EVIDENCE_HEX,
  type EvidenceState,
} from './types/community.js';

/**
 * Desktop shell.
 *
 * There is no inline navigation and no bar above the map. Every feature of
 * every stage is a destination in the left sidebar, and each destination also
 * owns the contextual panel that sits beneath it in the same column. The map
 * view is full bleed with a single Google-style search field on the canvas.
 */
export const App: React.FC = () => {
  // The shell opens on the map. Every destination, including the footer's
  // Language control, is a real view or an in-place popover - there is no
  // separate feature screen to track.
  const [view, setView] = useState<AppView>('explore');
  // On desktop the column narrows to an icon rail, which gives the map its
  // room and keeps every icon reachable. On a phone the same flag means the
  // drawer is shut, so a phone never starts with the column covering the map.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  // Desktop only: the column closed entirely with its X. The map then shows a
  // "show sidebar" button, the way Google Maps hides and restores its drawer.
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);
  // Below this width the column cannot sit inline beside the map, so it
  // becomes an animated overlay drawer instead.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  // The geological site layer is always drawn; the map has its own control too.
  const showSites = true;
  const [communityPanel, setCommunityPanel] = useState<CommunityPanel>('investigations');

  // Expert Authentication & Portal State (Stage 5)
  const [currentExpert, setCurrentExpert] = useState<ExpertUser | null>(() => getStoredExpertUser());

  // WhatsApp contributor session (Stage 12). The session store is reactive, so
  // the side card and the MY EARTH TALK dashboard update the moment a token is
  // established or signed out, without prop drilling or a context provider.
  const communityUser = useCommunityUser();

  // Community Discovery only needs a name to contribute. A reader without a
  // WhatsApp session can still sign in locally; either identity counts as
  // "signed in" for the read-only gate on asking, answering and voting.
  const localAccount = useLocalAccount();
  const viewer = communityUser ?? (localAccount ? localAccountAsUser(localAccount) : null);
  const isSignedIn = Boolean(viewer);

  // One general sign-in surface serves both audiences: a contributor with a
  // WhatsApp number and the administrator with an email. Whichever the backend
  // returns decides where the session lands.
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  // The lightweight Community Discovery sign-in (display name only).
  const [isLocalLoginOpen, setIsLocalLoginOpen] = useState(false);

  // Filter & Search State.
  const [filters, setFilters] = useState<ObservationFilters>({});

// Data State
  const [districts, setDistricts] = useState<PublicDistrictCount[]>([]);
  const [categories, setCategories] = useState<PublicCategoryCount[]>([]);
  const [geojson, setGeojson] = useState<PublicObservationGeoJson | null>(null);
  const [sitesGeoJson, setSitesGeoJson] = useState<PublicSiteGeoJson | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  // The reader's own located posts, for the private overlay on the map. Only
  // ever fetched for their own session, and only drawn when they ask for it.
  const [ownerPosts, setOwnerPosts] = useState<OwnerMapPost[]>([]);
  // Published posts with no public coordinate, shown on the Geoscience sites
  // page because the map cannot place them. Search and category narrow the list
  // the same way Explore's controls narrow the map.
  const [unlocatedPosts, setUnlocatedPosts] = useState<PublicObservationSummary[]>([]);
  const [loadingUnlocated, setLoadingUnlocated] = useState(false);
  // The same filter set Explore uses, applied to the Geoscience sites page so
  // the two surfaces narrow by an identical vocabulary.
  const [sitesFilters, setSitesFilters] = useState<ObservationFilters>({});

  // The passport whose side card is open on the map.
  const [selectedPassportId, setSelectedPassportId] = useState<string | null>(null);

  // Community post side card (Stage 12), keyed to the same selected passport.
  const [selectedPost, setSelectedPost] = useState<CommunityPostDetail | null>(null);
  const [loadingPost, setLoadingPost] = useState(false);
  // "Open full Geoscience Passport" shows the same side card content full
  // screen; no second record is fetched, so nothing is changed or added.
  const [passportFullscreen, setPassportFullscreen] = useState(false);

// In-map navigation requested from the observation side card: the map draws
  // the trip from the user to this place, all inside the platform.
  const [navTarget, setNavTarget] = useState<MapNavTarget | null>(null);

  // WhatsApp CTA Dialog
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Loading & Error States
const [loadingMap, setLoadingMap] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

// Request abort controller for cancellation of older map requests (Section 53)
  const mapAbortRef = useRef<AbortController | null>(null);

  const isMapView = view === 'explore';
  // The private map fills the viewport like Explore does; every other view
  // scrolls inside the main column.
  const isFullHeightView = isMapView || view === 'my-map';

// Track the viewport so the column can be inline on a desktop and an overlay
  // on a phone, without a media query and a JS breakpoint disagreeing.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = (event: MediaQueryListEvent | MediaQueryList) => setIsNarrow(event.matches);
    sync(mq);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Reconcile a stored WhatsApp session with the server once, so a revoked or
  // expired token is dropped on load rather than trusted from local storage.
  useEffect(() => {
    refreshSession().catch(() => {
      // A network hiccup leaves the stored session in place for the next load.
    });
  }, []);

  // My Earth Talk opens without a sign-in wall: a reader with no session is
  // given an auto-created "Field Explorer" identity they can rename, rather
  // than being blocked from their own dashboard.
  useEffect(() => {
    if (view === 'mine' && !viewer) {
      createFieldExplorerAccount();
    }
  }, [view, viewer]);

  // Load the reader's own located posts for the map's private overlay. Only
  // posts that actually carry a coordinate can be placed, so the unlocated ones
  // are left to the Geoscience sites list rather than pinned at a guess.
  useEffect(() => {
    let cancelled = false;
    if (!viewer) {
      setOwnerPosts([]);
      return;
    }
    fetchMyPosts()
      .then((posts) => {
        if (cancelled) return;
        setOwnerPosts(
          posts
            .filter(
              (post): post is typeof post & { latitude: number; longitude: number } =>
                typeof post.latitude === 'number' && typeof post.longitude === 'number'
            )
            .map((post) => ({
              passport_id: post.passport_id,
              title: post.title,
              observation_category: post.observation_category,
              latitude: post.latitude,
              longitude: post.longitude,
            }))
        );
      })
      .catch(() => {
        if (!cancelled) setOwnerPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [viewer]);

// Load the district and category lists that drive the filters. Categories come
  // from the API rather than a bundled constant, so a filter option is never
  // hidden just because nobody has submitted one yet - and a category this build
  // has never heard of still appears.
  const loadDistrictsAndCategories = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        fetchPublicDistricts(),
        fetchPublicCategories(),
      ]);
      setDistricts(d);
      setCategories(c);
    } catch {
      // Ignore initial load failure gracefully
    }
  }, []);

  useEffect(() => {
    loadDistrictsAndCategories();
  }, [loadDistrictsAndCategories]);

  // Geological sites are loaded independently of the observation filters.
  // A failure here must not blank the map: the observation layer still works.
  useEffect(() => {
    let cancelled = false;

    fetchSitesGeoJson({ limit: 500 })
      .then((fc) => {
        if (!cancelled) setSitesGeoJson(fc);
      })
      .catch(() => {
        if (!cancelled) setSitesGeoJson({ type: 'FeatureCollection', features: [] });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load the published posts that have no public coordinate, for the Geoscience
  // sites page. Fetched only when that page is open, so an Explore session
  // never pays for a list it will not show.
  useEffect(() => {
    if (view !== 'sites') return;
    let cancelled = false;
    setLoadingUnlocated(true);
    const controller = new AbortController();

    fetchUnlocatedObservations(sitesFilters, 1, 200, controller.signal)
      .then((result) => {
        if (!cancelled) setUnlocatedPosts(result.data);
      })
      .catch(() => {
        if (!cancelled) setUnlocatedPosts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUnlocated(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [view, sitesFilters]);

  // Load Map GeoJSON with active filters
  const loadMapData = useCallback(async (currentFilters: ObservationFilters) => {
    if (mapAbortRef.current) {
      mapAbortRef.current.abort();
    }
    const controller = new AbortController();
    mapAbortRef.current = controller;

    setLoadingMap(true);
    setApiError(null);

    try {
      const data = await fetchPublicGeoJson(currentFilters, undefined, controller.signal);
      setGeojson(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setApiError('Unable to refresh map observations. Please check your connection.');
      }
    } finally {
      setLoadingMap(false);
    }
  }, []);

  // Load Recent Observations List with active filters
  // Debounced load triggered when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadMapData(filters);
    }, 200);

    return () => clearTimeout(timer);
  }, [filters, loadMapData]);

  const handleSelectObservation = async (passportId: string) => {
    setSelectedPassportId(passportId);
    setLoadingPost(true);
    try {
      const post = await fetchPost(passportId);
      setSelectedPost(post);
      recordHistory({
        view: 'explore',
        passportId,
        label: post?.title ?? 'Observation',
        subtitle: 'Observation',
      });
    } catch {
      setSelectedPost(null);
      recordHistory({ view: 'explore', passportId, label: 'Observation', subtitle: 'Observation' });
    } finally {
      setLoadingPost(false);
    }
  };

  /** Reopens a screen recorded in the sidebar's History list. */
  const handleOpenHistoryEntry = (entry: HistoryEntry) => {
    if (entry.passportId) {
      setView('explore');
      setIsSidebarHidden(false);
      if (isNarrow) setIsSidebarCollapsed(true);
      void handleSelectObservation(entry.passportId);
      return;
    }
    if (entry.siteId) {
      handleSelectSite(entry.siteId);
      return;
    }
    handleNavigate(entry.view, entry.panel);
  };


  /**
   * "Open full Geoscience Passport" from the map card: expands the card that is
   * already on screen to the full-screen passport, using the very same post and
   * layout - nothing is fetched again, changed, or added.
   */
  const handleOpenFullPassport = () => {
    if (!selectedPost) return;
    setPassportFullscreen(true);
  };

  /** MY EARTH TALK: open one of the contributor's posts on the map. */
  const handleOpenMyPost = (passportId: string) => {
    setView('explore');
    handleSelectObservation(passportId);
  };

  /** Opens a geoscience site's explorer. */
  const handleSelectSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    recordHistory({ view: 'sites', siteId, label: 'Site explorer', subtitle: siteId });
  };

  const closeSideCard = () => {
    setSelectedPassportId(null);
    setSelectedPost(null);
    setPassportFullscreen(false);
  };

  const handleResetFilters = () => {
    setFilters({});
  };

  const handleOpenLogin = () => {
    setIsLoginOpen(true);
  };

  /**
   * The sidebar's "Start on WhatsApp" action. A signed-in contributor skips the
   * guide card and lands in My Earth Talk on WhatsApp; a visitor is shown the
   * card first, because there is no account to carry over yet.
   */
  const handleOpenWhatsApp = () => {
    if (isSignedIn) {
      if (!openWhatsApp(WHATSAPP_MY_EARTH_TALK_MESSAGE)) setIsWhatsAppModalOpen(true);
      return;
    }
    setIsWhatsAppModalOpen(true);
  };

  // Community Discovery's read-only gate: a visitor who tries to ask, answer or
  // vote is asked for a display name first.
  const handleOpenWriteLogin = () => {
    setIsLocalLoginOpen(true);
  };

  const handleSignOut = () => {
    clearExpertSession();
    setCurrentExpert(null);
    signOutLocalAccount();
    void signOutCommunity();
    setView('explore');
  };

const handleNavigate = (next: AppView, panel?: CommunityPanel) => {
    setView(next);
    // A section entry opens its own section; a plain view entry restores that
    // view's default section, so the active item in the sidebar always agrees
    // with what is on screen.
    if (next === 'community') setCommunityPanel(panel ?? 'investigations');
    // A destination was chosen, so the navigation column must be reachable
    // again even if it was closed entirely with its X.
    setIsSidebarHidden(false);
    // On a narrow viewport the column is a drawer, so choosing a destination
    // shuts it and reveals the content behind it.
    if (isNarrow) setIsSidebarCollapsed(true);
    // Remember the visit in the local History list. A section entry is matched
    // by its panel so the row reads "My questions", not the group's first entry.
    const entry =
      NAV_ENTRIES.find((e) => e.id === next && (panel ? e.panel === panel : true)) ??
      getNavEntry(next);
    recordHistory({ view: next, panel, label: entry.label, subtitle: entry.subtitle });
  };

  /** Contextual panel rendered inside the sidebar, beneath the navigation. */
  const sidebarPanel = (
    <>
      {/* Data status. Reported in the sidebar so nothing is stacked above the map. */}
      {apiError && (
        <div className="g-panel !border-t-0 !mt-0 !pt-3">
          <div className="rounded-lg bg-[#fef7e0] border border-[#ffdf99] p-3 flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 text-[11px] text-[#9f6108] leading-snug">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              <span>{apiError}</span>
            </div>
            <button
              type="button"
              className="g-btn g-btn-text h-7 px-2 text-[11px] shrink-0"
              onClick={() => {
                loadMapData(filters);
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}
    </>
  );

  const sidebar = (
    <Sidebar
      view={view}
      onNavigate={handleNavigate}
      onOpenWhatsApp={handleOpenWhatsApp}
      onOpenLogin={handleOpenLogin}
      onSignOut={handleSignOut}
      currentExpert={currentExpert}
      currentUser={viewer}
      onToggleCollapsed={() => setIsSidebarCollapsed((prev) => !prev)}
      collapsed={isSidebarCollapsed}
      overlay={isNarrow}
        onClose={() => {
          // The X narrows the column to its icon rail - on a phone that is the
          // drawer sliding shut, on desktop the full list folding to icons.
          // The three lines at the rail's top-left bring it back.
          setIsSidebarCollapsed(true);
        }}
activePanel={view === 'community' ? communityPanel : null}
    >
      {sidebarPanel}
    </Sidebar>
  );

  // Geoscience sites narrowing. The full Explore filter set drives this page:
  // the unlocated posts are filtered on the server, and the site cards are
  // narrowed locally on the fields a site feature actually carries (district,
  // category, evidence state, and whether it holds an investigation/evidence).
  const sitesQuery = (sitesFilters.search ?? '').trim().toLowerCase();
  const filteredSiteFeatures = (sitesGeoJson?.features ?? []).filter((feature) => {
    const p = feature.properties;
    if (sitesFilters.district && p.district !== sitesFilters.district) return false;
    if (sitesFilters.category && !(p.observed_classifications ?? []).includes(sitesFilters.category)) {
      return false;
    }
    if (sitesFilters.evidence_state && p.highest_evidence_state !== sitesFilters.evidence_state) {
      return false;
    }
    if (sitesFilters.has_investigation && p.investigation_count <= 0) return false;
    if (sitesFilters.has_evidence && (p.evidence_count ?? 0) <= 0) return false;
    if (!sitesQuery) return true;
    return [
      p.title,
      p.site_code,
      p.district ?? '',
      ...(p.observed_classifications ?? []),
    ].some((value) => String(value ?? '').toLowerCase().includes(sitesQuery));
  });

  // The unlocated posts are already filtered end to end by the server through
  // `sitesFilters` (including the search term), so nothing is applied again here.
  const filteredUnlocatedPosts = unlocatedPosts;

  // The district choices for the sites filter, assembled from both lists so a
  // district that only holds an unlocated post is still offered.
  const sitesDistricts = (() => {
    const counts = new Map<string, number>();
    const add = (name: string | null | undefined) => {
      if (!name) return;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    };
    for (const feature of sitesGeoJson?.features ?? []) add(feature.properties.district);
    for (const post of unlocatedPosts) add(post.district);
    return Array.from(counts, ([name, observation_count]) => ({ name, observation_count })).sort(
      (a, b) => a.name.localeCompare(b.name)
    );
  })();

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8fafd] text-[#1f1f1f]">
{/* The navigation column. On desktop it sits inline and the three lines in
          its header narrow it to an icon rail. On a narrow viewport it becomes
          a drawer: it stays mounted so opening and closing both animate, and
          while shut it is translated off-screen and inert. The map's "show
          sidebar" button and a floating Menu button bring it back. */}
      {!isSidebarHidden &&
        (isNarrow ? (
          <div
            className={`fixed inset-x-0 top-0 z-50 h-dvh ${
              isSidebarCollapsed ? 'pointer-events-none' : ''
            }`}
          >
            <div
              className={`absolute inset-0 bg-[#1f1f1f]/40 transition-opacity duration-200 ${
                isSidebarCollapsed ? 'opacity-0' : 'opacity-100'
              }`}
              onClick={() => setIsSidebarCollapsed(true)}
            />
            <div
              inert={isSidebarCollapsed}
              className={`relative h-full shadow-2xl transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                isSidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
              }`}
            >
              {sidebar}
            </div>
          </div>
        ) : (
          <div className="flex">{sidebar}</div>
        ))}

<div className="flex-1 min-w-0 flex flex-col relative">
        {/* There is no bar above the map and nothing floating over it. The
            sidebar owns the navigation, the filters and every other control. */}

        <main className={`flex-1 min-h-0 g-scroll ${isFullHeightView ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {isMapView && (
            <div className="relative h-full w-full">
              <MapView
                geojson={geojson}
                loading={loadingMap}
                selectedPassportId={selectedPassportId}
                onSelectObservation={handleSelectObservation}
                sitesGeoJson={sitesGeoJson}
                onSelectSite={(siteId) => handleSelectSite(siteId)}
                showSites={showSites}
                sidebarHidden={isSidebarHidden || (isNarrow && isSidebarCollapsed)}
                onOpenSidebar={() => {
                  setIsSidebarHidden(false);
                  setIsSidebarCollapsed(false);
                }}
                navTarget={navTarget}
                ownerPosts={ownerPosts}
              />

              {/* The one search box in the app, on the map canvas, with the
                  filter button inside its right edge. The sidebar has none. */}
<MapSearchOverlay
                value={filters.search ?? ''}
                onSearch={(text) => setFilters((prev) => ({ ...prev, search: text || undefined }))}
                trailing={
                  <MapFilterControl
                    filters={filters}
                    onChange={setFilters}
onReset={handleResetFilters}
         districts={districts}
         categories={categories}
       />
                }
              />

              {/* The observation side card slides over the map, Google-Maps
                  style, when a pin is opened. It describes the same observation
                  the halo lights up, and it is the conversation surface: media,
                  report, AI interpretation, questions and discussion. */}
              {selectedPassportId && (selectedPost !== null || loadingPost) && (
                <div className="absolute inset-y-0 right-0 z-30 flex">
                  <ObservationSideCard
                    post={selectedPost}
                    loading={loadingPost}
                    viewer={viewer}
                    onClose={closeSideCard}
                    onRequestLogin={handleOpenLogin}
                    onOpenPassport={handleOpenFullPassport}
                    onPostChanged={setSelectedPost}
                    onNavigate={(latitude, longitude, label) =>
                      setNavTarget({ latitude, longitude, label })
                    }
                    fullscreen={passportFullscreen}
                    onExitFullscreen={() => setPassportFullscreen(false)}
                  />
                </div>
              )}
            </div>
          )}

          {view === 'sites' && (
            <div className="p-6 space-y-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[15px] font-medium text-[#1f1f1f]">Geoscience sites</h2>
                <span className="text-[12px] text-[#5e5e5e] font-mono">
                  {sitesGeoJson?.features.length ?? 0} published
                </span>
              </div>

              {/* Search plus the same filter menu Explore attaches to its
                  search field, so the two surfaces narrow by one vocabulary. */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8f8f8f]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={sitesFilters.search ?? ''}
                    onChange={(e) =>
                      setSitesFilters((prev) => ({ ...prev, search: e.target.value || undefined }))
                    }
                    placeholder="Search sites, districts or posts"
                    className="g-input w-full pl-9 pr-12 h-10 text-sm"
                    aria-label="Search geoscience sites and posts"
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                    <MapFilterControl
                      filters={sitesFilters}
                      onChange={setSitesFilters}
                      onReset={() => setSitesFilters({})}
                      districts={sitesDistricts}
                      categories={categories}
                    />
                  </div>
                </div>
              </div>

{(sitesGeoJson?.features.length ?? 0) === 0 ? (
                <div className="py-16 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f0f4f9] border border-[#e3e3e3]">
                    <MapPin className="h-8 w-8 text-[#c7c7c7]" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <p className="font-medium text-[#1f1f1f] mb-1">No site has a public coordinate yet.</p>
                  <p className="text-xs">
                    A site without an authorised coordinate is left out rather than placed at a guessed position.
                  </p>
                </div>
              ) : filteredSiteFeatures.length === 0 ? (
                <div className="py-10 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
                  No site matches your search.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredSiteFeatures.map((feature) => {
                    const p = feature.properties;
                    const state: EvidenceState | null = p.highest_evidence_state;
                    return (
                      <div key={p.site_id} className="g-card p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[14px] font-medium text-[#1f1f1f]">{p.title}</h3>
                          <span
                            className="w-3 h-3 rounded-full shrink-0 mt-1 ring-1 ring-white"
                            style={{ background: state ? EVIDENCE_STATE_HEX[state] : NO_EVIDENCE_HEX }}
                            title={state ? EVIDENCE_STATE_LABELS[state] : 'Nothing established'}
                          />
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[#0b57d0] flex items-center gap-2">
                          {p.site_code}
                          {p.is_demo && (
                            <span className="font-sans text-[11px] px-2 py-0.5 rounded-md bg-[#fff3d7] text-[#9f6108] border border-[#9f6108]/30">
                              Demo
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="g-chip">{state ? EVIDENCE_STATE_LABELS[state] : 'Nothing established'}</span>
                          <span className="g-chip">{p.grouping_basis.replace(/_/g, ' ')}</span>
                          <span className="g-chip">{p.location_precision.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="mt-3 pt-2 border-t border-[#e3e3e3] text-[11px] text-[#5e5e5e] flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" aria-hidden="true" />
                            {p.district ? `${p.district} District` : 'Rwanda'}
                          </span>
                          <span className="font-mono">
                            {p.observation_count} obs · {p.investigation_count} inv
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            className="g-btn g-btn-filled h-8 px-3 text-[12px]"
                            onClick={() => handleSelectSite(p.site_id)}
                          >
                            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Site Explorer</span>
                          </button>
                          <button
                            type="button"
                            className="g-btn g-btn-text h-8 px-2 text-[12px]"
                            onClick={() => {
                              const [lon, lat] = feature.geometry.coordinates;
                              setNavTarget({ latitude: lat, longitude: lon, label: p.title });
                              setView('explore');
                            }}
                          >
                            Show on map
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Posts published without a public coordinate. The map cannot
                  place them, so they are grouped and listed here, each opening
                  its own card. A reader who knows the area can still find them. */}
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[14px] font-medium text-[#1f1f1f]">
                    Posts without a published location
                  </h3>
                  <span className="text-[12px] text-[#5e5e5e] font-mono">
                    {filteredUnlocatedPosts.length} listed
                  </span>
                </div>
                <p className="text-[12px] text-[#5e5e5e] max-w-3xl leading-relaxed">
                  These observations were published without a coordinate, so no pin can be drawn for them.
                  They are listed rather than placed at a guessed point. Open one to read it, or add what
                  you know about where it was found.
                </p>

                {loadingUnlocated ? (
                  <div className="py-10 text-center text-[#5e5e5e] text-sm">Loading published posts…</div>
                ) : filteredUnlocatedPosts.length === 0 ? (
                  <div className="py-10 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
                    No published post is missing a location.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredUnlocatedPosts.map((post) => (
                      <button
                        key={post.passport_id}
                        type="button"
                        onClick={() => handleSelectObservation(post.passport_id)}
                        className="g-card p-4 text-left hover:border-[#0b57d0] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-[14px] font-medium text-[#1f1f1f]">
                            {post.post_title || post.possible_name || 'Untitled observation'}
                          </h4>
                          {post.is_demo && (
                            <span className="font-sans text-[11px] px-2 py-0.5 rounded-md bg-[#fff3d7] text-[#9f6108] border border-[#9f6108]/30 shrink-0">
                              Demo
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[#0b57d0]">{post.passport_id}</div>
                        {post.primary_interpretation && (
                          <p className="mt-2 text-[12px] text-[#3c4043] leading-relaxed line-clamp-2">
                            {post.primary_interpretation}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="g-chip">
                            {(post.observation_category || 'unknown').replace(/_/g, ' ')}
                          </span>
                          <span className="g-chip">
                            {(post.district ? `${post.district} District` : 'No district')}
                          </span>
                          <span className="g-chip">No published location</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

{view === 'community' && (
            <div className="p-6">
              <CommunityDiscoveryView
                activePanel={communityPanel}
                onPanelChange={setCommunityPanel}
                viewer={viewer}
                onRequestLogin={handleOpenWriteLogin}
                onOpenPost={handleOpenMyPost}
              />
            </div>
          )}

          {view === 'mine' && (
            <MyEarthTalkView
              viewer={viewer}
              onRequestLogin={handleOpenLogin}
              onOpenPost={handleOpenMyPost}
            />
          )}

          {view === 'my-map' && (
            <MyMapView
              viewer={viewer}
              onRequestLogin={handleOpenLogin}
              onOpenPost={handleOpenMyPost}
            />
          )}

          {view === 'history' && <HistoryView onOpen={handleOpenHistoryEntry} />}

          {view === 'research' && (
            <div className="p-6">
              <ResearchAnalyticsDashboard onBackToQueue={() => setView('explore')} />
            </div>
          )}

          {view === 'reviews' &&
            (currentExpert ? (
              <ExpertDashboardView
                currentUser={currentExpert}
                onLogout={handleSignOut}
                onSwitchToPublicMap={() => setView('explore')}
              />
            ) : (
              <div className="p-6">
                <div className="g-card p-8 text-center max-w-lg mx-auto">
                  <h2 className="text-[16px] font-medium text-[#1f1f1f]">Expert verification portal</h2>
                  <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
                    This portal is restricted to the Super Admin. There is no expert account system and no
                    passwordless path: a review can only be attributed to a named, authenticated reviewer.
                  </p>
                  <button
                    type="button"
                    className="g-btn g-btn-filled mt-4"
                    onClick={handleOpenLogin}
                  >
                    Sign in to continue
                  </button>
                </div>
              </div>
            ))}

          {view === 'moderation' &&
            (currentExpert ? (
              <AdminModerationDashboard currentUser={currentExpert} onLogout={handleSignOut} />
            ) : (
              <div className="p-6">
                <div className="g-card p-8 text-center max-w-lg mx-auto">
                  <h2 className="text-[16px] font-medium text-[#1f1f1f]">Moderation</h2>
                  <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
                    The abuse-report queue is restricted to the Super Admin, because every decision is
                    attributed to the reviewer who made it.
                  </p>
                  <button type="button" className="g-btn g-btn-filled mt-4" onClick={handleOpenLogin}>
                    Sign in to continue
                  </button>
                </div>
              </div>
            ))}

          {view === 'validation' &&
            (currentExpert ? (
              <div className="p-6">
                <ValidationEvaluationDashboard />
              </div>
            ) : (
              <div className="p-6">
                <div className="g-card p-8 text-center max-w-lg mx-auto">
                  <h2 className="text-[16px] font-medium text-[#1f1f1f]">Field validation and model evaluation</h2>
                  <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
                    Every validation route requires an authenticated Super Admin session. Nothing on this screen is
                    simulated, so there is nothing to show without a session.
                  </p>
                  <button
                    type="button"
                    className="g-btn g-btn-filled mt-4"
                    onClick={handleOpenLogin}
                  >
                    Sign in to continue
                  </button>
                </div>
              </div>
            ))}

          {view === 'how-it-works' && (
            <div className="bg-white">
              <HowItWorksSection onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)} />
            </div>
          )}

          {view === 'about' && (
            <div className="bg-white">
              <AboutSection onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)} />
            </div>
          )}
        </main>
      </div>

      {/* Reopens the navigation on a view that carries no map chrome of its
          own: a phone whose drawer is shut, or a desktop column that was
          closed with its X while a full-page view is open. */}
      {!isMapView && (isSidebarHidden || (isNarrow && isSidebarCollapsed)) && (
        <button
          type="button"
          onClick={() => {
            setIsSidebarHidden(false);
            setIsSidebarCollapsed(false);
          }}
          className="fixed bottom-4 left-3 z-40 flex h-11 items-center gap-2 rounded-full border border-[#e3e3e3] bg-white pl-4 pr-5 text-[13px] font-medium text-[#1f1f1f] shadow-[var(--g-elev-2)] transition-colors hover:bg-[#f0f4f9]"
        >
          <Menu className="h-5 w-5 text-[#5e5e5e]" aria-hidden="true" />
          Menu
        </button>
      )}

      {/* Site Explorer, opened from a site row or a geological site marker on the map */}
      <SiteExplorerModal siteId={selectedSiteId} onClose={() => setSelectedSiteId(null)} />

      {/* WhatsApp Guide Modal */}
      <WhatsAppCtaModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
      />

      {/* One sign-in surface for both audiences. What the backend returns
          decides the destination: a contributor lands on My Earth Talk, the
          administrator on Expert reviews. */}
      <GeneralLoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onUserLogin={() => {
          setIsLoginOpen(false);
          setView('mine');
        }}
        onAdminLogin={(expert) => {
          setIsLoginOpen(false);
          setCurrentExpert(expert);
          setView('reviews');
        }}
      />

      {/* Community Discovery's lightweight sign-in. A reader only needs a name
          to ask, answer or vote; the WhatsApp path stays a click away. */}
      <LocalAccountModal
        isOpen={isLocalLoginOpen}
        onClose={() => setIsLocalLoginOpen(false)}
        onUseWhatsApp={handleOpenLogin}
      />
    </div>
  );
};
