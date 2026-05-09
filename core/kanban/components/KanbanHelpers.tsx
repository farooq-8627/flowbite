"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ─── KanbanAddCardButton ──────────────────────────────────────────────────────

interface KanbanAddCardButtonProps {
  columnId: string;
  onAdd: (columnId: string) => void;
}

export function KanbanAddCardButton({ columnId, onAdd }: KanbanAddCardButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
      onClick={() => onAdd(columnId)}
    >
      <Plus className="size-4" />
      Add card
    </Button>
  );
}

// ─── KanbanEmptyColumn ────────────────────────────────────────────────────────

export function KanbanEmptyColumn() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
      <p className="text-sm">No items</p>
    </div>
  );
}

// ─── KanbanCardSkeleton ───────────────────────────────────────────────────────

export function KanbanCardSkeleton() {
  return (
    <Card className="my-2 w-64 md:w-72">
      <CardContent className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex justify-between pt-1">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}
