import { getCv } from './cv';
import { findRectangles } from './detect';
import { crop, type Box, type RgbaImage } from './image';

/** Window side as a fraction of the image's shorter side; doubled while the found box touches its edge. */
const WINDOW = 0.35;
const MAX_DOUBLINGS = 2;
/** Difference from the local page colour that still counts as stamp paper in the second pass. */
const LOW_CONTRAST = 12;
/** The low-contrast box may be at most this × the normal one (a 12%-per-side margin is ~1.65×) (margin added, not the whole page). */
const MARGIN_GROWTH = 2;

/**
 * The box of the stamp under a tapped point, or null. Looks only at a window around the tap, so the
 * page colour is judged locally (works on cream or busy pages where whole-page detection fails).
 */
export async function snapBoxAt(img: RgbaImage, x: number, y: number): Promise<Box | null> {
  const cv = await getCv();
  let side = Math.round(WINDOW * Math.min(img.width, img.height));
  for (let attempt = 0; attempt <= MAX_DOUBLINGS; attempt++, side *= 2) {
    const x0 = Math.max(0, Math.min(img.width - side, Math.round(x - side / 2)));
    const y0 = Math.max(0, Math.min(img.height - side, Math.round(y - side / 2)));
    const win = { x: x0, y: y0, w: Math.min(side, img.width - x0), h: Math.min(side, img.height - y0) };
    const px = x - win.x, py = y - win.y;
    const winImg = crop(img, win);
    const under = (found: Box[]) => found
      .filter((b) => !(b as { unresolved?: boolean }).unresolved && px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    let best = under(findRectangles(cv, winImg, 0.01));
    if (!best) return null;
    // A white stamp margin on a cream/white page falls below the normal contrast cut and only the
    // design is found. A low cut adds the margin back; accept it if it only grows the box modestly.
    const low = under(findRectangles(cv, winImg, 0.01, LOW_CONTRAST));
    if (low && low.w * low.h <= MARGIN_GROWTH * best.w * best.h && low.x <= best.x && low.y <= best.y &&
      low.x + low.w >= best.x + best.w && low.y + low.h >= best.y + best.h) best = low;
    const touches = (best.x <= 1 && win.x > 0) || (best.y <= 1 && win.y > 0) ||
      (best.x + best.w >= win.w - 1 && win.x + win.w < img.width) || (best.y + best.h >= win.h - 1 && win.y + win.h < img.height);
    if (!touches || attempt === MAX_DOUBLINGS) return { x: best.x + win.x, y: best.y + win.y, w: best.w, h: best.h };
  }
  return null;
}
