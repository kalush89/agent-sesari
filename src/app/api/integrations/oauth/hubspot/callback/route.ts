import { NextRequest, NextResponse } from 'next/server';
import { handleOAuthCallback, handleOAuthError } from '../../../../../../../packages/lambdas/credential-vault/src/handlers/hubspot-oauth';
/**
 * GET /api/integrations/oauth/hubspot/callback
 * Handles OAuth callback from HubSpot and exchanges code for tokens
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // 1. Handle OAuth errors
    if (error) {
      const errorMessage = handleOAuthError(error, errorDescription || undefined);
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(errorMessage)}`, request.url)
      );
    }

    // 2. Validate required parameters
    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/integrations?error=Invalid+OAuth+callback', request.url)
      );
    }

    // 3. Exchange code for tokens and store credential
    await handleOAuthCallback(code, state);

    // 4. Redirect to success page
    return NextResponse.redirect(
      new URL('/integrations?success=HubSpot+connected', request.url)
    );
  } catch (error) {
    console.error('OAuth callback failed:', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    const errorMessage = error instanceof Error ? error.message : 'Failed to connect HubSpot';
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}
