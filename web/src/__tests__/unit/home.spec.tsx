import { render, screen } from '@testing-library/react';
import Home from '../../app/page';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Set a default window.innerWidth
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  value: 1024,
});

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// Mock PostHog
jest.mock('posthog-js', () => ({
  capture: jest.fn(),
}));

// Mock components used in Home page
jest.mock('../../components/ui/hero', () => ({
  Hero: () => <div data-testid="hero">Hero Component</div>,
}));

jest.mock('../../components/ui/landing/feature', () => ({
  FeatureSection: () => <div data-testid="feature-section">Feature Section</div>,
}));

jest.mock('../../components/ui/landing/competition', () => ({
  CompetitionSection: () => <div data-testid="competition-section">Competition Section</div>,
}));

jest.mock('../../components/ui/landing/testimonials-section', () => ({
  TestimonialsSection: () => <div data-testid="testimonials-section">Testimonials Section</div>,
}));

jest.mock('../../components/ui/landing/cta-section', () => ({
  CTASection: () => <div data-testid="cta-section">CTA Section</div>,
}));

jest.mock('../../components/IDEDemo', () => ({
  __esModule: true,
  default: () => <div data-testid="ide-demo">IDE Demo</div>,
}));

// Mock decorative blocks
jest.mock('../../components/ui/decorative-blocks', () => ({
  DecorativeBlocks: ({ children }: { children: React.ReactNode }) => children,
  BlockColor: {
    CRTAmber: 'crt-amber',
    AcidMatrix: 'acid-matrix'
  }
}));

// Mock section component
jest.mock('../../components/ui/section', () => ({
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('Homepage', () => {
  it('renders the main components', () => {
    render(<Home />);

    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(screen.getAllByTestId('feature-section')).toHaveLength(3);
    expect(screen.getByTestId('competition-section')).toBeInTheDocument();
    expect(screen.getByTestId('testimonials-section')).toBeInTheDocument();
    expect(screen.getByTestId('cta-section')).toBeInTheDocument();
    expect(screen.getByTestId('ide-demo')).toBeInTheDocument();
  });
});
