"use client";

import { useMemo } from "react";

export default function ParticleBackground() {
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, index) => ({
        id: index,
        size: 30 + (index % 6) * 14,
        left: `${(index * 11) % 100}%`,
        top: `${(index * 7) % 100}%`,
        duration: `${8 + (index % 8)}s`,
        delay: `${(index % 5) * 0.7}s`,
      })),
    []
  );

  return (
    <div className="particles" aria-hidden>
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="particle"
          style={{
            width: particle.size,
            height: particle.size,
            left: particle.left,
            top: particle.top,
            animationDuration: particle.duration,
            animationDelay: particle.delay,
          }}
        />
      ))}
    </div>
  );
}
