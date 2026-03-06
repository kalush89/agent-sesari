/**
 * GET /api/growth-plays/[id]/audit
 * 
 * Returns the complete audit trail for a Growth Play.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const response = await dynamoClient.send(
      new GetItemCommand({
        TableName: process.env.GROWTH_PLAYS_TABLE,
        Key: marshall({ id }),
      })
    );

    if (!response.Item) {
      return NextResponse.json(
        { error: 'Growth Play not found' },
        { status: 404 }
      );
    }

    const growthPlay = unmarshall(response.Item);

    return NextResponse.json({
      growthPlay,
      auditTrail: growthPlay.auditTrail || [],
    });
  } catch (error) {
    console.error('Failed to fetch audit trail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit trail' },
      { status: 500 }
    );
  }
}
