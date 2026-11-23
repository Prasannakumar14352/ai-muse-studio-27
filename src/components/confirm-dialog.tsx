// In-app confirm dialog that replaces window.confirm() so destructive
// actions get a native-looking modal instead of a browser popup.
//
// Usage:
//   import { confirmDialog } from "@/components/confirm-dialog";
//   if (await confirmDialog({ title: "Delete?", description: "…" })) { … }
//
// Requires <ConfirmDialogHost /> to be mounted once at the app shell.

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "destructive";
};

type PendingConfirm = ConfirmOptions & {
  resolve: (v: boolean) => void;
};

let listener: ((c: PendingConfirm | null) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (!listener) {
      // No host mounted — fail closed by resolving false and warning so the
      // user can see something is off, but never block the flow with a
      // browser confirm.
      // eslint-disable-next-line no-console
      console.warn("[confirmDialog] ConfirmDialogHost is not mounted");
      resolve(false);
      return;
    }
    listener({ ...options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    listener = setPending;
    return () => {
      listener = null;
    };
  }, []);

  const open = pending !== null;
  const tone = pending?.tone ?? "default";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) {
          pending.resolve(false);
          setPending(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader className="gap-3">
          <div className={`grid h-12 w-12 place-items-center rounded-full ${tone === "destructive" ? "bg-rose-500/15 text-rose-400" : "bg-primary/15 text-primary"}`}>
            {tone === "destructive" ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <AlertDialogTitle className="text-xl">{pending?.title}</AlertDialogTitle>
          {pending?.description && (
            <AlertDialogDescription>{pending.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              pending?.resolve(false);
              setPending(null);
            }}
          >
            {pending?.cancelText ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-dialog-confirm"
            className={
              tone === "destructive"
                ? "bg-none! bg-rose-500! hover:bg-rose-600! text-white shadow-none!"
                : undefined
            }
            onClick={() => {
              pending?.resolve(true);
              setPending(null);
            }}
          >
            {pending?.confirmText ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
