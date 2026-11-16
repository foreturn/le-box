import { platform, safeArea, windowSize } from "nsh";

export const MOBILE_BREAKPOINT = 768;
export const NARROW_PHONE_BREAKPOINT = 460;

export const isDesktopEnvironment = platform.desktop;

export function viewportWidth(): number {
  try {
    return windowSize().width;
  } catch {
    return 1024;
  }
}

export function isCompactLayout(): boolean {
  return viewportWidth() < MOBILE_BREAKPOINT;
}

export function isNarrowPhone(): boolean {
  return viewportWidth() < NARROW_PHONE_BREAKPOINT;
}

export function getSafeInsets(): { top: number; right: number; bottom: number; left: number } {
  try {
    return safeArea();
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

export function rowStackClass(gap = "gap-3"): string {
  return isCompactLayout() ? gap : `flex-row ${gap}`;
}

export function splitRowClass(gap = "gap-4"): string {
  return isCompactLayout() ? gap : `flex-row flex-wrap ${gap}`;
}
