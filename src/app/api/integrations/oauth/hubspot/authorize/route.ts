import { NextRequest, NextResponse } from 'next/server';
import { generateAuthorizationURL } from '../../../../../../../../packages/lambdas/credential-vault/src/handlers/hubspot-oauth';

/**
 * GET /api/integrations/oauth/hubspot/authorize
 * Initiates HubSpot OAuth flow by redirecting to authorization page
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

    // 2. Generate authorization URL with CSRF state token
    const authorizationURL = generateAuthorizationURL(userId);

    // 3. Redirect to HubSpot
    return NextResponse.redirect(authorizationURL);
  } catch (error) {
    console.error('OAuth authorization failed:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}
