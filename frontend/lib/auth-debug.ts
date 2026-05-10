type ClerkAttempt = {
  status?: string | null
  createdSessionId?: string | null
  createdUserId?: string | null
  supportedSecondFactors?: ClerkSecondFactor[]
}

type ClerkLikeError = {
  message?: string
  longMessage?: string
  errors?: Array<{ message?: string; longMessage?: string; code?: string }>
}

export type ClerkSecondFactor = {
  strategy?: string
  emailAddressId?: string
  phoneNumberId?: string
  safeIdentifier?: string
}

export function logAuthEvent(event: string, details: Record<string, unknown> = {}) {
  console.info(`[auth] ${event}`, details)
}

export function describeClerkAttempt(attempt: ClerkAttempt | null | undefined) {
  if (!attempt) {
    return { status: null, hasSession: false, hasUser: false }
  }

  return {
    status: attempt.status ?? null,
    hasSession: Boolean(attempt.createdSessionId),
    hasUser: Boolean(attempt.createdUserId),
    secondFactors: describeSecondFactors(attempt.supportedSecondFactors),
  }
}

export function describeSecondFactors(factors: ClerkSecondFactor[] | null | undefined) {
  return (factors ?? []).map((factor) => ({
    strategy: factor.strategy ?? null,
    safeIdentifier: factor.safeIdentifier ?? null,
    hasEmailAddressId: Boolean(factor.emailAddressId),
    hasPhoneNumberId: Boolean(factor.phoneNumberId),
  }))
}

export function selectSecondFactor(factors: ClerkSecondFactor[] | null | undefined) {
  const availableFactors = factors ?? []
  return (
    availableFactors.find((factor) => factor.strategy === 'email_code') ??
    availableFactors.find((factor) => factor.strategy === 'phone_code') ??
    availableFactors.find((factor) => factor.strategy === 'totp') ??
    availableFactors.find((factor) => factor.strategy === 'backup_code') ??
    availableFactors[0] ??
    null
  )
}

export function clerkErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const clerkError = error as ClerkLikeError
  const firstError = clerkError.errors?.[0]
  return (
    firstError?.longMessage ||
    firstError?.message ||
    clerkError.longMessage ||
    clerkError.message ||
    fallback
  )
}
