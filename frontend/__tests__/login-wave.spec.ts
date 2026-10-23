import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { JSDOM } from 'jsdom';
import { attachLoginWave } from '../lib/login-wave';

const dom = new JSDOM('<canvas></canvas>', { pretendToBeVisual: true });
Object.defineProperty(globalThis, 'window', {
  value: dom.window,
  configurable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: dom.window.document,
  configurable: true,
});
let hidden = false;
let reduced = false;
let nextId = 0;
const frames = new Map<number, FrameRequestCallback>();
const motionListeners = new Set<() => void>();
const context = {
  clearRect: jest.fn(),
  setTransform: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  createLinearGradient: () => ({ addColorStop: jest.fn() }),
};
const canvas = document.querySelector('canvas');
if (!canvas) throw new Error('Missing canvas fixture');
let cleanup: (() => void) | undefined;

beforeEach(() => {
  hidden = false;
  reduced = false;
  nextId = 0;
  frames.clear();
  motionListeners.clear();
  jest.clearAllMocks();
  Object.defineProperty(document, 'hidden', {
    get: () => hidden,
    configurable: true,
  });
  Object.defineProperty(canvas, 'getContext', {
    value: () => context,
    configurable: true,
  });
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 3,
    configurable: true,
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => frames.delete(id),
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      get matches() {
        return reduced;
      },
      addEventListener: (_name: string, listener: () => void) =>
        motionListeners.add(listener),
      removeEventListener: (_name: string, listener: () => void) =>
        motionListeners.delete(listener),
    }),
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('Login canvas lifecycle', () => {
  it('draws at bounded density and releases frames and listeners on cleanup', () => {
    cleanup = attachLoginWave(canvas, { paused: false });
    expect(canvas.width).toBe(window.innerWidth * 2);
    expect(canvas.height).toBe(window.innerHeight * 2);
    expect(context.stroke).toHaveBeenCalled();
    expect(frames.size).toBe(1);
    cleanup?.();
    cleanup = undefined;
    expect(frames.size).toBe(0);
    expect(motionListeners.size).toBe(0);
    const previous = context.stroke.mock.calls.length;
    window.dispatchEvent(new dom.window.Event('resize'));
    expect(context.stroke.mock.calls.length).toBe(previous);
  });

  it('stops in hidden tabs and resumes with a single frame', () => {
    cleanup = attachLoginWave(canvas, { paused: false });
    hidden = true;
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
    expect(frames.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new dom.window.Event('visibilitychange'));
    expect(frames.size).toBe(1);
  });

  it('keeps reduced motion static and responds to preference changes', () => {
    reduced = true;
    cleanup = attachLoginWave(canvas, { paused: false });
    expect(context.stroke).toHaveBeenCalled();
    expect(frames.size).toBe(0);
    reduced = false;
    for (const listener of motionListeners) listener();
    expect(frames.size).toBe(1);
    reduced = true;
    for (const listener of motionListeners) listener();
    expect(frames.size).toBe(0);
  });

  it('does not accumulate frames when remounting a paused background', () => {
    cleanup = attachLoginWave(canvas, { paused: true });
    expect(frames.size).toBe(0);
    cleanup?.();
    cleanup = attachLoginWave(canvas, { paused: false });
    expect(frames.size).toBe(1);
    expect(motionListeners.size).toBe(1);
  });
});
