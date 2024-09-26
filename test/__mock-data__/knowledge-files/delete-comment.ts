import { FileChange, Message } from 'common/src/actions'
import { ProjectFileContext } from 'common/src/util/file'

export const mockFileContext: ProjectFileContext = {
  currentWorkingDirectory: '/Users/jahooma/manifold',
  fileTree: [
    {
      name: '.firebaserc',
      type: 'file',
    },
    {
      name: '.gitattributes',
      type: 'file',
    },
    {
      name: '.github',
      type: 'directory',
      children: [
        {
          name: 'CONTRIBUTING.md',
          type: 'file',
        },
        {
          name: 'workflows',
          type: 'directory',
          children: [
            {
              name: 'check.yml',
              type: 'file',
            },
            {
              name: 'format.yml',
              type: 'file',
            },
            {
              name: 'lint.yml',
              type: 'file',
            },
            {
              name: 'test.yml',
              type: 'file',
            },
          ],
        },
      ],
    },
    {
      name: '.gitignore',
      type: 'file',
    },
    {
      name: '.prettierrc',
      type: 'file',
    },
    {
      name: '.vscode',
      type: 'directory',
      children: [
        {
          name: 'extensions.json',
          type: 'file',
        },
        {
          name: 'launch.json',
          type: 'file',
        },
        {
          name: 'settings.json',
          type: 'file',
        },
      ],
    },
    {
      name: '.yarnrc',
      type: 'file',
    },
    {
      name: 'LICENSE.md',
      type: 'file',
    },
    {
      name: 'README.md',
      type: 'file',
    },
    {
      name: 'backend',
      type: 'directory',
      children: [
        {
          name: '.gitignore',
          type: 'file',
        },
        {
          name: 'api',
          type: 'directory',
          children: [
            {
              name: '.eslintrc.js',
              type: 'file',
            },
            {
              name: '.gcloudignore',
              type: 'file',
            },
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: 'Dockerfile',
              type: 'file',
            },
            {
              name: 'README.md',
              type: 'file',
            },
            {
              name: 'debug.sh',
              type: 'file',
            },
            {
              name: 'deploy-api.sh',
              type: 'file',
            },
            {
              name: 'dist',
              type: 'directory',
              children: [],
            },
            {
              name: 'knowledge.md',
              type: 'file',
            },
            {
              name: 'lib',
              type: 'directory',
              children: [],
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'src',
              type: 'directory',
              children: [
                {
                  name: 'add-bounty.ts',
                  type: 'file',
                },
                {
                  name: 'add-liquidity.ts',
                  type: 'file',
                },
                {
                  name: 'add-topic-to-market.ts',
                  type: 'file',
                },
                {
                  name: 'app.ts',
                  type: 'file',
                },
                {
                  name: 'award-bounty.ts',
                  type: 'file',
                },
                {
                  name: 'ban-user.ts',
                  type: 'file',
                },
                {
                  name: 'block-group.ts',
                  type: 'file',
                },
                {
                  name: 'block-market.ts',
                  type: 'file',
                },
                {
                  name: 'block-user.ts',
                  type: 'file',
                },
                {
                  name: 'boost-market.ts',
                  type: 'file',
                },
                {
                  name: 'broadcast-test.ts',
                  type: 'file',
                },
                {
                  name: 'cancel-bet.ts',
                  type: 'file',
                },
                {
                  name: 'cancel-bounty.ts',
                  type: 'file',
                },
                {
                  name: 'cast-poll-vote.ts',
                  type: 'file',
                },
                {
                  name: 'claim-manalink.ts',
                  type: 'file',
                },
                {
                  name: 'close-market.ts',
                  type: 'file',
                },
                {
                  name: 'complete-quest.ts',
                  type: 'file',
                },
                {
                  name: 'convert-cash-to-mana.ts',
                  type: 'file',
                },
                {
                  name: 'convert-sp-to-mana.ts',
                  type: 'file',
                },
                {
                  name: 'create-answer-cpmm.ts',
                  type: 'file',
                },
                {
                  name: 'create-cash-contract.ts',
                  type: 'file',
                },
                {
                  name: 'create-chart-annotation.ts',
                  type: 'file',
                },
                {
                  name: 'create-comment.ts',
                  type: 'file',
                },
                {
                  name: 'create-dashboard.ts',
                  type: 'file',
                },
                {
                  name: 'create-group.ts',
                  type: 'file',
                },
                {
                  name: 'create-manalink.ts',
                  type: 'file',
                },
                {
                  name: 'create-market.ts',
                  type: 'file',
                },
                {
                  name: 'create-private-user-message-channel.ts',
                  type: 'file',
                },
                {
                  name: 'create-private-user-message.ts',
                  type: 'file',
                },
                {
                  name: 'create-public-chat-message.ts',
                  type: 'file',
                },
                {
                  name: 'create-user.ts',
                  type: 'file',
                },
                {
                  name: 'delete-chart-annotation.ts',
                  type: 'file',
                },
                {
                  name: 'delete-dashboard.ts',
                  type: 'file',
                },
                {
                  name: 'delete-group.ts',
                  type: 'file',
                },
                {
                  name: 'delete-market.ts',
                  type: 'file',
                },
                {
                  name: 'delete-me.ts',
                  type: 'file',
                },
                {
                  name: 'donate.ts',
                  type: 'file',
                },
                {
                  name: 'edit-answer.ts',
                  type: 'file',
                },
                {
                  name: 'edit-comment.ts',
                  type: 'file',
                },
                {
                  name: 'fetch-link-preview.ts',
                  type: 'file',
                },
                {
                  name: 'follow-contract.ts',
                  type: 'file',
                },
                {
                  name: 'follow-dashboard.ts',
                  type: 'file',
                },
                {
                  name: 'follow-topic.ts',
                  type: 'file',
                },
                {
                  name: 'follow-user.ts',
                  type: 'file',
                },
                {
                  name: 'get-ad-analytics.ts',
                  type: 'file',
                },
                {
                  name: 'get-balance-changes.ts',
                  type: 'file',
                },
                {
                  name: 'get-best-comments.ts',
                  type: 'file',
                },
                {
                  name: 'get-bets.ts',
                  type: 'file',
                },
                {
                  name: 'get-cashouts.ts',
                  type: 'file',
                },
                {
                  name: 'get-comments.ts',
                  type: 'file',
                },
                {
                  name: 'get-contract-topics.ts',
                  type: 'file',
                },
                {
                  name: 'get-contract.ts',
                  type: 'file',
                },
                {
                  name: 'get-current-private-user.ts',
                  type: 'file',
                },
                {
                  name: 'get-dashboard-from-slug.ts',
                  type: 'file',
                },
                {
                  name: 'get-feed.ts',
                  type: 'file',
                },
                {
                  name: 'get-followed-groups.ts',
                  type: 'file',
                },
                {
                  name: 'get-group.ts',
                  type: 'file',
                },
                {
                  name: 'get-groups.ts',
                  type: 'file',
                },
                {
                  name: 'get-headlines.ts',
                  type: 'file',
                },
                {
                  name: 'get-interesting-groups-from-views.ts',
                  type: 'file',
                },
                {
                  name: 'get-leagues.ts',
                  type: 'file',
                },
                {
                  name: 'get-mana-summary-stats.ts',
                  type: 'file',
                },
                {
                  name: 'get-mana-supply.ts',
                  type: 'file',
                },
                {
                  name: 'get-managrams.ts',
                  type: 'file',
                },
                {
                  name: 'get-market.ts',
                  type: 'file',
                },
                {
                  name: 'get-me.ts',
                  type: 'file',
                },
                {
                  name: 'get-mod-reports.ts',
                  type: 'file',
                },
                {
                  name: 'get-news.ts',
                  type: 'file',
                },
                {
                  name: 'get-notifications.ts',
                  type: 'file',
                },
                {
                  name: 'get-partner-stats.ts',
                  type: 'file',
                },
                {
                  name: 'get-positions.ts',
                  type: 'file',
                },
                {
                  name: 'get-private-messages.ts',
                  type: 'file',
                },
                {
                  name: 'get-redeemable-prize-cash.ts',
                  type: 'file',
                },
                {
                  name: 'get-related-markets-by-group.ts',
                  type: 'file',
                },
                {
                  name: 'get-related-markets.ts',
                  type: 'file',
                },
                {
                  name: 'get-seen-market-ids.ts',
                  type: 'file',
                },
                {
                  name: 'get-similar-groups-to-contract.ts',
                  type: 'file',
                },
                {
                  name: 'get-supabase-token.ts',
                  type: 'file',
                },
                {
                  name: 'get-topics-with-markets.ts',
                  type: 'file',
                },
                {
                  name: 'get-txn-summary-stats.ts',
                  type: 'file',
                },
                {
                  name: 'get-unique-bet-groups.ts',
                  type: 'file',
                },
                {
                  name: 'get-user-contract-metrics-with-contracts.ts',
                  type: 'file',
                },
                {
                  name: 'get-user-is-group-member.ts',
                  type: 'file',
                },
                {
                  name: 'get-user-limit-orders-with-contracts.ts',
                  type: 'file',
                },
                {
                  name: 'get-user-portfolio-history.ts',
                  type: 'file',
                },
                {
                  name: 'get-user-portfolio.ts',
                  type: 'file',
                },
                {
                  name: 'get-user.ts',
                  type: 'file',
                },
                {
                  name: 'get-users.ts',
                  type: 'file',
                },
                {
                  name: 'get-your-dashboards.ts',
                  type: 'file',
                },
                {
                  name: 'get-your-followed-dashboards.ts',
                  type: 'file',
                },
                {
                  name: 'gidx',
                  type: 'directory',
                  children: [
                    {
                      name: 'callback.ts',
                      type: 'file',
                    },
                    {
                      name: 'complete-cashout-session.ts',
                      type: 'file',
                    },
                    {
                      name: 'complete-checkout-session.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-checkout-session.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-monitor-status.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-verification-documents.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-verification-status.ts',
                      type: 'file',
                    },
                    {
                      name: 'register.ts',
                      type: 'file',
                    },
                    {
                      name: 'upload-document.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'health.ts',
                  type: 'file',
                },
                {
                  name: 'helpers',
                  type: 'directory',
                  children: [
                    {
                      name: 'debounce.ts',
                      type: 'file',
                    },
                    {
                      name: 'endpoint.ts',
                      type: 'file',
                    },
                    {
                      name: 'groups.ts',
                      type: 'file',
                    },
                    {
                      name: 'on-create-market.ts',
                      type: 'file',
                    },
                    {
                      name: 'rate-limit.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'hide-comment.ts',
                  type: 'file',
                },
                {
                  name: 'league-activity.ts',
                  type: 'file',
                },
                {
                  name: 'leave-private-user-message-channel.ts',
                  type: 'file',
                },
                {
                  name: 'leave-review.ts',
                  type: 'file',
                },
                {
                  name: 'love',
                  type: 'directory',
                  children: [
                    {
                      name: 'compatible-lovers.ts',
                      type: 'file',
                    },
                    {
                      name: 'create-comment-on-lover.ts',
                      type: 'file',
                    },
                    {
                      name: 'create-love-compatibility-question.ts',
                      type: 'file',
                    },
                    {
                      name: 'create-lover.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-compatibililty-questions.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-likes-and-ships.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-lover-answers.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-lovers.ts',
                      type: 'file',
                    },
                    {
                      name: 'has-free-like.ts',
                      type: 'file',
                    },
                    {
                      name: 'hide-comment-on-lover.ts',
                      type: 'file',
                    },
                    {
                      name: 'like-lover.ts',
                      type: 'file',
                    },
                    {
                      name: 'remove-pinned-photo.ts',
                      type: 'file',
                    },
                    {
                      name: 'ship-lovers.ts',
                      type: 'file',
                    },
                    {
                      name: 'star-lover.ts',
                      type: 'file',
                    },
                    {
                      name: 'update-lover.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'manachan-tweet.ts',
                  type: 'file',
                },
                {
                  name: 'managram.ts',
                  type: 'file',
                },
                {
                  name: 'mark-all-notifications.ts',
                  type: 'file',
                },
                {
                  name: 'markets.ts',
                  type: 'file',
                },
                {
                  name: 'multi-sell.ts',
                  type: 'file',
                },
                {
                  name: 'on-create-bet.ts',
                  type: 'file',
                },
                {
                  name: 'on-create-comment-on-contract.ts',
                  type: 'file',
                },
                {
                  name: 'on-update-liquidity-provision.ts',
                  type: 'file',
                },
                {
                  name: 'pin-comment.ts',
                  type: 'file',
                },
                {
                  name: 'place-bet.ts',
                  type: 'file',
                },
                {
                  name: 'place-better.ts',
                  type: 'file',
                },
                {
                  name: 'place-multi-bet.ts',
                  type: 'file',
                },
                {
                  name: 'post.ts',
                  type: 'file',
                },
                {
                  name: 'push-token.ts',
                  type: 'file',
                },
                {
                  name: 'reaction.ts',
                  type: 'file',
                },
                {
                  name: 'record-comment-view.ts',
                  type: 'file',
                },
                {
                  name: 'record-contract-interaction.ts',
                  type: 'file',
                },
                {
                  name: 'record-contract-view.ts',
                  type: 'file',
                },
                {
                  name: 'redeem-market-ad-reward.ts',
                  type: 'file',
                },
                {
                  name: 'redeem-shares.ts',
                  type: 'file',
                },
                {
                  name: 'refer-user.ts',
                  type: 'file',
                },
                {
                  name: 'register-discord-id.ts',
                  type: 'file',
                },
                {
                  name: 'report.ts',
                  type: 'file',
                },
                {
                  name: 'request-loan.ts',
                  type: 'file',
                },
                {
                  name: 'request-phone-otp.ts',
                  type: 'file',
                },
                {
                  name: 'resolve-market.ts',
                  type: 'file',
                },
                {
                  name: 'save-topic.ts',
                  type: 'file',
                },
                {
                  name: 'save-twitch-credentials.ts',
                  type: 'file',
                },
                {
                  name: 'search-contract-positions.ts',
                  type: 'file',
                },
                {
                  name: 'search-giphy.ts',
                  type: 'file',
                },
                {
                  name: 'search-location.ts',
                  type: 'file',
                },
                {
                  name: 'search-near-city.ts',
                  type: 'file',
                },
                {
                  name: 'sell-shares.ts',
                  type: 'file',
                },
                {
                  name: 'serve.ts',
                  type: 'file',
                },
                {
                  name: 'set-news.ts',
                  type: 'file',
                },
                {
                  name: 'set-tv.ts',
                  type: 'file',
                },
                {
                  name: 'stripe-endpoints.ts',
                  type: 'file',
                },
                {
                  name: 'supabase-search-contract.ts',
                  type: 'file',
                },
                {
                  name: 'supabase-search-dashboards.ts',
                  type: 'file',
                },
                {
                  name: 'supabase-search-groups.ts',
                  type: 'file',
                },
                {
                  name: 'supabase-search-users.ts',
                  type: 'file',
                },
                {
                  name: 'unlist-and-cancel-user-contracts.ts',
                  type: 'file',
                },
                {
                  name: 'unresolve.ts',
                  type: 'file',
                },
                {
                  name: 'unsubscribe.ts',
                  type: 'file',
                },
                {
                  name: 'update-dashboard.ts',
                  type: 'file',
                },
                {
                  name: 'update-group-member-role.ts',
                  type: 'file',
                },
                {
                  name: 'update-group-privacy.ts',
                  type: 'file',
                },
                {
                  name: 'update-group.ts',
                  type: 'file',
                },
                {
                  name: 'update-market.ts',
                  type: 'file',
                },
                {
                  name: 'update-me.ts',
                  type: 'file',
                },
                {
                  name: 'update-mod-report.ts',
                  type: 'file',
                },
                {
                  name: 'update-notif-settings.ts',
                  type: 'file',
                },
                {
                  name: 'update-private-user-message-channel.ts',
                  type: 'file',
                },
                {
                  name: 'update-private-user.ts',
                  type: 'file',
                },
                {
                  name: 'update-user-disinterests.ts',
                  type: 'file',
                },
                {
                  name: 'validate-iap.ts',
                  type: 'file',
                },
                {
                  name: 'verify-phone-number.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
          ],
        },
        {
          name: 'discord-bot',
          type: 'directory',
          children: [
            {
              name: '.dockerignore',
              type: 'file',
            },
            {
              name: '.eslintrc.cjs',
              type: 'file',
            },
            {
              name: '.gcloudignore',
              type: 'file',
            },
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: 'Dockerfile',
              type: 'file',
            },
            {
              name: 'README.md',
              type: 'file',
            },
            {
              name: 'deploy.sh',
              type: 'file',
            },
            {
              name: 'img',
              type: 'directory',
              children: [
                {
                  name: 'ss.png',
                  type: 'file',
                },
              ],
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'src',
              type: 'directory',
              children: [
                {
                  name: 'analytics.ts',
                  type: 'file',
                },
                {
                  name: 'api.ts',
                  type: 'file',
                },
                {
                  name: 'command.ts',
                  type: 'file',
                },
                {
                  name: 'commands',
                  type: 'directory',
                  children: [
                    {
                      name: 'about.ts',
                      type: 'file',
                    },
                    {
                      name: 'create.ts',
                      type: 'file',
                    },
                    {
                      name: 'index.ts',
                      type: 'file',
                    },
                    {
                      name: 'react-to-bet-on-market.ts',
                      type: 'file',
                    },
                    {
                      name: 'search.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'constants',
                  type: 'directory',
                  children: [
                    {
                      name: 'config.ts',
                      type: 'file',
                    },
                    {
                      name: 'dev.ts',
                      type: 'file',
                    },
                    {
                      name: 'prod.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'emojis.ts',
                  type: 'file',
                },
                {
                  name: 'helpers.ts',
                  type: 'file',
                },
                {
                  name: 'index.ts',
                  type: 'file',
                },
                {
                  name: 'leaderboard.ts',
                  type: 'file',
                },
                {
                  name: 'server.ts',
                  type: 'file',
                },
                {
                  name: 'storage.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
          ],
        },
        {
          name: 'email-templates',
          type: 'directory',
          children: [
            {
              name: 'creating-market.html',
              type: 'file',
            },
            {
              name: 'didnt-bet-new-user-survey.html',
              type: 'file',
            },
            {
              name: 'interesting-markets.html',
              type: 'file',
            },
            {
              name: 'market-answer-comment.html',
              type: 'file',
            },
            {
              name: 'market-answer.html',
              type: 'file',
            },
            {
              name: 'market-close.html',
              type: 'file',
            },
            {
              name: 'market-comment-bulk.html',
              type: 'file',
            },
            {
              name: 'market-resolved-bulk.html',
              type: 'file',
            },
            {
              name: 'market-resolved-no-bets-bulk.html',
              type: 'file',
            },
            {
              name: 'new-endorsement.html',
              type: 'file',
            },
            {
              name: 'new-market-from-followed-user-bulk.html',
              type: 'file',
            },
            {
              name: 'new-market-from-private-group.html',
              type: 'file',
            },
            {
              name: 'new-match.html',
              type: 'file',
            },
            {
              name: 'new-message.html',
              type: 'file',
            },
            {
              name: 'new-unique-bettor.html',
              type: 'file',
            },
            {
              name: 'new-unique-bettors.html',
              type: 'file',
            },
            {
              name: 'portfolio-update-bulk.html',
              type: 'file',
            },
            {
              name: 'sign-up-bonus-with-interesting-markets.html',
              type: 'file',
            },
            {
              name: 'thank-you.html',
              type: 'file',
            },
            {
              name: 'welcome.html',
              type: 'file',
            },
          ],
        },
        {
          name: 'functions',
          type: 'directory',
          children: [
            {
              name: '.env.dev',
              type: 'file',
            },
            {
              name: '.env.prod',
              type: 'file',
            },
            {
              name: '.eslintrc.js',
              type: 'file',
            },
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: 'README.md',
              type: 'file',
            },
            {
              name: 'dist',
              type: 'directory',
              children: [],
            },
            {
              name: 'lib',
              type: 'directory',
              children: [],
            },
            {
              name: 'package-lock.json',
              type: 'file',
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'src',
              type: 'directory',
              children: [
                {
                  name: 'index.ts',
                  type: 'file',
                },
                {
                  name: 'scheduled',
                  type: 'directory',
                  children: [
                    {
                      name: 'drizzle-liquidity.ts',
                      type: 'file',
                    },
                    {
                      name: 'reset-betting-streaks.ts',
                      type: 'file',
                    },
                    {
                      name: 'reset-quests-stats.ts',
                      type: 'file',
                    },
                    {
                      name: 'weekly-portfolio-updates.ts',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
          ],
        },
        {
          name: 'replicator',
          type: 'directory',
          children: [],
        },
        {
          name: 'scheduler',
          type: 'directory',
          children: [
            {
              name: '.gcloudignore',
              type: 'file',
            },
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: 'Dockerfile',
              type: 'file',
            },
            {
              name: 'README.md',
              type: 'file',
            },
            {
              name: 'debug.sh',
              type: 'file',
            },
            {
              name: 'deploy-scheduler.sh',
              type: 'file',
            },
            {
              name: 'dist',
              type: 'directory',
              children: [],
            },
            {
              name: 'lib',
              type: 'directory',
              children: [],
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'src',
              type: 'directory',
              children: [
                {
                  name: 'index.ts',
                  type: 'file',
                },
                {
                  name: 'jobs',
                  type: 'directory',
                  children: [
                    {
                      name: 'auto-award-bounty.ts',
                      type: 'file',
                    },
                    {
                      name: 'clean-old-notifications.ts',
                      type: 'file',
                    },
                    {
                      name: 'denormalize-answers.ts',
                      type: 'file',
                    },
                    {
                      name: 'helpers.ts',
                      type: 'file',
                    },
                    {
                      name: 'increment-streak-forgiveness.ts',
                      type: 'file',
                    },
                    {
                      name: 'index.ts',
                      type: 'file',
                    },
                    {
                      name: 'poll-poll-resolutions.ts',
                      type: 'file',
                    },
                    {
                      name: 'reindex-table.ts',
                      type: 'file',
                    },
                    {
                      name: 'reset-pg-stats.ts',
                      type: 'file',
                    },
                    {
                      name: 'reset-weekly-emails-flags.ts',
                      type: 'file',
                    },
                    {
                      name: 'score-contracts.ts',
                      type: 'file',
                    },
                    {
                      name: 'send-market-close-emails.ts',
                      type: 'file',
                    },
                    {
                      name: 'streak-expiration-notice.ts',
                      type: 'file',
                    },
                    {
                      name: 'update-league-ranks.ts',
                      type: 'file',
                    },
                    {
                      name: 'update-league.ts',
                      type: 'file',
                    },
                    {
                      name: 'update-stats.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'templates',
                  type: 'directory',
                  children: [
                    {
                      name: 'index.hbs',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'utils.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
          ],
        },
        {
          name: 'scripts',
          type: 'directory',
          children: [
            {
              name: '.eslintrc.js',
              type: 'file',
            },
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: '.manicode',
              type: 'directory',
              children: [
                {
                  name: 'chats',
                  type: 'directory',
                  children: [],
                },
              ],
            },
            {
              name: 'README.md',
              type: 'file',
            },
            {
              name: 'add-cash-balance-column.sql',
              type: 'file',
            },
            {
              name: 'add-cash-column.sql',
              type: 'file',
            },
            {
              name: 'add-cash-stat-columns.sql',
              type: 'file',
            },
            {
              name: 'add-liquidity-to-markets.ts',
              type: 'file',
            },
            {
              name: 'add-love-questions.ts',
              type: 'file',
            },
            {
              name: 'add-lovers-to-general.ts',
              type: 'file',
            },
            {
              name: 'add-new-notification-preference.ts',
              type: 'file',
            },
            {
              name: 'add-reactivated-to-league.ts',
              type: 'file',
            },
            {
              name: 'add-token-column.sql',
              type: 'file',
            },
            {
              name: 'adjust-user-profit-pivot.ts',
              type: 'file',
            },
            {
              name: 'airdrop.ts',
              type: 'file',
            },
            {
              name: 'backfill-about-post-group-ids.ts',
              type: 'file',
            },
            {
              name: 'backfill-all-group-posts.ts',
              type: 'file',
            },
            {
              name: 'backfill-answer-index.ts',
              type: 'file',
            },
            {
              name: 'backfill-answer-resolution-times.ts',
              type: 'file',
            },
            {
              name: 'backfill-answer-subsidy-pool.ts',
              type: 'file',
            },
            {
              name: 'backfill-answer-total-liquidity.ts',
              type: 'file',
            },
            {
              name: 'backfill-avatar-urls.ts',
              type: 'file',
            },
            {
              name: 'backfill-bet-flags.ts',
              type: 'file',
            },
            {
              name: 'backfill-bet-visibility.ts',
              type: 'file',
            },
            {
              name: 'backfill-blocks.ts',
              type: 'file',
            },
            {
              name: 'backfill-bte-ante.ts',
              type: 'file',
            },
            {
              name: 'backfill-comment-ids.ts',
              type: 'file',
            },
            {
              name: 'backfill-comment-types.ts',
              type: 'file',
            },
            {
              name: 'backfill-contract-followers.ts',
              type: 'file',
            },
            {
              name: 'backfill-contract-isranked.ts',
              type: 'file',
            },
            {
              name: 'backfill-contract-metrics-user-data.ts',
              type: 'file',
            },
            {
              name: 'backfill-daily-scores.ts',
              type: 'file',
            },
            {
              name: 'backfill-empty-unique-bettor-count.ts',
              type: 'file',
            },
            {
              name: 'backfill-fees.ts',
              type: 'file',
            },
            {
              name: 'backfill-followers.ts',
              type: 'file',
            },
            {
              name: 'backfill-group-ids.ts',
              type: 'file',
            },
            {
              name: 'backfill-group-privacy-status.ts',
              type: 'file',
            },
            {
              name: 'backfill-last-updated-time.ts',
              type: 'file',
            },
            {
              name: 'backfill-liquidity-txn.ts',
              type: 'file',
            },
            {
              name: 'backfill-loan-amount.ts',
              type: 'file',
            },
            {
              name: 'backfill-match-creator-id.ts',
              type: 'file',
            },
            {
              name: 'backfill-missing-shares-from-other.ts',
              type: 'file',
            },
            {
              name: 'backfill-multi-binary-color.sql',
              type: 'file',
            },
            {
              name: 'backfill-popularity-scores.ts',
              type: 'file',
            },
            {
              name: 'backfill-post-comment-visibility.ts',
              type: 'file',
            },
            {
              name: 'backfill-post-privacy-fields.ts',
              type: 'file',
            },
            {
              name: 'backfill-stripe-purchase-txns.ts',
              type: 'file',
            },
            {
              name: 'backfill-subsidy-pool.ts',
              type: 'file',
            },
            {
              name: 'backfill-supabase-quests.ts',
              type: 'file',
            },
            {
              name: 'backfill-tiers.ts',
              type: 'file',
            },
            {
              name: 'backfill-unique-bettors-day.ts',
              type: 'file',
            },
            {
              name: 'backfill-unique-bettors.ts',
              type: 'file',
            },
            {
              name: 'backup-db.ts',
              type: 'file',
            },
            {
              name: 'calculate-kyc-bonus-rewards.ts',
              type: 'file',
            },
            {
              name: 'categorize.ts',
              type: 'file',
            },
            {
              name: 'change-user-info.ts',
              type: 'file',
            },
            {
              name: 'chaos.ts',
              type: 'file',
            },
            {
              name: 'check-backfilled-tiers.ts',
              type: 'file',
            },
            {
              name: 'clean-contracts.ts',
              type: 'file',
            },
            {
              name: 'clean-display-names.ts',
              type: 'file',
            },
            {
              name: 'clean-local-firestore-db.ts',
              type: 'file',
            },
            {
              name: 'clean-users.ts',
              type: 'file',
            },
            {
              name: 'clear-duplicate-card-views.ts',
              type: 'file',
            },
            {
              name: 'compare-bet-endpoints.ts',
              type: 'file',
            },
            {
              name: 'convert-binary-to-stonk-markets.ts',
              type: 'file',
            },
            {
              name: 'convert-events-to-interactions.ts',
              type: 'file',
            },
            {
              name: 'convert-remaining-prize-points.ts',
              type: 'file',
            },
            {
              name: 'convert-topics-to-groups.ts',
              type: 'file',
            },
            {
              name: 'correct-answer-resolution-probability.ts',
              type: 'file',
            },
            {
              name: 'correct-bet-probability.ts',
              type: 'file',
            },
            {
              name: 'correct-contract-creator-info.ts',
              type: 'file',
            },
            {
              name: 'create-cash-contract.ts',
              type: 'file',
            },
            {
              name: 'create-dev-private-users.ts',
              type: 'file',
            },
            {
              name: 'create-matches.ts',
              type: 'file',
            },
            {
              name: 'create-new-notification-preferences.ts',
              type: 'file',
            },
            {
              name: 'create-private-users.ts',
              type: 'file',
            },
            {
              name: 'debit-unpaid-loans-bug.ts',
              type: 'file',
            },
            {
              name: 'decrease-deposits-for-created-answers.ts',
              type: 'file',
            },
            {
              name: 'delete-bad-images.ts',
              type: 'file',
            },
            {
              name: 'delete-cert.ts',
              type: 'file',
            },
            {
              name: 'delete-comments.ts',
              type: 'file',
            },
            {
              name: 'delete-cpmm-2.ts',
              type: 'file',
            },
            {
              name: 'delete-custom-gcp-metric.ts',
              type: 'file',
            },
            {
              name: 'delete-email.ts',
              type: 'file',
            },
            {
              name: 'delete-group.ts',
              type: 'file',
            },
            {
              name: 'delete-numeric-dpm.ts',
              type: 'file',
            },
            {
              name: 'delete-private-groups.ts',
              type: 'file',
            },
            {
              name: 'delete-tags.ts',
              type: 'file',
            },
            {
              name: 'denormalize-answers.ts',
              type: 'file',
            },
            {
              name: 'denormalize-avatar-urls.ts',
              type: 'file',
            },
            {
              name: 'denormalize-bet-user-data.ts',
              type: 'file',
            },
            {
              name: 'denormalize-comment-bet-data.ts',
              type: 'file',
            },
            {
              name: 'denormalize-comment-contract-data.ts',
              type: 'file',
            },
            {
              name: 'denormalize.ts',
              type: 'file',
            },
            {
              name: 'drizzle.ts',
              type: 'file',
            },
            {
              name: 'drop-is-politics.sql',
              type: 'file',
            },
            {
              name: 'drop-unused-indexes.sql',
              type: 'file',
            },
            {
              name: 'dump-compatibility-questions.ts',
              type: 'file',
            },
            {
              name: 'export-emails-for-newsletter.ts',
              type: 'file',
            },
            {
              name: 'fill-spice.ts',
              type: 'file',
            },
            {
              name: 'find-deep-docs.ts',
              type: 'file',
            },
            {
              name: 'fix-bet-undefined-answerids.ts',
              type: 'file',
            },
            {
              name: 'fix-busted-ids.ts',
              type: 'file',
            },
            {
              name: 'fix-jack-presidential-market.ts',
              type: 'file',
            },
            {
              name: 'fix-last-bet-time.ts',
              type: 'file',
            },
            {
              name: 'fix-loan-deposit-payouts.ts',
              type: 'file',
            },
            {
              name: 'fix-null-shares.ts',
              type: 'file',
            },
            {
              name: 'fix-popularity-scores.ts',
              type: 'file',
            },
            {
              name: 'fix-shares-dpm-multi.ts',
              type: 'file',
            },
            {
              name: 'generate-embeddings.ts',
              type: 'file',
            },
            {
              name: 'generate-image-prompts.ts',
              type: 'file',
            },
            {
              name: 'generate-next-season.ts',
              type: 'file',
            },
            {
              name: 'generate-topic-vectors.ts',
              type: 'file',
            },
            {
              name: 'generate-user-topic-interests.ts',
              type: 'file',
            },
            {
              name: 'generate-yc-batch-markets.ts',
              type: 'file',
            },
            {
              name: 'get-app-user-emails.ts',
              type: 'file',
            },
            {
              name: 'get-contract-emails.ts',
              type: 'file',
            },
            {
              name: 'get-emails.ts',
              type: 'file',
            },
            {
              name: 'get-json-data-dump.ts',
              type: 'file',
            },
            {
              name: 'get-lovers-emails.ts',
              type: 'file',
            },
            {
              name: 'get-mana-purchases-csv.ts',
              type: 'file',
            },
            {
              name: 'get-mana-supply.ts',
              type: 'file',
            },
            {
              name: 'get-new-user-emails.ts',
              type: 'file',
            },
            {
              name: 'give-extra-purchased-mana.ts',
              type: 'file',
            },
            {
              name: 'invert-stats-table.sql',
              type: 'file',
            },
            {
              name: 'make-contracts-public.ts',
              type: 'file',
            },
            {
              name: 'manicode.sh',
              type: 'file',
            },
            {
              name: 'manicode.ts',
              type: 'file',
            },
            {
              name: 'manifest-airdrop.ts',
              type: 'file',
            },
            {
              name: 'mass-ban-fine.ts',
              type: 'file',
            },
            {
              name: 'merge-all-dupe-names.ts',
              type: 'file',
            },
            {
              name: 'merge-groups.ts',
              type: 'file',
            },
            {
              name: 'migrate-about-posts.sql',
              type: 'file',
            },
            {
              name: 'migrate-contract.ts',
              type: 'file',
            },
            {
              name: 'migrate-dashboard-descriptions.sql',
              type: 'file',
            },
            {
              name: 'migrate-data-from-contract-bets.ts',
              type: 'file',
            },
            {
              name: 'migrate-manalinks.sql',
              type: 'file',
            },
            {
              name: 'migrate-multi-dpm-to-cpmm.ts',
              type: 'file',
            },
            {
              name: 'migrate-reactions.sql',
              type: 'file',
            },
            {
              name: 'migrate-to-cfmm.ts',
              type: 'file',
            },
            {
              name: 'migrate-to-dpm-2.ts',
              type: 'file',
            },
            {
              name: 'notify-of-comments.ts',
              type: 'file',
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'pay-out-contract-again.ts',
              type: 'file',
            },
            {
              name: 'place-many-bets.ts',
              type: 'file',
            },
            {
              name: 'populate-user-portfolio-history-latest.ts',
              type: 'file',
            },
            {
              name: 'port-column-supabase.ts',
              type: 'file',
            },
            {
              name: 'recalculate-contract-totals.ts',
              type: 'file',
            },
            {
              name: 'recalculate-multi-contract-metrics.ts',
              type: 'file',
            },
            {
              name: 'reclaim-mana-undo.ts',
              type: 'file',
            },
            {
              name: 'reclaim-mana.ts',
              type: 'file',
            },
            {
              name: 'redo-resolution-payouts.ts',
              type: 'file',
            },
            {
              name: 'refund-bounties.ts',
              type: 'file',
            },
            {
              name: 'regen-schema.ts',
              type: 'file',
            },
            {
              name: 'reimburse-broken-markets.ts',
              type: 'file',
            },
            {
              name: 'remove-answer-ante.ts',
              type: 'file',
            },
            {
              name: 'remove-contract-views.ts',
              type: 'file',
            },
            {
              name: 'remove-group-link-denorm.sql',
              type: 'file',
            },
            {
              name: 'remove-nsfw-block.ts',
              type: 'file',
            },
            {
              name: 'remove-openai-cover-image-urls.ts',
              type: 'file',
            },
            {
              name: 'remove-unique-bettor-ids.ts',
              type: 'file',
            },
            {
              name: 'remove-unused-property.ts',
              type: 'file',
            },
            {
              name: 'rename-user-contracts.ts',
              type: 'file',
            },
            {
              name: 'replay-writes-until-done.ts',
              type: 'file',
            },
            {
              name: 'resolve-bounties.ts',
              type: 'file',
            },
            {
              name: 'resolve-dates-no.ts',
              type: 'file',
            },
            {
              name: 'resolve-old-relationship-markets.ts',
              type: 'file',
            },
            {
              name: 'run-auto-award-bounties.ts',
              type: 'file',
            },
            {
              name: 'run-denormalize-answers.ts',
              type: 'file',
            },
            {
              name: 'run-script.ts',
              type: 'file',
            },
            {
              name: 'save-mana-stats.ts',
              type: 'file',
            },
            {
              name: 'search-markets.ts',
              type: 'file',
            },
            {
              name: 'send-leagues-end-of-season.ts',
              type: 'file',
            },
            {
              name: 'send-sweepcash.ts',
              type: 'file',
            },
            {
              name: 'set-avatar-cache-headers.ts',
              type: 'file',
            },
            {
              name: 'supabase',
              type: 'directory',
              children: [
                {
                  name: 'backfill-user-ids.ts',
                  type: 'file',
                },
                {
                  name: 'query-recent-bettor-searchs.sql',
                  type: 'file',
                },
              ],
            },
            {
              name: 'supabase-import.ts',
              type: 'file',
            },
            {
              name: 'test-backend-function.ts',
              type: 'file',
            },
            {
              name: 'test-close-date.ts',
              type: 'file',
            },
            {
              name: 'test-fb-analytics.ts',
              type: 'file',
            },
            {
              name: 'test-resolve-unresolve.ts',
              type: 'file',
            },
            {
              name: 'test-scoring.ts',
              type: 'file',
            },
            {
              name: 'test-supabase.ts',
              type: 'file',
            },
            {
              name: 'top-up-manifold.ts',
              type: 'file',
            },
            {
              name: 'transfer-contract-ownership.ts',
              type: 'file',
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
            {
              name: 'turn-private-group-public.ts',
              type: 'file',
            },
            {
              name: 'txn-native-columns.sql',
              type: 'file',
            },
            {
              name: 'unconvert-stonk-markets.ts',
              type: 'file',
            },
            {
              name: 'undo-contract-payouts.ts',
              type: 'file',
            },
            {
              name: 'unlist-group-contracts.ts',
              type: 'file',
            },
            {
              name: 'unlist-markets-and-redact-user-name.ts',
              type: 'file',
            },
            {
              name: 'unlist-user-contracts.ts',
              type: 'file',
            },
            {
              name: 'update-contract-visibility.ts',
              type: 'file',
            },
            {
              name: 'update-last-comment-time.ts',
              type: 'file',
            },
            {
              name: 'update-league.ts',
              type: 'file',
            },
            {
              name: 'update-metrics.ts',
              type: 'file',
            },
            {
              name: 'update-notification-preferences.ts',
              type: 'file',
            },
            {
              name: 'update-stats.ts',
              type: 'file',
            },
            {
              name: 'websocket-connect.ts',
              type: 'file',
            },
            {
              name: 'websocket-test.ts',
              type: 'file',
            },
            {
              name: 'zap-liquidity.ts',
              type: 'file',
            },
          ],
        },
        {
          name: 'shared',
          type: 'directory',
          children: [
            {
              name: '.eslintrc.js',
              type: 'file',
            },
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: 'lib',
              type: 'directory',
              children: [],
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'src',
              type: 'directory',
              children: [
                {
                  name: 'analytics.ts',
                  type: 'file',
                },
                {
                  name: 'audit-events.ts',
                  type: 'file',
                },
                {
                  name: 'backfill-user-topic-interests.ts',
                  type: 'file',
                },
                {
                  name: 'bounty.ts',
                  type: 'file',
                },
                {
                  name: 'calculate-calibration.ts',
                  type: 'file',
                },
                {
                  name: 'calculate-mana-stats.ts',
                  type: 'file',
                },
                {
                  name: 'calculate-redeemable-prize-cash.ts',
                  type: 'file',
                },
                {
                  name: 'calculate-user-topic-interests.ts',
                  type: 'file',
                },
                {
                  name: 'check-push-receipts.ts',
                  type: 'file',
                },
                {
                  name: 'complete-quest-internal.ts',
                  type: 'file',
                },
                {
                  name: 'conversion-score.ts',
                  type: 'file',
                },
                {
                  name: 'create-cash-contract.ts',
                  type: 'file',
                },
                {
                  name: 'create-love-notification.ts',
                  type: 'file',
                },
                {
                  name: 'create-mod-report.ts',
                  type: 'file',
                },
                {
                  name: 'create-notification.ts',
                  type: 'file',
                },
                {
                  name: 'create-push-notifications.ts',
                  type: 'file',
                },
                {
                  name: 'create-user-main.ts',
                  type: 'file',
                },
                {
                  name: 'distribute-kyc-bonus.ts',
                  type: 'file',
                },
                {
                  name: 'emails.ts',
                  type: 'file',
                },
                {
                  name: 'expire-limit-orders.ts',
                  type: 'file',
                },
                {
                  name: 'fb-analytics.ts',
                  type: 'file',
                },
                {
                  name: 'feed-analytics.ts',
                  type: 'file',
                },
                {
                  name: 'generate-leagues.ts',
                  type: 'file',
                },
                {
                  name: 'get-user-portfolio-internal.ts',
                  type: 'file',
                },
                {
                  name: 'gidx',
                  type: 'directory',
                  children: [
                    {
                      name: 'helpers.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'group-importance-score.ts',
                  type: 'file',
                },
                {
                  name: 'helpers',
                  type: 'directory',
                  children: [
                    {
                      name: 'add-house-subsidy.ts',
                      type: 'file',
                    },
                    {
                      name: 'auth.ts',
                      type: 'file',
                    },
                    {
                      name: 'claude.ts',
                      type: 'file',
                    },
                    {
                      name: 'embeddings.ts',
                      type: 'file',
                    },
                    {
                      name: 'file.ts',
                      type: 'file',
                    },
                    {
                      name: 'fn-queue.ts',
                      type: 'file',
                    },
                    {
                      name: 'generate-and-update-avatar-urls.ts',
                      type: 'file',
                    },
                    {
                      name: 'get-phone-number.ts',
                      type: 'file',
                    },
                    {
                      name: 'on-create-user.ts',
                      type: 'file',
                    },
                    {
                      name: 'openai-utils.ts',
                      type: 'file',
                    },
                    {
                      name: 'portfolio.ts',
                      type: 'file',
                    },
                    {
                      name: 'search.ts',
                      type: 'file',
                    },
                    {
                      name: 'seen-markets.ts',
                      type: 'file',
                    },
                    {
                      name: 'try-or-log-error.ts',
                      type: 'file',
                    },
                    {
                      name: 'user-contract-metrics.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'importance-score.ts',
                  type: 'file',
                },
                {
                  name: 'init-admin.ts',
                  type: 'file',
                },
                {
                  name: 'init-caches.ts',
                  type: 'file',
                },
                {
                  name: 'love',
                  type: 'directory',
                  children: [
                    {
                      name: 'love-markets.ts',
                      type: 'file',
                    },
                    {
                      name: 'parse-photos.ts',
                      type: 'file',
                    },
                    {
                      name: 'supabase.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'mana-supply.ts',
                  type: 'file',
                },
                {
                  name: 'monitoring',
                  type: 'directory',
                  children: [
                    {
                      name: 'context.ts',
                      type: 'file',
                    },
                    {
                      name: 'instance-info.ts',
                      type: 'file',
                    },
                    {
                      name: 'log.ts',
                      type: 'file',
                    },
                    {
                      name: 'metric-writer.ts',
                      type: 'file',
                    },
                    {
                      name: 'metrics.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'onboarding-helpers.ts',
                  type: 'file',
                },
                {
                  name: 'payout-leagues.ts',
                  type: 'file',
                },
                {
                  name: 'record-contract-edit.ts',
                  type: 'file',
                },
                {
                  name: 'resolve-market-helpers.ts',
                  type: 'file',
                },
                {
                  name: 'send-email.ts',
                  type: 'file',
                },
                {
                  name: 'short-transaction.ts',
                  type: 'file',
                },
                {
                  name: 'supabase',
                  type: 'directory',
                  children: [
                    {
                      name: 'answers.ts',
                      type: 'file',
                    },
                    {
                      name: 'bets.ts',
                      type: 'file',
                    },
                    {
                      name: 'contract-comments.ts',
                      type: 'file',
                    },
                    {
                      name: 'contracts.ts',
                      type: 'file',
                    },
                    {
                      name: 'dashboard.ts',
                      type: 'file',
                    },
                    {
                      name: 'groups.ts',
                      type: 'file',
                    },
                    {
                      name: 'init.ts',
                      type: 'file',
                    },
                    {
                      name: 'leagues.ts',
                      type: 'file',
                    },
                    {
                      name: 'likes.ts',
                      type: 'file',
                    },
                    {
                      name: 'liquidity.ts',
                      type: 'file',
                    },
                    {
                      name: 'notifications.ts',
                      type: 'file',
                    },
                    {
                      name: 'portfolio-metrics.ts',
                      type: 'file',
                    },
                    {
                      name: 'private-message-channels.ts',
                      type: 'file',
                    },
                    {
                      name: 'private-messages.ts',
                      type: 'file',
                    },
                    {
                      name: 'reposts.ts',
                      type: 'file',
                    },
                    {
                      name: 'search-contracts.ts',
                      type: 'file',
                    },
                    {
                      name: 'sql-builder.ts',
                      type: 'file',
                    },
                    {
                      name: 'users.ts',
                      type: 'file',
                    },
                    {
                      name: 'utils.ts',
                      type: 'file',
                    },
                    {
                      name: 'vectors.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'test',
                  type: 'directory',
                  children: [
                    {
                      name: 'bets.ts',
                      type: 'file',
                    },
                    {
                      name: 'users.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'test-backend-function.ts',
                  type: 'file',
                },
                {
                  name: 'tiptap.ts',
                  type: 'file',
                },
                {
                  name: 'topic-interests.ts',
                  type: 'file',
                },
                {
                  name: 'twitter.ts',
                  type: 'file',
                },
                {
                  name: 'txn',
                  type: 'directory',
                  children: [
                    {
                      name: 'run-bounty-txn.ts',
                      type: 'file',
                    },
                    {
                      name: 'run-txn.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'update-contract-metrics-core.ts',
                  type: 'file',
                },
                {
                  name: 'update-creator-metrics-core.ts',
                  type: 'file',
                },
                {
                  name: 'update-group-contracts-internal.ts',
                  type: 'file',
                },
                {
                  name: 'update-group-metrics-core.ts',
                  type: 'file',
                },
                {
                  name: 'update-user-metrics-core.ts',
                  type: 'file',
                },
                {
                  name: 'utils.ts',
                  type: 'file',
                },
                {
                  name: 'websockets',
                  type: 'directory',
                  children: [
                    {
                      name: 'helpers.ts',
                      type: 'file',
                    },
                    {
                      name: 'server.ts',
                      type: 'file',
                    },
                    {
                      name: 'switchboard.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'weekly-markets-emails.ts',
                  type: 'file',
                },
                {
                  name: 'weekly-portfolio-emails.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
          ],
        },
        {
          name: 'supabase',
          type: 'directory',
          children: [
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: '.idea',
              type: 'directory',
              children: [],
            },
            {
              name: 'answers.sql',
              type: 'file',
            },
            {
              name: 'audit_events.sql',
              type: 'file',
            },
            {
              name: 'chart_annotations.sql',
              type: 'file',
            },
            {
              name: 'chat_messages.sql',
              type: 'file',
            },
            {
              name: 'config.toml',
              type: 'file',
            },
            {
              name: 'contract_bets.sql',
              type: 'file',
            },
            {
              name: 'contract_comment_edits.sql',
              type: 'file',
            },
            {
              name: 'contract_comments.sql',
              type: 'file',
            },
            {
              name: 'contract_edits.sql',
              type: 'file',
            },
            {
              name: 'contract_embeddings.sql',
              type: 'file',
            },
            {
              name: 'contract_follows.sql',
              type: 'file',
            },
            {
              name: 'contract_liquidity.sql',
              type: 'file',
            },
            {
              name: 'contracts.sql',
              type: 'file',
            },
            {
              name: 'creator_portfolio_history.sql',
              type: 'file',
            },
            {
              name: 'daily_stats.sql',
              type: 'file',
            },
            {
              name: 'dashboard_follows.sql',
              type: 'file',
            },
            {
              name: 'dashboard_groups.sql',
              type: 'file',
            },
            {
              name: 'dashboards.sql',
              type: 'file',
            },
            {
              name: 'discord_messages_markets.sql',
              type: 'file',
            },
            {
              name: 'discord_users.sql',
              type: 'file',
            },
            {
              name: 'functions.sql',
              type: 'file',
            },
            {
              name: 'gidx_receipts.sql',
              type: 'file',
            },
            {
              name: 'group_contracts.sql',
              type: 'file',
            },
            {
              name: 'group_embeddings.sql',
              type: 'file',
            },
            {
              name: 'group_invites.sql',
              type: 'file',
            },
            {
              name: 'group_members.sql',
              type: 'file',
            },
            {
              name: 'groups.sql',
              type: 'file',
            },
            {
              name: 'kyc_bonus_rewards.sql',
              type: 'file',
            },
            {
              name: 'league_chats.sql',
              type: 'file',
            },
            {
              name: 'leagues.sql',
              type: 'file',
            },
            {
              name: 'love_answers.sql',
              type: 'file',
            },
            {
              name: 'love_compatibility_answers.sql',
              type: 'file',
            },
            {
              name: 'love_likes.sql',
              type: 'file',
            },
            {
              name: 'love_questions.sql',
              type: 'file',
            },
            {
              name: 'love_ships.sql',
              type: 'file',
            },
            {
              name: 'love_stars.sql',
              type: 'file',
            },
            {
              name: 'love_waitlist.sql',
              type: 'file',
            },
            {
              name: 'lover_comments.sql',
              type: 'file',
            },
            {
              name: 'lovers.sql',
              type: 'file',
            },
            {
              name: 'makefile',
              type: 'file',
            },
            {
              name: 'mana_supply_stats.sql',
              type: 'file',
            },
            {
              name: 'manachan_tweets.sql',
              type: 'file',
            },
            {
              name: 'manalink_claims.sql',
              type: 'file',
            },
            {
              name: 'manalinks.sql',
              type: 'file',
            },
            {
              name: 'market_ads.sql',
              type: 'file',
            },
            {
              name: 'mod_reports.sql',
              type: 'file',
            },
            {
              name: 'news.sql',
              type: 'file',
            },
            {
              name: 'old_post_comments.sql',
              type: 'file',
            },
            {
              name: 'old_posts.sql',
              type: 'file',
            },
            {
              name: 'platform_calibration.sql',
              type: 'file',
            },
            {
              name: 'portfolios.sql',
              type: 'file',
            },
            {
              name: 'posts.sql',
              type: 'file',
            },
            {
              name: 'private_user_message_channel_members.sql',
              type: 'file',
            },
            {
              name: 'private_user_message_channels.sql',
              type: 'file',
            },
            {
              name: 'private_user_messages.sql',
              type: 'file',
            },
            {
              name: 'private_user_phone_numbers.sql',
              type: 'file',
            },
            {
              name: 'private_user_seen_message_channels.sql',
              type: 'file',
            },
            {
              name: 'private_users.sql',
              type: 'file',
            },
            {
              name: 'push_notification_tickets.sql',
              type: 'file',
            },
            {
              name: 'q_and_a.sql',
              type: 'file',
            },
            {
              name: 'q_and_a_answers.sql',
              type: 'file',
            },
            {
              name: 'reports.sql',
              type: 'file',
            },
            {
              name: 'reviews.sql',
              type: 'file',
            },
            {
              name: 'scheduler_info.sql',
              type: 'file',
            },
            {
              name: 'seed.sql',
              type: 'file',
            },
            {
              name: 'sent_emails.sql',
              type: 'file',
            },
            {
              name: 'stats.sql',
              type: 'file',
            },
            {
              name: 'topic_embeddings.sql',
              type: 'file',
            },
            {
              name: 'tv_schedule.sql',
              type: 'file',
            },
            {
              name: 'txn_summary_stats.sql',
              type: 'file',
            },
            {
              name: 'txns.sql',
              type: 'file',
            },
            {
              name: 'user_comment_view_events.sql',
              type: 'file',
            },
            {
              name: 'user_contract_interactions.sql',
              type: 'file',
            },
            {
              name: 'user_contract_metrics.sql',
              type: 'file',
            },
            {
              name: 'user_contract_views.sql',
              type: 'file',
            },
            {
              name: 'user_disinterests.sql',
              type: 'file',
            },
            {
              name: 'user_embeddings.sql',
              type: 'file',
            },
            {
              name: 'user_events.sql',
              type: 'file',
            },
            {
              name: 'user_follows.sql',
              type: 'file',
            },
            {
              name: 'user_monitor_status.sql',
              type: 'file',
            },
            {
              name: 'user_notifications.sql',
              type: 'file',
            },
            {
              name: 'user_portfolio_history.sql',
              type: 'file',
            },
            {
              name: 'user_portfolio_history_latest.sql',
              type: 'file',
            },
            {
              name: 'user_quest_metrics.sql',
              type: 'file',
            },
            {
              name: 'user_reactions.sql',
              type: 'file',
            },
            {
              name: 'user_seen_chats.sql',
              type: 'file',
            },
            {
              name: 'user_topic_interests.sql',
              type: 'file',
            },
            {
              name: 'user_topics.sql',
              type: 'file',
            },
            {
              name: 'user_view_events.sql',
              type: 'file',
            },
            {
              name: 'users.sql',
              type: 'file',
            },
            {
              name: 'views.sql',
              type: 'file',
            },
            {
              name: 'votes.sql',
              type: 'file',
            },
            {
              name: 'weekly_update.sql',
              type: 'file',
            },
          ],
        },
        {
          name: 'supabase-grafana-agent',
          type: 'directory',
          children: [
            {
              name: 'Dockerfile',
              type: 'file',
            },
            {
              name: 'README.md',
              type: 'file',
            },
            {
              name: 'agent.yaml',
              type: 'file',
            },
            {
              name: 'fly.toml',
              type: 'file',
            },
            {
              name: 'run.sh',
              type: 'file',
            },
          ],
        },
      ],
    },
    {
      name: 'common',
      type: 'directory',
      children: [
        {
          name: '.eslintrc.js',
          type: 'file',
        },
        {
          name: '.gitignore',
          type: 'file',
        },
        {
          name: '.yarnrc',
          type: 'file',
        },
        {
          name: 'jest.config.js',
          type: 'file',
        },
        {
          name: 'knowledge.md',
          type: 'file',
        },
        {
          name: 'lib',
          type: 'directory',
          children: [],
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'add-liquidity.ts',
              type: 'file',
            },
            {
              name: 'answer.ts',
              type: 'file',
            },
            {
              name: 'antes.ts',
              type: 'file',
            },
            {
              name: 'api',
              type: 'directory',
              children: [
                {
                  name: 'love-types.ts',
                  type: 'file',
                },
                {
                  name: 'market-search-types.ts',
                  type: 'file',
                },
                {
                  name: 'market-types.ts',
                  type: 'file',
                },
                {
                  name: 'schema.ts',
                  type: 'file',
                },
                {
                  name: 'user-types.ts',
                  type: 'file',
                },
                {
                  name: 'utils.ts',
                  type: 'file',
                },
                {
                  name: 'websocket-client.ts',
                  type: 'file',
                },
                {
                  name: 'websockets.ts',
                  type: 'file',
                },
                {
                  name: 'zod-types.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'balance-change.ts',
              type: 'file',
            },
            {
              name: 'bet.ts',
              type: 'file',
            },
            {
              name: 'bid.ts',
              type: 'file',
            },
            {
              name: 'boost.ts',
              type: 'file',
            },
            {
              name: 'bounty.ts',
              type: 'file',
            },
            {
              name: 'calculate-cpmm-arbitrage.test.ts',
              type: 'file',
            },
            {
              name: 'calculate-cpmm-arbitrage.ts',
              type: 'file',
            },
            {
              name: 'calculate-cpmm.test.ts',
              type: 'file',
            },
            {
              name: 'calculate-cpmm.ts',
              type: 'file',
            },
            {
              name: 'calculate-fixed-payouts.ts',
              type: 'file',
            },
            {
              name: 'calculate-metrics.ts',
              type: 'file',
            },
            {
              name: 'calculate.ts',
              type: 'file',
            },
            {
              name: 'can-send-mana.ts',
              type: 'file',
            },
            {
              name: 'charity.ts',
              type: 'file',
            },
            {
              name: 'chart-position.ts',
              type: 'file',
            },
            {
              name: 'chart.ts',
              type: 'file',
            },
            {
              name: 'chat-message.ts',
              type: 'file',
            },
            {
              name: 'comment.ts',
              type: 'file',
            },
            {
              name: 'contract-metric.ts',
              type: 'file',
            },
            {
              name: 'contract-params.ts',
              type: 'file',
            },
            {
              name: 'contract-seo.ts',
              type: 'file',
            },
            {
              name: 'contract.ts',
              type: 'file',
            },
            {
              name: 'dashboard.ts',
              type: 'file',
            },
            {
              name: 'destiny-sub.ts',
              type: 'file',
            },
            {
              name: 'economy.ts',
              type: 'file',
            },
            {
              name: 'edge',
              type: 'directory',
              children: [
                {
                  name: 'og.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'envs',
              type: 'directory',
              children: [
                {
                  name: 'constants.ts',
                  type: 'file',
                },
                {
                  name: 'dev.ts',
                  type: 'file',
                },
                {
                  name: 'prod.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'events.ts',
              type: 'file',
            },
            {
              name: 'feed.ts',
              type: 'file',
            },
            {
              name: 'fees.ts',
              type: 'file',
            },
            {
              name: 'firebase-auth.ts',
              type: 'file',
            },
            {
              name: 'follow.ts',
              type: 'file',
            },
            {
              name: 'gidx',
              type: 'directory',
              children: [
                {
                  name: 'document.ts',
                  type: 'file',
                },
                {
                  name: 'gidx.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'group-invite.ts',
              type: 'file',
            },
            {
              name: 'group-member.ts',
              type: 'file',
            },
            {
              name: 'group.ts',
              type: 'file',
            },
            {
              name: 'iap.ts',
              type: 'file',
            },
            {
              name: 'leagues.ts',
              type: 'file',
            },
            {
              name: 'like.ts',
              type: 'file',
            },
            {
              name: 'link-preview.ts',
              type: 'file',
            },
            {
              name: 'liquidity-provision.ts',
              type: 'file',
            },
            {
              name: 'loans.ts',
              type: 'file',
            },
            {
              name: 'love',
              type: 'directory',
              children: [
                {
                  name: 'compatibility-score.ts',
                  type: 'file',
                },
                {
                  name: 'compatibility-util.ts',
                  type: 'file',
                },
                {
                  name: 'constants.ts',
                  type: 'file',
                },
                {
                  name: 'love-comment.ts',
                  type: 'file',
                },
                {
                  name: 'lover.ts',
                  type: 'file',
                },
                {
                  name: 'multiple-choice.ts',
                  type: 'file',
                },
                {
                  name: 'og-image.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'mod-report.ts',
              type: 'file',
            },
            {
              name: 'multi-numeric.ts',
              type: 'file',
            },
            {
              name: 'native-message.ts',
              type: 'file',
            },
            {
              name: 'native-share-data.ts',
              type: 'file',
            },
            {
              name: 'new-bet.ts',
              type: 'file',
            },
            {
              name: 'new-contract.ts',
              type: 'file',
            },
            {
              name: 'news.ts',
              type: 'file',
            },
            {
              name: 'notification.ts',
              type: 'file',
            },
            {
              name: 'numeric-constants.ts',
              type: 'file',
            },
            {
              name: 'partner.ts',
              type: 'file',
            },
            {
              name: 'payouts-fixed.ts',
              type: 'file',
            },
            {
              name: 'payouts.ts',
              type: 'file',
            },
            {
              name: 'period.ts',
              type: 'file',
            },
            {
              name: 'poll-option.ts',
              type: 'file',
            },
            {
              name: 'portfolio-metrics.ts',
              type: 'file',
            },
            {
              name: 'pseudo-numeric.ts',
              type: 'file',
            },
            {
              name: 'push-ticket.ts',
              type: 'file',
            },
            {
              name: 'quest.ts',
              type: 'file',
            },
            {
              name: 'reaction.ts',
              type: 'file',
            },
            {
              name: 'reason-codes.ts',
              type: 'file',
            },
            {
              name: 'redeem.ts',
              type: 'file',
            },
            {
              name: 'report.ts',
              type: 'file',
            },
            {
              name: 'repost.ts',
              type: 'file',
            },
            {
              name: 'secrets.ts',
              type: 'file',
            },
            {
              name: 'sell-bet.ts',
              type: 'file',
            },
            {
              name: 'stats.ts',
              type: 'file',
            },
            {
              name: 'stonk.ts',
              type: 'file',
            },
            {
              name: 'supabase',
              type: 'directory',
              children: [
                {
                  name: 'analytics.ts',
                  type: 'file',
                },
                {
                  name: 'answers.ts',
                  type: 'file',
                },
                {
                  name: 'bets.ts',
                  type: 'file',
                },
                {
                  name: 'bounties.ts',
                  type: 'file',
                },
                {
                  name: 'chart-annotations.ts',
                  type: 'file',
                },
                {
                  name: 'comments.ts',
                  type: 'file',
                },
                {
                  name: 'contract-metrics.ts',
                  type: 'file',
                },
                {
                  name: 'contracts.ts',
                  type: 'file',
                },
                {
                  name: 'dashboard-follows.ts',
                  type: 'file',
                },
                {
                  name: 'dashboards.ts',
                  type: 'file',
                },
                {
                  name: 'group-invites.ts',
                  type: 'file',
                },
                {
                  name: 'groups.ts',
                  type: 'file',
                },
                {
                  name: 'is-admin.ts',
                  type: 'file',
                },
                {
                  name: 'leagues.ts',
                  type: 'file',
                },
                {
                  name: 'liquidity.ts',
                  type: 'file',
                },
                {
                  name: 'portfolio-metrics.ts',
                  type: 'file',
                },
                {
                  name: 'private-messages.ts',
                  type: 'file',
                },
                {
                  name: 'referrals.ts',
                  type: 'file',
                },
                {
                  name: 'schema.ts',
                  type: 'file',
                },
                {
                  name: 'set-scores.ts',
                  type: 'file',
                },
                {
                  name: 'txns.ts',
                  type: 'file',
                },
                {
                  name: 'users.ts',
                  type: 'file',
                },
                {
                  name: 'utils.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'tier.ts',
              type: 'file',
            },
            {
              name: 'topics.ts',
              type: 'file',
            },
            {
              name: 'tracking.ts',
              type: 'file',
            },
            {
              name: 'txn.ts',
              type: 'file',
            },
            {
              name: 'user-notification-preferences.ts',
              type: 'file',
            },
            {
              name: 'user.ts',
              type: 'file',
            },
            {
              name: 'util',
              type: 'directory',
              children: [
                {
                  name: 'adjective-animal.ts',
                  type: 'file',
                },
                {
                  name: 'algos.ts',
                  type: 'file',
                },
                {
                  name: 'api.ts',
                  type: 'file',
                },
                {
                  name: 'array.ts',
                  type: 'file',
                },
                {
                  name: 'assert.ts',
                  type: 'file',
                },
                {
                  name: 'clean-username.ts',
                  type: 'file',
                },
                {
                  name: 'color.ts',
                  type: 'file',
                },
                {
                  name: 'format.ts',
                  type: 'file',
                },
                {
                  name: 'json.ts',
                  type: 'file',
                },
                {
                  name: 'math.ts',
                  type: 'file',
                },
                {
                  name: 'matrix.ts',
                  type: 'file',
                },
                {
                  name: 'object.ts',
                  type: 'file',
                },
                {
                  name: 'og.ts',
                  type: 'file',
                },
                {
                  name: 'parse.ts',
                  type: 'file',
                },
                {
                  name: 'promise.ts',
                  type: 'file',
                },
                {
                  name: 'random.ts',
                  type: 'file',
                },
                {
                  name: 'share.ts',
                  type: 'file',
                },
                {
                  name: 'slugify.ts',
                  type: 'file',
                },
                {
                  name: 'string.ts',
                  type: 'file',
                },
                {
                  name: 'time.ts',
                  type: 'file',
                },
                {
                  name: 'tiptap-iframe.ts',
                  type: 'file',
                },
                {
                  name: 'tiptap-spoiler.ts',
                  type: 'file',
                },
                {
                  name: 'tiptap-tweet.ts',
                  type: 'file',
                },
                {
                  name: 'types.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'weekly-portfolio-update.ts',
              type: 'file',
            },
          ],
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'dev.sh',
      type: 'file',
    },
    {
      name: 'docs',
      type: 'directory',
      children: [
        {
          name: '.gitattributes',
          type: 'file',
        },
        {
          name: '.gitignore',
          type: 'file',
        },
        {
          name: '.prettierignore',
          type: 'file',
        },
        {
          name: '.prettierrc',
          type: 'file',
        },
        {
          name: 'README.md',
          type: 'file',
        },
        {
          name: 'babel.config.js',
          type: 'file',
        },
        {
          name: 'docs',
          type: 'directory',
          children: [
            {
              name: 'api.md',
              type: 'file',
            },
            {
              name: 'faq.md',
              type: 'file',
            },
            {
              name: 'index.md',
              type: 'file',
            },
            {
              name: 'privacy-policy.md',
              type: 'file',
            },
            {
              name: 'rules.md',
              type: 'file',
            },
            {
              name: 'sweepstakes.md',
              type: 'file',
            },
            {
              name: 'terms-and-conditions.md',
              type: 'file',
            },
          ],
        },
        {
          name: 'docusaurus.config.js',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'sidebars.js',
          type: 'file',
        },
        {
          name: 'src',
          type: 'directory',
          children: [
            {
              name: 'components',
              type: 'directory',
              children: [
                {
                  name: 'HomepageFeatures',
                  type: 'directory',
                  children: [
                    {
                      name: 'index.tsx',
                      type: 'file',
                    },
                    {
                      name: 'styles.module.css',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'css',
              type: 'directory',
              children: [
                {
                  name: 'custom.css',
                  type: 'file',
                },
              ],
            },
            {
              name: 'pages',
              type: 'directory',
              children: [
                {
                  name: 'markdown-page.md',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'static',
          type: 'directory',
          children: [
            {
              name: '.nojekyll',
              type: 'file',
            },
            {
              name: 'img',
              type: 'directory',
              children: [
                {
                  name: 'docusaurus.png',
                  type: 'file',
                },
                {
                  name: 'favicon.ico',
                  type: 'file',
                },
                {
                  name: 'logo.svg',
                  type: 'file',
                },
                {
                  name: 'tutorial',
                  type: 'directory',
                  children: [
                    {
                      name: 'docsVersionDropdown.png',
                      type: 'file',
                    },
                    {
                      name: 'localeDropdown.png',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'undraw_docusaurus_mountain.svg',
                  type: 'file',
                },
                {
                  name: 'undraw_docusaurus_react.svg',
                  type: 'file',
                },
                {
                  name: 'undraw_docusaurus_tree.svg',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
        {
          name: 'yarn.lock',
          type: 'file',
        },
      ],
    },
    {
      name: 'firebase.json',
      type: 'file',
    },
    {
      name: 'knowledge.md',
      type: 'file',
    },
    {
      name: 'manifold-info.knowledge.md',
      type: 'file',
    },
    {
      name: 'native',
      type: 'directory',
      children: [
        {
          name: '.expo-shared',
          type: 'directory',
          children: [
            {
              name: 'assets.json',
              type: 'file',
            },
          ],
        },
        {
          name: '.gitignore',
          type: 'file',
        },
        {
          name: 'App.tsx',
          type: 'file',
        },
        {
          name: 'README.md',
          type: 'file',
        },
        {
          name: 'Supporting',
          type: 'directory',
          children: [
            {
              name: 'Expo.plist',
              type: 'file',
            },
          ],
        },
        {
          name: 'android',
          type: 'directory',
          children: [
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: 'app',
              type: 'directory',
              children: [
                {
                  name: 'build.gradle',
                  type: 'file',
                },
                {
                  name: 'debug.keystore',
                  type: 'file',
                },
                {
                  name: 'proguard-rules.pro',
                  type: 'file',
                },
                {
                  name: 'src',
                  type: 'directory',
                  children: [
                    {
                      name: 'debug',
                      type: 'directory',
                      children: [
                        {
                          name: 'AndroidManifest.xml',
                          type: 'file',
                        },
                      ],
                    },
                    {
                      name: 'main',
                      type: 'directory',
                      children: [
                        {
                          name: 'AndroidManifest.xml',
                          type: 'file',
                        },
                        {
                          name: 'java',
                          type: 'directory',
                          children: [
                            {
                              name: 'com',
                              type: 'directory',
                              children: [
                                {
                                  name: 'markets',
                                  type: 'directory',
                                  children: [
                                    {
                                      name: 'manifold',
                                      type: 'directory',
                                      children: [
                                        {
                                          name: 'MainActivity.kt',
                                          type: 'file',
                                        },
                                        {
                                          name: 'MainApplication.kt',
                                          type: 'file',
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        {
                          name: 'res',
                          type: 'directory',
                          children: [
                            {
                              name: 'drawable',
                              type: 'directory',
                              children: [
                                {
                                  name: 'rn_edit_text_material.xml',
                                  type: 'file',
                                },
                                {
                                  name: 'splashscreen.xml',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'drawable-hdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'notification_icon.png',
                                  type: 'file',
                                },
                                {
                                  name: 'splashscreen_image.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'drawable-mdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'notification_icon.png',
                                  type: 'file',
                                },
                                {
                                  name: 'splashscreen_image.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'drawable-xhdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'notification_icon.png',
                                  type: 'file',
                                },
                                {
                                  name: 'splashscreen_image.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'drawable-xxhdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'notification_icon.png',
                                  type: 'file',
                                },
                                {
                                  name: 'splashscreen_image.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'drawable-xxxhdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'notification_icon.png',
                                  type: 'file',
                                },
                                {
                                  name: 'splashscreen_image.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'mipmap-anydpi-v26',
                              type: 'directory',
                              children: [
                                {
                                  name: 'ic_launcher.xml',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_round.xml',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'mipmap-hdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'ic_launcher.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_foreground.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_round.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'mipmap-mdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'ic_launcher.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_foreground.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_round.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'mipmap-xhdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'ic_launcher.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_foreground.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_round.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'mipmap-xxhdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'ic_launcher.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_foreground.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_round.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'mipmap-xxxhdpi',
                              type: 'directory',
                              children: [
                                {
                                  name: 'ic_launcher.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_foreground.png',
                                  type: 'file',
                                },
                                {
                                  name: 'ic_launcher_round.png',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'values',
                              type: 'directory',
                              children: [
                                {
                                  name: 'colors.xml',
                                  type: 'file',
                                },
                                {
                                  name: 'strings.xml',
                                  type: 'file',
                                },
                                {
                                  name: 'styles.xml',
                                  type: 'file',
                                },
                              ],
                            },
                            {
                              name: 'values-night',
                              type: 'directory',
                              children: [
                                {
                                  name: 'colors.xml',
                                  type: 'file',
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'build.gradle',
              type: 'file',
            },
            {
              name: 'gradle',
              type: 'directory',
              children: [
                {
                  name: 'wrapper',
                  type: 'directory',
                  children: [
                    {
                      name: 'gradle-wrapper.jar',
                      type: 'file',
                    },
                    {
                      name: 'gradle-wrapper.properties',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'gradle.properties',
              type: 'file',
            },
            {
              name: 'gradlew',
              type: 'file',
            },
            {
              name: 'gradlew.bat',
              type: 'file',
            },
            {
              name: 'react-settings-plugin',
              type: 'directory',
              children: [
                {
                  name: 'build.gradle.kts',
                  type: 'file',
                },
                {
                  name: 'src',
                  type: 'directory',
                  children: [
                    {
                      name: 'main',
                      type: 'directory',
                      children: [
                        {
                          name: 'kotlin',
                          type: 'directory',
                          children: [
                            {
                              name: 'expo',
                              type: 'directory',
                              children: [
                                {
                                  name: 'plugins',
                                  type: 'directory',
                                  children: [
                                    {
                                      name: 'ReactSettingsPlugin.kt',
                                      type: 'file',
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'sentry.properties',
              type: 'file',
            },
            {
              name: 'settings.gradle',
              type: 'file',
            },
          ],
        },
        {
          name: 'app.config.js',
          type: 'file',
        },
        {
          name: 'app.json',
          type: 'file',
        },
        {
          name: 'assets',
          type: 'directory',
          children: [
            {
              name: 'adaptive-icon.png',
              type: 'file',
            },
            {
              name: 'favicon.png',
              type: 'file',
            },
            {
              name: 'logo-96.png',
              type: 'file',
            },
            {
              name: 'logo.png',
              type: 'file',
            },
            {
              name: 'splash.png',
              type: 'file',
            },
            {
              name: 'square-google.png',
              type: 'file',
            },
          ],
        },
        {
          name: 'babel.config.js',
          type: 'file',
        },
        {
          name: 'components',
          type: 'directory',
          children: [
            {
              name: 'auth-page.tsx',
              type: 'file',
            },
            {
              name: 'custom-webview.tsx',
              type: 'file',
            },
            {
              name: 'ios-iap-listener.tsx',
              type: 'file',
            },
            {
              name: 'logger.tsx',
              type: 'file',
            },
            {
              name: 'splash-auth.tsx',
              type: 'file',
            },
            {
              name: 'splash.tsx',
              type: 'file',
            },
            {
              name: 'text.tsx',
              type: 'file',
            },
          ],
        },
        {
          name: 'configs',
          type: 'directory',
          children: [
            {
              name: 'prod',
              type: 'directory',
              children: [
                {
                  name: 'GoogleService-Info.plist',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'eas.json',
          type: 'file',
        },
        {
          name: 'envscript.sh',
          type: 'file',
        },
        {
          name: 'index.js',
          type: 'file',
        },
        {
          name: 'init.ts',
          type: 'file',
        },
        {
          name: 'ios',
          type: 'directory',
          children: [
            {
              name: '.gitignore',
              type: 'file',
            },
            {
              name: '.xcode.env',
              type: 'file',
            },
            {
              name: 'Manifold',
              type: 'directory',
              children: [
                {
                  name: 'AppDelegate.h',
                  type: 'file',
                },
                {
                  name: 'AppDelegate.mm',
                  type: 'file',
                },
                {
                  name: 'Images.xcassets',
                  type: 'directory',
                  children: [
                    {
                      name: 'AppIcon.appiconset',
                      type: 'directory',
                      children: [
                        {
                          name: 'App-Icon-1024x1024@1x.png',
                          type: 'file',
                        },
                        {
                          name: 'Contents.json',
                          type: 'file',
                        },
                      ],
                    },
                    {
                      name: 'Contents.json',
                      type: 'file',
                    },
                    {
                      name: 'SplashScreen.imageset',
                      type: 'directory',
                      children: [
                        {
                          name: 'Contents.json',
                          type: 'file',
                        },
                        {
                          name: 'image.png',
                          type: 'file',
                        },
                      ],
                    },
                    {
                      name: 'SplashScreenBackground.imageset',
                      type: 'directory',
                      children: [
                        {
                          name: 'Contents.json',
                          type: 'file',
                        },
                        {
                          name: 'image.png',
                          type: 'file',
                        },
                      ],
                    },
                  ],
                },
                {
                  name: 'Info.plist',
                  type: 'file',
                },
                {
                  name: 'Manifold-Bridging-Header.h',
                  type: 'file',
                },
                {
                  name: 'Manifold.entitlements',
                  type: 'file',
                },
                {
                  name: 'PrivacyInfo.xcprivacy',
                  type: 'file',
                },
                {
                  name: 'SplashScreen.storyboard',
                  type: 'file',
                },
                {
                  name: 'Supporting',
                  type: 'directory',
                  children: [
                    {
                      name: 'Expo.plist',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'main.m',
                  type: 'file',
                },
                {
                  name: 'noop-file.swift',
                  type: 'file',
                },
              ],
            },
            {
              name: 'Manifold.xcodeproj',
              type: 'directory',
              children: [
                {
                  name: 'xcshareddata',
                  type: 'directory',
                  children: [
                    {
                      name: 'xcschemes',
                      type: 'directory',
                      children: [
                        {
                          name: 'Manifold.xcscheme',
                          type: 'file',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'Manifold.xcworkspace',
              type: 'directory',
              children: [
                {
                  name: 'contents.xcworkspacedata',
                  type: 'file',
                },
                {
                  name: 'xcshareddata',
                  type: 'directory',
                  children: [
                    {
                      name: 'IDEWorkspaceChecks.plist',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'Podfile',
              type: 'file',
            },
            {
              name: 'Podfile.lock',
              type: 'file',
            },
            {
              name: 'Podfile.properties.json',
              type: 'file',
            },
            {
              name: 'Pods',
              type: 'directory',
              children: [],
            },
            {
              name: 'sentry.properties',
              type: 'file',
            },
          ],
        },
        {
          name: 'lib',
          type: 'directory',
          children: [
            {
              name: 'auth.ts',
              type: 'file',
            },
            {
              name: 'location.ts',
              type: 'file',
            },
            {
              name: 'use-is-connected.ts',
              type: 'file',
            },
          ],
        },
        {
          name: 'metro.config.js',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'plugins',
          type: 'directory',
          children: [
            {
              name: 'withAndroidVerifiedLinksWorkaround.js',
              type: 'file',
            },
          ],
        },
        {
          name: 'screenshots',
          type: 'directory',
          children: [
            {
              name: 'iphone-11-pro-max',
              type: 'directory',
              children: [
                {
                  name: 'IMG_0007.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0008.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0009.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0010.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0011.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0012.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0013.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0014.PNG',
                  type: 'file',
                },
              ],
            },
            {
              name: 'iphone-15-pro-max',
              type: 'directory',
              children: [
                {
                  name: 'IMG_0010.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0011.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0012.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0014.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0015.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0016.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0017.PNG',
                  type: 'file',
                },
                {
                  name: 'IMG_0018.PNG',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'sentry.properties',
          type: 'file',
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
        {
          name: 'yarn.lock',
          type: 'file',
        },
      ],
    },
    {
      name: 'package.json',
      type: 'file',
    },
    {
      name: 'private-storage.rules',
      type: 'file',
    },
    {
      name: 'storage.rules',
      type: 'file',
    },
    {
      name: 'twitch-bot',
      type: 'directory',
      children: [
        {
          name: '.dockerignore',
          type: 'file',
        },
        {
          name: '.eslintrc.cjs',
          type: 'file',
        },
        {
          name: '.gitattributes',
          type: 'file',
        },
        {
          name: '.gitignore',
          type: 'file',
        },
        {
          name: '.prettierrc',
          type: 'file',
        },
        {
          name: '.vscode',
          type: 'directory',
          children: [
            {
              name: 'settings.json',
              type: 'file',
            },
          ],
        },
        {
          name: 'Dockerfile',
          type: 'file',
        },
        {
          name: 'README.md',
          type: 'file',
        },
        {
          name: 'common',
          type: 'directory',
          children: [
            {
              name: 'exceptions.ts',
              type: 'file',
            },
            {
              name: 'outcome.ts',
              type: 'file',
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'packets.ts',
              type: 'file',
            },
            {
              name: 'socket-wrapper.ts',
              type: 'file',
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
            {
              name: 'types',
              type: 'directory',
              children: [
                {
                  name: 'manifold-abstract-types.ts',
                  type: 'file',
                },
                {
                  name: 'manifold-api-types.ts',
                  type: 'file',
                },
                {
                  name: 'manifold-internal-types.ts',
                  type: 'file',
                },
                {
                  name: 'metric-types.ts',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'cspell.json',
          type: 'file',
        },
        {
          name: 'docs',
          type: 'directory',
          children: [
            {
              name: 'OBS.png',
              type: 'file',
            },
          ],
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'scripts',
          type: 'directory',
          children: [
            {
              name: 'Dockerfile',
              type: 'file',
            },
            {
              name: 'build-docker.sh',
              type: 'file',
            },
            {
              name: 'deploy-to-remote.sh',
              type: 'file',
            },
            {
              name: 'gcloud.mjs',
              type: 'file',
            },
            {
              name: 'launch-docker.sh',
              type: 'file',
            },
          ],
        },
        {
          name: 'server',
          type: 'directory',
          children: [
            {
              name: 'build.mjs',
              type: 'file',
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'src',
              type: 'directory',
              children: [
                {
                  name: 'api.ts',
                  type: 'file',
                },
                {
                  name: 'app.ts',
                  type: 'file',
                },
                {
                  name: 'clients',
                  type: 'directory',
                  children: [
                    {
                      name: 'dock.ts',
                      type: 'file',
                    },
                    {
                      name: 'overlay.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'envs.ts',
                  type: 'file',
                },
                {
                  name: 'firestore.ts',
                  type: 'file',
                },
                {
                  name: 'google-logger.ts',
                  type: 'file',
                },
                {
                  name: 'index.ts',
                  type: 'file',
                },
                {
                  name: 'logger.ts',
                  type: 'file',
                },
                {
                  name: 'manifold-api.ts',
                  type: 'file',
                },
                {
                  name: 'manifold-firestore.ts',
                  type: 'file',
                },
                {
                  name: 'market.ts',
                  type: 'file',
                },
                {
                  name: 'metrics.ts',
                  type: 'file',
                },
                {
                  name: 'stream.ts',
                  type: 'file',
                },
                {
                  name: 'twitch-api.ts',
                  type: 'file',
                },
                {
                  name: 'twitch-bot.ts',
                  type: 'file',
                },
                {
                  name: 'user.ts',
                  type: 'file',
                },
                {
                  name: 'utils.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
          ],
        },
        {
          name: 'web',
          type: 'directory',
          children: [
            {
              name: '.eslintrc.cjs',
              type: 'file',
            },
            {
              name: 'components',
              type: 'directory',
              children: [
                {
                  name: 'additional-controls-dropdown.tsx',
                  type: 'file',
                },
                {
                  name: 'avatar.tsx',
                  type: 'file',
                },
                {
                  name: 'chart.tsx',
                  type: 'file',
                },
                {
                  name: 'confirmation-button.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-card.tsx',
                  type: 'file',
                },
                {
                  name: 'group-selector.tsx',
                  type: 'file',
                },
                {
                  name: 'info-tooltip.tsx',
                  type: 'file',
                },
                {
                  name: 'layout',
                  type: 'directory',
                  children: [
                    {
                      name: 'col.tsx',
                      type: 'file',
                    },
                    {
                      name: 'modal.tsx',
                      type: 'file',
                    },
                    {
                      name: 'row.tsx',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'loading-overlay.tsx',
                  type: 'file',
                },
                {
                  name: 'modal-group-control.tsx',
                  type: 'file',
                },
                {
                  name: 'spinner.tsx',
                  type: 'file',
                },
                {
                  name: 'title.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'lib',
              type: 'directory',
              children: [
                {
                  name: 'animation.ts',
                  type: 'file',
                },
                {
                  name: 'connection-state.ts',
                  type: 'file',
                },
                {
                  name: 'selected-group.ts',
                  type: 'file',
                },
                {
                  name: 'utils.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'next-env.d.ts',
              type: 'file',
            },
            {
              name: 'next.config.js',
              type: 'file',
            },
            {
              name: 'package.json',
              type: 'file',
            },
            {
              name: 'pages',
              type: 'directory',
              children: [
                {
                  name: '_app.tsx',
                  type: 'file',
                },
                {
                  name: '_document.tsx',
                  type: 'file',
                },
                {
                  name: 'dock.tsx',
                  type: 'file',
                },
                {
                  name: 'metrics.tsx',
                  type: 'file',
                },
                {
                  name: 'overlay.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'postcss.config.js',
              type: 'file',
            },
            {
              name: 'public',
              type: 'directory',
              children: [
                {
                  name: 'logo-white.svg',
                  type: 'file',
                },
                {
                  name: 'logo.svg',
                  type: 'file',
                },
                {
                  name: 'service-worker.js',
                  type: 'file',
                },
              ],
            },
            {
              name: 'styles',
              type: 'directory',
              children: [
                {
                  name: 'global.scss',
                  type: 'file',
                },
                {
                  name: 'overlay.module.scss',
                  type: 'file',
                },
              ],
            },
            {
              name: 'tailwind.config.js',
              type: 'file',
            },
            {
              name: 'tsconfig.json',
              type: 'file',
            },
          ],
        },
        {
          name: 'yarn.lock',
          type: 'file',
        },
      ],
    },
    {
      name: 'web',
      type: 'directory',
      children: [
        {
          name: '.eslintrc.js',
          type: 'file',
        },
        {
          name: '.gitignore',
          type: 'file',
        },
        {
          name: '.prettierignore',
          type: 'file',
        },
        {
          name: 'README.md',
          type: 'file',
        },
        {
          name: 'components',
          type: 'directory',
          children: [
            {
              name: 'LogoSEO.tsx',
              type: 'file',
            },
            {
              name: 'NoSEO.tsx',
              type: 'file',
            },
            {
              name: 'SEO.tsx',
              type: 'file',
            },
            {
              name: 'SuperBanControl.tsx',
              type: 'file',
            },
            {
              name: 'about-manifold.tsx',
              type: 'file',
            },
            {
              name: 'activity-log.tsx',
              type: 'file',
            },
            {
              name: 'ad',
              type: 'directory',
              children: [
                {
                  name: 'claim-ad-button.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'add-funds-modal.tsx',
              type: 'file',
            },
            {
              name: 'annotate-chart.tsx',
              type: 'file',
            },
            {
              name: 'answers',
              type: 'directory',
              children: [
                {
                  name: 'answer-bet-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'answer-components.tsx',
                  type: 'file',
                },
                {
                  name: 'answer-resolve-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'answers-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'binary-multi-answers-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'create-answer-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'multiple-choice-answers.tsx',
                  type: 'file',
                },
                {
                  name: 'numeric-bet-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'numeric-sell-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'small-answer.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'auth-context.tsx',
              type: 'file',
            },
            {
              name: 'bet',
              type: 'directory',
              children: [
                {
                  name: 'bet-dialog.tsx',
                  type: 'file',
                },
                {
                  name: 'bet-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'bet-slider.tsx',
                  type: 'file',
                },
                {
                  name: 'bet-summary.tsx',
                  type: 'file',
                },
                {
                  name: 'cashout-limit-warning.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-bets-table.tsx',
                  type: 'file',
                },
                {
                  name: 'feed-bet-button.tsx',
                  type: 'file',
                },
                {
                  name: 'fees.tsx',
                  type: 'file',
                },
                {
                  name: 'limit-order-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'money-display.tsx',
                  type: 'file',
                },
                {
                  name: 'numeric-bet-button.tsx',
                  type: 'file',
                },
                {
                  name: 'order-book.tsx',
                  type: 'file',
                },
                {
                  name: 'quick-limit-order-buttons.tsx',
                  type: 'file',
                },
                {
                  name: 'sell-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'sell-row.tsx',
                  type: 'file',
                },
                {
                  name: 'user-bets-table.tsx',
                  type: 'file',
                },
                {
                  name: 'yes-no-selector.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'buttons',
              type: 'directory',
              children: [
                {
                  name: 'app-badges-or-get-app-button.tsx',
                  type: 'file',
                },
                {
                  name: 'block-market-button.tsx',
                  type: 'file',
                },
                {
                  name: 'button.tsx',
                  type: 'file',
                },
                {
                  name: 'confirmation-button.tsx',
                  type: 'file',
                },
                {
                  name: 'copy-link-button.tsx',
                  type: 'file',
                },
                {
                  name: 'create-question-button.tsx',
                  type: 'file',
                },
                {
                  name: 'delete-market-button.tsx',
                  type: 'file',
                },
                {
                  name: 'duplicate-contract-button.tsx',
                  type: 'file',
                },
                {
                  name: 'file-upload-button.tsx',
                  type: 'file',
                },
                {
                  name: 'follow-button.tsx',
                  type: 'file',
                },
                {
                  name: 'follow-market-button.tsx',
                  type: 'file',
                },
                {
                  name: 'mobile-apps-qr-code-button.tsx',
                  type: 'file',
                },
                {
                  name: 'pill-button.tsx',
                  type: 'file',
                },
                {
                  name: 'referrals-button.tsx',
                  type: 'file',
                },
                {
                  name: 'report-button.tsx',
                  type: 'file',
                },
                {
                  name: 'scroll-to-top-button.tsx',
                  type: 'file',
                },
                {
                  name: 'share-embed-button.tsx',
                  type: 'file',
                },
                {
                  name: 'share-qr-button.tsx',
                  type: 'file',
                },
                {
                  name: 'sign-up-button.tsx',
                  type: 'file',
                },
                {
                  name: 'text-button.tsx',
                  type: 'file',
                },
                {
                  name: 'tweet-button.tsx',
                  type: 'file',
                },
                {
                  name: 'unresolve-button.tsx',
                  type: 'file',
                },
                {
                  name: 'user-settings-button.tsx',
                  type: 'file',
                },
                {
                  name: 'warning-confirmation-button.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'cards',
              type: 'directory',
              children: [
                {
                  name: 'MarketCard.tsx',
                  type: 'file',
                },
                {
                  name: 'UserCard.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'cashout',
              type: 'directory',
              children: [
                {
                  name: 'cash-to-mana.tsx',
                  type: 'file',
                },
                {
                  name: 'select-cashout-options.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'charity',
              type: 'directory',
              children: [
                {
                  name: 'charity-card.tsx',
                  type: 'file',
                },
                {
                  name: 'feed-items.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'charts',
              type: 'directory',
              children: [
                {
                  name: 'calibration.tsx',
                  type: 'file',
                },
                {
                  name: 'chart-annotations.tsx',
                  type: 'file',
                },
                {
                  name: 'contract',
                  type: 'directory',
                  children: [
                    {
                      name: 'binary.tsx',
                      type: 'file',
                    },
                    {
                      name: 'choice.tsx',
                      type: 'file',
                    },
                    {
                      name: 'depth-chart.tsx',
                      type: 'file',
                    },
                    {
                      name: 'multi-numeric.tsx',
                      type: 'file',
                    },
                    {
                      name: 'pseudo-numeric.tsx',
                      type: 'file',
                    },
                    {
                      name: 'single-value.tsx',
                      type: 'file',
                    },
                    {
                      name: 'stonk.tsx',
                      type: 'file',
                    },
                    {
                      name: 'zoom-utils.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'generic-charts.tsx',
                  type: 'file',
                },
                {
                  name: 'helpers.tsx',
                  type: 'file',
                },
                {
                  name: 'mana-spice-chart.tsx',
                  type: 'file',
                },
                {
                  name: 'minibar.tsx',
                  type: 'file',
                },
                {
                  name: 'stats.tsx',
                  type: 'file',
                },
                {
                  name: 'time-range-picker.tsx',
                  type: 'file',
                },
                {
                  name: 'user-position-search-button.tsx',
                  type: 'file',
                },
                {
                  name: 'zoom-slider.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'chat',
              type: 'directory',
              children: [
                {
                  name: 'chat-input.tsx',
                  type: 'file',
                },
                {
                  name: 'chat-message.tsx',
                  type: 'file',
                },
                {
                  name: 'public-chat.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'client-render.tsx',
              type: 'file',
            },
            {
              name: 'clock',
              type: 'directory',
              children: [
                {
                  name: 'clock.tsx',
                  type: 'file',
                },
                {
                  name: 'digit.tsx',
                  type: 'file',
                },
                {
                  name: 'display.tsx',
                  type: 'file',
                },
                {
                  name: 'segment-style.ts',
                  type: 'file',
                },
                {
                  name: 'segment.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'comments',
              type: 'directory',
              children: [
                {
                  name: 'comment-actions.tsx',
                  type: 'file',
                },
                {
                  name: 'comment-edit-history-button.tsx',
                  type: 'file',
                },
                {
                  name: 'comment-header.tsx',
                  type: 'file',
                },
                {
                  name: 'comment-input.tsx',
                  type: 'file',
                },
                {
                  name: 'comment-thread.tsx',
                  type: 'file',
                },
                {
                  name: 'comment.tsx',
                  type: 'file',
                },
                {
                  name: 'comments-button.tsx',
                  type: 'file',
                },
                {
                  name: 'dropdown-button-menu.tsx',
                  type: 'file',
                },
                {
                  name: 'dropdown-menu.tsx',
                  type: 'file',
                },
                {
                  name: 'edit-comment-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'profile-comments.tsx',
                  type: 'file',
                },
                {
                  name: 'reply-toggle.tsx',
                  type: 'file',
                },
                {
                  name: 'repost-modal.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'confetti-on-demand.tsx',
              type: 'file',
            },
            {
              name: 'contract',
              type: 'directory',
              children: [
                {
                  name: 'add-liquidity-button.tsx',
                  type: 'file',
                },
                {
                  name: 'back-button.tsx',
                  type: 'file',
                },
                {
                  name: 'boost-button.tsx',
                  type: 'file',
                },
                {
                  name: 'bountied-question.tsx',
                  type: 'file',
                },
                {
                  name: 'change-banner-button.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-description.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-details.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-edit-history-button.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-info-dialog.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-leaderboard.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-mention.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-overview.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-price.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-seo.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-share-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-summary-stats.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-table-action.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-table-col-formats.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-tabs.tsx',
                  type: 'file',
                },
                {
                  name: 'contracts-grid.tsx',
                  type: 'file',
                },
                {
                  name: 'contracts-table.tsx',
                  type: 'file',
                },
                {
                  name: 'creator-fees-display.tsx',
                  type: 'file',
                },
                {
                  name: 'creator-share-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'danger-zone.tsx',
                  type: 'file',
                },
                {
                  name: 'editable-mod-note.tsx',
                  type: 'file',
                },
                {
                  name: 'editable-payment-info.tsx',
                  type: 'file',
                },
                {
                  name: 'editable-question-title.tsx',
                  type: 'file',
                },
                {
                  name: 'featured-contract-badge.tsx',
                  type: 'file',
                },
                {
                  name: 'feed-contract-card.tsx',
                  type: 'file',
                },
                {
                  name: 'header-actions.tsx',
                  type: 'file',
                },
                {
                  name: 'like-button.tsx',
                  type: 'file',
                },
                {
                  name: 'liquidity-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'market-topics.tsx',
                  type: 'file',
                },
                {
                  name: 'related-contracts-widget.tsx',
                  type: 'file',
                },
                {
                  name: 'subsidize-button.tsx',
                  type: 'file',
                },
                {
                  name: 'text-color.ts',
                  type: 'file',
                },
                {
                  name: 'trades-button.tsx',
                  type: 'file',
                },
                {
                  name: 'twomba-contract-info-dialog.tsx',
                  type: 'file',
                },
                {
                  name: 'twomba-contract-page.tsx',
                  type: 'file',
                },
                {
                  name: 'twomba-contract-summary-stats.tsx',
                  type: 'file',
                },
                {
                  name: 'twomba-header-actions.tsx',
                  type: 'file',
                },
                {
                  name: 'upgrade-tier-button.tsx',
                  type: 'file',
                },
                {
                  name: 'user-positions-table.tsx',
                  type: 'file',
                },
                {
                  name: 'watch-market-modal.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'contract-select-modal.tsx',
              type: 'file',
            },
            {
              name: 'country-code-selector.tsx',
              type: 'file',
            },
            {
              name: 'dashboard',
              type: 'directory',
              children: [
                {
                  name: 'add-dashboard-item.tsx',
                  type: 'file',
                },
                {
                  name: 'create-dashboard-button.tsx',
                  type: 'file',
                },
                {
                  name: 'dashboard-add-contract.tsx',
                  type: 'file',
                },
                {
                  name: 'dashboard-add-link.tsx',
                  type: 'file',
                },
                {
                  name: 'dashboard-cards.tsx',
                  type: 'file',
                },
                {
                  name: 'dashboard-content.tsx',
                  type: 'file',
                },
                {
                  name: 'dashboard-page.tsx',
                  type: 'file',
                },
                {
                  name: 'dashboard-search.tsx',
                  type: 'file',
                },
                {
                  name: 'dashboard-set-topics.tsx',
                  type: 'file',
                },
                {
                  name: 'dashboard-text-card.tsx',
                  type: 'file',
                },
                {
                  name: 'follow-dashboard-button.tsx',
                  type: 'file',
                },
                {
                  name: 'header.tsx',
                  type: 'file',
                },
                {
                  name: 'horizontal-dashboard-card.tsx',
                  type: 'file',
                },
                {
                  name: 'horizontal-dashboard.tsx',
                  type: 'file',
                },
                {
                  name: 'input-with-limit.tsx',
                  type: 'file',
                },
                {
                  name: 'multi-dashboard-header.tsx',
                  type: 'file',
                },
                {
                  name: 'politics-dashboard-page.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'donut-chart.tsx',
              type: 'file',
            },
            {
              name: 'editor',
              type: 'directory',
              children: [
                {
                  name: 'contract-mention',
                  type: 'directory',
                  children: [
                    {
                      name: 'contract-mention-extension.tsx',
                      type: 'file',
                    },
                    {
                      name: 'contract-mention-list.tsx',
                      type: 'file',
                    },
                    {
                      name: 'contract-mention-suggestion.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'embed-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'emoji',
                  type: 'directory',
                  children: [
                    {
                      name: 'emoji-extension.ts',
                      type: 'file',
                    },
                    {
                      name: 'emoji-list.tsx',
                      type: 'file',
                    },
                    {
                      name: 'emoji-suggestion.ts',
                      type: 'file',
                    },
                    {
                      name: 'github-shortcodes.json',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'floating-format-menu.tsx',
                  type: 'file',
                },
                {
                  name: 'gif-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'image.tsx',
                  type: 'file',
                },
                {
                  name: 'link-preview-extension.tsx',
                  type: 'file',
                },
                {
                  name: 'link-preview-node-view.tsx',
                  type: 'file',
                },
                {
                  name: 'market-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'nodeview-middleware.tsx',
                  type: 'file',
                },
                {
                  name: 'spoiler.tsx',
                  type: 'file',
                },
                {
                  name: 'sticky-format-menu.tsx',
                  type: 'file',
                },
                {
                  name: 'tiptap-grid-cards.tsx',
                  type: 'file',
                },
                {
                  name: 'tweet.tsx',
                  type: 'file',
                },
                {
                  name: 'upload-extension.tsx',
                  type: 'file',
                },
                {
                  name: 'user-mention',
                  type: 'directory',
                  children: [
                    {
                      name: 'mention-extension.tsx',
                      type: 'file',
                    },
                    {
                      name: 'mention-list.tsx',
                      type: 'file',
                    },
                    {
                      name: 'mention-suggestion.ts',
                      type: 'file',
                    },
                    {
                      name: 'user-mention.tsx',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'utils.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'elections-page.tsx',
              type: 'file',
            },
            {
              name: 'explainer-panel.tsx',
              type: 'file',
            },
            {
              name: 'feed',
              type: 'directory',
              children: [
                {
                  name: 'card-dropdown.tsx',
                  type: 'file',
                },
                {
                  name: 'card-reason.tsx',
                  type: 'file',
                },
                {
                  name: 'comment-on-answer.tsx',
                  type: 'file',
                },
                {
                  name: 'copy-link-date-time.tsx',
                  type: 'file',
                },
                {
                  name: 'feed-bets.tsx',
                  type: 'file',
                },
                {
                  name: 'feed-chart.tsx',
                  type: 'file',
                },
                {
                  name: 'feed-contract-card-description.tsx',
                  type: 'file',
                },
                {
                  name: 'feed-liquidity.tsx',
                  type: 'file',
                },
                {
                  name: 'feed-multi-numeric-bet-group.tsx',
                  type: 'file',
                },
                {
                  name: 'good-comment.tsx',
                  type: 'file',
                },
                {
                  name: 'live-generated-feed.tsx',
                  type: 'file',
                },
                {
                  name: 'scored-feed-repost-item.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'follow-list.tsx',
              type: 'file',
            },
            {
              name: 'footer.tsx',
              type: 'file',
            },
            {
              name: 'gidx',
              type: 'directory',
              children: [
                {
                  name: 'location-monitor.tsx',
                  type: 'file',
                },
                {
                  name: 'location-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'register-component-helpers.tsx',
                  type: 'file',
                },
                {
                  name: 'register-user-form.tsx',
                  type: 'file',
                },
                {
                  name: 'upload-document.tsx',
                  type: 'file',
                },
                {
                  name: 'verify-me.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'home',
              type: 'directory',
              children: [
                {
                  name: 'daily-league-stat.tsx',
                  type: 'file',
                },
                {
                  name: 'daily-loan.tsx',
                  type: 'file',
                },
                {
                  name: 'daily-profit.tsx',
                  type: 'file',
                },
                {
                  name: 'daily-stats.tsx',
                  type: 'file',
                },
                {
                  name: 'quests-or-streak.tsx',
                  type: 'file',
                },
                {
                  name: 'typewriter.tsx',
                  type: 'file',
                },
                {
                  name: 'welcome-topic-sections.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'icons',
              type: 'directory',
              children: [
                {
                  name: 'logo-icon.tsx',
                  type: 'file',
                },
                {
                  name: 'mana-circle-icon.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'layout',
              type: 'directory',
              children: [
                {
                  name: 'col.tsx',
                  type: 'file',
                },
                {
                  name: 'modal.tsx',
                  type: 'file',
                },
                {
                  name: 'page.tsx',
                  type: 'file',
                },
                {
                  name: 'right-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'row.tsx',
                  type: 'file',
                },
                {
                  name: 'spacer.tsx',
                  type: 'file',
                },
                {
                  name: 'tabs.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'leaderboard.tsx',
              type: 'file',
            },
            {
              name: 'leagues',
              type: 'directory',
              children: [
                {
                  name: 'cohort-table.tsx',
                  type: 'file',
                },
                {
                  name: 'league-bid-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'league-feed.tsx',
                  type: 'file',
                },
                {
                  name: 'mana-earned-breakdown.tsx',
                  type: 'file',
                },
                {
                  name: 'prizes-modal.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'loading-user-rows.tsx',
              type: 'file',
            },
            {
              name: 'manalink-card.tsx',
              type: 'file',
            },
            {
              name: 'manalinks',
              type: 'directory',
              children: [
                {
                  name: 'create-links-button.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'messaging',
              type: 'directory',
              children: [
                {
                  name: 'messages-icon.tsx',
                  type: 'file',
                },
                {
                  name: 'new-message-button.tsx',
                  type: 'file',
                },
                {
                  name: 'send-message-button.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'mod-report-item.tsx',
              type: 'file',
            },
            {
              name: 'multi-checkbox.tsx',
              type: 'file',
            },
            {
              name: 'multi-user-reaction-link.tsx',
              type: 'file',
            },
            {
              name: 'multi-user-transaction-link.tsx',
              type: 'file',
            },
            {
              name: 'multiple-or-single-avatars.tsx',
              type: 'file',
            },
            {
              name: 'native-message-listener.tsx',
              type: 'file',
            },
            {
              name: 'nav',
              type: 'directory',
              children: [
                {
                  name: 'banner.tsx',
                  type: 'file',
                },
                {
                  name: 'bottom-nav-bar.tsx',
                  type: 'file',
                },
                {
                  name: 'manifold-logo.tsx',
                  type: 'file',
                },
                {
                  name: 'more-button.tsx',
                  type: 'file',
                },
                {
                  name: 'profile-summary.tsx',
                  type: 'file',
                },
                {
                  name: 'sidebar-item.tsx',
                  type: 'file',
                },
                {
                  name: 'sidebar.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'new-contract',
              type: 'directory',
              children: [
                {
                  name: 'choosing-contract-form.tsx',
                  type: 'file',
                },
                {
                  name: 'close-time-section.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-params-form.tsx',
                  type: 'file',
                },
                {
                  name: 'cost-section.tsx',
                  type: 'file',
                },
                {
                  name: 'create-contract-types.tsx',
                  type: 'file',
                },
                {
                  name: 'multi-numeric-range-section.tsx',
                  type: 'file',
                },
                {
                  name: 'new-contract-panel.tsx',
                  type: 'file',
                },
                {
                  name: 'pseudo-numeric-range-section.tsx',
                  type: 'file',
                },
                {
                  name: 'similar-contracts-section.tsx',
                  type: 'file',
                },
                {
                  name: 'topic-selector-section.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'new-contract-badge.tsx',
              type: 'file',
            },
            {
              name: 'news',
              type: 'directory',
              children: [
                {
                  name: 'dashboard-news-item.tsx',
                  type: 'file',
                },
                {
                  name: 'edit-news-button.tsx',
                  type: 'file',
                },
                {
                  name: 'news-article.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'notification-settings.tsx',
              type: 'file',
            },
            {
              name: 'notifications',
              type: 'directory',
              children: [
                {
                  name: 'income-summary-notifications.tsx',
                  type: 'file',
                },
                {
                  name: 'notification-dropdown.tsx',
                  type: 'file',
                },
                {
                  name: 'notification-helpers.tsx',
                  type: 'file',
                },
                {
                  name: 'notification-types.tsx',
                  type: 'file',
                },
                {
                  name: 'watched-markets.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'notifications-icon.tsx',
              type: 'file',
            },
            {
              name: 'numeric-resolution-panel.tsx',
              type: 'file',
            },
            {
              name: 'og',
              type: 'directory',
              children: [
                {
                  name: 'graph.tsx',
                  type: 'file',
                },
                {
                  name: 'og-market.tsx',
                  type: 'file',
                },
                {
                  name: 'og-weekly-update.tsx',
                  type: 'file',
                },
                {
                  name: 'utils.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'onboarding',
              type: 'directory',
              children: [
                {
                  name: 'twomba-welcome.tsx',
                  type: 'file',
                },
                {
                  name: 'welcome.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'onboarding-verify-phone.tsx',
              type: 'file',
            },
            {
              name: 'outcome-label.tsx',
              type: 'file',
            },
            {
              name: 'play-money-disclaimer.tsx',
              type: 'file',
            },
            {
              name: 'poll',
              type: 'directory',
              children: [
                {
                  name: 'poll-panel.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'portfolio',
              type: 'directory',
              children: [
                {
                  name: 'balance-change-table.tsx',
                  type: 'file',
                },
                {
                  name: 'portfolio-chart.tsx',
                  type: 'file',
                },
                {
                  name: 'portfolio-graph-number.tsx',
                  type: 'file',
                },
                {
                  name: 'portfolio-summary.tsx',
                  type: 'file',
                },
                {
                  name: 'portfolio-tabs.tsx',
                  type: 'file',
                },
                {
                  name: 'portfolio-value-graph.tsx',
                  type: 'file',
                },
                {
                  name: 'portfolio-value-section.tsx',
                  type: 'file',
                },
                {
                  name: 'profit-widget.tsx',
                  type: 'file',
                },
                {
                  name: 'stacked-data-area.tsx',
                  type: 'file',
                },
                {
                  name: 'twomba-portfolio-graph.tsx',
                  type: 'file',
                },
                {
                  name: 'twomba-portfolio-value-section.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'preview',
              type: 'directory',
              children: [
                {
                  name: 'preview-yes-no-selector.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'profile',
              type: 'directory',
              children: [
                {
                  name: 'add-funds-button.tsx',
                  type: 'file',
                },
                {
                  name: 'betting-streak-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'block-user.tsx',
                  type: 'file',
                },
                {
                  name: 'blocked-user.tsx',
                  type: 'file',
                },
                {
                  name: 'delete-yourself.tsx',
                  type: 'file',
                },
                {
                  name: 'edit-profile.tsx',
                  type: 'file',
                },
                {
                  name: 'loans-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'redeem-spice-button.tsx',
                  type: 'file',
                },
                {
                  name: 'redeem-sweeps-buttons.tsx',
                  type: 'file',
                },
                {
                  name: 'report-user.tsx',
                  type: 'file',
                },
                {
                  name: 'settings.tsx',
                  type: 'file',
                },
                {
                  name: 'user-contracts-list.tsx',
                  type: 'file',
                },
                {
                  name: 'user-liked-contracts-button.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'profit-badge.tsx',
              type: 'file',
            },
            {
              name: 'progress-bar.tsx',
              type: 'file',
            },
            {
              name: 'push-notifications-modal.tsx',
              type: 'file',
            },
            {
              name: 'redeem-spice-modal.tsx',
              type: 'file',
            },
            {
              name: 'registration-verify-phone.tsx',
              type: 'file',
            },
            {
              name: 'relative-timestamp.tsx',
              type: 'file',
            },
            {
              name: 'reports-icon.tsx',
              type: 'file',
            },
            {
              name: 'resolution-panel.tsx',
              type: 'file',
            },
            {
              name: 'reviews',
              type: 'directory',
              children: [
                {
                  name: 'review.tsx',
                  type: 'file',
                },
                {
                  name: 'stars.tsx',
                  type: 'file',
                },
                {
                  name: 'user-reviews.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'search',
              type: 'directory',
              children: [
                {
                  name: 'contract-filters.tsx',
                  type: 'file',
                },
                {
                  name: 'filter-pills.tsx',
                  type: 'file',
                },
                {
                  name: 'query-topics.ts',
                  type: 'file',
                },
                {
                  name: 'search-dropdown-helpers.tsx',
                  type: 'file',
                },
                {
                  name: 'user-results.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'select-users.tsx',
              type: 'file',
            },
            {
              name: 'sign-up-prompt.tsx',
              type: 'file',
            },
            {
              name: 'simple-contract-row.tsx',
              type: 'file',
            },
            {
              name: 'sized-container.tsx',
              type: 'file',
            },
            {
              name: 'stats',
              type: 'directory',
              children: [
                {
                  name: 'bonus-summary.tsx',
                  type: 'file',
                },
                {
                  name: 'mana-summary.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'styles',
              type: 'directory',
              children: [
                {
                  name: 'colors.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'supabase-search.tsx',
              type: 'file',
            },
            {
              name: 'sweeps-explainer.tsx',
              type: 'file',
            },
            {
              name: 'sweestakes-context.tsx',
              type: 'file',
            },
            {
              name: 'switch-setting.tsx',
              type: 'file',
            },
            {
              name: 'testimonials-panel.tsx',
              type: 'file',
            },
            {
              name: 'tiers',
              type: 'directory',
              children: [
                {
                  name: 'tier-tooltip.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'topics',
              type: 'directory',
              children: [
                {
                  name: 'add-contract-to-group-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'add-market-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'browse-topic-pills.tsx',
                  type: 'file',
                },
                {
                  name: 'contract-topics-list.tsx',
                  type: 'file',
                },
                {
                  name: 'create-topic-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'delete-topic-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'editable-topic-name.tsx',
                  type: 'file',
                },
                {
                  name: 'questions-topic-title.tsx',
                  type: 'file',
                },
                {
                  name: 'topic-dropdown.tsx',
                  type: 'file',
                },
                {
                  name: 'topic-options.tsx',
                  type: 'file',
                },
                {
                  name: 'topic-privacy-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'topic-selector.tsx',
                  type: 'file',
                },
                {
                  name: 'topic-tag.tsx',
                  type: 'file',
                },
                {
                  name: 'topics-button.tsx',
                  type: 'file',
                },
                {
                  name: 'your-topics.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'trust-panel.tsx',
              type: 'file',
            },
            {
              name: 'tv',
              type: 'directory',
              children: [
                {
                  name: 'schedule-tv-modal.tsx',
                  type: 'file',
                },
                {
                  name: 'tv-display.tsx',
                  type: 'file',
                },
                {
                  name: 'tv-page.tsx',
                  type: 'file',
                },
                {
                  name: 'tv-schedule-page.tsx',
                  type: 'file',
                },
                {
                  name: 'tv-schedule.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'tv-icon.tsx',
              type: 'file',
            },
            {
              name: 'twomba',
              type: 'directory',
              children: [
                {
                  name: 'toggle-verify-callout.tsx',
                  type: 'file',
                },
                {
                  name: 'twomba-toggle.tsx',
                  type: 'file',
                },
                {
                  name: 'us-only-disclaimer.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'twomba-portfolio-helpers.tsx',
              type: 'file',
            },
            {
              name: 'updated-terms-modal.tsx',
              type: 'file',
            },
            {
              name: 'us-elections',
              type: 'directory',
              children: [
                {
                  name: ' candidates',
                  type: 'directory',
                  children: [
                    {
                      name: 'candidate-data.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'article.tsx',
                  type: 'file',
                },
                {
                  name: 'contracts',
                  type: 'directory',
                  children: [
                    {
                      name: 'candidates-panel',
                      type: 'directory',
                      children: [
                        {
                          name: 'candidate-bar.tsx',
                          type: 'file',
                        },
                        {
                          name: 'candidates-panel.tsx',
                          type: 'file',
                        },
                        {
                          name: 'candidates-user-position.tsx',
                          type: 'file',
                        },
                        {
                          name: 'small-candidate-bar.tsx',
                          type: 'file',
                        },
                        {
                          name: 'small-candidate-panel.tsx',
                          type: 'file',
                        },
                      ],
                    },
                    {
                      name: 'choice-mini-graph.tsx',
                      type: 'file',
                    },
                    {
                      name: 'conditional-market',
                      type: 'directory',
                      children: [
                        {
                          name: 'conditional-market.tsx',
                          type: 'file',
                        },
                        {
                          name: 'conditional-markets.tsx',
                          type: 'file',
                        },
                      ],
                    },
                    {
                      name: 'party-panel',
                      type: 'directory',
                      children: [
                        {
                          name: 'binary-party-panel.tsx',
                          type: 'file',
                        },
                        {
                          name: 'party-panel.tsx',
                          type: 'file',
                        },
                      ],
                    },
                    {
                      name: 'politics-card.tsx',
                      type: 'file',
                    },
                    {
                      name: 'state-contract-card.tsx',
                      type: 'file',
                    },
                    {
                      name: 'which-party-card.tsx',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'probability-needle.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'usa-map',
              type: 'directory',
              children: [
                {
                  name: 'electoral-college-visual.tsx',
                  type: 'file',
                },
                {
                  name: 'governor-state.tsx',
                  type: 'file',
                },
                {
                  name: 'homepage-map.tsx',
                  type: 'file',
                },
                {
                  name: 'house-bar.tsx',
                  type: 'file',
                },
                {
                  name: 'house-table-helpers.tsx',
                  type: 'file',
                },
                {
                  name: 'house-table.tsx',
                  type: 'file',
                },
                {
                  name: 'presidential-state.tsx',
                  type: 'file',
                },
                {
                  name: 'senate-bar.tsx',
                  type: 'file',
                },
                {
                  name: 'senate-state.tsx',
                  type: 'file',
                },
                {
                  name: 'state-contract.tsx',
                  type: 'file',
                },
                {
                  name: 'state-election-map.tsx',
                  type: 'file',
                },
                {
                  name: 'usa-map-data.ts',
                  type: 'file',
                },
                {
                  name: 'usa-map.tsx',
                  type: 'file',
                },
                {
                  name: 'usa-state.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'user',
              type: 'directory',
              children: [
                {
                  name: 'user-handles.tsx',
                  type: 'file',
                },
                {
                  name: 'user-hovercard.tsx',
                  type: 'file',
                },
                {
                  name: 'verify-phone-number-banner.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'user-from-id.tsx',
              type: 'file',
            },
            {
              name: 'widgets',
              type: 'directory',
              children: [
                {
                  name: 'alert-box.tsx',
                  type: 'file',
                },
                {
                  name: 'amount-input.tsx',
                  type: 'file',
                },
                {
                  name: 'avatar.tsx',
                  type: 'file',
                },
                {
                  name: 'bucket-input.tsx',
                  type: 'file',
                },
                {
                  name: 'card.tsx',
                  type: 'file',
                },
                {
                  name: 'carousel.tsx',
                  type: 'file',
                },
                {
                  name: 'checkbox.tsx',
                  type: 'file',
                },
                {
                  name: 'checked-dropdown.tsx',
                  type: 'file',
                },
                {
                  name: 'choices-toggle-group.tsx',
                  type: 'file',
                },
                {
                  name: 'click-frame.tsx',
                  type: 'file',
                },
                {
                  name: 'coin-number.tsx',
                  type: 'file',
                },
                {
                  name: 'collapsible-content.tsx',
                  type: 'file',
                },
                {
                  name: 'container.tsx',
                  type: 'file',
                },
                {
                  name: 'countdown.tsx',
                  type: 'file',
                },
                {
                  name: 'customizeable-dropdown.tsx',
                  type: 'file',
                },
                {
                  name: 'datetime-tooltip.tsx',
                  type: 'file',
                },
                {
                  name: 'edit-in-place.tsx',
                  type: 'file',
                },
                {
                  name: 'editor.tsx',
                  type: 'file',
                },
                {
                  name: 'expandable-content.tsx',
                  type: 'file',
                },
                {
                  name: 'expanding-input.tsx',
                  type: 'file',
                },
                {
                  name: 'external-link.tsx',
                  type: 'file',
                },
                {
                  name: 'fullscreen-confetti.tsx',
                  type: 'file',
                },
                {
                  name: 'gradient-container.tsx',
                  type: 'file',
                },
                {
                  name: 'icon-toggle.tsx',
                  type: 'file',
                },
                {
                  name: 'image-with-blurred-shadow.tsx',
                  type: 'file',
                },
                {
                  name: 'increment-button.tsx',
                  type: 'file',
                },
                {
                  name: 'info-box.tsx',
                  type: 'file',
                },
                {
                  name: 'info-tooltip.tsx',
                  type: 'file',
                },
                {
                  name: 'input.tsx',
                  type: 'file',
                },
                {
                  name: 'linkify.tsx',
                  type: 'file',
                },
                {
                  name: 'loading-indicator.tsx',
                  type: 'file',
                },
                {
                  name: 'news-topics-content-container.tsx',
                  type: 'file',
                },
                {
                  name: 'pagination.tsx',
                  type: 'file',
                },
                {
                  name: 'probability-input.tsx',
                  type: 'file',
                },
                {
                  name: 'qr-code.tsx',
                  type: 'file',
                },
                {
                  name: 'radio-toggle-group.tsx',
                  type: 'file',
                },
                {
                  name: 'select.tsx',
                  type: 'file',
                },
                {
                  name: 'short-toggle.tsx',
                  type: 'file',
                },
                {
                  name: 'site-link.tsx',
                  type: 'file',
                },
                {
                  name: 'slider.tsx',
                  type: 'file',
                },
                {
                  name: 'subtitle.tsx',
                  type: 'file',
                },
                {
                  name: 'table.tsx',
                  type: 'file',
                },
                {
                  name: 'title.tsx',
                  type: 'file',
                },
                {
                  name: 'toast-clipboard.tsx',
                  type: 'file',
                },
                {
                  name: 'tooltip.tsx',
                  type: 'file',
                },
                {
                  name: 'truncate.tsx',
                  type: 'file',
                },
                {
                  name: 'user-link.tsx',
                  type: 'file',
                },
                {
                  name: 'visibility-observer.tsx',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'hooks',
          type: 'directory',
          children: [
            {
              name: 'use-ab-test.ts',
              type: 'file',
            },
            {
              name: 'use-ad-timer.ts',
              type: 'file',
            },
            {
              name: 'use-additional-feed-items.ts',
              type: 'file',
            },
            {
              name: 'use-admin.ts',
              type: 'file',
            },
            {
              name: 'use-animated-number.ts',
              type: 'file',
            },
            {
              name: 'use-answers.ts',
              type: 'file',
            },
            {
              name: 'use-api-getter.ts',
              type: 'file',
            },
            {
              name: 'use-api-subscription.ts',
              type: 'file',
            },
            {
              name: 'use-async-data.ts',
              type: 'file',
            },
            {
              name: 'use-bets.ts',
              type: 'file',
            },
            {
              name: 'use-bounties.ts',
              type: 'file',
            },
            {
              name: 'use-browser-os.ts',
              type: 'file',
            },
            {
              name: 'use-call-refer-user.ts',
              type: 'file',
            },
            {
              name: 'use-can-send-mana.ts',
              type: 'file',
            },
            {
              name: 'use-chart-annotations.ts',
              type: 'file',
            },
            {
              name: 'use-chart-positions.ts',
              type: 'file',
            },
            {
              name: 'use-comments.ts',
              type: 'file',
            },
            {
              name: 'use-contract.ts',
              type: 'file',
            },
            {
              name: 'use-dashboard-follows.ts',
              type: 'file',
            },
            {
              name: 'use-dashboard.ts',
              type: 'file',
            },
            {
              name: 'use-debounced-effect.ts',
              type: 'file',
            },
            {
              name: 'use-defined-search-params.ts',
              type: 'file',
            },
            {
              name: 'use-editable-user-info.ts',
              type: 'file',
            },
            {
              name: 'use-effect-check-equality.ts',
              type: 'file',
            },
            {
              name: 'use-event.ts',
              type: 'file',
            },
            {
              name: 'use-focus.ts',
              type: 'file',
            },
            {
              name: 'use-follows.ts',
              type: 'file',
            },
            {
              name: 'use-force-update.ts',
              type: 'file',
            },
            {
              name: 'use-getter.ts',
              type: 'file',
            },
            {
              name: 'use-google-analytics.ts',
              type: 'file',
            },
            {
              name: 'use-group-supabase.ts',
              type: 'file',
            },
            {
              name: 'use-has-loaded.ts',
              type: 'file',
            },
            {
              name: 'use-has-received-loan.ts',
              type: 'file',
            },
            {
              name: 'use-has-seen-contracts.ts',
              type: 'file',
            },
            {
              name: 'use-hash-in-url-page-router.ts',
              type: 'file',
            },
            {
              name: 'use-hash-in-url.ts',
              type: 'file',
            },
            {
              name: 'use-header-is-stuck.ts',
              type: 'file',
            },
            {
              name: 'use-intersection.ts',
              type: 'file',
            },
            {
              name: 'use-ios-purchases.ts',
              type: 'file',
            },
            {
              name: 'use-is-advanced-trader.ts',
              type: 'file',
            },
            {
              name: 'use-is-client.ts',
              type: 'file',
            },
            {
              name: 'use-is-eligible-for-loans.ts',
              type: 'file',
            },
            {
              name: 'use-is-iframe.ts',
              type: 'file',
            },
            {
              name: 'use-is-mobile.ts',
              type: 'file',
            },
            {
              name: 'use-is-visible.ts',
              type: 'file',
            },
            {
              name: 'use-leagues.ts',
              type: 'file',
            },
            {
              name: 'use-likes.ts',
              type: 'file',
            },
            {
              name: 'use-link-previews.ts',
              type: 'file',
            },
            {
              name: 'use-liquidity.ts',
              type: 'file',
            },
            {
              name: 'use-location.ts',
              type: 'file',
            },
            {
              name: 'use-long-touch.ts',
              type: 'file',
            },
            {
              name: 'use-mana-payments.ts',
              type: 'file',
            },
            {
              name: 'use-measure-size.ts',
              type: 'file',
            },
            {
              name: 'use-mod-reports.ts',
              type: 'file',
            },
            {
              name: 'use-monitor-status.ts',
              type: 'file',
            },
            {
              name: 'use-multi-dashboard.ts',
              type: 'file',
            },
            {
              name: 'use-mutation.ts',
              type: 'file',
            },
            {
              name: 'use-native-messages.ts',
              type: 'file',
            },
            {
              name: 'use-notifications.ts',
              type: 'file',
            },
            {
              name: 'use-page-visible.ts',
              type: 'file',
            },
            {
              name: 'use-pagination.ts',
              type: 'file',
            },
            {
              name: 'use-partial-updater.ts',
              type: 'file',
            },
            {
              name: 'use-persistent-in-memory-state.ts',
              type: 'file',
            },
            {
              name: 'use-persistent-local-state.ts',
              type: 'file',
            },
            {
              name: 'use-persistent-query-state.ts',
              type: 'file',
            },
            {
              name: 'use-persistent-state.ts',
              type: 'file',
            },
            {
              name: 'use-persistent-supabase-polling.ts',
              type: 'file',
            },
            {
              name: 'use-portfolio-history.ts',
              type: 'file',
            },
            {
              name: 'use-previous.ts',
              type: 'file',
            },
            {
              name: 'use-private-messages.ts',
              type: 'file',
            },
            {
              name: 'use-public-chat-messages.ts',
              type: 'file',
            },
            {
              name: 'use-query.ts',
              type: 'file',
            },
            {
              name: 'use-quest-status.ts',
              type: 'file',
            },
            {
              name: 'use-redirect-if-signed-in.ts',
              type: 'file',
            },
            {
              name: 'use-redirect-if-signed-out.ts',
              type: 'file',
            },
            {
              name: 'use-referrals.ts',
              type: 'file',
            },
            {
              name: 'use-refresh-all-clients.ts',
              type: 'file',
            },
            {
              name: 'use-related-contracts.ts',
              type: 'file',
            },
            {
              name: 'use-reposts.ts',
              type: 'file',
            },
            {
              name: 'use-request-new-user-signup-bonus.ts',
              type: 'file',
            },
            {
              name: 'use-review.ts',
              type: 'file',
            },
            {
              name: 'use-safe-layout-effect.ts',
              type: 'file',
            },
            {
              name: 'use-save-binary-shares.ts',
              type: 'file',
            },
            {
              name: 'use-save-campaign.ts',
              type: 'file',
            },
            {
              name: 'use-save-referral.ts',
              type: 'file',
            },
            {
              name: 'use-save-scroll.ts',
              type: 'file',
            },
            {
              name: 'use-save-visits.ts',
              type: 'file',
            },
            {
              name: 'use-saved-contract-metrics.ts',
              type: 'file',
            },
            {
              name: 'use-state-check-equality.ts',
              type: 'file',
            },
            {
              name: 'use-store.ts',
              type: 'file',
            },
            {
              name: 'use-theme.ts',
              type: 'file',
            },
            {
              name: 'use-topic-from-router.ts',
              type: 'file',
            },
            {
              name: 'use-tracking.ts',
              type: 'file',
            },
            {
              name: 'use-user-bets.ts',
              type: 'file',
            },
            {
              name: 'use-user-supabase.ts',
              type: 'file',
            },
            {
              name: 'use-user.ts',
              type: 'file',
            },
            {
              name: 'use-users.ts',
              type: 'file',
            },
            {
              name: 'use-votes.ts',
              type: 'file',
            },
            {
              name: 'use-warn-unsaved-changes.ts',
              type: 'file',
            },
            {
              name: 'use-window-size.ts',
              type: 'file',
            },
          ],
        },
        {
          name: 'lib',
          type: 'directory',
          children: [
            {
              name: 'api',
              type: 'directory',
              children: [
                {
                  name: 'api-key.ts',
                  type: 'file',
                },
                {
                  name: 'api.ts',
                  type: 'file',
                },
                {
                  name: 'cors.ts',
                  type: 'file',
                },
                {
                  name: 'proxy.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'claude',
              type: 'directory',
              children: [],
            },
            {
              name: 'firebase',
              type: 'directory',
              children: [
                {
                  name: 'google-onetap-login.tsx',
                  type: 'file',
                },
                {
                  name: 'init.ts',
                  type: 'file',
                },
                {
                  name: 'server-auth.ts',
                  type: 'file',
                },
                {
                  name: 'storage.ts',
                  type: 'file',
                },
                {
                  name: 'users.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'icons',
              type: 'directory',
              children: [
                {
                  name: 'arrow-up-square-icon.svg',
                  type: 'file',
                },
                {
                  name: 'bold-icon.svg',
                  type: 'file',
                },
                {
                  name: 'comment-curve.svg',
                  type: 'file',
                },
                {
                  name: 'corner-down-right-icon.svg',
                  type: 'file',
                },
                {
                  name: 'discord-outline-icon.svg',
                  type: 'file',
                },
                {
                  name: 'italic-icon.svg',
                  type: 'file',
                },
                {
                  name: 'link-icon.svg',
                  type: 'file',
                },
                {
                  name: 'logo-bunny.svg',
                  type: 'file',
                },
                {
                  name: 'placeholder-graph.svg',
                  type: 'file',
                },
                {
                  name: 'quote.svg',
                  type: 'file',
                },
                {
                  name: 'scales-icon.svg',
                  type: 'file',
                },
                {
                  name: 'squares-icon.svg',
                  type: 'file',
                },
                {
                  name: 'squiggle-horizontal.svg',
                  type: 'file',
                },
                {
                  name: 'squiggle-vertical.svg',
                  type: 'file',
                },
                {
                  name: 'triangle-down-fill-icon.svg',
                  type: 'file',
                },
                {
                  name: 'triangle-fill-icon.svg',
                  type: 'file',
                },
                {
                  name: 'triangle-outline-icon.svg',
                  type: 'file',
                },
                {
                  name: 'trophy-icon.svg',
                  type: 'file',
                },
                {
                  name: 'twitter-logo.svg',
                  type: 'file',
                },
                {
                  name: 'type-icon.svg',
                  type: 'file',
                },
              ],
            },
            {
              name: 'native',
              type: 'directory',
              children: [
                {
                  name: 'is-native.ts',
                  type: 'file',
                },
                {
                  name: 'native-messages.ts',
                  type: 'file',
                },
                {
                  name: 'post-message.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'politics',
              type: 'directory',
              children: [
                {
                  name: '.news-dashboard.ts.swp',
                  type: 'file',
                },
                {
                  name: 'home.ts',
                  type: 'file',
                },
                {
                  name: 'news-dashboard.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'service',
              type: 'directory',
              children: [
                {
                  name: 'analytics.ts',
                  type: 'file',
                },
                {
                  name: 'stripe.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'supabase',
              type: 'directory',
              children: [
                {
                  name: 'admin-db.ts',
                  type: 'file',
                },
                {
                  name: 'ads.ts',
                  type: 'file',
                },
                {
                  name: 'bets.ts',
                  type: 'file',
                },
                {
                  name: 'chat-messages.ts',
                  type: 'file',
                },
                {
                  name: 'comments.ts',
                  type: 'file',
                },
                {
                  name: 'contracts.ts',
                  type: 'file',
                },
                {
                  name: 'dashboards.ts',
                  type: 'file',
                },
                {
                  name: 'db.ts',
                  type: 'file',
                },
                {
                  name: 'feed-timeline',
                  type: 'directory',
                  children: [
                    {
                      name: 'feed-market-movement-display.ts',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'follows.ts',
                  type: 'file',
                },
                {
                  name: 'group.ts',
                  type: 'file',
                },
                {
                  name: 'groups.ts',
                  type: 'file',
                },
                {
                  name: 'leagues.ts',
                  type: 'file',
                },
                {
                  name: 'liquidity.ts',
                  type: 'file',
                },
                {
                  name: 'manalinks.ts',
                  type: 'file',
                },
                {
                  name: 'notifications.ts',
                  type: 'file',
                },
                {
                  name: 'polls.ts',
                  type: 'file',
                },
                {
                  name: 'portfolio-history.ts',
                  type: 'file',
                },
                {
                  name: 'private-messages.ts',
                  type: 'file',
                },
                {
                  name: 'reactions.ts',
                  type: 'file',
                },
                {
                  name: 'referrals.ts',
                  type: 'file',
                },
                {
                  name: 'reviews.ts',
                  type: 'file',
                },
                {
                  name: 'stats.ts',
                  type: 'file',
                },
                {
                  name: 'super-ban-user.ts',
                  type: 'file',
                },
                {
                  name: 'txns.ts',
                  type: 'file',
                },
                {
                  name: 'user-events.ts',
                  type: 'file',
                },
                {
                  name: 'users.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'twitch',
              type: 'directory',
              children: [
                {
                  name: 'link-twitch-account.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'util',
              type: 'directory',
              children: [
                {
                  name: 'cookie.ts',
                  type: 'file',
                },
                {
                  name: 'copy.ts',
                  type: 'file',
                },
                {
                  name: 'device.ts',
                  type: 'file',
                },
                {
                  name: 'devtools.ts',
                  type: 'file',
                },
                {
                  name: 'formatNumber.ts',
                  type: 'file',
                },
                {
                  name: 'local.ts',
                  type: 'file',
                },
                {
                  name: 'minMax.ts',
                  type: 'file',
                },
                {
                  name: 'roundToNearestFive.ts',
                  type: 'file',
                },
                {
                  name: 'scroll.ts',
                  type: 'file',
                },
                {
                  name: 'shortenedFromNow.ts',
                  type: 'file',
                },
                {
                  name: 'time.ts',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'middleware.ts',
          type: 'file',
        },
        {
          name: 'next-env.d.ts',
          type: 'file',
        },
        {
          name: 'next.config.js',
          type: 'file',
        },
        {
          name: 'package.json',
          type: 'file',
        },
        {
          name: 'pages',
          type: 'directory',
          children: [
            {
              name: '404.tsx',
              type: 'file',
            },
            {
              name: '[username]',
              type: 'directory',
              children: [
                {
                  name: '[contractSlug]',
                  type: 'directory',
                  children: [],
                },
                {
                  name: '[contractSlug].tsx',
                  type: 'file',
                },
                {
                  name: 'calibration.tsx',
                  type: 'file',
                },
                {
                  name: 'index.tsx',
                  type: 'file',
                },
                {
                  name: 'partner.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: '_app.tsx',
              type: 'file',
            },
            {
              name: '_document.tsx',
              type: 'file',
            },
            {
              name: 'about.tsx',
              type: 'file',
            },
            {
              name: 'add-funds.tsx',
              type: 'file',
            },
            {
              name: 'admin',
              type: 'directory',
              children: [
                {
                  name: 'index.tsx',
                  type: 'file',
                },
                {
                  name: 'journeys.tsx',
                  type: 'file',
                },
                {
                  name: 'redemptions.tsx',
                  type: 'file',
                },
                {
                  name: 'reports.tsx',
                  type: 'file',
                },
                {
                  name: 'test-user.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'ai',
              type: 'directory',
              children: [
                {
                  name: '[[...slug]].tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'api',
              type: 'directory',
              children: [
                {
                  name: 'og',
                  type: 'directory',
                  children: [
                    {
                      name: 'Figtree-Light.ttf',
                      type: 'file',
                    },
                    {
                      name: 'Figtree-Medium.ttf',
                      type: 'file',
                    },
                    {
                      name: 'market.tsx',
                      type: 'file',
                    },
                    {
                      name: 'update.tsx',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'v0',
                  type: 'directory',
                  children: [
                    {
                      name: '_types.ts',
                      type: 'file',
                    },
                    {
                      name: '_validate.ts',
                      type: 'file',
                    },
                    {
                      name: 'revalidate.ts',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'browse',
              type: 'directory',
              children: [
                {
                  name: '[[...slug]].tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'calibration.tsx',
              type: 'file',
            },
            {
              name: 'cards',
              type: 'directory',
              children: [
                {
                  name: 'index.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'charity',
              type: 'directory',
              children: [
                {
                  name: '[charitySlug].tsx',
                  type: 'file',
                },
                {
                  name: 'index.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'checkout.tsx',
              type: 'file',
            },
            {
              name: 'comments.tsx',
              type: 'file',
            },
            {
              name: 'cowp.tsx',
              type: 'file',
            },
            {
              name: 'create.tsx',
              type: 'file',
            },
            {
              name: 'dashboard',
              type: 'directory',
              children: [
                {
                  name: 'index.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'discord-bot.tsx',
              type: 'file',
            },
            {
              name: 'election',
              type: 'directory',
              children: [
                {
                  name: '[[...slug]].tsx',
                  type: 'file',
                },
                {
                  name: 'needle.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'embed',
              type: 'directory',
              children: [
                {
                  name: '[username]',
                  type: 'directory',
                  children: [
                    {
                      name: '[contractSlug].tsx',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'grid',
                  type: 'directory',
                  children: [
                    {
                      name: '[...slugs]',
                      type: 'directory',
                      children: [
                        {
                          name: 'index.tsx',
                          type: 'file',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              name: 'explore.tsx',
              type: 'file',
            },
            {
              name: 'gidx',
              type: 'directory',
              children: [
                {
                  name: 'register.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'home',
              type: 'directory',
              children: [
                {
                  name: 'index.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'index.tsx',
              type: 'file',
            },
            {
              name: 'lab.tsx',
              type: 'file',
            },
            {
              name: 'leaderboards.tsx',
              type: 'file',
            },
            {
              name: 'leagues',
              type: 'directory',
              children: [
                {
                  name: '[[...leagueSlugs]].tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'link',
              type: 'directory',
              children: [
                {
                  name: '[slug].tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'links.tsx',
              type: 'file',
            },
            {
              name: 'live.tsx',
              type: 'file',
            },
            {
              name: 'login.tsx',
              type: 'file',
            },
            {
              name: 'mana-auction.tsx',
              type: 'file',
            },
            {
              name: 'manachan.tsx',
              type: 'file',
            },
            {
              name: 'me.tsx',
              type: 'file',
            },
            {
              name: 'messages',
              type: 'directory',
              children: [
                {
                  name: '[channelId].tsx',
                  type: 'file',
                },
                {
                  name: 'index.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'my-calibration.tsx',
              type: 'file',
            },
            {
              name: 'newbies.tsx',
              type: 'file',
            },
            {
              name: 'news',
              type: 'directory',
              children: [
                {
                  name: '[slug].tsx',
                  type: 'file',
                },
                {
                  name: 'create.tsx',
                  type: 'file',
                },
                {
                  name: 'index.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'notifications.tsx',
              type: 'file',
            },
            {
              name: 'og-test',
              type: 'directory',
              children: [
                {
                  name: '[contractSlug].tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'partner-explainer.tsx',
              type: 'file',
            },
            {
              name: 'partner-leaderboard.tsx',
              type: 'file',
            },
            {
              name: 'payments.tsx',
              type: 'file',
            },
            {
              name: 'post',
              type: 'directory',
              children: [
                {
                  name: '[slug]',
                  type: 'directory',
                  children: [
                    {
                      name: 'index.tsx',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'public-messages',
              type: 'directory',
              children: [
                {
                  name: '[channelId].tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'redeem.tsx',
              type: 'file',
            },
            {
              name: 'referrals.tsx',
              type: 'file',
            },
            {
              name: 'register-on-discord.tsx',
              type: 'file',
            },
            {
              name: 'reports.tsx',
              type: 'file',
            },
            {
              name: 'server-sitemap.xml.tsx',
              type: 'file',
            },
            {
              name: 'sign-in-waiting.tsx',
              type: 'file',
            },
            {
              name: 'sitemap.tsx',
              type: 'file',
            },
            {
              name: 'stats.tsx',
              type: 'file',
            },
            {
              name: 'styles.tsx',
              type: 'file',
            },
            {
              name: 'tv',
              type: 'directory',
              children: [
                {
                  name: '[[...scheduleId]].tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'twitch.tsx',
              type: 'file',
            },
            {
              name: 'websocket-live.tsx',
              type: 'file',
            },
            {
              name: 'week',
              type: 'directory',
              children: [
                {
                  name: '[username]',
                  type: 'directory',
                  children: [
                    {
                      name: '[rangeEndDateSlug].tsx',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'yc-s23.tsx',
              type: 'file',
            },
          ],
        },
        {
          name: 'postcss.config.js',
          type: 'file',
        },
        {
          name: 'public',
          type: 'directory',
          children: [
            {
              name: '.well-known',
              type: 'directory',
              children: [
                {
                  name: 'apple-app-site-association',
                  type: 'file',
                },
                {
                  name: 'assetlinks.json',
                  type: 'file',
                },
              ],
            },
            {
              name: 'Bet_On_Love.pdf',
              type: 'file',
            },
            {
              name: 'SweepiesFlat.svg',
              type: 'file',
            },
            {
              name: 'ai.png',
              type: 'file',
            },
            {
              name: 'black-ios-badge.png',
              type: 'file',
            },
            {
              name: 'buy-mana-graphics',
              type: 'directory',
              children: [
                {
                  name: '100k.png',
                  type: 'file',
                },
                {
                  name: '10k.png',
                  type: 'file',
                },
                {
                  name: '1M.png',
                  type: 'file',
                },
                {
                  name: '25k.png',
                  type: 'file',
                },
              ],
            },
            {
              name: 'cards',
              type: 'directory',
              children: [
                {
                  name: 'back_green.png',
                  type: 'file',
                },
                {
                  name: 'back_red.png',
                  type: 'file',
                },
                {
                  name: 'frame_green.png',
                  type: 'file',
                },
                {
                  name: 'frame_red.png',
                  type: 'file',
                },
              ],
            },
            {
              name: 'christmas_manifold_logo.png',
              type: 'file',
            },
            {
              name: 'custom-components',
              type: 'directory',
              children: [
                {
                  name: 'coin.tsx',
                  type: 'file',
                },
                {
                  name: 'congress.tsx',
                  type: 'file',
                },
                {
                  name: 'congress_center.tsx',
                  type: 'file',
                },
                {
                  name: 'congress_house.tsx',
                  type: 'file',
                },
                {
                  name: 'congress_senate.tsx',
                  type: 'file',
                },
                {
                  name: 'documentUploadIcon.tsx',
                  type: 'file',
                },
                {
                  name: 'governor.tsx',
                  type: 'file',
                },
                {
                  name: 'locationBlockedIcon.tsx',
                  type: 'file',
                },
                {
                  name: 'manaCoin.tsx',
                  type: 'file',
                },
                {
                  name: 'manaFlatCoin.tsx',
                  type: 'file',
                },
                {
                  name: 'phoneIcon.tsx',
                  type: 'file',
                },
                {
                  name: 'registerIcon.tsx',
                  type: 'file',
                },
                {
                  name: 'spiceCoin.tsx',
                  type: 'file',
                },
                {
                  name: 'sweepiesCoin.tsx',
                  type: 'file',
                },
                {
                  name: 'sweepiesFlatCoin.tsx',
                  type: 'file',
                },
                {
                  name: 'tiers.tsx',
                  type: 'file',
                },
                {
                  name: 'tipJar.tsx',
                  type: 'file',
                },
                {
                  name: 'whiteHouse.tsx',
                  type: 'file',
                },
              ],
            },
            {
              name: 'data',
              type: 'directory',
              children: [
                {
                  name: 'elections-data.ts',
                  type: 'file',
                },
                {
                  name: 'governors-data.ts',
                  type: 'file',
                },
                {
                  name: 'house-data.ts',
                  type: 'file',
                },
                {
                  name: 'policy-data.ts',
                  type: 'file',
                },
                {
                  name: 'senate-state-data.ts',
                  type: 'file',
                },
              ],
            },
            {
              name: 'dgg-logo.svg',
              type: 'file',
            },
            {
              name: 'discord-logo.svg',
              type: 'file',
            },
            {
              name: 'discord-ss.png',
              type: 'file',
            },
            {
              name: 'election-map24.png',
              type: 'file',
            },
            {
              name: 'favicon.ico',
              type: 'file',
            },
            {
              name: 'flappy-logo.gif',
              type: 'file',
            },
            {
              name: 'fonts',
              type: 'directory',
              children: [
                {
                  name: 'MajorMonoDisplay-Regular.ttf',
                  type: 'file',
                },
                {
                  name: 'ReadexPro-Regular.ttf',
                  type: 'file',
                },
                {
                  name: 'icomoon.eot',
                  type: 'file',
                },
                {
                  name: 'icomoon.svg',
                  type: 'file',
                },
                {
                  name: 'icomoon.ttf',
                  type: 'file',
                },
                {
                  name: 'icomoon.woff',
                  type: 'file',
                },
              ],
            },
            {
              name: 'google.svg',
              type: 'file',
            },
            {
              name: 'group',
              type: 'directory',
              children: [
                {
                  name: 'default_group_banner_green.png',
                  type: 'file',
                },
                {
                  name: 'default_group_banner_indigo.png',
                  type: 'file',
                },
                {
                  name: 'default_group_banner_red.png',
                  type: 'file',
                },
              ],
            },
            {
              name: 'icons',
              type: 'directory',
              children: [],
            },
            {
              name: 'images',
              type: 'directory',
              children: [
                {
                  name: 'Manifest_Logo.png',
                  type: 'file',
                },
                {
                  name: 'cash-icon.png',
                  type: 'file',
                },
                {
                  name: 'default-avatar.png',
                  type: 'file',
                },
                {
                  name: 'donate.png',
                  type: 'file',
                },
              ],
            },
            {
              name: 'init-theme.js',
              type: 'file',
            },
            {
              name: 'landing',
              type: 'directory',
              children: [
                {
                  name: 'stonks.png',
                  type: 'file',
                },
                {
                  name: 'stonks_arrow.png',
                  type: 'file',
                },
                {
                  name: 'white_foldy.png',
                  type: 'file',
                },
              ],
            },
            {
              name: 'logo-april-fools.svg',
              type: 'file',
            },
            {
              name: 'logo-banner.png',
              type: 'file',
            },
            {
              name: 'logo-bat-black.png',
              type: 'file',
            },
            {
              name: 'logo-bat-blue.png',
              type: 'file',
            },
            {
              name: 'logo-bat-white.png',
              type: 'file',
            },
            {
              name: 'logo-cover.png',
              type: 'file',
            },
            {
              name: 'logo-flapping-with-money.gif',
              type: 'file',
            },
            {
              name: 'logo-turkey.png',
              type: 'file',
            },
            {
              name: 'logo.png',
              type: 'file',
            },
            {
              name: 'logo.svg',
              type: 'file',
            },
            {
              name: 'lottie',
              type: 'directory',
              children: [
                {
                  name: 'award.json',
                  type: 'file',
                },
                {
                  name: 'invitation.json',
                  type: 'file',
                },
                {
                  name: 'loading-icon.json',
                  type: 'file',
                },
                {
                  name: 'lootbox.json',
                  type: 'file',
                },
                {
                  name: 'money-bag.json',
                  type: 'file',
                },
                {
                  name: 'unlocking-icon.json',
                  type: 'file',
                },
              ],
            },
            {
              name: 'mana.svg',
              type: 'file',
            },
            {
              name: 'manaFlat.svg',
              type: 'file',
            },
            {
              name: 'manachan.png',
              type: 'file',
            },
            {
              name: 'manifold-wrapped.png',
              type: 'file',
            },
            {
              name: 'manifold_love_logo.svg',
              type: 'file',
            },
            {
              name: 'market-tiers',
              type: 'directory',
              children: [
                {
                  name: 'Crystal.svg',
                  type: 'file',
                },
                {
                  name: 'Plus.svg',
                  type: 'file',
                },
                {
                  name: 'Premium.svg',
                  type: 'file',
                },
              ],
            },
            {
              name: 'midterms2022.png',
              type: 'file',
            },
            {
              name: 'money-bag.svg',
              type: 'file',
            },
            {
              name: 'mp3s',
              type: 'directory',
              children: [
                {
                  name: 'bills.mp3',
                  type: 'file',
                },
                {
                  name: 'coinClick.mp3',
                  type: 'file',
                },
                {
                  name: 'coins.mp3',
                  type: 'file',
                },
                {
                  name: 'counting.mp3',
                  type: 'file',
                },
                {
                  name: 'lose1.mp3',
                  type: 'file',
                },
                {
                  name: 'register.mp3',
                  type: 'file',
                },
                {
                  name: 'registerLow.mp3',
                  type: 'file',
                },
              ],
            },
            {
              name: 'mtg',
              type: 'directory',
              children: [
                {
                  name: 'app.js',
                  type: 'file',
                },
                {
                  name: 'guess.html',
                  type: 'file',
                },
                {
                  name: 'images',
                  type: 'directory',
                  children: [
                    {
                      name: 'Advanced_level.webp',
                      type: 'file',
                    },
                    {
                      name: 'Expert_level.webp',
                      type: 'file',
                    },
                    {
                      name: 'Starter_level.webp',
                      type: 'file',
                    },
                    {
                      name: 'ustset.png',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'importCards.py',
                  type: 'file',
                },
                {
                  name: 'index.html',
                  type: 'file',
                },
                {
                  name: 'jsons',
                  type: 'directory',
                  children: [
                    {
                      name: 'artifact.json',
                      type: 'file',
                    },
                    {
                      name: 'artist.json',
                      type: 'file',
                    },
                    {
                      name: 'artistList.json',
                      type: 'file',
                    },
                    {
                      name: 'basic.json',
                      type: 'file',
                    },
                    {
                      name: 'beast.json',
                      type: 'file',
                    },
                    {
                      name: 'burn.json',
                      type: 'file',
                    },
                    {
                      name: 'commander.json',
                      type: 'file',
                    },
                    {
                      name: 'counterspell.json',
                      type: 'file',
                    },
                    {
                      name: 'set.json',
                      type: 'file',
                    },
                    {
                      name: 'watermark.json',
                      type: 'file',
                    },
                    {
                      name: 'wm.json',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'opensearch.xml',
              type: 'file',
            },
            {
              name: 'pairs-trader.html',
              type: 'file',
            },
            {
              name: 'payment-icons',
              type: 'directory',
              children: [
                {
                  name: 'dark',
                  type: 'directory',
                  children: [
                    {
                      name: '1.png',
                      type: 'file',
                    },
                    {
                      name: '14.png',
                      type: 'file',
                    },
                    {
                      name: '2.png',
                      type: 'file',
                    },
                    {
                      name: '22.png',
                      type: 'file',
                    },
                  ],
                },
                {
                  name: 'light',
                  type: 'directory',
                  children: [
                    {
                      name: '1.png',
                      type: 'file',
                    },
                    {
                      name: '14.png',
                      type: 'file',
                    },
                    {
                      name: '2.png',
                      type: 'file',
                    },
                    {
                      name: '22.png',
                      type: 'file',
                    },
                  ],
                },
              ],
            },
            {
              name: 'political-candidates',
              type: 'directory',
              children: [
                {
                  name: 'abbott.png',
                  type: 'file',
                },
                {
                  name: 'beshear.png',
                  type: 'file',
                },
                {
                  name: 'biden.png',
                  type: 'file',
                },
                {
                  name: 'bobama.png',
                  type: 'file',
                },
                {
                  name: 'burgum.png',
                  type: 'file',
                },
                {
                  name: 'buttigieg.png',
                  type: 'file',
                },
                {
                  name: 'carlson.png',
                  type: 'file',
                },
                {
                  name: 'carson.png',
                  type: 'file',
                },
                {
                  name: 'christie.png',
                  type: 'file',
                },
                {
                  name: 'clinton.png',
                  type: 'file',
                },
                {
                  name: 'cooper.png',
                  type: 'file',
                },
                {
                  name: 'cruz.png',
                  type: 'file',
                },
                {
                  name: 'desantis.png',
                  type: 'file',
                },
                {
                  name: 'gabbard.png',
                  type: 'file',
                },
                {
                  name: 'haley.png',
                  type: 'file',
                },
                {
                  name: 'harris.png',
                  type: 'file',
                },
                {
                  name: 'hutchinson.png',
                  type: 'file',
                },
                {
                  name: 'jeffries.png',
                  type: 'file',
                },
                {
                  name: 'kamala-left.png',
                  type: 'file',
                },
                {
                  name: 'kelly.png',
                  type: 'file',
                },
                {
                  name: 'kennedy.png',
                  type: 'file',
                },
                {
                  name: 'lake.png',
                  type: 'file',
                },
                {
                  name: 'mcraven.png',
                  type: 'file',
                },
                {
                  name: 'mobama.png',
                  type: 'file',
                },
                {
                  name: 'newsom.png',
                  type: 'file',
                },
                {
                  name: 'noem.png',
                  type: 'file',
                },
                {
                  name: 'orourke.png',
                  type: 'file',
                },
                {
                  name: 'pence.png',
                  type: 'file',
                },
                {
                  name: 'phillips.png',
                  type: 'file',
                },
                {
                  name: 'polis.png',
                  type: 'file',
                },
                {
                  name: 'pritzker.png',
                  type: 'file',
                },
                {
                  name: 'ramaswamy.png',
                  type: 'file',
                },
                {
                  name: 'rubio.png',
                  type: 'file',
                },
                {
                  name: 'sanders.png',
                  type: 'file',
                },
                {
                  name: 'scott.png',
                  type: 'file',
                },
                {
                  name: 'shapiro.png',
                  type: 'file',
                },
                {
                  name: 'stefanik.png',
                  type: 'file',
                },
                {
                  name: 'trump-right.png',
                  type: 'file',
                },
                {
                  name: 'trump.png',
                  type: 'file',
                },
                {
                  name: 'vance.png',
                  type: 'file',
                },
                {
                  name: 'walz.png',
                  type: 'file',
                },
                {
                  name: 'warnock.png',
                  type: 'file',
                },
                {
                  name: 'whitmer.png',
                  type: 'file',
                },
                {
                  name: 'youngkin.png',
                  type: 'file',
                },
                {
                  name: 'zeldin.png',
                  type: 'file',
                },
              ],
            },
            {
              name: 'politics-party',
              type: 'directory',
              children: [
                {
                  name: 'democrat_symbol.png',
                  type: 'file',
                },
                {
                  name: 'republican_symbol.png',
                  type: 'file',
                },
              ],
            },
            {
              name: 'privacy-policy.html',
              type: 'file',
            },
            {
              name: 'robots.txt',
              type: 'file',
            },
            {
              name: 'rps.html',
              type: 'file',
            },
            {
              name: 'simple-bat-blue.png',
              type: 'file',
            },
            {
              name: 'simple-bat-white.png',
              type: 'file',
            },
            {
              name: 'sitemap.xml',
              type: 'file',
            },
            {
              name: 'spice.svg',
              type: 'file',
            },
            {
              name: 'stylized-crane-black.png',
              type: 'file',
            },
            {
              name: 'sweepies.svg',
              type: 'file',
            },
            {
              name: 'sweepstakes-rules.html',
              type: 'file',
            },
            {
              name: 'terms-and-conditions.html',
              type: 'file',
            },
            {
              name: 'testimonials',
              type: 'directory',
              children: [
                {
                  name: 'astralCodexTen.png',
                  type: 'file',
                },
                {
                  name: 'destinyicon.jpg',
                  type: 'file',
                },
                {
                  name: 'eliezerYudkowsky.jpeg',
                  type: 'file',
                },
                {
                  name: 'snecko.jpeg',
                  type: 'file',
                },
                {
                  name: 'testimonials.json',
                  type: 'file',
                },
              ],
            },
            {
              name: 'theoremone',
              type: 'directory',
              children: [
                {
                  name: 'Th1-Icon-Round.svg',
                  type: 'file',
                },
                {
                  name: 'Th1-Icon-Square.svg',
                  type: 'file',
                },
                {
                  name: 'TheoremOne-Logo-White.svg',
                  type: 'file',
                },
                {
                  name: 'TheoremOne-Logo.svg',
                  type: 'file',
                },
                {
                  name: 'logo.ico',
                  type: 'file',
                },
              ],
            },
            {
              name: 'twitch-bot-obs-screenshot.jpg',
              type: 'file',
            },
            {
              name: 'twitch-glitch.svg',
              type: 'file',
            },
            {
              name: 'twitch-logo.png',
              type: 'file',
            },
            {
              name: 'twitter-logo.svg',
              type: 'file',
            },
            {
              name: 'welcome',
              type: 'directory',
              children: [
                {
                  name: 'charity.gif',
                  type: 'file',
                },
                {
                  name: 'manifold-example.gif',
                  type: 'file',
                },
                {
                  name: 'manipurple.png',
                  type: 'file',
                },
                {
                  name: 'treasure.png',
                  type: 'file',
                },
              ],
            },
          ],
        },
        {
          name: 'styles',
          type: 'directory',
          children: [
            {
              name: 'globals.css',
              type: 'file',
            },
          ],
        },
        {
          name: 'tailwind.config.js',
          type: 'file',
        },
        {
          name: 'tsconfig.json',
          type: 'file',
        },
      ],
    },
    {
      name: 'yarn.lock',
      type: 'file',
    },
  ],
  fileTokenScores: {
    '.firebaserc': {},
    '.gitattributes': {},
    '.github/CONTRIBUTING.md': {},
    '.github/workflows/check.yml': {},
    '.github/workflows/format.yml': {},
    '.github/workflows/lint.yml': {},
    '.github/workflows/test.yml': {},
    '.gitignore': {},
    '.prettierrc': {},
    '.vscode/extensions.json': {},
    '.vscode/launch.json': {},
    '.vscode/settings.json': {},
    '.yarnrc': {},
    'LICENSE.md': {},
    'README.md': {},
    'backend/.gitignore': {},
    'backend/api/.eslintrc.js': {},
    'backend/api/.gcloudignore': {},
    'backend/api/.gitignore': {},
    'backend/api/Dockerfile': {},
    'backend/api/README.md': {},
    'backend/api/debug.sh': {},
    'backend/api/deploy-api.sh': {},
    'backend/api/knowledge.md': {},
    'backend/api/package.json': {},
    'backend/api/src/add-bounty.ts': {
      addBounty: 0.8773016239829952,
    },
    'backend/api/src/add-liquidity.ts': {
      addLiquidity: 1.0964181287424493,
      addContractLiquidity: 1.8563972633950891,
    },
    'backend/api/src/add-topic-to-market.ts': {
      addOrRemoveTopicFromContract: 1.4903065081074838,
    },
    'backend/api/src/app.ts': {
      cacheController: 2.8395572313931865,
      app: 2.8395572313931865,
    },
    'backend/api/src/award-bounty.ts': {
      awardBounty: 1.4854007711474697,
    },
    'backend/api/src/ban-user.ts': {
      banuser: 0.812223477046558,
    },
    'backend/api/src/block-group.ts': {
      blockGroup: 1.2469954113349218,
      unblockGroup: 0.7364955779700879,
    },
    'backend/api/src/block-market.ts': {
      blockMarket: 0.5931641601515725,
      unblockMarket: 0.5931641601515725,
    },
    'backend/api/src/block-user.ts': {
      blockUser: 0.7561389068441858,
      unblockUser: 0.7561389068441858,
    },
    'backend/api/src/boost-market.ts': {
      boostmarket: 1.3012485953018513,
    },
    'backend/api/src/broadcast-test.ts': {
      broadcastTest: 0.554854265350173,
    },
    'backend/api/src/cancel-bet.ts': {
      cancelBet: 0.9020191819214493,
    },
    'backend/api/src/cancel-bounty.ts': {
      cancelbounty: 1.0693418970970139,
    },
    'backend/api/src/cast-poll-vote.ts': {
      castpollvote: 1.445362270427176,
    },
    'backend/api/src/claim-manalink.ts': {
      claimmanalink: 1.5410856939171689,
    },
    'backend/api/src/close-market.ts': {
      closeMarket: 0.8897462402273586,
    },
    'backend/api/src/complete-quest.ts': {
      completequest: 0.6291456000000002,
    },
    'backend/api/src/convert-cash-to-mana.ts': {
      convertCashToMana: 1.0380372802652518,
    },
    'backend/api/src/convert-sp-to-mana.ts': {
      convertSpiceToMana: 1.1581900473958153,
    },
    'backend/api/src/create-answer-cpmm.ts': {
      createAnswerCPMM: 2.1013421180636955,
      createAnswerCpmmMain: 2.1013421180636955,
      createAnswerAndSumAnswersToOne: 2.1013421180636955,
      convertOtherAnswerShares: 2.1013421180636955,
    },
    'backend/api/src/create-cash-contract.ts': {
      createCashContract: 0.7705428469585844,
    },
    'backend/api/src/create-chart-annotation.ts': {
      createchartannotation: 1.5049896854193259,
    },
    'backend/api/src/create-comment.ts': {
      MAX_COMMENT_JSON_LENGTH: 1.3751945316116994,
      createComment: 1.3751945316116994,
      createCommentOnContractInternal: 2.3284067439198033,
      validateComment: 2.8860001433494973,
      getMostRecentCommentableBet: 1.3751945316116994,
      getLargestPosition: 1.3751945316116994,
    },
    'backend/api/src/create-dashboard.ts': {
      createdashboard: 1.1293509145611742,
    },
    'backend/api/src/create-group.ts': {
      creategroup: 1.0693418970970139,
      getSlug: 2.5517645391518506,
      groupExists: 1.0693418970970139,
    },
    'backend/api/src/create-manalink.ts': {
      createManalink: 0.8256495680499811,
    },
    'backend/api/src/create-market.ts': {
      createMarket: 3.445818178470814,
      createMarketHelper: 1.641950824874714,
      getDuplicateSubmissionUrl: 1.641950824874714,
      getCloseTimestamp: 1.641950824874714,
      validateMarketBody: 1.641950824874714,
      validateMarketType: 1.641950824874714,
      getGroupCheckPermissions: 1.641950824874714,
      createAnswers: 1.641950824874714,
      generateAntes: 2.780064409754699,
    },
    'backend/api/src/create-private-user-message-channel.ts': {
      createprivateusermessagechannel: 0.7111788444385564,
    },
    'backend/api/src/create-private-user-message.ts': {
      createprivateusermessage: 0.8773016239829952,
    },
    'backend/api/src/create-public-chat-message.ts': {
      createPublicChatMessage: 0.9378748862299282,
    },
    'backend/api/src/create-user.ts': {
      createuser: 0.5346709485485069,
    },
    'backend/api/src/delete-chart-annotation.ts': {
      deletechartannotation: 0.7264747630389374,
    },
    'backend/api/src/delete-dashboard.ts': {
      deletedashboard: 0.8773016239829952,
    },
    'backend/api/src/delete-group.ts': {
      deleteGroup: 1.2495225133793793,
    },
    'backend/api/src/delete-market.ts': {
      deleteMarket: 2.130472197603391,
    },
    'backend/api/src/delete-me.ts': {
      deleteMe: 0.7985716900254357,
    },
    'backend/api/src/donate.ts': {
      donate: 1.3012485953018513,
    },
    'backend/api/src/edit-answer.ts': {
      editanswercpmm: 1.2138144756180167,
    },
    'backend/api/src/edit-comment.ts': {
      editcomment: 1.079575067071559,
    },
    'backend/api/src/fetch-link-preview.ts': {
      fetchLinkPreview: 0.9052766090622162,
    },
    'backend/api/src/follow-contract.ts': {
      followContract: 0.716313776424457,
      followContractInternal: 1.9997757682714858,
    },
    'backend/api/src/follow-dashboard.ts': {
      followdashboard: 0.8646779208975331,
    },
    'backend/api/src/follow-topic.ts': {
      followtopic: 0.5931641601515725,
    },
    'backend/api/src/follow-user.ts': {
      followUser: 2.6244650575758723,
      followUserInternal: 1.7028976208012778,
    },
    'backend/api/src/get-ad-analytics.ts': {
      getadanalytics: 1.0273904626114458,
    },
    'backend/api/src/get-balance-changes.ts': {
      getBalanceChanges: 2.2635644866970686,
    },
    'backend/api/src/get-best-comments.ts': {
      getBestComments: 2.3633702776124785,
    },
    'backend/api/src/get-bets.ts': {
      getBets: 2.039771834306704,
      getBetTime: 1.2047221043312524,
    },
    'backend/api/src/get-cashouts.ts': {
      getCashouts: 0.9724093787532907,
    },
    'backend/api/src/get-comments.ts': {
      getComments: 0.663177691957744,
    },
    'backend/api/src/get-contract-topics.ts': {
      getContractTopics: 0.6795549158573723,
    },
    'backend/api/src/get-contract.ts': {
      getContract: 2.7959220162605725,
    },
    'backend/api/src/get-current-private-user.ts': {
      getCurrentPrivateUser: 0.6114196214089308,
    },
    'backend/api/src/get-dashboard-from-slug.ts': {
      getDashboardFromSlug: 0.812223477046558,
      getdashboardfromslug: 0.812223477046558,
    },
    'backend/api/src/get-feed.ts': {
      getFeed: 2.606718600013374,
    },
    'backend/api/src/get-followed-groups.ts': {
      getFollowedGroups: 0.7111788444385564,
    },
    'backend/api/src/get-group.ts': {
      getGroup: 1.2448215956915887,
    },
    'backend/api/src/get-groups.ts': {
      getGroups: 1.8929885397947086,
    },
    'backend/api/src/get-headlines.ts': {
      getHeadlines: 0.7463818670134659,
      getPoliticsHeadlines: 0.7463818670134659,
    },
    'backend/api/src/get-interesting-groups-from-views.ts': {
      getInterestingGroupsFromViews: 0.851867169417956,
    },
    'backend/api/src/get-leagues.ts': {
      getLeagues: 0.41943040000000015,
    },
    'backend/api/src/get-mana-summary-stats.ts': {
      getManaSummaryStats: 0.812223477046558,
    },
    'backend/api/src/get-mana-supply.ts': {
      getManaSupply: 0.880221791680981,
    },
    'backend/api/src/get-managrams.ts': {
      getManagrams: 0.9141273637244215,
    },
    'backend/api/src/get-market.ts': {
      getMarket: 1.0944260539868693,
    },
    'backend/api/src/get-me.ts': {
      getMe: 0.3632373815194687,
    },
    'backend/api/src/get-mod-reports.ts': {
      getModReports: 1.6170706875725958,
    },
    'backend/api/src/get-news.ts': {
      getnews: 0.8646779208975331,
    },
    'backend/api/src/get-notifications.ts': {
      getNotifications: 0.7111788444385564,
    },
    'backend/api/src/get-partner-stats.ts': {
      getPartnerStats: 2.268416720532558,
    },
    'backend/api/src/get-positions.ts': {
      getPositions: 1.4300670011098644,
    },
    'backend/api/src/get-private-messages.ts': {
      getChannelMemberships: 1.1057381833358713,
      getChannelMessages: 1.1057381833358713,
      getLastSeenChannelTime: 1.1057381833358713,
      setChannelLastSeenTime: 1.1057381833358713,
    },
    'backend/api/src/get-redeemable-prize-cash.ts': {
      getRedeemablePrizeCash: 0.5136952313057229,
    },
    'backend/api/src/get-related-markets-by-group.ts': {
      getRelatedMarketsByGroup: 1.5552895489609648,
    },
    'backend/api/src/get-related-markets.ts': {
      getRelatedMarkets: 1.0897121445584064,
      cleanContractForStaticProps: 1.0897121445584064,
    },
    'backend/api/src/get-seen-market-ids.ts': {
      getSeenMarketIds: 0.7561389068441858,
    },
    'backend/api/src/get-similar-groups-to-contract.ts': {
      getsimilargroupstocontract: 1.1293509145611742,
    },
    'backend/api/src/get-supabase-token.ts': {
      getsupabasetoken: 0.812223477046558,
    },
    'backend/api/src/get-topics-with-markets.ts': {
      getGroupsWithTopContracts: 1.0997557867788652,
    },
    'backend/api/src/get-txn-summary-stats.ts': {
      getTxnSummaryStats: 0.9020191819214493,
    },
    'backend/api/src/get-unique-bet-groups.ts': {
      getUniqueBetGroupCount: 0.6114196214089308,
    },
    'backend/api/src/get-user-contract-metrics-with-contracts.ts': {
      getusercontractmetricswithcontracts: 1.1195728005201988,
    },
    'backend/api/src/get-user-is-group-member.ts': {
      getuserisgroupmember: 0.7846824271987748,
    },
    'backend/api/src/get-user-limit-orders-with-contracts.ts': {
      getUserLimitOrdersWithContracts: 0.9378748862299282,
    },
    'backend/api/src/get-user-portfolio-history.ts': {
      getUserPortfolioHistory: 0.7985716900254357,
    },
    'backend/api/src/get-user-portfolio.ts': {
      getUserPortfolio: 0.994766537936616,
    },
    'backend/api/src/get-user.ts': {
      getUser: 3.7606253584645235,
      getLiteUser: 0.695546631234341,
    },
    'backend/api/src/get-users.ts': {
      getUsers: 2.508805941643762,
    },
    'backend/api/src/get-your-dashboards.ts': {
      getyourdashboards: 0.5931641601515725,
    },
    'backend/api/src/get-your-followed-dashboards.ts': {
      getyourfolloweddashboards: 0.64638565775772,
    },
    'backend/api/src/gidx/callback.ts': {
      identityCallbackGIDX: 1.0296710213834346,
      paymentCallbackGIDX: 1.0296710213834346,
    },
    'backend/api/src/gidx/complete-cashout-session.ts': {
      completeCashoutSession: 2.0921127808630935,
    },
    'backend/api/src/gidx/complete-checkout-session.ts': {
      completeCheckoutSession: 1.8224721466145222,
    },
    'backend/api/src/gidx/get-checkout-session.ts': {
      getCheckoutSession: 2.281363374503495,
    },
    'backend/api/src/gidx/get-monitor-status.ts': {
      getMonitorStatus: 1.0937406689980442,
    },
    'backend/api/src/gidx/get-verification-documents.ts': {
      getVerificationDocuments: 0.7869211833236184,
      getIdentityVerificationDocuments: 1.6514424655361957,
    },
    'backend/api/src/gidx/get-verification-status.ts': {
      getVerificationStatus: 3.118624503851924,
      getVerificationStatusInternal: 1.8913843918588331,
    },
    'backend/api/src/gidx/register.ts': {
      register: 2.489643191383178,
    },
    'backend/api/src/gidx/upload-document.ts': {
      uploadDocument: 1.1378861511016904,
    },
    'backend/api/src/health.ts': {
      health: 0.41943040000000015,
    },
    'backend/api/src/helpers/debounce.ts': {
      debounce: 2.4094123419219406,
    },
    'backend/api/src/helpers/endpoint.ts': {
      parseCredentials: 0.8778027960455705,
      lookupUser: 0.8778027960455705,
      validate: 4.362936138878743,
      jsonEndpoint: 2.0946958623788188,
      authEndpoint: 4.311787528404993,
      MaybeAuthedEndpoint: 2.4506142679750846,
      typedEndpoint: 1.4862493292121945,
    },
    'backend/api/src/helpers/groups.ts': {
      orderAndDedupeGroupContracts: 1.1001711121167803,
    },
    'backend/api/src/helpers/on-create-market.ts': {
      onCreateMarket: 2.028615295758003,
      uploadToStorage: 1.1981328729420402,
    },
    'backend/api/src/helpers/rate-limit.ts': {
      rateLimitByUser: 1.1677461661200754,
    },
    'backend/api/src/hide-comment.ts': {
      hideComment: 1.0057587670778319,
    },
    'backend/api/src/league-activity.ts': {
      leagueActivity: 2.0805713109410537,
      getLeagueActivity: 1.2288189324763736,
    },
    'backend/api/src/leave-private-user-message-channel.ts': {
      leaveprivateusermessagechannel: 1.0590098490247957,
    },
    'backend/api/src/leave-review.ts': {
      leavereview: 1.1390450916340762,
    },
    'backend/api/src/love/compatible-lovers.ts': {
      getCompatibleLovers: 1.0205182084751983,
    },
    'backend/api/src/love/create-comment-on-lover.ts': {
      createcommentonlover: 1.418642338111052,
    },
    'backend/api/src/love/create-love-compatibility-question.ts': {
      createlovecompatibilityquestion: 0.7408617985736475,
    },
    'backend/api/src/love/create-lover.ts': {
      baseLoversSchema: 0.9686330173852502,
      createlover: 0.9686330173852502,
    },
    'backend/api/src/love/get-compatibililty-questions.ts': {
      getCompatibilityQuestions: 0.7596207621286069,
    },
    'backend/api/src/love/get-likes-and-ships.ts': {
      getLikesAndShips: 0.9972687289346767,
      getLikesAndShipsMain: 0.9972687289346767,
    },
    'backend/api/src/love/get-lover-answers.ts': {
      getLoverAnswers: 0.5931641601515726,
    },
    'backend/api/src/love/get-lovers.ts': {
      getLovers: 0.5931641601515726,
    },
    'backend/api/src/love/has-free-like.ts': {
      hasFreeLike: 0.5216248436251553,
      getHasFreeLike: 0.883187633293954,
    },
    'backend/api/src/love/hide-comment-on-lover.ts': {
      hidecommentonlover: 0.711796992181887,
    },
    'backend/api/src/love/like-lover.ts': {
      likeLover: 0.9710515804944135,
    },
    'backend/api/src/love/remove-pinned-photo.ts': {
      removePinnedPhoto: 0.5689430755508452,
    },
    'backend/api/src/love/ship-lovers.ts': {
      shipLovers: 0.9925534839429546,
    },
    'backend/api/src/love/star-lover.ts': {
      starLover: 0.8472078792198368,
    },
    'backend/api/src/love/update-lover.ts': {
      updatelover: 1.0409988762414812,
    },
    'backend/api/src/manachan-tweet.ts': {
      manachantweet: 1.0485760000000004,
    },
    'backend/api/src/managram.ts': {
      managram: 1.8101228275375354,
    },
    'backend/api/src/mark-all-notifications.ts': {
      markallnotifications: 0.5743287284585372,
    },
    'backend/api/src/markets.ts': {
      getMarkets: 2.145216125758903,
    },
    'backend/api/src/multi-sell.ts': {
      multiSell: 1.7794924804547172,
    },
    'backend/api/src/on-create-bet.ts': {
      onCreateBets: 5.893942185796106,
      sendUniqueBettorNotificationToCreator: 2.2587018291223484,
      injectLiquidityBonus: 2.2587018291223484,
    },
    'backend/api/src/on-create-comment-on-contract.ts': {
      onCreateCommentOnContract: 2.560508916469825,
      handleCommentNotifications: 2.560508916469825,
    },
    'backend/api/src/on-update-liquidity-provision.ts': {
      onCreateLiquidityProvision: 1.5679850817994265,
    },
    'backend/api/src/pin-comment.ts': {
      pinComment: 1.0057587670778319,
    },
    'backend/api/src/place-bet.ts': {
      placeBet: 2.8166286751854908,
      placeBetMain: 2.8166286751854908,
      fetchContractBetDataAndValidate: 3.9697110813136183,
      calculateBetResult: 2.8166286751854908,
      getUnfilledBets: 1.663546269057363,
      getUserBalances: 2.8166286751854908,
      getUnfilledBetsAndUserBalances: 3.4911386430117672,
      executeNewBetResult: 3.9697110813136183,
      bulkUpdateLimitOrders: 1.663546269057363,
      updateMakers: 2.8166286751854908,
      getRoundedLimitProb: 2.8166286751854908,
      getMakerIdsFromBetResult: 4.3409207035665816,
    },
    'backend/api/src/place-better.ts': {
      placeBetter: 0.994766537936616,
    },
    'backend/api/src/place-multi-bet.ts': {
      placeMultiBet: 1.326355383915488,
      placeMultiBetMain: 1.326355383915488,
    },
    'backend/api/src/post.ts': {
      post: 1.6907779961359806,
    },
    'backend/api/src/push-token.ts': {
      setPushToken: 2.4342969204210347,
    },
    'backend/api/src/reaction.ts': {
      addOrRemoveReaction: 1.4146063631103607,
    },
    'backend/api/src/record-comment-view.ts': {
      recordCommentView: 0.6291456000000002,
    },
    'backend/api/src/record-contract-interaction.ts': {
      recordContractInteraction: 0.994766537936616,
    },
    'backend/api/src/record-contract-view.ts': {
      recordContractView: 1.445362270427176,
    },
    'backend/api/src/redeem-market-ad-reward.ts': {
      redeemboost: 1.4377349756540254,
    },
    'backend/api/src/redeem-shares.ts': {
      redeemShares: 3.785977079589417,
    },
    'backend/api/src/refer-user.ts': {
      referuser: 1.4171948490136521,
      handleReferral: 1.4171948490136521,
    },
    'backend/api/src/register-discord-id.ts': {
      registerdiscordid: 0.9378748862299282,
    },
    'backend/api/src/report.ts': {
      report: 1.7028976208012778,
    },
    'backend/api/src/request-loan.ts': {
      requestloan: 1.9163425676981252,
    },
    'backend/api/src/request-phone-otp.ts': {
      requestOTP: 1.0057587670778319,
    },
    'backend/api/src/resolve-market.ts': {
      resolveMarket: 1.3974021078165644,
      resolveMarketMain: 1.3974021078165644,
      getResolutionParams: 1.3974021078165644,
      validateAnswerCpmm: 1.3974021078165644,
    },
    'backend/api/src/save-topic.ts': {
      saveTopic: 1.0057587670778319,
    },
    'backend/api/src/save-twitch-credentials.ts': {
      saveTwitchCredentials: 0.7111788444385564,
    },
    'backend/api/src/search-contract-positions.ts': {
      searchContractPositions: 0.8814693511187484,
      getSearchUserSQL: 0.8814693511187484,
    },
    'backend/api/src/search-giphy.ts': {
      searchgiphy: 0.7846824271987748,
    },
    'backend/api/src/search-location.ts': {
      searchlocation: 0.9495259526607583,
    },
    'backend/api/src/search-near-city.ts': {
      searchnearcity: 0.8814693511187484,
      getNearbyCities: 0.8814693511187484,
    },
    'backend/api/src/sell-shares.ts': {
      sellShares: 2.7141716795551467,
    },
    'backend/api/src/serve.ts': {},
    'backend/api/src/set-news.ts': {
      setnews: 1.0057587670778319,
    },
    'backend/api/src/set-tv.ts': {
      settv: 1.0964181287424493,
      deletetv: 1.0964181287424493,
    },
    'backend/api/src/stripe-endpoints.ts': {
      createcheckoutsession: 1.7958936795208493,
      stripewebhook: 1.7958936795208493,
    },
    'backend/api/src/supabase-search-contract.ts': {
      searchMarketsLite: 1.5458348136308662,
      searchMarketsFull: 1.5458348136308662,
    },
    'backend/api/src/supabase-search-dashboards.ts': {
      supabasesearchdashboards: 0.9456582137632041,
      getSearchDashboardSQL: 0.9456582137632041,
    },
    'backend/api/src/supabase-search-groups.ts': {
      supabasesearchgroups: 1.0273904626114458,
      getSearchGroupSQL: 1.0273904626114458,
      supabasesearchmygroups: 1.0273904626114458,
    },
    'backend/api/src/supabase-search-users.ts': {
      searchUsers: 2.417365482771721,
      getSearchUserSQL: 1.0130206575341563,
    },
    'backend/api/src/unlist-and-cancel-user-contracts.ts': {
      unlistAndCancelUserContracts: 1.318039594202724,
    },
    'backend/api/src/unresolve.ts': {
      unresolve: 1.9728839708221673,
      getUndoContractPayoutSpice: 1.9728839708221673,
      getUndoOldContractPayout: 1.9728839708221673,
    },
    'backend/api/src/unsubscribe.ts': {
      unsubscribe: 7.748793106886315,
    },
    'backend/api/src/update-dashboard.ts': {
      updatedashboard: 1.1195728005201988,
    },
    'backend/api/src/update-group-member-role.ts': {
      updatememberrole: 1.2406918549286932,
    },
    'backend/api/src/update-group-privacy.ts': {
      updategroupprivacy: 1.167644816903771,
    },
    'backend/api/src/update-group.ts': {
      updategroup: 1.0380372802652518,
    },
    'backend/api/src/update-market.ts': {
      updateMarket: 5.215317335886913,
    },
    'backend/api/src/update-me.ts': {
      updateMe: 1.5267497014524423,
    },
    'backend/api/src/update-mod-report.ts': {
      updateModReport: 1.7045421700746468,
    },
    'backend/api/src/update-notif-settings.ts': {
      updateNotifSettings: 0.7846824271987748,
    },
    'backend/api/src/update-private-user-message-channel.ts': {
      updateprivateusermessagechannel: 0.9495259526607583,
    },
    'backend/api/src/update-private-user.ts': {
      updatePrivateUser: 1.9399766181459126,
    },
    'backend/api/src/update-user-disinterests.ts': {
      updateUserDisinterestEmbedding: 2.0328058228052313,
    },
    'backend/api/src/validate-iap.ts': {
      validateiap: 1.93347860977007,
    },
    'backend/api/src/verify-phone-number.ts': {
      verifyPhoneNumber: 1.5763553783248756,
    },
    'backend/api/tsconfig.json': {},
    'backend/discord-bot/.dockerignore': {},
    'backend/discord-bot/.eslintrc.cjs': {},
    'backend/discord-bot/.gcloudignore': {},
    'backend/discord-bot/.gitignore': {},
    'backend/discord-bot/Dockerfile': {},
    'backend/discord-bot/README.md': {},
    'backend/discord-bot/deploy.sh': {},
    'backend/discord-bot/img/ss.png': {},
    'backend/discord-bot/package.json': {},
    'backend/discord-bot/src/analytics.ts': {
      track: 4.621727062041713,
    },
    'backend/discord-bot/src/api.ts': {
      getMarketFromSlug: 0.759765493150617,
      getMarketFromId: 1.8130241120787904,
      getOpenBinaryMarketFromSlug: 1.5944532004318712,
      getTopAndBottomPositions: 1.2863948026147036,
      placeBet: 1.2863948026147036,
      getMyPositionInMarket: 1.2863948026147036,
      createMarket: 1.5944532004318712,
    },
    'backend/discord-bot/src/command.ts': {},
    'backend/discord-bot/src/commands/about.ts': {
      execute: 0.5216248436251553,
      aboutCommand: 0.5216248436251553,
    },
    'backend/discord-bot/src/commands/create.ts': {
      execute: 0.8388608000000004,
      handleCreateMarket: 1.4203147984022608,
      createCommand: 0.8388608000000004,
    },
    'backend/discord-bot/src/commands/index.ts': {
      commands: 0.41095618504457837,
    },
    'backend/discord-bot/src/commands/react-to-bet-on-market.ts': {
      execute: 1.2599678046077611,
      replyWithMarketToBetOn: 2.644183918076027,
      handleOldReaction: 2.133310935967935,
      marketCommand: 1.2599678046077611,
    },
    'backend/discord-bot/src/commands/search.ts': {
      searchButtonTypes: 1.027390462611446,
      execute: 1.027390462611446,
      searchCommand: 1.027390462611446,
      searchMarkets: 1.027390462611446,
      handleSearchButtonInteraction: 1.7395232651047479,
    },
    'backend/discord-bot/src/constants/config.ts': {
      config: 0.47453132812125803,
    },
    'backend/discord-bot/src/constants/dev.ts': {
      DEV: 0.29058990521557504,
    },
    'backend/discord-bot/src/constants/prod.ts': {
      PROD: 0.23726566406062902,
    },
    'backend/discord-bot/src/emojis.ts': {
      customEmojis: 0.6772395601796123,
      customEmojiCache: 0.6772395601796123,
      emojis: 0.6772395601796123,
      getBetInfoFromReaction: 1.146666251881768,
      getAnyHandledEmojiKey: 1.42126326336512,
      getBettingEmojisAsStrings: 1.146666251881768,
    },
    'backend/discord-bot/src/helpers.ts': {
      messageEmbedsToRefresh: 1.1515989661044765,
      shouldIgnoreMessageFromGuild: 3.2149873183754103,
      handleReaction: 2.416759741884344,
      handleBet: 1.1515989661044765,
      getCurrentMarketDescription: 1.9498265425955426,
      refreshMessage: 1.1515989661044765,
      sendChannelMessage: 1.1515989661044765,
      sendThreadMessage: 1.1515989661044765,
      sendThreadEmbed: 1.9498265425955426,
      getSlug: 2.748054119086609,
      truncateText: 3.2149873183754103,
      handleButtonPress: 1.9498265425955426,
    },
    'backend/discord-bot/src/index.ts': {},
    'backend/discord-bot/src/leaderboard.ts': {
      sendPositionsEmbed: 2.203205390342919,
    },
    'backend/discord-bot/src/server.ts': {
      startServerForGCP: 1.0352234081275604,
    },
    'backend/discord-bot/src/storage.ts': {
      supabase: 0.7264747630389374,
      messagesHandledViaCollector: 0.7264747630389374,
      registerHelpMessage: 0.7264747630389374,
      getUserInfo: 1.8956907891003827,
      getApiKeyFromDiscordId: 0.7264747630389374,
      getMarketInfoFromMessageId: 1.524588865120767,
      saveMarketToMessageId: 1.2300286967873313,
      saveThreadIdToMessageId: 1.2300286967873313,
      updateThreadLastUpdatedTime: 1.524588865120767,
    },
    'backend/discord-bot/tsconfig.json': {},
    'backend/email-templates/creating-market.html': {},
    'backend/email-templates/didnt-bet-new-user-survey.html': {},
    'backend/email-templates/interesting-markets.html': {},
    'backend/email-templates/market-answer-comment.html': {},
    'backend/email-templates/market-answer.html': {},
    'backend/email-templates/market-close.html': {},
    'backend/email-templates/market-comment-bulk.html': {},
    'backend/email-templates/market-resolved-bulk.html': {},
    'backend/email-templates/market-resolved-no-bets-bulk.html': {},
    'backend/email-templates/new-endorsement.html': {},
    'backend/email-templates/new-market-from-followed-user-bulk.html': {},
    'backend/email-templates/new-market-from-private-group.html': {},
    'backend/email-templates/new-match.html': {},
    'backend/email-templates/new-message.html': {},
    'backend/email-templates/new-unique-bettor.html': {},
    'backend/email-templates/new-unique-bettors.html': {},
    'backend/email-templates/portfolio-update-bulk.html': {},
    'backend/email-templates/sign-up-bonus-with-interesting-markets.html': {},
    'backend/email-templates/thank-you.html': {},
    'backend/email-templates/welcome.html': {},
    'backend/functions/.env.dev': {},
    'backend/functions/.env.prod': {},
    'backend/functions/.eslintrc.js': {},
    'backend/functions/.gitignore': {},
    'backend/functions/README.md': {},
    'backend/functions/package-lock.json': {},
    'backend/functions/package.json': {},
    'backend/functions/src/index.ts': {},
    'backend/functions/src/scheduled/drizzle-liquidity.ts': {
      drizzleLiquidity: 2.1193965151605334,
      drizzleLiquidityScheduler: 1.2517497235294228,
    },
    'backend/functions/src/scheduled/reset-betting-streaks.ts': {
      resetBettingStreaksForUsers: 0.6388573520203487,
    },
    'backend/functions/src/scheduled/reset-quests-stats.ts': {
      resetWeeklyQuestStats: 0.6540962961217541,
      resetDailyQuestStats: 0.6540962961217541,
      resetWeeklyQuestStatsInternal: 0.6540962961217541,
      resetDailyQuestStatsInternal: 0.6540962961217541,
    },
    'backend/functions/src/scheduled/weekly-portfolio-updates.ts': {
      saveWeeklyContractMetrics: 1.0450468456664257,
      sendWeeklyPortfolioUpdate: 1.0450468456664257,
      saveWeeklyContractMetricsInternal: 1.0450468456664257,
      sendWeeklyPortfolioUpdateNotifications: 1.0450468456664257,
    },
    'backend/functions/tsconfig.json': {},
    'backend/scheduler/.gcloudignore': {},
    'backend/scheduler/.gitignore': {},
    'backend/scheduler/Dockerfile': {},
    'backend/scheduler/README.md': {},
    'backend/scheduler/debug.sh': {},
    'backend/scheduler/deploy-scheduler.sh': {},
    'backend/scheduler/package.json': {},
    'backend/scheduler/src/index.ts': {
      loadTemplate: 1.7420252847366373,
    },
    'backend/scheduler/src/jobs/auto-award-bounty.ts': {
      autoAwardBounty: 1.9370511287527872,
    },
    'backend/scheduler/src/jobs/clean-old-notifications.ts': {
      cleanOldNotifications: 0.7313018909795374,
    },
    'backend/scheduler/src/jobs/denormalize-answers.ts': {
      denormalizeAnswers: 0.8304298242122016,
    },
    'backend/scheduler/src/jobs/helpers.ts': {
      createJob: 4.4037960504398175,
    },
    'backend/scheduler/src/jobs/increment-streak-forgiveness.ts': {
      incrementStreakForgiveness: 0.9710515804944135,
    },
    'backend/scheduler/src/jobs/index.ts': {
      createJobs: 2.5722995033856955,
    },
    'backend/scheduler/src/jobs/poll-poll-resolutions.ts': {
      pollPollResolutions: 0.711796992181887,
      getMaxVoteIds: 0.711796992181887,
    },
    'backend/scheduler/src/jobs/reindex-table.ts': {
      createReindexTablesJob: 0.517108526206176,
    },
    'backend/scheduler/src/jobs/reset-pg-stats.ts': {
      resetPgStats: 0.29058990521557504,
    },
    'backend/scheduler/src/jobs/reset-weekly-emails-flags.ts': {
      resetWeeklyEmailsFlags: 0.3355443200000002,
    },
    'backend/scheduler/src/jobs/score-contracts.ts': {
      scoreContracts: 0.3934605916618092,
    },
    'backend/scheduler/src/jobs/send-market-close-emails.ts': {
      sendMarketCloseEmails: 0.8133057206672301,
      shouldSendFirstOrFollowUpCloseNotification: 0.8133057206672301,
      marketClosedMultipleOfNDaysAgo: 0.8133057206672301,
    },
    'backend/scheduler/src/jobs/streak-expiration-notice.ts': {
      sendStreakExpirationNotification: 0.5931641601515726,
    },
    'backend/scheduler/src/jobs/update-league-ranks.ts': {
      updateLeagueRanks: 0.6605196544399851,
    },
    'backend/scheduler/src/jobs/update-league.ts': {
      updateLeague: 2.540736350941092,
    },
    'backend/scheduler/src/jobs/update-stats.ts': {
      updateStatsCore: 2.020644281450439,
      updateStatsBetween: 2.020644281450439,
      getDailyBets: 1.1934250634857309,
      getDailyComments: 1.1934250634857309,
      getDailyContracts: 1.1934250634857309,
      getDailyNewUsers: 1.1934250634857309,
      updateActivityStats: 1.1934250634857309,
      updateDailySales: 1.1934250634857309,
      updateConversionScores: 1.1934250634857309,
    },
    'backend/scheduler/src/templates/index.hbs': {},
    'backend/scheduler/src/utils.ts': {
      initFirebase: 1.2300286967873313,
      initSecrets: 1.2300286967873313,
    },
    'backend/scheduler/tsconfig.json': {},
    'backend/scripts/.eslintrc.js': {},
    'backend/scripts/.gitignore': {},
    'backend/scripts/README.md': {},
    'backend/scripts/add-cash-balance-column.sql': {},
    'backend/scripts/add-cash-column.sql': {},
    'backend/scripts/add-cash-stat-columns.sql': {},
    'backend/scripts/add-liquidity-to-markets.ts': {},
    'backend/scripts/add-love-questions.ts': {},
    'backend/scripts/add-lovers-to-general.ts': {},
    'backend/scripts/add-new-notification-preference.ts': {
      main: 3.48293030296042,
    },
    'backend/scripts/add-reactivated-to-league.ts': {},
    'backend/scripts/add-token-column.sql': {},
    'backend/scripts/adjust-user-profit-pivot.ts': {},
    'backend/scripts/airdrop.ts': {},
    'backend/scripts/backfill-about-post-group-ids.ts': {
      updatePostsWithGroupIdAndVisibility: 1.4477375592447692,
    },
    'backend/scripts/backfill-all-group-posts.ts': {
      updatePostsWithGroupIdAndVisibility: 1.4712795509977028,
    },
    'backend/scripts/backfill-answer-index.ts': {},
    'backend/scripts/backfill-answer-resolution-times.ts': {},
    'backend/scripts/backfill-answer-subsidy-pool.ts': {},
    'backend/scripts/backfill-answer-total-liquidity.ts': {},
    'backend/scripts/backfill-avatar-urls.ts': {
      backfillAvatarUrls: 0.7414552001894655,
    },
    'backend/scripts/backfill-bet-flags.ts': {
      updateAllBets: 1.186907440825948,
    },
    'backend/scripts/backfill-bet-visibility.ts': {
      processGroup: 1.096627029978744,
    },
    'backend/scripts/backfill-blocks.ts': {
      main: 2.340604064117882,
    },
    'backend/scripts/backfill-bte-ante.ts': {},
    'backend/scripts/backfill-comment-ids.ts': {},
    'backend/scripts/backfill-comment-types.ts': {},
    'backend/scripts/backfill-contract-followers.ts': {
      backfillContractFollowers: 1.5508648186608665,
    },
    'backend/scripts/backfill-contract-isranked.ts': {
      updateContracts: 1.1121828002841982,
    },
    'backend/scripts/backfill-contract-metrics-user-data.ts': {},
    'backend/scripts/backfill-daily-scores.ts': {},
    'backend/scripts/backfill-empty-unique-bettor-count.ts': {},
    'backend/scripts/backfill-fees.ts': {},
    'backend/scripts/backfill-followers.ts': {
      backfillFollowers: 1.25719845884729,
    },
    'backend/scripts/backfill-group-ids.ts': {},
    'backend/scripts/backfill-group-privacy-status.ts': {},
    'backend/scripts/backfill-last-updated-time.ts': {},
    'backend/scripts/backfill-liquidity-txn.ts': {},
    'backend/scripts/backfill-loan-amount.ts': {
      ranges: 2.0724302873679497,
    },
    'backend/scripts/backfill-match-creator-id.ts': {},
    'backend/scripts/backfill-missing-shares-from-other.ts': {},
    'backend/scripts/backfill-multi-binary-color.sql': {},
    'backend/scripts/backfill-popularity-scores.ts': {},
    'backend/scripts/backfill-post-comment-visibility.ts': {
      backfillVisibility: 1.1121828002841982,
      backfillCommentsVisibility: 1.1121828002841982,
    },
    'backend/scripts/backfill-post-privacy-fields.ts': {
      addVisibilityToPostsWithoutVisibilityField: 1.2707901885425468,
    },
    'backend/scripts/backfill-stripe-purchase-txns.ts': {
      doIt: 1.2842380782643072,
    },
    'backend/scripts/backfill-subsidy-pool.ts': {},
    'backend/scripts/backfill-supabase-quests.ts': {
      backfillSupabaseQuests: 1.5285490535223272,
    },
    'backend/scripts/backfill-tiers.ts': {},
    'backend/scripts/backfill-unique-bettors-day.ts': {},
    'backend/scripts/backfill-unique-bettors.ts': {},
    'backend/scripts/backup-db.ts': {
      backupDb: 0.7414552001894655,
    },
    'backend/scripts/calculate-kyc-bonus-rewards.ts': {
      calculateKycBonusRewards: 1.2155117234416133,
    },
    'backend/scripts/categorize.ts': {
      main: 2.255462512032049,
    },
    'backend/scripts/change-user-info.ts': {
      main: 2.7975569405580463,
    },
    'backend/scripts/chaos.ts': {
      visitContract: 2.4961101519625832,
      placeManyBets: 2.4961101519625832,
    },
    'backend/scripts/check-backfilled-tiers.ts': {},
    'backend/scripts/clean-contracts.ts': {},
    'backend/scripts/clean-display-names.ts': {},
    'backend/scripts/clean-local-firestore-db.ts': {
      main: 2.881770331287425,
      deleteTopLevelCollections: 1.2076340531329113,
      deleteUsersSubcollections: 1.2076340531329113,
      deleteOldContracts: 1.2076340531329113,
      cleanPrivateUsers: 1.2076340531329113,
      cleanUsersEmails: 1.2076340531329113,
      deleteCollection: 1.2076340531329113,
      deleteQueryBatch: 1.2076340531329113,
    },
    'backend/scripts/clean-users.ts': {},
    'backend/scripts/clear-duplicate-card-views.ts': {},
    'backend/scripts/compare-bet-endpoints.ts': {
      createTestMarkets: 1.9769724933240733,
      placeTestBet: 1.9769724933240733,
      placeTestSell: 1.9769724933240733,
      getMarketPositions: 1.9769724933240733,
      getMarketInfo: 1.9769724933240733,
      compareProbs: 1.9769724933240733,
      comparePositions: 1.9769724933240733,
    },
    'backend/scripts/convert-binary-to-stonk-markets.ts': {
      convertBinaryToStonkMarkets: 1.8628831351343547,
    },
    'backend/scripts/convert-events-to-interactions.ts': {},
    'backend/scripts/convert-remaining-prize-points.ts': {},
    'backend/scripts/convert-topics-to-groups.ts': {
      main: 4.5540927542717995,
    },
    'backend/scripts/correct-answer-resolution-probability.ts': {},
    'backend/scripts/correct-bet-probability.ts': {
      migrateContract: 1.0701983985535894,
      migrateContracts: 1.0701983985535894,
    },
    'backend/scripts/correct-contract-creator-info.ts': {
      correctContractCreatorInfo: 2.03900180052103,
    },
    'backend/scripts/create-cash-contract.ts': {},
    'backend/scripts/create-dev-private-users.ts': {
      main: 2.8666428234866856,
    },
    'backend/scripts/create-matches.ts': {},
    'backend/scripts/create-new-notification-preferences.ts': {
      main: 2.2984275633731714,
    },
    'backend/scripts/create-private-users.ts': {
      main: 3.158886538872871,
    },
    'backend/scripts/debit-unpaid-loans-bug.ts': {},
    'backend/scripts/decrease-deposits-for-created-answers.ts': {},
    'backend/scripts/delete-bad-images.ts': {},
    'backend/scripts/delete-cert.ts': {},
    'backend/scripts/delete-comments.ts': {
      deleteComments: 1.2295643489431536,
    },
    'backend/scripts/delete-cpmm-2.ts': {},
    'backend/scripts/delete-custom-gcp-metric.ts': {
      deleteMetricDescriptor: 0.8694332890429263,
    },
    'backend/scripts/delete-email.ts': {
      main: 2.255462512032049,
    },
    'backend/scripts/delete-group.ts': {
      deleteGroup: 1.2975466003315648,
    },
    'backend/scripts/delete-numeric-dpm.ts': {},
    'backend/scripts/delete-private-groups.ts': {},
    'backend/scripts/delete-tags.ts': {
      deleteTags: 1.4477375592447692,
    },
    'backend/scripts/denormalize-answers.ts': {},
    'backend/scripts/denormalize-avatar-urls.ts': {
      getUsersById: 1.246218349340757,
      getContractsByUserId: 1.246218349340757,
      getCommentsByUserId: 1.246218349340757,
      getAnswersByUserId: 1.246218349340757,
    },
    'backend/scripts/denormalize-bet-user-data.ts': {
      denormalize: 1.1426592046555268,
    },
    'backend/scripts/denormalize-comment-bet-data.ts': {
      getBetComments: 1.2388442115283642,
      denormalize: 1.2388442115283642,
    },
    'backend/scripts/denormalize-comment-contract-data.ts': {
      getContractsById: 1.0485760000000004,
      getCommentsByContractId: 1.0485760000000004,
      denormalize: 1.0485760000000004,
    },
    'backend/scripts/denormalize.ts': {
      findDiffs: 2.482445016607766,
      describeDiff: 2.482445016607766,
      describeDocVal: 0.8426750616965795,
      getDiffUpdate: 1.4267729048397415,
      applyDiff: 2.352546082973761,
    },
    'backend/scripts/drizzle.ts': {},
    'backend/scripts/drop-is-politics.sql': {},
    'backend/scripts/drop-unused-indexes.sql': {},
    'backend/scripts/dump-compatibility-questions.ts': {},
    'backend/scripts/export-emails-for-newsletter.ts': {
      main: 2.934102472517097,
    },
    'backend/scripts/fill-spice.ts': {},
    'backend/scripts/find-deep-docs.ts': {
      maxDepth: 1.2842380782643072,
    },
    'backend/scripts/fix-bet-undefined-answerids.ts': {},
    'backend/scripts/fix-busted-ids.ts': {
      processGroup: 0.9631785586982305,
    },
    'backend/scripts/fix-jack-presidential-market.ts': {},
    'backend/scripts/fix-last-bet-time.ts': {},
    'backend/scripts/fix-loan-deposit-payouts.ts': {},
    'backend/scripts/fix-null-shares.ts': {},
    'backend/scripts/fix-popularity-scores.ts': {},
    'backend/scripts/fix-shares-dpm-multi.ts': {},
    'backend/scripts/generate-embeddings.ts': {},
    'backend/scripts/generate-image-prompts.ts': {
      main: 1.655057005810547,
    },
    'backend/scripts/generate-next-season.ts': {},
    'backend/scripts/generate-topic-vectors.ts': {},
    'backend/scripts/generate-user-topic-interests.ts': {},
    'backend/scripts/generate-yc-batch-markets.ts': {},
    'backend/scripts/get-app-user-emails.ts': {
      main: 2.690604109301414,
    },
    'backend/scripts/get-contract-emails.ts': {
      main: 2.8323105332142,
    },
    'backend/scripts/get-emails.ts': {
      main: 2.027022579727187,
    },
    'backend/scripts/get-json-data-dump.ts': {},
    'backend/scripts/get-lovers-emails.ts': {},
    'backend/scripts/get-mana-purchases-csv.ts': {},
    'backend/scripts/get-mana-supply.ts': {},
    'backend/scripts/get-new-user-emails.ts': {
      main: 2.579220058528318,
    },
    'backend/scripts/give-extra-purchased-mana.ts': {},
    'backend/scripts/invert-stats-table.sql': {},
    'backend/scripts/make-contracts-public.ts': {
      makeContractsPublic: 0.9451736335552323,
    },
    'backend/scripts/manicode.sh': {},
    'backend/scripts/manicode.ts': {
      promptUser: 2.1144883435800734,
      loadListedFiles: 2.1144883435800734,
      promptClaudeAndApplyFileChanges: 2.1144883435800734,
      promptClaudeWithContinuation: 2.1144883435800734,
      processFileBlock: 2.1144883435800734,
      generateDiffBlocks: 2.1144883435800734,
      applyReplacement: 2.1144883435800734,
      getSystemPrompt: 2.1144883435800734,
      loadAllProjectFiles: 2.1144883435800734,
      getAllFiles: 2.1144883435800734,
      getOnlyCodeFiles: 2.1144883435800734,
      promptClaudeForExpansion: 2.1144883435800734,
      getExportedTokensForFiles: 2.1144883435800734,
      getExportedTokens: 2.1144883435800734,
      visit: 2.1144883435800734,
    },
    'backend/scripts/manifest-airdrop.ts': {},
    'backend/scripts/mass-ban-fine.ts': {
      banAndFineUsers: 1.1121828002841982,
    },
    'backend/scripts/merge-all-dupe-names.ts': {},
    'backend/scripts/merge-groups.ts': {
      mergeGroups: 3.1069386215049453,
      updateGroupLinksOnContracts: 3.850970338604292,
    },
    'backend/scripts/migrate-about-posts.sql': {},
    'backend/scripts/migrate-contract.ts': {
      migrateBet: 0.9720559681006031,
      migrateContract: 0.9720559681006031,
      migrateContracts: 0.9720559681006031,
    },
    'backend/scripts/migrate-dashboard-descriptions.sql': {},
    'backend/scripts/migrate-data-from-contract-bets.ts': {},
    'backend/scripts/migrate-manalinks.sql': {},
    'backend/scripts/migrate-multi-dpm-to-cpmm.ts': {
      dpmMarketDataDump: 3.7257662702687093,
    },
    'backend/scripts/migrate-reactions.sql': {},
    'backend/scripts/migrate-to-cfmm.ts': {
      recalculateContract: 2.5751562098296104,
    },
    'backend/scripts/migrate-to-dpm-2.ts': {
      recalculateContract: 2.1563900217267444,
      main: 5.145781349221729,
    },
    'backend/scripts/notify-of-comments.ts': {},
    'backend/scripts/package.json': {},
    'backend/scripts/pay-out-contract-again.ts': {
      checkIfPayOutAgain: 1.5434620803617651,
      payOutContractAgain: 1.5434620803617651,
    },
    'backend/scripts/place-many-bets.ts': {
      placeManyBets: 1.6265607441273142,
    },
    'backend/scripts/populate-user-portfolio-history-latest.ts': {},
    'backend/scripts/port-column-supabase.ts': {},
    'backend/scripts/recalculate-contract-totals.ts': {
      recalculateContract: 1.1625330285521644,
      recalculateContractTotals: 1.1625330285521644,
    },
    'backend/scripts/recalculate-multi-contract-metrics.ts': {},
    'backend/scripts/reclaim-mana-undo.ts': {},
    'backend/scripts/reclaim-mana.ts': {},
    'backend/scripts/redo-resolution-payouts.ts': {},
    'backend/scripts/refund-bounties.ts': {
      refundCommentBounties: 1.1723436077874103,
    },
    'backend/scripts/regen-schema.ts': {
      getTableInfo: 1.6490384668419877,
      getFunctions: 1.6490384668419877,
      getViews: 1.6490384668419877,
      dump: 1.6490384668419877,
      extractTableDefinitions: 1.6490384668419877,
      generateSQLFiles: 1.6490384668419877,
    },
    'backend/scripts/reimburse-broken-markets.ts': {},
    'backend/scripts/remove-answer-ante.ts': {
      removeAnswerAnte: 1.2155117234416133,
    },
    'backend/scripts/remove-contract-views.ts': {},
    'backend/scripts/remove-group-link-denorm.sql': {},
    'backend/scripts/remove-nsfw-block.ts': {},
    'backend/scripts/remove-openai-cover-image-urls.ts': {},
    'backend/scripts/remove-unique-bettor-ids.ts': {},
    'backend/scripts/remove-unused-property.ts': {
      main: 2.1669782881696564,
    },
    'backend/scripts/rename-user-contracts.ts': {
      renameUserContracts: 1.157596560271324,
    },
    'backend/scripts/replay-writes-until-done.ts': {},
    'backend/scripts/resolve-bounties.ts': {},
    'backend/scripts/resolve-dates-no.ts': {},
    'backend/scripts/resolve-old-relationship-markets.ts': {},
    'backend/scripts/run-auto-award-bounties.ts': {},
    'backend/scripts/run-denormalize-answers.ts': {},
    'backend/scripts/run-script.ts': {
      runScript: 5.784882928634626,
    },
    'backend/scripts/save-mana-stats.ts': {},
    'backend/scripts/search-markets.ts': {
      main: 2.967257225136128,
    },
    'backend/scripts/send-leagues-end-of-season.ts': {},
    'backend/scripts/send-sweepcash.ts': {},
    'backend/scripts/set-avatar-cache-headers.ts': {},
    'backend/scripts/supabase/backfill-user-ids.ts': {},
    'backend/scripts/supabase/query-recent-bettor-searchs.sql': {},
    'backend/scripts/supabase-import.ts': {
      getServerTimestamp: 1.7339195792192907,
      getWriteRow: 1.7339195792192907,
      importCollection: 1.7339195792192907,
      importCollectionGroup: 1.7339195792192907,
      importAppendOnlyCollectionGroup: 1.7339195792192907,
      clearFailedWrites: 1.7339195792192907,
      importDatabase: 1.7339195792192907,
    },
    'backend/scripts/test-backend-function.ts': {
      testBackendFunctionScript: 0.6147821744715768,
    },
    'backend/scripts/test-close-date.ts': {},
    'backend/scripts/test-fb-analytics.ts': {},
    'backend/scripts/test-resolve-unresolve.ts': {},
    'backend/scripts/test-scoring.ts': {},
    'backend/scripts/test-supabase.ts': {},
    'backend/scripts/top-up-manifold.ts': {},
    'backend/scripts/transfer-contract-ownership.ts': {},
    'backend/scripts/tsconfig.json': {},
    'backend/scripts/turn-private-group-public.ts': {
      convertGroup: 4.9355507136339165,
    },
    'backend/scripts/txn-native-columns.sql': {},
    'backend/scripts/unconvert-stonk-markets.ts': {
      convertBinaryToStonkMarkets: 1.2155117234416133,
    },
    'backend/scripts/undo-contract-payouts.ts': {
      undoContractPayoutTxn: 1.6370887552921503,
    },
    'backend/scripts/unlist-group-contracts.ts': {
      unlistContractsInGroup: 0.9982146125317947,
    },
    'backend/scripts/unlist-markets-and-redact-user-name.ts': {},
    'backend/scripts/unlist-user-contracts.ts': {
      unlistUserContracts: 1.1275239774018115,
    },
    'backend/scripts/update-contract-visibility.ts': {
      processGroup: 1.1426592046555268,
    },
    'backend/scripts/update-last-comment-time.ts': {
      updateLastCommentTime: 1.201294722978504,
    },
    'backend/scripts/update-league.ts': {},
    'backend/scripts/update-metrics.ts': {},
    'backend/scripts/update-notification-preferences.ts': {
      main: 3.2804262907492188,
    },
    'backend/scripts/update-stats.ts': {},
    'backend/scripts/websocket-connect.ts': {
      waitForConnected: 0.9329773337668323,
      subscribeWebsocket: 0.9329773337668323,
    },
    'backend/scripts/websocket-test.ts': {
      waitForConnected: 0.9512131431444097,
      subscribeToSomething: 0.9512131431444097,
      unsubscribeFromSomething: 0.9512131431444097,
      broadcastSomething: 0.9512131431444097,
      testWebsocket: 0.9512131431444097,
    },
    'backend/scripts/zap-liquidity.ts': {
      main: 2.8666428234866856,
    },
    'backend/shared/.eslintrc.js': {},
    'backend/shared/.gitignore': {},
    'backend/shared/package.json': {},
    'backend/shared/src/analytics.ts': {
      track: 4.661399266619032,
      trackPublicEvent: 2.8068361949400944,
      getIp: 2.57512942780412,
    },
    'backend/shared/src/audit-events.ts': {
      trackAuditEvent: 1.0944260539868693,
    },
    'backend/shared/src/backfill-user-topic-interests.ts': {
      backfillUserTopicInterests: 1.4640269838600937,
    },
    'backend/shared/src/bounty.ts': {
      awardBounty: 2.287434510705428,
    },
    'backend/shared/src/calculate-calibration.ts': {
      saveCalibrationData: 2.3009565584973974,
      points: 1.0964181287424493,
    },
    'backend/shared/src/calculate-mana-stats.ts': {
      updateTxnStats: 2.4305918660779584,
      insertLatestManaStats: 1.9609862133008142,
      updateManaStatsBetween: 1.9609862133008142,
    },
    'backend/shared/src/calculate-redeemable-prize-cash.ts': {
      calculateRedeemablePrizeCash: 2.817084109335113,
    },
    'backend/shared/src/calculate-user-topic-interests.ts': {
      calculateUserTopicInterests: 4.871134988695764,
    },
    'backend/shared/src/check-push-receipts.ts': {
      checkPushNotificationReceipts: 1.3096710042337203,
    },
    'backend/shared/src/complete-quest-internal.ts': {
      completeSharingQuest: 2.322985533435199,
      completeCalculatedQuestFromTrigger: 2.322985533435199,
      completeReferralsQuest: 2.322985533435199,
      getUserShareEventsCount: 1.371992677368401,
    },
    'backend/shared/src/conversion-score.ts': {
      calculateConversionScore: 1.69726853054345,
    },
    'backend/shared/src/create-cash-contract.ts': {
      createCashContractMain: 3.0964546228803664,
    },
    'backend/shared/src/create-love-notification.ts': {
      createLoveLikeNotification: 2.0500478279788856,
      createLoveShipNotification: 2.5409814418679453,
    },
    'backend/shared/src/create-mod-report.ts': {
      insertModReport: 1.5477521685627,
    },
    'backend/shared/src/create-notification.ts': {
      createFollowOrMarketSubsidizedNotification: 3.41638171062614,
      createCommentOnContractNotification: 2.7563152528446895,
      createNewAnswerOnContractNotification: 2.7563152528446895,
      createBetFillNotification: 2.7563152528446895,
      createLimitBetCanceledNotification: 2.7563152528446895,
      createLimitBetExpiredNotification: 2.7563152528446895,
      createReferralNotification: 2.7563152528446895,
      createLoanIncomeNotification: 2.7563152528446895,
      createManaPaymentNotification: 2.7563152528446895,
      createBettingStreakBonusNotification: 2.7563152528446895,
      createBettingStreakExpiringNotification: 2.7563152528446895,
      createLeagueChangedNotification: 3.8847063154644386,
      createLikeNotification: 2.7563152528446895,
      createNewBettorNotification: 2.7563152528446895,
      createNewContractNotification: 2.7563152528446895,
      createContractResolvedNotifications: 2.7563152528446895,
      createMarketClosedNotification: 2.7563152528446895,
      createWeeklyPortfolioUpdateNotification: 2.7563152528446895,
      createQuestPayoutNotification: 2.7563152528446895,
      createBountyAwardedNotification: 2.7563152528446895,
      createBountyAddedNotification: 2.7563152528446895,
      createBountyCanceledNotification: 2.7563152528446895,
      createVotedOnPollNotification: 2.7563152528446895,
      createPollClosedNotification: 2.7563152528446895,
      createReferralsProgramNotification: 2.7563152528446895,
      createFollowAfterReferralNotification: 1.62792419022494,
      createFollowSuggestionNotification: 2.7563152528446895,
      createMarketReviewedNotification: 2.7563152528446895,
      createBetReplyToCommentNotification: 2.7563152528446895,
      createPushNotificationBonusNotification: 2.7563152528446895,
      createAirdropNotification: 2.7563152528446895,
      createManifestAirdropNotification: 2.7563152528446895,
      createExtraPurchasedManaNotification: 2.7563152528446895,
      createPaymentSuccessNotification: 2.7563152528446895,
    },
    'backend/shared/src/create-push-notifications.ts': {
      createPushNotifications: 3.9799118574901216,
    },
    'backend/shared/src/create-user-main.ts': {
      createUserMain: 3.3517847241396796,
      addContractsToSeenMarketsTable: 1.5971433800508714,
      upsertNewUserEmbeddings: 1.5971433800508714,
      getStorageBucketId: 1.5971433800508714,
    },
    'backend/shared/src/distribute-kyc-bonus.ts': {
      distributeKycBonus: 2.2005544792024523,
    },
    'backend/shared/src/emails.ts': {
      emailMoneyFormat: 3.1112928175821724,
      getMarketResolutionEmail: 2.2075552571449912,
      toDisplayResolution: 2.2075552571449912,
      sendWelcomeEmail: 2.2075552571449912,
      sendBulkEmails: 3.6399454009311425,
      sendPersonalFollowupEmail: 1.3038176967078106,
      sendCreatorGuideEmail: 1.3038176967078106,
      sendUnactivatedNewUserEmail: 2.2075552571449912,
      sendThankYouEmail: 2.7362078404939614,
      sendMarketCloseEmail: 2.2075552571449912,
      getNewCommentEmail: 2.2075552571449912,
      sendNewAnswerEmail: 2.2075552571449912,
      sendInterestingMarketsEmail: 2.2075552571449912,
      sendBonusWithInterestingMarketsEmail: 2.2075552571449912,
      imageSourceUrl: 1.3038176967078106,
      getNewFollowedMarketEmail: 2.2075552571449912,
      sendNewPrivateMarketEmail: 1.3038176967078106,
      sendNewUniqueBettorsEmail: 2.2075552571449912,
      getWeeklyPortfolioUpdateEmail: 2.2075552571449912,
      sendNewMatchEmail: 1.3038176967078106,
      sendNewMessageEmail: 2.2075552571449912,
      sendNewEndorsementEmail: 2.2075552571449912,
    },
    'backend/shared/src/expire-limit-orders.ts': {
      expireLimitOrders: 0.9378748862299282,
    },
    'backend/shared/src/fb-analytics.ts': {
      trackSignupFB: 2.1106977080252247,
    },
    'backend/shared/src/feed-analytics.ts': {
      getFeedConversionScores: 1.8450430451809974,
    },
    'backend/shared/src/generate-leagues.ts': {
      generateNextSeason: 2.7003106725517054,
      insertBots: 2.7003106725517054,
      getUsersNotInLeague: 2.7003106725517054,
      addToLeagueIfNotInOne: 3.346965476896426,
      addNewUserToLeague: 2.7003106725517054,
    },
    'backend/shared/src/get-user-portfolio-internal.ts': {
      getUserPortfolioInternal: 5.036441185109099,
    },
    'backend/shared/src/gidx/helpers.ts': {
      GIDXCallbackUrl: 0.9173931438401216,
      GIDX_BASE_URL: 0.9173931438401216,
      getGIDXStandardParams: 2.9331119065653786,
      getGIDXCustomerProfile: 1.92525252520275,
      getUserRegistrationRequirements: 2.3938804501435236,
      getUserSweepstakesRequirements: 1.5532816149579263,
      getLocalServerIP: 2.5611409963205545,
      throwIfIPNotWhitelisted: 2.702557773112375,
      verifyReasonCodes: 2.3938804501435236,
    },
    'backend/shared/src/group-importance-score.ts': {
      calculateGroupImportanceScore: 1.690512746465002,
      calculateGroupImportanceScoreForGroup: 0.9984440607850333,
    },
    'backend/shared/src/helpers/add-house-subsidy.ts': {
      addHouseSubsidy: 1.8181783147462902,
      addHouseSubsidyToAnswer: 1.4668948161557072,
    },
    'backend/shared/src/helpers/auth.ts': {
      throwErrorIfNotMod: 1.159099550229832,
    },
    'backend/shared/src/helpers/claude.ts': {
      models: 0.6333260154238772,
      promptClaudeStream: 1.3291057587017574,
      promptClaude: 1.0723141573902022,
    },
    'backend/shared/src/helpers/embeddings.ts': {
      TOPIC_SIMILARITY_THRESHOLD: 0.6131640461275591,
      magnitude: 0.6131640461275591,
      normalize: 2.6778687817505236,
      normalizeAndAverageVectors: 1.038176975921605,
      normalizeOrGetDefault: 0.6131640461275591,
      getDefaultEmbedding: 1.038176975921605,
      upsertGroupEmbedding: 1.6000135085067444,
      getAverageGroupEmbedding: 1.038176975921605,
      getAverageContractEmbedding: 1.038176975921605,
      addContractToUserDisinterestEmbedding: 1.038176975921605,
      updateUserDisinterestEmbeddingInternal: 0.6131640461275591,
      getDisinterestedContractIds: 0.6131640461275591,
      computeUserDisinterestEmbedding: 0.6131640461275591,
    },
    'backend/shared/src/helpers/file.ts': {
      writeJson: 1.4083548666895698,
      readJson: 1.1362518387218088,
      writeCsv: 1.6014150374436171,
      readCsv: 1.1362518387218088,
    },
    'backend/shared/src/helpers/fn-queue.ts': {
      DEFAULT_QUEUE_TIME_LIMIT: 0.8219123700891567,
      createFnQueue: 0.8219123700891567,
      betsQueue: 0.8219123700891567,
      pollQueue: 0.8219123700891567,
    },
    'backend/shared/src/helpers/generate-and-update-avatar-urls.ts': {
      generateAvatarUrl: 1.1596821767364986,
      upload: 0.6849269750742973,
    },
    'backend/shared/src/helpers/get-phone-number.ts': {
      getPhoneNumber: 0.6661866914336402,
    },
    'backend/shared/src/helpers/on-create-user.ts': {
      onCreateUser: 1.6684921020650436,
    },
    'backend/shared/src/helpers/openai-utils.ts': {
      generateEmbeddings: 2.310504708443753,
      getCloseDate: 1.574588609180266,
      generateImage: 1.270368175470546,
      promptGPT4: 1.574588609180266,
      promptGPT3: 1.270368175470546,
    },
    'backend/shared/src/helpers/portfolio.ts': {
      getCurrentPortfolio: 0.9642346618225731,
    },
    'backend/shared/src/helpers/search.ts': {
      constructPrefixTsQuery: 1.130371591666313,
      constructIlikeQuery: 0.7334474080778536,
    },
    'backend/shared/src/helpers/seen-markets.ts': {
      hasUserSeenMarket: 0.8982859514788051,
    },
    'backend/shared/src/helpers/try-or-log-error.ts': {
      tryOrLogError: 1.1051580583555372,
    },
    'backend/shared/src/helpers/user-contract-metrics.ts': {
      updateContractMetricsForUsers: 1.9656096952471807,
      bulkUpdateContractMetrics: 2.4440610052280087,
      setAdjustProfitFromResolvedMarkets: 2.23505949967909,
      rerankContractMetrics: 0.9366235516016447,
      rerankContractMetricsManually: 1.9656096952471807,
    },
    'backend/shared/src/importance-score.ts': {
      IMPORTANCE_MINUTE_INTERVAL: 1.5746106568402496,
      MIN_IMPORTANCE_SCORE: 1.5746106568402496,
      calculateImportanceScore: 3.3044972743127117,
      getTodayComments: 1.5746106568402496,
      getContractTraders: 1.5746106568402496,
      getContractVoters: 2.6660475941087123,
      computeContractScores: 1.5746106568402496,
    },
    'backend/shared/src/init-admin.ts': {
      getFirebaseActiveProject: 0.858296446811893,
      getLocalEnv: 2.7441664943873336,
      initAdmin: 4.640567918836381,
    },
    'backend/shared/src/init-caches.ts': {
      DEBUG_TOPIC_INTERESTS: 0.6053956358657813,
      initCaches: 1.0250239139894428,
    },
    'backend/shared/src/love/love-markets.ts': {
      getCreatorMutuallyMessagedUserIds: 0.7688286227062427,
      getMutuallyMessagedUserIds: 0.7688286227062427,
      resolveLoveMarketOtherAnswers: 1.301740014868861,
    },
    'backend/shared/src/love/parse-photos.ts': {
      removePinnedUrlFromPhotoUrls: 0.787294304590133,
    },
    'backend/shared/src/love/supabase.ts': {
      getLover: 1.1769488661668834,
      getLovers: 0.6951249600035665,
      getGenderCompatibleLovers: 1.1769488661668834,
      getCompatibleLovers: 0.6951249600035665,
      getCompatibilityAnswers: 1.1769488661668834,
    },
    'backend/shared/src/mana-supply.ts': {
      recalculateAllUserPortfolios: 2.2457148786970125,
      getManaSupplyEachDayBetweeen: 1.326355383915488,
      getManaSupply: 2.7835057078261514,
    },
    'backend/shared/src/monitoring/context.ts': {
      STORE: 0.4517403658244698,
      withMonitoringContext: 0.9480278830066596,
      getMonitoringContext: 1.0779854876571688,
    },
    'backend/shared/src/monitoring/instance-info.ts': {
      getInstanceInfo: 0.8982859514788051,
    },
    'backend/shared/src/monitoring/log.ts': {
      toString: 0.6800170409810695,
      replacer: 0.6800170409810695,
      ts: 1.6227208303585599,
      writeLog: 0.6800170409810695,
      getLogger: 0.6800170409810695,
      log: 5.026629602626566,
    },
    'backend/shared/src/monitoring/metric-writer.ts': {
      METRICS_INTERVAL_MS: 0.569893691210498,
      serializeTimestamp: 0.569893691210498,
      serializeInterval: 0.569893691210498,
      serializeDistribution: 0.569893691210498,
      serializeValue: 0.569893691210498,
      serializeEntries: 0.569893691210498,
      MetricWriter: 0.569893691210498,
      write: 0.569893691210498,
      start: 0.569893691210498,
      stop: 0.569893691210498,
      METRIC_WRITER: 0.569893691210498,
    },
    'backend/shared/src/monitoring/metrics.ts': {
      CUSTOM_METRICS: 0.6497787816372464,
      MetricStore: 0.6497787816372464,
      clear: 0.6497787816372464,
      push: 0.6497787816372464,
      set: 0.6497787816372464,
      inc: 0.6497787816372464,
      freshEntries: 0.6497787816372464,
      clearDistributionGauges: 0.6497787816372464,
      getOrCreate: 0.6497787816372464,
      metrics: 0.6497787816372464,
    },
    'backend/shared/src/onboarding-helpers.ts': {
      sendOnboardingNotificationsInternal: 1.8202184040287623,
      sendOnboardingMarketVisitBonus: 1.8202184040287623,
    },
    'backend/shared/src/payout-leagues.ts': {
      sendEndOfSeasonNotificationsAndBonuses: 2.4342969204210347,
    },
    'backend/shared/src/record-contract-edit.ts': {
      recordContractEdit: 1.8964790312316049,
    },
    'backend/shared/src/resolve-market-helpers.ts': {
      resolveMarketHelper: 6.221117199264371,
      getDataAndPayoutInfo: 3.5755561143795354,
      undoUniqueBettorRewardsIfCancelResolution: 2.1117810403210506,
      payUsersTransactions: 3.5755561143795354,
    },
    'backend/shared/src/send-email.ts': {
      sendTextEmail: 1.5341153197594146,
      sendTemplateEmail: 3.2972523965691347,
    },
    'backend/shared/src/short-transaction.ts': {
      runShortTrans: 1.5132999954248458,
    },
    'backend/shared/src/supabase/answers.ts': {
      getAnswer: 2.667177258015371,
      getAnswersForContractsDirect: 1.0919912877807538,
      getAnswersForContract: 2.1299944801676416,
      insertAnswer: 1.3534950546338924,
      bulkInsertAnswers: 1.0919912877807538,
      updateAnswer: 1.6829508380012628,
      updateAnswers: 1.6829508380012628,
      bulkUpdateAnswers: 1.0919912877807538,
    },
    'backend/shared/src/supabase/bets.ts': {
      getBetsDirect: 0.8243549085202572,
      getBetsWithFilter: 1.730001341244487,
      getBetsRepliedToComment: 1.395754189141825,
      insertBet: 1.967153469763393,
      bulkInsertBets: 2.3014006218660548,
      cancelLimitOrders: 1.967153469763393,
    },
    'backend/shared/src/supabase/contract-comments.ts': {
      getCommentSafe: 1.2694739214746236,
      getComment: 1.9977704655811377,
      getCommentsDirect: 1.02420356658793,
    },
    'backend/shared/src/supabase/contracts.ts': {
      getContractIdFromSlug: 1.3571247073149737,
      getUniqueBettorIds: 1.543162142854661,
      getUniqueVoterIds: 1.0949196687096987,
      getContractsDirect: 1.991404616999623,
      getUniqueBettorIdsForAnswer: 1.0949196687096987,
      getContractFollowerIds: 0.6466771945647364,
      getContractLikerIds: 0.6466771945647364,
      getContractGroupMemberIds: 0.6466771945647364,
      isContractNonPredictive: 1.0949196687096987,
      getContractPrivacyWhereSQLFilter: 1.3571247073149737,
      getUsersWithAccessToContract: 0.6466771945647364,
      generateContractEmbeddings: 1.543162142854661,
      updateContract: 2.9640571683551356,
    },
    'backend/shared/src/supabase/dashboard.ts': {
      updateDashboardGroups: 1.2694739214746236,
    },
    'backend/shared/src/supabase/groups.ts': {
      getMemberGroupSlugs: 0.6835557485236222,
      getMemberTopics: 1.157360488368314,
      getGroupIdFromSlug: 1.157360488368314,
      addUserToTopic: 1.157360488368314,
    },
    'backend/shared/src/supabase/init.ts': {
      pgp: 0.7621430294858105,
      error: 0.7621430294858105,
      disconnect: 0.7621430294858105,
      transact: 0.7621430294858105,
      query: 2.127720019473168,
      getInstanceId: 0.7621430294858105,
      getInstanceHostname: 0.7621430294858105,
      createSupabaseClient: 3.7436640942610033,
      createSupabaseDirectClient: 5.051195233872303,
      SERIAL_MODE: 0.7621430294858105,
    },
    'backend/shared/src/supabase/leagues.ts': {
      getLeaguesForUser: 1.0816795243532458,
    },
    'backend/shared/src/supabase/likes.ts': {
      getRecentContractLikes: 0.9315391837470315,
    },
    'backend/shared/src/supabase/liquidity.ts': {
      insertLiquidity: 1.6533120891364963,
    },
    'backend/shared/src/supabase/notifications.ts': {
      insertNotificationToSupabase: 2.4849020505396795,
      bulkInsertNotifications: 1.7135161523187965,
    },
    'backend/shared/src/supabase/portfolio-metrics.ts': {
      getPortfolioHistory: 1.1677461661200754,
    },
    'backend/shared/src/supabase/private-message-channels.ts': {
      createPrivateUserMessageChannelMain: 2.0829849385630297,
    },
    'backend/shared/src/supabase/private-messages.ts': {
      leaveChatContent: 1.8336185201946338,
      joinChatContent: 1.0829646360620775,
      insertPrivateMessage: 1.8336185201946338,
      addUsersToPrivateMessageChannel: 2.2727228934328627,
      createPrivateUserMessageMain: 2.2727228934328627,
    },
    'backend/shared/src/supabase/reposts.ts': {
      getFollowedReposts: 2.1571335421339706,
      getTopicReposts: 2.1571335421339706,
    },
    'backend/shared/src/supabase/search-contracts.ts': {
      getForYouSQL: 2.9905342218895123,
      getSearchContractSQL: 2.4127441802858063,
      getSearchContractWhereSQL: 1.4250055801338435,
      sortFields: 1.4250055801338435,
      getSearchContractSortSQL: 1.4250055801338435,
      privateUserBlocksSql: 3.4004827804377693,
    },
    'backend/shared/src/supabase/sql-builder.ts': {
      buildSql: 0.5283269365693312,
      withClause: 0.8945352630662362,
      select: 2.5154702715179247,
      from: 2.1368301494083393,
      join: 1.9226120109558003,
      leftJoin: 1.1087534015187752,
      groupBy: 2.987139551283187,
      where: 2.905697594839972,
      orderBy: 2.6259391005423116,
      limit: 1.6891798664682196,
      renderSql: 2.249667099549364,
    },
    'backend/shared/src/supabase/users.ts': {
      getUserIdFromUsername: 1.3974049930176007,
      getUserFollowerIds: 0.8253298998823368,
      getWhenToIgnoreUsersTime: 0.8253298998823368,
      getMostlyActiveUserIds: 0.8253298998823368,
      updateUser: 3.827538520902689,
      updatePrivateUser: 3.2554634277674253,
      incrementBalance: 3.060364701234366,
      incrementStreak: 1.3974049930176007,
      bulkIncrementBalances: 2.431347728382182,
    },
    'backend/shared/src/supabase/utils.ts': {
      getIds: 1.301740014868861,
      insert: 2.458117768275955,
      bulkInsert: 2.9470841358499316,
      update: 1.301740014868861,
      bulkUpdate: 2.458117768275955,
      bulkUpsert: 2.1463845876537166,
      bulkUpdateData: 1.834651407031479,
      updateData: 2.612399142685624,
      FieldVal: 0.7688286227062427,
    },
    'backend/shared/src/supabase/vectors.ts': {
      userInterestEmbeddings: 0.35192185176923696,
      dotProduct: 0.7385475227737576,
      unitVectorCosineSimilarity: 0.35192185176923696,
      unitVectorCosineDistance: 0.35192185176923696,
    },
    'backend/shared/src/test/bets.ts': {
      getRandomTestBet: 1.6507008374581238,
    },
    'backend/shared/src/test/users.ts': {
      getTestUsers: 2.489643191383178,
    },
    'backend/shared/src/test-backend-function.ts': {
      testBackendFunction: 1.3285828392465402,
    },
    'backend/shared/src/tiptap.ts': {
      anythingToRichText: 1.7335826305357251,
    },
    'backend/shared/src/topic-interests.ts': {
      userIdsToAverageTopicConversionScores: 1.0964181287424493,
      activeTopics: 1.0964181287424493,
      buildUserInterestsCache: 3.0609356931500376,
      minimumContractsQualityBarWhereClauses: 1.8563972633950891,
      minimumTopicsQualityBarClauses: 1.0964181287424493,
    },
    'backend/shared/src/twitter.ts': {
      postTweet: 0.9394499349993053,
    },
    'backend/shared/src/txn/run-bounty-txn.ts': {
      runAddBountyTxn: 1.5879602193381828,
      runAwardBountyTxn: 1.5879602193381828,
      runCancelBountyTxn: 1.5879602193381828,
    },
    'backend/shared/src/txn/run-txn.ts': {
      runTxn: 4.274417238237286,
      runTxnFromBank: 4.011047367516043,
      insertTxn: 1.0038328628930961,
      insertTxns: 3.091244618896399,
    },
    'backend/shared/src/update-contract-metrics-core.ts': {
      updateContractMetricsCore: 4.071809929585213,
    },
    'backend/shared/src/update-creator-metrics-core.ts': {
      CREATOR_UPDATE_FREQUENCY: 1.6017262973046722,
      updateCreatorMetricsCore: 1.6017262973046722,
    },
    'backend/shared/src/update-group-contracts-internal.ts': {
      addGroupToContract: 3.111839096580544,
      removeGroupFromContract: 1.8872691758751061,
      canUserAddGroupToMarket: 2.339221498278843,
    },
    'backend/shared/src/update-group-metrics-core.ts': {
      updateGroupMetricsCore: 2.130472197603391,
    },
    'backend/shared/src/update-user-metrics-core.ts': {
      updateUserMetricsCore: 9.13602731985333,
    },
    'backend/shared/src/utils.ts': {
      logMemory: 1.2738155852700528,
      htmlToRichText: 2.1003411652918857,
      invokeFunction: 0.7523360047463716,
      revalidateStaticProps: 2.838254326841096,
      revalidateContractStaticProps: 2.621820745815567,
      LOCAL_DEV: 0.7523360047463716,
      isProd: 3.50856533673759,
      contractColumnsToSelect: 0.7523360047463716,
      getContract: 3.546189976748417,
      getContractSupabase: 2.4846536741980647,
      getContractFromSlugSupabase: 1.2738155852700528,
      getUser: 4.067669557272098,
      getUsers: 2.4053871647900382,
      getPrivateUser: 3.5276128352454266,
      getPrivateUserSupabase: 1.2738155852700528,
      getPrivateUserByKey: 1.2738155852700528,
      getPrivateUsersNotSent: 1.5788615847682048,
      getUserByUsername: 2.2163142718820628,
      checkAndMergePayouts: 1.2738155852700528,
      contractUrl: 2.926866745313719,
      getTrendingContractsToEmail: 0.7523360047463716,
      getBettingStreakResetTimeBeforeNow: 1.5788615847682048,
    },
    'backend/shared/src/websockets/helpers.ts': {
      broadcastUpdatedPrivateUser: 1.2964256451048133,
      broadcastUpdatedUser: 1.3870069694416824,
      broadcastNewBets: 0.8411924328052994,
      broadcastOrders: 1.04263633834597,
      broadcastNewComment: 0.8411924328052994,
      broadcastNewContract: 0.8411924328052994,
      broadcastNewSubsidy: 0.8411924328052994,
      broadcastUpdatedContract: 0.8411924328052994,
      broadcastNewAnswer: 0.8411924328052994,
      broadcastUpdatedAnswers: 1.2964256451048133,
      broadcastTVScheduleUpdate: 1.04263633834597,
      broadcastNewChartAnnotation: 0.8411924328052994,
    },
    'backend/shared/src/websockets/server.ts': {
      MessageParseError: 0.6984912022579842,
      serializeError: 0.6984912022579842,
      parseMessage: 0.6984912022579842,
      processMessage: 0.6984912022579842,
      broadcastMulti: 2.2332332389123515,
      broadcast: 2.4341766355672645,
      listen: 0.6984912022579842,
    },
    'backend/shared/src/websockets/switchboard.ts': {
      Switchboard: 0.635184087735273,
      getClient: 0.3751499544919713,
      getAll: 0.3751499544919713,
      getSubscribers: 0.3751499544919713,
      connect: 0.3751499544919713,
      disconnect: 0.3751499544919713,
      markSeen: 0.3751499544919713,
      identify: 0.3751499544919713,
      deidentify: 0.3751499544919713,
      subscribe: 0.3751499544919713,
      unsubscribe: 0.9789305140992774,
    },
    'backend/shared/src/weekly-markets-emails.ts': {
      sendWeeklyMarketsEmails: 1.1162943958231333,
      getForYouMarkets: 1.8900507089628058,
    },
    'backend/shared/src/weekly-portfolio-emails.ts': {
      sendPortfolioUpdateEmailsToAllUsers: 2.24894497215241,
    },
    'backend/shared/tsconfig.json': {},
    'backend/supabase/.gitignore': {},
    'backend/supabase/answers.sql': {},
    'backend/supabase/audit_events.sql': {},
    'backend/supabase/chart_annotations.sql': {},
    'backend/supabase/chat_messages.sql': {},
    'backend/supabase/config.toml': {},
    'backend/supabase/contract_bets.sql': {},
    'backend/supabase/contract_comment_edits.sql': {},
    'backend/supabase/contract_comments.sql': {},
    'backend/supabase/contract_edits.sql': {},
    'backend/supabase/contract_embeddings.sql': {},
    'backend/supabase/contract_follows.sql': {},
    'backend/supabase/contract_liquidity.sql': {},
    'backend/supabase/contracts.sql': {},
    'backend/supabase/creator_portfolio_history.sql': {},
    'backend/supabase/daily_stats.sql': {},
    'backend/supabase/dashboard_follows.sql': {},
    'backend/supabase/dashboard_groups.sql': {},
    'backend/supabase/dashboards.sql': {},
    'backend/supabase/discord_messages_markets.sql': {},
    'backend/supabase/discord_users.sql': {},
    'backend/supabase/functions.sql': {},
    'backend/supabase/gidx_receipts.sql': {},
    'backend/supabase/group_contracts.sql': {},
    'backend/supabase/group_embeddings.sql': {},
    'backend/supabase/group_invites.sql': {},
    'backend/supabase/group_members.sql': {},
    'backend/supabase/groups.sql': {},
    'backend/supabase/kyc_bonus_rewards.sql': {},
    'backend/supabase/league_chats.sql': {},
    'backend/supabase/leagues.sql': {},
    'backend/supabase/love_answers.sql': {},
    'backend/supabase/love_compatibility_answers.sql': {},
    'backend/supabase/love_likes.sql': {},
    'backend/supabase/love_questions.sql': {},
    'backend/supabase/love_ships.sql': {},
    'backend/supabase/love_stars.sql': {},
    'backend/supabase/love_waitlist.sql': {},
    'backend/supabase/lover_comments.sql': {},
    'backend/supabase/lovers.sql': {},
    'backend/supabase/makefile': {},
    'backend/supabase/mana_supply_stats.sql': {},
    'backend/supabase/manachan_tweets.sql': {},
    'backend/supabase/manalink_claims.sql': {},
    'backend/supabase/manalinks.sql': {},
    'backend/supabase/market_ads.sql': {},
    'backend/supabase/mod_reports.sql': {},
    'backend/supabase/news.sql': {},
    'backend/supabase/old_post_comments.sql': {},
    'backend/supabase/old_posts.sql': {},
    'backend/supabase/platform_calibration.sql': {},
    'backend/supabase/portfolios.sql': {},
    'backend/supabase/posts.sql': {},
    'backend/supabase/private_user_message_channel_members.sql': {},
    'backend/supabase/private_user_message_channels.sql': {},
    'backend/supabase/private_user_messages.sql': {},
    'backend/supabase/private_user_phone_numbers.sql': {},
    'backend/supabase/private_user_seen_message_channels.sql': {},
    'backend/supabase/private_users.sql': {},
    'backend/supabase/push_notification_tickets.sql': {},
    'backend/supabase/q_and_a.sql': {},
    'backend/supabase/q_and_a_answers.sql': {},
    'backend/supabase/reports.sql': {},
    'backend/supabase/reviews.sql': {},
    'backend/supabase/scheduler_info.sql': {},
    'backend/supabase/seed.sql': {},
    'backend/supabase/sent_emails.sql': {},
    'backend/supabase/stats.sql': {},
    'backend/supabase/topic_embeddings.sql': {},
    'backend/supabase/tv_schedule.sql': {},
    'backend/supabase/txn_summary_stats.sql': {},
    'backend/supabase/txns.sql': {},
    'backend/supabase/user_comment_view_events.sql': {},
    'backend/supabase/user_contract_interactions.sql': {},
    'backend/supabase/user_contract_metrics.sql': {},
    'backend/supabase/user_contract_views.sql': {},
    'backend/supabase/user_disinterests.sql': {},
    'backend/supabase/user_embeddings.sql': {},
    'backend/supabase/user_events.sql': {},
    'backend/supabase/user_follows.sql': {},
    'backend/supabase/user_monitor_status.sql': {},
    'backend/supabase/user_notifications.sql': {},
    'backend/supabase/user_portfolio_history.sql': {},
    'backend/supabase/user_portfolio_history_latest.sql': {},
    'backend/supabase/user_quest_metrics.sql': {},
    'backend/supabase/user_reactions.sql': {},
    'backend/supabase/user_seen_chats.sql': {},
    'backend/supabase/user_topic_interests.sql': {},
    'backend/supabase/user_topics.sql': {},
    'backend/supabase/user_view_events.sql': {},
    'backend/supabase/users.sql': {},
    'backend/supabase/views.sql': {},
    'backend/supabase/votes.sql': {},
    'backend/supabase/weekly_update.sql': {},
    'backend/supabase-grafana-agent/Dockerfile': {},
    'backend/supabase-grafana-agent/README.md': {},
    'backend/supabase-grafana-agent/agent.yaml': {},
    'backend/supabase-grafana-agent/fly.toml': {},
    'backend/supabase-grafana-agent/run.sh': {},
    'common/.eslintrc.js': {},
    'common/.gitignore': {},
    'common/.yarnrc': {},
    'common/jest.config.js': {},
    'common/knowledge.md': {},
    'common/package.json': {},
    'common/src/add-liquidity.ts': {
      getNewLiquidityProvision: 2.693101606568075,
    },
    'common/src/answer.ts': {
      MAX_ANSWER_LENGTH: 0.926819000236832,
      MAX_ANSWERS: 0.926819000236832,
      MAX_INDEPENDENT_ANSWERS: 0.926819000236832,
      getMaximumAnswers: 1.945033743268107,
      OTHER_TOOLTIP_TEXT: 0.926819000236832,
      getDefaultSort: 2.211662954043927,
      sortAnswers: 2.9632484862993826,
    },
    'common/src/antes.ts': {
      HOUSE_LIQUIDITY_PROVIDER_ID: 0.7414552001894655,
      DEV_HOUSE_LIQUIDITY_PROVIDER_ID: 0.7414552001894655,
      getCpmmInitialLiquidity: 1.934781309745807,
    },
    'common/src/api/love-types.ts': {},
    'common/src/api/market-search-types.ts': {
      FIRESTORE_DOC_REF_ID_REGEX: 1.0555433590397951,
      searchProps: 1.0555433590397951,
    },
    'common/src/api/market-types.ts': {
      toLiteMarket: 2.7464355287957387,
      toFullMarket: 1.782038786978651,
      augmentAnswerWithProbability: 1.052500814719077,
      createBinarySchema: 1.052500814719077,
      createNumericSchema: 1.052500814719077,
      createMultiSchema: 1.052500814719077,
      createMultiNumericSchema: 1.052500814719077,
      createBountySchema: 1.052500814719077,
      createPollSchema: 1.052500814719077,
      createMarketProps: 1.052500814719077,
      updateMarketProps: 1.052500814719077,
      resolveBinarySchema: 1.052500814719077,
      resolveMultiSchema: 1.052500814719077,
      resolvePseudoNumericSchema: 1.052500814719077,
      resolveMarketProps: 1.052500814719077,
    },
    'common/src/api/schema.ts': {
      DEFAULT_CACHE_STRATEGY: 4.936109568426959,
      API: 4.936109568426959,
    },
    'common/src/api/user-types.ts': {
      toUserAPIResponse: 1.8724832512943055,
    },
    'common/src/api/utils.ts': {
      APIError: 4.169998683721317,
      getCloudRunServiceUrl: 0.9862169912739092,
      pathWithPrefix: 0.9862169912739092,
      getWebsocketUrl: 0.9862169912739092,
      getApiUrl: 3.004923736826145,
    },
    'common/src/api/websocket-client.ts': {
      formatState: 0.8840243401039208,
      APIRealtimeClient: 2.1095422978827187,
      state: 0.8840243401039208,
      close: 1.8552243436238045,
      connect: 0.8840243401039208,
      waitAndReconnect: 0.8840243401039208,
      receiveMessage: 0.8840243401039208,
      sendMessage: 0.8840243401039208,
      identify: 0.8840243401039208,
      subscribe: 0.8840243401039208,
      unsubscribe: 2.3068066285817084,
    },
    'common/src/api/websockets.ts': {
      CLIENT_MESSAGE_SCHEMAS: 0.7561389068441858,
      CLIENT_MESSAGE_SCHEMA: 0.7561389068441858,
      SERVER_MESSAGE_SCHEMAS: 0.7561389068441858,
      SERVER_MESSAGE_SCHEMA: 0.7561389068441858,
    },
    'common/src/api/zod-types.ts': {
      contentSchema: 0.6232929555841729,
      DashboardQuestionItemSchema: 0.6232929555841729,
      DashboardLinkItemSchema: 0.6232929555841729,
      DashboardTextItemSchema: 0.6232929555841729,
      DashboardItemSchema: 0.6232929555841729,
    },
    'common/src/balance-change.ts': {
      BET_BALANCE_CHANGE_TYPES: 0.9895718990998081,
      isBetChange: 2.076727747971496,
      isTxnChange: 2.5822264305904516,
    },
    'common/src/bet.ts': {
      calculateMultiBets: 1.8720826139719378,
    },
    'common/src/bid.ts': {},
    'common/src/boost.ts': {
      AD_PERIOD: 0.42036558599934365,
      AD_WAIT_SECONDS: 0.42036558599934365,
      AD_RATE_LIMIT: 0.42036558599934365,
      DEFAULT_AD_COST_PER_VIEW: 0.42036558599934365,
      MIN_AD_COST_PER_VIEW: 0.42036558599934365,
      AD_REDEEM_REWARD: 0.42036558599934365,
    },
    'common/src/bounty.ts': {
      getAutoBountyPayoutPerHour: 1.402583778772164,
    },
    'common/src/calculate-cpmm-arbitrage.test.ts': {},
    'common/src/calculate-cpmm-arbitrage.ts': {
      calculateCpmmMultiArbitrageBet: 7.331486920286407,
      calculateCpmmMultiArbitrageYesBets: 6.8526891858631265,
      calculateCpmmMultiArbitrageBetsYes: 2.626116970712246,
      getBetResultsAndUpdatedAnswers: 2.626116970712246,
      combineBetsOnSameAnswers: 2.626116970712246,
      calculateCpmmMultiArbitrageBetYes: 2.626116970712246,
      calculateCpmmMultiArbitrageBetNo: 2.626116970712246,
      buyNoSharesUntilAnswersSumToOne: 4.446402544782064,
      calculateCpmmMultiArbitrageSellNo: 4.446402544782064,
      calculateCpmmMultiArbitrageSellYes: 4.446402544782064,
      calculateCpmmMultiArbitrageSellYesEqually: 6.2666881188518815,
      getSellAllRedemptionPreliminaryBets: 4.446402544782064,
      floatingArbitrageEqual: 2.626116970712246,
    },
    'common/src/calculate-cpmm.test.ts': {},
    'common/src/calculate-cpmm.ts': {
      getCpmmProbability: 6.392907503443354,
      getCpmmProbabilityAfterBetBeforeFees: 1.2676665700819698,
      getCpmmOutcomeProbabilityAfterBet: 3.3078972082971916,
      calculateCpmmShares: 3.0250255879667973,
      getCpmmFees: 1.2676665700819698,
      calculateCpmmSharesAfterFee: 1.2676665700819698,
      calculateCpmmPurchase: 3.539020150850189,
      calculateCpmmAmountToProb: 2.146346079024384,
      calculateCpmmAmountToProbIncludingFees: 2.146346079024384,
      calculateCpmmAmountToBuySharesFixedP: 1.2676665700819698,
      calculateAmountToBuySharesFixedP: 4.613111323365027,
      calculateCpmmMultiSumsToOneSale: 3.7344318144226136,
      calculateAmountToBuyShares: 1.2676665700819698,
      calculateCpmmAmountToBuyShares: 1.2676665700819698,
      calculateCpmmSale: 2.660340641907775,
      getCpmmProbabilityAfterSale: 1.2676665700819698,
      getCpmmLiquidity: 1.2676665700819698,
      getMultiCpmmLiquidity: 2.660340641907775,
      addCpmmLiquidity: 3.0250255879667973,
      addCpmmLiquidityFixedP: 2.146346079024384,
      addCpmmMultiLiquidityToAnswersIndependently: 2.146346079024384,
      addCpmmMultiLiquidityAnswersSumToOne: 2.660340641907775,
      getCpmmLiquidityPoolWeights: 3.3078972082971916,
      getLiquidity: 2.146346079024384,
      getUserLiquidityShares: 1.2676665700819698,
    },
    'common/src/calculate-fixed-payouts.ts': {
      calculateFixedPayout: 1.8246033845626175,
      calculateFixedCancelPayout: 0.8694332890429263,
      calculateStandardFixedPayout: 0.8694332890429263,
      calculateFixedMktPayout: 0.8694332890429263,
      calculateBetPayoutMulti: 0.8694332890429263,
      calculateFixedPayoutMulti: 1.8246033845626175,
    },
    'common/src/calculate-metrics.ts': {
      computeInvestmentValue: 2.3148299124722334,
      computeInvestmentValueCustomProb: 2.869172010719218,
      ELASTICITY_BET_AMOUNT: 1.367175836247555,
      computeElasticity: 2.3148299124722334,
      computeBinaryCpmmElasticity: 1.367175836247555,
      computeBinaryCpmmElasticityFromAnte: 2.3148299124722334,
      calculateNewPortfolioMetrics: 2.3148299124722334,
      calculateMetricsByContractAndAnswer: 2.3148299124722334,
      calculateUserMetrics: 3.8168260869438964,
    },
    'common/src/calculate.ts': {
      getProbability: 4.912524024570938,
      getDisplayProbability: 4.698496498669319,
      getInitialProbability: 2.97196342511982,
      getOutcomeProbability: 1.245430351570321,
      getAnswerProbability: 5.600086993115804,
      getInitialAnswerProbability: 2.97196342511982,
      getOutcomeProbabilityAfterBet: 1.245430351570321,
      calculateSharesBought: 1.245430351570321,
      calculatePayout: 2.1086968883450705,
      resolvedPayout: 1.245430351570321,
      getCpmmInvested: 1.245430351570321,
      getSimpleCpmmInvested: 2.1086968883450705,
      getInvested: 3.249873176683726,
      getCpmmOrDpmProfit: 1.245430351570321,
      getProfitMetrics: 2.6136754404857196,
      getCpmmShares: 1.245430351570321,
      getCpmmMultiShares: 1.245430351570321,
      getContractBetMetrics: 3.9819205294011186,
      getContractBetMetricsPerAnswer: 2.1086968883450705,
      getContractBetNullMetrics: 2.1086968883450705,
    },
    'common/src/can-send-mana.ts': {
      canSendMana: 2.8615801478265412,
    },
    'common/src/charity.ts': {
      charities: 6.181264358140333,
    },
    'common/src/chart-position.ts': {},
    'common/src/chart.ts': {
      unserializePoints: 1.0485760000000004,
      unserializeBase64Multi: 2.2005544792024523,
      serializeMultiPoints: 2.2005544792024523,
      maxMinBin: 2.7361939684685006,
      binAvg: 1.775393498002826,
    },
    'common/src/chat-message.ts': {
      convertPublicChatMessage: 1.4382331122744512,
    },
    'common/src/comment.ts': {
      MAX_COMMENT_LENGTH: 1.6052975978303843,
    },
    'common/src/contract-metric.ts': {},
    'common/src/contract-params.ts': {
      getContractParams: 3.755476873370326,
      getSingleBetPoints: 3.0298950950299326,
      getMultiBetPoints: 4.270285337901704,
      getFilledInMultiNumericBetPoints: 3.0298950950299326,
    },
    'common/src/contract-seo.ts': {
      getContractOGProps: 3.3248584677210093,
      getSeoDescription: 2.359086469843883,
      getResolvedValue: 1.3933144719667565,
    },
    'common/src/contract.ts': {
      NON_BETTING_OUTCOMES: 1.023450740449933,
      NO_CLOSE_TIME_TYPES: 1.023450740449933,
      RESOLUTIONS: 1.023450740449933,
      CREATEABLE_OUTCOME_TYPES: 1.023450740449933,
      CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES: 1.023450740449933,
      renderResolution: 2.4422547308196516,
      contractPathWithoutContract: 2.670631163638807,
      contractUrl: 3.9816038562443365,
      contractPool: 1.7328527356347923,
      isBinaryMulti: 4.089435154008526,
      getMainBinaryMCAnswer: 3.272201861059478,
      getBinaryMCProb: 3.272201861059478,
      getBinaryProbPercent: 1.023450740449933,
      tradingAllowed: 3.7950067239435796,
      MAX_QUESTION_LENGTH: 1.023450740449933,
      MAX_DESCRIPTION_LENGTH: 1.023450740449933,
      CPMM_MIN_POOL_QTY: 1.023450740449933,
      MULTI_NUMERIC_BUCKETS_MAX: 1.023450740449933,
      MULTI_NUMERIC_CREATION_ENABLED: 1.023450740449933,
      VISIBILITIES: 1.023450740449933,
      SORTS: 1.023450740449933,
      MINUTES_ALLOWED_TO_UNRESOLVE: 1.023450740449933,
      contractPath: 5.027213582012541,
      MAX_CPMM_PROB: 1.023450740449933,
      MIN_CPMM_PROB: 1.023450740449933,
      MAX_STONK_PROB: 1.023450740449933,
      MIN_STONK_PROB: 1.023450740449933,
      canCancelContract: 2.8572282959395645,
      isMarketRanked: 1.023450740449933,
      PROFIT_CUTOFF_TIME: 1.023450740449933,
      DPM_CUTOFF_TIMESTAMP: 1.023450740449933,
      getAdjustedProfit: 1.7328527356347923,
    },
    'common/src/dashboard.ts': {
      MAX_DASHBOARD_TITLE_LENGTH: 1.0808474011219165,
      convertDashboardSqltoTS: 2.8204041860433966,
    },
    'common/src/destiny-sub.ts': {
      DESTINY_SUB_COST: 0.6147821744715768,
    },
    'common/src/economy.ts': {
      FIXED_ANTE: 0.6033469137944584,
      getTieredAnswerCost: 1.439763338186805,
      MINIMUM_BOUNTY: 0.6033469137944584,
      MULTIPLE_CHOICE_MINIMUM_COST: 0.6033469137944584,
      getAnte: 1.5743963112053687,
      getTieredCost: 1.857971550382978,
      KYC_VERIFICATION_BONUS_CASH: 0.6033469137944584,
      BETTING_STREAK_SWEEPS_BONUS_AMOUNT: 0.6033469137944584,
      BETTING_STREAK_SWEEPS_BONUS_MAX: 0.6033469137944584,
      STARTING_BALANCE: 0.6033469137944584,
      SUS_STARTING_BALANCE: 0.6033469137944584,
      PHONE_VERIFICATION_BONUS: 0.6033469137944584,
      REFERRAL_AMOUNT: 0.6033469137944584,
      NEXT_DAY_BONUS: 0.6033469137944584,
      MARKET_VISIT_BONUS: 0.6033469137944584,
      MARKET_VISIT_BONUS_TOTAL: 0.6033469137944584,
      UNIQUE_BETTOR_BONUS_AMOUNT: 0.6033469137944584,
      SMALL_UNIQUE_BETTOR_BONUS_AMOUNT: 0.6033469137944584,
      UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT: 0.6033469137944584,
      UNIQUE_BETTOR_LIQUIDITY: 0.6033469137944584,
      SMALL_UNIQUE_BETTOR_LIQUIDITY: 0.6033469137944584,
      MAX_TRADERS_FOR_BIG_BONUS: 0.6033469137944584,
      MAX_TRADERS_FOR_BONUS: 0.6033469137944584,
      SUBSIDY_FEE: 0.6033469137944584,
      BETTING_STREAK_BONUS_AMOUNT: 0.6033469137944584,
      BETTING_STREAK_BONUS_MAX: 0.6033469137944584,
      BETTING_STREAK_RESET_HOUR: 0.6033469137944584,
      MANACHAN_TWEET_COST: 0.6033469137944584,
      PUSH_NOTIFICATION_BONUS: 0.6033469137944584,
      BURN_MANA_USER_ID: 0.6033469137944584,
      PaymentAmounts: 0.6033469137944584,
      PaymentAmountsGIDX: 0.6033469137944584,
      MANA_WEB_PRICES: 0.6033469137944584,
      IOS_PRICES: 0.6033469137944584,
      SWEEPIES_CASHOUT_FEE: 0.6033469137944584,
      MIN_CASHOUT_AMOUNT: 0.6033469137944584,
    },
    'common/src/edge/og.ts': {
      base64toPoints: 1.655971660909859,
    },
    'common/src/envs/constants.ts': {
      ENV: 0.5920564763462293,
      CONFIGS: 0.5920564763462293,
      TWOMBA_ENABLED: 0.5920564763462293,
      PRODUCT_MARKET_FIT_ENABLED: 0.5920564763462293,
      SPICE_PRODUCTION_ENABLED: 0.5920564763462293,
      SPICE_TO_MANA_CONVERSION_RATE: 0.5920564763462293,
      CASH_TO_MANA_CONVERSION_RATE: 0.5920564763462293,
      MIN_CASH_DONATION: 0.5920564763462293,
      MIN_SPICE_DONATION: 0.5920564763462293,
      CHARITY_FEE: 0.5920564763462293,
      CASH_TO_CHARITY_DOLLARS: 0.5920564763462293,
      SPICE_TO_CHARITY_DOLLARS: 0.5920564763462293,
      NY_FL_CASHOUT_LIMIT: 0.5920564763462293,
      SPICE_NAME: 0.5920564763462293,
      SWEEPIES_NAME: 0.5920564763462293,
      SPICE_MARKET_TOOLTIP: 0.5920564763462293,
      SWEEPIES_MARKET_TOOLTIP: 0.5920564763462293,
      CASH_SUFFIX: 0.5920564763462293,
      TRADE_TERM: 0.5920564763462293,
      TRADED_TERM: 0.5920564763462293,
      TRADING_TERM: 0.5920564763462293,
      TRADER_TERM: 0.5920564763462293,
      ENV_CONFIG: 0.5920564763462293,
      isAdminId: 2.9857711636675077,
      isModId: 2.66218642270602,
      DOMAIN: 0.5920564763462293,
      LOVE_DOMAIN: 0.5920564763462293,
      LOVE_DOMAIN_ALTERNATE: 0.5920564763462293,
      FIREBASE_CONFIG: 0.5920564763462293,
      PROJECT_ID: 0.5920564763462293,
      IS_PRIVATE_MANIFOLD: 0.5920564763462293,
      AUTH_COOKIE_NAME: 0.5920564763462293,
      CORS_ORIGIN_MANIFOLD: 0.5920564763462293,
      CORS_ORIGIN_MANIFOLD_LOVE: 0.5920564763462293,
      CORS_ORIGIN_MANIFOLD_LOVE_ALTERNATE: 0.5920564763462293,
      CORS_ORIGIN_CHARITY: 0.5920564763462293,
      CORS_ORIGIN_VERCEL: 0.5920564763462293,
      CORS_ORIGIN_LOCALHOST: 0.5920564763462293,
      BOT_USERNAMES: 0.5920564763462293,
      MOD_IDS: 0.5920564763462293,
      MVP: 0.5920564763462293,
      VERIFIED_USERNAMES: 0.5920564763462293,
      BANNED_TRADING_USER_IDS: 0.5920564763462293,
      PARTNER_USER_IDS: 0.5920564763462293,
      NEW_USER_HERLPER_IDS: 0.5920564763462293,
      OPTED_OUT_OF_LEAGUES: 0.5920564763462293,
      HIDE_FROM_LEADERBOARD_USER_IDS: 0.5920564763462293,
      HOUSE_BOT_USERNAME: 0.5920564763462293,
      supabaseUserConsolePath: 1.002438753657874,
      supabasePrivateUserConsolePath: 1.002438753657874,
      supabaseConsoleContractPath: 1.002438753657874,
      GOOGLE_PLAY_APP_URL: 0.5920564763462293,
      APPLE_APP_URL: 0.5920564763462293,
      TEN_YEARS_SECS: 0.5920564763462293,
      DESTINY_GROUP_SLUG: 0.5920564763462293,
      PROD_MANIFOLD_LOVE_GROUP_SLUG: 0.5920564763462293,
      RATING_GROUP_SLUGS: 0.5920564763462293,
      GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL: 0.5920564763462293,
      HIDE_FROM_NEW_USER_SLUGS: 0.5920564763462293,
      GROUP_SLUGS_TO_NOT_INTRODUCE_IN_FEED: 0.5920564763462293,
      EXTERNAL_REDIRECTS: 0.5920564763462293,
      DISCORD_INVITE_LINK: 0.5920564763462293,
      DISCORD_BOT_INVITE_LINK: 0.5920564763462293,
      YES_GRAPH_COLOR: 0.5920564763462293,
      RESERVED_PATHS: 0.5920564763462293,
      MANA_PURCHASE_RATE_CHANGE_DATE: 0.5920564763462293,
    },
    'common/src/envs/dev.ts': {
      DEV_CONFIG: 0.9610357783828033,
    },
    'common/src/envs/prod.ts': {
      PROD_CONFIG: 1.5623430524896642,
    },
    'common/src/events.ts': {},
    'common/src/feed.ts': {
      VIEW_RECORDINGS_START: 0.4647316411792326,
      FEED_CARD_HITS: 0.4647316411792326,
      FEED_CARD_MISSES: 0.4647316411792326,
      FEED_BETA_LOSS: 0.4647316411792326,
      GROUP_SCORE_PRIOR: 0.4647316411792326,
      FOLLOWED_TOPIC_CONVERSION_PRIOR: 0.4647316411792326,
    },
    'common/src/fees.ts': {
      FEE_START_TIME: 0.6053956358657813,
      getTakerFee: 1.9993706023739808,
      getFeesSplit: 1.5797423242503192,
      FLAT_TRADE_FEE: 0.6053956358657813,
      FLAT_COMMENT_FEE: 0.6053956358657813,
      DPM_PLATFORM_FEE: 0.6053956358657813,
      DPM_CREATOR_FEE: 0.6053956358657813,
      DPM_FEES: 0.6053956358657813,
      noFees: 0.6053956358657813,
      getFeeTotal: 2.38794614392624,
      sumAllFees: 1.0250239139894428,
    },
    'common/src/firebase-auth.ts': {
      setFirebaseUserViaJson: 4.353257946928066,
    },
    'common/src/follow.ts': {},
    'common/src/gidx/document.ts': {
      getDocumentsStatus: 2.4504337615538785,
    },
    'common/src/gidx/gidx.ts': {
      GIDX_DOCUMENTS_REQUIRED: 1.3653186800772659,
      GPSProps: 1.3653186800772659,
      verificationParams: 1.3653186800772659,
      checkoutParams: 1.3653186800772659,
      cashoutParams: 1.3653186800772659,
      idNameToCategoryType: 1.3653186800772659,
      ID_ERROR_MSG: 1.3653186800772659,
      IDENTITY_AND_FRAUD_THRESHOLD: 1.3653186800772659,
      ENABLE_FAKE_CUSTOMER: 1.3653186800772659,
      exampleCustomers: 1.3653186800772659,
      FAKE_CUSTOMER_BODY: 1.3653186800772659,
      ProcessSessionCode: 2.8652745599582734,
    },
    'common/src/group-invite.ts': {},
    'common/src/group-member.ts': {},
    'common/src/group.ts': {
      MAX_GROUP_NAME_LENGTH: 0.6553600000000003,
      MAX_ID_LENGTH: 0.6553600000000003,
      MAX_GROUPS_PER_MARKET: 0.6553600000000003,
      GroupAboutSchema: 0.6553600000000003,
      GroupNameSchema: 0.6553600000000003,
      groupPath: 1.829607485753299,
      TOPIC_KEY: 0.6553600000000003,
      DEFAULT_TOPIC: 0.6553600000000003,
      SearchGroupParams: 1.375346549501533,
      MySearchGroupShape: 0.6553600000000003,
      SearchGroupShape: 0.6553600000000003,
    },
    'common/src/iap.ts': {},
    'common/src/leagues.ts': {
      SEASONS: 0.9360413069859689,
      CURRENT_SEASON: 0.9360413069859689,
      LEAGUES_START: 0.9360413069859689,
      getSeasonMonth: 1.5848556998109395,
      getSeasonDates: 2.757493586184966,
      getSeasonCountdownEnd: 1.5848556998109395,
      getSeasonStatus: 1.5848556998109395,
      DIVISION_NAMES: 0.9360413069859689,
      SECRET_NEXT_DIVISION: 0.9360413069859689,
      getDivisionNumber: 0.9360413069859689,
      getDemotionAndPromotionCount: 0.9360413069859689,
      getDemotionAndPromotionCountBySeason: 1.5848556998109395,
      getDivisionChange: 1.5848556998109395,
      getMaxDivisionBySeason: 1.5848556998109395,
      MAX_COHORT_SIZE: 0.9360413069859689,
      getCohortSize: 1.5848556998109395,
      prizesByDivisionAndRank: 0.9360413069859689,
      getLeaguePrize: 1.5848556998109395,
      getLeaguePath: 2.4425416740535537,
      parseLeaguePath: 1.9643877895417128,
      IS_BIDDING_PERIOD: 0.9360413069859689,
      MIN_LEAGUE_BID: 0.9360413069859689,
      MIN_BID_INCREASE_FACTOR: 0.9360413069859689,
    },
    'common/src/like.ts': {
      LIKE_TIP_AMOUNT: 0.47860727371544776,
      TIP_UNDO_DURATION: 0.47860727371544776,
    },
    'common/src/link-preview.ts': {
      fetchLinkPreview: 1.756802477865702,
      fetchLinkPreviews: 2.4760091117099146,
    },
    'common/src/liquidity-provision.ts': {},
    'common/src/loans.ts': {
      LOAN_DAILY_RATE: 1.1183445249989832,
      getUserLoanUpdates: 2.346971563127566,
      overLeveraged: 1.8935218793966797,
      isUserEligibleForLoan: 2.6686992337943765,
    },
    'common/src/love/compatibility-score.ts': {
      getCompatibilityScore: 1.7455528265640334,
      getAnswerCompatibilityImportanceScore: 1.030951618740408,
      getAnswerCompatibility: 1.030951618740408,
      getScoredAnswerCompatibility: 1.030951618740408,
      getLoversCompatibilityFactor: 1.030951618740408,
    },
    'common/src/love/compatibility-util.ts': {
      areGenderCompatible: 1.2128246509493166,
      areAgeCompatible: 1.2128246509493166,
      areLocationCompatible: 1.2128246509493166,
      areRelationshipStyleCompatible: 1.2128246509493166,
      areWantKidsCompatible: 1.2128246509493166,
    },
    'common/src/love/constants.ts': {
      MIN_BET_AMOUNT_FOR_NEW_MATCH: 0.2297314913834149,
      MAX_COMPATIBILITY_QUESTION_LENGTH: 0.2297314913834149,
      LIKE_COST: 0.2297314913834149,
      LOVE_MARKET_COST: 0.2297314913834149,
    },
    'common/src/love/love-comment.ts': {},
    'common/src/love/lover.ts': {
      getLoverRow: 1.1608687858474842,
    },
    'common/src/love/multiple-choice.ts': {
      MultipleChoiceOptions: 0.4689374431149641,
      MultipleChoiceColors: 0.4689374431149641,
    },
    'common/src/love/og-image.ts': {
      getLoveOgImageUrl: 1.646744184421268,
    },
    'common/src/mod-report.ts': {},
    'common/src/multi-numeric.ts': {
      getMultiNumericAnswerMidpoints: 1.4074652097139504,
      getPrecision: 1.9836587935031635,
      getDecimalPlaces: 0.8312716259247371,
      getMultiNumericAnswerBucketRanges: 1.7445168493867733,
      getMultiNumericAnswerBucketRangeNames: 2.1691516962187465,
      answerToRange: 1.7445168493867733,
      answerTextToRange: 1.9836587935031635,
      answerTextToMidpoint: 1.4074652097139504,
      answerToMidpoint: 0.8312716259247371,
      getExpectedValue: 2.74534528000796,
      getFormattedExpectedValue: 1.7445168493867733,
      formatExpectedValue: 2.82457392814108,
      getAnswerContainingValue: 1.4074652097139504,
      getRangeContainingValue: 1.4074652097139504,
      getRangeContainingValues: 1.7445168493867733,
      getExpectedValuesArray: 1.7445168493867733,
      NEW_GRAPH_COLOR: 0.8312716259247371,
    },
    'common/src/native-message.ts': {
      IS_NATIVE_KEY: 1.1625330285521644,
      PLATFORM_KEY: 1.1625330285521644,
    },
    'common/src/native-share-data.ts': {},
    'common/src/new-bet.ts': {
      computeFills: 10.61401213369023,
      computeCpmmBet: 6.124578099015052,
      getBinaryCpmmBetInfo: 4.345571237741164,
      getNewMultiCpmmBetInfo: 4.345571237741164,
      getNewMultiCpmmBetsInfo: 4.345571237741164,
      getBetDownToOneMultiBetInfo: 4.345571237741164,
    },
    'common/src/new-contract.ts': {
      NEW_MARKET_IMPORTANCE_SCORE: 1.9441119362012063,
      getNewContract: 4.079937199858203,
      VERSUS_COLORS: 1.9441119362012063,
      createAnswers: 1.9441119362012063,
      DEFAULT_CONVERSION_SCORE_NUMERATOR: 1.9441119362012063,
      DEFAULT_CONVERSION_SCORE_DENOMINATOR: 1.9441119362012063,
    },
    'common/src/news.ts': {},
    'common/src/notification.ts': {
      NOTIFICATION_DESCRIPTIONS: 2.3858464583801986,
      getSourceIdForLinkComponent: 2.3858464583801986,
      getSourceUrl: 10.500581185670859,
      ReactionNotificationTypes: 2.3858464583801986,
      BalanceChangeNotificationTypes: 2.3858464583801986,
    },
    'common/src/numeric-constants.ts': {
      NUMERIC_GRAPH_COLOR: 0.21403967971071788,
      NUMERIC_TEXT_COLOR: 0.21403967971071788,
    },
    'common/src/partner.ts': {
      PARTNER_UNIQUE_TRADER_BONUS: 0.32861489490978874,
      PARTNER_UNIQUE_TRADER_BONUS_MULTI: 0.32861489490978874,
      PARTNER_UNIQUE_TRADER_THRESHOLD: 0.32861489490978874,
      PARTNER_QUARTER_START_DATE: 0.32861489490978874,
      getPartnerQuarterEndDate: 0.689635256697062,
      PARTNER_RETAINED_REFERRAL_BONUS: 0.32861489490978874,
    },
    'common/src/payouts-fixed.ts': {
      getFixedCancelPayouts: 2.885197339670745,
      getStandardFixedPayouts: 2.047133757098605,
      getMultiFixedPayouts: 2.047133757098605,
      getIndependentMultiYesNoPayouts: 2.047133757098605,
      getLiquidityPoolPayouts: 1.2090701745264647,
      getIndependentMultiLiquidityPoolPayouts: 1.2090701745264647,
      getMultiLiquidityPoolPayouts: 1.2090701745264647,
      getMktFixedPayouts: 2.047133757098605,
      getIndependentMultiMktPayouts: 2.047133757098605,
      getLiquidityPoolProbPayouts: 1.2090701745264647,
    },
    'common/src/payouts.ts': {
      getLoanPayouts: 2.8230921332641485,
      groupPayoutsByUser: 2.8230921332641485,
      getPayouts: 2.8230921332641485,
      getFixedPayouts: 1.3452185277423645,
      getIndependentMultiFixedPayouts: 1.3452185277423645,
    },
    'common/src/period.ts': {
      PERIODS: 0.5861718038937052,
      periodDurations: 0.5861718038937052,
      getCutoff: 1.2301473509220828,
    },
    'common/src/poll-option.ts': {},
    'common/src/portfolio-metrics.ts': {},
    'common/src/pseudo-numeric.ts': {
      formatNumericProbability: 1.8411159689592027,
      getMappedValue: 2.7015990654764184,
      getFormattedMappedValue: 3.831435724061297,
      getPseudoProbability: 2.0934999183119443,
    },
    'common/src/push-ticket.ts': {
      convertPushTicket: 1.4382331122744512,
    },
    'common/src/quest.ts': {
      QUEST_TYPES: 0.8594965822573121,
      QUEST_DETAILS: 0.8594965822573121,
      QUEST_SCORE_IDS: 0.8594965822573121,
    },
    'common/src/reaction.ts': {},
    'common/src/reason-codes.ts': {
      timeoutCodes: 0.663177691957744,
      identityErrorCodes: 0.663177691957744,
      hasIdentityError: 1.1228574393485062,
      otherErrorCodes: 0.663177691957744,
      locationTemporarilyBlockedCodes: 0.663177691957744,
      locationBlockedCodes: 0.663177691957744,
      underageErrorCodes: 0.663177691957744,
      identityBlockedCodes: 0.663177691957744,
      blockedCodes: 0.663177691957744,
      allowedFlaggedCodes: 0.663177691957744,
      allowedCodes: 0.663177691957744,
      limitTo5kCashoutCodes: 0.663177691957744,
      uploadedDocsToVerifyIdentity: 1.1228574393485062,
      documentsReadyCodes: 0.663177691957744,
    },
    'common/src/redeem.ts': {
      getBinaryRedeemableAmount: 2.0177615924508197,
      getRedemptionBets: 2.0177615924508197,
    },
    'common/src/report.ts': {},
    'common/src/repost.ts': {},
    'common/src/secrets.ts': {
      secrets: 1.2626527077051715,
      getSecrets: 2.137856872077392,
      loadSecretsToEnv: 4.0369842697151,
      getServiceAccountCredentials: 4.400226817454576,
    },
    'common/src/sell-bet.ts': {
      getCpmmSellBetInfo: 3.2373559260446036,
      getCpmmMultiSellBetInfo: 3.2373559260446036,
      getCpmmMultiSellSharesInfo: 3.2373559260446036,
      getNewSellBetInfo: 4.012619226016066,
    },
    'common/src/stats.ts': {},
    'common/src/stonk.ts': {
      STONK_YES: 0.6353950942712734,
      STONK_NO: 0.6353950942712734,
      STONK_INITIAL_PROB: 0.6353950942712734,
      getStonkPriceMax: 0.6353950942712734,
      getStonkPriceAtProb: 1.6580240483661002,
      getStonkDisplayShares: 2.0315008117229794,
      getSharesFromStonkShares: 1.3334479529971264,
    },
    'common/src/supabase/analytics.ts': {},
    'common/src/supabase/answers.ts': {
      getAnswerBettorCount: 0.9724230673041507,
    },
    'common/src/supabase/bets.ts': {
      NON_POINTS_BETS_LIMIT: 0.40157403477708414,
      convertBet: 1.1830010246469036,
    },
    'common/src/supabase/bounties.ts': {
      getBountyRewardCount: 0.9394499349993053,
    },
    'common/src/supabase/chart-annotations.ts': {
      getChartAnnotations: 1.004314225369843,
    },
    'common/src/supabase/comments.ts': {
      getRecentTopLevelCommentsAndReplies: 1.4640269838600937,
      convertContractComment: 2.7645695001735766,
      getPinnedComments: 1.4640269838600937,
    },
    'common/src/supabase/contract-metrics.ts': {
      getTopContractMetrics: 2.3319900759612437,
      getRanking: 1.6546166669708606,
      getUserContractMetrics: 1.6546166669708606,
      getCPMMContractUserContractMetrics: 1.6546166669708606,
      fetchOutcomeMetrics: 0.9772432579804774,
      getUserContractMetricsWithContracts: 2.0508547102158894,
      getUserContractMetricsByProfitWithContracts: 2.0508547102158894,
      getBestAndWorstUserContractMetrics: 0.9772432579804774,
      getUsersContractMetricsOrderedByProfit: 2.0508547102158894,
      getContractMetricsForContractIds: 0.9772432579804774,
      getContractMetricsCount: 2.728228119206273,
      convertContractMetricRows: 2.0508547102158894,
      getOrderedContractMetricRowsForContractId: 2.0508547102158894,
    },
    'common/src/supabase/contracts.ts': {
      CONTRACTS_PER_SEARCH_PAGE: 0.7633748507262211,
      getContractFromSlug: 1.9919792768837237,
      getContract: 3.5982223728076868,
      getContracts: 2.440680834462242,
      contractFields: 0.7633748507262211,
      getUnresolvedContractsCount: 1.2925059762174704,
      getRecentContractIds: 1.6020278425942314,
      getAnswersForContracts: 1.8216371017087198,
      convertAnswer: 1.9919792768837237,
      convertContract: 3.1229989221470382,
      followContract: 0.7633748507262211,
    },
    'common/src/supabase/dashboard-follows.ts': {
      getUserFollowsDashboard: 1.35651288458917,
    },
    'common/src/supabase/dashboards.ts': {
      getDashboardsToDisplayOnContract: 1.2802544582349125,
    },
    'common/src/supabase/group-invites.ts': {
      getInvite: 0.5136952313057229,
    },
    'common/src/supabase/groups.ts': {
      UNRANKED_GROUP_ID: 0.6097826181462853,
      UNSUBSIDIZED_GROUP_ID: 0.6097826181462853,
      PROD_MANIFOLD_LOVE_GROUP_ID: 0.6097826181462853,
      TOPIC_IDS_YOU_CANT_FOLLOW: 0.6097826181462853,
      getGroup: 1.2796972958580077,
      userCanAccess: 0.6097826181462853,
      getGroupMemberIds: 0.6097826181462853,
      convertGroup: 2.0138589846568027,
      convertTopic: 0.6097826181462853,
      getTopicsOnContract: 1.0324517206688448,
    },
    'common/src/supabase/is-admin.ts': {
      getIsAdmin: 0.3632373815194687,
    },
    'common/src/supabase/leagues.ts': {
      convertLeague: 0.3923412135993874,
    },
    'common/src/supabase/liquidity.ts': {
      convertLiquidity: 0.7939801096690913,
    },
    'common/src/supabase/portfolio-metrics.ts': {
      getPortfolioHistory: 1.6170706875725958,
      getCurrentPortfolio: 1.6170706875725958,
      convertPortfolioHistory: 1.6170706875725958,
    },
    'common/src/supabase/private-messages.ts': {
      convertChatMessage: 0.5277716795198976,
      convertPrivateChatMessage: 0.5277716795198976,
    },
    'common/src/supabase/referrals.ts': {
      getReferralCount: 1.6785341643348275,
      getTopReferrals: 1.1909701645036368,
      getUserReferralsInfo: 1.1909701645036368,
    },
    'common/src/supabase/schema.ts': {},
    'common/src/supabase/set-scores.ts': {
      setQuestScoreValue: 2.2025936567233737,
      setQuestScoreValueOnUsers: 1.771412185327799,
      getQuestScores: 1.429164197404364,
      getQuestScore: 1.771412185327799,
    },
    'common/src/supabase/txns.ts': {
      convertTxn: 1.655971660909859,
    },
    'common/src/supabase/users.ts': {
      getUserForStaticProps: 1.598284213261487,
      getUserAndPrivateUserForStaticProps: 0.66977663749388,
      convertUser: 2.06253800114529,
      convertPrivateUser: 1.7477405507391615,
    },
    'common/src/supabase/utils.ts': {
      createClient: 2.3923231651730825,
      run: 5.328589428151479,
      selectJson: 2.700799685066849,
      selectFrom: 1.9240000955663317,
      millisToTs: 3.7080034262253805,
      tsToMillis: 3.6632727815838875,
      convertSQLtoTS: 3.194949711977137,
      convertObjectToSQLRow: 0.9167963544077996,
    },
    'common/src/tier.ts': {
      tiers: 0.9451736335552323,
      getTierFromLiquidity: 3.121516352470527,
    },
    'common/src/topics.ts': {
      TOPICS_TO_SUBTOPICS: 1.6412810509023743,
      GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW: 1.6412810509023743,
      getSubtopics: 3.444412582581832,
      ALL_TOPICS: 1.6412810509023743,
    },
    'common/src/tracking.ts': {},
    'common/src/txn.ts': {},
    'common/src/user-notification-preferences.ts': {
      getDefaultNotificationPreferences: 4.81387546173251,
      notificationReasonToSubscriptionType: 1.6340876734737517,
      getNotificationPreference: 2.7667509371298435,
      getNotificationDestinationsForUser: 7.925566410482686,
      userOptedOutOfBrowserNotifications: 5.224545271152442,
      userIsBlocked: 4.561979735969189,
    },
    'common/src/user.ts': {
      BETTOR: 0.7397983149897779,
      BETTORS: 0.7397983149897779,
      SINGULAR_BET: 0.7397983149897779,
      PLURAL_BETS: 0.7397983149897779,
      PAST_BET: 0.7397983149897779,
      MANIFOLD_USER_USERNAME: 0.7397983149897779,
      MANIFOLD_USER_NAME: 0.7397983149897779,
      MANIFOLD_AVATAR_URL: 0.7397983149897779,
      MANIFOLD_LOVE_LOGO: 0.7397983149897779,
      getCurrentUtcTime: 0.7397983149897779,
      MINUTES_ALLOWED_TO_REFER: 0.7397983149897779,
      isUserLikelySpammer: 1.9304577706891912,
      humanish: 2.918089310367332,
      identityPending: 1.5525498349735087,
      blockFromSweepstakes: 1.7653765474261038,
      locationBlocked: 1.7653765474261038,
      ageBlocked: 1.7653765474261038,
      identityBlocked: 1.5525498349735087,
      GIDX_DISABLED_MESSAGE: 0.7397983149897779,
      PHONE_NOT_VERIFIED_MESSAGE: 0.7397983149897779,
      IDENTIFICATION_FAILED_MESSAGE: 0.7397983149897779,
      LOCATION_BLOCKED_MESSAGE: 0.7397983149897779,
      USER_BLOCKED_MESSAGE: 0.7397983149897779,
      USER_NOT_REGISTERED_MESSAGE: 0.7397983149897779,
      USER_VERIFIED_MESSSAGE: 0.7397983149897779,
      PROMPT_VERIFICATION_MESSAGES: 0.7397983149897779,
      getVerificationStatus: 2.0653389511916718,
    },
    'common/src/util/adjective-animal.ts': {
      getRandomAdjectiveAnimal: 1.4642566968135067,
      genNewAdjectiveAnimal: 3.0729070976973993,
      toLabel: 2.479202097825808,
    },
    'common/src/util/algos.ts': {
      binarySearch: 2.7015990654764184,
    },
    'common/src/util/api.ts': {
      unauthedApi: 2.5541910536997943,
      formatApiUrlWithParams: 1.6230487881361606,
      appendQuery: 0.773391443908028,
      baseApiCall: 1.309465542722063,
    },
    'common/src/util/array.ts': {
      filterDefined: 2.8439163062415043,
      buildArray: 2.93391292740275,
      groupConsecutive: 0.9884972648180268,
    },
    'common/src/util/assert.ts': {},
    'common/src/util/clean-username.ts': {
      cleanUsername: 1.2356042721823302,
      cleanDisplayName: 1.2916113976033907,
    },
    'common/src/util/color.ts': {
      interpolateColor: 1.4154642905881132,
      toArray: 0.5931641601515725,
    },
    'common/src/util/format.ts': {
      SWEEPIES_MONIKER: 0.6339483078683615,
      formatWithToken: 2.8505533599089676,
      formatMoney: 3.559696150128436,
      formatSweepies: 2.259993612799144,
      formatSweepiesNumber: 1.7698311914926006,
      formatSpice: 1.5127872723077675,
      formatMoneyNoMoniker: 1.5127872723077675,
      formatMoneyShort: 0.6339483078683615,
      formatMoneyUSD: 2.3916262367471735,
      formatSweepsToUSD: 1.0733677900880645,
      formatMoneyNumber: 1.8675547541258486,
      getMoneyNumber: 0.6339483078683615,
      getMoneyNumberToDecimal: 1.0733677900880645,
      formatMoneyWithDecimals: 1.7698311914926006,
      formatMoneyToDecimal: 1.0733677900880645,
      formatWithCommas: 1.6542487490751479,
      formatShares: 1.7698311914926006,
      manaToUSD: 0.6339483078683615,
      formatPercentShort: 1.9522067545274704,
      getPercent: 1.8675547541258486,
      getPercentDecimalPlaces: 0.6339483078683615,
      formatPercent: 3.174390399711218,
      formatPercentNumber: 0.6339483078683615,
      formatLargeNumber: 2.3069742363455514,
      shortFormatNumber: 2.3916262367471735,
      maybePluralize: 2.093668231294851,
      toCamelCase: 0.6339483078683615,
      formatOutcomeLabel: 1.6542487490751479,
    },
    'common/src/util/json.ts': {
      safeJsonParse: 1.0237900373766469,
    },
    'common/src/util/math.ts': {
      logInterpolation: 0.4559689169803017,
      logit: 1.3432434601860304,
      median: 0.7720224862081696,
      average: 1.5493346275503599,
      sumOfSquaredError: 0.7720224862081696,
      EPSILON: 0.4559689169803017,
      floatingEqual: 2.191688689750413,
      floatingGreater: 0.7720224862081696,
      floatingGreaterEqual: 1.0880760554360376,
      floatingLesserEqual: 1.1898225788599162,
    },
    'common/src/util/matrix.ts': {
      factorizeMatrix: 1.2047221043312524,
      fillMatrix: 1.2047221043312524,
    },
    'common/src/util/object.ts': {
      removeUndefinedProps: 4.24900411476075,
      removeNullOrUndefinedProps: 2.087631734998817,
      addObjects: 2.605955776561758,
      subtractObjects: 0.7477835243363801,
      hasChanges: 1.7844316074622624,
      hasSignificantDeepChanges: 1.2661075658993213,
    },
    'common/src/util/og.ts': {
      buildOgUrl: 1.4732619435878624,
      pointsToBase64: 1.2956513955761784,
    },
    'common/src/util/parse.ts': {
      getUrl: 1.10017111211678,
      beginsWith: 1.3636337360597173,
      wordIn: 0.6497787816372463,
      searchInAny: 1.6955573874994694,
      parseMentions: 1.3636337360597173,
      skippableComponent: 0.6497787816372463,
      extensions: 0.6497787816372463,
      richTextToString: 2.5630127541252334,
      parseJsonContentToText: 1.9141899074659603,
    },
    'common/src/util/promise.ts': {
      delay: 0.8229818726497058,
      withRetries: 1.963877002007881,
      mapAsyncChunked: 0.8229818726497058,
      mapAsync: 2.631257869937826,
    },
    'common/src/util/random.ts': {
      randomString: 2.7211536858362564,
      randomStringRegex: 0.6390540142851332,
      genHash: 0.6390540142851332,
      createRNG: 1.0820125025123883,
      shuffle: 1.6675717729688297,
      secureRandomString: 1.0820125025123883,
    },
    'common/src/util/share.ts': {
      getShareUrl: 1.6608019556496592,
      getTopicShareUrl: 0.8514488104006389,
      referralQuery: 1.3122325287879362,
    },
    'common/src/util/slugify.ts': {
      slugify: 1.4154642905881132,
    },
    'common/src/util/string.ts': {
      removeEmojis: 1.4616757900832413,
    },
    'common/src/util/time.ts': {
      MINUTE_MS: 0.22105923065258132,
      HOUR_MS: 0.22105923065258132,
      DAY_MS: 0.22105923065258132,
      WEEK_MS: 0.22105923065258132,
      MONTH_MS: 0.22105923065258132,
      YEAR_MS: 0.22105923065258132,
      HOUR_SECONDS: 0.22105923065258132,
      sleep: 0.3742858131161687,
    },
    'common/src/util/tiptap-iframe.ts': {
      addOptions: 0.9339588988292225,
      addAttributes: 0.9339588988292225,
      parseHTML: 0.9339588988292225,
      renderHTML: 1.9600176221939418,
      addCommands: 0.9339588988292225,
    },
    'common/src/util/tiptap-spoiler.ts': {
      TiptapSpoiler: 0.7188674878270127,
      addOptions: 0.7188674878270127,
      addCommands: 0.7188674878270127,
      addInputRules: 0.7188674878270127,
      addPasteRules: 0.7188674878270127,
      parseHTML: 0.7188674878270127,
      renderHTML: 1.5086241438777415,
    },
    'common/src/util/tiptap-tweet.ts': {
      TiptapTweet: 0.5387681038562548,
      addAttributes: 0.5387681038562548,
      parseHTML: 0.5387681038562548,
      renderHTML: 1.1306653634951527,
    },
    'common/src/util/types.ts': {
      assertUnreachable: 0.8667913152678626,
    },
    'common/src/weekly-portfolio-update.ts': {},
    'common/tsconfig.json': {},
    'dev.sh': {},
    'docs/.gitattributes': {},
    'docs/.gitignore': {},
    'docs/.prettierignore': {},
    'docs/.prettierrc': {},
    'docs/README.md': {},
    'docs/babel.config.js': {},
    'docs/docs/api.md': {},
    'docs/docs/faq.md': {},
    'docs/docs/index.md': {},
    'docs/docs/privacy-policy.md': {},
    'docs/docs/rules.md': {},
    'docs/docs/sweepstakes.md': {},
    'docs/docs/terms-and-conditions.md': {},
    'docs/docusaurus.config.js': {},
    'docs/package.json': {},
    'docs/sidebars.js': {},
    'docs/src/components/HomepageFeatures/index.tsx': {
      Feature: 0.8104165260273251,
      HomepageFeatures: 0.8104165260273251,
    },
    'docs/src/components/HomepageFeatures/styles.module.css': {},
    'docs/src/css/custom.css': {},
    'docs/src/pages/markdown-page.md': {},
    'docs/static/.nojekyll': {},
    'docs/static/img/docusaurus.png': {},
    'docs/static/img/favicon.ico': {},
    'docs/static/img/logo.svg': {},
    'docs/static/img/tutorial/docsVersionDropdown.png': {},
    'docs/static/img/tutorial/localeDropdown.png': {},
    'docs/static/img/undraw_docusaurus_mountain.svg': {},
    'docs/static/img/undraw_docusaurus_react.svg': {},
    'docs/static/img/undraw_docusaurus_tree.svg': {},
    'docs/tsconfig.json': {},
    'docs/yarn.lock': {},
    'firebase.json': {},
    'knowledge.md': {},
    'manifold-info.knowledge.md': {},
    'native/.expo-shared/assets.json': {},
    'native/.gitignore': {},
    'native/App.tsx': {},
    'native/README.md': {},
    'native/Supporting/Expo.plist': {},
    'native/android/.gitignore': {},
    'native/android/app/build.gradle': {},
    'native/android/app/debug.keystore': {},
    'native/android/app/proguard-rules.pro': {},
    'native/android/app/src/debug/AndroidManifest.xml': {},
    'native/android/app/src/main/AndroidManifest.xml': {},
    'native/android/app/src/main/java/com/markets/manifold/MainActivity.kt': {},
    'native/android/app/src/main/java/com/markets/manifold/MainApplication.kt':
      {},
    'native/android/app/src/main/res/drawable/rn_edit_text_material.xml': {},
    'native/android/app/src/main/res/drawable/splashscreen.xml': {},
    'native/android/app/src/main/res/drawable-hdpi/notification_icon.png': {},
    'native/android/app/src/main/res/drawable-hdpi/splashscreen_image.png': {},
    'native/android/app/src/main/res/drawable-mdpi/notification_icon.png': {},
    'native/android/app/src/main/res/drawable-mdpi/splashscreen_image.png': {},
    'native/android/app/src/main/res/drawable-xhdpi/notification_icon.png': {},
    'native/android/app/src/main/res/drawable-xhdpi/splashscreen_image.png': {},
    'native/android/app/src/main/res/drawable-xxhdpi/notification_icon.png': {},
    'native/android/app/src/main/res/drawable-xxhdpi/splashscreen_image.png':
      {},
    'native/android/app/src/main/res/drawable-xxxhdpi/notification_icon.png':
      {},
    'native/android/app/src/main/res/drawable-xxxhdpi/splashscreen_image.png':
      {},
    'native/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml': {},
    'native/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml':
      {},
    'native/android/app/src/main/res/mipmap-hdpi/ic_launcher.png': {},
    'native/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png':
      {},
    'native/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png': {},
    'native/android/app/src/main/res/mipmap-mdpi/ic_launcher.png': {},
    'native/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png':
      {},
    'native/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png': {},
    'native/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png': {},
    'native/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png':
      {},
    'native/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png': {},
    'native/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png': {},
    'native/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png':
      {},
    'native/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png': {},
    'native/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png': {},
    'native/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png':
      {},
    'native/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png': {},
    'native/android/app/src/main/res/values/colors.xml': {},
    'native/android/app/src/main/res/values/strings.xml': {},
    'native/android/app/src/main/res/values/styles.xml': {},
    'native/android/app/src/main/res/values-night/colors.xml': {},
    'native/android/build.gradle': {},
    'native/android/gradle/wrapper/gradle-wrapper.jar': {},
    'native/android/gradle/wrapper/gradle-wrapper.properties': {},
    'native/android/gradle.properties': {},
    'native/android/gradlew': {},
    'native/android/gradlew.bat': {},
    'native/android/react-settings-plugin/build.gradle.kts': {},
    'native/android/react-settings-plugin/src/main/kotlin/expo/plugins/ReactSettingsPlugin.kt':
      {},
    'native/android/sentry.properties': {},
    'native/android/settings.gradle': {},
    'native/app.config.js': {},
    'native/app.json': {},
    'native/assets/adaptive-icon.png': {},
    'native/assets/favicon.png': {},
    'native/assets/logo-96.png': {},
    'native/assets/logo.png': {},
    'native/assets/splash.png': {},
    'native/assets/square-google.png': {},
    'native/babel.config.js': {},
    'native/components/auth-page.tsx': {
      AuthPage: 2.0418084113478105,
      triggerLoginWithApple: 2.0418084113478105,
      useAppleAuthentication: 2.0418084113478105,
      checkAvailability: 2.0418084113478105,
      Eula: 2.0418084113478105,
    },
    'native/components/custom-webview.tsx': {
      CustomWebview: 2.6475246225619893,
    },
    'native/components/ios-iap-listener.tsx': {
      IosIapListener: 2.2320757297547065,
    },
    'native/components/logger.tsx': {
      log: 8.87987102101303,
      ExportLogsButton: 1.201294722978504,
    },
    'native/components/splash-auth.tsx': {
      SplashAuth: 1.2295643489431536,
    },
    'native/components/splash.tsx': {
      Splash: 1.157596560271324,
    },
    'native/components/text.tsx': {
      Text: 0.6935678316877163,
    },
    'native/configs/prod/GoogleService-Info.plist': {},
    'native/eas.json': {},
    'native/envscript.sh': {},
    'native/index.js': {},
    'native/init.ts': {
      ENV: 0.8513376129362548,
      app: 0.8513376129362548,
      auth: 0.8513376129362548,
    },
    'native/ios/.gitignore': {},
    'native/ios/.xcode.env': {},
    'native/ios/Manifold/AppDelegate.h': {},
    'native/ios/Manifold/AppDelegate.mm': {},
    'native/ios/Manifold/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png':
      {},
    'native/ios/Manifold/Images.xcassets/AppIcon.appiconset/Contents.json': {},
    'native/ios/Manifold/Images.xcassets/Contents.json': {},
    'native/ios/Manifold/Images.xcassets/SplashScreen.imageset/Contents.json':
      {},
    'native/ios/Manifold/Images.xcassets/SplashScreen.imageset/image.png': {},
    'native/ios/Manifold/Images.xcassets/SplashScreenBackground.imageset/Contents.json':
      {},
    'native/ios/Manifold/Images.xcassets/SplashScreenBackground.imageset/image.png':
      {},
    'native/ios/Manifold/Info.plist': {},
    'native/ios/Manifold/Manifold-Bridging-Header.h': {},
    'native/ios/Manifold/Manifold.entitlements': {},
    'native/ios/Manifold/PrivacyInfo.xcprivacy': {},
    'native/ios/Manifold/SplashScreen.storyboard': {},
    'native/ios/Manifold/Supporting/Expo.plist': {},
    'native/ios/Manifold/main.m': {},
    'native/ios/Manifold/noop-file.swift': {},
    'native/ios/Manifold.xcodeproj/xcshareddata/xcschemes/Manifold.xcscheme':
      {},
    'native/ios/Manifold.xcworkspace/contents.xcworkspacedata': {},
    'native/ios/Manifold.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist': {},
    'native/ios/Podfile': {},
    'native/ios/Podfile.lock': {},
    'native/ios/Podfile.properties.json': {},
    'native/ios/sentry.properties': {},
    'native/lib/auth.ts': {
      storeData: 1.0643110130007989,
      clearData: 1.0643110130007989,
      getData: 0.628599229423645,
    },
    'native/lib/location.ts': {
      getLocation: 1.4720785220279906,
    },
    'native/lib/use-is-connected.ts': {
      useIsConnected: 1.3315451235021194,
    },
    'native/metro.config.js': {},
    'native/package.json': {},
    'native/plugins/withAndroidVerifiedLinksWorkaround.js': {
      removeExpoSchemaFromVerifiedIntentFilters: 1.0616022882748513,
      activityHasSingleTaskLaunchMode: 1.0616022882748513,
      intentFilterHasAutoVerification: 1.0616022882748513,
      intentFilterRemoveSchemeFromData: 1.0616022882748513,
    },
    'native/screenshots/iphone-11-pro-max/IMG_0007.PNG': {},
    'native/screenshots/iphone-11-pro-max/IMG_0008.PNG': {},
    'native/screenshots/iphone-11-pro-max/IMG_0009.PNG': {},
    'native/screenshots/iphone-11-pro-max/IMG_0010.PNG': {},
    'native/screenshots/iphone-11-pro-max/IMG_0011.PNG': {},
    'native/screenshots/iphone-11-pro-max/IMG_0012.PNG': {},
    'native/screenshots/iphone-11-pro-max/IMG_0013.PNG': {},
    'native/screenshots/iphone-11-pro-max/IMG_0014.PNG': {},
    'native/screenshots/iphone-15-pro-max/IMG_0010.PNG': {},
    'native/screenshots/iphone-15-pro-max/IMG_0011.PNG': {},
    'native/screenshots/iphone-15-pro-max/IMG_0012.PNG': {},
    'native/screenshots/iphone-15-pro-max/IMG_0014.PNG': {},
    'native/screenshots/iphone-15-pro-max/IMG_0015.PNG': {},
    'native/screenshots/iphone-15-pro-max/IMG_0016.PNG': {},
    'native/screenshots/iphone-15-pro-max/IMG_0017.PNG': {},
    'native/screenshots/iphone-15-pro-max/IMG_0018.PNG': {},
    'native/sentry.properties': {},
    'native/tsconfig.json': {},
    'native/yarn.lock': {},
    'package.json': {},
    'private-storage.rules': {},
    'storage.rules': {},
    'twitch-bot/.dockerignore': {},
    'twitch-bot/.eslintrc.cjs': {},
    'twitch-bot/.gitattributes': {},
    'twitch-bot/.gitignore': {},
    'twitch-bot/.prettierrc': {},
    'twitch-bot/.vscode/settings.json': {},
    'twitch-bot/Dockerfile': {},
    'twitch-bot/README.md': {},
    'twitch-bot/common/exceptions.ts': {
      UserNotRegisteredException: 1.1296689051154196,
      InsufficientBalanceException: 0.9085240292956537,
      ForbiddenException: 0.7329914663032692,
      ResourceNotFoundException: 0.9085240292956537,
      TradingClosedException: 0.7329914663032692,
    },
    'twitch-bot/common/outcome.ts': {
      getOutcomeForString: 1.489782425044534,
      test_getOutcomeForString: 0.7098893078482966,
    },
    'twitch-bot/common/package.json': {},
    'twitch-bot/common/packets.ts': {
      Packet: 0.5067482946382129,
      PacketResolved: 0.5067482946382129,
      getName: 0.5067482946382129,
      PacketRequestResolve: 0.5067482946382129,
      PacketAddBets: 0.5067482946382129,
      PacketClear: 0.5067482946382129,
      PacketCreateMarket: 0.5067482946382129,
      PacketMarketCreated: 0.5067482946382129,
      PacketUserInfo: 0.5067482946382129,
      PacketHandshakeComplete: 0.5067482946382129,
      PacketSelectMarket: 0.5067482946382129,
      PacketSelectMarketID: 0.5067482946382129,
      PacketUnfeature: 0.5067482946382129,
      PacketPing: 0.5067482946382129,
      PacketPong: 0.5067482946382129,
      PacketGroups: 0.5067482946382129,
      PacketRequestGroups: 0.5067482946382129,
      PacketRequestContractsInGroup: 0.5067482946382129,
      PacketContractsInGroup: 0.5067482946382129,
      PacketGroupControlFields: 0.5067482946382129,
    },
    'twitch-bot/common/socket-wrapper.ts': {
      SocketWrapper: 1.507569450913917,
      emit: 0.5777372374833194,
      on: 0.5777372374833194,
      off: 0.5777372374833194,
      once: 0.5777372374833194,
    },
    'twitch-bot/common/tsconfig.json': {},
    'twitch-bot/common/types/manifold-abstract-types.ts': {
      abstractMarketFromFullMarket: 1.1293509145611742,
    },
    'twitch-bot/common/types/manifold-api-types.ts': {},
    'twitch-bot/common/types/manifold-internal-types.ts': {},
    'twitch-bot/common/types/metric-types.ts': {
      getCurrentEpochDay: 1.6423990187910715,
    },
    'twitch-bot/cspell.json': {},
    'twitch-bot/docs/OBS.png': {},
    'twitch-bot/package.json': {},
    'twitch-bot/scripts/Dockerfile': {},
    'twitch-bot/scripts/build-docker.sh': {},
    'twitch-bot/scripts/deploy-to-remote.sh': {},
    'twitch-bot/scripts/gcloud.mjs': {},
    'twitch-bot/scripts/launch-docker.sh': {},
    'twitch-bot/server/build.mjs': {},
    'twitch-bot/server/package.json': {},
    'twitch-bot/server/src/api.ts': {
      registerAPIEndpoints: 3.0545024693625806,
    },
    'twitch-bot/server/src/app.ts': {
      App: 1.5324021809561872,
      getDisplayNameForUserID: 0.9050614137687677,
      getStreamByName: 0.9050614137687677,
      getUserForTwitchUsername: 0.9050614137687677,
      s2: 0.9050614137687677,
      launch: 0.9050614137687677,
    },
    'twitch-bot/server/src/clients/dock.ts': {
      DockClient: 1.4089064626636816,
      init: 1.4089064626636816,
      registerPacketHandlers: 0.8321228531342079,
    },
    'twitch-bot/server/src/clients/overlay.ts': {
      OverlayClient: 0.9840229574298653,
      init: 0.9840229574298653,
    },
    'twitch-bot/server/src/envs.ts': {
      PORT: 0.3047091212414738,
      PUBLIC_FACING_URL: 0.3047091212414738,
      TWITCH_BOT_CLIENT_ID: 0.3047091212414738,
      TWITCH_BOT_CLIENT_SECRET: 0.3047091212414738,
      TWITCH_BOT_USERNAME: 0.3047091212414738,
      TWITCH_BOT_OAUTH_TOKEN: 0.3047091212414738,
      TWITCH_BOT_FIREBASE_KEY: 0.3047091212414738,
      TARGET: 0.3047091212414738,
      DEBUG_TWITCH_ACCOUNT: 0.3047091212414738,
      IS_DEV: 0.3047091212414738,
      MANIFOLD_URLS: 0.3047091212414738,
      MANIFOLD_DB_LOCATION: 0.3047091212414738,
      MANIFOLD_API_BASE_URL: 0.3047091212414738,
      MANIFOLD_SIGNUP_URL: 0.3047091212414738,
      MANIFOLD_FIREBASE_CONFIG: 0.3047091212414738,
      GOOGLE_PROJECT_ID: 0.3047091212414738,
      GOOGLE_LOG_NAME: 0.3047091212414738,
    },
    'twitch-bot/server/src/firestore.ts': {
      AppFirestore: 1.004314225369843,
      updateMetricsData: 0.5931641601515725,
      getMetricData: 0.5931641601515725,
      loadUsers: 1.004314225369843,
      updateSelectedMarketForUser: 0.5931641601515725,
      updateUserMetricsInfo: 0.5931641601515725,
      getUserForTwitchUsername: 0.5931641601515725,
      getUserForManifoldID: 0.5931641601515725,
      getUserForManifoldAPIKey: 0.5931641601515725,
      getUserForControlToken: 0.5931641601515725,
      addNewUser: 0.5931641601515725,
      updateUser: 2.750849899564658,
      getRegisteredTwitchChannels: 0.5931641601515725,
      registerTwitchChannel: 0.5931641601515725,
      unregisterTwitchChannel: 0.5931641601515725,
    },
    'twitch-bot/server/src/google-logger.ts': {
      GoogleLogger: 0.6100347507260677,
      getLogger: 0.6100347507260677,
      updateAccessToken: 0.6100347507260677,
      addEntryToQueue: 0.6100347507260677,
      flushEntryQueue: 0.6100347507260677,
      log: 4.50932631365621,
      info: 0.6100347507260677,
      debug: 0.6100347507260677,
      warning: 0.6100347507260677,
      error: 0.6100347507260677,
      critical: 0.6100347507260677,
    },
    'twitch-bot/server/src/index.ts': {},
    'twitch-bot/server/src/logger.ts': {
      levelToColor: 0.7846824271987748,
      init: 1.3285828392465402,
      formatDate: 0.7846824271987748,
      getTimestamp: 0.7846824271987748,
      log: 5.8003074621890685,
      info: 0.7846824271987748,
      debug: 0.7846824271987748,
      warn: 0.7846824271987748,
      error: 0.7846824271987748,
      trace: 0.7846824271987748,
      crash: 0.7846824271987748,
      flush: 0.7846824271987748,
    },
    'twitch-bot/server/src/manifold-api.ts': {
      post: 0.7066170344107581,
      get: 1.6861962446856518,
      getUserByID: 0.7066170344107581,
      getUserByManifoldUsername: 0.7066170344107581,
      getUsersStakeInMarket_shares: 0.7066170344107581,
      sellShares: 0.7066170344107581,
      createBinaryMarket: 0.7066170344107581,
      resolveBinaryMarket: 0.7066170344107581,
      placeBet: 1.196406639548205,
      verifyAPIKey: 0.7066170344107581,
      getLatestMarketBets: 0.7066170344107581,
      getMarketBySlug: 0.7066170344107581,
      getFullMarketByID: 0.7066170344107581,
      getLiteMarketByID: 0.7066170344107581,
      getGroupBySlug: 0.7066170344107581,
      saveTwitchDetails: 0.7066170344107581,
    },
    'twitch-bot/server/src/manifold-firestore.ts': {
      ManifoldFirestore: 1.2346791054224202,
      validateConnection: 0.7292213692929495,
      load: 1.7401368415518907,
      initialLoadAllUsers: 0.7292213692929495,
      loadGroups: 0.7292213692929495,
      getGroupsForUserID: 0.7292213692929495,
      getContractsInGroup: 0.7292213692929495,
      getManifoldUserByManifoldID: 0.7292213692929495,
      getFullMarketByID: 0.7292213692929495,
    },
    'twitch-bot/server/src/market.ts': {
      Market: 0.8021867908499645,
      loadFromManifoldID: 0.8021867908499645,
      isBetValid: 0.8021867908499645,
      onNewBet: 0.8021867908499645,
      resolve: 3.026320840290298,
      getUsersExpectedPayout: 0.8021867908499645,
      calculateFixedPayout: 1.68347905708497,
      calculateFixedCancelPayout: 0.8021867908499645,
      calculateStandardFixedPayout: 0.8021867908499645,
      getProbability: 3.1641768464010367,
      getCpmmProbability: 4.0454691126360425,
      calculateFixedMktPayout: 0.8021867908499645,
      resolvedPayout: 0.8021867908499645,
      calculateWinners: 0.8021867908499645,
      addBet: 0.8021867908499645,
      betToFullBet: 0.8021867908499645,
      unfeature: 0.8021867908499645,
    },
    'twitch-bot/server/src/metrics.ts': {
      UnknownMetricsEventException: 0.7795704351452493,
      Metrics: 1.3199274843140685,
      load: 1.860284533482888,
      suggestPushDataToDB: 0.7795704351452493,
      logMetricsEvent: 0.7795704351452493,
      setUserUniqueEventFlag: 0.7795704351452493,
      hasUserHadUniqueEventToday: 0.7795704351452493,
      logUnqiueMetricsEvent: 0.7795704351452493,
    },
    'twitch-bot/server/src/stream.ts': {
      TwitchStream: 1.154493416138011,
      broadcastToDocks: 0.6818624094783097,
      broadcastToOverlays: 0.6818624094783097,
      broadcastToDocksAndOverlays: 0.6818624094783097,
      selectMarket: 0.6818624094783097,
      unfeatureCurrentMarket: 0.6818624094783097,
      marketResolved: 0.6818624094783097,
      onNewBet: 0.6818624094783097,
      updateGroupControlFields: 0.6818624094783097,
      updateGroupsInDocks: 0.6818624094783097,
      dockDisconnected: 0.6818624094783097,
      overlayDisconnected: 0.6818624094783097,
    },
    'twitch-bot/server/src/twitch-api.ts': {
      getTwitchDetailsFromLinkCode: 0.8475538902120938,
      sanitizeTwitchChannelName: 1.4350334795852202,
    },
    'twitch-bot/server/src/twitch-bot.ts': {
      TwitchBot: 2.0108689739691212,
      addMessageToQueue: 1.1876516094153735,
      handleMessages: 1.1876516094153735,
      isAllowedAdminCommand: 1.1876516094153735,
      onMarketResolved: 1.1876516094153735,
      onMarketFeatured: 1.1876516094153735,
      connect: 1.1876516094153735,
      isInChannel: 1.1876516094153735,
      joinChannel: 1.1876516094153735,
      leaveChannel: 1.1876516094153735,
      TwitchBotInitializationException: 1.1876516094153735,
    },
    'twitch-bot/server/src/user.ts': {
      User: 1.0879832532955207,
      getBalance: 0.5184298496536549,
      allIn: 0.5184298496536549,
      sellAllShares: 0.5184298496536549,
      createBinaryMarket: 0.5184298496536549,
      resolveBinaryMarket: 0.5184298496536549,
      placeBet: 0.8777780382592022,
    },
    'twitch-bot/server/src/utils.ts': {
      getParamsFromURL: 1.2828734576331888,
      buildURL: 0.9102370659701245,
      getDomainFromURL: 0.9102370659701245,
      detectGCloudInstance: 0.9102370659701245,
      ts: 1.2828734576331888,
      te: 1.2828734576331888,
    },
    'twitch-bot/server/tsconfig.json': {},
    'twitch-bot/web/.eslintrc.cjs': {},
    'twitch-bot/web/components/additional-controls-dropdown.tsx': {
      AdditionalControlsDropdown: 1.079575067071559,
    },
    'twitch-bot/web/components/avatar.tsx': {
      Avatar: 0.9221111604067992,
      EmptyAvatar: 0.9221111604067992,
    },
    'twitch-bot/web/components/chart.tsx': {
      Point: 2.8154562136458865,
      Chart: 1.7075187897339246,
      resize: 1.7075187897339246,
      produceData: 1.0084881038925548,
      render: 1.0084881038925548,
    },
    'twitch-bot/web/components/confirmation-button.tsx': {
      ConfirmationButton: 0.9437184000000003,
      updateOpen: 0.9437184000000003,
      ResolveConfirmationButton: 0.9437184000000003,
    },
    'twitch-bot/web/components/contract-card.tsx': {
      ContractCard: 0.7561389068441858,
      MiscDetails: 0.7561389068441858,
      NewContractBadge: 0.7561389068441858,
      AvatarDetails: 0.7561389068441858,
      ProbBar: 0.7561389068441858,
      BinaryResolutionOrChance: 0.7561389068441858,
      BinaryContractOutcomeLabel: 0.7561389068441858,
      BinaryOutcomeLabel: 0.7561389068441858,
      YesLabel: 0.7561389068441858,
      HigherLabel: 0.7561389068441858,
      LowerLabel: 0.7561389068441858,
      NoLabel: 0.7561389068441858,
      CancelLabel: 0.7561389068441858,
      ProbLabel: 0.7561389068441858,
    },
    'twitch-bot/web/components/group-selector.tsx': {
      fetchGroups: 1.391093262468682,
      GroupSelector: 1.391093262468682,
    },
    'twitch-bot/web/components/info-tooltip.tsx': {
      InfoTooltip: 0.4689374431149641,
    },
    'twitch-bot/web/components/layout/col.tsx': {
      Col: 0.41095618504457837,
    },
    'twitch-bot/web/components/layout/modal.tsx': {
      Modal: 0.7313018909795374,
    },
    'twitch-bot/web/components/layout/row.tsx': {
      Row: 0.3934605916618092,
    },
    'twitch-bot/web/components/loading-overlay.tsx': {
      LoadingOverlay: 0.6114196214089308,
    },
    'twitch-bot/web/components/modal-group-control.tsx': {
      Chip: 1.1788904518694114,
      ControlURL: 1.1788904518694114,
      ModalGroupControl: 1.1788904518694114,
      getBlankField: 1.1788904518694114,
    },
    'twitch-bot/web/components/spinner.tsx': {
      Spinner: 0.3632373815194687,
    },
    'twitch-bot/web/components/title.tsx': {
      Title: 0.3632373815194687,
    },
    'twitch-bot/web/lib/animation.ts': {
      cosine: 0.3780694534220929,
      lerp: 0.3780694534220929,
      quartic: 0.6401272291174562,
      AnimationTimer: 0.6401272291174562,
      getTime_s: 0.3780694534220929,
      reset: 0.3780694534220929,
    },
    'twitch-bot/web/lib/connection-state.ts': {},
    'twitch-bot/web/lib/selected-group.ts': {},
    'twitch-bot/web/lib/utils.ts': {
      formatMoney: 2.513388736522416,
      DAY_MS: 0.44761082669269264,
      CONTRACT_ANTE: 0.44761082669269264,
      DPM_CREATOR_FEE: 0.44761082669269264,
      getTextWidth: 0.44761082669269264,
      getCssStyle: 0.44761082669269264,
      getCanvasFont: 0.44761082669269264,
      randomInt: 0.44761082669269264,
    },
    'twitch-bot/web/next-env.d.ts': {},
    'twitch-bot/web/next.config.js': {
      rewrites: 0.7642745267611636,
    },
    'twitch-bot/web/package.json': {},
    'twitch-bot/web/pages/_app.tsx': {
      MyApp: 0.663177691957744,
    },
    'twitch-bot/web/pages/_document.tsx': {
      Document: 0.7111788444385564,
    },
    'twitch-bot/web/pages/dock.tsx': {
      getMarketDisplayability: 2.845064618391615,
      fetchMarketsInGroup: 1.6803409951937645,
      fetchMarketById: 1.6803409951937645,
      getUserBalance: 1.6803409951937645,
      UpdatedPopup: 1.6803409951937645,
      ResolutionPanel: 1.6803409951937645,
      ResolveConfirmationButton: 1.6803409951937645,
      YesNoCancelSelector: 1.6803409951937645,
      Button: 1.6803409951937645,
    },
    'twitch-bot/web/pages/metrics.tsx': {
      Canvas: 1.1445477569548,
      KeyItem: 1.1445477569548,
      CanvasDonut: 1.1445477569548,
      Tooltip: 2.401961987712864,
      LineGraphEntry: 1.1445477569548,
      LineGraph: 1.1445477569548,
      gradient: 1.1445477569548,
      CanvasChart: 1.1445477569548,
      Panel: 1.1445477569548,
      getPercentageChange: 1.1445477569548,
      PanelRaw: 1.1445477569548,
      DarkModeSwitch: 1.1445477569548,
      MetricsPage: 1.1445477569548,
    },
    'twitch-bot/web/pages/overlay.tsx': {
      BetElement: 1.4878452240031605,
      Application: 1.4878452240031605,
      registerPacketHandlers: 1.4878452240031605,
      resetUI: 1.4878452240031605,
      loadMarket: 1.4878452240031605,
      loadBettingHistory: 1.4878452240031605,
      addBet: 1.4878452240031605,
    },
    'twitch-bot/web/postcss.config.js': {},
    'twitch-bot/web/public/logo-white.svg': {},
    'twitch-bot/web/public/logo.svg': {},
    'twitch-bot/web/public/service-worker.js': {},
    'twitch-bot/web/styles/global.scss': {},
    'twitch-bot/web/styles/overlay.module.scss': {},
    'twitch-bot/web/tailwind.config.js': {},
    'twitch-bot/web/tsconfig.json': {},
    'twitch-bot/yarn.lock': {},
    'web/.eslintrc.js': {},
    'web/.gitignore': {},
    'web/.prettierignore': {},
    'web/README.md': {},
    'web/components/LogoSEO.tsx': {
      LogoSEO: 0.82897211494718,
    },
    'web/components/NoSEO.tsx': {
      NoSEO: 0.5861718038937052,
    },
    'web/components/SEO.tsx': {
      SEO: 1.4238063645425951,
    },
    'web/components/SuperBanControl.tsx': {
      handleSuperBan: 1.411688643201468,
    },
    'web/components/about-manifold.tsx': {
      AboutManifold: 0.9982146125317947,
    },
    'web/components/activity-log.tsx': {
      ActivityLog: 3.622902159398734,
    },
    'web/components/ad/claim-ad-button.tsx': {
      ClaimButton: 1.195560586548754,
    },
    'web/components/add-funds-modal.tsx': {
      AddFundsModal: 1.9470553321882431,
      BuyManaTab: 1.9470553321882431,
      PriceTile: 1.9470553321882431,
      SpiceToManaForm: 1.9470553321882431,
      use24hrUsdPurchases: 4.086114246847015,
    },
    'web/components/annotate-chart.tsx': {
      AnnotateChartModal: 2.1457411170297322,
      ReadChartAnnotationModal: 2.1457411170297322,
    },
    'web/components/answers/answer-bet-panel.tsx': {
      AnswerCpmmBetPanel: 1.0273904626114458,
    },
    'web/components/answers/answer-components.tsx': {
      AnswerBar: 1.431840178481745,
      CreatorAndAnswerLabel: 1.431840178481745,
      AnswerLabel: 1.431840178481745,
      AddComment: 1.431840178481745,
      MultiBettor: 1.431840178481745,
      MultiSeller: 1.431840178481745,
      BinaryMultiSellRow: 1.431840178481745,
      OpenProb: 1.431840178481745,
      ClosedProb: 1.431840178481745,
      AnswerStatus: 1.431840178481745,
      BetButtons: 1.431840178481745,
      AnswerPosition: 1.431840178481745,
    },
    'web/components/answers/answer-resolve-panel.tsx': {
      getAnswerResolveButtonColor: 1.5848574792942591,
      getAnswerResolveButtonDisabled: 1.5848574792942591,
      getAnswerResolveButtonLabel: 1.5848574792942591,
      AnswersResolveOptions: 1.5848574792942591,
      AnswersResolvePanel: 1.5848574792942591,
      ResolutionAnswerItem: 1.5848574792942591,
      IndependentAnswersResolvePanel: 1.5848574792942591,
      IndependentResolutionAnswerItem: 1.5848574792942591,
    },
    'web/components/answers/answers-panel.tsx': {
      SHOW_LIMIT_ORDER_CHARTS_KEY: 2.1341090642620584,
      AnswersPanel: 2.1341090642620584,
      EditAnswerModal: 2.1341090642620584,
      SimpleAnswerBars: 2.1341090642620584,
      Answer: 2.1341090642620584,
      AnswerOrdersButton: 2.1341090642620584,
      canEditAnswer: 3.6133607451627276,
      LimitOrderBarChart: 2.1341090642620584,
    },
    'web/components/answers/binary-multi-answers-panel.tsx': {
      BinaryMultiAnswersPanel: 1.5171171150610274,
      BinaryMultiChoiceBetPanel: 1.5171171150610274,
    },
    'web/components/answers/create-answer-panel.tsx': {
      MultiSortDropdown: 1.6334467290782484,
      SearchCreateAnswerPanel: 1.6334467290782484,
    },
    'web/components/answers/multiple-choice-answers.tsx': {
      MultipleChoiceAnswers: 2.2391456010403976,
    },
    'web/components/answers/numeric-bet-panel.tsx': {
      NumericBetPanel: 2.644408053356245,
      MultiNumericDistributionChart: 2.644408053356245,
    },
    'web/components/answers/numeric-sell-panel.tsx': {
      NumericSellPanel: 2.319542389908815,
      MultiNumericSellPanel: 2.319542389908815,
    },
    'web/components/answers/small-answer.tsx': {
      SmallAnswerBars: 1.5339344456138408,
      SmallAnswer: 1.5339344456138408,
      SmallAnswerBar: 1.5339344456138408,
    },
    'web/components/auth-context.tsx': {
      ensureDeviceToken: 3.402033369674894,
      AuthContext: 2.009295711994629,
      AuthProvider: 2.009295711994629,
    },
    'web/components/bet/bet-dialog.tsx': {
      BetDialog: 1.5363218936665415,
      MultiBetDialog: 1.5363218936665415,
    },
    'web/components/bet/bet-panel.tsx': {
      BuyPanel: 2.422447239988974,
      onOutcomeChoice: 2.422447239988974,
      BuyPanelBody: 2.422447239988974,
      onBetChange: 2.422447239988974,
      submitBet: 2.422447239988974,
      QuickBetAmountsRow: 2.422447239988974,
    },
    'web/components/bet/bet-slider.tsx': {
      LARGE_SLIDER_VALUES: 0.652031054531444,
      LARGE_SLIDER_VALUE_LABELS: 0.652031054531444,
      SMALL_SLIDER_VALUES: 0.652031054531444,
      SMALL_SLIDER_VALUE_LABELS: 0.652031054531444,
      MAX_CASH_SMALL_SLIDER_VALUE: 0.652031054531444,
      MAX_CASH_LARGE_SLIDER_VALUE: 0.652031054531444,
      CASH_SMALL_SLIDER_VALUES: 0.652031054531444,
      CASH_SMALL_SLIDER_VALUE_LABELS: 0.652031054531444,
      CASH_LARGE_SLIDER_VALUES: 0.652031054531444,
      CASH_LARGE_SLIDER_VALUE_LABELS: 0.652031054531444,
      BetSlider: 0.652031054531444,
    },
    'web/components/bet/bet-summary.tsx': {
      UserBetsSummary: 2.0115175341556637,
      BetsSummary: 2.0115175341556637,
    },
    'web/components/bet/cashout-limit-warning.tsx': {
      CashoutLimitWarning: 1.5552895489609648,
    },
    'web/components/bet/contract-bets-table.tsx': {
      ContractBetsTable: 1.799155977721928,
      BetRow: 1.799155977721928,
      groupMultiNumericBets: 3.0462358710674544,
      MultiNumberBetRow: 1.799155977721928,
    },
    'web/components/bet/feed-bet-button.tsx': {
      BetButton: 1.3751945316116994,
    },
    'web/components/bet/fees.tsx': {
      FeeDisplay: 0.851867169417956,
    },
    'web/components/bet/limit-order-panel.tsx': {
      LimitOrderPanel: 2.5620469195201565,
      onBetChange: 2.5620469195201565,
      submitBet: 2.5620469195201565,
    },
    'web/components/bet/money-display.tsx': {
      MoneyDisplay: 0.9141273637244215,
    },
    'web/components/bet/numeric-bet-button.tsx': {
      NumericBetButton: 1.186328320303145,
    },
    'web/components/bet/order-book.tsx': {
      YourOrders: 1.6965485862775302,
      OrderTable: 1.6965485862775302,
      OrderRow: 1.6965485862775302,
      CollatedOrderTable: 1.6965485862775302,
      CollapsedOrderRow: 1.6965485862775302,
      OrderBookButton: 1.6965485862775302,
      getOrderBookButtonLabel: 2.872506455538762,
      OrderBookPanel: 1.6965485862775302,
    },
    'web/components/bet/quick-limit-order-buttons.tsx': {
      QuickLimitOrderButtons: 1.4630046600759508,
      submitBet: 1.4630046600759508,
    },
    'web/components/bet/sell-panel.tsx': {
      SellPanel: 1.9635734706739418,
      submitSell: 1.9635734706739418,
      getSaleResultMultiSumsToOne: 1.9635734706739418,
      MultiSellerPosition: 1.9635734706739418,
      MultiSellerProfit: 1.9635734706739418,
    },
    'web/components/bet/sell-row.tsx': {
      SellRow: 1.64239718911427,
      SellSharesModal: 1.64239718911427,
    },
    'web/components/bet/user-bets-table.tsx': {
      UserBetsTable: 3.7456332402441337,
      BetsTable: 3.7456332402441337,
    },
    'web/components/bet/yes-no-selector.tsx': {
      YesNoSelector: 1.3230353402004773,
      YesNoCancelSelector: 1.3230353402004773,
      ChooseCancelSelector: 1.3230353402004773,
      NumberCancelSelector: 1.3230353402004773,
    },
    'web/components/buttons/app-badges-or-get-app-button.tsx': {
      AppBadgesOrGetAppButton: 1.0057587670778319,
    },
    'web/components/buttons/block-market-button.tsx': {
      BlockMarketButton: 1.0057587670778319,
    },
    'web/components/buttons/button.tsx': {
      baseButtonClasses: 1.0964181287424493,
      outline: 1.0964181287424493,
      buttonClass: 4.580893962455317,
      Button: 1.0964181287424493,
      IconButton: 1.0964181287424493,
    },
    'web/components/buttons/confirmation-button.tsx': {
      ConfirmationButton: 1.2799501261323587,
      updateOpen: 1.2799501261323587,
      ResolveConfirmationButton: 1.2799501261323587,
    },
    'web/components/buttons/copy-link-button.tsx': {
      CopyLinkOrShareButton: 1.4939908314261106,
      CopyLinkRow: 1.4939908314261106,
      SimpleCopyTextButton: 1.4939908314261106,
    },
    'web/components/buttons/create-question-button.tsx': {
      CreateQuestionButton: 0.7414552001894655,
    },
    'web/components/buttons/delete-market-button.tsx': {
      DeleteMarketButton: 0.7846824271987748,
    },
    'web/components/buttons/duplicate-contract-button.tsx': {
      DuplicateContractButton: 1.0485760000000004,
      duplicateContractHref: 1.775393498002826,
    },
    'web/components/buttons/file-upload-button.tsx': {
      FileUploadButton: 1.0273904626114458,
    },
    'web/components/buttons/follow-button.tsx': {
      FollowButton: 0.9020191819214493,
    },
    'web/components/buttons/follow-market-button.tsx': {
      FollowMarketButton: 1.0166321508340372,
      unfollowMarket: 2.4259835688684492,
      followMarket: 2.1335167247954017,
    },
    'web/components/buttons/mobile-apps-qr-code-button.tsx': {
      MobileAppsQRCodeButton: 1.0057587670778319,
      MobileAppsQRCodeDialog: 1.0057587670778319,
    },
    'web/components/buttons/pill-button.tsx': {
      PillButton: 0.851867169417956,
    },
    'web/components/buttons/referrals-button.tsx': {
      useReferralCount: 2.7351049436286146,
      Referrals: 1.615397039921881,
    },
    'web/components/buttons/report-button.tsx': {
      ReportButton: 1.2107912717315625,
      ReportModal: 1.2107912717315625,
    },
    'web/components/buttons/scroll-to-top-button.tsx': {
      ScrollToTopButton: 1.0166321508340372,
    },
    'web/components/buttons/share-embed-button.tsx': {
      embedContractCode: 1.409174902498958,
      ShareEmbedButton: 0.8322813980252596,
      ShareIRLButton: 0.8322813980252596,
    },
    'web/components/buttons/share-qr-button.tsx': {
      ShareQRButton: 0.9610357783828033,
    },
    'web/components/buttons/sign-up-button.tsx': {
      SidebarSignUpButton: 0.8300766752171918,
      GoogleSignInButton: 0.8300766752171918,
    },
    'web/components/buttons/text-button.tsx': {
      TextButton: 0.695546631234341,
    },
    'web/components/buttons/tweet-button.tsx': {
      TweetButton: 0.7846824271987748,
      getTweetHref: 0.7846824271987748,
      getPositionTweet: 1.3285828392465402,
      getWinningTweet: 1.3285828392465402,
    },
    'web/components/buttons/unresolve-button.tsx': {
      UnresolveButton: 1.2317978918357024,
    },
    'web/components/buttons/user-settings-button.tsx': {
      UserSettingButton: 2.0169762077851097,
    },
    'web/components/buttons/warning-confirmation-button.tsx': {
      WarningConfirmationButton: 1.4377349756540254,
    },
    'web/components/cards/MarketCard.tsx': {
      useTopMarketsByUser: 1.9875951124866678,
      MarketCard: 1.1739056919017192,
    },
    'web/components/cards/UserCard.tsx': {
      GreenCard: 0.9093034389506908,
      FaceupGreenCard: 0.9093034389506908,
      UserCard: 0.9093034389506908,
      upscaleGoogleUrl: 0.9093034389506908,
    },
    'web/components/cashout/cash-to-mana.tsx': {
      CashToManaForm: 1.7733029226388148,
    },
    'web/components/cashout/select-cashout-options.tsx': {
      CASHOUTS_PER_PAGE: 1.726810798706249,
      getStatusColor: 2.923744835189953,
      SelectCashoutOptions: 1.726810798706249,
      CashoutOptionsContent: 1.726810798706249,
    },
    'web/components/charity/charity-card.tsx': {
      CharityCard: 0.8814693511187484,
      NewBadge: 0.8814693511187484,
    },
    'web/components/charity/feed-items.tsx': {
      Donation: 0.9378748862299282,
    },
    'web/components/charts/calibration.tsx': {
      CalibrationChart: 1.2842380782643072,
    },
    'web/components/charts/chart-annotations.tsx': {
      ChartAnnotations: 1.6601533504343835,
      EditChartAnnotationsButton: 1.6601533504343835,
    },
    'web/components/charts/contract/binary.tsx': {
      BinaryContractChart: 1.3076545734700877,
      SizedBinaryChart: 1.3076545734700877,
      MultiBinaryChart: 1.3076545734700877,
    },
    'web/components/charts/contract/choice.tsx': {
      CHOICE_OTHER_COLOR: 0.9988355307317691,
      nthColor: 0.9988355307317691,
      getAnswerColor: 3.634819759189591,
      getMultiBetPoints: 2.383515594671414,
      useChartAnswers: 1.6911755627015916,
      ChoiceContractChart: 0.9988355307317691,
      ChoiceTooltip: 0.9988355307317691,
      PositionsTooltip: 0.9988355307317691,
    },
    'web/components/charts/contract/depth-chart.tsx': {
      getColor: 0.8554735176776113,
      DepthChart: 0.8554735176776113,
      cumulative: 0.8554735176776113,
      orderSize: 0.8554735176776113,
    },
    'web/components/charts/contract/multi-numeric.tsx': {
      DistributionChartTooltip: 0.9782713942542894,
      MultiNumericContractChart: 0.9782713942542894,
    },
    'web/components/charts/contract/pseudo-numeric.tsx': {
      PseudoNumericContractChart: 1.0937406689980442,
    },
    'web/components/charts/contract/single-value.tsx': {
      SingleContractChartTooltip: 0.8276004128377799,
      MultiBinaryChartTooltip: 0.8276004128377799,
    },
    'web/components/charts/contract/stonk.tsx': {
      StonkContractChart: 1.1065333924881593,
    },
    'web/components/charts/contract/zoom-utils.ts': {
      getPointsBetween: 0.8276004128377799,
      useDataZoomFetcher: 1.4012493056265338,
    },
    'web/components/charts/generic-charts.tsx': {
      getTickValues: 2.012428341326701,
      dataAtXSelector: 4.2233068471721955,
      dataAtTimeSelector: 3.4073373721962312,
      DistributionChart: 2.012428341326701,
      DoubleDistributionChart: 2.012428341326701,
      getDecimalPlaces: 2.012428341326701,
      formatNumber: 2.012428341326701,
      DiagonalPattern: 2.012428341326701,
      MultiValueHistoryChart: 2.012428341326701,
      SingleValueHistoryChart: 2.012428341326701,
      SingleValueStackedHistoryChart: 2.012428341326701,
    },
    'web/components/charts/helpers.tsx': {
      ZOOM_DRAG_THRESHOLD: 1.3791863964136541,
      Y_AXIS_MARGIN: 1.3791863964136541,
      XAxis: 1.3791863964136541,
      YAxis: 1.3791863964136541,
      LinePath: 1.3791863964136541,
      AreaPath: 1.3791863964136541,
      AreaWithTopStroke: 1.3791863964136541,
      SliceMarker: 1.3791863964136541,
      PositionMarker: 1.3791863964136541,
      AnnotationMarker: 1.3791863964136541,
      SVGChart: 1.3791863964136541,
      getTooltipPosition: 2.3351655585544098,
      TooltipContainer: 1.3791863964136541,
      getEndDate: 4.409568643341509,
      getRightmostVisibleDate: 4.24712388283592,
      formatPct: 5.114092394579083,
      formatDateInRange: 4.24712388283592,
      useZoom: 3.5989012711151553,
      useInitZoomBehavior: 2.3351655585544098,
    },
    'web/components/charts/mana-spice-chart.tsx': {
      ManaSpiceChart: 2.0526394124730323,
      ManaSvg: 2.0526394124730323,
      SpiceSvg: 2.0526394124730323,
      SweepiesSvg: 2.0526394124730323,
    },
    'web/components/charts/minibar.tsx': {
      MiniStackedBar: 1.053805837929246,
      MiniBar: 1.053805837929246,
      ContractMinibar: 1.053805837929246,
    },
    'web/components/charts/stats.tsx': {
      DailyChart: 1.398974873770534,
    },
    'web/components/charts/time-range-picker.tsx': {
      TimeRangePicker: 1.0485760000000004,
    },
    'web/components/charts/user-position-search-button.tsx': {
      UserPositionSearchButton: 1.9560931635943324,
    },
    'web/components/charts/zoom-slider.tsx': {
      ZoomSlider: 1.3012485953018513,
    },
    'web/components/chat/chat-input.tsx': {
      addKeyboardShortcuts: 1.2813810378437378,
      ChatInput: 1.2813810378437378,
    },
    'web/components/chat/chat-message.tsx': {
      ChatMessageItem: 1.3783889483004894,
      SystemChatMessageItem: 1.3783889483004894,
      MultiUserModal: 1.3783889483004894,
      MessageAvatar: 1.3783889483004894,
    },
    'web/components/chat/public-chat.tsx': {
      PublicChat: 1.6512991360999623,
      submitMessage: 1.6512991360999623,
    },
    'web/components/client-render.tsx': {
      ClientRender: 0.6683386856856337,
    },
    'web/components/clock/clock.tsx': {
      getTimeUntil: 1.2107912717315625,
      Clock: 1.2107912717315625,
    },
    'web/components/clock/digit.tsx': {
      Digit: 1.2582912000000004,
    },
    'web/components/clock/display.tsx': {
      Display: 1.3751945316116994,
    },
    'web/components/clock/segment-style.ts': {
      segmentStyle: 1.2756477605939975,
      skewedSegmentStyle: 1.2756477605939975,
    },
    'web/components/clock/segment.tsx': {},
    'web/components/comments/comment-actions.tsx': {
      CommentActions: 1.7293558417950663,
    },
    'web/components/comments/comment-edit-history-button.tsx': {
      CommentEditHistoryButton: 1.4529495260778749,
    },
    'web/components/comments/comment-header.tsx': {
      FeedCommentHeader: 1.9625066010104648,
      CommentReplyHeaderWithBet: 1.9625066010104648,
      CommentReplyHeader: 1.9625066010104648,
      ReplyToBetRow: 1.9625066010104648,
      CommentStatus: 1.9625066010104648,
      DotMenu: 1.9625066010104648,
    },
    'web/components/comments/comment-input.tsx': {
      CommentInput: 1.9784492399054776,
      CommentInputTextArea: 1.9784492399054776,
      ContractCommentInput: 1.9784492399054776,
    },
    'web/components/comments/comment-thread.tsx': {
      FeedCommentThread: 1.7670916849116354,
    },
    'web/components/comments/comment.tsx': {
      roundThreadColor: 1.5552895489609648,
      FeedComment: 1.5552895489609648,
      ParentFeedComment: 1.5552895489609648,
      HideableContent: 1.5552895489609648,
      commenterAndBettorMatch: 3.2639497598865623,
    },
    'web/components/comments/comments-button.tsx': {
      CommentsButton: 1.19862220638002,
      CommentsDialog: 1.19862220638002,
    },
    'web/components/comments/dropdown-button-menu.tsx': {
      DropdownMenu: 1.318039594202724,
    },
    'web/components/comments/dropdown-menu.tsx': {
      DropdownMenu: 1.615397039921881,
      AnimationOrNothing: 1.615397039921881,
    },
    'web/components/comments/edit-comment-modal.tsx': {
      EditCommentModal: 1.3096710042337203,
    },
    'web/components/comments/profile-comments.tsx': {
      contractPath: 5.698374847016289,
      UserCommentsList: 1.1600871658620422,
      ProfileCommentGroup: 1.1600871658620422,
      ProfileComment: 1.1600871658620422,
    },
    'web/components/comments/reply-toggle.tsx': {
      ReplyToggle: 0.9495259526607583,
    },
    'web/components/comments/repost-modal.tsx': {
      RepostButton: 1.5458348136308662,
      RepostModal: 1.5458348136308662,
    },
    'web/components/confetti-on-demand.tsx': {
      ConfettiOnDemand: 0.815038818164305,
      NConfettis: 0.815038818164305,
    },
    'web/components/contract/add-liquidity-button.tsx': {
      AddLiquidityButton: 0.8897462402273586,
    },
    'web/components/contract/back-button.tsx': {
      BackButton: 0.7985716900254357,
    },
    'web/components/contract/boost-button.tsx': {
      BoostButton: 1.619023075999223,
      BoostDialog: 1.619023075999223,
      BoostFormRow: 1.619023075999223,
      FeedAnalytics: 1.619023075999223,
    },
    'web/components/contract/bountied-question.tsx': {
      BountyLeft: 1.1770236407981622,
      AwardBountyButton: 1.1770236407981622,
      onAwardBounty: 1.1770236407981622,
      AddBountyButton: 1.1770236407981622,
      onAddBounty: 1.1770236407981622,
      CancelBountyButton: 1.1770236407981622,
      onCancel: 1.1770236407981622,
    },
    'web/components/contract/change-banner-button.tsx': {
      ChangeBannerButton: 1.3550588246957846,
      onSuccess: 2.843743101374739,
      onError: 2.294314028526541,
    },
    'web/components/contract/contract-description.tsx': {
      ContractDescription: 1.0485760000000004,
      EditableDescription: 1.0485760000000004,
      saveDescription: 1.0485760000000004,
      JSONEmpty: 2.5022109960056516,
    },
    'web/components/contract/contract-details.tsx': {
      AuthorInfo: 1.345559046296798,
      CloseOrResolveTime: 1.345559046296798,
      CloseDate: 1.345559046296798,
      EditCloseTimeModal: 1.345559046296798,
      onSave: 4.302054453077206,
    },
    'web/components/contract/contract-edit-history-button.tsx': {
      ContractHistoryButton: 2.1995115735577304,
    },
    'web/components/contract/contract-info-dialog.tsx': {
      Stats: 2.472505743256133,
      CheckOrSwitch: 2.472505743256133,
      ContractInfoDialog: 2.472505743256133,
    },
    'web/components/contract/contract-leaderboard.tsx': {
      ContractLeaderboard: 1.4976660911775501,
    },
    'web/components/contract/contract-mention.tsx': {
      ContractMention: 0.9221111604067992,
      tooltipLabel: 0.9221111604067992,
    },
    'web/components/contract/contract-overview.tsx': {
      ContractOverview: 2.6221389574847587,
      BinaryOverview: 2.6221389574847587,
      SimpleMultiOverview: 2.6221389574847587,
      BinaryBetPanel: 2.6221389574847587,
      useTimePicker: 2.6221389574847587,
    },
    'web/components/contract/contract-price.tsx': {
      BinaryResolutionOrChance: 1.2995575632744927,
      PseudoNumericResolutionOrExpectation: 1.2995575632744927,
      MultiNumericResolutionOrExpectation: 1.2995575632744927,
      StonkPrice: 1.2995575632744927,
    },
    'web/components/contract/contract-seo.tsx': {
      ContractSEO: 0.7846824271987748,
    },
    'web/components/contract/contract-share-panel.tsx': {
      ContractSharePanel: 0.8256495680499811,
    },
    'web/components/contract/contract-summary-stats.tsx': {
      ContractSummaryStats: 1.2228392428178616,
    },
    'web/components/contract/contract-table-action.tsx': {
      Action: 1.3296671378445846,
      BetButton: 1.3296671378445846,
      ResolveButton: 1.3296671378445846,
      SmallResolutionPanel: 1.3296671378445846,
    },
    'web/components/contract/contract-table-col-formats.tsx': {
      traderColumn: 0.773391443908028,
      probColumn: 0.773391443908028,
      actionColumn: 0.773391443908028,
      BountiedContractComments: 0.773391443908028,
    },
    'web/components/contract/contract-tabs.tsx': {
      ContractTabs: 2.37265664060629,
      CommentsTabContent: 2.37265664060629,
      getSortLabel: 2.37265664060629,
      BetsTabContent: 2.37265664060629,
    },
    'web/components/contract/contracts-grid.tsx': {
      ContractsGrid: 0.8773016239829952,
    },
    'web/components/contract/contracts-table.tsx': {
      ContractsTable: 1.353028772882174,
      ContractRow: 1.353028772882174,
      LoadingContractRow: 1.353028772882174,
      isClosed: 2.839482809692063,
      ContractStatusLabel: 1.353028772882174,
      ContractQuestion: 1.353028772882174,
      VisibilityIcon: 1.353028772882174,
    },
    'web/components/contract/creator-fees-display.tsx': {
      CreatorFeesDisplay: 0.8388608000000003,
    },
    'web/components/contract/creator-share-panel.tsx': {
      CreatorShareBoostPanel: 1.2047221043312524,
      NonCreatorSharePanel: 1.2047221043312524,
    },
    'web/components/contract/danger-zone.tsx': {
      DangerZone: 1.7357021230920477,
    },
    'web/components/contract/editable-mod-note.tsx': {
      EditableModNote: 1.1770236407981622,
    },
    'web/components/contract/editable-payment-info.tsx': {
      EditablePaymentInfo: 1.109708530700346,
    },
    'web/components/contract/editable-question-title.tsx': {
      EditableQuestionTitle: 1.2138144756180167,
    },
    'web/components/contract/featured-contract-badge.tsx': {
      FeaturedContractBadge: 0.4448731201136793,
    },
    'web/components/contract/feed-contract-card.tsx': {
      FeedContractCard: 2.1955088194243237,
      YourMetricsFooter: 2.1955088194243237,
      CategoryTags: 2.1955088194243237,
      LoadingCards: 2.1955088194243237,
    },
    'web/components/contract/header-actions.tsx': {
      HeaderActions: 1.2047221043312524,
    },
    'web/components/contract/like-button.tsx': {
      LikeButton: 1.4068123293448922,
      handleLiked: 1.4068123293448922,
      useLikeDisplayList: 1.4068123293448922,
      UserLikedFullList: 1.4068123293448922,
      UserLikedPopup: 1.4068123293448922,
      UserLikedItem: 1.4068123293448922,
    },
    'web/components/contract/liquidity-modal.tsx': {
      LiquidityModal: 1.3698539501485945,
      AddLiquidityPanel: 1.3698539501485945,
    },
    'web/components/contract/market-topics.tsx': {
      MarketTopics: 1.7979333095700303,
    },
    'web/components/contract/related-contracts-widget.tsx': {
      SidebarRelatedContractsList: 2.0115175341556637,
      RelatedContractsGrid: 2.0115175341556637,
    },
    'web/components/contract/subsidize-button.tsx': {
      SubsidizeButton: 0.9060732211431631,
      AddLiquidityModal: 0.9060732211431631,
    },
    'web/components/contract/text-color.ts': {
      getTextColor: 1.7335826305357251,
    },
    'web/components/contract/trades-button.tsx': {
      TradesButton: 1.3208173414233277,
      TradesNumber: 1.3208173414233277,
      TradesModal: 1.3208173414233277,
      VotesModalContent: 1.3208173414233277,
      BetsModalContent: 1.3208173414233277,
    },
    'web/components/contract/twomba-contract-info-dialog.tsx': {
      TwombaContractInfoDialog: 1.0485760000000004,
    },
    'web/components/contract/twomba-contract-page.tsx': {
      TwombaContractPageContent: 3.5651584000000014,
    },
    'web/components/contract/twomba-contract-summary-stats.tsx': {
      TwombaContractSummaryStats: 1.4529495260778749,
    },
    'web/components/contract/twomba-header-actions.tsx': {
      TwombaHeaderActions: 2.669238720682076,
    },
    'web/components/contract/upgrade-tier-button.tsx': {
      UpgradeTierButton: 1.4888302259144317,
      AddLiquidityDialogue: 1.4888302259144317,
      UpgradeTierContent: 1.4888302259144317,
      UpgradeTier: 1.4888302259144317,
    },
    'web/components/contract/user-positions-table.tsx': {
      UserPositionsTable: 2.681567833498725,
      LoadingPositionsRows: 2.681567833498725,
      SortRow: 2.681567833498725,
    },
    'web/components/contract/watch-market-modal.tsx': {
      WatchMarketModal: 0.7985716900254357,
    },
    'web/components/contract-select-modal.tsx': {
      SelectMarkets: 1.2155117234416133,
      toggleContract: 1.2155117234416133,
      onFinish: 2.900568771523842,
    },
    'web/components/country-code-selector.tsx': {
      CountryCodeSelector: 1.6887445883093164,
    },
    'web/components/dashboard/add-dashboard-item.tsx': {
      AddItemCard: 1.7504206359431977,
      AddItemFloatyButton: 1.7504206359431977,
    },
    'web/components/dashboard/create-dashboard-button.tsx': {
      CreateDashboardButton: 0.5346709485485069,
    },
    'web/components/dashboard/dashboard-add-contract.tsx': {
      DashboardAddContract: 0.6795549158573723,
    },
    'web/components/dashboard/dashboard-add-link.tsx': {
      DashboardAddLink: 1.1390450916340762,
    },
    'web/components/dashboard/dashboard-cards.tsx': {
      DashboardCards: 1.0273904626114458,
      DashboardCard: 1.0273904626114458,
    },
    'web/components/dashboard/dashboard-content.tsx': {
      DashboardContent: 1.604012845645521,
      key: 4.725277721202234,
      RemoveButton: 1.604012845645521,
    },
    'web/components/dashboard/dashboard-page.tsx': {
      DashboardPage: 2.404876537808493,
    },
    'web/components/dashboard/dashboard-search.tsx': {
      DashboardSearch: 1.4377349756540254,
      DashboardSection: 1.4377349756540254,
      Header: 1.4377349756540254,
    },
    'web/components/dashboard/dashboard-set-topics.tsx': {
      DashboardSetTopics: 1.2582912000000004,
    },
    'web/components/dashboard/dashboard-text-card.tsx': {
      DashboardText: 0.8475538902120938,
      DashboardTextEditor: 0.8475538902120938,
    },
    'web/components/dashboard/follow-dashboard-button.tsx': {
      FollowDashboardButton: 0.9610357783828033,
    },
    'web/components/dashboard/header.tsx': {
      HeadlineTabs: 1.2047221043312524,
    },
    'web/components/dashboard/horizontal-dashboard-card.tsx': {
      HorizontalDashboardCard: 2.0169762077851097,
    },
    'web/components/dashboard/horizontal-dashboard.tsx': {
      HorizontalDashboard: 1.9105964001369633,
    },
    'web/components/dashboard/input-with-limit.tsx': {
      InputWithLimit: 0.9378748862299282,
    },
    'web/components/dashboard/multi-dashboard-header.tsx': {
      MultiDashboardHeadlineTabs: 1.186328320303145,
    },
    'web/components/dashboard/politics-dashboard-page.tsx': {
      PoliticsDashboardPage: 2.37265664060629,
    },
    'web/components/donut-chart.tsx': {},
    'web/components/editor/contract-mention/contract-mention-extension.tsx': {
      DisplayContractMention: 0.8133057206672301,
    },
    'web/components/editor/contract-mention/contract-mention-list.tsx': {},
    'web/components/editor/contract-mention/contract-mention-suggestion.ts': {
      contractMentionSuggestion: 0.6049111254753488,
    },
    'web/components/editor/embed-modal.tsx': {
      isAllowedDomain: 1.4300670011098644,
      embedCode: 1.4300670011098644,
      EmbedModal: 1.4300670011098644,
    },
    'web/components/editor/emoji/emoji-extension.ts': {
      EmojiExtension: 0.3212592278216674,
      addProseMirrorPlugins: 0.3212592278216674,
    },
    'web/components/editor/emoji/emoji-list.tsx': {
      EmojiList: 0.9710515804944135,
    },
    'web/components/editor/emoji/emoji-suggestion.ts': {
      emojiSuggestion: 1.0135993611846328,
    },
    'web/components/editor/emoji/github-shortcodes.json': {},
    'web/components/editor/floating-format-menu.tsx': {
      FloatingFormatMenu: 1.644627193113674,
    },
    'web/components/editor/gif-modal.tsx': {
      GIFModal: 1.2813810378437378,
      GifButton: 1.2813810378437378,
    },
    'web/components/editor/image.tsx': {
      BasicImage: 0.695546631234341,
      DisplayImage: 0.695546631234341,
      MediumDisplayImage: 0.695546631234341,
      ExpandingImage: 0.695546631234341,
    },
    'web/components/editor/link-preview-extension.tsx': {
      LinkPreviewExtension: 0.7512762267801463,
      addAttributes: 0.7512762267801463,
      renderReact: 1.7927662236088913,
      parseHTML: 0.7512762267801463,
      renderHTML: 1.5766375217050246,
    },
    'web/components/editor/link-preview-node-view.tsx': {
      LinkPreviewNodeView: 1.1581900473958153,
      insertLinkPreviews: 1.9609862133008142,
      findLinksInContent: 1.9609862133008142,
    },
    'web/components/editor/market-modal.tsx': {
      MarketModal: 0.812223477046558,
      onSubmit: 2.267532583174064,
    },
    'web/components/editor/nodeview-middleware.tsx': {
      nodeViewMiddleware: 1.506471338054764,
    },
    'web/components/editor/spoiler.tsx': {
      DisplaySpoiler: 0.7705428469585844,
    },
    'web/components/editor/sticky-format-menu.tsx': {
      StickyFormatMenu: 1.2713308353181405,
      UploadButton: 1.2713308353181405,
      ToolbarButton: 1.2713308353181405,
    },
    'web/components/editor/tiptap-grid-cards.tsx': {
      addAttributes: 0.6349442995396265,
      parseHTML: 0.6349442995396265,
      renderHTML: 1.3325019096336252,
      renderReact: 1.5151640016166297,
      GridComponent: 0.6349442995396265,
    },
    'web/components/editor/tweet.tsx': {
      DisplayTweet: 0.5277716795198976,
      TweetComponent: 0.5277716795198976,
    },
    'web/components/editor/upload-extension.tsx': {
      Upload: 0.5387681038562548,
      useUploadMutation: 0.9122136960198457,
      onSuccess: 1.1306653634951527,
      onError: 0.9122136960198457,
    },
    'web/components/editor/user-mention/mention-extension.tsx': {
      DisplayMention: 0.543643932685898,
    },
    'web/components/editor/user-mention/mention-list.tsx': {
      MentionList: 0.9710515804944135,
    },
    'web/components/editor/user-mention/mention-suggestion.ts': {
      mentionSuggestion: 0.5971054936107728,
      makeMentionRender: 1.2530929265228052,
      onUpdate: 1.2530929265228052,
      onKeyDown: 0.5971054936107728,
      onExit: 0.5971054936107728,
    },
    'web/components/editor/user-mention/user-mention.tsx': {
      UserMention: 0.3934605916618092,
    },
    'web/components/editor/utils.ts': {
      insertContent: 2.7180968792276854,
      getField: 1.9285709854308808,
      generateReact: 1.9285709854308808,
    },
    'web/components/elections-page.tsx': {
      ELECTIONS_PARTY_QUESTION_PSEUDONYM: 1.6159641443942998,
      USElectionsPage: 1.6159641443942998,
    },
    'web/components/explainer-panel.tsx': {
      ExplainerPanel: 2.166986596703666,
      ExpandSection: 2.166986596703666,
    },
    'web/components/feed/card-dropdown.tsx': {
      FeedDropdown: 1.3096710042337203,
    },
    'web/components/feed/card-reason.tsx': {
      CardReason: 1.2756477605939975,
      ProbabilityChange: 1.2756477605939975,
    },
    'web/components/feed/comment-on-answer.tsx': {
      CommentOnAnswer: 0.9761711312090045,
      AnswerSectionForCommentOnAnswer: 0.9761711312090045,
    },
    'web/components/feed/copy-link-date-time.tsx': {
      copyLinkToComment: 1.5168968696348535,
      getCommentLink: 1.880154571208102,
      CopyLinkDateTimeComponent: 0.8959037271250078,
    },
    'web/components/feed/feed-bets.tsx': {
      FeedBet: 1.5434620803617651,
      FeedReplyBet: 1.5434620803617651,
      BetStatusesText: 1.5434620803617651,
      BetStatusText: 1.5434620803617651,
      BetActions: 1.5434620803617651,
    },
    'web/components/feed/feed-chart.tsx': {
      FeedBinaryChart: 1.2842380782643072,
    },
    'web/components/feed/feed-contract-card-description.tsx': {
      TEXT_MAX_HEIGHT: 0.8054265083717076,
      NON_TEXT_MAX_HEIGHT: 0.8054265083717076,
      FeedContractCardDescription: 0.8054265083717076,
    },
    'web/components/feed/feed-liquidity.tsx': {
      FeedLiquidity: 1.0897121445584064,
      LiquidityStatusText: 1.0897121445584064,
    },
    'web/components/feed/feed-multi-numeric-bet-group.tsx': {
      MultiNumericBetGroup: 1.167644816903771,
      BetGroupStatusText: 1.167644816903771,
    },
    'web/components/feed/good-comment.tsx': {
      GoodComment: 1.604012845645521,
    },
    'web/components/feed/live-generated-feed.tsx': {
      LiveGeneratedFeed: 2.112822095863862,
    },
    'web/components/feed/scored-feed-repost-item.tsx': {
      ScoredFeedRepost: 1.8252452526061484,
      RepostLabel: 1.8252452526061484,
      BottomActionRow: 1.8252452526061484,
    },
    'web/components/follow-list.tsx': {
      FollowList: 1.1224335497005309,
      UserFollowItem: 1.1224335497005309,
    },
    'web/components/footer.tsx': {
      Footer: 1.25719845884729,
    },
    'web/components/gidx/location-monitor.tsx': {
      LocationMonitor: 1.109708530700346,
    },
    'web/components/gidx/location-panel.tsx': {
      LocationPanel: 1.29277131551544,
    },
    'web/components/gidx/register-component-helpers.tsx': {
      InputTitle: 0.6291456000000002,
      BottomRow: 0.6291456000000002,
      Divider: 0.6291456000000002,
    },
    'web/components/gidx/register-user-form.tsx': {
      RegisterUserForm: 3.2556554012611114,
    },
    'web/components/gidx/upload-document.tsx': {
      UploadDocuments: 2.311628540875753,
    },
    'web/components/gidx/verify-me.tsx': {
      VerifyMe: 2.5940337626925993,
    },
    'web/components/home/daily-league-stat.tsx': {
      DailyLeagueStat: 1.0273904626114458,
    },
    'web/components/home/daily-loan.tsx': {
      DailyLoan: 1.8990519053215167,
    },
    'web/components/home/daily-profit.tsx': {
      DailyProfit: 1.7483255775790967,
      DailyProfitModal: 1.7483255775790967,
      ProfitChangeTable: 1.7483255775790967,
    },
    'web/components/home/daily-stats.tsx': {
      dailyStatsClass: 0.5806750949122125,
      DailyStats: 0.5806750949122125,
    },
    'web/components/home/quests-or-streak.tsx': {
      QuestsOrStreak: 1.7462280056449602,
      QuestsModal: 1.7462280056449602,
    },
    'web/components/home/typewriter.tsx': {
      Typewriter: 1.0273904626114458,
    },
    'web/components/home/welcome-topic-sections.tsx': {
      WelcomeTopicSections: 1.1770236407981622,
    },
    'web/components/icons/logo-icon.tsx': {
      LogoIcon: 0.6291456000000002,
    },
    'web/components/icons/mana-circle-icon.tsx': {
      ManaCircleIcon: 0.6291456000000002,
    },
    'web/components/layout/col.tsx': {
      Col: 0.5743287284585372,
    },
    'web/components/layout/modal.tsx': {
      MODAL_CLASS: 1.1581900473958153,
      SCROLLABLE_MODAL_CLASS: 1.1581900473958153,
      Modal: 1.1581900473958153,
    },
    'web/components/layout/page.tsx': {
      Page: 1.350995670647453,
    },
    'web/components/layout/right-modal.tsx': {
      RightModal: 1.2047221043312524,
    },
    'web/components/layout/row.tsx': {
      Row: 0.554854265350173,
    },
    'web/components/layout/spacer.tsx': {
      Spacer: 0.41943040000000015,
    },
    'web/components/layout/tabs.tsx': {
      MinimalistTabs: 1.5049896854193259,
      ControlledTabs: 1.5049896854193259,
      UncontrolledTabs: 1.5049896854193259,
      QueryUncontrolledTabs: 1.5049896854193259,
      Tabs: 1.5049896854193259,
    },
    'web/components/leaderboard.tsx': {
      Leaderboard: 1.6682742004262974,
    },
    'web/components/leagues/cohort-table.tsx': {
      CohortTable: 2.325854081548953,
    },
    'web/components/leagues/league-bid-panel.tsx': {
      LeagueBidPanel: 1.334619360341038,
    },
    'web/components/leagues/league-feed.tsx': {
      LeagueFeed: 1.445362270427176,
    },
    'web/components/leagues/mana-earned-breakdown.tsx': {
      ManaEarnedBreakdown: 2.311628540875753,
    },
    'web/components/leagues/prizes-modal.tsx': {
      PrizesModal: 1.1390450916340762,
    },
    'web/components/loading-user-rows.tsx': {
      LoadingUserRows: 0.8825082075206633,
      LoadingUserRow: 0.8825082075206633,
    },
    'web/components/manalink-card.tsx': {
      linkClaimed: 2.277652957483985,
      ManalinkCard: 1.3452185277423645,
      ManalinkCardFromView: 1.3452185277423645,
      ClaimsList: 1.3452185277423645,
      Claim: 1.3452185277423645,
      getManalinkGradient: 1.3452185277423645,
      getManalinkAmountColor: 1.3452185277423645,
      getManalinkUrl: 2.277652957483985,
    },
    'web/components/manalinks/create-links-button.tsx': {
      CreateLinksButton: 1.5482039105207304,
      CreateManalinkForm: 1.5482039105207304,
      setExpireTime: 1.5482039105207304,
    },
    'web/components/messaging/messages-icon.tsx': {
      UnseenMessagesBubble: 0.9552982000684817,
      PrivateMessagesIcon: 0.9552982000684817,
      InternalUnseenMessagesBubble: 0.9552982000684817,
    },
    'web/components/messaging/new-message-button.tsx': {
      NewMessageButton: 1.0130206575341563,
      MessageModal: 1.0130206575341563,
    },
    'web/components/messaging/send-message-button.tsx': {
      SendMessageButton: 1.671155149754517,
    },
    'web/components/mod-report-item.tsx': {},
    'web/components/multi-checkbox.tsx': {
      MultiCheckbox: 0.9808530339984685,
    },
    'web/components/multi-user-reaction-link.tsx': {
      MultiUserReactionModal: 1.1723436077874103,
    },
    'web/components/multi-user-transaction-link.tsx': {
      MultiUserTransactionLink: 1.4516877372805312,
      MultiUserTransactionModal: 1.4516877372805312,
    },
    'web/components/multiple-or-single-avatars.tsx': {
      MultipleOrSingleAvatars: 1.7971687195675319,
    },
    'web/components/native-message-listener.tsx': {
      NativeMessageListener: 1.7289584257627488,
    },
    'web/components/nav/banner.tsx': {
      Banner: 0.9080934537986719,
      PivotBanner: 0.9080934537986719,
      ManifestBanner: 0.9080934537986719,
      DowntimeBanner: 0.9080934537986719,
      WatchPartyBanner: 0.9080934537986719,
      useBanner: 0.9080934537986719,
      TwombaBanner: 0.9080934537986719,
    },
    'web/components/nav/bottom-nav-bar.tsx': {
      BOTTOM_NAV_BAR_HEIGHT: 1.445362270427176,
      getNavigation: 1.445362270427176,
      BottomNavBar: 1.445362270427176,
      NavBarItem: 1.445362270427176,
      MobileSidebar: 1.445362270427176,
    },
    'web/components/nav/manifold-logo.tsx': {
      ManifoldLogo: 1.0380372802652518,
    },
    'web/components/nav/more-button.tsx': {
      MoreButton: 0.5931641601515725,
      SidebarButton: 0.5931641601515725,
    },
    'web/components/nav/profile-summary.tsx': {
      ProfileSummary: 1.167644816903771,
    },
    'web/components/nav/sidebar-item.tsx': {
      SidebarItem: 1.334619360341038,
    },
    'web/components/nav/sidebar.tsx': {
      Sidebar: 2.525305415410343,
    },
    'web/components/new-contract/choosing-contract-form.tsx': {
      ChoosingContractForm: 1.2168301684040987,
      OutcomeButton: 1.2168301684040987,
    },
    'web/components/new-contract/close-time-section.tsx': {
      CloseTimeSection: 1.3373626712734388,
      setCloseDateInDays: 1.3373626712734388,
    },
    'web/components/new-contract/contract-params-form.tsx': {
      ContractParamsForm: 3.017276301233496,
      submit: 7.200109423574173,
    },
    'web/components/new-contract/cost-section.tsx': {
      TIERS: 1.4709992805787397,
      CostSection: 1.4709992805787397,
      PriceSection: 1.4709992805787397,
      Tier: 1.4709992805787397,
    },
    'web/components/new-contract/create-contract-types.tsx': {
      PREDICTIVE_CONTRACT_TYPES: 0.9425525954783683,
      NON_PREDICTIVE_CONTRACT_TYPES: 0.9425525954783683,
      ALL_CONTRACT_TYPES: 0.9425525954783683,
      getContractTypeFromValue: 2.249207943648948,
    },
    'web/components/new-contract/multi-numeric-range-section.tsx': {
      MultiNumericRangeSection: 2.3819067990423477,
    },
    'web/components/new-contract/new-contract-panel.tsx': {
      NewContractPanel: 1.508638150616748,
      CreateStepTracker: 1.508638150616748,
      CreateStepButton: 1.508638150616748,
    },
    'web/components/new-contract/pseudo-numeric-range-section.tsx': {
      PseudoNumericRangeSection: 1.5833150385596928,
    },
    'web/components/new-contract/similar-contracts-section.tsx': {
      SimilarContractsSection: 1.1390450916340762,
    },
    'web/components/new-contract/topic-selector-section.tsx': {
      TopicSelectorSection: 1.1581900473958153,
    },
    'web/components/new-contract-badge.tsx': {
      NewContractBadge: 0.5560914001420991,
    },
    'web/components/news/dashboard-news-item.tsx': {
      MaybeDashboardNewsItem: 1.1047433669551316,
      DashboardNewsItem: 1.1047433669551316,
      DashboardNewsItemPlaceholder: 1.1047433669551316,
    },
    'web/components/news/edit-news-button.tsx': {
      EditNewsButton: 2.1180196980495913,
    },
    'web/components/news/news-article.tsx': {
      NewsArticle: 1.3012485953018513,
    },
    'web/components/notification-settings.tsx': {
      optOutAll: 2.023778844999029,
      SectionRoutingContext: 2.023778844999029,
      NotificationSettings: 2.023778844999029,
      NotificationSettingLine: 2.023778844999029,
      NotificationSection: 2.023778844999029,
      PushNotificationsBanner: 2.023778844999029,
      notificationIsNecessary: 3.4265554454869687,
      changeSetting: 3.4265554454869687,
      getUsersSavedPreference: 3.4265554454869687,
    },
    'web/components/notifications/income-summary-notifications.tsx': {
      combineAndSumIncomeNotifications: 2.535769119697503,
      UniqueBettorBonusIncomeNotification: 1.4976660911775501,
      UniqueBettorNotification: 1.4976660911775501,
      PushNotificationBonusNotification: 1.4976660911775501,
      QuestIncomeNotification: 1.4976660911775501,
      BettingStreakBonusIncomeNotification: 1.4976660911775501,
      BettingStreakExpiringNotification: 1.4976660911775501,
      LoanIncomeNotification: 1.4976660911775501,
      ManaPaymentReceivedNotification: 1.4976660911775501,
      UserJoinedNotification: 1.4976660911775501,
      LeagueChangedNotification: 1.4976660911775501,
      PrizeIncomeNotificationLabel: 1.4976660911775501,
      IncomeNotificationLabel: 1.4976660911775501,
      MultiUserNotificationModal: 1.4976660911775501,
    },
    'web/components/notifications/notification-dropdown.tsx': {
      NotificationDropdown: 1.044373273668851,
      useNotificationPreferenceItem: 1.044373273668851,
      useNotificationFollowItem: 1.044373273668851,
      useNotificationDropdownItems: 1.044373273668851,
    },
    'web/components/notifications/notification-helpers.tsx': {
      NOTIFICATIONS_PER_PAGE: 0.9724093787532907,
      getHighlightClass: 0.9724093787532907,
      NUM_SUMMARY_LINES: 0.9724093787532907,
      NOTIFICATION_ICON_SIZE: 0.9724093787532907,
      NotificationUserLink: 0.9724093787532907,
      PrimaryNotificationLink: 0.9724093787532907,
      QuestionOrGroupLink: 0.9724093787532907,
      NotificationTextLabel: 0.9724093787532907,
      AvatarNotificationIcon: 0.9724093787532907,
      NotificationIcon: 0.9724093787532907,
      NotificationFrame: 0.9724093787532907,
      ParentNotificationHeader: 0.9724093787532907,
      combineReactionNotifications: 1.6464321979861822,
    },
    'web/components/notifications/notification-types.tsx': {
      NotificationItem: 1.6683937856886584,
      LimitOrderCancelledNotification: 1.6683937856886584,
      LimitOrderExpiredNotification: 1.6683937856886584,
      BetFillNotification: 1.6683937856886584,
      SignupBonusNotification: 1.6683937856886584,
      MarketResolvedNotification: 1.6683937856886584,
      MarketClosedNotification: 1.6683937856886584,
      NewMarketNotification: 1.6683937856886584,
      CommentNotification: 1.6683937856886584,
      BetReplyNotification: 1.6683937856886584,
      AnswerNotification: 1.6683937856886584,
      TaggedUserNotification: 1.6683937856886584,
      MultipleAvatarIcons: 1.6683937856886584,
      UserLikeNotification: 1.6683937856886584,
      FollowNotification: 1.6683937856886584,
      LiquidityNotification: 1.6683937856886584,
      ReferralProgramNotification: 1.6683937856886584,
      FollowFromReferralNotification: 1.6683937856886584,
      FollowSuggestionNotification: 1.6683937856886584,
      WeeklyUpdateNotification: 1.6683937856886584,
      BountyAwardedNotification: 1.6683937856886584,
      BountyAddedNotification: 1.6683937856886584,
      BountyCanceledNotification: 1.6683937856886584,
      VotedNotification: 1.6683937856886584,
      ReviewNotification: 1.6683937856886584,
      PollClosedNotification: 1.6683937856886584,
      AirdropNotification: 1.6683937856886584,
      ManifestAirdropNotification: 1.6683937856886584,
      ExtraPurchasedManaNotification: 1.6683937856886584,
      PaymentSuccessNotification: 1.6683937856886584,
    },
    'web/components/notifications/watched-markets.tsx': {
      UserWatchedContractsButton: 1.5623430524896642,
    },
    'web/components/notifications-icon.tsx': {
      NotificationsIcon: 1.1325915264289539,
      UnseenNotificationsBubble: 1.1325915264289539,
    },
    'web/components/numeric-resolution-panel.tsx': {
      getNumericResolveButtonColor: 1.5728640000000005,
      getNumericResolveButtonLabel: 1.5728640000000005,
      NumericResolutionPanel: 1.5728640000000005,
    },
    'web/components/og/graph.tsx': {
      ProfitLossGraph: 1.383166740610199,
      Sparkline: 1.383166740610199,
      ProbGraph: 1.383166740610199,
    },
    'web/components/og/og-market.tsx': {
      OgMarket: 1.9981394576332503,
      Answer: 1.1801333520057247,
      EndValue: 1.1801333520057247,
      Resolution: 1.1801333520057247,
      BountyLeft: 1.1801333520057247,
    },
    'web/components/og/og-weekly-update.tsx': {
      OgWeeklyUpdate: 1.8563972633950891,
      ProfitDiv: 1.0964181287424493,
    },
    'web/components/og/utils.tsx': {
      classToTw: 1.884442272491921,
      replaceTw: 0.8979468397604247,
    },
    'web/components/onboarding/twomba-welcome.tsx': {
      TwombaWelcomePage: 1.5122778136883717,
      TwombaCoinsPage: 1.5122778136883717,
      CosmeticTwombaToggle: 1.5122778136883717,
    },
    'web/components/onboarding/welcome.tsx': {
      Welcome: 1.7293558417950663,
      increasePage: 1.7293558417950663,
      decreasePage: 1.7293558417950663,
      WhatIsManifoldPage: 1.7293558417950663,
      PredictionMarketPage: 1.7293558417950663,
      TopicsPage: 1.7293558417950663,
    },
    'web/components/onboarding-verify-phone.tsx': {
      OnboardingVerifyPhone: 2.1696276538650596,
    },
    'web/components/outcome-label.tsx': {
      OutcomeLabel: 0.9506109188718593,
      BinaryOutcomeLabel: 0.9506109188718593,
      PseudoNumericOutcomeLabel: 0.9506109188718593,
      StonkOutcomeLabel: 0.9506109188718593,
      BinaryContractOutcomeLabel: 0.9506109188718593,
      MultiOutcomeLabel: 0.9506109188718593,
      YesLabel: 0.9506109188718593,
      HigherLabel: 0.9506109188718593,
      LowerLabel: 0.9506109188718593,
      BuyLabel: 0.9506109188718593,
      ShortLabel: 0.9506109188718593,
      NoLabel: 0.9506109188718593,
      CancelLabel: 0.9506109188718593,
      ProbLabel: 0.9506109188718593,
      MultiLabel: 0.9506109188718593,
      ProbPercentLabel: 0.9506109188718593,
      NumericValueLabel: 0.9506109188718593,
      MultiNumericValueLabel: 0.9506109188718593,
      BetOutcomeLabel: 0.9506109188718593,
    },
    'web/components/play-money-disclaimer.tsx': {
      PlayMoneyDisclaimer: 0.6683386856856337,
    },
    'web/components/poll/poll-panel.tsx': {
      PollPanel: 1.3974021078165644,
      SeeVotesButton: 1.3974021078165644,
      SeeVotesModalContent: 1.3974021078165644,
      VoteButton: 1.3974021078165644,
    },
    'web/components/portfolio/balance-change-table.tsx': {
      BalanceChangeTable: 2.6609875766108804,
      RenderBalanceChanges: 2.6609875766108804,
      ChangeIcon: 2.6609875766108804,
    },
    'web/components/portfolio/portfolio-chart.tsx': {
      PortfolioChart: 2.4276289512360334,
    },
    'web/components/portfolio/portfolio-graph-number.tsx': {
      PortfolioGraphNumber: 1.2228392428178616,
    },
    'web/components/portfolio/portfolio-summary.tsx': {
      PortfolioSummary: 1.383166740610199,
    },
    'web/components/portfolio/portfolio-tabs.tsx': {
      PortfolioTab: 0.9610357783828033,
    },
    'web/components/portfolio/portfolio-value-graph.tsx': {
      MANA_COLOR: 1.509852346507954,
      SPICE_COLOR: 1.509852346507954,
      PortfolioTooltip: 1.509852346507954,
      PortfolioGraph: 1.509852346507954,
      usePortfolioPointsFromHistory: 1.509852346507954,
    },
    'web/components/portfolio/portfolio-value-section.tsx': {
      emptyGraphValues: 1.687523367524089,
      PortfolioValueSection: 1.687523367524089,
      updateGraphValues: 6.46863709080002,
      onSetPortfolioFocus: 1.687523367524089,
      PortfolioValueSkeleton: 1.687523367524089,
      togglePortfolioFocus: 1.687523367524089,
      displayAmounts: 1.687523367524089,
    },
    'web/components/portfolio/profit-widget.tsx': {
      ProfitWidget: 1.460497366613662,
    },
    'web/components/portfolio/stacked-data-area.tsx': {
      StackedArea: 1.6108530167434152,
    },
    'web/components/portfolio/twomba-portfolio-graph.tsx': {
      MANA_COLOR: 1.415469717699802,
      CASH_COLOR: 1.415469717699802,
      PortfolioTooltip: 1.415469717699802,
      TwombaPortfolioGraph: 1.415469717699802,
      TwombaProfitGraph: 1.415469717699802,
      usePortfolioPointsFromHistory: 1.415469717699802,
      getProfit: 1.415469717699802,
      getNetworth: 1.415469717699802,
    },
    'web/components/portfolio/twomba-portfolio-value-section.tsx': {
      emptyGraphValues: 1.5410856939171689,
      TwombaPortfolioValueSection: 1.5410856939171689,
      updateGraphValues: 5.907310246257425,
      onSetPortfolioFocus: 1.5410856939171689,
      noHistoryGraphElement: 1.5410856939171689,
      TwombaPortfolioValueSkeleton: 1.5410856939171689,
      togglePortfolioFocus: 1.5410856939171689,
      displayAmounts: 1.5410856939171689,
    },
    'web/components/preview/preview-yes-no-selector.tsx': {
      PreviewYesNoSelector: 1.2047221043312524,
      YesNoCancelSelector: 1.2047221043312524,
      ChooseCancelSelector: 1.2047221043312524,
      BuyButton: 1.2047221043312524,
      NumberCancelSelector: 1.2047221043312524,
    },
    'web/components/profile/add-funds-button.tsx': {
      AddFundsButton: 0.9141273637244215,
    },
    'web/components/profile/betting-streak-modal.tsx': {
      BettingStreakModal: 1.2228392428178616,
      hasCompletedStreakToday: 2.566265462043171,
    },
    'web/components/profile/block-user.tsx': {
      BlockUser: 1.2756477605939975,
    },
    'web/components/profile/blocked-user.tsx': {
      BlockedUser: 1.167644816903771,
    },
    'web/components/profile/delete-yourself.tsx': {
      DeleteYourselfButton: 1.2756477605939975,
    },
    'web/components/profile/edit-profile.tsx': {
      EditUserField: 1.7999706284214612,
      EditProfile: 1.7999706284214612,
    },
    'web/components/profile/loans-modal.tsx': {
      LoansModal: 1.4068123293448922,
    },
    'web/components/profile/redeem-spice-button.tsx': {
      RedeemSpiceButton: 0.9378748862299282,
    },
    'web/components/profile/redeem-sweeps-buttons.tsx': {
      RedeemSweepsButtons: 0.8773016239829952,
    },
    'web/components/profile/report-user.tsx': {
      ReportUser: 1.5623430524896642,
    },
    'web/components/profile/settings.tsx': {
      AccountSettings: 1.6645627960505192,
    },
    'web/components/profile/user-contracts-list.tsx': {
      UserContractsList: 1.5074229767179046,
      MarketStats: 1.5074229767179046,
    },
    'web/components/profile/user-liked-contracts-button.tsx': {
      UserLikedContractsButton: 1.482910400378931,
    },
    'web/components/profit-badge.tsx': {
      ProfitBadge: 0.9982146125317947,
    },
    'web/components/progress-bar.tsx': {
      ProgressBar: 0.8694332890429263,
    },
    'web/components/push-notifications-modal.tsx': {
      PushNotificationsModal: 2.4869163448415397,
    },
    'web/components/redeem-spice-modal.tsx': {
      RedeemSpiceModal: 1.8489980983267675,
      MainSpiceRedeemPage: 1.8489980983267675,
      AllSpiceToManaButton: 1.8489980983267675,
    },
    'web/components/registration-verify-phone.tsx': {
      RegistrationVerifyPhone: 2.013566270929269,
    },
    'web/components/relative-timestamp.tsx': {
      RelativeTimestamp: 1.0152793463081975,
      RelativeTimestampNoTooltip: 1.0152793463081975,
    },
    'web/components/reports-icon.tsx': {
      ReportsIcon: 1.1426592046555268,
    },
    'web/components/resolution-panel.tsx': {
      getResolveButtonColor: 1.8929421170170908,
      getResolveButtonLabel: 1.8929421170170908,
      ResolutionPanel: 1.8929421170170908,
      ResolveHeader: 1.8929421170170908,
      MiniResolutionPanel: 1.8929421170170908,
      ResolutionExplainer: 1.8929421170170908,
    },
    'web/components/reviews/review.tsx': {
      Review: 1.1293509145611742,
    },
    'web/components/reviews/stars.tsx': {
      ReviewPanel: 1.2001500874418003,
      StarRating: 1.2001500874418003,
      StarDisplay: 1.2001500874418003,
    },
    'web/components/reviews/user-reviews.tsx': {
      shorten: 1.052761948779594,
      UserReviews: 1.052761948779594,
      RatingDisplay: 1.052761948779594,
      UserReviewsModal: 1.052761948779594,
    },
    'web/components/search/contract-filters.tsx': {
      ContractFilters: 2.1753845742644926,
      FilterModal: 2.1753845742644926,
      ToggleButton: 2.1753845742644926,
      BestHotToggle: 2.1753845742644926,
    },
    'web/components/search/filter-pills.tsx': {
      FilterPill: 1.447895773283736,
      AdditionalFilterPill: 1.447895773283736,
      TierDropdownPill: 1.447895773283736,
      FilterDropdownPill: 1.447895773283736,
      TopicDropdownPill: 1.447895773283736,
    },
    'web/components/search/query-topics.ts': {
      useTrendingTopics: 2.0007707880986083,
      useUserTrendingTopics: 1.6142092739606555,
    },
    'web/components/search/search-dropdown-helpers.tsx': {
      generateFilterDropdownItems: 1.016392576747178,
      getLabelFromValue: 1.4914243761894126,
    },
    'web/components/search/user-results.tsx': {
      MAX_SHOWN: 0.812223477046558,
      MAX_SHOWN_MOBILE: 0.812223477046558,
      UserResults: 0.812223477046558,
    },
    'web/components/select-users.tsx': {
      SelectUsers: 2.4310234468832266,
    },
    'web/components/sign-up-prompt.tsx': {
      BetSignUpPrompt: 0.926819000236832,
    },
    'web/components/simple-contract-row.tsx': {
      SimpleContractRow: 1.3746947334735815,
    },
    'web/components/sized-container.tsx': {
      SizedContainer: 1.0320619600624765,
    },
    'web/components/stats/bonus-summary.tsx': {
      BonusSummary: 2.1743734728506974,
    },
    'web/components/stats/mana-summary.tsx': {
      ManaSupplySummary: 2.2538286803404386,
    },
    'web/components/styles/colors.tsx': {
      ColorSection: 1.8040383638428985,
    },
    'web/components/supabase-search.tsx': {
      SORTS: 1.3809292086939147,
      predictionMarketSorts: 1.3809292086939147,
      bountySorts: 1.3809292086939147,
      BOUNTY_MARKET_SORTS: 1.3809292086939147,
      POLL_SORTS: 1.3809292086939147,
      PREDICTION_MARKET_SORTS: 1.3809292086939147,
      PREDICTION_MARKET_PROB_SORTS: 1.3809292086939147,
      FILTERS: 1.3809292086939147,
      CONTRACT_TYPES: 1.3809292086939147,
      DEFAULT_SORT: 1.3809292086939147,
      DEFAULT_SORTS: 1.3809292086939147,
      DEFAULT_BOUNTY_SORTS: 1.3809292086939147,
      DEFAULT_POLL_SORTS: 1.3809292086939147,
      DEFAULT_FILTERS: 1.3809292086939147,
      DEFAULT_FILTER: 1.3809292086939147,
      DEFAULT_CONTRACT_TYPE: 1.3809292086939147,
      DEFAULT_CONTRACT_TYPES: 1.3809292086939147,
      DEFAULT_TIER: 1.3809292086939147,
      QUERY_KEY: 1.3809292086939147,
      SORT_KEY: 1.3809292086939147,
      SEARCH_TYPE_KEY: 1.3809292086939147,
      PRIZE_MARKET_KEY: 1.3809292086939147,
      FOR_YOU_KEY: 1.3809292086939147,
      MARKET_TIER_KEY: 1.3809292086939147,
      TOPIC_FILTER_KEY: 1.3809292086939147,
      SWEEPIES_KEY: 1.3809292086939147,
      SupabaseSearch: 1.3809292086939147,
    },
    'web/components/sweeps-explainer.tsx': {
      SweepsExplainer: 1.3871356633754326,
    },
    'web/components/sweestakes-context.tsx': {
      SweepstakesProvider: 0.9080934537986718,
      useSweepstakes: 2.7964207053551484,
    },
    'web/components/switch-setting.tsx': {
      SwitchSetting: 1.201294722978504,
    },
    'web/components/testimonials-panel.tsx': {
      TestimonialsPanel: 1.5728640000000005,
      Testimonial: 1.5728640000000005,
      getNextPageNumber: 1.5728640000000005,
      PaginationCircle: 1.5728640000000005,
    },
    'web/components/tiers/tier-tooltip.tsx': {
      TierTooltip: 1.0380372802652518,
      getPresentedTierName: 2.477062508529198,
      TierIcon: 1.0380372802652518,
    },
    'web/components/topics/add-contract-to-group-modal.tsx': {
      AddContractToGroupModal: 1.0380372802652518,
      onSubmit: 2.897950406592253,
      AddContractToGroupButton: 1.0380372802652518,
    },
    'web/components/topics/add-market-modal.tsx': {
      AddMarketToGroupModal: 1.2047221043312524,
      NewContractFromGroup: 1.2047221043312524,
    },
    'web/components/topics/browse-topic-pills.tsx': {
      BrowseTopicPills: 1.0693418970970139,
    },
    'web/components/topics/contract-topics-list.tsx': {
      ContractTopicsList: 1.3096710042337203,
    },
    'web/components/topics/create-topic-modal.tsx': {
      CreateTopicModal: 1.6176642649532942,
    },
    'web/components/topics/delete-topic-modal.tsx': {
      DeleteTopicModal: 1.334619360341038,
    },
    'web/components/topics/editable-topic-name.tsx': {
      EditableTopicName: 1.0997557867788652,
    },
    'web/components/topics/questions-topic-title.tsx': {
      QuestionsTopicTitle: 1.8402434114948172,
    },
    'web/components/topics/topic-dropdown.tsx': {
      TopicDropdown: 1.1629270407744765,
      blockGroup: 1.9690066402842255,
      unBlockGroup: 1.9690066402842255,
    },
    'web/components/topics/topic-options.tsx': {
      TopicOptions: 1.4171948490136521,
      getAddContractToGroupPermission: 2.9741425255771965,
    },
    'web/components/topics/topic-privacy-modal.tsx': {
      PrivacyStatusView: 1.020230859966482,
      PRIVACY_STATUS_ITEMS: 1.020230859966482,
    },
    'web/components/topics/topic-selector.tsx': {
      TopicSelector: 2.086639893703023,
    },
    'web/components/topics/topic-tag.tsx': {
      TopicTag: 1.1195728005201988,
    },
    'web/components/topics/topics-button.tsx': {
      FollowOrUnfolowTopicButton: 1.1486574569170744,
      internalFollowTopic: 1.9448461346083015,
      internalUnfollowTopic: 1.9448461346083015,
    },
    'web/components/topics/your-topics.tsx': {
      YourTopicsSection: 1.716592893623786,
    },
    'web/components/trust-panel.tsx': {
      TrustPanel: 1.4213910848314766,
      ManipulationAndHype: 1.4213910848314766,
      LowTraders: 1.4213910848314766,
      WhyNotAlternatives: 1.4213910848314766,
    },
    'web/components/tv/schedule-tv-modal.tsx': {
      ScheduleTVModal: 2.463595783671405,
    },
    'web/components/tv/tv-display.tsx': {
      TVDisplay: 2.0813639310407592,
    },
    'web/components/tv/tv-page.tsx': {
      TVPage: 1.5902442403243604,
    },
    'web/components/tv/tv-schedule-page.tsx': {
      TVSchedulePage: 1.326355383915488,
      ScheduleRow: 1.326355383915488,
    },
    'web/components/tv/tv-schedule.ts': {
      filterSchedule: 1.4203147984022608,
      useTVSchedule: 1.4203147984022608,
      useTVisActive: 0.8388608000000003,
      getActiveStream: 1.4203147984022608,
    },
    'web/components/tv-icon.tsx': {
      LiveTVIcon: 0.7642745267611636,
    },
    'web/components/twomba/toggle-verify-callout.tsx': {
      ToggleVerifyCallout: 1.1739056919017192,
      InBeta: 1.1739056919017192,
      CalloutFrame: 1.1739056919017192,
      VerifyButton: 1.1739056919017192,
      useKYCGiftAmount: 1.9875951124866678,
    },
    'web/components/twomba/twomba-toggle.tsx': {
      TwombaToggle: 0.9378748862299282,
    },
    'web/components/twomba/us-only-disclaimer.tsx': {
      UsOnlyDisclaimer: 0.6291456000000002,
    },
    'web/components/twomba-portfolio-helpers.tsx': {
      getPortfolioValues: 1.7396910673913446,
    },
    'web/components/updated-terms-modal.tsx': {
      UpdatedTermsModal: 1.6159641443942998,
    },
    'web/components/us-elections/ candidates/candidate-data.ts': {
      CANDIDATE_DATA: 1.8301781942906024,
    },
    'web/components/us-elections/article.tsx': {
      PoliticsArticle: 0.9495259526607583,
    },
    'web/components/us-elections/contracts/candidates-panel/candidate-bar.tsx':
      {
        removeTextInParentheses: 2.187203309608391,
        CandidateBar: 0.8381894427095811,
        PercentChangeToday: 0.8381894427095811,
        BubblePercentChange: 0.8381894427095811,
      },
    'web/components/us-elections/contracts/candidates-panel/candidates-panel.tsx':
      {
        CandidatePanel: 0.9419177918438469,
        getCandidateColor: 1.594805453579659,
        CandidateAnswer: 0.9419177918438469,
      },
    'web/components/us-elections/contracts/candidates-panel/candidates-user-position.tsx':
      {
        UserPosition: 0.9862948441069882,
        BinaryUserPosition: 0.9862948441069882,
      },
    'web/components/us-elections/contracts/candidates-panel/small-candidate-bar.tsx':
      {
        SmallCandidateBar: 1.0945124489381348,
      },
    'web/components/us-elections/contracts/candidates-panel/small-candidate-panel.tsx':
      {
        SmallCandidatePanel: 0.9070047033687374,
        SmallCandidateAnswer: 0.9070047033687374,
      },
    'web/components/us-elections/contracts/choice-mini-graph.tsx': {
      ChoiceMiniGraph: 1.326355383915488,
    },
    'web/components/us-elections/contracts/conditional-market/conditional-market.tsx':
      {
        Policy: 0.8749925351984353,
        ConditionalPercent: 0.8749925351984353,
        MobilePolicy: 0.8749925351984353,
        BinaryBetButton: 0.8749925351984353,
        closePanel: 0.8749925351984353,
      },
    'web/components/us-elections/contracts/conditional-market/conditional-markets.tsx':
      {
        ConditionalMarkets: 0.8852267139905274,
      },
    'web/components/us-elections/contracts/party-panel/binary-party-panel.tsx':
      {
        BinaryPartyPanel: 1.1108493587789108,
        getPartyColor: 1.1108493587789108,
        BinaryPartyAnswer: 1.1108493587789108,
        BinaryPartyAnswerSnippet: 1.1108493587789108,
        BinaryBetButton: 1.1108493587789108,
      },
    'web/components/us-elections/contracts/party-panel/party-panel.tsx': {
      PartyPanel: 1.1808109267083817,
      getPartyColor: 1.1808109267083817,
      PartyAnswer: 1.1808109267083817,
      PartyAnswerSnippet: 1.1808109267083817,
    },
    'web/components/us-elections/contracts/politics-card.tsx': {
      PoliticsCard: 1.3834846734360533,
      extractPhrase: 1.3834846734360533,
    },
    'web/components/us-elections/contracts/state-contract-card.tsx': {
      StateContractCard: 1.1863283203031452,
      ChooseStateButton: 1.1863283203031452,
    },
    'web/components/us-elections/contracts/which-party-card.tsx': {
      WhichPartyCard: 1.6438247401783135,
    },
    'web/components/us-elections/probability-needle.tsx': {
      ProbabilityNeedle: 2.133536533315669,
    },
    'web/components/usa-map/electoral-college-visual.tsx': {
      ElectoralCollegeVisual: 1.4630046600759508,
      sortByDemocraticDiff: 3.0702795580141005,
    },
    'web/components/usa-map/governor-state.tsx': {
      GovernorState: 0.994766537936616,
    },
    'web/components/usa-map/homepage-map.tsx': {
      HomepageMap: 1.4786674434697678,
      handleClick: 4.553469951750323,
      onMouseEnter: 4.883425056298871,
      onMouseLeave: 4.3560214287952626,
      MapTab: 1.4786674434697678,
      MapTabButton: 1.4786674434697678,
    },
    'web/components/usa-map/house-bar.tsx': {
      HouseBar: 1.4903065081074838,
    },
    'web/components/usa-map/house-table-helpers.tsx': {
      HouseStatus: 1.5367989382033194,
      HouseBettor: 1.5367989382033194,
      HouseBetPanel: 1.5367989382033194,
      HouseBuyPanel: 1.5367989382033194,
      BuyPanelBody: 1.5367989382033194,
      onBetChange: 1.5367989382033194,
      submitBet: 1.5367989382033194,
      houseProbToColor: 3.2251451369255886,
      interpolateColor: 3.6672546404096167,
    },
    'web/components/usa-map/house-table.tsx': {
      HouseTable: 1.776400397353345,
      HouseRow: 1.776400397353345,
      extractDistrictInfo: 1.776400397353345,
    },
    'web/components/usa-map/presidential-state.tsx': {
      PresidentialState: 1.0485760000000004,
    },
    'web/components/usa-map/senate-bar.tsx': {
      SenateBar: 1.5363218936665415,
      StateBar: 1.5363218936665415,
    },
    'web/components/usa-map/senate-state.tsx': {
      SenateState: 1.1486574569170744,
      getSenateFill: 1.1486574569170744,
      SenateCurrentOrContract: 1.1486574569170744,
      SenateCurrentCard: 1.1486574569170744,
      extractStateFromSenateContract: 1.1486574569170744,
    },
    'web/components/usa-map/state-contract.tsx': {
      StateContract: 1.0509035855499171,
      EmptyStateContract: 1.0509035855499171,
      SwingStateContract: 1.0509035855499171,
      SwingStateRow: 1.0509035855499171,
      SwingStatePercent: 1.0509035855499171,
      extractStateFromPresidentContract: 1.0509035855499171,
      extractBeforeGovernorsRace: 1.0509035855499171,
      SwingStates: 1.0509035855499171,
    },
    'web/components/usa-map/state-election-map.tsx': {
      DEM_LIGHT_HEX: 0.6318285358388062,
      REP_LIGHT_HEX: 0.6318285358388062,
      DEM_COLOR: 0.6318285358388062,
      REP_COLOR: 0.6318285358388062,
      DEM_DARK_HEX: 0.6318285358388062,
      REP_DARK_HEX: 0.6318285358388062,
      COLOR_MIXED_THRESHOLD: 0.6318285358388062,
      hexToRgb: 1.6487173355755087,
      probToColor: 1.861310096190298,
      interpolateColor: 1.5077288722667799,
      calculateLuminance: 0.6318285358388062,
      isColorLight: 1.069778704052793,
    },
    'web/components/usa-map/usa-map-data.ts': {
      DATA: 3.0678688912276817,
    },
    'web/components/usa-map/usa-map.tsx': {
      SELECTED_OUTLINE_COLOR: 1.2362528716280665,
      HIGHLIGHTED_OUTLINE_COLOR: 1.2362528716280665,
      USAMap: 1.2362528716280665,
    },
    'web/components/usa-map/usa-state.tsx': {
      OFFSET_TEXT_COLOR: 1.2617816122529482,
      DEFAULT_STATE_FILL: 1.2617816122529482,
      USAState: 1.2617816122529482,
      StateText: 1.2617816122529482,
    },
    'web/components/user/user-handles.tsx': {
      UserHandles: 1.1486574569170744,
    },
    'web/components/user/user-hovercard.tsx': {
      UserHovercard: 1.7420252847366373,
    },
    'web/components/user/verify-phone-number-banner.tsx': {
      VerifyPhoneNumberBanner: 0.9300264228417316,
      VerifyPhoneModal: 0.9300264228417316,
    },
    'web/components/user-from-id.tsx': {
      UserFromId: 0.6935678316877163,
    },
    'web/components/widgets/alert-box.tsx': {
      AlertBox: 0.8773016239829952,
    },
    'web/components/widgets/amount-input.tsx': {
      AmountInput: 1.8378519310673191,
      formatAmountString: 1.8378519310673191,
      ClearInputButton: 1.8378519310673191,
      BuyAmountInput: 1.8378519310673191,
    },
    'web/components/widgets/avatar.tsx': {
      Avatar: 1.2107912717315625,
      EmptyAvatar: 1.2107912717315625,
    },
    'web/components/widgets/bucket-input.tsx': {},
    'web/components/widgets/card.tsx': {
      Card: 0.6795549158573723,
    },
    'web/components/widgets/carousel.tsx': {
      Carousel: 1.2970168813462997,
      ControlledCarousel: 1.2970168813462997,
      useCarousel: 2.1960404757901406,
    },
    'web/components/widgets/checkbox.tsx': {
      Checkbox: 0.9724093787532907,
    },
    'web/components/widgets/checked-dropdown.tsx': {
      CheckedDropdownMenu: 1.482910400378931,
    },
    'web/components/widgets/choices-toggle-group.tsx': {
      ChoicesToggleGroup: 1.2406918549286932,
    },
    'web/components/widgets/click-frame.tsx': {
      ClickFrame: 0.9610357783828033,
    },
    'web/components/widgets/coin-number.tsx': {
      CoinNumber: 1.2465859111683457,
      AnimatedNumber: 1.2465859111683457,
    },
    'web/components/widgets/collapsible-content.tsx': {
      LINE_HEIGHT: 1.0093962428463996,
      SHOW_COLLAPSE_TRESHOLD: 1.0093962428463996,
      ShowMoreLessButton: 1.0093962428463996,
      CollapsibleContent: 1.0093962428463996,
      ActuallyCollapsibleContent: 1.0093962428463996,
    },
    'web/components/widgets/container.tsx': {
      Container: 0.7264747630389374,
    },
    'web/components/widgets/countdown.tsx': {
      Countdown: 0.64638565775772,
    },
    'web/components/widgets/customizeable-dropdown.tsx': {
      CustomizeableDropdown: 1.2495225133793793,
    },
    'web/components/widgets/datetime-tooltip.tsx': {
      DateTimeTooltip: 0.6795549158573723,
    },
    'web/components/widgets/edit-in-place.tsx': {
      EditInPlaceInput: 0.9141273637244215,
    },
    'web/components/widgets/editor.tsx': {
      renderHTML: 2.501286169272094,
      getEditorLocalStorageKey: 2.018021931990314,
      useTextEditor: 4.248978513145539,
      handlePaste: 1.191876261650761,
      handleDrop: 1.191876261650761,
      isValidIframe: 1.191876261650761,
      TextEditor: 1.191876261650761,
      RichContent: 1.191876261650761,
      Content: 1.191876261650761,
    },
    'web/components/widgets/expandable-content.tsx': {
      ExpandButton: 1.0641884121758143,
      ExpandableContent: 1.0641884121758143,
      ExpandsToModalContent: 1.0641884121758143,
    },
    'web/components/widgets/expanding-input.tsx': {
      ExpandingInput: 0.5931641601515725,
    },
    'web/components/widgets/external-link.tsx': {
      ExternalLink: 0.7705428469585844,
    },
    'web/components/widgets/fullscreen-confetti.tsx': {
      FullscreenConfetti: 0.5136952313057229,
    },
    'web/components/widgets/gradient-container.tsx': {
      GradientContainer: 0.64638565775772,
    },
    'web/components/widgets/icon-toggle.tsx': {
      IconToggle: 1.0997557867788652,
    },
    'web/components/widgets/image-with-blurred-shadow.tsx': {
      ImageWithBlurredShadow: 0.49182573957726144,
    },
    'web/components/widgets/increment-button.tsx': {
      IncrementButton: 0.9724093787532907,
      IncrementDecrementButton: 0.9724093787532907,
      IncrementDecrementAmountButton: 0.9724093787532907,
    },
    'web/components/widgets/info-box.tsx': {
      InfoBox: 0.8773016239829952,
    },
    'web/components/widgets/info-tooltip.tsx': {
      InfoTooltip: 1.0057587670778319,
    },
    'web/components/widgets/input.tsx': {
      Input: 0.9724093787532907,
    },
    'web/components/widgets/linkify.tsx': {
      Linkify: 0.9761711312090045,
      getLinkTarget: 2.0486047317982665,
    },
    'web/components/widgets/loading-indicator.tsx': {
      getSizeClass: 0.7060065660165306,
      LoadingIndicator: 0.7060065660165306,
    },
    'web/components/widgets/news-topics-content-container.tsx': {
      NewsTopicsContentContainer: 0.7264747630389374,
    },
    'web/components/widgets/pagination.tsx': {
      PAGE_ELLIPSES: 1.095462644352907,
      PaginationNextPrev: 1.095462644352907,
      Pagination: 1.095462644352907,
      PaginationArrow: 1.095462644352907,
      PageNumbers: 1.095462644352907,
      getPageNumbers: 1.095462644352907,
    },
    'web/components/widgets/probability-input.tsx': {
      ProbabilityInput: 1.4630046600759508,
      ProbabilityOrNumericInput: 1.4630046600759508,
    },
    'web/components/widgets/qr-code.tsx': {
      QRCode: 0.7111788444385564,
    },
    'web/components/widgets/radio-toggle-group.tsx': {
      RadioToggleGroup: 1.3012485953018513,
    },
    'web/components/widgets/select.tsx': {
      Select: 0.6114196214089308,
    },
    'web/components/widgets/short-toggle.tsx': {
      ShortToggle: 1.167644816903771,
    },
    'web/components/widgets/site-link.tsx': {
      linkClass: 0.20971520000000007,
    },
    'web/components/widgets/slider.tsx': {
      Slider: 1.5740286532510313,
      RangeSlider: 1.5740286532510313,
    },
    'web/components/widgets/subtitle.tsx': {
      Subtitle: 0.6291456000000002,
    },
    'web/components/widgets/table.tsx': {
      Table: 0.663177691957744,
    },
    'web/components/widgets/title.tsx': {
      Title: 0.5931641601515725,
    },
    'web/components/widgets/toast-clipboard.tsx': {
      ToastClipboard: 0.663177691957744,
    },
    'web/components/widgets/tooltip.tsx': {
      Tooltip: 3.493271939051368,
    },
    'web/components/widgets/truncate.tsx': {
      truncateText: 1.9417988940381457,
    },
    'web/components/widgets/user-link.tsx': {
      isFresh: 0.9050614137687677,
      shortenName: 0.9050614137687677,
      UserAvatarAndBadge: 0.9050614137687677,
      UserLink: 0.9050614137687677,
      BotBadge: 0.9050614137687677,
      BannedBadge: 0.9050614137687677,
      UserBadge: 0.9050614137687677,
      CoreBadge: 0.9050614137687677,
      ModBadge: 0.9050614137687677,
      MVPBadge: 0.9050614137687677,
      VerifiedBadge: 0.9050614137687677,
      PartnerBadge: 0.9050614137687677,
      FreshBadge: 0.9050614137687677,
      MarketCreatorBadge: 0.9050614137687677,
      StackedUserNames: 0.9050614137687677,
    },
    'web/components/widgets/visibility-observer.tsx': {
      VisibilityObserver: 0.9221111604067992,
      LoadMoreUntilNotVisible: 0.9221111604067992,
    },
    'web/hooks/use-ab-test.ts': {
      useABTest: 1.1275239774018115,
    },
    'web/hooks/use-ad-timer.ts': {
      useAdTimer: 2.2984275633731714,
    },
    'web/hooks/use-additional-feed-items.ts': {
      IGNORE_COMMENT_FEED_CONTENT: 0.8825082075206633,
      groupCommentsByContractsAndParents: 0.8825082075206633,
    },
    'web/hooks/use-admin.ts': {
      useAdmin: 2.090045164195242,
      useAdminOrMod: 1.5826470179077103,
      useTrusted: 1.6543847999992767,
      useDev: 0.9096184882119875,
    },
    'web/hooks/use-animated-number.ts': {
      useAnimatedNumber: 1.5445053402279127,
    },
    'web/hooks/use-answers.ts': {
      useAnswersCpmm: 3.2805813219698408,
      useUniqueBettorCountOnAnswer: 2.6383721350315312,
    },
    'web/hooks/use-api-getter.ts': {
      useAPIGetter: 4.784061371368582,
      deepCopyWithoutKeys: 1.2480550759812916,
    },
    'web/hooks/use-api-subscription.ts': {
      useApiSubscription: 3.967082104115901,
    },
    'web/hooks/use-async-data.ts': {
      useAsyncData: 1.8916249942810572,
    },
    'web/hooks/use-bets.ts': {
      betShouldBeFiltered: 1.3107200000000006,
      useBetsOnce: 3.659214971506598,
      useContractBets: 3.1277637450070648,
      useSubscribeGlobalBets: 2.2192418725035328,
      useUnfilledBets: 2.750693099003066,
      useUnfilledBetsAndBalanceByUserId: 3.861263350569782,
    },
    'web/hooks/use-bounties.ts': {
      useBountyAwardCount: 1.2553927817123034,
    },
    'web/hooks/use-browser-os.ts': {
      useBrowserOS: 2.5803788524003055,
    },
    'web/hooks/use-call-refer-user.ts': {
      useCallReferUser: 0.6421190391321536,
    },
    'web/hooks/use-can-send-mana.ts': {
      useCanSendMana: 1.8237839935577378,
    },
    'web/hooks/use-chart-annotations.ts': {
      useAnnotateChartTools: 3.7466878955994423,
    },
    'web/hooks/use-chart-positions.ts': {
      useChartPositions: 2.893537390590292,
    },
    'web/hooks/use-comments.ts': {
      useNumContractComments: 2.0793285351496236,
      useCommentsOnContract: 1.6775891696416165,
      useCommentOnContract: 1.6775891696416165,
      useSubscribeGlobalComments: 1.6775891696416165,
      useGlobalComments: 1.6775891696416165,
      useSubscribeNewComments: 1.6775891696416165,
    },
    'web/hooks/use-contract.ts': {
      usePublicContracts: 2.42489293240732,
      useContracts: 3.225806806939429,
      useContract: 2.7573022240308567,
      useLiveAllNewContracts: 1.9563883494987477,
      useLiveContract: 3.225806806939429,
      useLiveContractWithAnswers: 4.2048378573106895,
    },
    'web/hooks/use-dashboard-follows.ts': {
      useUserFollowsDashboard: 1.3315451235021194,
    },
    'web/hooks/use-dashboard.ts': {
      useDashboardFromSlug: 2.23367009263591,
      useYourDashboards: 1.5848556998109395,
      useYourFollowedDashboards: 1.5848556998109395,
    },
    'web/hooks/use-debounced-effect.ts': {
      useDebouncedEffect: 1.7693303632351414,
    },
    'web/hooks/use-defined-search-params.ts': {
      useDefinedSearchParams: 2.1631512650938505,
    },
    'web/hooks/use-editable-user-info.ts': {
      useEditableUserInfo: 2.718005101726168,
    },
    'web/hooks/use-effect-check-equality.ts': {
      useEffectCheckEquality: 2.3367079958393706,
    },
    'web/hooks/use-event.ts': {
      useEvent: 4.189307941086515,
    },
    'web/hooks/use-focus.ts': {
      useFocus: 1.5322850422487806,
    },
    'web/hooks/use-follows.ts': {
      useFollows: 2.653995544852712,
      useFollowers: 2.334040491921728,
      useIsFollowing: 2.334040491921728,
      useFollowedIdsSupabase: 1.1121828002841982,
    },
    'web/hooks/use-force-update.ts': {
      useForceUpdate: 1.167020245960864,
    },
    'web/hooks/use-getter.ts': {
      useGetter: 1.1723436077874103,
    },
    'web/hooks/use-google-analytics.ts': {
      useGoogleAnalytics: 1.9280830627700234,
    },
    'web/hooks/use-group-supabase.ts': {
      useIsFollowingTopic: 1.5900265314931483,
      useMemberGroupIdsOnLoad: 1.5900265314931483,
      useTopicsWithContract: 1.5900265314931483,
      useNewUserMemberTopicsAndContracts: 0.9390952834751828,
      useGroupRole: 2.240957779511114,
      getTranslatedMemberRole: 0.9390952834751828,
      useGroupFromSlug: 1.5900265314931483,
      useGroupFromId: 0.9390952834751828,
      useGroupsFromIds: 1.9707969021312806,
      useListGroupsBySlug: 1.5900265314931483,
      useGroupsWhereUserHasRole: 1.5900265314931483,
    },
    'web/hooks/use-has-loaded.ts': {
      useHasLoaded: 1.2901894262001528,
    },
    'web/hooks/use-has-received-loan.ts': {
      useHasReceivedLoanToday: 2.6668959059942527,
    },
    'web/hooks/use-has-seen-contracts.ts': {
      useHasSeenContracts: 0.8494436448217154,
    },
    'web/hooks/use-hash-in-url-page-router.ts': {
      useHashInUrlPageRouter: 1.403571799185633,
    },
    'web/hooks/use-hash-in-url.ts': {
      useHashInUrl: 1.6003180727936406,
    },
    'web/hooks/use-header-is-stuck.ts': {
      useHeaderIsStuck: 1.8766582470042386,
    },
    'web/hooks/use-intersection.ts': {
      useIntersection: 1.0152793463081975,
    },
    'web/hooks/use-ios-purchases.ts': {
      useIosPurchases: 2.962587134395811,
    },
    'web/hooks/use-is-advanced-trader.ts': {
      useIsAdvancedTrader: 1.3375808609181,
    },
    'web/hooks/use-is-client.ts': {
      useIsClient: 1.869060168724795,
    },
    'web/hooks/use-is-eligible-for-loans.ts': {
      useIsEligibleForLoans: 0.9924751370863641,
    },
    'web/hooks/use-is-iframe.ts': {
      inIframe: 0.9924751370863641,
      useIsIframe: 1.2301473509220828,
    },
    'web/hooks/use-is-mobile.ts': {
      useIsMobile: 2.9994704297688206,
    },
    'web/hooks/use-is-visible.ts': {
      useIsVisible: 3.954736087614188,
    },
    'web/hooks/use-leagues.ts': {
      useLeagueInfo: 2.1128474601098923,
      useLeagueChats: 1.0067831354646346,
      useOwnedLeagueChats: 1.0067831354646346,
    },
    'web/hooks/use-likes.ts': {
      useLikesOnContent: 2.2984275633731714,
    },
    'web/hooks/use-link-previews.ts': {
      useLinkPreview: 1.9320233380971854,
      cachedLinkPreview: 0.9206194724626099,
    },
    'web/hooks/use-liquidity.ts': {
      useLiquidity: 1.6607285490581751,
    },
    'web/hooks/use-location.ts': {
      useLocation: 4.225694920219785,
    },
    'web/hooks/use-long-touch.ts': {
      useLongTouch: 2.60701890947663,
    },
    'web/hooks/use-mana-payments.ts': {
      useManaPayments: 1.9515873892570397,
      useAllManaPayments: 1.9515873892570397,
    },
    'web/hooks/use-measure-size.ts': {
      useMeasureSize: 1.945033743268107,
    },
    'web/hooks/use-mod-reports.ts': {
      useModReports: 2.451232766626018,
    },
    'web/hooks/use-monitor-status.ts': {
      useMonitorStatus: 4.314293547182621,
    },
    'web/hooks/use-multi-dashboard.ts': {
      useMultiDashboard: 3.122750116095188,
    },
    'web/hooks/use-mutation.ts': {
      useMutation: 2.9021719646187103,
    },
    'web/hooks/use-native-messages.ts': {
      useNativeMessages: 2.4227553790567407,
    },
    'web/hooks/use-notifications.ts': {
      useNotifications: 1.5026395656253893,
      useGroupedUnseenNotifications: 2.544189943936449,
      useGroupedNotifications: 2.544189943936449,
      groupNotificationsForIcon: 1.5026395656253893,
      groupGeneralNotifications: 1.5026395656253893,
      groupSpecificNotifications: 1.5026395656253893,
    },
    'web/hooks/use-page-visible.ts': {
      useIsPageVisible: 2.5833001392757753,
    },
    'web/hooks/use-pagination.ts': {
      getReducer: 1.6265607441273142,
      getInitialState: 1.6265607441273142,
      usePagination: 4.2444092726028355,
    },
    'web/hooks/use-partial-updater.ts': {
      usePartialUpdater: 1.2901894262001528,
    },
    'web/hooks/use-persistent-in-memory-state.ts': {
      isFunction: 1.4267729048397415,
      usePersistentInMemoryState: 4.458138235972972,
    },
    'web/hooks/use-persistent-local-state.ts': {
      usePersistentLocalState: 5.549418589032213,
    },
    'web/hooks/use-persistent-query-state.ts': {
      usePersistentQueriesState: 1.2480550759812916,
      usePersistentQueryState: 3.4842695764889107,
    },
    'web/hooks/use-persistent-state.ts': {
      historyStore: 1.869966440061912,
      inMemoryStore: 1.1044323030697722,
      usePersistentState: 1.869966440061912,
    },
    'web/hooks/use-persistent-supabase-polling.ts': {
      useLiveUpdates: 2.510785563424607,
    },
    'web/hooks/use-portfolio-history.ts': {
      usePortfolioHistory: 2.553808403747968,
      useCurrentPortfolio: 2.553808403747968,
    },
    'web/hooks/use-previous.ts': {
      usePrevious: 0.9415445862842275,
    },
    'web/hooks/use-private-messages.ts': {
      usePrivateMessages: 3.4706727791086434,
      useUnseenPrivateMessageChannels: 3.4706727791086434,
      useSortedPrivateMessageMemberships: 3.9464397148534194,
      useMessagesCount: 1.6537941752505967,
    },
    'web/hooks/use-public-chat-messages.ts': {
      usePublicChat: 2.28484935126878,
    },
    'web/hooks/use-query.ts': {
      useQuery: 1.3475589063104962,
    },
    'web/hooks/use-quest-status.ts': {
      useQuestStatus: 2.5303250453795223,
    },
    'web/hooks/use-redirect-if-signed-in.ts': {
      useRedirectIfSignedIn: 1.4670512362585486,
    },
    'web/hooks/use-redirect-if-signed-out.ts': {
      useRedirectIfSignedOut: 2.370961871356738,
    },
    'web/hooks/use-referrals.ts': {
      useReferrals: 0.7864320000000002,
    },
    'web/hooks/use-refresh-all-clients.ts': {
      useRefreshAllClients: 1.2155288341301886,
    },
    'web/hooks/use-related-contracts.ts': {
      useRelatedMarkets: 2.6668959059942527,
    },
    'web/hooks/use-reposts.ts': {
      useRepostsOnContract: 0.8494436448217154,
    },
    'web/hooks/use-request-new-user-signup-bonus.ts': {
      useRequestNewUserSignupBonus: 1.2388442115283642,
      useRemainingNewUserSignupBonuses: 1.2388442115283642,
    },
    'web/hooks/use-review.ts': {
      useReview: 1.5322850422487806,
    },
    'web/hooks/use-safe-layout-effect.ts': {
      useSafeLayoutEffect: 1.1848067431877392,
    },
    'web/hooks/use-save-binary-shares.ts': {
      useSaveBinaryShares: 3.727160659711958,
    },
    'web/hooks/use-save-campaign.ts': {
      useSaveCampaign: 2.4420773667067457,
    },
    'web/hooks/use-save-referral.ts': {
      useSaveReferral: 4.007836423090923,
    },
    'web/hooks/use-save-scroll.ts': {
      useSaveScroll: 1.8300337298251173,
    },
    'web/hooks/use-save-visits.ts': {
      useSaveContractVisitsLocally: 2.0430467229983744,
      getSavedContractVisitsLocally: 1.7967452084139952,
    },
    'web/hooks/use-saved-contract-metrics.ts': {
      useSavedContractMetrics: 3.8094319617830976,
      useReadLocalContractMetrics: 1.2931256450590307,
    },
    'web/hooks/use-state-check-equality.ts': {
      useStateCheckEquality: 2.5612723501180983,
    },
    'web/hooks/use-store.ts': {
      useStore: 1.6230362313310618,
      useStoreItems: 1.6230362313310618,
    },
    'web/hooks/use-theme.ts': {
      useTheme: 2.001423173008154,
      useThemeManager: 2.001423173008154,
    },
    'web/hooks/use-topic-from-router.ts': {
      useTopicFromRouter: 1.9781714834240858,
    },
    'web/hooks/use-tracking.ts': {
      useTracking: 2.052145476351375,
    },
    'web/hooks/use-user-bets.ts': {
      useUserContractBets: 2.295322407622369,
    },
    'web/hooks/use-user-supabase.ts': {
      useUserById: 2.001423173008154,
      useDisplayUserById: 4.723246305606317,
      useUsers: 3.300062841158392,
      useUsersInStore: 2.820773578812303,
      useDisplayUserByIdOrAnswer: 3.300062841158392,
    },
    'web/hooks/use-user.ts': {
      useUser: 6.06591052864594,
      usePrivateUser: 4.678037230607951,
      useIsAuthorized: 3.4586345179824702,
      useWebsocketUser: 2.3683044846949515,
      usePollUserBalances: 1.6803828254812982,
      useWebsocketPrivateUser: 1.6803828254812982,
      isBlocked: 2.923701422251128,
      useShouldBlockDestiny: 1.6803828254812982,
    },
    'web/hooks/use-users.ts': {
      useRecentlyActiveUsersAndPrivateUsers: 0.926819000236832,
    },
    'web/hooks/use-votes.ts': {
      useContractVoters: 1.3315451235021194,
      useOptionVoters: 1.3315451235021194,
    },
    'web/hooks/use-warn-unsaved-changes.ts': {
      useWarnUnsavedChanges: 2.301394961199003,
    },
    'web/hooks/use-window-size.ts': {
      useWindowSize: 1.5051630691687772,
    },
    'web/lib/api/api-key.ts': {
      generateNewApiKey: 1.1220670230177312,
    },
    'web/lib/api/api.ts': {
      call: 1.2032747377876472,
      api: 3.003190368216135,
      curriedAPI: 0.5042440519462774,
      createAnswer: 0.5042440519462774,
      claimDestinySub: 0.5042440519462774,
      createUser: 0.8537593948669623,
      swapCert: 0.5042440519462774,
      dividendCert: 0.5042440519462774,
      claimManalink: 0.8537593948669623,
      createGroup: 0.8537593948669623,
      updateGroup: 0.8537593948669623,
      acceptChallenge: 0.5042440519462774,
      boostMarket: 0.8537593948669623,
      redeemBoost: 0.8537593948669623,
      validateIapReceipt: 0.8537593948669623,
      markAllNotifications: 0.8537593948669623,
      updateMemberRole: 0.5042440519462774,
      updateGroupPrivacy: 0.5042440519462774,
      registerDiscordId: 0.8537593948669623,
      getUserIsFollowingTopic: 0.8537593948669623,
      completeQuest: 0.8537593948669623,
      getSupabaseToken: 0.8537593948669623,
      updateUserDisinterestEmbedding: 1.2032747377876472,
      searchContracts: 1.4077281068229432,
      deleteMarket: 0.8537593948669623,
      saveTopic: 0.5042440519462774,
      setTV: 0.8537593948669623,
      deleteTV: 0.8537593948669623,
      joinGroupThroughInvite: 0.5042440519462774,
      followTopic: 1.3157935462680064,
      searchGroups: 1.0582127639022583,
      leagueActivity: 0.8537593948669623,
      cancelBounty: 0.8537593948669623,
      searchGiphy: 0.8537593948669623,
      tweetFromManaChan: 0.8537593948669623,
      leaveReview: 0.5042440519462774,
      getUserContractsMetricsWithContracts: 0.8537593948669623,
      castPollVote: 0.8537593948669623,
      getSimilarGroupsToContract: 0.8537593948669623,
      bidForLeague: 0.8537593948669623,
      followUser: 1.3157935462680064,
      unfollowUser: 0.8537593948669623,
      report: 0.8537593948669623,
      createDashboard: 0.8537593948669623,
      getYourDashboards: 0.8537593948669623,
      followDashboard: 0.8537593948669623,
      supabaseSearchDashboards: 1.0582127639022583,
      getYourFollowedDashboards: 0.8537593948669623,
      updateDashboard: 1.0582127639022583,
      deleteDashboard: 1.0582127639022583,
      referUser: 1.0582127639022583,
      updateMarket: 1.6121814758582396,
      updateUser: 2.338475236430409,
      banUser: 1.0582127639022583,
      createPrivateMessageChannelWithUsers: 1.0582127639022583,
      sendUserPrivateMessage: 1.0582127639022583,
      leavePrivateMessageChannel: 0.8537593948669623,
      updatePrivateMessageChannel: 1.0582127639022583,
      editAnswerCpmm: 1.0582127639022583,
      createChartAnnotation: 0.8537593948669623,
      deleteChartAnnotation: 0.8537593948669623,
      getAdAnalytics: 0.8537593948669623,
      requestLoan: 0.8537593948669623,
    },
    'web/lib/api/cors.ts': {
      applyCorsHeaders: 0.5414823180310386,
      CORS_UNRESTRICTED: 0.5414823180310386,
    },
    'web/lib/api/proxy.ts': {
      getApiUrl: 3.684805671362959,
      getProxiedRequestUrl: 0.7142642335215059,
      getProxiedRequestHeaders: 0.7142642335215059,
      fetchBackend: 1.2093544731617483,
    },
    'web/lib/firebase/google-onetap-login.tsx': {
      handleResponse: 0.7633748507262211,
      GoogleOneTapSetup: 0.7633748507262211,
      GoogleOneTapLogin: 0.7633748507262211,
    },
    'web/lib/firebase/init.ts': {
      app: 0.3477733156171705,
      storage: 0.3477733156171705,
      privateStorage: 0.3477733156171705,
    },
    'web/lib/firebase/server-auth.ts': {
      authenticateOnServer: 0.9495259526607583,
      redirectIfLoggedIn: 1.6076871896160592,
      redirectIfLoggedOut: 2.650848069618462,
    },
    'web/lib/firebase/storage.ts': {
      uploadPublicImage: 2.8748215642821564,
      uploadPrivateImage: 2.039771834306704,
    },
    'web/lib/firebase/users.ts': {
      auth: 0.820305501748533,
      CACHED_REFERRAL_USERNAME_KEY: 0.820305501748533,
      writeReferralInfo: 1.38889794748334,
      setCachedReferralInfoForUser: 1.7215032064315308,
      firebaseLogin: 3.191293356849336,
      loginWithApple: 1.38889794748334,
      firebaseLogout: 1.38889794748334,
      isContractBlocked: 1.38889794748334,
      canSetReferrer: 1.7215032064315308,
    },
    'web/lib/icons/arrow-up-square-icon.svg': {},
    'web/lib/icons/bold-icon.svg': {},
    'web/lib/icons/comment-curve.svg': {},
    'web/lib/icons/corner-down-right-icon.svg': {},
    'web/lib/icons/discord-outline-icon.svg': {},
    'web/lib/icons/italic-icon.svg': {},
    'web/lib/icons/link-icon.svg': {},
    'web/lib/icons/logo-bunny.svg': {},
    'web/lib/icons/placeholder-graph.svg': {},
    'web/lib/icons/quote.svg': {},
    'web/lib/icons/scales-icon.svg': {},
    'web/lib/icons/squares-icon.svg': {},
    'web/lib/icons/squiggle-horizontal.svg': {},
    'web/lib/icons/squiggle-vertical.svg': {},
    'web/lib/icons/triangle-down-fill-icon.svg': {},
    'web/lib/icons/triangle-fill-icon.svg': {},
    'web/lib/icons/triangle-outline-icon.svg': {},
    'web/lib/icons/trophy-icon.svg': {},
    'web/lib/icons/twitter-logo.svg': {},
    'web/lib/icons/type-icon.svg': {},
    'web/lib/native/is-native.ts': {
      getIsNative: 2.451348103555381,
      getNativePlatform: 2.364582237945494,
      setIsNative: 1.10017111211678,
      setInstalledAppPlatform: 1.10017111211678,
    },
    'web/lib/native/native-messages.ts': {
      nativePassUsers: 0.5798410883682492,
      nativeSignOut: 0.718698083365598,
    },
    'web/lib/native/post-message.ts': {
      postMessageToNative: 2.7059349704538986,
    },
    'web/lib/politics/.news-dashboard.ts.swp': {},
    'web/lib/politics/home.ts': {
      ELECTION_PARTY_CONTRACT_SLUG: 1.2010658831396857,
      getElectionsPageProps: 2.0335813137046994,
      getStateContracts: 1.2010658831396857,
      getPolicyContracts: 1.2010658831396857,
    },
    'web/lib/politics/news-dashboard.ts': {
      getDashboardProps: 3.21019406620344,
    },
    'web/lib/service/analytics.ts': {
      track: 5.59133768864731,
      trackCallback: 2.8460651307752376,
      withTracking: 3.758516331345563,
      identifyUser: 2.0274845312950434,
      setUserProperty: 1.6357617537681344,
      setOnceUserProperty: 2.0274845312950434,
      trackShareEvent: 2.5209968660731805,
      insertUserEvent: 0.966107242506329,
    },
    'web/lib/service/stripe.ts': {
      checkoutURL: 0.8697616325523737,
    },
    'web/lib/supabase/admin-db.ts': {
      initSupabaseAdmin: 2.2442879349813807,
    },
    'web/lib/supabase/ads.ts': {
      getAdCanPayFunds: 1.501326597603391,
    },
    'web/lib/supabase/bets.ts': {
      useRecentlyBetOnContracts: 1.506471338054764,
      getTotalBetCount: 1.506471338054764,
      getBetPoints: 2.844718546847407,
    },
    'web/lib/supabase/chat-messages.ts': {
      usePaginatedScrollingMessages: 2.9741425255771965,
      useGroupedMessages: 2.9741425255771965,
    },
    'web/lib/supabase/comments.ts': {
      getComment: 2.483454227507749,
      getAllCommentRows: 1.2732006609835453,
      getCommentRows: 0.751972820556853,
      getNewCommentRows: 0.751972820556853,
      getRecentCommentsOnContracts: 1.2732006609835453,
      getNumContractComments: 1.2732006609835453,
    },
    'web/lib/supabase/contracts.ts': {
      getPublicContractIdsInTopics: 1.45538958113918,
      getRecentActiveContractsOnTopics: 1.45538958113918,
      getWatchedContracts: 1.45538958113918,
      getWatchedContractsCount: 1.45538958113918,
    },
    'web/lib/supabase/dashboards.ts': {},
    'web/lib/supabase/db.ts': {
      initSupabaseClient: 0.5028793835389159,
      updateSupabaseAuth: 0.8514488104006389,
      db: 0.5028793835389159,
    },
    'web/lib/supabase/feed-timeline/feed-market-movement-display.ts': {
      getMarketMovementInfo: 1.8126787412570884,
    },
    'web/lib/supabase/follows.ts': {
      getContractFollows: 0.5931641601515725,
      getUserIdFollows: 1.004314225369843,
      getUserFollowers: 1.004314225369843,
      getUserIsFollowing: 1.004314225369843,
    },
    'web/lib/supabase/group.ts': {
      MEMBER_LOAD_NUM: 0.64638565775772,
      getMemberRole: 1.0944260539868693,
      getGroupContractIds: 1.0944260539868693,
      getGroup: 1.35651288458917,
      getGroupFromSlug: 1.6867032414066476,
    },
    'web/lib/supabase/groups.ts': {
      getGroupContracts: 0.6510082600907501,
      getShouldBlockDestiny: 1.1022528000938892,
      getMemberGroupIds: 0.6510082600907501,
      getMemberGroupsCount: 0.6510082600907501,
      getGroupsWhereUserHasRole: 0.6510082600907501,
      getGroupBySlug: 0.6510082600907501,
      getGroups: 1.366213934650893,
      getGroupContractIds: 1.1022528000938892,
      listGroupsBySlug: 0.6510082600907501,
      unfollowTopic: 1.698765635188563,
    },
    'web/lib/supabase/leagues.ts': {
      getLeagueInfo: 1.145094398844172,
      getLeagueRows: 1.145094398844172,
      getLeagueChats: 1.145094398844172,
      getOwnedLeagueChats: 1.145094398844172,
    },
    'web/lib/supabase/liquidity.ts': {
      getLiquidtyDocs: 1.0321515409601223,
    },
    'web/lib/supabase/manalinks.ts': {
      getManalink: 1.506471338054764,
      getNumClaims: 1.506471338054764,
      getUserManalinks: 1.506471338054764,
      getUserManalinkClaims: 1.506471338054764,
    },
    'web/lib/supabase/notifications.ts': {
      setPushToken: 0.9724230673041507,
      handlePushNotificationPermissionStatus: 0.9724230673041507,
      setPushTokenRequestDenied: 0.5743287284585372,
    },
    'web/lib/supabase/polls.ts': {
      getUserVote: 1.1505864898195608,
      getContractVoters: 1.1505864898195608,
      getOptionVoters: 1.1505864898195608,
    },
    'web/lib/supabase/portfolio-history.ts': {},
    'web/lib/supabase/private-messages.ts': {
      getSortedChatMessageChannels: 1.0453233878662842,
      getTotalChatMessages: 1.0453233878662842,
    },
    'web/lib/supabase/reactions.ts': {
      unLike: 1.562238703922272,
      like: 1.2604043496697233,
      getLikedContracts: 1.2604043496697233,
      getLikedContractsCount: 1.2604043496697233,
    },
    'web/lib/supabase/referrals.ts': {
      getReferrals: 1.0780471250483972,
    },
    'web/lib/supabase/reviews.ts': {
      getUserRating: 1.1560524896587963,
      getAverageUserRating: 1.1560524896587963,
      getUserReviews: 1.1560524896587963,
      getMyReviewOnContract: 1.1560524896587963,
    },
    'web/lib/supabase/stats.ts': {
      getStats: 1.4261222972431047,
    },
    'web/lib/supabase/super-ban-user.ts': {
      superBanUser: 1.5272512346812903,
    },
    'web/lib/supabase/txns.ts': {
      getDonationsByCharity: 1.774143740050305,
      getDonationsPageQuery: 1.774143740050305,
      getMostRecentDonation: 1.4313679985552148,
    },
    'web/lib/supabase/user-events.ts': {
      getSeenContractIds: 0.9052766090622162,
    },
    'web/lib/supabase/users.ts': {
      getUserById: 1.8966247995362535,
      getUserByUsername: 1.8143829555718676,
      getFullUserByUsername: 1.042807563790652,
      getFullUserById: 1.469716181663453,
      getUserSafe: 1.042807563790652,
      getPrivateUserSafe: 1.469716181663453,
      searchUsers: 1.469716181663453,
      getDisplayUsers: 1.7194417143537388,
      getProfitRank: 1.042807563790652,
      getCreatorRank: 1.292533096480938,
      getTopTraders: 1.042807563790652,
      getTopCreators: 1.042807563790652,
      getTotalPublicContractsCreated: 1.042807563790652,
      getContractsCreatedProgress: 1.292533096480938,
      getRecentlyActiveUsers: 1.042807563790652,
    },
    'web/lib/twitch/link-twitch-account.ts': {
      postToBot: 0.7089667742449675,
      initLinkTwitchAccount: 0.7089667742449675,
      linkTwitchAccountRedirect: 1.487846384687878,
      updateBotEnabledForUser: 1.200385094923546,
      getOverlayURLForUser: 1.200385094923546,
      getDockURLForUser: 1.200385094923546,
    },
    'web/lib/util/cookie.ts': {
      setCookie: 1.480327988651859,
      getCookiesFromString: 1.3018655866018936,
      getCookie: 1.3018655866018936,
    },
    'web/lib/util/copy.ts': {
      copyToClipboard: 3.454409579493815,
    },
    'web/lib/util/device.ts': {
      isIOS: 1.44887443778729,
      isAndroid: 1.2833887311638468,
      isMac: 0.49182573957726144,
    },
    'web/lib/util/devtools.ts': {
      setupDevtoolsDetector: 1.7028976208012778,
      isOpen: 1.0057587670778319,
      paused: 1.0057587670778319,
    },
    'web/lib/util/formatNumber.ts': {
      shortenNumber: 1.7834411478907999,
      numberWithCommas: 0.6053956358657813,
    },
    'web/lib/util/local.ts': {
      getStorageProxy: 0.6827832234150341,
      safeLocalStorage: 0.6827832234150341,
      safeSessionStorage: 0.6827832234150341,
      newInMemoryStore: 0.6827832234150341,
    },
    'web/lib/util/minMax.ts': {
      findMinMax: 2.549628784033689,
    },
    'web/lib/util/roundToNearestFive.ts': {
      roundToNearestFive: 0.5390235625241986,
    },
    'web/lib/util/scroll.ts': {
      scrollIntoViewCentered: 1.1736409890068389,
    },
    'web/lib/util/shortenedFromNow.ts': {
      shortenedFromNow: 2.1418951903984955,
      simpleFromNow: 0.695546631234341,
      shortenedDuration: 0.695546631234341,
      durationFormat: 0.695546631234341,
    },
    'web/lib/util/time.ts': {
      fromNow: 1.8449812907624845,
      formatTime: 1.6110047525426345,
      formatTimeShort: 1.6999585039480372,
      formatJustTime: 0.977042680324626,
      getCountdownString: 1.3770282143227848,
      getCountdownStringHoursMinutes: 0.977042680324626,
    },
    'web/middleware.ts': {
      middleware: 0.9073048358003318,
      config: 0.9073048358003318,
    },
    'web/next-env.d.ts': {},
    'web/next.config.js': {
      redirects: 3.4523230217347862,
    },
    'web/package.json': {},
    'web/pages/404.tsx': {
      Custom404: 1.0152793463081975,
      Custom404Content: 1.0152793463081975,
    },
    'web/pages/[username]/[contractSlug].tsx': {
      getStaticProps: 2.1460156079312704,
      getStaticPaths: 2.1460156079312704,
      ContractPage: 2.1460156079312704,
      NonPrivateContractPage: 2.1460156079312704,
      ContractPageContent: 2.1460156079312704,
      YourTrades: 2.1460156079312704,
    },
    'web/pages/[username]/calibration.tsx': {
      getStaticProps: 1.4442751230221877,
      getStaticPaths: 1.4442751230221877,
      CalibrationPage: 1.4442751230221877,
      BetsTable: 1.4442751230221877,
      points: 1.4442751230221877,
      sortAndLimit: 1.4442751230221877,
    },
    'web/pages/[username]/index.tsx': {
      getStaticProps: 1.8728166201220668,
      getStaticPaths: 1.8728166201220668,
      UserPage: 1.8728166201220668,
      DeletedUser: 1.8728166201220668,
      UserProfile: 1.8728166201220668,
      ProfilePublicStats: 1.8728166201220668,
      FollowsDialog: 1.8728166201220668,
    },
    'web/pages/[username]/partner.tsx': {
      getStaticProps: 1.5721647939196608,
      getStaticPaths: 1.5721647939196608,
      UserPartner: 1.5721647939196608,
      UserPartnerDashboard: 1.5721647939196608,
    },
    'web/pages/_app.tsx': {
      firstLine: 2.0765710113511657,
      printBuildInfo: 2.0765710113511657,
      MyApp: 2.0765710113511657,
    },
    'web/pages/_document.tsx': {
      Document: 0.9808530339984685,
    },
    'web/pages/about.tsx': {
      AboutPage: 2.022080331191618,
    },
    'web/pages/add-funds.tsx': {
      AddFundsPage: 0.9451736335552323,
    },
    'web/pages/admin/index.tsx': {
      AdminPage: 1.195560586548754,
    },
    'web/pages/admin/journeys.tsx': {
      getMostRecentViewMillis: 2.1693108967783488,
      Journeys: 2.1693108967783488,
    },
    'web/pages/admin/redemptions.tsx': {
      AdminCashouts: 1.6645627960505192,
    },
    'web/pages/admin/reports.tsx': {
      getStaticProps: 1.9105964001369633,
      Reports: 1.9105964001369633,
    },
    'web/pages/admin/test-user.tsx': {
      TestUser: 1.7483255775790967,
    },
    'web/pages/ai/[[...slug]].tsx': {
      getStaticPaths: 1.4377349756540254,
      getStaticProps: 1.4377349756540254,
      MultiOrSingleDashboardPage: 1.4377349756540254,
      MultiDashboard: 1.4377349756540254,
    },
    'web/pages/api/og/Figtree-Light.ttf': {},
    'web/pages/api/og/Figtree-Medium.ttf': {},
    'web/pages/api/og/market.tsx': {
      config: 0.6221158195843861,
      getCardOptions: 1.053333645911043,
      handler: 1.3055799039546252,
    },
    'web/pages/api/og/update.tsx': {
      config: 0.49390786571576495,
      handler: 1.0365211164609427,
    },
    'web/pages/api/v0/_types.ts': {
      ValidationError: 0.635184087735273,
    },
    'web/pages/api/v0/_validate.ts': {
      validate: 2.4311472000607277,
    },
    'web/pages/api/v0/revalidate.ts': {
      handler: 1.8796393897842076,
    },
    'web/pages/browse/[[...slug]].tsx': {
      getStaticProps: 1.5951752420511767,
      getStaticPaths: 1.5951752420511767,
      BrowseGroupPage: 1.5951752420511767,
      GroupPageContent: 1.5951752420511767,
      GroupLeaderboard: 1.5951752420511767,
      useToTopUsers: 1.5951752420511767,
    },
    'web/pages/calibration.tsx': {
      getStaticProps: 2.306271341227308,
      CalibrationPage: 2.306271341227308,
      CalibrationChart: 2.306271341227308,
      WasabiCharts: 2.306271341227308,
    },
    'web/pages/cards/index.tsx': {
      CardsPage: 1.3591098317147445,
      clicksMatch: 1.3591098317147445,
      click: 1.3591098317147445,
    },
    'web/pages/charity/[charitySlug].tsx': {
      getStaticPaths: 1.2854605802814985,
      getStaticProps: 1.2854605802814985,
      CharityPageWrapper: 1.2854605802814985,
      CharityPage: 1.2854605802814985,
      Details: 1.2854605802814985,
      DonationBox: 1.2854605802814985,
    },
    'web/pages/charity/index.tsx': {
      getStaticProps: 1.4680064000000006,
      DonatedStats: 1.4680064000000006,
      Charity: 1.4680064000000006,
    },
    'web/pages/checkout.tsx': {
      FundsSelector: 4.18610398433675,
    },
    'web/pages/comments.tsx': {
      CommentsPage: 1.9441119362012063,
    },
    'web/pages/cowp.tsx': {},
    'web/pages/create.tsx': {
      Create: 1.2434581724207698,
    },
    'web/pages/dashboard/index.tsx': {
      DashboardPage: 0.7264747630389374,
    },
    'web/pages/discord-bot.tsx': {
      DiscordBot: 1.7682579538879508,
    },
    'web/pages/election/[[...slug]].tsx': {
      getStaticPaths: 0.6795549158573723,
      getStaticProps: 0.6795549158573723,
      Elections: 0.6795549158573723,
    },
    'web/pages/election/needle.tsx': {
      ElectionNeedle: 0.7188674878270127,
      ElectionNeedlePage: 0.7188674878270127,
      getStaticProps: 0.7188674878270127,
    },
    'web/pages/embed/[username]/[contractSlug].tsx': {
      getHistoryData: 1.2048264047603758,
      getStaticProps: 1.2048264047603758,
      getStaticPaths: 1.2048264047603758,
      ContractEmbedPage: 1.2048264047603758,
      ContractSmolView: 1.2048264047603758,
      FloatingQRCode: 1.2048264047603758,
    },
    'web/pages/embed/grid/[...slugs]/index.tsx': {
      getStaticProps: 0.3913085577017158,
      getStaticPaths: 0.3913085577017158,
      ContractGridPage: 0.3913085577017158,
    },
    'web/pages/explore.tsx': {
      Explore: 1.096627029978744,
    },
    'web/pages/gidx/register.tsx': {},
    'web/pages/home/index.tsx': {
      getStaticProps: 1.0693418970970139,
      Home: 1.0693418970970139,
    },
    'web/pages/index.tsx': {
      getServerSideProps: 2.4451164544929154,
      LandingPage: 2.4451164544929154,
    },
    'web/pages/lab.tsx': {
      LabsPage: 1.5891635441476757,
      LabCard: 1.5891635441476757,
      LabSection: 1.5891635441476757,
    },
    'web/pages/leaderboards.tsx': {
      getStaticProps: 2.524625015178295,
      Leaderboards: 2.524625015178295,
      useToTopUsers: 2.524625015178295,
    },
    'web/pages/leagues/[[...leagueSlugs]].tsx': {
      Leagues: 2.1726872581939394,
      LeaguesInnerPage: 2.1726872581939394,
    },
    'web/pages/link/[slug].tsx': {
      getServerSideProps: 1.3318703989047187,
      ClaimPage: 1.3318703989047187,
    },
    'web/pages/links.tsx': {
      getServerSideProps: 1.426217554016778,
      getManalinkUrl: 2.4147962304486095,
      LinkPage: 1.426217554016778,
      ManalinksDisplay: 1.426217554016778,
    },
    'web/pages/live.tsx': {
      LivePage: 1.25719845884729,
    },
    'web/pages/login.tsx': {
      isAppleDevice: 1.2239626599062576,
      GoogleIcon: 1.2239626599062576,
      AppleIcon: 1.2239626599062576,
      LoginPage: 1.2239626599062576,
    },
    'web/pages/mana-auction.tsx': {
      ManaAuctionPage: 3.8303535454492983,
    },
    'web/pages/manachan.tsx': {
      ManachanPage: 1.9964292250635893,
    },
    'web/pages/me.tsx': {
      getServerSideProps: 0.6421190391321536,
      MePage: 0.6421190391321536,
    },
    'web/pages/messages/[channelId].tsx': {
      PrivateMessagesPage: 1.8426317881151109,
      PrivateMessagesContent: 1.8426317881151109,
      PrivateChat: 1.8426317881151109,
      submitMessage: 1.8426317881151109,
    },
    'web/pages/messages/index.tsx': {
      MessagesPage: 1.2756477605939975,
      MessagesContent: 1.2756477605939975,
      MessageChannelRow: 1.2756477605939975,
    },
    'web/pages/my-calibration.tsx': {
      getServerSideProps: 0.6421190391321536,
      MyCalibrationPage: 0.6421190391321536,
    },
    'web/pages/newbies.tsx': {
      getStaticProps: 0.8426750616965795,
      Newbies: 0.8426750616965795,
    },
    'web/pages/news/[slug].tsx': {
      getStaticProps: 0.8256495680499811,
      getStaticPaths: 0.8256495680499811,
      NewsPage: 0.8256495680499811,
    },
    'web/pages/news/create.tsx': {
      CreateDashboard: 1.5025524535602925,
      submit: 3.5855324472177825,
    },
    'web/pages/news/index.tsx': {
      getStaticProps: 1.0964181287424493,
      News: 1.0964181287424493,
    },
    'web/pages/notifications.tsx': {
      NotificationsPage: 1.8812371067741573,
      NotificationsAppBanner: 1.8812371067741573,
      NotificationsContent: 1.8812371067741573,
      RenderNotificationGroups: 1.8812371067741573,
      NotificationsList: 1.8812371067741573,
      NotificationGroupItem: 1.8812371067741573,
      NotificationGroupItemComponent: 1.8812371067741573,
    },
    'web/pages/og-test/[contractSlug].tsx': {
      getStaticProps: 0.6827832234150341,
      OGTestPage: 0.6827832234150341,
      getStaticPaths: 0.6827832234150341,
      OriginalGangstaTestPage: 0.6827832234150341,
    },
    'web/pages/partner-explainer.tsx': {
      PartnerExplainer: 2.6148781874557763,
    },
    'web/pages/partner-leaderboard.tsx': {},
    'web/pages/payments.tsx': {
      Payments: 2.2601211849609606,
      UserPayments: 2.2601211849609606,
      PaymentsContent: 2.2601211849609606,
      PaymentsModal: 2.2601211849609606,
      QRModal: 2.2601211849609606,
    },
    'web/pages/post/[slug]/index.tsx': {
      getStaticProps: 0.8832257880055953,
      getStaticPaths: 0.8832257880055953,
      PostPage: 0.8832257880055953,
      RichEditPost: 0.8832257880055953,
      postPath: 0.8832257880055953,
      getPostBySlug: 0.8832257880055953,
    },
    'web/pages/public-messages/[channelId].tsx': {
      PublicMessagesPage: 0.695546631234341,
    },
    'web/pages/redeem.tsx': {
      SweepiesStats: 4.3629456856431315,
    },
    'web/pages/referrals.tsx': {
      getServerSideProps: 1.2480550759812916,
      ReferralsPage: 1.2480550759812916,
    },
    'web/pages/register-on-discord.tsx': {
      RegisterOnDiscord: 1.7289584257627488,
    },
    'web/pages/reports.tsx': {
      ReportsPage: 2.2320757297547065,
    },
    'web/pages/server-sitemap.xml.tsx': {
      getServerSideProps: 0.7717310401808826,
      Sitemap: 0.7717310401808826,
    },
    'web/pages/sign-in-waiting.tsx': {
      SignInWaiting: 0.8494436448217154,
    },
    'web/pages/sitemap.tsx': {
      AboutPage: 2.877620014297928,
    },
    'web/pages/stats.tsx': {
      getStaticProps: 3.104497803546333,
      Analytics: 3.104497803546333,
      CustomAnalytics: 3.104497803546333,
    },
    'web/pages/styles.tsx': {
      StylePage: 1.5001876093022506,
      ButtonSection: 1.5001876093022506,
      ToggleSection: 1.5001876093022506,
      NumberInputExample: 1.5001876093022506,
      EditorExample: 1.5001876093022506,
      SliderExample: 1.5001876093022506,
      Rating: 1.5001876093022506,
    },
    'web/pages/tv/[[...scheduleId]].tsx': {
      getStaticPaths: 0.695546631234341,
      getStaticProps: 0.695546631234341,
    },
    'web/pages/twitch.tsx': {
      TwitchLandingPage: 1.7388665780858525,
      ButtonGetStarted: 1.7388665780858525,
      TwitchPlaysManifoldMarkets: 1.7388665780858525,
      Subtitle: 1.7388665780858525,
      Command: 2.944157044055981,
      TwitchChatCommands: 1.7388665780858525,
      BotSetupStep: 1.7388665780858525,
      CopyButton: 1.7388665780858525,
      BotConnectButton: 1.7388665780858525,
      SetUpBot: 1.7388665780858525,
    },
    'web/pages/websocket-live.tsx': {
      StatusLabel: 1.2202139140112556,
      MessageHeader: 1.2202139140112556,
      MessageRow: 1.2202139140112556,
      WebsocketLivePage: 1.2202139140112556,
      RealtimeLog: 1.2202139140112556,
    },
    'web/pages/week/[username]/[rangeEndDateSlug].tsx': {
      getStaticProps: 1.2973898260467918,
      getStaticPaths: 1.2973898260467918,
      RangePerformancePage: 1.2973898260467918,
      ProfitGraph: 1.2973898260467918,
    },
    'web/pages/yc-s23.tsx': {
      getStaticProps: 1.8781905669503656,
      YCS23Page: 1.8781905669503656,
    },
    'web/postcss.config.js': {},
    'web/public/.well-known/apple-app-site-association': {},
    'web/public/.well-known/assetlinks.json': {},
    'web/public/Bet_On_Love.pdf': {},
    'web/public/SweepiesFlat.svg': {},
    'web/public/ai.png': {},
    'web/public/black-ios-badge.png': {},
    'web/public/buy-mana-graphics/100k.png': {},
    'web/public/buy-mana-graphics/10k.png': {},
    'web/public/buy-mana-graphics/1M.png': {},
    'web/public/buy-mana-graphics/25k.png': {},
    'web/public/cards/back_green.png': {},
    'web/public/cards/back_red.png': {},
    'web/public/cards/frame_green.png': {},
    'web/public/cards/frame_red.png': {},
    'web/public/christmas_manifold_logo.png': {},
    'web/public/custom-components/coin.tsx': {
      Coin: 0.7985716900254357,
    },
    'web/public/custom-components/congress.tsx': {
      Congress: 0.7705428469585844,
    },
    'web/public/custom-components/congress_center.tsx': {
      CongressCenter: 0.851867169417956,
    },
    'web/public/custom-components/congress_house.tsx': {
      CongressHouse: 0.9724093787532907,
    },
    'web/public/custom-components/congress_senate.tsx': {
      CongressSenate: 0.9724093787532907,
    },
    'web/public/custom-components/documentUploadIcon.tsx': {
      DocumentUploadIcon: 0.812223477046558,
    },
    'web/public/custom-components/governor.tsx': {
      Governor: 0.7705428469585844,
    },
    'web/public/custom-components/locationBlockedIcon.tsx': {
      LocationBlockedIcon: 0.695546631234341,
    },
    'web/public/custom-components/manaCoin.tsx': {
      ManaCoin: 0.64638565775772,
    },
    'web/public/custom-components/manaFlatCoin.tsx': {
      ManaFlatCoin: 0.6291456000000002,
    },
    'web/public/custom-components/phoneIcon.tsx': {
      PhoneIcon: 0.695546631234341,
    },
    'web/public/custom-components/registerIcon.tsx': {
      RegisterIcon: 0.8256495680499811,
    },
    'web/public/custom-components/spiceCoin.tsx': {
      SpiceCoin: 0.64638565775772,
    },
    'web/public/custom-components/sweepiesCoin.tsx': {
      SweepiesCoin: 0.64638565775772,
    },
    'web/public/custom-components/sweepiesFlatCoin.tsx': {
      SweepiesFlatCoin: 0.6291456000000002,
    },
    'web/public/custom-components/tiers.tsx': {
      PlayTier: 0.806790483114044,
      PlusTier: 0.806790483114044,
      PremiumTier: 0.806790483114044,
      CrystalTier: 0.806790483114044,
    },
    'web/public/custom-components/tipJar.tsx': {
      TipJar: 0.7111788444385564,
    },
    'web/public/custom-components/whiteHouse.tsx': {
      WhiteHouse: 0.7846824271987748,
    },
    'web/public/data/elections-data.ts': {
      NH_LINK: 1.713387301856157,
      presidency2024: 1.713387301856157,
      swingStates: 1.713387301856157,
    },
    'web/public/data/governors-data.ts': {
      governors2024: 1.0273904626114458,
    },
    'web/public/data/house-data.ts': {
      house2024: 2.9021128628577086,
    },
    'web/public/data/policy-data.ts': {
      PolicyData: 1.3096710042337203,
    },
    'web/public/data/senate-state-data.ts': {
      senate2024: 1.989533075873232,
      currentSenate: 1.989533075873232,
    },
    'web/public/dgg-logo.svg': {},
    'web/public/discord-logo.svg': {},
    'web/public/discord-ss.png': {},
    'web/public/election-map24.png': {},
    'web/public/favicon.ico': {},
    'web/public/flappy-logo.gif': {},
    'web/public/fonts/MajorMonoDisplay-Regular.ttf': {},
    'web/public/fonts/ReadexPro-Regular.ttf': {},
    'web/public/fonts/icomoon.eot': {},
    'web/public/fonts/icomoon.svg': {},
    'web/public/fonts/icomoon.ttf': {},
    'web/public/fonts/icomoon.woff': {},
    'web/public/google.svg': {},
    'web/public/group/default_group_banner_green.png': {},
    'web/public/group/default_group_banner_indigo.png': {},
    'web/public/group/default_group_banner_red.png': {},
    'web/public/images/Manifest_Logo.png': {},
    'web/public/images/cash-icon.png': {},
    'web/public/images/default-avatar.png': {},
    'web/public/images/donate.png': {},
    'web/public/init-theme.js': {},
    'web/public/landing/stonks.png': {},
    'web/public/landing/stonks_arrow.png': {},
    'web/public/landing/white_foldy.png': {},
    'web/public/logo-april-fools.svg': {},
    'web/public/logo-banner.png': {},
    'web/public/logo-bat-black.png': {},
    'web/public/logo-bat-blue.png': {},
    'web/public/logo-bat-white.png': {},
    'web/public/logo-cover.png': {},
    'web/public/logo-flapping-with-money.gif': {},
    'web/public/logo-turkey.png': {},
    'web/public/logo.png': {},
    'web/public/logo.svg': {},
    'web/public/lottie/award.json': {},
    'web/public/lottie/invitation.json': {},
    'web/public/lottie/loading-icon.json': {},
    'web/public/lottie/lootbox.json': {},
    'web/public/lottie/money-bag.json': {},
    'web/public/lottie/unlocking-icon.json': {},
    'web/public/mana.svg': {},
    'web/public/manaFlat.svg': {},
    'web/public/manachan.png': {},
    'web/public/manifold-wrapped.png': {},
    'web/public/manifold_love_logo.svg': {},
    'web/public/market-tiers/Crystal.svg': {},
    'web/public/market-tiers/Plus.svg': {},
    'web/public/market-tiers/Premium.svg': {},
    'web/public/midterms2022.png': {},
    'web/public/money-bag.svg': {},
    'web/public/mp3s/bills.mp3': {},
    'web/public/mp3s/coinClick.mp3': {},
    'web/public/mp3s/coins.mp3': {},
    'web/public/mp3s/counting.mp3': {},
    'web/public/mp3s/lose1.mp3': {},
    'web/public/mp3s/register.mp3': {},
    'web/public/mp3s/registerLow.mp3': {},
    'web/public/mtg/app.js': {
      putIntoMapAndFetch: 1.053557386708552,
      getKSamples: 1.053557386708552,
      createNewArtistMap: 1.053557386708552,
      fetchToResponse: 1.053557386708552,
      determineIfSkip: 1.053557386708552,
      putIntoMap: 1.053557386708552,
      shuffleArray: 1.053557386708552,
      setUpNewGame: 1.053557386708552,
      removeSpecialCharacters: 1.053557386708552,
      checkAnswers: 1.053557386708552,
      toggleMode: 1.053557386708552,
      allowDrop: 1.053557386708552,
      drag: 1.053557386708552,
      drop: 1.053557386708552,
      returnDrop: 1.053557386708552,
      returnToNameBank: 1.053557386708552,
      selectName: 1.053557386708552,
      dropSelected: 1.053557386708552,
      dropOnCard: 1.053557386708552,
      setWordsLeft: 1.053557386708552,
    },
    'web/public/mtg/guess.html': {},
    'web/public/mtg/images/Advanced_level.webp': {},
    'web/public/mtg/images/Expert_level.webp': {},
    'web/public/mtg/images/Starter_level.webp': {},
    'web/public/mtg/images/ustset.png': {},
    'web/public/mtg/importCards.py': {
      generate_initial_query: 0.9941161511145966,
      generate_initial_special_query: 0.9941161511145966,
      generate_initial_artist_query: 0.9941161511145966,
      generate_individual_artist_query: 0.9941161511145966,
      fetch_and_write_all: 0.9941161511145966,
      fetch_and_write_all_special: 0.9941161511145966,
      fetch_and_write_all_artist: 0.9941161511145966,
      fetch_and_write_initial_artist_query: 0.9941161511145966,
      fetch: 5.174068994523495,
      fetch_special: 0.9941161511145966,
      write_art: 0.9941161511145966,
      to_compact_write_form: 0.9941161511145966,
      to_compact_write_form_special: 0.9941161511145966,
      filter_card: 0.9941161511145966,
      write_to_artist_list: 0.9941161511145966,
      write_image_uris: 0.9941161511145966,
    },
    'web/public/mtg/index.html': {},
    'web/public/mtg/jsons/artifact.json': {},
    'web/public/mtg/jsons/artist.json': {},
    'web/public/mtg/jsons/artistList.json': {},
    'web/public/mtg/jsons/basic.json': {},
    'web/public/mtg/jsons/beast.json': {},
    'web/public/mtg/jsons/burn.json': {},
    'web/public/mtg/jsons/commander.json': {},
    'web/public/mtg/jsons/counterspell.json': {},
    'web/public/mtg/jsons/set.json': {},
    'web/public/mtg/jsons/watermark.json': {},
    'web/public/mtg/jsons/wm.json': {},
    'web/public/opensearch.xml': {},
    'web/public/pairs-trader.html': {},
    'web/public/payment-icons/dark/1.png': {},
    'web/public/payment-icons/dark/14.png': {},
    'web/public/payment-icons/dark/2.png': {},
    'web/public/payment-icons/dark/22.png': {},
    'web/public/payment-icons/light/1.png': {},
    'web/public/payment-icons/light/14.png': {},
    'web/public/payment-icons/light/2.png': {},
    'web/public/payment-icons/light/22.png': {},
    'web/public/political-candidates/abbott.png': {},
    'web/public/political-candidates/beshear.png': {},
    'web/public/political-candidates/biden.png': {},
    'web/public/political-candidates/bobama.png': {},
    'web/public/political-candidates/burgum.png': {},
    'web/public/political-candidates/buttigieg.png': {},
    'web/public/political-candidates/carlson.png': {},
    'web/public/political-candidates/carson.png': {},
    'web/public/political-candidates/christie.png': {},
    'web/public/political-candidates/clinton.png': {},
    'web/public/political-candidates/cooper.png': {},
    'web/public/political-candidates/cruz.png': {},
    'web/public/political-candidates/desantis.png': {},
    'web/public/political-candidates/gabbard.png': {},
    'web/public/political-candidates/haley.png': {},
    'web/public/political-candidates/harris.png': {},
    'web/public/political-candidates/hutchinson.png': {},
    'web/public/political-candidates/jeffries.png': {},
    'web/public/political-candidates/kamala-left.png': {},
    'web/public/political-candidates/kelly.png': {},
    'web/public/political-candidates/kennedy.png': {},
    'web/public/political-candidates/lake.png': {},
    'web/public/political-candidates/mcraven.png': {},
    'web/public/political-candidates/mobama.png': {},
    'web/public/political-candidates/newsom.png': {},
    'web/public/political-candidates/noem.png': {},
    'web/public/political-candidates/orourke.png': {},
    'web/public/political-candidates/pence.png': {},
    'web/public/political-candidates/phillips.png': {},
    'web/public/political-candidates/polis.png': {},
    'web/public/political-candidates/pritzker.png': {},
    'web/public/political-candidates/ramaswamy.png': {},
    'web/public/political-candidates/rubio.png': {},
    'web/public/political-candidates/sanders.png': {},
    'web/public/political-candidates/scott.png': {},
    'web/public/political-candidates/shapiro.png': {},
    'web/public/political-candidates/stefanik.png': {},
    'web/public/political-candidates/trump-right.png': {},
    'web/public/political-candidates/trump.png': {},
    'web/public/political-candidates/vance.png': {},
    'web/public/political-candidates/walz.png': {},
    'web/public/political-candidates/warnock.png': {},
    'web/public/political-candidates/whitmer.png': {},
    'web/public/political-candidates/youngkin.png': {},
    'web/public/political-candidates/zeldin.png': {},
    'web/public/politics-party/democrat_symbol.png': {},
    'web/public/politics-party/republican_symbol.png': {},
    'web/public/privacy-policy.html': {},
    'web/public/robots.txt': {},
    'web/public/rps.html': {},
    'web/public/simple-bat-blue.png': {},
    'web/public/simple-bat-white.png': {},
    'web/public/sitemap.xml': {},
    'web/public/spice.svg': {},
    'web/public/stylized-crane-black.png': {},
    'web/public/sweepies.svg': {},
    'web/public/sweepstakes-rules.html': {},
    'web/public/terms-and-conditions.html': {},
    'web/public/testimonials/astralCodexTen.png': {},
    'web/public/testimonials/destinyicon.jpg': {},
    'web/public/testimonials/eliezerYudkowsky.jpeg': {},
    'web/public/testimonials/snecko.jpeg': {},
    'web/public/testimonials/testimonials.json': {},
    'web/public/theoremone/Th1-Icon-Round.svg': {},
    'web/public/theoremone/Th1-Icon-Square.svg': {},
    'web/public/theoremone/TheoremOne-Logo-White.svg': {},
    'web/public/theoremone/TheoremOne-Logo.svg': {},
    'web/public/theoremone/logo.ico': {},
    'web/public/twitch-bot-obs-screenshot.jpg': {},
    'web/public/twitch-glitch.svg': {},
    'web/public/twitch-logo.png': {},
    'web/public/twitter-logo.svg': {},
    'web/public/welcome/charity.gif': {},
    'web/public/welcome/manifold-example.gif': {},
    'web/public/welcome/manipurple.png': {},
    'web/public/welcome/treasure.png': {},
    'web/styles/globals.css': {},
    'web/tailwind.config.js': {},
    'web/tsconfig.json': {},
    'yarn.lock': {},
  },
  knowledgeFiles: {
    'backend/api/knowledge.md':
      "# API Endpoints\n\nThis directory contains the implementation of various API endpoints for the Manifold platform.\n\n## Key Concepts\n\n- Each endpoint is typically implemented in its own file.\n- The `app.ts` file serves as the main router, connecting endpoint handlers to their respective routes.\n- We use Supabase for database operations.\n- Authentication is handled using the `APIHandler` type, which automatically manages user authentication based on the schema definition.\n\n## Adding a New API Endpoint\n\nTo add a new API endpoint, follow these steps:\n\n1. Create a new file for the endpoint in the `backend/api/src` directory. Each endpoint should be in a new file.\n2. Implement the endpoint logic in the new file.\n3. Add the endpoint schema to `common/src/api/schema.ts`, including props, return type, and other information. Note that we only use POST and GET methods.\n4. Update `backend/api/src/app.ts`:\n   - Import the handler function from the new file.\n   - Add the handler to the `handlers` object.\n\nExample:\n\n```typescript\n// 1. Create a new file: backend/api/src/my-new-endpoint.ts\nimport { APIHandler } from 'api/helpers/endpoint'\n\nexport const myNewEndpoint: APIHandler<'my-new-endpoint'> = async (props, auth, req) => {\n  // Implement endpoint logic here\n}\n\n// 2. Add to common/src/api/schema.ts\n'my-new-endpoint': {\n  method: 'POST',\n  visibility: 'public',\n  authed: true,\n  props: z.object({\n    // Define props here using Zod schema\n  }),\n  returns: z.object({\n    // Define return type here using Zod schema\n  }),\n},\n\n// 3. Update backend/api/src/app.ts\nimport { myNewEndpoint } from './my-new-endpoint'\n\nconst handlers: { [k in APIPath]: APIHandler<k> } = {\n  // ... existing handlers\n  'my-new-endpoint': myNewEndpoint,\n}\n```\n\n## Authentication\n\nAuthentication is managed automatically by the `APIHandler` type. The `authed` property in the schema determines the authentication behavior:\n\n- `false`: The endpoint can be called without authentication.\n- `true`: The endpoint requires authentication. The `auth` object will be provided to the handler function.\n\nExample of an authenticated endpoint:\n\n```typescript\nexport const myAuthenticatedEndpoint: APIHandler<'my-authenticated-endpoint'> = async (props, auth, req) => {\n  const { uid } = auth // auth object is automatically provided for authenticated endpoints\n  // Implement endpoint logic here\n}\n```\n\n## Best Practices\n\n- Use the `createSupabaseDirectClient` function from `shared/supabase/init` for database operations.\nThis uses the pg promise library, where you pass raw sql strings like so:\n```ts\nimport { createSupabaseClient } from 'shared/supabase/init'\n\nconst pg = createSupabaseDirectConnection()\nconst contractIds = await pg.manyOrNone(`select id from contracts`, [], r => r.id as string)\n```\n\n- Keep endpoint logic modular and reusable when possible.\n- Use TypeScript types consistently to ensure type safety across the API.\n- Use Zod schemas in `common/src/api/schema.ts` to define prop and return types for strong type checking.\n- Use the `APIError` class from `api/helpers/endpoint` to throw standardized API errors.\n- Use lowercase SQL keywords in queries. Don't capitalize SQL keywords.\n- Avoid editing the SQL via `${}`, and instead when using pgpromise, use the argument following the query to pass parameters to the query.\n\n\n## Data schema\nTables like contract_comments, contract_bets, contract_follows, etc, use two primary ids: contract_id, and an id specific to the table: comment_id, bet_id, or follow_id. Thus they have no primary 'id' column.\n\nThus to get a comment you would do:\n```sql\nselect * from contract_comments where comment_id = $1\n```\n",
    'common/knowledge.md':
      "# Common Knowledge\n\n## User Authentication and Permissions\n\n### Checking Admin Status\n\nTo check if a user is an admin, use the `isAdminId` function from `common/envs/constants` instead of checking for an `isAdmin` property on the user object.\n\nExample:\n```typescript\nimport { isAdminId } from 'common/envs/constants'\n\n// Correct way to check if a user is an admin\nif (user && isAdminId(user.id)) {\n  // Admin-specific code here\n}\n\n// Incorrect way (do not use)\n// if (user?.isAdmin) { ... }\n```\n\nThis ensures consistent admin checks across the application and avoids errors related to non-existent properties.\n\n",
    'knowledge.md':
      "Hello this is a short guide to coding on Manifold! It was written to provide context to Claude, so he can know how to code for us.\n\nOur code is all Typescript and split into a few packages. At the top level, there are 3 code directories:\n\n- common\n- web\n- backend\n\nCommon has lots of type definitions for our data structures, like Contract and User. It also contains many useful utility functions. We try not to add package dependencies to common.\n\nThese three directories should be completely isolated in their imports, i.e. they should not import files from each other, except web and backend are allowed to import from common. Common cannot import from web or backend, and web and backend cannot import from each other.\n\nWeb contains our front end code in React and Next.js. We use tailwind for styling.\n\nWeb can be broken down into\n\n- pages\n- components\n- hooks\n- lib\n\nPages define the routes and what is visible on each.\nComponents have reusable react components organized by which feature uses them (e.g. bet subdirectory contains components for betting), or by their function (e.g. buttons subdirectory contains a variety of buttons).\nHooks contain react hooks used across components. We often define several related hooks in one file. For example, use-bets.ts has `useBetsOnce`, `useContractBets`, `useSubscribeGlobalBets`, and a few others.\nLib has common utility functions specific to the client as well as the service layer to communicate with our api, and authentication.\n\nThe backend is further split into:\n\n- shared\n- api\n- supabase\n- scheduler\n- scripts\n\nShared has common utility and database functions used across the other directories.\nApi defines all the endpoints of our server.\nSupabase holds autogenerated sql files that represent our postgres schema. There's a file for each table, as well as a views.sql and functions.sql.\nScheduler is an independent sever that runs our chron jobs (tasks that execute on a time interval).\nScripts contains one-off bits of code that we run for a specific purpose.\n\nEach can import from shared and api. Scheduler and scripts should not be referenced, except internally. None of these should import from web.\n\n---\n\nHere's an example component from web in our style:\n\n```ts\nimport clsx from 'clsx'\nimport Link from 'next/link'\n\nimport { isAdminId, isModId } from 'common/envs/constants'\nimport { type Headline } from 'common/news'\nimport { EditNewsButton } from 'web/components/news/edit-news-button'\nimport { Carousel } from 'web/components/widgets/carousel'\nimport { useUser } from 'web/hooks/use-user'\nimport { track } from 'web/lib/service/analytics'\nimport { DashboardEndpoints } from 'web/components/dashboard/dashboard-page'\nimport { removeEmojis } from 'common/util/string'\n\nexport function HeadlineTabs(props: {\n  headlines: Headline[]\n  currentSlug: string\n  endpoint: DashboardEndpoints\n  hideEmoji?: boolean\n  notSticky?: boolean\n  className?: string\n}) {\n  const { headlines, endpoint, currentSlug, hideEmoji, notSticky, className } =\n    props\n  const user = useUser()\n\n  return (\n    <div\n      className={clsx(\n        className,\n        'bg-canvas-50 w-full',\n        !notSticky && 'sticky top-0 z-50'\n      )}\n    >\n      <Carousel labelsParentClassName=\"gap-px\">\n        {headlines.map(({ id, slug, title }) => (\n          <Tab\n            key={id}\n            label={hideEmoji ? removeEmojis(title) : title}\n            href={`/${endpoint}/${slug}`}\n            active={slug === currentSlug}\n          />\n        ))}\n        {user && <Tab label=\"More\" href=\"/dashboard\" />}\n        {user && (isAdminId(user.id) || isModId(user.id)) && (\n          <EditNewsButton endpoint={endpoint} defaultDashboards={headlines} />\n        )}\n      </Carousel>\n    </div>\n  )\n}\n```\n\n---\n\nWe prefer to have many smaller components that each represent one logical unit, rather than one very large component that does everything. Then we compose and reuse the components.\n\nIt's best to export the main component at the top of the file. We also try to name the component the same as the file name (headline-tabs.tsx) so that it's easy to find.\n\nHere's another example in `home.tsx` that calls our api. We have an endpoint called 'headlines', which is being cached by NextJS:\n\n```ts\nimport { api } from 'web/lib/api/api'\n// More imports...\n\nexport async function getStaticProps() {\n  try {\n    const headlines = await api('headlines', {})\n    return {\n      props: {\n        headlines,\n        revalidate: 30 * 60, // 30 minutes\n      },\n    }\n  } catch (err) {\n    return { props: { headlines: [] }, revalidate: 60 }\n  }\n}\n\nexport default function Home(props: { headlines: Headline[] }) { ... }\n```\n\n---\n\nIf we are calling the API on the client, prefer using the `useAPIGetter` hook:\n\n```ts\nexport const YourTopicsSection = (props: {\n  user: User\n  className?: string\n}) => {\n  const { user, className } = props\n  const { data, refresh } = useAPIGetter('get-followed-groups', {\n    userId: user.id,\n  })\n  const followedGroups = data?.groups ?? []\n  ...\n```\n\nThis stores the result in memory, and allows you to call refresh() to get an updated version.\n\n---\n\nWe frequently use `usePersistentInMemoryState` or `usePersistentLocalState` as an alternative to `useState`. These cache data. Most of the time you want in memory caching so that navigating back to a page will preserve the same state and appear to load instantly.\n\nHere's the definition of usePersistentInMemoryState:\n\n```ts\nexport const usePersistentInMemoryState = <T>(initialValue: T, key: string) => {\n  const [state, setState] = useStateCheckEquality<T>(\n    safeJsonParse(store[key]) ?? initialValue\n  )\n\n  useEffect(() => {\n    const storedValue = safeJsonParse(store[key]) ?? initialValue\n    setState(storedValue as T)\n  }, [key])\n\n  const saveState = useEvent((newState: T | ((prevState: T) => T)) => {\n    setState((prevState) => {\n      const updatedState = isFunction(newState) ? newState(prevState) : newState\n      store[key] = JSON.stringify(updatedState)\n      return updatedState\n    })\n  })\n\n  return [state, saveState] as const\n}\n```\n\n---\n\nWhen organizing imports, we put the external libraries at the top, followed by a new line, and then our internal imports.\n\n```ts\nimport { useState } from 'react'\nimport { keyBy } from 'lodash'\n\nimport { useAPIGetter } from 'web/hooks/use-api-getter'\nimport { useUser } from 'web/hooks/use-user'\n```\n\nFor live updates, we use websockets. In `use-api-subscription.ts`, we have this hook:\n\n```ts\nexport function useApiSubscription(opts: SubscriptionOptions) {\n  useEffect(() => {\n    const ws = client\n    if (ws != null) {\n      if (opts.enabled ?? true) {\n        ws.subscribe(opts.topics, opts.onBroadcast).catch(opts.onError)\n        return () => {\n          ws.unsubscribe(opts.topics, opts.onBroadcast).catch(opts.onError)\n        }\n      }\n    }\n  }, [opts.enabled, JSON.stringify(opts.topics)])\n}\n```\n\nIn `use-bets`, we have this hook to get live updates with useApiSubscription:\n\n```ts\nexport const useContractBets = (\n  contractId: string,\n  opts?: APIParams<'bets'> & { enabled?: boolean }\n) => {\n  const { enabled = true, ...apiOptions } = {\n    contractId,\n    ...opts,\n  }\n  const optionsKey = JSON.stringify(apiOptions)\n\n  const [newBets, setNewBets] = usePersistentInMemoryState<Bet[]>(\n    [],\n    `${optionsKey}-bets`\n  )\n\n  const addBets = (bets: Bet[]) => {\n    setNewBets((currentBets) => {\n      const uniqueBets = sortBy(\n        uniqBy([...currentBets, ...bets], 'id'),\n        'createdTime'\n      )\n      return uniqueBets.filter((b) => !betShouldBeFiltered(b, apiOptions))\n    })\n  }\n\n  const isPageVisible = useIsPageVisible()\n\n  useEffect(() => {\n    if (isPageVisible && enabled) {\n      api('bets', apiOptions).then(addBets)\n    }\n  }, [optionsKey, enabled, isPageVisible])\n\n  useApiSubscription({\n    topics: [`contract/${contractId}/new-bet`],\n    onBroadcast: (msg) => {\n      addBets(msg.data.bets as Bet[])\n    },\n    enabled,\n  })\n\n  return newBets\n}\n```\n\n---\n\nHere are all the topics we broadcast, from `backend/shared/src/websockets/helpers.ts`\n\n```ts\nexport function broadcastUpdatedPrivateUser(userId: string) {\n  // don't send private user info because it's private and anyone can listen\n  broadcast(`private-user/${userId}`, {})\n}\n\nexport function broadcastUpdatedUser(user: Partial<User> & { id: string }) {\n  broadcast(`user/${user.id}`, { user })\n}\n\nexport function broadcastNewBets(\n  contractId: string,\n  visibility: Visibility,\n  bets: Bet[]\n) {\n  const payload = { bets }\n  broadcastMulti([`contract/${contractId}/new-bet`], payload)\n\n  if (visibility === 'public') {\n    broadcastMulti(['global', 'global/new-bet'], payload)\n  }\n\n  const newOrders = bets.filter((b) => b.limitProb && !b.isFilled) as LimitBet[]\n  broadcastOrders(newOrders)\n}\n\nexport function broadcastOrders(bets: LimitBet[]) {\n  if (bets.length === 0) return\n  const { contractId } = bets[0]\n  broadcast(`contract/${contractId}/orders`, { bets })\n}\n\nexport function broadcastNewComment(\n  contractId: string,\n  visibility: Visibility,\n  creator: User,\n  comment: ContractComment\n) {\n  const payload = { creator, comment }\n  const topics = [`contract/${contractId}/new-comment`]\n  if (visibility === 'public') {\n    topics.push('global', 'global/new-comment')\n  }\n  broadcastMulti(topics, payload)\n}\n\nexport function broadcastNewContract(contract: Contract, creator: User) {\n  const payload = { contract, creator }\n  if (contract.visibility === 'public') {\n    broadcastMulti(['global', 'global/new-contract'], payload)\n  }\n}\n\nexport function broadcastNewSubsidy(\n  contractId: string,\n  visibility: Visibility,\n  amount: number\n) {\n  const payload = { amount }\n  const topics = [`contract/${contractId}/new-subsidy`]\n  if (visibility === 'public') {\n    topics.push('global', 'global/new-subsidy')\n  }\n  broadcastMulti(topics, payload)\n}\n\nexport function broadcastUpdatedContract(\n  visibility: Visibility,\n  contract: Partial<Contract> & { id: string }\n) {\n  const payload = { contract }\n  const topics = [`contract/${contract.id}`]\n  if (visibility === 'public') {\n    topics.push('global', 'global/updated-contract')\n  }\n  broadcastMulti(topics, payload)\n}\n\nexport function broadcastNewAnswer(answer: Answer) {\n  const payload = { answer }\n  const topics = [`contract/${answer.contractId}/new-answer`]\n  // TODO: broadcast to global. we don't do this rn cuz too lazy get contract visibility to filter out unlisted\n  broadcastMulti(topics, payload)\n}\n\nexport function broadcastUpdatedAnswers(\n  contractId: string,\n  answers: (Partial<Answer> & { id: string })[]\n) {\n  if (answers.length === 0) return\n\n  const payload = { answers }\n  const topics = [`contract/${contractId}/updated-answers`]\n  // TODO: broadcast to global\n  broadcastMulti(topics, payload)\n}\n```\n\n---\n\nWe have our scripts in the directory `backend/scripts`.\n\nTo write a script, run it inside the helper function called `runScript` that automatically fetches any secret keys and loads them into process.env.\n\nExample from `backend/scripts/manicode.ts`\n\n```ts\nimport { runScript } from 'run-script'\n\nrunScript(async ({ pg }) => {\n  const userPrompt = process.argv[2]\n  // E.g.:\n  // I want to create a new page which shows off what's happening on manifold right now. Can you use our websocket api to get recent bets on markets and illustrate what's happening in a compelling and useful way?\n  if (!userPrompt) {\n    console.log('Please provide a prompt on what code to change.')\n    return\n  }\n\n  await manicode(pg, userPrompt)\n})\n```\n\nWe recommend running scripts via `ts-node`. Example:\n\n```sh\nts-node manicode.ts \"Generate a page called cowp, which has cows that make noises!\"\n```\n\n---\n\nOur backend is mostly a set of endpoints. We create new endpoints by adding to the schema in `common/src/api/schema.ts`.\n\nE.g. Here is the bet schema:\n\n```ts\n  bet: {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as CandidateBet & { betId: string },\n    props: z\n      .object({\n        contractId: z.string(),\n        amount: z.number().gte(1),\n        replyToCommentId: z.string().optional(),\n        limitProb: z.number().gte(0.01).lte(0.99).optional(),\n        expiresAt: z.number().optional(),\n        // Used for binary and new multiple choice contracts (cpmm-multi-1).\n        outcome: z.enum(['YES', 'NO']).default('YES'),\n        //Multi\n        answerId: z.string().optional(),\n        dryRun: z.boolean().optional(),\n      })\n      .strict(),\n  },\n```\n\nThen, we define the bet endpoint in `backend/api/src/place-bet.ts`\n\n```ts\nexport const placeBet: APIHandler<'bet'> = async (props, auth) => {\n  const isApi = auth.creds.kind === 'key'\n  return await betsQueue.enqueueFn(\n    () => placeBetMain(props, auth.uid, isApi),\n    [props.contractId, auth.uid]\n  )\n}\n```\n\nAnd finally, you need to register the handler in `backend/api/src/app.ts`\n\n```ts\nimport { placeBet } from './place-bet'\n...\n\nconst handlers: { [k in APIPath]: APIHandler<k> } = {\n  bet: placeBet,\n  ...\n}\n```\n\n---\n\nWe have two ways to access our postgres database.\n\n```ts\nconst pg = createSupabaseDirectClient()\n```\n\nand\n\n```ts\nconst db = createSupabaseClient()\n```\n\nThe first (createSupabaseDirectClient) lets us specify sql strings to run directly on our database, using the pg-promise library. The client (code in web) does not have permission to do this.\n\nExample using the direct client:\n\n```ts\nexport const getUniqueBettorIds = async (\n  contractId: string,\n  pg: SupabaseDirectClient\n) => {\n  const res = await pg.manyOrNone(\n    `\n      select\n          distinct user_id\n      from contract_bets\n        where contract_id = $1`,\n    [contractId]\n  )\n  return res.map((r) => r.user_id as string)\n}\n```\n\nWe are deprecating the latter approach (createSupabaseClient), so avoid using it entirely for new code. It uses postgREST, a rest api that is turned into sql. The client can also use this to connect directly to our database. The recommended path is to instead create an endpoint on our server, and have that use the supabase direct client to return data to the client.\n\nExample using supabase client:\n\n```ts\nexport const getContractIdFromSlug = async (\n  db: SupabaseClient,\n  slug?: string\n) => {\n  if (!slug) return undefined\n\n  const { data, error } = await db\n    .from('contracts')\n    .select('id')\n    .eq('slug', slug)\n    .single()\n\n  if (error) throw new APIError(404, `Contract with slug ${slug} not found`)\n  return data.id\n}\n```\n\n### Misc coding tips\n\nWe have many useful hooks that should be reused rather than rewriting them again. For example, to get the live global bets, you should use\n\n```ts\nimport { useSubscribeGlobalBets } from 'web/hooks/use-bets'\n\n...\n\nconst bets = useSubscribeGlobalBets()\n```\n\n---\n\nWe prefer using lodash functions instead of reimplementing them with for loops:\n\n```ts\nimport { keyBy, uniq } from 'lodash'\n\nconst betsByUserId = keyBy(bets, 'userId')\nconst betIds = uniq(bets, (b) => b.id)\n```\n\n---\n\nBecause we target es5, we can't iterate through a Set in a for loop, for example:\n\n```ts\nconst betIds = []\nconst betIdSet = new Set(array)\nfor (const id of betIdSet) { // Is a compilation error, since a Set is not iterable without a polyfill.\n  ...\n}\n```\n\nInstead, you should just avoid using sets here. Consider using lodash's uniq function instead:\n\n```ts\nconst betIds = uniq([])\nfor (const id of betIds) {\n  ...\n}\n```\n\n---\n\nIf you don't provide the type, it will default to unknown, and cause a type error\n\n```ts\ntry {\n  await getUserDataDump(identifier)\n}\n} catch (error) {\n  console.error('Error:', error.message) // Type error accessing \".message\" since error is unknown type.\n}\n```\n\nYou can fix it by either adding a type annotation, or checking if a field is in the object (`'message' in error`) or by using instanceof:\n\n```ts\ntry {\n  await getUserDataDump(identifier)\n} catch (error) {\n  console.error(\n    'Error:',\n    error instanceof Error ? error.message : String(error)\n  )\n}\n```\n",
    'manifold-info.knowledge.md':
      "Manifold is the world's most popular prediction market website.\n\nManifold lets you bet on upcoming events using play money. As other users bet against you, it creates a probability of how likely the event will happen—this is known as a prediction market.\nBet on current events, politics, tech, and AI, or create your own market about an event you care about for others to trade on!\n\nOur mission:\nProvide the most accurate, real-time predictions on any event.\nCombat misleading news by incentivising traders to be fast and correct.\nHelp people make more informed decisions by improving their model of the future.\n\n1. Basics and How It Works:\n   - Prediction markets allow betting on future event outcomes.\n   - Prices of shares represent the probability of events occurring.\n   - Anyone can create markets on any topic.\n   - Manifold uses play-money (mana) instead of real currency.\n   - The platform has proven to be effective at forecasting, despite not using real money.\n\n2. Using Manifold:\n   - Users start with 200 mana for free.\n   - Mana can be used to bet, create markets, and promote questions.\n   - Prize points can be earned and converted to mana or donated to charities.\n   - Users can earn mana through correct predictions, successful trades, creating popular markets, completing quests, and referring friends.\n\n3. Types of Questions:\n   - Personal (fun wagers, recommendations, accountability goals)\n   - News and current events\n   - Politics, sports, economics\n   - Impactful causes and research\n   - Project management\n\n4. Best Practices for Creating Markets:\n   - Set clear resolution criteria\n   - Include a resolution date\n   - Write an engaging description\n   - Add the market to relevant topics/groups\n   - Share your own opinion\n   - Promote your market\n   - Subsidize your market for increased activity\n\n5. Tips for Becoming a Good Trader:\n   - Find inaccurate probabilities\n   - React quickly to news\n   - Buy low, sell high\n   - Create innovative answers in free response markets\n   - Sort markets by close date or newest\n   - Follow successful traders\n\n6. Market Resolution:\n   - Market creators resolve their own markets\n   - Resolution should be timely and based on predetermined criteria\n   - Options include Yes/No, Partial, or multiple choice resolutions\n   - N/A resolution (market cancellation) is limited to moderators\n\n7. Market Mechanics:\n   - Prices and probabilities are determined by trader activity\n   - Users buy shares of outcomes, with each correct share worth 1 mana at resolution\n   - Manifold uses a combination of limit orders and automated market maker\n   - Limit orders allow betting at specific probabilities\n   - Liquidity pool affects market stability and tradability\n\n8. Payouts and Loans:\n   - Payouts are calculated based on the number of shares owned\n   - Loans (now deprecated) used to provide daily returns on bet amounts\n\n9. Miscellaneous:\n   - Users can donate to various charities using prize points\n   - Customizable notification settings\n   - Account deletion process explained\n   - Content moderation policy and reporting process outlined\n   - Official API available\n\n10. Unique Features:\n    - Largest range of prediction topics due to user-generated content\n    - Free to play with prizes available in select regions\n    - Community-driven question creation and resolution\n\n11. Fair Play and Dispute Resolution:\n    - Community guidelines enforce fair play\n    - Disputes can be reported to moderators for review\n    - Markets may be re-resolved in cases of abuse, misresolution, or technical failures\n",
  },
  files: {
    'backend/api/src/app.ts':
      "import { hrtime } from 'node:process'\nimport * as cors from 'cors'\nimport * as crypto from 'crypto'\nimport * as express from 'express'\nimport { ErrorRequestHandler, RequestHandler } from 'express'\nimport { log, metrics } from 'shared/utils'\nimport { withMonitoringContext } from 'shared/monitoring/context'\nimport { APIError, pathWithPrefix } from 'common/api/utils'\nimport { health } from './health'\nimport { updateMe } from './update-me'\nimport { placeBet } from './place-bet'\nimport { cancelBet } from './cancel-bet'\nimport { sellShares } from './sell-shares'\nimport { claimmanalink } from './claim-manalink'\nimport { createMarket } from './create-market'\nimport { createComment } from './create-comment'\nimport { creategroup } from './create-group'\nimport { resolveMarket } from './resolve-market'\nimport { closeMarket } from './close-market'\nimport { unsubscribe } from './unsubscribe'\nimport { stripewebhook, createcheckoutsession } from './stripe-endpoints'\nimport { getMe } from './get-me'\nimport { saveTwitchCredentials } from './save-twitch-credentials'\nimport { addLiquidity } from './add-liquidity'\nimport { validateiap } from './validate-iap'\nimport { markallnotifications } from './mark-all-notifications'\nimport { updatememberrole } from './update-group-member-role'\nimport { updategroupprivacy } from './update-group-privacy'\nimport { registerdiscordid } from './register-discord-id'\nimport { getuserisgroupmember } from './get-user-is-group-member'\nimport { completequest } from './complete-quest'\nimport { getsupabasetoken } from './get-supabase-token'\nimport { deleteMarket } from './delete-market'\nimport { saveTopic } from './save-topic'\nimport { boostmarket } from './boost-market'\nimport { redeemboost } from './redeem-market-ad-reward'\nimport { followtopic } from './follow-topic'\nimport { editcomment } from 'api/edit-comment'\nimport { deleteComment } from './delete-comment'\nimport {\n  supabasesearchgroups,\n  supabasesearchmygroups,\n} from './supabase-search-groups'\nimport { leagueActivity } from './league-activity'\nimport { updategroup } from './update-group'\nimport { updateUserDisinterestEmbedding } from 'api/update-user-disinterests'\nimport { awardBounty } from './award-bounty'\nimport { addBounty } from './add-bounty'\nimport { cancelbounty } from './cancel-bounty'\nimport { createAnswerCPMM } from './create-answer-cpmm'\nimport { searchgiphy } from './search-giphy'\nimport { manachantweet } from './manachan-tweet'\nimport { managram } from './managram'\nimport { leavereview } from './leave-review'\nimport { getusercontractmetricswithcontracts } from './get-user-contract-metrics-with-contracts'\nimport { castpollvote } from './cast-poll-vote'\nimport { getsimilargroupstocontract } from 'api/get-similar-groups-to-contract'\nimport { followUser } from './follow-user'\nimport { report } from './report'\nimport { createdashboard } from './create-dashboard'\nimport { getyourdashboards } from './get-your-dashboards'\nimport { followdashboard } from './follow-dashboard'\nimport { supabasesearchdashboards } from './supabase-search-dashboards'\nimport { getyourfolloweddashboards } from './get-your-followed-dashboards'\nimport { updatedashboard } from './update-dashboard'\nimport { deletedashboard } from './delete-dashboard'\nimport { setnews } from './set-news'\nimport { getnews } from './get-news'\nimport {\n  getdashboardfromslug,\n  getDashboardFromSlug,\n} from './get-dashboard-from-slug'\nimport { unresolve } from './unresolve'\nimport { referuser } from 'api/refer-user'\nimport { banuser } from 'api/ban-user'\nimport { updateMarket } from 'api/update-market'\nimport { createprivateusermessage } from 'api/create-private-user-message'\nimport { createprivateusermessagechannel } from 'api/create-private-user-message-channel'\nimport { createlover } from 'api/love/create-lover'\nimport { updatelover } from 'api/love/update-lover'\nimport { createcommentonlover } from 'api/love/create-comment-on-lover'\nimport { hidecommentonlover } from 'api/love/hide-comment-on-lover'\nimport { searchlocation } from './search-location'\nimport { searchnearcity } from './search-near-city'\nimport { leaveprivateusermessagechannel } from 'api/leave-private-user-message-channel'\nimport { updateprivateusermessagechannel } from 'api/update-private-user-message-channel'\nimport { editanswercpmm } from 'api/edit-answer'\nimport { createlovecompatibilityquestion } from 'api/love/create-love-compatibility-question'\nimport { getCompatibleLovers } from './love/compatible-lovers'\nimport { API, type APIPath } from 'common/api/schema'\nimport { getMarkets } from 'api/markets'\nimport { createchartannotation } from 'api/create-chart-annotation'\nimport { deletechartannotation } from 'api/delete-chart-annotation'\nimport { assertUnreachable } from 'common/util/types'\nimport { hideComment } from './hide-comment'\nimport { pinComment } from './pin-comment'\nimport { getManagrams } from './get-managrams'\nimport { getGroups } from './get-groups'\nimport { getComments } from './get-comments'\nimport { getBets } from './get-bets'\nimport { getLiteUser, getUser } from './get-user'\nimport { getUsers } from './get-users'\nimport { getMarket } from './get-market'\nimport { getGroup } from './get-group'\nimport { getPositions } from './get-positions'\nimport { getLeagues } from './get-leagues'\nimport { getContract } from './get-contract'\nimport { addOrRemoveTopicFromContract } from './add-topic-to-market'\nimport { searchUsers } from './supabase-search-users'\nimport {\n  searchMarketsLite,\n  searchMarketsFull,\n} from './supabase-search-contract'\nimport { post } from 'api/post'\nimport { fetchLinkPreview } from './fetch-link-preview'\nimport { type APIHandler, typedEndpoint } from './helpers/endpoint'\nimport { requestloan } from 'api/request-loan'\nimport { removePinnedPhoto } from './love/remove-pinned-photo'\nimport { getHeadlines, getPoliticsHeadlines } from './get-headlines'\nimport { getadanalytics } from 'api/get-ad-analytics'\nimport { getCompatibilityQuestions } from './love/get-compatibililty-questions'\nimport { addOrRemoveReaction } from './reaction'\nimport { likeLover } from './love/like-lover'\nimport { shipLovers } from './love/ship-lovers'\nimport { createManalink } from './create-manalink'\nimport { getLikesAndShips } from './love/get-likes-and-ships'\nimport { hasFreeLike } from './love/has-free-like'\nimport { starLover } from './love/star-lover'\nimport { getLovers } from './love/get-lovers'\nimport { unlistAndCancelUserContracts } from './unlist-and-cancel-user-contracts'\nimport { getGroupsWithTopContracts } from 'api/get-topics-with-markets'\nimport { getBalanceChanges } from 'api/get-balance-changes'\nimport { getLoverAnswers } from './love/get-lover-answers'\nimport { placeMultiBet } from 'api/place-multi-bet'\nimport { deletetv, settv } from './set-tv'\nimport { getPartnerStats } from './get-partner-stats'\nimport { getSeenMarketIds } from 'api/get-seen-market-ids'\nimport { recordContractView } from 'api/record-contract-view'\nimport { createPublicChatMessage } from 'api/create-public-chat-message'\nimport { getFollowedGroups } from './get-followed-groups'\nimport { getUniqueBetGroupCount } from 'api/get-unique-bet-groups'\nimport { deleteGroup } from './delete-group'\nimport { recordContractInteraction } from 'api/record-contract-interaction'\nimport { getUserPortfolio } from './get-user-portfolio'\nimport { createuser } from 'api/create-user'\nimport { verifyPhoneNumber } from 'api/verify-phone-number'\nimport { requestOTP } from 'api/request-phone-otp'\nimport { multiSell } from 'api/multi-sell'\nimport { convertCashToMana } from './convert-cash-to-mana'\nimport { convertSpiceToMana } from './convert-sp-to-mana'\nimport { donate } from './donate'\nimport { getFeed } from 'api/get-feed'\nimport { getManaSupply } from './get-mana-supply'\nimport { getUserPortfolioHistory } from './get-user-portfolio-history'\nimport { deleteMe } from './delete-me'\nimport { placeBetter } from './place-better'\nimport { updateModReport } from './update-mod-report'\nimport { getModReports } from './get-mod-reports'\nimport { searchContractPositions } from 'api/search-contract-positions'\nimport { blockUser, unblockUser } from './block-user'\nimport { blockGroup, unblockGroup } from './block-group'\nimport { blockMarket, unblockMarket } from './block-market'\nimport { getTxnSummaryStats } from 'api/get-txn-summary-stats'\nimport { getManaSummaryStats } from 'api/get-mana-summary-stats'\nimport { register } from 'api/gidx/register'\nimport { uploadDocument } from 'api/gidx/upload-document'\nimport { identityCallbackGIDX, paymentCallbackGIDX } from 'api/gidx/callback'\nimport { getVerificationStatus } from 'api/gidx/get-verification-status'\nimport { getCurrentPrivateUser } from './get-current-private-user'\nimport { updatePrivateUser } from './update-private-user'\nimport { setPushToken } from './push-token'\nimport { updateNotifSettings } from './update-notif-settings'\nimport { createCashContract } from './create-cash-contract'\nimport { getVerificationDocuments } from 'api/gidx/get-verification-documents'\nimport { getRedeemablePrizeCash } from './get-redeemable-prize-cash'\nimport { getMonitorStatus } from 'api/gidx/get-monitor-status'\nimport { getBestComments } from 'api/get-best-comments'\nimport { recordCommentView } from 'api/record-comment-view'\nimport {\n  getChannelMemberships,\n  getChannelMessages,\n  getLastSeenChannelTime,\n  setChannelLastSeenTime,\n} from 'api/get-private-messages'\nimport { getNotifications } from 'api/get-notifications'\nimport { getCheckoutSession } from 'api/gidx/get-checkout-session'\nimport { completeCheckoutSession } from 'api/gidx/complete-checkout-session'\nimport { getContractTopics } from './get-contract-topics'\nimport { getRelatedMarkets } from 'api/get-related-markets'\nimport { getRelatedMarketsByGroup } from './get-related-markets-by-group'\nimport { followContract } from './follow-contract'\nimport { getUserLimitOrdersWithContracts } from 'api/get-user-limit-orders-with-contracts'\nimport { getInterestingGroupsFromViews } from 'api/get-interesting-groups-from-views'\nimport { completeCashoutSession } from 'api/gidx/complete-cashout-session'\nimport { getCashouts } from './get-cashouts'\n\nconst allowCorsUnrestricted: RequestHandler = cors({})\n\nfunction cacheController(policy?: string): RequestHandler {\n  return (_req, res, next) => {\n    if (policy) res.appendHeader('Cache-Control', policy)\n    next()\n  }\n}\nconst ignoredEndpoints = [\n  '/get-channel-messages',\n  '/v0/user/by-id/',\n  '/get-channel-memberships',\n  '/v0/get-mod-reports',\n  '/get-channel-seen-time',\n]\n\nconst requestMonitoring: RequestHandler = (req, res, next) => {\n  const traceContext = req.get('X-Cloud-Trace-Context')\n  const traceId = traceContext\n    ? traceContext.split('/')[0]\n    : crypto.randomUUID()\n  const { method, path: endpoint, url } = req\n  const baseEndpoint = getBaseName(endpoint)\n  const context = { endpoint, traceId, baseEndpoint }\n  withMonitoringContext(context, () => {\n    if (method == 'OPTIONS') {\n      next()\n      return\n    }\n    const startTs = hrtime.bigint()\n    const isLocalhost = req.get('host')?.includes('localhost')\n    if (\n      !isLocalhost ||\n      (isLocalhost && !ignoredEndpoints.some((e) => endpoint.startsWith(e)))\n    ) {\n      log(`${method} ${url}`)\n    }\n    metrics.inc('http/request_count', { endpoint, baseEndpoint, method })\n    res.on('close', () => {\n      const endTs = hrtime.bigint()\n      const latencyMs = Number(endTs - startTs) / 1e6 // Convert to milliseconds\n      metrics.push('http/request_latency', latencyMs, {\n        endpoint,\n        method,\n        baseEndpoint,\n      })\n    })\n    next()\n  })\n}\n\nconst getBaseName = (path: string) => {\n  const parts = path.split('/').filter(Boolean)\n  if (parts.length < 2) return path\n  const base = parts[1]\n  if (parts.length === 2) return `/${base}`\n  const specificPaths = ['bet', 'user', 'group', 'market']\n  if (specificPaths.includes(base)) {\n    return `/${base}/*`\n  }\n  return base\n}\nconst apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {\n  if (error instanceof APIError) {\n    log.info(error)\n    if (!res.headersSent) {\n      const output: { [k: string]: unknown } = { message: error.message }\n      if (error.details != null) {\n        output.details = error.details\n      }\n      res.status(error.code).json(output)\n    }\n  } else {\n    log.error(error)\n    if (!res.headersSent) {\n      res.status(500).json({ message: error.stack, error })\n    }\n  }\n}\n\nconst apiRoute = (endpoint: RequestHandler) => {\n  return [\n    allowCorsUnrestricted,\n    express.json(),\n    endpoint,\n    apiErrorHandler,\n  ] as const\n}\n\nexport const app = express()\napp.use(requestMonitoring)\n\napp.options('*', allowCorsUnrestricted)\n\n// we define the handlers in this object in order to typecheck that every API has a handler\nconst handlers: { [k in APIPath]: APIHandler<k> } = {\n  'create-cash-contract': createCashContract,\n  bet: placeBet,\n  'multi-bet': placeMultiBet,\n  'bet-ter': placeBetter,\n  'follow-contract': followContract,\n  'bet/cancel/:betId': cancelBet,\n  'market/:contractId/sell': sellShares,\n  bets: getBets,\n  'get-notifications': getNotifications,\n  'get-channel-memberships': getChannelMemberships,\n  'get-channel-messages': getChannelMessages,\n  'get-channel-seen-time': getLastSeenChannelTime,\n  'set-channel-seen-time': setChannelLastSeenTime,\n  'get-contract': getContract,\n  comment: createComment,\n  'hide-comment': hideComment,\n  'pin-comment': pinComment,\n  comments: getComments,\n  'delete-comment': deleteComment,\n  market: createMarket,\n  'market/:contractId/group': addOrRemoveTopicFromContract,\n  'market/:contractId/groups': getContractTopics,\n  'group/:slug': getGroup,\n  'group/by-id/:id': getGroup,\n  'group/by-id/:id/markets': ({ id, limit }, ...rest) =>\n    getMarkets({ groupId: id, limit }, ...rest),\n  'group/:slug/delete': deleteGroup,\n  'group/by-id/:id/delete': deleteGroup,\n  'group/:slug/block': blockGroup,\n  'group/:slug/unblock': unblockGroup,\n  groups: getGroups,\n  'market/:id': getMarket,\n  'market/:id/lite': ({ id }) => getMarket({ id, lite: true }),\n  'slug/:slug': getMarket,\n  'market/:contractId/update': updateMarket,\n  'market/:contractId/close': closeMarket,\n  'market/:contractId/resolve': resolveMarket,\n  'market/:contractId/add-liquidity': addLiquidity,\n  'market/:contractId/add-bounty': addBounty,\n  'market/:contractId/award-bounty': awardBounty,\n  'market/:contractId/answer': createAnswerCPMM,\n  'market/:contractId/block': blockMarket,\n  'market/:contractId/unblock': unblockMarket,\n  'get-user-limit-orders-with-contracts': getUserLimitOrdersWithContracts,\n  'get-interesting-groups-from-views': getInterestingGroupsFromViews,\n  leagues: getLeagues,\n  markets: getMarkets,\n  'search-markets': searchMarketsLite,\n  'search-markets-full': searchMarketsFull,\n  managram: managram,\n  managrams: getManagrams,\n  manalink: createManalink,\n  donate: donate,\n  'convert-cash-to-mana': convertCashToMana,\n  'convert-sp-to-mana': convertSpiceToMana,\n  'market/:id/positions': getPositions,\n  me: getMe,\n  'me/update': updateMe,\n  'me/delete': deleteMe,\n  'me/private': getCurrentPrivateUser,\n  'me/private/update': updatePrivateUser,\n  'user/by-id/:id': getUser,\n  'user/by-id/:id/lite': getLiteUser,\n  'user/:username': getUser,\n  'user/:username/lite': getLiteUser,\n  'user/:username/bets': (...props) => getBets(...props),\n  'user/by-id/:id/block': blockUser,\n  'user/by-id/:id/unblock': unblockUser,\n  users: getUsers,\n  'search-users': searchUsers,\n  react: addOrRemoveReaction,\n  'save-twitch': saveTwitchCredentials,\n  'set-push-token': setPushToken,\n  'update-notif-settings': updateNotifSettings,\n  headlines: getHeadlines,\n  'politics-headlines': getPoliticsHeadlines,\n  'compatible-lovers': getCompatibleLovers,\n  post: post,\n  'fetch-link-preview': fetchLinkPreview,\n  'request-loan': requestloan,\n  'remove-pinned-photo': removePinnedPhoto,\n  'get-related-markets': getRelatedMarkets,\n  'get-related-markets-by-group': getRelatedMarketsByGroup,\n  'unlist-and-cancel-user-contracts': unlistAndCancelUserContracts,\n  'get-ad-analytics': getadanalytics,\n  'get-compatibility-questions': getCompatibilityQuestions,\n  'like-lover': likeLover,\n  'ship-lovers': shipLovers,\n  'get-likes-and-ships': getLikesAndShips,\n  'has-free-like': hasFreeLike,\n  'star-lover': starLover,\n  'get-lovers': getLovers,\n  'get-lover-answers': getLoverAnswers,\n  'set-news': setnews,\n  'search-groups': supabasesearchgroups,\n  'search-my-groups': supabasesearchmygroups,\n  'get-groups-with-top-contracts': getGroupsWithTopContracts,\n  'get-balance-changes': getBalanceChanges,\n  'get-partner-stats': getPartnerStats,\n  'get-seen-market-ids': getSeenMarketIds,\n  'record-contract-view': recordContractView,\n  'get-dashboard-from-slug': getDashboardFromSlug,\n  'create-public-chat-message': createPublicChatMessage,\n  unresolve: unresolve,\n  'get-followed-groups': getFollowedGroups,\n  'unique-bet-group-count': getUniqueBetGroupCount,\n  'record-contract-interaction': recordContractInteraction,\n  'get-user-portfolio': getUserPortfolio,\n  'get-user-portfolio-history': getUserPortfolioHistory,\n  createuser: createuser,\n  'verify-phone-number': verifyPhoneNumber,\n  'request-otp': requestOTP,\n  'multi-sell': multiSell,\n  'get-feed': getFeed,\n  'get-mana-supply': getManaSupply,\n  'update-mod-report': updateModReport,\n  'get-mod-reports': getModReports,\n  'search-contract-positions': searchContractPositions,\n  'get-txn-summary-stats': getTxnSummaryStats,\n  'get-mana-summary-stats': getManaSummaryStats,\n  'register-gidx': register,\n  'get-checkout-session-gidx': getCheckoutSession,\n  'complete-checkout-session-gidx': completeCheckoutSession,\n  'complete-cashout-session-gidx': completeCashoutSession,\n  'get-verification-status-gidx': getVerificationStatus,\n  'upload-document-gidx': uploadDocument,\n  'identity-callback-gidx': identityCallbackGIDX,\n  'payment-callback-gidx': paymentCallbackGIDX,\n  'get-verification-documents-gidx': getVerificationDocuments,\n  'get-redeemable-prize-cash': getRedeemablePrizeCash,\n  'get-monitor-status-gidx': getMonitorStatus,\n  'get-best-comments': getBestComments,\n  'record-comment-view': recordCommentView,\n  'get-cashouts': getCashouts,\n}\n\nObject.entries(handlers).forEach(([path, handler]) => {\n  const api = API[path as APIPath]\n  const cache = cacheController((api as any).cache)\n  const url = '/' + pathWithPrefix(path as APIPath)\n\n  const apiRoute = [\n    url,\n    express.json(),\n    allowCorsUnrestricted,\n    cache,\n    typedEndpoint(path as any, handler as any),\n    apiErrorHandler,\n  ] as const\n\n  if (api.method === 'POST') {\n    app.post(...apiRoute)\n  } else if (api.method === 'GET') {\n    app.get(...apiRoute)\n    // } else if (api.method === 'PUT') {\n    //   app.put(...apiRoute)\n  } else {\n    assertUnreachable(api, 'Unsupported API method')\n  }\n})\n\napp.get('/health', ...apiRoute(health))\napp.get('/unsubscribe', ...apiRoute(unsubscribe))\napp.post('/editcomment', ...apiRoute(editcomment))\n\napp.post('/claimmanalink', ...apiRoute(claimmanalink))\napp.post('/creategroup', ...apiRoute(creategroup))\napp.post('/updategroup', ...apiRoute(updategroup))\napp.post('/validateIap', ...apiRoute(validateiap))\napp.post('/markallnotifications', ...apiRoute(markallnotifications))\napp.post('/updatememberrole', ...apiRoute(updatememberrole))\napp.post('/updategroupprivacy', ...apiRoute(updategroupprivacy))\napp.post('/registerdiscordid', ...apiRoute(registerdiscordid))\napp.post('/getuserisgroupmember', ...apiRoute(getuserisgroupmember))\napp.post('/completequest', ...apiRoute(completequest))\napp.post(\n  '/update-user-disinterest-embedding',\n  ...apiRoute(updateUserDisinterestEmbedding)\n)\napp.get('/getsupabasetoken', ...apiRoute(getsupabasetoken))\napp.post('/delete-market', ...apiRoute(deleteMarket))\napp.post('/save-topic', ...apiRoute(saveTopic))\napp.post('/boost-market', ...apiRoute(boostmarket))\napp.post('/redeem-boost', ...apiRoute(redeemboost))\n\napp.post('/createcheckoutsession', allowCorsUnrestricted, createcheckoutsession)\napp.post(\n  '/stripewebhook',\n  allowCorsUnrestricted,\n  express.raw({ type: '*/*' }),\n  stripewebhook\n)\napp.post('/follow-topic', ...apiRoute(followtopic))\napp.post('/league-activity', ...apiRoute(leagueActivity))\napp.post('/cancel-bounty', ...apiRoute(cancelbounty))\napp.post('/edit-answer-cpmm', ...apiRoute(editanswercpmm))\napp.post('/searchgiphy', ...apiRoute(searchgiphy))\napp.post('/manachantweet', ...apiRoute(manachantweet))\napp.post('/refer-user', ...apiRoute(referuser))\napp.post('/leave-review', ...apiRoute(leavereview))\napp.post(\n  '/get-user-contract-metrics-with-contracts',\n  ...apiRoute(getusercontractmetricswithcontracts)\n)\napp.post('/cast-poll-vote', ...apiRoute(castpollvote))\napp.post(\n  '/get-similar-groups-to-contract',\n  ...apiRoute(getsimilargroupstocontract)\n)\napp.post('/follow-user', ...apiRoute(followUser))\napp.post('/report', ...apiRoute(report))\n\napp.post('/settv', ...apiRoute(settv))\napp.post('/deletetv', ...apiRoute(deletetv))\n\napp.post('/createdashboard', ...apiRoute(createdashboard))\napp.post('/getyourdashboards', ...apiRoute(getyourdashboards))\napp.post('/followdashboard', ...apiRoute(followdashboard))\napp.post('/supabasesearchdashboards', ...apiRoute(supabasesearchdashboards))\napp.post('/getyourfolloweddashboards', ...apiRoute(getyourfolloweddashboards))\napp.post('/updatedashboard', ...apiRoute(updatedashboard))\napp.post('/delete-dashboard', ...apiRoute(deletedashboard))\napp.get('/get-news-dashboards', ...apiRoute(getnews))\napp.post('/getdashboardfromslug', ...apiRoute(getdashboardfromslug))\napp.post('/ban-user', ...apiRoute(banuser))\napp.post('/create-private-user-message', ...apiRoute(createprivateusermessage))\napp.post(\n  '/create-private-user-message-channel',\n  ...apiRoute(createprivateusermessagechannel)\n)\napp.post(\n  '/leave-private-user-message-channel',\n  ...apiRoute(leaveprivateusermessagechannel)\n)\napp.post(\n  '/update-private-user-message-channel',\n  ...apiRoute(updateprivateusermessagechannel)\n)\napp.post('/create-lover', ...apiRoute(createlover))\napp.post('/update-lover', ...apiRoute(updatelover))\napp.post('/create-comment-on-lover', ...apiRoute(createcommentonlover))\napp.post('/hide-comment-on-lover', ...apiRoute(hidecommentonlover))\napp.post('/searchlocation', ...apiRoute(searchlocation))\napp.post('/searchnearcity', ...apiRoute(searchnearcity))\napp.post(\n  '/createlovecompatibilityquestion',\n  ...apiRoute(createlovecompatibilityquestion)\n)\napp.post('/create-chart-annotation', ...apiRoute(createchartannotation))\napp.post('/delete-chart-annotation', ...apiRoute(deletechartannotation))\n\n// Catch 404 errors - this should be the last route\napp.use(allowCorsUnrestricted, (req, res) => {\n  res\n    .status(404)\n    .set('Content-Type', 'application/json')\n    .json({\n      message: `The requested route '${req.path}' does not exist. Please check your URL for any misspellings or refer to app.ts`,\n    })\n})\n",
    'common/src/api/schema.ts':
      "import { z } from 'zod'\nimport {\n  Group,\n  MAX_ID_LENGTH,\n  MySearchGroupShape,\n  LiteGroup,\n  SearchGroupParams,\n  SearchGroupShape,\n  Topic,\n} from 'common/group'\nimport {\n  createMarketProps,\n  resolveMarketProps,\n  type LiteMarket,\n  FullMarket,\n  updateMarketProps,\n} from './market-types'\nimport { MAX_COMMENT_LENGTH, type ContractComment } from 'common/comment'\nimport { CandidateBet } from 'common/new-bet'\nimport type { Bet, LimitBet } from 'common/bet'\nimport { contentSchema } from 'common/api/zod-types'\nimport { Lover } from 'common/love/lover'\nimport { Contract } from 'common/contract'\nimport { CompatibilityScore } from 'common/love/compatibility-score'\nimport type { Txn, ManaPayTxn } from 'common/txn'\nimport { LiquidityProvision } from 'common/liquidity-provision'\nimport { DisplayUser, FullUser } from './user-types'\nimport { League } from 'common/leagues'\nimport { searchProps } from './market-search-types'\nimport { MAX_ANSWER_LENGTH } from 'common/answer'\nimport { type LinkPreview } from 'common/link-preview'\nimport { Headline } from 'common/news'\nimport { Row } from 'common/supabase/utils'\nimport { LikeData, ShipData } from './love-types'\nimport { AnyBalanceChangeType } from 'common/balance-change'\nimport { Dashboard } from 'common/dashboard'\nimport { ChatMessage, PrivateChatMessage } from 'common/chat-message'\nimport { PrivateUser, User } from 'common/user'\nimport { ManaSupply } from 'common/stats'\nimport { Repost } from 'common/repost'\nimport { adContract } from 'common/boost'\nimport { PERIODS } from 'common/period'\nimport {\n  LivePortfolioMetrics,\n  PortfolioMetrics,\n} from 'common/portfolio-metrics'\nimport { ModReport } from '../mod-report'\n\nimport { RegistrationReturnType } from 'common/reason-codes'\nimport {\n  CheckoutSession,\n  GIDXDocument,\n  GPSProps,\n  PaymentDetail,\n  checkoutParams,\n  verificationParams,\n  cashoutParams,\n  CashoutStatusData,\n} from 'common/gidx/gidx'\n\nimport { notification_preference } from 'common/user-notification-preferences'\nimport { PrivateMessageChannel } from 'common/supabase/private-messages'\nimport { Notification } from 'common/notification'\nimport { NON_POINTS_BETS_LIMIT } from 'common/supabase/bets'\nimport { ContractMetric } from 'common/contract-metric'\n\n// mqp: very unscientific, just balancing our willingness to accept load\n// with user willingness to put up with stale data\nexport const DEFAULT_CACHE_STRATEGY =\n  'public, max-age=5, stale-while-revalidate=10'\n\ntype APIGenericSchema = {\n  // GET is for retrieval, POST is to mutate something, PUT is idempotent mutation (can be repeated safely)\n  method: 'GET' | 'POST' | 'PUT'\n  //private APIs can only be called from manifold. undocumented endpoints can change or be deleted at any time!\n  visibility: 'public' | 'undocumented' | 'private'\n  // whether the endpoint requires authentication\n  authed: boolean\n  // zod schema for the request body (or for params for GET requests)\n  props: z.ZodType\n  // note this has to be JSON serializable\n  returns?: Record<string, any>\n  // Cache-Control header. like, 'max-age=60'\n  cache?: string\n}\n\n// Zod doesn't handle z.coerce.boolean() properly for GET requests\nconst coerceBoolean = z\n  .union([z.boolean(), z.literal('true'), z.literal('false')])\n  .transform(\n    (value) => value === true || value === 'true'\n  ) as z.ZodType<boolean>\n\nlet _apiTypeCheck: { [x: string]: APIGenericSchema }\nexport const API = (_apiTypeCheck = {\n  'create-cash-contract': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as LiteMarket,\n    props: z\n      .object({\n        manaContractId: z.string(),\n        subsidyAmount: z.number().positive(),\n      })\n      .strict(),\n  },\n  comment: {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as ContractComment,\n    props: z\n      .object({\n        contractId: z.string(),\n        content: contentSchema.optional(),\n        html: z.string().optional(),\n        markdown: z.string().optional(),\n        replyToCommentId: z.string().optional(),\n        replyToAnswerId: z.string().optional(),\n        replyToBetId: z.string().optional(),\n      })\n      .strict(),\n  },\n\n  'follow-contract': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as { success: true },\n    props: z\n      .object({\n        contractId: z.string(),\n        follow: z.boolean(),\n      })\n      .strict(),\n  },\n  'get-contract': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as Contract,\n    props: z\n      .object({\n        contractId: z.string(),\n      })\n      .strict(),\n  },\n  'hide-comment': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ commentPath: z.string() }).strict(),\n  },\n  'pin-comment': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({ commentPath: z.string() }).strict(),\n  },\n  comments: {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as ContractComment[],\n    props: z\n      .object({\n        contractId: z.string().optional(),\n        contractSlug: z.string().optional(),\n        limit: z.coerce.number().gte(0).lte(1000).default(1000),\n        page: z.coerce.number().gte(0).default(0),\n        userId: z.string().optional(),\n        isPolitics: coerceBoolean.optional(),\n      })\n      .strict(),\n  },\n  bet: {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as CandidateBet & { betId: string },\n    props: z\n      .object({\n        contractId: z.string(),\n        amount: z.number().gte(0.01),\n        replyToCommentId: z.string().optional(),\n        limitProb: z.number().gte(0.01).lte(0.99).optional(),\n        expiresAt: z.number().optional(),\n        // Used for binary and new multiple choice contracts (cpmm-multi-1).\n        outcome: z.enum(['YES', 'NO']).default('YES'),\n        //Multi\n        answerId: z.string().optional(),\n        dryRun: z.boolean().optional(),\n        deps: z.array(z.string()).optional(),\n        deterministic: z.boolean().optional(),\n      })\n      .strict(),\n  },\n  'bet-ter': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as CandidateBet & { betId: string },\n    props: z\n      .object({\n        contractId: z.string(),\n        amount: z.number().gte(1),\n        replyToCommentId: z.string().optional(),\n        limitProb: z.number().gte(0.01).lte(0.99).optional(),\n        expiresAt: z.number().optional(),\n        // Used for binary and new multiple choice contracts (cpmm-multi-1).\n        outcome: z.enum(['YES', 'NO']).default('YES'),\n        //Multi\n        answerId: z.string().optional(),\n        dryRun: z.boolean().optional(),\n        deps: z.array(z.string()).optional(),\n        deterministic: z.boolean().optional(),\n      })\n      .strict(),\n  },\n  createuser: {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as { user: User; privateUser: PrivateUser },\n    props: z\n      .object({\n        deviceToken: z.string().optional(),\n        adminToken: z.string().optional(),\n        visitedContractIds: z.array(z.string()).optional(),\n      })\n      .strict(),\n  },\n  'multi-bet': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: [] as (CandidateBet & { betId: string })[],\n    props: z\n      .object({\n        contractId: z.string(),\n        amount: z.number().gte(1),\n        limitProb: z.number().gte(0).lte(1).optional(),\n        expiresAt: z.number().optional(),\n        answerIds: z.array(z.string()).min(1),\n        deterministic: z.boolean().optional(),\n      })\n      .strict(),\n  },\n  'multi-sell': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: [] as (CandidateBet & { betId: string })[],\n    props: z\n      .object({\n        contractId: z.string(),\n        answerIds: z.array(z.string()).min(1),\n        deterministic: z.boolean().optional(),\n      })\n      .strict(),\n  },\n  'verify-phone-number': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as { status: string },\n    props: z\n      .object({\n        phoneNumber: z.string(),\n        code: z.string(),\n      })\n      .strict(),\n  },\n  'request-otp': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as { status: string },\n    props: z\n      .object({\n        phoneNumber: z.string(),\n      })\n      .strict(),\n  },\n  'bet/cancel/:betId': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ betId: z.string() }).strict(),\n    returns: {} as LimitBet,\n  },\n  // sell shares\n  'market/:contractId/sell': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as CandidateBet & { betId: string },\n    props: z\n      .object({\n        contractId: z.string(),\n        shares: z.number().positive().optional(), // leave it out to sell all shares\n        outcome: z.enum(['YES', 'NO']).optional(), // leave it out to sell whichever you have\n        answerId: z.string().optional(), // Required for multi binary markets\n        deterministic: z.boolean().optional(),\n      })\n      .strict(),\n  },\n  'get-user-limit-orders-with-contracts': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: {} as {\n      betsByContract: { [contractId: string]: LimitBet[] }\n      contracts: Contract[]\n    },\n    props: z\n      .object({\n        userId: z.string(),\n        count: z.coerce.number().lte(5000),\n      })\n      .strict(),\n  },\n  'get-interesting-groups-from-views': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: {} as (Group & { hasBet: boolean })[],\n    props: z\n      .object({\n        userId: z.string(),\n        contractIds: z.array(z.string()).optional(),\n      })\n      .strict(),\n  },\n  bets: {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as Bet[],\n    props: z\n      .object({\n        id: z.string().optional(),\n        userId: z.string().optional(),\n        username: z.string().optional(),\n        contractId: z.string().or(z.array(z.string())).optional(),\n        contractSlug: z.string().optional(),\n        answerId: z.string().optional(),\n        // market: z.string().optional(), // deprecated, synonym for `contractSlug`\n        limit: z.coerce\n          .number()\n          .gte(0)\n          .lte(50000)\n          .default(NON_POINTS_BETS_LIMIT),\n        before: z.string().optional(),\n        after: z.string().optional(),\n        beforeTime: z.coerce.number().optional(),\n        afterTime: z.coerce.number().optional(),\n        order: z.enum(['asc', 'desc']).optional(),\n        kinds: z.enum(['open-limit']).optional(),\n        // undocumented fields. idk what a good api interface would be\n        filterRedemptions: coerceBoolean.optional(),\n        includeZeroShareRedemptions: coerceBoolean.optional(),\n        commentRepliesOnly: coerceBoolean.optional(),\n        count: coerceBoolean.optional(),\n        points: coerceBoolean.optional(),\n      })\n      .strict(),\n  },\n  'unique-bet-group-count': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: {} as { count: number },\n    props: z\n      .object({\n        contractId: z.string(),\n      })\n      .strict(),\n  },\n  // deprecated. use /bets?username= instead\n  'user/:username/bets': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as Bet[],\n    props: z\n      .object({\n        username: z.string(),\n        limit: z.coerce.number().gte(0).lte(1000).default(1000),\n      })\n      .strict(),\n  },\n  'group/:slug': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: {} as Group,\n    props: z.object({ slug: z.string() }),\n  },\n  'group/by-id/:id': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: {} as Group,\n    props: z.object({ id: z.string() }).strict(),\n  },\n  // deprecated. use /markets?groupId= instead\n  'group/by-id/:id/markets': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as LiteMarket[],\n    props: z\n      .object({\n        id: z.string(),\n        limit: z.coerce.number().gte(0).lte(1000).default(500),\n      })\n      .strict(),\n  },\n  'group/:slug/delete': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ slug: z.string() }),\n  },\n  'group/by-id/:id/delete': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ id: z.string() }),\n  },\n  'group/:slug/block': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ slug: z.string() }),\n  },\n  'group/:slug/unblock': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ slug: z.string() }),\n  },\n  groups: {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as Group[],\n    props: z\n      .object({\n        availableToUserId: z.string().optional(),\n        beforeTime: z.coerce.number().int().optional(),\n        limit: z.coerce.number().gte(0).lte(1000).default(500),\n      })\n      .strict(),\n  },\n  'market/:id': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    returns: {} as LiteMarket | FullMarket,\n    cache: DEFAULT_CACHE_STRATEGY,\n    props: z.object({ id: z.string(), lite: coerceBoolean.optional() }),\n  },\n  // deprecated. use /market/:id?lite=true instead\n  'market/:id/lite': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    returns: {} as LiteMarket,\n    cache: DEFAULT_CACHE_STRATEGY,\n    props: z.object({ id: z.string() }),\n  },\n  'slug/:slug': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    returns: {} as LiteMarket | FullMarket,\n    cache: DEFAULT_CACHE_STRATEGY,\n    props: z.object({ slug: z.string(), lite: coerceBoolean.optional() }),\n  },\n  market: {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as LiteMarket,\n    props: createMarketProps,\n  },\n  'market/:contractId/update': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: updateMarketProps,\n    returns: {} as { success: true },\n  },\n  'market/:contractId/close': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    // returns: {} as LiteMarket,\n    props: z\n      .object({\n        contractId: z.string(),\n        closeTime: z.number().int().nonnegative().optional(),\n      })\n      .strict(),\n  },\n  'market/:contractId/resolve': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as { message: string },\n    props: resolveMarketProps,\n  },\n  'market/:contractId/add-liquidity': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as LiquidityProvision,\n    props: z\n      .object({\n        contractId: z.string(),\n        amount: z.number().gt(0).finite(),\n      })\n      .strict(),\n  },\n  'market/:contractId/add-bounty': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as Txn,\n    props: z\n      .object({\n        contractId: z.string(),\n        amount: z.number().gt(0).finite(),\n      })\n      .strict(),\n  },\n  'market/:contractId/award-bounty': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as Txn,\n    props: z\n      .object({\n        contractId: z.string(),\n        commentId: z.string(),\n        amount: z.number().gt(0).finite(),\n      })\n      .strict(),\n  },\n  'market/:contractId/group': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z\n      .object({\n        contractId: z.string(),\n        groupId: z.string(),\n        remove: z.boolean().default(false),\n      })\n      .strict(),\n    returns: {} as { success: true },\n  },\n  'market/:contractId/groups': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z.object({ contractId: z.string() }),\n    returns: [] as LiteGroup[],\n  },\n  'market/:contractId/answer': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as { newAnswerId: string },\n    props: z\n      .object({\n        contractId: z.string().max(MAX_ANSWER_LENGTH),\n        text: z.string().min(1).max(MAX_ANSWER_LENGTH),\n      })\n      .strict(),\n  },\n  'market/:contractId/block': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ contractId: z.string() }).strict(),\n  },\n  'market/:contractId/unblock': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ contractId: z.string() }).strict(),\n  },\n  unresolve: {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as { success: true },\n    props: z\n      .object({\n        contractId: z.string().max(MAX_ANSWER_LENGTH),\n        answerId: z.string().max(MAX_ANSWER_LENGTH).optional(),\n      })\n      .strict(),\n  },\n  leagues: {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as League[],\n    props: z\n      .object({\n        userId: z.string().optional(),\n        cohort: z.string().optional(),\n        season: z.coerce.number().optional(),\n      })\n      .strict(),\n  },\n  markets: {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as LiteMarket[],\n    props: z\n      .object({\n        limit: z.coerce.number().gte(0).lte(1000).default(500),\n        sort: z\n          .enum([\n            'created-time',\n            'updated-time',\n            'last-bet-time',\n            'last-comment-time',\n          ])\n          .optional(),\n        order: z.enum(['asc', 'desc']).optional(),\n        before: z.string().optional(),\n        userId: z.string().optional(),\n        groupId: z.string().optional(),\n      })\n      .strict(),\n  },\n  'search-markets': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as LiteMarket[],\n    props: searchProps,\n  },\n  'search-markets-full': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as Contract[],\n    props: searchProps,\n  },\n  managram: {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z\n      .object({\n        amount: z.number().finite(),\n        toIds: z.array(z.string()),\n        message: z.string().max(MAX_COMMENT_LENGTH),\n        groupId: z.string().max(MAX_ID_LENGTH).optional(),\n        token: z.enum(['M$', 'PP']).default('M$'),\n      })\n      .strict(),\n  },\n  manalink: {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    returns: {} as { slug: string },\n    props: z\n      .object({\n        amount: z.number().positive().finite().safe(),\n        expiresTime: z.number().optional(),\n        maxUses: z.number().optional(),\n        message: z.string().optional(),\n      })\n      .strict(),\n  },\n  donate: {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z\n      .object({\n        amount: z.number().positive().finite().safe(),\n        to: z.string(),\n      })\n      .strict(),\n  },\n  'convert-sp-to-mana': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ amount: z.number().positive().finite().safe() }).strict(),\n  },\n  'convert-cash-to-mana': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ amount: z.number().positive().finite().safe() }).strict(),\n  },\n  'request-loan': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({}),\n    returns: {} as { payout: number },\n  },\n  managrams: {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    returns: [] as ManaPayTxn[],\n    props: z\n      .object({\n        toId: z.string().optional(),\n        fromId: z.string().optional(),\n        limit: z.coerce.number().gte(0).lte(100).default(100),\n        before: z.coerce.number().optional(),\n        after: z.coerce.number().optional(),\n      })\n      .strict(),\n  },\n  'market/:id/positions': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as ContractMetric[],\n    props: z\n      .object({\n        id: z.string(),\n        userId: z.string().optional(),\n        answerId: z.string().optional(),\n        top: z.undefined().or(z.coerce.number()),\n        bottom: z.undefined().or(z.coerce.number()),\n        order: z.enum(['shares', 'profit']).optional(),\n      })\n      .strict(),\n  },\n  me: {\n    method: 'GET',\n    visibility: 'public',\n    authed: true,\n    cache: DEFAULT_CACHE_STRATEGY,\n    props: z.object({}),\n    returns: {} as FullUser,\n  },\n  'me/update': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({\n      name: z.string().trim().min(1).optional(),\n      username: z.string().trim().min(1).optional(),\n      avatarUrl: z.string().optional(),\n      bio: z.string().optional(),\n      website: z.string().optional(),\n      twitterHandle: z.string().optional(),\n      discordHandle: z.string().optional(),\n      // settings\n      optOutBetWarnings: z.boolean().optional(),\n      isAdvancedTrader: z.boolean().optional(),\n      //internal\n      shouldShowWelcome: z.boolean().optional(),\n      hasSeenContractFollowModal: z.boolean().optional(),\n      hasSeenLoanModal: z.boolean().optional(),\n    }),\n    returns: {} as FullUser,\n  },\n  'me/delete': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({\n      username: z.string(), // just so you're sure\n    }),\n  },\n  'me/private': {\n    method: 'GET',\n    visibility: 'public',\n    authed: true,\n    props: z.object({}),\n    returns: {} as PrivateUser,\n  },\n  'me/private/update': {\n    method: 'POST',\n    visibility: 'private',\n    authed: true,\n    props: z\n      .object({\n        email: z.string().email().optional(),\n        apiKey: z.string().optional(),\n        pushToken: z.string().optional(),\n        rejectedPushNotificationsOn: z.number().optional(),\n        lastPromptedToEnablePushNotifications: z.number().optional(),\n        interestedInPushNotifications: z.boolean().optional(),\n        hasSeenAppBannerInNotificationsOn: z.number().optional(),\n        installedAppPlatforms: z.array(z.string()).optional(),\n        paymentInfo: z.string().optional(),\n      })\n      .strict(),\n  },\n  'user/:username': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: {} as FullUser,\n    props: z.object({ username: z.string() }).strict(),\n  },\n  'user/:username/lite': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: {} as DisplayUser,\n    props: z.object({ username: z.string() }).strict(),\n  },\n  'user/by-id/:id': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    // Do not add a caching strategy here. New users need up-to-date data.\n    returns: {} as FullUser,\n    props: z.object({ id: z.string() }).strict(),\n  },\n  'user/by-id/:id/lite': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: {} as DisplayUser,\n    props: z.object({ id: z.string() }).strict(),\n  },\n  'user/by-id/:id/block': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ id: z.string() }).strict(),\n  },\n  'user/by-id/:id/unblock': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ id: z.string() }).strict(),\n  },\n  users: {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as FullUser[],\n    props: z\n      .object({\n        limit: z.coerce.number().gte(0).lte(1000).default(500),\n        before: z.string().optional(),\n      })\n      .strict(),\n  },\n  'search-users': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as FullUser[],\n    props: z\n      .object({\n        term: z.string(),\n        limit: z.coerce.number().gte(0).lte(1000).default(500),\n        page: z.coerce.number().gte(0).default(0),\n      })\n      .strict(),\n  },\n  'search-contract-positions': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: [] as DisplayUser[],\n    props: z\n      .object({\n        term: z.string(),\n        contractId: z.string(),\n        limit: z.coerce.number().gte(0).lte(100).default(10),\n      })\n      .strict(),\n  },\n  'save-twitch': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: z\n      .object({\n        twitchInfo: z.object({\n          twitchName: z.string().optional(),\n          controlToken: z.string().optional(),\n          botEnabled: z.boolean().optional(),\n          needsRelinking: z.boolean().optional(),\n        }),\n      })\n      .strict(),\n  },\n  'set-push-token': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({ pushToken: z.string() }).strict(),\n  },\n  'update-notif-settings': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({\n      type: z.string() as z.ZodType<notification_preference>,\n      medium: z.enum(['email', 'browser', 'mobile']),\n      enabled: z.boolean(),\n    }),\n  },\n  headlines: {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: [] as Headline[],\n    props: z.object({\n      slug: z.enum(['politics', 'ai', 'news']).optional(),\n    }),\n  },\n  'politics-headlines': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: [] as Headline[],\n    props: z.object({}),\n  },\n  'set-news': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as { success: true },\n    props: z\n      .object({\n        dashboardIds: z.array(z.string()),\n        endpoint: z.enum(['politics', 'ai', 'news']),\n      })\n      .strict(),\n  },\n  react: {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: z\n      .object({\n        contentId: z.string(),\n        contentType: z.enum(['comment', 'contract']),\n        remove: z.boolean().optional(),\n      })\n      .strict(),\n    returns: { success: true },\n  },\n  'compatible-lovers': {\n    method: 'GET',\n    visibility: 'private',\n    authed: false,\n    props: z.object({ userId: z.string() }),\n    returns: {} as {\n      lover: Lover\n      compatibleLovers: Lover[]\n      loverCompatibilityScores: {\n        [userId: string]: CompatibilityScore\n      }\n    },\n  },\n  post: {\n    method: 'POST',\n    visibility: 'private',\n    authed: true,\n    returns: {} as ContractComment,\n    props: z\n      .object({\n        contractId: z.string(),\n        betId: z.string().optional(),\n        commentId: z.string().optional(),\n        content: contentSchema.optional(),\n      })\n      .strict(),\n  },\n  'fetch-link-preview': {\n    method: 'GET',\n    visibility: 'private',\n    authed: false,\n    props: z.object({ url: z.string() }).strict(),\n    cache: 'max-age=86400, stale-while-revalidate=86400',\n    returns: {} as LinkPreview,\n  },\n  'remove-pinned-photo': {\n    method: 'POST',\n    visibility: 'private',\n    authed: true,\n    returns: { success: true },\n    props: z\n      .object({\n        userId: z.string(),\n      })\n      .strict(),\n  },\n  'get-related-markets': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    props: z\n      .object({\n        contractId: z.string(),\n        limit: z.coerce.number().gte(0).lte(100),\n        userId: z.string().optional(),\n      })\n      .strict(),\n    returns: {} as {\n      marketsFromEmbeddings: Contract[]\n    },\n    cache: 'public, max-age=3600, stale-while-revalidate=10',\n  },\n  'get-related-markets-by-group': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    cache: 'public, max-age=3600, stale-while-revalidate=10',\n    returns: {} as {\n      groupContracts: Contract[]\n    },\n    props: z\n      .object({\n        contractId: z.string(),\n        limit: z.coerce.number().gte(0).lte(100),\n        offset: z.coerce.number().gte(0),\n      })\n      .strict(),\n  },\n  'unlist-and-cancel-user-contracts': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: z\n      .object({\n        userId: z.string(),\n      })\n      .strict(),\n  },\n  'get-ad-analytics': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: false,\n    props: z\n      .object({\n        contractId: z.string(),\n      })\n      .strict(),\n    returns: {} as {\n      uniqueViewers: number\n      totalViews: number\n      uniquePromotedViewers: number\n      totalPromotedViews: number\n      redeemCount: number\n      isBoosted: boolean\n      totalFunds: number\n      adCreatedTime: string\n    },\n  },\n  'get-seen-market-ids': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({\n      contractIds: z.array(z.string()),\n      types: z.array(z.enum(['page', 'card', 'promoted'])).optional(),\n      since: z.number(),\n    }),\n    returns: [] as string[],\n  },\n  'get-compatibility-questions': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z.object({}),\n    returns: {} as {\n      status: 'success'\n      questions: (Row<'love_questions'> & {\n        answer_count: number\n        score: number\n      })[]\n    },\n  },\n  'like-lover': {\n    method: 'POST',\n    visibility: 'private',\n    authed: true,\n    props: z.object({\n      targetUserId: z.string(),\n      remove: z.boolean().optional(),\n    }),\n    returns: {} as {\n      status: 'success'\n    },\n  },\n  'ship-lovers': {\n    method: 'POST',\n    visibility: 'private',\n    authed: true,\n    props: z.object({\n      targetUserId1: z.string(),\n      targetUserId2: z.string(),\n      remove: z.boolean().optional(),\n    }),\n    returns: {} as {\n      status: 'success'\n    },\n  },\n\n  'get-likes-and-ships': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z\n      .object({\n        userId: z.string(),\n      })\n      .strict(),\n    returns: {} as {\n      status: 'success'\n      likesReceived: LikeData[]\n      likesGiven: LikeData[]\n      ships: ShipData[]\n    },\n  },\n  'has-free-like': {\n    method: 'GET',\n    visibility: 'private',\n    authed: true,\n    props: z.object({}).strict(),\n    returns: {} as {\n      status: 'success'\n      hasFreeLike: boolean\n    },\n  },\n  'star-lover': {\n    method: 'POST',\n    visibility: 'private',\n    authed: true,\n    props: z.object({\n      targetUserId: z.string(),\n      remove: z.boolean().optional(),\n    }),\n    returns: {} as {\n      status: 'success'\n    },\n  },\n  'get-lovers': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z.object({}).strict(),\n    returns: {} as {\n      status: 'success'\n      lovers: Lover[]\n    },\n  },\n  'get-lover-answers': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z.object({ userId: z.string() }).strict(),\n    returns: {} as {\n      status: 'success'\n      answers: Row<'love_compatibility_answers'>[]\n    },\n  },\n  'search-groups': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    // Is there a way to infer return { lite:[] as LiteGroup[] } if type is 'lite'?\n    returns: {\n      full: [] as Group[],\n      lite: [] as LiteGroup[],\n    },\n    props: SearchGroupParams(SearchGroupShape),\n  },\n  'search-my-groups': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {\n      full: [] as Group[],\n      lite: [] as LiteGroup[],\n    },\n    props: SearchGroupParams(MySearchGroupShape),\n  },\n  'get-groups-with-top-contracts': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    returns: [] as { topic: Topic; contracts: Contract[] }[],\n    props: z.object({}),\n  },\n  'get-balance-changes': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: [] as AnyBalanceChangeType[],\n    props: z\n      .object({\n        after: z.coerce.number(),\n        userId: z.string(),\n      })\n      .strict(),\n  },\n  'get-partner-stats': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z\n      .object({\n        userId: z.string(),\n      })\n      .strict(),\n    returns: {} as {\n      status: 'success' | 'error'\n      username: string\n      numContractsCreated: number\n      numUniqueBettors: number\n      numReferrals: number\n      numReferralsWhoRetained: number\n      totalTraderIncome: number\n      totalReferralIncome: number\n      dollarsEarned: number\n    },\n  },\n  'record-contract-view': {\n    method: 'POST',\n    visibility: 'public',\n    authed: false,\n    props: z.object({\n      userId: z.string().optional(),\n      contractId: z.string(),\n      kind: z.enum(['page', 'card', 'promoted']),\n    }),\n    returns: {} as { status: 'success' },\n  },\n  'record-comment-view': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({\n      contractId: z.string(),\n      commentId: z.string(),\n    }),\n    returns: {} as { status: 'success' },\n  },\n  'record-contract-interaction': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({\n      contractId: z.string(),\n      kind: z.enum([\n        'page bet',\n        'page comment',\n        'page repost',\n        'page like',\n        'card bet',\n        'card click',\n        'promoted click',\n        'card like',\n        'page share',\n        'browse click',\n      ]),\n      commentId: z.string().optional(),\n      feedReasons: z.array(z.string()).optional(),\n      feedType: z.string().optional(),\n      betGroupId: z.string().optional(),\n      betId: z.string().optional(),\n    }),\n    returns: {} as { status: 'success' },\n  },\n  'get-dashboard-from-slug': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z.object({\n      dashboardSlug: z.string(),\n    }),\n    cache: DEFAULT_CACHE_STRATEGY,\n    returns: {} as Dashboard,\n  },\n  'create-public-chat-message': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as ChatMessage,\n    props: z.object({\n      content: contentSchema,\n      channelId: z.string(),\n    }),\n  },\n  'get-followed-groups': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z.object({\n      userId: z.string(),\n    }),\n    returns: {} as {\n      groups: Group[]\n    },\n  },\n  'get-user-portfolio': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z.object({\n      userId: z.string(),\n    }),\n    returns: {} as LivePortfolioMetrics,\n  },\n  'get-user-portfolio-history': {\n    method: 'GET',\n    visibility: 'public',\n    authed: false,\n    props: z.object({\n      userId: z.string(),\n      period: z.enum(PERIODS),\n    }),\n    returns: {} as PortfolioMetrics[],\n  },\n  'get-channel-memberships': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({\n      channelId: z.coerce.number().optional(),\n      createdTime: z.string().optional(),\n      lastUpdatedTime: z.string().optional(),\n      limit: z.coerce.number(),\n    }),\n    returns: {\n      channels: [] as PrivateMessageChannel[],\n      memberIdsByChannelId: {} as { [channelId: string]: string[] },\n    },\n  },\n  'get-channel-messages': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({\n      channelId: z.coerce.number(),\n      limit: z.coerce.number(),\n      id: z.coerce.number().optional(),\n    }),\n    returns: [] as PrivateChatMessage[],\n  },\n  'get-channel-seen-time': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({\n      channelIds: z.array(z.coerce.number()),\n    }),\n    returns: [] as [number, string][],\n  },\n  'set-channel-seen-time': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: z.object({\n      channelId: z.coerce.number(),\n    }),\n  },\n  'get-feed': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: {} as {\n      contracts: Contract[]\n      comments: ContractComment[]\n      ads: adContract[]\n      bets: Bet[]\n      reposts: Repost[]\n      idsToReason: { [id: string]: string }\n    },\n    props: z\n      .object({\n        userId: z.string(),\n        limit: z.coerce.number().gt(0).lte(100).default(100),\n        offset: z.coerce.number().gte(0).default(0),\n        ignoreContractIds: z.array(z.string()).optional(),\n      })\n      .strict(),\n  },\n  'get-mana-supply': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: {} as ManaSupply,\n    props: z.object({}).strict(),\n  },\n  'get-notifications': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    returns: [] as Notification[],\n    props: z\n      .object({\n        after: z.coerce.number().optional(),\n        limit: z.coerce.number().gte(0).lte(1000).default(100),\n      })\n      .strict(),\n  },\n  'update-mod-report': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z\n      .object({\n        reportId: z.number(),\n        updates: z\n          .object({\n            status: z\n              .enum(['new', 'under review', 'resolved', 'needs admin'])\n              .optional(),\n            mod_note: z.string().optional(),\n          })\n          .partial(),\n      })\n      .strict(),\n    returns: {} as { status: string; report: ModReport },\n  },\n  'get-mod-reports': {\n    method: 'GET',\n    visibility: 'public',\n    authed: true,\n    props: z.object({}).strict(),\n    returns: {} as { status: string; reports: ModReport[] },\n  },\n  'get-txn-summary-stats': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: {} as Row<'txn_summary_stats'>[],\n    props: z\n      .object({\n        ignoreCategories: z.array(z.string()).optional(),\n        fromType: z.string().optional(),\n        toType: z.string().optional(),\n        limitDays: z.coerce.number(),\n      })\n      .strict(),\n  },\n  'get-mana-summary-stats': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: {} as Row<'mana_supply_stats'>[],\n    props: z\n      .object({\n        limitDays: z.coerce.number(),\n      })\n      .strict(),\n  },\n  'register-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    props: verificationParams,\n    returns: {} as RegistrationReturnType,\n  },\n  'get-verification-status-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as {\n      status: string\n      documents?: GIDXDocument[]\n      message?: string\n      documentStatus?: string\n    },\n    props: z.object({}),\n  },\n  'get-monitor-status-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as {\n      status: string\n      message?: string\n    },\n    props: z.object({\n      DeviceGPS: GPSProps,\n    }),\n  },\n  'get-checkout-session-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as {\n      status: string\n      message?: string\n      session?: CheckoutSession\n    },\n    props: z.object({\n      PayActionCode: z.enum(['PAY', 'PAYOUT']).default('PAY'),\n      DeviceGPS: GPSProps,\n    }),\n  },\n  'complete-checkout-session-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as {\n      status: string\n      message?: string\n      gidxMessage?: string | null\n      details?: PaymentDetail[]\n    },\n    props: z.object(checkoutParams),\n  },\n  'complete-cashout-session-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as {\n      status: string\n      message?: string\n      gidxMessage?: string | null\n      details?: PaymentDetail[]\n    },\n    props: cashoutParams,\n  },\n  'get-verification-documents-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as {\n      status: string\n      documents: GIDXDocument[]\n      utilityDocuments: GIDXDocument[]\n      idDocuments: GIDXDocument[]\n      rejectedDocuments: GIDXDocument[]\n    },\n    props: z.object({}),\n  },\n  'upload-document-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as { status: string },\n    props: z.object({\n      CategoryType: z.number().gte(1).lte(7),\n      fileName: z.string(),\n      fileUrl: z.string(),\n    }),\n  },\n  'identity-callback-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: false,\n    returns: {} as { Accepted: boolean },\n    props: z.object({\n      MerchantCustomerID: z.string(),\n      NotificationType: z.string(),\n    }),\n  },\n  'payment-callback-gidx': {\n    method: 'POST',\n    visibility: 'undocumented',\n    authed: false,\n    returns: {} as { MerchantTransactionID: string },\n    props: z\n      .object({\n        MerchantTransactionID: z.string(),\n        TransactionStatusCode: z.coerce.number(),\n        TransactionStatusMessage: z.string(),\n        StatusCode: z.coerce.number(),\n        SessionID: z.string(),\n        MerchantSessionID: z.string(),\n        SessionScore: z.coerce.number(),\n        ReasonCodes: z.array(z.string()).optional(),\n        ServiceType: z.string(),\n        StatusMessage: z.string(),\n      })\n      .strict(),\n  },\n  'get-best-comments': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: true,\n    returns: {} as { comments: ContractComment[]; contracts: Contract[] },\n    props: z.object({\n      limit: z.coerce.number().gte(0).lte(100).default(20),\n      offset: z.coerce.number().gte(0).default(0),\n      ignoreContractIds: z.array(z.string()).optional(),\n      justLikes: z.coerce.number().optional(),\n    }),\n  },\n  'get-redeemable-prize-cash': {\n    method: 'GET',\n    visibility: 'public',\n    authed: true,\n    returns: {} as { redeemablePrizeCash: number },\n    props: z.object({}).strict(),\n  },\n  'get-cashouts': {\n    method: 'GET',\n    visibility: 'undocumented',\n    authed: false,\n    returns: [] as CashoutStatusData[],\n    props: z\n      .object({\n        limit: z.coerce.number().gte(0).lte(100).default(10),\n        offset: z.coerce.number().gte(0).default(0),\n        userId: z.string().optional(),\n      })\n      .strict(),\n  },\n} as const)\n\nexport type APIPath = keyof typeof API\nexport type APISchema<N extends APIPath> = (typeof API)[N]\n\nexport type APIParams<N extends APIPath> = z.input<APISchema<N>['props']>\nexport type ValidatedAPIParams<N extends APIPath> = z.output<\n  APISchema<N>['props']\n>\n\nexport type APIResponse<N extends APIPath> = APISchema<N> extends {\n  returns: Record<string, any>\n}\n  ? APISchema<N>['returns']\n  : void\n\nexport type APIResponseOptionalContinue<N extends APIPath> =\n  | { continue: () => Promise<void>; result: APIResponse<N> }\n  | APIResponse<N>\n",
    'backend/api/src/delete-comment.ts':
      "import { isAdminId, isModId } from 'common/envs/constants'\nimport { getContract, revalidateContractStaticProps } from 'shared/utils'\nimport { getComment } from 'shared/supabase/contract-comments'\nimport { createSupabaseDirectClient } from 'shared/supabase/init'\nimport { APIError, type APIHandler } from './helpers/endpoint'\n\nexport const deleteComment: APIHandler<'delete-comment'> = async (\n  { commentId },\n  auth\n) => {\n  const pg = createSupabaseDirectClient()\n\n  const comment = await getComment(pg, commentId)\n  if (!comment) {\n    throw new APIError(404, 'Comment not found')\n  }\n\n  const contract = await getContract(pg, comment.contractId)\n  if (!contract) {\n    throw new APIError(404, 'Contract not found')\n  }\n\n  const isContractCreator = contract.creatorId === auth.uid\n  const isCommentCreator = comment.userId === auth.uid\n\n  if (!isAdminId(auth.uid) && !isContractCreator && !isCommentCreator && !isModId(auth.uid)) {\n    throw new APIError(403, 'Only the comment creator, market creator, or mod can delete comments')\n  }\n\n  // Delete the comment\n  await pg.none('DELETE FROM contract_comments WHERE comment_id = $1', [commentId])\n\n  await revalidateContractStaticProps(contract)\n\n  return { success: true }\n}\n",
    'web/lib/api/api.ts':
      "import { auth } from '../firebase/users'\nimport { getApiUrl } from 'common/api/utils'\nimport { JSONContent } from '@tiptap/core'\nimport { Group, PrivacyStatusType } from 'common/group'\nimport { AD_RATE_LIMIT } from 'common/boost'\nimport { ContractComment } from 'common/comment'\nimport { ReportProps } from 'common/report'\nimport { BaseDashboard, DashboardItem } from 'common/dashboard'\nimport { Bet } from 'common/bet'\nimport { API, APIParams, APIPath, APIResponse } from 'common/api/schema'\nimport { baseApiCall, formatApiUrlWithParams } from 'common/util/api'\nimport { sleep } from 'common/util/time'\nimport { Contract } from 'common/contract'\nexport { APIError } from 'common/api/utils'\n\nexport async function call(\n  url: string,\n  method: 'POST' | 'PUT' | 'GET',\n  params?: any\n) {\n  return baseApiCall(url, method, params, auth.currentUser)\n}\n\n// This is the preferred way of using the api going forward\nexport async function api<P extends APIPath>(\n  path: P,\n  params: APIParams<P> = {}\n) {\n  // If the api is authed and the user is not loaded, wait for the user to load.\n  if (API[path].authed && !auth.currentUser) {\n    let i = 0\n    while (!auth.currentUser) {\n      i++\n      await sleep(i * 10)\n      if (i > 30) {\n        console.error('User did not load after 30 iterations')\n        break\n      }\n    }\n  }\n\n  return (await call(\n    formatApiUrlWithParams(path, params),\n    API[path].method,\n    params\n  )) as Promise<APIResponse<P>>\n}\n\n// helper function for the old apis so we don't have to migrate them\nfunction curriedAPI<P extends APIPath>(path: P) {\n  return (params: APIParams<P>) => api(path, params)\n}\n\nexport function createAnswer(params: any) {\n  return call(getApiUrl('createanswer'), 'POST', params)\n}\n\nexport function claimDestinySub(params: any) {\n  return call(getApiUrl('claimdestinysub'), 'POST', params)\n}\n\nexport function createUser(params: any) {\n  return call(getApiUrl('createuser'), 'POST', params)\n}\n\nexport function swapCert(params: any) {\n  return call(getApiUrl('swapcert'), 'POST', params)\n}\n\nexport function dividendCert(params: any) {\n  return call(getApiUrl('dividendcert'), 'POST', params)\n}\n\nexport function claimManalink(params: any) {\n  return call(getApiUrl('claimmanalink'), 'POST', params)\n}\n\nexport function createGroup(params: any) {\n  return call(getApiUrl('creategroup'), 'POST', params)\n}\n\nexport function updateGroup(params: { id: string } & Partial<Group>) {\n  return call(getApiUrl('updategroup'), 'POST', params)\n}\n\nexport function acceptChallenge(params: any) {\n  return call(getApiUrl('acceptchallenge'), 'POST', params)\n}\n\nexport function boostMarket(params: any) {\n  return call(getApiUrl('boost-market'), 'POST', params)\n}\n\nlet nonce = 0\nexport function redeemBoost(params: any) {\n  const now = Date.now()\n  if (now - nonce < AD_RATE_LIMIT - 500) {\n    throw Error(\n      `Please wait ${AD_RATE_LIMIT / 1000} seconds between redeeming boosts.`\n    )\n  }\n  nonce = now\n  return call(getApiUrl('redeem-boost'), 'POST', params)\n}\n\nexport function validateIapReceipt(params: any) {\n  return call(getApiUrl('validateiap'), 'POST', params)\n}\n\nexport function markAllNotifications(params: any) {\n  return call(getApiUrl('markallnotifications'), 'POST', params)\n}\n\nexport function updateMemberRole(params: {\n  groupId: string\n  memberId: string\n  role: string\n}) {\n  return call(getApiUrl('updatememberrole'), 'POST', params)\n}\n\nexport function updateGroupPrivacy(params: {\n  groupId: string\n  privacy: PrivacyStatusType\n}) {\n  return call(getApiUrl('updategroupprivacy'), 'POST', params)\n}\n\nexport function registerDiscordId(params: any) {\n  return call(getApiUrl('registerdiscordid'), 'POST', params)\n}\n\nexport function getUserIsFollowingTopic(params: { groupSlug: string }) {\n  return call(getApiUrl('getuserisgroupmember'), 'POST', params)\n}\n\nexport function completeQuest(params: any) {\n  return call(getApiUrl('completequest'), 'POST', params)\n}\n\nexport function getSupabaseToken() {\n  return call(getApiUrl('getsupabasetoken'), 'GET')\n}\n\nexport function updateUserDisinterestEmbedding(params: {\n  contractId: string\n  creatorId: string\n  feedId?: number\n  removeContract?: boolean\n}) {\n  return call(getApiUrl('update-user-disinterest-embedding'), 'POST', params)\n}\n\nexport const searchContracts = curriedAPI('search-markets-full')\n\nexport function deleteMarket(params: { contractId: string }) {\n  return call(getApiUrl('delete-market'), 'POST', params) as Promise<{\n    status: 'success'\n  }>\n}\n\nexport function saveTopic(params: { topic: string }) {\n  return call(getApiUrl('save-topic'), 'POST', params) as Promise<{\n    status: 'success'\n  }>\n}\n\nexport function setTV(params: {\n  streamId: string\n  slug: string\n  source: string\n  title: string\n  startTime: string\n  endTime: string\n}) {\n  return call(getApiUrl('settv'), 'POST', params) as Promise<{\n    status: 'success'\n  }>\n}\n\nexport function deleteTV(id: string) {\n  return call(getApiUrl('deletetv'), 'POST', { id }) as Promise<{\n    status: 'success'\n  }>\n}\n\nexport function joinGroupThroughInvite(params: { inviteId: string }) {\n  return call(getApiUrl('joingroupthroughinvite'), 'POST', params)\n}\n\nexport function followTopic(params: { groupId: string }) {\n  return call(getApiUrl('follow-topic'), 'POST', params)\n}\n\nexport const searchGroups = curriedAPI('search-groups')\n\nexport function leagueActivity(params: { season: number; cohort: string }) {\n  return call(getApiUrl('league-activity'), 'POST', params) as Promise<{\n    bets: Bet[]\n    comments: ContractComment[]\n    contracts: Contract[]\n  }>\n}\n\nexport function cancelBounty(params: { contractId: string }) {\n  return call(getApiUrl('cancel-bounty'), 'POST', params)\n}\n\nexport function searchGiphy(params: { term: string; limit: number }) {\n  return call(getApiUrl('searchgiphy'), 'POST', params)\n}\n\nexport function tweetFromManaChan(params: { tweet: string }) {\n  return call(getApiUrl('manachantweet'), 'POST', params)\n}\n\nexport function leaveReview(params: any) {\n  return call(getApiUrl('leave-review'), 'POST', params)\n}\nexport function getUserContractsMetricsWithContracts(params: {\n  userId: string\n  offset: number\n  limit: number\n}) {\n  return call(\n    getApiUrl('get-user-contract-metrics-with-contracts'),\n    'POST',\n    params\n  )\n}\n\nexport function castPollVote(params: { contractId: string; voteId: string }) {\n  return call(getApiUrl('cast-poll-vote'), 'POST', params)\n}\n\nexport function getSimilarGroupsToContract(params: { question: string }) {\n  return call(getApiUrl('get-similar-groups-to-contract'), 'POST', params)\n}\n\nexport function bidForLeague(params: {\n  season: number\n  division: number\n  cohort: string\n  amount: number\n}) {\n  return call(getApiUrl('bidforleague'), 'POST', params)\n}\n\nexport function followUser(userId: string) {\n  return call(getApiUrl('follow-user'), 'POST', { userId, follow: true })\n}\n\nexport function unfollowUser(userId: string) {\n  return call(getApiUrl('follow-user'), 'POST', { userId, follow: false })\n}\n\nexport function report(params: ReportProps) {\n  return call(getApiUrl('report'), 'POST', params)\n}\n\nexport function createDashboard(params: {\n  title: string\n  items: DashboardItem[]\n  topics: string[]\n}) {\n  return call(getApiUrl('createdashboard'), 'POST', params)\n}\n\nexport function getYourDashboards() {\n  return call(getApiUrl('getyourdashboards'), 'POST')\n}\n\nexport function followDashboard(params: { dashboardId: string }) {\n  return call(getApiUrl('followdashboard'), 'POST', params)\n}\n\nexport function supabaseSearchDashboards(params: {\n  term: string\n  offset: number\n  limit: number\n}) {\n  return call(getApiUrl('supabasesearchdashboards'), 'POST', params) as Promise<\n    BaseDashboard[]\n  >\n}\n\nexport function getYourFollowedDashboards() {\n  return call(getApiUrl('getyourfolloweddashboards'), 'POST')\n}\n\nexport function updateDashboard(params: {\n  title: string\n  dashboardId: string\n  items: DashboardItem[]\n  topics?: string[]\n}) {\n  return call(getApiUrl('updatedashboard'), 'POST', params)\n}\n\nexport function deleteDashboard(params: { dashboardId: string }) {\n  return call(getApiUrl('delete-dashboard'), 'POST', params)\n}\n\nexport function referUser(params: {\n  referredByUsername: string\n  contractId?: string\n}) {\n  return call(getApiUrl('refer-user'), 'POST', params)\n}\n\nexport const updateMarket = curriedAPI('market/:contractId/update')\n\nexport const updateUser = curriedAPI('me/update')\n\nexport function banUser(params: { userId: string; unban?: boolean }) {\n  return call(getApiUrl('ban-user'), 'POST', params)\n}\nexport function createPrivateMessageChannelWithUsers(params: {\n  userIds: string[]\n}) {\n  return call(getApiUrl('create-private-user-message-channel'), 'POST', params)\n}\n\nexport function sendUserPrivateMessage(params: {\n  channelId: number\n  content: JSONContent\n}) {\n  return call(getApiUrl('create-private-user-message'), 'POST', params)\n}\nexport function leavePrivateMessageChannel(params: { channelId: number }) {\n  return call(getApiUrl('leave-private-user-message-channel'), 'POST', params)\n}\nexport function updatePrivateMessageChannel(params: {\n  channelId: number\n  notifyAfterTime: number\n}) {\n  return call(getApiUrl('update-private-user-message-channel'), 'POST', params)\n}\nexport function editAnswerCpmm(params: {\n  answerId: string\n  text?: string\n  color?: string\n  contractId: string\n}) {\n  return call(getApiUrl('edit-answer-cpmm'), 'POST', params)\n}\n\nexport function createChartAnnotation(params: {\n  eventTime: number\n  contractId: string\n  text?: string\n  commentId?: string\n  thumbnailUrl?: string\n  externalUrl?: string\n  answerId?: string\n  probChange?: number\n}) {\n  return call(getApiUrl('create-chart-annotation'), 'POST', params)\n}\n\nexport function deleteChartAnnotation(params: { id: number }) {\n  return call(getApiUrl('delete-chart-annotation'), 'POST', params)\n}\nexport function getAdAnalytics(params: { contractId: string }) {\n  return call(getApiUrl('get-ad-analytics'), 'POST', params)\n}\n\nexport function requestLoan() {\n  return call(getApiUrl('request-loan'), 'GET')\n}\n",
    'backend/api/src/comments.ts': null,
    'web/components/comments/comment-actions.tsx':
      "import { ReplyIcon } from '@heroicons/react/solid'\nimport clsx from 'clsx'\nimport { ContractComment } from 'common/comment'\nimport { Contract } from 'common/contract'\nimport { richTextToString } from 'common/util/parse'\nimport { useState } from 'react'\nimport { FaArrowTrendUp, FaArrowTrendDown } from 'react-icons/fa6'\nimport { useUser, usePrivateUser, isBlocked } from 'web/hooks/use-user'\nimport { BuyPanel } from '../bet/bet-panel'\nimport { IconButton } from '../buttons/button'\nimport { LikeButton } from '../contract/like-button'\nimport { Col } from '../layout/col'\nimport { Modal, MODAL_CLASS } from '../layout/modal'\nimport { Row } from '../layout/row'\nimport { Tooltip } from '../widgets/tooltip'\nimport { track } from 'web/lib/service/analytics'\nimport { AwardBountyButton } from '../contract/bountied-question'\nimport { TRADE_TERM } from 'common/envs/constants'\n\nexport function CommentActions(props: {\n  onReplyClick?: (comment: ContractComment) => void\n  onAward?: (bountyTotal: number) => void\n  comment: ContractComment\n  contract: Contract\n  trackingLocation: string\n}) {\n  const { onReplyClick, onAward, comment, contract, trackingLocation } = props\n  const user = useUser()\n  const privateUser = usePrivateUser()\n\n  const isBountiedQuestion = contract.outcomeType === 'BOUNTIED_QUESTION'\n  const canGiveBounty =\n    isBountiedQuestion &&\n    user &&\n    user.id == contract.creatorId &&\n    comment.userId != user.id &&\n    onAward\n  const [showBetModal, setShowBetModal] = useState(false)\n  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)\n  const diff =\n    (comment.betReplyAmountsByOutcome?.YES ?? 0) -\n    (comment.betReplyAmountsByOutcome?.NO ?? 0)\n\n  const isCashContract = contract.token === 'CASH'\n\n  return (\n    <Row className=\"grow items-center justify-end\">\n      {canGiveBounty && (\n        <AwardBountyButton\n          contract={contract}\n          comment={comment}\n          onAward={onAward}\n          user={user}\n          disabled={contract.bountyLeft <= 0}\n          buttonClassName={'mr-1'}\n        />\n      )}\n      {user && contract.outcomeType === 'BINARY' && !isCashContract && (\n        <IconButton\n          onClick={() => {\n            // TODO: Twomba tracking bet terminology\n            track('bet intent', { location: 'comment on contract' })\n            setOutcome('YES')\n            setShowBetModal(true)\n          }}\n          size={'xs'}\n        >\n          <Tooltip text={`Reply with a ${TRADE_TERM}`} placement=\"bottom\">\n            <Row className=\"gap-1\">\n              {diff != 0 && (\n                <span className=\"\">{Math.round(Math.abs(diff))}</span>\n              )}\n              {diff > 0 ? (\n                <FaArrowTrendUp className={'h-5 w-5 text-teal-500'} />\n              ) : diff < 0 ? (\n                <FaArrowTrendDown className={'text-scarlet-500 h-5 w-5'} />\n              ) : (\n                <FaArrowTrendUp className={'h-5 w-5'} />\n              )}\n            </Row>\n          </Tooltip>\n        </IconButton>\n      )}\n      {user && onReplyClick && (\n        <IconButton\n          size={'xs'}\n          onClick={(e) => {\n            e.preventDefault()\n            e.stopPropagation()\n            onReplyClick(comment)\n          }}\n          className={'text-ink-500'}\n        >\n          <Tooltip text=\"Reply with a comment\" placement=\"bottom\">\n            <ReplyIcon className=\"h-5 w-5 \" />\n          </Tooltip>\n        </IconButton>\n      )}\n      <LikeButton\n        contentCreatorId={comment.userId}\n        contentId={comment.id}\n        user={user}\n        contentType={'comment'}\n        size={'xs'}\n        contentText={richTextToString(comment.content)}\n        disabled={isBlocked(privateUser, comment.userId)}\n        trackingLocation={trackingLocation}\n      />\n      {showBetModal && (\n        <Modal\n          open={showBetModal}\n          setOpen={setShowBetModal}\n          className={clsx(\n            MODAL_CLASS,\n            'pointer-events-auto max-h-[32rem] overflow-auto'\n          )}\n        >\n          <Col>\n            <span className={'text-primary-700 mb-4 line-clamp-2 text-lg'}>\n              @{comment.userUsername}: {richTextToString(comment.content)}\n            </span>\n            <BuyPanel\n              contract={contract as any}\n              initialOutcome={outcome}\n              onBuySuccess={() => setTimeout(() => setShowBetModal(false), 500)}\n              location={'comment on contract'}\n              inModal={true}\n              replyToCommentId={comment.id}\n              alwaysShowOutcomeSwitcher={true}\n            />\n          </Col>\n        </Modal>\n      )}\n    </Row>\n  )\n}\n",
    'web/hooks/use-comments.ts':
      "import { ContractComment } from 'common/comment'\nimport { useEffect, useState } from 'react'\nimport { sortBy, uniqBy, orderBy } from 'lodash'\nimport {\n  getAllCommentRows,\n  getComment,\n  getNumContractComments,\n} from 'web/lib/supabase/comments'\nimport { convertContractComment } from 'common/supabase/comments'\nimport { api } from 'web/lib/api/api'\nimport { usePersistentInMemoryState } from './use-persistent-in-memory-state'\nimport { useApiSubscription } from './use-api-subscription'\n\nexport function useNumContractComments(contractId: string) {\n  const [numComments, setNumComments] = useState<number>(0)\n\n  useEffect(() => {\n    if (contractId) {\n      getNumContractComments(contractId).then((result) =>\n        setNumComments(result)\n      )\n    }\n  }, [contractId])\n\n  return numComments\n}\n\nexport function useCommentsOnContract(contractId: string) {\n  const [comments, setComments] = useState<ContractComment[] | undefined>(\n    undefined\n  )\n  useEffect(() => {\n    api('comments', { contractId }).then((comments) => {\n      setComments(comments)\n    })\n  }, [contractId])\n  return comments\n}\n\nexport function useCommentOnContract(commentId: string) {\n  const [comment, setComment] = useState<ContractComment | undefined | null>(\n    undefined\n  )\n  useEffect(() => {\n    getComment(commentId).then(setComment)\n  }, [commentId])\n  return comment\n}\n\nexport const useSubscribeGlobalComments = () => {\n  const [newComments, setNewComments] = usePersistentInMemoryState<\n    ContractComment[]\n  >([], 'global-new-comments')\n\n  useApiSubscription({\n    topics: [`global/new-comment`],\n    onBroadcast: (msg) => {\n      const newComment = msg.data.comment as ContractComment\n      setNewComments((currentComments) =>\n        sortBy(uniqBy([...currentComments, newComment], 'id'), 'createdTime')\n      )\n    },\n  })\n\n  return newComments\n}\n\nexport const useGlobalComments = (limit: number) => {\n  const [comments, setComments] = usePersistentInMemoryState<\n    ContractComment[] | undefined\n  >(undefined, `global-comments-${limit}`)\n\n  useEffect(() => {\n    getAllCommentRows(limit).then((rows) =>\n      setComments(rows.map(convertContractComment))\n    )\n  }, [limit])\n\n  return comments\n}\n\nexport function useSubscribeNewComments(contractId: string) {\n  const [comments, setComments] = useState<ContractComment[]>([])\n\n  useApiSubscription({\n    topics: [`contract/${contractId}/new-comment`],\n    onBroadcast: (msg) => {\n      const newComment = msg.data.comment as ContractComment\n      setComments((prevComments) =>\n        orderBy(\n          uniqBy([...prevComments, newComment], 'id'),\n          'createdTime',\n          'desc'\n        )\n      )\n    },\n  })\n\n  return comments\n}\n",
    'backend/api/src/hide-comment.ts':
      "import { isAdminId, isModId } from 'common/envs/constants'\nimport { getContract, revalidateContractStaticProps } from 'shared/utils'\nimport { getComment } from 'shared/supabase/contract-comments'\nimport { createSupabaseDirectClient } from 'shared/supabase/init'\nimport { updateData } from 'shared/supabase/utils'\nimport { APIError, type APIHandler } from './helpers/endpoint'\n\nexport const hideComment: APIHandler<'hide-comment'> = async (\n  { commentPath },\n  auth\n) => {\n  // Comment path is of the form /[username]/[contractId]/comment/[commentId] because firebase\n  const [, contractId, , commentId] = commentPath.split('/')\n  if (!contractId || !commentId) {\n    throw new APIError(\n      400,\n      'Invalid comment path. If you can read this, tell sinclair to change this endpoint to have more sensible inputs'\n    )\n  }\n\n  const pg = createSupabaseDirectClient()\n\n  const contract = await getContract(pg, contractId)\n  if (!contract) throw new APIError(404, 'Contract not found')\n\n  const isContractCreator = contract.creatorId === auth.uid\n\n  if (!isAdminId(auth.uid) && !isContractCreator && !isModId(auth.uid)) {\n    throw new APIError(\n      403,\n      'Only the market creator or mod can hide/unhide comments'\n    )\n  }\n\n  const comment = await getComment(pg, commentId)\n\n  // update the comment\n  await updateData(pg, 'contract_comments', 'comment_id', {\n    comment_id: commentId,\n    hidden: !comment.hidden,\n    hiddenTime: Date.now(),\n    hiderId: auth.uid,\n  })\n\n  await revalidateContractStaticProps(contract)\n}\n",
  },
  gitChanges: {
    status:
      'On branch main\nYour branch is up to date with \'origin/main\'.\n\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)\n\tmodified:   backend/api/src/app.ts\n\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)\n\tbackend/api/src/delete-comment.ts\n\nno changes added to commit (use "git add" and/or "git commit -a")\n',
    diff: "diff --git a/backend/api/src/app.ts b/backend/api/src/app.ts\nindex 8f9384254..bd6c9b6b0 100644\n--- a/backend/api/src/app.ts\n+++ b/backend/api/src/app.ts\n@@ -36,6 +36,7 @@ import { boostmarket } from './boost-market'\n import { redeemboost } from './redeem-market-ad-reward'\n import { followtopic } from './follow-topic'\n import { editcomment } from 'api/edit-comment'\n+import { deleteComment } from './delete-comment'\n import {\n   supabasesearchgroups,\n   supabasesearchmygroups,\n@@ -307,6 +308,7 @@ const handlers: { [k in APIPath]: APIHandler<k> } = {\n   'hide-comment': hideComment,\n   'pin-comment': pinComment,\n   comments: getComments,\n+  'delete-comment': deleteComment,\n   market: createMarket,\n   'market/:contractId/group': addOrRemoveTopicFromContract,\n   'market/:contractId/groups': getContractTopics,\n",
    diffCached: '',
    lastCommitMessages:
      'useSaveCampaign: track creative\ndisclaimer\nmantikoros (2):\n\nRemove James from admin ids\nFix forever loading location & refactor\nTs 5.5.4\nGithub actions use node 20\nRemove cast as URLSearchParams\nUpgrade typescript\nFix type errors and add version call\nDisable devtools again',
  },
  changesSinceLastChat: {},
}

export const messages: Message[] = [
  {
    role: 'user',
    content: 'Add an endpoint to delete a comment\n\n',
  },
  {
    role: 'assistant',
    content:
      "Reading the following files...<files>backend/api/src/app.ts, common/src/api/schema.ts, backend/api/src/delete-comment.ts, web/lib/api/api.ts, backend/api/src/comments.ts, web/components/comments/comment-actions.tsx, web/hooks/use-comments.ts, backend/api/src/hide-comment.ts</files>\n\nCertainly! I'll add an endpoint to delete a comment. We'll need to modify a few files to accomplish this. Let's start by adding the endpoint to the API schema and then implement the handler function.\n\nFirst, let's update the API schema in `common/src/api/schema.ts`:\n\n<file path=\"common/src/api/schema.ts\">import { z } from 'zod'\nimport {\n  Group,\n  MAX_ID_LENGTH,\n  MySearchGroupShape,\n  LiteGroup,\n  SearchGroupParams,\n  SearchGroupShape,\n  Topic,\n} from 'common/group'\nimport {\n  createMarketProps,\n  resolveMarketProps,\n  type LiteMarket,\n  FullMarket,\n  updateMarketProps,\n} from './market-types'\nimport { MAX_COMMENT_LENGTH, type ContractComment } from 'common/comment'\nimport { CandidateBet } from 'common/new-bet'\nimport type { Bet, LimitBet } from 'common/bet'\nimport { contentSchema } from 'common/api/zod-types'\nimport { Lover } from 'common/love/lover'\nimport { Contract } from 'common/contract'\nimport { CompatibilityScore } from 'common/love/compatibility-score'\nimport type { Txn, ManaPayTxn } from 'common/txn'\nimport { LiquidityProvision } from 'common/liquidity-provision'\nimport { DisplayUser, FullUser } from './user-types'\nimport { League } from 'common/leagues'\nimport { searchProps } from './market-search-types'\nimport { MAX_ANSWER_LENGTH } from 'common/answer'\nimport { type LinkPreview } from 'common/link-preview'\nimport { Headline } from 'common/news'\nimport { Row } from 'common/supabase/utils'\nimport { LikeData, ShipData } from './love-types'\nimport { AnyBalanceChangeType } from 'common/balance-change'\nimport { Dashboard } from 'common/dashboard'\nimport { ChatMessage, PrivateChatMessage } from 'common/chat-message'\nimport { PrivateUser, User } from 'common/user'\nimport { ManaSupply } from 'common/stats'\nimport { Repost } from 'common/repost'\nimport { adContract } from 'common/boost'\nimport { PERIODS } from 'common/period'\nimport {\n  LivePortfolioMetrics,\n  PortfolioMetrics,\n} from 'common/portfolio-metrics'\nimport { ModReport } from '../mod-report'\n\nimport { RegistrationReturnType } from 'common/reason-codes'\nimport {\n  CheckoutSession,\n  GIDXDocument,\n  GPSProps,\n  PaymentDetail,\n  checkoutParams,\n  verificationParams,\n  cashoutParams,\n  CashoutStatusData,\n} from 'common/gidx/gidx'\n\nimport { notification_preference } from 'common/user-notification-preferences'\nimport { PrivateMessageChannel } from 'common/supabase/private-messages'\nimport { Notification } from 'common/notification'\nimport { NON_POINTS_BETS_LIMIT } from 'common/supabase/bets'\nimport { ContractMetric } from 'common/contract-metric'\n\n// ... (existing code)\n\nlet _apiTypeCheck: { [x: string]: APIGenericSchema }\nexport const API = (_apiTypeCheck = {\n  // ... (existing endpoints)\n\n  'delete-comment': {\n    method: 'POST',\n    visibility: 'public',\n    authed: true,\n    props: z.object({ commentId: z.string() }).strict(),\n    returns: {} as { success: boolean },\n  },\n\n  // ... (rest of the existing code)\n} as const)\n\n// ... (rest of the existing code)\n</file>\n\nNow, let's create a new file `backend/api/src/delete-comment.ts` to implement the delete comment functionality:\n\n<file path=\"backend/api/src/delete-comment.ts\">import { isAdminId, isModId } from 'common/envs/constants'\nimport { getContract, revalidateContractStaticProps } from 'shared/utils'\nimport { getComment } from 'shared/supabase/contract-comments'\nimport { createSupabaseDirectClient } from 'shared/supabase/init'\nimport { APIError, type APIHandler } from './helpers/endpoint'\n\nexport const deleteComment: APIHandler<'delete-comment'> = async (\n  { commentId },\n  auth\n) => {\n  const pg = createSupabaseDirectClient()\n\n  const comment = await getComment(pg, commentId)\n  if (!comment) {\n    throw new APIError(404, 'Comment not found')\n  }\n\n  const contract = await getContract(pg, comment.contractId)\n  if (!contract) {\n    throw new APIError(404, 'Contract not found')\n  }\n\n  const isContractCreator = contract.creatorId === auth.uid\n  const isCommentCreator = comment.userId === auth.uid\n\n  if (!isAdminId(auth.uid) && !isContractCreator && !isCommentCreator && !isModId(auth.uid)) {\n    throw new APIError(403, 'Only the comment creator, market creator, or mod can delete comments')\n  }\n\n  // Delete the comment\n  await pg.none('DELETE FROM contract_comments WHERE comment_id = $1', [commentId])\n\n  await revalidateContractStaticProps(contract)\n\n  return { success: true }\n}\n</file>\n\nFinally, let's update `backend/api/src/app.ts` to register the new endpoint:\n\n<file path=\"backend/api/src/app.ts\">import { hrtime } from 'node:process'\nimport * as cors from 'cors'\nimport * as crypto from 'crypto'\nimport * as express from 'express'\nimport { ErrorRequestHandler, RequestHandler } from 'express'\nimport { log, metrics } from 'shared/utils'\nimport { withMonitoringContext } from 'shared/monitoring/context'\nimport { APIError, pathWithPrefix } from 'common/api/utils'\nimport { health } from './health'\nimport { updateMe } from './update-me'\nimport { placeBet } from './place-bet'\nimport { cancelBet } from './cancel-bet'\nimport { sellShares } from './sell-shares'\nimport { claimmanalink } from './claim-manalink'\nimport { createMarket } from './create-market'\nimport { createComment } from './create-comment'\nimport { creategroup } from './create-group'\nimport { resolveMarket } from './resolve-market'\nimport { closeMarket } from './close-market'\nimport { unsubscribe } from './unsubscribe'\nimport { stripewebhook, createcheckoutsession } from './stripe-endpoints'\nimport { getMe } from './get-me'\nimport { saveTwitchCredentials } from './save-twitch-credentials'\nimport { addLiquidity } from './add-liquidity'\nimport { validateiap } from './validate-iap'\nimport { markallnotifications } from './mark-all-notifications'\nimport { updatememberrole } from './update-group-member-role'\nimport { updategroupprivacy } from './update-group-privacy'\nimport { registerdiscordid } from './register-discord-id'\nimport { getuserisgroupmember } from './get-user-is-group-member'\nimport { completequest } from './complete-quest'\nimport { getsupabasetoken } from './get-supabase-token'\nimport { deleteMarket } from './delete-market'\nimport { saveTopic } from './save-topic'\nimport { boostmarket } from './boost-market'\nimport { redeemboost } from './redeem-market-ad-reward'\nimport { followtopic } from './follow-topic'\nimport { editcomment } from 'api/edit-comment'\nimport { deleteComment } from './delete-comment'\n// ... (rest of the imports)\n\n// ... (existing code)\n\nconst handlers: { [k in APIPath]: APIHandler<k> } = {\n  // ... (existing handlers)\n  'delete-comment': deleteComment,\n  // ... (rest of the existing handlers)\n}\n\n// ... (rest of the existing code)\n</file>\n\nThese changes add a new endpoint for deleting comments. The endpoint is accessible via a POST request to `/delete-comment` and requires authentication. Only the comment creator, market creator, or a moderator/admin can delete a comment.\n\nTo use this new endpoint, you'll need to update the client-side code to make the API call when a user wants to delete a comment. You may also want to update the UI to show a delete option for comments when appropriate.\n\n\n\n<edits_made_by_assistant>\n<file path=\"backend/api/src/delete-comment.ts\">\nimport { isAdminId, isModId } from 'common/envs/constants'\nimport { getContract, revalidateContractStaticProps } from 'shared/utils'\nimport { getComment } from 'shared/supabase/contract-comments'\nimport { createSupabaseDirectClient } from 'shared/supabase/init'\nimport { APIError, type APIHandler } from './helpers/endpoint'\n\nexport const deleteComment: APIHandler<'delete-comment'> = async (\n  { commentId },\n  auth\n) => {\n  const pg = createSupabaseDirectClient()\n\n  const comment = await getComment(pg, commentId)\n  if (!comment) {\n    throw new APIError(404, 'Comment not found')\n  }\n\n  const contract = await getContract(pg, comment.contractId)\n  if (!contract) {\n    throw new APIError(404, 'Contract not found')\n  }\n\n  const isContractCreator = contract.creatorId === auth.uid\n  const isCommentCreator = comment.userId === auth.uid\n\n  if (!isAdminId(auth.uid) && !isContractCreator && !isCommentCreator && !isModId(auth.uid)) {\n    throw new APIError(403, 'Only the comment creator, market creator, or mod can delete comments')\n  }\n\n  // Delete the comment\n  await pg.none('DELETE FROM contract_comments WHERE comment_id = $1', [commentId])\n\n  await revalidateContractStaticProps(contract)\n\n  return { success: true }\n}\n\n</file>\n<file path=\"backend/api/src/app.ts\">\n@@ -36,6 +36,7 @@ import { boostmarket } from './boost-market'\n import { redeemboost } from './redeem-market-ad-reward'\n import { followtopic } from './follow-topic'\n import { editcomment } from 'api/edit-comment'\n+import { deleteComment } from './delete-comment'\n import {\n   supabasesearchgroups,\n   supabasesearchmygroups,\n@@ -307,6 +308,7 @@ const handlers: { [k in APIPath]: APIHandler<k> } = {\n   'hide-comment': hideComment,\n   'pin-comment': pinComment,\n   comments: getComments,\n+  'delete-comment': deleteComment,\n   market: createMarket,\n   'market/:contractId/group': addOrRemoveTopicFromContract,\n   'market/:contractId/groups': getContractTopics,\n\n</file>\n</edits_made_by_assistant>",
  },
  {
    role: 'user',
    content: 'Please add the schema\n\n',
  },
]

export const expectedFiles: FileChange[] = [
  {
    type: 'patch',
    filePath: 'backend/api/knowledge.md',
    content: '',
  },
]
