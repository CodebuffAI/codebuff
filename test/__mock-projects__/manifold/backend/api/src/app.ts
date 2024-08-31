import { hrtime } from 'node:process'
import * as cors from 'cors'
import * as crypto from 'crypto'
import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'

import { log, metrics } from 'shared/utils'
import { withMonitoringContext } from 'shared/monitoring/context'
import { APIError, pathWithPrefix } from 'common/api/utils'
import { health } from './health'
import { updateMe } from './update-me'
import { placeBet } from './place-bet'
import { cancelBet } from './cancel-bet'
import { sellShares } from './sell-shares'
import { claimmanalink } from './claim-manalink'
import { createMarket } from './create-market'
import { createComment } from './create-comment'
import { creategroup } from './create-group'
import { resolveMarket } from './resolve-market'
import { closeMarket } from './close-market'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe-endpoints'
import { getMe } from './get-me'
import { saveTwitchCredentials } from './save-twitch-credentials'
import { addLiquidity } from './add-liquidity'
import { validateiap } from './validate-iap'
import { markallnotifications } from './mark-all-notifications'
import { updatememberrole } from './update-group-member-role'
import { updategroupprivacy } from './update-group-privacy'
import { registerdiscordid } from './register-discord-id'
import { getuserisgroupmember } from './get-user-is-group-member'
import { completequest } from './complete-quest'
import { getsupabasetoken } from './get-supabase-token'
import { updateUserEmbedding } from './update-user-embedding'
import { deleteMarket } from './delete-market'
import { saveTopic } from './save-topic'
import { boostmarket } from './boost-market'
import { redeemboost } from './redeem-market-ad-reward'
import { followtopic } from './follow-topic'
import { editcomment } from 'api/edit-comment'
import {
  supabasesearchgroups,
  supabasesearchmygroups,
} from './supabase-search-groups'
import { leagueActivity } from './league-activity'
import { updategroup } from './update-group'
import { updateUserDisinterestEmbedding } from 'api/update-user-disinterests'
import { awardBounty } from './award-bounty'
import { addBounty } from './add-bounty'
import { cancelbounty } from './cancel-bounty'
import { createAnswerCPMM } from './create-answer-cpmm'
import { createportfolio } from './create-portfolio'
import { updateportfolio } from './update-portfolio'
import { searchgiphy } from './search-giphy'
import { manachantweet } from './manachan-tweet'
import { managram } from './managram'
import { leavereview } from './leave-review'
import { getusercontractmetricswithcontracts } from './get-user-contract-metrics-with-contracts'
import { castpollvote } from './cast-poll-vote'
import { getsimilargroupstocontract } from 'api/get-similar-groups-to-contract'
import { followUser } from './follow-user'
import { report } from './report'
import { createdashboard } from './create-dashboard'
import { getyourdashboards } from './get-your-dashboards'
import { followdashboard } from './follow-dashboard'
import { supabasesearchdashboards } from './supabase-search-dashboards'
import { getyourfolloweddashboards } from './get-your-followed-dashboards'
import { updatedashboard } from './update-dashboard'
import { deletedashboard } from './delete-dashboard'
import { setnews } from './set-news'
import { getnews } from './get-news'
import {
  getdashboardfromslug,
  getDashboardFromSlug,
} from './get-dashboard-from-slug'
import { unresolve } from './unresolve'
import { referuser } from 'api/refer-user'
import { banuser } from 'api/ban-user'
import { updateMarket } from 'api/update-market'
import { createprivateusermessage } from 'api/create-private-user-message'
import { createprivateusermessagechannel } from 'api/create-private-user-message-channel'
import { createlover } from 'api/love/create-lover'
import { updatelover } from 'api/love/update-lover'
import { createcommentonlover } from 'api/love/create-comment-on-lover'
import { hidecommentonlover } from 'api/love/hide-comment-on-lover'
import { searchlocation } from './search-location'
import { searchnearcity } from './search-near-city'
import { leaveprivateusermessagechannel } from 'api/leave-private-user-message-channel'
import { updateprivateusermessagechannel } from 'api/update-private-user-message-channel'
import { editanswercpmm } from 'api/edit-answer'
import { createlovecompatibilityquestion } from 'api/love/create-love-compatibility-question'
import { getCompatibleLovers } from './love/compatible-lovers'
import { API, type APIPath } from 'common/api/schema'
import { getMarkets } from 'api/markets'
import { createchartannotation } from 'api/create-chart-annotation'
import { deletechartannotation } from 'api/delete-chart-annotation'
import { assertUnreachable } from 'common/util/types'
import { hideComment } from './hide-comment'
import { pinComment } from './pin-comment'
import { getManagrams } from './get-managrams'
import { getGroups } from './get-groups'
import { getComments } from './get-comments'
import { getBets } from './get-bets'
import { getLiteUser, getUser } from './get-user'
import { getUsers } from './get-users'
import { getMarket } from './get-market'
import { getGroup } from './get-group'
import { getPositions } from './get-positions'
import { getLeagues } from './get-leagues'
import { getContract } from './get-contract'
import { addOrRemoveTopicFromContract } from './add-topic-to-market'
import { searchUsers } from './supabase-search-users'
import {
  searchMarketsLite,
  searchMarketsFull,
} from './supabase-search-contract'
import { post } from 'api/post'
import { fetchLinkPreview } from './fetch-link-preview'
import { type APIHandler, typedEndpoint } from './helpers/endpoint'
import { requestloan } from 'api/request-loan'
import { removePinnedPhoto } from './love/remove-pinned-photo'
import { getHeadlines, getPoliticsHeadlines } from './get-headlines'
import { getadanalytics } from 'api/get-ad-analytics'
import { getCompatibilityQuestions } from './love/get-compatibililty-questions'
import { addOrRemoveReaction } from './reaction'
import { likeLover } from './love/like-lover'
import { shipLovers } from './love/ship-lovers'
import { createManalink } from './create-manalink'
import { getLikesAndShips } from './love/get-likes-and-ships'
import { hasFreeLike } from './love/has-free-like'
import { starLover } from './love/star-lover'
import { getLovers } from './love/get-lovers'
import { unlistAndCancelUserContracts } from './unlist-and-cancel-user-contracts'
import { getGroupsWithTopContracts } from 'api/get-topics-with-markets'
import { getBalanceChanges } from 'api/get-balance-changes'
import { getLoverAnswers } from './love/get-lover-answers'
import { placeMultiBet } from 'api/place-multi-bet'
import { deletetv, settv } from './set-tv'
import { getPartnerStats } from './get-partner-stats'
import { getSeenMarketIds } from 'api/get-seen-market-ids'
import { recordContractView } from 'api/record-contract-view'
import { createPublicChatMessage } from 'api/create-public-chat-message'
import { getFollowedGroups } from './get-followed-groups'
import { getUniqueBetGroupCount } from 'api/get-unique-bet-groups'
import { deleteGroup } from './delete-group'
import { recordContractInteraction } from 'api/record-contract-interaction'
import { getUserPortfolio } from './get-user-portfolio'
import { createuser } from 'api/create-user'
import { verifyPhoneNumber } from 'api/verify-phone-number'
import { requestOTP } from 'api/request-phone-otp'
import { multiSell } from 'api/multi-sell'
import { convertSpiceToMana } from './convert-sp-to-mana'
import { donate } from './donate'
import { getFeed } from 'api/get-feed'
import { getManaSupply } from './get-mana-supply'
import { getUserPortfolioHistory } from './get-user-portfolio-history'
import { deleteMe } from './delete-me'
import { placeBetter } from './place-better'
import { updateModReport } from './update-mod-report'
import { getModReports } from './get-mod-reports'
import { searchContractPositions } from 'api/search-contract-positions'
import { blockUser, unblockUser } from './block-user'
import { blockGroup, unblockGroup } from './block-group'
import { blockMarket, unblockMarket } from './block-market'
import { getTxnSummaryStats } from 'api/get-txn-summary-stats'
import { getManaSummaryStats } from 'api/get-mana-summary-stats'
import { register } from 'api/gidx/register'
import { uploadDocument } from 'api/gidx/upload-document'
import { identityCallbackGIDX, paymentCallbackGIDX } from 'api/gidx/callback'
import { getVerificationStatus } from 'api/gidx/get-verification-status'
import { getCurrentPrivateUser } from './get-current-private-user'
import { updatePrivateUser } from './update-private-user'
import { setPushToken } from './push-token'
import { updateNotifSettings } from './update-notif-settings'
import { getVerificationDocuments } from 'api/gidx/get-verification-documents'
import { getMonitorStatus } from 'api/gidx/get-monitor-status'
import { getBestComments } from 'api/get-best-comments'
import { recordCommentView } from 'api/record-comment-view'
import {
  getChannelMemberships,
  getChannelMessages,
  getLastSeenChannelTime,
  setChannelLastSeenTime,
} from 'api/get-private-messages'
import { getNotifications } from 'api/get-notifications'
import { getCheckoutSession } from 'api/gidx/get-checkout-session'
import { completeCheckoutSession } from 'api/gidx/complete-checkout-session'
import { getContractTopics } from './get-contract-topics'
import { getRelatedMarkets } from 'api/get-related-markets'
import { getRelatedMarketsByGroup } from './get-related-markets-by-group'
import { followContract } from './follow-contract'
import { getUserLimitOrdersWithContracts } from 'api/get-user-limit-orders-with-contracts'
import { getInterestingGroupsFromViews } from 'api/get-interesting-groups-from-views'
import { completeCashoutSession } from 'api/gidx/complete-cashout-session'

