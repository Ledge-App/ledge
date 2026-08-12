import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { usePlaidCredentials, type PlaidEnvironment } from '@/hooks/usePlaidCredentials'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { SecretInput } from '@/components/ui/SecretInput'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { BottomSheet, useSheetScroll } from '@/components/ui/BottomSheet'
import { colors } from '@/constants/theme'

interface PlaidCredentialsFormProps {
  onSaved?: () => void
}

type TestResult = { status: 'idle' } | { status: 'success' } | { status: 'error'; message: string }

export function PlaidCredentialsForm({ onSaved }: PlaidCredentialsFormProps) {
  const { data: existing, allowedEnvironments, isLoading, test, isTesting, save, isSaving } = usePlaidCredentials()

  const sheetScroll = useSheetScroll()
  const [isHowToOpen, setIsHowToOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  // No default. The environment is permanent once saved, so it must be chosen deliberately
  // rather than inherited from whatever the control happened to start on.
  const [environment, setEnvironment] = useState<PlaidEnvironment | null>(null)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle' })

  const isNewSetup = !existing
  const canChooseEnvironment = allowedEnvironments.length > 1

  // Client ID and environment are fixed at first save, so a rotation resends the stored
  // values verbatim; only the secret is the user's to change. The server rejects anything
  // else, so this keeps the client honest rather than merely convenient.
  const submission = existing
    ? { clientId: existing.clientId, secret, environment: existing.environment as PlaidEnvironment }
    : { clientId, secret, environment: (canChooseEnvironment ? environment : 'production') as PlaidEnvironment }

  async function handleTest() {
    setTestResult({ status: 'idle' })
    try {
      const result = await test(submission)
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
    const result = await save(submission)
    if (result.ok) {
      setReplaceOpen(false)
      setClientId('')
      setSecret('')
      setTestResult({ status: 'idle' })
      onSaved?.()
    } else {
      setTestResult({ status: 'error', message: result.message })
    }
  }

  function handleCloseReplace() {
    setReplaceOpen(false)
    setClientId('')
    setSecret('')
    setTestResult({ status: 'idle' })
  }

  if (isLoading) return null

  const canTest =
    submission.secret.trim().length > 0 &&
    submission.clientId.trim().length > 0 &&
    // Only blocks the first save; a rotation inherits the stored environment.
    (!isNewSetup || !canChooseEnvironment || environment !== null)
  const canSave = canTest && testResult.status === 'success' && !isSaving

  const formFields = (
    <>
      {isNewSetup && canChooseEnvironment ? (
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
          <Text className="font-sans text-xs leading-4 text-textMuted">
            This cannot be changed later — linked banks are tied to the environment they were
            connected in.
          </Text>
        </View>
      ) : null}

      {isNewSetup ? (
        <TextField
          label="Client ID"
          value={clientId}
          onChangeText={setClientId}
          autoCapitalize="none"
          autoCorrect={false}
          mono
        />
      ) : null}

      <SecretInput value={secret} onChangeText={setSecret} />

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

      <Button label="Test Connection" variant="secondary" onPress={handleTest} loading={isTesting} disabled={!canTest} />
      <Button label="Save" onPress={handleSave} disabled={!canSave} loading={isSaving} />
    </>
  )

  // New setup: show form inline (onboarding flow)
  if (isNewSetup) {
    return (
      <View className="gap-6">
        <View className="gap-2">
          <Text className="font-sansSemi text-lg text-textPrimary">Plaid Developer Account</Text>
          <Text className="font-sans text-sm leading-5 text-textSecondary">
            ToFi uses your own free Plaid developer account so your linked banks stay under your own
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

        {formFields}
      </View>
    )
  }

  // Existing credentials: read-only summary + a sheet that rotates the secret only. Client ID
  // and environment are fixed for the life of the account, so they are shown, not edited.
  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text className="font-sansSemi text-lg text-textPrimary">Plaid Developer Account</Text>
        <Text className="font-sans text-sm leading-5 text-textSecondary">
          Your Plaid developer account is connected.
        </Text>
      </View>

      <View className="gap-4 rounded-xl bg-surface p-4">
        <View className="gap-1">
          <Text className="font-sansMed text-sm text-textMuted">Client ID</Text>
          <Text className="font-mono text-base text-textPrimary">{existing.clientId}</Text>
        </View>
        <View className="gap-1">
          <Text className="font-sansMed text-sm text-textMuted">Secret</Text>
          <Text className="font-mono text-base text-textMuted">••••••••••••••••</Text>
        </View>
        <View className="gap-1">
          <Text className="font-sansMed text-sm text-textMuted">Environment</Text>
          <Text className="font-sansMed text-base text-textPrimary capitalize">{existing.environment}</Text>
        </View>
      </View>

      <Button label="Update Secret" variant="secondary" onPress={() => setReplaceOpen(true)} />

      <BottomSheet visible={replaceOpen} onClose={handleCloseReplace} contentScroll={sheetScroll}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <Pressable onPress={handleCloseReplace} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
          <Text className="font-display text-md text-textPrimary">Update Secret</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView {...sheetScroll.scrollProps} className="px-5" contentContainerClassName="gap-6 pb-10" keyboardShouldPersistTaps="handled">
          {formFields}
        </ScrollView>
      </BottomSheet>
    </View>
  )
}
