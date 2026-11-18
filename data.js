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
      speed: 1.0, power: 1.0, health: 1.06,
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
      // Реплики: пузырь над головой; голос — sounds/voice/bush_intro0.mp3 и т.д. (если файл есть)
      lines: { intro: ["Bring 'em on!", "Don't misunderestimate me."], super: "Mission accomplished!", win: ["I'm the decider.", "Heckuva job!"] },
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
      // Реплики: пузырь над головой; голос — sounds/voice/clinton_intro0.mp3 и т.д. (если файл есть)
      lines: { intro: ["I feel your pain.", "Let's talk it over a burger."], super: "It's the economy!", win: ["I still believe in a place called Hope.", "Depends what 'won' means."] },
      fatality: "Jam session: the opponent can't stop dancing to the sax and collapses from exhaustion.",
      ending: "Skips the inauguration for a jazz concert on the lawn, then jogs off for burgers.",
    },
    trump: {
      name: "TRUMP", full: "Donald Trump",
      speed: 0.88, power: 0.94, health: 1.0,
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
      // Реплики: пузырь над головой; голос — sounds/voice/trump_intro0.mp3 и т.д. (если файл есть)
      lines: { intro: ["Wrong!", "Nobody fights better than me."], super: "Big league!", win: ["You're fired!", "Tremendous. Just tremendous."] },
      fatality: "The opponent is sat in a barber chair in the middle of the ring and shaved bald.",
      ending: "Drains the swamp, builds a golden ballroom on the spot and fires Uncle Swamp on live TV.",
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
      // Реплики: пузырь над головой; голос — sounds/voice/reagan_intro0.mp3 и т.д. (если файл есть)
      lines: { intro: ["Well... there you go again.", "Win one for the Gipper!"], super: "Tear down this wall!", win: ["It's morning in America.", "I won't exploit your youth and inexperience."] },
      fatality: "Star Wars: a laser satellite turns the opponent into a pile of jelly beans.",
      ending: "Shoots a western about the tournament and plays the lead himself. Uncle Swamp is played by an extra.",
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
      // Реплики: пузырь над головой; голос — sounds/voice/obama_intro0.mp3 и т.д. (если файл есть)
      lines: { intro: ["Yes, we can!", "Let me be clear."], super: "Change has come!", win: ["Obama out.", "Hope wins."] },
      fatality: "Mic drop: the microphone falls on the opponent from skyscraper height.",
      ending: "Beats every defeated president at basketball, then signs off: \"Obama out.\"",
    },
    bushsr: {
      name: "BUSH SR", full: "George H. W. Bush",
      speed: 1.0, power: 1.0, health: 1.06,
      specials: {
        n: { name: "POINTS OF LIGHT", type: "lights", cd: 2.8, desc: "Three points of light fly forward at different heights" },
        f: { name: "BROCCOLI TOSS", type: "broccoli", cd: 3.2, desc: "Lobs a broccoli. Nobody likes broccoli" },
        d: { name: "READ MY LIPS", type: "lips", cd: 6, desc: "Up close: steals a chunk of the opponent's SUPER meter. No new taxes!" },
      },
      passive: { name: "KINDER, GENTLER", desc: "Takes 15% less damage from projectiles" },
      superMove: { name: "PARACHUTE DROP", type: "parachute" },
      colors: { shirt: "#24305e", pants: "#24305e", skin: "#e8b48f", hair: "#7a6a5a", accent: "#c8102e", shoes: "#151515" },
      look: {},
      win: "Read my lips: you lost.",
      lines: { intro: ["Read my lips: you lose.", "Kinder, gentler... not today."], super: "A thousand points of light!", win: ["No broccoli. Ever.", "Mission accomplished? That's my son's line."] },
      fatality: "The opponent is buried under a mountain of broccoli.",
      ending: "Bush Sr skydives onto the White House lawn and declares a thousand-point victory.",
    },
    swamp: {
      name: "UNCLE SWAMP", full: "Uncle Swamp", boss: true,
      speed: 1.0, power: 1.05, health: 1.1,
      specials: {
        n: { name: "RED TAPE", type: "tape", cd: 3.0, desc: "Wraps the opponent in red tape. Slows them down" },
        f: { name: "SUBPOENA", type: "subpoena", cd: 2.8, desc: "Throws a flying subpoena" },
        d: { name: "SHADOW CABINET", type: "teleport", cd: 3.2, desc: "Vanishes into a filing cabinet, strikes from behind" },
      },
      passive: { name: "TOO BIG TO FAIL", desc: "As the final boss, gets back up once with a quarter of his health" },
      superMove: { name: "GOVERNMENT SHUTDOWN", type: "shutdown" },
      colors: { shirt: "#1e2f7a", pants: "#f2f2f2", skin: "#d9c7b0", hair: "#f4f4f4", accent: "#b22234", shoes: "#111111" },
      look: { uncle: true },
      win: "The swamp always wins.",
      // Реплики: пузырь над головой; голос — sounds/voice/swamp_intro0.mp3 и т.д. (если файл есть)
      lines: { intro: ["I want YOU... to lose.", "Welcome to the swamp."], super: "Government shutdown!", win: ["The swamp always wins.", "Drain me? Ha!"] },
      fatality: "The opponent is buried under ten thousand forms. In triplicate.",
      ending: "Uncle Swamp takes the Oval Office. Next election: postponed indefinitely.",
    },
  },

  // Порядок на экране выбора. Босс открывается после прохождения аркады.
  roster: ["bush", "clinton", "trump", "reagan", "obama", "bushsr", "swamp"],

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
    oval:      { name: "THE OVAL OFFICE",     tour: 4, theme: "oval",   home: "swamp",  bg: null, bgAlt: null },
  },

  arcade: {
    // 6 боёв на аренах своих туров + босс в Овальном кабинете
    tours: [1, 1, 2, 2, 3, 3],
    levels: [0, 0, 1, 1, 2, 2],
    boss: { fighter: "swamp", arena: "oval", level: 2 },
    tourNames: { 1: "HEARTLAND TOUR", 2: "BIG ARENA TOUR", 3: "PRIME TIME TOUR", 4: "THE FINAL" },
  },

  // Особые представления на экране VS: [фраза первого, фраза второго].
  // Пары с бойцами, которых ещё нет в игре, просто ждут своего часа.
  rivalries: [
    { a: "trump", b: "bush",    lines: ["Low energy!", "Wrong Bush, pal."] },
    { a: "trump", b: "clinton", lines: ["Wrong!", "I feel your pain. Soon."] },
    { a: "trump", b: "obama",   lines: ["I have the best fists. Everybody says so.", "Let me be clear: no, you don't."] },
    { a: "trump", b: "reagan",  lines: ["Make America great again? My slogan!", "Son, I said it in 1980."] },
    { a: "bush", b: "clinton",  lines: ["Don't misunderestimate me.", "Depends on what 'win' means."] },
    { a: "bush", b: "obama",    lines: ["Want some candy, Barack?", "Not during the fight, George."] },
    { a: "bush", b: "reagan",   lines: ["Bring 'em on!", "Well... there you go again."] },
    { a: "clinton", b: "obama", lines: ["I was the first rock-star president.", "And I'm the encore."] },
    { a: "clinton", b: "reagan", lines: ["It's the economy!", "Trickle down, son. Trickle down."] },
    { a: "reagan", b: "obama",  lines: ["Win one for the Gipper!", "Yes, we can!"] },
    { a: "swamp", b: "*",       lines: ["I want YOU... to lose.", "Who invited the swamp?"] },
    { a: "bushsr", b: "bush",   lines: ["Son?!", "Dad?!"] },
    { a: "biden", b: "obama",   lines: ["Listen, pal, I was your VP!", "Joe... not now."] },
    { a: "biden", b: "trump",   lines: ["Come on, man!", "Fake news! Total fake news!"] },
    { a: "bushsr", b: "clinton", lines: ["Read my lips!", "It's the economy, George!"] },
    { a: "lincoln", b: "washington", lines: ["After you, General.", "No, after you, Mr. President."] },
    { a: "nixon", b: "*",       lines: ["I am not a crook.", "Is this being recorded?"] },
    { a: "washington", b: "*",  lines: ["I cannot tell a lie: you're going down.", "Wait, the FIRST president?"] },
    { a: "lincoln", b: "*",     lines: ["Four score and seven punches ago...", "That hat is a weapon."] },
    { a: "fdr", b: "*",         lines: ["Good evening, friends.", "Who brought a radio to a fight?"] },
  ],

  // Задание дня: каждый день новое условие боя
  daily: [
    { id: "filibuster", name: "FILIBUSTER",    desc: "Rounds last 99 seconds. Everyone has 50% more health." },
    { id: "debate",     name: "DEBATE NIGHT",  desc: "Only specials, supers and throws do full damage. Punches and kicks do 30%." },
    { id: "swing",      name: "SWING STATE",   desc: "Low gravity. Jump higher, fall slower." },
    { id: "tuesday",    name: "SUPER TUESDAY", desc: "The SUPER meter fills three times faster." },
    { id: "snap",       name: "SNAP ELECTION", desc: "One round. 30 seconds. No second chances." },
    { id: "scandal",    name: "SCANDAL WEEK",  desc: "Both fighters slowly lose health. Finish it fast!" },
  ],

  // Бонус-этапы аркады между турами
  bonus: {
    teleprompter: { name: "SMASH THE TELEPROMPTER", desc: "Wreck it before time runs out!" },
    ballots:      { name: "BALLOT RUSH",            desc: "Punch and kick the flying ballots!" },
    hands:        { name: "SHAKE EVERY HAND",       desc: "Walk up to a hand and press PUNCH!" },
  },

  texts: {
    fight: "FIGHT!",
    ko: "K.O.!",
    timeUp: "TIME!",
    finish: "FINISH HIM!",
    fatality: "FATALITY!",
    perfect: "PERFECT!",
    adBreak: "COMMERCIAL BREAK!",
    swamp: "WELCOME TO THE SWAMP!",
    bailout: "TOO BIG TO FAIL!",
    champion: "FIFTH TERM!",
    impeach: "IMPEACHED",
  },
};
