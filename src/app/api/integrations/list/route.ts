import { NextRequest, NextResponse } from 'next/server';
import { listCredentials } from '../../../../../packages/lambdas/credential-vault/src/utils/storage';

/**
 * Integration list item for API response
 */
interface IntegrationListItem {
  service_name: string;
  display_name: string;
  credential_type: string;
  masked_value: string;
  connected_at: string;
}

/**
 * GET /api/integrations/list
 * Lists all connected integrations for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Query all credentials for user
    const credentials = await listCredentials(userId);

    // 3. Transform to API response format
    const integrations: IntegrationListItem[] = credentials.map((record) => ({
      service_name: record.service_name,
      display_name: record.display_name,
      credential_type: record.credential_type,
      masked_value: record.masked_value,
      connected_at: record.created_at
    }));

    return NextResponse.json({ integrations });
  } catch (error) {
    console.error('List integrations failed:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      { error: 'Failed to list integrations' },
      { status: 500 }
    );
  }
}
