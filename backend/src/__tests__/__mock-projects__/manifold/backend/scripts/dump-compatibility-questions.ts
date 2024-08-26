import { runScript } from 'run-script'
import { Row } from 'common/supabase/utils'
import { writeCsv } from 'shared/helpers/file'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const questions = await pg.manyOrNone<Row<'love_questions'>>(`
      select * from love_questions
      where answer_type = 'compatibility_multiple_choice'
    `)

    console.log('questions', questions.length)

    let maxOptions = 0
    const questionValues = questions.map((q) => {
      const { question, multiple_choice_options } = q
      const obj: Record<string, string> = { question }
      for (const [option, i] of Object.entries(
        multiple_choice_options as object
      )) {
        obj[`option${i + 1}`] = option
        if (i > maxOptions) maxOptions = i
      }
      return obj
    })

    const fields = [
      'question',
      ...Array.from({ length: maxOptions }, (_, i) => `option${i + 1}`),
    ]

    await writeCsv('compatibility-questions.csv', fields, questionValues, '|')
  })
}