const allowCorsUnrestricted: RequestHandler = cors({})

function cacheController(policy?: string): RequestHandler {
  return (_req, res, next) => {
    if (policy) res.appendHeader('Cache-Control', policy)
    next()
  }
}
const ignoredEndpoints = [
  '/get-channel-messages',
  '/v0/user/by-id/',
  '/get-channel-memberships',
  '/v0/get-mod-reports',
  '/get-channel-seen-time',
]

const requestMonitoring: RequestHandler = (req, res, next) => {
  const traceContext = req.get('X-Cloud-Trace-Context')
  const traceId = traceContext
    ? traceContext.split('/')[0]
    : crypto.randomUUID()
  const { method, path: endpoint, url } = req
  const baseEndpoint = getBaseName(endpoint)
  const context = { endpoint, traceId, baseEndpoint }
  withMonitoringContext(context, () => {
    if (method == 'OPTIONS') {
      next()
      return
    }
    const startTs = hrtime.bigint()
    const isLocalhost = req.get('host')?.includes('localhost')
    if (
      !isLocalhost ||
      (isLocalhost && !ignoredEndpoints.some((e) => endpoint.startsWith(e)))
    ) {
      log(`${method} ${url}`)
    }
    metrics.inc('http/request_count', { endpoint, baseEndpoint, method })
    res.on('close', () => {
      const endTs = hrtime.bigint()
      const latencyMs = Number(endTs - startTs) / 1e6 // Convert to milliseconds
      metrics.push('http/request_latency', latencyMs, {
        endpoint,
        method,
        baseEndpoint,
      })
    })
    next()
  })
}

