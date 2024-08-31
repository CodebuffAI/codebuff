import { DOMAIN, ENV_CONFIG, LOVE_DOMAIN } from 'common/envs/constants'
import { Bet } from 'common/bet'
import { getProbability } from 'common/calculate'
import {
  Contract,
  contractPath,
  MultiContract,
  renderResolution,
} from 'common/contract'
import { PrivateUser, User } from 'common/user'
import { formatLargeNumber, formatMoney } from 'common/util/format'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { sendTemplateEmail, sendTextEmail } from './send-email'
import { contractUrl, getPrivateUser, getUser, log } from 'shared/utils'
import { getContractOGProps } from 'common/contract-seo'
import {
  notification_reason_types,
  NotificationReason,
} from 'common/notification'
import { chunk, Dictionary } from 'lodash'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { buildOgUrl } from 'common/util/og'
import { removeUndefinedProps } from 'common/util/object'
import { getLoveOgImageUrl } from 'common/love/og-image'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getLoverRow } from 'common/love/lover'
import { HOUR_MS } from 'common/util/time'

export type PerContractInvestmentsData = {
  questionTitle: string
  questionUrl: string
  questionProb: string
  profitStyle: string
  currentValue: number
  pastValue: number
  profit: number
}

export type OverallPerformanceData = {
  profit: string
  prediction_streak: string
  markets_traded: string
  profit_style: string
  likes_received: string
  markets_created: string
  unique_bettors: string
  league_rank: string
}

export const emailMoneyFormat = (amount: number) => {
  return formatMoney(amount).replace(ENV_CONFIG.moneyMoniker, 'M')
}

export const getMarketResolutionEmail = (
  reason: NotificationReason,
  privateUser: PrivateUser,
  userName: string,
  investment: number,
  payout: number,
  creator: User,
  creatorPayout: number,
  contract: Contract,
  resolution: string,
  resolutionProbability?: number,
  resolutions?: { [outcome: string]: number },
  answerId?: string
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return

  const outcome = toDisplayResolution(
    contract,
    resolution,
    resolutionProbability,
    resolutions,
    answerId
  )

  const creatorPayoutText =
    creatorPayout >= 1 && privateUser.id === creator.id
      ? ` (plus ${emailMoneyFormat(creatorPayout)} in commissions)`
      : ''

  const correctedInvestment =
    Number.isNaN(investment) || investment < 0 ? 0 : investment

  const displayedInvestment = emailMoneyFormat(correctedInvestment)
  const displayedPayout = emailMoneyFormat(payout)

  const templateData: market_resolved_template = {
    userId: privateUser.id,
    name: userName,
    creatorName: creator.name,
    question: contract.question,
    outcome,
    investment: displayedInvestment,
    payout: displayedPayout + creatorPayoutText,
    url: `https://${DOMAIN}/${creator.username}/${contract.slug}`,
    unsubscribeUrl,
  }

  // Modify template here:
  // https://app.mailgun.com/app/sending/domains/mg.manifold.markets/templates/edit/market-resolved-bulk/initial

  return {
    entry: [privateUser.email, templateData] as EmailAndTemplateEntry,
    correctedInvestment,
  }
}

type market_resolved_template = {
  userId: string
  name: string
  creatorName: string
  question: string
  outcome: string
  investment: string
  payout: string
  url: string
  unsubscribeUrl: string
}

export const toDisplayResolution = (
  contract: Contract,
  resolution: string,
  resolutionProbability?: number,
  resolutions?: { [outcome: string]: number },
  answerId?: string
) => {
  if (contract.outcomeType === 'BINARY') {
    const prob = resolutionProbability ?? getProbability(contract)
    return renderResolution(resolution, prob)
  }

  if (contract.outcomeType === 'PSEUDO_NUMERIC') {
    const { resolution, resolutionValue } = contract

    if (resolution === 'CANCEL') return 'N/A'

    return resolutionValue
      ? formatLargeNumber(resolutionValue)
      : formatNumericProbability(
          resolutionProbability ?? getProbability(contract),
          contract
        )
  }
  if (contract.outcomeType === 'STONK') {
    return formatNumericProbability(getProbability(contract), contract)
  }

  const isIndependentMulti =
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1' &&
    !contract.shouldAnswersSumToOne
  if (isIndependentMulti && answerId) {
    const answer = contract.answers.find((a) => a.id === answerId)
    if (answer) {
      return `${answer.text} ${renderResolution(
        resolution,
        resolutionProbability ?? answer.prob
      )}`
    }
  }
  if ((resolution === 'MKT' && resolutions) || resolution === 'CHOOSE_MULTIPLE')
    return 'MULTI'
  if (resolution === 'CANCEL') return 'N/A'

  const answer = (contract as MultiContract).answers.find(
    (a) => a.id === resolution
  )
  if (answer) return answer.text
  return `#${resolution}`
}

