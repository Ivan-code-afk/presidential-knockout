// ПРЕЗИДЕНТСКИЙ НОКАУТ — данные игры.
// Здесь всё, что можно править без программирования: имена, параметры бойцов,
// названия приёмов, тексты фаталити и концовок, арены и аркада.
// Параметры бойцов: speed / power / health — множители (1.0 = средний боец),
// specials: n — SPEC, f — вперёд + SPEC, d — вниз + SPEC; cd — перезарядка в секундах.

window.GAME_DATA = {
  title: "PRESIDENTIAL KNOCKOUT",
  disclaimer: "Unofficial parody. All characters are caricatures.",

  fighters: {
    bush: {
      name: "BUSH", full: "George W. Bush",
      speed: 1.0, power: 1.0, health: 1.0,
      specials: {
        n: { name: "SHOE DODGE", type: "parry", cd: 3.0, desc: "Dodge an attack and counter with an uppercut" },
        f: { name: "BRUSH STROKE", type: "brush", cd: 2.4, desc: "Dash forward with a paint-brush strike" },
        d: { name: "I'M THE DECIDER", type: "decider", cd: 9, desc: "For 2 seconds every block becomes a counter" },
      },
      passive: { name: "STEADY HAND", desc: "A successful dodge fills the SUPER meter faster" },
      superMove: { name: "MISSION ACCOMPLISHED", type: "dropBanner" },
      colors: { shirt: "#d9c7a0", pants: "#3d5a9e", skin: "#e8a97c", hair: "#a9a9a9", accent: "#8a5a2b", shoes: "#7a4a22" },
      look: { belt: "#8a5a2b" },
      win: "Thumbs up!",
      fatality: "Paints an oil portrait of his opponent, who gets stuck inside the canvas.",
      ending: "Hangs portraits of every defeated rival in his gallery. Each one has a tiny shoe painted in the corner.",
    },
    clinton: {
      name: "CLINTON", full: "Bill Clinton",
      speed: 0.95, power: 0.95, health: 1.0,
      specials: {
        n: { name: "SAX ATTACK", type: "notes", cd: 3.2, desc: "A wave of musical notes" },
        f: { name: "MORNING JOG", type: "jog", cd: 3.5, desc: "Jog straight through the opponent to their back" },
        d: { name: "TOWN HALL", type: "townhall", cd: 8, desc: "Work the crowd to charge the SUPER meter. Risky!" },
      },
      passive: { name: "COMEBACK KID", desc: "The lower his health, the harder he hits" },
      superMove: { name: "I FEEL YOUR PAIN", type: "reflect" },
      colors: { shirt: "#22305e", pants: "#22305e", skin: "#f0a98a", hair: "#dcdcdc", accent: "#c0392b", shoes: "#111111" },
      look: { tie: "#c0392b", sax: true, shades: true },
      win: "Sax solo!",
      fatality: "Jam session: the opponent can't stop dancing to the sax and collapses from exhaustion.",
      ending: "Skips the inauguration for a jazz concert on the lawn, then jogs off for burgers.",
    },
    trump: {
      name: "TRUMP", full: "Donald Trump",
      speed: 0.88, power: 1.0, health: 1.0,
      specials: {
        n: { name: "YOU'RE FIRED!", type: "fired", cd: 4.0, desc: "Short-range shockwave" },
        f: { name: "THE DEAL", type: "deal", cd: 5.5, desc: "Long-reach command grab. Beats blocking" },
        d: { name: "BIG LEAGUE", type: "bigleague", cd: 5, desc: "Armored haymaker: takes a hit and keeps swinging" },
      },
      passive: { name: "HEAVYWEIGHT", desc: "Barely knocked back. Throws deal 20% more damage" },
      superMove: { name: "BATTLE OF THE BILLIONAIRES", type: "dash" },
      colors: { shirt: "#1f2a52", pants: "#1f2a52", skin: "#e8945a", hair: "#f2c94c", accent: "#e53935", shoes: "#111111" },
      look: { tie: "#e53935", longTie: true, champBelt: true },
      win: "Belt held high!",
      fatality: "The opponent is sat in a barber chair in the middle of the ring and shaved bald.",
      ending: "Turns Mr. Rating's studio into a golden ballroom and launches his own show, where he fires Mr. Rating himself.",
    },
    reagan: {
      name: "REAGAN", full: "Ronald Reagan",
      speed: 1.0, power: 1.02, health: 1.02,
      specials: {
        n: { name: "LASSO", type: "lasso", cd: 3.2, desc: "Rope the opponent and pull them in" },
        f: { name: "HAT TOSS", type: "hat", cd: 3.0, desc: "The hat flies out and comes back like a boomerang" },
        d: { name: "JELLY BEANS", type: "beans", cd: 3.5, desc: "Three candies in an arc. Hits from above" },
      },
      passive: { name: "THERE YOU GO AGAIN", desc: "If the opponent repeats the same move three times, Reagan's next hit is much stronger" },
      superMove: { name: "TEAR DOWN THIS WALL!", type: "dropWall" },
      colors: { shirt: "#7a4a26", pants: "#3d5a9e", skin: "#e8a97c", hair: "#4a2c1a", accent: "#e8d9b0", shoes: "#7a4a22" },
      look: { hat: "#e8d9b0", bolo: true, lasso: true },
      win: "Tips his hat!",
      fatality: "Star Wars: a laser satellite turns the opponent into a pile of jelly beans.",
      ending: "Shoots a western about the tournament and plays the lead himself. Mr. Rating is played by an extra.",
    },
    obama: {
      name: "OBAMA", full: "Barack Obama",
      speed: 1.1, power: 1.03, health: 1.0,
      specials: {
        n: { name: "THREE-POINTER", type: "ball", cd: 2.8, desc: "Ball in an arc, bounces once. Hits from above" },
        f: { name: "FAST BREAK", type: "fastbreak", cd: 3.0, desc: "Low dash under high attacks" },
        d: { name: "YES WE CAN", type: "yeswecan", cd: 12, desc: "5 seconds faster and stronger" },
      },
      passive: { name: "HANG TIME", desc: "Double jump: press UP again in the air" },
      superMove: { name: "ANGER TRANSLATOR", type: "wave" },
      colors: { shirt: "#f2f2f2", pants: "#3c3c44", skin: "#8d5a3b", hair: "#5a5a5a", accent: "#1e3a8a", shoes: "#111111" },
      look: { tie: "#1e3a8a", watch: true },
      win: "Spins the ball on one finger!",
      fatality: "Mic drop: the microphone falls on the opponent from skyscraper height.",
      ending: "Beats every defeated president at basketball, then signs off: \"Obama out.\"",
    },
    rating: {
      name: "MR. RATING", full: "Mr. Rating", boss: true,
      speed: 1.05, power: 1.15, health: 1.15,
      specials: {
        n: { name: "COMMERCIAL BREAK", type: "teleport", cd: 3.2, desc: "Vanish and strike from behind" },
        f: { name: "CHANNEL SURF", type: "tv", cd: 2.8, desc: "Throws a flying TV set" },
        d: { name: "RATINGS SPIKE", type: "spike", cd: 3.0, desc: "Arrow shooting up. Stops jumps" },
      },
      passive: { name: "PRIME TIME", desc: "At half health in the Oval Office he switches the channel" },
      superMove: { name: "RATINGS CRASH", type: "rain" },
      colors: { shirt: "#151515", pants: "#151515", skin: "#cfcfcf", hair: "#333333", accent: "#6fd3ff", shoes: "#000000" },
      look: { tvHead: true },
      win: "Ratings are up!",
      fatality: "The opponent dissolves into TV static.",
      ending: "Mr. Rating takes over every channel. Next season: no presidents.",
    },
  },

  // Порядок на экране выбора. Босс открывается после прохождения аркады.
  roster: ["bush", "clinton", "trump", "reagan", "obama", "rating"],

  // bg — путь к фону арены (assets/arenas/*.webp). Пока null: рисуется фон-заглушка.
  arenas: {
    iowa:      { name: "IOWA STATE FAIR",     tour: 1, theme: "fair",   home: null,      bg: null },
    texas:     { name: "TEXAS STATE FAIR",    tour: 1, theme: "texas",  home: "bush",    bg: null },
    midwest:   { name: "COUNTY FAIR",         tour: 1, theme: "carnival", home: null,    bg: null },
    garden:    { name: "THE GARDEN, NEW YORK",tour: 2, theme: "boxing", home: null,      bg: null },
    detroit:   { name: "DETROIT STADIUM",     tour: 2, theme: "wrestling", home: "trump", bg: null },
    vegas:     { name: "LAS VEGAS",           tour: 2, theme: "vegas",  home: "reagan",  bg: null },
    nightshow: { name: "LATE NIGHT SHOW",     tour: 3, theme: "tvshow", home: "clinton", bg: null },
    dinner:    { name: "CORRESPONDENTS' DINNER", tour: 3, theme: "ballroom", home: "obama", bg: null },
    capitol:   { name: "THE HOUSE FLOOR",     tour: 3, theme: "congress", home: null,   bg: null },
    oval:      { name: "THE OVAL OFFICE",     tour: 4, theme: "oval",   home: "rating",  bg: null, bgAlt: null },
  },

  arcade: {
    // 6 боёв на аренах своих туров + босс в Овальном кабинете
    tours: [1, 1, 2, 2, 3, 3],
    levels: [0, 0, 1, 1, 2, 2],
    boss: { fighter: "rating", arena: "oval", level: 2 },
    tourNames: { 1: "HEARTLAND TOUR", 2: "BIG ARENA TOUR", 3: "PRIME TIME TOUR", 4: "THE FINAL" },
  },

  texts: {
    fight: "FIGHT!",
    ko: "K.O.!",
    timeUp: "TIME!",
    finish: "FINISH HIM!",
    fatality: "FATALITY!",
    perfect: "PERFECT!",
    adBreak: "COMMERCIAL BREAK!",
    champion: "FIFTH TERM!",
    impeach: "IMPEACHED",
  },
};
