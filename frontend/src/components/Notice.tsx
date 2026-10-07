import { CheckIcon, CloseIcon } from "@/csmju";

/**
 * The result of a form, from ?ok= / ?error= (ui-design-system 8.4): a success
 * is a status message, an error stays on the page until the user fixes it.
 */
export default function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg bg-error-container px-4 py-3 text-label-md text-on-error-container"
      >
        <CloseIcon className="mt-0.5 h-4 w-4 shrink-0" />
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg bg-success/10 px-4 py-3 text-label-md text-emerald-700"
      >
        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
        {ok}
      </p>
    );
  }
  return null;
}
