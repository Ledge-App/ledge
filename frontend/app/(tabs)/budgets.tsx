import { SafeAreaView } from 'react-native-safe-area-context'
import { ComingSoonState } from '@/components/ui/ComingSoonState'
import { colors } from '@/constants/theme'

export default function BudgetsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ComingSoonState
        icon="bar-chart"
        title="Budgets"
        description="Set spending limits per category and track progress here."
      />
    </SafeAreaView>
  )
}
