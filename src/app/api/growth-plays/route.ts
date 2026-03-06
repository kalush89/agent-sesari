/**
 * GET /api/growth-plays
 * 
 * Returns all pending Growth Plays sorted by createdAt descending.
 */

import { NextResponse } from 'next/server';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export async function GET() {
  try {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: process.env.GROWTH_PLAYS_TABLE,
        IndexName: 'status-createdAt-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': { S: 'pending' },
        },
        ScanIndexForward: false,
      })
    );

    const growthPlays = response.Items?.map((item) => unmarshall(item)) || [];

    return NextResponse.json({
      growthPlays,
      total: growthPlays.length,
    });
  } catch (error) {
    console.error('Failed to fetch Growth Plays:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Growth Plays' },
      { status: 500 }
    );
  }
}
