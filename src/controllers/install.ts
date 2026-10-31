// The controllers' part of starting: each fills the hooks that state and the map reach it through and starts the
// listeners it needs. Called once by main.ts before anything is drawn, so no tap can reach a hook nobody filled; before
// this, importing a controller did all of it as a side effect, in whatever order the imports happened to run.
import { install as status } from './status';
import { install as loading } from './loading';
import { install as planner } from './planner';
import { install as detail } from './detail';
import { install as line } from './line';
import { install as stop } from './stop';
import { install as follow } from './follow';
import { install as shell } from './shell';

export function installControllers(): void {
  status(); // the worker's progress on the status line, before anything asks it
  loading(); // the question's day and the live data, first: the others plan and poll through them
  planner();
  detail();
  line();
  stop();
  follow();
  shell(); // last: the navigation's hooks call into all of the above
}
