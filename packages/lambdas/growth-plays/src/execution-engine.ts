/**
 * Execution Engine
 * 
 * Sends approved communications via AWS SES (email) or Slack API.
 * Implements retry logic with exponential backoff for reliability.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { validateEnvironment } from './utils/validation.js';
import { updateGrowthPlayStatus } from './data-access.js';
import { sleep } from './utils/error-handling.js';
import type { GrowthPlay } from './types.js';

const sesClient = new SESClient({ region: process.env.AWS_REGION });

/**
 * Sends an email via AWS SES
 * 
 * @param to - Recipient email address
 * @param subject - Email subject line
 * @param body - Email body content
 * @returns Message ID from SES
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<string> {
  validateEnvironment(['AWS_REGION', 'SES_FROM_EMAIL']);

  try {
    const response = await sesClient.send(
      new SendEmailCommand({
        Source: process.env.SES_FROM_EMAIL,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
          },
          Body: {
            Text: {
              Data: body,
            },
          },
        },
      })
    );

    return response.MessageId || '';
  } catch (error) {
    console.error('SES send email failed:', error);
    throw new Error(`Failed to send email: ${(error as Error).message}`);
  }
}

/**
 * Sends a Slack message via Slack API
 * 
 * @param channel - Slack channel or user ID
 * @param message - Message content
 * @returns Message timestamp from Slack
 */
export async function sendSlackMessage(
  channel: string,
  message: string
): Promise<string> {
  validateEnvironment(['SLACK_BOT_TOKEN']);

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel,
        text: message,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return data.ts || '';
  } catch (error) {
    console.error('Slack send message failed:', error);
    throw new Error(`Failed to send Slack message: ${(error as Error).message}`);
  }
}

/**
 * Retries a function with exponential backoff
 * 
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @returns Result from the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  const delays = [1000, 2000, 4000]; // 1s, 2s, 4s

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      console.log(`Retry attempt ${attempt + 1} failed, waiting ${delays[attempt]}ms`);
      await sleep(delays[attempt]);
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Executes a Growth Play by sending the communication
 * 
 * @param growthPlay - Growth Play to execute
 * @param userId - User ID who approved the Growth Play
 * @returns Execution result with message ID
 */
export async function executeGrowthPlay(
  growthPlay: GrowthPlay,
  userId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    let messageId: string;

    // Route to appropriate communication channel
    if (growthPlay.communicationType === 'email') {
      if (!growthPlay.subject) {
        throw new Error('Email subject is required');
      }

      const content = growthPlay.editedContent || growthPlay.draftContent;
      
      messageId = await retryWithBackoff(() =>
        sendEmail(growthPlay.customerName, growthPlay.subject!, content)
      );
    } else {
      // Slack
      const content = growthPlay.editedContent || growthPlay.draftContent;
      
      messageId = await retryWithBackoff(() =>
        sendSlackMessage(growthPlay.customerName, content)
      );
    }

    // Update Growth Play status to executed
    await updateGrowthPlayStatus(growthPlay.id, 'executed', {
      action: 'executed',
      timestamp: new Date().toISOString(),
      userId,
      metadata: {
        messageId,
        communicationType: growthPlay.communicationType,
      },
    });

    return { success: true, messageId };
  } catch (error) {
    console.error(`Failed to execute Growth Play ${growthPlay.id}:`, error);

    // Update Growth Play status to failed
    await updateGrowthPlayStatus(growthPlay.id, 'failed', {
      action: 'failed',
      timestamp: new Date().toISOString(),
      userId,
      metadata: {
        error: (error as Error).message,
      },
    });

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Lambda handler for Execution Engine
 * 
 * @param event - Execution request with Growth Play ID and user ID
 * @returns Execution result
 */
export async function handler(event: {
  growthPlayId: string;
  userId: string;
  growthPlay: GrowthPlay;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  validateEnvironment(['AWS_REGION', 'GROWTH_PLAYS_TABLE']);

  const { growthPlay, userId } = event;

  // Validate Growth Play status
  if (growthPlay.status !== 'approved') {
    throw new Error(`Growth Play ${growthPlay.id} is not approved (status: ${growthPlay.status})`);
  }

  return executeGrowthPlay(growthPlay, userId);
}
