import { useId, type ReactNode } from "react";
import { BANNER_COLORS, type BannerArt, type BannerColor } from "@/config/banners";
import { cn } from "@/lib/utils";

// Banner artwork: fine white linework on a 320×120 canvas, weighted right and faded out to the left,
// so a title always sits on clean colour. Strokes stay thin and translucent so every piece suits every colour.
const W = "#fff";
const line = { stroke: W, strokeWidth: 1.25, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const polar = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)] as const;

function Sparkle({ x, y, s = 5, o = 0.8 }: { x: number; y: number; s?: number; o?: number }) {
  return <path d={`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`} fill={W} fillOpacity={o} />;
}

function art(key: BannerArt, id: string): ReactNode {
  switch (key) {
    // Trip: topographic ridgelines.
    case "mountains":
      return (
        <>
          {range(8).map((i) => {
            const y = 34 + i * 11;
            return (
              <path
                key={i}
                {...line}
                strokeOpacity={0.16 + i * 0.07}
                d={`M110 ${y + 8}L142 ${y - 2}L166 ${y + 4}L198 ${y - 18}L222 ${y - 4}L254 ${y - 30}L284 ${y - 8}L306 ${y - 16}L330 ${y - 4}`}
              />
            );
          })}
          <circle cx="282" cy="22" r="9" fill={W} fillOpacity={0.85} />
        </>
      );
    // Trip: sun on the horizon, cut by sunset bands.
    case "beach":
      return (
        <>
          <defs>
            <mask id={`${id}-bands`}>
              <rect width="320" height="120" fill={W} />
              {range(5).map((i) => (
                <rect key={i} x="0" y={62 + i * 7} width="320" height={1.5 + i * 0.8} fill="#000" />
              ))}
            </mask>
            <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={W} stopOpacity={0.95} />
              <stop offset="1" stopColor={W} stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <circle cx="248" cy="70" r="40" fill={`url(#${id}-sun)`} mask={`url(#${id}-bands)`} />
          <path {...line} strokeOpacity={0.7} d="M120 98H330" />
          {range(3).map((i) => (
            <path key={i} {...line} strokeOpacity={0.4 - i * 0.1} d={`M${150 + i * 18} ${105 + i * 6}H${330 - i * 20}`} />
          ))}
        </>
      );
    // Party: a burst of light from the corner.
    case "confetti":
      return (
        <>
          {range(22).map((i) => {
            const [x, y] = polar(318, -6, 300, 92 + i * 4.2);
            return <path key={i} {...line} strokeWidth={1} strokeOpacity={0.1 + (i % 3) * 0.08} d={`M318 -6L${x} ${y}`} />;
          })}
          {[46, 84, 124].map((r, i) => (
            <circle key={r} cx="318" cy="-6" r={r} {...line} strokeOpacity={0.45 - i * 0.12} />
          ))}
          <Sparkle x={236} y={74} s={7} o={0.95} />
          <Sparkle x={196} y={36} s={4} o={0.7} />
          <Sparkle x={280} y={98} s={5} o={0.8} />
        </>
      );
    // Party: orbiting rings.
    case "balloons":
      return (
        <>
          {[40, 64, 90, 118].map((r, i) => (
            <circle key={r} cx="262" cy="60" r={r} {...line} strokeOpacity={0.5 - i * 0.1} />
          ))}
          <circle cx="262" cy="60" r="18" fill={W} fillOpacity={0.9} />
          {(
            [
              [40, 200],
              [64, 320],
              [90, 160],
              [118, 215],
            ] as const
          ).map(([r, deg]) => {
            const [x, y] = polar(262, 60, r, deg);
            return <circle key={r} cx={x} cy={y} r={3.5} fill={W} fillOpacity={0.9} />;
          })}
        </>
      );
    // Event: two soft spotlights on a stage line.
    case "stage":
      return (
        <>
          <defs>
            <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={W} stopOpacity={0.5} />
              <stop offset="1" stopColor={W} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d="M204 0h8l46 104h-100Z" fill={`url(#${id}-beam)`} />
          <path d="M284 0h8l38 104h-86Z" fill={`url(#${id}-beam)`} opacity={0.75} />
          <ellipse cx="208" cy="104" rx="50" ry="5" {...line} strokeOpacity={0.45} />
          <ellipse cx="288" cy="104" rx="42" ry="4" {...line} strokeOpacity={0.35} />
          <path {...line} strokeOpacity={0.6} d="M130 110H330" />
          <Sparkle x={250} y={36} s={5} />
          <Sparkle x={168} y={56} s={3.5} o={0.6} />
        </>
      );
    // Event: a ticket outline with its perforation.
    case "tickets":
      return (
        <>
          <g transform="translate(246 62) rotate(-8)">
            <path
              {...line}
              strokeOpacity={0.85}
              strokeWidth={1.5}
              d="M-78-38H78V-10a10 10 0 0 0 0 20V38H-78V10a10 10 0 0 0 0-20Z"
            />
            <path {...line} strokeOpacity={0.3} d="M-68-28H68M-68 28H68" />
            <path {...line} strokeOpacity={0.6} strokeDasharray="2 5" d="M34-34V34" />
            <path {...line} strokeOpacity={0.6} d="M-52-8H8M-52 4H-10" />
            <Sparkle x={56} y={0} s={7} o={0.95} />
          </g>
        </>
      );
    // Home: a fine-line skyline with a few lit windows.
    case "homes":
      return (
        <>
          <path
            {...line}
            strokeOpacity={0.75}
            d="M120 110H146V82L160 70L174 82V110H182V56H214V110H222V74L246 54L270 74V110H278V88H300V64H318V110H330"
          />
          {range(4).map((r) =>
            range(3).map((c) => (
              <rect key={`${r}-${c}`} x={188 + c * 8} y={64 + r * 10} width={4} height={5} rx={0.5} fill={W} fillOpacity={(r + c) % 3 === 0 ? 0.9 : 0.25} />
            )),
          )}
          <path {...line} strokeOpacity={0.5} d="M240 110V92H252V110" />
          <circle cx="290" cy="30" r="10" {...line} strokeOpacity={0.7} />
          <circle cx="294" cy="27" r="9" fill={W} fillOpacity={0.12} />
        </>
      );
    // Dinner: a place setting from above.
    case "dinner":
      return (
        <>
          <circle cx="252" cy="60" r="44" {...line} strokeOpacity={0.35} />
          <circle cx="252" cy="60" r="34" {...line} strokeOpacity={0.8} strokeWidth={1.5} />
          <circle cx="252" cy="60" r="22" fill={W} fillOpacity={0.12} />
          <path {...line} strokeOpacity={0.8} strokeWidth={1.5} d="M190 28V92M184 28V42a6 6 0 0 0 12 0V28" />
          <path {...line} strokeOpacity={0.8} strokeWidth={1.5} d="M314 92V28c-7 6-9 18-9 30h9" />
          <path {...line} strokeOpacity={0.5} d="M152 30h14l-1.5 12a5.5 5.5 0 0 1-11 0ZM159 48v12m-5 0h10" />
        </>
      );
    // Anything: flowing lines.
    case "waves":
      return (
        <>
          {range(16).map((i) => (
            <path
              key={i}
              {...line}
              strokeWidth={1}
              strokeOpacity={0.12 + (i / 15) * 0.5}
              d={`M60 ${8 + i * 7}C130 ${-6 + i * 7} 170 ${30 + i * 7} 230 ${14 + i * 7}S300 ${-2 + i * 7} 340 ${10 + i * 7}`}
            />
          ))}
        </>
      );
    // Anything: a dot grid with one confident circle.
    case "shapes":
      return (
        <>
          {range(7).map((r) =>
            range(11).map((c) => <circle key={`${r}-${c}`} cx={130 + c * 18} cy={8 + r * 18} r={1.1} fill={W} fillOpacity={0.4} />),
          )}
          <circle cx="262" cy="62" r="46" {...line} strokeOpacity={0.75} strokeWidth={1.5} />
          <circle cx="262" cy="62" r="20" fill={W} fillOpacity={0.9} />
          <path {...line} strokeOpacity={0.5} d="M178 116L330 -4" />
        </>
      );
  }
}

