import { useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';

export default function ImageEditor({ source, aspect, onDone }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [ratio, setRatio] = useState(aspect ? String(aspect) : 'original');
  const [originalRatio, setOriginalRatio] = useState(1);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null), cancel = useRef(null), processing = useRef(false), done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancel.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); if (!processing.current) done.current(null); }
      if (event.key === 'Tab') {
        const nodes = dialog.current.querySelectorAll('button:not(:disabled),select,input,[tabindex="0"]');
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  async function apply() {
    if (!area || processing.current) return;
    processing.current = true; setBusy(true); setError('');
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = source; });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(area.width)); canvas.height = Math.max(1, Math.round(area.height));
      canvas.getContext('2d').drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob || blob.size > 10 * 1024 * 1024) throw new Error('Ảnh sau khi cắt vượt quá 10 MB. Hãy chọn vùng nhỏ hơn hoặc giữ ảnh gốc.');
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
      onDone({ blob, dataUrl });
    } catch (err) { setError(err.message || 'Không xử lý được ảnh.'); }
    finally { processing.current = false; setBusy(false); }
  }

  return <div className="image-editor__backdrop"><section ref={dialog} className="image-editor" role="dialog" aria-modal="true" aria-label="Chỉnh ảnh">
    <div className="image-editor__heading"><h2>Chỉnh ảnh</h2><button ref={cancel} className="btn btn--sm" disabled={busy} onClick={() => onDone(null)}>Huỷ</button></div>
    <p className="form__hint">Kéo để di chuyển ảnh, dùng con lăn hoặc thanh trượt để zoom. Ảnh chỉ tải lên khi bấm Lưu thay đổi.</p>
    <div className="image-editor__cropper" aria-busy={busy}>
      <Cropper image={source} crop={crop} zoom={zoom} minZoom={1} maxZoom={4} aspect={ratio === 'original' ? originalRatio : Number(ratio)}
        onCropChange={setCrop} onZoomChange={setZoom} zoomWithScroll
        onCropAreaChange={(_percent, pixels) => setArea(pixels)}
        onMediaLoaded={(media) => setOriginalRatio(media.naturalWidth / media.naturalHeight)}
        onInteractionStart={() => setError('')} />
    </div>
    <div className="image-editor__controls">
      <label>Tỉ lệ<select className="form__input" value={ratio} disabled={busy} onChange={(e) => { setRatio(e.target.value); setCrop({ x: 0, y: 0 }); setZoom(1); setArea(null); }}>
        <option value="original">Tỉ lệ ảnh gốc</option><option value="1">1:1</option><option value={16 / 9}>16:9</option><option value={4 / 3}>4:3</option><option value={3 / 4}>3:4</option><option value="1.91">1.91:1</option>
      </select></label>
      <label>Zoom {zoom.toFixed(1)}×<div className="image-editor__zoom"><button className="btn btn--sm" aria-label="Thu nhỏ" disabled={busy || zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - .1))}>−</button><input aria-label="Mức zoom ảnh" type="range" min="1" max="4" step=".01" disabled={busy} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /><button className="btn btn--sm" aria-label="Phóng to" disabled={busy || zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + .1))}>+</button></div></label>
    </div>
    {error && <p role="alert" className="gift-import__error">{error}</p>}
    <div className="image-editor__actions"><button className="btn" disabled={busy} onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }}>Đặt lại</button><button className="btn" disabled={busy} onClick={() => onDone({ original: true })}>Giữ ảnh gốc</button><button className="btn btn--primary" disabled={busy || !area} onClick={apply}>{busy ? 'Đang xử lý…' : 'Áp dụng'}</button></div>
  </section></div>;
}
