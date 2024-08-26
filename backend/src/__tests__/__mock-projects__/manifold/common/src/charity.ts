export interface Charity {
  id: string
  slug: string
  name: string
  website: string
  ein?: string
  photo?: string
  preview: string
  description: string
  tags?: readonly CharityTag[]
}

type CharityTag = 'Featured' | 'New' // | 'Health' | 'Poverty' | 'X-Risk' | 'Animal Welfare' | 'Policy'

// Warning: 'name' is currently used as the slug and the txn toId for the charity.
export const charities: Charity[] = [
  {
    name: 'Balsa Research',
    website: 'https://www.balsaresearch.com/',
    preview:
      'Balsa Research identifies the most important policy changes America should make, and makes them happen.',
    photo: 'https://i.imgur.com/u4q3i60.png',
    description: `Balsa Research, a nonprofit think tank founded by Zvi Mowshowitz, focuses on identifying low-hanging fruit in American federal policy where crucial bridging work is lacking.

The organization seeks to pinpoint changes that would result in significant wins, determine the ways in which those changes might be realized, and undertake the necessary work to enable others to capitalize on such opportunities.

To achieve this, Balsa Research specializes in identifying not only potential changes but also the most pertinent questions to ask regarding current problems and the impact of proposed changes. The organization then commissions credible academic work to discover and quantify the answers to these questions, emphasizing the impact on relevant constituencies and stakeholders whenever possible. Balsa Research aims to eventually expand its approach to encompass a full stack of policy advocacy activities.`,
  },
  {
    name: '1Day Sooner',
    website: 'https://www.1daysooner.org/',
    preview:
      'Accelerating the development of each vaccine by even a couple of days via COVID-19 human challenge trials could save thousands of lives.',
    photo: 'https://i.imgur.com/bUDdzUE.png',
    description: `1Day Sooner is a nonprofit that advocates for people who participate and want to participate in high-impact medical studies, particularly human challenge trials, where healthy volunteers are infected with a disease to test a vaccine, treatment, or to learn other important information. 1Day Sooner began as grassroots movement of people who were willing to join human challenge studies for COVID-19 in the early stages of the pandemic.

    In line with the altruism of healthy volunteers in infectious disease research, we more broadly work towards a world that prioritizes efficient development of life-saving medical research, distributed equitably so as to minimize the global suffering caused by infectious disease. This includes campaigns covering hepatitis C human challenge studies, malaria vaccine distribution, US FDA regulatory optimization, and the use of human challenge studies to augment pandemic preparedness efforts, and other projects.`,
  },
  {
    name: 'QURI',
    website: 'https://quantifieduncertainty.org/',
    preview:
      'The Quantified Uncertainty Research Institute advances forecasting and epistemics to improve the long-term future of humanity.',
    photo: 'https://i.imgur.com/ZsSXPjH.png',
    description: `QURI researches systematic practices to specify and estimate the most important parameters for the most important or scalable decisions. Research areas include forecasting, epistemics, evaluations, ontology, and estimation.
    
    We emphasize technological solutions that can heavily scale in the next 5 to 30 years.
    
    We believe that humanity’s success in the next few hundred years will lie intensely on its ability to coordinate and make good decisions. If important governmental and philanthropic bodies become significantly more effective, this will make society far more resilient to many kinds of challenges ahead.`,
  },
  {
    name: 'Topos Institute',
    website: 'https://topos.institute/',
    preview:
      'We shape technology for public benefit by advancing sciences of connection and integration. Our goal is a world where the systems that surround us benefit us all.',
    photo: 'https://i.imgur.com/lzZxvHt.jpg',
    description: `Our lives have been transformed by global networks of trade, travel, and communication. Driven by new technologies, these networks enrich our lives, but also lead to new threats, including surveillance, polarization, and pandemics. 

At Topos, we pioneer emerging mathematical sciences of connection and integration to steer humanity towards a better future.`,
  },
  {
    name: 'Haskell Foundation',
    website: 'https://haskell.foundation/',
    preview: 'Amplify Haskell’s impact on humanity.',
    photo: 'https://i.imgur.com/6akJg2p.png',
    description: `An independent, non-profit organization dedicated to broadening the adoption of Haskell, by supporting its ecosystem of tools, libraries, education, and research.`,
  },
  {
    name: 'Long-Term Future Fund',
    website: 'https://funds.effectivealtruism.org/funds/far-future',
    photo: 'https://i.imgur.com/C2qka9g.png',
    preview:
      'The Long-Term Future Fund aims to improve the long-term trajectory of civilization by making grants that address global catastrophic risks.',
    description: `The Long-Term Future Fund aims to positively influence the long-term trajectory of civilization by making grants that address global catastrophic risks, especially potential risks from advanced artificial intelligence and pandemics. In addition, we seek to promote, implement, and advocate for longtermist ideas, and to otherwise increase the likelihood that future generations will flourish.
    
    The Fund has a broad remit to make grants that promote, implement and advocate for longtermist ideas. Many of our grants aim to address potential risks from advanced artificial intelligence and to build infrastructure and advocate for longtermist projects. However, we welcome applications related to long-term institutional reform or other global catastrophic risks (e.g., pandemics or nuclear conflict).
    
    We intend to support:
    - Projects that directly contribute to reducing existential risks through technical research, policy analysis, advocacy, and/or demonstration projects
    - Training for researchers or practitioners who work to mitigate existential risks, or help with relevant recruitment efforts, or infrastructure for people working on longtermist projects
    - Promoting long-term thinking`,
  },
  // Temporarily disabled as New Science isn't accepting donations
  // {
  //   name: 'New Science',
  //   website: 'https://newscience.org/',
  //   photo: 'https://i.imgur.com/C7PoR4q.png',
  //   preview:
  //     'Facilitating scientific breakthroughs by empowering the next generation of scientists and building the 21st century institutions of basic science.',
  //   description: `As its first major project, in the summer of 2022, New Science will run an in-person research fellowship in Boston for young life scientists, during which they will independently explore an ambitious high-risk scientific idea they couldn’t work on otherwise and start building the foundations for a bigger research project, while having much more freedom than they could expect in their normal research environment but also much more support from us. This is inspired by Cold Spring Harbor Laboratory, which started as a place where leading molecular biologists came for the summer to hang out and work on random projects together, and which eventually housed 8 Nobel Prize winners.

  //   As its second major project, in the fall of 2022, New Science will run an in-person 12-month-long fellowship for young scientists starting to directly attack the biggest structural issues of the established institutions of science. We will double down on things that worked well during the summer fellowship, while extending the fellowship to one year, thus allowing researchers to make much more progress and will strive to provide them as much scientific leverage as possible.

  //   In several years, New Science will start funding entire labs outside of academia and then will be creating an entire network of scientific organizations, while supporting the broader scientific ecosystem that will constitute the 21st century institutions of basic science.`,
  // },
  {
    name: 'Global Health and Development Fund',
    website: 'https://funds.effectivealtruism.org/funds/global-development',
    photo: 'https://i.imgur.com/C2qka9g.png',
    preview:
      "The Global Health and Development Fund aims to improve people's lives, typically in the poorest regions of the world where the need for healthcare and economic empowerment is greatest.",
    description: `The Global Health and Development Fund recommends grants with the aim of improving people's lives, typically in the poorest regions of the world where the need for healthcare and economic empowerment is greatest. This will be achieved primarily by supporting projects that:
    
    - Directly provide healthcare, or preventive measures that will improve health, well-being, or life expectancy
    - Directly provide services that raise incomes or otherwise improve economic conditions
    - Provide assistance to governments in the design and implementation of effective policies
    
    In addition, the Global Health and Development Fund has a broad remit, and may fund other activities whose ultimate purpose is to serve people living in the poorest regions of the world, for example by raising additional funds (e.g. One for the World) or by exploring novel financing arrangements (e.g. Instiglio).
    
    The Fund manager recommends grants to GiveWell top charities as a baseline, but will recommend higher-risk grants they believe to be more effective (in expectation) than GiveWell top charities. As such, the fund makes grants with a variety of different risk profiles.`,
  },
  {
    name: 'Qualia Research Institute',
    website: 'https://qri.org/',
    photo: 'https://i.imgur.com/vBeACn7.png',
    preview: 'Building a New Science of Consciousness',
    description:
      'Founded in 2018, the Qualia Research Institute (QRI) is a 501(c)(3) non-profit developing a mathematical formalization for subjective experience and its emotional valence. Our rigorous research and theoretical insights, driven by the Importance-Tractability-Neglectedness (ITN) framework, are directed towards mapping the state-space of consciousness. We maintain a collaborative network of academics, independent researchers, and thought leaders, all dedicated to suffering-focused ethics and creating technologies optimizing the well-being of sentient beings.',
  },
  {
    name: 'Karin Foundation',
    website: 'https://buraoacademy.org/give',
    photo: 'https://i.imgur.com/Rlhqm6M.png',
    preview:
      'Dedicating to providing a rigorous STEM curriculum to Somali youth.',
    description:
      "It's our mission to provide Somali youth with a rigorous STEM curriculum, supported by environmental studies and stewardship, career training and community service.",
    ein: '26-4466118',
  },
  {
    name: 'Animal Welfare Fund',
    website: 'https://funds.effectivealtruism.org/funds/animal-welfare',
    photo: 'https://i.imgur.com/C2qka9g.png',
    preview:
      'The Animal Welfare Fund aims to effectively improve the well-being of nonhuman animals.',
    description: `The Animal Welfare Fund aims to effectively improve the well-being of nonhuman animals, by making grants that focus on one or more of the following:

    - Relatively neglected geographic regions or groups of animals
    - Promising research into animal advocacy or animal well-being
    - Activities that could make it easier to help animals in the future
    - Otherwise best-in-class opportunities
    
    The Fund focuses on projects that primarily address farmed animals, as well as projects that could affect other large populations of nonhuman animals. Some examples of projects that the Fund could support:
    
    - Supporting farmed animal advocacy in Asia
    - Researching ways to improve the welfare of farmed fish
    - Promoting alternative proteins in order to reduce demand for animal products
    - Advocating against the use of some cruel practice within the industrial agriculture system
    - Growing the field of welfare biology in order to improve our understanding of different ways to address wild animal suffering`,
  },
  {
    name: 'Effective Altruism Infrastructure Fund',
    website: 'https://funds.effectivealtruism.org/funds/ea-community',
    photo: 'https://i.imgur.com/C2qka9g.png',
    preview:
      'The Effective Altruism Infrastructure Fund aims to increase the impact of projects that use the principles of effective altruism.',
    description: `The Effective Altruism Infrastructure Fund (EA Infrastructure Fund) recommends grants that aim to improve the work of projects using principles of effective altruism, by increasing their access to talent, capital, and knowledge.
    
    The EA Infrastructure Fund has historically attempted to make strategic grants to incubate and grow projects that attempt to use reason and evidence to do as much good as possible. These include meta-charities that fundraise for highly effective charities doing direct work on important problems, research organizations that improve our understanding of how to do good more effectively, and projects that promote principles of effective altruism in contexts like academia.`,
  },
  {
    name: 'Nonlinear',
    website: 'https://www.nonlinear.org/',
    photo: 'https://i.imgur.com/Muifc1l.png',
    preview:
      'Incubate longtermist nonprofits by connecting founders with ideas, funding, and mentorship.',
    description: `Problem: There are tens of thousands of people working full time to make AI powerful, but around one hundred working to make AI safe. This needs to change.

    Longtermism is held back by two bottlenecks:
    1. Lots of funding, but few charities to deploy it.
    2. Lots of talent, but few charities creating jobs.
    
    Solution: Longtermism needs more charities to deploy funding and create jobs. Our goal is to 10x the number of talented people working on longtermism by launching dozens of high impact charities.
    
    This helps solve the bottlenecks because entrepreneurs “unlock” latent EA talent - if one person starts an organization that employs 100 people who weren’t previously working on AI safety, that doubles the number of people working on the problem.
    
    Our process:
    1. Research the highest leverage ideas
    2. Find the right founders
    3. Connect them with mentors and funding
    
    We will be announcing more details about our incubation program soon. 
    
    A few of the ideas we’ve incubated so far:
    - The Nonlinear Library: Listen to top EA content on your podcast player. We use text-to-speech software to create an automatically updating repository of audio content from the EA Forum, Alignment Forum, and LessWrong. You can find it on all major podcast players here. 
    - EA Hiring Agency: Helping EA orgs scalably hire talent.
    - EA Houses: EA's Airbnb - Connecting EAs who have extra space with EAs who need space here.`,
  },
  {
    name: 'GiveWell Maximum Impact Fund',
    website: 'https://www.givewell.org/maximum-impact-fund',
    photo: 'https://i.imgur.com/xikuDMZ.png',
    preview:
      'We search for the charities that save or improve lives the most per dollar.',
    description: `
    GiveWell is a nonprofit dedicated to finding outstanding giving opportunities and publishing the full details of our analysis to help donors decide where to give.
    
    We don't focus solely on financials, such as assessing administrative or fundraising costs. Instead, we conduct in-depth research to determine how much good a given program accomplishes (in terms of lives saved, lives improved, etc.) per dollar spent. Rather than rating as many charities as possible, we focus on the few charities that stand out most (by our criteria) in order to find and confidently recommend high-impact giving opportunities (our list of top charities).
    
    Our top recommendation to GiveWell donors seeking to do the most good possible is to donate to the Maximum Impact Fund. Donations to the Maximum Impact Fund are granted each quarter. We use our latest research to grant the funds to the recommended charity (or charities) where we believe they’ll do the most good.
    
    We grant funds from the Maximum Impact Fund to the recipient charity (or charities) at the end of each fiscal quarter. Our research team decides which charities have the highest priority funding needs at that time. This decision takes into consideration factors such as:

    - Which funding gaps we expect to be filled and unfilled
    - Each charity’s plans for additional funding
    - The cost-effectiveness of each funding gap`,
  },
  {
    name: "Founder's Pledge Climate Change Fund",
    website: 'https://founderspledge.com/funds/climate-change-fund',
    photo: 'https://i.imgur.com/9turaJW.png',
    preview:
      'The Climate Change Fund aims to sustainably reach net-zero emissions globally, while still allowing growth to free millions from energy poverty.',
    description: `The Climate Change Fund aims to sustainably reach net-zero emissions globally.
    
    Current levels of emissions are contributing to millions of deaths annually from air pollution and causing irrevocable damage to our planet. In addition, millions worldwide do not have access to modern energy technology, severely hampering development goals.
    
    This Fund is committed to finding and funding sustainable solutions to the emissions crisis that still allow growth, freeing millions from the prison of energy poverty.
    
    The Fund is a philanthropic co-funding vehicle that does not provide investment returns.`,
  },
  {
    name: "Founder's Pledge Patient Philanthropy Fund",
    website: 'https://founderspledge.com/funds/patient-philanthropy-fund',
    photo: 'https://i.imgur.com/LLR6CI6.png',
    preview:
      'The Patient Philanthropy Project aims to safeguard and benefit the long-term future of humanity',
    description: `The Patient Philanthropy Project focuses on how we can collectively grow our resources to support the long-term flourishing of humanity. It addresses a crucial gap: as a society, we spend much too little on safeguarding and benefiting future generations. In fact, we spend more money on ice cream each year than we do on preventing our own extinction. However, people in the future - who do not have a voice in their future survival or environment - matter. Lots of them may yet come into existence and we have the ability to positively affect their lives now, if only by making sure we avoid major catastrophes that could destroy our common future.
    
    Housed within the Project is the Patient Philanthropy Fund, a philanthropic co-funding vehicle which invests to give and ensures capital is at the ready when extraordinary opportunities to safeguard and improve the long-term future arise.
    
    The Fund’s patient approach means that we aim to identify the point in time when the highest-impact opportunities are available, which may be years, decades, or even centuries ahead.`,
  },
  {
    name: 'ARC',
    website: 'https://alignment.org/',
    photo: 'https://i.imgur.com/Hwg8OMP.png',
    preview: 'Align future machine learning systems with human interests.',
    description: `ARC is a non-profit research organization whose mission is to align future machine learning systems with human interests. Its current work focuses on developing an alignment strategy that could be adopted in industry today while scaling gracefully to future ML systems. Right now Paul Christiano and Mark Xu are researchers and Kyle Scott handles operations.

What is “alignment”? ML systems can exhibit goal-directed behavior, but it is difficult to understand or control what they are “trying” to do. Powerful models could cause harm if they were trying to manipulate and deceive humans. The goal of intent alignment is to instead train these models to be helpful and honest.

Motivation: We believe that modern ML techniques would lead to severe misalignment if scaled up to large enough computers and datasets. Practitioners may be able to adapt before these failures have catastrophic consequences, but we could reduce the risk by adopting scalable methods further in advance.

What we’re working on: The best way to understand our research priorities and methodology is probably to read our report on Eliciting Latent Knowledge. At a high level, we’re trying to figure out how to train ML systems to answer questions by straightforwardly “translating” their beliefs into natural language rather than by reasoning about what a human wants to hear.

Methodology: We’re unsatisfied with an algorithm if we can see any plausible story about how it eventually breaks down, which means that we can rule out most algorithms on paper without ever implementing them. The cost of this approach is that it may completely miss strategies that exploit important structure in realistic ML models; the benefit is that you can consider lots of ideas quickly. (More)

Future plans: We expect to focus on similar theoretical problems in alignment until we either become more pessimistic about tractability or ARC grows enough to branch out into other areas. Over the long term we are likely to work on a combination of theoretical and empirical alignment research, collaborations with industry labs, alignment forecasting, and ML deployment policy.`,
  },
  {
    name: 'Give Directly',
    website: 'https://www.givedirectly.org/',
    ein: '27-1661997',
    photo: 'https://i.imgur.com/lrdxSyd.jpg',
    preview: 'Send money directly to people living in poverty.',
    description:
      'GiveDirectly is a nonprofit that lets donors like you send money directly to the world’s poorest households. We believe people living in poverty deserve the dignity to choose for themselves how best to improve their lives — cash enables that choice. Since 2009, we’ve delivered $500M+ in cash directly into the hands of over 1 million families living in poverty. We currently have operations in Kenya, Rwanda, Liberia, Malawi, Morocco, Mozambique, DRC, Uganda, and the United States.',
  },
  {
    name: 'Hellen Keller International',
    website: 'https://www.hki.org/',
    ein: '13-5562162',
    photo: 'https://i.imgur.com/Dl97Abk.jpg',
    preview:
      'We envision a world where no one is deprived of the opportunity to live a healthy life – and reach their true potential.',
    description:
      'Right now, 36 million people worldwide — most of them in developing countries — are blind.\n 90 percent of them didn’t have to lose their sight. Helen Keller International is dedicated to combating the causes and consequences of vision loss and making clear vision a reality for those most vulnerable to disease and who lack access to quality eye care.\n Last year alone, we helped provide many tens of millions of people with treatment to prevent diseases of poverty including blinding trachoma and river blindness.\n  Surgeons trained by our staff also performed tens of thousands of cataract surgeries in the developing world.  And in the United States, we screened the vision of nearly 66,000 students living in some of our country’s poorest neighborhoods and provided free eyeglasses to just over 16,000 of them. ',
  },
  {
    name: 'Against Malaria Foundation',
    website: 'https://www.againstmalaria.com/',
    ein: '20-3069841',
    photo: 'https://i.imgur.com/F3JoZi9.png',
    preview: 'We help protect people from malaria.',
    description:
      'AMF (againstmalaria.com) provides funding for long-lasting insecticide-treated net (LLIN) distributions (for protection against malaria) in developing countries. There is strong evidence that distributing LLINs reduces child mortality and malaria cases. AMF conducts post-distribution surveys of completed distributions to determine whether LLINs have reached their intended destinations and how long they remain in good condition.',
  },
  {
    name: 'Rethink Charity',
    website: 'https://rethink.charity/',
    photo: 'https://i.imgur.com/Go7N7As.png',
    preview:
      'Providing vital support to high-impact charities and charitable projects.',
    description: `At Rethink Charity, we’re excited about improving the world by providing vital support to high-impact charities and charitable projects. We equip them with tools to boost their impact, through our projects that empower their donors with tax-efficient giving options and strategically coordinated matching opportunities.
    What we do:

    - Rethink Charity Forward is a cause-neutral donation routing fund for high-impact charities around the world. Canadians have used RC Forward to donate $10 million to high-impact charities since the project was launched in late 2017. 

    - EA Giving Tuesday supports both donors and highly effective nonprofits participating in Facebook’s annual Giving Tuesday match. In addition to setting up systems and processes, the team provides analysis-based recommendations, detailed instructions, and responsive support. The team’s goal is to make it as easy as possible for donors to direct matching dollars to highly effective nonprofits.`,
  },
  {
    name: 'Malaria Consortium',
    website: 'https://www.malariaconsortium.org/',
    ein: '98-0627052',
    photo: 'https://i.imgur.com/LGwy9d8.png ',
    preview:
      'We specialise in the prevention, control and treatment of malaria and other communicable diseases.',
    description:
      'We are dedicated to ensuring our work is supported by strong evidence and remains grounded in the lessons we learn through implementation. We explore beyond current practice, to try out innovative ways – through research, implementation and policy development – to achieve effective and sustainable disease management and control.',
  },
  {
    name: 'The Center for the Study of Partisanship and Ideology',
    website: 'https://cspicenter.org/',
    photo: 'https://i.imgur.com/O88tkOW.png',
    preview:
      'Support and fund research on how ideology and government policy contribute to scientific, technological, and social progress.',
    description: `Over the last few decades, scientific and technological progress have stagnated. Scientists conduct more research than ever before, but groundbreaking innovation is scarce. At the same time, identity politics and political polarization have reached new extremes, and social trends such as family stability and crime are worse than in previous decades and in some cases moving in the wrong direction. What explains these trends, and how can we reverse them?

    Much of the blame lies with the institutions we rely on for administration, innovation, and leadership. Instead of forward-looking governments, we have short-sighted politicians and bloated bureaucracies. Instead of real experts with proven track records, we have so-called ‘experts’ who appeal to the authority of their credentials. Instead of political leaders willing to face facts and make tough tradeoffs, we have politicians who appeal to ignorance and defer responsibility.
    
    To fix our institutions, we need to rethink them from the ground up. That is why CSPI supports and funds research into the administrative systems, organizational structures, and political ideologies of modern governance. Only by understanding what makes these systems so often dysfunctional can we change them for the better.
    
    CSPI believes that governments should be accountable to the populace as a whole, not special interest groups. We think experts should have greater say in public policy, but that there should be different standards for what qualifies as “expertise.” We want to end scientific and technological stagnation and usher in a new era of growth and innovation.
    
    We are interested in funding and supporting research that can speak to these issues in the social sciences through grants and fellowships. CSPI particularly seek outs work that is unlikely to receive support elsewhere. See our home page for more about the kinds of research we are particularly interested in funding.`,
  },
  {
    name: 'Faunalytics',
    website: 'https://faunalytics.org/',
    ein: '01-0686889',
    photo: 'https://i.imgur.com/3JXhuXl.jpg',
    preview:
      'Faunalytics conducts research and shares knowledge to help advocates help animals effectively.',
    description:
      "Faunalytics' mission is to empower animal advocates with access to research, analysis, strategies, and messages that maximize their effectiveness to reduce animal suffering.\n Animals need you, and you need data. We conduct essential research, maintain an online research library, and directly support advocates and organizations in their work to save lives. The range of data we offer helps our movement understand how people think about and respond to advocacy, providing advocates with the best strategies to inspire change for animals. ",
  },
  {
    name: 'The Humane League',
    website: 'https://thehumaneleague.org/',
    ein: '04-3817491',
    photo: 'https://i.imgur.com/za9Rwon.jpg',
    preview:
      'We exist to end the abuse of animals raised for food by influencing the policies of the world’s biggest companies, demanding legislation, and empowering others to take action and leave animals off their plates',
    description:
      'The Humane League (THL) currently operates in the U.S., Mexico, the U.K., and Japan, where they work to improve animal welfare standards through grassroots campaigns, movement building, veg*n advocacy, research, and advocacy training, as well as through corporate, media, and community outreach. They work to build the animal advocacy movement internationally through the Open Wing Alliance (OWA), a coalition founded by THL whose mission is to end the use of battery cages globally.',
  },
  {
    name: 'Wild Animal Initiative',
    website: 'https://www.wildanimalinitiative.org/',
    ein: '82-2281466',
    photo: 'https://i.imgur.com/bOVUnDm.png',
    preview:
      'Our mission is to understand and improve the lives of wild animals.',
    description: `Although the natural world is a source of great beauty and happiness, vast numbers of animals routinely face serious challenges such as disease, hunger, or natural disasters. There is no “one-size-fits-all” solution to these threats. However, even as we recognize that improving the welfare of free-ranging wild animals is difficult, we believe that humans have a responsibility to help whenever we can.

Our staff explores how humans can beneficially coexist with animals through the lens of wild animal welfare. 

We respect wild animals as individuals with their own needs and preferences, rather than seeing them as mere parts of ecosystems. But this approach demands a richer understanding of wild animals’ lives. 

We want to take a proactive approach to managing the welfare benefits, threats, and uncertainties that are inherent to complex natural and urban environments. Yet, to take action safely, we must conduct research to understand the impacts of our actions. The transdisciplinary perspective of wild animal welfare draws upon ethics, ecology, and animal welfare science to gather the knowledge we need, facilitating evidence-based improvements to wild animals’ quality of life.

Without sufficient public interest or research activity, solutions to the problems wild animals face will go undiscovered. 

Wild Animal Initiative currently focuses on helping scientists, grantors, and decision-makers investigate important and understudied questions about wild animal welfare. Our work catalyzes research and applied projects that will open the door to a clearer picture of wild animals’ needs and how to enhance their well-being. Ultimately, we envision a world in which people actively choose to help wild animals — and have the knowledge they need to do so responsibly.`,
  },
  {
    name: 'FYXX Foundation',
    website: 'https://www.fyxxfoundation.org/',
    photo: 'https://i.imgur.com/ROmWO7m.png',
    preview:
      'FYXX Foundation: wildlife population management, without killing.',
    description: `The future of our planet depends on the innovations of today, and the health of our wildlife are the first indication of our successful stewardship, which we believe can be improved by safe population management utilizing fertility control instead of poison and culling.`,
  },
  {
    name: 'New Incentives',
    website: 'https://www.newincentives.org/',
    ein: '45-2368993',
    photo: 'https://i.imgur.com/bYl4tk3.png',
    preview: 'Cash incentives to boost vaccination rates and save lives.',
    description:
      'New Incentives (newincentives.org) runs a conditional cash transfer (CCT) program in North West Nigeria which seeks to increase uptake of routine immunizations through cash transfers, raising public awareness of the benefits of vaccination and reducing the frequency of vaccine stockouts.',
  },
  {
    name: 'SCI foundation',
    website: 'https://schistosomiasiscontrolinitiative.org/',
    ein: '',
    photo: 'https://i.imgur.com/sWD8zM5.png',
    preview:
      'SCI works with governments in sub-Saharan Africa to create or scale up programs that treat schistosomiasis and soil-transmitted helminthiasis ("deworming").',
    description:
      'We’re a non-profit initiative supporting governments in sub-Saharan African countries. We support them to develop sustainable, cost-effective programmes against parasitic worm infections such as schistosomiasis and intestinal worms.  Since our foundation in 2002, we’ve contributed to the delivery of over 200 million treatments against these diseases. The programmes are highly effective; parasitic worm infections can be reduced by up to 60% after just one round of treatment.',
  },
  {
    name: 'Wikimedia Foundation',
    website: 'https://wikimediafoundation.org/',
    ein: '20-0049703',
    photo: 'https://i.imgur.com/klEzUbR.png',
    preview: 'We help everyone share in the sum of all knowledge.',
    description:
      'We are the people who keep knowledge free. There is an amazing community of people around the world that makes great projects like Wikipedia. We help them do that work. We take care of the technical infrastructure, the legal challenges, and the growing pains.',
  },
  {
    name: 'Rainforest Trust',
    website: 'https://www.rainforesttrust.org/',
    ein: '13-3500609',
    photo: 'https://i.imgur.com/6MzS530.png',
    preview:
      'Rainforest Trust saves endangered wildlife and protects our planet by creating rainforest reserves through partnerships, community engagement and donor support.',
    description:
      'Our unique, cost-effective conservation model for protecting endangered species has been implemented successfully for over 30 years. Thanks to the generosity of our donors, the expertise of our partners and the participation of local communities across the tropics, our reserves are exemplary models of international conservation.',
  },
  {
    name: 'Helping Shepherds of Every Color Rescue',
    website: 'https://www.helpingshepherdsofeverycolor.com/',
    ein: '46-1747360',
    photo: 'https://i.imgur.com/TXQZe9E.png',
    preview:
      'Helping Shepherds of Every Color Rescue is an all volunteer German Shepherd rescue group based in Montgomery, AL.',
    description:
      'Helping Shepherds of Every Color Rescue is an all volunteer German Shepherd rescue group based in Montgomery, AL. We provide needed medical care, training and rehabilitation to needy GSDs until they are ready for adoption. All dogs are spayed/neutered, up-to-date on shots and heartworm free by the time they are re-homed.',
  },
  {
    name: 'The Nature Conservancy',
    website: 'https://www.nature.org/en-us/',
    ein: '53-0242652',
    photo: 'https://i.imgur.com/vjxkoGo.jpg',
    preview: 'A Future Where People and Nature Thrive',
    description:
      'The Nature Conservancy is a global environmental nonprofit working to create a world where people and nature can thrive. Founded in the U.S. through grassroots action in 1951, The Nature Conservancy has grown to become one of the most effective and wide-reaching environmental organizations in the world. Thanks to more than a million members and the dedicated efforts of our diverse staff and over 400 scientists, we impact conservation in 76 countries and territories: 37 by direct conservation impact and 39 through partners.',
  },
  {
    name: 'Doctors Without Borders',
    website: 'https://www.doctorswithoutborders.org/',
    ein: '13-3433452',
    photo: 'https://i.imgur.com/xqhH9FE.png',
    preview:
      'We provide independent, impartial medical humanitarian assistance to the people who need it most.',
    description:
      'Doctors Without Borders/Médecins Sans Frontières (MSF) cares for people affected by conflict, disease outbreaks, natural and human-made disasters, and exclusion from health care in more than 70 countries.',
  },
  {
    name: 'World Wildlife Fund',
    website: 'https://www.worldwildlife.org/',
    ein: '52-1693387',
    photo: 'https://i.imgur.com/hDADuqW.png',
    preview:
      'WWF works to sustain the natural world for the benefit of people and wildlife, collaborating with partners from local to global levels in nearly 100 countries.',
    description:
      'As the world’s leading conservation organization, WWF works in nearly 100 countries to tackle the most pressing issues at the intersection of nature, people, and climate. We collaborate with local communities to conserve the natural resources we all depend on and build a future in which people and nature thrive. Together with partners at all levels, we transform markets and policies toward sustainability, tackle the threats driving the climate crisis, and protect and restore wildlife and their habitats.',
  },
  {
    name: 'UNICEF USA',
    website: 'https://www.unicefusa.org/',
    photo: 'https://i.imgur.com/9cxuvZi.png',
    ein: '13-1760110',
    preview:
      "UNICEF USA helps save and protect the world's most vulnerable children.",
    description:
      'Over eight decades, the United Nations Children’s Fund (UNICEF) has built an unprecedented global support system for the world’s children. UNICEF relentlessly works day in and day out to deliver the essentials that give every child an equitable chance in life: health care and immunizations, safe water and sanitation, nutrition, education, emergency relief and more. UNICEF USA advances the global mission of UNICEF by rallying the American public to support the world’s most vulnerable children. Together, we have helped save more children’s lives than any other humanitarian organization.',
  },
  {
    name: 'Vitamin Angels',
    website: 'https://www.vitaminangels.org/',
    ein: '77-0485881',
    photo: 'https://i.imgur.com/Mf35IOu.jpg',
    preview:
      'By improving access to vital nutrition, everyone gets an equal chance to grow, thrive, and prosper.',
    description:
      'Our team of program experts collaborates with thousands of local organizations and national governments around the world, focusing efforts on reaching communities who are underserved. Vitamin Angels’ program partners are a local presence in these communities. As trusted organizations already hard at work, they connect millions of pregnant women and young children with our evidence-based nutrition interventions in addition to the health services they already provide.',
  },
  {
    name: 'Free Software Foundation',
    website: 'https://www.fsf.org/',
    ein: '04-2888848',
    photo: 'https://i.imgur.com/z87sFDE.png',
    preview:
      'The Free Software Foundation (FSF) is a nonprofit with a worldwide mission to promote computer user freedom.',
    description:
      'As our society grows more dependent on computers, the software we run is of critical importance to securing the future of a free society. Free software is about having control over the technology we use in our homes, schools and businesses, where computers work for our individual and communal benefit, not for proprietary software companies or governments who might seek to restrict and monitor us. The Free Software Foundation exclusively uses free software to perform its work.The Free Software Foundation is working to secure freedom for computerusers by promoting the development and use of free (as in freedom) software and documentation—particularly the GNU operating system—and by campaigning against threats to computer user freedom like Digital Restrictions Management (DRM) and software patents.',
  },
  {
    name: 'Direct Relief',
    website: 'https://www.directrelief.org/',
    ein: '95-1831116',
    photo: 'https://i.imgur.com/QS7kHAU.png',
    preview:
      'Direct Relief is a humanitarian aid organization, active in all 50 states and more than 80 countries, with a mission to improve the health and lives of people affected by poverty or emergencies – without regard to politics, religion, or ability to pay.',
    description:
      'Nongovernmental, nonsectarian, and not-for-profit, Direct Relief relies entirely on private contributions to advance its mission and perform a wide range of functions.\n Included among them are identifying key local providers of health services; working to identify the unmet needs of people in the low-resource areas; mobilizing essential medicines, supplies, and equipment that are requested and appropriate for the circumstances; and managing the many details inherent in storing, transporting, and distributing such resources to organizations in the most efficient manner possible.',
  },
  {
    name: 'World Resources Institute',
    website: 'https://www.wri.org/',
    ein: '52-1257057',
    photo: 'https://i.imgur.com/Bi6MgYI.png',
    preview:
      'WRI is a global nonprofit organization that works with leaders in government, business and civil society to research, design, and carry out practical solutions that simultaneously improve people’s lives and ensure nature can thrive.',
    description:
      "Since its founding in 1982, WRI has been guided by its mission and core values which are integrated into all that we do. Our mission: To move human society to live in ways that protect Earth’s environment and its capacity to provide for the needs and aspirations of current and future generations. WRI relies on the generosity of our donors to drive outcomes that help the world to be a fairer, healthier and more sustainable place for people and the planet. We publish our financials annually to highlight our continued fiscal accountability. That's why WRI consistently receives top ratings from charity evaluators for our strong financial stewardship and commitment to transparency and accountability.",
  },
  {
    name: 'ProPublica',
    website: 'https://www.propublica.org/',
    ein: '14-2007220',
    photo: 'https://i.imgur.com/R5Vt3Pb.png',
    preview:
      'The mission: to expose abuses of power and betrayals of the public trust by government, business, and other institutions, using the moral force of investigative journalism to spur reform through the sustained spotlighting of wrongdoing.',
    description:
      'ProPublica is an independent, nonprofit newsroom that produces investigative journalism with moral force. We dig deep into important issues, shining a light on abuses of power and betrayals of public trust — and we stick with those issues as long as it takes to hold power to account. With a team of more than 100 dedicated journalists, ProPublica covers a range of topics including government and politics, business, criminal justice, the environment, education, health care, immigration, and technology. We focus on stories with the potential to spur real-world impact. Among other positive changes, our reporting has contributed to the passage of new laws; reversals of harmful policies and practices; and accountability for leaders at local, state and national levels.',
  },
  {
    name: 'Dana-Farber Cancer Institute',
    website: 'https://www.dana-farber.org/',
    ein: '04-2263040',
    photo: 'https://i.imgur.com/SQNn97p.png',
    preview:
      "For over 70 years, we've led the world by making life-changing breakthroughs in cancer research and patient care, providing the most advanced treatments available.",
    description:
      "Since its founding in 1947, Dana-Farber Cancer Institute in Boston, Massachusetts has been committed to providing adults and children with cancer with the best treatment available today while developing tomorrow's cures through cutting-edge research. Today, the Institute employs more than 5,000 staff, faculty, and clinicians supporting more than 640,000 annual outpatient visits, more than 1,000 hospital discharges per year, and has over 1,100 open clinical trials. Dana-Farber is internationally renowned for its equal commitment to cutting edge research and provision of excellent patient care. The deep expertise in these two areas uniquely positions Dana-Farber to develop, test, and gain FDA approval for new cancer therapies in its laboratories and clinical settings. Dana-Farber researchers have contributed to the development of 35 of 75 cancer drugs recently approved by the FDA for use in cancer patients.",
  },
  {
    name: 'Save The Children',
    website: 'https://www.savethechildren.org/',
    ein: '06-0726487',
    photo: 'https://i.imgur.com/GngYPBI.png',
    preview:
      'Through the decades, Save the Children has continued to work to save children’s lives, and that’s still what we do today.',
    description:
      "Our pioneering programs address children's unique needs, giving them a healthy start in life, the opportunity to learn and protection from harm. In the United States and around the world, our work creates lasting change for children, their families and communities – ultimately, transforming the future we all share.\nThis work is only made possible by the ongoing generosity of our donors, whose valuable support is used in the most cost-effective ways. It's important to note that all our work intersects – helping a boy or girl go to school also protects them from dangers such as child trafficking and early marriage. Keeping children healthy from disease or malnutrition means their parents are more likely to avoid costly treatment and be better able to provide for their family.\nWe don’t go into communities, carry out a project and then move on. We consult with children, their families, community leaders and local councils to understand all the issues or barriers, and then we develop programs that address these. We build trust so that our programs are successful and bring about real change.",
  },
  {
    name: 'World Central Kitchen Incorporated',
    website: 'https://wck.org/',
    ein: '27-3521132',
    photo: 'https://i.imgur.com/te93MaY.png',
    preview:
      'WCK is first to the frontlines, providing meals in response to humanitarian, climate, and community crises. We build resilient food systems with locally led solutions.',
    description:
      "WCK responds to natural disasters, man-made crises, and humanitarian emergencies around the world. We're a team of food first responders, mobilizing with the urgency of now to get meals to the people who need them most. Deploying our model of quick action, leveraging local resources, and adapting in real time, we know that a nourishing meal in a time of crisis is so much more than a plate of food—it's hope, it's dignity, and it's a sign that someone cares.",
  },
  {
    name: 'The Johns Hopkins Center for Health Security',
    website: 'https://www.centerforhealthsecurity.org/',
    ein: '',
    photo: 'https://i.imgur.com/gKZE2Xs.png',
    preview:
      'Our mission: to protect people’s health from epidemics and disasters and ensure that communities are resilient to major challenges.',
    description:
      'The Center for Health Security undertakes a series of projects, collaborations, and initiatives to push forward progress on global health security, emerging infectious diseases and epidemics, medical and public health preparedness and response, deliberate biological threats, and opportunities and risks in the life sciences. We:\n- Conduct research and analysis on major domestic and international health security issues.\n- Engage with researchers, the policymaking community, and the private sector to make progress in the field.\n- Convene expert working groups, congressional seminars, scientific meetings, conferences, and tabletop exercises to stimulate new thinking and provoke action.\n- Educate a rising generation of scholars, practitioners, and policymakers.',
  },
  {
    name: 'ALLFED',
    website: 'https://allfed.info/',
    photo: 'https://i.imgur.com/p235vwF.jpg',
    ein: '27-6601178',
    preview: 'Feeding everyone no matter what.',
    description:
      'The mission of the Alliance to Feed the Earth in Disasters is to help create resilience to global food shocks. We seek to identify various resilient food solutions and to help governments implement these solutions, to increase the chances that people have enough to eat in the event of a global catastrophe. We focus on events that could deplete food supplies or access to 5% of the global population or more.Our ultimate goal is to feed everyone, no matter what. An important aspect of this goal is that we need to establish equitable solutions so that all people can access the nutrition they need, regardless of wealth or location.ALLFED is inspired by effective altruism, using reason and evidence to identify how to do the most good. Our solutions are backed by science and research, and we also identify the most cost-effective solutions, to be able to provide more nutrition in catastrophes.',
  },
  {
    name: 'The Trevor Project',
    website: 'https://www.thetrevorproject.org/',
    photo: 'https://i.imgur.com/QN4mVNn.jpeg',
    preview:
      'The Trevor Project is the world’s largest suicide prevention and crisis intervention organization for LGBTQ (lesbian, gay, bisexual, transgender, queer, and questioning) young people.',
    description: `Two decades ago, we responded to a health crisis. Now we’re building a safer, more-inclusive world. LGBTQ young people are four times more likely to attempt suicide, and suicide remains the second leading cause of death among all young people in the U.S.

      Our Mission
      To end suicide among lesbian, gay, bisexual, transgender, queer & questioning young people.
      
      Our Vision
      A world where all LGBTQ young people see a bright future for themselves.
      
      Our Goal
      To serve 1.8 million crisis contacts annually, by the end of our 25th year, while continuing to innovate on our core services.`,
  },
  {
    name: 'ACLU',
    website: 'https://www.aclu.org/',
    photo: 'https://i.imgur.com/nbSYuDC.png',
    preview:
      'The ACLU works in the courts, legislatures, and communities to defend and preserve the individual rights and liberties guaranteed to all people in this country by the Constitution and laws of the United States.',
    description: `
    THREE THINGS TO KNOW ABOUT THE ACLU
•	We protect American values. In many ways, the ACLU is the nation's most conservative organization. Our job is to conserve America's original civic values - the Constitution and the Bill of Rights - and defend the rights of every man, woman and child in this country.
•	We're not anti-anything. The only things we fight are attempts to take away or limit your civil liberties, like your right to practice any religion you want (or none at all); or to decide in private whether or not to have a child; or to speak out - for or against - anything at all; or to be treated with equality and fairness, no matter who you are.
•	We're there for you. Rich or poor, straight or gay, black or white or brown, urban or rural, pious or atheist, American-born or foreign-born, able-bodied or living with a disability. Every person in this country should have the same basic rights. And since our founding in 1920, we've been working hard to make sure no one takes them away.

The American Civil Liberties Union is our nation's guardian of liberty, working daily in courts, legislatures and communities to defend and preserve the individual rights and liberties that the Constitution and laws of the United States guarantee everyone in this country.

"So long as we have enough people in this country willing to fight for their rights, we'll be called a democracy," ACLU Founder Roger Baldwin said.

The U.S. Constitution and the Bill of Rights trumpet our aspirations for the kind of society that we want to be. But for much of our history, our nation failed to fulfill the promise of liberty for whole groups of people.`,
  },
  {
    name: 'The Center for Election Science',
    website: 'https://electionscience.org/',
    photo: 'https://i.imgur.com/WvdHHZa.png',
    preview:
      'The Center for Election Science is a nonpartisan nonprofit dedicated to empowering voters with voting methods that strengthen democracy. We believe you deserve a vote that empowers you to impact the world you live in.',
    description: `Founded in 2011, The Center for Election Science is a national, nonpartisan nonprofit focused on voting reform.

Our Mission — To empower people with voting methods that strengthen democracy.

Our Vision — A world where democracies thrive because voters’ voices are heard.

With an emphasis on approval voting, we bring better elections to people across the country through both advocacy and research.

The movement for a better way to vote is rapidly gaining momentum as voters grow tired of election results that don’t represent the will of the people. In 2018, we worked with locals in Fargo, ND to help them become the first city in the U.S. to adopt approval voting. And in 2020, we helped grassroots activists empower the 300k people of St. Louis, MO with stronger democracy through approval voting.`,
  },
  {
    name: 'Founders Pledge Global Health and Development Fund',
    website: 'https://founderspledge.com/funds/global-health-and-development',
    photo: 'https://i.imgur.com/EXbxH7T.png',
    preview:
      'Tackling the vast global inequalities in health, wealth and opportunity',
    description: `Nearly half the world lives on less than $2.50 a day, yet giving by the world’s richest often overlooks the world’s poorest and most vulnerable. Despite the average American household being richer than 90% of the rest of the world, only 6% of US charitable giving goes to charities which work internationally.

This Fund is focused on helping those who need it most, wherever that help can make the biggest difference. By building a mixed portfolio of direct and indirect interventions, such as policy work, we aim to:

Improve the lives of the world's most vulnerable people.
Reduce the number of easily preventable deaths worldwide.
Work towards sustainable, systemic change.`,
  },
  {
    name: 'YIMBY Law',
    website: 'https://www.yimbylaw.org/',
    photo: 'https://i.imgur.com/zlzp21Z.png',
    preview:
      'YIMBY Law works to make housing in California more accessible and affordable, by enforcing state housing laws.',
    description: `
    YIMBY Law works to make housing in California more accessible and affordable. Our method is to enforce state housing laws, and some examples are outlined below. We send letters to cities considering zoning or general plan compliant housing developments informing them of their duties under state law, and sue them when they do not comply.

If you would like to support our work, you can do so by getting involved or by donating.`,
  },
  {
    name: 'CaRLA',
    website: 'https://carlaef.org/',
    photo: 'https://i.imgur.com/IsNVTOY.png',
    preview:
      'The California Renters Legal Advocacy and Education Fund’s core mission is to make lasting impacts to improve the affordability and accessibility of housing to current and future Californians, especially low- and moderate-income people and communities of color.',
    description: `
    The California Renters Legal Advocacy and Education Fund’s core mission is to make lasting impacts to improve the affordability and accessibility of housing to current and future Californians, especially low- and moderate-income people and communities of color.

CaRLA uses legal advocacy and education to ensure all cities comply with their own zoning and state housing laws and do their part to help solve the state’s housing shortage.

In addition to housing impact litigation, we provide free legal aid, education and workshops, counseling and advocacy to advocates, homeowners, small developers, and city and state government officials.`,
  },
  {
    name: 'Mriya',
    website: 'https://mriya-ua.org/',
    photo:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fdefault%2Fci2h3hStFM.47?alt=media&token=0d2cdc3d-e4d8-4f5e-8f23-4a586b6ff637',
    preview: 'Donate supplies to soldiers in Ukraine',
    description:
      'Donate supplies to soldiers in Ukraine, including tourniquets and plate carriers.',
  },
  {
    name: 'The Society Library',
    website: 'https://www.societylibrary.org/',
    preview:
      "The Society Library works to improve humanity's relationship to information.",
    photo: 'https://i.imgur.com/jlrS3UA.png',
    description: `At The Society Library, we recognize that a person’s relationship to information is one of the most fundamental, most important, and most powerful. We rely on information (whether that information is internal thoughts, instincts, and feelings - or external data, claims, and conversation) to make meaning of the world and make choices. Access to information can enable more enlightened, empowered, and emancipated decisions, just as deprivation of information can confine, control, and coerce our choices.

    The Society Library is a nonpartisan, nonprofit institution dedicated to improving humanity’s relationship to information. We serve this mission by offering tools and services to support humanity’s ability to overcome the internal and external biasing forces that corrupt our ability to make more informed, inclusive, and free choices. External forces include information being inaccessible (due to echo chambers, de-platforming, agenda-setting, etc.), information being corrupted (mis/disinformation, propaganda, biased language, etc.), information being obfuscated (overwhelming technical complexity, jargon, etc.), and there simply being too much information scattered across the web and world to make sense of. Internal forces include our own cognitive biases and logically fallacious thinking processes that corrupt our sensemaking.

    The Society Library dreams of a future when every human on earth inherits a library of the collective ideas, ideologies, and world-views of humanity, so they may more willfully choose to adopt or adapt beliefs, instead of more randomly or blindly inheriting ideas generationally based on limitations like geographic location, economic status, political socialization, and culture. We see a future in which freedom of thought and belief is deeply honored, and when people’s beliefs conflict, humanity has the tools to functionally negotiate those differences in a manner that maximizes freedom in being. People currently have the human right of freedom of thought and belief (Human Right #18 and #19), but to truly make that possible, we need to make information more accessible in every possible way. This is our mission and our work. This is the Society Library.`,
  },
  {
    name: 'Kiva Microfunds',
    website: 'https://www.kiva.org/',
    preview:
      'Kiva Microfunds seeks to provide loans to those in need by crowdsourcing funds.',
    photo:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fdefault%2F2OHVOHaTEL.png?alt=media&token=97373c62-3214-4957-99d6-2373163be2d8',
    description: ` More than 1.7 billion people around the world are unbanked and can’t access the financial services they need. Kiva is an international nonprofit, founded in 2005 in San Francisco, with a mission to expand financial access to help underserved communities thrive.

We do this by crowdfunding loans and unlocking capital for the underserved, improving the quality and cost of financial services, and addressing the underlying barriers to financial access around the world. Through Kiva's work, students can pay for tuition, women can start businesses, farmers are able to invest in equipment and families can afford needed emergency care. `,
  },
  {
    name: 'Electronic Frontier Foundation',
    website: 'https://www.eff.org/',
    photo: 'https://i.imgur.com/CmO8Bfn.png',
    preview:
      'The leading nonprofit defending digital privacy, free speech, and innovation.',
    description: `
    The Electronic Frontier Foundation is the leading nonprofit organization defending civil liberties in the digital world. Founded in 1990, EFF champions user privacy, free expression, and innovation through impact litigation, policy analysis, grassroots activism, and technology development. EFF's mission is to ensure that technology supports freedom, justice, and innovation for all people of the world. Today, EFF uses the unique expertise of leading technologists, activists, and attorneys in our efforts to defend free speech online, fight illegal surveillance, advocate for users and innovators, and support freedom-enhancing technologies.`,
  },
  {
    name: 'Rethink Priorities',
    website: 'https://rethinkpriorities.org/',
    photo: 'https://i.imgur.com/Xs3D69w.png',
    preview: 'Uncovering actionable insights to make the world a better place.',
    description: `Rethink Priorities’ mission is to generate the most significant possible impact for others in the present and the long-term future. 

Using evidence and reason, we identify where resources would be most effective and help direct them there. We do this by conducting critical research to inform policymakers and philanthropists, and by guiding the development of new organizations to address key problems. 

Our work covers important and neglected cause areas, including animal welfare, artificial intelligence, climate change, global health and development, and other work to safeguard a flourishing long-term future. We also aim to understand and support effective altruism – the community of people focused on these issues.`,
  },
  {
    name: 'Happier Lives Institute',
    website: 'https://www.happierlivesinstitute.org/',
    photo:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fdefault%2Fylh9QFPCkj.png?alt=media&token=6ea4b8c4-0d53-4b90-ad69-58b44a317e83',
    preview: 'We rigorously examine charities based on subjective wellbeing',
    description: `We compare charities on a common metric called wellbeing-adjusted life years (WELLBYs). One WELLBY is equivalent to a 1-point increase on a 0-10 life satisfaction scale for one year.

We use WELLBYs to compare the impact of charities that improve different outcomes, such as health or finances. This is the only approach to charity evaluation that allows us to make apples-to-apples comparisons. No other charity evaluator uses this approach. `,
  },
  {
    name: 'Strong Minds',
    website: 'https://strongminds.org/',
    photo:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fdefault%2FzHV9DPRU9o.png?alt=media&token=2f3575b8-328e-4863-92f4-1fcd6350b4fc',
    preview: 'Providing mental health therapy in Africa',
    description: `- Globally, 280 million people are living with depressive disorders.
- In low-income countries, approximately 85% receive no treatment.
- StrongMinds provides free group talk therapy to low-income women and adolescents with depression in Uganda and Zambia.
- We scale our reach through peer-to-peer therapy, teletherapy, public education, and partnerships.
- Women who complete our therapy achieve clinically significant reductions in depression symptoms, restoring hope for themselves and their families.`,
  },
  {
    name: 'Good Food Institute',
    website: 'https://gfi.org',
    photo:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fdefault%2FTnNRCKWVG0.42?alt=media&token=f6ff8467-fce0-441c-b316-53374b6883a5',
    preview:
      'At GFI, we’re building a world where alternative proteins are no longer alternative.',
    description: `The Good Food Institute is a nonprofit think tank and international network of organizations working to accelerate alternative protein innovation.

Globally, meat consumption is the highest it has ever been. According to the UN, global meat production is projected to double by 2050.

With plant-based meat, cultivated meat, and fermentation, we can mitigate the environmental impact of our food system, decrease the risk of zoonotic disease, and ultimately feed more people with fewer resources. 

By making meat from plants and cultivating meat from cells, we can modernize meat production. `,
  },
  {
    name: 'UMCOR',
    website: 'https://umcmission.org/umcor/',
    photo: 'https://i.imgur.com/MFURh7b.png',
    preview:
      'Assists United Methodists and churches to become involved globally in direct ministry to persons in need.',
    description: `As the humanitarian relief and development arm of The United Methodist Church, the United Methodist Committee on Relief – UMCOR – assists United Methodists and churches to become involved globally in direct ministry to persons in need. UMCOR comes alongside those who suffer from natural or human-caused disasters – famine, hurricane, war, flood, fire or other events—to alleviate suffering and serve as a source of help and hope for the vulnerable. UMCOR provides relief, response and long-term recovery grants when events overwhelm a community’s ability to recover on their own. UMCOR also provides technical support and training for partners to address emerging and ongoing issues related to disaster relief, recovery, and long-term health and development.`,
  },
  {
    name: 'Sentience Institute',
    website: 'https://www.sentienceinstitute.org/',
    photo: 'https://i.imgur.com/074K7gL.png',
    preview: "Expanding humanity's moral circle.",
    description: `At Sentience Institute, we approach moral circle expansion through research. The research we conduct is interdisciplinary, particularly across economics, history, philosophy, psychology, and sociology. We focus on empirical questions, such as how the moral circle has expanded historically, what people’s moral circles look like today, and the factors that influence people’s moral circles, but also work on some conceptual questions to clarify concepts such as sentience and moral circle expansion. Historically, we have focused on farmed animals; we now allocate a substantial proportion of our resources to address questions related to artificial sentience.

Our research has many different routes to impact, often referred to as the “Theory of Change.” Most directly, we aim to discover the factors (e.g., activism and business strategies) that most lead to moral circle expansion, but we also aim to understand the nature of moral progress (e.g., How do more people become longtermist?) and evaluate the extent to which certain moral and social outcomes should be prioritized by those trying to do the most good (i.e., “global priorities research”). This helps activists, donors, investors, governments, firms, and other stakeholders working on these issues knowledge to implement strategies that will change social norms and implement more morally inclusive laws and policies. While we mainly focus on institutional change, we expect our research will also help organizations working on changing individual behavior. Because of our longtermist perspective, we are interested in helping develop social movements and organizations that can take action many years from now.

Where appropriate, we publish our research in academic journals, which helps communicate our findings to academics and encourages other researchers to carry out similar research. Our research sometimes attracts media attention, which we expect also has positive effects by informing public opinion and promoting more morally inclusive social norms. Usually, stakeholders see our research via email or directly on our website.`,
  },
  {
    name: 'GTNPF',
    website: 'https://www.gtnpf.org/',
    photo: 'https://i.imgur.com/7OD1ViM.png',
    preview:
      'Grand Teton National Park Foundation initiates improvements, critical research, and projects that help better connect visitors to the park',
    description: `Grand Teton National Park Foundation is a private, nonprofit organization that funds projects that enhance Grand Teton National Park’s cultural, historic, and natural resources and helps others learn about and protect all that is special in the park.`,
  },
  {
    name: 'MIRI',
    website: 'https://intelligence.org/',
    photo: 'https://i.imgur.com/3SUKZ9m.png',
    preview:
      'The Machine Intelligence Research Institute does foundational mathematical research to ensure smarter-than-human AI has a positive impact',
    description: `MIRI’s mission is to ensure that the creation of smarter-than-human intelligence has a positive impact. We aim to make advanced intelligent systems behave as we intend even in the absence of immediate human supervision.
    
    MIRI focuses on AI approaches that can be made transparent (e.g., precisely specified decision algorithms, not genetic algorithms), so that humans can understand why AI systems behave as they do. For safety purposes, a mathematical equation defining general intelligence is more desirable than an impressive but poorly-understood code kludge.

Much of our research is therefore aimed at putting theoretical foundations under AI robustness work. We consider settings where traditional decision and probability theory frequently break down: settings where computation is expensive, there is no sharp agent/environment boundary, multiple agents exist, or self-referential reasoning is admitted.

Using training data to teach advanced AI systems what we value looks more promising than trying to code in everything we care about by hand. However, we know very little about how to discern when training data is unrepresentative of the agent’s future environment, or how to ensure that the agent not only learns about our values but accepts them as its own.

Additionally, rational agents pursuing some goal have an incentive to protect their goal-content. No matter what their current goal is, it will very likely be better served if the agent continues to promote it than if the agent changes goals. This suggests that it may be difficult to improve an agent’s alignment with human interests over time, particularly when the agent is smart enough to model and adapt to its programmers’ goals. Making value learning systems error-tolerant is likely to be necessary for safe online learning.

In addition to our mathematical research, MIRI investigates important strategic questions. What can (and can’t) we predict about the future of AI? How can we improve our forecasting ability? Which interventions available today appear to be the most beneficial, given what little we do know?`,
  },
  {
    name: 'Charity Entrepreneurship',
    website: 'https://www.charityentrepreneurship.com/',
    photo: 'https://i.imgur.com/8eHlC4h.png',
    preview:
      'Charity Entrepreneurship launches high-impact nonprofits by connecting entrepreneurs with effective ideas, training, and funding.',
    description: `Each year, Charity Entrepreneurship dedicates hundreds of research hours to identifying the most effective charity ideas. Then we recruit aspiring entrepreneurs and, through our two-month Incubation Program, provide them with the training and funding to turn these ideas into high-impact organizations.
    
Our mission is to enable more effective charities to exist in the world. We strive to achieve this goal through our extensive research process and Incubation Program.

Nonprofit entrepreneurship is also a highly neglected career opportunity that, fueled by a more analytical, effective-altruist mindset, can lead to cost-effective, evidence-based outcomes that are approximately equivalent to donating ~$200,000 to effective charities per year. It provides a chance to build a portfolio of useful skills and great career capital, and to have high job satisfaction while retaining substantial individual impact.`,
  },
  {
    name: 'NAACP Legal Defense Fund',
    website: 'https://www.naacpldf.org/',
    photo: 'https://i.imgur.com/32vJo5L.png',
    preview:
      "NAACP's Legal Defense Fund is the premier legal organization fighting for racial justice.",
    description: `The Legal Defense Fund (LDF) is America’s premier legal organization fighting for racial justice. Using the power of law, narrative, research, and people, we defend and advance the full dignity and citizenship of Black people in America.`,
  },
  {
    name: 'EWG',
    website: 'https://www.ewg.org/',
    photo: 'https://i.imgur.com/7QApy7i.png',
    preview:
      'EWG empowers you with breakthrough research to make informed choices and live a healthy life in a healthy environment.',
    description: `Since 1993, the Environmental Working Group has shined a spotlight on outdated legislation, harmful agricultural practices and industry loopholes that pose a risk to our health and the health of our environment.`,
  },
  {
    name: 'AI Impacts',
    website: 'https://aiimpacts.org/',
    photo: 'https://i.imgur.com/VWm1DLf.png',
    preview:
      'AI Impacts answers decision-relevant questions about the future of artificial intelligence.',
    description: `This project aims to improve our understanding of the likely impacts of human-level artificial intelligence.
The intended audience includes researchers doing work related to artificial intelligence, philanthropists involved in funding research related to artificial intelligence, and policy-makers whose decisions may be influenced by their expectations about artificial intelligence.

The focus is particularly on the long-term impacts of sophisticated artificial intelligence. Although human-level AI may be far in the future, there are a number of important questions which we can try to address today and may have implications for contemporary decisions. For example:

- What should we believe about timelines for AI development?
- How rapid is the development of AI likely to be near human-level? How much advance notice should we expect to have of disruptive change?
- What are the likely economic impacts of human-level AI?
- Which paths to AI should be considered plausible or likely?
- Will human-level AI tend to pursue particular goals, and if so what kinds of goals?
- Can we say anything meaningful about the impact of contemporary choices on long-term outcomes?

Today, public discussion on these issues appears to be highly fragmented and of limited credibility. More credible and clearly communicated views on these issues might help improve estimates of the social returns to AI investment, identify neglected research areas, improve policy, or productively channel public interest in AI.

The goal of the project is to clearly present and organize the considerations which inform contemporary views on these and related issues, to identify and explore disagreements, and to assemble whatever empirical evidence is relevant.    
`,
  },
  {
    name: 'MSI Reproductive Choices',
    website: 'https://www.msichoices.org/',
    photo: 'https://i.imgur.com/9cBHwWd.png',
    preview: `MSI Reproductive Choices provides contraception and safe abortion services that enable women all over the world to choose their own futures.`,
    description: `MSI Reproductive Choices provides contraception and safe abortion services that enable women all over the world to choose their own futures.

MSI Reproductive Choices is an international non-governmental organization providing contraception and safe abortion services in 37 countries around the world. MSI Reproductive Choices as an organisation lobbies in favour of access to abortion, and provides a variety of sexual and reproductive healthcare services including advice, vasectomies, and abortions in the UK and other countries where it is legal to do so. It is based in London and is a registered charity under English law.

Around the world, 32.6 million people are using a method of contraception provided by MSI Reproductive Choices, and across the 37 countries where they work, one in five women who want contraception are using a method provided by MSI Reproductive Choices. They reached 17.3 million people with high-quality sexual and reproductive health services in 2021 alone.

The organization's core services include family planning; safe abortion and post-abortion care; maternal and child health care, including safe delivery and obstetrics; diagnosis and treatment of sexually transmitted infections; and HIV/AIDS prevention.

The organization reports for the year 2021 to have prevented 14.1 million unintended pregnancies, averted 6.6 million unsafe abortions, and saved 39,000 women's lives.`,
  },
  {
    name: 'Fish Welfare Initiative',
    website: 'https://www.fishwelfareinitiative.org/',
    photo: 'https://i.imgur.com/gd8O71v.png',
    preview: `Fish Welfare Initiative's mission is to improve the welfare of fish as much as possible, focusing specifically on farmed fish.`,
    description: `Fish Welfare Initiative is a startup organization whose mission is to improve the welfare of fish as much as possible. They focus specifically on farmed fish, i.e., fish raised in aquaculture.
    
    They collaborate with corporations, governments, and producers to improve fish welfare standards and practices with a simple broad approach: researching the most promising ways of improving fish welfare, and then enabling stakeholders to do so. 
    Following their initial research, their team now partners with NGOs to help farmers introduce higher welfare farming methods in the second-highest fish producing country in the world, India.
    
    As of December 30 2022, they have potentially helped 1.14 and 1.4 million fish and shrimp respectively, with every $1 potentially helping 1.3 fish and every $100 13 fish.`,
  },
  {
    name: 'Cavendish Labs',
    website: 'https://cavendishlabs.org/',
    photo: 'https://i.imgur.com/UM0It6p.png',
    preview: `Cavendish Labs is a longtermist research institute focused on AI alignment and pandemic prevention.`,
    description: `Cavendish Labs is a research institute based in Cavendish, Vermont focused on AI alignment and pandemic prevention. Our main research areas are the following:

1. Alignment. How do we make sure that AI does what we want? We’ve spent some time thinking about ELK and inverse scaling; however, we think that AGI will most likely be achieved through some sort of model-based RL framework, so that is our current focus. For instance, we know how to induce provable guarantees of behaviour in supervised learning; could we do something similar in RL?
2. Pandemic prevention. A lot of people have heard of the Far-UVC light idea; however, understanding why it works, and whether it works safely, is useful for developing other broad-spectrum viral prevention tools, as well as preventing the engineering of UV-resistant viruses.
3. Diagnostic development. We're interested in designing a low-cost and simple-to-use platform for LAMP reactions so that generalized diagnostic capabilities are more widespread. We envision a world where it is both cheap and easy to run a panel of tests so one can swiftly determine the exact virus behind an infection.`,
  },
  {
    name: 'Internet Archive',
    website: 'https://archive.org/',
    photo: 'https://i.imgur.com/fhsp9QV.jpeg',
    preview: 'Providing Universal Access to All Knowledge',
    description: `The Internet Archive, a 501(c)(3) non-profit, is building a digital library of Internet sites and other cultural artifacts in digital form. Like a paper library, we provide free access to researchers, historians, scholars, people with print disabilities, and the general public. Our mission is to provide Universal Access to All Knowledge.

We began in 1996 by archiving the Internet itself, a medium that was just beginning to grow in use. Like newspapers, the content published on the web was ephemeral - but unlike newspapers, no one was saving it. Today we have 26+ years of web history accessible through the Wayback Machine and we work with 1,000+ library and other partners through our Archive-It program to identify important web pages.`,
  },
  {
    name: 'Camfed',
    website: 'https://camfed.org/us/',
    photo: 'https://i.imgur.com/7b2aiRL.jpg',
    preview: `Camfed supports girls to learn, thrive and lead change.`,
    description: `Camfed (also known as the Campaign for Female Education) was founded in 1993 and operates in Zimbabwe, Zambia, Ghana, Tanzania and Malawi with the goal of educating women. 
    Education is a very important resourse that is unfortunately not always made available, especially to women. Allowing someone to get an education allows them to do great things.`,
  },
  {
    name: 'The Fred Hollows Foundation',
    website: 'https://www.hollows.org/au/',
    photo: 'https://i.imgur.com/GGzXksd.png',
    preview: `Fred Hollows Foundation focuses on preventable and treatable diseases such as cataract, trachoma and diabetic retinopathy`,
    description: `The Fred Hollows Foundation has a very clear goal: we’re putting an end to avoidable blindness. 
    When this day comes, people in developing countries will get the same quality eye care the rest of the world takes for granted – and we won’t stop until this is done.`,
  },
  {
    name: 'New Vocations',
    website: 'https://www.newvocations.org',
    photo: 'https://i.imgur.com/1IeaDZP.png',
    preview:
      'New Vocations focuses on the rehabilitation, retraining, and rehoming of retired racehorses.',
    description:
      'New Vocations is dedicated to offering retiring racehorses a second career through a comprehensive rehabilitation, retraining, and adoption program, ensuring these athletes find suitable homes beyond the track.',
  },
  {
    name: 'Stable Recovery',
    website: 'https://www.stablerecovery.net',
    photo: 'https://i.imgur.com/bgDjte0.png',
    preview:
      'Stable Recovery provides therapeutic programs using horses for men in recovery from addiction.',
    description:
      'Stable Recovery bridges the world of equine therapy and addiction recovery, offering transformative programs that harness the healing power of horses. They not only help men in the early stages of addiction to get the help they need by creating a support system, but teach them employable skills and provide them with the opportunities they need for a second chance.',
  },
  {
    name: 'Thoroughbred Retirement Foundation',
    website: 'https://www.trfinc.org',
    photo: 'https://i.imgur.com/AsVq4XW.png',
    preview:
      'The foundation is dedicated to saving thoroughbred horses from possible neglect, abuse, or slaughter.',
    description:
      'The Thoroughbred Retirement Foundation ensures a safe retirement for thoroughbreds that are no longer fit for racing, providing them with the care and attention they need for a peaceful life.',
  },
  {
    name: 'The Thoroughbred Aftercare Alliance',
    website: 'https://www.thoroughbredaftercare.org',
    photo: 'https://i.imgur.com/Jm7IZS9.png',
    preview:
      'An alliance working to ensure a secure future for thoroughbreds after their racing careers.',
    description:
      'The Thoroughbred Aftercare Alliance accredits, inspects, and awards grants to approved aftercare organizations to retire, retrain, and rehome thoroughbreds.',
  },
  {
    name: 'Old Friends',
    website: 'https://www.oldfriendsequine.org',
    photo: 'https://i.imgur.com/HBsmGjb.png',
    preview:
      'A sanctuary for retired thoroughbreds ensuring they live out their days with dignity.',
    description:
      'Old Friends provides a dignified retirement to thoroughbreds whose racing and breeding careers have come to an end, offering a space where they can be celebrated and remembered.',
  },
  {
    name: 'New York Racetrack Chaplaincy',
    website: 'https://www.rtcany.org',
    photo: 'https://i.imgur.com/USPYiYm.png',
    preview:
      "Spiritual and welfare support for the backstretch community in New York's racetracks.",
    description:
      'New York Racetrack Chaplaincy serves the spiritual, emotional, and physical needs of the men and women working behind the scenes in the horse racing industry.',
  },
  {
    name: 'Belmont Child Care Association',
    website: 'https://www.belmontchildcare.org',
    photo: 'https://i.imgur.com/NrhJMrI.png',
    preview:
      'Offering child care and educational services for the children of New York’s backstretch workers.',
    description:
      "The Belmont Child Care Association provides quality education and child care services to meet the unique needs of equine workers' children.",
  },
  {
    name: 'Thoroughbred Charities of America',
    website: 'https://www.tca.org',
    photo: 'https://i.imgur.com/3VH6d5I.png',
    preview:
      'Supporting thoroughbreds throughout and after their racing careers and those who care for them.',
    description:
      'Thoroughbred Charities of America offers funding to non-profit organizations that work towards improving the lives of thoroughbred racehorses and the people who work with them.',
  },
  {
    name: 'The Jockey Club Safety Net Foundation',
    website: 'https://www.tjcfoundation.org',
    photo: 'https://i.imgur.com/tKgqULC.png',
    preview:
      'Providing financial relief and assistance to the horse racing community.',
    description:
      'The foundation aids members of the thoroughbred industry and their families who are in need, offering various forms of financial assistance during challenging times.',
  },
  {
    name: 'Grayson-Jockey Club Research Foundation',
    website: 'https://www.grayson-jockeyclub.org',
    photo: 'https://i.imgur.com/QsZYyc9.png',
    preview:
      'Advancing research to enhance the health and soundness of horses.',
    description:
      'The Grayson-Jockey Club Research Foundation funds veterinary research that benefits all breeds of horses, aiming to better understand equine health issues and find solutions.',
  },

  {
    name: 'Mareworthy',
    website: 'https://www.mareworthy.com/',
    photo: 'https://i.imgur.com/SdpWbOe.png',
    preview:
      'Develops and manages programs that ensure all Thoroughbred mares whose racing and breeding careers have ended are tracked and provided with care that protects them from suffering and cruelty.',
    description:
      'Mareworthy Charities exists to develop and manage programs that ensure all Thoroughbred mares whose racing and breeding careers have ended are tracked and provided with care that protects them from suffering and cruelty with a focus on Thoroughbred warhorse mares (mares who raced more than 50 times) and retired Thoroughbred broodmares. Currently the sanctuary space is in its infancy with limited space in Kentucky, but the future dream is to acquire a larger property that can be home to a larger herd. Until then, Mareworthy Charities is developing a network of approved forever foster homes for eligible mares. We rely on donations, merchandise sales, and any other creative ways we can support the horses we love. Your donation, no matter the size, truly makes a difference!',
  },
  {
    name: 'The Human Rights Foundation',
    website: 'https://hrf.org/',
    photo: 'https://i.imgur.com/ESrnCq5.png',
    preview:
      'A nonpartisan, nonprofit organization that promotes and protects human rights globally, with a focus on closed societies.',
    description:
      'We promote freedom where it’s most at risk: in countries ruled by authoritarian regimes. Individuals who suffer under authoritarianism are more likely to: lack food and clean drinking water; lack access to basic education; live in extreme poverty; face war and civil strife; become a refugee; lack freedom of speech and voting rights; and face constant threats of imprisonment, torture, violence, and death.',
  },

  {
    name: 'The Shrimp Welfare Project',
    website: 'https://www.shrimpwelfareproject.org/',
    photo: 'https://i.imgur.com/1TugXgS.png',
    preview: `Shrimp Welfare Project aims to improve the lives of billions of farmed shrimps`,
    description: `~400 billion shrimps are farmed each year. This is more than 5x the total number of all farmed land animals put together. Many of them suffer from conditions which can and should be addressed, such as:
Risk of disease - Diseases that exist within the normal microflora of shrimps can thrive under high stocking densities, enabling pathogenic outbreaks. This is detrimental not only to the farmed shrimps but can cause large spillover events if best management practices are not followed. The indiscriminate use of antibiotics to stop diseases promotes the emergence of antibiotic-resistant bacteria. Part of the solution in this case is prevention through best welfare practices.

Water quality - Oxygen and ammonia levels, temperature, salinity and pH are key to the welfare of all aquatic animals, including shrimps. Incorrect water management can lead to not only the contamination of nearby bodies of water and salinization and acidification of the soil, but also to compromised immune systems in shrimps and, in extreme cases, to death by suffocation or poisoning.

Eyestalk ablation - Some hatcheries still practice crushing or cutting off the eyestalk of female shrimps to induce rapid maturation. Recent studies have demonstrated that avoiding eyestalk ablation can result in broodstock living longer and their offspring being more resistant to stress. Therefore, eliminating this practice is in the best interest of shrimps but also of the shrimp farming industry.

They are highly neglected. Shrimp Welfare Project is the first organization focusing exclusively on the welfare of these animals. This has been made possible, in part, thanks to organizations such as Charity Entrepreneurship and Rethink Priorities raising the issue of invertebrate suffering.     
    `,
  },
  {
    name: 'Foresight Institute',
    website: 'https://foresight.org/',
    photo: 'https://i.imgur.com/SQqcQkL.png',
    preview:
      'Foresight Institute supports the beneficial development of high-impact technology to make great futures more likely.',
    description: `Foresight Institute is a research organization and non-profit that supports the beneficial development of high-impact technologies. Since our founding in 1986 on a vision of guiding powerful technologies, we have continued to evolve into a many-armed organization that focuses on several fields of science and technology that are too ambitious for legacy institutions to support. From molecular nanotechnology, to brain-computer interfaces, space exploration, cryptocommerce, and AI, Foresight gathers leading minds to advance research and accelerate progress toward flourishing futures.

A core part of Foresight’s work is to host technical groups: Molecular Machines to better control matter; Biotech to reverse aging; Computer Science to secure human AI cooperation; Neurotech to support human flourishing; Spacetech to further exploration. In these groups, we connect scientists, entrepreneurs, and institutional allies who cooperate to advance the respective technologies. Currently, meetings take place virtually every month. Most of the meetings are made publicly available via our Youtube or podcast, and are written into seminar summaries including slides, videos and any additional material to the talks that you can find on the respective page.

Foresight regularly hosts monthly in-person meetups across the globe, to offer like-minded people all over the world an opportunity to find each other and join our community. If you work in science and tech and want the future to go well, you should apply to join our meetups! Currently we are hosting in cities such as San Francisco, NYC, LA, Berlin, London, Stockholm, Zurich, Toronto, Paris, Miami, Austin, Singapore, Boston, Phuket/Rawai, Seattle, Dubai, Philadelphia and Lisbon.

Foresight’s biggest event every year is our annual member gathering Vision Weekend. This conference festival is hosted at the end of the year in the United State of America and in France. We invite top talent across biotechnology, nanotechnology, neurotechnology, computing, and space to burst their tech silos, and plan for flourishing long-term futures. Previously we have hosted this event in locations such as The Internet Archive, a space company, an old military ship and at a beautiful old castle in France.

We also host several technical conferences every year, inviting top researchers, entrepreneurs, and funders to highlight undervalued areas for progress. In addition to learning about undervalued opportunities for progress relevant to your field, and forming lasting collaborations with other leading scientists, entrepreneurs, and funders around shared goals, we hope that these workshops will generate direction and drive toward shared long-term goals.
    `,
  },
  {
    name: 'Racket',
    website: 'https://racket-lang.org/sfc.html',
    photo: 'https://i.imgur.com/qsVbGo8.png',
    preview:
      'Donate to Racket, a programming language, via the Software Freedom Conservancy which is a nonprofit organization centered around ethical technology',
    description:
      'Donate to Racket, a programming language, via the Software Freedom Conservancy which is a nonprofit organization centered around ethical technology',
  },
  {
    name: 'Legal Impact for Chickens',
    website: 'https://www.legalimpactforchickens.org/',
    photo:
      'https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/charity%2Flegal-impact-for-chickens.png?alt=media&token=094bd279-4628-4f03-8702-fc7d9962e15e',
    preview:
      'Legal Impact for Chickens aims to make factory-farm cruelty a liability.',
    description: `Legal Impact for Chickens focuses on civil litigation as a way to improve animal welfare. 

Why? Companies don’t follow laws that aren’t enforced. And prosecutors rarely enforce cruelty laws on factory farms, even when animal protection groups urge them to.

As a result, while several state cruelty laws technically cover farms, factory farms ignore them. Investigations in such states show rampant, unlawful neglect and abuse. Similarly, the animal movement’s effort to pass confinement bans may be wasted if those new bans aren’t enforced.

Strategic civil litigation offers a solution. Several little-known legal doctrines let plaintiffs sue in civil court for violation of a criminal law. At Legal Impact for Chickens, we focus on systematically developing, refining, and using those doctrines to fight factory-farm cruelty.
    `,
  },
  {
    name: 'Parker Institute for Cancer Immunotherapy',
    website: 'https://www.parkerici.org/',
    photo: 'https://i.imgur.com/vsiOFB5.png',
    preview:
      'Develop breakthrough immune therapies to turn all cancers into curable diseases faster',
    description: `For decades, entrenched infrastructure barriers have slowed progress in the fight against cancer and the development of potent immunotherapies. The Parker Institute for Cancer Immunotherapy breaks down these barriers and focuses fully on this durable and promising treatment. The result is groundbreaking new research and an intellectual property model that builds collaboration between researchers, nonprofits and industry all working together to get treatments to patients faster.

`,
  },
  {
    name: 'FIRE',
    website: 'https://www.thefire.org/',
    photo: 'https://i.imgur.com/BvFD5IC.png',
    preview:
      'FIRE defends and promotes the value of free speech for all Americans in our courtrooms, on our campuses, and in our culture.',
    description: `Freedom of speech is a fundamental American freedom and human right. It is essential for democracy, scientific progress, artistic expression, social justice, peace, and our ability to live as authentic individuals. 

Yet, across our nation, this cornerstone of our free society is under serious threat. Far too many of us fear sharing our views or challenging those that seem to dominate. Nearly 6-in-10 Americans believe our nation’s democracy is threatened because people are afraid to voice their opinions. 

FIRE therefore defends and promotes the value of free speech for all Americans in our courtrooms, on our campuses, and in our culture. Our vision is an America in which people overwhelmingly believe in the right of others to freely express views different from their own, and expect their laws and educational institutions to reflect and teach this belief.`,
  },
  {
    name: 'Doctors opposing circumcision',
    website: 'https://www.doctorsopposingcircumcision.org/',
    photo: 'https://i.imgur.com/QyKEfNE.png',
    preview:
      'Envisioning a world free from forced genital cutting, one where children’s rights are respected and their wholeness protected.',
    description:
      'We are an international network of physicians dedicated to protecting the genital integrity and eventual autonomy of all children, serving both health professionals and the public through education, support, and advocacy.',
  },
  {
    name: 'Bloodstained Men',
    website: 'https://www.bloodstainedmen.com/',
    photo: 'https://i.imgur.com/wjvZWGK.png',
    preview:
      'Our mission is to warn the American people that circumcision is cruel, worthless, and destructive',
    description:
      'In a typical year we travel to more than 60 cities, holding protests and educating the public about the rights of all children to keep all parts of their genitals. We have reached hundreds of thousands of people directly on the streets of America, and millions more through traditional media coverage, our social media activities, and our billboard campaigns.',
  },
  {
    name: 'Lightcone',
    website: 'https://www.lightconeinfrastructure.com/',
    tags: ['New'] as const,
    photo: 'https://i.imgur.com/LpMXQ6W.png',
    preview:
      'This century is critical for humanity. We build tech, infrastructure, and community to navigate it.',
    description:
      'Lightcone develops LessWrong, a popular online forum and community dedicated to improving human reasoning and decision-making. They also run a campus, Lighthaven, which provides a space for people working on the hardest problems to come together and collaborate. The Lighthaven campus was directly responsible to Manifold running our festival, Manifest!',
  },
].map((charity) => {
  const slug = charity.name.toLowerCase().replace(/\s/g, '-')
  return {
    ...charity,
    id: slug,
    slug,
  }
})
