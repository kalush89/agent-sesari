/**
 * SkeletonLoader Component Tests
 * 
 * Tests for the SkeletonLoader component including:
 * - Skeleton card rendering
 * - Layout matching actual insight cards
 * - Animation classes
 * - Sesari color palette usage
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkeletonLoader } from '../SkeletonLoader';

describe('SkeletonLoader', () => {
  describe('Rendering', () => {
    it('should render skeleton loader', () => {
      const { container } = render(<SkeletonLoader />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should render header skeleton', () => {
      const { container } = render(<SkeletonLoader />);

      const header = container.querySelector('.bg-card.border-b');
      expect(header).toBeInTheDocument();
    });

    it('should render main content area', () => {
      const { container } = render(<SkeletonLoader />);

      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();
    });

    it('should render exactly 3 skeleton cards', () => {
      const { container } = render(<SkeletonLoader />);

      const cards = container.querySelectorAll('article.bg-card');
      expect(cards.length).toBe(3);
    });
  });

  describe('Header Skeleton', () => {
    it('should render date skeleton', () => {
      const { container } = render(<SkeletonLoader />);

      const dateSkeleton = container.querySelector('.h-8.w-64');
      expect(dateSkeleton).toBeInTheDocument();
    });

    it('should render insight count skeleton', () => {
      const { container } = render(<SkeletonLoader />);

      const countSkeleton = container.querySelector('.h-4.w-24');
      expect(countSkeleton).toBeInTheDocument();
    });

    it('should render navigation button skeletons', () => {
      const { container } = render(<SkeletonLoader />);

      const buttonSkeletons = container.querySelectorAll('.h-10');
      expect(buttonSkeletons.length).toBeGreaterThanOrEqual(3);
    });

    it('should have animate-pulse on header elements', () => {
      const { container } = render(<SkeletonLoader />);

      const dateSkeleton = container.querySelector('.h-8.w-64');
      expect(dateSkeleton?.className).toContain('animate-pulse');
    });
  });

  describe('Card Skeleton Structure', () => {
    it('should render narrative text skeleton lines', () => {
      const { container } = render(<SkeletonLoader />);

      const firstCard = container.querySelector('article.bg-card');
      const textLines = firstCard?.querySelectorAll('.h-4');
      
      expect(textLines && textLines.length).toBeGreaterThanOrEqual(3);
    });

    it('should render thought trace toggle skeleton', () => {
      const { container } = render(<SkeletonLoader />);

      const firstCard = container.querySelector('article.bg-card');
      const toggleSkeleton = firstCard?.querySelector('.h-5.w-16');
      
      expect(toggleSkeleton).toBeInTheDocument();
    });

    it('should render growth play button skeleton', () => {
      const { container } = render(<SkeletonLoader />);

      const firstCard = container.querySelector('article.bg-card');
      const buttonSkeleton = firstCard?.querySelector('.h-10.w-36');
      
      expect(buttonSkeleton).toBeInTheDocument();
    });

    it('should have proper spacing between elements', () => {
      const { container } = render(<SkeletonLoader />);

      const firstCard = container.querySelector('article.bg-card');
      const spacedElements = firstCard?.querySelectorAll('.mb-4');
      
      expect(spacedElements && spacedElements.length).toBeGreaterThan(0);
    });
  });

  describe('Animation', () => {
    it('should have animate-pulse class on all skeleton elements', () => {
      const { container } = render(<SkeletonLoader />);

      const skeletonElements = container.querySelectorAll('.bg-muted\\/20');
      
      skeletonElements.forEach(element => {
        expect(element.className).toContain('animate-pulse');
      });
    });

    it('should use muted color with opacity for skeleton elements', () => {
      const { container } = render(<SkeletonLoader />);

      const skeletonElements = container.querySelectorAll('.bg-muted\\/20');
      
      expect(skeletonElements.length).toBeGreaterThan(0);
      skeletonElements.forEach(element => {
        expect(element.className).toContain('bg-muted/20');
      });
    });
  });

  describe('Layout Matching', () => {
    it('should match InsightCard layout with rounded corners', () => {
      const { container } = render(<SkeletonLoader />);

      const cards = container.querySelectorAll('article.bg-card');
      
      cards.forEach(card => {
        expect(card.className).toContain('rounded-lg');
      });
    });

    it('should match InsightCard padding', () => {
      const { container } = render(<SkeletonLoader />);

      const cards = container.querySelectorAll('article.bg-card');
      
      cards.forEach(card => {
        expect(card.className).toContain('p-4');
      });
    });

    it('should match InsightCard border styling', () => {
      const { container } = render(<SkeletonLoader />);

      const cards = container.querySelectorAll('article.bg-card');
      
      cards.forEach(card => {
        expect(card.className).toContain('border');
        expect(card.className).toContain('border-border');
      });
    });

    it('should match InsightCard shadow', () => {
      const { container } = render(<SkeletonLoader />);

      const cards = container.querySelectorAll('article.bg-card');
      
      cards.forEach(card => {
        expect(card.className).toContain('shadow-sm');
      });
    });

    it('should use same container width as actual page', () => {
      const { container } = render(<SkeletonLoader />);

      const mainContainer = container.querySelector('.max-w-3xl');
      expect(mainContainer).toBeInTheDocument();
    });

    it('should use same spacing between cards', () => {
      const { container } = render(<SkeletonLoader />);

      const cardContainer = container.querySelector('.space-y-6');
      expect(cardContainer).toBeInTheDocument();
    });
  });

  describe('Sesari Color Palette', () => {
    it('should use background color from theme', () => {
      const { container } = render(<SkeletonLoader />);

      const wrapper = container.querySelector('.bg-background');
      expect(wrapper).toBeInTheDocument();
    });

    it('should use card color from theme', () => {
      const { container } = render(<SkeletonLoader />);

      const cards = container.querySelectorAll('.bg-card');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should use border color from theme', () => {
      const { container } = render(<SkeletonLoader />);

      const borders = container.querySelectorAll('.border-border');
      expect(borders.length).toBeGreaterThan(0);
    });

    it('should use muted color for skeleton elements', () => {
      const { container } = render(<SkeletonLoader />);

      const mutedElements = container.querySelectorAll('.bg-muted\\/20');
      expect(mutedElements.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Design', () => {
    it('should have full height', () => {
      const { container } = render(<SkeletonLoader />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('min-h-screen');
    });

    it('should have proper horizontal padding', () => {
      const { container } = render(<SkeletonLoader />);

      const mainContainer = container.querySelector('main');
      expect(mainContainer?.className).toContain('px-6');
    });

    it('should have proper vertical padding', () => {
      const { container } = render(<SkeletonLoader />);

      const mainContainer = container.querySelector('main');
      expect(mainContainer?.className).toContain('py-8');
    });

    it('should center content horizontally', () => {
      const { container } = render(<SkeletonLoader />);

      const mainContainer = container.querySelector('main');
      expect(mainContainer?.className).toContain('mx-auto');
    });
  });

  describe('Narrative Text Skeleton', () => {
    it('should render multiple lines with varying widths', () => {
      const { container } = render(<SkeletonLoader />);

      const firstCard = container.querySelector('article.bg-card');
      const fullWidth = firstCard?.querySelector('.w-full');
      const partialWidth1 = firstCard?.querySelector('.w-5\\/6');
      const partialWidth2 = firstCard?.querySelector('.w-4\\/6');
      
      expect(fullWidth).toBeInTheDocument();
      expect(partialWidth1).toBeInTheDocument();
      expect(partialWidth2).toBeInTheDocument();
    });

    it('should have proper spacing between text lines', () => {
      const { container } = render(<SkeletonLoader />);

      const firstCard = container.querySelector('article.bg-card');
      const textContainer = firstCard?.querySelector('.space-y-2');
      
      expect(textContainer).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should render without errors', () => {
      expect(() => render(<SkeletonLoader />)).not.toThrow();
    });

    it('should be a valid React component', () => {
      const { container } = render(<SkeletonLoader />);
      
      expect(container.firstChild).toBeTruthy();
    });

    it('should not have any interactive elements', () => {
      const { container } = render(<SkeletonLoader />);

      const buttons = container.querySelectorAll('button');
      const links = container.querySelectorAll('a');
      const inputs = container.querySelectorAll('input');
      
      expect(buttons.length).toBe(0);
      expect(links.length).toBe(0);
      expect(inputs.length).toBe(0);
    });
  });
});
