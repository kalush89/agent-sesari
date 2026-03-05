/**
 * API Route: GET /api/briefing
 * 
 * Fetches daily briefings from DynamoDB.
 * Accepts date query parameter in YYYY-MM-DD format.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchBriefing } from '@/lib/briefing-fetch';

/**
 * GET /api/briefing?date=YYYY-MM-DD
 * 
 * Fetches briefing for the specified date.
 * If no date provided, returns today's briefing.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date') || getTodayDate();
  
  // Validate date format
  if (!isValidDateFormat(date)) {
    return NextResponse.json(
      { error: 'Invalid date format. Use YYYY-MM-DD' },
      { status: 400 }
    );
  }
  
  try {
    const briefing = await fetchBriefing(date);
    
    if (!briefing) {
      return NextResponse.json(
        { error: 'No briefing available for this date' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(briefing);
  } catch (error) {
    console.error('Failed to fetch briefing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch briefing' },
      { status: 500 }
    );
  }
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}
