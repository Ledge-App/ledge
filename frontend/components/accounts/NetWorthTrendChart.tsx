import { useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg'
import { colors, fontFamily, hexToRgba } from '@/constants/theme'
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
const X_TICK_MONTHS = [3, 6, 9, 12]

export function NetWorthTrendChart({ points, horizontalInset = 64 }: NetWorthTrendChartProps) {
  const { width } = useWindowDimensions()
  const chartW = width - horizontalInset
  const plotW = chartW - Y_W - PAD_R
  const plotH = CHART_H - PAD_T - X_H

  const { pixelPts, ticks, zeroY, linePath, areaPath } = useMemo(() => {
    const values = points.map((p) => p.netWorth)
    // 3 rather than the default 4: a 170px plot reads better with ~4 gridlines than ~7.
    const scale = niceExtent(Math.min(...values, 0), Math.max(...values, 0), 3)
    const yMin = scale[0]
    const yMax = scale[scale.length - 1]

    const toY = (v: number) => PAD_T + plotH - ((v - yMin) / (yMax - yMin)) * plotH
    // The x-axis always spans the full year, so a partial year reads as partial rather
    // than being stretched to fill the plot.
    const toX = (month: number) => Y_W + ((month - 1) / 11) * plotW

    const pts = points.map((p) => ({ x: toX(p.month), y: toY(p.netWorth) }))
    const baseY = toY(0)
    const line = pts.length < 2 ? '' : `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`
    const area =
      pts.length < 2
        ? ''
        : `${line} L ${pts[pts.length - 1].x} ${baseY} L ${pts[0].x} ${baseY} Z`

    return { pixelPts: pts, ticks: scale, zeroY: baseY, linePath: line, areaPath: area }
  }, [points, plotW, plotH])

  if (points.length === 0) return null

  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]

  return (
    <View style={{ alignItems: 'center' }}>
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

        {pixelPts.map((pt, i) => (
          <Circle
            key={points[i].month}
            cx={pt.x}
            cy={pt.y}
            r={3.5}
            fill={colors.surface}
            stroke={colors.primary}
            strokeWidth={2}
          />
        ))}

        {/* A single month has no line to read a trend from — anchor it to the zero baseline. */}
        {pixelPts.length === 1 ? (
          <Line
            x1={pixelPts[0].x}
            y1={pixelPts[0].y}
            x2={pixelPts[0].x}
            y2={zeroY}
            stroke={hexToRgba(colors.primary, 0.35)}
            strokeWidth={1.5}
          />
        ) : null}

        {X_TICK_MONTHS.map((month) => (
          <SvgText
            key={month}
            x={Y_W + ((month - 1) / 11) * plotW}
            y={CHART_H - 6}
            fontSize={10}
            fontFamily={fontFamily.mono}
            fill={colors.textMuted}
            textAnchor="middle"
          >
            {String(month).padStart(2, '0')}
          </SvgText>
        ))}
      </Svg>
    </View>
  )
}
