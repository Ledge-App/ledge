import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { currentMonth, type YearMonth } from '@/lib/transactions/filterByMonth'

/**
 * The month a screen is viewing, snapping back to the real current month whenever the screen
 * regains focus. Browsing another month is a moment's detour, not a setting — tab screens stay
 * mounted, so without the snap a glance at last December would still be there days later.
 */
export function useSelectedMonth() {
  const [month, setMonth] = useState<YearMonth>(currentMonth())

  useFocusEffect(
    useCallback(() => {
      setMonth(currentMonth())
    }, []),
  )

  return [month, setMonth] as const
}
