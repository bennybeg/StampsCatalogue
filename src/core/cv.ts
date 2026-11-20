import cvModule from '@techstark/opencv-js';

// The bundled typings are large and loosely match the runtime; the core uses a narrow surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CV = any;

let ready: Promise<CV> | null = null;

/** Load OpenCV.js once; resolves when the WASM runtime is initialized. */
export function getCv(): Promise<CV> {
  if (!ready) {
    ready = (async () => {
      const mod: CV = cvModule as CV;
      if (mod instanceof Promise) return await mod;
      if (mod.Mat) return mod;
      await new Promise<void>((resolve) => { mod.onRuntimeInitialized = () => resolve(); });
      return mod;
    })();
  }
  return ready;
}
