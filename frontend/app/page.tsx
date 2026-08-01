"use client";

import Link from "next/link";
import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import icon from "./icon.png";

const RING_RADIUS = 180;
const PARTICLE_COUNT = 240;

type Particle = {
  angle: number;
  distance: number;
  speed: number;
  size: number;
  opacity: number;
  history: Array<{ x: number; y: number }>;
  historyLimit: number;
  x: number;
  y: number;
};

type Pulse = {
  angle: number;
  distance: number;
  speed: number;
  life: number;
  decay: number;
  x: number;
  y: number;
};

function createParticle(): Particle {
  return {
    angle: Math.random() * Math.PI * 2,
    distance: RING_RADIUS + (Math.random() - 0.5) * 120,
    speed: (0.002 + Math.random() * 0.005) * (Math.random() > 0.5 ? 1 : -1),
    size: 0.5 + Math.random() * 1.5,
    opacity: 0.1 + Math.random() * 0.4,
    history: [],
    historyLimit: 15 + Math.floor(Math.random() * 20),
    x: 0,
    y: 0
  };
}

function createPulse(radius: number): Pulse {
  return {
    angle: Math.random() * Math.PI * 2,
    distance: radius + (Math.random() - 0.5) * 40,
    speed: 0.02 + Math.random() * 0.03,
    life: 1,
    decay: 0.005 + Math.random() * 0.01,
    x: 0,
    y: 0
  };
}

