import { SafeAreaView } from 'react-native-safe-area-context'
import { ComingSoonState } from '@/components/ui/ComingSoonState'
import { colors } from '@/constants/theme'

export default function TransactionsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ComingSoonState
        icon="receipt"
        title="Transactions"
        description="Your linked accounts' transaction feed will show up here."
      />
    </SafeAreaView>
  )
}
