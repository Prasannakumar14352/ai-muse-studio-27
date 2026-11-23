import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-2xl group-[.toaster]:shadow-[0_12px_30px_rgba(0,0,0,0.45)]",
          title: "group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-emerald-500/40 [&_[data-icon]]:text-emerald-400",
          error: "group-[.toaster]:border-rose-500/45 [&_[data-icon]]:text-rose-400",
          warning: "group-[.toaster]:border-amber-500/45 [&_[data-icon]]:text-amber-400",
          info: "group-[.toaster]:border-sky-500/40 [&_[data-icon]]:text-sky-400",
          actionButton: "group-[.toast]:gradient-primary group-[.toast]:text-white group-[.toast]:rounded-lg",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
