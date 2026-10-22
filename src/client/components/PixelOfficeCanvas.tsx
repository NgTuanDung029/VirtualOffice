import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityFeedItem,
  AgentActivityState,
  AgentConnectionStatus,
  ProjectInfo,
} from '../../shared/types';
import { Language, translations } from '../i18n';
import {
  Activity,
  CheckCircle2,
  Clock,
  FolderGit2,
  Sparkles,
  Terminal,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';

interface PixelOfficePanelProps {
  activityState: AgentActivityState;
  connectionStatus: AgentConnectionStatus;
  isSimulated: boolean;
  selectedProject: ProjectInfo | null;
  currentTask: string;
  completedTasksCount: number;
  sessionStartedAt: number;
  activityFeed: ActivityFeedItem[];
  reducedMotion: boolean;
  language: Language;
  children?: React.ReactNode; // For bottom-right UsageStatusBar
}

// Native pixel resolution of the office scene (scaled via nearest-neighbor)
const PIXEL_W = 240;
const PIXEL_H = 156;

export const PixelOfficePanel: React.FC<PixelOfficePanelProps> = ({
  activityState,
  connectionStatus,
  isSimulated,
  selectedProject,
  currentTask,
  completedTasksCount,
  sessionStartedAt,
  activityFeed,
  reducedMotion,
  language,
  children,
}) => {
  const t = translations[language];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sessionDurationStr, setSessionDurationStr] = useState('00:00');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000));
      const hrs = Math.floor(elapsedSec / 3600);
      const mins = Math.floor((elapsedSec % 3600) / 60);
      const secs = elapsedSec % 60;
      if (hrs > 0) {
        setSessionDurationStr(
          `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        );
      } else {
        setSessionDurationStr(
          `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        );
      }
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [sessionStartedAt]);

  const effectiveReducedMotion = reducedMotion || prefersReducedMotion;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let animFrameId = 0;
    let tick = 0;

    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
    };

    const drawScene = (frame: number) => {
      const now = new Date();
      const slowFrame = effectiveReducedMotion ? 0 : Math.floor(frame / 12);
      const medFrame = effectiveReducedMotion ? 0 : Math.floor(frame / 6);
      const fastFrame = effectiveReducedMotion ? 0 : Math.floor(frame / 3);

      // 1. Back Wall & Wainscoting (Warm Cozy Pixel Studio)
      px(0, 0, PIXEL_W, 108, '#2b2336'); // Upper wallpaper
      // Subtle vertical wallpaper stripes
      for (let x = 8; x < PIXEL_W; x += 16) {
        px(x, 0, 1, 104, '#32293f');
      }
      // Wooden dado rail & lower wall paneling
      px(0, 94, PIXEL_W, 3, '#5c3c28');
      px(0, 97, PIXEL_W, 13, '#3b2820');
      // Floorboards
      px(0, 110, PIXEL_W, PIXEL_H - 110, '#493124');
      for (let y = 116; y < PIXEL_H; y += 8) {
        px(0, y, PIXEL_W, 1, '#382419');
      }
      // Cozy Woven Office Rug under desk/chair
      px(46, 124, 148, 24, '#6e2b3b');
      px(48, 126, 144, 20, '#8d3b4d');
      px(52, 128, 136, 16, '#a84a5c');
      // Rug fringe
      for (let ry = 125; ry < 147; ry += 3) {
        px(44, ry, 2, 2, '#dfd3c3');
        px(194, ry, 2, 2, '#dfd3c3');
      }

      // 2. Window & Exterior Scenery (Left-Center Back Wall)
      const winX = 16;
      const winY = 14;
      const winW = 68;
      const winH = 56;
      // Outer wooden frame
      px(winX - 3, winY - 3, winW + 6, winH + 6, '#5c3c28');
      px(winX - 1, winY - 1, winW + 2, winH + 2, '#87593a');
      // Night/Dusk Sky Gradient inside window
      px(winX, winY, winW, 18, '#0f172a');
      px(winX, winY + 18, winW, 18, '#1e293b');
      px(winX, winY + 36, winW, 20, '#334155');

      // Crescent Moon & Twinkling Stars
      px(winX + 50, winY + 7, 7, 7, '#fef08a');
      px(winX + 52, winY + 6, 6, 5, '#0f172a');
      const starPositions = [
        [10, 6],
        [24, 12],
        [38, 5],
        [16, 22],
        [58, 19],
      ];
      starPositions.forEach(([sx, sy], idx) => {
        const twinkle = (slowFrame + idx) % 4 === 0;
        px(winX + sx, winY + sy, 1, 1, twinkle ? '#ffffff' : '#94a3b8');
      });

      // Drifting Pixel Cloud
      const cloudOffset = effectiveReducedMotion ? 12 : (slowFrame % 76) - 14;
      const cx = winX + Math.max(2, Math.min(winW - 18, cloudOffset));
      px(cx, winY + 25, 14, 3, '#64748b');
      px(cx + 3, winY + 23, 8, 2, '#94a3b8');

      // Distant Pixel City Skyline Silhouette
      px(winX, winY + 42, 14, 14, '#0f172a');
      px(winX + 14, winY + 36, 12, 20, '#1e1b2e');
      px(winX + 26, winY + 44, 15, 12, '#0f172a');
      px(winX + 41, winY + 38, 14, 18, '#1e1b2e');
      px(winX + 55, winY + 45, 13, 11, '#0f172a');
      // Tiny lit city windows
      for (let wy = winY + 39; wy < winY + 53; wy += 4) {
        px(winX + 17, wy, 2, 2, '#fbbf24');
        px(winX + 21, wy, 2, 2, '#fef08a');
        px(winX + 44, wy + 1, 2, 2, '#fbbf24');
        px(winX + 49, wy + 1, 2, 2, '#38bdf8');
      }

      // Window Mullions (Crossbars) & Sill
      px(winX + Math.floor(winW / 2) - 1, winY, 2, winH, '#5c3c28');
      px(winX, winY + Math.floor(winH / 2) - 1, winW, 2, '#5c3c28');
      px(winX - 5, winY + winH + 2, winW + 10, 4, '#754d32');

      // 3. Wall Clock (Synced with Real Local Time!)
      const clockX = 104;
      const clockY = 16;
      px(clockX, clockY, 19, 19, '#5c3c28');
      px(clockX + 2, clockY + 2, 15, 15, '#f8fafc');
      px(clockX + 9, clockY + 3, 1, 2, '#475569'); // 12 o'clock tick
      px(clockX + 9, clockY + 14, 1, 2, '#475569'); // 6 o'clock tick
      px(clockX + 3, clockY + 9, 2, 1, '#475569'); // 9 o'clock tick
      px(clockX + 14, clockY + 9, 2, 1, '#475569'); // 3 o'clock tick
      // Center pivot & hands
      const hours = now.getHours() % 12;
      const minutes = now.getMinutes();
      const hrAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
      const minAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
      const hTipX = Math.round(clockX + 9 + Math.cos(hrAngle) * 4);
      const hTipY = Math.round(clockY + 9 + Math.sin(hrAngle) * 4);
      const mTipX = Math.round(clockX + 9 + Math.cos(minAngle) * 5);
      const mTipY = Math.round(clockY + 9 + Math.sin(minAngle) * 5);
      px(clockX + 9, clockY + 9, 2, 2, '#1e293b');
      px(hTipX, hTipY, 2, 2, '#1e293b');
      px(mTipX, mTipY, 1, 1, '#ef4444');

      // Framed Pixel Art Poster next to clock
      px(100, 42, 26, 30, '#4a3525');
      px(102, 44, 22, 26, '#1e293b');
      px(105, 48, 16, 10, '#38bdf8');
      px(108, 52, 10, 6, '#f43f5e');
      px(105, 61, 16, 2, '#94a3b8');

      // 4. Bookshelves on Right Back Wall
      const shelfX = 142;
      // Top Shelf
      px(shelfX, 24, 82, 4, '#6e472b');
      px(shelfX + 4, 28, 3, 3, '#493124');
      px(shelfX + 75, 28, 3, 3, '#493124');
      // Books on top shelf
      const topBooks = [
        { x: 4, w: 5, h: 13, c: '#ef4444' },
        { x: 9, w: 4, h: 15, c: '#3b82f6' },
        { x: 13, w: 6, h: 14, c: '#10b981' },
        { x: 19, w: 4, h: 12, c: '#f59e0b' },
        { x: 23, w: 5, h: 15, c: '#8b5cf6' },
        { x: 34, w: 6, h: 14, c: '#ec4899' },
        { x: 40, w: 5, h: 13, c: '#06b6d4' },
      ];
      topBooks.forEach((b) => {
        px(shelfX + b.x, 24 - b.h, b.w, b.h, b.c);
        px(shelfX + b.x, 24 - b.h + 2, b.w, 1, '#ffffff55');
      });
      // Trailing vine plant on top shelf right
      px(shelfX + 58, 14, 12, 10, '#b45309');
      px(shelfX + 56, 8, 16, 7, '#16a34a');
      px(shelfX + 60, 5, 10, 5, '#22c55e');
      px(shelfX + 68, 22, 3, 8, '#15803d');
      px(shelfX + 71, 26, 3, 9, '#22c55e');

      // Lower Shelf
      px(shelfX, 52, 82, 4, '#6e472b');
      px(shelfX + 4, 56, 3, 3, '#493124');
      px(shelfX + 75, 56, 3, 3, '#493124');
      const bottomBooks = [
        { x: 6, w: 6, h: 14, c: '#6366f1' },
        { x: 12, w: 5, h: 12, c: '#14b8a6' },
        { x: 17, w: 6, h: 15, c: '#f97316' },
        { x: 48, w: 5, h: 14, c: '#e11d48' },
        { x: 53, w: 6, h: 15, c: '#0284c7' },
        { x: 59, w: 5, h: 13, c: '#84cc16' },
      ];
      bottomBooks.forEach((b) => {
        px(shelfX + b.x, 52 - b.h, b.w, b.h, b.c);
        px(shelfX + b.x, 52 - b.h + 3, b.w, 1, '#ffffff44');
      });
      // Decorative golden trophy / server cube on lower shelf
      px(shelfX + 30, 41, 10, 11, '#334155');
      px(shelfX + 32, 43, 6, 2, '#22c55e');
      px(shelfX + 32, 47, 6, 2, '#38bdf8');

      // 5. Large Potted Monstera Plant (Floor Left)
      const plantX = 14;
      const plantY = 102;
      // Terracotta pot
      px(plantX + 4, plantY + 12, 20, 18, '#c2410c');
      px(plantX + 2, plantY + 9, 24, 4, '#ea580c');
      px(plantX + 6, plantY + 16, 16, 14, '#9a3412');
      // Lush leaves with gentle sway
      const sway = effectiveReducedMotion ? 0 : slowFrame % 2 === 0 ? 0 : 1;
      px(plantX + 12, plantY - 8, 3, 18, '#14532d');
      px(plantX + 2 + sway, plantY - 12, 12, 9, '#15803d');
      px(plantX + 14 - sway, plantY - 16, 13, 10, '#16a34a');
      px(plantX + 6, plantY - 22, 14, 9, '#22c55e');
      px(plantX - 2 + sway, plantY - 2, 13, 8, '#16a34a');
      px(plantX + 16 - sway, plantY - 4, 14, 9, '#15803d');

      // 6. Ergonomic Chair & AI Character (Center)
      const charX = 104;
      const charY = 66;
      // Chair backrest
      px(charX - 4, charY + 8, 34, 34, '#1e293b');
      px(charX - 2, charY + 10, 30, 30, '#334155');

      // AI Character Bobbing & Pose based on `activityState`
      let headBobY = 0;
      if (!effectiveReducedMotion) {
        if (activityState === 'WORKING') {
          headBobY = fastFrame % 2;
        } else if (activityState === 'IDLE' || activityState === 'WAITING') {
          headBobY = slowFrame % 2;
        } else if (activityState === 'COMPLETED') {
          headBobY = -(medFrame % 3);
        }
      }

      // Character Shoulders / Hoodie
      const hoodieColor =
        activityState === 'ERROR'
          ? '#991b1b'
          : activityState === 'DISCONNECTED'
          ? '#475569'
          : '#3b82f6';
      px(charX + 1, charY + 20 + headBobY, 24, 18, hoodieColor);
      px(charX + 4, charY + 22 + headBobY, 18, 14, '#2563eb');

      // AI Robot/Developer Head (Cute CRT/Visor Bot)
      const headY = charY + headBobY;
      px(charX + 2, headY, 22, 20, '#cbd5e1');
      px(charX + 4, headY - 2, 18, 2, '#94a3b8');
      // Antenna on top of head
      px(charX + 12, headY - 7, 2, 5, '#64748b');
      const antennaColor =
        activityState === 'WORKING'
          ? '#22c55e'
          : activityState === 'THINKING'
          ? '#f59e0b'
          : activityState === 'ERROR'
          ? '#ef4444'
          : activityState === 'COMPLETED'
          ? '#10b981'
          : activityState === 'DISCONNECTED'
          ? '#64748b'
          : '#38bdf8';
      px(charX + 11, headY - 10, 4, 4, antennaColor);

      // Face Visor Screen
      px(charX + 5, headY + 4, 16, 11, '#0f172a');

      // Eyes / Expression inside Visor based on state
      if (activityState === 'DISCONNECTED') {
        // Sleeping / Offline dashes
        px(charX + 7, headY + 9, 4, 1, '#64748b');
        px(charX + 15, headY + 9, 4, 1, '#64748b');
      } else if (activityState === 'ERROR') {
        // Red X eyes
        px(charX + 7, headY + 7, 3, 3, '#ef4444');
        px(charX + 16, headY + 7, 3, 3, '#ef4444');
        px(charX + 10, headY + 12, 6, 1, '#ef4444');
      } else if (activityState === 'COMPLETED') {
        // Happy ^ ^ eyes
        px(charX + 7, headY + 8, 4, 2, '#4ade80');
        px(charX + 15, headY + 8, 4, 2, '#4ade80');
        px(charX + 11, headY + 12, 4, 1, '#4ade80');
      } else if (activityState === 'THINKING') {
        // Looking up / thinking eyes
        const lookShift = medFrame % 2;
        px(charX + 7 + lookShift, headY + 6, 3, 4, '#fbbf24');
        px(charX + 15 + lookShift, headY + 6, 3, 4, '#fbbf24');
      } else if (activityState === 'WORKING') {
        // Focused cyan coding eyes scanning code
        const scanShift = fastFrame % 2;
        px(charX + 7 + scanShift, headY + 8, 3, 3, '#38bdf8');
        px(charX + 15 + scanShift, headY + 8, 3, 3, '#38bdf8');
      } else {
        // IDLE or WAITING (with occasional blink)
        const blinking = !effectiveReducedMotion && slowFrame % 9 === 0;
        if (blinking) {
          px(charX + 7, headY + 9, 4, 1, '#38bdf8');
          px(charX + 15, headY + 9, 4, 1, '#38bdf8');
        } else {
          px(charX + 7, headY + 7, 3, 4, '#38bdf8');
          px(charX + 15, headY + 7, 3, 4, '#38bdf8');
        }
      }

      // 7. Wooden Desk (Foreground Spanning Center)
      const deskX = 46;
      const deskY = 98;
      const deskW = 152;
      // Desk surface & front apron
      px(deskX, deskY, deskW, 6, '#9a5b32');
      px(deskX + 2, deskY + 1, deskW - 4, 2, '#b87042');
      px(deskX + 4, deskY + 6, deskW - 8, 8, '#6e3f20');
      // Desk legs & side drawer unit
      px(deskX + 6, deskY + 14, 8, 26, '#542f17');
      px(deskX + deskW - 40, deskY + 14, 34, 26, '#6e3f20');
      px(deskX + deskW - 37, deskY + 16, 28, 9, '#854d27');
      px(deskX + deskW - 25, deskY + 19, 4, 2, '#fbbf24'); // Drawer handle 1
      px(deskX + deskW - 37, deskY + 28, 28, 9, '#854d27');
      px(deskX + deskW - 25, deskY + 31, 4, 2, '#fbbf24'); // Drawer handle 2

      // Character Hands on Desk / Keyboard
      if (activityState === 'WORKING') {
        const leftHandY = deskY - 3 - (fastFrame % 2);
        const rightHandY = deskY - 3 - ((fastFrame + 1) % 2);
        px(charX + 3, leftHandY, 5, 4, '#cbd5e1');
        px(charX + 18, rightHandY, 5, 4, '#cbd5e1');
      } else if (activityState === 'COMPLETED') {
        // Raised celebratory hands
        px(charX - 4, charY + 14, 5, 5, '#cbd5e1');
        px(charX + 25, charY + 14, 5, 5, '#cbd5e1');
      } else {
        // Resting hands
        px(charX + 2, deskY - 3, 5, 3, '#cbd5e1');
        px(charX + 19, deskY - 3, 5, 3, '#cbd5e1');
      }

      // 8. Mechanical Keyboard on Desk
      px(charX + 1, deskY - 1, 24, 3, '#334155');
      for (let kx = charX + 3; kx < charX + 23; kx += 3) {
        const keyActive =
          activityState === 'WORKING' && (kx + fastFrame) % 2 === 0;
        px(kx, deskY - 2, 2, 1, keyActive ? '#38bdf8' : '#94a3b8');
      }

      // 9. Computer Monitor on Desk (Right-Center of Desk)
      const monX = 136;
      const monY = 66;
      // Monitor Stand
      px(monX + 16, deskY - 6, 8, 6, '#475569');
      px(monX + 10, deskY - 2, 20, 2, '#64748b');
      // Monitor Bezel & Screen
      px(monX, monY, 40, 27, '#1e293b');
      px(monX + 2, monY + 2, 36, 23, '#090d16');

      // Animated Code Lines on Monitor Screen
      const codeColors =
        activityState === 'ERROR'
          ? ['#ef4444', '#f87171', '#fca5a5', '#ef4444']
          : activityState === 'DISCONNECTED'
          ? ['#334155', '#475569', '#334155', '#1e293b']
          : ['#4ade80', '#38bdf8', '#fbbf24', '#c084fc', '#2dd4bf'];

      for (let lineIdx = 0; lineIdx < 6; lineIdx++) {
        const ly = monY + 5 + lineIdx * 3;
        const indent = (lineIdx % 3) * 3;
        const dynamicLen =
          activityState === 'WORKING'
            ? 8 + ((lineIdx * 7 + fastFrame * 3) % 18)
            : 10 + ((lineIdx * 5) % 16);
        const c = codeColors[(lineIdx + (activityState === 'WORKING' ? medFrame : 0)) % codeColors.length];
        px(monX + 5 + indent, ly, Math.min(28 - indent, dynamicLen), 2, c);
      }

      // 10. Warm Desk Lamp & Ambient Lighting Cone (Left of Desk)
      const lampX = 56;
      const lampY = 72;
      // Lamp Base & Articulated Arm
      px(lampX, deskY - 2, 12, 2, '#d97706');
      px(lampX + 3, lampY + 6, 2, 20, '#f59e0b');
      px(lampX + 4, lampY + 4, 10, 2, '#f59e0b');
      // Lamp Shade
      px(lampX + 10, lampY + 3, 12, 5, '#b45309');
      px(lampX + 12, lampY + 8, 8, 2, '#fef08a');
      // Soft Warm Ambient Glow Effect
      ctx.fillStyle = 'rgba(254, 240, 138, 0.08)';
      ctx.fillRect(lampX + 4, lampY + 10, 44, 18);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.05)';
      ctx.fillRect(lampX - 4, lampY + 16, 76, 16);

      // 11. Steaming Coffee Mug & Desk Succulent
      const mugX = 82;
      const mugY = deskY - 6;
      px(mugX, mugY, 6, 6, '#f43f5e');
      px(mugX + 6, mugY + 1, 2, 4, '#e11d48');
      px(mugX + 1, mugY, 4, 1, '#fde047');
      // Animated Steam wisps
      if (!effectiveReducedMotion) {
        const steamShift = slowFrame % 2;
        px(mugX + 1 + steamShift, mugY - 3, 1, 2, '#e2e8f088');
        px(mugX + 3 - steamShift, mugY - 6, 1, 2, '#e2e8f066');
      }

      // Small Desk Succulent on far right of desk
      px(184, deskY - 5, 8, 5, '#d97706');
      px(185, deskY - 9, 6, 4, '#22c55e');
      px(183, deskY - 7, 2, 3, '#16a34a');
      px(189, deskY - 7, 2, 3, '#16a34a');

      // 12. Floating Pixel Status Bubble above AI Character
      const bubX = charX + 4;
      const bubY = charY - 24;
      px(bubX, bubY, 20, 11, '#f8fafc');
      px(bubX + 1, bubY + 1, 18, 9, '#0f172a');
      px(bubX + 8, bubY + 11, 3, 2, '#f8fafc');

      if (activityState === 'THINKING') {
        const dotCount = (medFrame % 3) + 1;
        for (let d = 0; d < dotCount; d++) {
          px(bubX + 4 + d * 5, bubY + 4, 3, 3, '#fbbf24');
        }
      } else if (activityState === 'WORKING') {
        // Code brackets < / >
        px(bubX + 4, bubY + 4, 2, 3, '#38bdf8');
        px(bubX + 9, bubY + 3, 2, 5, '#4ade80');
        px(bubX + 14, bubY + 4, 2, 3, '#38bdf8');
      } else if (activityState === 'WAITING') {
        // Hourglass / Pause bars
        px(bubX + 7, bubY + 3, 2, 5, '#fbbf24');
        px(bubX + 11, bubY + 3, 2, 5, '#fbbf24');
      } else if (activityState === 'COMPLETED') {
        // Green Checkmark
        px(bubX + 6, bubY + 6, 2, 2, '#4ade80');
        px(bubX + 8, bubY + 7, 2, 2, '#4ade80');
        px(bubX + 10, bubY + 5, 2, 2, '#4ade80');
        px(bubX + 12, bubY + 3, 2, 2, '#4ade80');
      } else if (activityState === 'ERROR') {
        // Red Exclamation !
        px(bubX + 9, bubY + 2, 2, 4, '#ef4444');
        px(bubX + 9, bubY + 7, 2, 2, '#ef4444');
      } else if (activityState === 'DISCONNECTED') {
        // Gray Offline dash
        px(bubX + 6, bubY + 5, 8, 2, '#94a3b8');
      } else {
        // IDLE cozy musical note / coffee Zzz
        px(bubX + 8, bubY + 4, 4, 3, '#38bdf8');
      }
    };

    const renderLoop = () => {
      tick++;
      drawScene(tick);
      if (!effectiveReducedMotion) {
        animFrameId = requestAnimationFrame(renderLoop);
      }
    };

    drawScene(0);
    if (!effectiveReducedMotion) {
      animFrameId = requestAnimationFrame(renderLoop);
    }

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [activityState, effectiveReducedMotion]);

  const stateBadgeColors: Record<AgentActivityState, string> = {
    IDLE: 'vo-state-idle',
    THINKING: 'vo-state-thinking',
    WORKING: 'vo-state-working',
    WAITING: 'vo-state-waiting',
    COMPLETED: 'vo-state-completed',
    ERROR: 'vo-state-error',
    DISCONNECTED: 'vo-state-disconnected',
  };

  const stateDescriptions: Record<AgentActivityState, string> = {
    IDLE: t.stateIdle,
    THINKING: t.stateThinking,
    WORKING: t.stateWorking,
    WAITING: t.stateWaiting,
    COMPLETED: t.stateCompleted,
    ERROR: t.stateError,
    DISCONNECTED: t.stateDisconnected,
  };

  return (
    <aside className="vo-office-panel" aria-label={t.officeTitle}>
      {/* Top Header inside Virtual Office */}
      <div className="vo-office-header">
        <div className="vo-office-title-row">
          <span className="vo-pixel-dot" />
          <span className="vo-office-heading">{t.officeTitle}</span>
          {isSimulated && (
            <span className="vo-demo-pill" title="Simulated Demo Adapter Active">
              {t.demoMode}
            </span>
          )}
        </div>
        <div className={`vo-character-state-pill ${stateBadgeColors[activityState]}`}>
          <Sparkles size={12} />
          <span>{t.statePrefix} {activityState}</span>
        </div>
      </div>

      {/* Crisp Pixel-Art Canvas Viewport */}
      <div className="vo-canvas-container">
        <canvas
          ref={canvasRef}
          width={PIXEL_W}
          height={PIXEL_H}
          className="vo-pixel-canvas"
        />
        <div className="vo-canvas-caption">
          <span>{stateDescriptions[activityState]}</span>
        </div>
      </div>

      {/* Compact Office Status Grid (Phase 4.3) */}
      <div className="vo-office-status-card">
        <div className="vo-status-grid">
          <div className="vo-status-cell">
            <span className="vo-status-label">
              <FolderGit2 size={11} /> {t.projectCell}
            </span>
            <span
              className="vo-status-value"
              title={selectedProject?.path || t.noneSelected}
            >
              {selectedProject ? selectedProject.name : t.noneSelected}
            </span>
          </div>

          <div className="vo-status-cell">
            <span className="vo-status-label">
              {connectionStatus === 'CONNECTED' ? (
                <Wifi size={11} />
              ) : connectionStatus === 'DEMO_MODE' ? (
                <Terminal size={11} />
              ) : (
                <WifiOff size={11} />
              )}
              {t.connectionCell}
            </span>
            <span className="vo-status-value">
              {connectionStatus === 'CONNECTED'
                ? (language === 'vi' ? 'Antigravity CLI (Trực tiếp)' : 'Antigravity CLI (Live)')
                : connectionStatus === 'DEMO_MODE'
                ? (language === 'vi' ? 'Demo Mô phỏng' : 'Demo Adapter (Simulated)')
                : connectionStatus}
            </span>
          </div>

          <div className="vo-status-cell">
            <span className="vo-status-label">
              <CheckCircle2 size={11} /> {t.completedCell}
            </span>
            <span className="vo-status-value">{completedTasksCount} {language === 'vi' ? 'Tác vụ' : 'Tasks'}</span>
          </div>

          <div className="vo-status-cell">
            <span className="vo-status-label">
              <Clock size={11} /> {t.sessionCell}
            </span>
            <span className="vo-status-value">{sessionDurationStr}</span>
          </div>
        </div>

        <div className="vo-current-task-bar">
          <span className="vo-status-label">{t.activeTaskCell}</span>
          <span className="vo-current-task-text" title={currentTask}>
            {currentTask}
          </span>
        </div>
      </div>

      {/* Live Activity Feed (Phase 4.4) */}
      <div className="vo-activity-section">
        <div className="vo-activity-header">
          <Activity size={13} />
          <span>{t.activityFeedTitle}</span>
          <span className="vo-activity-count">{activityFeed.length}</span>
        </div>
        <div className="vo-activity-list">
          {activityFeed.length === 0 ? (
            <div className="vo-activity-empty">
              {t.noEventsYet}
            </div>
          ) : (
            activityFeed.map((item) => (
              <div key={item.id} className={`vo-activity-item vo-act-${item.type.toLowerCase()}`}>
                <div className="vo-activity-top">
                  <span className="vo-activity-time">
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  {item.isSimulated && (
                    <span className="vo-activity-sim-tag">[SIMULATED]</span>
                  )}
                  <span className="vo-activity-type">{item.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="vo-activity-summary">{item.summary}</div>
                {item.detail && <div className="vo-activity-detail">{item.detail}</div>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Persistent Bottom-Right Usage Status Bar Slot (Phase 7) */}
      <div className="vo-office-footer-slot">{children}</div>
    </aside>
  );
};
