import { createContext, useContext, type ReactNode } from 'react';
import type { RgbaImage } from '../core/image';
import type { StampDb } from '../db/db';
import type { Recognizer } from '../worker/client';

/** Everything screens need from the outside world; tests pass fakes. */
export type Services = {
  getDb(): Promise<StampDb>;
  recognizer: Recognizer;
  decode(file: Blob): Promise<RgbaImage>;
  encode(img: RgbaImage, maxSide: number, quality?: number): Promise<Blob>;
};

const Ctx = createContext<Services | null>(null);

export function ServicesProvider({ value, children }: { value: Services; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useServices(): Services {
  const s = useContext(Ctx);
  if (!s) throw new Error('useServices outside ServicesProvider');
  return s;
}
