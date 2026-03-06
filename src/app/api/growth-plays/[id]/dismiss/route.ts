/**
 * POST /api/growth-plays/[id]/dismiss
 * 
 * Dismisses a Growth Play.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, reason } = await request.json();
    const { id } = params;

    // Get the Growth Play
    const getResponse = await dynamoClient.send(
      new GetItemCommand({
        TableName: process.env.GROWTH_PLAYS_TABLE,
        Key: marshall({ id }),
      })
    );

    if (!getResponse.Item) {
      return NextResponse.json(
        { error: 'Growth Play not found' },
        { status: 404 }
      );
    }

    const growthPlay = unmarshall(getResponse.Item);

    if (growthPlay.status !== 'pending') {
      return NextResponse.json(
        { error: `Growth Play is not pending (status: ${growthPlay.status})` },
        { status: 400 }
      );
    }

    // Update status to dismissed
    const auditEntry = {
      action: 'dismissed',
      timestamp: new Date().toISOString(),
      userId,
      metadata: reason ? { reason } : {},
    };

    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: process.env.GROWTH_PLAYS_TABLE,
        Key: marshall({ id }),
        UpdateExpression:
          'SET #status = :status, updatedAt = :updatedAt, auditTrail = list_append(auditTrail, :auditEntry)',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall({
          ':status': 'dismissed',
          ':updatedAt': new Date().toISOString(),
          ':auditEntry': [auditEntry],
        }),
      })
    );

    return NextResponse.json({
      success: true,
      message: 'Growth Play dismissed',
    });
  } catch (error) {
    console.error('Failed to dismiss Growth Play:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss Growth Play' },
      { status: 500 }
    );
  }
}
