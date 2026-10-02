type Tier = { count: number; spread: number; power: number; bursts: number };

const TIERS: Record<number, Tier> = {
  20: { count: 70, spread: 70, power: 15, bursts: 1 },
  50: { count: 110, spread: 90, power: 18, bursts: 2 },
  100: { count: 150, spread: 110, power: 21, bursts: 3 },
};

export const CONFETTI_MILESTONES = Object.keys(TIERS).map(Number);

const COLORS = ["#426d53", "#8fc69e", "#e9b44c", "#e26d5c", "#6aa6d6", "#c9a0dc"];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  wobble: number;
  wobbleSpeed: number;
  round: boolean;
  life: number;
};

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function makePieces(originX: number, originY: number, tier: Tier): Piece[] {
  return Array.from({ length: tier.count }, () => {
    const angle = (-90 + (Math.random() - 0.5) * tier.spread) * (Math.PI / 180);
    const speed = tier.power * (0.45 + Math.random() * 0.75);
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.35,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.08 + Math.random() * 0.1,
      round: Math.random() < 0.25,
      life: 1,
    };
  });
}

/** Fires a confetti burst from a point (viewport px). No-op for reduced-motion users. */
export function fireConfetti(milestone: number, origin: { x: number; y: number }) {
  const tier = TIERS[milestone];
  if (!tier || reducedMotion()) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2000",
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  let pieces: Piece[] = [];
  const launch = () => {
    pieces = pieces.concat(makePieces(origin.x, origin.y, tier));
  };
  launch();
  for (let i = 1; i < tier.bursts; i += 1) window.setTimeout(launch, i * 220);

  let last = performance.now();
  const startedAt = last;

  function frame(now: number) {
    // Normalise to 60fps so the motion is identical on high-refresh screens.
    const step = Math.min((now - last) / 16.667, 3);
    last = now;
    ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (const p of pieces) {
      p.vx *= Math.pow(0.985, step);
      p.vy = p.vy * Math.pow(0.985, step) + 0.38 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rotation += p.spin * step;
      p.wobble += p.wobbleSpeed * step;
      if (p.y > window.innerHeight * 0.55 || p.vy > 6) p.life -= 0.012 * step;

      ctx!.save();
      ctx!.globalAlpha = Math.max(p.life, 0);
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rotation);
      ctx!.scale(1, Math.cos(p.wobble));
      ctx!.fillStyle = p.color;
      if (p.round) {
        ctx!.beginPath();
        ctx!.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
        ctx!.fill();
      } else {
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx!.restore();
    }

    pieces = pieces.filter((p) => p.life > 0 && p.y < window.innerHeight + 40);

    const bursting = now - startedAt < tier.bursts * 220;
    if (pieces.length > 0 || bursting) {
      window.requestAnimationFrame(frame);
    } else {
      window.removeEventListener("resize", resize);
      canvas.remove();
    }
  }

  window.requestAnimationFrame(frame);
}
