/**
 * Unit tests for behavioral signal extraction
 */

import { describe, it, expect } from 'vitest';
import {
  extractBehavioralSignal,
  extractFeatureName,
  processBatchEvents,
  MixpanelEvent,
} from '../signal-extractor.js';

describe('extractBehavioralSignal', () => {
  it('should extract usage event from feature usage event', () => {
    const event: MixpanelEvent = {
      event: 'Feature Used',
      properties: {
        distinct_id: 'user_123',
        time: 1704067200,
        $insert_id: 'evt_001',
        feature: 'Dashboard',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventId).toBe('evt_001');
    expect(result?.userId).toBe('user_123');
    expect(result?.feature).toBe('Dashboard');
    expect(result?.eventName).toBe('Feature Used');
    expect(result?.timestamp).toBe(1704067200);
    expect(result?.expiresAt).toBe(1704067200 + (90 * 24 * 60 * 60));
    expect(result?.properties).toMatchObject({
      distinct_id: 'user_123',
      feature: 'Dashboard',
    });
  });

  it('should extract feature name from event name when not in properties', () => {
    const event: MixpanelEvent = {
      event: 'Button Clicked',
      properties: {
        distinct_id: 'user_456',
        time: 1704067200,
        $insert_id: 'evt_002',
        button_name: 'Export',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).not.toBeNull();
    expect(result?.feature).toBe('button_clicked');
    expect(result?.eventName).toBe('Button Clicked');
  });

  it('should use feature_name property if available', () => {
    const event: MixpanelEvent = {
      event: 'Page Viewed',
      properties: {
        distinct_id: 'user_789',
        time: 1704067200,
        $insert_id: 'evt_003',
        feature_name: 'Analytics',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).not.toBeNull();
    expect(result?.feature).toBe('Analytics');
  });

  it('should return null for Session Start system event', () => {
    const event: MixpanelEvent = {
      event: 'Session Start',
      properties: {
        distinct_id: 'user_123',
        time: 1704067200,
        $insert_id: 'evt_004',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).toBeNull();
  });

  it('should return null for App Opened system event', () => {
    const event: MixpanelEvent = {
      event: 'App Opened',
      properties: {
        distinct_id: 'user_123',
        time: 1704067200,
        $insert_id: 'evt_005',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).toBeNull();
  });

  it('should return null for event with missing user ID', () => {
    const event: MixpanelEvent = {
      event: 'Feature Used',
      properties: {
        time: 1704067200,
        $insert_id: 'evt_006',
        feature: 'Dashboard',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).toBeNull();
  });

  it('should generate event ID when $insert_id is missing', () => {
    const event: MixpanelEvent = {
      event: 'Feature Used',
      properties: {
        distinct_id: 'user_123',
        time: 1704067200,
        feature: 'Dashboard',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).not.toBeNull();
    expect(result?.eventId).toBe('user_123_Feature Used_1704067200');
  });

  it('should use current timestamp when time property is missing', () => {
    const beforeTime = Math.floor(Date.now() / 1000);
    
    const event: MixpanelEvent = {
      event: 'Feature Used',
      properties: {
        distinct_id: 'user_123',
        $insert_id: 'evt_007',
        feature: 'Dashboard',
      },
    };

    const result = extractBehavioralSignal(event);
    const afterTime = Math.floor(Date.now() / 1000);

    expect(result).not.toBeNull();
    expect(result?.timestamp).toBeGreaterThanOrEqual(beforeTime);
    expect(result?.timestamp).toBeLessThanOrEqual(afterTime);
  });

  it('should filter out $identify system event', () => {
    const event: MixpanelEvent = {
      event: '$identify',
      properties: {
        distinct_id: 'user_123',
        time: 1704067200,
        $insert_id: 'evt_008',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).toBeNull();
  });

  it('should filter out Session End system event', () => {
    const event: MixpanelEvent = {
      event: 'Session End',
      properties: {
        distinct_id: 'user_123',
        time: 1704067200,
        $insert_id: 'evt_009',
      },
    };

    const result = extractBehavioralSignal(event);

    expect(result).toBeNull();
  });
});

describe('extractFeatureName', () => {
  it('should extract feature from properties.feature', () => {
    const result = extractFeatureName('Event Name', { feature: 'Dashboard' });
    expect(result).toBe('Dashboard');
  });

  it('should extract feature from properties.feature_name', () => {
    const result = extractFeatureName('Event Name', { feature_name: 'Analytics' });
    expect(result).toBe('Analytics');
  });

  it('should prefer properties.feature over feature_name', () => {
    const result = extractFeatureName('Event Name', {
      feature: 'Dashboard',
      feature_name: 'Analytics',
    });
    expect(result).toBe('Dashboard');
  });

  it('should convert event name to lowercase with underscores', () => {
    const result = extractFeatureName('Button Clicked', {});
    expect(result).toBe('button_clicked');
  });

  it('should handle multiple spaces in event name', () => {
    const result = extractFeatureName('Feature  Used   Here', {});
    expect(result).toBe('feature_used_here');
  });

  it('should handle event name with special characters', () => {
    const result = extractFeatureName('Page-Viewed', {});
    expect(result).toBe('page-viewed');
  });
});

describe('processBatchEvents', () => {
  it('should process multiple valid events', () => {
    const events: MixpanelEvent[] = [
      {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user_123',
          time: 1704067200,
          $insert_id: 'evt_001',
          feature: 'Dashboard',
        },
      },
      {
        event: 'Button Clicked',
        properties: {
          distinct_id: 'user_456',
          time: 1704067300,
          $insert_id: 'evt_002',
          feature: 'Export',
        },
      },
      {
        event: 'Page Viewed',
        properties: {
          distinct_id: 'user_789',
          time: 1704067400,
          $insert_id: 'evt_003',
          feature_name: 'Analytics',
        },
      },
    ];

    const result = processBatchEvents(events);

    expect(result).toHaveLength(3);
    expect(result[0].userId).toBe('user_123');
    expect(result[1].userId).toBe('user_456');
    expect(result[2].userId).toBe('user_789');
  });

  it('should filter out system events from batch', () => {
    const events: MixpanelEvent[] = [
      {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user_123',
          time: 1704067200,
          $insert_id: 'evt_001',
          feature: 'Dashboard',
        },
      },
      {
        event: 'Session Start',
        properties: {
          distinct_id: 'user_123',
          time: 1704067100,
          $insert_id: 'evt_000',
        },
      },
      {
        event: 'App Opened',
        properties: {
          distinct_id: 'user_456',
          time: 1704067150,
          $insert_id: 'evt_001a',
        },
      },
    ];

    const result = processBatchEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].eventName).toBe('Feature Used');
  });

  it('should filter out events with missing user ID', () => {
    const events: MixpanelEvent[] = [
      {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user_123',
          time: 1704067200,
          $insert_id: 'evt_001',
          feature: 'Dashboard',
        },
      },
      {
        event: 'Button Clicked',
        properties: {
          time: 1704067300,
          $insert_id: 'evt_002',
          feature: 'Export',
        },
      },
    ];

    const result = processBatchEvents(events);

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('user_123');
  });

  it('should return empty array for batch with all system events', () => {
    const events: MixpanelEvent[] = [
      {
        event: 'Session Start',
        properties: {
          distinct_id: 'user_123',
          time: 1704067200,
          $insert_id: 'evt_001',
        },
      },
      {
        event: 'App Opened',
        properties: {
          distinct_id: 'user_456',
          time: 1704067300,
          $insert_id: 'evt_002',
        },
      },
    ];

    const result = processBatchEvents(events);

    expect(result).toHaveLength(0);
  });

  it('should handle empty batch', () => {
    const events: MixpanelEvent[] = [];

    const result = processBatchEvents(events);

    expect(result).toHaveLength(0);
  });

  it('should process batch with mix of valid and invalid events', () => {
    const events: MixpanelEvent[] = [
      {
        event: 'Feature Used',
        properties: {
          distinct_id: 'user_123',
          time: 1704067200,
          $insert_id: 'evt_001',
          feature: 'Dashboard',
        },
      },
      {
        event: 'Session Start',
        properties: {
          distinct_id: 'user_123',
          time: 1704067100,
          $insert_id: 'evt_000',
        },
      },
      {
        event: 'Button Clicked',
        properties: {
          time: 1704067300,
          $insert_id: 'evt_002',
        },
      },
      {
        event: 'Page Viewed',
        properties: {
          distinct_id: 'user_789',
          time: 1704067400,
          $insert_id: 'evt_003',
          feature_name: 'Analytics',
        },
      },
    ];

    const result = processBatchEvents(events);

    expect(result).toHaveLength(2);
    expect(result[0].eventName).toBe('Feature Used');
    expect(result[1].eventName).toBe('Page Viewed');
  });
});
