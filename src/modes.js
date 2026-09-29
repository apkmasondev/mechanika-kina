// Exploration modes: camera shot, mechanism speed, doors, cut-aways, light isolation, labels.
// Anchors are world positions (m).  `g` ties a label to an explode group.

export const SHOTS = {
  intro: { pos: [1.45, 1.05, 3.05], target: [0.98, 1.45, 0.0], fov: 44 },
  hero: { pos: [1.55, 1.46, 3.05], target: [-0.25, 1.16, 0.05], fov: 40 },
  film: { pos: [0.62, 1.36, 1.62], target: [0.02, 1.25, 0.07], fov: 46, rMin: 0.25 },
  light: { pos: [-0.22, 1.5, 1.95], target: [-0.3, 1.27, 0.07], fov: 44 },
  slow: { pos: [-0.16, 1.22, 0.54], target: [-0.045, 1.245, 0.0], fov: 36, rMin: 0.2 },
  inside: { pos: [0.5, 1.42, -1.05], target: [0.03, 1.27, -0.04], fov: 38, rMin: 0.25 },
  port: { pos: [1.12, 1.28, 0.07], target: [17.5, 1.28, 0.07], fov: 30, rMin: 0.05, rMax: 20 },
  explode: { pos: [1.17, 1.62, 3.05], target: [-0.12, 1.22, 0.22], fov: 58 },
};

const ALL_DOORS_OPEN = { DOOR_head: 1, DOOR_sound: 1, DOOR_mag_upper: 1, DOOR_mag_lower: 1, DOOR_lamp: 1 };

