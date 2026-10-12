import { useCallback, useRef, useState } from 'react';
import {
  analyzeSession,
  createSession,
  getSession,
  uploadSessionImages,
} from '../services/attendanceService';
import { getErrorMessage } from '../utils/errors';

const initial = { stage: 'idle', uploadProgress: 0, error: null, failedStage: null, session: null };

export function useAttendanceUpload() {
  const [state, setState] = useState(initial);
  const progress = useRef({ sessionId: null, uploaded: false, request: null });

  const run = useCallback(async (request) => {
    const memo = progress.current;
    memo.request = request ?? memo.request;
    const { courseId, date, files } = memo.request;
    let stage = 'creating';
    setState((prev) => ({ ...prev, error: null, failedStage: null, stage }));

    try {
      if (!memo.sessionId) {
        const session = await createSession({ courseId, date });
        memo.sessionId = session.id;
      }

      if (!memo.uploaded) {
        stage = 'uploading';
        setState((prev) => ({ ...prev, stage, uploadProgress: 0 }));
        await uploadSessionImages(memo.sessionId, files, (value) =>
          setState((prev) => ({ ...prev, uploadProgress: value })),
        );
        memo.uploaded = true;
      }

      stage = 'analyzing';
      setState((prev) => ({ ...prev, stage, uploadProgress: 1 }));
      await analyzeSession(memo.sessionId);
      const session = await getSession(memo.sessionId);
      setState((prev) => ({ ...prev, stage: 'done', session }));
      return session;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        stage: 'error',
        failedStage: stage,
        error: getErrorMessage(error),
      }));
      return null;
    }
  }, []);

  const retry = useCallback(() => run(), [run]);

  const reset = useCallback(() => {
    progress.current = { sessionId: null, uploaded: false, request: null };
    setState(initial);
  }, []);

  return { ...state, run, retry, reset, busy: ['creating', 'uploading', 'analyzing'].includes(state.stage) };
}
