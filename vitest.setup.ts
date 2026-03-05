import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Note: @testing-library/jest-dom matchers are temporarily disabled
// due to compatibility issues with the current vitest setup.
// Tests will use basic vitest matchers instead.

// Cleanup after each test
afterEach(() => {
  cleanup();
});
