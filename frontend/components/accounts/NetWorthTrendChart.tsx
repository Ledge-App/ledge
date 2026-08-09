import { useMemo, useState } from 'react'
import { PanResponder, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg'
import { colors, fontFamily, hexToRgba } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'
import { formatAxisAmount, niceExtent } from '@/lib/charts/lineChart'
import type { MonthPoint } from '@/lib/accounts/netWorthHistory'

interface NetWorthTrendChartProps {
  points: MonthPoint[]
  /** Horizontal padding the chart sits inside, so it can size itself to the sheet. */
  horizontalInset?: number
}

const CHART_H = 210
const Y_W = 46
const PAD_R = 12
const PAD_T = 14
const X_H = 26

/** Absolute month index, so the x-axis runs continuously across year boundaries. */
function monthIndex(p: { year: number; month: number }): number {
  return p.year * 12 + (p.month - 1)
}

// Tooltip card metrics — sized from the value text, which is always the longer line.
const TIP_H = 34
const TIP_PAD_X = 8
const TIP_CHAR_W = 6.6

export function NetWorthTrendChart({ points, horizontalInset = 64 }: NetWorthTrendChartProps) {
  const { width } = useWindowDimensions()
  const chartW = width - horizontalInset
  const plotW = chartW - Y_W - PAD_R
  const plotH = CHART_H - PAD_T - X_H

  // Which point the finger is over, or null when nobody's touching the chart. The reading
  // lives in a scrubber instead of a dot per month — twelve dots say nothing a finger can't
  // ask for, and the line reads cleaner without them.
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)

  const { pixelPts, ticks, zeroY, linePath, areaPath, xTicks } = useMemo(() => {
    const values = points.map((p) => p.netWorth)
    // 3 rather than the default 4: a 170px plot reads better with ~4 gridlines than ~7.
    const scale = niceExtent(Math.min(...values, 0), Math.max(...values, 0), 3)
    const yMin = scale[0]
    const yMax = scale[scale.length - 1]

    const toY = (v: number) => PAD_T + plotH - ((v - yMin) / (yMax - yMin)) * plotH
    // The whole history is one trace, so x runs over the actual span of months — a short
    // history under a year still fills the plot rather than huddling in a corner.
    const firstIdx = points.length > 0 ? monthIndex(points[0]) : 0
    const lastIdx = points.length > 0 ? monthIndex(points[points.length - 1]) : 0
    const span = Math.max(lastIdx - firstIdx, 1)
    const toX = (p: { year: number; month: number }) => Y_W + ((monthIndex(p) - firstIdx) / span) * plotW

    const pts = points.map((p) => ({ x: toX(p), y: toY(p.netWorth) }))
    const baseY = toY(0)
    const line = pts.length < 2 ? '' : `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    const area =
      pts.length < 2
        ? ''
        : `${line} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`

    // Axis labels sized to the span: within a year, a few "MM" marks; across years, each
    // January labelled with its year (thinned when many years would crowd the axis).
    let labels: { x: number; text: string }[]
    if (lastIdx - firstIdx < 12) {
      const stride = Math.max(1, Math.ceil(points.length / 4))
      labels = points
        .filter((_, i) => i % stride === 0)
        .map((p) => ({ x: toX(p), text: String(p.month).padStart(2, '0') }))
    } else {
      const januaries = points.filter((p) => p.month === 1)
      const yearStride = Math.max(1, Math.ceil(januaries.length / 5))
      labels = januaries
        .filter((_, i) => i % yearStride === 0)
        .map((p) => ({ x: toX(p), text: String(p.year) }))
    }

    return { pixelPts: pts, ticks: scale, zeroY: baseY, linePath: line, areaPath: area, xTicks: labels }
  }, [points, plotW, plotH])

  const panResponder = useMemo(() => {
    const nearestIndex = (locationX: number) => {
      if (pixelPts.length === 0) return null
      let best = 0
      for (let i = 1; i < pixelPts.length; i++) {
        if (Math.abs(pixelPts[i].x - locationX) < Math.abs(pixelPts[best].x - locationX)) best = i
      }
      return best
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The chart sits inside a scrollable sheet; once a finger is reading the line, the
      // scroll (or the sheet's drag-to-dismiss) must not steal the gesture mid-scrub.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => setScrubIndex(nearestIndex(evt.nativeEvent.locationX)),
      onPanResponderMove: (evt) => setScrubIndex(nearestIndex(evt.nativeEvent.locationX)),
      onPanResponderRelease: () => setScrubIndex(null),
      onPanResponderTerminate: () => setScrubIndex(null),
    })
  }, [pixelPts])

  if (points.length === 0) return null

  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]

  const scrub = scrubIndex != null && pixelPts[scrubIndex] ? { px: pixelPts[scrubIndex], point: points[scrubIndex] } : null
  const tipValue = scrub ? formatAmount(scrub.point.netWorth) : ''
  const tipLabel = scrub ? `${String(scrub.point.month).padStart(2, '0')}/${scrub.point.year}` : ''
  const tipW = Math.max(tipValue.length, tipLabel.length) * TIP_CHAR_W + TIP_PAD_X * 2
  // Above the point when there's room, below it otherwise; never off the sides.
  const tipX = scrub ? Math.min(Math.max(scrub.px.x - tipW / 2, Y_W), chartW - PAD_R - tipW) : 0
  const tipY = scrub ? (scrub.px.y - TIP_H - 10 > PAD_T ? scrub.px.y - TIP_H - 10 : scrub.px.y + 10) : 0

  return (
    <View style={{ alignItems: 'center' }} {...panResponder.panHandlers}>
      <Svg width={chartW} height={CHART_H}>
        <Defs>
          <LinearGradient id="netWorthArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.22} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {ticks.map((tick) => {
          const y = PAD_T + plotH - ((tick - yMin) / (yMax - yMin)) * plotH
          const isZero = tick === 0
          return (
            <G key={tick}>
              <Line
                x1={Y_W}
                y1={y}
                x2={chartW - PAD_R}
                y2={y}
                stroke={isZero ? colors.borderStrong : colors.border}
                strokeWidth={isZero ? 1 : 0.5}
                strokeDasharray={isZero ? undefined : '4,4'}
              />
              <SvgText
                x={Y_W - 6}
                y={y + 4}
                fontSize={10}
                fontFamily={fontFamily.mono}
                fill={colors.textMuted}
                textAnchor="end"
              >
                {formatAxisAmount(tick)}
              </SvgText>
            </G>
          )
        })}

        {areaPath ? <Path d={areaPath} fill="url(#netWorthArea)" /> : null}
        {linePath ? <Path d={linePath} stroke={colors.primary} strokeWidth={2.5} fill="none" /> : null}

        {/* A single month has no line to read a trend from — anchor it to the zero baseline. */}
        {pixelPts.length === 1 ? (
          <>
            <Circle cx={pixelPts[0].x} cy={pixelPts[0].y} r={3.5} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
            <Line
              x1={pixelPts[0].x}
              y1={pixelPts[0].y}
              x2={pixelPts[0].x}
              y2={zeroY}
              stroke={hexToRgba(colors.primary, 0.35)}
              strokeWidth={1.5}
            />
          </>
        ) : null}

        {xTicks.map((tick) => (
          <SvgText
            key={`${tick.text}-${tick.x}`}
            x={tick.x}
            y={CHART_H - 6}
            fontSize={10}
            fontFamily={fontFamily.mono}
            fill={colors.textMuted}
            textAnchor="middle"
          >
            {tick.text}
          </SvgText>
        ))}

        {scrub ? (
          <G>
            <Line
              x1={scrub.px.x}
              y1={PAD_T}
              x2={scrub.px.x}
              y2={PAD_T + plotH}
              stroke={hexToRgba(colors.primary, 0.45)}
              strokeWidth={1}
            />
            <Circle cx={scrub.px.x} cy={scrub.px.y} r={5} fill={colors.surface} stroke={colors.primary} strokeWidth={2.5} />
            <Rect x={tipX} y={tipY} width={tipW} height={TIP_H} rx={7} fill={colors.surface} stroke={colors.border} strokeWidth={1} />
            <SvgText
              x={tipX + tipW / 2}
              y={tipY + 13}
              fontSize={9}
              fontFamily={fontFamily.mono}
              fill={colors.textMuted}
              textAnchor="middle"
            >
              {tipLabel}
            </SvgText>
            <SvgText
              x={tipX + tipW / 2}
              y={tipY + 27}
              fontSize={11.5}
              fontFamily={fontFamily.mono}
              fill={colors.textPrimary}
              textAnchor="middle"
            >
              {tipValue}
            </SvgText>
          </G>
        ) : null}
      </Svg>
    </View>
  )
}