export const sendWelcomeEmail = async (
  user: User,
  privateUser: PrivateUser
) => {
  if (!privateUser || !privateUser.email) return

  const { name } = user
  const firstName = name.split(' ')[0]

  const { unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    'onboarding_flow'
  )

  return await sendTemplateEmail(
    privateUser.email,
    'Welcome to Manifold!',
    'welcome',
    {
      name: firstName,
      unsubscribeUrl,
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
      'o:deliverytime': new Date(Date.now() + 2 * HOUR_MS).toUTCString(),
    }
  )
}

export type EmailAndTemplateData = { name: string; [key: string]: string }
export type EmailAndTemplateEntry = [string, EmailAndTemplateData]

export const sendBulkEmails = async (
  subject: string,
  template: string,
  recipients: EmailAndTemplateEntry[],
  from = `Manifold <no-reply@manifold.markets>`
) => {
  // Mailgun has a limit of 1000 recipients per batch
  const emailChunks = chunk(recipients, 1000)
  for (const chunk of emailChunks) {
    const mailgunDomain = 'mg.manifold.markets'
    const mailgunApiKey = process.env.MAILGUN_KEY as string
    const url = `https://api.mailgun.net/v3/${mailgunDomain}/messages`
    const data = new URLSearchParams()
    data.append('from', from)
    data.append('subject', subject)
    data.append('template', template)
    chunk.forEach(([recipientEmail, details]) => {
      data.append('to', `${details.name} <${recipientEmail}>`)
    })
    data.append(
      'recipient-variables',
      JSON.stringify(Object.fromEntries(chunk))
    )

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${mailgunApiKey}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: data,
      })
      const json = await response.json()
      log('Sent bulk emails for subject: ' + subject, json)
    } catch (error) {
      log.error('Error sending emails for subject: ' + subject, {
        error,
      })
    }
  }
}

export const sendPersonalFollowupEmail = async (
  user: User,
  privateUser: PrivateUser,
  sendTime: string
) => {
  if (!privateUser || !privateUser.email) return

  const { name } = user
  const firstName = name.split(' ')[0]

  const emailBody = `Hi ${firstName},

Thanks for signing up! I'm one of the cofounders of Manifold, and was wondering how you've found your experience on the platform so far?

If you haven't already, I encourage you to try creating your own prediction market (https://manifold.markets/create) and joining our Discord chat (https://discord.com/invite/eHQBNBqXuh).

Feel free to reply to this email with any questions or concerns you have.

Cheers,

James
Cofounder of Manifold
https://manifold.markets
 `

  await sendTextEmail(
    privateUser.email,
    'How are you finding Manifold?',
    emailBody,
    {
      from: 'James from Manifold <james@manifold.markets>',
      'o:deliverytime': sendTime,
    }
  )
}

export const sendCreatorGuideEmail = async (
  user: User,
  privateUser: PrivateUser
) => {
  if (!privateUser || !privateUser.email) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'onboarding_flow'
  )
  if (!sendToEmail) return
  return await sendTemplateEmail(
    privateUser.email,
    'Create your own prediction market',
    'creating-market',
    {
      name: firstName,
      unsubscribeUrl,
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
    }
  )
}

export const sendUnactivatedNewUserEmail = async (
  user: User,
  templateId: string
) => {
  const pg = createSupabaseDirectClient()
  const privateUser = await getPrivateUser(user.id, pg)
  if (!privateUser || !privateUser.email) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'onboarding_flow'
  )
  if (!sendToEmail) return
  return await sendTemplateEmail(
    privateUser.email,
    `Help improve Manifold + win $100 Amazon gift card`,
    templateId,
    {
      name: firstName,
      unsubscribeUrl,
    },
    {
      from: 'Ian from Manifold <ian@manifold.markets>',
    }
  )
}

export const sendThankYouEmail = async (
  user: User,
  privateUser: PrivateUser
) => {
  if (!privateUser || !privateUser.email) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'thank_you_for_purchases'
  )

  if (!sendToEmail) return
  return await sendTemplateEmail(
    privateUser.email,
    'Thanks for your Manifold purchase',
    'thank-you',
    {
      name: firstName,
      unsubscribeUrl,
    },
    {
      from: 'David from Manifold <david@manifold.markets>',
    }
  )
}

