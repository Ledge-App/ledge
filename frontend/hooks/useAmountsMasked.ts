import { useMMKVBoolean } from 'react-native-mmkv'
import { AMOUNTS_MASKED_KEY, preferences } from '@/lib/storage/preferences'

interface UseAmountsMaskedResult {
  isMasked: boolean
  toggleMask: () => void
}

// One masking state for the whole app: useMMKVBoolean re-renders every consumer of this
// key, so hiding amounts on one screen hides them everywhere rather than per-screen.
// Persisting it also means the choice survives navigation and app restarts.
export function useAmountsMasked(): UseAmountsMaskedResult {
  const [isMasked, setIsMasked] = useMMKVBoolean(AMOUNTS_MASKED_KEY, preferences)

  return {
    isMasked: isMasked ?? false,
    toggleMask: () => setIsMasked((m) => !m),
  }
}
