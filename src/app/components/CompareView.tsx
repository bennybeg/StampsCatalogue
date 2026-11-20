import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };
const EDGES: View = { scale: 3, x: 0, y: 0 };

function useUrl(src: Blob | string): string {
  const [url, setUrl] = useState(typeof src === 'string' ? src : '');
  useEffect(() => {
    if (typeof src === 'string') { setUrl(src); return; }
    const u = URL.createObjectURL(src);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [src]);
  return url;
}

/**
 * The new photo and an owned stamp, one above the other, sharing one zoom/pan: drag to pan,
 * two fingers to zoom. "Edges" jumps to 3× on the top-left corner, where perforations show.
 */
export function CompareView(props: { left: Blob | string; right: Blob | string; edgesDiffer: boolean; onClose(): void; onSameStamp?(): void }) {
  const { t } = useT();
  const [view, setView] = useState<View>(FIT);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const leftUrl = useUrl(props.left), rightUrl = useUrl(props.right);

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const scale = Math.min(6, Math.max(1, (pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist));
      setView((v) => ({ ...v, scale }));
    } else if (pointers.current.size === 1) {
      setView((v) => ({ ...v, x: v.x + (e.clientX - prev.x) / v.scale, y: v.y + (e.clientY - prev.y) / v.scale }));
    }
  };
  const onUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };

  const style = { transform: `scale(${view.scale}) translate(${view.x}px, ${view.y}px)`, transformOrigin: '0 0' };
  const pane = (url: string, label: string) => (
    <figure className="compare-pane" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <figcaption>{label}</figcaption>
      <div className="compare-clip"><img src={url} alt={label} style={style} draggable={false} /></div>
    </figure>
  );

  return (
    <div className="compare" role="dialog">
      {props.edgesDiffer && <p className="banner">{t('edgesDiffer')}</p>}
      {pane(leftUrl, t('yourPhoto'))}
      {pane(rightUrl, t('inCollection'))}
      <div className="row">
        <button onClick={() => setView(EDGES)}>{t('zoomEdges')}</button>
        <button onClick={() => setView(FIT)}>{t('zoomFit')}</button>
        {props.onSameStamp && <button onClick={props.onSameStamp}>{t('sameStamp')}</button>}
        <button onClick={props.onClose}>{t('close')}</button>
      </div>
    </div>
  );
}
