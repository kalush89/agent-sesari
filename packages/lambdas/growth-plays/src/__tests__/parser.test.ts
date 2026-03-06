/**
 * Unit tests for Growth Play parser edge cases
 * 
 * Tests missing required fields, invalid enum values, and out-of-bounds risk scores
 */

import { describe, it, expect } from 'vitest';
import { parseGrowthPlay, serializeGrowthPlay, prettyPrintGrowthPlay } from '../parser.js';
import type { GrowthPlay } from '../types.js';

/**
 * Creates a valid Growth Play object for testing
 */
function createValidGrowthPlay(): GrowthPlay {
  return {
    id: 'gp-123',
    customerId: 'cust-456',
    customerName: 'John Doe',
    companyName: 'Acme Corp',
    riskScore: 85,
    communicationType: 'email',
    subject: 'Checking in on your usage',
    draftContent: 'Hi John, I noticed your usage has declined recently...',
    thoughtTrace: {
      riskFactors: [
        {
          type: 'usage_decline',
          severity: 90,
          signalValues: { decline: 60 },
          weight: 0.4
        }
      ],
      reasoning: 'Usage declined by 60% in the last 30 days',
      signalSources: ['Mixpanel']
    },
    status: 'pending',
    createdAt: '2026-03-05T10:00:00Z',
    updatedAt: '2026-03-05T10:00:00Z',
    auditTrail: [
      {
        action: 'created',
        timestamp: '2026-03-05T10:00:00Z'
      }
    ]
  };
}

describe('parseGrowthPlay - Missing Required Fields', () => {
  it('should return error when id is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).id;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('id');
      expect(result.error.message).toContain('string');
    }
  });

  it('should return error when customerId is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).customerId;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('customerId');
    }
  });

  it('should return error when customerName is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).customerName;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('customerName');
    }
  });

  it('should return error when companyName is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).companyName;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('companyName');
    }
  });

  it('should return error when riskScore is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).riskScore;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('riskScore');
    }
  });

  it('should return error when communicationType is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).communicationType;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('communicationType');
    }
  });

  it('should return error when draftContent is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).draftContent;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('draftContent');
    }
  });

  it('should return error when thoughtTrace is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).thoughtTrace;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('thoughtTrace');
    }
  });

  it('should return error when status is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).status;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('status');
    }
  });

  it('should return error when createdAt is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).createdAt;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('createdAt');
    }
  });

  it('should return error when updatedAt is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).updatedAt;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('updatedAt');
    }
  });

  it('should return error when auditTrail is missing', () => {
    const data = { ...createValidGrowthPlay() };
    delete (data as any).auditTrail;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('auditTrail');
    }
  });

  it('should return error when subject is missing for email type', () => {
    const data = { ...createValidGrowthPlay(), communicationType: 'email' as const };
    delete (data as any).subject;

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('subject');
    }
  });
});

describe('parseGrowthPlay - Empty String Fields', () => {
  it('should return error when id is empty string', () => {
    const data = { ...createValidGrowthPlay(), id: '' };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('id');
      expect(result.error.message).toContain('empty');
    }
  });

  it('should return error when customerName is empty string', () => {
    const data = { ...createValidGrowthPlay(), customerName: '   ' };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('customerName');
      expect(result.error.message).toContain('empty');
    }
  });

  it('should return error when draftContent is empty string', () => {
    const data = { ...createValidGrowthPlay(), draftContent: '' };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('draftContent');
    }
  });
});

describe('parseGrowthPlay - Invalid Enum Values', () => {
  it('should return error for invalid communicationType', () => {
    const data = { ...createValidGrowthPlay(), communicationType: 'sms' as any };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('communicationType');
      expect(result.error.message).toContain('email, slack');
      expect(result.error.receivedValue).toBe('sms');
    }
  });

  it('should return error for invalid status', () => {
    const data = { ...createValidGrowthPlay(), status: 'archived' as any };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('status');
      expect(result.error.message).toContain('pending');
      expect(result.error.receivedValue).toBe('archived');
    }
  });

  it('should return error for invalid risk factor type', () => {
    const data = {
      ...createValidGrowthPlay(),
      thoughtTrace: {
        ...createValidGrowthPlay().thoughtTrace,
        riskFactors: [
          {
            type: 'invalid_type' as any,
            severity: 50,
            signalValues: {},
            weight: 0.5
          }
        ]
      }
    };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toContain('riskFactors');
      expect(result.error.field).toContain('type');
      expect(result.error.receivedValue).toBe('invalid_type');
    }
  });

  it('should return error for invalid audit action', () => {
    const data = {
      ...createValidGrowthPlay(),
      auditTrail: [
        {
          action: 'deleted' as any,
          timestamp: '2026-03-05T10:00:00Z'
        }
      ]
    };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toContain('auditTrail');
      expect(result.error.field).toContain('action');
      expect(result.error.receivedValue).toBe('deleted');
    }
  });
});

