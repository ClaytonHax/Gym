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
import { fmtWeight, kgTo, toKg } from '../lib/units'
import { bodyWeightSeries } from '../lib/stats'

type Range = '30' | '90' | '365'

export function Body() {
  const { profile } = useSettings()
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

  const series = useMemo(() => bodyWeightSeries(entries, Number(range)), [entries, range])

  /** Change over the selected window, first reading vs latest. */
  const windowDelta = useMemo(() => {
    if (series.length < 2) return null
    return series[series.length - 1].value - series[0].value
  }, [series])

  const goalDelta =
    profile.goalWeightKg && latest ? latest.weightKg - profile.goalWeightKg : null

  const bmi =
    profile.heightCm && latest
      ? latest.weightKg / (profile.heightCm / 100) ** 2
      : null

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
      <PageTitle title="Body" subtitle="Weight, composition and trend." />

      <Button size="lg" variant="go" full icon="plus" onClick={openNew}>
        Log today’s weight
      </Button>

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
              delta={windowDelta === null ? 'Need two entries' : `over ${series.length} weigh-ins`}
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

          {!profile.goalWeightKg || !profile.heightCm ? (
            <Card className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-400">
                <Icon name="target" size={17} />
              </span>
              <p className="flex-1 text-sm text-[var(--color-fg-muted)]">
                Add your height and goal weight in Settings to unlock BMI and goal tracking.
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
