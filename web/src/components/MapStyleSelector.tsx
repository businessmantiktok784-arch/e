import React, { useEffect, useRef, useState } from 'react';

/** Every style the selector can name. There is deliberately no `traffic`,
 *  `transit` or `biking`: OpenStreetMap publishes no live traffic feed, and
 *  the Overpass reads that Transit and Biking would need are unreachable from
 *  this network (every public endpoint answers 5xx or times out), so both
 *  tiles would draw nothing. They were removed rather than left looking
 *  broken. */
export type MapStyleId = 'map' | 'satellite' | 'streets' | 'terrain';

export interface MapStyleChoice {
  id: MapStyleId;
  label: string;
}

/** Map / Satellite / Streets / Terrain - Satellite sits second, in the slot
 *  Google Maps gives it, and Streets is the full road detail view. */
const ENTRIES: readonly MapStyleChoice[] = [
  { id: 'map', label: 'Map' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'streets', label: 'Streets' },
  { id: 'terrain', label: 'Terrain' },
];

const LABELS: Record<MapStyleId, string> = {
  map: 'Map',
  satellite: 'Satellite',
  streets: 'Streets',
  terrain: 'Terrain',
};

/** Diagrams, not screenshots: a stylised picture of what each layer shows.
 *  Traffic / Transit / Biking art depicts the idea of the layer, never live
 *  data this app does not have. */
