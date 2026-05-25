// Static data - can be imported in server components
export const allSuggestions = [
  {
    label: "E-commerce site",
    prompt:
      "Create an online store with product grid, shopping cart, and checkout. Include 8-10 sample products with images, prices, and descriptions. Add search functionality, cart add/remove buttons, quantity controls, and a simple checkout form. Use React state to manage cart items and totals.",
  },
  {
    label: "Minecraft clone",
    prompt:
      "Build a 3D block world using Three.js where multiple users can join and build together. Create a flat terrain with placeable/removable colored cubes, WASD movement controls, mouse look camera, click to place/remove blocks, and basic inventory. Include multiplayer lobby, real-time block synchronization between players, player avatars, and simple chat. Use mock WebSocket simulation for multiplayer functionality.",
  },
  {
    label: "Realtime Co-founder Matching",
    prompt:
      "Create a Tinder-style website for finding business partners. Include user cards with name, skills, and bio, swipe left/right or like/pass buttons, messaging system for matches, and basic user profiles. Add 10-15 sample entrepreneur profiles with different skill sets (developer, designer, marketer, etc.). Use React state for matches and messages.",
  },
  {
    label: "Portfolio Website",
    prompt:
      "Create a personal portfolio website showcasing projects, skills, and experience. Include sections for about me, projects gallery with descriptions and links, skills/technologies, contact information, and responsive design. Add smooth scrolling navigation and project filtering capabilities.",
  },
  {
    label: "Birthday Website",
    prompt:
      "Build a birthday celebration website with countdown timer to the birthday, photo gallery, birthday wishes from friends, party details (date, time, location), RSVP functionality, and festive animations. Include a guest book where visitors can leave messages.",
  },
  {
    label: "Anniversary Website",
    prompt:
      "Create a romantic anniversary website featuring relationship timeline, photo memories gallery, love story section, milestone celebrations, shared memories, and anniversary countdown. Include features for adding new memories and a romantic message exchange system.",
  },
  {
    label: "Realtime Public Slack",
    prompt:
      "Build a real-time chat application similar to Slack with multiple channels, user authentication, message threading, file sharing capabilities, user presence indicators, message history, search functionality, and real-time message synchronization across all connected users.",
  },
  {
    label: "Live Auction Platform",
    prompt:
      "Create a real-time auction platform where users can list items, place bids, and watch live bidding wars. Include countdown timers, instant bid updates, seller dashboards, buyer notifications, bid history, and automatic winner selection. Add categories for art, collectibles, and electronics with real-time price tracking.",
  },
  {
    label: "Collaborative Whiteboard",
    prompt:
      "Build a multiplayer drawing and brainstorming app like Miro or Figma. Include real-time cursor tracking, shape tools, sticky notes, freehand drawing, text annotations, and zoom/pan controls. Add rooms where teams can collaborate with live presence indicators and color-coded contributions.",
  },
  {
    label: "Real-time Stock Trading Game",
    prompt:
      "Create a simulated stock trading platform with live price updates, portfolio tracking, buy/sell orders, and leaderboards. Include mock stocks with realistic price movements, trading history charts, news feed affecting prices, and multiplayer competitions with real-time rankings.",
  },
  {
    label: "Live Coding Interview Platform",
    prompt:
      "Build a technical interview platform with real-time code collaboration, video chat, whiteboard, and multiple programming languages support. Include syntax highlighting, code execution, test cases, interviewer notes, and candidate progress tracking with live updates.",
  },
  {
    label: "Multiplayer Quiz Game",
    prompt:
      "Create a real-time trivia game where players compete in live rounds. Include lobbies, countdown timers, score tracking, power-ups, category selection, and tournament brackets. Add leaderboards, achievements, and spectator mode with live commentary.",
  },
  {
    label: "Collaborative Playlist Builder",
    prompt:
      "Build a Spotify-like app where friends can create shared playlists in real-time. Include song search, voting system, currently playing indicator, queue management, and party mode. Add user profiles, playlist history, and live activity feed showing what friends are listening to.",
  },
  {
    label: "Live Sports Score Tracker",
    prompt:
      "Create a sports dashboard with real-time scores, play-by-play updates, team lineups, and statistics. Include multiple sports, live commentary feed, prediction games, and fan chat rooms. Add notifications for goals, touchdowns, and game highlights.",
  },
  {
    label: "Real-time Task Management",
    prompt:
      "Build a Trello-style kanban board with live collaboration features. Include drag-and-drop cards, assignee avatars, due dates, comments, file attachments, and activity streams. Add sprint planning tools, burndown charts, and team presence indicators.",
  },
  {
    label: "Live Document Editor",
    prompt:
      "Create a Google Docs clone with real-time collaborative editing. Include cursor tracking, user highlights in different colors, comments, suggestions mode, version history, and formatting tools. Add document sharing, permissions, and live word count.",
  },
  {
    label: "Multiplayer Card Game",
    prompt:
      "Build an online card game platform supporting games like Poker, Uno, or custom rules. Include game rooms, real-time card animations, chat, spectator mode, and tournament organization. Add player profiles, statistics, and ranking system.",
  },
  {
    label: "Live Polling & Voting App",
    prompt:
      "Create a real-time polling platform for events and presentations. Include multiple choice, ranking, and open-ended questions. Add live result visualization with charts, word clouds, and audience participation metrics. Include QR code joining and moderation tools.",
  },
  {
    label: "Collaborative Music Jam",
    prompt:
      "Build a multiplayer music creation app where users can jam together online. Include virtual instruments, drum machines, loop stations, and recording features. Add rooms for different genres, real-time audio sync, and session replay functionality.",
  },
  {
    label: "Real-time Food Delivery Tracker",
    prompt:
      "Create a food ordering platform with live order tracking. Include restaurant menus, cart management, delivery driver location on map, estimated arrival time, and order status updates. Add rating system, order history, and group ordering features.",
  },
  {
    label: "Live Classroom Platform",
    prompt:
      "Build an online education platform with real-time features. Include video streaming, screen sharing, digital whiteboard, breakout rooms, polls, and hand-raising system. Add attendance tracking, assignment submission, and grade book with instant feedback.",
  },
  {
    label: "Multiplayer Tower Defense",
    prompt:
      "Create a co-op tower defense game where players defend against waves together. Include tower placement, upgrades, resource sharing, enemy wave synchronization, and special abilities. Add leaderboards, replay system, and custom map editor.",
  },
  {
    label: "Real-time Weather Dashboard",
    prompt:
      "Build a weather monitoring app with live updates from multiple locations. Include animated weather maps, severe weather alerts, hourly/daily forecasts, and user-submitted reports. Add customizable widgets, location tracking, and weather history graphs.",
  },
  {
    label: "Collaborative Budget Planner",
    prompt:
      "Create a shared expense tracking app for roommates or families. Include real-time balance updates, expense categories, receipt uploads, payment reminders, and settlement calculations. Add spending insights, budget goals, and monthly reports.",
  },
  {
    label: "Live Event Check-in System",
    prompt:
      "Build an event management platform with QR code check-ins. Include attendee registration, real-time capacity tracking, session scheduling, networking features, and live Q&A. Add analytics dashboard, badge printing, and post-event surveys.",
  },
  {
    label: "Multiplayer Chess Platform",
    prompt:
      "Create an online chess platform with real-time games, ELO ratings, and tournaments. Include move timer, position analysis, game replay, spectator mode, and puzzle challenges. Add friend system, clubs, and coaching features with screen annotation.",
  },
  {
    label: "Real-time Fitness Tracker",
    prompt:
      "Build a workout app where friends can exercise together virtually. Include live workout sessions, progress sharing, challenge competitions, and achievement badges. Add exercise library, custom routines, and real-time heart rate monitoring display.",
  },
];

// Default suggestions for SSR - always returns the same 3 to prevent hydration mismatches
export const getDefaultSuggestions = () => allSuggestions.slice(0, 3);

// Function to get 3 random suggestions using Fisher-Yates shuffle
export const getRandomSuggestions = () => {
  const shuffled = [...allSuggestions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
};
