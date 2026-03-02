import { NextRequest, NextResponse } from 'next/server';
import { validateStripeKey } from '../../../../../../packages/lambdas/credential-vault/src/handlers/stripe-validation';

/**
 * POST /api/integrations/connect/stripe
 * Validates and stores a Stripe API key
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
    const { apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error_message: 'API key is required' },
        { status: 400 }
      );
    }

    // 3. Validate and store credential
    const result = await validateStripeKey(userId, apiKey);

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
    console.error('Stripe connection failed:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      { success: false, error_message: 'Failed to connect Stripe' },
      { status: 500 }
    );
  }
}
