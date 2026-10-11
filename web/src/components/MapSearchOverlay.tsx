import React from 'react';
import { SearchBar } from './SearchBar.js';

interface MapSearchOverlayProps {
  value: string;
  onSearch: (value: string) => void;
  /** Rendered inside the field at its right edge, behind a divider. */
  trailing?: React.ReactNode;
}

/**
 * The search field that sits on top of the map canvas, as it does in Google
 * Maps. This is the only search box in the app: the sidebar column carries no
 * field of its own. It is also the only thing floating over the canvas, so no
 * caption, count line or status strip can collide with it.
 */
export const MapSearchOverlay: React.FC<MapSearchOverlayProps> = ({ value, onSearch, trailing }) => (
  <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none">
    <div className="pointer-events-auto max-w-[460px]">
      <SearchBar
        value={value}
        onSearch={onSearch}
        placeholder="Search rocks, passports, districts"
        trailing={trailing}
      />
    </div>
  </div>
);