const getBaseName = (path: string) => {
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return path
  const base = parts[1]
  if (parts.length === 2) return `/${base}`
  const specificPaths = ['bet', 'user', 'group', 'market']
  if (specificPaths.includes(base)) {
    return `/${base}/*`
  }
  return base
}
const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof APIError) {
    log.info(error)
    if (!res.headersSent) {
      const output: { [k: string]: unknown } = { message: error.message }
      if (error.details != null) {
        output.details = error.details
      }
      res.status(error.code).json(output)
    }
  } else {
    log.error(error)
    if (!res.headersSent) {
      res.status(500).json({ message: error.stack, error })
    }
  }
}

const apiRoute = (endpoint: RequestHandler) => {
  return [
    allowCorsUnrestricted,
    express.json(),
    endpoint,
    apiErrorHandler,
  ] as const
}

export const app = express()
app.use(requestMonitoring)

app.options('*', allowCorsUnrestricted)

// we define the handlers in this object in order to typecheck that every API has a handler
const handlers: { [k in APIPath]: APIHandler<k> } = {
  bet: placeBet,
  'multi-bet': placeMultiBet,
  'bet-ter': placeBetter,
  'follow-contract': followContract,
  'bet/cancel/:betId': cancelBet,
  'market/:contractId/sell': sellShares,
  bets: getBets,
  'get-notifications': getNotifications,
  'get-channel-memberships': getChannelMemberships,
  'get-channel-messages': getChannelMessages,
  'get-channel-seen-time': getLastSeenChannelTime,
  'set-channel-seen-time': setChannelLastSeenTime,
  'get-contract': getContract,
  comment: createComment,
  'hide-comment': hideComment,
  'pin-comment': pinComment,
  comments: getComments,
  market: createMarket,
  'market/:contractId/group': addOrRemoveTopicFromContract,
  'market/:contractId/groups': getContractTopics,
  'group/:slug': getGroup,
  'group/by-id/:id': getGroup,
  'group/by-id/:id/markets': ({ id, limit }, ...rest) =>
    getMarkets({ groupId: id, limit }, ...rest),
  'group/:slug/delete': deleteGroup,
  'group/by-id/:id/delete': deleteGroup,
  'group/:slug/block': blockGroup,
  'group/:slug/unblock': unblockGroup,
  groups: getGroups,
  'market/:id': getMarket,
  'market/:id/lite': ({ id }) => getMarket({ id, lite: true }),
  'slug/:slug': getMarket,
  'market/:contractId/update': updateMarket,
  'market/:contractId/close': closeMarket,
  'market/:contractId/resolve': resolveMarket,
  'market/:contractId/add-liquidity': addLiquidity,
  'market/:contractId/add-bounty': addBounty,
  'market/:contractId/award-bounty': awardBounty,
  'market/:contractId/answer': createAnswerCPMM,
  'market/:contractId/block': blockMarket,
  'market/:contractId/unblock': unblockMarket,
  'get-user-limit-orders-with-contracts': getUserLimitOrdersWithContracts,
  'get-interesting-groups-from-views': getInterestingGroupsFromViews,
  leagues: getLeagues,
  markets: getMarkets,
  'search-markets': searchMarketsLite,
  'search-markets-full': searchMarketsFull,
  managram: managram,
  managrams: getManagrams,
  manalink: createManalink,
  donate: donate,
  'convert-sp-to-mana': convertSpiceToMana,
  'market/:id/positions': getPositions,
  me: getMe,
  'me/update': updateMe,
  'me/delete': deleteMe,
  'me/private': getCurrentPrivateUser,
  'me/private/update': updatePrivateUser,
  'user/by-id/:id': getUser,
  'user/by-id/:id/lite': getLiteUser,
  'user/:username': getUser,
  'user/:username/lite': getLiteUser,
  'user/:username/bets': (...props) => getBets(...props),
  'user/by-id/:id/block': blockUser,
  'user/by-id/:id/unblock': unblockUser,
  users: getUsers,
  'search-users': searchUsers,
  react: addOrRemoveReaction,
  'save-twitch': saveTwitchCredentials,
  'set-push-token': setPushToken,
  'update-notif-settings': updateNotifSettings,
  headlines: getHeadlines,
  'politics-headlines': getPoliticsHeadlines,
  'compatible-lovers': getCompatibleLovers,
  post: post,
  'fetch-link-preview': fetchLinkPreview,
  'request-loan': requestloan,
  'remove-pinned-photo': removePinnedPhoto,
  'get-related-markets': getRelatedMarkets,
  'get-related-markets-by-group': getRelatedMarketsByGroup,
  'unlist-and-cancel-user-contracts': unlistAndCancelUserContracts,
  'get-ad-analytics': getadanalytics,
  'get-compatibility-questions': getCompatibilityQuestions,
  'like-lover': likeLover,
  'ship-lovers': shipLovers,
  'get-likes-and-ships': getLikesAndShips,
  'has-free-like': hasFreeLike,
  'star-lover': starLover,
  'get-lovers': getLovers,
  'get-lover-answers': getLoverAnswers,
  'set-news': setnews,
  'update-user-embedding': updateUserEmbedding,
  'search-groups': supabasesearchgroups,
  'search-my-groups': supabasesearchmygroups,
  'get-groups-with-top-contracts': getGroupsWithTopContracts,
  'get-balance-changes': getBalanceChanges,
  'get-partner-stats': getPartnerStats,
  'get-seen-market-ids': getSeenMarketIds,
  'record-contract-view': recordContractView,
  'get-dashboard-from-slug': getDashboardFromSlug,
  'create-public-chat-message': createPublicChatMessage,
  unresolve: unresolve,
  'get-followed-groups': getFollowedGroups,
  'unique-bet-group-count': getUniqueBetGroupCount,
  'record-contract-interaction': recordContractInteraction,
  'get-user-portfolio': getUserPortfolio,
  'get-user-portfolio-history': getUserPortfolioHistory,
  createuser: createuser,
  'verify-phone-number': verifyPhoneNumber,
  'request-otp': requestOTP,
  'multi-sell': multiSell,
  'get-feed': getFeed,
  'get-mana-supply': getManaSupply,
  'update-mod-report': updateModReport,
  'get-mod-reports': getModReports,
  'search-contract-positions': searchContractPositions,
  'get-txn-summary-stats': getTxnSummaryStats,
  'get-mana-summary-stats': getManaSummaryStats,
  'register-gidx': register,
  'get-checkout-session-gidx': getCheckoutSession,
  'complete-checkout-session-gidx': completeCheckoutSession,
  'complete-cashout-session-gidx': completeCashoutSession,
  'get-verification-status-gidx': getVerificationStatus,
  'upload-document-gidx': uploadDocument,
  'identity-callback-gidx': identityCallbackGIDX,
  'payment-callback-gidx': paymentCallbackGIDX,
  'get-verification-documents-gidx': getVerificationDocuments,
  'get-monitor-status-gidx': getMonitorStatus,
  'get-best-comments': getBestComments,
  'record-comment-view': recordCommentView,
}

