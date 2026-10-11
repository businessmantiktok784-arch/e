import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value?: string;
  onSearch: (query: string) => void;
  placeholder?: string;
  /**
   * Control rendered inside the field at its right edge, behind a divider. The
   * map uses this for the filter button, so filtering is reachable from the
   * search box itself without adding anything beside it.
   */
  trailing?: React.ReactNode;
}

/** Google-style rounded search field: pill outline, elevation, focus ring. */
export const SearchBar: React.FC<SearchBarProps> = ({
  value = '',
  onSearch,
  placeholder = 'Search by Passport ID, rock name, or district...',
  trailing,
}) => {
  const [localQuery, setLocalQuery] = useState(value);

  useEffect(() => {
    setLocalQuery(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setLocalQuery(text);
    onSearch(text);
  };

  const handleClear = () => {
    setLocalQuery('');
    onSearch('');
  };

  return (
    <div className="g-search">
      <Search className="w-[18px] h-[18px] text-[#5e5e5e] shrink-0" aria-hidden="true" />
      <input
        type="text"
        value={localQuery}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label="Search observations"
      />
      {localQuery && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="g-icon-btn w-7 h-7 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {trailing && (
        <span className="shrink-0 pl-2 ml-0.5 border-l border-[#dadce0] flex items-center">
          {trailing}
        </span>
      )}
    </div>
  );
};