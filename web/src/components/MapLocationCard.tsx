import React from 'react';
import { Bookmark, BookmarkCheck, Navigation, Tag } from 'lucide-react';

export type MapLocationCardTone = 'positive' | 'negative' | 'neutral';

export interface MapLocationCardStatus {
  label: string;
  tone: MapLocationCardTone;
}

export interface MapLocationCardProps {
  title: string;
  /** Category or type line under the title. */
  category: string;
  /** Overrides the default tag glyph on the category line. */
  categoryIcon?: React.ReactNode;
  /** The one value that matters most: a rating, a count, a confidence. */
  rating?: string | null;
  /** Smaller grey value shown after the rating. */
  secondary?: string | null;
  description?: string | null;
  status?: MapLocationCardStatus | null;
  /**
   * A real image when one is available. When absent, the card draws a
   * category-tinted band with the pin glyph rather than a placeholder photo,
   * so nothing on the card is invented.
   */
  imageUrl?: string | null;
  /** Colour of the header band, the pin glyph, and the category accent. */
  accentColor?: string;
  latitude?: number | null;
  longitude?: number | null;
  saved?: boolean;
  onToggleSave?: () => void;
  /** Starts navigation from the user's own location to this place, inside the
   *  platform's map - nothing here ever opens an outside map. */
  onNavigate?: () => void;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const TONE_TEXT: Record<MapLocationCardTone, string> = {
  positive: 'text-[#137333]',
  negative: 'text-[#c5221f]',
  neutral: 'text-[#5f6368]',
};

const TONE_DOT: Record<MapLocationCardTone, string> = {
  positive: 'bg-[#137333]',
  negative: 'bg-[#c5221f]',
  neutral: 'bg-[#9aa0a6]',
};

/** 
 * The small floating location preview that appears over the map above the pin
 * under the cursor, in the spirit of a desktop map application: a wide image
 * band on top, a compact information block underneath, and the two round map
 * actions beside the title (navigate and save). Navigation stays on the
 * platform's own map - the platform never hands the trip to an outside map.
 *
 * Every field is supplied by the caller from a real map feature. A value the
 * data does not carry is simply not rendered, so the card never shows a rating
 * or a description that does not exist.
 */
export const MapLocationCard: React.FC<MapLocationCardProps> = ({
  title,
  category,
  categoryIcon,
  rating,
  secondary,
  description,
  status,
  imageUrl,
  accentColor = '#0b57d0',
  saved = false,
  onToggleSave,
  onNavigate,
  onClick,
  className = '',
  style,
}) => {
  return (
    <div
      onClick={onClick}
      className={`overflow-hidden rounded-xl border border-black/5 bg-white text-[#1f1f1f] shadow-[0_1px_2px_rgba(60,64,67,0.30),0_2px_6px_2px_rgba(60,64,67,0.15)] ${
        className.includes('w-') ? '' : 'w-[240px]'
      } ${onClick ? 'cursor-pointer hover:shadow-lg hover:border-[#0b57d0]/30 transition-all' : ''} ${className}`}
      style={style}
    >
      {/* Wide landscape header, corners rounded by the card's own overflow. */}
      <div
        className="relative h-[112px] w-full"
        style={{ background: imageUrl ? '#f0f4f9' : `${accentColor}1f` }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg width="40" height="50" viewBox="0 0 42 52" aria-hidden="true">
              <path
                d="M21 2C10.5 2 2 10.1 2 20.6 2 35.9 21 49.6 21 49.6S40 35.9 40 20.6C40 10.1 31.5 2 21 2z"
                fill={accentColor}
                stroke="#ffffff"
                strokeWidth="3"
              />
              <circle cx="21" cy="20" r="6.5" fill="rgba(255,255,255,0.92)" />
            </svg>
          </div>
        )}
      </div>

      {/* Compact information block. */}
      <div className="p-3.5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-tight text-[#202124]">
            {title}
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            {onNavigate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate();
                }}
                title="Navigate to this place on our map"
                aria-label="Navigate to this place on our map"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f0fe] text-[#0b57d0] transition-colors hover:bg-[#d3e3fd]"
              >
                <Navigation className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            {onToggleSave && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave();
                }}
                title={saved ? 'Remove from saved' : 'Save this location'}
                aria-label={saved ? 'Remove from saved' : 'Save this location'}
                aria-pressed={saved}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  saved
                    ? 'bg-[#e8f0fe] text-[#0b57d0]'
                    : 'bg-[#f0f4f9] text-[#3c4043] hover:bg-[#e8f0fe] hover:text-[#0b57d0]'
                }`}
              >
                {saved ? (
                  <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Bookmark className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#5f6368]">
          {categoryIcon ?? <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate">{category}</span>
        </div>

        {(rating || secondary) && (
          <div className="mt-1 flex items-baseline gap-1.5">
            {rating && <span className="text-[12px] font-medium text-[#3c4043]">{rating}</span>}
            {secondary && <span className="text-[11px] text-[#80868b]">{secondary}</span>}
          </div>
        )}

        {description && (
          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-[#5f6368]">
            {description}
          </p>
        )}

        {status && (
          <div
            className={`mt-2 flex items-center gap-1.5 text-[11.5px] font-medium ${TONE_TEXT[status.tone]}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[status.tone]}`} />
            <span className="truncate">{status.label}</span>
          </div>
        )}
      </div>
    </div>
  );
};