Object.entries(handlers).forEach(([path, handler]) => {
  const api = API[path as APIPath]
  const cache = cacheController((api as any).cache)
  const url = '/' + pathWithPrefix(path as APIPath)

  const apiRoute = [
    url,
    express.json(),
    allowCorsUnrestricted,
    cache,
    typedEndpoint(path as any, handler as any),
    apiErrorHandler,
  ] as const

  if (api.method === 'POST') {
    app.post(...apiRoute)
  } else if (api.method === 'GET') {
    app.get(...apiRoute)
    // } else if (api.method === 'PUT') {
    //   app.put(...apiRoute)
  } else {
    assertUnreachable(api, 'Unsupported API method')
  }
})

app.get('/health', ...apiRoute(health))
app.get('/unsubscribe', ...apiRoute(unsubscribe))
app.post('/editcomment', ...apiRoute(editcomment))

app.post('/claimmanalink', ...apiRoute(claimmanalink))
app.post('/creategroup', ...apiRoute(creategroup))
app.post('/updategroup', ...apiRoute(updategroup))
app.post('/validateIap', ...apiRoute(validateiap))
app.post('/markallnotifications', ...apiRoute(markallnotifications))
app.post('/updatememberrole', ...apiRoute(updatememberrole))
app.post('/updategroupprivacy', ...apiRoute(updategroupprivacy))
app.post('/registerdiscordid', ...apiRoute(registerdiscordid))
app.post('/getuserisgroupmember', ...apiRoute(getuserisgroupmember))
app.post('/completequest', ...apiRoute(completequest))
app.post(
  '/update-user-disinterest-embedding',
  ...apiRoute(updateUserDisinterestEmbedding)
)
app.get('/getsupabasetoken', ...apiRoute(getsupabasetoken))
app.post('/delete-market', ...apiRoute(deleteMarket))
app.post('/save-topic', ...apiRoute(saveTopic))
app.post('/boost-market', ...apiRoute(boostmarket))
app.post('/redeem-boost', ...apiRoute(redeemboost))