export const sendMarketCloseEmail = async (
  reason: notification_reason_types,
  user: User,
  privateUser: PrivateUser,
  contract: Contract
) => {
  if (!privateUser.email) return

  const { username, name, id: userId } = user
  const firstName = name.split(' ')[0]

  const { question, slug, volume } = contract

  const url = `https://${DOMAIN}/${username}/${slug}`

  // We ignore if they were able to unsubscribe from market close emails, this is a necessary email
  return await sendTemplateEmail(
    privateUser.email,
    'Your market has closed',
    'market-close',
    {
      question,
      url,
      unsubscribeUrl: '',
      userId,
      name: firstName,
      volume: emailMoneyFormat(volume),
    }
  )
}

export const getNewCommentEmail = (
  reason: NotificationReason,
  privateUser: PrivateUser,
  userName: string,
  commentCreator: User,
  contract: Contract,
  commentText: string,
  commentId: string,
  bet?: Bet
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser || !privateUser.email || !sendToEmail) return

  const marketUrl = `https://${DOMAIN}/${contract.creatorUsername}/${contract.slug}#${commentId}`

  const { name: commentorName, avatarUrl: commentorAvatarUrl } = commentCreator

  let betDescription = ''
  if (bet) {
    const { amount } = bet
    betDescription = `${amount < 0 ? 'sold' : 'bought'} ${emailMoneyFormat(
      Math.abs(amount)
    )}`
  }

  if (bet) {
    betDescription = `${betDescription} of ${toDisplayResolution(
      contract,
      bet.outcome
    )}`
  }
  return [
    privateUser.email,
    {
      name: userName,
      commentorName,
      commentorAvatarUrl: commentorAvatarUrl ?? '',
      comment: commentText,
      marketUrl,
      unsubscribeUrl,
      betDescription,
    },
  ] as EmailAndTemplateEntry
}

export const sendNewAnswerEmail = async (
  reason: NotificationReason,
  privateUser: PrivateUser,
  name: string,
  text: string,
  contract: Contract,
  avatarUrl?: string
) => {
  const { creatorId } = contract
  // Don't send the creator's own answers.
  if (privateUser.id === creatorId) return

  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return

  const { question, creatorUsername, slug } = contract

  const marketUrl = `https://${DOMAIN}/${creatorUsername}/${slug}`

  const subject = `New answer on ${question}`
  const from = `${name} <info@manifold.markets>`

  return await sendTemplateEmail(
    privateUser.email,
    subject,
    'market-answer',
    {
      name,
      avatarUrl: avatarUrl ?? '',
      answer: text,
      marketUrl,
      unsubscribeUrl,
    },
    { from }
  )
}

export const sendInterestingMarketsEmail = async (
  userName: string,
  privateUser: PrivateUser,
  contractsToSend: Contract[],
  deliveryTime?: string
) => {
  if (!privateUser || !privateUser.email) return

  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'trending_markets'
  )
  if (!sendToEmail) return

  const firstName = userName.split(' ')[0]

  await sendTemplateEmail(
    privateUser.email,
    `${contractsToSend[0].question} & 5 more interesting markets on Manifold`,
    'interesting-markets',
    {
      name: firstName,
      unsubscribeUrl,

      question1Title: contractsToSend[0].question,
      question1Link: contractUrl(contractsToSend[0]),
      question1ImgSrc: imageSourceUrl(contractsToSend[0]),
      question2Title: contractsToSend[1].question,
      question2Link: contractUrl(contractsToSend[1]),
      question2ImgSrc: imageSourceUrl(contractsToSend[1]),
      question3Title: contractsToSend[2].question,
      question3Link: contractUrl(contractsToSend[2]),
      question3ImgSrc: imageSourceUrl(contractsToSend[2]),
      question4Title: contractsToSend[3].question,
      question4Link: contractUrl(contractsToSend[3]),
      question4ImgSrc: imageSourceUrl(contractsToSend[3]),
      question5Title: contractsToSend[4].question,
      question5Link: contractUrl(contractsToSend[4]),
      question5ImgSrc: imageSourceUrl(contractsToSend[4]),
      question6Title: contractsToSend[5].question,
      question6Link: contractUrl(contractsToSend[5]),
      question6ImgSrc: imageSourceUrl(contractsToSend[5]),
    },
    deliveryTime ? { 'o:deliverytime': deliveryTime } : undefined
  )
}

