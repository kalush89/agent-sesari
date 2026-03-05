'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateForDisplay } from '@/lib/format';

interface BriefingHeaderProps {
  date: string;
  insightCount: number;
  onDateChange: (date: string) => void;
}

/**
 * BriefingHeader Component
 * 
 * Displays the briefing date, insight count, and navigation controls.
 * Allows users to navigate between different days' briefings.
 */
export function BriefingHeader({ date, insightCount, onDateChange }: BriefingHeaderProps) {
  const isToday = date === getTodayDate();
  
  const handlePrevious = () => {
    const prevDate = addDays(date, -1);
    onDateChange(prevDate);
  };
  
  const handleNext = () => {
    if (!isToday) {
      const nextDate = addDays(date, 1);
      onDateChange(nextDate);
    }
  };
  
  const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onDateChange(e.target.value);
  };
  
  return (
    <header className="bg-card border-b border-border">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Date and insight count */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-primary mb-1">
            {formatDateForDisplay(date)}
          </h1>
          <p className="text-sm text-muted">
            {insightCount} {insightCount === 1 ? 'insight' : 'insights'}
          </p>
        </div>
        
        {/* Navigation controls */}
        <div className="flex items-center gap-4">
          {/* Previous button */}
          <button
            onClick={handlePrevious}
            className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted/10 rounded transition-colors"
            aria-label="Previous day"
          >
            <ChevronLeft size={16} />
            <span>Previous</span>
          </button>
          
          {/* Date picker */}
          <input
            type="date"
            value={date}
            onChange={handleDatePickerChange}
            max={getTodayDate()}
            className="px-3 py-2 text-sm border border-border rounded bg-background text-primary focus:outline-none focus:ring-2 focus:ring-growth"
            aria-label="Select date"
          />
          
          {/* Next button */}
          <button
            onClick={handleNext}
            disabled={isToday}
            className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-muted/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            aria-label="Next day"
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Add days to a date string
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param days - Number of days to add (negative to subtract)
 * @returns New date string in YYYY-MM-DD format
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
