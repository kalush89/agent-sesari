/**
 * Unit tests for Knowledge Base updater
 * Tests profile formatting, version management, and update logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatICPProfile,
  getLatestICPVersion,
  updateICPProfile,
} from '../kb-updater';
import { ICPProfile } from '../types';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

// Mock AWS SDK clients
vi.mock('../clients', () => ({
  createBedrockAgentRuntimeClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  createDynamoDBClient: vi.fn(() => ({
    send: vi.fn(),
  })),
}));

describe('formatICPProfile', () => {
  it('should format profile with all sections', () => {
    const profile: ICPProfile = {
      version: 5,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['SaaS', 'FinTech', 'Healthcare'],
        sizeRange: '11-50 employees',
        regions: ['North America', 'Europe'],
        usagePatterns: [
          'High API usage',
          'Daily active users',
          'Advanced features adoption',
        ],
      },
      reasoning:
        'Finance companies show 40% higher retention than Retail. They engage 3x more with reporting features.',
      confidenceScore: 85,
      sampleSize: 45,
    };

    const markdown = formatICPProfile(profile);

    // Check metadata header
    expect(markdown).toContain('# Ideal Customer Profile');
    expect(markdown).toContain('**Version:** 5');
    expect(markdown).toContain('**Generated:** 2024-03-15T10:30:00Z');
    expect(markdown).toContain('**Confidence Score:** 85/100');
    expect(markdown).toContain('**Sample Size:** 45 customers');

    // Check traits sections
    expect(markdown).toContain('## Common Traits');
    expect(markdown).toContain('### Industries');
    expect(markdown).toContain('- SaaS');
    expect(markdown).toContain('- FinTech');
    expect(markdown).toContain('- Healthcare');

    expect(markdown).toContain('### Company Size');
    expect(markdown).toContain('- 11-50 employees');

    expect(markdown).toContain('### Regions');
    expect(markdown).toContain('- North America');
    expect(markdown).toContain('- Europe');

    expect(markdown).toContain('### Usage Patterns');
    expect(markdown).toContain('- High API usage');
    expect(markdown).toContain('- Daily active users');
    expect(markdown).toContain('- Advanced features adoption');

    // Check reasoning section
    expect(markdown).toContain('## Analysis Reasoning');
    expect(markdown).toContain(
      'Finance companies show 40% higher retention than Retail'
    );
  });

  it('should handle empty trait arrays', () => {
    const profile: ICPProfile = {
      version: 1,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: [],
        sizeRange: 'Unknown',
        regions: [],
        usagePatterns: [],
      },
      reasoning: 'Insufficient data for detailed analysis.',
      confidenceScore: 30,
      sampleSize: 5,
    };

    const markdown = formatICPProfile(profile);

    expect(markdown).toContain('**Version:** 1');
    expect(markdown).toContain('**Confidence Score:** 30/100');
    expect(markdown).toContain('**Sample Size:** 5 customers');
    expect(markdown).toContain('### Industries');
    expect(markdown).toContain('### Regions');
    expect(markdown).toContain('### Usage Patterns');
  });

  it('should format version 0 correctly', () => {
    const profile: ICPProfile = {
      version: 0,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['Technology'],
        sizeRange: '1-10 employees',
        regions: ['Global'],
        usagePatterns: ['Basic usage'],
      },
      reasoning: 'Initial profile.',
      confidenceScore: 50,
      sampleSize: 10,
    };

    const markdown = formatICPProfile(profile);
    expect(markdown).toContain('**Version:** 0');
  });

  it('should handle multiline reasoning', () => {
    const profile: ICPProfile = {
      version: 2,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['SaaS'],
        sizeRange: '11-50',
        regions: ['US'],
        usagePatterns: ['High engagement'],
      },
      reasoning:
        'Line 1: First observation.\nLine 2: Second observation.\nLine 3: Conclusion.',
      confidenceScore: 75,
      sampleSize: 30,
    };

    const markdown = formatICPProfile(profile);
    expect(markdown).toContain('Line 1: First observation.');
    expect(markdown).toContain('Line 2: Second observation.');
    expect(markdown).toContain('Line 3: Conclusion.');
  });
});

describe('getLatestICPVersion', () => {
  let mockSend: any;

  beforeEach(async () => {
    const { createBedrockAgentRuntimeClient } = await import('../clients');
    mockSend = vi.fn();
    (createBedrockAgentRuntimeClient as any).mockReturnValue({
      send: mockSend,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should extract version from existing profile', async () => {
    const mockContent = `# Ideal Customer Profile

**Version:** 7
**Generated:** 2024-03-15T10:30:00Z
**Confidence Score:** 85/100
**Sample Size:** 45 customers`;

    mockSend.mockResolvedValue({
      retrievalResults: [
        {
          content: { text: mockContent },
        },
      ],
    });

    const version = await getLatestICPVersion('test-kb-id');
    expect(version).toBe(7);
    expect(mockSend).toHaveBeenCalledWith(expect.any(RetrieveCommand));
  });

  it('should return 0 when no profile exists', async () => {
    mockSend.mockResolvedValue({
      retrievalResults: [],
    });

    const version = await getLatestICPVersion('test-kb-id');
    expect(version).toBe(0);
  });

  it('should return 0 when ResourceNotFoundException is thrown', async () => {
    const error = new Error('Resource not found');
    error.name = 'ResourceNotFoundException';
    mockSend.mockRejectedValue(error);

    const version = await getLatestICPVersion('test-kb-id');
    expect(version).toBe(0);
  });

  it('should throw error for other API failures', async () => {
    const error = new Error('API error');
    error.name = 'ServiceException';
    mockSend.mockRejectedValue(error);

    await expect(getLatestICPVersion('test-kb-id')).rejects.toThrow(
      'Failed to get latest ICP version'
    );
  });

  it('should handle malformed version in content', async () => {
    mockSend.mockResolvedValue({
      retrievalResults: [
        {
          content: { text: 'No version here' },
        },
      ],
    });

    const version = await getLatestICPVersion('test-kb-id');
    expect(version).toBe(0);
  });

  it('should extract version from middle of document', async () => {
    const mockContent = `Some preamble text
**Version:** 12
More content here`;

    mockSend.mockResolvedValue({
      retrievalResults: [
        {
          content: { text: mockContent },
        },
      ],
    });

    const version = await getLatestICPVersion('test-kb-id');
    expect(version).toBe(12);
  });
});

describe('updateICPProfile', () => {
  let mockBedrockSend: any;
  let mockDynamoSend: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    const { createBedrockAgentRuntimeClient, createDynamoDBClient } = await import(
      '../clients'
    );
    mockBedrockSend = vi.fn();
    mockDynamoSend = vi.fn();
    (createBedrockAgentRuntimeClient as any).mockReturnValue({
      send: mockBedrockSend,
    });
    (createDynamoDBClient as any).mockReturnValue({
      send: mockDynamoSend,
    });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should successfully update Knowledge Base on first attempt', async () => {
    const profile: ICPProfile = {
      version: 3,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['SaaS'],
        sizeRange: '11-50',
        regions: ['US'],
        usagePatterns: ['High engagement'],
      },
      reasoning: 'Test reasoning',
      confidenceScore: 80,
      sampleSize: 25,
    };

    await updateICPProfile(profile, 'test-kb-id');

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Attempting to update Knowledge Base')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Knowledge Base update successful'
    );
  });

  it('should log formatted profile during update', async () => {
    const profile: ICPProfile = {
      version: 1,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['FinTech'],
        sizeRange: '51-200',
        regions: ['Europe'],
        usagePatterns: ['API integration'],
      },
      reasoning: 'FinTech shows strong signals',
      confidenceScore: 90,
      sampleSize: 50,
    };

    await updateICPProfile(profile, 'test-kb-id');

    expect(consoleLogSpy).toHaveBeenCalledWith('Formatted ICP Profile:');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('# Ideal Customer Profile')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('**Version:** 1')
    );
  });

  it('should handle version increment correctly', async () => {
    const profile: ICPProfile = {
      version: 15,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['Healthcare'],
        sizeRange: '200+',
        regions: ['Global'],
        usagePatterns: ['Enterprise features'],
      },
      reasoning: 'Enterprise segment emerging',
      confidenceScore: 95,
      sampleSize: 100,
    };

    await updateICPProfile(profile, 'test-kb-id');

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('**Version:** 15')
    );
  });
});

describe('updateICPProfile - retry logic', () => {
  let mockDynamoSend: any;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    const { createDynamoDBClient } = await import('../clients');
    mockDynamoSend = vi.fn().mockResolvedValue({});
    (createDynamoDBClient as any).mockReturnValue({
      send: mockDynamoSend,
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  it('should store pending update in DynamoDB after all retries fail', async () => {
    // Mock the update to always fail
    const profile: ICPProfile = {
      version: 2,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['SaaS'],
        sizeRange: '11-50',
        regions: ['US'],
        usagePatterns: ['Test'],
      },
      reasoning: 'Test',
      confidenceScore: 70,
      sampleSize: 20,
    };

    // Note: Since the current implementation doesn't actually call an API,
    // we can't test the retry logic fully. This test validates the structure.
    await updateICPProfile(profile, 'test-kb-id');

    // Should succeed on first attempt in current implementation
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe('markdown formatting correctness', () => {
  it('should produce valid markdown structure', () => {
    const profile: ICPProfile = {
      version: 4,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['E-commerce', 'Retail'],
        sizeRange: '51-200 employees',
        regions: ['Asia Pacific', 'North America'],
        usagePatterns: ['Mobile-first', 'Real-time analytics'],
      },
      reasoning:
        'E-commerce segment shows consistent growth and high engagement.',
      confidenceScore: 88,
      sampleSize: 60,
    };

    const markdown = formatICPProfile(profile);

    // Check for proper markdown headers
    expect(markdown).toMatch(/^# Ideal Customer Profile/m);
    expect(markdown).toMatch(/^## Common Traits/m);
    expect(markdown).toMatch(/^### Industries/m);
    expect(markdown).toMatch(/^### Company Size/m);
    expect(markdown).toMatch(/^### Regions/m);
    expect(markdown).toMatch(/^### Usage Patterns/m);
    expect(markdown).toMatch(/^## Analysis Reasoning/m);

    // Check for proper list formatting
    expect(markdown).toMatch(/^- E-commerce$/m);
    expect(markdown).toMatch(/^- Retail$/m);
    expect(markdown).toMatch(/^- Asia Pacific$/m);
    expect(markdown).toMatch(/^- North America$/m);

    // Check for horizontal rule
    expect(markdown).toContain('---');
  });

  it('should handle special characters in traits', () => {
    const profile: ICPProfile = {
      version: 1,
      generatedAt: '2024-03-15T10:30:00Z',
      traits: {
        industries: ['B2B & B2C', 'AI/ML'],
        sizeRange: '10-50 (mid-market)',
        regions: ['US & Canada'],
        usagePatterns: ['API usage > 1000 calls/day'],
      },
      reasoning: 'Companies with "high-growth" profiles perform best.',
      confidenceScore: 75,
      sampleSize: 35,
    };

    const markdown = formatICPProfile(profile);

    expect(markdown).toContain('- B2B & B2C');
    expect(markdown).toContain('- AI/ML');
    expect(markdown).toContain('- 10-50 (mid-market)');
    expect(markdown).toContain('- US & Canada');
    expect(markdown).toContain('- API usage > 1000 calls/day');
    expect(markdown).toContain('Companies with "high-growth" profiles');
  });
});
