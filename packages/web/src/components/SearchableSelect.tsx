import Select, { Props as SelectProps, StylesConfig } from 'react-select';

export interface SelectOption {
  value: string;
  label: string;
  isDisabled?: boolean;
  isSeparator?: boolean;
}

interface CommonProps extends Omit<SelectProps<SelectOption, boolean>, 'options' | 'onChange' | 'value' | 'isMulti'> {
  options: SelectOption[];
  className?: string;
  placeholder?: string;
  isClearable?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
}

interface SingleSelectProps extends CommonProps {
  isMulti?: false;
  value: string;
  onChange: (value: string) => void;
}

interface MultiSelectProps extends CommonProps {
  isMulti: true;
  value: string[];
  onChange: (value: string[]) => void;
}

type SearchableSelectProps = SingleSelectProps | MultiSelectProps;

export default function SearchableSelect(props: SearchableSelectProps) {
  const {
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
  } = props;
  const selectedOption = isMulti
    ? options.filter(opt => (value as string[]).includes(opt.value))
    : options.find(opt => opt.value === value) || null;

  const customStyles: StylesConfig<SelectOption, boolean> = {
    control: (base, state) => ({
      ...base,
      minHeight: '42px',
      borderColor: state.isFocused ? 'rgba(var(--accent-glow), 0.5)' : 'var(--line-2)',
      boxShadow: state.isFocused ? '0 0 0 4px rgba(var(--accent-glow), 0.12)' : 'none',
      '&:hover': {
        borderColor: state.isFocused ? 'rgba(var(--accent-glow), 0.5)' : 'var(--line-strong)',
      },
      borderRadius: '12px',
      fontSize: '0.875rem',
      cursor: 'pointer',
      backgroundColor: 'var(--bg-2)',
    }),
    menu: (base) => ({
      ...base,
      borderRadius: '16px',
      boxShadow: 'var(--shadow-lg)',
      border: '1px solid var(--line)',
      fontSize: '0.875rem',
      zIndex: 100,
      overflow: 'hidden',
      backgroundColor: 'var(--glass-strong)',
      backdropFilter: 'blur(calc(var(--glass-blur) * 1.2)) saturate(var(--glass-saturate))',
    }),
    menuList: (base) => ({
      ...base,
      padding: '8px',
      maxHeight: '300px',
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? 'rgba(var(--accent-glow), 0.22)'
        : state.isFocused
        ? 'var(--row-hover)'
        : 'transparent',
      color: 'var(--ink)',
      cursor: 'pointer',
      padding: '8px 12px',
      borderRadius: '10px',
      fontSize: '0.875rem',
      whiteSpace: 'pre',
      '&:active': {
        backgroundColor: state.isSelected ? 'rgba(var(--accent-glow), 0.3)' : 'var(--row-hover)',
      },
    }),
    placeholder: (base) => ({
      ...base,
      color: 'var(--ink-4)',
      fontSize: '0.875rem',
    }),
    singleValue: (base) => ({
      ...base,
      color: 'var(--ink)',
      fontSize: '0.875rem',
      whiteSpace: 'pre',
    }),
    input: (base) => ({
      ...base,
      color: 'var(--ink)',
      fontSize: '0.875rem',
    }),
    dropdownIndicator: (base) => ({
      ...base,
      color: 'var(--ink-3)',
      padding: '6px',
      '&:hover': {
        color: 'var(--ink)',
      },
    }),
    clearIndicator: (base) => ({
      ...base,
      color: 'var(--ink-3)',
      padding: '6px',
      '&:hover': {
        color: 'var(--ink)',
      },
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: 'var(--line)',
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
      isOptionDisabled={(option) => Boolean(option.isDisabled)}
      formatOptionLabel={(option) => option.isSeparator ? (
        <div aria-hidden="true" style={{ borderTop: '1px solid var(--line-strong)', height: 0, margin: '4px 0' }} />
      ) : option.label}
      isMulti={isMulti}
      {...rest}
    />
  );
}
