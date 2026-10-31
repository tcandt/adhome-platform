import React from 'react';
import { AlertCircle, RefreshCw, Inbox } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  render?: (row: T, index: number) => React.ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  keyExtractor: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  className?: string;
}

/**
 * Standard Data Table Component (UI-02)
 * Ensures uniform row height, whitespace-nowrap for codes/dates/status, right-aligned tabular-nums for money.
 */
export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  error = null,
  onRetry,
  emptyMessage = 'Không có dữ liệu trong danh sách',
  keyExtractor,
  onRowClick,
  className = '',
}: DataTableProps<T>) {
  if (error) {
    return (
      <div className="p-8 text-center rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/20 space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <div className="text-sm font-semibold text-rose-700 dark:text-rose-400">{error}</div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Thử lại
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 ${className}`}>
      <table className="w-full text-left border-collapse text-xs">
        <thead className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 select-none">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={`py-3 px-3.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                } ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                <span className="text-xs font-medium">Đang tải dữ liệu...</span>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-slate-400 space-y-1.5">
                <Inbox className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600" />
                <div className="text-xs font-medium">{emptyMessage}</div>
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={keyExtractor(row, idx)}
                onClick={() => onRowClick && onRowClick(row)}
                className={`h-11 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((col) => {
                  const cellContent = col.render ? col.render(row, idx) : (row as any)[col.key];
                  return (
                    <td
                      key={col.key}
                      className={`px-3.5 py-2.5 text-slate-800 dark:text-slate-200 ${
                        col.align === 'right'
                          ? 'text-right tabular-nums'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

