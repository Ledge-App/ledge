import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import { CategoryPicker } from '@/components/categories/CategoryPicker'
import { Button } from '@/components/ui/Button'
import { formatAmount } from '@/lib/format/money'
import { colors, hexToRgba } from '@/constants/theme'
import { TRANSFER_TYPES } from '@/lib/transfers/registry'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Category, Subcategory, TransferKind } from '@/types/domain'

interface CategorySheetProps {
  visible: boolean
  item: FeedItem | null
  categories: Category[]
  subcategories: Subcategory[]
  pendingTransfer: { kind: TransferKind; counterpartItems: FeedItem[] } | null
  onClose: () => void
  onSave: (input: { categoryId: string | null; subcategoryId: string | null; applyToVendor: boolean }) => void
  onOpenTransfer: (forcedKind?: TransferKind) => void
  onClearPendingTransfer: () => void
  onUnmarkTransfer: () => void
}

export function CategorySheet({ visible, item, categories, subcategories, pendingTransfer, onClose, onSave, onOpenTransfer, onClearPendingTransfer, onUnmarkTransfer }: CategorySheetProps) {
  const sheetScroll = useSheetScroll()
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? null)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(item?.subcategoryId ?? null)
  const [applyToVendor, setApplyToVendor] = useState(true)
  const [markReimbursed, setMarkReimbursed] = useState(false)
  const [markTransfer, setMarkTransfer] = useState(false)

  useEffect(() => {
    setCategoryId(item?.categoryId ?? null)
    setSubcategoryId(item?.subcategoryId ?? null)
    setApplyToVendor(true)
    setMarkReimbursed(item?.reimbursedAmount != null)
    setMarkTransfer(item?.transferKind != null)
  }, [item?.id])

  if (!item) return null

  const availableSubcategories = subcategories.filter((s) => s.categoryId === categoryId)
  const wasTransfer = item.transferKind != null
  const wasReimbursed = item.reimbursedAmount != null
  const isReimbursementPending = pendingTransfer?.kind === 'reimbursement'
  const isTransferPending = pendingTransfer != null && pendingTransfer.kind !== 'reimbursement'
  const effectiveMarkReimbursed = markReimbursed || isReimbursementPending
  const effectiveMarkTransfer = markTransfer || isTransferPending

  function handleSave() {
    if (!effectiveMarkTransfer && wasTransfer) {
      onUnmarkTransfer()
    } else if (effectiveMarkTransfer && !wasTransfer && !isTransferPending) {
      onOpenTransfer()
    } else if (!effectiveMarkReimbursed && wasReimbursed) {
      onUnmarkTransfer()
    } else if (effectiveMarkReimbursed && !wasReimbursed && !isReimbursementPending) {
      onOpenTransfer('reimbursement')
    } else {
      onSave({ categoryId, subcategoryId, applyToVendor })
    }
  }

  const transferType = pendingTransfer ? TRANSFER_TYPES[pendingTransfer.kind] : null

  return (
    <BottomSheet visible={visible} onClose={onClose} contentScroll={sheetScroll}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="mx-3 flex-1 text-center font-display text-md text-textPrimary" numberOfLines={1}>
          {item.merchantName}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView {...sheetScroll.scrollProps} className="px-5" contentContainerClassName="gap-4 pb-10">
        <Text className="font-sans text-sm text-textSecondary">
          {item.date} · {formatAmount(item.amount)}
        </Text>

        <Text className="font-sansMed text-sm text-textSecondary">Category</Text>
        <CategoryPicker categories={categories} selectedCategoryId={categoryId} onSelect={(id) => {
          setCategoryId(id)
          setSubcategoryId(null)
        }} />

        {availableSubcategories.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {availableSubcategories.map((sub) => (
              <Text
                key={sub.id}
                onPress={() => setSubcategoryId(sub.id)}
                className={`rounded-full border px-3 py-2 font-sansMed text-sm ${
                  subcategoryId === sub.id ? 'border-primary bg-primaryMuted text-primary' : 'border-border text-textSecondary'
                }`}
              >
                {sub.name}
              </Text>
            ))}
          </View>
        ) : null}

        <View className="flex-row items-center justify-between py-3">
          <Text className="flex-1 pr-3 font-sans text-base text-textPrimary" numberOfLines={2}>
            Apply to all future {item.merchantName}?
          </Text>
          <Switch value={applyToVendor} onValueChange={setApplyToVendor} />
        </View>

        {item.amount < 0 ? (
          <View className="flex-row items-center justify-between py-3">
            <Text className="flex-1 pr-3 font-sans text-base text-textPrimary">Mark as Reimbursement</Text>
            <Switch
              value={effectiveMarkReimbursed}
              onValueChange={(next) => {
                setMarkReimbursed(next)
                if (next) {
                  setMarkTransfer(false)
                  if (isTransferPending) onClearPendingTransfer()
                  if (!isReimbursementPending) onOpenTransfer('reimbursement')
                } else {
                  if (isReimbursementPending) onClearPendingTransfer()
                }
              }}
            />
          </View>
        ) : null}

        {isReimbursementPending && transferType ? (
          <View className="rounded-lg border px-3 py-3" style={{ borderColor: transferType.color, backgroundColor: hexToRgba(transferType.color, 0.08) }}>
            <View className="flex-row items-center gap-2">
              <Ionicons name={transferType.icon} size={14} color={transferType.color} />
              <Text className="font-sansMed text-sm" style={{ color: transferType.color }}>{transferType.label}</Text>
            </View>
            {pendingTransfer.counterpartItems.length > 0 ? (
              pendingTransfer.counterpartItems.map((linked) => (
                <Text key={linked.id} className="mt-1 font-sans text-sm text-textSecondary" numberOfLines={1}>
                  {linked.merchantName} · {formatAmount(Math.abs(linked.amount))}
                </Text>
              ))
            ) : null}
          </View>
        ) : null}

        <View className="flex-row items-center justify-between py-3">
          <Text className="flex-1 pr-3 font-sans text-base text-textPrimary">Mark as Transfer</Text>
          <Switch
            value={effectiveMarkTransfer}
            onValueChange={(next) => {
              setMarkTransfer(next)
              if (next) {
                setMarkReimbursed(false)
                if (isReimbursementPending) onClearPendingTransfer()
                if (!isTransferPending) onOpenTransfer()
              } else {
                if (isTransferPending) onClearPendingTransfer()
              }
            }}
          />
        </View>

        {isTransferPending && transferType ? (
          <View className="rounded-lg border px-3 py-3" style={{ borderColor: transferType.color, backgroundColor: hexToRgba(transferType.color, 0.08) }}>
            <View className="flex-row items-center gap-2">
              <Ionicons name={transferType.icon} size={14} color={transferType.color} />
              <Text className="font-sansMed text-sm" style={{ color: transferType.color }}>{transferType.label}</Text>
            </View>
            {pendingTransfer.counterpartItems.length > 0 ? (
              pendingTransfer.counterpartItems.map((linked) => (
                <Text key={linked.id} className="mt-1 font-sans text-sm text-textSecondary" numberOfLines={1}>
                  Linked to {linked.merchantName} · {formatAmount(Math.abs(linked.amount))}
                </Text>
              ))
            ) : (
              <Text className="mt-1 font-sans text-sm text-textMuted">No match selected</Text>
            )}
          </View>
        ) : null}

        <Button label="Save Changes" onPress={handleSave} />
      </ScrollView>
    </BottomSheet>
  )
}
