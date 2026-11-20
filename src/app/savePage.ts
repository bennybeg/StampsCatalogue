import { crop, withMargin, type Box, type RgbaImage } from '../core/image';
import type { Candidate, NBox, Proposal } from '../core/savePlan';
import { putItems, updateItem, type StampDb } from '../db/db';
import type { Item } from '../db/types';
import type { EditBox } from './components/BoxEditor';
import type { Services } from './services';

export const IMAGE_SIDE = 600;
export const THUMB_SIDE = 200;
export const JPEG_QUALITY = 0.8;

type Look = { embedding: Float32Array; color: Float32Array };
export type Child = Look & { image: Blob; thumb: Blob; pos: NBox };
export type CandidateWithCrops = Candidate & { box: EditBox; image: Blob; thumb: Blob; children: Child[] };

/** Album/page number from user text: digits only, ≥ 1, surrounding spaces ignored. */
export function parsePageNumber(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? n : null;
}

const norm = (b: Box, photo: RgbaImage): NBox => ({ x: b.x / photo.width, y: b.y / photo.height, w: b.w / photo.width, h: b.h / photo.height });

async function describeCrop(svc: Pick<Services, 'recognizer' | 'encode'>, photo: RgbaImage, b: Box) {
  const c = crop(photo, withMargin(b, photo));
  const [look, image, thumb] = await Promise.all([
    svc.recognizer.describe(c),
    svc.encode(c, IMAGE_SIDE, JPEG_QUALITY),
    svc.encode(c, THUMB_SIDE, JPEG_QUALITY),
  ]);
  return { ...look, image, thumb, pos: norm(b, photo) };
}

/** Crop, encode and recognise every box (and the stamps inside blocks/sheets/covers). */
export async function buildCandidates(
  svc: Pick<Services, 'recognizer' | 'encode'>, photo: RgbaImage, boxes: EditBox[],
  onProgress?: (done: number, total: number) => void,
): Promise<CandidateWithCrops[]> {
  const total = boxes.reduce((n, b) => n + 1 + (b.kind === 'single' ? 0 : b.inner.length), 0);
  let done = 0;
  const tick = () => onProgress?.(++done, total);
  const out: CandidateWithCrops[] = [];
  for (const box of boxes) {
    const main = await describeCrop(svc, photo, box.box); tick();
    const children: Child[] = [];
    if (box.kind !== 'single')
      for (const ib of box.inner) {
        children.push(await describeCrop(svc, photo, { x: box.box.x + ib.x, y: box.box.y + ib.y, w: ib.w, h: ib.h })); tick();
      }
    out.push({ tempId: box.key, box, ...main, children });
  }
  return out;
}

function newItem(p: Omit<Item, 'id' | 'groupId' | 'forTrade' | 'createdAt'>): Item {
  const id = crypto.randomUUID();
  return { id, groupId: id, forTrade: false, createdAt: Date.now(), ...p };
}

/** Apply the proposals the user accepted (anything rejected should arrive as 'new'). */
export async function applyProposals(db: StampDb, album: number, page: number, cands: CandidateWithCrops[], accepted: Proposal[]): Promise<void> {
  const byId = new Map(cands.map((c) => [c.tempId, c]));
  const fresh: Item[] = [];
  for (const p of accepted) {
    const c = byId.get(p.tempId);
    if (!c) continue;
    if (p.type === 'fileUnfiled') { await updateItem(db, p.itemId, { album, page, pos: c.pos }); continue; }
    if (p.type === 'alreadySaved') { await updateItem(db, p.itemId, { pos: c.pos }); continue; }
    const parent = newItem({ kind: c.box.kind, album, page, pos: c.pos, image: c.image, thumb: c.thumb, embedding: c.embedding, color: c.color });
    fresh.push(parent);
    for (const ch of c.children)
      fresh.push(newItem({ kind: 'single', parentId: parent.id, album, page, pos: ch.pos, image: ch.image, thumb: ch.thumb, embedding: ch.embedding, color: ch.color }));
  }
  if (fresh.length) await putItems(db, fresh);
}
