import { runScript } from 'run-script'
import { getLocalEnv } from 'shared/init-admin'
import { CreateMarketParams } from 'api/create-market'
import { Contract } from 'common/contract'
import { fetchLinkPreview } from 'common/link-preview'

if (require.main === module) {
  runScript(async ({ firestore }) => {
    const key = '343f20e4-9382-46ba-a72e-5caf94920c56'
    if (!key)
      throw new Error(
        'Please copy from the manifold account (dev or prod) into this variable before running.'
      )

    const contracts: Contract[] = []
    for (const { name, slug } of ycS23Batch) {
      const params = await getYCMarketParams(name, slug)
      const descriptionJson = params.description
      params.description = ''

      const contract = await createMarket(key, params)
      contracts.push(contract)

      await firestore
        .collection('contracts')
        .doc(contract.id)
        .update({ description: descriptionJson, visibility: 'public' })

      console.log(contract.question)
    }
  })
}

const farAwayCloseTime = new Date('2100-01-01T08:00:00.000Z').getTime()

const getYCMarketParams = async (
  name: string,
  slug: string
): Promise<CreateMarketParams> => {
  const ycUrl = `https://www.ycombinator.com/companies/${slug}`
  const linkPreview: any = await fetchLinkPreview(ycUrl)

  return {
    question: `${name} exit valuation (YC S23)?`,
    outcomeType: 'MULTIPLE_CHOICE' as const,
    closeTime: farAwayCloseTime,
    groupIds: ['46258e3a-ae43-47d6-9a51-fc150a487f7e'],
    answers: [
      'Less than $10M or bankrupt',
      '$10M - $100M',
      '$100M - $1B',
      '$1B+',
    ],
    visibility: 'unlisted' as const,
    description: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              text: `When ${name} goes bankrupt, gets acquired, or goes public with an IPO, what will its valuation be?`,
              type: 'text',
            },
          ],
        },
        { type: 'paragraph' },
        {
          type: 'paragraph',
          content: [
            {
              text: ycUrl,
              type: 'text',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: ycUrl,
                    class:
                      'break-anywhere hover:underline hover:decoration-primary-400 hover:decoration-2',
                    target: '_blank',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'linkPreview',
          attrs: {
            id: '6458f80a-252c-4bc9-baec-3522802b5035',
            inputKey: 'create marketundefined',
            deleteNode: null,
            deleteCallback: null,
            hideCloseButton: false,
            url: ycUrl,
            image: linkPreview.image,
            title: linkPreview.title,
            description: linkPreview.description,
          },
        },
      ],
    },
  }
}

const createMarket = async (apiKey: string, params: CreateMarketParams) => {
  const env = getLocalEnv()
  const domain =
    env === 'PROD' ? 'https://manifold.markets' : 'https://dev.manifold.markets'

  const contract: Contract = await fetch(`${domain}/api/v0/market`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(params),
  }).then((res) => res.json())

  return contract
}

