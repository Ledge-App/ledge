import { useState } from 'react'
import { Text, View } from 'react-native'
import { hexToRgba } from '@/constants/theme'
import { assetClass } from '@/lib/accounts/holdings'
import { classBreakdown, computeAllocation, squarify } from '@/lib/accounts/treemap'
import type { Holding } from '@/types/domain'

const MAP_HEIGHT = 200
/** Below this, a label would clip — the tile stays color-only. */
const MIN_LABEL_SIZE = 34

// Portfolio allocation treemap: tile area = share of market value, color = ASSET CLASS.
// Deliberately not performance-colored — red/green on a treemap reads as "today's
// movement" (finviz), which vs-cost or stale-price tints would falsely imply. Layout
// comes from lib/accounts/treemap so it's testable.
export function HoldingsHeatMap({ holdings }: { holdings: Holding[] }) {
  const [width, setWidth] = useState(0)
  const allocation = computeAllocation(holdings)
  if (allocation.length === 0) return null

  const rects = width > 0 ? squarify(allocation, width, MAP_HEIGHT) : []

  // Legend shows a class's share ONLY when the map can't: tiles big enough to be
  // labeled already display their percentages, so repeating them is noise — but a
  // sliver like a $0.01 cash sweep or a dust crypto position is invisible on the map,
  // and its share has to live somewhere ("Crypto <1%").
  const labeledIds = new Set(
    rects
      .filter(({ width: w, height: h }) => w >= MIN_LABEL_SIZE && h >= MIN_LABEL_SIZE)
      .map(({ item }) => item.securityId),
  )
  const shares = classBreakdown(allocation)
  const classesPresent = [...new Map(allocation.map((a) => {
    const cls = assetClass(a.type)
    return [cls.key, cls]
  })).values()].map((cls) => {
    const mine = allocation.filter((a) => assetClass(a.type).key === cls.key)
    const fullyLabeled = mine.every((a) => labeledIds.has(a.securityId))
    if (fullyLabeled) return { ...cls, shareLabel: null as string | null }
    const weight = [...shares.entries()]
      .filter(([key]) => assetClass(key === 'other' ? null : key).key === cls.key)
      .reduce((sum, [, w]) => sum + w, 0)
    const pct = weight * 100
    return { ...cls, shareLabel: pct >= 1 ? `${Math.round(pct)}%` : '<1%' }
  })

  return (
    <View className="gap-2">
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: MAP_HEIGHT }}>
        {rects.map(({ item, x, y, width: w, height: h }) => {
          const showLabel = w >= MIN_LABEL_SIZE && h >= MIN_LABEL_SIZE
          return (
            <View
              key={item.securityId}
              className="items-center justify-center"
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                height: h,
                backgroundColor: hexToRgba(assetClass(item.type).color, 0.32),
                overflow: 'hidden',
              }}
            >
              {showLabel ? (
                <>
                  <Text className="font-sansSemi text-xs text-textPrimary" numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text className="font-sans text-textSecondary" style={{ fontSize: 10 }} numberOfLines={1}>
                    {(item.weight * 100).toFixed(item.weight >= 0.1 ? 0 : 1)}%
                  </Text>
                </>
              ) : null}
            </View>
          )
        })}
      </View>

      {classesPresent.length > 1 ? (
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          {classesPresent.map((cls) => (
            <View key={cls.key} className="flex-row items-center gap-1">
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hexToRgba(cls.color, 0.6) }} />
              <Text className="font-sans text-xs text-textSecondary">{cls.shareLabel ? `${cls.label} ${cls.shareLabel}` : cls.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
