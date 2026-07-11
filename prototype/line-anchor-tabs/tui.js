'use strict';

// PROTOTYPE TUI — throwaway terminal shell for the line-anchor-tabs state machine.
// Run: node prototype/line-anchor-tabs/tui.js
//
// Question being answered: does the line-anchored, one-tab-per-line interaction
// model (ADR 0001, items 5 & 8) feel right end-to-end, including the drift-warning
// edge case? This shell is not meant to survive past answering that question —
// see state.js for the part worth keeping.

const readline = require('readline');
const { createInitialState, reduce } = require('./state');

const SEED_LINES = [
  '{"id":1,"user":"alice","action":"login"}',
  '{"id":2,"user":"bob","action":"logout"}',
  '{"id":3,"user":"carol","action":"purchase","amount":42}',
  '{"id":4,"user":"dave","action":"login"}',
  '{"id":5,"user":"erin","action":"error","code":500}',
];

let state = createInitialState(SEED_LINES);
let editCounter = 0;

function dispatch(action) {
  state = reduce(state, action);
  render();
}

function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }

function render() {
  console.clear();
  console.log(bold('=== JSONL Vision: line-anchor + tab state machine (PROTOTYPE) ==='));
  console.log(
    dim(
      `Tracking: ${state.trackingActive ? green('ON') : 'OFF'}   Cursor line: ${state.cursorLine}   Focused tab: ${state.focusedTabId ?? '-'}`
    )
  );
  console.log();

  console.log(bold('Editor (fake .jsonl file)'));
  state.lines.forEach((line, i) => {
    const isCursor = i === state.cursorLine;
    const tab = state.tabs.find((t) => t.line === i);
    const marker = isCursor ? cyan('>') : ' ';
    const tabTag = tab ? (tab.drift ? yellow(` [tab#${tab.id} DRIFT]`) : green(` [tab#${tab.id}]`)) : '';
    console.log(`${marker} ${dim(String(i).padStart(2))}  ${line}${tabTag}`);
  });
  console.log();

  console.log(bold('Tabs'));
  if (state.tabs.length === 0) {
    console.log(dim('  (none open)'));
  } else {
    state.tabs.forEach((t) => {
      const focused = t.id === state.focusedTabId;
      const label = `tab#${t.id} (line ${t.line})`;
      const status = t.drift ? yellow('DRIFT — content changed underneath') : dim('in sync');
      console.log(`  ${focused ? bold('* ' + label) : '  ' + label}  ${status}`);
    });
  }
  console.log();

  console.log(bold('Log'));
  state.log.forEach((l) => console.log(dim('  ' + l)));
  console.log();

  console.log(
    bold('[b]') + dim(' toggle tracking  ') +
    bold('[j/k]') + dim(' move cursor  ') +
    bold('[1-9]') + dim(' click tab by id  ') +
    bold('[x]') + dim(' close focused tab')
  );
  console.log(
    bold('[e]') + dim(' external-edit cursor line  ') +
    bold('[c]') + dim(' commit edit on focused tab  ') +
    bold('[r]') + dim(' refresh/ack drift on focused tab')
  );
  console.log(
    bold('[i]') + dim(' insert line below cursor  ') +
    bold('[d]') + dim(' delete cursor line  ') +
    bold('[q]') + dim(' quit')
  );
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
  if (key && key.ctrl && key.name === 'c') process.exit(0);

  switch (str) {
    case 'q':
      process.exit(0);
      break;
    case 'b':
      dispatch({ type: 'TOGGLE_TRACKING' });
      break;
    case 'j':
      dispatch({ type: 'MOVE_CURSOR', direction: 'down' });
      break;
    case 'k':
      dispatch({ type: 'MOVE_CURSOR', direction: 'up' });
      break;
    case 'x':
      if (state.focusedTabId) dispatch({ type: 'CLOSE_TAB', tabId: state.focusedTabId });
      break;
    case 'e':
      editCounter += 1;
      dispatch({
        type: 'EXTERNAL_EDIT',
        line: state.cursorLine,
        newContent: `{"id":${state.cursorLine + 1},"externally":"edited","rev":${editCounter}}`,
      });
      break;
    case 'c':
      if (state.focusedTabId) {
        editCounter += 1;
        dispatch({
          type: 'COMMIT_EDIT',
          tabId: state.focusedTabId,
          newValue: `{"id":${state.cursorLine + 1},"committed":"from-tab","rev":${editCounter}}`,
        });
      }
      break;
    case 'r':
      if (state.focusedTabId) dispatch({ type: 'REFRESH_TAB', tabId: state.focusedTabId });
      break;
    case 'i':
      editCounter += 1;
      dispatch({ type: 'INSERT_LINE_BELOW_CURSOR', content: `{"id":"new-${editCounter}","inserted":true}` });
      break;
    case 'd':
      dispatch({ type: 'DELETE_CURSOR_LINE' });
      break;
    default:
      if (/^[1-9]$/.test(str)) {
        dispatch({ type: 'CLICK_TAB', tabId: Number(str) });
      }
      break;
  }
});

render();
