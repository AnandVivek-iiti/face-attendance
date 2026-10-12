import { useCallback, useMemo, useReducer } from 'react';
import { emptyReviewState } from '../utils/attendance';
import { SOURCE } from '../utils/constants';

const HISTORY_LIMIT = 50;

function reduce(state, action) {
  switch (action.type) {
    case 'set': {
      const overrides = { ...state.overrides };
      for (const id of action.ids) overrides[id] = { ...overrides[id], ...action.patch };
      return { ...state, overrides };
    }
    case 'reassign': {
      const overrides = { ...state.overrides };
      const { fromId, toId, face } = action;
      overrides[toId] = {
        ...overrides[toId],
        status: 'present',
        source: SOURCE.MANUAL,
        faceKey: face.key,
        faceId: face.faceId,
        imageId: face.imageId,
        ignored: false,
      };
      if (fromId && fromId !== toId) {
        overrides[fromId] = { ...overrides[fromId], status: 'absent', source: SOURCE.MANUAL };
      }
      return { ...state, overrides };
    }
    case 'add': {
      const { student } = action;
      return {
        ...state,
        added: { ...state.added, [student.studentId]: student },
        overrides: {
          ...state.overrides,
          [student.studentId]: { status: 'present', source: SOURCE.MANUAL },
        },
      };
    }
    case 'dismiss':
      return state.dismissed.includes(action.key)
        ? state
        : { ...state, dismissed: [...state.dismissed, action.key] };
    default:
      return state;
  }
}

function historyReducer(history, action) {
  if (action.type === 'undo') {
    if (!history.past.length) return history;
    const past = history.past.slice(0, -1);
    return { present: history.past[history.past.length - 1], past };
  }
  if (action.type === 'reset') return { present: emptyReviewState, past: [] };
  const next = reduce(history.present, action);
  if (next === history.present) return history;
  return { present: next, past: [...history.past, history.present].slice(-HISTORY_LIMIT) };
}

export function useReviewState() {
  const [history, dispatch] = useReducer(historyReducer, { present: emptyReviewState, past: [] });

  const setStatus = useCallback(
    (ids, status, hasFace) =>
      dispatch({
        type: 'set',
        ids,
        patch: { status, source: hasFace ? SOURCE.REVIEWED : SOURCE.MANUAL, ignored: false },
      }),
    [],
  );

  const actions = useMemo(
    () => ({
      setStatus,
      setManual: (ids, status) =>
        dispatch({ type: 'set', ids, patch: { status, source: SOURCE.MANUAL, ignored: false } }),
      ignore: (id) =>
        dispatch({ type: 'set', ids: [id], patch: { status: 'absent', source: SOURCE.MANUAL, ignored: true } }),
      reassign: (fromId, toId, face) => dispatch({ type: 'reassign', fromId, toId, face }),
      addStudent: (student) => dispatch({ type: 'add', student }),
      dismissFace: (key) => dispatch({ type: 'dismiss', key }),
      undo: () => dispatch({ type: 'undo' }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [setStatus],
  );

  const dirtyCount = Object.keys(history.present.overrides).length;

  return { state: history.present, canUndo: history.past.length > 0, dirtyCount, ...actions };
}
