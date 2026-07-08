"use client";

import type { ReactNode } from "react";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Select } from "@/components/ui/select";

export type SmartSelectOption = SearchableSelectOption & {
  disabled?: boolean;
};

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SmartSelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  helperText?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
  inputClassName?: string;
  showThumbnails?: boolean;
  threshold?: number;
};

export function SmartSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  emptyMessage = "Nenhum resultado",
  helperText,
  disabled,
  loading,
  error,
  className = "",
  inputClassName = "",
  showThumbnails = true,
  threshold = 10,
}: Props) {
  const usarBusca = options.length >= threshold;

  if (!usarBusca) {
    return (
      <div className={className}>
        <Select
          id={id}
          label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || loading}
          error={error}
          className={inputClassName}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </Select>
        {!error && helperText ? (
          <p className="mt-1 text-xs" style={{ color: "var(--ac-muted)" }}>
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--ac-text)" }}>
          {label}
        </label>
      ) : null}
      <SearchableSelect
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder ?? "Pesquisar..."}
        emptyMessage={emptyMessage}
        disabled={disabled}
        loading={loading}
        inputClassName={inputClassName}
        showThumbnails={showThumbnails}
      />
      {error ? (
        <p className="text-xs" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : helperText ? (
        <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
