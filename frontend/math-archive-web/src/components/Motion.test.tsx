import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AnimatedCounter } from './AnimatedCounter';
import { ScrollToTop } from './ScrollToTop';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function motionPreference(reduced: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({ matches: reduced, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}

it('shows changed counts immediately without scheduling frames when motion is reduced', () => {
  motionPreference(true);
  const request = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  const view = render(<AnimatedCounter value={26} />);
  view.rerender(<AnimatedCounter value={8} />);
  expect(view.container.querySelector('[aria-hidden]')).toHaveTextContent('8');
  expect(request).not.toHaveBeenCalled();
});

it('counts only when the value changes and cancels frames on unmount', () => {
  motionPreference(false);
  let tick!: FrameRequestCallback;
  const request = vi.fn((callback: FrameRequestCallback) => { tick = callback; return 1; });
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const view = render(<AnimatedCounter value={26} />);
  view.rerender(<AnimatedCounter value={26} />);
  expect(request).not.toHaveBeenCalled();
  view.rerender(<AnimatedCounter value={undefined} />);
  expect(request).not.toHaveBeenCalled();
  view.rerender(<AnimatedCounter value={8} />);
  act(() => tick(0));
  act(() => tick(220));
  expect(view.container.querySelector('[aria-hidden]')).toHaveTextContent('8');
  view.unmount();
  expect(cancel).toHaveBeenCalled();
});

it('reveals scroll-to-top after scrolling and respects reduced motion', () => {
  motionPreference(true);
  vi.stubGlobal('scrollY', 0);
  vi.stubGlobal('scrollTo', vi.fn());
  render(<ScrollToTop />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  vi.stubGlobal('scrollY', 700);
  fireEvent.scroll(window);
  fireEvent.click(screen.getByRole('button', { name: 'Повернутися нагору' }));
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  vi.stubGlobal('scrollY', 0);
  fireEvent.scroll(window);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
