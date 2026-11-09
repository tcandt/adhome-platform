import { Combobox } from "@animate-ui/react/primitives/base-ui/combobox";
import { Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { HOUSEHOLD_RELATIONSHIPS } from "../data/householdRelationships";

interface RelationshipComboboxProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN")
    .trim();
}

export function RelationshipCombobox({ value, onChange, required }: RelationshipComboboxProps) {
  const [open, setOpen] = useState(false);
  const filteredRelationships = useMemo(() => {
    const query = normalizeSearch(value);
    if (!query) return [...HOUSEHOLD_RELATIONSHIPS].slice(0, 8);
    return HOUSEHOLD_RELATIONSHIPS
      .filter(relationship => normalizeSearch(relationship).includes(query))
      .sort((left, right) => {
        const leftStarts = normalizeSearch(left).startsWith(query);
        const rightStarts = normalizeSearch(right).startsWith(query);
        return Number(rightStarts) - Number(leftStarts);
      })
      .slice(0, 8);
  }, [value]);
  const selectedValue = HOUSEHOLD_RELATIONSHIPS.includes(value as (typeof HOUSEHOLD_RELATIONSHIPS)[number])
    ? value
    : null;

  return (
    <Combobox.Root<string>
      items={HOUSEHOLD_RELATIONSHIPS}
      filteredItems={filteredRelationships}
      open={open}
      onOpenChange={setOpen}
      value={selectedValue}
      inputValue={value}
      onInputValueChange={nextValue => { onChange(nextValue); setOpen(true); }}
      onValueChange={nextValue => { if (nextValue) onChange(nextValue); setOpen(false); }}
      autoHighlight
    >
      <div className="relative">
        <Combobox.Input
          required={required}
          onFocus={() => setOpen(true)}
          aria-label="Mối quan hệ"
          placeholder="Chọn hoặc nhập mối quan hệ..."
          className="rounded-lg border border-slate-200 bg-white p-2 pr-8 text-xs font-normal dark:border-slate-700 dark:bg-slate-800"
        />
        <Combobox.Trigger aria-label="Mở danh sách mối quan hệ" className="absolute inset-y-0 right-0 flex w-8 items-center justify-center !p-0 text-slate-400">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="z-[250] w-[var(--anchor-width)]">
          <Combobox.Popup className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <Combobox.List className="overflow-y-auto p-1" style={{ maxHeight: "min(15rem, var(--available-height))" }}>
              {filteredRelationships.map(relationship => (
                <Combobox.Item key={relationship} value={relationship} className="flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[13px] text-slate-700 outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700 dark:text-slate-200 dark:data-[highlighted]:bg-blue-950/60 dark:data-[highlighted]:text-blue-200">
                  <span>{relationship}</span>
                  <Combobox.ItemIndicator><Check className="h-3.5 w-3.5" aria-hidden="true" /></Combobox.ItemIndicator>
                </Combobox.Item>
              ))}
              <Combobox.Empty className="px-2.5 py-3 text-[12px] text-slate-500">Không có gợi ý phù hợp — vẫn có thể dùng nội dung đã nhập.</Combobox.Empty>
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
