import { runScript } from './run-script'
import { MultipleChoiceOptions } from 'common/love/multiple-choice'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const mcQuestions = [
      `Your parents’ opinion of your partner matters to you.`,
      'You are willing to meet someone from Manifold.love in person.',
      `You are happy you with your life.`,
      'It is important to you that people be on time.',
      'You enjoy going to art museums.',
      'You are extroverted.',
      'You are a morning person.',
      'It is a requirement that you communicate every day with your significant other.',
      'You enjoy intense, intellectual conversations.',
      'God/religion is important in your life.',
      'Your room is neat.',
      'You have been loved enough.',
    ]

    const integerQuestions = ['How many hours do you typically work in a week?']

    const freeResponseQuestions = [
      'What is your favorite thing about yourself?',
      'What is your least favorite thing about yourself?',
      'Which of your habits conflict with your values?',
      'What do you love to do in your free time?',
      'What is your favorite book and why?',
      'What are your non-negotiables in a relationship?',
      'What are your long-term life goals?',
      'How do you express and prefer to receive love?',
      'Is there a social, political, or ethical issue that you feel strongly about?',
      `What's a conspiracy theory that you believe in?`,
      `If you could live in any time period, which would you choose and why?`,
      `What's the most unusual place you've ever visited?`,
      `What "useless" skill do you possess that you're proud of?`,
      `What would constitute a “perfect” day for you?`,
      `For what in your life do you feel most grateful?`,
      `What is the greatest accomplishment of your life?`,
      `What, if anything, is too serious to be joked about?`,
      `If you could wake up tomorrow having gained any one quality or ability, what would it be?`,
      `Is there something that you’ve dreamed of doing for a long time? Why haven’t you done it?`,
      `How close and warm is your family? Do you feel your childhood was happier than most other people’s?`,
    ]
    await Promise.all(
      mcQuestions.map(async (question) =>
        pg.none(
          `insert into love_questions (question,
                            importance_score,
                            creator_id,
                            answer_type,
                            multiple_choice_options
                            )
                            values ($1, $2, $3, $4, $5)`,
          // [question, 0.5, 'AJwLWoo3xue32XIiAVrL5SyR1WB2', 'free_response', null]
          [
            question,
            0.5,
            'AJwLWoo3xue32XIiAVrL5SyR1WB2',
            'multiple_choice',
            MultipleChoiceOptions,
          ]
        )
      )
    )
  })
}