describe('parseGrowthPlay - Out of Bounds Risk Scores', () => {
  it('should return error when riskScore is negative', () => {
    const data = { ...createValidGrowthPlay(), riskScore: -10 };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('riskScore');
      expect(result.error.message).toContain('between 0 and 100');
      expect(result.error.receivedValue).toBe(-10);
    }
  });

  it('should return error when riskScore exceeds 100', () => {
    const data = { ...createValidGrowthPlay(), riskScore: 150 };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('riskScore');
      expect(result.error.message).toContain('between 0 and 100');
      expect(result.error.receivedValue).toBe(150);
    }
  });

  it('should accept riskScore of 0', () => {
    const data = { ...createValidGrowthPlay(), riskScore: 0 };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.riskScore).toBe(0);
    }
  });

  it('should accept riskScore of 100', () => {
    const data = { ...createValidGrowthPlay(), riskScore: 100 };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.riskScore).toBe(100);
    }
  });

  it('should return error when riskScore is NaN', () => {
    const data = { ...createValidGrowthPlay(), riskScore: NaN };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('riskScore');
      expect(result.error.message).toContain('NaN');
    }
  });
});

describe('parseGrowthPlay - Invalid Data Types', () => {
  it('should return error when riskScore is a string', () => {
    const data = { ...createValidGrowthPlay(), riskScore: '85' as any };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('riskScore');
      expect(result.error.message).toContain('number');
    }
  });

  it('should return error when auditTrail is not an array', () => {
    const data = { ...createValidGrowthPlay(), auditTrail: {} as any };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('auditTrail');
      expect(result.error.message).toContain('array');
    }
  });

  it('should return error when thoughtTrace is not an object', () => {
    const data = { ...createValidGrowthPlay(), thoughtTrace: 'invalid' as any };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('thoughtTrace');
      expect(result.error.message).toContain('object');
    }
  });
});

describe('parseGrowthPlay - Invalid Timestamps', () => {
  it('should return error for invalid createdAt timestamp', () => {
    const data = { ...createValidGrowthPlay(), createdAt: 'not-a-date' };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('createdAt');
      expect(result.error.message).toContain('ISO 8601');
    }
  });

  it('should return error for invalid updatedAt timestamp', () => {
    const data = { ...createValidGrowthPlay(), updatedAt: '2026-13-45' };

    const result = parseGrowthPlay(data);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('updatedAt');
      expect(result.error.message).toContain('ISO 8601');
    }
  });
});

describe('parseGrowthPlay - Invalid JSON String', () => {
  it('should return error for malformed JSON', () => {
    const result = parseGrowthPlay('{ invalid json }');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.field).toBe('root');
      expect(result.error.message).toContain('Invalid JSON');
    }
  });

  it('should parse valid JSON string', () => {
    const validGrowthPlay = createValidGrowthPlay();
    const jsonString = JSON.stringify(validGrowthPlay);

    const result = parseGrowthPlay(jsonString);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.id).toBe(validGrowthPlay.id);
    }
  });
});

describe('parseGrowthPlay - Valid Cases', () => {
  it('should parse valid Growth Play with all required fields', () => {
    const validGrowthPlay = createValidGrowthPlay();

    const result = parseGrowthPlay(validGrowthPlay);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(validGrowthPlay);
    }
  });

  it('should parse valid Slack Growth Play without subject', () => {
    const slackGrowthPlay = {
      ...createValidGrowthPlay(),
      communicationType: 'slack' as const
    };
    delete (slackGrowthPlay as any).subject;

    const result = parseGrowthPlay(slackGrowthPlay);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.communicationType).toBe('slack');
      expect(result.value.subject).toBeUndefined();
    }
  });

  it('should parse Growth Play with optional editedContent', () => {
    const growthPlay = {
      ...createValidGrowthPlay(),
      editedContent: 'Edited version of the draft'
    };

    const result = parseGrowthPlay(growthPlay);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.editedContent).toBe('Edited version of the draft');
    }
  });

  it('should parse Growth Play with optional executionMetadata', () => {
    const growthPlay = {
      ...createValidGrowthPlay(),
      executionMetadata: { messageId: 'msg-123', deliveryStatus: 'sent' }
    };

    const result = parseGrowthPlay(growthPlay);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.executionMetadata).toEqual({
        messageId: 'msg-123',
        deliveryStatus: 'sent'
      });
    }
  });

  it('should parse Growth Play with empty auditTrail', () => {
    const growthPlay = {
      ...createValidGrowthPlay(),
      auditTrail: []
    };

    const result = parseGrowthPlay(growthPlay);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.auditTrail).toEqual([]);
    }
  });
});

describe('serializeGrowthPlay', () => {
  it('should serialize Growth Play to JSON string', () => {
    const growthPlay = createValidGrowthPlay();

    const serialized = serializeGrowthPlay(growthPlay);

    expect(typeof serialized).toBe('string');
    expect(JSON.parse(serialized)).toEqual(growthPlay);
  });
});

describe('prettyPrintGrowthPlay', () => {
  it('should format Growth Play with indentation', () => {
    const growthPlay = createValidGrowthPlay();

    const formatted = prettyPrintGrowthPlay(growthPlay);

    expect(formatted).toContain('\n');
    expect(formatted).toContain('  ');
    expect(JSON.parse(formatted)).toEqual(growthPlay);
  });

  it('should produce different output than serializeGrowthPlay', () => {
    const growthPlay = createValidGrowthPlay();

    const serialized = serializeGrowthPlay(growthPlay);
    const prettyPrinted = prettyPrintGrowthPlay(growthPlay);

    expect(serialized).not.toBe(prettyPrinted);
    expect(prettyPrinted.length).toBeGreaterThan(serialized.length);
  });
});
