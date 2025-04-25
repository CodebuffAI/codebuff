/**
 * Gets the cost per credit in cents for a user.
 * @param userId The ID of the user
 * @returns The cost per credit in cents
 */
export async function getUserCostPerCredit(userId: string): Promise<number> {
  // For now, return a fixed rate of 1 cent per credit
  return 1
}
