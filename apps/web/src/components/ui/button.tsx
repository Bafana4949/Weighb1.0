import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const variants = cva("inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:opacity-90",
      secondary: "bg-muted text-foreground hover:bg-border",
      outline: "border border-border bg-transparent text-foreground hover:bg-muted",
      destructive: "bg-danger text-danger-foreground hover:opacity-90",
      success: "bg-success text-success-foreground hover:opacity-90",
      ghost: "text-foreground hover:bg-muted",
    },
    size: { default: "h-9 px-4", sm: "h-8 px-3 text-xs", lg: "h-9 px-6", icon: "h-9 w-9" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof variants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Component = asChild ? Slot : "button";
  return <Component ref={ref} className={cn(variants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
