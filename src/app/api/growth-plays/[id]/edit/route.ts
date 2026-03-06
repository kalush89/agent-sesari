/**
 * PATCH /api/growth-plays/[id]/edit
 * 
 * Edits a Growth Play's draft content.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, editedContent } = await request.json();
    const { id } = params;

    if (!editedContent) {
      return NextResponse.json(
        { error: 'editedContent is required' },
        { status: 400 }
      );
    }

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

    // Update with edited content
    const auditEntry = {
      action: 'edited',
      timestamp: new Date().toISOString(),
      userId,
      metadata: {},
    };

    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: process.env.GROWTH_PLAYS_TABLE,
        Key: marshall({ id }),
        UpdateExpression:
          'SET editedContent = :editedContent, updatedAt = :updatedAt, auditTrail = list_append(auditTrail, :auditEntry)',
        ExpressionAttributeValues: marshall({
          ':editedContent': editedContent,
          ':updatedAt': new Date().toISOString(),
          ':auditEntry': [auditEntry],
        }),
      })
    );

    return NextResponse.json({
      success: true,
      message: 'Growth Play edited',
    });
  } catch (error) {
    console.error('Failed to edit Growth Play:', error);
    return NextResponse.json(
      { error: 'Failed to edit Growth Play' },
      { status: 500 }
    );
  }
}
