import { NextRequest, NextResponse } from 'next/server';
import { validateMixpanelCredentials } from '../../../../../../packages/lambdas/credential-vault/src/handlers/mixpanel-validation';

/**
 * POST /api/integrations/connect/mixpanel
 * Validates and stores Mixpanel service account credentials
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { success: false, error_message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { username, secret } = body;

    if (!username || !secret) {
      return NextResponse.json(
        { success: false, error_message: 'Username and secret are required' },
        { status: 400 }
      );
    }

    // 3. Validate and store credentials
    const result = await validateMixpanelCredentials(userId, username, secret);

    if (result.success) {
      return NextResponse.json({
        success: true,
        masked_value: result.credential_record?.masked_value
      });
    }

    return NextResponse.json(
      { success: false, error_message: result.error_message },
      { status: 400 }
    );
  } catch (error) {
    console.error('Mixpanel connection failed:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      { success: false, error_message: 'Failed to connect Mixpanel' },
      { status: 500 }
    );
  }
}
