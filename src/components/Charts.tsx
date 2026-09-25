import { useMemo, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useSettings } from '../contexts/SettingsContext'
import { kgTo } from '../lib/units'
import type { TrendPoint } from '../lib/stats'

const BRAND = '#f97316'
const GO = '#22c55e'
const SKY = '#38bdf8'

function useChartTheme() {
  const { resolvedTheme } = useSettings()
  return useMemo(
    () =>
      resolvedTheme === 'dark'
        ? { grid: '#2a374e', axis: '#94a3b8', tipBg: '#1b2639', tipLine: '#2a374e', tipFg: '#f8fafc' }
        : { grid: '#d7dde8', axis: '#475569', tipBg: '#ffffff', tipLine: '#d7dde8', tipFg: '#0f172a' },
    [resolvedTheme]
  )
}

/** Shared tooltip shell — Recharts' default ignores our theme tokens. */
function TipBox({ label, rows }: { label: string; rows: Array<{ name: string; value: string; color: string }> }) {
  const theme = useChartTheme()
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-xl"
      style={{ background: theme.tipBg, borderColor: theme.tipLine, color: theme.tipFg }}
    >
      <p className="mb-1 font-semibold">{label}</p>
      {rows.map((row) => (
        <p key={row.name} className="tabular flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: row.color }} />
          <span style={{ color: theme.axis }}>{row.name}</span>
          <span className="ml-auto font-semibold">{row.value}</span>
        </p>
      ))}
    </div>
  )
}

function ChartFrame({ children, height = 200 }: { children: ReactNode; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as never}
      </ResponsiveContainer>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/** Body-weight trend: daily readings plus a smoothed 7-day average. */
export function BodyWeightChart({
  data,
}: {
  data: Array<{ label: string; value: number; avg: number | null }>
}) {
  const theme = useChartTheme()
  const { profile } = useSettings()
  const unit = profile.unit

  const points = data.map((d) => ({
    label: d.label,
    value: Number(kgTo(unit, d.value).toFixed(1)),
    avg: d.avg === null ? null : Number(kgTo(unit, d.avg).toFixed(1)),
  }))

  return (
    <ChartFrame height={220}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="bwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          stroke={theme.axis}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          stroke={theme.axis}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={['dataMin - 1', 'dataMax + 1']}
          width={44}
        />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                label={String(label)}
                rows={payload
                  .filter((p) => p.value != null)
                  .map((p) => ({
                    name: p.dataKey === 'avg' ? '7-day avg' : 'Weight',
                    value: `${p.value} ${unit}`,
                    color: p.dataKey === 'avg' ? SKY : BRAND,
                  }))}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={BRAND}
          strokeWidth={2}
          fill="url(#bwFill)"
          dot={false}
          activeDot={{ r: 4, fill: BRAND }}
        />
        {/* Dashed = derived, so the two series stay distinguishable without colour. */}
        <Line
          type="monotone"
          dataKey="avg"
          stroke={SKY}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          connectNulls
        />
      </AreaChart>
    </ChartFrame>
  )
}

/** Weekly training volume. */
export function VolumeChart({ data }: { data: TrendPoint[] }) {
  const theme = useChartTheme()
  const unit = useSettings().profile.unit

  const points = data.map((d) => ({ ...d, value: Math.round(kgTo(unit, d.value)) }))

  return (
    <ChartFrame height={190}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          stroke={theme.axis}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={12}
        />
        <YAxis
          stroke={theme.axis}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: `${BRAND}14` }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                label={`Week of ${label}`}
                rows={[
                  {
                    name: 'Volume',
                    value: `${Number(payload[0].value).toLocaleString()} ${unit}`,
                    color: GO,
                  },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="value" fill={GO} radius={[6, 6, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ChartFrame>
  )
}

/** Estimated 1RM progression for one exercise. */
export function ExerciseProgressChart({ data }: { data: TrendPoint[] }) {
  const theme = useChartTheme()
  const unit = useSettings().profile.unit

  const points = data.map((d) => ({ ...d, value: Number(kgTo(unit, d.value).toFixed(1)) }))

  return (
    <ChartFrame height={200}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="prFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SKY} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SKY} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          stroke={theme.axis}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          stroke={theme.axis}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={['dataMin - 5', 'dataMax + 5']}
          width={44}
        />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TipBox
                label={String(label)}
                rows={[{ name: 'Est. 1RM', value: `${payload[0].value} ${unit}`, color: SKY }]}
              />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={SKY}
          strokeWidth={2.5}
          fill="url(#prFill)"
          dot={{ r: 3, fill: SKY, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ChartFrame>
  )
}

/**
 * Set distribution across muscle groups. Capped at 8 axes — a radar with more
 * than that is unreadable, and the table below stays the accessible fallback.
 */
export function MuscleBalanceChart({ data }: { data: Array<{ muscle: string; sets: number }> }) {
  const theme = useChartTheme()
  const points = data.slice(0, 8)

  return (
    <ChartFrame height={240}>
      <RadarChart data={points} outerRadius="72%">
        <PolarGrid stroke={theme.grid} />
        <PolarAngleAxis dataKey="muscle" tick={{ fontSize: 11, fill: theme.axis }} />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox
                label={String(payload[0].payload.muscle)}
                rows={[{ name: 'Sets', value: String(payload[0].value), color: BRAND }]}
              />
            ) : null
          }
        />
        <Radar dataKey="sets" stroke={BRAND} strokeWidth={2} fill={BRAND} fillOpacity={0.25} />
      </RadarChart>
    </ChartFrame>
  )
}

/** Inline sparkline for stat rows — no axes, no interaction. */
export function Sparkline({ data, color = BRAND }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const points = data.map((value, i) => ({ i, value }))
  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            fill={color}
            fillOpacity={0.15}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
