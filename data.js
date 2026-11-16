// ПРЕЗИДЕНТСКИЙ НОКАУТ — данные игры.
// Здесь всё, что можно править без программирования: имена, параметры бойцов,
// названия приёмов, тексты фаталити и концовок, арены и аркада.
// Параметры бойцов: speed / power / health — множители (1.0 = средний боец),
// specialCd — перезарядка спецприёма в секундах.

window.GAME_DATA = {
  title: "ПРЕЗИДЕНТСКИЙ НОКАУТ",
  disclaimer: "Неофициальная пародия. Все персонажи — шаржи.",

  fighters: {
    bush: {
      name: "БУШ", full: "Джордж Буш-младший",
      speed: 1.0, power: 1.0, health: 1.0, specialCd: 3.5,
      special: { name: "УКЛОН ОТ БОТИНКА", type: "parry" },
      superMove: { name: "МИССИЯ ВЫПОЛНЕНА", type: "dropBanner" },
      colors: { shirt: "#d9c7a0", pants: "#3d5a9e", skin: "#e8a97c", hair: "#a9a9a9", accent: "#8a5a2b", shoes: "#7a4a22" },
      look: { belt: "#8a5a2b" },
      win: "Большой палец вверх!",
      fatality: "Рисует портрет соперника маслом — и тот застывает в картине.",
      ending: "Вешает портреты всех соперников в своей галерее. На углу каждого — нарисованный ботинок.",
    },
    clinton: {
      name: "КЛИНТОН", full: "Билл Клинтон",
      speed: 0.95, power: 0.95, health: 1.0, specialCd: 3.4,
      special: { name: "САКСОФОН", type: "notes" },
      superMove: { name: "Я ЧУВСТВУЮ ВАШУ БОЛЬ", type: "reflect" },
      colors: { shirt: "#22305e", pants: "#22305e", skin: "#f0a98a", hair: "#dcdcdc", accent: "#c0392b", shoes: "#111111" },
      look: { tie: "#c0392b", sax: true, shades: true },
      win: "Соло на саксофоне!",
      fatality: "Джем-сейшн: соперник не может перестать танцевать под саксофон и падает без сил.",
      ending: "Вместо инаугурации устраивает джазовый концерт на лужайке, а потом убегает на пробежку за бургерами.",
    },
    trump: {
      name: "ТРАМП", full: "Дональд Трамп",
      speed: 0.88, power: 1.0, health: 1.04, specialCd: 4.2,
      special: { name: "ВЫ УВОЛЕНЫ!", type: "fired" },
      superMove: { name: "БИТВА МИЛЛИАРДЕРОВ", type: "dash" },
      colors: { shirt: "#1f2a52", pants: "#1f2a52", skin: "#e8945a", hair: "#f2c94c", accent: "#e53935", shoes: "#111111" },
      look: { tie: "#e53935", longTie: true, champBelt: true },
      win: "Пояс над головой!",
      fatality: "Соперника усаживают в кресло посреди ринга и бреют налысо.",
      ending: "Переделывает студию Мистера Рейтинга в золотой бальный зал и запускает своё шоу, где увольняет самого Мистера Рейтинга.",
    },
    reagan: {
      name: "РЕЙГАН", full: "Рональд Рейган",
      speed: 1.0, power: 1.02, health: 1.02, specialCd: 3.2,
      special: { name: "ЛАССО", type: "lasso" },
      superMove: { name: "СНЕСИТЕ ЭТУ СТЕНУ!", type: "dropWall" },
      colors: { shirt: "#7a4a26", pants: "#3d5a9e", skin: "#e8a97c", hair: "#4a2c1a", accent: "#e8d9b0", shoes: "#7a4a22" },
      look: { hat: "#e8d9b0", bolo: true, lasso: true },
      win: "Машет шляпой!",
      fatality: "«Звёздные войны»: спутниковый лазер превращает соперника в горсть желейных конфет.",
      ending: "Снимает вестерн о турнире и сам играет главную роль. Мистера Рейтинга в фильме играет статист.",
    },
    obama: {
      name: "ОБАМА", full: "Барак Обама",
      speed: 1.1, power: 1.03, health: 1.0, specialCd: 2.8,
      special: { name: "ТРЁХОЧКОВЫЙ", type: "ball" },
      superMove: { name: "ПЕРЕВОДЧИК ГНЕВА", type: "wave" },
      colors: { shirt: "#f2f2f2", pants: "#3c3c44", skin: "#8d5a3b", hair: "#5a5a5a", accent: "#1e3a8a", shoes: "#111111" },
      look: { tie: "#1e3a8a", watch: true },
      win: "Мяч на пальце!",
      fatality: "Майк-дроп: микрофон падает на соперника с высоты небоскрёба.",
      ending: "Обыгрывает всех побеждённых президентов в баскетбол и на прощание говорит: «Обама аут».",
    },
    rating: {
      name: "МИСТЕР РЕЙТИНГ", full: "Мистер Рейтинг", boss: true,
      speed: 1.05, power: 1.15, health: 1.15, specialCd: 3.2,
      special: { name: "РЕКЛАМНАЯ ПАУЗА", type: "teleport" },
      superMove: { name: "РЕЙТИНГИ РУХНУЛИ", type: "rain" },
      colors: { shirt: "#151515", pants: "#151515", skin: "#cfcfcf", hair: "#333333", accent: "#6fd3ff", shoes: "#000000" },
      look: { tvHead: true },
      win: "Рейтинги растут!",
      fatality: "Соперник исчезает в телевизионных помехах.",
      ending: "Мистер Рейтинг захватил все каналы. Следующий сезон — без президентов.",
    },
  },

  // Порядок на экране выбора. Босс открывается после прохождения аркады.
  roster: ["bush", "clinton", "trump", "reagan", "obama", "rating"],

  // bg — путь к фону арены (assets/arenas/*.webp). Пока null: рисуется фон-заглушка.
  arenas: {
    iowa:      { name: "ЯРМАРКА АЙОВЫ",       tour: 1, theme: "fair",   home: null,      bg: null },
    texas:     { name: "ЯРМАРКА ТЕХАСА",      tour: 1, theme: "texas",  home: "bush",    bg: null },
    midwest:   { name: "ОКРУЖНАЯ ЯРМАРКА",    tour: 1, theme: "carnival", home: null,    bg: null },
    garden:    { name: "«САД», НЬЮ-ЙОРК",     tour: 2, theme: "boxing", home: null,      bg: null },
    detroit:   { name: "СТАДИОН В ДЕТРОЙТЕ",  tour: 2, theme: "wrestling", home: "trump", bg: null },
    vegas:     { name: "ЛАС-ВЕГАС",           tour: 2, theme: "vegas",  home: "reagan",  bg: null },
    nightshow: { name: "НОЧНОЕ ШОУ",          tour: 3, theme: "tvshow", home: "clinton", bg: null },
    dinner:    { name: "УЖИН КОРРЕСПОНДЕНТОВ", tour: 3, theme: "ballroom", home: "obama", bg: null },
    oval:      { name: "ОВАЛЬНЫЙ КАБИНЕТ",    tour: 4, theme: "oval",   home: "rating",  bg: null, bgAlt: null },
  },

  arcade: {
    // 6 боёв на аренах своих туров + босс в Овальном кабинете
    tours: [1, 1, 2, 2, 3, 3],
    levels: [0, 0, 1, 1, 2, 2],
    boss: { fighter: "rating", arena: "oval", level: 2 },
    tourNames: { 1: "ТУР «ГЛУБИНКА»", 2: "ТУР «БОЛЬШИЕ АРЕНЫ»", 3: "ТУР «ПРАЙМ-ТАЙМ»", 4: "ФИНАЛ" },
  },

  texts: {
    fight: "БОЙ!",
    ko: "НОКАУТ!",
    timeUp: "ВРЕМЯ!",
    finish: "ДОБЕЙ!",
    fatality: "ФАТАЛИТИ!",
    perfect: "ИДЕАЛЬНО!",
    adBreak: "РЕКЛАМНАЯ ПАУЗА!",
    champion: "ПЯТЫЙ СРОК!",
    impeach: "ИМПИЧМЕНТ",
  },
};
