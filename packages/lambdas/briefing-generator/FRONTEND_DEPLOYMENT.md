# Daily Briefing Generator - Frontend Deployment Guide

## Overview

This guide covers the deployment of the Daily Briefing UI components in the Next.js application.

## Prerequisites

- Next.js application set up in `apps/web` or `src`
- Node.js 20.x installed
- Backend Lambda and DynamoDB deployed (see DEPLOYMENT.md)
- Vercel account (recommended) or alternative hosting

## Environment Variables

Add these variables to your Next.js environment:

### `.env.local` (Development)

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# DynamoDB Tables
BRIEFING_STORE_TABLE=Briefings

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Production Environment Variables

For Vercel or other hosting platforms:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<from_secrets>
AWS_SECRET_ACCESS_KEY=<from_secrets>
BRIEFING_STORE_TABLE=Briefings
NEXT_PUBLIC_API_URL=https://your-domain.com
```

## Step 1: Verify Component Installation

Ensure all briefing components are in place:

```bash
src/
├── app/
│   ├── briefing/
│   │   └── page.tsx
│   └── api/
│       └── briefing/
│           └── route.ts
├── components/
│   └── briefing/
│       ├── BriefingHeader.tsx
│       ├── InsightCard.tsx
│       ├── EmptyState.tsx
│       ├── ErrorBanner.tsx
│       └── SkeletonLoader.tsx
├── contexts/
│   └── ThemeContext.tsx
├── lib/
│   └── format.ts
└── types/
    └── briefing.ts
```

## Step 2: Configure Tailwind CSS

Ensure `tailwind.config.ts` includes the Sesari color palette:

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#FAFAFA',
        card: '#FFFFFF',
        primary: '#1A1A1A',
        muted: '#6B7280',
        border: '#E5E7EB',
        growth: '#00C853',
        'growth-hover': '#00A844',
        alert: '#FF3D00',
        agent: '#6B46C1',
      },
      fontFamily: {
        sans: ['Inter', 'Geist', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

## Step 3: Set Up Theme Provider

Wrap your app with the ThemeProvider in `src/app/layout.tsx`:

```typescript
import { ThemeProvider } from '@/contexts/ThemeContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

## Step 4: Install Dependencies

Install required dependencies:

```bash
cd apps/web  # or your Next.js root directory

# Install AWS SDK for API route
npm install @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb

# Install UI dependencies
npm install lucide-react

# Install testing dependencies (if not already installed)
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

## Step 5: Build and Test Locally

### Development Server

```bash
npm run dev
```

Visit `http://localhost:3000/briefing` to view the briefing page.

### Run Tests

```bash
# Run all tests
npm test

# Run briefing-specific tests
npm test -- src/components/briefing
npm test -- src/app/briefing

# Run with coverage
npm test -- --coverage
```

### Build for Production

```bash
npm run build
```

Verify the build completes without errors.

## Step 6: Deploy to Vercel

### Option A: Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Option B: GitHub Integration

1. Push code to GitHub repository
2. Connect repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy automatically on push to main branch

### Vercel Configuration

Create `vercel.json` in project root:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "env": {
    "AWS_REGION": "@aws-region",
    "AWS_ACCESS_KEY_ID": "@aws-access-key-id",
    "AWS_SECRET_ACCESS_KEY": "@aws-secret-access-key",
    "BRIEFING_STORE_TABLE": "Briefings"
  }
}
```

### Add Environment Variables in Vercel

1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Add the following variables:
   - `AWS_REGION`: `us-east-1`
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
   - `BRIEFING_STORE_TABLE`: `Briefings`

## Step 7: Alternative Deployment Options

### AWS Amplify

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify
amplify init

# Add hosting
amplify add hosting

# Deploy
amplify publish
```

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t briefing-generator-ui .
docker run -p 3000:3000 briefing-generator-ui
```

### Self-Hosted (PM2)

```bash
# Install PM2
npm install -g pm2