export const sendBonusWithInterestingMarketsEmail = async (
  user: User,
  privateUser: PrivateUser,
  contractsToSend: Contract[],
  bonusAmount: number
) => {
  if (!privateUser || !privateUser.email) return
  let unsubscribeUrl = ''
  // This is email is of both types, so try either
  const { sendToEmail, unsubscribeUrl: unsub1 } =
    getNotificationDestinationsForUser(privateUser, 'onboarding_flow')
  const { sendToEmail: trendingSendToEmail, unsubscribeUrl: unsub2 } =
    getNotificationDestinationsForUser(privateUser, 'trending_markets')

  if (!sendToEmail && !trendingSendToEmail) return
  unsubscribeUrl = !sendToEmail ? unsub2 : unsub1

  const { name } = user
  const firstName = name.split(' ')[0]

  await sendTemplateEmail(
    privateUser.email,
    `Interesting questions on Manifold + ${bonusAmount} bonus mana`,
    'signup-bonus-with-interesting-markets',
    {
      name: firstName,
      unsubscribeUrl,
      bonusAmount: formatMoney(bonusAmount),
      question1Title: contractsToSend[0].question,
      question1Link: contractUrl(contractsToSend[0]),
      question1ImgSrc: imageSourceUrl(contractsToSend[0]),
      question2Title: contractsToSend[1].question,
      question2Link: contractUrl(contractsToSend[1]),
      question2ImgSrc: imageSourceUrl(contractsToSend[1]),
      question3Title: contractsToSend[2].question,
      question3Link: contractUrl(contractsToSend[2]),
      question3ImgSrc: imageSourceUrl(contractsToSend[2]),
      question4Title: contractsToSend[3].question,
      question4Link: contractUrl(contractsToSend[3]),
      question4ImgSrc: imageSourceUrl(contractsToSend[3]),
      question5Title: contractsToSend[4].question,
      question5Link: contractUrl(contractsToSend[4]),
      question5ImgSrc: imageSourceUrl(contractsToSend[4]),
      question6Title: contractsToSend[5].question,
      question6Link: contractUrl(contractsToSend[5]),
      question6ImgSrc: imageSourceUrl(contractsToSend[5]),
    }
  )
}

function imageSourceUrl(contract: Contract) {
  return buildOgUrl(
    removeUndefinedProps(getContractOGProps(contract)),
    'market'
  )
}
export const getNewFollowedMarketEmail = (
  reason: notification_reason_types,
  userName: string,
  privateUser: PrivateUser,
  contract: Contract
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return
  const firstName = userName.split(' ')[0]
  const creatorName = contract.creatorName

  const questionImgSrc = imageSourceUrl(contract)
  return [
    privateUser.email,
    {
      name: firstName,
      creatorName,
      unsubscribeUrl,
      questionTitle: contract.question,
      questionUrl: contractUrl(contract),
      questionImgSrc,
    },
  ] as EmailAndTemplateEntry
}

export const sendNewPrivateMarketEmail = async (
  reason: notification_reason_types,
  privateUser: PrivateUser,
  contract: Contract,
  groupName: string
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return
  const user = await getUser(privateUser.id)
  if (!user) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const creatorName = contract.creatorName

  const questionImgSrc = imageSourceUrl(contract)
  console.log('questionImgSrc', questionImgSrc)
  return await sendTemplateEmail(
    privateUser.email,
    `${creatorName} asked ${contract.question} in private group, ${groupName}`,
    'new-market-from-private-group',
    {
      name: firstName,
      creatorName,
      unsubscribeUrl,
      questionTitle: contract.question,
      questionUrl: contractUrl(contract),
      questionImgSrc,
      groupName,
    },
    {
      from: `${creatorName} on Manifold <no-reply@manifold.markets>`,
    }
  )
}
export const sendNewUniqueBettorsEmail = async (
  reason: notification_reason_types,
  privateUser: PrivateUser,
  contract: Contract,
  totalPredictors: number,
  newPredictors: User[],
  userBets: Dictionary<[Bet, ...Bet[]]>
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return
  const user = await getUser(privateUser.id)
  if (!user) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const creatorName = contract.creatorName
  // make the emails stack for the same contract
  const subject = `You made a popular market! ${
    contract.question.length > 50
      ? contract.question.slice(0, 50) + '...'
      : contract.question
  } just got ${
    newPredictors.length
  } new predictions. Check out who's predicting on it inside.`
  const templateData: Record<string, string> = {
    name: firstName,
    creatorName,
    totalPredictors: totalPredictors.toString(),
    marketTitle: contract.question,
    marketUrl: contractUrl(contract),
    unsubscribeUrl,
    newPredictors: newPredictors.length.toString(),
  }

  newPredictors.forEach((p, i) => {
    templateData[`bettor${i + 1}Name`] = p.name
    if (p.avatarUrl) templateData[`bettor${i + 1}AvatarUrl`] = p.avatarUrl
    const bet = userBets[p.id][0]
    if (bet) {
      const { amount } = bet
      templateData[`bet${i + 1}Description`] = `${
        amount < 0 ? 'sold' : 'bought'
      } ${emailMoneyFormat(Math.abs(amount))}`
    }
  })

  return await sendTemplateEmail(
    privateUser.email,
    subject,
    // This template accepts 5 unique bettors
    'new-unique-bettors',
    templateData,
    {
      from: `Manifold <no-reply@manifold.markets>`,
    }
  )
}

