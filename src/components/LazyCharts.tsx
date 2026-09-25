import { lazy, Suspense, type ComponentProps } from 'react'
import { Skeleton } from './ui'

/**
 * Recharts is ~160 kB gzipped — far too heavy for the first paint on a phone.
 * Charts load on demand behind a same-height skeleton, so nothing jumps when
 * the chunk arrives.
 */
const Charts = () => import('./Charts')

const BodyWeightChartImpl = lazy(() =>
  Charts().then((m) => ({ default: m.BodyWeightChart }))
)
const VolumeChartImpl = lazy(() => Charts().then((m) => ({ default: m.VolumeChart })))
const ExerciseProgressChartImpl = lazy(() =>
  Charts().then((m) => ({ default: m.ExerciseProgressChart }))
)
const MuscleBalanceChartImpl = lazy(() =>
  Charts().then((m) => ({ default: m.MuscleBalanceChart }))
)

function withFallback<P extends object>(
  Component: React.ComponentType<P>,
  height: number
) {
  return function LazyChart(props: P) {
    return (
      <Suspense fallback={<Skeleton className="w-full" style={{ height }} />}>
        <Component {...props} />
      </Suspense>
    )
  }
}

export const BodyWeightChart = withFallback<ComponentProps<typeof BodyWeightChartImpl>>(
  BodyWeightChartImpl,
  220
)
export const VolumeChart = withFallback<ComponentProps<typeof VolumeChartImpl>>(
  VolumeChartImpl,
  190
)
export const ExerciseProgressChart = withFallback<
  ComponentProps<typeof ExerciseProgressChartImpl>
>(ExerciseProgressChartImpl, 200)
export const MuscleBalanceChart = withFallback<
  ComponentProps<typeof MuscleBalanceChartImpl>
>(MuscleBalanceChartImpl, 240)
