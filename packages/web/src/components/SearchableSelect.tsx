import Select, { Props as SelectProps, StylesConfig } from 'react-select';

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectPropsBase extends Omit<SelectProps<SelectOption, boolean>, 'options' | 'onChange' | 'value' | 'isMulti'> {
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  isClearable?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
}

interface SearchableSelectSingleProps extends SearchableSelectPropsBase {
  isMulti?: false;
  value: string;
  onChange: (value: string) => void;
}

interface SearchableSelectMultiProps extends SearchableSelectPropsBase {
  isMulti: true;
  value: string[];
  onChange: (value: string[]) => void;
}

type SearchableSelectProps = SearchableSelectSingleProps | SearchableSelectMultiProps;

export default function SearchableSelect({
  options,
  value,
  onChange,
  className = '',
  placeholder = 'Select...',
  isClearable = true,
  isDisabled = false,
  isLoading = false,
  isMulti = false,
  ...rest
}: SearchableSelectProps) {
  const selectedOption = isMulti
    ? options.filter(opt => (value as string[]).includes(opt.value))
    : options.find(opt => opt.value === value) || null;

  const customStyles: StylesConfig<SelectOption, boolean> = {
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
    singleValue: (base) => ({
      ...base,
      color: '#111827',
      fontSize: '0.875rem',
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
    <Select<SelectOption, boolean>
      options={options}
      value={selectedOption}
      onChange={(option) => {
        if (isMulti) {
          const values = Array.isArray(option) ? option.map(o => o.value) : [];
          (onChange as (value: string[]) => void)(values);
        } else {
          (onChange as (value: string) => void)((option as SelectOption)?.value || '');
        }
      }}
      styles={customStyles}
      className={className}
      placeholder={placeholder}
      isClearable={isClearable}
      isDisabled={isDisabled}
      isLoading={isLoading}
      isSearchable={true}
      isMulti={isMulti}
      {...rest}
    />
  );
}