app.post('/createcheckoutsession', allowCorsUnrestricted, createcheckoutsession)
app.post(
  '/stripewebhook',
  allowCorsUnrestricted,
  express.raw({ type: '*/*' }),
  stripewebhook
)
app.post('/follow-topic', ...apiRoute(followtopic))
app.post('/league-activity', ...apiRoute(leagueActivity))
app.post('/cancel-bounty', ...apiRoute(cancelbounty))
app.post('/edit-answer-cpmm', ...apiRoute(editanswercpmm))
app.post('/createportfolio', ...apiRoute(createportfolio))
app.post('/updateportfolio', ...apiRoute(updateportfolio))
app.post('/searchgiphy', ...apiRoute(searchgiphy))
app.post('/manachantweet', ...apiRoute(manachantweet))
app.post('/refer-user', ...apiRoute(referuser))
app.post('/leave-review', ...apiRoute(leavereview))
app.post(
  '/get-user-contract-metrics-with-contracts',
  ...apiRoute(getusercontractmetricswithcontracts)
)
app.post('/cast-poll-vote', ...apiRoute(castpollvote))
app.post(
  '/get-similar-groups-to-contract',
  ...apiRoute(getsimilargroupstocontract)
)
app.post('/follow-user', ...apiRoute(followUser))
app.post('/report', ...apiRoute(report))

