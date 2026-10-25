import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import {
  Button,
  Card,
  ChartTable,
  ConfirmSheet,
  EmptyState,
  Field,
  IconButton,
  PageTitle,
  SectionHeader,
  Segmented,
  Sheet,
  Skeleton,
  StatTile,
} from '../components/ui'
import { BodyWeightChart } from '../components/LazyCharts'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useBodyLog } from '../hooks/useBodyLog'
import { dayKey, fmtDateLong, parseDayKey } from '../lib/date'
import { fmtWeight, kgTo, plural, toKg } from '../lib/units'
import { bodyWeightSeries } from '../lib/stats'

type Range = '30' | '90' | '365'

export function Body() {
  const { profile, update } = useSettings()
  const toast = useToast()
  const { entries, loading, saveEntry, deleteEntry, latest } = useBodyLog()
  const unit = profile.unit

  const [range, setRange] = useState<Range>('90')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const [date, setDate] = useState(dayKey())
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Quick "today" entry and goal editor shown right on the page.
  const [quickWeight, setQuickWeight] = useState('')
  const [quickError, setQuickError] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)
  const [goalText, setGoalText] = useState('')
  const [goalError, setGoalError] = useState('')
  const [goalSaving, setGoalSaving] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)

  const series = useMemo(() => bodyWeightSeries(entries, Number(range)), [entries, range])

  /** Change over the selected window, first reading vs latest. */
  const windowDelta = useMemo(() => {
    if (series.length < 2) return null
    return series[series.length - 1].value - series[0].value
  }, [series])

  const goalDelta =
    profile.goalWeightKg && latest ? latest.weightKg - profile.goalWeightKg : null

  /** Oldest reading, so "lost so far" has a starting point. */
  const startWeightKg = entries.length > 0 ? entries[entries.length - 1].weightKg : null
  const goalKg = profile.goalWeightKg
  const losing = goalKg && startWeightKg ? goalKg < startWeightKg : false
  const toGo = goalKg && latest ? (losing ? latest.weightKg - goalKg : goalKg - latest.weightKg) : null
  const progressPct =
    goalKg && latest && startWeightKg && Math.abs(startWeightKg - goalKg) > 0.1
      ? Math.max(0, Math.min(100, ((startWeightKg - latest.weightKg) / (startWeightKg - goalKg)) * 100))
      : null

  const bmi =
    profile.heightCm && latest
      ? latest.weightKg / (profile.heightCm / 100) ** 2
      : null

  async function quickLog(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(quickWeight)
    if (!quickWeight || Number.isNaN(value) || value <= 0 || toKg(unit, value) > 500) {
      setQuickError(`Type your weight in ${unit}, for example ${unit === 'kg' ? '82.5' : '182'}.`)
      return
    }
    setQuickSaving(true)
    setQuickError('')
    try {
      await saveEntry({ date: dayKey(), weightKg: toKg(unit, value) })
      toast('Weight saved for today.')
      setQuickWeight('')
    } catch {
      setQuickError('Could not save. Check your connection and try again.')
    } finally {
      setQuickSaving(false)
    }
  }

  async function saveGoal(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(goalText)
    if (!goalText || Number.isNaN(value) || value <= 0 || toKg(unit, value) > 500) {
      setGoalError(`Type the weight you want to reach in ${unit}.`)
      return
    }
    setGoalSaving(true)
    setGoalError('')
    try {
      await update({ goalWeightKg: toKg(unit, value) })
      toast('Goal saved.')
      setEditingGoal(false)
    } catch {
      setGoalError('Could not save your goal. Try again.')
    } finally {
      setGoalSaving(false)
    }
  }

  function openNew() {
    setEditingDate(null)
    setDate(dayKey())
    setWeight(latest ? String(Math.round(kgTo(unit, latest.weightKg) * 10) / 10) : '')
    setBodyFat('')
    setNotes('')
    setError('')
    setSheetOpen(true)
  }

  function openEdit(entryDate: string) {
    const entry = entries.find((e) => e.date === entryDate)
    if (!entry) return
    setEditingDate(entry.date)
    setDate(entry.date)
    setWeight(String(Math.round(kgTo(unit, entry.weightKg) * 10) / 10))
    setBodyFat(entry.bodyFatPct ? String(entry.bodyFatPct) : '')
    setNotes(entry.notes ?? '')
    setError('')
    setSheetOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(weight)
    if (!weight || Number.isNaN(value) || value <= 0) {
      setError('Enter a weight above zero.')
      return
    }
    // Guard against a stray decimal point producing nonsense in the charts.
    if (toKg(unit, value) > 500) {
      setError('That looks too high — check the number.')
      return
    }
    const fat = bodyFat ? Number(bodyFat) : undefined
    if (fat !== undefined && (Number.isNaN(fat) || fat <= 0 || fat >= 70)) {
      setError('Body fat should be a percentage between 1 and 70.')
      return
    }

    setSaving(true)
    try {
      await saveEntry({
        date,
        weightKg: toKg(unit, value),
        ...(fat !== undefined ? { bodyFatPct: fat } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
      toast(editingDate ? 'Entry updated.' : 'Weight logged.')
      setSheetOpen(false)
    } catch {
      setError('Could not save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-rise flex flex-col gap-6">
      <PageTitle title="Body" subtitle="Your weight, your goal and how you are trending." />

      <Card>
        <form onSubmit={quickLog} className="flex flex-col gap-3" noValidate>
          <Field
            label={`Today’s weight (${unit})`}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={quickWeight}
            onChange={(e) => setQuickWeight(e.target.value)}
            suffix={unit}
            placeholder={latest ? String(Math.round(kgTo(unit, latest.weightKg) * 10) / 10) : '0.0'}
            hint="Your weight is also used to estimate calories burned in workouts."
            error={quickError || undefined}
          />
          <div className="flex gap-3">
            <Button type="submit" size="lg" variant="go" full icon="check" loading={quickSaving}>
              Log today’s weight
            </Button>
            <Button type="button" size="lg" variant="secondary" onClick={openNew}>
              More options
            </Button>
          </div>
        </form>
      </Card>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[108px]" />
          <Skeleton className="h-[108px]" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="scale"
          title="No weigh-ins yet"
          message="Log your weight to track the trend. Same time of day, before eating, gives the cleanest data."
          action={
            <Button variant="go" icon="plus" onClick={openNew}>
              Add your first entry
            </Button>
          }
        />
      ) : (
        <>
          <section aria-label="Goal progress">
            <SectionHeader title="Your goal" />
            <Card className="flex flex-col gap-3">
              {goalKg && !editingGoal ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Now', value: fmtWeight(latest!.weightKg, unit) },
                      { label: 'Goal', value: fmtWeight(goalKg, unit) },
                      {
                        label: toGo !== null && toGo > 0.05 ? 'To go' : 'Status',
                        value:
                          toGo !== null && toGo > 0.05
                            ? fmtWeight(toGo, unit)
                            : 'Goal reached',
                      },
                    ].map((t) => (
                      <div key={t.label} className="rounded-xl bg-[var(--color-surface-2)] px-2 py-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-fg-muted)]">
                          {t.label}
                        </p>
                        <p className="tabular font-display text-lg font-semibold leading-tight">{t.value}</p>
                      </div>
                    ))}
                  </div>
                  {progressPct !== null ? (
                    <div>
                      <div
                        role="progressbar"
                        aria-label="Progress toward goal weight"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(progressPct)}
                        className="h-3 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
                      >
                        <div
                          className="h-full rounded-full bg-go-400 transition-[width] duration-300 motion-reduce:transition-none"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">
                        {Math.round(progressPct)}% of the way from {fmtWeight(startWeightKg!, unit)}
                        {windowDelta !== null && windowDelta !== 0
                          ? `. Trend: ${windowDelta < 0 ? 'down' : 'up'} ${fmtWeight(Math.abs(windowDelta), unit)} in the last ${range} days`
                          : ''}
                        .
                      </p>
                    </div>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setGoalText(String(Math.round(kgTo(unit, goalKg) * 10) / 10))
                      setEditingGoal(true)
                    }}
                  >
                    Change goal weight
                  </Button>
                </>
              ) : (
                <form onSubmit={saveGoal} className="flex flex-col gap-3" noValidate>
                  <Field
                    label={`Goal weight (${unit})`}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    value={goalText}
                    onChange={(e) => setGoalText(e.target.value)}
                    suffix={unit}
                    placeholder={unit === 'kg' ? 'e.g. 75' : 'e.g. 165'}
                    hint="The weight you would like to reach."
                    error={goalError || undefined}
                  />
                  <div className="flex gap-3">
                    {editingGoal ? (
                      <Button type="button" variant="secondary" full onClick={() => setEditingGoal(false)}>
                        Cancel
                      </Button>
                    ) : null}
                    <Button type="submit" full loading={goalSaving}>
                      Save goal
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </section>

          <section aria-label="Body stats" className="grid grid-cols-2 gap-3">
            <StatTile
              label="Current"
              value={fmtWeight(latest!.weightKg, unit, false)}
              unit={unit}
              icon="scale"
              accent="brand"
              delta={fmtDateLong(parseDayKey(latest!.date).toISOString())}
            />
            <StatTile
              label={`${range}-day change`}
              value={
                windowDelta === null
                  ? '—'
                  : `${windowDelta > 0 ? '+' : windowDelta < 0 ? '−' : ''}${fmtWeight(Math.abs(windowDelta), unit, false)}`
              }
              unit={windowDelta === null ? undefined : unit}
              icon="trending"
              accent="sky"
              trend={windowDelta === null || windowDelta === 0 ? 'flat' : windowDelta > 0 ? 'up' : 'down'}
              delta={windowDelta === null ? 'Need two entries' : `over ${plural(series.length, 'weigh-in')}`}
            />
            {goalDelta !== null ? (
              <StatTile
                label="To goal"
                value={fmtWeight(Math.abs(goalDelta), unit, false)}
                unit={unit}
                icon="target"
                accent="go"
                delta={
                  Math.abs(goalDelta) < 0.25
                    ? 'Goal reached'
                    : `${goalDelta > 0 ? 'Above' : 'Below'} ${fmtWeight(profile.goalWeightKg!, unit)}`
                }
              />
            ) : null}
            {bmi !== null ? (
              <StatTile
                label="BMI"
                value={bmi.toFixed(1)}
                icon="note"
                accent="violet"
                delta={
                  bmi < 18.5
                    ? 'Underweight range'
                    : bmi < 25
                      ? 'Healthy range'
                      : bmi < 30
                        ? 'Overweight range'
                        : 'Obese range'
                }
              />
            ) : null}
            {latest?.bodyFatPct ? (
              <StatTile
                label="Body fat"
                value={latest.bodyFatPct.toFixed(1)}
                unit="%"
                icon="layers"
                accent="violet"
              />
            ) : null}
          </section>

          <section>
            <SectionHeader title="Trend" />
            <Card>
              <div className="mb-4">
                <Segmented
                  label="Chart range"
                  size="sm"
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: '30', label: '30 days' },
                    { value: '90', label: '90 days' },
                    { value: '365', label: '1 year' },
                  ]}
                />
              </div>
              {series.length >= 2 ? (
                <>
                  <BodyWeightChart data={series} />
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
                    <span className="h-0.5 w-4 rounded-full bg-sky-400" />
                    Dashed line is the 7-day average — the real signal under daily noise.
                  </p>
                  <ChartTable
                    caption={`Body weight over the last ${range} days`}
                    head={['Date', `Weight (${unit})`, `7-day avg (${unit})`]}
                    rows={series
                      .slice()
                      .reverse()
                      .map((p) => [
                        p.label,
                        fmtWeight(p.value, unit, false),
                        p.avg === null ? '—' : fmtWeight(p.avg, unit, false),
                      ])}
                  />
                </>
              ) : (
                <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">
                  Two or more entries in this range are needed to draw a trend.
                </p>
              )}
            </Card>
          </section>

          {!profile.heightCm ? (
            <Card className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-400">
                <Icon name="target" size={17} />
              </span>
              <p className="flex-1 text-sm text-[var(--color-fg-muted)]">
                Add your height in Settings to see your BMI.
              </p>
            </Card>
          ) : null}

          <section>
            <SectionHeader title={`All entries (${entries.length})`} />
            <ul className="flex flex-col gap-2">
              {entries.map((entry, i) => {
                const prev = entries[i + 1]
                const change = prev ? entry.weightKg - prev.weightKg : null
                return (
                  <Card as="li" key={entry.date} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="tabular block font-semibold">
                        {fmtWeight(entry.weightKg, unit)}
                        {entry.bodyFatPct ? (
                          <span className="ml-2 text-xs font-medium text-[var(--color-fg-muted)]">
                            {entry.bodyFatPct.toFixed(1)}% bf
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-[var(--color-fg-muted)]">
                        {fmtDateLong(parseDayKey(entry.date).toISOString())}
                      </span>
                      {entry.notes ? (
                        <span className="mt-0.5 block truncate text-xs text-[var(--color-fg-muted)]">
                          {entry.notes}
                        </span>
                      ) : null}
                    </span>

                    {change !== null && Math.abs(change) >= 0.05 ? (
                      <span
                        className={`tabular flex shrink-0 items-center gap-0.5 text-xs font-semibold ${
                          change > 0 ? 'text-go-400' : 'text-sky-400'
                        }`}
                      >
                        <Icon name={change > 0 ? 'arrow-up' : 'arrow-down'} size={12} />
                        {fmtWeight(Math.abs(change), unit, false)}
                      </span>
                    ) : null}

                    <IconButton icon="note" label={`Edit entry for ${entry.date}`} onClick={() => openEdit(entry.date)} />
                    <IconButton
                      icon="trash"
                      label={`Delete entry for ${entry.date}`}
                      onClick={() => setDeleteTarget(entry.date)}
                      className="hover:bg-rose-500/15 hover:text-rose-400"
                    />
                  </Card>
                )
              })}
            </ul>
          </section>
        </>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editingDate ? 'Edit entry' : 'Log weight'}
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field
            label="Date"
            type="date"
            value={date}
            max={dayKey()}
            onChange={(e) => setDate(e.target.value)}
            disabled={Boolean(editingDate)}
            hint={editingDate ? 'Delete and re-add to change the date.' : undefined}
            required
          />
          <Field
            label={`Weight (${unit})`}
            type="number"
            inputMode="decimal"
            enterKeyHint="next"
            step="0.1"
            min="0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            suffix={unit}
            placeholder="0.0"
            autoFocus
            required
          />
          <Field
            label="Body fat (optional)"
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            step="0.1"
            min="0"
            max="70"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            suffix="%"
            placeholder="—"
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="body-notes"
              className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-fg-muted)]"
            >
              Notes (optional)
            </label>
            <textarea
              id="body-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Post-holiday, deload week, hydration…"
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-3.5 text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)] outline-none focus:border-brand-500"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm font-medium text-rose-400">
              {error}
            </p>
          ) : null}

          <div className="flex gap-3">
            <Button type="button" variant="secondary" full onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="go" full loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </Sheet>

      <ConfirmSheet
        open={deleteTarget !== null}
        title="Delete this entry?"
        message="The weigh-in will be removed from your history and charts."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await deleteEntry(deleteTarget)
            toast('Entry deleted.', 'info')
          } catch {
            toast('Could not delete that entry.', 'error')
          }
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
