import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="bg-muted rounded-full p-3">
        <Icon className="text-muted-foreground size-6" />
      </div>
      <div className="space-y-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground max-w-md text-sm">{body}</p>
      </div>
      {action}
    </div>
  );
}
