/**
 * Clears the call stack by removing any lines that start with 'Error'
 * @param callstack - The call stack string to be cleared
 * @returns The cleared call stack string without error lines
 */
export default function clearCallstack(callstack: string) {
  return callstack.replaceAll(/^Error\n/g, '')
}
