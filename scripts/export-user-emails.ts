import db from 'common/db'
import * as schema from 'common/db/schema'
import { writeFileSync } from 'fs'

async function exportUserEmails(): Promise<void> {
  console.log('Exporting user emails...\n')

  try {
    const users = await db
      .select({
        email: schema.user.email,
        name: schema.user.name,
        created_at: schema.user.created_at,
        subscription_active: schema.user.subscription_active,
      })
      .from(schema.user)
      .orderBy(schema.user.created_at)

    // Create CSV content
    const headers = ['Email', 'Name', 'Created At', 'Has Subscription']
    const rows = users.map(user => [
      user.email,
      user.name || '',
      user.created_at?.toISOString() || '',
      user.subscription_active ? 'Yes' : 'No'
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(field => 
        // Escape fields that contain commas or quotes
        field.includes(',') || field.includes('"') 
          ? `"${field.replace(/"/g, '""')}"` 
          : field
      ).join(','))
    ].join('\n')

    // Write to file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `user-emails-${timestamp}.csv`
    writeFileSync(filename, csvContent)

    console.log(`\nExported ${users.length} user emails to ${filename}`)

  } catch (error) {
    console.error('Error exporting user emails:', error)
  }
}

// Run the script
exportUserEmails()
