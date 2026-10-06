// Builds src/data/stars.json from a catalog of real nearby stars (J2000 right ascension / declination, distance in
// light years, spectral class) and the confirmed planets known around them.
//
// Sources (snapshot authored 2026-10-06, values rounded): RECONS nearest-star list and the NASA Exoplanet Archive
// (planetary systems composite table), IAU Working Group on Star Names for proper names of stars and planets.
// Planet entries: [letter, kind, orbital period in days, flags]. kind = rock (Earth-size or smaller),
// super (super-Earth), neptune (ice giant), giant (gas giant). flags: hz = in the star's habitable zone,
// name = IAU proper name, moon = the moon you land on (giants), biome = fixed world type.
//
// Positions are heliocentric equatorial x/y/z in light years. Beacons are pinned (four far stars near the
// vertices of a tetrahedron around the Sun) so the family's long-term goals never move when the catalog grows.
// Usage: node tools/build-stars.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const P = (letter, kind, period, flags = {}) => ({ letter, kind, period, ...flags });

// id, name, RA (h m s), Dec (deg), distance ly, spectral class, planets
const CATALOG = [
  ['sol', 'SOL', [0, 0, 0], 0, 0, 'G2V', [
    P('1', 'rock', 88, { name: 'MERCURY', biome: 'moon' }),
    P('2', 'rock', 225, { name: 'VENUS', biome: 'ember' }),
    P('3', 'rock', 365, { name: 'EARTH', hz: true }),
    P('4', 'rock', 687, { name: 'MARS', biome: 'dune' }),
    P('5', 'giant', 4333, { name: 'JUPITER', moon: 'EUROPA', biome: 'frost' }),
    P('6', 'giant', 10759, { name: 'SATURN', moon: 'TITAN', biome: 'dune' }),
    P('7', 'neptune', 30687, { name: 'URANUS', moon: 'MIRANDA', biome: 'frost' }),
    P('8', 'neptune', 60190, { name: 'NEPTUNE', moon: 'TRITON', biome: 'frost' }),
  ]],
  // --- within 10 light years ---
  ['proxima', 'PROXIMA CENTAURI', [14, 29, 43], -62.68, 4.24, 'M5.5V', [P('d', 'rock', 5.12), P('b', 'rock', 11.19, { hz: true })]],
  ['alpha-cen', 'ALPHA CENTAURI', [14, 39, 36], -60.83, 4.37, 'G2V'],
  ['barnard', "BARNARD'S STAR", [17, 57, 48], 4.69, 5.96, 'M4V', [P('d', 'rock', 2.34), P('b', 'rock', 3.15), P('c', 'rock', 4.12), P('e', 'rock', 6.74)]],
  ['wolf-359', 'WOLF 359', [10, 56, 29], 7.01, 7.86, 'M6V'],
  ['lalande-21185', 'LALANDE 21185', [11, 3, 20], 35.97, 8.31, 'M2V', [P('b', 'super', 12.95), P('c', 'neptune', 2946)]],
  ['sirius', 'SIRIUS', [6, 45, 9], -16.72, 8.6, 'A1V'],
  ['luyten-726-8', 'LUYTEN 726-8', [1, 39, 1], -17.95, 8.73, 'M5.5V'],
  ['ross-154', 'ROSS 154', [18, 49, 49], -23.84, 9.69, 'M3.5V'],
  // --- 10 to 20 light years ---
  ['ross-248', 'ROSS 248', [23, 41, 55], 44.18, 10.3, 'M5.5V'],
  ['epsilon-eridani', 'EPSILON ERIDANI', [3, 32, 56], -9.46, 10.5, 'K2V', [P('b', 'giant', 2690, { name: 'AEGIR' })]],
  ['lacaille-9352', 'LACAILLE 9352', [23, 5, 52], -35.85, 10.7, 'M0.5V', [P('b', 'super', 9.26), P('c', 'super', 21.8)]],
  ['ross-128', 'ROSS 128', [11, 47, 44], 0.8, 11.0, 'M4V', [P('b', 'rock', 9.87, { hz: true })]],
  ['ez-aquarii', 'EZ AQUARII', [22, 38, 33], -15.3, 11.1, 'M5V'],
  ['61-cygni', '61 CYGNI', [21, 6, 54], 38.75, 11.4, 'K5V'],
  ['procyon', 'PROCYON', [7, 39, 18], 5.22, 11.46, 'F5IV'],
  ['struve-2398', 'STRUVE 2398', [18, 42, 47], 59.63, 11.5, 'M3V'],
  ['groombridge-34', 'GROOMBRIDGE 34', [0, 18, 23], 44.02, 11.6, 'M1.5V', [P('b', 'super', 11.44)]],
  ['dx-cancri', 'DX CANCRI', [8, 29, 49], 26.78, 11.8, 'M6.5V'],
  ['epsilon-indi', 'EPSILON INDI', [22, 3, 22], -56.79, 11.87, 'K5V', [P('b', 'giant', 16500)]],
  ['tau-ceti', 'TAU CETI', [1, 44, 4], -15.94, 11.9, 'G8V', [P('g', 'super', 20.0), P('h', 'super', 49.4), P('e', 'super', 163, { hz: true }), P('f', 'super', 636, { hz: true })]],
  ['gj-1061', 'GJ 1061', [3, 36, 0], -44.51, 12.0, 'M5.5V', [P('b', 'rock', 3.2), P('c', 'rock', 6.69), P('d', 'rock', 13.0, { hz: true })]],
  ['yz-ceti', 'YZ CETI', [1, 12, 31], -16.99, 12.1, 'M4.5V', [P('b', 'rock', 2.02), P('c', 'rock', 3.06), P('d', 'rock', 4.66)]],
  ['luytens-star', "LUYTEN'S STAR", [7, 27, 24], 5.23, 12.2, 'M3.5V', [P('c', 'rock', 4.72), P('b', 'super', 18.65, { hz: true })]],
  ['teegarden', "TEEGARDEN'S STAR", [2, 53, 1], 16.88, 12.5, 'M7V', [P('b', 'rock', 4.91, { hz: true }), P('c', 'rock', 11.4, { hz: true }), P('d', 'rock', 26.1)]],
  ['kapteyn', "KAPTEYN'S STAR", [5, 11, 41], -45.02, 12.8, 'M1V'],
  ['lacaille-8760', 'LACAILLE 8760', [21, 17, 15], -38.87, 12.9, 'M0V'],
  ['kruger-60', 'KRUGER 60', [22, 27, 59], 57.7, 13.1, 'M3V'],
  ['wolf-1061', 'WOLF 1061', [16, 30, 18], -12.66, 14.0, 'M3.5V', [P('b', 'rock', 4.89), P('c', 'super', 17.87, { hz: true }), P('d', 'super', 217)]],
  ['gliese-1', 'GLIESE 1', [0, 5, 24], -37.35, 14.2, 'M1.5V'],
  ['gliese-674', 'GLIESE 674', [17, 28, 40], -46.89, 14.8, 'M3V', [P('b', 'neptune', 4.69)]],
  ['gliese-687', 'GLIESE 687', [17, 36, 26], 68.34, 14.8, 'M3V', [P('b', 'neptune', 38.1), P('c', 'neptune', 727)]],
  ['gliese-1245', 'GLIESE 1245', [19, 53, 54], 44.41, 14.8, 'M5.5V'],
  ['gliese-876', 'GLIESE 876', [22, 53, 17], -14.26, 15.2, 'M4V', [P('d', 'super', 1.94), P('c', 'giant', 30.1), P('b', 'giant', 61.1), P('e', 'neptune', 124)]],
  ['gliese-1002', 'GLIESE 1002', [0, 6, 44], -7.54, 15.8, 'M5.5V', [P('b', 'rock', 10.35, { hz: true }), P('c', 'rock', 21.2, { hz: true })]],
  ['gliese-412', 'GLIESE 412', [11, 5, 29], 43.53, 15.9, 'M1V'],
  ['groombridge-1618', 'GROOMBRIDGE 1618', [10, 11, 22], 49.46, 15.9, 'K7V'],
  ['ad-leonis', 'AD LEONIS', [10, 19, 36], 19.87, 16.2, 'M3V'],
  ['gliese-832', 'GLIESE 832', [21, 33, 34], -49.01, 16.2, 'M2V', [P('b', 'giant', 3660)]],
  ['keid', 'KEID', [4, 15, 16], -7.65, 16.3, 'K0V'],
  ['70-ophiuchi', '70 OPHIUCHI', [18, 5, 27], 2.5, 16.6, 'K0V'],
  ['altair', 'ALTAIR', [19, 50, 47], 8.87, 16.7, 'A7V'],
  ['gliese-3323', 'GLIESE 3323', [5, 1, 57], -6.94, 17.5, 'M4V', [P('b', 'rock', 5.36), P('c', 'super', 40.5)]],
  ['gliese-445', 'GLIESE 445', [11, 47, 41], 78.69, 17.6, 'M3.5V'],
  ['gliese-526', 'GLIESE 526', [13, 45, 44], 14.89, 17.7, 'M1.5V'],
  ['gliese-251', 'GLIESE 251', [6, 54, 49], 33.27, 18.2, 'M3V', [P('b', 'super', 14.2)]],
  ['gliese-205', 'GLIESE 205', [5, 31, 27], -3.68, 18.6, 'M1.5V'],
  ['alsafi', 'ALSAFI', [19, 32, 22], 69.66, 18.8, 'K0V'],
  ['gliese-570', 'GLIESE 570', [14, 57, 28], -21.41, 19.2, 'K4V'],
  ['eta-cassiopeiae', 'ACHIRD', [0, 49, 6], 57.82, 19.4, 'G0V'],
  ['36-ophiuchi', '36 OPHIUCHI', [17, 15, 21], -26.6, 19.5, 'K2V'],
  ['82-eridani', '82 ERIDANI', [3, 19, 56], -43.07, 19.7, 'G8V', [P('b', 'super', 18.3), P('c', 'super', 40.1), P('d', 'super', 90.3)]],
  ['delta-pavonis', 'DELTA PAVONIS', [20, 8, 44], -66.18, 19.9, 'G8IV'],
  // --- 20 to 35 light years ---
  ['gliese-581', 'GLIESE 581', [15, 19, 26], -7.72, 20.5, 'M3V', [P('e', 'rock', 3.15), P('b', 'neptune', 5.37), P('c', 'super', 12.9)]],
  ['wolf-630', 'WOLF 630', [16, 55, 28], -8.33, 20.6, 'M3V'],
  ['gliese-625', 'GLIESE 625', [16, 25, 24], 54.31, 21.1, 'M2V', [P('b', 'super', 14.6)]],
  ['hd-219134', 'HD 219134', [23, 13, 17], 57.17, 21.3, 'K3V', [P('b', 'super', 3.09), P('c', 'super', 6.76), P('f', 'super', 22.7), P('d', 'neptune', 46.9), P('g', 'super', 94.2), P('h', 'giant', 2100)]],
  ['xi-bootis', 'XI BOOTIS', [14, 51, 23], 19.1, 22.0, 'G8V'],
  ['gliese-393', 'GLIESE 393', [10, 28, 56], 0.84, 23.0, 'M2V', [P('b', 'rock', 7.03)]],
  ['gliese-667c', 'GLIESE 667 C', [17, 18, 58], -34.99, 23.6, 'M1.5V', [P('b', 'super', 7.2), P('c', 'super', 28.1, { hz: true })]],
  ['gliese-33', 'GLIESE 33', [0, 48, 23], 5.28, 24.3, 'K2V'],
  ['beta-hydri', 'BETA HYDRI', [0, 25, 45], -77.25, 24.3, 'G2IV'],
  ['107-piscium', '107 PISCIUM', [1, 42, 30], 20.27, 24.4, 'K1V'],
  ['mu-cassiopeiae', 'MU CASSIOPEIAE', [1, 8, 16], 54.92, 24.6, 'G5V'],
  ['gliese-514', 'GLIESE 514', [13, 29, 59], 10.37, 24.8, 'M0.5V', [P('b', 'super', 140, { hz: true })]],
  ['vega', 'VEGA', [18, 36, 56], 38.78, 25.0, 'A0V'],
  ['fomalhaut', 'FOMALHAUT', [22, 57, 39], -29.62, 25.1, 'A3V'],
  ['gliese-1151', 'GLIESE 1151', [11, 50, 57], 48.38, 26.2, 'M4.5V', [P('b', 'super', 2.02)]],
  ['chi-draconis', 'CHI DRACONIS', [18, 21, 3], 72.73, 26.3, 'F7V'],
  ['gliese-486', 'GLIESE 486', [12, 47, 57], 9.75, 26.4, 'M3.5V', [P('b', 'rock', 1.47)]],
  ['p-eridani', 'P ERIDANI', [1, 39, 48], -56.2, 26.5, 'K2V'],
  ['chara', 'CHARA', [12, 33, 45], 41.36, 27.5, 'G0V'],
  ['61-virginis', '61 VIRGINIS', [13, 18, 24], -18.31, 27.9, 'G5V', [P('b', 'super', 4.21), P('c', 'neptune', 38.0), P('d', 'neptune', 123)]],
  ['zeta-tucanae', 'ZETA TUCANAE', [0, 20, 4], -64.87, 28.0, 'F9V'],
  ['gliese-849', 'GLIESE 849', [22, 9, 40], -4.64, 28.6, 'M3.5V', [P('b', 'giant', 1890), P('c', 'giant', 5500)]],
  ['gliese-785', 'GLIESE 785', [20, 15, 17], -27.03, 28.7, 'K2V', [P('b', 'neptune', 74.7), P('c', 'neptune', 526)]],
  ['gamma-leporis', 'GAMMA LEPORIS', [5, 44, 28], -22.45, 29.3, 'F6V'],
  ['rana', 'RANA', [3, 43, 15], -9.76, 29.5, 'K0IV'],
  ['gliese-433', 'GLIESE 433', [11, 35, 27], -32.54, 29.6, 'M1.5V', [P('b', 'super', 7.37), P('d', 'rock', 36.0), P('c', 'neptune', 5090)]],
  ['beta-comae', 'BETA COMAE', [13, 11, 53], 27.88, 29.9, 'G0V'],
  ['hd-102365', 'HD 102365', [11, 46, 31], -40.5, 30.1, 'G2V', [P('b', 'neptune', 122)]],
  ['gamma-pavonis', 'GAMMA PAVONIS', [21, 26, 27], -65.37, 30.2, 'F9V'],
  ['gliese-367', 'GLIESE 367', [9, 44, 30], -45.78, 30.7, 'M1V', [P('b', 'rock', 0.32, { name: 'TAHAY' }), P('c', 'rock', 11.5), P('d', 'rock', 34.0)]],
  ['gliese-357', 'GLIESE 357', [9, 36, 2], -21.66, 31.0, 'M2.5V', [P('b', 'rock', 3.93), P('c', 'super', 9.12), P('d', 'super', 55.7, { hz: true })]],
  ['gliese-436', 'GLIESE 436', [11, 42, 11], 26.71, 31.8, 'M2.5V', [P('b', 'neptune', 2.64)]],
  ['gliese-536', 'GLIESE 536', [14, 1, 3], -2.65, 33.0, 'M1V', [P('b', 'super', 8.71)]],
  ['alpha-mensae', 'ALPHA MENSAE', [6, 10, 14], -74.75, 33.3, 'G7V'],
  ['pollux', 'POLLUX', [7, 45, 19], 28.03, 33.8, 'K0III', [P('b', 'giant', 590, { name: 'THESTIAS' })]],
  ['iota-persei', 'IOTA PERSEI', [3, 9, 4], 49.61, 34.4, 'G0V'],
  ['l-98-59', 'L 98-59', [8, 18, 8], -68.31, 34.6, 'M3V', [P('b', 'rock', 2.25), P('c', 'rock', 3.69), P('d', 'rock', 7.45), P('e', 'super', 12.8)]],
  // --- 35 to 60 light years ---
  ['gliese-86', 'GLIESE 86', [2, 10, 26], -50.82, 35.2, 'K1V', [P('b', 'giant', 15.8)]],
  ['zavijava', 'ZAVIJAVA', [11, 50, 42], 1.76, 35.6, 'F9V'],
  ['denebola', 'DENEBOLA', [11, 49, 4], 14.57, 36.0, 'A3V'],
  ['54-piscium', '54 PISCIUM', [0, 39, 22], 21.25, 36.2, 'K0V', [P('b', 'giant', 62.2)]],
  ['hd-85512', 'HD 85512', [9, 51, 7], -43.5, 36.3, 'K6V', [P('b', 'super', 58.4)]],
  ['theta-persei', 'THETA PERSEI', [2, 44, 12], 49.23, 36.6, 'F7V'],
  ['arcturus', 'ARCTURUS', [14, 15, 40], 19.18, 36.7, 'K1.5III'],
  ['gamma-serpentis', 'GAMMA SERPENTIS', [15, 56, 27], 15.66, 36.7, 'F6V'],
  ['muphrid', 'MUPHRID', [13, 54, 41], 18.4, 37.2, 'G0IV'],
  ['iota-pegasi', 'IOTA PEGASI', [22, 7, 1], 25.35, 38.3, 'F5V'],
  ['gliese-806', 'GLIESE 806', [20, 45, 4], 44.5, 39.0, 'M1.5V', [P('b', 'super', 0.93), P('c', 'super', 6.64)]],
  ['zeta-reticuli', 'ZETA RETICULI', [3, 18, 13], -62.51, 39.3, 'G2V'],
  ['gliese-12', 'GLIESE 12', [0, 15, 49], 13.56, 39.7, 'M4V', [P('b', 'rock', 12.76, { hz: true })]],
  ['trappist-1', 'TRAPPIST-1', [23, 6, 30], -5.04, 40.7, 'M8V', [P('b', 'rock', 1.51), P('c', 'rock', 2.42), P('d', 'rock', 4.05), P('e', 'rock', 6.1, { hz: true }), P('f', 'rock', 9.21, { hz: true }), P('g', 'rock', 12.35, { hz: true }), P('h', 'rock', 18.77)]],
  ['copernicus', 'COPERNICUS', [8, 52, 36], 28.33, 41.0, 'K0V', [P('e', 'super', 0.74, { name: 'JANSSEN' }), P('b', 'giant', 14.65, { name: 'GALILEO' }), P('c', 'neptune', 44.4, { name: 'BRAHE' }), P('f', 'neptune', 260, { name: 'HARRIOT', hz: true }), P('d', 'giant', 4825, { name: 'LIPPERHEY' })]],
  ['gliese-1132', 'GLIESE 1132', [10, 14, 51], -47.16, 41.0, 'M4V', [P('b', 'rock', 1.63), P('c', 'super', 8.93)]],
  ['hd-69830', 'HD 69830', [8, 18, 24], -12.63, 41.0, 'K0V', [P('b', 'neptune', 8.67), P('c', 'neptune', 31.6), P('d', 'neptune', 197, { hz: true })]],
  ['hd-40307', 'HD 40307', [5, 54, 4], -60.02, 42.2, 'K2.5V', [P('b', 'super', 4.31), P('c', 'super', 9.62), P('d', 'super', 20.4), P('f', 'super', 51.8), P('g', 'super', 197.8, { hz: true })]],
  ['capella', 'CAPELLA', [5, 16, 41], 45.99, 42.9, 'G3III'],
  ['titawin', 'TITAWIN', [1, 36, 48], 41.41, 44.0, 'F8V', [P('b', 'giant', 4.62, { name: 'SAFFAR' }), P('c', 'giant', 241, { name: 'SAMH' }), P('d', 'giant', 1276, { name: 'MAJRITI' })]],
  ['chalawan', 'CHALAWAN', [10, 59, 28], 40.43, 45.9, 'G1V', [P('b', 'giant', 1078, { name: 'TAPHAO THONG' }), P('c', 'giant', 2391, { name: 'TAPHAO KAEW' }), P('d', 'giant', 14000)]],
  ['gliese-1214', 'GLIESE 1214', [17, 15, 19], 4.96, 47.8, 'M4.5V', [P('b', 'neptune', 1.58)]],
  ['rasalhague', 'RASALHAGUE', [17, 34, 56], 12.56, 48.6, 'A5III'],
  ['lhs-1140', 'LHS 1140', [0, 44, 59], -15.27, 48.9, 'M4.5V', [P('c', 'rock', 3.78), P('b', 'super', 24.7, { hz: true })]],
  ['alderamin', 'ALDERAMIN', [21, 18, 35], 62.59, 49.0, 'A8V'],
  ['gliese-163', 'GLIESE 163', [4, 9, 16], -53.37, 49.4, 'M3.5V', [P('b', 'neptune', 8.63), P('c', 'super', 25.6, { hz: true }), P('d', 'neptune', 604)]],
  ['cervantes', 'CERVANTES', [17, 44, 9], -51.83, 50.6, 'G3IV', [P('c', 'super', 9.64, { name: 'DULCINEA' }), P('d', 'giant', 311, { name: 'ROCINANTE' }), P('b', 'giant', 643, { name: 'QUIJOTE', hz: true }), P('e', 'giant', 4206, { name: 'SANCHO' })]],
  ['helvetios', 'HELVETIOS', [22, 57, 28], 20.77, 50.9, 'G2IV', [P('b', 'giant', 4.23, { name: 'DIMIDIUM' })]],
  ['castor', 'CASTOR', [7, 34, 36], 31.89, 51.0, 'A1V'],
  // --- far landmarks (bright stars you can see from Earth; long trips) ---
  ['aldebaran', 'ALDEBARAN', [4, 35, 55], 16.51, 65.0, 'K5III'],
  ['alphecca', 'ALPHECCA', [15, 34, 41], 26.71, 75.0, 'A1IV'],
  ['regulus', 'REGULUS', [10, 8, 22], 11.97, 79.0, 'B8IV'],
  ['achernar', 'ACHERNAR', [1, 37, 43], -57.24, 139.0, 'B6V'],
];

