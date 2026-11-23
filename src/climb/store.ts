/**
 * @fileoverview The log's data in memory, and its undo. A change with a
 * message can be undone (the undo bar shows it); a quiet one, like a
 * setting, can't.
 */

import {create} from 'zustand';
import {CLIMB_UNDO_STEPS} from '../config';
import {emptyData, type ClimbData} from './model/data';

interface Step {
  before: ClimbData;
  message: string;
}

interface ClimbState {
  data: ClimbData;
  /** Changes Undo can go back, newest last. */
  history: Step[];
  /** What the undo bar shows: the last change, until it's dismissed. */
  bar: {message: string; key: number} | null;
  /** A problem to show until dismissed (saving failed). */
  notice: string | null;
}

export const useClimb = create<ClimbState>()(() => ({
  data: emptyData(),
  history: [],
  bar: null,
  notice: null,
}));

let barKey = 0;

/** Replaces all the data (on load, import aside), with no undo. */
export function replaceAll(data: ClimbData) {
  useClimb.setState({data, history: [], bar: null});
}

/**
 * Changes the data. With a message, the change can be undone and the undo
 * bar shows it; without one it's quiet.
 */
export function change(f: (data: ClimbData) => ClimbData, message?: string) {
  const {data, history} = useClimb.getState();
  const next = f(data);
  if (next === data) return;
  if (message === undefined) {
    useClimb.setState({data: next});
    return;
  }
  useClimb.setState({
    data: next,
    history: [...history, {before: data, message}].slice(-CLIMB_UNDO_STEPS),
    bar: {message, key: ++barKey},
  });
}

/**
 * Puts in what a sync brought. Undo starts afresh: going back past a sync
 * would undo the other device's changes too, and upload that.
 */
export function syncedData(data: ClimbData) {
  useClimb.setState({data, history: [], bar: null});
}

/** Goes back before the last change that can be undone. */
export function undo() {
  const {history} = useClimb.getState();
  const step = history.at(-1);
  if (!step) return;
  useClimb.setState({
    data: step.before,
    history: history.slice(0, -1),
    bar: null,
  });
}

export function dismissBar() {
  useClimb.setState({bar: null});
}

export function setNotice(notice: string | null) {
  useClimb.setState({notice});
}
