import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Stack, Typography } from '@mui/material';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useId, useRef, useState } from 'react';
import { materialPath, siteUrl } from '../../seo/seoConfig';
import type { DocumentDto } from '../../types/documents';
import { saveBlob } from '../../utils/saveBlob';

const qrStyle = { size: 1024, marginSize: 4, bgColor: '#FFFFFF', fgColor: '#102F5B', level: 'H' } as const;
const guidPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

export function MaterialQrDialog({ material, onClose }: { material: DocumentDto; onClose: () => void }) {
  const titleId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error'; text: string }>();
  const unavailable = !guidPattern.test(material.id) || material.id === '00000000-0000-0000-0000-000000000000'
    ? 'Не вдалося визначити посилання на матеріал.'
    : material.documentType === 'InteractiveTrainer' && material.trainerPublished !== true
      ? 'Опублікуйте тренажер, щоб створити QR-код для публічного доступу.'
      : null;
  const publicUrl = unavailable ? null : new URL(materialPath(material.id), siteUrl).href;

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setFeedback({ severity: 'success', text: 'Посилання скопійовано.' });
    } catch {
      setFeedback({ severity: 'error', text: 'Не вдалося скопіювати посилання. Скопіюйте його вручну.' });
    }
  }

  async function download(format: 'png' | 'svg') {
    try {
      const svg = svgRef.current;
      const canvas = canvasRef.current;
      if (!svg || !canvas) throw new Error();
      const blob = format === 'svg'
        ? new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
        : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error();
      saveBlob(blob, `matharchive-qr-${material.id}.${format}`);
      setFeedback({ severity: 'success', text: 'Завантаження QR-коду розпочато.' });
    } catch {
      setFeedback({ severity: 'error', text: 'Не вдалося завантажити QR-код. Спробуйте ще раз.' });
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>QR-код матеріалу</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ overflowWrap: 'anywhere' }}>
          <Typography variant="h6">{material.title}</Typography>
          {unavailable && <Alert severity="warning">{unavailable}</Alert>}
          {publicUrl && (
            <>
              <Box sx={{ alignSelf: 'center', width: 'min(100%, 18rem)', border: 1, borderColor: 'warning.light', borderRadius: 1, overflow: 'hidden',
                '& > svg': { display: 'block', width: '100%', height: 'auto' } }}>
                <QRCodeSVG ref={svgRef} value={publicUrl} {...qrStyle} role="img" title="QR-код публічної сторінки матеріалу" />
              </Box>
              <QRCodeCanvas ref={canvasRef} value={publicUrl} {...qrStyle} hidden />
              <Link href={publicUrl}>{publicUrl}</Link>
            </>
          )}
          {feedback && <Alert severity={feedback.severity} role={feedback.severity === 'success' ? 'status' : 'alert'}>{feedback.text}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions disableSpacing sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
        {publicUrl && (
          <>
            <Button variant="contained" onClick={() => void download('png')}>Завантажити PNG</Button>
            <Button variant="outlined" onClick={() => void download('svg')}>Завантажити SVG</Button>
            <Button onClick={() => void copyLink()}>Копіювати посилання</Button>
          </>
        )}
        <Button onClick={onClose}>Закрити</Button>
      </DialogActions>
    </Dialog>
  );
}