const ycS23Batch = [
  { name: 'OpenPipe', slug: 'openpipe' },
  { name: 'Flex', slug: 'flex' },
  { name: 'Martin', slug: 'martin' },
  { name: 'Healthtech 1', slug: 'healthtech-1' },
  { name: 'Feanix Biotechnologies', slug: 'feanix-biotechnologies' },
  { name: 'Orbio Earth', slug: 'orbio-earth' },
  { name: 'CodeStory', slug: 'codestory' },
  { name: 'CatX', slug: 'catx' },
  { name: 'Coba', slug: 'coba' },
  { name: 'Taylor AI', slug: 'taylor-ai' },
  { name: 'Tempo Labs', slug: 'tempo-labs' },
  { name: 'TrendUp', slug: 'trendup' },
  { name: 'ztool', slug: 'ztool' },
  { name: 'Flair Health', slug: 'flair-health' },
  { name: 'Olio Labs', slug: 'olio-labs' },
  { name: 'truemetrics', slug: 'truemetrics' },
  { name: 'Onward', slug: 'onward' },
  { name: 'WalletKit', slug: 'walletkit' },
  { name: 'Wattson Health', slug: 'wattson-health' },
  { name: 'Constructable', slug: 'constructable' },
  { name: 'Lingtual', slug: 'lingtual' },
  { name: 'Nowadays', slug: 'nowadays' },
  { name: 'Structured', slug: 'structured' },
  { name: 'Twine', slug: 'twine' },
  { name: 'Axflow', slug: 'axflow' },
  { name: 'Simbie Health', slug: 'simbie-health' },
  { name: 'Foundation', slug: 'foundation-2' },
  { name: 'AiSDR', slug: 'aisdr' },
  { name: 'Giga ML', slug: 'giga-ml' },
  { name: 'Sero AI', slug: 'sero-ai' },
  { name: 'Affinity', slug: 'affinity' },
  { name: 'FlowiseAI', slug: 'flowiseai' },
  { name: 'Shadeform', slug: 'shadeform' },
  { name: 'ten.dev', slug: 'ten-dev' },
  { name: 'Advent', slug: 'advent' },
  { name: 'Cargo', slug: 'cargo' },
  { name: 'CheqUPI', slug: 'chequpi' },
  { name: 'Roame', slug: 'roame' },
  { name: 'dili', slug: 'dili' },
  { name: 'Slingshot', slug: 'slingshot-2' },
  { name: 'Trayd', slug: 'trayd' },
  { name: 'Line.Build', slug: 'line-build' },
  { name: 'Cair Health', slug: 'cair-health' },
  { name: 'ParadeDB', slug: 'paradedb' },
  { name: 'Eden Care', slug: 'eden-care' },
  { name: 'Quill AI', slug: 'quill-ai' },
  { name: 'Strada', slug: 'strada' },
  { name: 'Octo', slug: 'octo' },
  { name: 'Smobi', slug: 'smobi' },
  { name: 'Tiptap', slug: 'tiptap' },
  { name: 'RecipeUI', slug: 'recipeui' },
  { name: 'Fiber AI', slug: 'fiber-ai' },
  { name: 'Monitaur', slug: 'monitaur' },
  { name: 'Certainly Health', slug: 'certainly-health' },
  { name: 'Cedalio', slug: 'cedalio' },
  { name: 'Happyrobot', slug: 'happyrobot' },
  { name: 'Pure', slug: 'pure' },
  { name: 'Nanograb', slug: 'nanograb' },
  { name: 'Elythea', slug: 'elythea' },
  { name: 'Movley', slug: 'movley' },
  { name: 'Santé', slug: 'sante' },
  { name: 'Langdock', slug: 'langdock' },
  { name: 'Inventive AI', slug: 'inventive-ai' },
  { name: 'Cyclone', slug: 'cyclone' },
  { name: 'Fragment', slug: 'fragment' },
  { name: 'Raz', slug: 'raz' },
  { name: 'sudocode', slug: 'sudocode' },
  { name: 'Sweep', slug: 'sweep' },
  { name: 'Silimate', slug: 'silimate' },
  { name: 'Andromeda Surgical', slug: 'andromeda-surgical' },
  { name: 'ProdTrace', slug: 'prodtrace' },
  { name: 'Inari', slug: 'inari' },
  { name: 'Roundtable', slug: 'roundtable' },
  { name: 'Chatter', slug: 'chatter' },
  { name: 'Trench', slug: 'trench' },
  { name: 'Envelope', slug: 'envelope' },
  { name: 'VectorShift', slug: 'vectorshift' },
  { name: 'SafetyKit', slug: 'safetykit' },
  { name: 'Baserun', slug: 'baserun' },
  { name: 'Automorphic', slug: 'automorphic' },
  { name: 'Glaze', slug: 'glaze' },
  { name: 'Sola', slug: 'sola' },
  { name: 'Vango AI', slug: 'vango-ai' },
  { name: 'Inlet', slug: 'inlet-2' },
  { name: 'Converge', slug: 'converge' },
  { name: 'Flint', slug: 'flint-2' },
  { name: 'CambioML', slug: 'cambioml' },
  { name: 'Osium AI', slug: 'osium-ai' },
  { name: 'Slicker', slug: 'slicker' },
  { name: 'Khoj', slug: 'khoj' },
  { name: 'VaultPay', slug: 'vaultpay' },
  { name: 'Onnix', slug: 'onnix' },
  { name: 'gleam', slug: 'gleam' },
  { name: 'Kobalt Labs', slug: 'kobalt-labs' },
  { name: 'Studdy', slug: 'studdy' },
  { name: 'Trainy', slug: 'trainy' },
  { name: 'MantleBio', slug: 'mantlebio' },
  { name: 'Pincites', slug: 'pincites' },
  { name: 'Apoxy', slug: 'apoxy' },
  { name: 'sizeless', slug: 'sizeless' },
  { name: 'Quack AI', slug: 'quack-ai' },
  { name: 'Continue', slug: 'continue' },
  { name: 'Letter AI', slug: 'letter-ai' },
  { name: 'Guac', slug: 'guac' },
  { name: 'Casehopper', slug: 'casehopper' },
  { name: 'Glade', slug: 'glade' },
  { name: 'LifestyleRx', slug: 'lifestylerx' },
  { name: 'Empirical Health', slug: 'empirical-health' },
  { name: 'Fortuna Health', slug: 'fortuna-health' },
  { name: 'Aglide', slug: 'aglide' },
  { name: 'Respaid', slug: 'respaid' },
  { name: 'Vizly', slug: 'vizly' },
  { name: 'Haven', slug: 'haven-3' },
  { name: 'Greenlite', slug: 'greenlite' },
  { name: 'MediSearch', slug: 'medisearch' },
  { name: 'Isocode', slug: 'isocode' },
  { name: 'Upstream', slug: 'upstream' },
  { name: 'RightPage', slug: 'rightpage' },
  { name: 'Egress', slug: 'egress' },
  { name: 'Surface Labs', slug: 'surface-labs' },
  { name: 'Unhaze', slug: 'unhaze' },
  { name: 'CandorIQ', slug: 'candoriq' },
  { name: 'refine', slug: 'refine' },
  { name: 'Sidenote', slug: 'sidenote' },
  { name: 'Epsilla', slug: 'epsilla' },
  { name: 'Hidden Hand', slug: 'hidden-hand' },
  { name: 'Neum AI', slug: 'neum-ai' },
  { name: 'Cleancard', slug: 'cleancard' },
  { name: 'Decoda Health', slug: 'decoda-health' },
  { name: 'Wyvern AI', slug: 'wyvern-ai' },
  { name: 'Cardinal Gray', slug: 'cardinal-gray' },
  { name: 'Telophase', slug: 'telophase' },
  { name: 'Anneal', slug: 'anneal' },
  { name: 'Transformity', slug: 'transformity' },
  { name: 'AutoEmber', slug: 'autoember' },
  { name: 'Chow Central Inc', slug: 'chow-central-inc' },
  { name: 'FleetWorks', slug: 'fleetworks' },
  { name: 'Latentspace', slug: 'latentspace' },
  { name: 'Health Harbor', slug: 'health-harbor' },
  { name: 'Ergomake', slug: 'ergomake' },
  { name: 'Shasta Health', slug: 'shasta-health' },
  { name: 'Hegel AI', slug: 'hegel-ai' },
  { name: 'Outset', slug: 'outset' },
  { name: 'Serra', slug: 'serra' },
  { name: 'Corgea', slug: 'corgea' },
  { name: 'Terminal', slug: 'terminal' },
  { name: 'MICSI', slug: 'micsi' },
  { name: 'Martola', slug: 'martola' },
  { name: 'Arcimus', slug: 'arcimus' },
  { name: 'Docsum', slug: 'docsum' },
  { name: 'Obento Health', slug: 'obento-health' },
  { name: 'Kite', slug: 'kite' },
  { name: 'Bronco AI', slug: 'bronco-ai' },
  { name: 'Agentive', slug: 'agentive' },
  { name: 'order.link', slug: 'order-link' },
  { name: 'Parea', slug: 'parea' },
  { name: 'Campfire', slug: 'campfire-2' },
  { name: 'Alguna', slug: 'alguna' },
  { name: 'SID', slug: 'sid' },
  { name: 'Capi Money', slug: 'capi-money' },
  { name: 'Cerelyze', slug: 'cerelyze' },
  { name: 'Spine AI', slug: 'spine-ai' },
  { name: 'DSensei', slug: 'dsensei' },
  { name: 'Subsets', slug: 'subsets' },
  { name: 'Mira', slug: 'mira' },
  { name: 'Magik', slug: 'magik-2' },
  { name: 'Revamp', slug: 'revamp' },
  { name: 'DataShare', slug: 'datashare' },
  { name: 'Airgoods', slug: 'airgoods' },
  { name: 'Talc', slug: 'talc' },
  { name: 'Solve Intelligence', slug: 'solve-intelligence' },
  { name: 'askLio', slug: 'asklio' },
  { name: 'Craftwork', slug: 'craftwork' },
  { name: 'Helios Climate Industries', slug: 'helios-climate-industries' },
  { name: 'Fynt', slug: 'fynt' },
  { name: 'Every, Inc.', slug: 'every-inc' },
  { name: 'Contour', slug: 'contour' },
  { name: 'atla', slug: 'atla' },
  { name: 'Humanlike', slug: 'humanlike' },
  { name: 'Hyperlight', slug: 'hyperlight' },
  { name: 'Cedana', slug: 'cedana' },
  { name: 'Cascading AI', slug: 'cascading-ai' },
  { name: 'Zelos Cloud', slug: 'zelos-cloud' },
  { name: 'Pandan', slug: 'pandan' },
  { name: 'PropRise', slug: 'proprise' },
  { name: 'Pointhound', slug: 'pointhound' },
  { name: 'Intelliga Voice', slug: 'intelliga-voice' },
  { name: 'Sohar Health', slug: 'sohar-health' },
  { name: 'Remy Security', slug: 'remy-security' },
  { name: 'Sweetspot', slug: 'sweetspot' },
  { name: 'Magic Loops', slug: 'magic-loops' },
  { name: 'Ohmic Biosciences', slug: 'ohmic-biosciences' },
  { name: 'Stellar Sleep', slug: 'stellar-sleep' },
  { name: 'Infobot', slug: 'infobot' },
  { name: 'Linc.', slug: 'linc' },
  { name: 'Watto AI', slug: 'watto-ai' },
  { name: 'Dioxus Labs', slug: 'dioxus-labs' },
  { name: 'Hyperbound', slug: 'hyperbound' },
  { name: 'Deasie', slug: 'deasie' },
  { name: 'Accend', slug: 'accend' },
  { name: 'Elyos Energy', slug: 'elyos-energy' },
  { name: 'Mano AI', slug: 'mano-ai' },
  { name: 'Metoro', slug: 'metoro' },
  { name: 'Xeol', slug: 'xeol' },
  { name: 'Twenty', slug: 'twenty' },
  { name: 'Synaptiq', slug: 'synaptiq' },
  { name: 'Nectar', slug: 'nectar' },
  { name: 'Reworkd AI', slug: 'reworkd-ai' },
  { name: 'Leafpress', slug: 'leafpress' },
  { name: 'Kino AI', slug: 'kino-ai' },
  { name: 'kapa.ai', slug: 'kapa-ai' },
  { name: 'Tremor', slug: 'tremor' },
  { name: 'PeerDB', slug: 'peerdb' },
  { name: 'Artie', slug: 'artie' },
  { name: 'HyLight', slug: 'hylight' },
  { name: 'HockeyStack', slug: 'hockeystack' },
  { name: 'Can of Soup', slug: 'can-of-soup' },
  { name: 'Cercli', slug: 'cercli' },
]
