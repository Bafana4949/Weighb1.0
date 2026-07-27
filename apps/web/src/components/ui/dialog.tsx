"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ className, children, ...props }: DialogPrimitive.DialogContentProps) { return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40" /><DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-surface p-5 shadow-xl", className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X size={16} /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>; }
export function DialogHeader(props: React.HTMLAttributes<HTMLDivElement>) { return <div className="mb-4 space-y-1" {...props} />; }
export function DialogTitle(props: DialogPrimitive.DialogTitleProps) { return <DialogPrimitive.Title className="text-lg font-medium text-foreground" {...props} />; }
export function DialogDescription(props: DialogPrimitive.DialogDescriptionProps) { return <DialogPrimitive.Description className="text-sm text-muted-foreground" {...props} />; }
