/**
 * Test setup file - runs before all tests
 * Sets required environment variables for testing
 */

import { beforeAll } from 'vitest';

beforeAll(() => {
  // Set required environment variables for event-store module
  process.env.AWS_REGION = 'us-east-1';
  process.env.DYNAMODB_TABLE_NAME = 'test-revenue-signals';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
  process.env.LOG_LEVEL = 'error';
});
