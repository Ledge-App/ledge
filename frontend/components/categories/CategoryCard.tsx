import { Pressable, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { colors, hexToRgba } from '@/constants/theme'
import { CategoryIcon } from './CategoryIcon'
import { formatAmount } from '@/lib/format/money'

const ICON_WELL = 44
const RING_SIZE = 54
const RING_STROKE = 3.5

interface CategoryCardProps {
  name: string
  icon: string | null
  color: string
  spent: number
  budget: number | null
  onPress?: () => void
}

/**
 * Budget progress ring around the icon well: a faint full track, and on top of it an arc from
 * 12 o'clock showing spent/budget in a darker shade of the category color — flipping to the
 * expense red once the budget is blown. No budget, no ring.
 */
function BudgetRing({ spent, budget, color }: { spent: number; budget: number; color: string }) {
  const fraction = budget > 0 ? Math.min(spent / budget, 1) : 0
  const radius = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const arcColor = spent > budget ? colors.expense : color

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={radius}
        stroke={hexToRgba(color, 0.22)}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      {fraction > 0 ? (
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          stroke={arcColor}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      ) : null}
    </Svg>
  )
}

export function CategoryCard({ name, icon, color, spent, budget, onPress }: CategoryCardProps) {
  const cardSurface = hexToRgba(color, 0.16)
  const iconBg = hexToRgba(color, 0.28)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className="items-center gap-2 rounded-xl py-4 px-2"
      style={{ backgroundColor: cardSurface }}
    >
      <Text className="font-sansSemi text-sm text-textSecondary">{name}</Text>

      <View style={{ width: RING_SIZE, height: RING_SIZE }} className="items-center justify-center">
        {budget != null ? <BudgetRing spent={spent} budget={budget} color={color} /> : null}
        <View
          className="items-center justify-center rounded-full"
          style={{ width: ICON_WELL, height: ICON_WELL, backgroundColor: iconBg }}
        >
          <CategoryIcon icon={icon} size={20} color={color} />
        </View>
      </View>

      <Text className="font-display text-md text-textPrimary">{formatAmount(spent)}</Text>
    </Pressable>
  )
}
