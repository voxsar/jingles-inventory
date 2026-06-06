import { useEffect, useRef, useState } from 'react';

export interface NameSuggestion {
	id: string;
	label: string;
	sublabel?: string;
	/** The original record, forwarded back to onSelect. */
	raw?: any;
}

interface NameSuggestInputProps {
	value: string;
	onChange: (value: string) => void;
	/** Called when the user picks an existing record from the suggestion list. */
	onSelect: (suggestion: NameSuggestion) => void;
	/** Fetches existing records that match the typed query. */
	fetchSuggestions: (query: string) => Promise<NameSuggestion[]>;
	/** When false, behaves as a plain input with no suggestions (e.g. while editing). */
	enabled?: boolean;
	placeholder?: string;
	required?: boolean;
	/** Minimum characters before a lookup runs. */
	minChars?: number;
	debounceMs?: number;
	/** Short caption shown above the suggestion list. */
	hint?: string;
	ariaLabel?: string;
}

export default function NameSuggestInput({
	value,
	onChange,
	onSelect,
	fetchSuggestions,
	enabled = true,
	placeholder,
	required,
	minChars = 2,
	debounceMs = 300,
	hint,
	ariaLabel,
}: NameSuggestInputProps) {
	const [suggestions, setSuggestions] = useState<NameSuggestion[]>([]);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const wrapRef = useRef<HTMLDivElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>();
	const requestRef = useRef(0);

	// Close the menu when clicking outside the component.
	useEffect(() => {
		const onDocMouseDown = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', onDocMouseDown);
		return () => document.removeEventListener('mousedown', onDocMouseDown);
	}, []);

	useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

	const runFetch = (query: string) => {
		const trimmed = query.trim();
		if (!enabled || trimmed.length < minChars) {
			setSuggestions([]);
			setOpen(false);
			setLoading(false);
			return;
		}
		const requestId = ++requestRef.current;
		setLoading(true);
		fetchSuggestions(trimmed)
			.then((results) => {
				if (requestId !== requestRef.current) return; // a newer request superseded this one
				setSuggestions(results);
				setActiveIndex(-1);
				setOpen(true);
				setLoading(false);
			})
			.catch(() => {
				if (requestId !== requestRef.current) return;
				setSuggestions([]);
				setLoading(false);
			});
	};

	const handleChange = (next: string) => {
		onChange(next);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (!enabled) return;
		debounceRef.current = setTimeout(() => runFetch(next), debounceMs);
	};

	const handleSelect = (suggestion: NameSuggestion) => {
		setOpen(false);
		setSuggestions([]);
		requestRef.current++; // discard any in-flight response
		if (debounceRef.current) clearTimeout(debounceRef.current);
		onSelect(suggestion);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (!open || suggestions.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === 'Enter') {
			if (activeIndex >= 0 && activeIndex < suggestions.length) {
				e.preventDefault();
				handleSelect(suggestions[activeIndex]);
			}
		} else if (e.key === 'Escape') {
			setOpen(false);
		}
	};

	const showMenu = enabled && open && (loading || suggestions.length > 0);

	return (
		<div className="suggest-wrap" ref={wrapRef}>
			<input
				className="input-field"
				type="text"
				value={value}
				required={required}
				placeholder={placeholder}
				aria-label={ariaLabel}
				autoComplete="off"
				role="combobox"
				aria-expanded={showMenu}
				aria-autocomplete="list"
				onChange={(e) => handleChange(e.target.value)}
				onKeyDown={handleKeyDown}
				onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
			/>
			{showMenu && (
				<ul className="suggest-menu" role="listbox">
					{hint && suggestions.length > 0 && <li className="suggest-hint" aria-hidden="true">{hint}</li>}
					{loading && suggestions.length === 0 ? (
						<li className="suggest-empty">Searching…</li>
					) : (
						suggestions.map((s, i) => (
							<li
								key={s.id}
								role="option"
								aria-selected={i === activeIndex}
								className={`suggest-item${i === activeIndex ? ' is-active' : ''}`}
								onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
								onMouseEnter={() => setActiveIndex(i)}
							>
								<span className="suggest-item-label">{s.label}</span>
								{s.sublabel && <span className="suggest-item-sub">{s.sublabel}</span>}
							</li>
						))
					)}
				</ul>
			)}
		</div>
	);
}