# Build application
npm run build

# Start with PM2
pm2 start npm --name "briefing-ui" -- start

# Save PM2 configuration
pm2 save

# Set up startup script
pm2 startup
```

## Step 8: Verification

### Test API Route

```bash
curl http://localhost:3000/api/briefing?date=2024-01-15
```

Expected response:
```json
{
  "date": "2024-01-15",
  "generatedAt": 1705305600000,
  "signalCount": 5,
  "insightCount": 3,
  "priorityLevel": "high",
  "insights": [...]
}
```

### Test Briefing Page

1. Navigate to `/briefing`
2. Verify skeleton loader appears while loading
3. Verify briefing displays with insights
4. Test date navigation (Previous/Next buttons)
5. Test date picker
6. Test Thought Trace toggle
7. Test Growth Play buttons
8. Test theme switching (if implemented)

### Test Error Handling

1. Disconnect from internet
2. Verify error banner appears
3. Click Retry button
4. Verify briefing loads after reconnection

### Test Empty States

1. Navigate to a date with no briefing
2. Verify "All quiet today" message appears
3. Test "Connect Integration" button (if new user)

## Monitoring and Analytics

### Vercel Analytics

Enable Vercel Analytics in `next.config.ts`:

```typescript
const nextConfig = {
  experimental: {
    analytics: true,
  },
};

export default nextConfig;
```

### Custom Analytics

Add analytics tracking to key interactions:

```typescript
// Track briefing views
analytics.track('briefing_viewed', {
  date: selectedDate,
  insightCount: briefing.insightCount,
});

// Track Growth Play clicks
analytics.track('growth_play_clicked', {
  label: growthPlay.label,
  action: growthPlay.action,
});
```

## Performance Optimization

### Enable Next.js Optimizations

In `next.config.ts`:

```typescript
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: [],
  },
  experimental: {
    optimizeCss: true,
  },
};

export default nextConfig;
```

### Implement Caching

The briefing page already implements client-side caching. For additional optimization:

1. Enable Next.js ISR (Incremental Static Regeneration)
2. Use SWR or React Query for data fetching
3. Implement service worker for offline support

### Lighthouse Scores

Target scores:
- Performance: 90+
- Accessibility: 100
- Best Practices: 100
- SEO: 90+

## Troubleshooting

### Issue: API route returns 500 error

**Solution**: Check AWS credentials and DynamoDB table access

```bash
# Test AWS credentials
aws sts get-caller-identity

# Test DynamoDB access
aws dynamodb describe-table --table-name Briefings
```

### Issue: Briefing page shows empty state

**Solution**: Verify backend Lambda has generated briefings

```bash
aws dynamodb scan --table-name Briefings --limit 5
```

### Issue: Theme not persisting

**Solution**: Check localStorage access and ThemeProvider setup

### Issue: Build fails with TypeScript errors

**Solution**: Run type checking and fix errors

```bash
npm run type-check
```

## Security Considerations

1. **API Route Security**: Implement authentication for API routes
2. **Environment Variables**: Never commit `.env.local` to version control
3. **CORS**: Configure CORS headers for API routes
4. **Rate Limiting**: Implement rate limiting for API endpoints
5. **CSP Headers**: Configure Content Security Policy

### Example API Route with Auth

```typescript
import { getServerSession } from 'next-auth';

export async function GET(request: Request) {
  const session = await getServerSession();
  
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Fetch briefing...
}
```

## Rollback Procedure

### Vercel Rollback

1. Go to Vercel Dashboard → Deployments
2. Find previous successful deployment
3. Click "Promote to Production"

### Manual Rollback

```bash
# Revert to previous commit
git revert HEAD

# Push to trigger redeployment
git push origin main
```

## Next Steps

After frontend deployment:
1. Set up monitoring and alerts
2. Configure custom domain
3. Enable HTTPS
4. Set up CI/CD pipeline
5. Implement user authentication
6. Add analytics tracking
