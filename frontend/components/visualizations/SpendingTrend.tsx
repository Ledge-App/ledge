import { useMemo, useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg'
import type { DayPoint } from '@/lib/transactions/visualizationData'
import { formatTick, niceScale } from '@/lib/charts/lineChart'
import { formatAmount } from '@/lib/format/money'
import { colors, fontFamily, hexToRgba } from '@/constants/theme'

interface SpendingTrendProps {
  points: DayPoint[]
  lineColor: string
}

const Y_W = 40
const PAD_R = 12
const X_H = 28
const TOOLTIP_H = 24
// Reserved strip at the very top, entirely above where any bar or gridline is ever drawn — the
// tooltip anchors here at a fixed y regardless of which day is selected, rather than floating
// above that day's own bar. Deriving its position from the bar's height caused it to collide
// with the bar itself for a tall value (pushed up against the chart's top edge) and with the
// cluster of other small bars/the average line for a short one (sitting just above a bar near
// the bottom). A fixed band makes an overlap structurally impossible instead of chasing cases.
const TOOLTIP_BAND = TOOLTIP_H + 12
const CHART_H = 220 + TOOLTIP_BAND
const PAD_T = 12 + TOOLTIP_BAND

export function SpendingTrend({ points, lineColor }: SpendingTrendProps) {
  const { width } = useWindowDimensions()
  const chartW = width - 40
  const plotW = chartW - Y_W - PAD_R
  const plotH = CHART_H - PAD_T - X_H
  // Which day is tapped, if any — tapping the same one again clears it rather than requiring
  // a tap elsewhere, since there's nothing else in this chart a tap could mean.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const { bars, yTicks, yMax, yStep, avgY, slotX, slotW } = useMemo(() => {
    // Only fall back to 1 when there is nothing to plot — a max of e.g. 0.42
    // should still fill the chart rather than be squashed against a 0–1 scale.
    const maxAmt = Math.max(...points.map((p) => p.amount), 0) || 1
    const ticks = niceScale(maxAmt)
    const yM = ticks[ticks.length - 1]

    const toY = (v: number) => PAD_T + plotH - (v / yM) * plotH
    // Each day gets an equal-width slot rather than a point position: a daily total is a
    // discrete value, not a sample of something continuous, so a bar centered in its own
    // slot reads as "this is what happened this day" without implying a trend between days
    // the way connecting them with a line would.
    const slotW = plotW / points.length
    const barW = Math.max(1, slotW * 0.6)
    const xForSlot = (index: number) => Y_W + slotW * (index + 0.5)

    const barRects = points.map((p, i) => {
      const height = (p.amount / yM) * plotH
      return { day: p.day, x: xForSlot(i) - barW / 2, y: PAD_T + plotH - height, width: barW, height }
    })
    const avg = points.reduce((s, p) => s + p.amount, 0) / Math.max(points.length, 1)

    return {
      bars: barRects,
      yTicks: ticks,
      yMax: yM,
      yStep: ticks[1],
      avgY: toY(avg),
      slotX: xForSlot,
      slotW,
    }
  }, [points, plotW, plotH])

  if (points.length === 0) return null

  // Reset rather than carry a stale selection into a re-render with fewer days (e.g. switching
  // to a shorter month) where the selected index would point at nothing or the wrong day.
  const selected = selectedIndex !== null && selectedIndex < points.length ? selectedIndex : null

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={chartW} height={CHART_H}>
        {yTicks.map((tick) => {
          const y = PAD_T + plotH - (tick / yMax) * plotH
          return (
            <G key={tick}>
              <Line x1={Y_W} y1={y} x2={chartW - PAD_R} y2={y} stroke={colors.border} strokeWidth={0.5} />
              <SvgText
                x={Y_W - 6}
                y={y + 4}
                fontSize={10}
                fontFamily={fontFamily.mono}
                fill={colors.textMuted}
                textAnchor="end"
              >
                {formatTick(tick, yStep)}
              </SvgText>
            </G>
          )
        })}

        <Line
          x1={Y_W}
          y1={avgY}
          x2={chartW - PAD_R}
          y2={avgY}
          stroke={colors.textMuted}
          strokeWidth={1}
          strokeDasharray="5,5"
          opacity={0.6}
        />

        {bars.map((bar) => (
          <Rect key={bar.day} x={bar.x} y={bar.y} width={bar.width} height={Math.max(bar.height, 1)} rx={1.5} fill={lineColor} />
        ))}

        {points.map((p, i) =>
          p.day % 5 === 0 || p.day === 1 ? (
            <SvgText
              key={p.day}
              x={slotX(i)}
              y={CHART_H - 6}
              fontSize={10}
              fontFamily={fontFamily.mono}
              fill={colors.textMuted}
              textAnchor="middle"
            >
              {String(p.day).padStart(2, '0')}
            </SvgText>
          ) : null,
        )}

        {/* Full slot height/width rather than the visible bar's own bounds, so a near-zero day
            (whose bar is a sliver) is exactly as easy to tap as the tallest one. Transparent and
            on top so it always wins the touch regardless of what's drawn beneath it. */}
        {points.map((_, i) => (
          <Rect
            key={`hit-${i}`}
            x={Y_W + slotW * i}
            y={PAD_T}
            width={slotW}
            height={plotH}
            fill="transparent"
            onPress={() => setSelectedIndex((prev) => (prev === i ? null : i))}
          />
        ))}

        {selected !== null
          ? (() => {
              const point = points[selected]
              const label = `${String(point.day).padStart(2, '0')} · ${formatAmount(point.amount)}`
              // Sized to the text rather than a fixed guess: the font is monospace, so every
              // character has the same advance width and this is exact, not an estimate — a
              // fixed width either clips a big amount (as seen with $2,450.00) or looks
              // needlessly wide for a small one.
              const tooltipFontSize = 11
              const charW = tooltipFontSize * 0.6
              const tooltipPadX = 10
              const tooltipW = label.length * charW + tooltipPadX * 2
              const tooltipH = TOOLTIP_H
              const centerX = slotX(selected)
              const tooltipX = Math.min(Math.max(centerX - tooltipW / 2, 2), chartW - tooltipW - 2)
              const tooltipY = 4
              return (
                <G>
                  {/* Soft tint of the bar's own color, not a solid dark chip — matches how
                      badges elsewhere in the app (e.g. the transfer "Pending" pill) read as
                      part of the same palette rather than an unrelated overlay. */}
                  <Rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx={6} fill={hexToRgba(lineColor, 0.14)} />
                  <SvgText
                    x={tooltipX + tooltipW / 2}
                    y={tooltipY + tooltipH / 2 + 4}
                    fontSize={tooltipFontSize}
                    fontFamily={fontFamily.mono}
                    fill={lineColor}
                    textAnchor="middle"
                  >
                    {label}
                  </SvgText>
                </G>
              )
            })()
          : null}
      </Svg>
    </View>
  )
}
