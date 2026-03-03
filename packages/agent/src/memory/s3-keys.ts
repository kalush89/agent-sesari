/**
 * S3 Key Generation Utilities
 * 
 * Provides consistent naming conventions for memory documents stored in S3.
 * Each document type has a specific key format to enable organized storage
 * and efficient retrieval.
 */

/**
 * Generates S3 key for strategy documents
 * @param category - Strategy category (icp, playbook, brand_voice)
 * @param version - Document version number
 * @returns S3 key in format: strategy/{category}-v{version}.json
 */
export function generateStrategyKey(
  category: 'icp' | 'playbook' | 'brand_voice',
  version: number
): string {
  if (version < 1) {
    throw new Error('Version must be a positive integer');
  }
  return `strategy/${category}-v${version}.json`;
}

/**
 * Generates S3 key for performance summary documents
 * @param weekStart - ISO 8601 date string for the start of the week
 * @returns S3 key in format: performance/{year}-W{week}.json
 */
export function generatePerformanceKey(weekStart: string): string {
  const date = new Date(weekStart);
  
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format. Expected ISO 8601 date string');
  }
  
  const year = date.getFullYear();
  const weekNumber = getWeekNumber(date);
  
  return `performance/${year}-W${weekNumber.toString().padStart(2, '0')}.json`;
}

/**
 * Generates S3 key for action history documents
 * @param actionId - Unique identifier for the action
 * @param timestamp - ISO 8601 timestamp string
 * @returns S3 key in format: actions/{actionId}.json
 */
export function generateActionKey(actionId: string, timestamp: string): string {
  if (!actionId || actionId.trim().length === 0) {
    throw new Error('Action ID cannot be empty');
  }
  
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid timestamp format. Expected ISO 8601 timestamp string');
  }
  
  // Sanitize actionId to remove characters that are problematic in S3 keys
  const sanitizedId = sanitizeKeyComponent(actionId);
  
  // Use just the action ID for the key to enable easy retrieval
  return `actions/${sanitizedId}.json`;
}

/**
 * Generates S3 key for technical map documents
 * @param serviceName - Name of the service (e.g., stripe, hubspot)
 * @param category - Technical map category (signal_definition, integration_schema)
 * @param version - Document version number
 * @returns S3 key in format: technical/{serviceName}-{category}-v{version}.json
 */
export function generateTechnicalKey(
  serviceName: string,
  category: 'signal_definition' | 'integration_schema',
  version: number
): string {
  if (!serviceName || serviceName.trim().length === 0) {
    throw new Error('Service name cannot be empty');
  }
  
  if (version < 1) {
    throw new Error('Version must be a positive integer');
  }
  
  const sanitizedService = sanitizeKeyComponent(serviceName);
  
  return `technical/${sanitizedService}-${category}-v${version}.json`;
}

/**
 * Calculates ISO week number for a given date
 * @param date - Date object
 * @returns Week number (1-53)
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Sanitizes a string component for use in S3 keys
 * Removes or replaces characters that could cause issues
 * @param component - String to sanitize
 * @returns Sanitized string safe for S3 keys
 */
function sanitizeKeyComponent(component: string): string {
  return component
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
