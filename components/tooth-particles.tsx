"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  radius: number;
  speedX: number;
  speedY: number;
  opacity: number;
}

const PARTICLE_COUNT = 120;

export function ToothParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    function initParticles() {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * canvas!.width,
        y: Math.random() * canvas!.height,
        radius: 1 + Math.random() * 2.5,
        speedX: (Math.random() - 0.5) * 0.25,
        speedY: (Math.random() - 0.5) * 0.25,
        opacity: 0.06 + Math.random() * 0.12,
      }));
    }

    function animate() {
      const w = canvas!.width;
      const h = canvas!.height;
      ctx!.clearRect(0, 0, w, h);

      for (const p of particlesRef.current) {
        p.x += p.speedX;
        p.y += p.speedY;

        // Wrap around edges
        if (p.x < -5) p.x = w + 5;
        if (p.x > w + 5) p.x = -5;
        if (p.y < -5) p.y = h + 5;
        if (p.y > h + 5) p.y = -5;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.globalAlpha = p.opacity;
        ctx!.fillStyle = "#000000";
        ctx!.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    }

    resize();
    initParticles();
    animate();

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
