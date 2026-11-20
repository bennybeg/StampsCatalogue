import type { ItemKind } from '../core/detect';
export type { ItemKind };

export type NBox = { x: number; y: number; w: number; h: number };

export interface Item {
  id: string;
  kind: ItemKind;
  /** Set on a stamp inside a block/sheet/cover. */
  parentId?: string;
  /** Both undefined = not yet filed. */
  album?: number;
  page?: number;
  /** Position on the page photo, normalized 0..1. */
  pos?: NBox;
  /** Copies of the same stamp share it; a new item's groupId is its own id. */
  groupId: string;
  forTrade: boolean;
  note?: string;
  /** JPEG q0.8, longer side ≤ 600. */
  image: Blob;
  /** JPEG, longer side ≤ 200. */
  thumb: Blob;
  /** 384 floats, L2-normalized. */
  embedding: Float32Array;
  /** 72-bin colour signature. */
  color: Float32Array;
  createdAt: number;
}

export interface Meta {
  lastBackupAt?: number;
  addedSinceBackup: number;
  persisted?: boolean;
}
