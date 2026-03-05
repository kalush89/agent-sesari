/**
 * Formatting Utilities
 * 
 * Date and time formatting functions for the briefing UI.
 * Provides user-friendly date displays following Sesari UI standards.
 */

/**
 * Format date for display in "Monday, January 15, 2024" format
 * 
 * Converts a date string or Date object into a full, human-readable format
 * with day of week, month name, day, and year.
 * 
 * @param date - Date string (YYYY-MM-DD) or Date object
 * @returns Formatted date string (e.g., "Monday, January 15, 2024")
 * @throws Error if date is invalid
 */
export function formatDateForDisplay(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided');
  }
  
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  
  return dateObj.toLocaleDateString('en-US', options);
}

/**
 * Format timestamp as relative time (e.g., "2 hours ago", "Just now")
 * 
 * Converts a Unix timestamp into a human-readable relative time string.
 * Handles various time ranges from seconds to days.
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string (e.g., "2 hours ago", "Just now")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  
  // Handle future timestamps
  if (diffMs < 0) {
    return 'Just now';
  }
  
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  // Less than 1 minute
  if (diffMinutes < 1) {
    return 'Just now';
  }
  
  // Less than 1 hour
  if (diffHours < 1) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  
  // Less than 24 hours
  if (diffDays < 1) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  
  // 1 day or more
  return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
}