app.post('/settv', ...apiRoute(settv))
app.post('/deletetv', ...apiRoute(deletetv))

app.post('/createdashboard', ...apiRoute(createdashboard))
app.post('/getyourdashboards', ...apiRoute(getyourdashboards))
app.post('/followdashboard', ...apiRoute(followdashboard))
app.post('/supabasesearchdashboards', ...apiRoute(supabasesearchdashboards))
app.post('/getyourfolloweddashboards', ...apiRoute(getyourfolloweddashboards))
app.post('/updatedashboard', ...apiRoute(updatedashboard))
app.post('/delete-dashboard', ...apiRoute(deletedashboard))
app.get('/get-news-dashboards', ...apiRoute(getnews))
app.post('/getdashboardfromslug', ...apiRoute(getdashboardfromslug))
app.post('/ban-user', ...apiRoute(banuser))
app.post('/create-private-user-message', ...apiRoute(createprivateusermessage))
app.post(
  '/create-private-user-message-channel',
  ...apiRoute(createprivateusermessagechannel)
)
app.post(
  '/leave-private-user-message-channel',
  ...apiRoute(leaveprivateusermessagechannel)
)
app.post(
  '/update-private-user-message-channel',
  ...apiRoute(updateprivateusermessagechannel)
)
app.post('/create-lover', ...apiRoute(createlover))
app.post('/update-lover', ...apiRoute(updatelover))
app.post('/create-comment-on-lover', ...apiRoute(createcommentonlover))
app.post('/hide-comment-on-lover', ...apiRoute(hidecommentonlover))
app.post('/searchlocation', ...apiRoute(searchlocation))
app.post('/searchnearcity', ...apiRoute(searchnearcity))
app.post(
  '/createlovecompatibilityquestion',
  ...apiRoute(createlovecompatibilityquestion)
)
app.post('/create-chart-annotation', ...apiRoute(createchartannotation))
app.post('/delete-chart-annotation', ...apiRoute(deletechartannotation))

// Catch 404 errors - this should be the last route
app.use(allowCorsUnrestricted, (req, res) => {
  res
    .status(404)
    .set('Content-Type', 'application/json')
    .json({
      message: `The requested route '${req.path}' does not exist. Please check your URL for any misspellings or refer to app.ts`,
    })
})
