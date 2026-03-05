# Implementation Plan: Daily Briefing Generator

## Overview

This plan implements the Daily Briefing Generator feature, which transforms raw business signals into a narrative-driven morning summary. The system runs automatically at 8:00 AM UTC via EventBridge, retrieves signals from the past 24 hours, prioritizes them by business impact, generates human-readable narratives using Amazon Nova Lite, and presents them in a clean editorial UI with theme switching support.

The implementation follows a bottom-up approach: core backend logic first, then storage and infrastructure, followed by frontend components. Each task builds incrementally with checkpoints to validate functionality.

## Tasks

- [x] 1. Set up project structure and core types
  - Create `packages/lambdas/briefing-generator` directory structure
  - Define TypeScript interfaces for Insight, Briefing, ThoughtTrace, and GrowthPlay
  - Set up package.json with dependencies (AWS SDK v3, Bedrock Runtime, Vitest, fast-check)
  - Configure tsconfig.json for Node.js 20.x target
  - Create .env.example with required environment variables
  - _Requirements: 1.1, 3.1, 4.1_

- [x] 2. Implement signal retrieval and prioritization
  - [x] 2.1 Implement signal retrieval from DynamoDB
    - Write `retrieveSignals()` function to query UniversalSignals table
    - Query all three categories (revenue, relationship, behavioral) using CategoryIndex
    - Filter signals by time range (past 24 hours)
    - Handle empty results gracefully
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 2.2 Write property test for signal retrieval time window
    - **Property 1: Signal Retrieval Time Window**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 2.3 Implement signal prioritization algorithm
    - Write `prioritizeSignals()` function with severity weights (critical=10, high=5, medium=3, low=1)
    - Calculate priority score combining severity, recency, and impact factors
    - Sort signals by priority score descending
    - Return top 10 signals
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 2.4 Write property tests for signal prioritization
    - **Property 2: Signal Prioritization Ordering**
    - **Property 3: Prioritization Result Limit**
    - **Validates: Requirements 2.1-2.6, 12.2**

  - [x] 2.5 Write unit tests for prioritization edge cases
    - Test empty signal list
    - Test single signal
    - Test exactly 10 signals
    - Test signals with same severity but different timestamps
    - _Requirements: 2.1-2.6_

- [x] 3. Checkpoint - Verify signal retrieval and prioritization
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement narrative generation engine
  - [x] 4.1 Implement Bedrock integration for narrative generation
    - Write `generateNarrative()` function using Amazon Nova Lite
    - Construct prompts with signal data (entity, event, severity, metrics)
    - Parse Bedrock API responses
    - Implement retry logic (once after 10 seconds)
    - _Requirements: 3.1, 3.2, 11.3_

  - [x] 4.2 Implement template-based fallback narrative generator
    - Write `generateTemplateNarrative()` function for AI failures
    - Create templates for common event types (expansion, churn, engagement_gap, power_user)
    - Format entity names and metrics appropriately
    - _Requirements: 11.2, 11.4_

  - [x] 4.3 Implement metric formatting utilities
    - Write `formatMetrics()` function for prompt construction
    - Format currency values in USD with two decimal places
    - Format behavioral metrics with frequency and engagement scores
    - _Requirements: 3.5, 3.6_

  - [x] 4.4 Implement growth play determination logic
    - Write `determineGrowthPlay()` function to create action buttons
    - Map revenue signals to customer detail pages
    - Map relationship signals to HubSpot external links
    - Map behavioral signals to user activity pages
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 4.5 Write property tests for narrative generation
    - **Property 4: Narrative Generation Completeness**
    - **Property 5: Narrative Word Limit**
    - **Property 6: Revenue Signal Currency Formatting**
    - **Property 7: Behavioral Signal Content**
    - **Property 14: Growth Play Label Presence**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 8.1**

  - [x] 4.6 Write unit tests for narrative generation
    - Test Bedrock API success case
    - Test Bedrock API failure with fallback
    - Test retry logic
    - Test template generation for each event type
    - _Requirements: 3.1, 11.2, 11.3, 11.4_

