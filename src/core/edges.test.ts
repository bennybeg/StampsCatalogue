import { describe, it, expect } from 'vitest';
import { perforationScore, edgesDiffer } from './edges';
import { resizeTo } from './image';
import { blankImage, drawStamp, drawPerforatedStamp, withPostmark, PAGE_BG } from './testing/synthetic';

const BOX = { x: 30, y: 30, w: 340, h: 440 };
const perforated = () => { const i = blankImage(400, 500, PAGE_BG); drawPerforatedStamp(i, BOX); return i; };
const straight = () => { const i = blankImage(400, 500, PAGE_BG); drawStamp(i, BOX); return i; };
const tilted = () => { const i = blankImage(400, 500, PAGE_BG); drawStamp(i, BOX, [40, 70, 160], 2); return i; };

describe('perforationScore', () => {
  it('is much higher for perforated edges than straight ones', () => {
    expect(perforationScore(perforated())).toBeGreaterThan(3 * perforationScore(straight()));
  });
  it('keeps that ordering at 60% size', () => {
    const p = resizeTo(perforated(), 300).image, s = resizeTo(straight(), 300).image;
    expect(perforationScore(p)).toBeGreaterThan(3 * perforationScore(s));
  });
});

describe('edgesDiffer', () => {
  it('flags perforated vs straight', () => expect(edgesDiffer(perforated(), straight())).toBe(true));
  it('does not flag two perforated copies', () => expect(edgesDiffer(perforated(), resizeTo(perforated(), 400).image)).toBe(false));
  it('does not flag a straight stamp vs its slightly tilted copy', () => expect(edgesDiffer(straight(), tilted())).toBe(false));
  it('does not flag a straight stamp vs a postmarked copy', () => expect(edgesDiffer(straight(), withPostmark(straight(), 0.12))).toBe(false));
});
