import { useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg'
import type { DayPoint } from '@/lib/transactions/visualizationData'
import { colors, fontFamily } from '@/constants/theme'

interface SpendingTrendProps {
  points: DayPoint[]
  lineColor: string
}

const CHART_H = 220
const Y_W = 40
const PAD_R = 12
const PAD_T = 12
const X_H = 28

function niceScale(max: number, ticks = 5): number[] {
  if (max <= 0) return [0]
  const rough = max / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const r = rough / mag
  const step = r <= 1.5 ? mag : r <= 3 ? 2 * mag : r <= 7 ? 5 * mag : 10 * mag
  const result: number[] = []
  for (let v = 0; v <= max + step * 0.01; v += step) result.push(Math.round(v))
  return result
}

function smoothLine(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const t = 6
    d += ` C ${p1.x + (p2.x - p0.x) / t} ${p1.y + (p2.y - p0.y) / t} ${p2.x - (p3.x - p1.x) / t} ${p2.y - (p3.y - p1.y) / t} ${p2.x} ${p2.y}`
  }
  return d
}

function formatTick(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`
  return String(v)
}

export function SpendingTrend({ points, lineColor }: SpendingTrendProps) {
  const { width } = useWindowDimensions()
  const chartW = width - 40
  const plotW = chartW - Y_W - PAD_R
  const plotH = CHART_H - PAD_T - X_H

  const { pixelPts, yTicks, yMax, avgY, linePath } = useMemo(() => {
    const maxAmt = Math.max(...points.map((p) => p.amount), 1)
    const ticks = niceScale(maxAmt)
    const yM = ticks[ticks.length - 1]

    const toY = (v: number) => PAD_T + plotH - (v / yM) * plotH
    const toX = (day: number) => {
      if (points.length <= 1) return Y_W + plotW / 2
      return Y_W + ((day - 1) / (points.length - 1)) * plotW
    }

    const pts = points.map((p) => ({ x: toX(p.day), y: toY(p.amount) }))
    const avg = points.reduce((s, p) => s + p.amount, 0) / Math.max(points.length, 1)

    return { pixelPts: pts, yTicks: ticks, yMax: yM, avgY: toY(avg), linePath: smoothLine(pts) }
  }, [points, plotW, plotH])

  if (points.length === 0) return null

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
                {formatTick(tick)}
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

        <Path d={linePath} stroke={lineColor} strokeWidth={2} fill="none" />

        {pixelPts.map((pt, i) => (
          <Circle key={i} cx={pt.x} cy={pt.y} r={3.5} fill={lineColor} />
        ))}

        {points
          .filter((p) => p.day % 5 === 0 || p.day === 1)
          .map((p) => {
            const x = points.length <= 1 ? Y_W + plotW / 2 : Y_W + ((p.day - 1) / (points.length - 1)) * plotW
            return (
              <SvgText
                key={p.day}
                x={x}
                y={CHART_H - 6}
                fontSize={10}
                fontFamily={fontFamily.mono}
                fill={colors.textMuted}
                textAnchor="middle"
              >
                {String(p.day).padStart(2, '0')}
              </SvgText>
            )
          })}
      </Svg>
    </View>
  )
}
