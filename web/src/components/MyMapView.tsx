import React, { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, Map as MapIcon, Telescope } from 'lucide-react';
import type { CommunityUser, MyPostSummary } from '../types/communityPosts.js';
import { fetchMyPosts } from '../services/postsApi.js';
import { MapView, type OwnerMapPost } from './MapView.js';

interface MyMapViewProps {
  viewer: CommunityUser | null;
  onRequestLogin: () => void;
  onOpenPost: (passportId: string) => void;
}

/**
 * MY MAP - the contributor's own observations on the map.
 *
 * This is the one place a private observation is drawn at its true point. The
 * map is built from the owner-only endpoint, the public layers are supplied
 * empty, and nothing here is ever shown to another reader. A private post is
 * labelled as private rather than hidden, so the map tells the truth about what
 * only its owner can see.
 */
export const MyMapView: React.FC<MyMapViewProps> = ({
  viewer,
  onRequestLogin,
  onOpenPost,
}) => {
  const [posts, setPosts] = useState<MyPostSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!viewer) return;
    setLoading(true);
    setFailed(false);
    try {
      setPosts(await fetchMyPosts());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [viewer]);

  useEffect(() => {
    setPosts([]);
    if (viewer) load();
  }, [viewer, load]);

  if (!viewer) {
    return (
      <div className="p-6">
        <div className="g-card p-8 text-center max-w-lg mx-auto">
          <MapIcon className="w-8 h-8 text-[#0b57d0] mx-auto" aria-hidden="true" />
          <h2 className="mt-3 text-[16px] font-medium text-[#1f1f1f]">My Map</h2>
          <p className="mt-2 text-[13px] text-[#5e5e5e]">
            Sign in to see your own observations on the map, including the ones you
            have kept private.
          </p>
          <button type="button" className="g-btn g-btn-filled mt-4" onClick={onRequestLogin}>
            Sign in with WhatsApp
          </button>
        </div>
      </div>
    );
  }

  const located = posts.filter(
    (post): post is MyPostSummary & { latitude: number; longitude: number } =>
      typeof post.latitude === 'number' && typeof post.longitude === 'number'
  );
  const ownerPosts: OwnerMapPost[] = located.map((post) => ({
    passport_id: post.passport_id,
    title: post.title,
    observation_category: post.observation_category,
    latitude: post.latitude,
    longitude: post.longitude,
  }));
  const privateCount = posts.filter((post) => !post.is_public).length;
  const unlocatedCount = posts.length - located.length;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[#e3e3e3] px-6 py-4">
        <h2 className="text-[15px] font-medium text-[#1f1f1f] flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-[#0b57d0]" aria-hidden="true" />
          My Map
        </h2>
        <p className="mt-1 text-[12px] text-[#5e5e5e]">
          Only you can see this map. Your private observations appear here at the exact
          point you recorded, and nowhere else in the platform.
        </p>
      </header>

      {failed ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <p className="text-[13px] text-[#5e5e5e]">Your observations could not be loaded.</p>
            <button type="button" className="g-btn g-btn-text mt-2" onClick={load}>
              Try again
            </button>
          </div>
        </div>
      ) : posts.length === 0 && !loading ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <Telescope className="w-7 h-7 text-[#8f8f8f] mx-auto" aria-hidden="true" />
            <p className="mt-3 text-[13px] text-[#5e5e5e]">
              You have not recorded any observations yet. Send a photo to the Earth Talk
              WhatsApp number, and it will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <aside className="order-2 md:order-1 w-full shrink-0 overflow-y-auto border-t border-[#e3e3e3] p-3 space-y-2 md:w-[340px] md:border-t-0 md:border-r">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[11px] text-[#5e5e5e]">
                {located.length} on the map
                {unlocatedCount > 0 ? ` · ${unlocatedCount} without a coordinate` : ''}
              </span>
              {privateCount > 0 && (
                <span className="text-[11px] text-[#6d28d9]">{privateCount} private</span>
              )}
            </div>
            {posts.map((post) => {
              const isOnMap =
                typeof post.latitude === 'number' && typeof post.longitude === 'number';
              return (
                <button
                  key={post.passport_id}
                  type="button"
                  onClick={() => onOpenPost(post.passport_id)}
                  className="w-full rounded-lg border border-[#e3e3e3] bg-white p-3 text-left transition-colors hover:bg-[#f0f4f9]"
                >
                  <p className="truncate text-[13px] font-medium text-[#1f1f1f]">{post.title}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#5e5e5e]">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                        post.is_public ? 'bg-[#e8f0fe] text-[#0b57d0]' : 'bg-[#ede9fe] text-[#6d28d9]'
                      }`}
                    >
                      {post.is_public ? (
                        <Eye className="w-3 h-3" aria-hidden="true" />
                      ) : (
                        <Lock className="w-3 h-3" aria-hidden="true" />
                      )}
                      {post.is_public ? 'Public' : 'Private'}
                    </span>
                    <span>{post.observation_category}</span>
                    {!isOnMap && <span className="text-[#9f6108]">No coordinate</span>}
                  </div>
                </button>
              );
            })}
          </aside>

          <div className="relative order-1 min-h-[360px] flex-1 md:order-2 md:min-h-0">
            <MapView
              geojson={null}
              loading={loading}
              onSelectObservation={onOpenPost}
              showSites={false}
              ownerPosts={ownerPosts}
              ownOnly
            />
            {located.length === 0 && !loading && (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
                <p className="rounded-full border border-[#e3e3e3] bg-white/95 px-3 py-1.5 text-[12px] text-[#5e5e5e] shadow-[var(--g-elev-1)]">
                  None of your observations has a coordinate to place on the map yet.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
