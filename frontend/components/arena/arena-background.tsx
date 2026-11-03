'use client';

export function ArenaBackground({ paused = false }: { paused?: boolean }) {
  return (
    <div className="arena-background pointer-events-none" aria-hidden="true">
      <div className="pointer-events-none absolute -top-40 left-1/4 w-[650px] h-[650px] rounded-full bg-emeraldPro/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-20 right-10 w-[420px] h-[420px] rounded-full bg-volt/5 blur-[120px]" />
    </div>
  );
}
