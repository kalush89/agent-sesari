# Theme Context

## Overview

The Theme Context provides light/dark theme switching functionality for the Sesari application, following the Sesari UI standards with the "Agentic Editorial" aesthetic.

## Usage

### 1. Wrap your app with ThemeProvider

```tsx
import { ThemeProvider } from '@/contexts/ThemeContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### 2. Use the useTheme hook in components

```tsx
import { useTheme } from '@/contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button onClick={toggleTheme}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
```

## Features

- **Light/Dark Theme Support**: Toggle between light and dark themes
- **localStorage Persistence**: Theme preference is saved and restored on page reload
- **Document Class Management**: Automatically applies 'dark' class to document root
- **Error Handling**: Gracefully handles localStorage unavailability
- **Type Safety**: Full TypeScript support

## Color Palette

### Light Theme
- Background: `#FAFAFA` (Off-white paper-like feel)
- Card: `#FFFFFF`
- Primary Text: `#1A1A1A` (Deep Charcoal)
- Muted Text: `#6B7280`
- Border: `#E5E7EB`
- Growth: `#00C853` (Emerald Green)
- Alert: `#FF3D00` (Deep Orange)
- Agent Brand: `#6B46C1` (Bedrock Purple)

### Dark Theme
- Background: `#0F0F0F`
- Card: `#1A1A1A`
- Primary Text: `#F5F5F5`
- Muted Text: `#9CA3AF`
- Border: `#2D2D2D`
- Growth: `#00C853` (Emerald Green)
- Alert: `#FF3D00` (Deep Orange)
- Agent Brand: `#8B5CF6` (Lighter Purple)

## Implementation Details

- Theme state is managed using React Context API
- Uses `useEffect` to load theme from localStorage on mount
- Prevents flash of unstyled content with mounted state check
- All theme colors are defined as CSS custom properties in `globals.css`
- Tailwind CSS v4 inline theme configuration for seamless integration
