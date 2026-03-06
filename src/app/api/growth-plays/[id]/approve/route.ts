/**
 * POST /api/growth-plays/[id]/approve
 * 
 * Approves a Growth Play and triggers execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, editedContent } = await request.json();
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

    // Update status to approved
    const auditEntry = {
      action: 'approved',
      timestamp: new Date().toISOString(),
      userId,
      metadata: editedContent ? { edited: true } : {},
    };

    const updateExpression = editedContent
      ? 'SET #status = :status, updatedAt = :updatedAt, editedContent = :editedContent, auditTrail = list_append(auditTrail, :auditEntry)'
      : 'SET #status = :status, updatedAt = :updatedAt, auditTrail = list_append(auditTrail, :auditEntry)';

    const expressionValues: any = {
      ':status': 'approved',
      ':updatedAt': new Date().toISOString(),
      ':auditEntry': [auditEntry],
    };

    if (editedContent) {
      expressionValues[':editedContent'] = editedContent;
    }

    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: process.env.GROWTH_PLAYS_TABLE,
        Key: marshall({ id }),
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: marshall(expressionValues),
      })
    );

    // Invoke Execution Engine Lambda asynchronously
    const updatedGrowthPlay = { ...growthPlay, status: 'approved', editedContent };
    
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: process.env.EXECUTION_ENGINE_LAMBDA || 'execution-engine',
        InvocationType: 'Event',
        Payload: JSON.stringify({
          growthPlayId: id,
          userId,
          growthPlay: updatedGrowthPlay,
        }),
      })
    );

    return NextResponse.json({
      success: true,
      message: 'Growth Play approved and execution triggered',
    });
  } catch (error) {
    console.error('Failed to approve Growth Play:', error);
    return NextResponse.json(
      { error: 'Failed to approve Growth Play' },
      { status: 500 }
    );
  }
}
