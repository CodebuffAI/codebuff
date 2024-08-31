import { runScript } from 'run-script'

runScript(async ({ db, firestore }) => {
  // Query Supabase for all lovers
  const { data: lovers, error } = await db.from('lovers').select('user_id')
  if (error) {
    console.error(error)
    return
  }

  const emails = []
  // Loop through each lover and get their email from Firebase
  for (const lover of lovers) {
    const userId = lover.user_id

    // Get the user's email from Firebase
    const userDoc = await firestore
      .collection('private-users')
      .doc(userId)
      .get()
    if (!userDoc.exists) {
      console.error(`User with ID ${userId} not found in Firebase`)
      continue
    }

    const userEmail = userDoc.get('email')
    emails.push(userEmail)
    console.log(`Lover with ID ${userId} has email ${userEmail}`)
  }

  console.log('All emails:', emails)
})
