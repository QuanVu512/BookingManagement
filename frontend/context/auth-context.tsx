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
import type { UserProfile, CourtItem, RegistrationData } from '../types/auth';
import {
  getCurrentUser,
  loginAccount,
  registerAccount,
  logoutAccount,
} from '../services/auth';

interface AuthSessionValue {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
interface AuthDialogValue {
  isAuthModalOpen: boolean;
  isGuestConfirmOpen: boolean;
  pendingCourt: CourtItem | null;
  guestSessionActive: boolean;
}
interface DialogActions {
  openAuthModal: (court?: CourtItem) => void;
  closeAuthModal: () => void;
  openGuestConfirm: () => void;
  closeGuestConfirm: () => void;
  proceedAsGuest: () => void;
}
interface SessionActions {
  login: (username: string, password: string) => Promise<UserProfile>;
  register: (data: RegistrationData) => Promise<UserProfile>;
  logout: () => Promise<void>;
}
type AuthActionsValue = DialogActions & SessionActions;
type DialogCommand =
  | { type: 'open-auth'; court?: CourtItem }
  | {
      type:
        | 'close-auth'
        | 'open-guest'
        | 'close-guest'
        | 'proceed-guest'
        | 'reset-guest';
    };
const INITIAL_DIALOG: AuthDialogValue = {
  isAuthModalOpen: false,
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
  const session = useSessionStore(
    dialog.actions.closeAuthModal,
    dialog.resetGuest,
  );
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
    case 'open-auth':
      return {
        ...state,
        isAuthModalOpen: true,
        isGuestConfirmOpen: false,
        pendingCourt: command.court ?? state.pendingCourt,
      };
    case 'close-auth':
      return state.isAuthModalOpen
        ? { ...state, isAuthModalOpen: false }
        : state;
    case 'open-guest':
      return { ...state, isAuthModalOpen: false, isGuestConfirmOpen: true };
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
  const openAuthModal = useCallback(
    (court?: CourtItem) => dispatch({ type: 'open-auth', court }),
    [dispatch],
  );
  const closeAuthModal = useCallback(
    () => dispatch({ type: 'close-auth' }),
    [dispatch],
  );
  return useMemo(
    () => ({ openAuthModal, closeAuthModal }),
    [openAuthModal, closeAuthModal],
  );
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

function useSessionStore(closeModal: () => void, resetGuest: () => void) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const revision = useRef(0);
  useInitialSession(setUser, setIsLoading, revision);
  const acceptUser = useCallback(
    (authenticatedUser: UserProfile) => {
      revision.current += 1;
      setUser(authenticatedUser);
      closeModal();
      return authenticatedUser;
    },
    [closeModal],
  );
  const actions = useSessionActions(acceptUser, setUser, revision, resetGuest);
  const value = useMemo(
    () => ({ user, isAuthenticated: user !== null, isLoading }),
    [user, isLoading],
  );
  return { value, actions };
}

function useSessionActions(
  acceptUser: (user: UserProfile) => UserProfile,
  setUser: Dispatch<SetStateAction<UserProfile | null>>,
  revision: RefObject<number>,
  resetGuest: () => void,
) {
  const login = useCallback(
    async (username: string, password: string) =>
      acceptUser(await loginAccount(username, password)),
    [acceptUser],
  );
  const register = useCallback(
    async (data: RegistrationData) => acceptUser(await registerAccount(data)),
    [acceptUser],
  );
  const logout = useCallback(async () => {
    revision.current += 1;
    try {
      await logoutAccount();
    } catch {
      console.info('Không thể xác nhận đăng xuất với máy chủ.');
    }
    setUser(null);
    resetGuest();
  }, [revision, setUser, resetGuest]);
  return useMemo(
    () => ({ login, register, logout }),
    [login, register, logout],
  );
}

function useInitialSession(
  setUser: Dispatch<SetStateAction<UserProfile | null>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  revision: RefObject<number>,
) {
  useEffect(() => {
    const controller = new AbortController();
    const initialRevision = revision.current;
    getCurrentUser(controller.signal)
      .then((currentUser) => {
        if (!controller.signal.aborted && revision.current === initialRevision)
          setUser(currentUser);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          console.info('Không thể kiểm tra phiên đăng nhập.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [setUser, setIsLoading, revision]);
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
