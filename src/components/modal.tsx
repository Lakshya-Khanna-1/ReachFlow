"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  labelId,
  onClose,
  children,
}: {
  labelId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      onCancel={onClose}
      className="m-auto max-h-[90vh] w-[min(95vw,700px)] overflow-auto rounded-lg border border-white/10 bg-zinc-950 p-6 text-zinc-100 backdrop:bg-black/80"
    >
      {children}
    </dialog>
  );
}
