/**
 * React wrappers for the call activity Web Components: To call back,
 * Call analytics and Device health.
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateHandlerWithSetter, useUpdateWithSetter } from './useUpdateWithSetter';
import type {
  CallActivityClasses,
  CallLogFilters,
  ComponentIcons,
  FormattingOptions,
  CallAnalyticsRangePreset,
  LayoutVariant,
  LoadError,
  LoaderStart,
  Locale,
} from '@dialstack/sdk-js';

/** Props every call activity component takes. */
export interface CallActivityComponentProps {
  className?: string;
  style?: React.CSSProperties;
  locale?: Locale;
  formatting?: FormattingOptions;
  icons?: ComponentIcons;
  layoutVariant?: LayoutVariant;
  classes?: CallActivityClasses;
  /**
   * How often to check for new activity, in milliseconds; `null` turns it off.
   * Checks read counts only; the lists are read again when those change, at
   * least hourly, or when `refreshKey` changes.
   * @default 60000
   */
  pollInterval?: number | null;
  /** Change it (a counter, say) to read everything again now. */
  refreshKey?: string | number;
  onLoaderStart?: (event: LoaderStart) => void;
  onLoadError?: (event: LoadError) => void;
}

interface CommonSetters extends HTMLElement {
  setLocale: (v: Locale) => void;
  setFormatting: (v: FormattingOptions) => void;
  setIcons: (v: ComponentIcons) => void;
  setLayoutVariant: (v: LayoutVariant) => void;
  setClasses: (v: CallActivityClasses) => void;
  setPollInterval: (v: number | null) => void;
  refresh: () => void;
  setOnLoaderStart: (v: ((e: LoaderStart) => void) | undefined) => void;
  setOnLoadError: (v: ((e: LoadError) => void) | undefined) => void;
}

function useCommonProps<T extends CommonSetters>(
  component: T | null,
  props: CallActivityComponentProps
): void {
  useUpdateWithSetter(component, props.locale, (c, v) => c.setLocale(v));
  useUpdateWithSetter(component, props.formatting, (c, v) => c.setFormatting(v));
  useUpdateWithSetter(component, props.icons, (c, v) => c.setIcons(v));
  useUpdateWithSetter(component, props.layoutVariant, (c, v) => c.setLayoutVariant(v));
  useUpdateWithSetter(component, props.classes, (c, v) => c.setClasses(v));
  useUpdateWithSetter(component, props.pollInterval, (c, v) => c.setPollInterval(v));
  // Skips the first value: the component reads everything when it starts.
  const firstKey = React.useRef(props.refreshKey);
  React.useEffect(() => {
    if (component && props.refreshKey !== firstKey.current) component.refresh();
  }, [component, props.refreshKey]);
  useUpdateHandlerWithSetter(component, props.onLoaderStart, (c, v) => c.setOnLoaderStart(v));
  useUpdateHandlerWithSetter(component, props.onLoadError, (c, v) => c.setOnLoadError(v));
}

export interface ToCallBackProps extends CallActivityComponentProps {
  /** Called when a caller's row is chosen, e.g. to open their calls. */
  onCallerSelect?: (event: { phoneNumber: string }) => void;
}

/** Callers from the last 7 days nobody has reached since. Within a DialstackComponentsProvider. */
export const ToCallBack: React.FC<ToCallBackProps> = (props) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'to-call-back');
  useCommonProps(componentInstance, props);
  useUpdateHandlerWithSetter(componentInstance, props.onCallerSelect, (c, v) =>
    c.setOnCallerSelect(v)
  );
  return <div ref={containerRef} className={props.className} style={props.style} />;
};

export interface CallAnalyticsProps extends CallActivityComponentProps {
  /** @default 'today' */
  range?: CallAnalyticsRangePreset;
  onRangeChange?: (preset: CallAnalyticsRangePreset) => void;
  /** Called with call-list filters when a count is chosen; without it counts are plain text. */
  onViewCalls?: (filters: CallLogFilters) => void;
  /** Called with the window when Call quality is chosen; without it there is no link. */
  onViewQuality?: (range: { from: string; to: string }) => void;
}

/** How calls went over a chosen window. Within a DialstackComponentsProvider. */
export const CallAnalytics: React.FC<CallAnalyticsProps> = (props) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'call-analytics');
  useCommonProps(componentInstance, props);
  useUpdateWithSetter(componentInstance, props.range, (c, v) => c.setRange(v));
  useUpdateHandlerWithSetter(componentInstance, props.onRangeChange, (c, v) =>
    c.setOnRangeChange(v)
  );
  useUpdateHandlerWithSetter(componentInstance, props.onViewCalls, (c, v) => c.setOnViewCalls(v));
  useUpdateHandlerWithSetter(componentInstance, props.onViewQuality, (c, v) =>
    c.setOnViewQuality(v)
  );
  return <div ref={containerRef} className={props.className} style={props.style} />;
};

export interface DeviceHealthProps extends CallActivityComponentProps {
  onDeviceSelect?: (event: { deviceId: string }) => void;
}

/** Desk phones and DECT bases that are not connected. Within a DialstackComponentsProvider. */
export const DeviceHealth: React.FC<DeviceHealthProps> = (props) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'device-health');
  useCommonProps(componentInstance, props);
  useUpdateHandlerWithSetter(componentInstance, props.onDeviceSelect, (c, v) =>
    c.setOnDeviceSelect(v)
  );
  return <div ref={containerRef} className={props.className} style={props.style} />;
};
