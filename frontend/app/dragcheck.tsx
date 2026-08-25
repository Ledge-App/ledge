// THROWAWAY harness for verifying ReorderableList's gesture on device. Delete after use.
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { AccountRow } from '@/components/accounts/AccountRow'
import { ReorderableList } from '@/components/accounts/ReorderableList'

const SEED = [
  { account_id: 'a', name: 'Adv Plus Banking', balance: 1200 },
  { account_id: 'b', name: 'TOTAL CHECKING', balance: 3400 },
  { account_id: 'c', name: 'Cash Management', balance: 900 },
  { account_id: 'd', name: 'Savings', balance: 5600 },
]

export default function DragCheck() {
  const [items, setItems] = useState(SEED)
  const [isDragging, setIsDragging] = useState(false)
  const [taps, setTaps] = useState(0)
  const [drops, setDrops] = useState(0)

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="gap-4 px-5 py-4" scrollEnabled={!isDragging}>
        <Text testID="order" className="font-mono text-sm text-textPrimary">
          ORDER={items.map((i) => i.account_id).join(',')}
        </Text>
        <Text testID="stats" className="font-mono text-sm text-textPrimary">
          dragging={String(isDragging)} taps={taps} drops={drops}
        </Text>
        <View className="rounded-xl bg-surface px-4">
          <ReorderableList
            items={items}
            keyExtractor={(i) => i.account_id}
            onDragStateChange={setIsDragging}
            onReorder={(next) => {
              setItems(next)
              setDrops((d) => d + 1)
            }}
            renderItem={(item) => (
              <View className="border-t" style={{ borderColor: colors.border }}>
                <AccountRow
                  name={item.name}
                  balance={item.balance}
                  variant="cash"
                  isMasked={false}
                  onPress={() => setTaps((t) => t + 1)}
                />
              </View>
            )}
          />
        </View>
        {/* Tall filler so scrolling is meaningful — proves an un-armed drag still scrolls. */}
        <View style={{ height: 900 }} className="rounded-xl bg-surfaceRaised" />
      </ScrollView>
    </SafeAreaView>
  )
}
