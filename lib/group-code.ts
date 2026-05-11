export const GROUP_CODE_DIGITS = 4
export const GROUP_CODE_LEGACY_DIGITS = 4
export const GROUP_CODE_MIN = 10 ** (GROUP_CODE_DIGITS - 1)
export const GROUP_CODE_MAX = 10 ** GROUP_CODE_DIGITS - 1

export function formatGroupCode(code: number) {
  return String(code).padStart(GROUP_CODE_DIGITS, '0')
}

export function isValidGroupCodeInput(code: string) {
  return new RegExp(`^\\d{${GROUP_CODE_DIGITS}}$`).test(code)
}

export function generateGroupCode(random = Math.random) {
  const range = GROUP_CODE_MAX - GROUP_CODE_MIN + 1
  return GROUP_CODE_MIN + Math.floor(random() * range)
}
