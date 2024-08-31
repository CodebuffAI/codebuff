import { runScript } from 'run-script'
import { ALL_TOPICS } from 'common/topics'
import { generateEmbeddings } from 'shared/helpers/openai-utils'

const TOPICS_TO_IGNORE_FOR_BLANK_TOPIC = [
  'stock',
  'planecrash',
  'permanent',
  'proofnik',
  'personal',
  'destiny.gg',
]

const TOPICS_TO_WORDS: { [key: string]: string } = {
  'Supreme Court': 'Supreme Court, SCOTUS, Justice, Judge, Law, Constitution',
  'LGBTQIA+': 'lesbian, bisexual, gay, transgender, queer culture',
  'Effective Altruism':
    'effective altruism, charity, donations, philanthropy, animal rights, existential risk',
  AI: 'artificial intelligence, AI, machine learning, deep learning, neural networks, LLMs, large language models, GPT-4',
  Science: 'science, physics, chemistry, biology, neuroscience',
  Religion: 'religion, God, Christianity, LDS, church',
  Education:
    'education, school, college, university, student, teacher, professor',
  'TV Shows': 'tv shows, television, Netflix series, HBO, Hulu, season finale',
  Music: 'music, release full length album, next album, concert',
  Movies:
    'movies, films, cinema, movie reviews, movie ratings, Hollywood, box office, IMDB, Rotten Tomatoes, Academy Awards',
  Books: 'books, novels, fiction, non-fiction, book reviews, book ratings',
  'Internet Culture':
    'internet culture, memes, viral videos, TikTokers, Twitch streamers, online drama',
  Celebrities:
    'celebrities, actors, actresses, musicians, singers, artists, athletes, sports stars, movie stars, TV stars, famous people',
  Crypto:
    'crypto, cryptocurrency, Bitcoin, Ethereum, blockchain, NFTs, DeFi, smart contracts, altcoins, stablecoins, Dogecoin, Shiba Inu',
  'Elon Musk':
    'Elon Musk, Tesla, SpaceX, Neuralink, Boring Company, Starlink, Hyperloop, Twitter, X.ai',
  Climate:
    'climate change, global warming, climate science, global temperatures, carbon emissions, renewable energy',
  Biotech:
    'biotech, biotechnology, CRISPR, drug trials, pharmaceuticals, vaccines, gene editing',
  Math: 'mathematics, Millennium Prize, math olympiad, proof, puzzle, paradox, numbers, equation',
  Nuclear: 'nuclear, nuclear power, fission, fusion',
  Space:
    'space, astronomy, astrophysics, space exploration, NASA, SpaceX, Mars, Moon, solar system, planets, stars, galaxies',
  Racing:
    'racing, Formula 1, NASCAR, IndyCar, MotoGP, World Rally Championship, WRC, Le Mans, Dakar Rally, Formula E',
  Soccer:
    'soccer, football, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, MLS, Champions League, World Cup, Euro Cup',
  Finance:
    'finance, investing, Wall Street, S&P, hedge funds, private equity, venture capital, IPOs, SPACs, mergers and acquisitions, M&A, bonds, options, futures, commodities, derivatives',
  Economics: 'economics, macroeconomics, game theory, GDP growth, inflation',
  Startups: 'startups, entrepreneurship, founders, angel investors, VCs',
  Gaming:
    'gaming, video games, esports, Twitch, Steam, Xbox, PlayStation, Nintendo',
  'Sex and love': 'sex, relationships, dating, love, marriage, divorce',
  'Personal development': 'personal development, self-improvement, self-help',
  Programming: 'programming, software development, coding, computer science',
  Baseball: 'baseball, MLB, World Series, home runs, strikeouts',
  NFL: 'NFL, football, Super Bowl, touchdowns, interceptions',
  Chess: 'chess, chess openings, World Chess Championship, Magnus Carlsen',
}
const all_topics = ALL_TOPICS.concat(TOPICS_TO_IGNORE_FOR_BLANK_TOPIC)

if (require.main === module) {
  runScript(async ({ pg }) => {
    for (const topic of all_topics) {
      const embeddingsSource = TOPICS_TO_WORDS[topic] ?? topic
      console.log('Topic', embeddingsSource)

      const embedding = await generateEmbeddings(embeddingsSource)
      if (!embedding || embedding.length < 1500) {
        console.log('No embeddings for', topic)
        continue
      }

      console.log('Generated embeddings')

      await pg
        .none(
          'insert into topic_embeddings (topic, embedding) values ($1, $2) on conflict (topic) do update set embedding = $2',
          [topic, embedding]
        )
        .catch((err) => console.error('Error:', err))
    }
  })
}
