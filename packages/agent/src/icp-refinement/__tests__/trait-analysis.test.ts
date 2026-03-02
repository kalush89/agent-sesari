/**
 * Unit tests for trait analysis engine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  constructTraitAnalysisPrompt,
  analyzeTraits,
  fallbackTraitAnalysis,
  isLowConfidence,
  analyzeTraitsWithFallback
} from '../trait-analysis';
import { MaskedCustomer, ICPProfile, TraitAnalysisOutput } from '../types';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Mock AWS SDK
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(),
  InvokeModelCommand: vi.fn()
}));

describe('constructTraitAnalysisPrompt', () => {
  const mockCustomers: MaskedCustomer[] = [
    {
      companyId: 'c1',
      industry: 'Finance',
      employeeCount: 50,
      region: 'US',
      ltvBucket: 'High',
      engagementBucket: 'High',
      retentionBucket: 'High',
      idealCustomerScore: 95
    },
    {
      companyId: 'c2',
      industry: 'Finance',
      employeeCount: 100,
      region: 'US',
      ltvBucket: 'High',
      engagementBucket: 'Medium',
      retentionBucket: 'High',
      idealCustomerScore: 90
    }
  ];

  it('should construct prompt without previous ICP', () => {
    const prompt = constructTraitAnalysisPrompt(mockCustomers, null);
    
    expect(prompt).toContain('top 10% of high-value B2B SaaS customers');
    expect(prompt).toContain('2 customers');
    expect(prompt).toContain('Finance');
    expect(prompt).toContain('No previous ICP profile exists');
    expect(prompt).toContain('commonTraits');
    expect(prompt).toContain('confidenceScore');
  });

  it('should construct prompt with previous ICP', () => {
    const previousICP: ICPProfile = {
      version: 1,
      generatedAt: '2024-01-01',
      traits: {
        industries: ['Tech'],
        sizeRange: '10-50 employees',
        regions: ['EU'],
        usagePatterns: ['Low engagement']
      },
      reasoning: 'Previous analysis focused on Tech',
      confidenceScore: 70,
      sampleSize: 20
    };

    const prompt = constructTraitAnalysisPrompt(mockCustomers, previousICP);
    
    expect(prompt).toContain('Previous ICP Profile (Version 1)');
    expect(prompt).toContain('Tech');
    expect(prompt).toContain('Previous analysis focused on Tech');
    expect(prompt).toContain('what has changed');
  });

  it('should include customer data as JSON', () => {
    const prompt = constructTraitAnalysisPrompt(mockCustomers, null);
    
    expect(prompt).toContain('"companyId": "c1"');
    expect(prompt).toContain('"industry": "Finance"');
    expect(prompt).toContain('"idealCustomerScore": 95');
  });

  it('should request specific trait categories', () => {
    const prompt = constructTraitAnalysisPrompt(mockCustomers, null);
    
    expect(prompt).toContain('industries');
    expect(prompt).toContain('company size range');
    expect(prompt).toContain('geographic concentration');
    expect(prompt).toContain('usage patterns');
  });

  it('should request confidence score', () => {
    const prompt = constructTraitAnalysisPrompt(mockCustomers, null);
    
    expect(prompt).toContain('confidence score');
    expect(prompt).toContain('0-100');
  });
});

describe('fallbackTraitAnalysis', () => {
  it('should calculate mode for industry', () => {
    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 },
      { companyId: 'c2', industry: 'Finance', employeeCount: 60, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 90 },
      { companyId: 'c3', industry: 'Tech', employeeCount: 40, region: 'EU', ltvBucket: 'Medium', engagementBucket: 'Medium', retentionBucket: 'Medium', idealCustomerScore: 80 }
    ];

    const result = fallbackTraitAnalysis(customers);
    
    expect(result.commonTraits.industries).toContain('Finance');
    expect(result.confidenceScore).toBe(40);
  });

  it('should calculate mode for region', () => {
    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 },
      { companyId: 'c2', industry: 'Tech', employeeCount: 60, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 90 },
      { companyId: 'c3', industry: 'Retail', employeeCount: 40, region: 'EU', ltvBucket: 'Medium', engagementBucket: 'Medium', retentionBucket: 'Medium', idealCustomerScore: 80 }
    ];

    const result = fallbackTraitAnalysis(customers);
    
    expect(result.commonTraits.regions).toContain('US');
  });

  it('should calculate median for size range', () => {
    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 10, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 },
      { companyId: 'c2', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 90 },
      { companyId: 'c3', industry: 'Finance', employeeCount: 100, region: 'US', ltvBucket: 'Medium', engagementBucket: 'Medium', retentionBucket: 'Medium', idealCustomerScore: 80 }
    ];

    const result = fallbackTraitAnalysis(customers);
    
    expect(result.commonTraits.sizeRange).toBe('11-50 employees');
  });

  it('should identify high engagement pattern', () => {
    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 },
      { companyId: 'c2', industry: 'Finance', employeeCount: 60, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 90 }
    ];

    const result = fallbackTraitAnalysis(customers);
    
    expect(result.commonTraits.usagePatterns).toContain('High product engagement');
  });

  it('should identify high retention pattern', () => {
    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'Medium', retentionBucket: 'High', idealCustomerScore: 95 },
      { companyId: 'c2', industry: 'Finance', employeeCount: 60, region: 'US', ltvBucket: 'High', engagementBucket: 'Medium', retentionBucket: 'High', idealCustomerScore: 90 }
    ];

    const result = fallbackTraitAnalysis(customers);
    
    expect(result.commonTraits.usagePatterns).toContain('Strong retention');
  });

  it('should handle varied usage patterns', () => {
    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'Low', retentionBucket: 'Low', idealCustomerScore: 95 },
      { companyId: 'c2', industry: 'Finance', employeeCount: 60, region: 'US', ltvBucket: 'High', engagementBucket: 'Medium', retentionBucket: 'Medium', idealCustomerScore: 90 }
    ];

    const result = fallbackTraitAnalysis(customers);
    
    expect(result.commonTraits.usagePatterns).toContain('Varied usage patterns');
  });

  it('should mark analysis as degraded', () => {
    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
    ];

    const result = fallbackTraitAnalysis(customers);
    
    expect(result.reasoning).toContain('Fallback heuristic analysis');
    expect(result.reasoning).toContain('degraded');
    expect(result.changeFromPrevious).toContain('Unable to compare');
  });

  it('should handle empty industries gracefully', () => {
    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: '', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
    ];

    const result = fallbackTraitAnalysis(customers);
    
    expect(result.commonTraits.industries).toBeDefined();
    expect(result.commonTraits.industries.length).toBeGreaterThan(0);
  });

  it('should handle size ranges correctly', () => {
    const testCases = [
      { employeeCount: 5, expected: '1-10 employees' },
      { employeeCount: 25, expected: '11-50 employees' },
      { employeeCount: 100, expected: '51-200 employees' },
      { employeeCount: 500, expected: '200+ employees' }
    ];

    testCases.forEach(({ employeeCount, expected }) => {
      const customers: MaskedCustomer[] = [
        { companyId: 'c1', industry: 'Tech', employeeCount, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
      ];

      const result = fallbackTraitAnalysis(customers);
      expect(result.commonTraits.sizeRange).toBe(expected);
    });
  });
});

describe('isLowConfidence', () => {
  it('should return true for confidence < 50', () => {
    const analysis: TraitAnalysisOutput = {
      commonTraits: {
        industries: ['Finance'],
        sizeRange: '10-50',
        regions: ['US'],
        usagePatterns: ['High engagement']
      },
      reasoning: 'Test',
      confidenceScore: 40,
      changeFromPrevious: 'N/A'
    };

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    expect(isLowConfidence(analysis)).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Low confidence score detected: 40')
    );
    
    consoleSpy.mockRestore();
  });

  it('should return false for confidence >= 50', () => {
    const analysis: TraitAnalysisOutput = {
      commonTraits: {
        industries: ['Finance'],
        sizeRange: '10-50',
        regions: ['US'],
        usagePatterns: ['High engagement']
      },
      reasoning: 'Test',
      confidenceScore: 75,
      changeFromPrevious: 'N/A'
    };

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    expect(isLowConfidence(analysis)).toBe(false);
    expect(consoleSpy).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('should return false for confidence exactly 50', () => {
    const analysis: TraitAnalysisOutput = {
      commonTraits: {
        industries: ['Finance'],
        sizeRange: '10-50',
        regions: ['US'],
        usagePatterns: ['High engagement']
      },
      reasoning: 'Test',
      confidenceScore: 50,
      changeFromPrevious: 'N/A'
    };

    expect(isLowConfidence(analysis)).toBe(false);
  });
});

describe('analyzeTraits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_REGION = 'us-east-1';
    process.env.NOVA_MODEL_ID = 'amazon.nova-lite-v1:0';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw error if NOVA_MODEL_ID is missing', async () => {
    delete process.env.NOVA_MODEL_ID;

    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
    ];

    await expect(analyzeTraits(customers, null)).rejects.toThrow('NOVA_MODEL_ID environment variable is required');
  });

  it('should successfully parse Nova Lite response', async () => {
    const mockResponse = {
      content: [{
        text: JSON.stringify({
          commonTraits: {
            industries: ['Finance'],
            sizeRange: '10-50 employees',
            regions: ['US'],
            usagePatterns: ['High engagement']
          },
          reasoning: 'Finance companies show strong patterns',
          confidenceScore: 85,
          changeFromPrevious: 'N/A'
        })
      }]
    };

    const mockSend = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify(mockResponse))
    });

    vi.mocked(BedrockRuntimeClient).mockImplementation(() => ({
      send: mockSend
    } as any));

    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
    ];

    const result = await analyzeTraits(customers, null);

    expect(result.commonTraits.industries).toContain('Finance');
    expect(result.confidenceScore).toBe(85);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should retry once on failure with 5-second delay', async () => {
    const mockSend = vi.fn()
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{
            text: JSON.stringify({
              commonTraits: {
                industries: ['Finance'],
                sizeRange: '10-50',
                regions: ['US'],
                usagePatterns: ['High engagement']
              },
              reasoning: 'Test',
              confidenceScore: 80,
              changeFromPrevious: 'N/A'
            })
          }]
        }))
      });

    vi.mocked(BedrockRuntimeClient).mockImplementation(() => ({
      send: mockSend
    } as any));

    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
    ];

    const result = await analyzeTraits(customers, null);

    expect(result.confidenceScore).toBe(80);
    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 10000);

  it('should throw error after retry fails', async () => {
    const mockSend = vi.fn().mockRejectedValue(new Error('API Error'));

    vi.mocked(BedrockRuntimeClient).mockImplementation(() => ({
      send: mockSend
    } as any));

    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
    ];

    await expect(analyzeTraits(customers, null)).rejects.toThrow('Nova Lite analysis failed after retry');
    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 10000);
});

describe('analyzeTraitsWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_REGION = 'us-east-1';
    process.env.NOVA_MODEL_ID = 'amazon.nova-lite-v1:0';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return Nova Lite result on success', async () => {
    const mockResponse = {
      content: [{
        text: JSON.stringify({
          commonTraits: {
            industries: ['Finance'],
            sizeRange: '10-50 employees',
            regions: ['US'],
            usagePatterns: ['High engagement']
          },
          reasoning: 'Finance companies show strong patterns',
          confidenceScore: 85,
          changeFromPrevious: 'N/A'
        })
      }]
    };

    const mockSend = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify(mockResponse))
    });

    vi.mocked(BedrockRuntimeClient).mockImplementation(() => ({
      send: mockSend
    } as any));

    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
    ];

    const result = await analyzeTraitsWithFallback(customers, null);

    expect(result.confidenceScore).toBe(85);
    expect(result.reasoning).toContain('Finance companies');
  });

  it('should use fallback on Nova Lite failure', async () => {
    const mockSend = vi.fn().mockRejectedValue(new Error('API Error'));

    vi.mocked(BedrockRuntimeClient).mockImplementation(() => ({
      send: mockSend
    } as any));

    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 },
      { companyId: 'c2', industry: 'Finance', employeeCount: 60, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 90 }
    ];

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await analyzeTraitsWithFallback(customers, null);

    expect(result.confidenceScore).toBe(40);
    expect(result.reasoning).toContain('Fallback heuristic analysis');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Nova Lite analysis failed'),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  }, 10000);

  it('should check confidence on successful analysis', async () => {
    const mockResponse = {
      content: [{
        text: JSON.stringify({
          commonTraits: {
            industries: ['Finance'],
            sizeRange: '10-50 employees',
            regions: ['US'],
            usagePatterns: ['High engagement']
          },
          reasoning: 'Low confidence due to small sample',
          confidenceScore: 35,
          changeFromPrevious: 'N/A'
        })
      }]
    };

    const mockSend = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify(mockResponse))
    });

    vi.mocked(BedrockRuntimeClient).mockImplementation(() => ({
      send: mockSend
    } as any));

    const customers: MaskedCustomer[] = [
      { companyId: 'c1', industry: 'Finance', employeeCount: 50, region: 'US', ltvBucket: 'High', engagementBucket: 'High', retentionBucket: 'High', idealCustomerScore: 95 }
    ];

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await analyzeTraitsWithFallback(customers, null);

    expect(result.confidenceScore).toBe(35);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Low confidence score detected: 35')
    );

    consoleWarnSpy.mockRestore();
  });
});
