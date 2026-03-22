import { useEffect, useRef, useState } from 'react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '— Select —',
  disabled = false,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
    setSearch('');
  };

  return (
    <div
      ref={containerRef}
      className={`relative min-w-[180px] ${className}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        className={[
          'w-full flex items-center justify-between gap-1',
          'px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400',
          open ? 'ring-2 ring-primary-500 border-transparent' : '',
        ].join(' ')}
      >
        <span className={`truncate ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {value ? selectedLabel : placeholder}
        </span>
        <span className="text-gray-400 flex-shrink-0 text-[10px]">▼</span>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ul className="overflow-y-auto max-h-[220px]">
            <li>
              <button
                type="button"
                className={[
                  'w-full text-left px-3 py-2 text-sm hover:bg-primary-50',
                  !value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-500',
                ].join(' ')}
                onClick={() => handleSelect('')}
              >
                {placeholder}
              </button>
            </li>
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400 italic">No results</li>
            )}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  className={[
                    'w-full text-left px-3 py-2 text-sm hover:bg-primary-50',
                    value === o.value ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-800',
                  ].join(' ')}
                  onClick={() => handleSelect(o.value)}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
