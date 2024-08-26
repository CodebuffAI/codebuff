export type CandidateDataType = {
  party: 'Democrat' | 'Republican' | 'Other'
  photo: string
  shortName: string
}

export const CANDIDATE_DATA: Record<string, CandidateDataType> = {
  'Joe Biden': {
    party: 'Democrat',
    photo: '/political-candidates/biden.png',
    shortName: 'Biden',
  },
  'Kamala Harris': {
    party: 'Democrat',
    photo: '/political-candidates/harris.png',
    shortName: 'Harris',
  },
  'Gretchen Whitmer': {
    party: 'Democrat',
    photo: '/political-candidates/whitmer.png',
    shortName: 'Whitmer',
  },
  'Gavin Newsom': {
    party: 'Democrat',
    photo: '/political-candidates/newsom.png',
    shortName: 'Newsom',
  },
  'Robert F. Kennedy': {
    party: 'Democrat',
    photo: '/political-candidates/kennedy.png',
    shortName: 'Kennedy',
  },
  'Robert F. Kennedy Jr.': {
    party: 'Democrat',
    photo: '/political-candidates/kennedy.png',
    shortName: 'Kennedy',
  },
  'Dean Phillips': {
    party: 'Democrat',
    photo: '/political-candidates/phillips.png',
    shortName: 'Phillips',
  },
  'Donald Trump': {
    party: 'Republican',
    photo: '/political-candidates/trump.png',
    shortName: 'Trump',
  },
  'Nikki Haley': {
    party: 'Republican',
    photo: '/political-candidates/haley.png',
    shortName: 'Haley',
  },
  'Ron DeSantis': {
    party: 'Republican',
    photo: '/political-candidates/desantis.png',
    shortName: 'DeSantis',
  },
  'Ron Desantis': {
    party: 'Republican',
    photo: '/political-candidates/desantis.png',
    shortName: 'DeSantis',
  },
  'Vivek Ramaswamy': {
    party: 'Republican',
    photo: '/political-candidates/ramaswamy.png',
    shortName: 'Ramaswamy',
  },
  'Hillary Clinton': {
    party: 'Democrat',
    photo: '/political-candidates/clinton.png',
    shortName: 'Clinton',
  },
  'Chris Christie': {
    party: 'Republican',
    photo: '/political-candidates/christie.png',
    shortName: 'Christie',
  },
  'Mike Pence': {
    party: 'Republican',
    photo: '/political-candidates/pence.png',
    shortName: 'Pence',
  },
  'Tucker Carlson': {
    party: 'Republican',
    photo: '/political-candidates/carlson.png',
    shortName: 'Carlson',
  },
  'Tim Scott': {
    party: 'Republican',
    photo: '/political-candidates/scott.png',
    shortName: 'Scott',
  },
  'Asa Hutchinson': {
    party: 'Republican',
    photo: '/political-candidates/hutchinson.png',
    shortName: 'Hutchinson',
  },
  'Ted Cruz': {
    party: 'Republican',
    photo: '/political-candidates/cruz.png',
    shortName: 'Cruz',
  },
  'Elise Stefanik': {
    party: 'Republican',
    photo: '/political-candidates/stefanik.png',
    shortName: 'Stefanik',
  },
  'Kristi Noem': {
    party: 'Republican',
    photo: '/political-candidates/noem.png',
    shortName: 'Noem',
  },
  'J.D. Vance': {
    party: 'Republican',
    photo: '/political-candidates/vance.png',
    shortName: 'Vance',
  },
  'Lee Zeldin': {
    party: 'Republican',
    photo: '/political-candidates/zeldin.png',
    shortName: 'Zeldin',
  },
  'Sarah Huckabee Sanders': {
    party: 'Republican',
    photo: '/political-candidates/sanders.png',
    shortName: 'Sanders',
  },
  'Doug Burgum': {
    party: 'Republican',
    photo: '/political-candidates/burgum.png',
    shortName: 'Burgum',
  },
  'Tulsi Gabbard': {
    party: 'Other',
    photo: '/political-candidates/gabbard.png',
    shortName: 'Gabbard',
  },
  'Ben Carson': {
    party: 'Republican',
    photo: '/political-candidates/carson.png',
    shortName: 'Carson',
  },
  'Kari Lake': {
    party: 'Republican',
    photo: '/political-candidates/lake.png',
    shortName: 'Lake',
  },
  'Pete Buttigieg': {
    party: 'Democrat',
    photo: '/political-candidates/buttigieg.png',
    shortName: 'Buttigieg',
  },
  'Raphael Warnock': {
    party: 'Democrat',
    photo: '/political-candidates/warnock.png',
    shortName: 'Warnock',
  },
  'Michelle Obama': {
    party: 'Democrat',
    photo: '/political-candidates/mobama.png',
    shortName: 'M. Obama',
  },
  'Beto O’Rourke': {
    party: 'Democrat',
    photo: '/political-candidates/orourke.png',
    shortName: 'O’Rourke',
  },
  'Barack Obama': {
    party: 'Democrat',
    photo: '/political-candidates/bobama.png',
    shortName: 'Obama',
  },
  'Andy Beshear': {
    party: 'Democrat',
    photo: '/political-candidates/beshear.png',
    shortName: 'Beshear',
  },
  'Hakeem Jeffries': {
    party: 'Democrat',
    photo: '/political-candidates/jeffries.png',
    shortName: 'Jeffries',
  },
  'J.B. Pritzker': {
    party: 'Democrat',
    photo: '/political-candidates/pritzker.png',
    shortName: 'Pritzker',
  },
  'Josh Shapiro': {
    party: 'Democrat',
    photo: '/political-candidates/shapiro.png',
    shortName: 'Shapiro',
  },
  'Jared Polis': {
    party: 'Democrat',
    photo: '/political-candidates/polis.png',
    shortName: 'Polis',
  },
  'Glenn Youngkin': {
    party: 'Republican',
    photo: '/political-candidates/youngkin.png',
    shortName: 'Youngkin',
  },
  'Greg Abbott': {
    party: 'Republican',
    photo: '/political-candidates/abbott.png',
    shortName: 'Abbott',
  },
  'Marco Rubio': {
    party: 'Republican',
    photo: '/political-candidates/rubio.png',
    shortName: 'Rubio',
  },
  'Mark Kelly': {
    party: 'Democrat',
    photo: '/political-candidates/kelly.png',
    shortName: 'Kelly',
  },
  'Roy Cooper': {
    party: 'Democrat',
    photo: '/political-candidates/cooper.png',
    shortName: 'Cooper',
  },
  'Tim Walz': {
    party: 'Democrat',
    photo: '/political-candidates/walz.png',
    shortName: 'Walz',
  },
  'JD Vance': {
    party: 'Republican',
    photo: '/political-candidates/vance.png',
    shortName: 'Vance',
  },
  'William McRaven': {
    party: 'Other',
    photo: '/political-candidates/mcraven.png',
    shortName: 'McRaven',
  },
}