- [x] 5. Checkpoint - Verify narrative generation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement briefing construction and storage
  - [x] 6.1 Implement briefing construction logic
    - Write `constructBriefing()` function to assemble insights into briefing
    - Calculate metadata (signal count, priority level, category counts)
    - Determine overall priority level based on insight severities
    - Generate briefing date in YYYY-MM-DD format
    - _Requirements: 4.1, 4.4_

  - [x] 6.2 Implement compression utilities
    - Write `compressContent()` function using gzip
    - Write `decompressContent()` function for retrieval
    - Handle compression failures gracefully (store uncompressed)
    - _Requirements: 4.5_

  - [ ]* 6.3 Write property test for compression round-trip
    - **Property 10: Briefing Compression Round-Trip**
    - **Validates: Requirements 4.5**

  - [x] 6.4 Implement DynamoDB storage for briefings
    - Write `storeBriefing()` function to save to Briefings table
    - Use key format: PK=`briefing#{userId}`, SK=`date#{YYYY-MM-DD}`
    - Set TTL to 90 days from generation timestamp
    - Compress content before storage
    - Include metadata attributes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 6.5 Write property tests for briefing storage
    - **Property 8: Briefing Storage Round-Trip**
    - **Property 9: Briefing TTL Configuration**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [x] 6.6 Write unit tests for briefing storage
    - Test successful storage
    - Test DynamoDB write failure with retry
    - Test compression failure fallback
    - Test TTL calculation
    - _Requirements: 4.1-4.5, 11.1_

- [x] 7. Implement Lambda handler and error handling
  - [x] 7.1 Implement main Lambda handler function
    - Write `handler()` function for EventBridge trigger
    - Orchestrate signal retrieval, prioritization, narrative generation, and storage
    - Log execution metrics (duration, signal count, insight count)
    - Handle errors with appropriate logging
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 7.2 Implement error handling and logging
    - Add try-catch blocks for each major operation
    - Log errors with context (query parameters, signal data)
    - Implement retry logic for transient failures
    - Return appropriate error responses
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 7.3 Write integration tests for Lambda handler
    - Test complete flow from trigger to storage
    - Test error scenarios (DynamoDB failure, Bedrock failure)
    - Test empty signal list handling
    - Test retry logic
    - _Requirements: 1.1-1.5, 11.1-11.5_

- [x] 8. Checkpoint - Verify backend implementation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Set up DynamoDB table and infrastructure
  - [x] 9.1 Create DynamoDB table setup script
    - Write `infrastructure/setup-dynamodb.ts` to create Briefings table
    - Configure primary key (PK, SK)
    - Enable TTL on `ttl` attribute
    - Set billing mode to On-Demand
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 9.2 Create Lambda deployment script
    - Write `infrastructure/deploy-lambda.ts` to package and deploy function
    - Configure environment variables
    - Set memory to 512MB and timeout to 30 seconds
    - Attach IAM role with required permissions
    - _Requirements: 1.4, 12.5_

  - [x] 9.3 Create EventBridge scheduler setup script
    - Write `infrastructure/setup-eventbridge.ts` to create daily trigger
    - Configure cron expression for 8:00 AM UTC
    - Set Lambda as target
    - Configure retry policy (2 attempts, 1 hour max age)
    - _Requirements: 1.1, 1.5_

  - [x] 9.4 Create infrastructure README
    - Document setup steps
    - Document deployment process
    - Document environment variables
    - Document IAM permissions required
    - _Requirements: All infrastructure requirements_

- [x] 10. Implement Next.js API route for briefing retrieval
  - [x] 10.1 Create API route for fetching briefings
    - Write `src/app/api/briefing/route.ts` with GET handler
    - Accept date query parameter (YYYY-MM-DD format)
    - Validate date format
    - Fetch briefing from DynamoDB
    - Decompress content
    - Return JSON response
    - _Requirements: 4.1, 4.2, 9.3_

  - [x] 10.2 Implement briefing fetch utility
    - Write `fetchBriefing()` function to query DynamoDB
    - Handle missing briefings (404 response)
    - Handle DynamoDB errors (500 response)
    - Decompress and parse briefing content
    - _Requirements: 4.1, 4.5, 11.6_

  - [x] 10.3 Write unit tests for API route
    - Test successful briefing fetch
    - Test invalid date format (400 response)
    - Test missing briefing (404 response)
    - Test DynamoDB error (500 response)
    - _Requirements: 9.3, 11.6_

