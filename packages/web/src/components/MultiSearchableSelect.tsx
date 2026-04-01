import Select, { StylesConfig } from 'react-select';

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
  const selectedOptions = options.filter(opt => value.includes(opt.value));

  const customStyles: StylesConfig<SelectOption, true> = {
    control: (base, state) => ({
      ...base,
      minHeight: '38px',
      borderColor: state.isFocused ? '#6366f1' : '#d1d5db',
      boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.5)' : 'none',
      '&:hover': {
        borderColor: state.isFocused ? '#6366f1' : '#9ca3af',
      },
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
      cursor: 'pointer',
      backgroundColor: 'white',
    }),
    menu: (base) => ({
      ...base,
      borderRadius: '0.5rem',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      border: '1px solid #e5e7eb',
      fontSize: '0.875rem',
      zIndex: 100,
    }),
    menuList: (base) => ({
      ...base,
      padding: '4px',
      maxHeight: '300px',
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? '#6366f1'
        : state.isFocused
        ? '#f3f4f6'
        : 'white',
      color: state.isSelected ? 'white' : '#111827',
      cursor: 'pointer',
      padding: '8px 12px',
      borderRadius: '0.375rem',
      fontSize: '0.875rem',
      '&:active': {
        backgroundColor: state.isSelected ? '#6366f1' : '#e5e7eb',
      },
    }),
    placeholder: (base) => ({
      ...base,
      color: '#9ca3af',
      fontSize: '0.875rem',
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: '#eef2ff',
      borderRadius: '0.375rem',
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: '#4338ca',
      fontSize: '0.8rem',
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: '#6366f1',
      '&:hover': {
        backgroundColor: '#c7d2fe',
        color: '#4338ca',
      },
    }),
    input: (base) => ({
      ...base,
      color: '#111827',
      fontSize: '0.875rem',
    }),
    dropdownIndicator: (base) => ({
      ...base,
      color: '#6b7280',
      padding: '6px',
      '&:hover': {
        color: '#374151',
      },
    }),
    clearIndicator: (base) => ({
      ...base,
      color: '#6b7280',
      padding: '6px',
      '&:hover': {
        color: '#374151',
      },
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: '#d1d5db',
    }),
  };

  return (
    <Select<SelectOption, true>
      isMulti
      options={options}
      value={selectedOptions}
      onChange={(selected) => onChange(selected ? selected.map(s => s.value) : [])}
      styles={customStyles}
      className={className}
      placeholder={placeholder}
      isClearable={isClearable}
      isDisabled={isDisabled}
      isLoading={isLoading}
      isSearchable={true}
    />
  );
}
