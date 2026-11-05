import { DAY_COUNT } from './data.js';

/** The tag on a card that sits away from its home workout: "From Day 3". When rest days push the home workout past the last column
 *  (`homeColumn` over DAY_COUNT) that column is not on the board, so the tag names the workout by its program day instead. */
export const movedFromLabel = (homeColumn: number, programDay: number): string =>
  homeColumn > DAY_COUNT ? `From Day ${programDay}’s workout, off this week` : `From Day ${homeColumn}`;