- [x] 11. Checkpoint - Verify API route implementation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement theme context and utilities
  - [x] 12.1 Create theme context provider
    - Write `src/contexts/ThemeContext.tsx` with light/dark theme support
    - Implement `useTheme()` hook
    - Load theme from localStorage on mount
    - Persist theme changes to localStorage
    - Toggle `dark` class on document root
    - _Requirements: 5.1, 5.2_

  - [x] 12.2 Configure Tailwind theme colors
    - Update `tailwind.config.ts` with Sesari color palette
    - Define light theme colors (background #FAFAFA, primary #1A1A1A, growth #00C853, alert #FF3D00)
    - Define dark theme colors using CSS variables
    - Configure Inter/Geist font family
    - _Requirements: 5.1, 5.2, 6.1, 6.2_

  - [x] 12.3 Create global CSS with theme variables
    - Write `src/app/globals.css` with CSS custom properties
    - Define light theme variables in `:root`
    - Define dark theme variables in `.dark` class
    - Apply background and text colors to body
    - _Requirements: 5.1, 5.2_

  - [x] 12.4 Write unit tests for theme context
    - Test theme initialization from localStorage
    - Test theme toggle functionality
    - Test localStorage persistence
    - Test fallback when localStorage unavailable
    - _Requirements: 5.1, 5.2_

- [x] 13. Implement formatting utilities
  - [x] 13.1 Create date formatting utilities
    - Write `formatDateForDisplay()` function for "Monday, January 15, 2024" format
    - Write `formatRelativeTime()` function for "X hours ago" format
    - Handle edge cases (just now, 1 hour ago)
    - _Requirements: 5.3, 7.3_

  - [ ]* 13.2 Write property tests for formatting utilities
    - **Property 11: Date Formatting Consistency**
    - **Property 16: Relative Time Formatting**
    - **Validates: Requirements 5.3, 7.3**

  - [x] 13.3 Write unit tests for formatting utilities
    - Test various date formats
    - Test relative time for different hour ranges
    - Test edge cases (midnight, leap years)
    - _Requirements: 5.3, 7.3_

- [x] 14. Implement Insight Card component
  - [x] 14.1 Create InsightCard component
    - Write `src/components/briefing/InsightCard.tsx`
    - Display narrative text with proper styling
    - Show severity indicator dot for critical insights
    - Implement collapsible Thought Trace section with chevron icons
    - Display Growth Play button with proper styling
    - Handle button clicks (navigate or external)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 14.2 Implement Thought Trace display logic
    - Display source signals with system, event type, timestamp
    - Format timestamps as relative time
    - Display severity badges with appropriate colors
    - Limit display to 5 signals maximum
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 14.3 Write property tests for Thought Trace
    - **Property 12: Thought Trace Completeness**
    - **Property 13: Thought Trace Length Limit**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5**

  - [x] 14.4 Write unit tests for InsightCard
    - Test card rendering with all elements
    - Test severity indicator display
    - Test Thought Trace toggle
    - Test Growth Play button click (navigate and external)
    - Test accessibility attributes (ARIA labels)
    - _Requirements: 6.1-6.7, 7.1-7.5, 8.1-8.5, 13.2, 13.5_

- [x] 15. Implement supporting UI components
  - [x] 15.1 Create BriefingHeader component
    - Write `src/components/briefing/BriefingHeader.tsx`
    - Display formatted date
    - Show insight count
    - Include date picker for navigation
    - Add Previous/Next navigation buttons
    - Disable Next button when date is today
    - _Requirements: 5.3, 9.1, 9.2, 9.4, 9.5, 9.6, 9.7_

  - [x] 15.2 Create EmptyState component
    - Write `src/components/briefing/EmptyState.tsx`
    - Display "All quiet today" message for zero insights
    - Display welcome message for new users
    - Include "Connect Integration" button
    - _Requirements: 5.4, 10.1, 10.2, 10.3_

  - [x] 15.3 Create ErrorBanner component
    - Write `src/components/briefing/ErrorBanner.tsx`
    - Display error message
    - Include Retry button
    - Implement retry with exponential backoff
    - _Requirements: 11.5, 11.6_

  - [x] 15.4 Create SkeletonLoader component
    - Write `src/components/briefing/SkeletonLoader.tsx`
    - Display skeleton cards while loading
    - Match layout of actual insight cards
    - Use Sesari color palette
    - _Requirements: 5.6_

  - [x] 15.5 Write unit tests for supporting components
    - Test BriefingHeader rendering and navigation
    - Test EmptyState messages and button
    - Test ErrorBanner display and retry
    - Test SkeletonLoader rendering
    - _Requirements: 5.3, 5.4, 5.6, 9.1-9.7, 10.1-10.3, 11.5, 11.6_

- [x] 16. Checkpoint - Verify UI components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Implement main Briefing page
  - [x] 17.1 Create Briefing page component
    - Write `src/app/briefing/page.tsx`
    - Implement state management (briefing, loading, error, selectedDate)
    - Fetch briefing on mount and date change
    - Handle loading state with SkeletonLoader
    - Handle error state with ErrorBanner
    - Handle empty state with EmptyState
    - Render BriefingHeader and InsightCard components
    - Apply single-column layout with proper spacing
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 9.1, 9.2_

  - [x] 17.2 Implement briefing caching logic
    - Cache fetched briefings in component state
    - Serve cached version for same-day requests
    - Invalidate cache on date change
    - _Requirements: 12.3, 12.4_

  - [ ]* 17.3 Write property test for briefing caching
    - **Property 15: Briefing Caching Consistency**
    - **Validates: Requirements 12.3, 12.4**

  - [x] 17.4 Write unit tests for Briefing page
    - Test initial load with today's date
    - Test date navigation
    - Test loading state
    - Test error state with retry
    - Test empty state
    - Test caching behavior
    - _Requirements: 5.1-5.6, 9.1-9.7, 12.3, 12.4_

- [x] 18. Implement accessibility features
  - [x] 18.1 Add keyboard navigation support
    - Ensure all interactive elements are keyboard accessible
    - Add proper tab order
    - Handle Enter key for button activation
    - _Requirements: 13.1, 13.2_

  - [x] 18.2 Add ARIA labels and roles
    - Add ARIA labels to InsightCard elements
    - Add aria-expanded to Thought Trace toggle
    - Add aria-controls to link toggle with content
    - Add role attributes where appropriate
    - _Requirements: 13.2, 13.3_

  - [x] 18.3 Add screen reader announcements
    - Announce Thought Trace state changes
    - Announce insight count on page load
    - Add descriptive labels for all buttons
    - _Requirements: 13.3, 13.6_

  - [x] 18.4 Ensure color contrast and focus indicators
    - Verify Growth Play button contrast ratio (4.5:1 minimum)
    - Add 2px solid outline for focus indicators
    - Test with high contrast mode
    - _Requirements: 13.4, 13.5_

  - [x] 18.5 Write accessibility tests
    - Use axe-core for automated scanning
    - Test keyboard navigation
    - Test ARIA attributes
    - Test focus indicators
    - _Requirements: 13.1-13.6_

- [x] 19. Final checkpoint - Integration and deployment
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Create deployment documentation
  - [x] 20.1 Document backend deployment process
    - Create step-by-step deployment guide
    - Document environment variable configuration
    - Document IAM permissions setup
    - Document EventBridge scheduler configuration
    - Include verification steps
    - _Requirements: All backend requirements_

  - [x] 20.2 Document frontend deployment process
    - Document Next.js build process
    - Document environment variable configuration
    - Document Vercel deployment steps
    - Include verification steps
    - _Requirements: All frontend requirements_

  - [x] 20.3 Create README for briefing-generator package
    - Document feature overview
    - Document architecture
    - Document local development setup
    - Document testing approach
    - Include troubleshooting guide
    - _Requirements: All requirements_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout for type safety
- All AWS services are configured for Free Tier compliance
- Theme switching supports both light and dark modes following Sesari UI standards
