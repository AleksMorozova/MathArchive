import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FiltersBar } from './FiltersBar';
import { MathBackground } from './MathBackground';
import { MathematicalScene } from './MathematicalScene';
import { useMotionResults } from '../hooks/useMotionResults';
import { useMaterialLayout } from '../hooks/useMaterialLayout';
import { useDownloadFeedback } from './DownloadFeedback';

const originalTransition = document.startViewTransition;
const originalAnimate = HTMLElement.prototype.animate;
afterEach(() => {
  cleanup();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: originalTransition });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: originalAnimate });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function preference(reduced: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && reduced,
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}

it.each([['Усі класи', ''], ...[5,6,7,8,9,10,11].map(grade => [`${grade} клас`, String(grade)]), ['Загальні', 'general']])('selects %s through the single dropdown', (label, value) => {
  const change = vi.fn();
  render(<FiltersBar compact filters={{ grade: value === 'general' ? '7' : 'general', page: 1, pageSize: 12 }} topics={[]} onChange={change} onClear={() => undefined}
    showSearch={false} showTopic={false} showDocumentType={false} />);
  expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Клас' }));
  expect(screen.getAllByRole('option')).toHaveLength(9);
  fireEvent.click(screen.getByRole('option', { name: label }));
  expect(change).toHaveBeenLastCalledWith({ grade: value });
});

it('keeps the layered composition without pointer frames under reduced motion', () => {
  preference(true);
  const request = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  const view = render(<div><MathBackground /></div>);
  expect(view.container.querySelectorAll('.math-depth')).toHaveLength(3);
  expect(view.container.querySelectorAll('.ambient-object')).toHaveLength(20);
  expect(view.container.querySelector('.mathematical-atmosphere')).toHaveAttribute('aria-hidden', 'true');
  fireEvent(view.container.firstElementChild!, new MouseEvent('pointermove', { bubbles: true, clientX: 400 }));
  expect(request).not.toHaveBeenCalled();
});

it('coalesces atmospheric pointer events and does not schedule an idle animation loop', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: query.includes('pointer: fine'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  let tick!: FrameRequestCallback;
  const request = vi.fn((callback: FrameRequestCallback) => { tick = callback; return 23; });
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const view = render(<div><MathBackground /></div>);
  const surface = view.container.firstElementChild!;
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
  const move = () => fireEvent(surface, new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 200 }));
  move(); move();
  expect(request).toHaveBeenCalledTimes(1);
  act(() => tick(0));
  const atmosphere = view.container.querySelector<HTMLElement>('.mathematical-atmosphere')!;
  expect(atmosphere.style.getPropertyValue('--math-x')).toBe('1');
  expect(request).toHaveBeenCalledTimes(1);
  move();
  view.unmount();
  expect(cancel).toHaveBeenCalledWith(23);
  expect(atmosphere.style.getPropertyValue('--math-x')).toBe('');
});

it('changes the mathematical scene without replacing its axes or exposing decorations to assistive technology', () => {
  preference(true);
  const view = render(<MathematicalScene grade={7} />);
  const axes = view.container.querySelector('.scene-axes');
  expect(view.container.querySelector('.scene-active')).toHaveTextContent('y = kx + b');
  view.rerender(<MathematicalScene grade={11} />);
  expect(view.container.querySelector('.scene-axes')).toBe(axes);
  expect(view.container.querySelector('.scene-active')).toHaveTextContent('V = abc');
  expect(view.container.firstChild).toHaveAttribute('aria-hidden', 'true');
});

function Results({ value }: { value?: string }) {
  const visible = useMotionResults(value);
  return <span>{visible}</span>;
}

it('keeps the previous result during loading and transitions only fresh results', async () => {
  preference(false);
  const skip = vi.fn();
  const transition = vi.fn((update: () => void) => { update(); return { finished: Promise.resolve(), skipTransition: skip }; });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: transition });
  const view = render(<Results value="first" />);
  view.rerender(<Results value={undefined} />);
  expect(screen.getByText('first')).toBeInTheDocument();
  expect(transition).not.toHaveBeenCalled();
  await act(async () => { view.rerender(<Results value="second" />); });
  expect(screen.getByText('second')).toBeInTheDocument();
  expect(transition).toHaveBeenCalledTimes(1);
  view.rerender(<Results value="second" />);
  expect(transition).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(skip).toHaveBeenCalled();
});

it('updates results without snapshots when reduced motion is enabled', async () => {
  preference(true);
  const transition = vi.fn();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: transition });
  const view = render(<Results value="first" />);
  await act(async () => { view.rerender(<Results value="second" />); });
  expect(screen.getByText('second')).toBeInTheDocument();
  expect(transition).not.toHaveBeenCalled();
});

it('cancels a queued result commit on unmount', async () => {
  preference(false);
  const transition = vi.fn();
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: transition });
  const view = render(<Results value="first" />);
  view.rerender(<Results value="second" />);
  view.unmount();
  await act(async () => { await Promise.resolve(); });
  expect(transition).not.toHaveBeenCalled();
});

it('moves remaining cards, makes exiting copies inert, and cancels fallback animations on unmount', () => {
  preference(false);
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ finished: new Promise(() => undefined), cancel }));
  const originalAnimate = HTMLElement.prototype.animate;
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = this.dataset.materialMotion ? [...this.parentElement!.children].indexOf(this) : 0;
    return { left: index * 100, top: 0, width: this.dataset.materialMotion ? 100 : 300, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON: () => ({}) };
  });
  function Grid({ items }: { items: string[] }) {
    const ref = useMaterialLayout(items);
    return <div ref={ref}>{items.map(id => <div key={id} data-material-motion={id}><button>{id}</button></div>)}</div>;
  }
  const view = render(<Grid items={['a', 'b']} />);
  view.rerender(<Grid items={['b']} />);
  expect(animate).toHaveBeenCalledWith([{ transform: 'translate(100px, 0px)' }, { transform: 'translate(0, 0)' }], expect.objectContaining({ duration: 320 }));
  const ghost = view.container.querySelector<HTMLElement>('.material-exit-ghost');
  expect(ghost).toHaveAttribute('aria-hidden', 'true');
  expect(ghost?.inert).toBe(true);
  expect(screen.queryByRole('button', { name: 'a' })).not.toBeInTheDocument();
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: originalAnimate });
});

it('bounds desktop pointer movement and removes listeners and pending frames on unmount', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({ matches: query.includes('pointer: fine'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  let tick!: FrameRequestCallback;
  const request = vi.fn((callback: FrameRequestCallback) => { tick = callback; return 17; });
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const view = render(<div><MathematicalScene /></div>);
  const surface = view.container.firstElementChild!;
  const scene = view.container.querySelector<HTMLElement>('.living-math-scene')!;
  fireEvent(surface, new MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 300 }));
  act(() => tick(0));
  expect(scene.style.getPropertyValue('--scene-x')).toBe('2px');
  fireEvent(surface, new MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 300 }));
  view.unmount();
  expect(cancel).toHaveBeenCalledWith(17);
  expect(scene.style.getPropertyValue('--scene-x')).toBe('');
});

it('does not create a feedback timer when a download resolves after navigation', () => {
  let confirm!: () => void;
  function Feedback() { confirm = useDownloadFeedback().confirm; return null; }
  const view = render(<Feedback />);
  view.unmount();
  const timer = vi.spyOn(globalThis, 'setTimeout');
  confirm();
  expect(timer).not.toHaveBeenCalled();
});