// Pinned beacons: the four far stars nearest the vertices of a tetrahedron around the Sun (picked when the catalog
// had 44 stars; kept fixed so the family's goals do not move when stars are added).
const BEACON_IDS = ['fomalhaut', 'pollux', 'arcturus', 'capella'];
const r1 = (v) => Math.round(v * 100) / 100;

const ids = new Set();
const stars = CATALOG.map(([id, name, [h, m, s], dec, ly, cls, planets]) => {
  if (ids.has(id)) throw new Error(`duplicate star id ${id}`);
  ids.add(id);
  const ra = ((h + m / 60 + s / 3600) * 15) * Math.PI / 180, de = dec * Math.PI / 180;
  const star = { id, name, cls, ly, x: r1(ly * Math.cos(de) * Math.cos(ra)), y: r1(ly * Math.cos(de) * Math.sin(ra)), z: r1(ly * Math.sin(de)) };
  if (BEACON_IDS.includes(id)) star.beacon = true;
  if (planets?.length) star.planets = [...planets].sort((a, b) => a.period - b.period);
  return star;
});
for (const b of BEACON_IDS) if (!ids.has(b)) throw new Error(`beacon ${b} is not in the catalog`);

const out = {
  _doc: 'Real nearby stars and their confirmed planets (generated by tools/build-stars.mjs; edit the catalog there). x/y/z = heliocentric equatorial position in light years, ly = distance from the Sun, cls = spectral class, beacon = one of four pinned long-term goals. planets = confirmed worlds in orbit order: letter, kind (rock/super/neptune/giant), period (days), hz, name (IAU), moon (what you land on at a giant), biome (fixed world type).',
  beacons: BEACON_IDS,
  stars,
};
fs.writeFileSync(path.join(root, 'src/data/stars.json'), JSON.stringify(out, null, 1) + '\n');
const nPlanets = stars.reduce((n, s) => n + (s.planets?.length ?? 0), 0);
console.log(`stars: ${stars.length}, with known planets: ${stars.filter((s) => s.planets).length}, planets: ${nPlanets}, beacons: ${BEACON_IDS.join(', ')}`);
