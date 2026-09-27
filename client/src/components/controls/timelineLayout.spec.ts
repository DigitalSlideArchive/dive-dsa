import { TimelineDisplay } from 'vue-media-annotator/ConfigurationManager';
import {
  getSectionContentHeight,
  getSectionRowHeight,
  TIMELINE_SECTION_HEADER_HEIGHT,
} from './timelineLayout';

function makeTimeline(overrides: Partial<TimelineDisplay> = {}): TimelineDisplay {
  return {
    maxHeight: 100,
    order: 0,
    name: 'Test',
    dismissable: false,
    type: 'filter',
    ...overrides,
  };
}

describe('timelineLayout section heights', () => {
  const timelineList = [makeTimeline()];

  it('reserves header space in content height when section title is shown', () => {
    const contentHeight = getSectionContentHeight(
      timelineList[0],
      timelineList,
      200,
      false,
    );
    expect(contentHeight).toBe(100 - TIMELINE_SECTION_HEADER_HEIGHT);
  });

  it('uses full max height for content when section title is hidden', () => {
    const contentHeight = getSectionContentHeight(
      timelineList[0],
      timelineList,
      200,
      true,
    );
    expect(contentHeight).toBe(100);
  });

  it('includes section header in row height when title is shown', () => {
    const rowHeight = getSectionRowHeight(
      timelineList[0],
      timelineList,
      200,
      false,
    );
    expect(rowHeight).toBe(100);
  });

  it('matches content height when section title is hidden', () => {
    const rowHeight = getSectionRowHeight(
      timelineList[0],
      timelineList,
      200,
      true,
    );
    expect(rowHeight).toBe(100);
  });
});
