'use client';
import { useEffect, useRef, useState } from 'react';
import { Field, inputClass } from '@/components/field';
import { Button } from '@/components/button';
import { Check, Alert } from '@/components/icons';
import { postJSON } from '../api';
import jsQR from 'jsqr';
import styles from './checkin.module.css';

interface CheckInResult {
  participantId: string;
  name: string;
  enrolmentNo: string;
  seatLabel: string;
}
type Result = { success: true; data: CheckInResult } | { success: false; error: string };

const CAMERA_ERROR =
  'Camera unavailable. It needs HTTPS (it works through the event address) and permission. Type the code instead.';

export default function Scanner() {
  const [seatLabel, setSeatLabel] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seatLabelRef = useRef('');

  // Keep the latest seat label for the scan loop.
  useEffect(() => {
    seatLabelRef.current = seatLabel;
    if (seatLabel) setSeatError(null);
  }, [seatLabel]);

  // Stop the camera and the loop on unmount.
  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const startLoop = () => {
    if (!intervalRef.current) intervalRef.current = window.setInterval(processFrame, 250);
  };
  const stopLoop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(CAMERA_ERROR);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
      startLoop();
    } catch {
      setCameraError(CAMERA_ERROR);
    }
  };

  const handleCheckIn = async (code: string) => {
    if (!seatLabelRef.current) {
      setSeatError('Enter the seat label first.');
      return;
    }
    setChecking(true);
    try {
      const data = await postJSON<CheckInResult>('/api/staff/checkin', { code, seatLabel: seatLabelRef.current });
      setResult({ success: true, data });
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : 'Check-in failed.' });
    } finally {
      setChecking(false);
      stopLoop();
    }
  };

  // Reads refs only, so the interval never sees stale state.
  const processFrame = () => {
    // No seat label yet: don't consume a code (it would be lost); keep the camera running and ask for the seat.
    if (!seatLabelRef.current) {
      setSeatError('Enter the seat label first.');
      return;
    }
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    c.width = w;
    c.height = h;
    ctx.drawImage(v, 0, 0, w, h);
    const qr = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
    if (qr?.data.startsWith('CH1:')) {
      stopLoop();
      void handleCheckIn(qr.data);
    }
  };

  const next = () => {
    setResult(null);
    setManualCode('');
    if (streamRef.current) startLoop();
  };

  return (
    <div className={styles.container}>
      <Field label="Seat label" id="seatLabel">
        <input id="seatLabel" className={inputClass} value={seatLabel} onChange={(e) => setSeatLabel(e.target.value)} required />
      </Field>
      {seatError && <p className={styles.error} role="alert">{seatError}</p>}
      {cameraError && <p className={styles.error}>{cameraError}</p>}
      {!cameraError && !scanning && (
        <Button className={styles.button} onClick={startCamera}>
          Start camera
        </Button>
      )}
      <video ref={videoRef} className={`${styles.video} ${scanning ? '' : styles.hidden}`} playsInline muted autoPlay />
      <canvas ref={canvasRef} className={styles.hidden} />
      <div className={styles.fallback}>
        <Field label="Type the code" id="manualCode">
          <input id="manualCode" className={inputClass} value={manualCode} onChange={(e) => setManualCode(e.target.value)} />
        </Field>
        <Button className={styles.button} onClick={() => handleCheckIn(manualCode)} disabled={!manualCode || checking} busy={checking}>
          Check in
        </Button>
      </div>
      {result && (
        <div className={styles.result}>
          {result.success ? (
            <>
              <Check className={styles.successIcon} />
              <p className={styles.big}>
                {result.data.name} ({result.data.enrolmentNo}), seat {result.data.seatLabel}
              </p>
            </>
          ) : (
            <div role="alert">
              <Alert className={styles.errorIcon} />
              <p>{result.error}</p>
            </div>
          )}
          <Button className={styles.button} onClick={next}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
