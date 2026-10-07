"use client";

import { useState } from "react";
import { Modal, dangerButtonClass, primaryButtonClass, secondaryButtonClass } from "@/csmju";

/**
 * A button that asks first (ui-design-system 8.3) and then posts a server
 * action. The message names what is affected and what follows from it.
 */
export default function ConfirmForm({
  action,
  fields,
  trigger,
  triggerLabel,
  title,
  message,
  confirmLabel,
  tone = "danger",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  /** Visible text of the button that opens the dialog. */
  trigger: string;
  /** What the button does, for a screen reader, e.g. "ยกเลิกนัดหมาย 09:00 น." */
  triggerLabel: string;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={triggerLabel}
        onClick={() => setOpen(true)}
        className={`rounded-md border px-2.5 py-1 text-label-sm transition-colors ${
          tone === "danger"
            ? "border-error/40 text-error hover:bg-error-container"
            : "border-outline-variant text-on-surface-variant hover:bg-surface-variant/50"
        }`}
      >
        {trigger}
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <form action={action}>
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <p className="text-body-md text-on-surface-variant">{message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
                ยกเลิก
              </button>
              <button type="submit" className={tone === "danger" ? dangerButtonClass : primaryButtonClass}>
                {confirmLabel}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
