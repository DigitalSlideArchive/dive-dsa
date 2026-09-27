export const TIMELINE_TOOLTIP_Z_INDEX = 2147483646;
export const TIMELINE_TOOLTIP_GAP_PX = 10;

export interface TimelineTooltipPosition {
  x: number;
  y: number;
}

export function createTimelineTooltipPosition(event: MouseEvent): TimelineTooltipPosition {
  return {
    x: event.clientX,
    y: event.clientY,
  };
}

export function timelineTooltipStyle(position: TimelineTooltipPosition): Record<string, string | number> {
  return {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: `translate(-50%, calc(-100% - ${TIMELINE_TOOLTIP_GAP_PX}px))`,
    zIndex: TIMELINE_TOOLTIP_Z_INDEX,
    pointerEvents: 'none',
  };
}

export const TIMELINE_TOOLTIP_BASE_CLASS = 'timeline-chart-tooltip';
