export const MAX_LETTER_ATTEMPTS = 5

export type AttemptBudget = {
  student_id: string
  letter: string
  letter_index: number
  used: number
  remaining: number
  limit: number
}

export function cleanStudentName(value: string) {
  return value.replace(/[^a-zA-Z]/g, '')
}

export function resolveGoalWord(goalWord: string | null | undefined, fallback: string) {
  const cleanedGoal = cleanStudentName(goalWord ?? '')
  if (cleanedGoal) return cleanedGoal
  return cleanStudentName(fallback)
}

export function getTargetLetter(
  goalWord: string | null | undefined,
  fallback: string,
  letterIndex: number
) {
  return resolveGoalWord(goalWord, fallback)[letterIndex] ?? ''
}
