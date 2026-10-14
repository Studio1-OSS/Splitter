import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// DESIGN.md: near-black pill for the one primary action, outline pill for light controls,
// underlined text link for the companion action. No shadows.
const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors active:opacity-80 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "rounded-pill bg-primary text-primary-foreground hover:bg-primary/85",
        outline: "rounded-pill border border-hairline bg-transparent hover:border-foreground/40 hover:bg-muted",
        secondary: "rounded-pill bg-stone text-foreground hover:bg-stone/70",
        ghost: "rounded-pill hover:bg-muted",
        inverse: "rounded-pill bg-white text-[#17171c] hover:bg-white/85",
        destructive: "rounded-pill bg-negative text-white hover:bg-negative/90",
        link: "rounded-xs px-0 underline underline-offset-4 decoration-1 hover:decoration-2",
      },
      size: {
        sm: "h-9 px-4 text-sm max-md:h-11",
        default: "h-11 px-6 text-sm",
        lg: "h-12 px-7 text-[15px]",
        icon: "size-11",
        "icon-sm": "size-9 max-md:size-11",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }), loading && "[&>svg:not(.animate-spin)]:hidden")}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