/**
 * The gradient plus artwork. Fills its parent; size and round it with `className`.
 * `wide` keeps the artwork at its natural scale on the right of long, short banners instead of zooming it to fill.
 */
export function GroupBanner({
  color,
  art: artKey,
  wide,
  className,
  children,
}: {
  color: BannerColor;
  art: BannerArt;
  wide?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const id = `b${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { from, to } = BANNER_COLORS[color];
  return (
    <div className={cn("relative isolate overflow-hidden text-white", className)} style={{ background: `linear-gradient(120deg, ${from}, ${to})` }}>
      <svg viewBox="0 0 320 120" preserveAspectRatio={wide ? "xMaxYMid meet" : "xMaxYMid slice"} fill="none" aria-hidden className="absolute inset-0 -z-10 size-full">
        <defs>
          <radialGradient id={`${id}-glow`} gradientUnits="userSpaceOnUse" cx="260" cy="0" r="220">
            <stop offset="0" stopColor={W} stopOpacity={0.28} />
            <stop offset="1" stopColor={W} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${id}-shade`} gradientUnits="userSpaceOnUse" x1="0" y1="60" x2="0" y2="120">
            <stop offset="0.5" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.22} />
          </linearGradient>
          {/* Art fades in from x=120 to x=230, leaving the left side clean for a title. */}
          <linearGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="230" y2="0">
            <stop offset="0" stopColor="#000" />
            <stop offset="1" stopColor={W} />
          </linearGradient>
          <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="-2000" y="-200" width="4000" height="520">
            <rect x="-2000" y="-200" width="4000" height="520" fill={`url(#${id}-fade)`} />
          </mask>
        </defs>
        <rect x="-2000" y="-200" width="4000" height="520" fill={`url(#${id}-glow)`} />
        <g mask={`url(#${id}-mask)`}>{art(artKey, id)}</g>
        <rect x="-2000" y="-200" width="4000" height="520" fill={`url(#${id}-shade)`} />
      </svg>
      {children}
    </div>
  );
}
