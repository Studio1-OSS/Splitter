import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  );
}
