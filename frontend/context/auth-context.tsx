'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  Context,
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import type {
  UserProfile,
  CourtItem,
  RegistrationData,
  RegistrationResult,
  SessionStatus,
} from '../types/auth';
import {
  getCurrentUser,
  loginAccount,
  registerAccount,
  logoutAccount,
} from '../services/auth';
import { useRouter } from 'next/navigation';

interface AuthSessionValue {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  status: SessionStatus;
  sessionError: string;
  logoutError: string;
}
interface AuthDialogValue {
  isGuestConfirmOpen: boolean;
  pendingCourt: CourtItem | null;
  guestSessionActive: boolean;
}
interface DialogActions {
  openSignIn: (court?: CourtItem) => void;
  openGuestConfirm: () => void;
  closeGuestConfirm: () => void;
  proceedAsGuest: () => void;
}
interface SessionActions {
  login: (username: string, password: string) => Promise<UserProfile>;
  register: (data: RegistrationData) => Promise<RegistrationResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}
type AuthActionsValue = DialogActions & SessionActions;
type DialogCommand = {
  type: 'open-guest' | 'close-guest' | 'proceed-guest' | 'reset-guest';
};
const INITIAL_DIALOG: AuthDialogValue = {
  isGuestConfirmOpen: false,
  pendingCourt: null,
  guestSessionActive: false,
};
const AuthSessionContext = createContext<AuthSessionValue | undefined>(
  undefined,
);
const AuthDialogContext = createContext<AuthDialogValue | undefined>(undefined);
const AuthActionsContext = createContext<AuthActionsValue | undefined>(
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const dialog = useDialogStore();
  const session = useSessionStore(dialog.resetGuest);
  const actions = useMemo(
    () => ({ ...dialog.actions, ...session.actions }),
    [dialog.actions, session.actions],
  );
  return (
    <AuthActionsContext.Provider value={actions}>
      <AuthSessionContext.Provider value={session.value}>
        <AuthDialogContext.Provider value={dialog.value}>
          {children}
        </AuthDialogContext.Provider>
      </AuthSessionContext.Provider>
    </AuthActionsContext.Provider>
  );
}

function reduceDialog(
  state: AuthDialogValue,
  command: DialogCommand,
): AuthDialogValue {
  switch (command.type) {
    case 'open-guest':
      return { ...state, isGuestConfirmOpen: true };
    case 'close-guest':
      return state.isGuestConfirmOpen
        ? { ...state, isGuestConfirmOpen: false }
        : state;
    case 'proceed-guest':
      return { ...state, isGuestConfirmOpen: false, guestSessionActive: true };
    case 'reset-guest':
      return state.guestSessionActive
        ? { ...state, guestSessionActive: false }
        : state;
  }
}

function useDialogStore() {
  const [value, dispatch] = useReducer(reduceDialog, INITIAL_DIALOG);
  const authActions = useAuthDialogActions(dispatch);
  const guestActions = useGuestDialogActions(dispatch);
  const resetGuest = useCallback(() => dispatch({ type: 'reset-guest' }), []);
  const actions = useMemo(
    () => ({ ...authActions, ...guestActions }),
    [authActions, guestActions],
  );
  return { value, actions, resetGuest };
}

function useAuthDialogActions(dispatch: Dispatch<DialogCommand>) {
  const router = useRouter();
  const openSignIn = useCallback(
    (court?: CourtItem) => {
      dispatch({ type: 'close-guest' });
      const next = court ? `/courts/${court.id}` : window.location.pathname;
      router.push(`/auth/login?next=${encodeURIComponent(next)}`);
    },
    [dispatch, router],
  );
  return useMemo(() => ({ openSignIn }), [openSignIn]);
}

function useGuestDialogActions(dispatch: Dispatch<DialogCommand>) {
  const openGuestConfirm = useCallback(
    () => dispatch({ type: 'open-guest' }),
    [dispatch],
  );
  const closeGuestConfirm = useCallback(
    () => dispatch({ type: 'close-guest' }),
    [dispatch],
  );
  const proceedAsGuest = useCallback(
    () => dispatch({ type: 'proceed-guest' }),
    [dispatch],
  );
  return useMemo(
    () => ({ openGuestConfirm, closeGuestConfirm, proceedAsGuest }),
    [openGuestConfirm, closeGuestConfirm, proceedAsGuest],
  );
}

type SessionSetter = Dispatch<SetStateAction<AuthSessionValue>>;

