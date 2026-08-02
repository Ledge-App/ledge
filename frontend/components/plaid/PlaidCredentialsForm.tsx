import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { usePlaidCredentials, type PlaidEnvironment } from '@/hooks/usePlaidCredentials'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { SavedSecretPlaceholder, SecretInput } from '@/components/ui/SecretInput'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { colors } from '@/constants/theme'

interface PlaidCredentialsFormProps {
  onSaved?: () => void
}

type TestResult = { status: 'idle' } | { status: 'success' } | { status: 'error'; message: string }

export function PlaidCredentialsForm({ onSaved }: PlaidCredentialsFormProps) {
  const { data: existing, isLoading, test, isTesting, save, isSaving } = usePlaidCredentials()

  const [isHowToOpen, setIsHowToOpen] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const [environment, setEnvironment] = useState<PlaidEnvironment>('sandbox')
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle' })

  const hasExisting = !!existing && !isReplacing
  const canEditSecret = !hasExisting

  async function handleTest() {
    setTestResult({ status: 'idle' })
    try {
      const result = await test({ clientId, secret, environment })
      if (result.ok) {
        setTestResult({ status: 'success' })
      } else {
        setTestResult({ status: 'error', message: result.message })
      }
    } catch {
      setTestResult({ status: 'error', message: 'Something went wrong reaching Plaid. Try again.' })
    }
  }

  async function handleSave() {
    const result = await save({ clientId, secret, environment })
    if (result.ok) {
      setIsReplacing(false)
      setSecret('')
      setTestResult({ status: 'idle' })
      onSaved?.()
    } else {
      setTestResult({ status: 'error', message: result.message })
    }
  }

  if (isLoading) return null

  const canTest = clientId.trim().length > 0 && secret.trim().length > 0
  const canSave = canTest && testResult.status === 'success' && !isSaving

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="font-sansSemi text-lg text-textPrimary">Plaid Developer Account</Text>
        <Text className="font-sans text-sm leading-5 text-textSecondary">
          Ledge uses your own free Plaid developer account so your linked banks stay under your own
          usage.
        </Text>
      </View>

      <Pressable onPress={() => setIsHowToOpen((prev) => !prev)} className="flex-row items-center gap-1">
        <Text className={`font-sansMed text-sm ${isHowToOpen ? 'text-primary' : 'text-textMuted'}`}>
          How do I get these?
        </Text>
        <Ionicons
          name={isHowToOpen ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={isHowToOpen ? colors.primary : colors.textMuted}
        />
      </Pressable>
      {isHowToOpen ? (
        <View className="gap-2 rounded-md bg-surface p-4">
          <Text className="font-sans text-sm leading-5 text-textSecondary">
            1. Create a free Plaid account at dashboard.plaid.com/signup{'\n'}
            2. Find your Client ID and Secret under Developers → Keys{'\n'}
            3. For real bank data, request the free Trial plan or Production access
          </Text>
          <Pressable onPress={() => Linking.openURL('https://dashboard.plaid.com/signup')}>
            <Text className="font-sansMed text-sm text-primary">Open dashboard.plaid.com/signup</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="font-sansMed text-sm text-textSecondary">Environment</Text>
        <SegmentedControl
          value={environment}
          onChange={setEnvironment}
          options={[
            { label: 'Sandbox', value: 'sandbox' },
            { label: 'Production', value: 'production' },
          ]}
        />
      </View>

      {hasExisting ? (
        <TextField label="Client ID" value={existing.clientId} editable={false} mono />
      ) : (
        <TextField
          label="Client ID"
          value={clientId}
          onChangeText={setClientId}
          autoCapitalize="none"
          autoCorrect={false}
          mono
        />
      )}

      {canEditSecret ? (
        <SecretInput value={secret} onChangeText={setSecret} />
      ) : (
        <SavedSecretPlaceholder onReplace={() => setIsReplacing(true)} />
      )}

      {testResult.status === 'success' ? (
        <View className="flex-row items-center gap-2">
          <Ionicons name="checkmark-circle" size={16} color={colors.income} />
          <Text className="font-sans text-sm text-income">Connection verified</Text>
        </View>
      ) : null}
      {testResult.status === 'error' ? (
        <View className="flex-row items-center gap-2">
          <Ionicons name="close-circle" size={16} color={colors.expense} />
          <Text className="font-sans text-sm text-expense">{testResult.message}</Text>
        </View>
      ) : null}

      {canEditSecret ? (
        <Button label="Test Connection" variant="secondary" onPress={handleTest} loading={isTesting} disabled={!canTest} />
      ) : null}

      {canEditSecret ? (
        <Button label="Save" onPress={handleSave} disabled={!canSave} loading={isSaving} />
      ) : null}
    </View>
  )
}
