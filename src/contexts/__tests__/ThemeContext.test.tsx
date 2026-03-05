import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';

// Test component that uses the theme hook
function TestComponent() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme} data-testid="toggle">
        Toggle
      </button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('should initialize with light theme by default', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme')).toBeDefined();
    });

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should load theme from localStorage on mount', async () => {
    localStorage.setItem('theme', 'dark');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme').textContent).toBe('dark');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should toggle theme from light to dark', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme')).toBeDefined();
    });

    const toggleButton = screen.getByTestId('toggle');
    
    act(() => {
      toggleButton.click();
    });

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should toggle theme from dark to light', async () => {
    localStorage.setItem('theme', 'dark');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme').textContent).toBe('dark');
    });

    const toggleButton = screen.getByTestId('toggle');
    
    act(() => {
      toggleButton.click();
    });

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should persist theme changes to localStorage', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme')).toBeDefined();
    });

    const toggleButton = screen.getByTestId('toggle');
    
    // Toggle to dark
    act(() => {
      toggleButton.click();
    });
    expect(localStorage.getItem('theme')).toBe('dark');

    // Toggle back to light
    act(() => {
      toggleButton.click();
    });
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('should handle invalid localStorage values gracefully', async () => {
    localStorage.setItem('theme', 'invalid-theme');

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme')).toBeDefined();
    });

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should throw error when useTheme is used outside ThemeProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useTheme must be used within ThemeProvider');

    consoleError.mockRestore();
  });

  it('should handle localStorage unavailable gracefully', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('theme')).toBeDefined();
    });

    expect(screen.getByTestId('theme').textContent).toBe('light');

    getItemSpy.mockRestore();
    consoleWarn.mockRestore();
  });
});
