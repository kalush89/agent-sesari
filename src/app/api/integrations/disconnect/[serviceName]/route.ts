import { NextRequest, NextResponse } from 'next/server';
import { deleteCredential } from '../../../../../../packages/lambdas/credential-vault/src/utils/storage';
import { ServiceName } from '../../../../../../packages/lambdas/credential-vault/src/types';

/**
 * Route params for disconnect endpoint
 */
interface RouteParams {
  params: {
    serviceName: string;
  };
}

/**
 * DELETE /api/integrations/disconnect/:serviceName
 * Disconnects an integration by deleting stored credentials
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Authenticate user
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Validate service name
    const { serviceName } = params;
    const validServices: ServiceName[] = ['hubspot', 'stripe', 'mixpanel'];
    
    if (!validServices.includes(serviceName as ServiceName)) {
      return NextResponse.json(
        { success: false, error: 'Invalid service name' },
        { status: 400 }
      );
    }

    // 3. Delete credential
    await deleteCredential(userId, serviceName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Disconnect integration failed:', {
      service_name: params.serviceName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      { success: false, error: 'Failed to disconnect integration' },
      { status: 500 }
    );
  }
}
