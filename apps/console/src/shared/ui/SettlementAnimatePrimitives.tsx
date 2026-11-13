import type { ReactNode } from 'react';
import { Progress } from '@animate-ui/react/primitives/base-ui/progress';
import { Collapsible } from '@animate-ui/react/primitives/base-ui/collapsible';
import { Button, type ButtonProps } from '@animate-ui/react/primitives/buttons/button';
import { ShimmeringText } from '@animate-ui/react/primitives/texts/shimmering';
import { Loader2 } from 'lucide-react';

export interface SettlementProgressBarProps {
  value: number;
  max?: number;
  ariaLabel: string;
  indicatorClassName?: string;
  trackClassName?: string;
  className?: string;
}

export function SettlementProgressBar({
  value,
  max = 100,
  ariaLabel,
  indicatorClassName = 'bg-emerald-500',
  trackClassName = 'bg-slate-100 dark:bg-slate-800',
  className = 'w-full',
}: SettlementProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));

  return (
    <Progress.Root value={clampedValue} max={max} aria-label={ariaLabel} className={className}>
      <Progress.Track
        className={`h-2.5 w-full overflow-hidden rounded-full transition-colors ${trackClassName}`}
      >
        <Progress.Indicator
          className={`block h-full rounded-full transition-colors ${indicatorClassName}`}
        />
      </Progress.Track>
    </Progress.Root>
  );
}

export interface SettlementShimmerButtonProps
  extends Omit<Extract<ButtonProps, { asChild?: false }>, 'children'> {
  isLoading?: boolean;
  loadingText?: string;
  shimmerColor?: string;
  children: ReactNode;
}

export function SettlementShimmerButton({
  isLoading = false,
  loadingText,
  shimmerColor = '#ffffff',
  disabled,
  className = '',
  hoverScale = 1.015,
  tapScale = 0.985,
  children,
  ...rest
}: SettlementShimmerButtonProps) {
  return (
    <Button
      disabled={Boolean(disabled || isLoading)}
      hoverScale={disabled || isLoading ? 1 : hoverScale}
      tapScale={disabled || isLoading ? 1 : tapScale}
      className={className}
      {...rest}
    >
      {isLoading ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <ShimmeringText
            text={loadingText || (typeof children === 'string' ? children : 'Đang xử lý...')}
            shimmeringColor={shimmerColor}
            color="currentColor"
            duration={1.1}
          />
        </span>
      ) : (
        children
      )}
    </Button>
  );
}

export interface SettlementExpandableProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function SettlementExpandable({
  open,
  onOpenChange,
  children,
  className = '',
}: SettlementExpandableProps) {
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      className={className}
    >
      <Collapsible.Panel className="overflow-hidden">{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}