const StyleArt: React.FC<{ style: MapStyleId }> = ({ style }) => {
  if (style === 'streets') {
    return (
      <svg viewBox="0 0 64 64" className="block h-full w-full" aria-hidden="true">
        <rect width="64" height="64" fill="#f2efe9" />
        <rect x="3" y="4" width="19" height="15" rx="3" fill="#b7e0b0" />
        <rect x="44" y="42" width="17" height="18" rx="3" fill="#b7e0b0" />
        <path d="M-2 57 C14 51 34 62 66 53" stroke="#9cc6ea" strokeWidth="7" fill="none" />
        <path d="M-2 33 L66 27" stroke="#ffd54f" strokeWidth="9" />
        <path d="M-2 33 L66 27" stroke="#fcedc0" strokeWidth="6.5" />
        <path d="M40 -2 L34 66" stroke="#ffd54f" strokeWidth="8" />
        <path d="M40 -2 L34 66" stroke="#fcedc0" strokeWidth="5.5" />
        <path d="M-2 13 L66 16" stroke="#ffffff" strokeWidth="5" />
        <path d="M-2 13 L66 16" stroke="#f2efe9" strokeWidth="3" />
        <path d="M-2 47 L66 44" stroke="#ffffff" strokeWidth="4" />
        <path d="M-2 47 L66 44" stroke="#f2efe9" strokeWidth="2.4" />
        <circle cx="52" cy="14" r="2.2" fill="#7a7365" />
        <circle cx="12" cy="52" r="2.2" fill="#7a7365" />
      </svg>
    );
  }
  if (style === 'terrain') {
    return (
      <svg viewBox="0 0 64 64" className="block h-full w-full" aria-hidden="true">
        <rect width="64" height="64" fill="#f6f0dd" />
        <path
          d="M0 50 C16 38 30 54 48 42 C56 36 60 40 64 38 L64 64 L0 64 Z"
          fill="#d7e5bb"
        />
        <ellipse cx="20" cy="45" rx="13" ry="8" fill="#c3dba0" opacity="0.75" />
        <path
          d="M0 34 C18 22 32 40 50 28 C58 22 62 26 64 24"
          fill="none"
          stroke="#cbb98f"
          strokeWidth="1.2"
        />
        <path
          d="M0 24 C18 12 34 30 52 18 C60 12 62 16 64 14"
          fill="none"
          stroke="#cbb98f"
          strokeWidth="1.2"
        />
        <path d="M0 14 C20 4 36 20 54 8" fill="none" stroke="#cbb98f" strokeWidth="1.2" />
        <path
          d="M2 60 C22 50 40 60 64 48"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.5"
        />
      </svg>
    );
  }
  if (style === 'satellite') {
    return (
      <svg viewBox="0 0 64 64" className="block h-full w-full" aria-hidden="true">
        <rect width="64" height="64" fill="#5b7d4a" />
        <rect x="0" y="0" width="26" height="20" fill="#3f5c34" />
        <rect x="30" y="18" width="16" height="12" rx="1" fill="#7c5f3b" />
        <rect x="12" y="38" width="20" height="14" fill="#8f6a3d" />
        <rect x="42" y="44" width="22" height="20" fill="#46693b" />
        <path d="M0 12 L64 8" stroke="#2c4023" strokeWidth="2" opacity="0.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="block h-full w-full" aria-hidden="true">
      <rect width="64" height="64" fill="#eef1f4" />
      <rect x="3" y="4" width="19" height="15" rx="3" fill="#b7e0b0" />
      <rect x="43" y="43" width="18" height="17" rx="3" fill="#b7e0b0" />
      <path
        d="M-2 57 C14 51 34 62 66 53"
        stroke="#9cc6ea"
        strokeWidth="7"
        fill="none"
      />
      <path d="M-2 33 L66 27" stroke="#dadce0" strokeWidth="8" />
      <path d="M-2 33 L66 27" stroke="#ffffff" strokeWidth="6" />
      <path d="M40 -2 L34 66" stroke="#dadce0" strokeWidth="7" />
      <path d="M40 -2 L34 66" stroke="#ffffff" strokeWidth="5" />
      <path d="M-2 13 L66 16" stroke="#dadce0" strokeWidth="5" />
      <path d="M-2 13 L66 16" stroke="#ffffff" strokeWidth="3.5" />
    </svg>
  );
};

interface MapStyleSelectorProps {
  /** The style currently shown on the collapsed face. */
  active: MapStyleId;
  /** A tile was chosen. The parent decides what that actually changes. */
  onSelect: (id: MapStyleId) => void;
}

/**
 * Google-Maps-style map style selector.
 *
 * Collapsed it is a medium 96x96 card in the bottom-left control stack;
 * hovering it grows the same element sideways into a horizontal white panel
 * of four options (Map, Satellite, Streets, Terrain), thumbnails above labels,
 * the active one highlighted. Everything is drawn with SVG - no screenshots - so
 * the previews are honest diagrams of what a layer shows rather than fake
 * captures.
 *
 * Hover only expands for mouse pointers; touch opens on tap and closes on an
 * outside tap, on Escape, or after choosing a tile. The panel never collapses
 * while the pointer is anywhere inside it.
 */
export const MapStyleSelector: React.FC<MapStyleSelectorProps> = ({
  active,
  onSelect,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Outside tap / Escape closes the panel; anything inside it counts as inside.
  useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) =>
      rootRef.current !== null &&
      target instanceof Node &&
      rootRef.current.contains(target);
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isTouch = () =>
    typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  const choose = (id: MapStyleId) => {
    onSelect(id);
    // Touch has no hover to keep the panel alive, so pick-and-dismiss.
    if (isTouch()) setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative h-[96px] w-[96px]"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setOpen(false);
      }}
    >
      {/* Collapsed face: the Map card. Fades out as the panel grows over it. */}
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          setOpen(true);
          // Opening with Enter or a tap leaves the face inert, which drops its
          // focus, so hand focus to the first tile instead.
          requestAnimationFrame(() =>
            panelRef.current?.querySelector('button')?.focus(),
          );
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Map type, currently ${LABELS[active]}`}
        title="Map type"
        inert={open}
        className={`absolute inset-0 z-0 overflow-hidden rounded-[12px] border-4 border-[#202124] transition-all duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0b57d0] ${
          open
            ? 'pointer-events-none scale-[0.96] opacity-0'
            : 'bg-[#eef1f4] opacity-100'
        }`}
      >
        <span className="absolute inset-0 block">
          <StyleArt style={active} />
        </span>
        <span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/55 to-transparent" />
        <span className="absolute inset-x-0 bottom-1 block text-center text-[12px] font-medium text-white">
          {LABELS[active]}
        </span>
      </button>

      {/* Expanded panel: grows out of the card's footprint, anchored bottom-left. */}
      <div
        ref={panelRef}
        inert={!open}
        role="group"
        className={`absolute bottom-0 left-0 z-10 h-[96px] origin-bottom-left overflow-x-auto overflow-y-hidden rounded-[16px] border border-[#e3e3e3] bg-white transition-all duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          open
            ? 'pointer-events-auto w-[336px] max-w-[calc(100vw_-_88px)] opacity-100 shadow-[var(--g-elev-3)]'
            : 'pointer-events-none w-[96px] opacity-0 shadow-none'
        }`}
        aria-label="Map style"
      >
        <div className="flex h-full w-max items-center gap-1.5 px-2.5">
          {ENTRIES.map((entry) => {
            const id = entry.id;
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => choose(id)}
                aria-pressed={isActive}
                className={`flex w-[72px] shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 py-1 transition-colors ${
                  isActive ? 'bg-[#e8f0fe]' : 'hover:bg-[#f1f3f4]'
                }`}
              >
                <span className="relative block h-16 w-16 overflow-hidden rounded-lg border border-[#dadce0]">
                  <StyleArt style={id} />
                </span>
                <span
                  className={`text-[11px] leading-none ${
                    isActive ? 'font-medium text-[#1f1f1f]' : 'text-[#5e5e5e]'
                  }`}
                >
                  {entry.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MapStyleSelector;
