import React from 'react';

export interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> {
  value?: number | string | null;
  defaultValue?: number | string | null;
  decimals?: number;
  allowNegative?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (value: number | undefined, raw: string) => void;
}

/**
 * Composant de saisie monétaire et décimale universel (type="text" + inputMode="decimal").
 * Accepte indifféremment le point (.) du pavé numérique et la virgule (,),
 * normalise automatiquement en point décimal sans écraser les états intermédiaires de frappe (ex: "12.").
 */
export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(({
  value,
  defaultValue,
  decimals = 2,
  allowNegative = false,
  className = 'form-control',
  onChange,
  onValueChange,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}, ref) => {
  const formatVal = (v: number | string | null | undefined): string => {
    if (v === undefined || v === null || v === '') return '';
    return String(v);
  };

  const [localValue, setLocalValue] = React.useState<string>(() => formatVal(value ?? defaultValue));
  const [isFocused, setIsFocused] = React.useState(false);

  // Synchronisation avec la valeur externe reçue lorsqu'on n'est pas en cours de saisie active
  React.useEffect(() => {
    if (!isFocused && value !== undefined) {
      const numVal = Number(value);
      const numLocal = (localValue !== '' && localValue !== '-') ? Number(localValue) : NaN;
      if (isNaN(numVal) || isNaN(numLocal) || numVal !== numLocal) {
        setLocalValue(formatVal(value));
      }
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    // Remplacement instantané de la virgule par un point
    raw = raw.replace(',', '.');

    // Validation par expression régulière selon le nombre de décimales autorisé
    const regex = allowNegative
      ? new RegExp(`^-?\\d*\\.?\\d{0,${decimals}}$`)
      : new RegExp(`^\\d*\\.?\\d{0,${decimals}}$`);

    const isLoneMinus = allowNegative && raw === '-';
    const isLoneDot = raw === '.';

    if (raw === '' || isLoneMinus || isLoneDot || regex.test(raw)) {
      const normalizedRaw = isLoneDot ? '0.' : raw;
      setLocalValue(normalizedRaw);

      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          value: normalizedRaw,
          name: props.name || e.target.name
        }
      } as React.ChangeEvent<HTMLInputElement>;

      if (onChange) {
        onChange(syntheticEvent);
      }

      if (onValueChange) {
        const num = (normalizedRaw === '' || normalizedRaw === '-') ? undefined : Number(normalizedRaw);
        onValueChange(num === undefined || isNaN(num) ? undefined : num, normalizedRaw);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    let cleaned = localValue;
    if (cleaned.endsWith('.')) {
      cleaned = cleaned.slice(0, -1);
    }
    if (cleaned === '-' || cleaned === '') {
      cleaned = '';
    }
    if (cleaned !== localValue) {
      setLocalValue(cleaned);
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          value: cleaned,
          name: props.name || e.target.name
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      if (onChange) onChange(syntheticEvent);
      if (onValueChange) {
        const num = cleaned === '' ? undefined : Number(cleaned);
        onValueChange(num === undefined || isNaN(num) ? undefined : num, cleaned);
      }
    }
    if (onBlur) onBlur(e);
  };

  return (
    <input
      role="spinbutton"
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      className={className}
      value={
        isFocused 
          ? localValue 
          : (value !== undefined 
              ? ((localValue !== '' && localValue !== '-' && Number(localValue) === Number(value)) ? localValue : formatVal(value))
              : localValue)
      }
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
});

AmountInput.displayName = 'AmountInput';
