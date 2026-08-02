import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { colors } from '@/constants/theme'
import { BottomSheet } from './BottomSheet'
import type { Account } from '@/types/domain'

interface AccountsFilterDropdownProps {
  accounts: Account[]
  selectedAccountId: string | null
  onSelect: (accountId: string | null) => void
}

export function AccountsFilterDropdown({ accounts, selectedAccountId, onSelect }: AccountsFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedName = selectedAccountId
    ? accounts.find((a) => a.account_id === selectedAccountId)?.name ?? 'All Accounts'
    : 'All Accounts'

  return (
    <>
      <Pressable onPress={() => setIsOpen(true)} className="flex-row items-center gap-1">
        <Text className="font-sansSemi text-base text-textPrimary">{selectedName}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </Pressable>

      <BottomSheet visible={isOpen} onClose={() => setIsOpen(false)}>
        <Pressable
          onPress={() => {
            onSelect(null)
            setIsOpen(false)
          }}
          className="flex-row items-center justify-between py-3"
        >
          <Text className="font-sansMed text-base text-textPrimary">All Accounts</Text>
          {selectedAccountId === null ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
        </Pressable>
        {accounts.map((account) => (
          <Pressable
            key={account.account_id}
            onPress={() => {
              onSelect(account.account_id)
              setIsOpen(false)
            }}
            className="flex-row items-center justify-between py-3"
          >
            <Text className="font-sansMed text-base text-textPrimary">{account.name}</Text>
            {selectedAccountId === account.account_id ? (
              <Ionicons name="checkmark" size={18} color={colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </BottomSheet>
    </>
  )
}
