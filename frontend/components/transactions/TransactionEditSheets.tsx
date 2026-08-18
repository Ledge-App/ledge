import { TransactionDetailSheet } from '@/components/transactions/TransactionDetailSheet'
import { ManualTransactionSheet } from '@/components/transactions/ManualTransactionSheet'
import { TransferSheet } from '@/components/transfers/TransferSheet'
import type { TransactionEditor } from '@/hooks/useTransactionEditor'

interface TransactionEditSheetsProps {
  editor: TransactionEditor
}

export function TransactionEditSheets({ editor }: TransactionEditSheetsProps) {
  return (
    <>
      <TransactionDetailSheet
        visible={editor.activeSheetItem != null}
        item={editor.activeSheetItem}
        categories={editor.categories}
        subcategories={editor.subcategories}
        pendingTransfer={editor.pendingTransfer}
        isSaving={editor.isSavingDetail}
        onClose={editor.closeDetailSheet}
        onSave={editor.saveCategory}
        onOpenTransfer={editor.openTransfer}
        onClearPendingTransfer={editor.clearPendingTransfer}
        onUnmarkTransfer={editor.unmarkTransfer}
        onUnlink={editor.unlink}
      />
      <TransferSheet
        visible={editor.transferItem != null}
        item={editor.transferItem}
        candidateItems={editor.transferCandidateItems}
        accounts={editor.accounts}
        forcedKind={editor.transferForcedKind}
        onClose={editor.declineTransfer}
        onSave={editor.confirmTransfer}
      />
      <ManualTransactionSheet
        visible={editor.manualSheetOpen}
        transaction={editor.editingManual ?? undefined}
        categories={editor.categories}
        subcategories={editor.subcategories}
        isSaving={editor.isSavingManual}
        onClose={editor.closeManualSheet}
        onSave={editor.saveManual}
        onDelete={editor.editingManual ? editor.deleteManual : undefined}
        isTransfer={editor.editingManualIsTransfer}
        isReimbursed={editor.editingManualIsReimbursed}
        pendingTransfer={editor.pendingTransfer}
        onOpenTransfer={editor.openManualTransfer}
        onClearPendingTransfer={editor.clearPendingTransfer}
        onSaveAndUnmarkTransfer={editor.saveManualAndUnmarkTransfer}
      />
    </>
  )
}