function useSessionStore(resetGuest: () => void) {
  const [value, setValue] = useState<AuthSessionValue>({
    user: null,
    status: 'unknown',
    isAuthenticated: false,
    isLoading: true,
    sessionError: '',
    logoutError: '',
  });
  const revision = useRef(0);
  const refreshSession = useSessionChecks(setValue, revision);
  const acceptUser = useAcceptedUser(setValue, revision);
  const acceptLogout = useAcceptedLogout(setValue, resetGuest);
  const setLogoutError = useCallback((logoutError: string) => {
    setValue((current) => ({ ...current, logoutError, isLoading: false }));
  }, []);
  const actions = useSessionActions(
    acceptUser,
    acceptLogout,
    revision,
    setLogoutError,
    refreshSession,
  );
  return { value, actions };
}

function useSessionChecks(
  setValue: SessionSetter,
  revision: RefObject<number>,
) {
  const checkSession = useCallback(
    async (signal: AbortSignal) => {
      const requestRevision = ++revision.current;
      setValue((current) => ({ ...current, isLoading: true }));
      try {
        const result = await getCurrentUser(signal);
        if (!signal.aborted && requestRevision === revision.current) {
          setValue((current) => ({
            ...current,
            status: result.status,
            user:
              result.status === 'authenticated'
                ? result.user
                : result.status === 'unauthenticated'
                  ? null
                  : current.user,
            isAuthenticated: result.status === 'authenticated',
            sessionError: result.status === 'unknown' ? result.message : '',
          }));
        }
      } finally {
        if (!signal.aborted && requestRevision === revision.current)
          setValue((current) => ({ ...current, isLoading: false }));
      }
    },
    [revision, setValue],
  );
  useInitialSession(checkSession);
  return useCallback(
    () => checkSession(new AbortController().signal),
    [checkSession],
  );
}

function useAcceptedUser(setValue: SessionSetter, revision: RefObject<number>) {
  return useCallback(
    (user: UserProfile) => {
      revision.current += 1;
      setValue({
        user,
        status: 'authenticated',
        isAuthenticated: true,
        isLoading: false,
        sessionError: '',
        logoutError: '',
      });
      return user;
    },
    [revision, setValue],
  );
}

function useAcceptedLogout(setValue: SessionSetter, resetGuest: () => void) {
  return useCallback(() => {
    setValue({
      user: null,
      status: 'unauthenticated',
      isAuthenticated: false,
      isLoading: false,
      sessionError: '',
      logoutError: '',
    });
    resetGuest();
  }, [resetGuest, setValue]);
}

function useSessionActions(
  acceptUser: (user: UserProfile) => UserProfile,
  acceptLogout: () => void,
  revision: RefObject<number>,
  setLogoutError: (error: string) => void,
  refreshSession: () => Promise<void>,
) {
  const login = useCallback(
    async (username: string, password: string) =>
      acceptUser(await loginAccount(username, password)),
    [acceptUser],
  );
  const register = useCallback(
    (data: RegistrationData) => registerAccount(data),
    [],
  );
  const logout = useCallback(async () => {
    const logoutRevision = ++revision.current;
    setLogoutError('');
    try {
      await logoutAccount();
      if (logoutRevision === revision.current) acceptLogout();
    } catch (error: unknown) {
      if (logoutRevision === revision.current)
        setLogoutError(
          'Chưa thể xác nhận đăng xuất với máy chủ. Phiên đăng nhập được giữ lại; vui lòng thử lại.',
        );
      throw error;
    }
  }, [revision, acceptLogout, setLogoutError]);
  return useMemo(
    () => ({ login, register, logout, refreshSession }),
    [login, register, logout, refreshSession],
  );
}

function useInitialSession(
  checkSession: (signal: AbortSignal) => Promise<void>,
) {
  useEffect(() => {
    const controller = new AbortController();
    void checkSession(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [checkSession]);
}

function useRequiredContext<Value>(
  context: Context<Value | undefined>,
  name: string,
): Value {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used within an AuthProvider`);
  return value;
}
export function useAuthSession() {
  return useRequiredContext(AuthSessionContext, 'useAuthSession');
}
export function useAuthDialog() {
  return useRequiredContext(AuthDialogContext, 'useAuthDialog');
}
export function useAuthActions() {
  return useRequiredContext(AuthActionsContext, 'useAuthActions');
}

// Compatibility for consumers needing all three groups. Prefer the narrow hooks above.
export function useAuth() {
  const session = useAuthSession();
  const dialog = useAuthDialog();
  const actions = useAuthActions();
  return useMemo(
    () => ({ ...session, ...dialog, ...actions }),
    [session, dialog, actions],
  );
}
