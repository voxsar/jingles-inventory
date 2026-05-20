import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

const BADGE_TONE_CLASSES: Record<string, string> = {
  success: 'chip-success',
  critical: 'chip-danger',
  warning: 'chip-warning',
  info: 'chip-info',
  accent: 'chip-accent',
};

const BANNER_TONE_CLASSES: Record<string, string> = {
  success: 'ui-banner--success',
  critical: 'ui-banner--critical',
  warning: 'ui-banner--warning',
  info: 'ui-banner--info',
};

interface UiBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: string | null;
}

export function UiBadge({ children, tone, className, ...props }: UiBadgeProps) {
  return (
    <span
      className={clsx('chip', tone ? BADGE_TONE_CLASSES[tone] : undefined, className)}
      {...props}
    >
      {children}
    </span>
  );
}

interface UiTextProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: 'default' | 'muted';
}

export function UiText({
  children,
  className,
  tone = 'muted',
  ...props
}: UiTextProps) {
  return (
    <span
      className={clsx(tone === 'muted' ? 'text-gray-500' : 'text-gray-900', className)}
      {...props}
    >
      {children}
    </span>
  );
}

interface UiBannerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: string | null;
}

export function UiBanner({ children, tone = 'info', className, ...props }: UiBannerProps) {
  const toneKey = tone ?? 'info';

  return (
    <div
      className={clsx('ui-banner', BANNER_TONE_CLASSES[toneKey] ?? BANNER_TONE_CLASSES.info, className)}
      role={toneKey === 'critical' ? 'alert' : 'status'}
      {...props}
    >
      {children}
    </div>
  );
}
