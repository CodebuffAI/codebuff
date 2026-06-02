import { ReactNode, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Dialog, DialogTrigger } from "@/vly/components/ui/dialog";
import { InviteDialogContent } from "./InviteDialogContent";

interface InviteDialogProps {
  projectId: Id<"project">;
  children: ReactNode;
  className?: string;
}

export function InviteDialog({
  projectId,
  children,
  className,
}: InviteDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {isOpen && (
        <InviteDialogContent
          projectId={projectId}
          setIsOpen={setIsOpen}
          className={className}
        />
      )}
    </Dialog>
  );
}
