import { Button, Sheet, Toggle } from "./ui";

const EFFORT = [
  { value: 6, hint: "Easy" },
  { value: 7, hint: "" },
  { value: 8, hint: "" },
  { value: 9, hint: "" },
  { value: 10, hint: "Max" },
];

/**
 * The rarely-used per-set controls (warm-up, effort, remove) live here so each set
 * row can keep big, uncrowded tap targets for what you use every time.
 */
export function SetOptionsSheet({
  open,
  onClose,
  title,
  warmup,
  onWarmup,
  effort,
  onEffort,
  showEffort = true,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  warmup: boolean;
  onWarmup: (next: boolean) => void;
  effort?: number;
  onEffort: (next: number | undefined) => void;
  showEffort?: boolean;
  onRemove: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button full onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Toggle
          checked={warmup}
          onChange={onWarmup}
          label="Warm-up set"
          description="A lighter set to get ready. It isn’t counted in your totals."
        />

        {showEffort ? (
          <div>
            <p className="font-medium">Effort</p>
            <p className="mb-2 text-sm text-[var(--color-fg-muted)]">
              How hard it felt, from 6 (easy) to 10 (the most you could do).
              Also called RPE.
            </p>
            <div
              role="radiogroup"
              aria-label="Effort"
              className="grid grid-cols-6 gap-1.5"
            >
              {EFFORT.map((e) => (
                <button
                  key={e.value}
                  type="button"
                  role="radio"
                  aria-checked={effort === e.value}
                  onClick={() =>
                    onEffort(effort === e.value ? undefined : e.value)
                  }
                  className={`tabular min-h-11 rounded-lg border text-sm font-bold transition-colors duration-200 ${
                    effort === e.value
                      ? "border-violet-400 bg-violet-500/25 text-violet-200"
                      : "border-[var(--color-line)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  }`}
                >
                  {e.value}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onEffort(undefined)}
                className="min-h-11 rounded-lg border border-[var(--color-line)] text-sm font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}

        <div className="border-t border-[var(--color-line)] pt-3">
          <Button
            variant="secondary"
            full
            icon="trash"
            onClick={() => {
              onClose();
              onRemove();
            }}
            className="!border-rose-500/50 !bg-rose-500/15 font-bold !text-rose-300 hover:!bg-rose-500/25"
          >
            Delete this set
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
