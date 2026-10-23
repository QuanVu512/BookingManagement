import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { attachArenaWave } from '../lib/arena-wave';

const dom = new JSDOM('<canvas></canvas>', { pretendToBeVisual: true });
Object.defineProperty(globalThis, 'window', {
  value: dom.window,
  configurable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: dom.window.document,
  configurable: true,
});
const canvas = document.querySelector('canvas');
if (!canvas) throw new Error('Missing canvas');
const frames = new Map<number, FrameRequestCallback>();
const context = {
  clearRect: jest.fn(),
  setTransform: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  createLinearGradient: () => ({ addColorStop: jest.fn() }),
};
let hidden = false;
let nextId = 0;
let cleanup: (() => void) | undefined;
beforeEach(() => {
  hidden = false;
  nextId = 0;
  frames.clear();
  jest.clearAllMocks();
  Object.defineProperty(document, 'hidden', {
    get: () => hidden,
    configurable: true,
  });
  Object.defineProperty(canvas, 'getContext', {
    value: () => context,
    configurable: true,
  });
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => new dom.window.DOMRect(0, 200, 1024, 500),
    configurable: true,
  });
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 3,
    configurable: true,
  });
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({ matches: true }),
    configurable: true,
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    value: (callback: FrameRequestCallback) => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    configurable: true,
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    value: (id: number) => frames.delete(id),
    configurable: true,
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('Reference kinetic wave', () => {
  it('keeps the requested animation running by default even with reduced-motion selected', () => {
    cleanup = attachArenaWave(canvas, { paused: false });
    expect(frames.size).toBe(1);
    expect(canvas.width).toBe(window.innerWidth * 2);
    expect(canvas.height).toBe(1000);
    const first = frames.entries().next().value;
    if (!first) throw new Error('Missing frame');
    frames.delete(first[0]);
    first[1](100);
    expect(frames.size).toBe(1);
    expect(context.stroke).toHaveBeenCalled();
  });
  it('pauses only when explicitly requested or the tab is hidden, and releases listeners', () => {
    cleanup = attachArenaWave(canvas, { paused: false });
    hidden = true;
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
    expect(frames.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
    expect(frames.size).toBe(1);
    cleanup?.();
    cleanup = undefined;
    expect(frames.size).toBe(0);
    const count = context.stroke.mock.calls.length;
    window.dispatchEvent(new dom.window.Event('resize'));
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
    expect(context.stroke.mock.calls.length).toBe(count);
    cleanup = attachArenaWave(canvas, { paused: true });
    expect(frames.size).toBe(0);
  });
  it('accounts for the centered canvas offset when reacting to the pointer', () => {
    cleanup = attachArenaWave(canvas, { paused: true });
    const original = context.moveTo.mock.calls[0]?.[1];
    window.dispatchEvent(
      new dom.window.MouseEvent('pointermove', { clientX: 0, clientY: 385 }),
    );
    window.dispatchEvent(new dom.window.Event('resize'));
    const top = context.moveTo.mock.calls.findLast(
      (call) => call[0] === 0,
    )?.[1];
    expect(typeof top).toBe('number');
    expect(Number(top)).toBeLessThan(Number(original));
    const css = readFileSync(
      new URL('../components/arena/arena.css', import.meta.url),
      'utf8',
    );
    expect(css).toMatch(/top:\s*calc\(50% - 185px\)/);
    expect(css).toContain('arena-text-shine 4s linear infinite');
    expect(css).not.toContain('prefers-reduced-motion');
  });
});
