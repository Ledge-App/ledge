/**
 * TEMPORARY HARNESS — delete with lib/observability/devProbe.ts.
 *
 * Drives the reimbursement handoff in the real running app, on a simulator, without a session:
 * open a transaction, mark it as a reimbursement, pick a counterpart, and check a sheet is showing
 * at every step. Everything the sheets need arrives as props, so no feed context is required and
 * the failing unauthenticated queries are harmless (the editor reads `data ?? []`).
 *
 * Reached with: xcrun simctl openurl booted "ledge://sheetcheck"
 */
import { useEffect, useMemo, useRef } from 'react'
import { Text, View } from 'react-native'
import { SheetHostProvider } from '@/components/ui/SheetHost'
import { TransactionEditSheets } from '@/components/transactions/TransactionEditSheets'
import { useTransactionEditor } from '@/hooks/useTransactionEditor'
import { activeSheetOf } from '@/lib/transfers/transferReturn'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

function feedItem(overrides: Partial<FeedItem>): FeedItem {
  return {
    id: 'x',
    source: 'plaid',
    amount: 42,
    date: '2026-08-20',
    merchantName: 'Test Merchant',
    categoryId: null,
    subcategoryId: null,
    categorySource: 'uncategorized',
    confidenceLevel: null,
    pfcDetailed: null,
    accountId: 'acc-card',
    pending: false,
    note: null,
    reimbursedAmount: null,
    netAmount: null,
    isReimbursementIncome: false,
    reimbursementCategoryId: null,
    transferId: null,
    transferKind: null,
    transferRole: null,
    transferSource: null,
    isBrokerageCashAccount: false,
    isSweptOutflow: false,
    hasCrossAccountCounterpart: false,
    links: [],
    ...overrides,
  } as FeedItem
}

const EXPENSE = feedItem({ id: 'card-expense', amount: 42, merchantName: 'Lao Jie Hot Pot' })
const INCOME = feedItem({ id: 'checking-income', amount: -42, accountId: 'acc-checking', merchantName: 'Refund' })

export default function SheetCheckScreen() {
  return (
    <SheetHostProvider>
      <Driver />
    </SheetHostProvider>
  )
}

function Driver() {
  const feed = useMemo(() => [EXPENSE, INCOME], [])
  const editor = useTransactionEditor(feed)
  const latest = useRef(editor)
  latest.current = editor

  useEffect(() => {
    const failures: string[] = []
    const active = () =>
      activeSheetOf({
        detailItem: latest.current.activeSheetItem,
        transferItem: latest.current.transferItem,
        manualOpen: latest.current.manualSheetOpen,
      })
    const check = (label: string, expected: string | null) => {
      const got = active()
      const ok = got === expected
      if (!ok) failures.push(label)
      console.log(`[SHEETCHECK] ${ok ? 'PASS' : 'FAIL'} ${label}: expected ${expected}, got ${got}`)
    }

    const timers = [
      setTimeout(() => {
        check('nothing open at start', null)
        latest.current.openTransaction(EXPENSE)
      }, 1200),
      setTimeout(() => {
        check('detail sheet open after tapping the row', 'detail')
        latest.current.openTransfer('reimbursement')
      }, 2200),
      setTimeout(() => {
        check('transfer sheet open after Mark as Reimbursement', 'transfer')
        latest.current.confirmTransfer({ kind: 'reimbursement', counterpartIds: [INCOME.id] })
      }, 3200),
      setTimeout(() => {
        check('detail sheet returns after picking a counterpart', 'detail')
        const e = latest.current
        console.log(
          `[SHEETCHECK] detail=${e.activeSheetItem?.id ?? 'null'} transfer=${e.transferItem?.id ?? 'null'} ` +
            `pending=${e.pendingTransfer?.kind ?? 'null'} counterparts=${e.pendingTransfer?.counterpartItems.map((i) => i.id).join(',') || '-'}`,
        )
        latest.current.closeDetailSheet()
      }, 4200),
      setTimeout(() => {
        check('closing the detail sheet leaves nothing open', null)
        console.log(`[SHEETCHECK] RESULT ${failures.length === 0 ? 'ALL PASS' : `FAILURES: ${failures.join(' | ')}`}`)
      }, 5400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>sheet check running…</Text>
      <TransactionEditSheets editor={editor} />
    </View>
  )
}
