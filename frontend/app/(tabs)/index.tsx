import { SafeAreaView } from 'react-native-safe-area-context'
import { ComingSoonState } from '@/components/ui/ComingSoonState'
import { colors } from '@/constants/theme'

export default function DashboardScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ComingSoonState
        icon="wallet"
        title="Dashboard"
        description="Your monthly spending summary and budget health will live here."
      />
    </SafeAreaView>
  )
}
