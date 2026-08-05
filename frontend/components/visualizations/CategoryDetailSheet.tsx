import { useMemo } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { colors, hexToRgba } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { DonutSegment } from '@/lib/transactions/visualizationData'
import { CategoryDonut } from './CategoryDonut'

interface CategoryDetailSheetProps {
  visible: boolean
  segment: DonutSegment | null
  allSegments: DonutSegment[]
  transactions: FeedItem[]
  onClose: () => void
}

interface DaySection {
  date: string
  label: string
  dayTotal: number
  items: FeedItem[]
}

function groupByDay(transactions: FeedItem[]): DaySection[] {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const groups = new Map<string, FeedItem[]>()
  for (const item of transactions) {
    const list = groups.get(item.date) ?? []
    list.push(item)
    groups.set(item.date, list)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, items]) => {
      const d = new Date(date + 'T00:00:00')
      const label = `${d.getMonth() + 1}/${d.getDate()} ${dayNames[d.getDay()]}`
      const dayTotal = items.reduce((s, i) => s + Math.abs(i.netAmount ?? i.amount), 0)
      return { date, label, dayTotal, items }
    })
}

export function CategoryDetailSheet({ visible, segment, allSegments, transactions, onClose }: CategoryDetailSheetProps) {
  const sections = useMemo(() => groupByDay(transactions), [transactions])

  if (!segment) return null

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView showsVerticalScrollIndicator={false} className="px-5">
        <CategoryDonut segments={allSegments} highlightedCategoryId={segment.categoryId} size={180} />

        <View className="flex-row items-center justify-center gap-2" style={{ marginTop: 8, marginBottom: 12 }}>
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 28, height: 28, backgroundColor: hexToRgba(segment.color, 0.2) }}
          >
            <Text style={{ fontSize: 14 }}>{segment.icon}</Text>
          </View>
          <Text className="font-sansSemi text-md text-textPrimary">{segment.name}</Text>
          <Text className="font-display text-md" style={{ color: segment.color }}>
            {formatAmount(segment.amount)}
          </Text>
        </View>

        {sections.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Text className="font-sans text-sm text-textMuted">No transactions</Text>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.date} className="mb-3 rounded-xl bg-surface px-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
              <View className="flex-row items-center justify-between py-3">
                <Text className="font-sansSemi text-sm text-textPrimary">{section.label}</Text>
                <Text className="font-sans text-xs text-textMuted">{formatAmount(section.dayTotal)}</Text>
              </View>
              {section.items.map((item) => (
                <View key={item.id} className="border-t" style={{ borderColor: colors.border }}>
                  <TransactionRow
                    item={item}
                    categoryName={segment.name}
                    categoryColor={segment.color}
                    categoryIcon={segment.icon}
                    reimbursementCategoryName={null}
                  />
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </BottomSheet>
  )
}
