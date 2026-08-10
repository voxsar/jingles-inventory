import SearchableSelect from './SearchableSelect';

export interface SelectOption {
  value: string;
  label: string;
}

interface MultiSearchableSelectProps {
  options: SelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  className?: string;
  placeholder?: string;
  isClearable?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
}

export default function MultiSearchableSelect({
  options,
  value,
  onChange,
  className = '',
  placeholder = 'Select...',
  isClearable = true,
  isDisabled = false,
  isLoading = false,
}: MultiSearchableSelectProps) {
  return (
    <SearchableSelect
      isMulti
      options={options}
      value={value}
      onChange={onChange}
      className={className}
      placeholder={placeholder}
      isClearable={isClearable}
      isDisabled={isDisabled}
      isLoading={isLoading}
      isSearchable={true}
    />
  );
}
