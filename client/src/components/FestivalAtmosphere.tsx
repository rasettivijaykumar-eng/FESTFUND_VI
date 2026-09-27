import { useEffect, useRef } from "react";
import { useMotionPref } from "../context/AppState";

export function FestivalAtmosphere() {
  const { reduced } = useMotionPref();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    const ratio = window.devicePixelRatio || 1;
    const dots = Array.from({ length: 42 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 1.4 + Math.random() * 1.8,
      s: 0.15 + Math.random() * 0.35,
      a: 0.4 + Math.random() * 0.4,
    }));

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint();
    };

    const paint = () => {
      ctx.clearRect(0, 0, width, height);
      dots.forEach((dot) => {
        ctx.beginPath();
        ctx.fillStyle = `rgba(222, ${92 + dot.r * 20}, 15, ${dot.a})`;
        ctx.arc(dot.x * width, dot.y * height, dot.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const animate = () => {
      dots.forEach((dot) => {
        dot.y -= dot.s / 400;
        if (dot.y < 0) dot.y = 1;
      });
      paint();
      frame = requestAnimationFrame(animate);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduced) frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [reduced]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
