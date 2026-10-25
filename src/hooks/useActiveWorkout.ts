import { useActiveWorkoutContext } from '../contexts/ActiveWorkoutContext'

/**
 * The in-progress session. Every caller shares one store (see
 * ActiveWorkoutContext), so saving or discarding in one place updates the
 * "In progress" strip and the Dashboard immediately.
 */
export function useActiveWorkout() {
  return useActiveWorkoutContext()
}