export const getWeeklyPortfolioUpdateEmail = (
  userName: string,
  privateUser: PrivateUser,
  investments: PerContractInvestmentsData[],
  overallPerformance: OverallPerformanceData,
  moversToSend: number
) => {
  if (!privateUser || !privateUser.email) return

  const { unsubscribeUrl, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'profit_loss_updates'
  )

  if (!sendToEmail) return

  const firstName = userName.split(' ')[0]
  const templateData: Record<string, string> = {
    name: firstName,
    unsubscribeUrl,
    ...overallPerformance,
  }
  for (let i = 0; i < moversToSend; i++) {
    const investment = investments[i]
    if (investment) {
      templateData[`question${i + 1}Title`] = investment.questionTitle
      templateData[`question${i + 1}Url`] = investment.questionUrl
      templateData[`question${i + 1}Prob`] = investment.questionProb
      templateData[`question${i + 1}Change`] = emailMoneyFormat(
        investment.profit
      )
      templateData[`question${i + 1}ChangeStyle`] = investment.profitStyle
      templateData[`question${i + 1}Display`] = 'display: table-row'
    } else templateData[`question${i + 1}Display`] = 'display: none'
  }

  return [
    privateUser.email,
    // Math.random() > 0.5 ? 'iansphilips@gmail.com' : 'boawishbone@gmail.com',
    templateData,
  ] as EmailAndTemplateEntry
}

export const sendNewMatchEmail = async (
  reason: NotificationReason,
  privateUser: PrivateUser,
  contract: Contract,
  creatorName: string,
  matchedWithUser: User
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return
  const user = await getUser(privateUser.id)
  if (!user) return

  const { name } = user
  const firstName = name.split(' ')[0]
  const lover = await getLoverRow(matchedWithUser.id, createSupabaseClient())
  const loveOgImageUrl = getLoveOgImageUrl(matchedWithUser, lover)
  const questionImgSrc = imageSourceUrl(contract)
  return await sendTemplateEmail(
    privateUser.email,
    `You have a new match!`,
    'new-match',
    {
      name: firstName,
      creatorName,
      unsubscribeUrl,
      questionTitle: contract.question,
      questionUrl: `https://${LOVE_DOMAIN}${contractPath(contract)}`,
      userUrl: `https://${LOVE_DOMAIN}/${matchedWithUser.username}`,
      matchedUsersName: matchedWithUser.name,
      userImgSrc: loveOgImageUrl,
      questionImgSrc,
    },
    {
      from: `manifold.love <no-reply@manifold.markets>`,
    }
  )
}
export const sendNewMessageEmail = async (
  reason: NotificationReason,
  privateUser: PrivateUser,
  fromUser: User,
  toUser: User,
  channelId: number,
  subject: string
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return
  const firstName = toUser.name.split(' ')[0]
  const lover = await getLoverRow(fromUser.id, createSupabaseClient())
  const loveOgImageUrl = getLoveOgImageUrl(fromUser, lover)

  return await sendTemplateEmail(
    privateUser.email,
    subject,
    'new-message',
    {
      name: firstName,
      messagesUrl: `https://${LOVE_DOMAIN}/messages/${channelId}`,
      creatorName: fromUser.name,
      userImgSrc: loveOgImageUrl,
      unsubscribeUrl,
    },
    {
      from: `manifold.love <no-reply@manifold.markets>`,
    }
  )
}

export const sendNewEndorsementEmail = async (
  reason: NotificationReason,
  privateUser: PrivateUser,
  fromUser: User,
  onUser: User,
  subject: string,
  text: string
) => {
  const { sendToEmail, unsubscribeUrl } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (!privateUser.email || !sendToEmail) return
  const firstName = onUser.name.split(' ')[0]
  return await sendTemplateEmail(
    privateUser.email,
    subject,
    'new-endorsement',
    {
      name: firstName,
      endorsementUrl: `https://${LOVE_DOMAIN}/${onUser.username}`,
      creatorName: fromUser.name,
      creatorAvatarUrl: fromUser.avatarUrl,
      endorsementText: text,
      unsubscribeUrl,
    },
    {
      from: `manifold.love <no-reply@manifold.markets>`,
    }
  )
}
