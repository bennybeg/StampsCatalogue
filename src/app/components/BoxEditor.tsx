import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Box, } from '../../core/image';
import type { ItemKind } from '../../core/detect';
import { useT, type Key } from '../i18n';

export type EditBox = { key: string; box: Box; kind: ItemKind; unresolved?: boolean; inner: Box[] };

const KINDS: { kind: ItemKind; label: Key }[] = [
  { kind: 'single', label: 'kindSingle' }, { kind: 'block', label: 'kindBlock' },
  { kind: 'sheet', label: 'kindSheet' }, { kind: 'cover', label: 'kindCover' },
];
type Corner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * A photo with boxes over it. Edit mode: tap a box to select (delete, change kind, drag corners);
 * tap empty photo to add (the caller snaps a box there). Pick mode: tap a box to choose it.
 */
export function BoxEditor(props: {
  photoUrl: string; width: number; height: number;
  /** Rendered width in CSS px; measured from the container when omitted. */
  displayWidth?: number;
  boxes: EditBox[];
  mode: 'edit' | 'pick';
  onChange?(boxes: EditBox[]): void;
  onPick?(b: EditBox): void;
  onTapEmpty?(x: number, y: number): void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<{ key: string; corner: Corner } | null>(null);

  useEffect(() => {
    if (props.displayWidth || !ref.current) return;
    const el = ref.current;
    setMeasured(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setMeasured(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.displayWidth]);

  // Until the container is measured, draw at photo scale rather than hiding the boxes.
  const dispW = props.displayWidth ?? (measured || props.width);
  const scale = dispW > 0 ? dispW / props.width : 0;
  const sel = props.boxes.find((b) => b.key === selected);
  const update = (key: string, patch: Partial<EditBox>) =>
    props.onChange?.(props.boxes.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const toPhoto = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.round((clientX - r.left) / scale), y: Math.round((clientY - r.top) / scale) };
  };

  const onSurfaceClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.surface) return;
    if (props.mode === 'edit' && selected) { setSelected(null); return; }
    if (!scale) return;
    const p = toPhoto(e.clientX, e.clientY);
    props.onTapEmpty?.(p.x, p.y);
  };

  const onHandleDown = (e: RPointerEvent, key: string, corner: Corner) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { key, corner };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !scale) return;
    const b = props.boxes.find((x) => x.key === d.key);
    if (!b) return;
    const p = toPhoto(e.clientX, e.clientY);
    let { x, y, w, h } = b.box;
    const x2 = x + w, y2 = y + h;
    const nx = d.corner.includes('w') ? Math.min(p.x, x2 - 10) : x;
    const ny = d.corner.includes('n') ? Math.min(p.y, y2 - 10) : y;
    const nx2 = d.corner.includes('e') ? Math.max(p.x, x + 10) : x2;
    const ny2 = d.corner.includes('s') ? Math.max(p.y, y + 10) : y2;
    x = Math.max(0, nx); y = Math.max(0, ny);
    w = Math.min(props.width, nx2) - x; h = Math.min(props.height, ny2) - y;
    update(d.key, { box: { x, y, w, h }, unresolved: false });
  };

  return (
    <div className="box-editor">
      <div ref={ref} className="photo-surface" data-testid="photo-surface" data-surface="1"
        style={{ position: 'relative', width: '100%', touchAction: drag.current ? 'none' : 'auto' }}
        onClick={onSurfaceClick} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <img src={props.photoUrl} alt="" data-surface="1" style={{ width: '100%', display: 'block' }} draggable={false} />
        {scale > 0 && props.boxes.map((b) => {
          const isSel = b.key === selected;
          return (
            <div key={b.key} data-testid={`box-${b.key}`}
              className={`box${b.unresolved ? ' unresolved' : ''}${isSel ? ' selected' : ''}`}
              style={{ position: 'absolute', left: b.box.x * scale, top: b.box.y * scale, width: b.box.w * scale, height: b.box.h * scale }}
              onClick={(e) => { e.stopPropagation(); if (props.mode === 'pick') props.onPick?.(b); else setSelected(b.key); }}>
              {b.unresolved && <span className="box-label">{t('needsSplit')}</span>}
              {isSel && props.mode === 'edit' && (['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => (
                <span key={c} className={`handle ${c}`} onPointerDown={(e) => onHandleDown(e, b.key, c)} />
              ))}
            </div>
          );
        })}
      </div>
      {props.mode === 'edit' && sel && (
        <div className="toolbar row">
          {KINDS.map((k) => (
            <button key={k.kind} aria-pressed={sel.kind === k.kind} onClick={() => update(sel.key, { kind: k.kind })}>{t(k.label)}</button>
          ))}
          <button className="danger" onClick={() => { props.onChange?.(props.boxes.filter((b) => b.key !== sel.key)); setSelected(null); }}>{t('delete')}</button>
        </div>
      )}
      {props.mode === 'edit' && !sel && <p className="muted">{t('tapToAddHint')}</p>}
    </div>
  );
}
