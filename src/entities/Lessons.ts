// The lesson board (Tamsin's wish, carried 2026-11-15; src/data/mind.json day.lessons). In a day of life a teacher opens
// the printer lesson track for another copy, the student works one step a day and the teacher checks it (the mind
// function's lesson tool, planet_states.data.lessons). The game shows where it stands: a small board beside the
// Printworks' door (or a seeded bed's design stone) with the step and the teacher's name.
import Phaser from 'phaser';
import { MIND, PALETTE } from '../core/data';
import type { LessonRow } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { ink } from '../ui/ink';

/** The track the board shows: the newest one still being learned, else the newest learned. */
export function boardLesson(rows: LessonRow[]): LessonRow | undefined {
  const by = (a: LessonRow, b: LessonRow) => b.at - a.at;
  return [...rows.filter((r) => !r.done)].sort(by)[0] ?? [...rows].sort(by)[0];
}

/** The board's two lines: "LESSON 2/6" (or "LEARNED") and the teacher's name. */
export function boardText(r: LessonRow): [string, string] {
  const steps = MIND.day.lessons.steps.length;
  return [r.done ? `${r.studentName} LEARNED`.toUpperCase() : `LESSON ${r.step}/${steps}`, `${r.teacherName}`.toUpperCase()];
}

export class Lessons {
  private shown: Phaser.GameObjects.GameObject[] | null = null;
  private nextCheck = 0;

  constructor(private s: PlanetScene) {}

  get active() { return !!this.shown; }

  update(time: number) {
    if (this.shown || time < this.nextCheck) return;
    this.nextCheck = time + 2000;
    const row = boardLesson(this.s.lessons);
    const at = row ? this.s.bioworks?.boardSpot : null;
    if (row && at) this.show(row, at.x, at.y);
  }

  /** left: the board's left edge; y: its foot. */
  private show(row: LessonRow, left: number, y: number) {
    const s = this.s;
    const [a, b] = boardText(row);
    const top = ink(s.add.bitmapText(0, 0, 'pixel', a).setTint(PALETTE[10]).setOrigin(0.5, 0).setDepth(101 + y));
    const bottom = ink(s.add.bitmapText(0, 0, 'pixel', b).setTint(PALETTE[20]).setOrigin(0.5, 0).setDepth(101 + y));
    const w = Math.ceil(Math.max(top.width, bottom.width)) + 8, lh = Math.ceil(top.height) + 1, h = lh * 2 + 3;
    const x = Math.round(left + w / 2);
    top.setPosition(x, y - 6 - h + 2);
    bottom.setPosition(x, y - 6 - h + 2 + lh);
    const g = s.add.graphics().setDepth(100 + y);
    // two legs, a slate board with a lit edge, a worked step's green mark waiting for the check
    g.fillStyle(PALETTE[5], 1).fillRect(x - w / 2 + 3, y - 6, 1, 6).fillRect(x + w / 2 - 4, y - 6, 1, 6);
    g.fillStyle(PALETTE[22], 1).fillRect(x - w / 2 - 1, y - 6 - h - 1, w + 2, h + 2);
    g.fillStyle(PALETTE[24], 1).fillRect(x - w / 2, y - 6 - h, w, h);
    if (row.worked && !row.done) g.fillStyle(PALETTE[12], 1).fillRect(x + w / 2 - 3, y - 6 - h + 1, 2, 2);
    this.shown = [g, top, bottom];
  }
}