export default function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const currentCanvas = canvasRef.current;
    const context = currentCanvas?.getContext("2d");
    if (!currentCanvas || !context) return;
    const drawingCanvas: HTMLCanvasElement = currentCanvas;
    const drawingContext: CanvasRenderingContext2D = context;

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let currentRingRadius = RING_RADIUS;
    let currentParticleCount = PARTICLE_COUNT;
    let particles: Particle[] = [];
    let pulses: Pulse[] = [];
    let animationFrame = 0;

    function init() {
      width = window.innerWidth;
      height = window.innerHeight;
      const isMobile = width < 768;
      currentRingRadius = isMobile ? 104 : RING_RADIUS;
      currentParticleCount = isMobile ? 120 : PARTICLE_COUNT;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      drawingCanvas.width = Math.floor(width * dpr);
      drawingCanvas.height = Math.floor(height * dpr);
      drawingCanvas.style.width = `${width}px`;
      drawingCanvas.style.height = `${height}px`;
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawingContext.lineCap = "round";
      drawingContext.lineJoin = "round";
      centerX = width / 2;
      centerY = height * (isMobile ? 0.5 : 0.48);
      particles = Array.from({ length: currentParticleCount }, createParticle);
      for (let step = 0; step < 24; step += 1) {
        particles.forEach(updateParticle);
      }
    }

    function drawPoolRing() {
      drawingContext.beginPath();
      drawingContext.arc(centerX, centerY, currentRingRadius, 0, Math.PI * 2);
      drawingContext.strokeStyle = "rgba(78, 222, 163, 0.08)";
      drawingContext.lineWidth = 10;
      drawingContext.stroke();

      drawingContext.beginPath();
      drawingContext.arc(centerX, centerY, currentRingRadius, 0, Math.PI * 2);
      drawingContext.strokeStyle = "rgba(78, 222, 163, 0.16)";
      drawingContext.lineWidth = 1;
      drawingContext.setLineDash([5, 15]);
      drawingContext.stroke();
      drawingContext.setLineDash([]);
    }

    function updateParticle(particle: Particle) {
      particle.angle += particle.speed;
      const currentDistance = particle.distance + Math.sin(particle.angle * 3) * 15;

      particle.x = centerX + Math.cos(particle.angle) * currentDistance;
      particle.y = centerY + Math.sin(particle.angle) * currentDistance;
      particle.history.push({ x: particle.x, y: particle.y });

      if (particle.history.length > particle.historyLimit) {
        particle.history.shift();
      }
    }

    function drawParticle(particle: Particle) {
      if (particle.history.length < 2) return;

      drawingContext.beginPath();
      drawingContext.moveTo(particle.history[0].x, particle.history[0].y);
      for (let i = 1; i < particle.history.length; i += 1) {
        drawingContext.lineTo(particle.history[i].x, particle.history[i].y);
      }
      drawingContext.strokeStyle = `rgba(78, 222, 163, ${particle.opacity * 0.75})`;
      drawingContext.lineWidth = particle.size;
      drawingContext.stroke();

      drawingContext.beginPath();
      drawingContext.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      drawingContext.fillStyle = `rgba(78, 222, 163, ${Math.min(particle.opacity * 1.15, 0.55)})`;
      drawingContext.fill();
    }

    function updatePulse(pulse: Pulse) {
      pulse.angle += pulse.speed;
      pulse.life -= pulse.decay;
      pulse.x = centerX + Math.cos(pulse.angle) * pulse.distance;
      pulse.y = centerY + Math.sin(pulse.angle) * pulse.distance;
      return pulse.life > 0;
    }

    function drawPulse(pulse: Pulse) {
      const gradient = drawingContext.createRadialGradient(pulse.x, pulse.y, 0, pulse.x, pulse.y, 25);
      gradient.addColorStop(0, `rgba(111, 251, 190, ${pulse.life * 0.8})`);
      gradient.addColorStop(1, "rgba(111, 251, 190, 0)");

      drawingContext.fillStyle = gradient;
      drawingContext.beginPath();
      drawingContext.arc(pulse.x, pulse.y, 25, 0, Math.PI * 2);
      drawingContext.fill();

      drawingContext.beginPath();
      drawingContext.arc(pulse.x, pulse.y, 2, 0, Math.PI * 2);
      drawingContext.fillStyle = `rgba(255, 255, 255, ${pulse.life})`;
      drawingContext.fill();
    }

    function drawFrame() {
      drawingContext.clearRect(0, 0, width, height);
      drawPoolRing();

      particles.forEach((particle) => {
        updateParticle(particle);
        drawParticle(particle);
      });

      pulses = pulses.filter((pulse) => {
        const alive = updatePulse(pulse);
        if (alive) drawPulse(pulse);
        return alive;
      });
    }

    function animate() {
      if (Math.random() < 0.03) {
        pulses.push(createPulse(currentRingRadius));
      }
      drawFrame();
      animationFrame = requestAnimationFrame(animate);
    }

    init();
    drawFrame();
    animate();
    window.addEventListener("resize", init);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", init);
    };
  }, []);

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-on-background">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.07] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:h-[72px] md:px-8">
          <Link className="flex items-center gap-3" href="/">
            <Image alt="HookFlow" className="h-8 w-8 rounded-lg md:h-9 md:w-9 md:rounded-xl" src={icon} />
            <span className="font-display text-lg font-bold tracking-[-0.03em] text-white md:text-xl">HookFlow</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-on-surface-variant md:flex">
            <Link className="transition hover:text-primary" href="/dashboard">Dashboard</Link>
            <Link className="transition hover:text-primary" href="/create">Create pool</Link>
            <Link className="transition hover:text-primary" href="/phantom">Phantom Router</Link>
          </nav>
          <Link className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary md:px-4" href="/dashboard">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="hidden sm:inline">Live on</span> Sepolia
          </Link>
        </div>
      </header>

      <section className="relative min-h-[100svh] overflow-hidden px-4 pb-12 pt-24 md:px-8 md:pb-20 md:pt-32">
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="orb-glow absolute right-[-15%] top-[5%] h-[680px] w-[680px] rounded-full opacity-35" />
          <canvas ref={canvasRef} className="h-full w-full opacity-45" id="liquidity-currents-canvas" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-9rem)] w-full max-w-7xl items-center justify-center text-center md:min-h-[calc(100svh-13rem)]">
          <div className="mx-auto max-w-4xl">
            <div className="mx-auto mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-primary md:px-4 md:text-[10px]">
              <span className="material-symbols-outlined text-sm">verified_user</span>
              Protected liquidity · Private routing
            </div>
            <h1 className="mx-auto max-w-3xl font-display text-[36px] font-bold leading-[1.04] tracking-[-0.04em] text-white sm:text-[46px] lg:text-[56px]">
              Better liquidity starts with <span className="text-primary">better flow.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-on-surface-variant md:text-base md:leading-7">
              Create protected v4 pools and route private swaps with iExec Nox.
            </p>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-xs font-extrabold uppercase tracking-[0.08em] text-on-primary shadow-glow transition hover:bg-primary-fixed md:px-6 md:py-4" href="/phantom">
                Try confidential routing
                <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">arrow_forward</span>
              </Link>
              <Link className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3.5 text-sm font-bold text-white transition hover:border-primary/40 hover:bg-primary/[0.06] md:px-6 md:py-4" href="/create">
                Create a protected pool
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