export const MODES = [
  {
    id: 'work', num: 'I', name: 'Praca', title: 'Praca',
    text: 'Projektor pracuje z prędkością 24 klatek na sekundę, a taśma przesuwa się o 456 mm na sekundę. Kliknij oznaczenie, żeby podejść bliżej.',
    shot: 'hero', fps: 24, doors: {}, cut: null, dim: 0, haze: 0.32, explode: 0, rays: 0, cone: 0, filmHi: 0,
    labels: [
      { n: 1, t: 'Magazyn podający', s: 'szpula 610 m', a: [0.1, 2.14, 0.12], dx: 60, dy: -30 },
      { n: 2, t: 'Mechanizm', s: 'głowica X-L', a: [-0.1, 1.45, 0.14], dx: -150, dy: -40 },
      { n: 3, t: 'Lampa ksenonowa', s: '2 kW', a: [-0.82, 1.56, 0.33], dx: -90, dy: -60 },
      { n: 4, t: 'Obiektyw', s: 'f = 65 mm', a: [0.25, 1.316, 0.07], dx: 70, dy: -50 },
      { n: 5, t: 'Głowica dźwiękowa', s: 'ścieżka optyczna', a: [-0.1, 0.9, 0.13], dx: -170, dy: 10 },
      { n: 6, t: 'Magazyn odbiorczy', s: 'sprzęgło cierne', a: [0.1, 0.36, 0.12], dx: 80, dy: 20 },
      { n: 7, t: 'Okno projekcyjne', s: 'kliknij: widok na ekran', a: [1.29, 1.46, 0.07], dx: 40, dy: -70, focus: { shot: 'port' } },
    ],
  },
  {
    id: 'film', num: 'II', name: 'Droga taśmy', title: 'Droga taśmy',
    text: 'Podczas seansu taśma zatrzymuje się w okienku 24 razy na sekundę. Tutaj zwalniamy ją do 2 kl./s: widać, jak pętle łączą ruch ciągły rolek z ruchem skokowym w bramce.',
    shot: 'film', fps: 2, doors: { DOOR_head: 1, DOOR_sound: 1, DOOR_mag_upper: 1, DOOR_mag_lower: 1 }, cut: null, dim: 0.25, haze: 0.14, explode: 0, rays: 0, cone: 0, filmHi: 1,
    labels: [
      { n: 1, t: 'Szpula podająca', a: [0.12, 2.07, 0.09], dx: 70, dy: -20, focus: { r: 0.8 } },
      { n: 2, t: 'Zawór ogniowy', a: [0.093, 1.745, 0.11], dx: 90, dy: -10 },
      { n: 3, t: 'Rolka zębata podająca', s: 'ruch ciągły', a: [0.085, 1.425, 0.095], dx: 110, dy: -30, focus: { r: 0.36 } },
      { n: 4, t: 'Pętla górna', a: [0.028, 1.49, 0.09], dx: -130, dy: -40, focus: { r: 0.4 } },
      { n: 5, t: 'Okienko', s: 'taśma stoi', a: [0.0, 1.28, 0.1], dx: -150, dy: 0, focus: { r: 0.3 } },
      { n: 6, t: 'Rolka skokowa', s: 'krzyż maltański', a: [-0.012, 1.19, 0.095], dx: -150, dy: 30, focus: { r: 0.32 } },
      { n: 7, t: 'Pętla dolna', a: [-0.055, 1.07, 0.09], dx: -120, dy: 40, focus: { r: 0.4 } },
      { n: 8, t: 'Rolka hamująca', a: [0.08, 1.105, 0.095], dx: 120, dy: 10, focus: { r: 0.36 } },
      { n: 9, t: 'Bęben dźwiękowy', a: [-0.01, 0.9, 0.1], dx: -150, dy: 20, focus: { r: 0.4 } },
      { n: 10, t: 'Rolka stałej prędkości', a: [0.085, 0.935, 0.095], dx: 120, dy: 10, focus: { r: 0.4 } },
      { n: 11, t: 'Szpula nawijająca', a: [0.12, 0.42, 0.09], dx: 80, dy: 20, focus: { r: 0.8 } },
    ],
  },
  {
    id: 'light', num: 'III', name: 'Droga światła', title: 'Droga światła',
    text: 'Zwierciadło elipsoidalne kieruje światło łuku w stronę okienka. Obiektyw rzuca powiększony, ponownie odwrócony obraz klatki na ekran oddalony o około 17 m.',
    shot: 'light', fps: 24, doors: { DOOR_lamp: 1, DOOR_head: 1 }, cut: null, dim: 1, haze: 0.62, explode: 0, rays: 1, cone: 1, filmHi: 0,
    labels: [
      { n: 1, t: 'Łuk ksenonowy', s: '1. ognisko', a: [-0.78, 1.28, 0.07], dx: -40, dy: -110 },
      { n: 2, t: 'Zwierciadło eliptyczne', a: [-0.8, 1.43, 0.1], dx: -150, dy: -60 },
      { n: 3, t: 'Filtr cieplny', a: [-0.33, 1.37, 0.07], dx: -30, dy: -120 },
      { n: 4, t: 'Klapa', s: 'douser', a: [-0.3, 1.33, 0.13], dx: 10, dy: -150 },
      { n: 5, t: 'Migawka', s: '2 łopatki', a: [-0.06, 1.37, 0.03], dx: 40, dy: -130 },
      { n: 6, t: 'Okienko', s: '2. ognisko · 21 × 15 mm', a: [0.0, 1.28, 0.07], dx: 30, dy: 110 },
      { n: 7, t: 'Obiektyw', a: [0.2, 1.32, 0.07], dx: 90, dy: -80 },
      { n: 8, t: 'Okno projekcyjne', s: 'kliknij: widok na ekran', a: [1.29, 1.28, 0.07], dx: 60, dy: 90, focus: { shot: 'port' } },
    ],
  },
  {
    id: 'slow', num: 'IV', name: 'Zwolnienie', title: 'Zwolnienie ×1/48',
    text: 'Przy 24 kl./s przesuw trwa 1/96 s i migawka zasłania wtedy światło. Druga łopatka daje drugi błysk: razem 48 na sekundę. To symulacja zwolnienia; klapa ogniowa pozostaje otwarta.',
    shot: 'slow', fps: 0.5, doors: { DOOR_head: 1 }, cut: 'rear', dim: 0.35, haze: 0.2, explode: 0, rays: 0, cone: 0.35, filmHi: 0,
    timing: true, inset: true, simulatedSlow: true,
    labels: [
      { n: 1, t: 'Migawka', a: [-0.06, 1.39, 0.06], dx: -120, dy: -70 },
      { n: 2, t: 'Okienko', a: [0.0, 1.28, 0.075], dx: 120, dy: -60 },
      { n: 3, t: 'Rolka skokowa', s: '16 zębów', a: [-0.012, 1.2, 0.09], dx: 130, dy: -10 },
      { n: 4, t: 'Krzyż maltański', a: [-0.03, 1.2, -0.0], dx: -140, dy: 70 },
      { n: 5, t: 'Pętla górna', a: [0.03, 1.47, 0.09], dx: 100, dy: -40 },
    ],
  },
  {
    id: 'inside', num: 'V', name: 'Wnętrze', title: 'Wnętrze',
    text: 'Jeden obrót wałka to jedna klatka. Krzywka krzyża maltańskiego i migawka są sprzęgnięte kołami zębatymi, więc zawsze pracują w tym samym takcie.',
    shot: 'inside', fps: 2, doors: ALL_DOORS_OPEN, cut: 'gear', dim: 0.1, haze: 0.12, explode: 0, rays: 0, cone: 0, filmHi: 0,
    labels: [
      { n: 1, t: 'Wałek napędowy', s: '1 obrót = 1 klatka', a: [0.125, 1.5, -0.075], dx: 90, dy: -60 },
      { n: 2, t: 'Koła śrubowe', s: 'wałek → migawka 1:1', a: [0.125, 1.28, -0.053], dx: 120, dy: 0 },
      { n: 3, t: 'Przekładnie śrubowe', s: 'rolki ciągłe 6:1', a: [0.09, 1.42, -0.075], dx: 110, dy: -50 },
      { n: 4, t: 'Koło zamachowe', s: 'krzywka z czopem', a: [-0.012, 1.159, -0.066], dx: -140, dy: 40 },
      { n: 5, t: 'Migawka', a: [-0.06, 1.38, -0.12], dx: -130, dy: -60 },
      { n: 6, t: 'Silnik', s: '1440 obr./min', a: [0.02, 0.87, -0.36], dx: -60, dy: 80 },
    ],
  },
  {
    id: 'explode', num: 'VI', name: 'Rozkład', title: 'Rozkład na zespoły',
    text: 'Najważniejsze zespoły projektora: lampa, migawka, mechanizm z krzyżem maltańskim, obiektyw, magazyny, głowica dźwiękowa i silnik.',
    shot: 'explode', fps: 0, doors: {}, cut: null, dim: -0.6, haze: 0.0, explode: 1, rays: 0, cone: 0, filmHi: 0, lampOff: true,
    labels: [
      { n: 1, t: 'Lampa', a: [-0.65, 1.62, 0.07], g: 'GRP_lamphouse', dx: -60, dy: -70 },
      { n: 2, t: 'Migawka', a: [-0.06, 1.41, -0.03], g: 'GRP_shutter', dx: -80, dy: -80 },
      { n: 3, t: 'Mechanizm', a: [0.05, 1.6, 0.1], g: 'GRP_head', dx: 60, dy: -60 },
      { n: 4, t: 'Krzyż maltański', s: 'z rolką skokową', a: [-0.012, 1.24, 0.07], g: 'GRP_intermittent', dx: 90, dy: 30 },
      { n: 5, t: 'Bramka', s: 'płozy dociskowe', a: [0.012, 1.36, 0.1], g: 'GRP_gate', dx: 90, dy: -40 },
      { n: 6, t: 'Obiektyw', a: [0.3, 1.32, 0.07], g: 'GRP_lens', dx: 60, dy: -40 },
      { n: 7, t: 'Magazyn podający', a: [0.2, 2.1, 0.1], g: 'GRP_mag_upper', dx: 60, dy: -20 },
      { n: 8, t: 'Głowica dźwiękowa', a: [0.2, 0.97, 0.13], g: 'GRP_soundhead', dx: 80, dy: 10 },
      { n: 9, t: 'Magazyn odbiorczy', a: [0.2, 0.3, 0.1], g: 'GRP_mag_lower', dx: 80, dy: 20 },
      { n: 10, t: 'Silnik', s: '1440 obr./min', a: [0.02, 0.87, -0.4], g: 'GRP_motor', dx: 90, dy: 30 },
    ],
  },
];
