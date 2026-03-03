/**
 * Behavioral signal extraction from Mixpanel webhook events
 * Maps Mixpanel events to usage events for baseline calculation
 */

import { UsageEvent } from './types.js';

/**
 * Mixpanel webhook event structure
 */
export interface MixpanelEvent {
  event: string;
  properties: {
    distinct_id?: string;
    time?: number;
    $insert_id?: string;
    [key: string]: any;
  };
}

/**
 * System events that should be filtered out (non-behavioral)
 */
const SYSTEM_EVENTS = new Set([
  'Session Start',
  'App Opened',
  'Session End',
  'App Closed',
  '$identify',
  '$create_alias',
  '$merge',
]);

/**
 * Extracts behavioral signal from Mixpanel webhook event
 * Returns UsageEvent for baseline calculation or null for non-behavioral events
 * 
 * @param mixpanelEvent - Mixpanel event from webhook payload
 * @returns UsageEvent or null if event should be ignored
 */
export function extractBehavioralSignal(
  mixpanelEvent: MixpanelEvent
): UsageEvent | null {
  const { event: eventName, properties } = mixpanelEvent;

  // Filter out system events
  if (SYSTEM_EVENTS.has(eventName)) {
    console.log(JSON.stringify({
      level: 'info',
      message: 'Ignoring system event',
      eventName,
      eventId: properties.$insert_id,
    }));
    return null;
  }

  // Extract user ID (distinct_id is required)
  const userId = properties.distinct_id;
  if (!userId) {
    console.log(JSON.stringify({
      level: 'warn',
      message: 'Event missing user ID (distinct_id)',
      eventName,
      eventId: properties.$insert_id,
    }));
    return null;
  }

  // Determine feature name from event name or properties
  const feature = extractFeatureName(eventName, properties);

  // Extract timestamp (Mixpanel time is in seconds)
  const timestamp = properties.time || Math.floor(Date.now() / 1000);

  // Generate event ID (use Mixpanel's insert_id or generate one)
  const eventId = properties.$insert_id || `${userId}_${eventName}_${timestamp}`;

  // Set TTL to 90 days from event timestamp
  const expiresAt = timestamp + (90 * 24 * 60 * 60);

  const usageEvent: UsageEvent = {
    eventId,
    userId,
    feature,
    eventName,
    timestamp,
    properties,
    expiresAt,
  };

  return usageEvent;
}

/**
 * Extracts feature name from event name or properties
 * Converts event names like "Feature Used" or "Button Clicked" to feature identifiers
 * 
 * @param eventName - Mixpanel event name
 * @param properties - Event properties that may contain feature information
 * @returns Feature name string
 */
export function extractFeatureName(
  eventName: string,
  properties: Record<string, any>
): string {
  // Check if properties explicitly define a feature
  if (properties.feature) {
    return String(properties.feature);
  }

  if (properties.feature_name) {
    return String(properties.feature_name);
  }

  // Use event name as feature identifier
  // Clean up the event name for consistency
  return eventName
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/**
 * Processes batch of Mixpanel events from webhook payload
 * Returns array of UsageEvents for all valid behavioral events
 * 
 * @param events - Array of Mixpanel events from webhook
 * @returns Array of UsageEvents (may be empty if all events filtered)
 */
export function processBatchEvents(
  events: MixpanelEvent[]
): UsageEvent[] {
  const usageEvents: UsageEvent[] = [];

  for (const event of events) {
    const usageEvent = extractBehavioralSignal(event);
    if (usageEvent) {
      usageEvents.push(usageEvent);
    }
  }

  console.log(JSON.stringify({
    level: 'info',
    message: 'Batch event processing complete',
    totalEvents: events.length,
    validEvents: usageEvents.length,
    filteredEvents: events.length - usageEvents.length,
  }));

  return usageEvents;
}
