import { Building2 } from "lucide-react";
import { BuildingScopeSelector } from "./BuildingScopeSelector";

export function EmptyBuildingScope({
  showSelector = false,
}: {
  showSelector?: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="console-empty-building-scope">
      {showSelector && (
        <div className="flex justify-end">
          <BuildingScopeSelector />
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
        <Building2 className="mx-auto mb-3 h-7 w-7 text-slate-400" />
        <h2 className="text-sm font-semibold">Chưa chọn tòa nhà</h2>
        <p className="mt-2 text-xs text-slate-500">
          Mở danh sách tòa nhà để chọn phạm vi cần xem.
        </p>
      </div>
    </div>
  );
}
